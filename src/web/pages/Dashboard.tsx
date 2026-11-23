import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PulseCard, ActivityTimeline } from '../components/PulseCards'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Bot,
  Building2,
  Calculator,
  CalendarCheck,
  CalendarDays,
  Clock,
  FileSignature,
  Gavel,
  HandCoins,
  KeyRound,
  MapPin,
  Megaphone,
  MessageCircle,
  Percent,
  PhoneCall,
  Plus,
  Rocket,
  Scale,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react'
import { get, post } from '../lib/api'
import { useMeta } from '../lib/meta'
import { useToast } from '../lib/toast'
import { fmtDate, fmtDateTime } from '../lib/format'
import { ErrorBox } from '../ui/kit'
import { AnimatedNumber, Bar, CHART, Card, EmptyState, Pill, ProgressRing, Reveal, RevealItem, SWK, Sparkline, aed, num, rise } from '../swk/ui'
import { COMMUNITIES } from '../swk/uae'
import { canAccessSwkAdminLogic, isAllowedPathForRestrictedStaff, isRestrictedStaffUser } from '@shared/swk-staff-access'

const PHOTOS = [
  'marina-sky-penthouse-1',
  'palm-garden-homes-1',
  'hills-estate-golf-mansion-1',
  'business-bay-executive-tower-2',
  'creek-harbour-waterside-townhouse-1',
  'jvc-boulevard-residences-2',
  'arabian-ranches-courtyard-villa-2',
  'villa-sanctuary-6',
  'islands-2-1',
  'river-cove-residences-1',
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

type DeptFilter = 'all' | 'offplan' | 'secondary' | 'leasing'

export function Dashboard() {
  const { me, can } = useMeta()
  const toast = useToast()
  const adminOk = canAccessSwkAdminLogic(me)
  const restricted = isRestrictedStaffUser(me)
  const [sendingBrief, setSendingBrief] = useState<string | null>(null)
  const [deptFilter, setDeptFilter] = useState<DeptFilter>('all')

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
  const unitRows: any[] = units.data?.rows ?? []
  const occupied = unitRows.filter(u => /leased|occupied|rented|sold/i.test(u.status ?? '')).length
  const occupancy = unitRows.length ? (occupied / unitRows.length) * 100 : 0
  const funnel: any[] = ch.pipeline_funnel ?? []
  const funnelMax = Math.max(1, ...funnel.map(s => Number(s.count) || 0))
  const pipelineTotal = funnel.filter(f => f.stage !== 'Closed').reduce((s, f) => s + (Number(f.value) || 0), 0)
  const weighted = funnel.filter(f => f.stage !== 'Closed').reduce((s, f) => s + (Number(f.value) || 0) * (STAGE_PROB[f.stage] ?? 0.3), 0)
  const trend: any[] = ch.revenue_trend ?? []
  const weekDays = useMemo(() => buildWeekStrip(), [])

  const agenda = useMemo(
    () =>
      [
        ...(ls.upcoming_viewings ?? []).map((v: any) => ({ id: `v${v.id}`, kind: 'Viewing', tone: 'blue', at: v.scheduled_at, title: v.property_title || 'Property viewing', sub: [v.contact, v.agent].filter(Boolean).join(' · '), to: `/e/viewings/${v.id}`, Icon: CalendarCheck })),
        ...(ls.target_closes ?? []).map((j: any) => ({ id: `j${j.id}`, kind: 'Target close', tone: 'green', at: j.target_close, title: j.property || j.job_no, sub: j.client, to: `/e/jobs/${j.id}`, Icon: FileSignature })),
        ...(ls.renewals ?? []).map((l: any) => ({ id: `l${l.id}`, kind: 'Lease renewal', tone: 'amber', at: l.end_date, title: l.unit_title || 'Lease', sub: l.tenant, to: `/e/leases/${l.id}`, Icon: KeyRound })),
      ]
        .sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? '')))
        .slice(0, 6),
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

  const workflowSteps = [
    { step: '01', title: 'Inventory & A2A', sub: 'Properties & units', to: '/e/properties', depts: ['all', 'offplan', 'secondary', 'leasing'] },
    { step: '02', title: 'Portal Listing', sub: 'Bayut & Form A', to: '/listings', depts: ['all', 'offplan', 'secondary', 'leasing'] },
    { step: '03', title: 'Leads Intake', sub: 'Enquiries & routing', to: '/e/leads', depts: ['all', 'offplan', 'secondary', 'leasing'] },
    { step: '04', title: 'Follow-Ups', sub: 'Calls & callbacks', to: '/e/activities', depts: ['all', 'offplan', 'secondary', 'leasing'] },
    { step: '05', title: 'Site Visits', sub: 'Viewings & Market', to: '/e/viewings', depts: ['all', 'offplan', 'secondary', 'leasing'] },
    { step: '06', title: 'Closing File', sub: 'Form F / SPA / Ejari', to: '/e/jobs', depts: ['all', 'offplan', 'secondary', 'leasing'] },
    { step: '07', title: 'UAE Receipts', sub: 'Escrow & PDCs', to: '/e/receipts', depts: ['all', 'offplan', 'secondary', 'leasing'] },
    { step: '08', title: '50/50 Split', sub: 'Agent commissions', to: '/e/agent_commissions', depts: ['all', 'offplan', 'secondary', 'leasing'] },
    ...(adminOk ? [{ step: '09', title: 'Withdrawals', sub: 'Refunds & sign-off', to: '/withdrawals', depts: ['all', 'offplan', 'secondary'] }] : []),
    { step: '10', title: adminOk ? 'Attendance' : 'QR Check-In', sub: adminOk ? 'Daily logs & reports' : 'Scan office QR', to: adminOk ? '/e/attendance' : '/reception-qr', depts: ['all', 'offplan', 'secondary', 'leasing'] },
  ].filter(st => (!restricted || isAllowedPathForRestrictedStaff(st.to)) && st.depts.includes(deptFilter))

  const kpiCards = [
    { label: 'Leads today', value: Number(k.leads_today ?? 0), hint: `${k.leads_qualified ?? 0} qualified`, icon: UserPlus, to: '/e/leads', bg: '#eff6ff', fg: '#2563eb', border: '#dbeafe' },
    { label: 'Viewings · 7d', value: Number(k.viewings_week ?? 0), hint: `${k.viewings_missed ?? 0} no-shows (30d)`, icon: CalendarCheck, to: '/e/viewings', bg: '#ecfdf5', fg: '#047857', border: '#d1fae5' },
    { label: 'Offers pending', value: Number(k.offers_pending ?? 0), hint: 'Awaiting decision', icon: HandCoins, to: '/e/offers', bg: '#fef7e6', fg: '#b78328', border: '#fde68a' },
    { label: 'Live listings', value: Number(k.properties_available ?? 0), hint: `${k.properties_reserved ?? 0} under offer`, icon: Building2, to: '/listings', bg: '#f5f3ff', fg: '#7c3aed', border: '#ede9fe' },
    { label: 'Commission MTD', value: Number(k.received_month ?? 0), format: (v: number) => aed(v, { compact: true }), hint: 'Collected AED', icon: Percent, to: '/e/receipts', bg: '#f0fdfa', fg: '#0d9488', border: '#ccfbf1' },
    { label: 'Rent arrears', value: Number(k.arrears_aed ?? 0), format: (v: number) => aed(v, { compact: true }), hint: `${k.arrears_count ?? 0} cheques due`, icon: Wallet, to: '/pdc', bg: '#fef2f2', fg: '#dc2626', border: '#fee2e2' },
  ]

  return (
    <div className="grid gap-5 max-w-[1640px] mx-auto pb-8">
      {/* ------------------------------------------------------------ Executive Bento Hero */}
      <motion.section
        className="grid gap-5 xl:grid-cols-12 items-stretch"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Obsidian Executive Hero Card (Editorial Progress + Live Metrics + Sequential Quick Actions) */}
        <div className="xl:col-span-8 rounded-[26px] bg-gradient-to-br from-[#0b1f2a] via-[#112d3d] to-[#081720] p-5 sm:p-7 text-white shadow-[0_24px_56px_-22px_rgba(11,31,42,0.42)] flex flex-col justify-between gap-5">
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] items-center">
            <div className="min-w-0">
              <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#d4a752]">
                <span className="size-1.5 rounded-full bg-[#34d399] shrink-0" />
                <span className="truncate">SWK Executive Desk · {new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date())}</span>
              </div>
              <h1 className="mt-3 mb-0 text-[28px] sm:text-[38px] font-bold tracking-[-0.035em] text-white leading-[1.08]">
                {greeting()}, <span className="text-[#d4a752]">{firstName}</span>
              </h1>
              <p className="mt-2 mb-0 text-[14px] text-[#cbd5e1] max-w-[540px]">
                {summary || 'Real-time brokerage pipeline, Dubai inventory, leasing collections, and compliance health.'}
              </p>
            </div>

            <div className="flex items-center justify-between sm:justify-start gap-4 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-md">
              <ProgressRing value={occupancy} size={86} stroke={8} color="#a3e635" track="rgba(255,255,255,0.14)" label={<span className="text-white">{occupancy.toFixed(0)}%</span>} sub={<span className="text-[#94a3b8]">occ.</span>} />
              <div className="grid gap-1.5 text-xs">
                <div><span className="text-[#94a3b8] block text-[10.5px] uppercase tracking-wider">Pipeline</span><b className="text-[16px] text-white"><AnimatedNumber value={pipelineTotal} format={x => aed(x, { compact: true })} /></b></div>
                <div><span className="text-[#94a3b8] block text-[10.5px] uppercase tracking-wider">Weighted GCI</span><b className="text-[15px] text-[#d4a752]"><AnimatedNumber value={weighted * 0.02} format={x => aed(x, { compact: true })} /></b></div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-white/10">
            {can('crm', 'create') && (
              <Link to="/e/leads?new=1" className="inline-flex items-center gap-2 rounded-full bg-[#d4a752] px-4 py-2.5 text-[12.5px] font-bold text-[#0b1f2a] no-underline hover:bg-[#e5bc6b] transition-colors">
                <UserPlus size={15} /> New Lead
              </Link>
            )}
            {can('mandates', 'create') && (
              <Link to="/e/viewings?new=1" className="inline-flex items-center gap-2 rounded-full bg-white/12 border border-white/15 px-4 py-2.5 text-[12.5px] font-semibold text-white no-underline hover:bg-white/20 transition-colors">
                <CalendarCheck size={15} className="text-[#a3e635]" /> Book Viewing
              </Link>
            )}
            <Link to="/pipeline" className="inline-flex items-center gap-2 rounded-full bg-white/12 border border-white/15 px-4 py-2.5 text-[12.5px] font-semibold text-white no-underline hover:bg-white/20 transition-colors">
              <Rocket size={15} className="text-[#38bdf8]" /> Deal Pipeline
            </Link>
            <Link to="/toolkit" className="inline-flex items-center gap-2 rounded-full bg-white/12 border border-white/15 px-4 py-2.5 text-[12.5px] font-semibold text-white no-underline hover:bg-white/20 transition-colors">
              <Calculator size={15} className="text-[#d4a752]" /> Deal Toolkit
            </Link>
          </div>
        </div>

        {/* Right Hero Card: Interactive Week Strip + Today's Schedule (Inspired by Productivity Screen #2) */}
        <div className="xl:col-span-4 rounded-[26px] border border-[#e2e8f0] bg-white p-5 shadow-[0_8px_28px_-14px_rgba(11,31,42,0.1)] flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="m-0 text-[17px] font-bold text-[#0b1f2a]">Schedule &amp; Deadlines</h2>
              <p className="m-0 text-[12px] text-[#526273]">Viewings, target closes &amp; renewals</p>
            </div>
            <Link to="/calendar" className="inline-flex items-center gap-1.5 rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-3 py-1.5 text-[12px] font-semibold text-[#0b1f2a] no-underline hover:bg-[#0b1f2a] hover:text-white transition-colors">
              <CalendarDays size={13} /> Calendar
            </Link>
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {weekDays.map(wd => (
              <div
                key={wd.key}
                className={`flex flex-col items-center justify-center rounded-2xl py-2 text-center ${
                  wd.isToday ? 'bg-[#0b1f2a] text-white shadow-sm' : 'bg-[#f8fafc] text-[#334155]'
                }`}
              >
                <span className={`text-[10px] font-semibold ${wd.isToday ? 'text-[#d4a752]' : 'text-[#64748b]'}`}>{wd.wk}</span>
                <span className="mt-0.5 text-[13.5px] font-bold">{wd.num}</span>
              </div>
            ))}
          </div>

          <div className="space-y-2 max-h-[168px] overflow-y-auto pr-0.5">
            {agenda.length === 0 ? (
              <div className="rounded-2xl bg-[#f8fafc] p-4 text-center text-xs text-[#526273]">
                Nothing scheduled for the next few days.
              </div>
            ) : (
              agenda.slice(0, 3).map(a => (
                <Link key={a.id} to={a.to} className="flex items-center gap-3 rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2.5 no-underline hover:border-[#0b1f2a] hover:bg-white transition-colors">
                  <span className={`size-9 rounded-xl grid place-items-center shrink-0 ${a.tone === 'blue' ? 'bg-[#eff6ff] text-[#2563eb]' : a.tone === 'green' ? 'bg-[#ecfdf5] text-[#047857]' : 'bg-[#fef7e6] text-[#b78328]'}`}>
                    <a.Icon size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-[#0b1f2a]">{a.title}</div>
                    <div className="truncate text-[11.5px] text-[#526273]">
                      {a.kind} · {a.kind === 'Viewing' ? fmtDateTime(a.at) : fmtDate(a.at)}
                    </div>
                  </div>
                  <ArrowUpRight size={14} className="text-[#94a3b8] shrink-0" />
                </Link>
              ))
            )}
          </div>
        </div>
      </motion.section>

      {/* ------------------------------------------------------------ Vibrant Semantic KPI Strip */}
      <Reveal className="grid gap-3.5 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {kpiCards.map(c => (
          <motion.div key={c.label} variants={rise} whileHover={{ y: -3 }} transition={{ type: 'spring', stiffness: 320, damping: 24 }}>
            <Link
              to={c.to}
              className="flex h-full flex-col justify-between gap-3 rounded-[22px] border bg-white p-4 no-underline shadow-[0_4px_16px_-10px_rgba(11,31,42,0.1)] transition-shadow hover:shadow-[0_14px_30px_-14px_rgba(11,31,42,0.18)]"
              style={{ borderColor: c.border }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-[#526273] truncate">{c.label}</span>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-xl" style={{ background: c.bg, color: c.fg }}>
                  <c.icon size={16} />
                </span>
              </div>
              <div>
                <div className="font-display text-[24px] sm:text-[26px] font-bold text-[#0b1f2a] leading-none">
                  <AnimatedNumber value={c.value} format={c.format} />
                </div>
                <div className="mt-1.5 text-[11.5px] font-medium text-[#526273] truncate">{c.hint}</div>
              </div>
            </Link>
          </motion.div>
        ))}
      </Reveal>

      {/* ------------------------------------------------------------ Attention Alerts */}
      {d.alerts?.length > 0 && (
        <Reveal className="grid gap-2 sm:grid-cols-2">
          {d.alerts.slice(0, 4).map((a: any, i: number) => (
            <RevealItem key={i}>
              <Link
                to={a.link}
                className="flex items-center gap-3 rounded-2xl border px-4 py-3 text-[13.5px] font-medium no-underline transition-all hover:-translate-y-0.5"
                style={{
                  background: a.level === 'danger' ? '#fef2f2' : a.level === 'warn' ? '#fffbeb' : '#eff6ff',
                  borderColor: a.level === 'danger' ? '#fecaca' : a.level === 'warn' ? '#fde68a' : '#bfdbfe',
                  color: '#0b1f2a',
                }}
              >
                <AlertTriangle size={17} color={a.level === 'danger' ? '#dc2626' : a.level === 'warn' ? '#d97706' : '#2563eb'} />
                <span className="flex-1 min-w-0 truncate" dir="auto">{a.text}</span>
                <ArrowRight size={15} className="shrink-0" />
              </Link>
            </RevealItem>
          ))}
        </Reveal>
      )}

      {/* ------------------------------------------------------------ Sequential UAE Real Estate Workflow Strip (Zero Sidebar Hopping!) */}
      <Reveal className="rounded-[24px] border border-[#e2e8f0] bg-white p-5 shadow-[0_8px_28px_-14px_rgba(11,31,42,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#b78328]">Step-by-Step Company Workflow</span>
            <h2 className="m-0 mt-0.5 text-[18px] font-bold text-[#0b1f2a]">UAE Real Estate Execution Path</h2>
          </div>
          {!restricted && (
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: 'All Steps' },
                  { id: 'offplan', label: 'Off-Plan Sales' },
                  { id: 'secondary', label: 'Secondary Ready' },
                  { id: 'leasing', label: 'Leasing & Ejari' },
                ] as { id: DeptFilter; label: string }[]
              ).map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDeptFilter(tab.id)}
                  className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold border transition-colors cursor-pointer ${
                    deptFilter === tab.id
                      ? 'bg-[#0b1f2a] border-[#0b1f2a] text-white'
                      : 'bg-[#f8fafc] border-[#e2e8f0] text-[#334155] hover:border-[#0b1f2a]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {workflowSteps.map(st => (
            <Link
              key={st.step}
              to={st.to}
              className="group flex flex-col justify-between rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-3.5 no-underline transition-all hover:-translate-y-0.5 hover:border-[#0b1f2a] hover:bg-white hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-[#0b1f2a] px-2.5 py-0.5 text-[10.5px] font-bold text-[#d4a752] font-mono">
                  STEP {st.step}
                </span>
                <ArrowUpRight size={14} className="text-[#94a3b8] group-hover:text-[#0b1f2a]" />
              </div>
              <div className="mt-2.5">
                <div className="text-[13.5px] font-bold text-[#0b1f2a] leading-snug">{st.title}</div>
                <div className="text-[11.5px] text-[#526273] mt-0.5">{st.sub}</div>
              </div>
            </Link>
          ))}
        </div>
      </Reveal>

      {/* ------------------------------------------------------------ Live Pulse Row */}
      {pulse.data && (pulse.data.leads || pulse.data.viewings || pulse.data.calls) && (
        <section className="swk-pulse-row" aria-label="Live activity">
          {pulse.data.leads && <PulseCard title="New leads" icon={UserPlus} data={pulse.data.leads} to="/e/leads" hint="last 7 days" />}
          {pulse.data.viewings && <PulseCard title="Viewings" icon={CalendarCheck} data={pulse.data.viewings} to="/e/viewings" hint="scheduled" />}
          {pulse.data.calls && <PulseCard title="Calls logged" icon={PhoneCall} data={pulse.data.calls} to="/e/activities" hint="team calls" />}
          <div className="swk-tl-card">
            <h3>
              <span className="swk-live-dot" />
              Live activity
            </h3>
            <ActivityTimeline events={pulse.data.feed} />
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------ Pipeline + Revenue + Portfolio + Market */}
      <Reveal className="grid gap-4 xl:grid-cols-12">
        <Card
          className="xl:col-span-7"
          title="Sales pipeline"
          subtitle="Deals by stage · count and value (AED)"
          to="/pipeline"
          actions={<Pill tone="champ">Weighted {aed(weighted, { compact: true })}</Pill>}
        >
          {funnel.every(s => !Number(s.count)) ? (
            <EmptyState
              title="No deals in the pipeline yet"
              hint="Open a deal file and it will move through these stages."
              action={
                can('sales', 'create') && (
                  <Link to="/e/jobs?new=1" className="btn green mt-2">
                    <Plus size={15} /> Open a deal
                  </Link>
                )
              }
            />
          ) : (
            <div className="grid gap-3 pt-1">
              {funnel.map((s, i) => (
                <div key={s.stage} className="grid grid-cols-[110px_1fr_auto] sm:grid-cols-[140px_1fr_140px] items-center gap-3">
                  <div className="text-[13px] font-semibold text-ink truncate">{s.stage}</div>
                  <div className="relative h-9 rounded-full bg-[#f1f5f9] overflow-hidden">
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full flex items-center px-3.5 text-[12px] font-semibold text-white"
                      style={{ background: CHART[i % 4] }}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${Math.max(12, (Number(s.count) / funnelMax) * 100)}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.9, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                    >
                      {Number(s.count) > 0 && `${s.count} deal${Number(s.count) === 1 ? '' : 's'}`}
                    </motion.div>
                  </div>
                  <div className="text-right text-[13px] font-semibold text-ink tabular-nums">
                    {aed(Number(s.value), { compact: true })}
                    <div className="text-[11px] font-medium text-muted">{Math.round((STAGE_PROB[s.stage] ?? 0.3) * 100)}% prob</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="xl:col-span-5" title="Commission & revenue" subtitle="By deal month (AED)" to={can('reports', 'view') ? '/reports' : undefined}>
          <div style={{ height: 250 }}>
            {trend.every(r => !Number(r.revenue) && !Number(r.profit)) ? (
              <EmptyState title="No revenue posted yet" hint="Commission invoices will build this trend." />
            ) : (
              <ResponsiveContainer>
                <AreaChart data={trend} margin={{ top: 10, right: 6, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gPro" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0e9f6e" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="#0e9f6e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 4" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} tickFormatter={v => aed(v, { compact: true }).replace('AED ', '')} width={52} />
                  <Tooltip formatter={(v: any) => aed(Number(v))} />
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#2563eb" strokeWidth={2.5} fill="url(#gRev)" />
                  <Area type="monotone" dataKey="profit" name="Net" stroke="#0e9f6e" strokeWidth={2.5} fill="url(#gPro)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </Reveal>

      <Reveal className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-4" title="Portfolio health" subtitle="Managed units & listing status" to="/e/units">
          <div className="flex items-center gap-4">
            <ProgressRing value={occupancy} size={104} label={`${occupancy.toFixed(0)}%`} sub="occupied" color="#0e9f6e" track="#e2e8f0" />
            <div className="grid gap-1 text-[13px] flex-1 min-w-0">
              <div className="swk-kv"><span>Units managed</span><b>{num(unitRows.length)}</b></div>
              <div className="swk-kv"><span>Vacant</span><b>{num(k.vacant_units ?? unitRows.length - occupied)}</b></div>
              <div className="swk-kv"><span>Renewals · 90d</span><b>{num(k.renewals_due ?? 0)}</b></div>
            </div>
          </div>
          {(ch.properties_status ?? []).length > 0 && (
            <div className="flex items-center gap-3 mt-4 pt-3 border-t border-line">
              <div style={{ width: 92, height: 92 }} className="flex-none">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={ch.properties_status} dataKey="value" nameKey="name" innerRadius={28} outerRadius={44} paddingAngle={3} cornerRadius={5} stroke="none">
                      {ch.properties_status.map((_: any, i: number) => (
                        <Cell key={i} fill={CHART[i % CHART.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="m-0 p-0 list-none grid gap-1.5 text-[12.5px] flex-1 min-w-0">
                {ch.properties_status.map((s: any, i: number) => (
                  <li key={s.name} className="flex items-center gap-2">
                    <i className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: CHART[i % CHART.length] }} />
                    <span className="truncate flex-1 text-body">{s.name}</span>
                    <b className="text-ink">{s.value}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card className="xl:col-span-4" title="Dubai market pulse" subtitle="Price per sq ft · YoY growth" to="/market" actions={<Pill tone="oasis">Live Index</Pill>}>
          <div className="grid gap-1">
            {COMMUNITIES.slice(0, 5).map(c => {
              const yoy = ((c.ppsf - c.ppsfLY) / c.ppsfLY) * 100
              return (
                <Link key={c.id} to="/market" className="flex items-center gap-3 py-2 rounded-2xl hover:bg-[#f1f5f9] px-2 -mx-2 transition-colors no-underline">
                  <span className="w-10 h-10 rounded-xl bg-cover bg-center flex-none shadow-2xs" style={{ backgroundImage: `url(${c.image.replace('.webp', '-640.webp')}), url(${c.image})` }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-ink truncate">{c.name}</span>
                    <span className="block text-[12px] text-muted">AED {num(c.ppsf)}/sqft · {c.yieldPct}% yield</span>
                  </span>
                  <Sparkline data={c.trend} width={66} height={24} color="#0e9f6e" />
                  <span className="rounded-full bg-[#ecfdf5] px-2 py-0.5 text-[11.5px] font-bold text-[#047857] shrink-0">+{yoy.toFixed(1)}%</span>
                </Link>
              )
            })}
          </div>
        </Card>

        <Card className="xl:col-span-4" title="Compliance watch" subtitle="RERA, DLD & licence health" to="/rera" tone="champ">
          {[
            { l: 'Mandates (Form A) expiring · 14d', v: Number(k.mandates_expiring ?? 0), to: '/e/mandates', Icon: FileSignature },
            { l: 'Stale listings · 21+ days', v: Number(k.stale_listings ?? 0), to: '/listings', Icon: Megaphone },
            { l: 'Licence & document issues', v: Number(k.compliance_issues ?? 0), to: '/compliance', Icon: Gavel },
            { l: 'Open maintenance', v: Number(k.maintenance_open ?? 0), to: '/e/maintenance', Icon: Wrench },
          ].map(r => (
            <Link key={r.l} to={r.to} className="swk-row no-underline">
              <span className="swk-row-ic bg-white border border-line"><r.Icon size={16} /></span>
              <span className="swk-row-t flex-1">{r.l}</span>
              <span className="font-display text-[18px] font-bold" style={{ color: r.v > 0 ? '#dc2626' : '#0e9f6e' }}>{r.v}</span>
            </Link>
          ))}
          <div className="mt-3">
            <div className="flex justify-between text-[12px] mb-1.5">
              <span className="text-muted">Active mandates compliant</span>
              <b className="text-ink">{k.mandates_active ?? 0}</b>
            </div>
            <Bar value={Number(k.mandates_active ?? 0) - Number(k.mandates_expiring ?? 0)} max={Math.max(1, Number(k.mandates_active ?? 0))} color="#0e9f6e" />
          </div>
        </Card>
      </Reveal>

      {/* ------------------------------------------------------------ @siren.uix Inspired Featured Listings */}
      {(props.data?.rows ?? []).length > 0 && (
        <section>
          <div className="flex items-end justify-between gap-3 mb-3">
            <div>
              <div className="swk-eyebrow">Verified Inventory</div>
              <h2 className="m-0 text-[20px] font-bold text-ink">Latest Dubai listings</h2>
            </div>
            <Link to="/listings" className="btn outline sm">
              Listing Studio <ArrowUpRight size={14} />
            </Link>
          </div>
          <Reveal className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {props.data.rows.slice(0, 4).map((p: any) => (
              <motion.div key={p.id} variants={rise} whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }}>
                <Link to={`/e/properties/${p.id}`} className="group relative block h-[244px] overflow-hidden rounded-[24px] bg-[#0b1f2a] shadow-[0_14px_34px_-16px_rgba(11,31,42,0.34)] no-underline">
                  <div className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-[1.06]" style={{ backgroundImage: `url(${photoFor(p.id)})` }} />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0b1f2a]/92 via-[#0b1f2a]/25 to-[#0b1f2a]/10" />
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-1.5">
                    <div className="flex gap-1.5">
                      <span className="rounded-full bg-white/92 px-2.5 py-1 text-[11px] font-bold text-[#0b1f2a] backdrop-blur-md">
                        {p.is_off_plan ? 'Off-plan' : 'Ready'}
                      </span>
                      {p.is_exclusive && <span className="rounded-full bg-[#0e9f6e] px-2.5 py-1 text-[11px] font-bold text-white">Exclusive</span>}
                    </div>
                    {p.rera_permit_no && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#2563eb] px-2.5 py-1 text-[10.5px] font-bold text-white">
                        <BadgeCheck size={12} /> Permit
                      </span>
                    )}
                  </div>
                  <div className="absolute bottom-3.5 left-3.5 right-3.5 text-white">
                    <div className="truncate text-[16px] font-bold text-white">{p.title}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-[12px] text-white/80 truncate">
                      <MapPin size={12} className="text-[#d4a752] shrink-0" />
                      <span className="truncate">{p.address || p.property_type} · {p.bedrooms ? `${p.bedrooms} BR` : 'Studio'} · {num(p.area_sqft)} sqft</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="font-display text-[17px] font-bold text-[#fef3c7]">
                        {p.price ? aed(p.price, { compact: true }) : p.rent_annual ? `${aed(p.rent_annual, { compact: true })}/yr` : 'On request'}
                      </div>
                      <span className="rounded-full bg-white/20 border border-white/25 px-3 py-1 text-[11.5px] font-semibold text-white backdrop-blur-md transition-colors group-hover:bg-[#d4a752] group-hover:text-[#0b1f2a]">
                        View Unit
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </Reveal>
        </section>
      )}

      {/* ------------------------------------------------------------ Queues + Leadership Briefings */}
      <Reveal className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Lead queue"
          subtitle="Respond within 15 minutes to win the lead"
          to="/e/leads"
          actions={
            can('crm', 'create') && (
              <Link to="/e/leads?new=1" className="swk-icon-link" aria-label="New lead">
                <Plus size={16} />
              </Link>
            )
          }
        >
          {(ls.lead_queue ?? []).length === 0 ? (
            <EmptyState title="Inbox zero" hint="New portal, WhatsApp and website enquiries land here." />
          ) : (
            ls.lead_queue.slice(0, 5).map((l: any) => (
              <Link key={l.id} to={`/e/leads/${l.id}`} className="swk-row no-underline">
                <span className="swk-row-ic"><Users size={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className="swk-row-t block">{l.contact_name || l.company}</span>
                  <span className="swk-row-s block">{[l.source, l.phone].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block text-[12.5px] font-semibold text-ink">{l.est_value ? aed(l.est_value, { compact: true }) : '—'}</span>
                  <Pill tone={/new/i.test(l.status) ? 'dune' : 'sky'}>{l.status}</Pill>
                </span>
              </Link>
            ))
          )}
        </Card>

        <Card title="Offers awaiting decision" subtitle="Purchase and lease offers" to="/e/offers">
          {(ls.offers_pipeline ?? []).length === 0 ? (
            <EmptyState title="No pending offers" hint="Submitted and negotiating offers appear here." />
          ) : (
            ls.offers_pipeline.slice(0, 5).map((o: any) => (
              <Link key={o.id} to={`/e/offers/${o.id}`} className="swk-row no-underline">
                <span className="swk-row-ic"><HandCoins size={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className="swk-row-t block">{o.property_title}</span>
                  <span className="swk-row-s block">{o.buyer} · {fmtDate(o.offer_date)}</span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block text-[12.5px] font-semibold text-ink">{aed(o.offer_price, { compact: true })}</span>
                  <Pill tone="champ">{o.status}</Pill>
                </span>
              </Link>
            ))
          )}
        </Card>
      </Reveal>

      {adminOk && (
        <Reveal className="rounded-[22px] border border-[#e2e8f0] bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="space-y-0.5 min-w-0">
              <div className="text-xs font-bold uppercase tracking-wider text-[#0b1f2a] flex items-center gap-1.5">
                <ShieldCheck size={15} className="text-[#0e9f6e]" /> Leadership Governance &amp; Briefings
              </div>
              <div className="text-xs text-[#526273]">
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
    <div className="grid gap-5 max-w-[1640px] mx-auto" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid gap-5 xl:grid-cols-12">
        <div className="xl:col-span-8 h-[230px] rounded-[26px] bg-[#0b1f2a]/90 animate-pulse" />
        <div className="xl:col-span-4 h-[230px] rounded-[26px] bg-white border border-[#e2e8f0] animate-pulse" />
      </div>
      <div className="grid gap-3.5 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-[112px] rounded-[22px] bg-white border border-[#e2e8f0] animate-pulse" />
        ))}
      </div>
    </div>
  )
}
