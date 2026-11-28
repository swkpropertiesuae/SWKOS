import { useMemo, useState, type DragEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { GripVertical, Palette, Pin, Plus, Star, X } from 'lucide-react'
import { useMeta } from '../lib/meta'
import { useUiCustomization } from '../lib/uiCustomization'
import { preloadRoute } from '../lib/prefetch'
import { findNav } from '../swk/nav'
import { isRoutePinnableForUser } from '@shared/ui-customization'

/**
 * Dockable Pinned Quick-Launch Bar.
 * Supports Top / Bottom / Left / Right placement, live drag-and-drop pill reordering,
 * Highlight Star emphasis, and 1-click "+ Pin page" for the active route.
 */
export function PinnedQuickDock() {
  const { me, can } = useMeta()
  const loc = useLocation()
  const ui = useUiCustomization()
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const pos = ui.prefs.pinning.dockPosition
  const visiblePins = useMemo(
    () => ui.prefs.pinning.pinnedItems.filter(p => isRoutePinnableForUser(p.to, me, can)),
    [ui.prefs.pinning.pinnedItems, me, can],
  )

  if (pos === 'hidden') return null

  const currentFullRoute = loc.pathname + (loc.search || '')
  const currentHit = findNav(loc.pathname)
  const currentLabel =
    currentHit?.item.label ||
    (loc.pathname === '/home'
      ? 'Home'
      : loc.pathname === '/customise-ui'
        ? 'Customise UI'
        : loc.pathname.split('/').filter(Boolean).pop()?.replace(/[-_]/g, ' ') || 'Page')
  const canPinHere = isRoutePinnableForUser(currentFullRoute, me, can)
  const alreadyPinnedHere = ui.isPinned(currentFullRoute)

  const onDragStart = (idx: number, e: DragEvent) => {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }
  const onDrop = (targetIdx: number, e: DragEvent) => {
    e.preventDefault()
    const from = dragIdx ?? Number(e.dataTransfer.getData('text/plain'))
    const fromId = visiblePins[from]?.id
    const toId = visiblePins[targetIdx]?.id
    if (fromId && toId && fromId !== toId) {
      const realFrom = ui.prefs.pinning.pinnedItems.findIndex(p => p.id === fromId)
      const realTo = ui.prefs.pinning.pinnedItems.findIndex(p => p.id === toId)
      if (realFrom >= 0 && realTo >= 0) ui.reorderPins(realFrom, realTo)
    }
    setDragIdx(null)
  }

  const isVertical = pos === 'left' || pos === 'right'

  return (
    <nav
      aria-label="Pinned quick shortcuts"
      className={`swk-pin-dock swk-pin-dock--${pos} no-print`}
    >
      <span className="inline-flex items-center gap-1.5 px-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted shrink-0">
        <Pin size={11} className="text-[#d4a955]" />
        {!isVertical && <span>Pinned</span>}
      </span>

      {visiblePins.map((item, idx) => {
        const active = loc.pathname + (loc.search || '') === item.to || loc.pathname === item.to
        return (
          <div
            key={item.id}
            draggable
            onDragStart={e => onDragStart(idx, e)}
            onDragOver={e => e.preventDefault()}
            onDrop={e => onDrop(idx, e)}
            onDragEnd={() => setDragIdx(null)}
            style={item.accentColor ? { borderColor: item.accentColor } : undefined}
            className={`swk-pin-pill group ${item.highlighted ? 'swk-ui-highlighted' : ''} ${
              active ? 'ring-1 ring-[#d4a955]' : ''
            } ${dragIdx === idx ? 'is-dragging' : ''} ${isVertical ? 'w-full justify-between' : ''}`}
          >
            <GripVertical size={11} className="opacity-40 shrink-0" aria-hidden />
            <Link
              to={item.to}
              onMouseEnter={() => preloadRoute(item.to)}
              className="inline-flex items-center gap-1.5 min-w-0 truncate no-underline text-inherit"
            >
              {item.highlighted && <Star size={11} className="fill-[#d4a955] text-[#d4a955] shrink-0" />}
              <span className="truncate max-w-[140px]">{item.label}</span>
            </Link>
            <button
              type="button"
              onClick={() => ui.removePin(item.id)}
              aria-label={`Unpin ${item.label}`}
              className="grid size-4 place-items-center rounded-full border-0 bg-transparent text-muted opacity-55 hover:opacity-100 hover:text-[#96202f] cursor-pointer shrink-0 p-0"
            >
              <X size={10} />
            </button>
          </div>
        )
      })}

      {canPinHere && !alreadyPinnedHere && (
        <button
          type="button"
          onClick={() =>
            ui.togglePinItem({
              id: currentFullRoute,
              label: currentLabel,
              to: currentFullRoute,
              highlighted: false,
            })
          }
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#d4a955]/70 bg-transparent px-2.5 py-1 text-[11px] font-bold text-ink hover:bg-[#0a0b0e] hover:text-[#ebc97c] cursor-pointer shrink-0"
          title={`Pin ${currentLabel}`}
        >
          <Plus size={11} /> Pin page
        </button>
      )}

      <button
        type="button"
        onClick={ui.openDrawer}
        title="Customise pinned bar & UI"
        aria-label="Customise pinned bar"
        className="ml-auto inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 px-2 py-1 text-[10.5px] font-bold text-[#0a0b0e] hover:border-[#d4a955] cursor-pointer shrink-0"
      >
        <Palette size={11} />
        {!isVertical && <span>Customise</span>}
      </button>
    </nav>
  )
}
