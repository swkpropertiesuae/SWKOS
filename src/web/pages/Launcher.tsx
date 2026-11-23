import { useEffect, useMemo, useState, type PointerEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  CalendarCheck,
  Clock3,
  LayoutDashboard,
  LineChart,
  MapPin,
  Navigation,
  QrCode,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react'
import { useMeta } from '../lib/meta'
import { get } from '../lib/api'
import { launcherApps, recentItems, type LauncherApp } from '../swk/nav'
import { aed, num } from '../swk/ui'
import { isRestrictedStaffUser } from '@shared/swk-staff-access'

const ease = [0.22, 1, 0.36, 1] as const
let entrancePlayed = false

const PHOTOS = [
  'marina-sky-penthouse-1',
  'palm-garden-homes-1',
  'hills-estate-golf-mansion-1',
  'business-bay-executive-tower-2',
  'creek-harbour-waterside-townhouse-1',
  'jvc-boulevard-residences-2',
]
const photoFor = (id: number) => `/media/properties/${PHOTOS[Math.abs(id) % PHOTOS.length]}.webp`

function dubaiHour() {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', hour12: false }).format(new Date()))
}
function greeting() {
  const h = dubaiHour()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}
const todayLabel = () =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())

const CATEGORY_FILTERS: { id: string; label: string; keys: string[] }[] = [
  { id: 'all', label: 'All Apps', keys: [] },
  { id: 'core', label: 'Core Ops', keys: ['command', 'messages', 'work'] },
  { id: 'deals', label: 'Sales & CRM', keys: ['clients', 'sales', 'inventory', 'website'] },
  { id: 'leasing', label: 'Leasing & Owners', keys: ['leasing', 'owners'] },
  { id: 'finance', label: 'Finance & Legal', keys: ['finance', 'compliance', 'admin'] },
  { id: 'field', label: 'Team & Field', keys: ['team', 'field', 'attendance', 'tools', 'market_pulse', 'general'] },
]

const TONE_ACCENT: Record<string, { bg: string; fg: string; pill: string }> = {
  navy: { bg: '#eff6ff', fg: '#1d4ed8', pill: 'bg-[#eff6ff] text-[#1d4ed8]' },
  champ: { bg: '#fef7e6', fg: '#92400e', pill: 'bg-[#fef7e6] text-[#92400e]' },
  oasis: { bg: '#ecfdf5', fg: '#047857', pill: 'bg-[#ecfdf5] text-[#047857]' },
  ocean: { bg: '#f0f9ff', fg: '#0369a1', pill: 'bg-[#f0f9ff] text-[#0369a1]' },
  dune: { bg: '#fef2f2', fg: '#b91c1c', pill: 'bg-[#fef2f2] text-[#b91c1c]' },
  plum: { bg: '#f5f3ff', fg: '#6d28d9', pill: 'bg-[#f5f3ff] text-[#6d28d9]' },
}

/** Tactile 21st.dev spotlight app tile — zero negative edge bleed, guaranteed contrast. */
function AppCard({ app, badge }: { app: LauncherApp; badge?: ReactNode }) {
  const [imgErr, setImgErr] = useState(false)
  const accent = TONE_ACCENT[app.tone] ?? TONE_ACCENT.navy
  const onMove = (e: PointerEvent<HTMLAnchorElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
  }
  return (
    <Link
      to={app.landing}
      onPointerMove={onMove}
      title={app.blurb}
      className="group relative flex h-full items-center gap-3.5 overflow-hidden rounded-[26px] border border-[#e5e8f2] bg-white/95 p-4 no-underline shadow-[0_14px_36px_-22px_rgba(15,23,42,0.12)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#0f172a]/35 hover:shadow-[0_18px_40px_-20px_rgba(15,23,42,0.18)]"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_180px_at_var(--mx)_var(--my),rgba(212,167,82,0.14),transparent_72%)]"
      />
      <div
        className="relative z-10 flex size-[50px] shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-[1.05]"
        style={{ background: accent.bg, color: accent.fg }}
      >
        {!imgErr ? (
          <img
            src={`/brand/apps/${app.key}.svg`}
            alt=""
            width={44}
            height={44}
            className="size-[44px] rounded-xl object-contain"
            onError={() => setImgErr(true)}
          />
        ) : (
          <app.icon size={22} />
        )}
      </div>
      <span className="relative z-10 flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold tracking-[-0.02em] text-[#0b1f2a] transition-colors group-hover:text-[#2563eb]">
            {app.label}
          </span>
          {badge}
        </span>
        <span className="line-clamp-1 text-[12.5px] text-[#526273]">{app.blurb}</span>
        {app.items.length > 1 && (
          <span className="mt-1 inline-flex items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${accent.pill}`}>
              {app.items.length} workflow steps
            </span>
          </span>
        )}
      </span>
      <ArrowUpRight
        size={16}
        aria-hidden
        className="relative z-10 shrink-0 text-[#94a3b8] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#0b1f2a]"
      />
    </Link>
  )
}

