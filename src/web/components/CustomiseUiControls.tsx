import { useMemo, useRef, useState, type DragEvent } from 'react'
import { useLocation } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  Check,
  Crown,
  Download,
  GripVertical,
  Move,
  Palette,
  Pin,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Star,
  Trash2,
  Type,
  Undo2,
  Upload,
  Wand2,
} from 'lucide-react'
import { useMeta } from '../lib/meta'
import { useUiCustomization } from '../lib/uiCustomization'
import { findNav, launcherApps, SWK_NAV } from '../swk/nav'
import {
  UI_FONT_CATALOG,
  UI_PRESETS,
  isRoutePinnableForUser,
  type DockPosition,
  type UiColorConfig,
} from '@shared/ui-customization'

type TabKey = 'colors' | 'fonts' | 'highlight' | 'pins' | 'save'

const COLOR_GROUPS: Array<{
  title: string
  fields: Array<{ key: keyof Omit<UiColorConfig, 'bgStyle'>; label: string }>
}> = [
  {
    title: 'Background & Cards',
    fields: [
      { key: 'background', label: 'Page Background' },
      { key: 'backgroundAlt', label: 'Gradient 2nd Color' },
      { key: 'cardBg', label: 'Standard Cards' },
      { key: 'glossCardBg', label: 'Glossy Dark Cards' },
      { key: 'headerBg', label: 'Top Header Bar' },
      { key: 'sidebarBg', label: 'Left Sidebar' },
    ],
  },
  {
    title: 'Fonts & Text Colors',
    fields: [
      { key: 'textPrimary', label: 'Heading & Title Text' },
      { key: 'textBody', label: 'Main Body Text' },
      { key: 'textMuted', label: 'Labels & Helper Text' },
    ],
  },
  {
    title: 'Buttons, Borders & Brand',
    fields: [
      { key: 'buttonBg', label: 'Primary Button Fill' },
      { key: 'buttonText', label: 'Primary Button Text' },
      { key: 'borderColor', label: 'Card & Input Borders' },
      { key: 'accentColor', label: 'Brand Accent Color' },
      { key: 'highlightColor', label: 'Highlight Glow Color' },
      { key: 'highlightBg', label: 'Highlight Tint Fill' },
    ],
  },
]

const HIGHLIGHT_SWATCHES = [
  { name: 'Imperial Gold', color: '#d4a955', bg: '#fbf6ea' },
  { name: 'UAE Emerald', color: '#1e6b43', bg: '#ecfdf5' },
  { name: 'UAE Crimson', color: '#96202f', bg: '#fef2f2' },
  { name: 'Royal Sapphire', color: '#2563eb', bg: '#eff6ff' },
  { name: 'Amber Spotlight', color: '#d97706', bg: '#fef3c7' },
  { name: 'Electric Mint', color: '#10b981', bg: '#ecfdf5' },
]

const DOCK_OPTIONS: Array<{ value: DockPosition; label: string; hint: string }> = [
  { value: 'top', label: 'Top Bar', hint: 'Strip below header' },
  { value: 'bottom', label: 'Bottom', hint: 'Floating pill bar' },
  { value: 'left', label: 'Left Rail', hint: 'Pinned left side' },
  { value: 'right', label: 'Right Rail', hint: 'Pinned right side' },
  { value: 'hidden', label: 'Hidden', hint: 'Hide docked bar' },
]

function ColorPickerRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (hex: string) => void
}) {
  return (
    <label className="flex items-center justify-between gap-2 rounded-xl border border-black/10 bg-white px-2.5 py-2 text-xs">
      <span className="font-medium text-[#1e2430] truncate">{label}</span>
      <span className="flex items-center gap-1.5 shrink-0">
        <input
          type="color"
          value={value}
          aria-label={label}
          onChange={e => onChange(e.target.value)}
          className="h-7 w-8 cursor-pointer rounded-md border border-black/15 bg-transparent p-0.5"
        />
        <input
          type="text"
          value={value}
          aria-label={`${label} hex`}
          maxLength={7}
          onChange={e => {
            const v = e.target.value.trim()
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v.toLowerCase())
          }}
          className="w-[70px] rounded-md border border-black/15 px-1.5 py-1 font-mono text-[11px] uppercase text-[#0a0b0e]"
        />
      </span>
    </label>
  )
}

