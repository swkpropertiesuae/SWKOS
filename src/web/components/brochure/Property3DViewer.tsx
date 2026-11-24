import { useEffect, useRef, useState } from 'react'
import { Box, Layers, Moon, Pause, Play, RotateCcw, Sun, Sunset, ZoomIn, ZoomOut } from 'lucide-react'

interface Property3DViewerProps {
  title: string
  type?: string
  beds?: number | null
  baths?: number | null
  area?: number | null
  floorNo?: string | null
  location?: string
}

type ViewMode = 'exterior' | 'cutaway'
type LightMode = 'golden' | 'night' | 'day'

interface Vec3 { x: number; y: number; z: number }

const LIGHT_PALETTES: Record<LightMode, {
  skyTop: string; skyBot: string; grid: string; wallLight: string; wallDark: string;
  roof: string; glass: string; gold: string; pool: string; floorBg: string; label: string;
}> = {
  golden: {
    skyTop: '#0d1b2a', skyBot: '#2d2438', grid: 'rgba(212,167,82,0.16)',
    wallLight: '#f3ede2', wallDark: '#cbbca6', roof: '#1e2c3a',
    glass: 'rgba(243, 210, 122, 0.52)', gold: '#d4a752', pool: '#1aa6b7',
    floorBg: '#1c2a38', label: '#fff7e6',
  },
  night: {
    skyTop: '#060c14', skyBot: '#102236', grid: 'rgba(114,236,241,0.14)',
    wallLight: '#33485c', wallDark: '#1b2b3a', roof: '#0e1925',
    glass: 'rgba(245, 206, 114, 0.68)', gold: '#f3d27a', pool: '#0ea5e9',
    floorBg: '#0f1e2e', label: '#f8fafc',
  },
  day: {
    skyTop: '#e8eff6', skyBot: '#f7f3ea', grid: 'rgba(15,42,51,0.11)',
    wallLight: '#ffffff', wallDark: '#d8d2c6', roof: '#2a3d4c',
    glass: 'rgba(56, 132, 180, 0.48)', gold: '#b78328', pool: '#06b6d4',
    floorBg: '#f3efe6', label: '#0b1f2a',
  },
}

/**
 * Interactive 360° 3D Architectural Representation (HTML5 Canvas 3D engine — zero WebGL crash risk on mobile WebView).
 * Dynamically adapts geometry to Villa/Townhouse vs Sky Residence/Apartment/Penthouse + bedroom/area dimensions.
 */
