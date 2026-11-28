import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react'
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
  GripVertical,
  LayoutDashboard,
  LineChart,
  MapPin,
  MessagesSquare,
  Navigation,
  Palette,
  PhoneCall,
  Pin,
  QrCode,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Workflow,
  X,
} from 'lucide-react'
import { useMeta } from '../lib/meta'
import { get } from '../lib/api'
import { preloadRoute } from '../lib/prefetch'
import { useUiCustomization } from '../lib/uiCustomization'
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
import { GlossyBlackCard, LogoPresenceBadge } from '../components/ui/PremiumPrimitives'

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

/** Premium White + Glossy Obsidian & SWK Logo Gold/Emerald hover app tile with instant hover preload, Pin, Highlight Star & Drag-to-Reorder */
function AppCard({
  app,
  badge,
  pinned,
  highlighted,
  dragging,
  onTogglePin,
  onToggleHighlight,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  app: LauncherApp
  badge?: ReactNode
  pinned: boolean
  highlighted: boolean
  dragging: boolean
  onTogglePin: () => void
  onToggleHighlight: () => void
  onDragStart: (e: DragEvent) => void
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  onDragEnd: () => void
}) {
  const isOwnerApp = app.key === 'shabib_corner'
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`group relative h-full rounded-[22px] transition-opacity ${dragging ? 'opacity-45' : ''}`}
    >
      <Link
        to={app.landing}
        draggable={false}
        title={app.blurb}
        onMouseEnter={() => preloadRoute(app.landing)}
        onFocus={() => preloadRoute(app.landing)}
        className={
          isOwnerApp
            ? `swk-gloss-black relative flex h-full items-center gap-4 overflow-hidden rounded-[22px] p-4 pr-14 no-underline transition-all duration-300 ${highlighted ? 'swk-ui-highlighted' : ''}`
            : `relative flex h-full items-center gap-4 overflow-hidden rounded-[22px] border border-black/[0.08] bg-white p-4 pr-14 no-underline shadow-[0_12px_32px_-16px_rgba(10,11,14,0.1)] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-[#d4a955]/55 hover:bg-white hover:shadow-[0_22px_48px_-18px_rgba(10,11,14,0.18)] ${highlighted ? 'swk-ui-highlighted' : ''}`
        }
      >
        <div
          className={`relative z-10 flex size-[46px] shrink-0 items-center justify-center rounded-2xl border transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            isOwnerApp
              ? 'border-[#d4a955]/50 bg-[#d4a955]/20 text-[#ebc97c]'
              : 'border-black/[0.08] bg-[#f7f7f9] text-[#0a0b0e] group-hover:border-[#d4a955]/55 group-hover:bg-[#0a0b0e] group-hover:text-[#ebc97c]'
          }`}
        >
          <app.icon size={20} strokeWidth={1.85} />
        </div>

        <span className="relative z-10 flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className={`truncate font-display text-[15.5px] font-bold tracking-[-0.02em] ${isOwnerApp ? 'text-white' : 'text-[#0a0b0e]'}`}>
              {app.label}
            </span>
            {highlighted && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-[#d4a955] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[#0a0b0e]">
                <Star size={9} className="fill-current" /> VIP
              </span>
            )}
            {badge}
          </span>
          <span className={`line-clamp-1 text-[12.5px] ${isOwnerApp ? 'text-white/75' : 'text-[#5b616e]'}`}>{app.blurb}</span>
          {app.items.length > 1 && (
            <span className={`mt-1 inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${isOwnerApp ? 'text-[#ebc97c]' : 'text-[#1e6b43]'}`}>
              <span className={`inline-block size-[4px] rounded-full ${isOwnerApp ? 'bg-[#ebc97c]' : 'bg-[#1e6b43]'}`} aria-hidden />
              {app.items.length} screens
            </span>
          )}
        </span>
      </Link>

      {/* Sibling Pin / Star / Drag Handle Controls (outside <a> for valid accessible HTML) */}
      <div className="absolute right-2.5 top-1/2 z-20 -translate-y-1/2 flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={onTogglePin}
          title={pinned ? `Unpin ${app.label}` : `Pin ${app.label} to Quick-Launch Bar`}
          aria-label={pinned ? `Unpin ${app.label}` : `Pin ${app.label}`}
          className={`grid size-6 place-items-center rounded-full border transition-all cursor-pointer ${
            pinned
              ? 'border-[#d4a955] bg-[#d4a955] text-[#0a0b0e] opacity-100'
              : isOwnerApp
                ? 'border-white/20 bg-white/10 text-white/75 opacity-60 max-md:opacity-90 group-hover:opacity-100 hover:bg-[#d4a955] hover:text-[#0a0b0e]'
                : 'border-black/10 bg-white/95 text-[#5b616e] opacity-0 max-md:opacity-90 group-hover:opacity-100 focus:opacity-100 hover:border-[#d4a955] hover:bg-[#0a0b0e] hover:text-[#ebc97c]'
          }`}
        >
          <Pin size={11} />
        </button>
        <button
          type="button"
          onClick={onToggleHighlight}
          title={highlighted ? `Remove highlight on ${app.label}` : `Highlight ${app.label}`}
          aria-label={highlighted ? `Remove highlight on ${app.label}` : `Highlight ${app.label}`}
          className={`grid size-6 place-items-center rounded-full border transition-all cursor-pointer ${
            highlighted
              ? 'border-[#d4a955] bg-[#0a0b0e] text-[#ebc97c] opacity-100'
              : isOwnerApp
                ? 'border-white/20 bg-white/10 text-white/75 opacity-60 max-md:opacity-90 group-hover:opacity-100 hover:bg-[#d4a955] hover:text-[#0a0b0e]'
                : 'border-black/10 bg-white/95 text-[#5b616e] opacity-0 max-md:opacity-90 group-hover:opacity-100 focus:opacity-100 hover:border-[#d4a955] hover:bg-[#0a0b0e] hover:text-[#ebc97c]'
          }`}
        >
          <Star size={11} className={highlighted ? 'fill-current' : ''} />
        </button>
        <span
          aria-hidden="true"
          title="Drag card to reorder"
          className={`grid size-5 place-items-center rounded text-[10px] cursor-grab opacity-0 group-hover:opacity-60 ${
            isOwnerApp ? 'text-white' : 'text-[#5b616e]'
          }`}
        >
          <GripVertical size={12} />
        </span>
      </div>
    </div>
  )
}

