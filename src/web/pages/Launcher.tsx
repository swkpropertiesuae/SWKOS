import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
  MessagesSquare,
  Navigation,
  PhoneCall,
  QrCode,
  Search,
  SlidersHorizontal,
  Sparkles,
  Workflow,
  X,
} from 'lucide-react'
import { useMeta } from '../lib/meta'
import { get } from '../lib/api'
import { launcherApps, recentItems, SWK_CORE_SUITE_KEYS, type LauncherApp } from '../swk/nav'
import { aed, num } from '../swk/ui'
import { isRestrictedStaffUser } from '@shared/swk-staff-access'
import { useSipClient } from '../lib/sipClient'
import {
  BracketLink,
  LiveStatusDot,
  SectionEyebrow,
  SWISS_EASE,
  SwissCarousel,
} from '../components/ui/SwissPrimitives'

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
  { id: 'core', label: 'Executive & CORE', keys: ['shabib_corner', 'command', 'dashboard', 'master_log'] },
  { id: 'deals', label: 'Sales, CRM & Mortgage', keys: ['pipeline', 'clients', 'mortgage_desk', 'sales', 'website'] },
  { id: 'finance', label: 'Vault, Finance & Legal', keys: ['vault', 'finance', 'compliance', 'admin'] },
  { id: 'field', label: 'Team, Field & AI', keys: ['team', 'field', 'attendance', 'ai_lab', 'tools', 'market_pulse', 'general'] },
]

const CORE_SUITE_META: Record<
  string,
  {
    brandName: string
    eyebrow: string
    tagline: string
    icon: typeof MessagesSquare
    ctaLabel: string
  }
> = {
  messages: {
    brandName: 'SWK Inside',
    eyebrow: 'Internal Messaging',
    tagline: 'Encrypted team channels, deal rooms, broadcasts & instant document share.',
    icon: MessagesSquare,
    ctaLabel: 'Open SWK Inside',
  },
  work: {
    brandName: 'SWK Work',
    eyebrow: 'Execution & Flows',
    tagline: 'Tasks, projects, team calendars, approvals & visual workflow automations.',
    icon: Workflow,
    ctaLabel: 'Open SWK Work',
  },
  phone: {
    brandName: 'SWK Phone',
    eyebrow: 'Voice & Privacy Vault',
    tagline: 'WebRTC SIP dialer, office directory & zero-leak Masked Vault calling.',
    icon: PhoneCall,
    ctaLabel: 'Open SWK Phone',
  },
}