export function CustomiseUiControls({ compact = false }: { compact?: boolean }) {
  const { me, can } = useMeta()
  const loc = useLocation()
  const ui = useUiCustomization()
  const [tab, setTab] = useState<TabKey>('colors')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [quickPick, setQuickPick] = useState('')
  const importInputRef = useRef<HTMLInputElement>(null)

  const permittedApps = useMemo(() => launcherApps(can, me), [can, me])
  const allPinnableOptions = useMemo(() => {
    const out: Array<{ label: string; to: string; group: string }> = []
    const seen = new Set<string>()
    if (me?.party_id) {
      const portalChoices = [
        { label: 'Service Portal', to: '/portal', group: 'Portal' },
        { label: 'Calendar', to: '/calendar', group: 'Portal' },
        { label: 'My Profile', to: '/profile', group: 'Account' },
        { label: 'Customise UI', to: '/customise-ui', group: 'Account' },
        { label: 'My Leases', to: '/e/leases', group: 'Records' },
        { label: 'My Invoices', to: '/e/invoices', group: 'Records' },
        { label: 'My Receipts', to: '/e/receipts', group: 'Records' },
        { label: 'Maintenance', to: '/e/maintenance', group: 'Records' },
      ]
      return portalChoices.filter(c => isRoutePinnableForUser(c.to, me, can))
    }
    for (const app of permittedApps) {
      if (!seen.has(app.landing)) {
        seen.add(app.landing)
        out.push({ label: app.label, to: app.landing, group: 'Apps' })
      }
      for (const item of app.items) {
        if (!seen.has(item.to) && isRoutePinnableForUser(item.to, me, can)) {
          seen.add(item.to)
          out.push({ label: item.label, to: item.to, group: app.label })
        }
      }
    }
    for (const sec of SWK_NAV) {
      for (const item of sec.items) {
        if (!seen.has(item.to) && isRoutePinnableForUser(item.to, me, can)) {
          seen.add(item.to)
          out.push({ label: item.label, to: item.to, group: sec.label })
        }
      }
    }
    if (!seen.has('/customise-ui') && isRoutePinnableForUser('/customise-ui', me, can)) {
      out.push({ label: 'Customise UI Studio', to: '/customise-ui', group: 'Personal' })
    }
    return out
  }, [me, can, permittedApps])

  const currentFullRoute = loc.pathname + (loc.search || '')
  const currentNavHit = findNav(loc.pathname)
  const currentRouteLabel =
    currentNavHit?.item.label ||
    (loc.pathname === '/home'
      ? 'Home Launcher'
      : loc.pathname === '/customise-ui'
        ? 'Customise UI'
        : loc.pathname.split('/').filter(Boolean).pop()?.replace(/[-_]/g, ' ') || 'Current Page')
  const canPinCurrent = isRoutePinnableForUser(currentFullRoute, me, can)
  const currentAlreadyPinned = ui.isPinned(currentFullRoute)

  const handleExportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      source: 'SWK OS Customise UI',
      theme: {
        presetId: ui.prefs.presetId,
        mode: ui.prefs.mode,
        colors: ui.prefs.colors,
        typography: ui.prefs.typography,
        layout: ui.prefs.layout,
        highlight: ui.prefs.highlight,
      },
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `swk-ui-theme-${ui.prefs.presetId || 'custom'}.json`
    document.body.append(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  const onPinDragStart = (idx: number, e: DragEvent) => {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }
  const onPinDrop = (targetIdx: number, e: DragEvent) => {
    e.preventDefault()
    const from = dragIdx ?? Number(e.dataTransfer.getData('text/plain'))
    if (Number.isFinite(from) && from !== targetIdx) ui.reorderPins(from, targetIdx)
    setDragIdx(null)
  }

  const tabs: Array<{ id: TabKey; label: string; icon: typeof Palette }> = [
    { id: 'colors', label: 'Colors', icon: Palette },
    { id: 'fonts', label: 'Fonts & Size', icon: Type },
    { id: 'highlight', label: 'Highlight', icon: Sparkles },
    { id: 'pins', label: 'Pins & Drag', icon: Pin },
    { id: 'save', label: 'Save & Sync', icon: Save },
  ]

  return (
    <div className="space-y-4 text-[#0a0b0e]">
      {/* Tab Switcher */}
      <div
        role="tablist"
        aria-label="Customise UI sections"
        className="flex flex-wrap gap-1.5 rounded-2xl border border-black/10 bg-[#f6f4ef] p-1.5"
      >
        {tabs.map(t => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`inline-flex flex-1 min-w-[78px] items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-[11.5px] font-bold transition-all cursor-pointer border-0 ${
                active
                  ? 'bg-[#0a0b0e] text-[#ebc97c] shadow-sm'
                  : 'bg-transparent text-[#3f4450] hover:bg-white hover:text-[#0a0b0e]'
              }`}
            >
              <t.icon size={13} />
              <span className="truncate">{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* ================================================= TAB 1: COLORS & THEMES */}
      {tab === 'colors' && (
        <div className="space-y-4">
          {/* Quick Mode + Auto Contrast */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-black/10 bg-[#faf9f6] p-3">
            <div className="flex items-center gap-1.5">
              {(['light', 'dark', 'custom'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => ui.setMode(m)}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] border cursor-pointer ${
                    ui.prefs.mode === m
                      ? 'bg-[#0a0b0e] text-[#ebc97c] border-[#d4a955]'
                      : 'bg-white text-[#3f4450] border-black/10 hover:border-black/30'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={ui.autoFixContrast}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#d4a955]/60 bg-[#fbf6ea] px-3 py-1 text-[11px] font-bold text-[#7c5615] cursor-pointer hover:bg-[#d4a955] hover:text-[#0a0b0e]"
            >
              <Wand2 size={12} /> Auto-Fix Text Contrast
            </button>
          </div>

          {/* 6 Curated Presets */}
          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#5c6270]">
              1-Click Luxury Presets
            </div>
            <div className={`grid gap-2 ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
              {UI_PRESETS.map(p => {
                const selected = ui.prefs.presetId === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => ui.applyPreset(p.id)}
                    className={`flex items-center justify-between gap-3 rounded-2xl border p-3 text-left transition-all cursor-pointer ${
                      selected
                        ? 'border-[#d4a955] bg-[#fbf6ea] ring-2 ring-[#d4a955]/40'
                        : 'border-black/10 bg-white hover:border-[#d4a955]/60'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[#0a0b0e]">
                        <span className="truncate">{p.name}</span>
                        {selected && <Check size={13} className="text-[#1e6b43] shrink-0" />}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#5c6270] line-clamp-1">{p.tagline}</div>
                    </div>
                    <div className="flex items-center -space-x-1 shrink-0">
                      {p.swatches.map((hex, i) => (
                        <span
                          key={i}
                          className="inline-block size-5 rounded-full border border-black/20 shadow-xs"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Background Style */}
          <div className="rounded-2xl border border-black/10 bg-[#faf9f6] p-3 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#5c6270]">
              Background Finish
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ['solid', 'Solid Clean'],
                  ['gradient', 'Smooth Gradient'],
                  ['mesh', 'Luxury Glow'],
                ] as const
              ).map(([val, lbl]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => ui.updateColors({ bgStyle: val })}
                  className={`rounded-xl border px-2 py-2 text-[11.5px] font-bold cursor-pointer ${
                    ui.prefs.colors.bgStyle === val
                      ? 'bg-[#0a0b0e] text-[#ebc97c] border-[#d4a955]'
                      : 'bg-white text-[#3f4450] border-black/10'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Detailed Color Pickers */}
          {COLOR_GROUPS.map(group => (
            <div key={group.title} className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#5c6270]">
                {group.title}
              </div>
              <div className={`grid gap-2 ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
                {group.fields.map(f => (
                  <ColorPickerRow
                    key={f.key}
                    label={f.label}
                    value={ui.prefs.colors[f.key]}
                    onChange={hex => ui.updateColors({ [f.key]: hex })}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ================================================= TAB 2: FONTS & SIZE */}
      {tab === 'fonts' && (
        <div className="space-y-4">
          <div className="space-y-2.5 rounded-2xl border border-black/10 bg-[#faf9f6] p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#5c6270]">
              Font Family &amp; Typeface (100% Offline)
            </div>
            {(
              [
                ['headingFont', 'Heading & Title Font'],
                ['bodyFont', 'Main Body & Menu Font'],
                ['monoFont', 'Numbers, Prices & Code Font'],
              ] as const
            ).map(([field, label]) => (
              <label key={field} className="block space-y-1">
                <span className="text-xs font-semibold text-[#2d3139]">{label}</span>
                <select
                  value={ui.prefs.typography[field]}
                  aria-label={label}
                  onChange={e => ui.updateTypography({ [field]: e.target.value })}
                  className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-xs font-semibold text-[#0a0b0e]"
                >
                  {UI_FONT_CATALOG.map(f => (
                    <option key={f.key} value={f.key}>
                      {f.label} — {f.sample}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {/* Font Size & Heading Scale */}
          <div className="space-y-3 rounded-2xl border border-black/10 bg-white p-3.5">
            <div>
              <div className="flex items-center justify-between text-xs font-semibold">
                <span>Base Font Size</span>
                <span className="font-mono font-bold text-[#8f6720]">{ui.prefs.typography.fontSizePx}px</span>
              </div>
              <input
                type="range"
                min={12}
                max={20}
                step={1}
                aria-label="Base Font Size"
                value={ui.prefs.typography.fontSizePx}
                onChange={e => ui.updateTypography({ fontSizePx: Number(e.target.value) })}
                className="mt-1.5 w-full accent-[#d4a955]"
              />
              <div className="mt-1.5 flex gap-1.5">
                {[
                  ['Small', 13],
                  ['Default', 15],
                  ['Large', 17],
                  ['XL', 19],
                ].map(([lbl, px]) => (
                  <button
                    key={String(lbl)}
                    type="button"
                    onClick={() => ui.updateTypography({ fontSizePx: Number(px) })}
                    className={`flex-1 rounded-lg border py-1 text-[11px] font-bold cursor-pointer ${
                      ui.prefs.typography.fontSizePx === px
                        ? 'bg-[#0a0b0e] text-[#ebc97c] border-[#d4a955]'
                        : 'bg-[#faf9f6] text-[#3f4450] border-black/10'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold">
                <span>Heading Size Scale</span>
                <span className="font-mono font-bold text-[#8f6720]">
                  {Math.round(ui.prefs.typography.headingScale * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={85}
                max={130}
                step={5}
                aria-label="Heading Size Scale"
                value={Math.round(ui.prefs.typography.headingScale * 100)}
                onChange={e => ui.updateTypography({ headingScale: Number(e.target.value) / 100 })}
                className="mt-1.5 w-full accent-[#d4a955]"
              />
            </div>
          </div>

          {/* Font Weight, Style, Letter Spacing & Uppercase */}
          <div className="space-y-3 rounded-2xl border border-black/10 bg-[#faf9f6] p-3.5">
            <div>
              <div className="mb-1.5 text-xs font-semibold">Font Weight</div>
              <div className="grid grid-cols-4 gap-1.5">
                {(
                  [
                    ['400', 'Regular'],
                    ['500', 'Medium'],
                    ['600', 'SemiBold'],
                    ['700', 'Bold'],
                  ] as const
                ).map(([w, lbl]) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => ui.updateTypography({ fontWeight: w })}
                    className={`rounded-xl border py-1.5 text-[11px] font-bold cursor-pointer ${
                      ui.prefs.typography.fontWeight === w
                        ? 'bg-[#0a0b0e] text-[#ebc97c] border-[#d4a955]'
                        : 'bg-white text-[#3f4450] border-black/10'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <div className="mb-1 text-xs font-semibold">Font Style</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['normal', 'italic'] as const).map(st => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => ui.updateTypography({ fontStyle: st })}
                      className={`rounded-xl border py-1.5 text-[11.5px] font-bold capitalize cursor-pointer ${
                        st === 'italic' ? 'italic' : ''
                      } ${
                        ui.prefs.typography.fontStyle === st
                          ? 'bg-[#0a0b0e] text-[#ebc97c] border-[#d4a955]'
                          : 'bg-white text-[#3f4450] border-black/10'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold">Letter Spacing</div>
                <div className="grid grid-cols-3 gap-1">
                  {(['tight', 'normal', 'wide'] as const).map(sp => (
                    <button
                      key={sp}
                      type="button"
                      onClick={() => ui.updateTypography({ letterSpacing: sp })}
                      className={`rounded-xl border py-1.5 text-[10.5px] font-bold capitalize cursor-pointer ${
                        ui.prefs.typography.letterSpacing === sp
                          ? 'bg-[#0a0b0e] text-[#ebc97c] border-[#d4a955]'
                          : 'bg-white text-[#3f4450] border-black/10'
                      }`}
                    >
                      {sp}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <label className="flex items-center justify-between gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-semibold cursor-pointer">
              <span>Uppercase Section Headings</span>
              <input
                type="checkbox"
                checked={ui.prefs.typography.uppercaseHeadings}
                onChange={e => ui.updateTypography({ uppercaseHeadings: e.target.checked })}
                className="size-4 accent-[#d4a955]"
              />
            </label>
          </div>

          {/* Layout Density, Radius & Shadow */}
          <div className="space-y-3 rounded-2xl border border-black/10 bg-white p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#5c6270]">
              Spacing, Card Shape &amp; Depth
            </div>
            <div>
              <div className="mb-1.5 text-xs font-semibold">UI Spacing Density</div>
              <div className="grid grid-cols-3 gap-1.5">
                {(['compact', 'comfortable', 'spacious'] as const).map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => ui.updateLayout({ density: d })}
                    className={`rounded-xl border py-1.5 text-[11.5px] font-bold capitalize cursor-pointer ${
                      ui.prefs.layout.density === d
                        ? 'bg-[#0a0b0e] text-[#ebc97c] border-[#d4a955]'
                        : 'bg-[#faf9f6] text-[#3f4450] border-black/10'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs font-semibold">
                <span>Card Corner Roundness</span>
                <span className="font-mono font-bold text-[#8f6720]">{ui.prefs.layout.cardRadiusPx}px</span>
              </div>
              <input
                type="range"
                min={8}
                max={32}
                step={2}
                aria-label="Card Corner Roundness"
                value={ui.prefs.layout.cardRadiusPx}
                onChange={e => ui.updateLayout({ cardRadiusPx: Number(e.target.value) })}
                className="mt-1.5 w-full accent-[#d4a955]"
              />
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ['none', 'Flat'],
                  ['soft', 'Soft Shadow'],
                  ['elevated', 'Floating 3D'],
                ] as const
              ).map(([sh, lbl]) => (
                <button
                  key={sh}
                  type="button"
                  onClick={() => ui.updateLayout({ shadowStrength: sh })}
                  className={`rounded-xl border py-1.5 text-[11px] font-bold cursor-pointer ${
                    ui.prefs.layout.shadowStrength === sh
                      ? 'bg-[#0a0b0e] text-[#ebc97c] border-[#d4a955]'
                      : 'bg-[#faf9f6] text-[#3f4450] border-black/10'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
            <label className="flex items-center justify-between gap-2 rounded-xl border border-black/10 bg-[#faf9f6] px-3 py-2 text-xs font-semibold cursor-pointer">
              <span>Show Subtle SWK Logo Watermark</span>
              <input
                type="checkbox"
                checked={ui.prefs.layout.showWatermark}
                onChange={e => ui.updateLayout({ showWatermark: e.target.checked })}
                className="size-4 accent-[#d4a955]"
              />
            </label>
          </div>
        </div>
      )}

      {/* ================================================= TAB 3: HIGHLIGHT FEATURE */}
      {tab === 'highlight' && (
        <div className="space-y-4">
          <div className="space-y-3 rounded-2xl border border-black/10 bg-[#faf9f6] p-3.5">
            <label className="flex items-center justify-between gap-2 text-xs font-bold cursor-pointer">
              <span>Enable Highlight Feature Across UI</span>
              <input
                type="checkbox"
                checked={ui.prefs.highlight.enabled}
                onChange={e => ui.updateHighlight({ enabled: e.target.checked })}
                className="size-4 accent-[#d4a955]"
              />
            </label>

            <div>
              <div className="mb-1.5 text-xs font-semibold">Highlight Glow Intensity</div>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ['off', 'Off'],
                    ['subtle', 'Subtle Glow'],
                    ['vivid', 'Vivid Spotlight'],
                  ] as const
                ).map(([lvl, lbl]) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => ui.updateHighlight({ enabled: lvl !== 'off', intensity: lvl })}
                    className={`rounded-xl border py-2 text-[11px] font-bold cursor-pointer ${
                      ui.prefs.highlight.intensity === lvl
                        ? 'bg-[#0a0b0e] text-[#ebc97c] border-[#d4a955]'
                        : 'bg-white text-[#3f4450] border-black/10'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-xs font-semibold">Quick Highlight Color Swatches</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {HIGHLIGHT_SWATCHES.map(sw => (
                  <button
                    key={sw.name}
                    type="button"
                    onClick={() => ui.updateColors({ highlightColor: sw.color, highlightBg: sw.bg, accentColor: sw.color })}
                    className="flex items-center gap-2 rounded-xl border border-black/10 bg-white px-2.5 py-2 text-left text-[11px] font-semibold cursor-pointer hover:border-[#0a0b0e]"
                  >
                    <span className="size-4 rounded-full shrink-0 border border-black/20" style={{ backgroundColor: sw.color }} />
                    <span className="truncate">{sw.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <ColorPickerRow
                label="Highlight Border / Glow"
                value={ui.prefs.colors.highlightColor}
                onChange={hex => ui.updateColors({ highlightColor: hex })}
              />
              <ColorPickerRow
                label="Highlight Tint Fill"
                value={ui.prefs.colors.highlightBg}
                onChange={hex => ui.updateColors({ highlightBg: hex })}
              />
            </div>

            <label className="flex items-center justify-between gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-semibold cursor-pointer">
              <span>Shimmer Light Sweep on Hover Buttons</span>
              <input
                type="checkbox"
                checked={ui.prefs.highlight.buttonShimmer}
                onChange={e => ui.updateHighlight({ buttonShimmer: e.target.checked })}
                className="size-4 accent-[#d4a955]"
              />
            </label>
            <label className="flex items-center justify-between gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-semibold cursor-pointer">
              <span>Active Card &amp; Link Spotlight Ring</span>
              <input
                type="checkbox"
                checked={ui.prefs.highlight.focusRingGlow}
                onChange={e => ui.updateHighlight({ focusRingGlow: e.target.checked })}
                className="size-4 accent-[#d4a955]"
              />
            </label>
          </div>

          {/* Highlight Important Apps on Home */}
          {permittedApps.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-black/10 bg-white p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#5c6270]">
                  Highlight Priority Apps on Home
                </span>
                <span className="font-mono text-[11px] font-bold text-[#8f6720]">
                  {ui.prefs.pinning.highlightedAppKeys.length} starred
                </span>
              </div>
              <p className="m-0 text-[11.5px] text-[#5c6270]">
                Star your VIP modules so they glow with a highlight border on your Home Launcher (personal to your account).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[240px] overflow-y-auto pr-1">
                {permittedApps.map(app => {
                  const starred = ui.prefs.pinning.highlightedAppKeys.includes(app.key)
                  return (
                    <button
                      key={app.key}
                      type="button"
                      onClick={() => ui.toggleAppHighlight(app.key)}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold cursor-pointer transition-all ${
                        starred
                          ? 'border-[#d4a955] bg-[#fbf6ea] text-[#0a0b0e]'
                          : 'border-black/10 bg-white text-[#3f4450] hover:border-black/25'
                      }`}
                    >
                      <span className="truncate">{app.label}</span>
                      <Star
                        size={14}
                        className={starred ? 'fill-[#d4a955] text-[#d4a955] shrink-0' : 'text-[#94a3b8] shrink-0'}
                      />
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================= TAB 4: PINS & DRAG */}
      {tab === 'pins' && (
        <div className="space-y-4">
          {/* Dockable Pinned Bar Position */}
          <div className="space-y-2 rounded-2xl border border-black/10 bg-[#faf9f6] p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#5c6270]">
              Pinned Quick-Launch Bar Placement
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {DOCK_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => ui.setDockPosition(opt.value)}
                  className={`rounded-xl border px-2.5 py-2 text-left cursor-pointer transition-all ${
                    ui.prefs.pinning.dockPosition === opt.value
                      ? 'bg-[#0a0b0e] text-[#ebc97c] border-[#d4a955]'
                      : 'bg-white text-[#2d3139] border-black/10 hover:border-black/30'
                  }`}
                >
                  <div className="text-xs font-bold">{opt.label}</div>
                  <div className="text-[10px] opacity-75">{opt.hint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Draggable Floating Quick-Pad */}
          <div className="space-y-2.5 rounded-2xl border border-black/10 bg-white p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Move size={15} className="text-[#8f6720]" />
                <div>
                  <div className="text-xs font-bold">Draggable Floating Quick-Pad</div>
                  <div className="text-[11px] text-[#5c6270]">
                    Drag anywhere on screen — stays put on reload ({Math.round(ui.prefs.pinning.floatingPad.xPct)}%,{' '}
                    {Math.round(ui.prefs.pinning.floatingPad.yPct)}%)
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                aria-label="Enable Draggable Floating Quick-Pad"
                checked={ui.prefs.pinning.floatingPad.enabled}
                onChange={e => ui.updateFloatingPad({ enabled: e.target.checked, collapsed: false })}
                className="size-4 accent-[#d4a955] cursor-pointer"
              />
            </div>
            {ui.prefs.pinning.floatingPad.enabled && (
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => ui.updateFloatingPad({ xPct: 82, yPct: 72, collapsed: false })}
                  className="rounded-lg border border-black/15 bg-[#faf9f6] px-2.5 py-1 text-[11px] font-semibold cursor-pointer hover:border-[#0a0b0e]"
                >
                  Reset Pad Position
                </button>
                <button
                  type="button"
                  onClick={() => ui.updateFloatingPad({ collapsed: !ui.prefs.pinning.floatingPad.collapsed })}
                  className="rounded-lg border border-black/15 bg-[#faf9f6] px-2.5 py-1 text-[11px] font-semibold cursor-pointer hover:border-[#0a0b0e]"
                >
                  {ui.prefs.pinning.floatingPad.collapsed ? 'Expand Pad' : 'Collapse to Orb'}
                </button>
              </div>
            )}
          </div>

          {/* Add Pins */}
          <div className="space-y-2.5 rounded-2xl border border-black/10 bg-[#faf9f6] p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#5c6270]">
              Pin Important Options ({ui.prefs.pinning.pinnedItems.length}/24)
            </div>
            {canPinCurrent && (
              <button
                type="button"
                onClick={() =>
                  ui.togglePinItem({
                    id: currentFullRoute,
                    label: currentRouteLabel,
                    to: currentFullRoute,
                    highlighted: false,
                  })
                }
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0a0b0e] px-3 py-2.5 text-xs font-bold text-[#ebc97c] border border-[#d4a955]/60 cursor-pointer hover:opacity-95"
              >
                <Pin size={14} />
                {currentAlreadyPinned ? `Unpin "${currentRouteLabel}"` : `+ Pin Current Page (${currentRouteLabel})`}
              </button>
            )}

            <div className="flex gap-1.5">
              <select
                value={quickPick}
                aria-label="Choose a page or app to pin"
                onChange={e => setQuickPick(e.target.value)}
                className="flex-1 min-w-0 rounded-xl border border-black/15 bg-white px-2.5 py-2 text-xs font-medium text-[#0a0b0e]"
              >
                <option value="">Select any app or page to pin…</option>
                {allPinnableOptions.map(opt => (
                  <option key={opt.to} value={opt.to}>
                    [{opt.group}] {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!quickPick}
                onClick={() => {
                  const found = allPinnableOptions.find(o => o.to === quickPick)
                  if (!found) return
                  if (!ui.isPinned(found.to)) {
                    ui.togglePinItem({ id: found.to, label: found.label, to: found.to, highlighted: false })
                  }
                  setQuickPick('')
                }}
                className="inline-flex items-center gap-1 rounded-xl bg-[#0a0b0e] px-3 py-2 text-xs font-bold text-white border-0 cursor-pointer disabled:opacity-40"
              >
                <Plus size={14} /> Pin
              </button>
            </div>
          </div>

          {/* Drag-to-Reorder Pinned List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.14em] text-[#5c6270]">
              <span>Drag to Reorder Pinned Shortcuts</span>
              {ui.prefs.pinning.appOrder.length > 0 && (
                <button
                  type="button"
                  onClick={ui.resetAppOrder}
                  className="text-[11px] font-bold text-[#96202f] underline bg-transparent border-0 cursor-pointer"
                >
                  Reset Home Grid Order
                </button>
              )}
            </div>
            {ui.prefs.pinning.pinnedItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-black/15 bg-white p-4 text-center text-xs text-[#5c6270]">
                No pinned items yet. Pin your current page or select an app above — then drag them into any order or onto the screen!
              </div>
            ) : (
              <ul className="m-0 list-none space-y-1.5 p-0">
                {ui.prefs.pinning.pinnedItems.map((item, idx) => (
                  <li
                    key={item.id}
                    draggable
                    onDragStart={e => onPinDragStart(idx, e)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => onPinDrop(idx, e)}
                    onDragEnd={() => setDragIdx(null)}
                    className={`flex items-center gap-2 rounded-xl border bg-white px-2.5 py-2 text-xs transition-all ${
                      item.highlighted ? 'border-[#d4a955] bg-[#fbf6ea]' : 'border-black/10'
                    } ${dragIdx === idx ? 'opacity-50' : ''}`}
                  >
                    <GripVertical size={14} className="text-[#94a3b8] cursor-grab shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-[#0a0b0e] truncate">{item.label}</div>
                      <div className="font-mono text-[10px] text-[#5c6270] truncate">{item.to}</div>
                    </div>
                    <button
                      type="button"
                      title={item.highlighted ? 'Remove highlight star' : 'Highlight this shortcut'}
                      aria-label={`Highlight ${item.label}`}
                      onClick={() => ui.togglePinHighlight(item.id)}
                      className="grid size-7 place-items-center rounded-lg border border-black/10 bg-white cursor-pointer"
                    >
                      <Star size={13} className={item.highlighted ? 'fill-[#d4a955] text-[#d4a955]' : 'text-[#94a3b8]'} />
                    </button>
                    <button
                      type="button"
                      disabled={idx === 0}
                      aria-label={`Move ${item.label} up`}
                      onClick={() => ui.reorderPins(idx, idx - 1)}
                      className="grid size-7 place-items-center rounded-lg border border-black/10 bg-white cursor-pointer disabled:opacity-30"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      disabled={idx === ui.prefs.pinning.pinnedItems.length - 1}
                      aria-label={`Move ${item.label} down`}
                      onClick={() => ui.reorderPins(idx, idx + 1)}
                      className="grid size-7 place-items-center rounded-lg border border-black/10 bg-white cursor-pointer disabled:opacity-30"
                    >
                      <ArrowDown size={12} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove pin ${item.label}`}
                      onClick={() => ui.removePin(item.id)}
                      className="grid size-7 place-items-center rounded-lg border border-black/10 bg-white text-[#96202f] cursor-pointer hover:bg-[#fef2f2]"
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ================================================= TAB 5: SAVE, SYNC & COMPANY DEFAULT */}
      {tab === 'save' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-black/10 bg-[#faf9f6] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold">Account Sync Status</div>
                <div className="text-[11.5px] text-[#5c6270]">
                  {ui.hasPersonalTheme
                    ? 'Using your personal custom theme (auto-synced across web & mobile)'
                    : ui.hasCompanyDefault
                      ? 'Inheriting SWK Company Default set by Owner Shabib'
                      : 'Using SWK Signature White & Obsidian default'}
                </div>
              </div>
              {ui.saving && <span className="font-mono text-[10.5px] font-bold text-[#8f6720]">Saving…</span>}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void ui.saveNow()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0a0b0e] px-3.5 py-2.5 text-xs font-bold text-[#ebc97c] border border-[#d4a955]/60 cursor-pointer"
              >
                <Save size={14} /> Save &amp; Sync Now
              </button>
              <button
                type="button"
                disabled={!ui.canUndo}
                onClick={ui.undoTheme}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-black/15 bg-white px-3 py-2.5 text-xs font-bold text-[#0a0b0e] cursor-pointer disabled:opacity-40"
              >
                <Undo2 size={14} /> Undo
              </button>
            </div>
          </div>

          {/* Export / Import Preset JSON */}
          <div className="rounded-2xl border border-black/10 bg-white p-4 space-y-2.5">
            <div className="text-xs font-bold">Share or Backup Theme Preset</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleExportJson}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-black/15 bg-[#faf9f6] px-3 py-2 text-xs font-bold text-[#0a0b0e] cursor-pointer hover:border-[#0a0b0e]"
              >
                <Download size={13} /> Export JSON
              </button>
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-black/15 bg-[#faf9f6] px-3 py-2 text-xs font-bold text-[#0a0b0e] cursor-pointer hover:border-[#0a0b0e]"
              >
                <Upload size={13} /> Import JSON
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={async e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const text = await file.text()
                  ui.importThemeJson(text)
                  e.target.value = ''
                }}
              />
            </div>
          </div>

          {/* Owner Company Default Controls */}
          {ui.isOwner && (
            <div className="rounded-2xl border border-[#d4a955]/60 bg-[#0a0b0e] p-4 text-white space-y-3">
              <div className="flex items-center gap-2 text-[#ebc97c]">
                <Crown size={16} />
                <span className="text-xs font-bold uppercase tracking-[0.12em]">Owner Control · Company Default</span>
              </div>
              <p className="m-0 text-[11.5px] text-white/75 leading-relaxed">
                Push your current colors, fonts, sizes &amp; highlight style as the default look for all SWK staff. Personal pinned shortcuts and starred apps stay private to each user.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void ui.applyAsCompanyDefault()}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#d4a955] px-3.5 py-2.5 text-xs font-bold text-[#0a0b0e] border-0 cursor-pointer hover:bg-[#ebc97c]"
                >
                  <Crown size={14} /> Apply as Company Default
                </button>
                {ui.hasCompanyDefault && (
                  <button
                    type="button"
                    onClick={() => void ui.clearCompanyDefault()}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-3 py-2.5 text-xs font-bold text-white cursor-pointer hover:bg-white/20"
                  >
                    Clear Default
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Reset Controls */}
          <div className="rounded-2xl border border-[#96202f]/25 bg-[#fef2f2]/60 p-4 space-y-2.5">
            <div className="text-xs font-bold text-[#96202f]">Reset Options</div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void ui.resetThemeToCompanyDefault()}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-black/15 bg-white px-3 py-2 text-xs font-bold text-[#0a0b0e] cursor-pointer hover:border-[#0a0b0e]"
              >
                <RotateCcw size={13} /> Reset Theme to {ui.hasCompanyDefault ? 'Company Default' : 'SWK Default'} (Keep Pins)
              </button>
              <button
                type="button"
                onClick={() => void ui.resetAllPreferences()}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#96202f]/40 bg-[#96202f] px-3 py-2 text-xs font-bold text-white cursor-pointer hover:opacity-95"
              >
                <Trash2 size={13} /> Reset Everything (Theme + Pins + Layout)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
