import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import crypto from 'node:crypto'
import { createCanvas, loadImage, type Image } from '@napi-rs/canvas'
import { q } from '../db'
import { openStored } from '../integrations/storage'

const PUBLIC_DIRS = [
  path.resolve('public'),
  path.resolve('dist/web'),
]

const MAX_CACHE = 80
const cache = new Map<string, Buffer>()

let brandAssetsPromise: Promise<{ icon: Image | null; logo: Image | null }> | null = null

function resolvePublicFile(rel: string): string | null {
  const clean = rel.replace(/^\/+/, '')
  for (const base of PUBLIC_DIRS) {
    const abs = path.resolve(base, clean)
    if (!abs.startsWith(base)) continue
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs
  }
  return null
}

async function getBrandAssets(): Promise<{ icon: Image | null; logo: Image | null }> {
  if (!brandAssetsPromise) {
    brandAssetsPromise = (async () => {
      const iconPath =
        resolvePublicFile('brand/swk-app-icon-rounded.png') ||
        resolvePublicFile('brand/swk-app-icon.png') ||
        resolvePublicFile('brand/web/swk-icon.png')
      const logoPath =
        resolvePublicFile('brand/swk-logo-gold.png') ||
        resolvePublicFile('brand/swk-logo-white.png') ||
        resolvePublicFile('brand/os/SWK_OS_Horizontal_Logo_Transparent_2048.png') ||
        resolvePublicFile('brand/web/swk-logo-dark.webp')
      const [icon, logo] = await Promise.all([
        iconPath ? loadImage(fs.readFileSync(iconPath)).catch(() => null) : Promise.resolve(null),
        logoPath ? loadImage(fs.readFileSync(logoPath)).catch(() => null) : Promise.resolve(null),
      ])
      return { icon, logo }
    })()
  }
  return brandAssetsPromise
}

function isPrivateOrBlockedHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase()
  if (!h || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (h === '::1' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true
  if (net.isIPv4(h)) {
    const [a, b] = h.split('.').map(Number)
    if (a === 10 || a === 127 || a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
  }
  return false
}

async function streamToBuffer(stream: NodeJS.ReadableStream, maxBytes = 15 * 1024 * 1024): Promise<Buffer | null> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of stream) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any)
    total += b.length
    if (total > maxBytes) return null
    chunks.push(b)
  }
  return total > 0 ? Buffer.concat(chunks) : null
}

async function loadSourceImage(source: string): Promise<Image | null> {
  // Support uploaded SWK attachments referenced via /api/files/:id/download or attachment:<id>
  const attMatch = /^attachment:(\d+)$/.exec(source) || /^\/api\/files\/(\d+)\/download(?:$|\?)/.exec(source)
  if (attMatch?.[1]) {
    try {
      const att = q.get<{ stored_name: string }>(`SELECT stored_name FROM attachments WHERE id = ? AND deleted_at IS NULL`, Number(attMatch[1]))
      if (!att?.stored_name) return null
      const stream = await openStored(att.stored_name)
      if (!stream) return null
      const buf = await streamToBuffer(stream)
      if (!buf) return null
      return await loadImage(buf)
    } catch {
      return null
    }
  }
  if (source.startsWith('/')) {
    const abs = resolvePublicFile(source)
    if (!abs) return null
    try {
      return await loadImage(fs.readFileSync(abs))
    } catch {
      return null
    }
  }
  if (/^https:\/\//i.test(source)) {
    try {
      const u = new URL(source)
      if (isPrivateOrBlockedHost(u.hostname)) return null
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 8000)
      try {
        const res = await fetch(u.toString(), { signal: ctrl.signal, redirect: 'follow' })
        if (!res.ok) return null
        const len = Number(res.headers.get('content-length') || 0)
        if (len > 10 * 1024 * 1024) return null
        const buf = Buffer.from(await res.arrayBuffer())
        if (!buf.length || buf.length > 10 * 1024 * 1024) return null
        return await loadImage(buf)
      } finally {
        clearTimeout(timer)
      }
    } catch {
      return null
    }
  }
  return null
}

