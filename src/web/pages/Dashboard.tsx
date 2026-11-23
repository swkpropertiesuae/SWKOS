import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BedDouble,
  Bot,
  Building2,
  CalendarCheck,
  CalendarDays,
  Clock,
  FileBarChart,
  FileSignature,
  HandCoins,
  KeyRound,
  MapPin,
  Maximize2,
  MessageCircle,
  Scale,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import { AnalyticsBento } from '@/components/ui/analytics-bento'
import { UiBadge } from '@/components/ui/badge'
import { JourneyWorkflowCanvas } from '../components/JourneyWorkflowCanvas'
import { get, post } from '../lib/api'
import { useMeta } from '../lib/meta'
import { useToast } from '../lib/toast'
import { fmtDate, fmtDateTime } from '../lib/format'
import { ErrorBox } from '../ui/kit'
import { AnimatedNumber, Card, EmptyState, Pill, ProgressRing, Reveal, RevealItem, Sparkline, aed, num } from '../swk/ui'
import { COMMUNITIES } from '../swk/uae'
import { buildSwkAnalyticsBentoProps } from '../swk/executive-analytics'
import { canAccessSwkAdminLogic, isRestrictedStaffUser } from '@shared/swk-staff-access'

const PHOTOS = [
  'marina-sky-penthouse-1',
  'palm-garden-homes-1',
  'hills-estate-golf-mansion-1',
  'business-bay-executive-tower-2',
  'creek-harbour-waterside-townhouse-1',
  'jvc-boulevard-residences-2',
  'arabian-ranches-courtyard-villa-2',
  'villa-sanctuary-6',
]
const photoFor = (id: number) => `/media/properties/${PHOTOS[Math.abs(id) % PHOTOS.length]}.webp`

function dubaiHour() {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', hour12: false }).format(new Date()))
}
function greeting() {
  const h = dubaiHour()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}
function buildWeekStrip() {
  const now = new Date()
  const day = now.getDay() || 7
  const mon = new Date(now)
  mon.setDate(now.getDate() - (day - 1))
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(mon)
    dt.setDate(mon.getDate() + i)
    return {
      key: dt.toISOString().slice(0, 10),
      wk: new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(dt),
      num: dt.getDate(),
      isToday: dt.toDateString() === now.toDateString(),
    }
  })
}

const STAGE_PROB: Record<string, number> = {
  Inquiry: 0.1,
  Closed: 1,
  Lead: 0.1,
  Viewing: 0.2,
  Offer: 0.4,
  Negotiation: 0.55,
  Contract: 0.75,
  'DLD Process': 0.9,
  Handover: 0.95,
}

type QueueTab = 'leads' | 'offers' | 'closes'