/** Refined Swiss architectural app tile — frosted white glass, crisp monochromatic icon anchor, obsidian+mint hover */
function AppCard({ app, badge }: { app: LauncherApp; badge?: ReactNode }) {
  const isOwnerApp = app.key === 'shabib_corner'
  return (
    <Link
      to={app.landing}
      title={app.blurb}
      className="group relative flex h-full items-center gap-4 overflow-hidden rounded-[22px] border border-white/88 bg-white/86 p-4 no-underline shadow-[0_14px_38px_rgba(12,56,96,0.08)] backdrop-blur-2xl transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-[#121212]/25 hover:bg-white hover:shadow-[0_22px_54px_rgba(12,56,96,0.14)]"
    >
      <div
        className={`relative z-10 flex size-[46px] shrink-0 items-center justify-center rounded-2xl border transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isOwnerApp
            ? 'border-[#121212] bg-[#121212] text-[#51fec0]'
            : 'border-black/[0.07] bg-[#f4f7fa] text-[#121212] group-hover:border-[#121212] group-hover:bg-[#121212] group-hover:text-[#51fec0]'
        }`}
      >
        <app.icon size={20} strokeWidth={1.75} />
      </div>

      <span className="relative z-10 flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15.5px] font-medium tracking-[-0.025em] text-[#121212]">
            {app.label}
          </span>
          {badge}
        </span>
        <span className="line-clamp-1 text-[12.5px] text-[#5b6778]">{app.blurb}</span>
        {app.items.length > 1 && (
          <span className="mt-1 inline-flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[#475569]">
            <span className="inline-block size-[4px] bg-[#0e9f6e]" aria-hidden />
            {app.items.length} workflow steps
          </span>
        )}
      </span>

      <span
        aria-hidden
        className="relative z-10 inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#121212] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:border-[#121212] group-hover:bg-[#121212] group-hover:text-[#51fec0]"
      >
        <ArrowUpRight size={14} />
      </span>
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
    queryFn: () => get<any>('/api/e/properties', { pageSize: 8, sort: 'listed_date', dir: 'desc' }),
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
    const meta = CORE_SUITE_META[a.key]
    return (
      a.label.toLocaleLowerCase().includes(needle) ||
      a.blurb.toLocaleLowerCase().includes(needle) ||
      (meta?.brandName.toLocaleLowerCase().includes(needle) ?? false) ||
      (meta?.tagline.toLocaleLowerCase().includes(needle) ?? false)
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

  const container = { hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.02, delayChildren: 0.02 } } }
  const rise = { hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: SWISS_EASE } } }

  return (
    <div className="mx-auto max-w-[1340px] space-y-7 pb-10">
      {/* ============================================================ 1. SWISS ARCHITECTURAL HERO & COMMAND DECK */}
      <motion.section
        className="grid gap-5 lg:grid-cols-12 items-stretch"
        initial={animate ? { opacity: 0, y: 8 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, ease: SWISS_EASE }}
      >
        {/* Left 8 Cols: Editorial Greeting + Frosted Glass Search & Category Deck */}
        <div className="lg:col-span-8 flex flex-col justify-between gap-5 rounded-[28px] border border-white/88 bg-white/86 p-6 sm:p-7 shadow-[0_24px_64px_rgba(12,56,96,0.10)] backdrop-blur-2xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2.5 rounded-full border border-black/[0.07] bg-white/90 px-3.5 py-1.5 shadow-[0_6px_18px_rgba(12,56,96,0.06)]">
                <LiveStatusDot />
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#121212]">
                  SWK Properties · ORN 51517 · {todayLabel()}
                </span>
              </div>
              <h1 className="mt-3.5 m-0 text-[30px] sm:text-[42px] font-medium tracking-[-0.042em] text-[#121212] leading-[1.04]">
                {greeting()}
                {firstName ? `, ${firstName}` : ''}
                <span className="text-[#64748b]">.</span>
              </h1>
              <p className="mt-2 mb-0 text-[14.5px] text-[#475569] leading-relaxed">
                Search any workspace page, resume your last workflow, or open an executive module below.
              </p>
            </div>

            {/* Resume Last Visited Pill */}
            <div className="flex items-center gap-3 rounded-2xl border border-black/[0.07] bg-[#f4f7fa]/85 px-3.5 py-2.5 shrink-0 max-w-full">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#121212] text-[#51fec0]">
                {lastVisit ? <lastVisit.icon size={16} /> : <LayoutDashboard size={16} />}
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">
                  {lastVisit ? 'Resume Workflow' : 'Primary Desk'}
                </div>
                {lastVisit ? (
                  <Link to={lastVisit.to} className="block truncate text-[13px] font-semibold text-[#121212] no-underline hover:text-[#0e9f6e] max-w-[180px]">
                    {lastVisit.label}
                  </Link>
                ) : (
                  <Link to={restricted ? '/my-deals' : '/dashboard'} className="block truncate text-[13px] font-semibold text-[#121212] no-underline hover:text-[#0e9f6e]">
                    {restricted ? 'My Assigned Deals' : 'Executive Dashboard'}
                  </Link>
                )}
              </div>
              <Link
                to={lastVisit ? lastVisit.to : restricted ? '/my-deals' : '/dashboard'}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[#121212] text-white no-underline transition-all hover:text-[#51fec0]"
                aria-label={lastVisit ? `Resume ${lastVisit.label}` : 'Open primary desk'}
              >
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>

          {/* Search Bar & Spring Animated Category Filter Switcher */}
          <div className="space-y-3 pt-1">
            <form className="relative flex items-center gap-2.5" role="search" onSubmit={e => { e.preventDefault(); openFirst() }}>
              <div className="relative flex-1 min-w-0">
                <Search size={17} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#64748b]" />
                <input
                  type="text"
                  inputMode="search"
                  enterKeyHint="search"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setQuery('') }}
                  placeholder="Search apps, workflows, leases, deals or pages…"
                  aria-label="Search apps and features"
                  autoComplete="off"
                  className="h-12 w-full rounded-2xl border border-black/[0.1] bg-white/95 pl-11 pr-11 text-[14.5px] text-[#121212] outline-none no-focus-outline shadow-[0_6px_18px_rgba(12,56,96,0.05)] transition-all placeholder:text-[#64748b] focus:border-[#121212] focus:bg-white focus:ring-4 focus:ring-[#121212]/8"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-[#f4f7fa] text-[#121212] hover:bg-[#121212] hover:text-[#51fec0] cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <Link
                to="/utilities/search"
                title="Advanced Unified Search"
                className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-black/[0.1] bg-white text-[#121212] no-underline shadow-[0_6px_18px_rgba(12,56,96,0.05)] transition-all hover:border-[#121212] hover:bg-[#121212] hover:text-[#51fec0]"
              >
                <SlidersHorizontal size={17} />
              </Link>
            </form>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
              {CATEGORY_FILTERS.map(c => {
                const active = cat === c.id && !needle
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setQuery(''); setCat(c.id) }}
                    className={`relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-[11.5px] font-medium uppercase tracking-[0.12em] border cursor-pointer transition-colors ${
                      active
                        ? 'border-[#121212] text-white'
                        : 'border-black/[0.08] bg-white/80 text-[#475569] hover:border-[#121212]/30 hover:text-[#121212]'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="launcher-cat-pill"
                        transition={{ type: 'spring', stiffness: 440, damping: 32 }}
                        className="absolute inset-0 rounded-full bg-[#121212]"
                      />
                    )}
                    <span className="relative z-10">{c.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right 4 Cols: Frosted-Glass Daily Operations Pulse (Zero Dark Circus Block!) */}
        <div className="lg:col-span-4 rounded-[28px] border border-white/88 bg-white/86 p-6 shadow-[0_24px_64px_rgba(12,56,96,0.10)] backdrop-blur-2xl flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SectionEyebrow accent="emerald">Today&apos;s Pulse</SectionEyebrow>
              <h2 className="m-0 mt-1.5 text-[20px] font-medium tracking-[-0.03em] text-[#121212]">
                Daily Operations
              </h2>
            </div>
            <BracketLink to={restricted ? '/reception-qr' : '/dashboard'} variant="dark" size="sm">
              {restricted ? 'Check-In' : 'Dashboard'} <ArrowRight size={12} />
            </BracketLink>
          </div>

          <div className="flex items-center gap-5 py-1">
            <div className="relative flex size-[104px] shrink-0 items-center justify-center">
              <svg width={104} height={104} className="-rotate-90">
                <circle cx={52} cy={52} r={42} stroke="rgba(18,18,18,0.08)" strokeWidth={8} fill="none" />
                <circle
                  cx={52}
                  cy={52}
                  r={42}
                  stroke="#121212"
                  strokeWidth={8}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 42}
                  strokeDashoffset={2 * Math.PI * 42 * (1 - progressPct / 100)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-[21px] font-semibold text-[#121212] leading-none tabular-nums">{progressPct}%</span>
                <span className="mt-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-[#0e9f6e]">Active</span>
              </div>
            </div>

            <div className="flex-1 min-w-0 grid gap-2.5">
              {restricted ? (
                <>
                  <div className="flex items-center justify-between text-xs"><span className="text-[#5b6778]">Inside Unread</span><b className="font-mono text-[#121212] text-sm tabular-nums">{unread}</b></div>
                  <div className="flex items-center justify-between text-xs"><span className="text-[#5b6778]">Permitted Apps</span><b className="font-mono text-[#121212] text-sm tabular-nums">{apps.length}</b></div>
                  <div className="flex items-center justify-between text-xs"><span className="text-[#5b6778]">Dubai Time</span><b className="font-mono text-[#0e9f6e] text-xs">GST +4</b></div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs border-b border-black/[0.06] pb-1.5"><span className="text-[#5b6778]">Leads Today</span><b className="font-mono text-[#121212] text-sm tabular-nums">{leadCount}</b></div>
                  <div className="flex items-center justify-between text-xs border-b border-black/[0.06] pb-1.5"><span className="text-[#5b6778]">Viewings (7d)</span><b className="font-mono text-[#0e9f6e] text-sm tabular-nums">{viewingCount}</b></div>
                  <div className="flex items-center justify-between text-xs"><span className="text-[#5b6778]">Pending Offers</span><b className="font-mono text-[#121212] text-sm tabular-nums">{offerCount}</b></div>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-3 border-t border-black/[0.07]">
            <Link to="/reception-qr" className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-[#f4f7fa] px-3 py-1.5 text-[11px] font-medium text-[#121212] no-underline transition-colors hover:border-[#121212] hover:bg-[#121212] hover:text-[#51fec0]">
              <QrCode size={12} /> QR Check-In
            </Link>
            <Link to="/chat" className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-[#f4f7fa] px-3 py-1.5 text-[11px] font-medium text-[#121212] no-underline transition-colors hover:border-[#121212] hover:bg-[#121212] hover:text-[#51fec0]">
              <Sparkles size={12} /> Inside {unread > 0 ? `(${unread})` : ''}
            </Link>
            <Link to="/field-duty" className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-[#f4f7fa] px-3 py-1.5 text-[11px] font-medium text-[#121212] no-underline transition-colors hover:border-[#121212] hover:bg-[#121212] hover:text-[#51fec0]">
              <Navigation size={12} /> Field GPS
            </Link>
          </div>
        </div>
      </motion.section>

      {/* ============================================================ 2. SEARCH MATCHING WORKFLOW PAGES */}
      {features.length > 0 && (
        <section aria-label="Matching pages" className="rounded-[26px] border border-white/88 bg-white/90 p-4 shadow-[0_20px_56px_rgba(12,56,96,0.10)] backdrop-blur-2xl">
          <div className="px-3 pt-1 pb-2.5">
            <SectionEyebrow>Matching Workflow Pages ({features.length})</SectionEyebrow>
          </div>
          <ul className="m-0 list-none p-0 grid gap-1.5 sm:grid-cols-2">
            {features.map(f => (
              <li key={f.to}>
                <Link to={f.to} className="group flex items-center gap-3 rounded-2xl border border-transparent px-3.5 py-2.5 no-underline hover:border-black/[0.08] hover:bg-[#f4f7fa] transition-all">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#121212] text-[#51fec0]">
                    <f.icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-[14px] font-semibold text-[#121212] truncate">{f.label}</b>
                    <small className="block text-[12px] text-[#5b6778] truncate">{f.desc ?? f.app}</small>
                  </span>
                  <span className="rounded-full border border-black/[0.08] bg-white px-2.5 py-0.5 text-[10.5px] font-medium text-[#475569] shrink-0">
                    {f.app}
                  </span>
                  <ArrowUpRight size={15} className="text-[#64748b] group-hover:text-[#121212] shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ============================================================ 3. GALLERY HOVER CAROUSEL: FEATURED INVENTORY */}
      {!needle && listings.length > 0 && (
        <section aria-label="Featured inventory">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div>
              <SectionEyebrow>Verified Dubai Portfolio</SectionEyebrow>
              <h2 className="m-0 mt-1 text-[22px] sm:text-[26px] font-medium tracking-[-0.035em] text-[#121212]">
                Featured Inventory <span className="text-[#64748b] font-normal">({listings.length})</span>
              </h2>
            </div>
            <BracketLink to="/e/properties" variant="light" size="sm">
              All Inventory <ArrowRight size={12} />
            </BracketLink>
          </div>

          <SwissCarousel ariaLabel="Featured inventory carousel" hint="DRAG OR CLICK ARROWS">
            {listings.slice(0, 8).map((p: any) => (
              <div
                key={p.id}
                className="w-[82vw] max-w-[320px] sm:w-[340px] sm:max-w-none shrink-0 snap-start"
              >
                <Link
                  to={`/e/properties/${p.id}`}
                  className="group relative flex h-[328px] w-full flex-col overflow-hidden rounded-[24px] border border-white/88 bg-white/92 shadow-[0_18px_48px_rgba(12,56,96,0.11)] backdrop-blur-xl no-underline transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_28px_68px_rgba(12,56,96,0.17)]"
                >
                  {/* Top Photo Frame */}
                  <div className="relative h-[54%] w-full overflow-hidden bg-[#eaf2f8]">
                    <div
                      className="h-full w-full bg-cover bg-center transition-transform duration-700 ease-out group-hover:scale-105"
                      style={{ backgroundImage: `url(${photoFor(p.id)})` }}
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b1623]/40 via-transparent to-transparent" />
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#121212]/82 px-2.5 py-1 text-[9.5px] font-medium uppercase tracking-[0.15em] text-white backdrop-blur-md">
                        <span className="h-1.5 w-1.5 rounded-[2px] bg-[#51fec0]" aria-hidden />
                        {p.is_off_plan ? 'Off-Plan' : 'Ready'}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/92 px-2.5 py-0.5 text-[10px] font-medium text-[#121212] backdrop-blur-md">
                        {p.bedrooms ? `${p.bedrooms} BR` : 'Studio'} · {num(p.area_sqft)} sf
                        {p.rera_permit_no && <BadgeCheck size={12} className="text-[#0e9f6e]" />}
                      </span>
                    </div>
                  </div>

                  {/* Frosted White Architectural Dossier Footer */}
                  <div className="flex flex-1 flex-col justify-between p-4 sm:p-5">
                    <div>
                      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0e9f6e] truncate">
                        <MapPin size={11} className="shrink-0" />
                        <span className="truncate">{p.address || p.property_type || 'Dubai, UAE'}</span>
                      </div>
                      <h3 className="m-0 mt-1 text-[17px] font-medium leading-tight tracking-[-0.025em] text-[#121212] line-clamp-1">
                        {p.title}
                      </h3>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-3 border-t border-black/[0.06]">
                      <div className="font-mono text-[15px] font-semibold text-[#121212] tabular-nums">
                        {p.price ? aed(p.price, { compact: true }) : p.rent_annual ? `${aed(p.rent_annual, { compact: true })}/yr` : 'On request'}
                      </div>
                      <span
                        aria-hidden
                        className="inline-flex size-8 items-center justify-center rounded-full border border-black/12 bg-white text-[#121212] transition-all duration-300 group-hover:-rotate-45 group-hover:border-[#121212] group-hover:bg-[#121212] group-hover:text-[#51fec0]"
                      >
                        <ArrowRight size={14} />
                      </span>
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </SwissCarousel>
        </section>
      )}

      {/* ============================================================ 4. SWK WORKSPACE APPS DIRECTORY */}
      {shownApps.length > 0 && (
        <div>
          <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
            <div>
              <SectionEyebrow>Operating Modules</SectionEyebrow>
              <h2 className="m-0 mt-1 text-[22px] sm:text-[26px] font-medium tracking-[-0.035em] text-[#121212]">
                {cat === 'all' || needle ? 'SWK Workspace Apps' : activeCat.label}
              </h2>
            </div>
            <span className="shrink-0 whitespace-nowrap rounded-full border border-white/88 bg-white/86 px-3.5 py-1.5 font-mono text-[11px] font-medium text-[#475569] shadow-[0_6px_18px_rgba(12,56,96,0.06)] backdrop-blur-xl">
              {shownApps.length} {shownApps.length === 1 ? 'module' : 'modules'}
            </span>
          </div>

          {/* Exact `section[aria-label="Apps"]` contract preserved for CI */}
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
                    a.key === 'shabib_corner' ? (
                      <span className="rounded-full bg-[#121212] px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[#51fec0]">
                        Owner
                      </span>
                    ) : a.key === 'messages' && unread > 0 ? (
                      <span
                        className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#dc2626] px-1.5 text-[10px] font-bold text-white"
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

      {/* ============================================================ 5. RESTRICTED STAFF QUICK STRIP */}
      {!needle && restricted && (
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { to: '/reception-qr', icon: QrCode, title: 'Office QR Check-In', sub: 'Daily office attendance scan' },
            { to: '/field-duty', icon: CalendarCheck, title: 'Field Duty GPS', sub: 'Start property viewing tracking' },
            { to: '/market', icon: LineChart, title: 'Dubai Market Pulse', sub: 'Live PSF prices & rental yields' },
          ].map(card => (
            <Link
              key={card.to}
              to={card.to}
              className="group rounded-[24px] border border-white/88 bg-white/86 p-5 no-underline shadow-[0_16px_42px_rgba(12,56,96,0.09)] backdrop-blur-2xl flex items-center gap-4 transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_24px_56px_rgba(12,56,96,0.14)]"
            >
              <span className="size-12 rounded-2xl bg-[#121212] text-[#51fec0] grid place-items-center shrink-0">
                <card.icon size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <b className="block text-[15.5px] font-medium tracking-[-0.02em] text-[#121212]">{card.title}</b>
                <span className="text-[12.5px] text-[#5b6778]">{card.sub}</span>
              </div>
              <ArrowUpRight size={16} className="text-[#64748b] group-hover:text-[#121212] shrink-0" />
            </Link>
          ))}
        </section>
      )}

      {/* ============================================================ 6. SWK CORE SUITE (Luminous Frosted Architectural Deck) */}
      {shownSuiteApps.length > 0 && (
        <section
          aria-label="SWK Core Suite"
          className="rounded-[28px] border border-white/88 bg-white/86 p-6 sm:p-7 shadow-[0_24px_64px_rgba(12,56,96,0.10)] backdrop-blur-2xl"
        >
          <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
            <div>
              <SectionEyebrow>Communications &amp; Productivity</SectionEyebrow>
              <h2 className="m-0 mt-1 text-[22px] sm:text-[26px] font-medium tracking-[-0.035em] text-[#121212]">
                SWK Inside · SWK Work · SWK Phone
              </h2>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-[#f4f7fa] px-3.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#121212]">
              <LiveStatusDot /> Dedicated SWK Suite
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {shownSuiteApps.map(app => {
              const meta = CORE_SUITE_META[app.key]
              if (!meta) return null
              const SuiteIcon = meta.icon
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
                  className="group relative flex flex-col justify-between gap-5 overflow-hidden rounded-[22px] border border-black/[0.08] bg-white/95 p-5 no-underline transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 hover:border-[#121212]/30 hover:shadow-[0_22px_52px_rgba(12,56,96,0.14)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#121212] text-[#51fec0] transition-transform duration-300 group-hover:scale-105">
                      <SuiteIcon size={21} strokeWidth={1.7} />
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#a7f3d0] bg-[#ecfdf5] px-2.5 py-1 text-[10.5px] font-semibold text-[#047857]">
                      {app.key === 'messages' && unread > 0 && <span className="size-1.5 rounded-full bg-[#0e9f6e]" />}
                      {statusText}
                    </span>
                  </div>

                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#64748b]">
                      {meta.eyebrow}
                    </div>
                    <h3 className="m-0 mt-1 text-[19px] font-medium tracking-[-0.03em] text-[#121212]">
                      {meta.brandName}
                    </h3>
                    <p className="m-0 mt-1.5 text-[13px] leading-relaxed text-[#5b6778]">
                      {meta.tagline}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-black/[0.06] flex items-center justify-between text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#121212]">
                    <span>{meta.ctaLabel}</span>
                    <span className="inline-flex size-8 items-center justify-center rounded-full border border-black/10 bg-[#f4f7fa] text-[#121212] transition-all duration-300 group-hover:-rotate-45 group-hover:border-[#121212] group-hover:bg-[#121212] group-hover:text-[#51fec0]">
                      <ArrowRight size={13} />
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* ============================================================ 7. EMPTY SEARCH STATE */}
      {needle && !shownApps.length && !shownSuiteApps.length && !features.length && (
        <div className="rounded-[26px] border border-white/88 bg-white/88 p-10 text-center shadow-[0_18px_48px_rgba(12,56,96,0.09)] backdrop-blur-2xl">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-[#121212] text-[#51fec0]">
            <Building2 size={20} />
          </div>
          <b className="text-[16px] font-medium text-[#121212]">No app or page matches “{query.trim()}”</b>
          <p className="mt-1 text-[13.5px] text-[#5b6778]">Try a simpler word, or press Ctrl + K to search properties, leads, and deals.</p>
          <button type="button" className="btn outline mt-3" onClick={() => setQuery('')}>
            Clear search
          </button>
        </div>
      )}
    </div>
  )
}