export function Launcher() {
  const { me, can } = useMeta()
  const nav = useNavigate()
  const reduce = useReducedMotion()
  const [animate] = useState(() => !entrancePlayed)
  useEffect(() => {
    entrancePlayed = true
  }, [])

  const [query, setQuery] = useState('')
  const [cat, setCat] = useState('all')
  const isStaff = Boolean(me?.id && !me?.party_id)
  const restricted = isRestrictedStaffUser(me)

  const apps = useMemo(() => launcherApps(can, me), [can, me])
  const recents = useMemo(() => recentItems(can, 4, me), [can, me])
  const lastVisit = recents[0] ?? null

  const unread =
    useQuery({
      queryKey: ['chat-unread'],
      enabled: isStaff,
      queryFn: () => get<{ unread: number }>('/api/chat/unread'),
      refetchInterval: 30000,
    }).data?.unread ?? 0

  const dashQ = useQuery({
    queryKey: ['launcher-dash'],
    enabled: isStaff && !restricted,
    queryFn: () => get<any>('/api/dashboard'),
    staleTime: 60000,
  })
  const propsQ = useQuery({
    queryKey: ['launcher-props'],
    enabled: isStaff && !restricted && can('properties', 'view'),
    queryFn: () => get<any>('/api/e/properties', { pageSize: 4, sort: 'listed_date', dir: 'desc' }),
    staleTime: 60000,
  })

  const needle = query.trim().toLocaleLowerCase()
  const activeCat = CATEGORY_FILTERS.find(c => c.id === cat) ?? CATEGORY_FILTERS[0]!
  const shownApps = apps.filter(a => {
    const matchText = !needle || a.label.toLocaleLowerCase().includes(needle) || a.blurb.toLocaleLowerCase().includes(needle)
    const matchCat = Boolean(needle) || cat === 'all' || activeCat.keys.includes(a.key)
    return matchText && matchCat
  })
  const features = needle
    ? apps
        .flatMap(a => a.items.map(i => ({ ...i, app: a.label })))
        .filter(i => i.label.toLocaleLowerCase().includes(needle) || (i.desc ?? '').toLocaleLowerCase().includes(needle))
    : []

  const firstName = (me?.name || '').split(' ')[0]
  const openFirst = () => {
    const target = features[0]?.to ?? shownApps[0]?.landing
    if (target) nav(target)
  }

  const kpis = dashQ.data?.kpis ?? {}
  const leadCount = Number(kpis.leads_today ?? 0)
  const viewingCount = Number(kpis.viewings_week ?? 0)
  const offerCount = Number(kpis.offers_pending ?? 0)
  const listings: any[] = propsQ.data?.rows ?? []
  const progressPct = Math.min(100, Math.max(24, 35 + leadCount * 6 + viewingCount * 5 + offerCount * 8))

  const container = { hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.025, delayChildren: 0.03 } } }
  const rise = { hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease } } }

  return (
    <div className="mx-auto max-w-[1320px] space-y-6 pb-8">
      {/* Greeting + Signature Dual-Layer Obsidian & White Command Card (@siren.uix + Editorial Productivity) */}
      <motion.section
        className="grid gap-5 lg:grid-cols-12 items-stretch"
        initial={animate ? { opacity: 0, y: 8 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease }}
      >
        <div className="lg:col-span-8 flex flex-col justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#e5e8f2] bg-white/92 px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#6d28d9] shadow-2xs max-w-full">
              <span className="size-1.5 rounded-full bg-[#047857] shrink-0" />
              <span className="truncate">SWK Properties · ORN 51517 · {todayLabel()}</span>
            </div>
            <h1 className="mt-2.5 text-[28px] sm:text-[38px] font-bold tracking-[-0.035em] text-[#0f172a] leading-[1.08]">
              {greeting()}
              {firstName ? `, ${firstName}` : ''}.
            </h1>
            <p className="mt-1.5 mb-0 text-[14.5px] text-[#526273]">
              Let&apos;s make today productive — search any page, continue your last workflow, or launch an app below.
            </p>
          </div>

          {/* Dual-Layer Command Card (Obsidian Top Strip + Crisp White Search & Quick Chips Inside) */}
          <div className="rounded-[28px] bg-gradient-to-br from-[#12161d] via-[#17212b] to-[#0b131a] p-2.5 shadow-[0_20px_48px_-18px_rgba(15,23,42,0.38)]">
            <div className="flex items-center justify-between gap-3 px-3 pt-1.5 pb-3 text-white">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#c5e86c]">
                  {lastVisit ? <lastVisit.icon size={17} /> : <LayoutDashboard size={17} />}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold text-white">
                    {lastVisit ? lastVisit.label : 'Executive Dashboard'}
                  </div>
                  <div className="truncate text-[11px] text-[#94a3b8]">
                    {lastVisit ? `Recently Visited · ${lastVisit.section}` : 'Live Pipeline, Journeys & Analytics'}
                  </div>
                </div>
              </div>
              <Link
                to={lastVisit ? lastVisit.to : '/dashboard'}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white no-underline transition-colors hover:bg-[#c5e86c] hover:border-[#c5e86c] hover:text-[#0f172a]"
              >
                <Clock3 size={12} />
                {lastVisit ? 'Resume' : 'Open'}
              </Link>
            </div>

            <div className="rounded-[20px] bg-white p-3.5 shadow-inner">
              <form className="relative flex items-center gap-2" role="search" onSubmit={e => { e.preventDefault(); openFirst() }}>
                <div className="relative flex-1 min-w-0">
                  <Search size={17} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748b]" />
                  <input
                    type="text"
                    inputMode="search"
                    enterKeyHint="search"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') setQuery('') }}
                    placeholder="Ask anything or search apps & pages…"
                    aria-label="Search apps and features"
                    autoComplete="off"
                    className="h-11 w-full rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] pl-10 pr-10 text-[14.5px] text-[#0b1f2a] outline-none no-focus-outline transition-all placeholder:text-[#64748b] focus:border-[#0b1f2a] focus:bg-white focus:ring-4 focus:ring-[#2563eb]/12"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      aria-label="Clear search"
                      className="absolute right-2.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-[#e2e8f0] text-[#334155] hover:bg-[#0b1f2a] hover:text-white cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <Link
                  to="/utilities/search"
                  title="Advanced Unified Search"
                  className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#eff6ff] text-[#2563eb] no-underline transition-colors hover:bg-[#2563eb] hover:text-white"
                >
                  <SlidersHorizontal size={17} />
                </Link>
              </form>

              {/* Category quick-filter pills right inside the white command deck */}
              <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
                {CATEGORY_FILTERS.map(c => {
                  const active = cat === c.id && !needle
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setQuery(''); setCat(c.id) }}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold border transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#0b1f2a] border-[#0b1f2a] text-white'
                          : 'bg-[#f8fafc] border-[#e2e8f0] text-[#334155] hover:border-[#cbd5e1] hover:bg-[#f1f5f9]'
                      }`}
                    >
                      {c.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right Hero Card: Obsidian Today's Progress Ring (100% consistent with Dashboard Progress Card) */}
        <div className="lg:col-span-4 rounded-[28px] bg-gradient-to-br from-[#12161d] via-[#17212b] to-[#0b131a] p-5 text-white shadow-[0_20px_48px_-18px_rgba(15,23,42,0.42)] flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#c5e86c]">Today&apos;s Pulse</span>
              <h2 className="m-0 mt-0.5 text-[18px] font-bold text-white">Daily Operations</h2>
            </div>
            <Link
              to={restricted ? '/reception-qr' : '/dashboard'}
              className="inline-flex items-center gap-1 rounded-full bg-white/12 px-3 py-1.5 text-[11.5px] font-semibold text-[#c5e86c] no-underline hover:bg-[#c5e86c] hover:text-[#0f172a] transition-colors"
            >
              {restricted ? 'Check-In' : 'Dashboard'} <ArrowRight size={13} />
            </Link>
          </div>

          <div className="flex items-center gap-5">
            <div className="relative flex size-[104px] shrink-0 items-center justify-center">
              <svg width={104} height={104} className="-rotate-90">
                <circle cx={52} cy={52} r={42} stroke="rgba(255,255,255,0.12)" strokeWidth={10} fill="none" />
                <circle
                  cx={52}
                  cy={52}
                  r={42}
                  stroke="#c5e86c"
                  strokeWidth={10}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 42}
                  strokeDashoffset={2 * Math.PI * 42 * (1 - progressPct / 100)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[22px] font-bold text-white leading-none">{progressPct}%</span>
                <span className="mt-0.5 text-[9.5px] uppercase tracking-wider text-[#94a3b8]">Active</span>
              </div>
            </div>

            <div className="flex-1 min-w-0 grid gap-2.5">
              {restricted ? (
                <>
                  <div className="flex items-center justify-between text-xs"><span className="text-[#94a3b8]">Inside Unread</span><b className="text-white text-sm">{unread}</b></div>
                  <div className="flex items-center justify-between text-xs"><span className="text-[#94a3b8]">Permitted Apps</span><b className="text-white text-sm">{apps.length}</b></div>
                  <div className="flex items-center justify-between text-xs"><span className="text-[#94a3b8]">Dubai Timezone</span><b className="text-[#d4a752] text-sm">GST +4</b></div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs"><span className="text-[#94a3b8]">Leads Today</span><b className="text-white text-sm">{leadCount}</b></div>
                  <div className="flex items-center justify-between text-xs"><span className="text-[#94a3b8]">Viewings (7d)</span><b className="text-[#a3e635] text-sm">{viewingCount}</b></div>
                  <div className="flex items-center justify-between text-xs"><span className="text-[#94a3b8]">Pending Offers</span><b className="text-[#d4a752] text-sm">{offerCount}</b></div>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1 border-t border-white/10">
            <Link to="/reception-qr" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11.5px] font-semibold text-white no-underline hover:bg-white/20">
              <QrCode size={13} className="text-[#d4a752]" /> QR Check-In
            </Link>
            <Link to="/chat" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11.5px] font-semibold text-white no-underline hover:bg-white/20">
              <Sparkles size={13} className="text-[#a3e635]" /> Inside {unread > 0 ? `(${unread})` : ''}
            </Link>
            <Link to="/field-duty" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11.5px] font-semibold text-white no-underline hover:bg-white/20">
              <Navigation size={13} className="text-[#38bdf8]" /> Field GPS
            </Link>
          </div>
        </div>
      </motion.section>

      {/* Search Matching Pages */}
      {features.length > 0 && (
        <section aria-label="Matching pages" className="rounded-[22px] border border-[#e2e8f0] bg-white p-3 shadow-[0_8px_28px_-14px_rgba(11,31,42,0.12)]">
          <div className="px-3 pt-1 pb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#8a5f14]">
            Matching Workflow Pages ({features.length})
          </div>
          <ul className="m-0 list-none p-0 grid gap-1 sm:grid-cols-2">
            {features.map(f => (
              <li key={f.to}>
                <Link to={f.to} className="group flex items-center gap-3 rounded-2xl px-3.5 py-2.5 no-underline hover:bg-[#f1f5f9] transition-colors">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#0b1f2a] text-[#d4a752]">
                    <f.icon size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-[14px] font-semibold text-[#0b1f2a] truncate">{f.label}</b>
                    <small className="block text-[12px] text-[#526273] truncate">{f.desc ?? f.app}</small>
                  </span>
                  <span className="rounded-full bg-[#eff6ff] px-2.5 py-0.5 text-[10.5px] font-semibold text-[#1d4ed8] shrink-0">
                    {f.app}
                  </span>
                  <ArrowUpRight size={15} className="text-[#94a3b8] group-hover:text-[#0b1f2a] shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* @siren.uix Inspired Featured Properties Carousel Strip (shown when not filtering) */}
      {!needle && listings.length > 0 && (
        <section aria-label="Featured inventory">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-[18px] font-bold text-[#0b1f2a]">Featured Inventory</h2>
              <span className="rounded-full bg-[#dc2626] px-2 py-0.5 text-[11px] font-bold text-white">
                {listings.length}
              </span>
            </div>
            <Link to="/e/properties" className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#2563eb] no-underline hover:underline">
              See all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {listings.slice(0, 4).map((p: any) => (
              <Link
                key={p.id}
                to={`/e/properties/${p.id}`}
                className="group relative block h-[228px] overflow-hidden rounded-[24px] bg-[#0b1f2a] shadow-[0_14px_34px_-16px_rgba(11,31,42,0.34)] no-underline"
              >
                <div
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-[1.06]"
                  style={{ backgroundImage: `url(${photoFor(p.id)})` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b1f2a]/92 via-[#0b1f2a]/25 to-[#0b1f2a]/15" />
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-[#0b1f2a] backdrop-blur-md">
                    {p.is_off_plan ? 'Off-Plan' : 'Ready'}
                    {p.rera_permit_no && <BadgeCheck size={13} className="text-[#2563eb]" />}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-[#0b1f2a]/70 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
                    {p.bedrooms ? `${p.bedrooms} BR` : 'Studio'} · {num(p.area_sqft)} sqft
                  </span>
                </div>
                <div className="absolute bottom-3.5 left-3.5 right-3.5 text-white">
                  <div className="truncate text-[15.5px] font-bold text-white leading-snug">{p.title}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-[11.5px] text-white/80 truncate">
                    <MapPin size={11} className="text-[#d4a752] shrink-0" />
                    <span className="truncate">{p.address || p.property_type || 'Dubai, UAE'}</span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <div className="text-[16px] font-bold text-[#fef3c7] tabular-nums">
                      {p.price ? aed(p.price, { compact: true }) : p.rent_annual ? `${aed(p.rent_annual, { compact: true })}/yr` : 'On request'}
                    </div>
                    <span className="rounded-full bg-white/20 border border-white/25 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-md transition-colors group-hover:bg-[#d4a752] group-hover:text-[#0b1f2a] group-hover:border-[#d4a752]">
                      Open Deal
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Apps Directory Grid (Exact `section[aria-label="Apps"]` contract preserved for CI!) */}
      {shownApps.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="m-0 text-[18px] font-bold text-[#0b1f2a]">
                {cat === 'all' || needle ? 'SWK Workspace Apps' : activeCat.label}
              </h2>
              <p className="m-0 text-[12.5px] text-[#526273]">
                Every app opens with a step-by-step workflow bar so you never hunt through sidebars.
              </p>
            </div>
            <span className="rounded-full bg-white border border-[#e2e8f0] px-3 py-1 text-[11.5px] font-semibold text-[#334155]">
              {shownApps.length} apps
            </span>
          </div>
          <motion.section
            aria-label="Apps"
            className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
            variants={container}
            initial={animate || needle ? 'hidden' : false}
            animate="show"
            key={`${needle ? 'f' : 'all'}-${cat}`}
          >
            {shownApps.map(a => (
              <motion.div key={a.key} variants={rise} className="h-full">
                <AppCard
                  app={a}
                  badge={
                    a.key === 'messages' && unread > 0 ? (
                      <span
                        className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#dc2626] px-1.5 text-[10.5px] font-bold text-white"
                        aria-label={`${unread} unread messages`}
                      >
                        {unread > 99 ? '99+' : unread}
                      </span>
                    ) : undefined
                  }
                />
              </motion.div>
            ))}
          </motion.section>
        </div>
      )}

      {/* Restricted Staff Highlight Strip when not searching */}
      {!needle && restricted && (
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <Link to="/reception-qr" className="rounded-[22px] bg-gradient-to-br from-[#0b1f2a] to-[#163a4f] p-5 text-white no-underline shadow-md flex items-center gap-3.5">
            <span className="size-12 rounded-2xl bg-white/10 text-[#d4a752] grid place-items-center shrink-0"><QrCode size={22} /></span>
            <div><b className="block text-[15px]">Office QR Check-In</b><span className="text-xs text-[#cbd5e1]">Daily office attendance scan</span></div>
          </Link>
          <Link to="/field-duty" className="rounded-[22px] bg-gradient-to-br from-[#047857] to-[#0e9f6e] p-5 text-white no-underline shadow-md flex items-center gap-3.5">
            <span className="size-12 rounded-2xl bg-white/15 text-white grid place-items-center shrink-0"><CalendarCheck size={22} /></span>
            <div><b className="block text-[15px]">Field Duty GPS</b><span className="text-xs text-white/85">Start property viewing tracking</span></div>
          </Link>
          <Link to="/market" className="rounded-[22px] bg-gradient-to-br from-[#1d4ed8] to-[#2563eb] p-5 text-white no-underline shadow-md flex items-center gap-3.5">
            <span className="size-12 rounded-2xl bg-white/15 text-white grid place-items-center shrink-0"><LineChart size={22} /></span>
            <div><b className="block text-[15px]">Dubai Market Pulse</b><span className="text-xs text-white/85">Live PSF prices &amp; rental yields</span></div>
          </Link>
        </section>
      )}

      {needle && !shownApps.length && !features.length && (
        <div className="rounded-[24px] border border-[#e2e8f0] bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-[#f1f5f9] text-[#526273]">
            <Building2 size={22} />
          </div>
          <b className="text-[16px] text-[#0b1f2a]">No app or page matches “{query.trim()}”</b>
          <p className="mt-1 text-[13.5px] text-[#526273]">Try a simpler word, or press Ctrl + K to search properties, leads, and deals.</p>
          <button type="button" className="btn outline mt-3" onClick={() => setQuery('')}>
            Clear search
          </button>
        </div>
      )}
    </div>
  )
}
