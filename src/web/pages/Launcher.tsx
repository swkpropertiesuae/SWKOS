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
  Crown,
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
import { launcherApps, recentItems, SWK_CORE_SUITE_KEYS, type LauncherApp } from '../swk/nav'
import { aed, num } from '../swk/ui'
import { canAccessShabibsCorner, isRestrictedStaffUser } from '@shared/swk-staff-access'
import { useSipClient } from '../lib/sipClient'

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
  { id: 'core', label: 'Command', keys: ['shabibs_corner', 'command'] },
  { id: 'deals', label: 'Sales & CRM', keys: ['clients', 'sales', 'inventory', 'website'] },
  { id: 'leasing', label: 'Leasing & Owners', keys: ['leasing', 'owners'] },
  { id: 'finance', label: 'Finance & Legal', keys: ['finance', 'compliance', 'admin'] },
  { id: 'field', label: 'Team & Field', keys: ['team', 'field', 'attendance', 'tools', 'market_pulse', 'general'] },
]

const CORE_SUITE_BRANDING: Record<
  string,
  {
    brandName: string
    tagline: string
    iconSrc: string
    cardBg: string
    border: string
    pillBg: string
    pillFg: string
    ctaLabel: string
  }
> = {
  messages: {
    brandName: 'SWK Inside',
    tagline: 'Encrypted team chats, project rooms, broadcasts & instant share',
    iconSrc: '/brand/apps/swk-inside.svg',
    cardBg: 'from-[#063228] via-[#064e3b] to-[#0a1f1c]',
    border: 'border-[#34d399]/35 hover:border-[#f3d27a]/70',
    pillBg: 'bg-[#34d399]/18 border-[#34d399]/35',
    pillFg: 'text-[#a7f3d0]',
    ctaLabel: 'Open SWK Inside',
  },
  work: {
    brandName: 'SWK Work',
    tagline: 'Tasks, projects, team boards, calendars & visual flow automations',
    iconSrc: '/brand/apps/swk-work.svg',
    cardBg: 'from-[#17204d] via-[#1d4ed8] to-[#0f172a]',
    border: 'border-[#60a5fa]/35 hover:border-[#f3d27a]/70',
    pillBg: 'bg-[#60a5fa]/18 border-[#60a5fa]/35',
    pillFg: 'text-[#bfdbfe]',
    ctaLabel: 'Open SWK Work',
  },
  phone: {
    brandName: 'SWK Phone',
    tagline: 'WebRTC SIP dialer, office directory & zero-leak Masked Vault calls',
    iconSrc: '/brand/apps/swk-phone.svg',
    cardBg: 'from-[#420c1d] via-[#9f1239] to-[#1a0b14]',
    border: 'border-[#fb7185]/35 hover:border-[#f3d27a]/70',
    pillBg: 'bg-[#fb7185]/18 border-[#fb7185]/35',
    pillFg: 'text-[#fecdd3]',
    ctaLabel: 'Open SWK Phone',
  },
}