function drawRoundedRect(
  ctx: any,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

/**
 * Strictly composites BOTH the SWK Properties App Icon AND Logo + diagonal anti-theft pattern
 * onto every shared inventory image server-side so saved/downloaded images always retain SWK branding.
 */
export async function watermarkPropertyImage(
  source: string,
  opts?: { propertyRef?: string; title?: string },
): Promise<Buffer> {
  const key = crypto
    .createHash('sha1')
    .update(`${source}|${opts?.propertyRef || ''}`)
    .digest('hex')
  const cached = cache.get(key)
  if (cached) return cached

  const [img, brand] = await Promise.all([loadSourceImage(source), getBrandAssets()])

  const maxW = 1480
  const maxH = 1040
  let w = 1280
  let h = 800
  const isSmallOrLogo = Boolean(img && (img.width < 640 || img.height < 400))
  if (img && img.width > 0 && img.height > 0 && !isSmallOrLogo) {
    const scale = Math.min(1, maxW / img.width, maxH / img.height)
    w = Math.max(640, Math.round(img.width * scale))
    h = Math.max(400, Math.round(img.height * scale))
  } else if (isSmallOrLogo) {
    w = 960
    h = 600
  }

  const canvas = createCanvas(w, h)
  const ctx = canvas.getContext('2d')

  // 1. Base property photograph (or aspect-ratio-preserving luxury showcase plate for small/wide SVG emblems)
  if (img && isSmallOrLogo) {
    const grad = ctx.createLinearGradient(0, 0, w, h)
    grad.addColorStop(0, '#09251e')
    grad.addColorStop(0.55, '#0e3a2f')
    grad.addColorStop(1, '#091f1a')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(200,162,83,0.35)'
    ctx.lineWidth = 2
    ctx.strokeRect(24, 24, w - 48, h - 48)
    const padX = Math.round(w * 0.14)
    const padY = Math.round(h * 0.22)
    const availW = w - padX * 2
    const availH = h - padY * 2
    const fit = Math.min(availW / img.width, availH / img.height)
    const drawW = Math.round(img.width * fit)
    const drawH = Math.round(img.height * fit)
    ctx.drawImage(img, Math.round((w - drawW) / 2), Math.round((h - drawH) / 2), drawW, drawH)
  } else if (img) {
    ctx.drawImage(img, 0, 0, w, h)
  } else {
    const grad = ctx.createLinearGradient(0, 0, w, h)
    grad.addColorStop(0, '#0b1824')
    grad.addColorStop(0.55, '#132a3c')
    grad.addColorStop(1, '#0d1b26')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(212,167,82,0.22)'
    ctx.lineWidth = 2
    ctx.strokeRect(26, 26, w - 52, h - 52)
    ctx.fillStyle = '#f3d27a'
    ctx.font = `700 ${Math.round(w * 0.03)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(opts?.title || 'SWK PROPERTIES · EXCLUSIVE DUBAI PORTFOLIO', w / 2, h / 2 - 12)
    ctx.fillStyle = 'rgba(255,255,255,0.72)'
    ctx.font = `500 ${Math.round(w * 0.016)}px sans-serif`
    ctx.fillText('RERA ORN 51517 · WWW.SWKPROPERTIESUAE.COM', w / 2, h / 2 + 24)
  }

  // Subtle bottom vignette for crisp watermark contrast
  const vig = ctx.createLinearGradient(0, h * 0.68, 0, h)
  vig.addColorStop(0, 'rgba(9, 17, 26, 0)')
  vig.addColorStop(1, 'rgba(9, 17, 26, 0.44)')
  ctx.fillStyle = vig
  ctx.fillRect(0, h * 0.68, w, h * 0.32)

  // 2. Repeating diagonal translucent SWK PROPERTIES watermark (anti-crop protection)
  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.rotate(-Math.PI / 7)
  const stepX = Math.max(260, Math.round(w * 0.34))
  const stepY = Math.max(155, Math.round(h * 0.28))
  const diagFont = Math.max(14, Math.round(w * 0.017))
  ctx.font = `700 ${diagFont}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let y = -h; y <= h; y += stepY) {
    for (let x = -w; x <= w; x += stepX) {
      const shift = Math.abs(Math.round(y / stepY)) % 2 === 1 ? stepX * 0.5 : 0
      ctx.fillStyle = 'rgba(0, 0, 0, 0.16)'
      ctx.fillText('SWK PROPERTIES · ORN 51517', x + shift + 1, y + 1)
      ctx.fillStyle = 'rgba(255, 250, 238, 0.22)'
      ctx.fillText('SWK PROPERTIES · ORN 51517', x + shift, y)
    }
  }
  ctx.restore()

  // 3. Faint centered SWK App Icon ghost watermark
  if (brand.icon) {
    ctx.save()
    ctx.globalAlpha = 0.16
    const centerSize = Math.round(Math.min(w, h) * 0.24)
    ctx.drawImage(brand.icon, (w - centerSize) / 2, (h - centerSize) / 2, centerSize, centerSize)
    ctx.restore()
  }

  // 4. Top-left subtle verified portfolio tag
  const margin = Math.max(18, Math.round(w * 0.022))
  const tagText = opts?.propertyRef
    ? `SWK PORTFOLIO · REF ${opts.propertyRef}`
    : 'SWK PROPERTIES · VERIFIED PORTFOLIO'
  const tagFont = Math.max(11, Math.round(w * 0.0115))
  ctx.font = `700 ${tagFont}px sans-serif`
  const tagW = Math.min(w * 0.55, ctx.measureText(tagText).width + 32)
  const tagH = Math.max(28, Math.round(tagFont * 2.15))
  ctx.save()
  drawRoundedRect(ctx, margin, margin, tagW, tagH, tagH / 2)
  ctx.fillStyle = 'rgba(11, 22, 34, 0.72)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(212, 167, 82, 0.65)'
  ctx.lineWidth = 1.25
  ctx.stroke()
  ctx.fillStyle = '#f3d27a'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(tagText, margin + 16, margin + tagH / 2 + 0.5)
  ctx.restore()

  // 5. Bottom-right signature luxury badge featuring BOTH SWK App Icon + SWK Logo
  const iconSize = Math.max(42, Math.round(Math.min(w, h) * 0.075))
  const badgePadX = Math.round(iconSize * 0.34)
  const badgePadY = Math.round(iconSize * 0.22)
  const ornFontPx = Math.max(9.5, Math.round(iconSize * 0.19))
  const ornLabel = 'RERA ORN 51517 · DUBAI'
  ctx.font = `700 ${ornFontPx}px sans-serif`
  const ornTextW = Math.ceil(ctx.measureText(ornLabel).width)
  const logoH = Math.round(iconSize * 0.56)
  const rawLogoW = brand.logo && brand.logo.height > 0
    ? Math.min(Math.round(iconSize * 3.1), Math.round((brand.logo.width / brand.logo.height) * logoH))
    : Math.round(iconSize * 2.65)
  const rightColW = Math.max(rawLogoW, ornTextW + 6)
  const gap = Math.round(iconSize * 0.28)
  const badgeW = badgePadX * 2 + iconSize + gap * 2 + 2 + rightColW
  const badgeH = iconSize + badgePadY * 2
  const bx = w - margin - badgeW
  const by = h - margin - badgeH

  ctx.save()
  drawRoundedRect(ctx, bx, by, badgeW, badgeH, 16)
  ctx.fillStyle = 'rgba(11, 20, 30, 0.86)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(212, 167, 82, 0.82)'
  ctx.lineWidth = 1.6
  ctx.stroke()

  // Draw App Icon (crest)
  const iconX = bx + badgePadX
  const iconY = by + badgePadY
  if (brand.icon) {
    ctx.drawImage(brand.icon, iconX, iconY, iconSize, iconSize)
  } else {
    drawRoundedRect(ctx, iconX, iconY, iconSize, iconSize, 10)
    ctx.fillStyle = '#d4a752'
    ctx.fill()
  }

  // Gold hairline divider
  const divX = iconX + iconSize + gap
  ctx.strokeStyle = 'rgba(212, 167, 82, 0.48)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(divX, by + badgePadY + 4)
  ctx.lineTo(divX, by + badgeH - badgePadY - 4)
  ctx.stroke()

  // Draw SWK Logo + RERA ORN caption centered cleanly inside rightColW
  const colX = divX + gap
  if (brand.logo) {
    const logoDrawX = colX + Math.round((rightColW - rawLogoW) / 2)
    const logoY = by + badgePadY + Math.max(0, Math.round((iconSize - logoH - ornFontPx - 4) / 2))
    ctx.drawImage(brand.logo, logoDrawX, logoY, rawLogoW, logoH)
    ctx.fillStyle = 'rgba(243, 210, 122, 0.96)'
    ctx.font = `700 ${ornFontPx}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText(ornLabel, colX + rightColW / 2, by + badgeH - badgePadY + 1)
  } else {
    ctx.fillStyle = '#ffffff'
    ctx.font = `800 ${Math.max(13, Math.round(iconSize * 0.34))}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('SWK PROPERTIES', colX + rightColW / 2, by + badgeH / 2 - 7)
    ctx.fillStyle = '#f3d27a'
    ctx.font = `600 ${ornFontPx}px sans-serif`
    ctx.fillText(ornLabel, colX + rightColW / 2, by + badgeH / 2 + 10)
  }
  ctx.restore()

  const buf = canvas.toBuffer('image/jpeg', 88)
  if (cache.size >= MAX_CACHE) {
    const firstKey = cache.keys().next().value
    if (firstKey) cache.delete(firstKey)
  }
  cache.set(key, buf)
  return buf
}