export function Property3DViewer({ title, type, beds, baths, area, floorNo, location }: Property3DViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mode, setMode] = useState<ViewMode>('exterior')
  const [light, setLight] = useState<LightMode>('golden')
  const [autoRotate, setAutoRotate] = useState(true)
  const [zoom, setZoom] = useState(1.05)

  const yawRef = useRef(0.68)
  const pitchRef = useRef(0.48)
  const draggingRef = useRef(false)
  const lastPtRef = useRef({ x: 0, y: 0 })

  const isVilla = /villa|townhouse|mansion|compound/i.test(type || title)
  const bedCount = Math.max(0, Math.min(7, Number(beds ?? (isVilla ? 4 : 2))))
  const sqft = Math.max(450, Number(area || (isVilla ? 4200 : 1450)))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    const project = (p: Vec3, w: number, h: number): { x: number; y: number; depth: number } => {
      const cy = Math.cos(yawRef.current), sy = Math.sin(yawRef.current)
      const cp = Math.cos(pitchRef.current), sp = Math.sin(pitchRef.current)
      const x1 = p.x * cy - p.z * sy
      const z1 = p.x * sy + p.z * cy
      const y2 = p.y * cp - z1 * sp
      const z2 = p.y * sp + z1 * cp
      const fov = Math.min(w, h) * 0.92 * zoom
      const camZ = 9.5
      const scale = fov / Math.max(2.5, camZ + z2)
      return { x: w / 2 + x1 * scale, y: h * 0.56 - y2 * scale, depth: z2 }
    }

    const drawBox = (
      w: number,
      h: number,
      cx: number,
      cy: number,
      cz: number,
      sx: number,
      sy: number,
      sz: number,
      colors: { top: string; left: string; right: string; stroke?: string },
      polys: { pts: { x: number; y: number }[]; depth: number; fill: string; stroke?: string }[],
    ) => {
      const hx = sx / 2, hy = sy / 2, hz = sz / 2
      const v: Vec3[] = [
        { x: cx - hx, y: cy - hy, z: cz - hz },
        { x: cx + hx, y: cy - hy, z: cz - hz },
        { x: cx + hx, y: cy + hy, z: cz - hz },
        { x: cx - hx, y: cy + hy, z: cz - hz },
        { x: cx - hx, y: cy - hy, z: cz + hz },
        { x: cx + hx, y: cy - hy, z: cz + hz },
        { x: cx + hx, y: cy + hy, z: cz + hz },
        { x: cx - hx, y: cy + hy, z: cz + hz },
      ]
      const faces: { idx: [number, number, number, number]; fill: string }[] = [
        { idx: [3, 2, 6, 7], fill: colors.top },    // top
        { idx: [0, 1, 2, 3], fill: colors.left },   // front
        { idx: [5, 4, 7, 6], fill: colors.left },   // back
        { idx: [1, 5, 6, 2], fill: colors.right },  // right
        { idx: [4, 0, 3, 7], fill: colors.right },  // left
      ]
      for (const f of faces) {
        const pts = f.idx.map(i => project(v[i]!, w, h))
        const depth = pts.reduce((s, p) => s + p.depth, 0) / 4
        polys.push({ pts, depth, fill: f.fill, stroke: colors.stroke })
      }
    }

    const render = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const W = Math.max(320, Math.round(rect.width))
      const H = Math.max(280, Math.round(rect.height))
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr
        canvas.height = H * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      if (autoRotate && !draggingRef.current && !reduceMotion) {
        yawRef.current += 0.0045
      }

      const pal = LIGHT_PALETTES[light]
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, pal.skyTop)
      bg.addColorStop(1, pal.skyBot)
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      // Ground architectural CAD grid
      ctx.strokeStyle = pal.grid
      ctx.lineWidth = 1
      for (let g = -4; g <= 4; g++) {
        const a = project({ x: g, y: 0, z: -4 }, W, H)
        const b = project({ x: g, y: 0, z: 4 }, W, H)
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
        const c = project({ x: -4, y: 0, z: g }, W, H)
        const d = project({ x: 4, y: 0, z: g }, W, H)
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke()
      }

      const polys: { pts: { x: number; y: number }[]; depth: number; fill: string; stroke?: string }[] = []
      const labels: { pos: Vec3; text: string; sub?: string }[] = []

      if (mode === 'exterior') {
        if (isVilla) {
          // Landscaped podium
          drawBox(W, H, 0, 0.08, 0, 5.4, 0.16, 4.4, { top: '#243a31', left: '#1a2c25', right: '#15241e', stroke: 'rgba(212,167,82,0.3)' }, polys)
          // Infinity pool
          drawBox(W, H, 1.35, 0.14, 1.35, 2.2, 0.08, 1.25, { top: pal.pool, left: '#0c7c92', right: '#096678', stroke: 'rgba(255,255,255,0.4)' }, polys)
          // Ground floor main mass
          drawBox(W, H, -0.5, 0.72, -0.35, 3.6, 1.15, 2.6, { top: pal.roof, left: pal.wallLight, right: pal.wallDark, stroke: 'rgba(212,167,82,0.35)' }, polys)
          // Floor-to-ceiling living glass facade
          drawBox(W, H, -0.4, 0.7, 0.98, 2.9, 0.92, 0.08, { top: pal.gold, left: pal.glass, right: pal.glass, stroke: pal.gold }, polys)
          // Cantilevered upper master wing
          drawBox(W, H, 0.15, 1.85, -0.25, 3.9, 1.08, 2.75, { top: pal.roof, left: pal.wallLight, right: pal.wallDark, stroke: pal.gold }, polys)
          drawBox(W, H, 0.25, 1.84, 1.15, 3.2, 0.85, 0.08, { top: pal.gold, left: pal.glass, right: pal.glass, stroke: pal.gold }, polys)
          // Rooftop sky lounge pergola
          drawBox(W, H, -0.4, 2.55, -0.4, 2.2, 0.16, 1.6, { top: pal.gold, left: '#9a7128', right: '#7c591d' }, polys)
          labels.push(
            { pos: { x: 1.35, y: 0.4, z: 1.4 }, text: 'Infinity Pool' },
            { pos: { x: 0.15, y: 2.85, z: -0.25 }, text: 'Sky Terrace & Master Wing' },
            { pos: { x: -1.6, y: 1.1, z: 0.8 }, text: 'Double-Height Salon' },
          )
        } else {
          // Luxury Dubai Tower Podium + Sky Residence Massing
          drawBox(W, H, 0, 0.16, 0, 4.6, 0.32, 4.0, { top: '#1d2d3b', left: '#13202c', right: '#0e1922', stroke: 'rgba(212,167,82,0.35)' }, polys)
          // Podium resort pool
          drawBox(W, H, 1.35, 0.34, 1.25, 1.45, 0.06, 0.95, { top: pal.pool, left: '#0c7c92', right: '#0a6578' }, polys)
          const tiers = Math.min(7, Math.max(4, bedCount + 3))
          for (let t = 0; t < tiers; t++) {
            const y0 = 0.56 + t * 0.48
            const taper = 1 - t * 0.035
            const isHighlightedFloor = t === tiers - 2
            drawBox(
              W,
              H,
              -0.1,
              y0,
              -0.15,
              2.55 * taper,
              0.38,
              2.15 * taper,
              {
                top: isHighlightedFloor ? pal.gold : pal.roof,
                left: isHighlightedFloor ? 'rgba(243, 210, 122, 0.78)' : pal.glass,
                right: isHighlightedFloor ? 'rgba(212, 167, 82, 0.62)' : pal.wallDark,
                stroke: isHighlightedFloor ? '#fff4d1' : 'rgba(212,167,82,0.45)',
              },
              polys,
            )
            // Wrap-around terrace slab
            drawBox(
              W,
              H,
              -0.1,
              y0 - 0.21,
              -0.15,
              2.85 * taper,
              0.06,
              2.45 * taper,
              { top: pal.wallLight, left: pal.wallDark, right: '#9b8e78' },
              polys,
            )
          }
          // Architectural crown fin
          drawBox(W, H, -0.1, 0.56 + tiers * 0.48 + 0.18, -0.15, 1.6, 0.36, 1.3, { top: pal.gold, left: pal.roof, right: '#111d29', stroke: pal.gold }, polys)
          labels.push(
            { pos: { x: 1.5, y: 0.56 + (tiers - 2) * 0.48, z: 0.4 }, text: floorNo ? `Residence · Floor ${floorNo}` : 'Featured Sky Residence' },
            { pos: { x: 1.35, y: 0.55, z: 1.25 }, text: 'Resort Deck & Pool' },
          )
        }
      } else {
        // 3D Cutaway Spatial Floorplan Mode
        drawBox(W, H, 0, 0.08, 0, 5.6, 0.16, 4.2, { top: pal.floorBg, left: '#1a2733', right: '#121c26', stroke: pal.gold }, polys)
        // Living & Dining Salon
        drawBox(W, H, -1.2, 0.46, 0.45, 2.6, 0.62, 2.3, { top: 'rgba(212,167,82,0.22)', left: pal.wallLight, right: pal.wallDark, stroke: pal.gold }, polys)
        labels.push({ pos: { x: -1.2, y: 0.95, z: 0.45 }, text: 'Living & Dining', sub: `${Math.round(sqft * 0.34).toLocaleString()} ft²` })
        // Show Kitchen
        drawBox(W, H, -1.5, 0.44, -1.25, 2.0, 0.58, 1.15, { top: 'rgba(16,185,129,0.26)', left: '#e5e7eb', right: '#cbd5e1', stroke: '#10b981' }, polys)
        labels.push({ pos: { x: -1.5, y: 0.92, z: -1.25 }, text: 'Show Kitchen' })
        // Master Suite
        drawBox(W, H, 1.45, 0.46, -0.85, 2.15, 0.62, 1.85, { top: 'rgba(99,102,241,0.26)', left: pal.wallLight, right: pal.wallDark, stroke: '#818cf8' }, polys)
        labels.push({ pos: { x: 1.45, y: 0.96, z: -0.85 }, text: bedCount === 0 ? 'Studio Suite' : 'Master Suite', sub: `${Math.round(sqft * 0.24).toLocaleString()} ft²` })
        // Secondary bedrooms or study
        if (bedCount >= 2) {
          drawBox(W, H, 1.45, 0.44, 0.95, 2.15, 0.58, 1.45, { top: 'rgba(244,63,94,0.22)', left: pal.wallLight, right: pal.wallDark, stroke: '#fb7185' }, polys)
          labels.push({ pos: { x: 1.45, y: 0.92, z: 0.95 }, text: `${bedCount - 1} Guest Suite${bedCount - 1 > 1 ? 's' : ''}` })
        }
        // Panoramic Terrace / Pool Deck
        drawBox(W, H, -0.2, 0.2, 1.85, 4.4, 0.14, 0.65, { top: isVilla ? pal.pool : 'rgba(212,167,82,0.4)', left: pal.gold, right: '#8a621c', stroke: pal.gold }, polys)
        labels.push({ pos: { x: -0.2, y: 0.48, z: 1.85 }, text: isVilla ? 'Pool & Garden Deck' : 'Panoramic Balcony' })
      }

      // Painter's algorithm sort (back to front)
      polys.sort((a, b) => b.depth - a.depth)
      for (const poly of polys) {
        ctx.beginPath()
        ctx.moveTo(poly.pts[0]!.x, poly.pts[0]!.y)
        for (let i = 1; i < poly.pts.length; i++) ctx.lineTo(poly.pts[i]!.x, poly.pts[i]!.y)
        ctx.closePath()
        ctx.fillStyle = poly.fill
        ctx.fill()
        if (poly.stroke) {
          ctx.strokeStyle = poly.stroke
          ctx.lineWidth = 1
          ctx.stroke()
        }
      }

      // Crisp architectural callout pills
      for (const lb of labels) {
        const pt = project(lb.pos, W, H)
        const text = lb.sub ? `${lb.text} · ${lb.sub}` : lb.text
        ctx.font = '700 11px Manrope, system-ui, sans-serif'
        const tw = ctx.measureText(text).width + 18
        const th = 22
        ctx.save()
        ctx.fillStyle = light === 'day' ? 'rgba(11,31,42,0.86)' : 'rgba(11,20,30,0.82)'
        ctx.strokeStyle = 'rgba(212,167,82,0.75)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.roundRect(pt.x - tw / 2, pt.y - th / 2, tw, th, 11)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = '#fff9eb'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(text, pt.x, pt.y + 0.5)
        ctx.restore()
      }

      raf = requestAnimationFrame(render)
    }

    raf = requestAnimationFrame(render)
    return () => cancelAnimationFrame(raf)
  }, [mode, light, autoRotate, zoom, isVilla, bedCount, sqft, floorNo])

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = true
    lastPtRef.current = { x: e.clientX, y: e.clientY }
    ;(e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return
    const dx = e.clientX - lastPtRef.current.x
    const dy = e.clientY - lastPtRef.current.y
    lastPtRef.current = { x: e.clientX, y: e.clientY }
    yawRef.current += dx * 0.0085
    pitchRef.current = Math.max(0.18, Math.min(1.15, pitchRef.current + dy * 0.006))
  }
  const onPointerUp = () => {
    draggingRef.current = false
  }

  return (
    <div className="rounded-3xl overflow-hidden border border-[#d4a752]/30 bg-[#0b1824] shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3.5 border-b border-white/10 bg-[#0d1d2b] text-white">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#d4a752]/20 text-[#f3d27a] border border-[#d4a752]/40">
            <Box size={16} />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#f3d27a]">INTERACTIVE 3D ARCHITECTURAL MODEL</div>
            <div className="text-[13.5px] font-semibold truncate">{title} · {location || 'Dubai, UAE'}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMode('exterior')}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold border-0 cursor-pointer ${mode === 'exterior' ? 'bg-[#d4a752] text-[#0b1824]' : 'bg-white/10 text-white hover:bg-white/20'}`}
          >
            <Box size={13} /> 3D Massing
          </button>
          <button
            type="button"
            onClick={() => setMode('cutaway')}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold border-0 cursor-pointer ${mode === 'cutaway' ? 'bg-[#d4a752] text-[#0b1824]' : 'bg-white/10 text-white hover:bg-white/20'}`}
          >
            <Layers size={13} /> 3D Floor Cutaway
          </button>
        </div>
      </div>

      <div className="relative h-[340px] sm:h-[400px] w-full select-none">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="h-full w-full block cursor-grab active:cursor-grabbing touch-none"
          aria-label={`Interactive 3D architectural representation of ${title}`}
        />

        {/* Top-left spec HUD */}
        <div className="pointer-events-none absolute left-3.5 top-3.5 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-[#0b1824]/80 border border-[#d4a752]/40 px-2.5 py-1 text-[11px] font-semibold text-[#f3d27a] backdrop-blur-md">
            Drag to Rotate 360°
          </span>
          <span className="rounded-full bg-[#0b1824]/80 border border-white/15 px-2.5 py-1 text-[11px] font-mono text-white/90 backdrop-blur-md">
            {sqft.toLocaleString('en-US')} sq ft · {bedCount === 0 ? 'Studio' : `${bedCount} BR`} · {baths ?? Math.max(1, bedCount)} BA
          </span>
        </div>

        {/* Bottom lighting & camera controls */}
        <div className="absolute bottom-3.5 left-3.5 right-3.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 rounded-full bg-[#0b1824]/85 border border-white/15 p-1 backdrop-blur-md">
            {([
              ['golden', 'Golden Hour', Sunset],
              ['night', 'Skyline Night', Moon],
              ['day', 'Daylight', Sun],
            ] as const).map(([key, lbl, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setLight(key)}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold border-0 cursor-pointer ${light === key ? 'bg-[#d4a752] text-[#0b1824]' : 'bg-transparent text-white/80 hover:text-white'}`}
              >
                <Icon size={12} /> <span className="hidden sm:inline">{lbl}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-full bg-[#0b1824]/85 border border-white/15 p-1 backdrop-blur-md">
            <button type="button" aria-label="Toggle auto orbit" onClick={() => setAutoRotate(a => !a)} className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white border-0 cursor-pointer hover:bg-white/20">
              {autoRotate ? <Pause size={12} /> : <Play size={12} />}
            </button>
            <button type="button" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(1.6, z + 0.15))} className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white border-0 cursor-pointer hover:bg-white/20">
              <ZoomIn size={12} />
            </button>
            <button type="button" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(0.7, z - 0.15))} className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white border-0 cursor-pointer hover:bg-white/20">
              <ZoomOut size={12} />
            </button>
            <button type="button" aria-label="Reset camera" onClick={() => { yawRef.current = 0.68; pitchRef.current = 0.48; setZoom(1.05) }} className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white border-0 cursor-pointer hover:bg-white/20">
              <RotateCcw size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