const TONE_ACCENT: Record<string, { bg: string; fg: string; pill: string }> = {
  navy: { bg: '#e8eff4', fg: '#0a1b24', pill: 'bg-[#e8eff4] text-[#0a1b24] dark:bg-[#193446] dark:text-[#e2edf5]' },
  champ: { bg: '#fbf2d8', fg: '#7f5710', pill: 'bg-[#fbf2d8] text-[#7f5710] dark:bg-[#a6761f]/25 dark:text-[#f3d27a]' },
  oasis: { bg: '#e6f6ef', fg: '#03543f', pill: 'bg-[#e6f6ef] text-[#03543f] dark:bg-[#046c4e]/25 dark:text-[#6ee7b7]' },
  ocean: { bg: '#eaf2ff', fg: '#1d4ed8', pill: 'bg-[#eaf2ff] text-[#1d4ed8] dark:bg-[#1d4ed8]/25 dark:text-[#93c5fd]' },
  dune: { bg: '#feecef', fg: '#9f1239', pill: 'bg-[#feecef] text-[#9f1239] dark:bg-[#be123c]/25 dark:text-[#fda4af]' },
  plum: { bg: '#e6f6ef', fg: '#03543f', pill: 'bg-[#e6f6ef] text-[#03543f] dark:bg-[#046c4e]/25 dark:text-[#6ee7b7]' },
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
      className="group relative flex h-full items-center gap-3.5 overflow-hidden rounded-[26px] border border-line bg-card/95 p-4 no-underline shadow-[0_14px_36px_-22px_rgba(15,23,42,0.12)] transition-all duration-200 hover:-translate-y-0.5 hover:border-ink/35 hover:shadow-[0_18px_40px_-20px_rgba(15,23,42,0.18)]"
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
          <span className="truncate text-[16px] font-bold tracking-[-0.02em] text-ink transition-colors group-hover:text-[#2563eb] dark:group-hover:text-[#93c5fd]">
            {app.label}
          </span>
          {badge}
        </span>
        <span className="line-clamp-1 text-[13.5px] text-muted">{app.blurb}</span>
        {app.items.length > 1 && (
          <span className="mt-1 inline-flex items-center gap-1.5">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${accent.pill}`}>
              {app.items.length} workflow steps
            </span>
          </span>
        )}
      </span>
      <ArrowUpRight
        size={16}
        aria-hidden
        className="relative z-10 shrink-0 text-muted transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink"
      />
    </Link>
  )
}

export function Launcher() {
  const { me, can } = useMeta()
  const sipSnap = useSipClient()
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
  const coreSuiteApps = useMemo(() => {
    const order = ['messages', 'work', 'phone']
    return order
      .map(k => apps.find(a => a.key === k))
      .filter((a): a is LauncherApp => Boolean(a))
  }, [apps])
  const workspaceApps = useMemo(() => apps.filter(a => !SWK_CORE_SUITE_KEYS.has(a.key)), [apps])
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
  const shownApps = workspaceApps.filter(a => {
    const matchText = !needle || a.label.toLocaleLowerCase().includes(needle) || a.blurb.toLocaleLowerCase().includes(needle)
    const matchCat = Boolean(needle) || cat === 'all' || activeCat.keys.includes(a.key)
    return matchText && matchCat
  })
  const shownSuiteApps = coreSuiteApps.filter(a => {
    if (!needle) return true
    const brand = CORE_SUITE_BRANDING[a.key]
    return (
      a.label.toLocaleLowerCase().includes(needle) ||
      a.blurb.toLocaleLowerCase().includes(needle) ||
      (brand?.brandName.toLocaleLowerCase().includes(needle) ?? false) ||
      (brand?.tagline.toLocaleLowerCase().includes(needle) ?? false)
    )
  })
  const features = needle
    ? apps
        .flatMap(a => a.items.map(i => ({ ...i, app: a.label })))
        .filter(i => i.label.toLocaleLowerCase().includes(needle) || (i.desc ?? '').toLocaleLowerCase().includes(needle))
    : []

  const firstName = (me?.name || '').split(' ')[0]
  const openFirst = () => {
    const target = features[0]?.to ?? shownApps[0]?.landing ?? shownSuiteApps[0]?.landing
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
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-card/95 px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--eyebrow)] shadow-2xs max-w-full">
              <span className="size-1.5 rounded-full bg-[#047857] dark:bg-[#34d399] shrink-0" />
              <span className="truncate">SWK Properties · ORN 51517 · {todayLabel()}</span>
            </div>
            <h1 className="mt-2.5 text-[28px] sm:text-[38px] font-bold tracking-[-0.035em] text-ink leading-[1.08]">
              {greeting()}
              {firstName ? `, ${firstName}` : ''}.
            </h1>
            <p className="mt-1.5 mb-0 text-[14.5px] text-muted">
              Let&apos;s make today productive — search any page, continue your last workflow, or launch an app below.
            </p>
          </div>

          {/* Dual-Layer Command Card (Executive Obsidian Strip + Crisp Search & Quick Chips Inside) */}
          <div className="rounded-[22px] border border-[#c89b3c]/30 bg-gradient-to-br from-[#07131b] via-[#0d2230] to-[#081720] p-2.5 shadow-[0_20px_48px_-18px_rgba(7,19,27,0.44)]">
            <div className="flex items-center justify-between gap-3 px-3 pt-1.5 pb-3 text-white">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#c89b3c]/18 border border-[#c89b3c]/35 text-[#e6be63]">
                  {lastVisit ? <lastVisit.icon size={17} /> : <LayoutDashboard size={17} />}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[14.5px] font-semibold text-white">
                    {lastVisit ? lastVisit.label : restricted ? 'My Assigned Deals' : 'Executive Dashboard'}
                  </div>
                  <div className="truncate text-[12px] text-slate-300">
                    {lastVisit ? `Recently Visited · ${lastVisit.section}` : restricted ? 'Dispatched Vault Deals & Hard-Masked Calling' : 'Live Pipeline, Journeys & Analytics'}
                  </div>
                </div>
              </div>
              <Link
                to={lastVisit ? lastVisit.to : restricted ? '/my-deals' : '/dashboard'}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[#c89b3c]/45 bg-[#c89b3c]/16 px-3.5 py-1.5 text-[11.5px] font-bold uppercase tracking-[0.12em] text-[#f3d27a] no-underline transition-colors hover:bg-[#c89b3c] hover:border-[#c89b3c] hover:text-[#07131b]"
              >
                <Clock3 size={13} />
                {lastVisit ? 'Resume' : 'Open'}
              </Link>
            </div>

            <div className="rounded-[16px] bg-card p-3.5 shadow-inner">
              <form className="relative flex items-center gap-2" role="search" onSubmit={e => { e.preventDefault(); openFirst() }}>
                <div className="relative flex-1 min-w-0">
                  <Search size={17} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    type="text"
                    inputMode="search"
                    enterKeyHint="search"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') setQuery('') }}
                    placeholder="Search apps, workflows, or jump anywhere…"
                    aria-label="Search apps and features"
                    autoComplete="off"
                    className="h-11 w-full rounded-xl border border-line bg-soft pl-10 pr-10 text-[15px] text-ink outline-none no-focus-outline transition-all placeholder:text-muted focus:border-[#046c4e] focus:bg-card focus:ring-4 focus:ring-[#046c4e]/12"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      aria-label="Clear search"
                      className="absolute right-2.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-soft text-body hover:bg-primary hover:text-primary-foreground cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <Link
                  to="/utilities/search"
                  title="Advanced Unified Search"
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#ebf7f2] text-[#046c4e] dark:bg-soft dark:text-[#6ee7b7] no-underline transition-colors hover:bg-[#046c4e] hover:text-white"
                >
                  <SlidersHorizontal size={17} />
                </Link>
              </form>

              {/* Category quick-filter pills right inside the command deck */}
              <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
                {CATEGORY_FILTERS.map(c => {
                  const active = cat === c.id && !needle
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setQuery(''); setCat(c.id) }}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[12.5px] font-semibold border transition-colors cursor-pointer ${
                        active
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'bg-soft border-line text-body hover:border-ink/30 hover:bg-hover'
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

        {/* Right Hero Card: Executive Today's Pulse (SWK Obsidian + Champagne Gold) */}
        <div className="lg:col-span-4 rounded-[22px] border border-[#c89b3c]/35 bg-gradient-to-br from-[#07131b] via-[#0d2230] to-[#081720] p-5 text-white shadow-[0_20px_48px_-18px_rgba(7,19,27,0.46)] flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#e6be63]">Today&apos;s Pulse</span>
              <h2 className="m-0 mt-0.5 text-[19px] font-bold !text-white">Daily Operations</h2>
            </div>
            <Link
              to={restricted ? '/reception-qr' : '/dashboard'}
              className="inline-flex items-center gap-1 rounded-xl border border-[#c89b3c]/40 bg-[#c89b3c]/16 px-3 py-1.5 text-[12px] font-semibold text-[#f3d27a] no-underline hover:bg-[#c89b3c] hover:text-[#07131b] transition-colors"
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
                  stroke="#e2b857"
                  strokeWidth={10}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 42}
                  strokeDashoffset={2 * Math.PI * 42 * (1 - progressPct / 100)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[22px] font-bold text-white leading-none">{progressPct}%</span>
                <span className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-300">Active</span>
              </div>
            </div>

            <div className="flex-1 min-w-0 grid gap-2.5">
              {restricted ? (
                <>
                  <div className="flex items-center justify-between text-[13px]"><span className="text-slate-300">Inside Unread</span><b className="text-white text-[15px]">{unread}</b></div>
                  <div className="flex items-center justify-between text-[13px]"><span className="text-slate-300">Permitted Apps</span><b className="text-white text-[15px]">{apps.length}</b></div>
                  <div className="flex items-center justify-between text-[13px]"><span className="text-slate-300">Dubai Timezone</span><b className="text-[#e6be63] text-[15px]">GST +4</b></div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between text-[13px]"><span className="text-slate-300">Leads Today</span><b className="text-white text-[15px]">{leadCount}</b></div>
                  <div className="flex items-center justify-between text-[13px]"><span className="text-slate-300">Viewings (7d)</span><b className="text-[#6ee7b7] text-[15px]">{viewingCount}</b></div>
                  <div className="flex items-center justify-between text-[13px]"><span className="text-slate-300">Pending Offers</span><b className="text-[#e6be63] text-[15px]">{offerCount}</b></div>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2 border-t border-white/12">
            <Link to="/reception-qr" className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-[12px] font-semibold text-white no-underline hover:bg-white/20">
              <QrCode size={13} className="text-[#e6be63]" /> QR Check-In
            </Link>
            <Link to="/chat" className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-[12px] font-semibold text-white no-underline hover:bg-white/20">
              <Sparkles size={13} className="text-[#6ee7b7]" /> SWK Inside {unread > 0 ? `(${unread})` : ''}
            </Link>
            <Link to="/field-duty" className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-[12px] font-semibold text-white no-underline hover:bg-white/20">
              <Navigation size={13} className="text-[#93c5fd]" /> Field GPS
            </Link>
            {canAccessShabibsCorner(me) && (
              <Link to="/shabibs-corner" className="inline-flex items-center gap-1.5 rounded-xl border border-[#c89b3c]/50 bg-[#c89b3c]/20 px-3 py-1.5 text-[12px] font-bold text-[#f7dda0] no-underline hover:bg-[#c89b3c] hover:text-[#07131b]">
                <Crown size={13} /> Shabib&apos;s Corner
              </Link>
            )}
          </div>
        </div>
      </motion.section>

      {/* Search Matching Pages */}
      {features.length > 0 && (
        <section aria-label="Matching pages" className="rounded-[22px] border border-line bg-card p-3 shadow-[0_8px_28px_-14px_rgba(11,31,42,0.12)]">
          <div className="px-3 pt-1 pb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--eyebrow)]">
            Matching Workflow Pages ({features.length})
          </div>
          <ul className="m-0 list-none p-0 grid gap-1 sm:grid-cols-2">
            {features.map(f => (
              <li key={f.to}>
                <Link to={f.to} className="group flex items-center gap-3 rounded-2xl px-3.5 py-2.5 no-underline hover:bg-hover transition-colors">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#0b1f2a] text-[#d4a752]">
                    <f.icon size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-[14px] font-semibold text-ink truncate">{f.label}</b>
                    <small className="block text-[12px] text-muted truncate">{f.desc ?? f.app}</small>
                  </span>
                  <span className="rounded-full bg-[#eff6ff] px-2.5 py-0.5 text-[10.5px] font-semibold text-[#1d4ed8] shrink-0">
                    {f.app}
                  </span>
                  <ArrowUpRight size={15} className="text-muted group-hover:text-ink shrink-0" />
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
              <h2 className="m-0 text-[18px] font-bold text-ink">Featured Inventory</h2>
              <span className="rounded-full bg-[#dc2626] px-2 py-0.5 text-[11px] font-bold text-white">
                {listings.length}
              </span>
            </div>
            <Link to="/e/properties" className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#2563eb] dark:text-[#93c5fd] no-underline hover:underline">
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
              <h2 className="m-0 text-[18px] font-bold text-ink">
                {cat === 'all' || needle ? 'SWK Workspace Apps' : activeCat.label}
              </h2>
              <p className="m-0 text-[12.5px] text-muted">
                Every app opens with a step-by-step workflow bar so you never hunt through sidebars.
              </p>
            </div>
            <span className="shrink-0 whitespace-nowrap rounded-full bg-card border border-line px-3 py-1 text-[11.5px] font-semibold text-body">
              {shownApps.length} {shownApps.length === 1 ? 'app' : 'apps'}
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
            <div><b className="block text-[15.5px]">Office QR Check-In</b><span className="text-[13px] text-[#cbd5e1]">Daily office attendance scan</span></div>
          </Link>
          <Link to="/field-duty" className="rounded-[22px] bg-gradient-to-br from-[#047857] to-[#0e9f6e] p-5 text-white no-underline shadow-md flex items-center gap-3.5">
            <span className="size-12 rounded-2xl bg-white/15 text-white grid place-items-center shrink-0"><CalendarCheck size={22} /></span>
            <div><b className="block text-[15.5px]">Field Duty GPS</b><span className="text-[13px] text-white/85">Start property viewing tracking</span></div>
          </Link>
          <Link to="/market" className="rounded-[22px] bg-gradient-to-br from-[#1d4ed8] to-[#2563eb] p-5 text-white no-underline shadow-md flex items-center gap-3.5">
            <span className="size-12 rounded-2xl bg-white/15 text-white grid place-items-center shrink-0"><LineChart size={22} /></span>
            <div><b className="block text-[15.5px]">Dubai Market Pulse</b><span className="text-[13px] text-white/85">Live PSF prices &amp; rental yields</span></div>
          </Link>
        </section>
      )}

      {/* Dedicated Bottom SWK Core Suite Dock: SWK Inside, SWK Work, SWK Phone (Branded Separately!) */}
      {shownSuiteApps.length > 0 && (
        <section
          aria-label="SWK Core Suite"
          className="rounded-[30px] border border-[#d4a752]/35 bg-gradient-to-br from-[#0b1622] via-[#101e2e] to-[#0a131d] p-5 sm:p-6 shadow-[0_24px_60px_-24px_rgba(11,20,30,0.58)] text-white"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src="/brand/swk-app-icon-rounded.png"
                alt="SWK Suite"
                className="size-10 rounded-xl ring-1 ring-[#f3d27a]/45 shadow-md shrink-0"
              />
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#f3d27a]">
                  SWK Communications &amp; Productivity Suite
                </div>
                <h2 className="m-0 text-[20px] font-bold tracking-[-0.025em] text-white">
                  SWK Inside · SWK Work · SWK Phone
                </h2>
              </div>
            </div>
            <span className="rounded-full border border-[#f3d27a]/35 bg-[#f3d27a]/12 px-3 py-1 text-[11.5px] font-bold uppercase tracking-[0.12em] text-[#f5dfb0]">
              Dedicated SWK Apps
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {shownSuiteApps.map(app => {
              const brand = CORE_SUITE_BRANDING[app.key]
              if (!brand) return null
              const statusText =
                app.key === 'messages'
                  ? unread > 0
                    ? `${unread} unread message${unread === 1 ? '' : 's'}`
                    : 'Encrypted Team Messenger'
                  : app.key === 'work'
                    ? Number(kpis.my_tasks ?? 0) > 0
                      ? `${kpis.my_tasks} open task${Number(kpis.my_tasks) === 1 ? '' : 's'}`
                      : `${app.items.length} execution tools`
                    : sipSnap.configured
                      ? `Ext ${sipSnap.extensionNo} · ${sipSnap.registration === 'registered' ? 'Online' : 'Ready'}`
                      : 'WebRTC SIP & Masked Vault'
              return (
                <Link
                  key={app.key}
                  to={app.landing}
                  className={`group relative flex flex-col justify-between gap-4 overflow-hidden rounded-[24px] border bg-gradient-to-br p-5 no-underline text-white transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_22px_48px_-18px_rgba(0,0,0,0.65)] ${brand.cardBg} ${brand.border}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <img
                      src={brand.iconSrc}
                      alt={brand.brandName}
                      className="size-[62px] rounded-[18px] shadow-[0_12px_28px_-10px_rgba(0,0,0,0.6)] ring-1 ring-white/20 transition-transform duration-300 group-hover:scale-105 shrink-0"
                    />
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${brand.pillBg} ${brand.pillFg}`}
                    >
                      {app.key === 'messages' && unread > 0 && <span className="size-1.5 rounded-full bg-[#34d399]" />}
                      {statusText}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="m-0 text-[19px] font-bold tracking-[-0.025em] text-white">
                        {brand.brandName}
                      </h3>
                      <ArrowUpRight
                        size={18}
                        className="text-[#f3d27a] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 shrink-0"
                      />
                    </div>
                    <p className="m-0 mt-1.5 text-[13.5px] leading-relaxed text-white/80">
                      {brand.tagline}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-white/12 flex items-center justify-between text-[12px] font-bold text-[#f3d27a]">
                    <span>{brand.ctaLabel}</span>
                    <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {needle && !shownApps.length && !shownSuiteApps.length && !features.length && (
        <div className="rounded-[24px] border border-line bg-card p-10 text-center shadow-sm">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-soft text-muted">
            <Building2 size={22} />
          </div>
          <b className="text-[16px] text-ink">No app or page matches “{query.trim()}”</b>
          <p className="mt-1 text-[13.5px] text-muted">Try a simpler word, or press Ctrl + K to search properties, leads, and deals.</p>
          <button type="button" className="btn outline mt-3" onClick={() => setQuery('')}>
            Clear search
          </button>
        </div>
      )}
    </div>
  )
}
