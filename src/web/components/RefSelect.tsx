import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronDown, Pencil, Plus, Eraser } from 'lucide-react'
import { get, post } from '../lib/api'
import { cls } from '../lib/format'

interface Opt { id: number; label: string; sub?: string }
const cache = new Map<string, Opt[]>()

export function RefSelect({
  entity,
  value,
  label,
  onChange,
  filter,
  disabled,
  invalid,
  placeholder = 'Search or type custom…',
  allowClear = true,
  allowCustom = true,
  onCustomText,
}: {
  entity: string
  value: number | null | undefined
  label?: string
  onChange: (id: number | null, label?: string) => void
  filter?: Record<string, any>
  disabled?: boolean
  invalid?: boolean
  placeholder?: string
  allowClear?: boolean
  allowCustom?: boolean
  onCustomText?: (text: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [opts, setOpts] = useState<Opt[]>([])
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [customMode, setCustomMode] = useState(false)
  const [customDraft, setCustomDraft] = useState('')
  const [createErr, setCreateErr] = useState('')
  const [shown, setShown] = useState<string>(label ?? '')
  const [hi, setHi] = useState(0)
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const customInputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<any>(null)
  const fkey = JSON.stringify(filter ?? {})

  // Outside click that respects both input wrapper and portaled listbox
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
      setCustomMode(false)
      setCreateErr('')
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  useEffect(() => {
    if (customMode) {
      requestAnimationFrame(() => customInputRef.current?.focus())
    }
  }, [customMode])

  // Position portaled listbox relative to input and flip upward if near bottom of screen
  useLayoutEffect(() => {
    if (!open || disabled) { setPos(null); return }
    const update = () => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const spaceBelow = window.innerHeight - r.bottom - 12
      const spaceAbove = r.top - 12
      const flipUp = spaceBelow < 220 && spaceAbove > spaceBelow
      if (flipUp) {
        setPos({
          left: r.left,
          width: Math.max(r.width, 220),
          bottom: window.innerHeight - r.top + 4,
          maxHeight: Math.max(150, Math.min(300, spaceAbove - 4)),
        })
      } else {
        setPos({
          left: r.left,
          width: Math.max(r.width, 220),
          top: r.bottom + 4,
          maxHeight: Math.max(150, Math.min(300, spaceBelow - 4)),
        })
      }
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, disabled])

  // resolve label for an id we only know numerically
  useEffect(() => {
    if (!value) { setShown(''); return }
    if (label) { setShown(label); return }
    let dead = false
    get<Opt[]>(`/api/e/${entity}/lookup`, { ids: String(value) }).then(r => { if (!dead && r[0]) setShown(r[0].label) }).catch(() => {})
    return () => { dead = true }
  }, [value, label, entity])

  useEffect(() => {
    if (!open) return
    clearTimeout(timer.current)
    const k = `${entity}|${fkey}|${text}`
    if (cache.has(k)) { setOpts(cache.get(k)!); return }
    setBusy(true)
    timer.current = setTimeout(() => {
      get<Opt[]>(`/api/e/${entity}/lookup`, { q: text, filter: filter && Object.keys(filter).length ? filter : undefined, limit: 25 })
        .then(r => {
          cache.set(k, r)
          if (cache.size > 300) cache.delete(cache.keys().next().value!)
          setOpts(r)
          setHi(0)
        })
        .catch(() => setOpts([]))
        .finally(() => setBusy(false))
    }, text ? 180 : 0)
    return () => clearTimeout(timer.current)
  }, [open, text, entity, fkey])

  const pick = (o: Opt) => {
    onChange(o.id, o.label)
    setShown(o.label)
    setOpen(false)
    setCustomMode(false)
    setCreateErr('')
    setText('')
  }

  const pickEmpty = () => {
    onChange(null, '')
    setShown('')
    setText('')
    setCustomDraft('')
    setCustomMode(false)
    setCreateErr('')
    setOpen(false)
  }

  const submitCustom = async (rawLabel: string) => {
    const clean = rawLabel.trim()
    if (!clean) {
      pickEmpty()
      return
    }
    if (onCustomText) {
      onCustomText(clean)
      setShown(clean)
      setOpen(false)
      setCustomMode(false)
      setText('')
      setCustomDraft('')
      setCreateErr('')
      return
    }
    setCreating(true)
    setCreateErr('')
    try {
      const created = await post<{ id: number; label: string }>(`/api/e/${entity}/quick-create`, {
        label: clean,
        filter: filter && Object.keys(filter).length ? filter : undefined,
      })
      clearRefCache()
      onChange(created.id, created.label)
      setShown(created.label)
      setOpen(false)
      setCustomMode(false)
      setText('')
      setCustomDraft('')
    } catch (e: any) {
      setCreateErr(e?.message || 'Could not save custom entry here')
    } finally {
      setCreating(false)
    }
  }

  const typedQuery = text.trim()

  const dropdown = open && !disabled && pos ? (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: pos.left,
        width: pos.width,
        top: pos.top,
        bottom: pos.bottom,
        maxHeight: pos.maxHeight,
        zIndex: 300,
      }}
      className="bg-card border border-line rounded-xl shadow-xl overflow-auto fade-in flex flex-col"
      role="listbox"
    >
      <div className="overflow-auto flex-1">
        {allowClear && (
          <div
            role="option"
            aria-selected={!value}
            className="px-3 py-1.5 text-[12.5px] text-muted cursor-pointer hover:bg-hover flex items-center gap-1.5 border-b border-line/60"
            onMouseDown={e => { e.preventDefault(); pickEmpty() }}
          >
            <Eraser size={12} /> <span>— Empty / Leave blank —</span>
          </div>
        )}
        {busy && !opts.length && <div className="px-3 py-2 text-sm text-muted">Searching…</div>}
        {!busy && !opts.length && (
          <div className="px-3 py-2 text-xs text-muted">
            {typedQuery ? `No existing match for “${typedQuery}”.` : 'No saved items yet — type custom below.'}
          </div>
        )}
        {opts.map((o, i) => (
          <div
            key={o.id}
            role="option"
            aria-selected={o.id === value}
            className={cls('px-3 py-2 text-[13.5px] cursor-pointer flex justify-between gap-2', i === hi ? 'bg-mint text-fold' : 'hover:bg-hover', o.id === value && 'font-bold')}
            onMouseEnter={() => setHi(i)}
            onMouseDown={e => { e.preventDefault(); pick(o) }}
          >
            <span className="truncate">{o.label}</span>
            {o.sub && <span className="text-xs text-muted flex-none">{o.sub}</span>}
          </div>
        ))}
      </div>

      {allowCustom && (
        <div className="border-t border-line bg-soft/70 p-2 space-y-1.5">
          {typedQuery && !customMode ? (
            <button
              type="button"
              disabled={creating}
              className="w-full text-left px-2.5 py-1.5 rounded-lg bg-brand/10 hover:bg-brand/20 text-brand text-[12.5px] font-bold flex items-center gap-1.5 transition"
              onMouseDown={e => { e.preventDefault(); void submitCustom(typedQuery) }}
            >
              <Plus size={13} className="flex-none" />
              <span className="truncate">{creating ? 'Adding…' : `Add & use custom “${typedQuery}”`}</span>
            </button>
          ) : null}

          {customMode ? (
            <div className="flex items-center gap-1.5">
              <input
                ref={customInputRef}
                type="text"
                className="input !min-h-[32px] !py-1 !px-2.5 !text-[13px] flex-1"
                placeholder="Type custom value…"
                value={customDraft}
                disabled={creating}
                onChange={e => { setCustomDraft(e.target.value); setCreateErr('') }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void submitCustom(customDraft)
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    setCustomMode(false)
                  }
                }}
              />
              <button
                type="button"
                disabled={creating || !customDraft.trim()}
                className="btn green sm !min-h-[32px] !px-2.5 !text-xs flex-none"
                onMouseDown={e => { e.preventDefault(); void submitCustom(customDraft) }}
              >
                {creating ? '…' : 'Use'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-hover text-ink text-[12.5px] font-semibold flex items-center gap-1.5"
              onMouseDown={e => {
                e.preventDefault()
                setCustomDraft(typedQuery || shown || '')
                setCustomMode(true)
              }}
            >
              <Pencil size={12} className="text-muted flex-none" />
              <span>Custom / Type your own…</span>
            </button>
          )}
          {createErr && <div className="text-[11.5px] text-signal px-1 font-medium">{createErr}</div>}
        </div>
      )}
    </div>
  ) : null

  return (
    <div className="ref-select relative" ref={ref}>
      <div className="relative">
        <input
          className={cls('input pr-16', invalid && 'invalid')}
          disabled={disabled}
          placeholder={shown ? '' : placeholder}
          value={open ? text : shown}
          title={shown}
          onFocus={() => { setOpen(true); setText('') }}
          onChange={e => { setText(e.target.value); setOpen(true); setCreateErr('') }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, Math.max(0, opts.length - 1))) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
            else if (e.key === 'Enter' && open) {
              if (opts[hi]) { e.preventDefault(); pick(opts[hi]) }
              else if (allowCustom && typedQuery && !busy) { e.preventDefault(); void submitCustom(typedQuery) }
            }
            else if (e.key === 'Escape') { setOpen(false); setCustomMode(false) }
          }}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
        />
        <div className="ref-select-actions absolute top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {allowClear && value && !disabled ? (
            <button
              type="button"
              className="btn ghost icon sm"
              style={{ width: 22, minHeight: 22 }}
              onClick={pickEmpty}
              aria-label="Clear"
              title="Empty / Clear"
            >
              <X size={13} />
            </button>
          ) : null}
          {allowCustom && !disabled ? (
            <button
              type="button"
              className="btn ghost icon sm"
              style={{ width: 22, minHeight: 22 }}
              onClick={() => {
                setOpen(true)
                setCustomDraft(typedQuery || shown || '')
                setCustomMode(true)
              }}
              aria-label="Custom value"
              title="Type custom / Add new"
            >
              <Pencil size={12} />
            </button>
          ) : null}
          <ChevronDown size={15} className="text-muted pointer-events-none" />
        </div>
      </div>
      {dropdown && typeof document !== 'undefined' ? createPortal(dropdown, document.body) : dropdown}
    </div>
  )
}
export const clearRefCache = () => cache.clear()
