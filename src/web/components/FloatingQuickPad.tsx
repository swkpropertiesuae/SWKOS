import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowDown, ArrowUp, GripHorizontal, GripVertical, Minimize2, Palette, Pin, Plus, Star, X } from 'lucide-react'
import { useMeta } from '../lib/meta'
import { useUiCustomization } from '../lib/uiCustomization'
import { preloadRoute } from '../lib/prefetch'
import { findNav } from '../swk/nav'
import { isRoutePinnableForUser } from '@shared/ui-customization'

const PAD_ITEM_MIME = 'application/x-swk-pad-idx'

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
 * Users can grab the drag handle (or collapsed orb) with mouse or touch and place their
 * pinned options anywhere on screen; coordinates persist per user and auto-clamp on resize.
 * Supports drag-to-reorder + ↑/↓ reorder + highlight star + per-pin badge color + smooth mobile scroll.
 */
export function FloatingQuickPad() {
  const { me, can } = useMeta()
  const loc = useLocation()
  const ui = useUiCustomization()
  const padRef = useRef<HTMLDivElement>(null)
  const [dragItemIdx, setDragItemIdx] = useState<number | null>(null)

  const pad = ui.prefs.pinning.floatingPad
  const visiblePins = useMemo(
    () => ui.prefs.pinning.pinnedItems.filter(p => isRoutePinnableForUser(p.to, me, can, ui.lookupEntityModule)),
    [ui.prefs.pinning.pinnedItems, me, can, ui.lookupEntityModule],
  )

  const [posPx, setPosPx] = useState<{ x: number; y: number }>(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800
    return clampCoords((pad.xPct / 100) * vw, (pad.yPct / 100) * vh, pad.collapsed ? 56 : 256, pad.collapsed ? 56 : 220)
  })
  const [dragging, setDragging] = useState(false)
  const dragOrigin = useRef<{
    ptrX: number
    ptrY: number
    startX: number
    startY: number
    lastX: number
    lastY: number
    moved: boolean
  } | null>(null)
  const suppressNextOrbClickRef = useRef(false)

  // Sync pixel position from persisted percentages & clamp on viewport resize
  useEffect(() => {
    if (!pad.enabled || dragging) return
    const sync = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const rect = padRef.current?.getBoundingClientRect()
      const w = rect?.width || (pad.collapsed ? 56 : 256)
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
    dragOrigin.current = {
      ptrX: e.clientX,
      ptrY: e.clientY,
      startX: posPx.x,
      startY: posPx.y,
      lastX: posPx.x,
      lastY: posPx.y,
      moved: false,
    }
    setDragging(true)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const o = dragOrigin.current
    if (!o) return
    const dx = e.clientX - o.ptrX
    const dy = e.clientY - o.ptrY
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) o.moved = true
    const rect = padRef.current?.getBoundingClientRect()
    const clamped = clampCoords(o.startX + dx, o.startY + dy, rect?.width || 256, rect?.height || 160)
    o.lastX = clamped.x
    o.lastY = clamped.y
    setPosPx(clamped)
  }

  const finishDrag = (e: ReactPointerEvent<HTMLElement>, cancelled = false) => {
    const o = dragOrigin.current
    if (!o) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    dragOrigin.current = null
    setDragging(false)
    if (cancelled) return
    if (o.moved) {
      suppressNextOrbClickRef.current = true
      const rect = padRef.current?.getBoundingClientRect()
      const finalClamped = clampCoords(
        o.startX + (e.clientX - o.ptrX),
        o.startY + (e.clientY - o.ptrY),
        rect?.width || 256,
        rect?.height || 160,
      )
      setPosPx(finalClamped)
      const vw = Math.max(1, window.innerWidth)
      const vh = Math.max(1, window.innerHeight)
      const xPct = Math.min(95, Math.max(1, Number(((finalClamped.x / vw) * 100).toFixed(1))))
      const yPct = Math.min(90, Math.max(8, Number(((finalClamped.y / vh) * 100).toFixed(1))))
      ui.updateFloatingPad({ xPct, yPct })
    }
  }

  const moveVisiblePin = (fromIdx: number, toIdx: number) => {
    const fromId = visiblePins[fromIdx]?.id
    const toId = visiblePins[toIdx]?.id
    if (!fromId || !toId || fromId === toId) return
    const realFrom = ui.prefs.pinning.pinnedItems.findIndex(p => p.id === fromId)
    const realTo = ui.prefs.pinning.pinnedItems.findIndex(p => p.id === toId)
    if (realFrom >= 0 && realTo >= 0) ui.reorderPins(realFrom, realTo)
  }

  const onItemDragStart = (idx: number, e: DragEvent) => {
    setDragItemIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData(PAD_ITEM_MIME, String(idx))
  }
  const onItemDrop = (targetIdx: number, e: DragEvent) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData(PAD_ITEM_MIME)
    const from = dragItemIdx ?? (raw !== '' ? Number(raw) : NaN)
    if (Number.isInteger(from) && from >= 0 && from !== targetIdx) moveVisiblePin(from, targetIdx)
    setDragItemIdx(null)
  }

  const currentFullRoute = loc.pathname + (loc.search || '')
  const currentHit = findNav(loc.pathname)
  const currentLabel =
    currentHit?.item.label ||
    (loc.pathname === '/home' ? 'Home' : loc.pathname.split('/').filter(Boolean).pop()?.replace(/[-_]/g, ' ') || 'Page')
  const canPinHere = isRoutePinnableForUser(currentFullRoute, me, can, ui.lookupEntityModule)

  if (pad.collapsed) {
    return (
      <div
        ref={padRef}
        style={{ left: `${posPx.x}px`, top: `${posPx.y}px` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={e => finishDrag(e, false)}
        onPointerCancel={e => finishDrag(e, true)}
        role="region"
        aria-label="Floating quick shortcuts orb"
        className="swk-floating-pad swk-floating-pad-handle no-print"
      >
        <button
          type="button"
          onClick={() => {
            if (suppressNextOrbClickRef.current) {
              suppressNextOrbClickRef.current = false
              return
            }
            ui.updateFloatingPad({ collapsed: false })
          }}
          title="Drag anywhere or click to open Pinned Quick-Pad"
          aria-label="Expand Floating Quick-Pad"
          style={{
            backgroundColor: 'var(--swk-ui-gloss-bg, #0a0b0e)',
            borderColor: 'var(--swk-ui-accent, #d4a955)',
          }}
          className="flex size-13 items-center justify-center rounded-full border-2 text-[#ebc97c] shadow-[0_18px_40px_rgba(10,11,14,0.45)] cursor-grab active:cursor-grabbing"
        >
          <Pin size={19} />
        </button>
      </div>
    )
  }

  return (
    <div
      ref={padRef}
      style={{
        left: `${posPx.x}px`,
        top: `${posPx.y}px`,
        backgroundColor: 'color-mix(in srgb, var(--swk-ui-gloss-bg, #0a0b0e) 96%, transparent)',
        borderColor: 'color-mix(in srgb, var(--swk-ui-accent, #d4a955) 55%, transparent)',
      }}
      role="region"
      aria-label="Draggable Floating Quick-Pad"
      className={`swk-floating-pad no-print w-[264px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border text-white shadow-[0_24px_60px_-14px_rgba(10,11,14,0.65)] backdrop-blur-xl ${
        dragging ? 'ring-2 ring-[#ebc97c]' : ''
      }`}
    >
      {/* Drag Handle Header (touch-action: none ONLY here so list body scrolls smoothly on mobile!) */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={e => finishDrag(e, false)}
        onPointerCancel={e => finishDrag(e, true)}
        className="swk-floating-pad-handle flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-2 cursor-grab active:cursor-grabbing"
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

      {/* Shortcuts Body (touch-scrollable + drag & arrow reorder) */}
      <div className="max-h-[240px] overflow-y-auto p-2 space-y-1">
        {visiblePins.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 p-3 text-center text-[11px] text-white/65">
            No pinned shortcuts yet. Click below to pin this screen!
          </div>
        ) : (
          visiblePins.map((item, idx) => (
            <div
              key={item.id}
              draggable
              onDragStart={e => onItemDragStart(idx, e)}
              onDragOver={e => e.preventDefault()}
              onDrop={e => onItemDrop(idx, e)}
              onDragEnd={() => setDragItemIdx(null)}
              style={item.accentColor ? { borderColor: item.accentColor } : undefined}
              className={`flex items-center gap-1 rounded-xl border px-2 py-1.5 text-xs transition-colors ${
                item.highlighted
                  ? 'border-[#d4a955] bg-[#d4a955]/18 text-[#ebc97c]'
                  : 'border-white/10 bg-white/[0.05] text-white hover:border-[#d4a955]/60'
              } ${dragItemIdx === idx ? 'opacity-45' : ''}`}
            >
              <GripVertical size={11} className="text-white/40 cursor-grab shrink-0" aria-hidden />
              <Link
                to={item.to}
                draggable={false}
                onMouseEnter={() => preloadRoute(item.to)}
                className="flex flex-1 min-w-0 items-center gap-1.5 no-underline text-inherit font-semibold"
              >
                {item.highlighted && <Star size={11} className="fill-[#ebc97c] text-[#ebc97c] shrink-0" />}
                <span className="truncate">{item.label}</span>
              </Link>
              <button
                type="button"
                data-no-drag="1"
                disabled={idx === 0}
                onClick={() => moveVisiblePin(idx, idx - 1)}
                aria-label={`Move ${item.label} up`}
                className="grid size-5 place-items-center rounded border-0 bg-transparent text-white/45 hover:text-white disabled:opacity-20 cursor-pointer"
              >
                <ArrowUp size={10} />
              </button>
              <button
                type="button"
                data-no-drag="1"
                disabled={idx === visiblePins.length - 1}
                onClick={() => moveVisiblePin(idx, idx + 1)}
                aria-label={`Move ${item.label} down`}
                className="grid size-5 place-items-center rounded border-0 bg-transparent text-white/45 hover:text-white disabled:opacity-20 cursor-pointer"
              >
                <ArrowDown size={10} />
              </button>
              <button
                type="button"
                data-no-drag="1"
                onClick={() => ui.togglePinHighlight(item.id)}
                aria-label={`Highlight ${item.label}`}
                className="grid size-5 place-items-center rounded border-0 bg-transparent text-white/50 hover:text-[#ebc97c] cursor-pointer"
              >
                <Star size={10} className={item.highlighted ? 'fill-[#ebc97c] text-[#ebc97c]' : ''} />
              </button>
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
            style={{ backgroundColor: 'var(--swk-ui-accent, #d4a955)' }}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-[#0a0b0e] border-0 cursor-pointer hover:opacity-90"
          >
            <Plus size={12} /> {ui.isPinned(currentFullRoute) ? `Unpin ${currentLabel}` : `Pin ${currentLabel}`}
          </button>
        </div>
      )}
    </div>
  )
}
