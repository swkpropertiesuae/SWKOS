export type ProjectMediaKind = 'photo' | 'video' | 'tour3d' | 'floorplan' | 'brochure' | 'ppt' | 'payment_plan'

export interface ProjectMediaItem {
  id: string
  kind: ProjectMediaKind
  url: string
  attachment_id?: number
  title?: string
  caption?: string
  category?: string
  is_cover?: boolean
  order: number
  mime?: string
  size?: number
  created_at?: string
}

export interface ClassifiedEmbed {
  mode: 'youtube' | 'vimeo' | 'iframe' | 'video' | 'model3d' | 'image' | 'pdf' | 'external'
  embedUrl: string
  provider: string
  originalUrl: string
}

export const MEDIA_CATEGORIES: Record<ProjectMediaKind, string[]> = {
  photo: ['Exterior', 'Interior', 'Show Unit', 'Amenities', 'Lobby & Views', 'Masterplan', '3D Render', 'Construction'],
  video: ['Project Launch Film', 'Walkthrough', 'Drone & Location', 'Show Apartment', 'Developer Presentation'],
  tour3d: ['360° Virtual Tour', 'Interactive 3D Model', 'Masterplan 3D', 'Show Unit Matterport'],
  floorplan: ['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', 'Penthouse / Villa', 'Office / Retail', 'Typical Floor Plate'],
  brochure: ['Official Brochure', 'Fact Sheet', 'Masterplan Brochure', 'Price List', 'Community Guide'],
  ppt: ['Developer Pitch Deck', 'Investor Presentation', 'Launch Slides (.pptx)', 'Community Masterplan Deck'],
  payment_plan: ['Official Payment Plan PDF', 'Milestone Schedule', 'Post-Handover Plan', 'DLD / ADM Fee Sheet'],
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'svg'])
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogg'])
const MODEL3D_EXTS = new Set(['glb', 'gltf', 'usdz'])
const PPT_EXTS = new Set(['ppt', 'pptx', 'key'])

export function inferMediaKindFromFile(fileName: string, mime = '', preferred?: ProjectMediaKind): ProjectMediaKind {
  const ext = (fileName.split('.').pop() || '').toLowerCase()
  const lowMime = mime.toLowerCase()
  if (VIDEO_EXTS.has(ext) || lowMime.startsWith('video/')) return 'video'
  if (MODEL3D_EXTS.has(ext) || lowMime.includes('gltf') || lowMime.includes('model/')) return 'tour3d'
  if (PPT_EXTS.has(ext) || lowMime.includes('presentation') || lowMime.includes('powerpoint')) return 'ppt'
  if (ext === 'pdf' || lowMime === 'application/pdf') {
    if (preferred === 'payment_plan' || /payment[\s_-]*plan|instal+ment|milestone/i.test(fileName)) return 'payment_plan'
    if (preferred === 'floorplan' || /floor[\s_-]*plan|layout/i.test(fileName)) return 'floorplan'
    return 'brochure'
  }
  if (IMAGE_EXTS.has(ext) || lowMime.startsWith('image/')) {
    if (preferred === 'floorplan') return 'floorplan'
    return 'photo'
  }
  return preferred || 'brochure'
}

export function isSafeMediaUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false
  const s = raw.trim()
  if (!s) return false
  if (s.startsWith('/api/files/') || s.startsWith('/api/public/share/') || s.startsWith('/api/catalog-kit/') || s.startsWith('/media/') || s.startsWith('/img/')) return true
  try {
    const u = new URL(s)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

export function normalizeMediaList(raw: unknown): ProjectMediaItem[] {
  let arr: unknown[] = []
  if (Array.isArray(raw)) {
    arr = raw
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) arr = parsed
    } catch {
      arr = []
    }
  }
  const out: ProjectMediaItem[] = []
  const seen = new Set<string>()
  arr.forEach((entry, idx) => {
    if (typeof entry === 'string') {
      const url = entry.trim()
      if (!isSafeMediaUrl(url) || seen.has(url)) return
      seen.add(url)
      out.push({
        id: `m-${idx}-${url.slice(-12).replace(/[^a-z0-9]/gi, '')}`,
        kind: inferMediaKindFromFile(url),
        url,
        order: out.length,
        is_cover: out.length === 0,
      })
      return
    }
    if (!entry || typeof entry !== 'object') return
    const obj = entry as Record<string, any>
    const url = typeof obj.url === 'string' ? obj.url.trim() : ''
    if (!isSafeMediaUrl(url)) return
    const dedupeKey = `${obj.kind || 'photo'}|${url}`
    if (seen.has(dedupeKey)) return
    seen.add(dedupeKey)
    const rawKind = String(obj.kind || '').toLowerCase()
    const kind: ProjectMediaKind =
      rawKind === 'photo' || rawKind === 'video' || rawKind === 'tour3d' || rawKind === 'floorplan' || rawKind === 'brochure' || rawKind === 'ppt' || rawKind === 'payment_plan'
        ? rawKind
        : inferMediaKindFromFile(String(obj.title || url), String(obj.mime || ''))
    out.push({
      id: typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : `m-${idx}-${Date.now().toString(36)}`,
      kind,
      url,
      attachment_id: Number.isInteger(Number(obj.attachment_id)) && Number(obj.attachment_id) > 0 ? Number(obj.attachment_id) : undefined,
      title: typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim().slice(0, 160) : undefined,
      caption: typeof obj.caption === 'string' && obj.caption.trim() ? obj.caption.trim().slice(0, 240) : undefined,
      category: typeof obj.category === 'string' && obj.category.trim() ? obj.category.trim().slice(0, 60) : undefined,
      is_cover: Boolean(obj.is_cover),
      order: Number.isFinite(Number(obj.order)) ? Number(obj.order) : out.length,
      mime: typeof obj.mime === 'string' ? obj.mime : undefined,
      size: Number.isFinite(Number(obj.size)) ? Number(obj.size) : undefined,
      created_at: typeof obj.created_at === 'string' ? obj.created_at : undefined,
    })
  })
  out.sort((a, b) => a.order - b.order)
  // Guarantee at most one cover photo and ensure the first photo is marked cover if none is set
  const photos = out.filter(i => i.kind === 'photo')
  if (photos.length > 0) {
    const firstCover = photos.find(p => p.is_cover) ?? photos[0]!
    photos.forEach(p => { p.is_cover = p.id === firstCover.id })
  }
  return out
}