export function Launcher() {
  const { me, can } = useMeta()
  const uiCustom = useUiCustomization()
  const sipSnap = useSipClient()
  const nav = useNavigate()
  const reduce = useReducedMotion()
  const [animate] = useState(() => !entrancePlayed)
  const [dragAppKey, setDragAppKey] = useState<string | null>(null)
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
  const workspaceApps = useMemo(() => {
    const raw = apps.filter(a => !SWK_CORE_SUITE_KEYS.has(a.key))
    const customOrder = uiCustom.prefs.pinning.appOrder
    if (!customOrder.length) return raw
    const rank = new Map(customOrder.map((k, i) => [k, i]))
    return [...raw].sort((a, b) => {
      const ra = rank.has(a.key) ? rank.get(a.key)! : 999
      const rb = rank.has(b.key) ? rank.get(b.key)! : 999
      return ra - rb
    })
  }, [apps, uiCustom.prefs.pinning.appOrder])

  const handleReorderApp = (fromKey: string, toKey: string) => {
    if (!fromKey || !toKey || fromKey === toKey) return
    const keys = workspaceApps.map(a => a.key)
    const fromIdx = keys.indexOf(fromKey)
    const toIdx = keys.indexOf(toKey)
    if (fromIdx < 0 || toIdx < 0) return
    const next = [...keys]
    const [moved] = next.splice(fromIdx, 1)
    if (!moved) return
    next.splice(toIdx, 0, moved)
    uiCustom.setAppOrder(next)
  }
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
        {/* Left 8 Cols: Pure White Greeting + Search & Category Deck */}
        <div className="lg:col-span-8 flex flex-col justify-between gap-5 rounded-[26px] border border-black/[0.08] bg-white p-6 sm:p-7 shadow-[0_20px_54px_-22px_rgba(10,11,14,0.12)] relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
            style={{ background: 'linear-gradient(90deg, #96202f 0%, #d4a955 50%, #1e6b43 100%)' }}
          />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <LogoPresenceBadge subtitle={todayLabel()} />
              </div>
              <h1 className="mt-3.5 m-0 font-display text-[30px] sm:text-[42px] font-bold tracking-[-0.04em] text-[#0a0b0e] leading-[1.04]">
                {greeting()}
                {firstName ? `, ${firstName}` : ''}
                <span className="text-[#d4a955]">.</span>
              </h1>
              <p className="mt-2 mb-0 text-[14.5px] text-[#4b5262] leading-relaxed">
                Pick any app below, search instantly, or jump back into your last screen.
              </p>
            </div>

            {/* Resume Last Visited Glossy Pill */}
            <div className="flex items-center gap-3 rounded-2xl border border-[#d4a955]/30 bg-[#0a0b0e] px-3.5 py-2.5 shrink-0 max-w-full text-white shadow-[0_16px_36px_-14px_rgba(10,11,14,0.5)]">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#d4a955]/20 text-[#ebc97c] border border-[#d4a955]/35">
                {lastVisit ? <lastVisit.icon size={16} /> : <LayoutDashboard size={16} />}
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#ebc97c]">
                  {lastVisit ? 'Resume Last Screen' : 'Quick Start'}
                </div>
                {lastVisit ? (
                  <Link
                    to={lastVisit.to}
                    onMouseEnter={() => preloadRoute(lastVisit.to)}
                    className="block truncate text-[13px] font-semibold text-white no-underline hover:text-[#ebc97c] max-w-[180px]"
                  >
                    {lastVisit.label}
                  </Link>
                ) : (
                  <Link
                    to={restricted ? '/my-deals' : '/dashboard'}
                    onMouseEnter={() => preloadRoute(restricted ? '/my-deals' : '/dashboard')}
                    className="block truncate text-[13px] font-semibold text-white no-underline hover:text-[#ebc97c]"
                  >
                    {restricted ? 'My Assigned Deals' : 'Executive Dashboard'}
                  </Link>
                )}
              </div>
              <Link
                to={lastVisit ? lastVisit.to : restricted ? '/my-deals' : '/dashboard'}
                onMouseEnter={() => preloadRoute(lastVisit ? lastVisit.to : restricted ? '/my-deals' : '/dashboard')}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[#d4a955] text-[#0a0b0e] no-underline transition-transform hover:scale-105"
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

        {/* Right 4 Cols: Glossy Floating Shining Black Daily Operations Card */}
        <GlossyBlackCard accent="tricolor" className="lg:col-span-4 p-6 flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#ebc97c]">
                <LiveStatusDot onDark /> Today&apos;s Pulse
              </div>
              <h2 className="m-0 mt-1.5 font-display text-[21px] font-bold tracking-[-0.03em] text-white">
                Daily Operations
              </h2>
            </div>
            <Link
              to={restricted ? '/reception-qr' : '/dashboard'}
              onMouseEnter={() => preloadRoute(restricted ? '/reception-qr' : '/dashboard')}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#d4a955] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#0a0b0e] no-underline transition-transform hover:scale-105"
            >
              {restricted ? 'Check-In' : 'Dashboard'} <ArrowRight size={12} />
            </Link>
          </div>

          <div className="flex items-center gap-5 py-1">
            <div className="relative flex size-[104px] shrink-0 items-center justify-center">
              <svg width={104} height={104} className="-rotate-90">
                <circle cx={52} cy={52} r={42} stroke="rgba(255,255,255,0.12)" strokeWidth={8} fill="none" />
                <circle
                  cx={52}
                  cy={52}
                  r={42}
                  stroke="#d4a955"
                  strokeWidth={8}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 42}
                  strokeDashoffset={2 * Math.PI * 42 * (1 - progressPct / 100)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-[21px] font-bold text-white leading-none tabular-nums">{progressPct}%</span>
                <span className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.16em] text-[#ebc97c]">Active</span>
              </div>
            </div>

            <div className="flex-1 min-w-0 grid gap-2.5">
              {restricted ? (
                <>
                  <div className="flex items-center justify-between text-xs border-b border-white/10 pb-1.5"><span className="text-white/70">Inside Unread</span><b className="font-mono text-[#ebc97c] text-sm tabular-nums">{unread}</b></div>
                  <div className="flex items-center justify-between text-xs border-b border-white/10 pb-1.5"><span className="text-white/70">Permitted Apps</span><b className="font-mono text-white text-sm tabular-nums">{apps.length}</b></div>
                  <div className="flex items-center justify-between text-xs"><span className="text-white/70">Dubai Time</span><b className="font-mono text-[#34d399] text-xs">GST +4</b></div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs border-b border-white/10 pb-1.5"><span className="text-white/70">Leads Today</span><b className="font-mono text-[#ebc97c] text-sm tabular-nums">{leadCount}</b></div>
                  <div className="flex items-center justify-between text-xs border-b border-white/10 pb-1.5"><span className="text-white/70">Viewings (7d)</span><b className="font-mono text-[#34d399] text-sm tabular-nums">{viewingCount}</b></div>
                  <div className="flex items-center justify-between text-xs"><span className="text-white/70">Pending Offers</span><b className="font-mono text-white text-sm tabular-nums">{offerCount}</b></div>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-3 border-t border-white/10">
            <Link to="/reception-qr" className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white no-underline transition-colors hover:border-[#d4a955] hover:bg-[#d4a955] hover:text-[#0a0b0e]">
              <QrCode size={12} /> QR Check-In
            </Link>
            <Link to="/chat" className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white no-underline transition-colors hover:border-[#d4a955] hover:bg-[#d4a955] hover:text-[#0a0b0e]">
              <Sparkles size={12} /> Inside {unread > 0 ? `(${unread})` : ''}
            </Link>
            <Link to="/mobile-apps" onMouseEnter={() => preloadRoute('/mobile-apps')} className="inline-flex items-center gap-1.5 rounded-full border border-[#d4a955]/40 bg-[#d4a955]/15 px-3 py-1.5 text-[11px] font-semibold text-[#ebc97c] no-underline transition-colors hover:bg-[#d4a955] hover:text-[#0a0b0e]">
              <Navigation size={12} /> Mobile Apps
            </Link>
            <button
              type="button"
              onClick={uiCustom.openDrawer}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white cursor-pointer transition-colors hover:border-[#d4a955] hover:bg-[#d4a955] hover:text-[#0a0b0e]"
            >
              <Palette size={12} /> Customise UI
            </button>
          </div>
        </GlossyBlackCard>
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

      {/* ============================================================ 2B. PINNED SHORTCUTS STRIP (when user has pins & dock is hidden) */}
      {!needle && uiCustom.prefs.pinning.pinnedItems.length > 0 && uiCustom.prefs.pinning.dockPosition === 'hidden' && (
        <section aria-label="Pinned shortcuts" className="rounded-[22px] border border-black/[0.08] bg-white px-4 py-3 shadow-sm flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#8f6720] mr-1">
            <Pin size={12} /> Pinned
          </span>
          {uiCustom.prefs.pinning.pinnedItems.map(item => (
            <Link
              key={item.id}
              to={item.to}
              onMouseEnter={() => preloadRoute(item.to)}
              style={item.accentColor ? { borderColor: item.accentColor } : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-[#0a0b0e] no-underline hover:border-[#d4a955] ${
                item.highlighted ? 'swk-ui-highlighted' : ''
              }`}
            >
              {item.highlighted && <Star size={11} className="fill-[#d4a955] text-[#d4a955]" />}
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={uiCustom.openDrawer}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-black/10 bg-transparent px-2.5 py-1 text-[11px] font-bold text-[#5b616e] hover:text-[#0a0b0e] cursor-pointer"
          >
            <Palette size={11} /> Manage Pins
          </button>
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
            <div className="flex items-center gap-2">
              <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-[#5b616e]">
                <GripVertical size={12} /> Drag tiles to reorder · Hover to Pin or Star
              </span>
              <span className="shrink-0 whitespace-nowrap rounded-full border border-white/88 bg-white/86 px-3.5 py-1.5 font-mono text-[11px] font-medium text-[#475569] shadow-[0_6px_18px_rgba(12,56,96,0.06)] backdrop-blur-xl">
                {shownApps.length} {shownApps.length === 1 ? 'module' : 'modules'}
              </span>
            </div>
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
                  pinned={uiCustom.isPinned(a.landing)}
                  highlighted={uiCustom.prefs.pinning.highlightedAppKeys.includes(a.key)}
                  dragging={dragAppKey === a.key}
                  onTogglePin={() =>
                    uiCustom.togglePinItem({
                      id: a.landing,
                      label: a.label,
                      to: a.landing,
                      highlighted: false,
                    })
                  }
                  onToggleHighlight={() => uiCustom.toggleAppHighlight(a.key)}
                  onDragStart={e => {
                    setDragAppKey(a.key)
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', a.key)
                  }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault()
                    const fromKey = dragAppKey || e.dataTransfer.getData('text/plain')
                    handleReorderApp(fromKey, a.key)
                    setDragAppKey(null)
                  }}
                  onDragEnd={() => setDragAppKey(null)}
                  badge={
                    a.key === 'shabib_corner' ? (
                      <span className="rounded-full bg-[#d4a955] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-[#0a0b0e]">
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
              const suiteHighlighted = uiCustom.prefs.pinning.highlightedAppKeys.includes(app.key)
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
                  className={`group relative flex flex-col justify-between gap-5 overflow-hidden rounded-[22px] border border-black/[0.08] bg-white/95 p-5 no-underline transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 hover:border-[#121212]/30 hover:shadow-[0_22px_52px_rgba(12,56,96,0.14)] ${
                    suiteHighlighted ? 'swk-ui-highlighted' : ''
                  }`}
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