export function Dashboard() {
  const { me, can } = useMeta()
  const toast = useToast()
  const adminOk = canAccessSwkAdminLogic(me)
  const restricted = isRestrictedStaffUser(me)
  const [sendingBrief, setSendingBrief] = useState<string | null>(null)
  const [queueTab, setQueueTab] = useState<QueueTab>('leads')
  const [heroCommunity, setHeroCommunity] = useState<string>('All Dubai')
  const [heroSegment, setHeroSegment] = useState<'All' | 'Off-Plan' | 'Ready'>('All')

  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => get<any>('/api/dashboard'), refetchInterval: 120000 })
  const props = useQuery({ queryKey: ['dash-props'], queryFn: () => get<any>('/api/e/properties', { pageSize: 12, sort: 'listed_date', dir: 'desc' }), enabled: can('properties', 'view') && !restricted })
  const units = useQuery({ queryKey: ['dash-units'], queryFn: () => get<any>('/api/e/units', { pageSize: 500 }), enabled: can('properties', 'view') && !restricted })
  const pulse = useQuery({ queryKey: ['pulse'], queryFn: () => get<any>('/api/dashboard/pulse'), refetchInterval: 20000, retry: false })
  const brief = useQuery({ queryKey: ['ai-brief'], queryFn: () => get<{ output: string; started_at: string; name: string }>('/api/ai/brief'), retry: false, enabled: can('ai', 'view') && adminOk })
  const binQ = useQuery({ queryKey: ['dash-bin'], queryFn: () => get<any>('/api/swk-ops/recycle-bin'), enabled: adminOk })
  const withQ = useQuery({ queryKey: ['dash-withdrawals'], queryFn: () => get<any>('/api/swk-ops/withdrawals'), enabled: adminOk })

  const triggerBrief = async (kind: 'morning' | 'attendance-1030') => {
    setSendingBrief(kind)
    try {
      const r = await post<any>(`/api/swk-ops/briefings/${kind}`, {})
      toast.ok(
        kind === 'morning'
          ? 'Owner Morning Briefing sent to Shabib Siraj (WhatsApp & Notification)'
          : `10:30 AM Attendance Report generated (${r.summary?.lateAfter1005?.length ?? 0} late, ${r.summary?.continuousContemptors?.length ?? 0} contemptors)`,
      )
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSendingBrief(null)
    }
  }

  const d = q.data ?? {}
  const k = d.kpis ?? {}
  const ch = d.charts ?? {}
  const ls = d.lists ?? {}
  const propRows: any[] = props.data?.rows ?? []
  const unitRows: any[] = units.data?.rows ?? []
  const occupied = unitRows.filter(u => /leased|occupied|rented|sold/i.test(u.status ?? '')).length
  const rawOcc = unitRows.length ? (occupied / unitRows.length) * 100 : 0
  const funnel: any[] = ch.pipeline_funnel ?? []
  const pipelineTotal = funnel.filter(f => f.stage !== 'Closed').reduce((s, f) => s + (Number(f.value) || 0), 0)
  const activeDealCount = funnel.filter(f => f.stage !== 'Closed').reduce((s, f) => s + (Number(f.count) || 0), 0)
  const dailyProgressPct = rawOcc > 0
    ? rawOcc
    : Math.min(96, Math.max(24, Math.round(32 + activeDealCount * 9 + Number(k.viewings_week ?? 0) * 8 + Number(k.offers_pending ?? 0) * 10)))
  const weighted = funnel.filter(f => f.stage !== 'Closed').reduce((s, f) => s + (Number(f.value) || 0) * (STAGE_PROB[f.stage] ?? 0.3), 0)
  const weekDays = useMemo(() => buildWeekStrip(), [])
  const analyticsSig = [
    k.received_month ?? 0,
    k.leads_today ?? 0,
    k.viewings_week ?? 0,
    pipelineTotal,
    activeDealCount,
    Array.isArray(ch.revenue_trend) ? ch.revenue_trend.length : 0,
    pulse.data?.leads?.total ?? 0,
    pulse.data?.viewings?.total ?? 0,
    pulse.data?.calls?.total ?? 0,
    propRows.length,
  ].join('|')
  const analyticsProps = useMemo(
    () => buildSwkAnalyticsBentoProps(d, pulse.data, propRows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [analyticsSig],
  )

  const filteredSpotlight = useMemo(() => {
    const match = propRows.find(p => {
      const segOk = heroSegment === 'All' || (heroSegment === 'Off-Plan' ? Boolean(p.is_off_plan) : !p.is_off_plan)
      const commOk = heroCommunity === 'All Dubai' || String(p.address || p.title || '').toLowerCase().includes(heroCommunity.toLowerCase())
      return segOk && commOk
    })
    return match ?? propRows[0] ?? null
  }, [propRows, heroCommunity, heroSegment])

  const agenda = useMemo(
    () =>
      [
        ...(ls.upcoming_viewings ?? []).map((v: any) => ({ id: `v${v.id}`, kind: 'Viewing', tone: 'blue', at: v.scheduled_at, title: v.property_title || 'Property viewing', sub: [v.contact, v.agent].filter(Boolean).join(' · '), to: `/e/viewings/${v.id}`, Icon: CalendarCheck })),
        ...(ls.target_closes ?? []).map((j: any) => ({ id: `j${j.id}`, kind: 'Target close', tone: 'green', at: j.target_close, title: j.property || j.job_no, sub: j.client, to: `/e/jobs/${j.id}`, Icon: FileSignature })),
        ...(ls.renewals ?? []).map((l: any) => ({ id: `l${l.id}`, kind: 'Lease renewal', tone: 'amber', at: l.end_date, title: l.unit_title || 'Lease', sub: l.tenant, to: `/e/leases/${l.id}`, Icon: KeyRound })),
      ]
        .sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? '')))
        .slice(0, 4),
    [ls],
  )

  if (q.error) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />
  if (!q.data) return <DashboardSkeleton />

  const firstName = (me?.name || '').split(' ')[0] || 'there'
  const summary = [
    k.viewings_week !== undefined && `${k.viewings_week} viewing${k.viewings_week === 1 ? '' : 's'} this week`,
    k.offers_pending !== undefined && `${k.offers_pending} offer${k.offers_pending === 1 ? '' : 's'} awaiting decision`,
    k.leads_today !== undefined && `${k.leads_today} new lead${k.leads_today === 1 ? '' : 's'} today`,
  ]
    .filter(Boolean)
    .join(' · ')

  const heroImage = filteredSpotlight ? photoFor(filteredSpotlight.id) : '/brand/web/uae-skyline-flagship.webp'
  const mandatesCompliant = Math.max(0, Number(k.mandates_active ?? 0) - Number(k.mandates_expiring ?? 0))
  const totalMandates = Math.max(1, Number(k.mandates_active ?? 0))
  const compliancePct = Math.round((mandatesCompliant / totalMandates) * 100)

  const leadRows: any[] = ls.lead_queue ?? []
  const offerRows: any[] = ls.offers_pipeline ?? []
  const closeRows: any[] = ls.target_closes ?? []

  return (
    <div className="grid gap-5 max-w-[1540px] mx-auto pb-10">
      {/* ============================================================ SECTION 1: ORIZON REAL ESTATE HERO + PRODUCTIVITY SCHEDULE */}
      <motion.section
        className="grid gap-5 xl:grid-cols-12 items-stretch"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Left 8 cols: Orizon-Inspired Architectural Luxury Real Estate Hero Card */}
        <div className="xl:col-span-8 relative overflow-hidden rounded-[30px] bg-[#0b1f2a] min-h-[420px] sm:min-h-[450px] p-4 sm:p-6 flex flex-col justify-between gap-5 shadow-[0_24px_60px_-24px_rgba(11,31,42,0.38)]">
          {/* Background Property Photography + Legible Atmospheric Gradient Scrim */}
          <img
            src={heroImage}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover object-center scale-[1.01]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(11,31,42,0.52) 0%, rgba(11,31,42,0.38) 42%, rgba(11,31,42,0.82) 100%)',
            }}
          />

          {/* Top Floating Filter Pill Bar (Image 5 carved capsule aesthetic) */}
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-2.5">
            <Link
              to="/e/properties"
              className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-4 py-2 text-[12.5px] font-bold text-[#0f172a] no-underline shadow-sm hover:bg-[#d4a752] transition-colors"
            >
              Sales <ArrowUpRight size={14} />
            </Link>

            <div className="hidden md:flex items-center gap-3 rounded-full bg-white/95 px-4 py-1.5 text-[12px] text-[#0f172a] shadow-md backdrop-blur-md">
              <label className="flex items-center gap-1.5">
                <MapPin size={13} className="text-[#2563eb] shrink-0" />
                <select
                  aria-label="Filter spotlight community"
                  value={heroCommunity}
                  onChange={e => setHeroCommunity(e.target.value)}
                  className="bg-transparent border-0 text-[12px] font-semibold text-[#0f172a] outline-none cursor-pointer pr-1"
                >
                  <option value="All Dubai">All Dubai</option>
                  <option value="Marina">Dubai Marina</option>
                  <option value="Downtown">Downtown</option>
                  <option value="Palm">Palm Jumeirah</option>
                  <option value="Creek">Creek Harbour</option>
                </select>
              </label>
              <span className="h-4 w-px bg-[#e2e8f0]" aria-hidden="true" />
              <div className="flex items-center gap-1">
                {(['All', 'Off-Plan', 'Ready'] as const).map(seg => (
                  <button
                    key={seg}
                    type="button"
                    onClick={() => setHeroSegment(seg)}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold border-0 cursor-pointer transition-colors ${
                      heroSegment === seg ? 'bg-[#0f172a] text-white' : 'bg-transparent text-[#475569] hover:text-[#0f172a]'
                    }`}
                  >
                    {seg}
                  </button>
                ))}
              </div>
              <span className="h-4 w-px bg-[#e2e8f0]" aria-hidden="true" />
              <span className="font-mono text-[11.5px] font-bold text-[#047857]">
                {aed(pipelineTotal, { compact: true })}
              </span>
            </div>

            <Link
              to="/e/leases"
              className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-4 py-2 text-[12.5px] font-bold text-[#0f172a] no-underline shadow-sm hover:bg-[#d4a752] transition-colors"
            >
              Leasing <ArrowUpRight size={14} />
            </Link>
          </div>

          {/* Center Editorial Greeting */}
          <div className="relative z-10 max-w-[600px] py-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-[#0b1f2a]/55 px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#fde68a] backdrop-blur-md">
              <span className="size-1.5 rounded-full bg-[#34d399]" />
              SWK Properties Dubai · {new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date())}
            </div>
            <h1 className="mt-3 mb-0 text-[32px] sm:text-[42px] font-bold tracking-[-0.035em] text-white leading-[1.05] drop-shadow-sm">
              {greeting()}, <span className="text-[#fde68a]">{firstName}</span>
            </h1>
            <p className="mt-2 mb-0 text-[13.5px] sm:text-[14.5px] text-white/90 font-medium">
              {summary || 'Live Dubai brokerage pipeline, verified listings, viewings & commission health.'}
            </p>
          </div>

          {/* Bottom Split: Left Solid White Portfolio Notch Card + Right Frosted Glass Featured Listing Card (Image 5) */}
          <div className="relative z-10 grid gap-3.5 md:grid-cols-12 items-end">
            {/* Bottom-Left Solid White Carved Portfolio Card */}
            <div className="md:col-span-5 rounded-[24px] bg-white p-4 text-[#0f172a] shadow-[0_14px_34px_-14px_rgba(15,23,42,0.32)]">
              <div className="text-[14px] font-bold tracking-[-0.02em] text-[#0f172a]">Active Dubai Portfolio</div>
              <p className="m-0 mt-1 text-[11.5px] leading-snug text-[#526273]">
                Verified Form A listings, off-plan launches &amp; managed units ready to close.
              </p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <div>
                  <div className="font-display text-[24px] font-extrabold leading-none text-[#0f172a] tabular-nums">
                    <AnimatedNumber value={Number(k.properties_available ?? propRows.length ?? 0)} />+
                  </div>
                  <div className="mt-0.5 text-[10.5px] font-semibold text-[#526273]">
                    Weighted GCI {aed(weighted * 0.02, { compact: true })}
                  </div>
                </div>
                <div className="flex items-center">
                  <div className="flex -space-x-2 mr-2">
                    {[1, 2, 3].map(idx => (
                      <img
                        key={idx}
                        src={photoFor(idx)}
                        alt=""
                        aria-hidden="true"
                        className="size-8 rounded-full object-cover ring-2 ring-white"
                      />
                    ))}
                  </div>
                  <Link
                    to="/listings"
                    aria-label="Open Listing Studio"
                    className="flex size-9 items-center justify-center rounded-full bg-[#0f172a] text-white no-underline hover:bg-[#2563eb] transition-colors"
                  >
                    <ArrowUpRight size={15} />
                  </Link>
                </div>
              </div>
            </div>

            {/* Bottom-Right Frosted Glass Spotlight Property Card */}
            <div className="md:col-span-7 rounded-[24px] border border-white/25 bg-[#0b1f2a]/68 p-4 text-white backdrop-blur-xl shadow-[0_16px_36px_-14px_rgba(11,31,42,0.5)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span className="rounded-full bg-white/18 px-2.5 py-0.5 text-[10.5px] font-bold text-white">
                      {filteredSpotlight?.is_off_plan ? 'Off-Plan Launch' : 'Ready Flagship'}
                    </span>
                    {filteredSpotlight?.rera_permit_no && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#047857] px-2 py-0.5 text-[10px] font-bold text-white">
                        <BadgeCheck size={11} /> RERA Verified
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[16px] font-bold text-white">
                    {filteredSpotlight?.title || 'Dubai Marina Sky Residence'}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[11.5px] text-white/80 truncate">
                    <MapPin size={12} className="text-[#fde68a] shrink-0" />
                    <span className="truncate">{filteredSpotlight?.address || 'Dubai Marina, UAE'}</span>
                  </div>
                </div>
                <Link
                  to={filteredSpotlight ? `/e/properties/${filteredSpotlight.id}` : '/listings'}
                  aria-label="View featured property"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-[#0f172a] no-underline hover:bg-[#fde68a] transition-colors"
                >
                  <ArrowUpRight size={16} />
                </Link>
              </div>

              <div className="mt-3 pt-2.5 border-t border-white/15 flex flex-wrap items-center justify-between gap-2 text-[12px]">
                <div className="flex items-center gap-3 text-white/85">
                  <span className="inline-flex items-center gap-1">
                    <BedDouble size={13} className="text-[#fde68a]" />
                    {filteredSpotlight?.bedrooms ? `${filteredSpotlight.bedrooms} BR` : '2 BR'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Maximize2 size={12} className="text-[#fde68a]" />
                    {num(filteredSpotlight?.area_sqft || 1840)} sqft
                  </span>
                </div>
                <div className="font-mono text-[15px] font-bold text-[#fde68a] tabular-nums">
                  {filteredSpotlight?.price
                    ? aed(filteredSpotlight.price, { compact: true })
                    : filteredSpotlight?.rent_annual
                      ? `${aed(filteredSpotlight.rent_annual, { compact: true })}/yr`
                      : aed(pipelineTotal || 3450000, { compact: true })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right 4 cols: Image 1 Productivity Dark Progress Card + White Task Schedule Card */}
        <div className="xl:col-span-4 flex flex-col gap-4">
          {/* Dark Today's Progress Card (Exact Image 1 black card with lime ring) */}
          <div className="rounded-[26px] bg-gradient-to-br from-[#12161d] via-[#17212b] to-[#0b131a] p-5 text-white shadow-[0_18px_40px_-20px_rgba(11,31,42,0.48)]">
            <div className="flex items-center justify-between gap-2 mb-3.5">
              <span className="text-[13px] font-semibold text-white/90">Today&apos;s Progress</span>
              {!restricted && (
                <Link
                  to="/pipeline"
                  className="inline-flex items-center gap-1 rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-semibold text-[#c5e86c] no-underline hover:bg-white/20 transition-colors"
                >
                  Pipeline <ArrowUpRight size={12} />
                </Link>
              )}
            </div>
            <div className="flex items-center gap-4">
              <ProgressRing
                value={dailyProgressPct}
                size={92}
                stroke={9}
                color="#c5e86c"
                track="rgba(255,255,255,0.14)"
                label={<span className="text-white text-[18px] font-bold">{dailyProgressPct.toFixed(0)}%</span>}
                sub={<span className="text-white/65 text-[10px]">target</span>}
              />
              <div className="flex-1 grid gap-2 text-[12px]">
                <Link to="/e/leads" className="flex items-center justify-between rounded-xl bg-white/[0.07] px-3 py-1.5 text-white no-underline hover:bg-white/[0.13] transition-colors">
                  <span className="text-white/75 flex items-center gap-1.5"><UserPlus size={12} className="text-[#c5e86c]" /> Leads today</span>
                  <b className="font-mono text-[13px]">{num(k.leads_today ?? 0)}</b>
                </Link>
                <Link to="/e/viewings" className="flex items-center justify-between rounded-xl bg-white/[0.07] px-3 py-1.5 text-white no-underline hover:bg-white/[0.13] transition-colors">
                  <span className="text-white/75 flex items-center gap-1.5"><CalendarCheck size={12} className="text-[#38bdf8]" /> Viewings 7d</span>
                  <b className="font-mono text-[13px]">{num(k.viewings_week ?? 0)}</b>
                </Link>
                <Link to="/e/offers" className="flex items-center justify-between rounded-xl bg-white/[0.07] px-3 py-1.5 text-white no-underline hover:bg-white/[0.13] transition-colors">
                  <span className="text-white/75 flex items-center gap-1.5"><HandCoins size={12} className="text-[#fde68a]" /> Pending offers</span>
                  <b className="font-mono text-[13px]">{num(k.offers_pending ?? 0)}</b>
                </Link>
              </div>
            </div>
          </div>

          {/* Task Schedule Card (Exact Image 1 capsule day strip + agenda items) */}
          <div className="flex-1 rounded-[26px] border border-line bg-card/95 p-5 shadow-[0_12px_32px_-20px_rgba(15,23,42,0.12)] flex flex-col justify-between gap-3.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="m-0 text-[16px] font-bold text-ink">Task Schedule</h2>
                <p className="m-0 text-[11.5px] text-muted">Viewings, closes &amp; renewals</p>
              </div>
              <Link
                to="/calendar"
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-soft px-3 py-1.5 text-[11.5px] font-semibold text-ink no-underline hover:bg-primary hover:text-primary-foreground transition-colors"
              >
                <CalendarDays size={13} /> Calendar
              </Link>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {weekDays.map(wd => (
                <div
                  key={wd.key}
                  className={`flex flex-col items-center justify-center rounded-full py-2 text-center ${
                    wd.isToday
                      ? 'bg-[#0f172a] text-white dark:bg-[#c5e86c] dark:text-[#0b1f2a] shadow-sm'
                      : 'bg-soft text-body'
                  }`}
                >
                  <span className={`text-[9.5px] font-semibold ${wd.isToday ? 'text-[#c5e86c] dark:text-[#0b1f2a]/75' : 'text-muted'}`}>{wd.wk}</span>
                  <span className="mt-0.5 text-[12.5px] font-bold">{wd.num}</span>
                </div>
              ))}
            </div>

            <div className="space-y-2 max-h-[156px] overflow-y-auto pr-0.5">
              {agenda.length === 0 ? (
                <div className="rounded-2xl bg-soft p-3.5 text-center text-xs text-muted">
                  Clear schedule for the next few days.
                </div>
              ) : (
                agenda.slice(0, 3).map(a => (
                  <Link
                    key={a.id}
                    to={a.to}
                    className="flex items-center gap-2.5 rounded-2xl border border-line bg-soft px-3 py-2 no-underline hover:border-ink hover:bg-card transition-colors"
                  >
                    <span
                      className={`size-8 rounded-xl grid place-items-center shrink-0 ${
                        a.tone === 'blue'
                          ? 'bg-[#eff6ff] text-[#1d4ed8]'
                          : a.tone === 'green'
                            ? 'bg-[#ecfdf5] text-[#047857]'
                            : 'bg-[#fef7e6] text-[#92400e]'
                      }`}
                    >
                      <a.Icon size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-bold text-ink">{a.title}</div>
                      <div className="truncate text-[11px] text-muted">
                        {a.kind} · {a.kind === 'Viewing' ? fmtDateTime(a.at) : fmtDate(a.at)}
                      </div>
                    </div>
                    <ArrowUpRight size={13} className="text-muted shrink-0" />
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </motion.section>

      {/* Attention Alerts (only shown when live alerts exist) */}
      {d.alerts?.length > 0 && (
        <Reveal className="grid gap-2.5 sm:grid-cols-2">
          {d.alerts.slice(0, 4).map((a: any, i: number) => (
            <RevealItem key={i}>
              <Link
                to={a.link}
                className="flex items-center gap-3 rounded-2xl border px-4 py-3 text-[13px] font-semibold no-underline transition-all hover:-translate-y-0.5"
                style={{
                  background: a.level === 'danger' ? '#fef2f2' : a.level === 'warn' ? '#fffbeb' : '#eff6ff',
                  borderColor: a.level === 'danger' ? '#fecaca' : a.level === 'warn' ? '#fde68a' : '#bfdbfe',
                  color: '#0f172a',
                }}
              >
                <AlertTriangle size={16} color={a.level === 'danger' ? '#dc2626' : a.level === 'warn' ? '#d97706' : '#2563eb'} />
                <span className="flex-1 min-w-0 truncate" dir="auto">{a.text}</span>
                <ArrowRight size={14} className="shrink-0" />
              </Link>
            </RevealItem>
          ))}
        </Reveal>
      )}

      {/* ============================================================ SECTION 2: CONNECTED DEAL & CUSTOMER JOURNEYS (Image 2 + 3 + 4) */}
      <JourneyWorkflowCanvas kpis={k} dealCount={activeDealCount} adminOk={adminOk} restricted={restricted} />

      {/* ============================================================ SECTION 3: LIVE EXECUTIVE ANALYTICS BENTO (Single Unified Suite) */}
      <section aria-label="Executive Analytics Bento" className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="swk-eyebrow">Executive Intelligence</div>
            <h2 className="m-0 text-[20px] font-bold text-ink">Live Brokerage Revenue, Divisions &amp; Seasonality</h2>
          </div>
          {can('reports', 'view') && !restricted && (
            <Link to="/reports" className="btn navy sm">
              <FileBarChart size={14} /> Reports &amp; Statements
            </Link>
          )}
        </div>
        <AnalyticsBento
          currency="AED "
          credit={false}
          revenue={analyticsProps.revenue}
          sessions={analyticsProps.sessions}
          categories={analyticsProps.categories}
          seasonality={analyticsProps.seasonality}
        />
      </section>

      {/* ============================================================ SECTION 4: IMAGE 2 BOTTOM SPLIT (TABLE + RADIAL JOURNEY METRICS) */}
      <Reveal className="grid gap-5 xl:grid-cols-12 items-stretch">
        {/* Left 7 cols: Tabbed Active Queues Table + Live Pipeline Stage Breakdown (Symmetric height) */}
        <div className="xl:col-span-7 rounded-[28px] border border-line bg-card/95 p-5 shadow-[0_14px_36px_-22px_rgba(15,23,42,0.12)] flex flex-col justify-between gap-4">
          <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="m-0 text-[18px] font-bold text-ink">Active Pipeline &amp; Queues</h2>
              <p className="m-0 text-[12px] text-muted">Click any row to open the full record immediately</p>
            </div>
            <div className="inline-flex items-center rounded-full border border-line bg-soft p-1">
              {(
                [
                  { id: 'leads', label: `Leads (${leadRows.length})` },
                  { id: 'offers', label: `Offers (${offerRows.length})` },
                  { id: 'closes', label: `Closing (${closeRows.length})` },
                ] as { id: QueueTab; label: string }[]
              ).map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setQueueTab(t.id)}
                  className={`rounded-full px-3 py-1 text-[11.5px] font-semibold border-0 cursor-pointer transition-colors ${
                    queueTab === t.id ? 'bg-primary text-primary-foreground' : 'bg-transparent text-muted hover:text-ink'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {queueTab === 'leads' && (
            leadRows.length === 0 ? (
              <EmptyState title="Inbox zero" hint="New portal, WhatsApp and website enquiries land here." />
            ) : (
              <div className="divide-y divide-line">
                {leadRows.slice(0, 6).map((l: any) => (
                  <Link
                    key={l.id}
                    to={`/e/leads/${l.id}`}
                    className="flex items-center justify-between gap-3 py-3 px-2 -mx-2 rounded-2xl no-underline hover:bg-hover transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#eff6ff] text-[#1d4ed8]">
                        <Users size={15} />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-bold text-ink">{l.contact_name || l.company}</div>
                        <div className="truncate text-[11.5px] text-muted">{[l.source, l.phone].filter(Boolean).join(' · ') || 'Direct inquiry'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-[12.5px] font-bold text-ink tabular-nums">
                        {l.est_value ? aed(l.est_value, { compact: true }) : '—'}
                      </span>
                      <UiBadge variant={/new/i.test(l.status) ? 'destructive' : 'secondary'}>{l.status}</UiBadge>
                    </div>
                  </Link>
                ))}
              </div>
            )
          )}

          {queueTab === 'offers' && (
            offerRows.length === 0 ? (
              <EmptyState title="No pending offers" hint="Submitted and negotiating offers appear here." />
            ) : (
              <div className="divide-y divide-line">
                {offerRows.slice(0, 6).map((o: any) => (
                  <Link
                    key={o.id}
                    to={`/e/offers/${o.id}`}
                    className="flex items-center justify-between gap-3 py-3 px-2 -mx-2 rounded-2xl no-underline hover:bg-hover transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#fef7e6] text-[#92400e]">
                        <HandCoins size={15} />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-bold text-ink">{o.property_title}</div>
                        <div className="truncate text-[11.5px] text-muted">{o.buyer} · {fmtDate(o.offer_date)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-[12.5px] font-bold text-ink tabular-nums">
                        {aed(o.offer_price, { compact: true })}
                      </span>
                      <UiBadge variant="warning">{o.status}</UiBadge>
                    </div>
                  </Link>
                ))}
              </div>
            )
          )}

          {queueTab === 'closes' && (
            closeRows.length === 0 ? (
              <EmptyState title="No target closes this week" hint="Active deal closing folders with target transfer dates appear here." />
            ) : (
              <div className="divide-y divide-line">
                {closeRows.slice(0, 6).map((j: any) => (
                  <Link
                    key={j.id}
                    to={`/e/jobs/${j.id}`}
                    className="flex items-center justify-between gap-3 py-3 px-2 -mx-2 rounded-2xl no-underline hover:bg-hover transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#ecfdf5] text-[#047857]">
                        <FileSignature size={15} />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-bold text-ink">{j.property || j.job_no}</div>
                        <div className="truncate text-[11.5px] text-muted">{j.client} · Target {fmtDate(j.target_close)}</div>
                      </div>
                    </div>
                    <UiBadge variant="success">Closing</UiBadge>
                  </Link>
                ))}
              </div>
            )
          )}
          </div>

          {/* Live Pipeline Stage Summary Footer inside Left Card */}
          <div className="border-t border-line pt-4">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <span className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-muted">Sales Pipeline by Stage</span>
              <Link to="/pipeline" className="text-[12px] font-semibold text-[#1d4ed8] dark:text-[#93c5fd] no-underline hover:underline">
                Open Pipeline →
              </Link>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {(funnel.length > 0 ? funnel.slice(0, 6) : [{ stage: 'Lead', count: 0, value: 0 }, { stage: 'Viewing', count: Number(k.viewings_week ?? 0), value: 0 }, { stage: 'Offer', count: Number(k.offers_pending ?? 0), value: pipelineTotal }]).map(s => (
                <Link
                  key={s.stage}
                  to="/pipeline"
                  className="flex items-center justify-between rounded-2xl border border-line bg-soft px-3 py-2 no-underline hover:border-ink transition-colors"
                >
                  <span className="truncate text-[12px] font-semibold text-body">{s.stage}</span>
                  <span className="font-mono text-[12px] font-bold text-ink tabular-nums">
                    {Number(s.count) || 0} · {aed(Number(s.value) || 0, { compact: true })}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Right 5 cols: Pastel Journey Health Rings (Image 2 bottom-right) + Live Dubai Market Pulse */}
        <div className="xl:col-span-5 grid gap-4">
          <div className="rounded-[28px] border border-line bg-card/95 p-5 shadow-[0_14px_36px_-22px_rgba(15,23,42,0.12)]">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="m-0 text-[18px] font-bold text-ink">Brokerage Health</h2>
                <p className="m-0 text-[12px] text-muted">Deals, units &amp; RERA compliance</p>
              </div>
              <Link to="/rera" className="btn outline sm">RERA Centre</Link>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Active Deals', val: activeDealCount, pct: Math.min(100, Math.max(25, activeDealCount * 12)), bg: '#eff6ff', ring: '#2563eb', text: '#1e3a8a', to: '/pipeline' },
                { label: 'Managed', val: unitRows.length || Number(k.properties_available ?? 0), pct: dailyProgressPct, bg: '#fff1f2', ring: '#e11d48', text: '#881337', to: '/e/units' },
                { label: 'RERA OK', val: `${compliancePct}%`, pct: compliancePct, bg: '#ecfdf5', ring: '#047857', text: '#064e3b', to: '/compliance' },
              ].map(m => (
                <Link
                  key={m.label}
                  to={m.to}
                  className="flex flex-col items-center justify-center rounded-[22px] p-3.5 text-center no-underline transition-transform hover:-translate-y-0.5"
                  style={{ background: m.bg }}
                >
                  <ProgressRing
                    value={m.pct}
                    size={68}
                    stroke={6}
                    color={m.ring}
                    track="rgba(15,23,42,0.09)"
                    label={<span className="font-mono text-[14px] font-bold" style={{ color: m.text }}>{m.val}</span>}
                  />
                  <span className="mt-2 text-[11.5px] font-bold" style={{ color: m.text }}>{m.label}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-line bg-card/95 p-5 shadow-[0_14px_36px_-22px_rgba(15,23,42,0.12)]">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="m-0 text-[16px] font-bold text-ink">Dubai Market Pulse</h2>
                <p className="m-0 text-[11.5px] text-muted">Price per sq ft · YoY growth</p>
              </div>
              <Link to="/market" className="no-underline"><Pill tone="oasis">Live Index</Pill></Link>
            </div>
            <div className="grid gap-1">
              {COMMUNITIES.slice(0, 4).map(c => {
                const yoy = ((c.ppsf - c.ppsfLY) / c.ppsfLY) * 100
                return (
                  <Link key={c.id} to="/market" className="flex items-center gap-3 py-1.5 rounded-2xl hover:bg-hover px-2 -mx-2 transition-colors no-underline">
                    <span className="w-9 h-9 rounded-xl bg-cover bg-center flex-none" style={{ backgroundImage: `url(${c.image.replace('.webp', '-640.webp')}), url(${c.image})` }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-bold text-ink truncate">{c.name}</span>
                      <span className="block text-[11.5px] text-muted">AED {num(c.ppsf)}/sqft · {c.yieldPct}% yield</span>
                    </span>
                    <Sparkline data={c.trend} width={58} height={22} color="#047857" />
                    <span className="rounded-full bg-[#ecfdf5] px-2 py-0.5 text-[11px] font-bold text-[#047857] shrink-0">+{yoy.toFixed(1)}%</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </Reveal>

      {/* ============================================================ LEADERSHIP GOVERNANCE & AI BRIEFING */}
      {adminOk && (
        <Reveal className="rounded-[24px] border border-line bg-card/95 p-5 shadow-2xs">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="space-y-0.5 min-w-0">
              <div className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                <ShieldCheck size={15} className="text-[#047857] dark:text-[#34d399]" /> Leadership Governance &amp; Briefings
              </div>
              <div className="text-xs text-muted">
                Mon–Fri 10am–7pm · Sat 10am–4pm · 10:05 Grace · Owner: Shabib Siraj · Operations: Mohammad Haseeb
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" className="btn outline sm" disabled={sendingBrief !== null} onClick={() => void triggerBrief('morning')}>
                <MessageCircle size={13} /> {sendingBrief === 'morning' ? 'Sending…' : 'Morning Briefing'}
              </button>
              <button type="button" className="btn outline sm" disabled={sendingBrief !== null} onClick={() => void triggerBrief('attendance-1030')}>
                <Clock size={13} /> {sendingBrief === 'attendance-1030' ? 'Running…' : '10:30 Attendance'}
              </button>
              <Link to="/recycle-bin" className="btn red sm">
                <Trash2 size={13} /> Bin ({binQ.data?.counts?.pending ?? 0})
              </Link>
              <Link to="/withdrawals" className="btn emerald sm">
                <Scale size={13} /> Withdrawals ({(withQ.data?.items ?? []).length})
              </Link>
            </div>
          </div>
        </Reveal>
      )}

      {brief.data?.output && (
        <Reveal>
          <Card
            title={<span className="inline-flex items-center gap-2"><Bot size={18} className="text-[#d4a752]" />{brief.data.name} · today&apos;s briefing</span>}
            subtitle={String(brief.data.started_at).replace('T', ' ').slice(0, 16)}
            to="/ai"
            tone="navy"
          >
            <div dir="auto" className="text-[13.5px] whitespace-pre-line leading-relaxed text-[#e2e8f0] max-h-[220px] overflow-auto">
              {brief.data.output}
            </div>
          </Card>
        </Reveal>
      )}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-5 max-w-[1540px] mx-auto" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid gap-5 xl:grid-cols-12">
        <div className="xl:col-span-8 h-[420px] rounded-[30px] bg-[#0b1f2a]/90 animate-pulse" />
        <div className="xl:col-span-4 grid gap-4">
          <div className="h-[175px] rounded-[26px] bg-[#12161d] animate-pulse" />
          <div className="h-[225px] rounded-[26px] bg-card border border-line animate-pulse" />
        </div>
      </div>
      <div className="h-[320px] rounded-[30px] bg-card border border-line animate-pulse" />
    </div>
  )
}
void Building2