export function coverPhotoUrl(raw: unknown): string | null {
  const items = normalizeMediaList(raw).filter(i => i.kind === 'photo')
  if (!items.length) return null
  return (items.find(i => i.is_cover) ?? items[0]!).url
}

/** Satellite location embed for a project's coordinates; shown as its aerial / location tour. */
export const satelliteViewUrl = (lat: number, lng: number) => `https://maps.google.com/maps?q=${lat},${lng}&t=k&z=17&output=embed`

export function classifyEmbedUrl(rawUrl: string | null | undefined, mimeHint?: string): ClassifiedEmbed | null {
  if (!rawUrl || !rawUrl.trim()) return null
  const url = rawUrl.trim()
  const lower = url.toLowerCase()
  const lowMime = (mimeHint || '').toLowerCase()

  // Local / API streamed video files
  if (
    lowMime.startsWith('video/') ||
    /\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i.test(lower) ||
    /\/api\/public\/share\/[^/]+\/asset\/\d+\/\d+/i.test(lower) && lowMime.startsWith('video/')
  ) {
    return { mode: 'video', embedUrl: url, provider: 'Uploaded Video', originalUrl: url }
  }
  if (lowMime.includes('gltf') || /\.(glb|gltf|usdz)(\?|#|$)/i.test(lower)) {
    return { mode: 'model3d', embedUrl: url, provider: '3D Model', originalUrl: url }
  }
  if (lowMime === 'application/pdf' || /\.pdf(\?|#|$)/i.test(lower)) {
    return { mode: 'pdf', embedUrl: url, provider: 'PDF Document', originalUrl: url }
  }
  if (lowMime.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|avif)(\?|#|$)/i.test(lower)) {
    return { mode: 'image', embedUrl: url, provider: 'Image', originalUrl: url }
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    if (url.startsWith('/api/files/') || url.startsWith('/api/public/share/')) {
      return { mode: 'video', embedUrl: url, provider: 'Hosted Media', originalUrl: url }
    }
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')

  // YouTube (watch, shorts, embed, youtu.be)
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be') {
    let vid = ''
    if (host === 'youtu.be') {
      vid = parsed.pathname.split('/').filter(Boolean)[0] || ''
    } else if (parsed.pathname.startsWith('/embed/')) {
      vid = parsed.pathname.split('/')[2] || ''
    } else if (parsed.pathname.startsWith('/shorts/')) {
      vid = parsed.pathname.split('/')[2] || ''
    } else {
      vid = parsed.searchParams.get('v') || ''
    }
    vid = vid.replace(/[^a-zA-Z0-9_-]/g, '')
    if (vid) {
      return {
        mode: 'youtube',
        embedUrl: `https://www.youtube-nocookie.com/embed/${vid}?rel=0&modestbranding=1`,
        provider: 'YouTube',
        originalUrl: url,
      }
    }
  }

  // Vimeo
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = parsed.pathname.match(/\/(?:video\/)?(\d+)/)
    if (m?.[1]) {
      return {
        mode: 'vimeo',
        embedUrl: `https://player.vimeo.com/video/${m[1]}?title=0&byline=0&portrait=0`,
        provider: 'Vimeo',
        originalUrl: url,
      }
    }
  }

  // Matterport 3D Showcase
  if (host === 'my.matterport.com' || host.endsWith('.matterport.com')) {
    const modelId = parsed.searchParams.get('m')
    const embedUrl = modelId
      ? `https://my.matterport.com/show/?m=${encodeURIComponent(modelId)}&play=1&qs=1`
      : `https://my.matterport.com${parsed.pathname}${parsed.search}`
    return { mode: 'iframe', embedUrl, provider: 'Matterport 3D', originalUrl: url }
  }

  // Kuula 360° Virtual Tour
  if (host === 'kuula.co') {
    return { mode: 'iframe', embedUrl: url.replace(/^http:/i, 'https:'), provider: 'Kuula 360°', originalUrl: url }
  }

  // Sketchfab 3D Model
  if (host === 'sketchfab.com') {
    const m = parsed.pathname.match(/([a-f0-9]{32})(?:\/|$)/i)
    if (m?.[1]) {
      return {
        mode: 'iframe',
        embedUrl: `https://sketchfab.com/models/${m[1]}/embed?autostart=0&ui_theme=dark`,
        provider: 'Sketchfab 3D',
        originalUrl: url,
      }
    }
    return { mode: 'iframe', embedUrl: url.replace(/^http:/i, 'https:'), provider: 'Sketchfab 3D', originalUrl: url }
  }

  // Google Maps satellite embed (aerial location view for launches without a developer 3D tour)
  if ((host === 'google.com' || host === 'maps.google.com') && parsed.pathname.startsWith('/maps') && parsed.searchParams.get('output') === 'embed') {
    return { mode: 'iframe', embedUrl: url.replace(/^http:/i, 'https:'), provider: 'Satellite View', originalUrl: url }
  }

  return { mode: 'external', embedUrl: url, provider: host, originalUrl: url }
}
