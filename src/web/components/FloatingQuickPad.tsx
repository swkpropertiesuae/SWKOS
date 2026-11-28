import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { GripHorizontal, Minimize2, Palette, Pin, Plus, Star, X } from 'lucide-react'
import { useMeta } from '../lib/meta'
import { useUiCustomization } from '../lib/uiCustomization'
import { preloadRoute } from '../lib/prefetch'
import { findNav } from '../swk/nav'
import { isRoutePinnableForUser } from '@shared/ui-customization'

function clampCoords(xPx: number, yPx: number, boxW: number, boxH: number) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const maxX = Math.max(12, vw - boxW - 12)
  const maxY = Math.max(76, vh - boxH - 12)
  return {
    x: Math.min(maxX, Math.max(12, xPx)),
    y: Math.min(maxY, Math.max(76, yPx)),
  }
}

/**
 * Draggable Floating Quick-Pad.
 * Users can grab the handle with mouse or touch and place their pinned options
 * anywhere on the screen; coordinates persist per user and auto-clamp on resize.
 */
export function FloatingQuickPad() {
  const { me, can } = useMeta()
  const loc = useLocation()
  const ui = useUiCustomization()
  const padRef = useRef<HTMLDivElement>(null)

  const pad = ui.prefs.pinning.floatingPad
  const visiblePins = useMemo(
    () => ui.prefs.pinning.pinnedItems.filter(p => isRoutePinnableForUser(p.to, me, can)),
    [ui.prefs.pinning.pinnedItems, me, can],
  )

  const [posPx, setPosPx] = useState<{ x: number; y: number }>(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800
    return clampCoords((pad.xPct / 100) * vw, (pad.yPct / 100) * vh, pad.collapsed ? 56 : 244, pad.collapsed ? 56 : 220)
  })
  const [dragging, setDragging] = useState(false)
  const dragOrigin = useRef<{ ptrX: number; ptrY: number; startX: number; startY: number; moved: boolean } | null>(null)

  // Sync pixel position from persisted percentages & clamp on viewport resize
  useEffect(() => {
    if (!pad.enabled || dragging) return
    const sync = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const rect = padRef.current?.getBoundingClientRect()
      const w = rect?.width || (pad.collapsed ? 56 : 244)
      const h = rect?.height || (pad.collapsed ? 56 : 180)
      setPosPx(clampCoords((pad.xPct / 100) * vw, (pad.yPct / 100) * vh, w, h))
    }
    sync()
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [pad.enabled, pad.xPct, pad.yPct, pad.collapsed, dragging])

  if (!pad.enabled) return null

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button[data-no-drag="1"], a')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragOrigin.current = { ptrX: e.clientX, ptrY: e.clientY, startX: posPx.x, startY: posPx.y, moved: false }
    setDragging(true)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const o = dragOrigin.current
    if (!o) return
    const dx = e.clientX - o.ptrX
    const dy = e.clientY - o.ptrY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) o.moved = true
    const rect = padRef.current?.getBoundingClientRect()
    const clamped = clampCoords(o.startX + dx, o.startY + dy, rect?.width || 240, rect?.height || 160)
    setPosPx(clamped)
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    const o = dragOrigin.current
    if (!o) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    dragOrigin.current = null
    setDragging(false)
    if (o.moved) {
      const vw = Math.max(1, window.innerWidth)
      const vh = Math.max(1, window.innerHeight)
      const xPct = Math.min(95, Math.max(1, Number(((posPx.x / vw) * 100).toFixed(1))))
      const yPct = Math.min(90, Math.max(8, Number(((posPx.y / vh) * 100).toFixed(1))))
      ui.updateFloatingPad({ xPct, yPct })
    }
  }

  const currentFullRoute = loc.pathname + (loc.search || '')
  const currentHit = findNav(loc.pathname)
  const currentLabel =
    currentHit?.item.label ||
    (loc.pathname === '/home' ? 'Home' : loc.pathname.split('/').filter(Boolean).pop()?.replace(/[-_]/g, ' ') || 'Page')
  const canPinHere = isRoutePinnableForUser(currentFullRoute, me, can)

  if (pad.collapsed) {
    return (
      <div
        ref={padRef}
        style={{ left: `${posPx.x}px`, top: `${posPx.y}px` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="region"
        aria-label="Floating quick shortcuts orb"
        className="swk-floating-pad no-print"
      >
        <button
          type="button"
          data-no-drag="0"
          onClick={() => {
            if (!dragOrigin.current?.moved) ui.updateFloatingPad({ collapsed: false })
          }}
          title="Drag anywhere or click to open Pinned Quick-Pad"
          aria-label="Expand Floating Quick-Pad"
          className="flex size-13 items-center justify-center rounded-full border-2 border-[#d4a955] bg-[#0a0b0e] text-[#ebc97c] shadow-[0_18px_40px_rgba(10,11,14,0.45)] cursor-grab active:cursor-grabbing"
        >
          <Pin size={19} />
        </button>
      </div>
    )
  }

  return (
    <div
      ref={padRef}
      style={{ left: `${posPx.x}px`, top: `${posPx.y}px` }}
      role="region"
      aria-label="Draggable Floating Quick-Pad"
      className={`swk-floating-pad no-print w-[248px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-[#d4a955]/55 bg-[#0a0b0e]/95 text-white shadow-[0_24px_60px_-14px_rgba(10,11,14,0.65)] backdrop-blur-xl ${
        dragging ? 'ring-2 ring-[#ebc97c]' : ''
      }`}
    >
      {/* Drag Handle Header */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-2 cursor-grab active:cursor-grabbing"
        title="Drag anywhere on screen"
      >
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#ebc97c]">
          <GripHorizontal size={14} /> Quick Pad
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-no-drag="1"
            onClick={ui.openDrawer}
            aria-label="Customise UI"
            title="Customise UI"
            className="grid size-6 place-items-center rounded-md border-0 bg-white/10 text-white hover:bg-[#d4a955] hover:text-[#0a0b0e] cursor-pointer"
          >
            <Palette size={12} />
          </button>
          <button
            type="button"
            data-no-drag="1"
            onClick={() => ui.updateFloatingPad({ collapsed: true })}
            aria-label="Collapse Quick-Pad"
            title="Collapse to orb"
            className="grid size-6 place-items-center rounded-md border-0 bg-white/10 text-white hover:bg-white/20 cursor-pointer"
          >
            <Minimize2 size={12} />
          </button>
          <button
            type="button"
            data-no-drag="1"
            onClick={() => ui.updateFloatingPad({ enabled: false })}
            aria-label="Hide Floating Quick-Pad"
            title="Hide pad"
            className="grid size-6 place-items-center rounded-md border-0 bg-white/10 text-white hover:bg-[#96202f] cursor-pointer"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Shortcuts Body */}
      <div className="max-h-[240px] overflow-y-auto p-2 space-y-1">
        {visiblePins.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 p-3 text-center text-[11px] text-white/65">
            No pinned shortcuts yet. Click below to pin this screen!
          </div>
        ) : (
          visiblePins.map(item => (
            <div
              key={item.id}
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs transition-colors ${
                item.highlighted
                  ? 'border-[#d4a955] bg-[#d4a955]/18 text-[#ebc97c]'
                  : 'border-white/10 bg-white/[0.05] text-white hover:border-[#d4a955]/60'
              }`}
            >
              <Link
                to={item.to}
                onMouseEnter={() => preloadRoute(item.to)}
                className="flex flex-1 min-w-0 items-center gap-1.5 no-underline text-inherit font-semibold"
              >
                {item.highlighted && <Star size={11} className="fill-[#ebc97c] text-[#ebc97c] shrink-0" />}
                <span className="truncate">{item.label}</span>
              </Link>
              <button
                type="button"
                data-no-drag="1"
                onClick={() => ui.removePin(item.id)}
                aria-label={`Remove ${item.label}`}
                className="grid size-5 place-items-center rounded border-0 bg-transparent text-white/50 hover:text-white cursor-pointer"
              >
                <X size={11} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Footer Pin Current */}
      {canPinHere && (
        <div className="border-t border-white/10 p-2">
          <button
            type="button"
            data-no-drag="1"
            onClick={() =>
              ui.togglePinItem({
                id: currentFullRoute,
                label: currentLabel,
                to: currentFullRoute,
                highlighted: false,
              })
            }
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#d4a955] px-2.5 py-1.5 text-[11px] font-bold text-[#0a0b0e] border-0 cursor-pointer hover:bg-[#ebc97c]"
          >
            <Plus size={12} /> {ui.isPinned(currentFullRoute) ? `Unpin ${currentLabel}` : `Pin ${currentLabel}`}
          </button>
        </div>
      )}
    </div>
  )
}
