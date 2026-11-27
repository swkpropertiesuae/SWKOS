import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileBarChart,
  FileCode2,
  FileSignature,
  HandCoins,
  KeyRound,
  Landmark,
  Layers,
  MapPin,
  Navigation,
  PenTool,
  PhoneCall,
  Plane,
  QrCode,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Stamp,
  Ticket,
  Trash2,
  TrendingUp,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react'
import { AnalyticsBento } from '@/components/ui/analytics-bento'
import { get, post } from '../lib/api'
import { useMeta } from '../lib/meta'
import { useToast } from '../lib/toast'
import { fmtDate, fmtDateTime } from '../lib/format'
import { ErrorBox } from '../ui/kit'
import { aed, num } from '../swk/ui'
import { COMMUNITIES } from '../swk/uae'
import { buildSwkAnalyticsBentoProps } from '../swk/executive-analytics'
import { canAccessCrmVault, canAccessDocumentTemplates, canAccessSwkAdminLogic, isOwnerSwkUser, isRestrictedStaffUser } from '@shared/swk-staff-access'
import { BracketLink, LiveStatusDot, SectionEyebrow, SwissCarousel, SwissHeroHeader } from '../components/ui/SwissPrimitives'

type RoleProfile = 'owner' | 'admin' | 'manager' | 'hr' | 'office_admin' | 'agent'
type QueueTab = 'leads' | 'offers' | 'closes' | 'renewals'

const STAGE_PROB: Record<string, number> = {
  Inquiry: 0.1,
  Viewing: 0.2,
  Offer: 0.4,
  Negotiation: 0.55,
  Contract: 0.75,
  'DLD Process': 0.9,
  Handover: 0.95,
  Closed: 1,
}

const ROLE_META: Record<RoleProfile, { badge: string; title: string; subtitle: string; accent: string }> = {
  owner: {
    badge: 'TIER 1 · SUPREME OWNER COMMAND',
    title: 'Executive Governance & Treasury',
    subtitle: 'Full company oversight — live AED liquidity, broker performance, seal & signature sign-offs, and RERA compliance.',
    accent: 'from-[#0b1f2a] via-[#132f3f] to-[#1a3e52]',
  },
  admin: {
    badge: 'TIER 2 · SYSTEM & OPERATIONS ADMIN',
    title: 'Corporate Operations Console',
    subtitle: 'Real-time brokerage pipeline, inventory health, compliance tracking, and Owner-supervised seal governance.',
    accent: 'from-[#0f172a] via-[#172554] to-[#1e3a8a]',
  },
  manager: {
    badge: 'TIER 3 · OPERATIONS MANAGER DESK',
    title: 'Brokerage Execution & Field Command',
    subtitle: 'Deal velocity, CRM Vault dispatch coverage, live broker leaderboard, viewings, and closing milestones.',
    accent: 'from-[#0b2722] via-[#113f36] to-[#155e4f]',
  },
  hr: {
    badge: 'HUMAN RESOURCES & PAYROLL COMMAND',
    title: 'Workforce, Attendance & Immigration',
    subtitle: 'Live daily attendance, leave approvals, UAE visa & Emirates ID expiries, payroll readiness, and HR document templates.',
    accent: 'from-[#28163a] via-[#3c1f57] to-[#4c1d95]',
  },
  office_admin: {
    badge: 'FRONT OFFICE & DOCUMENT OPERATIONS',
    title: 'Reception, Tickets & Document Desk',
    subtitle: 'Walk-in enquiry routing, SLA support tickets, office calendar, and company templates with Owner seal workflow.',
    accent: 'from-[#1e293b] via-[#27364d] to-[#334155]',
  },
  agent: {
    badge: 'ADVISOR & FIELD EXECUTION DESK',
    title: 'My Assigned Deals & Daily Operations',
    subtitle: 'Your dispatched CRM Vault deals, masked SWK Phone outreach, office QR attendance, Field Duty GPS, and Dubai benchmarks.',
    accent: 'from-[#0b1f2a] via-[#14303e] to-[#1e4356]',
  },
}

function dubaiNowLabel() {
  return new Intl.DateTimeFormat('en-AE', {
    timeZone: 'Asia/Dubai',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())
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

export function Dashboard() {
  const { me, can } = useMeta()
  const toast = useToast()
  const qc = useQueryClient()
  const adminOk = canAccessSwkAdminLogic(me)
  const restricted = isRestrictedStaffUser(me)
  const isOwner = isOwnerSwkUser(me)
  const canVault = canAccessCrmVault(me)
  const canDocs = canAccessDocumentTemplates(me)

  const [sendingBrief, setSendingBrief] = useState<string | null>(null)
  const [decidingId, setDecidingId] = useState<number | null>(null)
  const [queueTab, setQueueTab] = useState<QueueTab>('leads')

  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => get<any>('/api/dashboard'), refetchInterval: 90_000 })
  const propsQ = useQuery({
    queryKey: ['dash-props'],
    queryFn: () => get<any>('/api/e/properties', { pageSize: 16, sort: 'listed_date', dir: 'desc' }),
    enabled: can('properties', 'view') && !restricted,
  })
  const pulse = useQuery({ queryKey: ['pulse'], queryFn: () => get<any>('/api/dashboard/pulse'), refetchInterval: 30_000, retry: false })
  const stage12Q = useQuery({
    queryKey: ['dash-pipeline-12'],
    queryFn: () => get<any>('/api/pipeline/12-stage'),
    enabled: !restricted && !me?.party_id,
    staleTime: 60_000,
    retry: false,
  })

  const triggerBrief = async (kind: 'morning' | 'attendance-1030') => {
    setSendingBrief(kind)
    try {
      const r = await post<any>(`/api/swk-ops/briefings/${kind}`, {})
      toast.ok(
        kind === 'morning'
          ? 'Owner Morning Briefing dispatched to Shabib Siraj'
          : `10:30 AM Attendance Report generated (${r.summary?.lateAfter1005?.length ?? 0} late)`,
      )
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSendingBrief(null)
    }
  }

  const decideSeal = async (id: number, decision: 'Approved' | 'Rejected') => {
    setDecidingId(id)
    try {
      await post(`/api/seal-approvals/${id}/decide`, {
        decision,
        valid_days: 7,
        note: decision === 'Approved' ? 'Approved from Owner Executive Dashboard' : 'Declined by Owner',
      })
      toast.ok(decision === 'Approved' ? 'Seal & signature usage approved for 7 days' : 'Seal request declined')
      await qc.invalidateQueries({ queryKey: ['dashboard'] })
      await qc.invalidateQueries({ queryKey: ['seal-approvals'] })
      await qc.invalidateQueries({ queryKey: ['seal-approval-check'] })
    } catch (e: any) {
      toast.error(e?.message || 'Action failed')
    } finally {
      setDecidingId(null)
    }
  }

  const d = q.data ?? {}
  const k = d.kpis ?? {}
  const ch = d.charts ?? {}
  const ls = d.lists ?? {}
  const rd = d.role_data ?? {}
  const propRows: any[] = propsQ.data?.rows ?? []
  const roleProfile: RoleProfile = (d.role_profile as RoleProfile) || (isOwner ? 'owner' : adminOk ? 'admin' : 'agent')
  const roleInfo = ROLE_META[roleProfile] ?? ROLE_META.agent
  const funnel: any[] = ch.pipeline_funnel ?? []
  const pipelineTotal = funnel.filter(f => f.stage !== 'Closed').reduce((s, f) => s + (Number(f.value) || 0), 0)
  const activeDealCount = funnel.filter(f => f.stage !== 'Closed').reduce((s, f) => s + (Number(f.count) || 0), 0)
  const weightedForecast = funnel.filter(f => f.stage !== 'Closed').reduce((s, f) => s + (Number(f.value) || 0) * (STAGE_PROB[f.stage] ?? 0.3), 0)
  const weekDays = useMemo(() => buildWeekStrip(), [])

  const analyticsSig = [
    k.received_month ?? 0,
    k.leads_today ?? 0,
    k.viewings_week ?? 0,
    pipelineTotal,
    activeDealCount,
    Array.isArray(ch.revenue_trend) ? ch.revenue_trend.length : 0,
    pulse.data?.leads?.length ?? 0,
    propRows.length,
  ].join('|')
  const analyticsProps = useMemo(
    () => buildSwkAnalyticsBentoProps(d, pulse.data, propRows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [analyticsSig],
  )

  if (q.error) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />
  if (!q.data) return <DashboardSkeleton />

  // Customer Portal simplified corporate view
  if (d.portal) {
    return (
      <div className="mx-auto max-w-[1380px] grid gap-5 pb-10">
        <SwissHeroHeader
          eyebrow="SWK PROPERTIES · CLIENT PORTAL"
          title={`Welcome, ${me?.name}`}
          subtitle="Live view of your active property transactions, completed handovers, and account balance."
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard label="Active Files" value={num(k.open_jobs ?? 0)} hint="In progress with SWK" icon={<Briefcase size={18} />} tone="navy" />
          <KpiCard label="Completed Handovers" value={num(k.delivered ?? 0)} hint="Title deed / keys delivered" icon={<CheckCircle2 size={18} />} tone="emerald" />
          <KpiCard label="Outstanding Balance" value={aed(k.outstanding ?? 0)} hint="Posted invoices due" icon={<Wallet size={18} />} tone="amber" />
        </div>
        <div className="card p-5">
          <h2 className="text-base font-bold text-ink m-0 mb-3">Recent Files</h2>
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr><th>Ref</th><th>Property</th><th>Type</th><th>Stage</th><th>Status</th><th>Date</th></tr>
              </thead>
              <tbody>
                {(d.recent_jobs ?? []).map((j: any) => (
                  <tr key={j.id}>
                    <td className="font-mono font-semibold"><Link to={`/e/jobs/${j.id}`} className="link">{j.job_no}</Link></td>
                    <td>{j.property || j.deal_name || '—'}</td>
                    <td>{j.deal_type || '—'}</td>
                    <td>{j.operational_status || '—'}</td>
                    <td><span className="pill pill-slate">{j.job_status}</span></td>
                    <td>{fmtDate(j.deal_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  const gov = rd.governance ?? {}
  const hr = rd.hr ?? {}
  const office = rd.office ?? {}
  const vault = rd.vault ?? {}
  const agentDesk = rd.agent_desk ?? {}
  const sealApprovals: any[] = rd.seal_approvals ?? []
  const leaderboard: any[] = rd.agent_leaderboard ?? []
  const alerts: any[] = d.alerts ?? []
  const leadRows: any[] = ls.lead_queue ?? []
  const offerRows: any[] = ls.offers_pipeline ?? []
  const closeRows: any[] = ls.target_closes ?? []
  const renewalRows: any[] = ls.renewals ?? []
  const isExecRole = roleProfile === 'owner' || roleProfile === 'admin' || roleProfile === 'manager'

  const agenda = [
    ...(ls.upcoming_viewings ?? []).map((v: any) => ({ id: `v-${v.id}`, kind: 'Viewing', at: v.scheduled_at, title: v.property_title || 'Property Viewing', sub: [v.contact, v.agent].filter(Boolean).join(' · '), to: `/e/viewings/${v.id}`, tone: 'blue' as const })),
    ...(ls.target_closes ?? []).map((j: any) => ({ id: `j-${j.id}`, kind: 'Target Close', at: j.target_close, title: j.property || j.job_no, sub: j.client, to: `/e/jobs/${j.id}`, tone: 'emerald' as const })),
    ...(ls.renewals ?? []).map((l: any) => ({ id: `l-${l.id}`, kind: 'Ejari Renewal', at: l.end_date, title: l.unit_title || l.lease_no, sub: l.tenant, to: `/e/leases/${l.id}`, tone: 'amber' as const })),
  ].sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? ''))).slice(0, 6)

  // Build pinpoint 4-card KPIs per role
  const kpiCards = (() => {
    if (roleProfile === 'owner') {
      const govTotal = Number(gov.seal_pending ?? 0) + Number(gov.recycle_pending ?? 0) + Number(gov.withdrawals_pending ?? 0)
      return [
        { label: 'Liquid Treasury (Cash)', value: aed(k.cash ?? 0), hint: `AR ${aed(k.ar_outstanding ?? 0)} · AP ${aed(k.ap_outstanding ?? 0)}`, icon: <Landmark size={18} />, tone: 'navy' as const, to: '/finance/statements' },
        { label: 'MTD Revenue & Receipts', value: aed(k.revenue_month ?? 0), hint: `Collected ${aed(k.received_month ?? 0)} · Unbilled ${aed(k.commission_expected ?? 0)}`, icon: <TrendingUp size={18} />, tone: 'emerald' as const, to: '/e/invoices' },
        { label: 'Active Pipeline Volume', value: aed(pipelineTotal), hint: `${activeDealCount} live deals · Weighted ${aed(weightedForecast)}`, icon: <Briefcase size={18} />, tone: 'gold' as const, to: '/pipeline' },
        { label: 'Owner Approvals Queue', value: num(govTotal), hint: `${gov.seal_pending ?? 0} Seal · ${gov.recycle_pending ?? 0} Delete Bin · ${gov.withdrawals_pending ?? 0} Withdrawals`, icon: <ShieldCheck size={18} />, tone: govTotal > 0 ? 'rose' as const : 'slate' as const, to: gov.seal_pending > 0 ? '#seal-approvals' : '/recycle-bin' },
      ]
    }
    if (roleProfile === 'admin') {
      return [
        { label: 'MTD Collected Revenue', value: aed(k.received_month ?? 0), hint: `Invoiced ${aed(k.revenue_month ?? 0)} · Overdue AR ${aed(k.ar_overdue ?? 0)}`, icon: <Wallet size={18} />, tone: 'navy' as const, to: '/e/receipts' },
        { label: 'Active Deals & Pipeline', value: aed(pipelineTotal), hint: `${activeDealCount} open deals · ${k.offers_pending ?? 0} live offers`, icon: <Briefcase size={18} />, tone: 'emerald' as const, to: '/pipeline' },
        { label: 'Live Portfolio & Mandates', value: num(k.properties_available ?? 0), hint: `${k.mandates_active ?? 0} active Form A · ${k.viewings_week ?? 0} viewings (7d)`, icon: <Building2 size={18} />, tone: 'gold' as const, to: '/e/properties' },
        { label: 'Compliance & Seal Requests', value: num((k.compliance_issues ?? 0) + (rd.seal_approvals_pending ?? 0)), hint: `${k.compliance_issues ?? 0} expiring permits · ${rd.seal_approvals_pending ?? 0} pending seal sign-offs`, icon: <ShieldAlert size={18} />, tone: 'rose' as const, to: '/compliance' },
      ]
    }
    if (roleProfile === 'manager') {
      return [
        { label: 'Active Brokerage Pipeline', value: aed(pipelineTotal), hint: `${activeDealCount} active files · Weighted ${aed(weightedForecast)}`, icon: <Briefcase size={18} />, tone: 'navy' as const, to: '/pipeline' },
        { label: 'CRM Vault Dispatch', value: num(vault.dispatched ?? 0), hint: `${vault.total ?? 0} vaulted properties · ${vault.unassigned ?? 0} ready to assign`, icon: <Layers size={18} />, tone: 'emerald' as const, to: '/crm-vault' },
        { label: 'Viewings & Active Offers', value: num(k.viewings_week ?? 0), hint: `${k.offers_pending ?? 0} active offers · ${k.leads_today ?? 0} new leads today`, icon: <CalendarCheck size={18} />, tone: 'gold' as const, to: '/e/viewings' },
        { label: 'Field & Office Staff Live', value: num(gov.present_today ?? 0), hint: `${gov.active_field_staff ?? 0} active on Field Duty GPS now`, icon: <Navigation size={18} />, tone: 'slate' as const, to: '/field-live' },
      ]
    }
    if (roleProfile === 'hr') {
      return [
        { label: 'Active Headcount', value: num(hr.total_employees ?? 0), hint: `${hr.open_lifecycle ?? 0} onboarding / lifecycle cases open`, icon: <Users size={18} />, tone: 'navy' as const, to: '/e/employees' },
        { label: 'Checked In Today', value: num(hr.present_today ?? 0), hint: `${hr.late_today ?? 0} arrived after 10:05 GST cutoff`, icon: <UserCheck size={18} />, tone: 'emerald' as const, to: '/e/attendance' },
        { label: 'Pending Leave Approvals', value: num(hr.pending_leaves ?? 0), hint: 'Awaiting HR verification & decision', icon: <Plane size={18} />, tone: 'gold' as const, to: '/e/leave_requests' },
        { label: 'Visas & IDs Expiring (30d)', value: num(hr.expiring_visas_30d ?? 0), hint: `${rd.seal_approvals_pending ?? 0} pending Owner seal requests`, icon: <ShieldAlert size={18} />, tone: (hr.expiring_visas_30d ?? 0) > 0 ? 'rose' as const : 'slate' as const, to: '/e/immigration_cases' },
      ]
    }
    if (roleProfile === 'office_admin') {
      return [
        { label: 'Open Support Tickets', value: num(office.open_tickets ?? 0), hint: `${office.sla_breached ?? 0} past SLA threshold`, icon: <Ticket size={18} />, tone: (office.sla_breached ?? 0) > 0 ? 'rose' as const : 'navy' as const, to: '/e/tickets' },
        { label: 'Walk-In & New Leads', value: num(office.total_leads_new ?? 0), hint: `${office.walkin_leads_today ?? 0} captured today`, icon: <UserPlus size={18} />, tone: 'emerald' as const, to: '/e/leads' },
        { label: 'Company Documents (MTD)', value: num(office.studio_docs_month ?? 0), hint: 'Drafted in Letter & Document Studio', icon: <FileCode2 size={18} />, tone: 'gold' as const, to: '/studio' },
        { label: 'Owner Seal Requests', value: num(rd.seal_approvals_pending ?? 0), hint: 'Pending Owner Shabib Siraj sign-off', icon: <Stamp size={18} />, tone: 'slate' as const, to: '/studio' },
      ]
    }
    return [
      { label: 'My Assigned Vault Deals', value: num(agentDesk.assigned_vault_deals ?? 0), hint: 'Dispatched with hard-masked outreach', icon: <Briefcase size={18} />, tone: 'navy' as const, to: '/my-deals' },
      { label: 'Today’s Attendance', value: agentDesk.checked_in_today ? 'Checked In' : 'Pending', hint: agentDesk.check_in_time ? `In at ${String(agentDesk.check_in_time).slice(0, 5)} · ${agentDesk.attendance_status}` : 'Scan office QR on arrival', icon: <QrCode size={18} />, tone: agentDesk.checked_in_today ? 'emerald' as const : 'rose' as const, to: '/reception-qr' },
      { label: 'Daily Reports (MTD)', value: num(agentDesk.reports_month ?? 0), hint: 'End-of-day field & call summaries', icon: <ClipboardCheck size={18} />, tone: 'gold' as const, to: '/e/daily_reports' },
      { label: 'Open Tasks & Alerts', value: num((agentDesk.open_tasks ?? 0) + (agentDesk.unread_inside ?? 0)), hint: `${agentDesk.open_tasks ?? 0} tasks · ${agentDesk.unread_inside ?? 0} unread alerts`, icon: <Clock3 size={18} />, tone: 'slate' as const, to: '/chat' },
    ]
  })()

  return (
    <div className="mx-auto max-w-[1560px] grid gap-6 pb-12">
      {/* ============================================================ 1. SWISS ARCHITECTURAL EXECUTIVE HEADER */}
      <SwissHeroHeader
        eyebrow={roleInfo.badge}
        badge={
          <span className="inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-[#f4f7fa] px-3 py-1 font-mono text-[11px] font-medium text-[#121212]">
            <LiveStatusDot />
            {dubaiNowLabel()} GST
          </span>
        }
        title={roleInfo.title}
        subtitle={
          <>
            Signed in as <strong className="font-semibold text-[#121212]">{me?.name}</strong> ({me?.role || d.role_label || roleProfile}) — {roleInfo.subtitle}
          </>
        }
        actions={
          <>
            {roleProfile === 'owner' && (
              <>
                <BracketLink to="/shabibs-corner" variant="dark" size="sm">
                  <ShieldCheck size={14} className="text-[#51fec0]" /> Shabib&apos;s Corner
                </BracketLink>
                <BracketLink to="/master-log" variant="light" size="sm">
                  <Layers size={14} /> Master Log
                </BracketLink>
                <button
                  type="button"
                  disabled={sendingBrief !== null}
                  onClick={() => void triggerBrief('morning')}
                  className="btn outline sm"
                >
                  <FileBarChart size={14} /> {sendingBrief === 'morning' ? 'Dispatching…' : 'Owner Morning Brief'}
                </button>
                <button
                  type="button"
                  disabled={sendingBrief !== null}
                  onClick={() => void triggerBrief('attendance-1030')}
                  className="btn outline sm"
                >
                  <Clock3 size={14} /> {sendingBrief === 'attendance-1030' ? 'Running…' : '10:30 Attendance'}
                </button>
                <Link to="/crm-vault" className="btn outline sm no-underline">
                  <ShieldCheck size={14} /> CRM Vault
                </Link>
              </>
            )}
            {roleProfile === 'admin' && (
              <>
                <BracketLink to="/e/properties" variant="dark" size="sm">
                  <Building2 size={14} className="text-[#51fec0]" /> Inventory
                </BracketLink>
                <BracketLink to="/studio" variant="light" size="sm">
                  <FileCode2 size={14} /> Document Templates
                </BracketLink>
                <Link to="/crm-vault" className="btn outline sm no-underline">
                  <ShieldCheck size={14} /> CRM Vault
                </Link>
              </>
            )}
            {roleProfile === 'manager' && (
              <>
                <BracketLink to="/crm-vault" variant="dark" size="sm">
                  <ShieldCheck size={14} className="text-[#51fec0]" /> Dispatch CRM Vault
                </BracketLink>
                <BracketLink to="/field-live" variant="light" size="sm">
                  <Navigation size={14} /> Live Field Map
                </BracketLink>
                <Link to="/pipeline" className="btn outline sm no-underline">
                  <Briefcase size={14} /> Pipeline
                </Link>
              </>
            )}
            {roleProfile === 'hr' && (
              <>
                <BracketLink to="/e/leave_requests" variant="dark" size="sm">
                  <Plane size={14} className="text-[#51fec0]" /> Leave Approvals
                </BracketLink>
                <BracketLink to="/e/attendance" variant="light" size="sm">
                  <Clock3 size={14} /> Attendance Log
                </BracketLink>
                <Link to="/studio" className="btn outline sm no-underline">
                  <FileCode2 size={14} /> HR Templates
                </Link>
              </>
            )}
            {roleProfile === 'office_admin' && (
              <>
                <BracketLink to="/reception-display" variant="dark" size="sm">
                  <QrCode size={14} className="text-[#51fec0]" /> Generate Reception QR
                </BracketLink>
                <BracketLink to="/master-log" variant="light" size="sm">
                  <Layers size={14} /> Master Log (Request Edit)
                </BracketLink>
                <Link to="/e/leads?new=1" className="btn outline sm no-underline">
                  <UserPlus size={14} /> Log Walk-In Lead
                </Link>
                <Link to="/studio" className="btn outline sm no-underline">
                  <FileCode2 size={14} /> Letter Studio
                </Link>
              </>
            )}
            {roleProfile === 'agent' && (
              <>
                <BracketLink to="/reception-qr?scan=1" variant="dark" size="sm">
                  <QrCode size={14} className="text-[#51fec0]" /> Scan Office QR
                </BracketLink>
                <BracketLink to="/my-deals" variant="light" size="sm">
                  <Briefcase size={14} /> My Deals
                </BracketLink>
                <Link to="/phone" className="btn outline sm no-underline">
                  <PhoneCall size={14} /> SWK Phone
                </Link>
                <Link to="/field-duty" className="btn outline sm no-underline">
                  <Navigation size={14} /> Field GPS
                </Link>
              </>
            )}
          </>
        }
      />

      {/* ============================================================ 2. 4-CARD ROLE KPI BENTO */}
      <section aria-label="Key role metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map(c => (
          <KpiCard key={c.label} {...c} />
        ))}
      </section>

      {/* ============================================================ 2B. 12-STAGE LIVE PIPELINE VELOCITY CAROUSEL */}
      {!restricted && (stage12Q.data?.stages?.length ?? 0) > 0 && (
        <section aria-label="12-stage pipeline counters" className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div>
              <SectionEyebrow>12-Stage Pipeline Playbook</SectionEyebrow>
              <h2 className="m-0 mt-1 text-[20px] font-medium tracking-[-0.03em] text-[#121212]">
                Live Deal Velocity &amp; Stage Counters
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/command-center" className="btn outline sm no-underline">Command Center</Link>
              <BracketLink to="/pipeline" variant="dark" size="sm">Open 12-Stage Kanban</BracketLink>
            </div>
          </div>

          <SwissCarousel ariaLabel="12-stage pipeline carousel" hint="SWIPE ALL 12 STAGES">
            {(stage12Q.data.stages as any[]).map((st: any) => (
              <Link
                key={st.code}
                to="/pipeline"
                className="group w-[212px] shrink-0 snap-start rounded-[20px] border border-black/[0.08] bg-white/95 p-4 no-underline transition-all duration-300 hover:-translate-y-0.5 hover:border-[#121212]/30 hover:shadow-[0_18px_42px_rgba(12,56,96,0.12)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex h-7 px-2.5 items-center justify-center rounded-full bg-[#121212] font-mono text-[10.5px] font-semibold text-[#51fec0]">
                    {String(st.step).padStart(2, '0')}
                  </span>
                  <b className="font-mono text-[22px] font-semibold text-[#121212] tabular-nums leading-none">
                    {st.count}
                  </b>
                </div>
                <div className="mt-3 truncate text-[13.5px] font-medium text-[#121212]">{st.shortLabel}</div>
                <div className="mt-1 flex items-center justify-between gap-2 border-t border-black/[0.06] pt-2">
                  <span className="font-mono text-[11.5px] font-semibold text-[#0e9f6e] tabular-nums">{aed(st.deal_value_aed)}</span>
                  <ArrowUpRight size={13} className="text-[#64748b] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[#121212]" />
                </div>
              </Link>
            ))}
          </SwissCarousel>
        </section>
      )}

      {/* ============================================================ 3. OWNER SEAL & SIGNATURE GOVERNANCE DESK */}
      {roleProfile === 'owner' && (
        <section id="seal-approvals" className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30">
                <Stamp size={20} />
              </div>
              <div>
                <h2 className="m-0 text-[17px] font-bold text-ink">Owner Sign-Off Desk — Company Seal, Signature &amp; Governance</h2>
                <p className="m-0 text-[13px] text-muted">
                  Admin, HR, and Office Admin require your explicit approval before applying the SWK Company Seal or Owner Signature.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/recycle-bin" className="btn outline sm">
                <Trash2 size={14} /> Delete Bin ({gov.recycle_pending ?? 0})
              </Link>
              <Link to="/withdrawals" className="btn outline sm">
                <Scale size={14} /> Withdrawals ({gov.withdrawals_pending ?? 0})
              </Link>
              <Link to="/admin/settings" className="btn outline sm">
                <PenTool size={14} /> Seal &amp; Signature Settings
              </Link>
            </div>
          </div>

          {sealApprovals.length === 0 ? (
            <div className="rounded-2xl border border-line bg-soft/70 px-4 py-4 flex items-center gap-3 text-sm text-muted">
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              <span>All clear — no pending Company Seal or Owner Signature approval requests from Admin, HR, or Office Admin.</span>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {sealApprovals.map((reqItem: any) => (
                <div key={reqItem.id} className="rounded-2xl border border-amber-500/35 bg-amber-500/[0.06] p-4 flex flex-col gap-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-[15px] text-ink truncate">{reqItem.document_title}</div>
                      <div className="text-xs text-muted mt-0.5">
                        Requested by <strong className="text-ink">{reqItem.requester_name}</strong> ({reqItem.requester_role})
                        {reqItem.recipient_name ? ` · For ${reqItem.recipient_name}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {reqItem.include_seal && <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">Seal</span>}
                      {reqItem.include_signature && <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">Signature</span>}
                    </div>
                  </div>
                  <p className="m-0 text-[13px] text-body leading-relaxed">{reqItem.reason}</p>
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-line">
                    <span className="text-[11.5px] text-muted font-mono">{fmtDateTime(reqItem.created_at)}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={decidingId === reqItem.id}
                        onClick={() => void decideSeal(reqItem.id, 'Rejected')}
                        className="btn outline sm"
                      >
                        <XCircle size={14} /> Decline
                      </button>
                      <button
                        type="button"
                        disabled={decidingId === reqItem.id}
                        onClick={() => void decideSeal(reqItem.id, 'Approved')}
                        className="btn emerald sm"
                      >
                        <CheckCircle2 size={14} /> Approve (7d)
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ============================================================ 4. EXECUTIVE LIVE ANALYTICS BENTO (OWNER / ADMIN / MANAGER) */}
      {isExecRole && (
        <section className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3 px-1">
            <div>
              <div className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-muted">EXECUTIVE INTELLIGENCE</div>
              <h2 className="m-0 mt-0.5 text-[20px] font-bold tracking-tight text-ink">
                Live Brokerage Revenue, Divisions &amp; Seasonality
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {can('reports', 'view') && (
                <Link to="/reports" className="btn outline sm">
                  <FileBarChart size={14} /> Reports &amp; Statements
                </Link>
              )}
              {canVault && (
                <Link to="/crm-vault" className="btn green sm">
                  <ShieldCheck size={14} /> Open Vault
                </Link>
              )}
            </div>
          </div>
          <AnalyticsBento
            {...analyticsProps}
            colors={{
              revenue: ['#0e9f6e', '#121212'],
              desktop: ['#1b6aa7', '#121212'],
              mobile: ['#57d2f4', '#0e9f6e'],
              radar: '#0e9f6e',
            }}
            fontFamily="'Switzer', 'Plus Jakarta Sans', system-ui, sans-serif"
            monoFamily="'Geist Mono Variable', 'JetBrains Mono Variable', monospace"
            credit={false}
          />
        </section>
      )}

      {/* ============================================================ 5. ROLE-SPECIFIC WORKSPACE SECTIONS */}
      {isExecRole && (
        <div className="grid gap-5 xl:grid-cols-12 items-start">
          {/* Left 8 cols: Pipeline Funnel + Tabbed Action Queue */}
          <div className="xl:col-span-8 grid gap-5">
            {/* Deal Pipeline Stage Funnel */}
            <section className="card p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="m-0 text-[17px] font-bold text-ink">Deal Stage Funnel &amp; Weighted Forecast</h2>
                  <p className="m-0 text-[13px] text-muted">
                    Live RERA transaction stages · Weighted closing forecast <strong className="text-ink font-mono">{aed(weightedForecast)}</strong>
                  </p>
                </div>
                <Link to="/pipeline" className="btn outline sm">
                  Full Pipeline <ArrowRight size={14} />
                </Link>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {(funnel.length ? funnel : [
                  { stage: 'Inquiry', count: 0, value: 0 },
                  { stage: 'Viewing', count: 0, value: 0 },
                  { stage: 'Offer', count: 0, value: 0 },
                  { stage: 'Negotiation', count: 0, value: 0 },
                  { stage: 'Contract', count: 0, value: 0 },
                  { stage: 'DLD Process', count: 0, value: 0 },
                  { stage: 'Handover', count: 0, value: 0 },
                  { stage: 'Closed', count: 0, value: 0 },
                ]).map((st: any) => {
                  const pct = pipelineTotal > 0 ? Math.min(100, Math.round(((Number(st.value) || 0) / pipelineTotal) * 100)) : 0
                  return (
                    <div key={st.stage} className="rounded-2xl border border-line bg-soft/65 p-3.5">
                      <div className="flex items-center justify-between gap-1 text-[12px] font-bold text-muted uppercase tracking-wider">
                        <span>{st.stage}</span>
                        <span className="font-mono text-ink">{st.count}</span>
                      </div>
                      <div className="mt-1.5 font-mono text-[16px] font-bold text-ink">{aed(st.value ?? 0)}</div>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-black/[0.06] overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-[#121212] to-[#0e9f6e]" style={{ width: `${Math.max(st.count > 0 ? 12 : 0, pct)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Tabbed Operational Action Queue */}
            <section className="card p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="m-0 text-[17px] font-bold text-ink">Active Commercial Desk</h2>
                  <p className="m-0 text-[13px] text-muted">Direct drill-down into open leads, client offers, target closings, and Ejari renewals.</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 rounded-full bg-soft p-1 border border-line">
                  {([
                    ['leads', `Leads (${leadRows.length})`],
                    ['offers', `Offers (${offerRows.length})`],
                    ['closes', `Closings (${closeRows.length})`],
                    ['renewals', `Renewals (${renewalRows.length})`],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setQueueTab(key)}
                      className={`rounded-full px-3.5 py-1.5 text-[12px] font-medium border-0 cursor-pointer transition-colors ${
                        queueTab === key ? 'bg-[#121212] text-white' : 'bg-transparent text-muted hover:text-ink'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="table-wrap">
                {queueTab === 'leads' && (
                  <table className="grid">
                    <thead><tr><th>Client / Company</th><th>Source</th><th>Status</th><th className="num">Budget / Est.</th></tr></thead>
                    <tbody>
                      {leadRows.length === 0 ? (
                        <tr><td colSpan={4} className="text-muted text-center py-6">No open leads in queue.</td></tr>
                      ) : leadRows.map((r: any) => (
                        <tr key={r.id}>
                          <td><Link to={`/e/leads/${r.id}`} className="link">{r.company || r.contact_name || `Lead #${r.id}`}</Link></td>
                          <td>{r.source || 'Direct'}</td>
                          <td><span className="rounded-full bg-soft border border-line px-2.5 py-0.5 text-xs font-semibold text-ink">{r.status}</span></td>
                          <td className="num font-mono">{r.est_value ? aed(r.est_value / 100) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {queueTab === 'offers' && (
                  <table className="grid">
                    <thead><tr><th>Offer</th><th>Property</th><th>Buyer</th><th>Status</th><th className="num">Offer Price</th></tr></thead>
                    <tbody>
                      {offerRows.length === 0 ? (
                        <tr><td colSpan={5} className="text-muted text-center py-6">No pending offers right now.</td></tr>
                      ) : offerRows.map((r: any) => (
                        <tr key={r.id}>
                          <td className="font-mono"><Link to={`/e/offers/${r.id}`} className="link">{r.offer_no || `#${r.id}`}</Link></td>
                          <td>{r.property_title || '—'}</td>
                          <td>{r.buyer || '—'}</td>
                          <td><span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">{r.status}</span></td>
                          <td className="num font-mono font-semibold">{r.offer_price ? aed(r.offer_price / 100) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {queueTab === 'closes' && (
                  <table className="grid">
                    <thead><tr><th>Deal Ref</th><th>Property</th><th>Client</th><th>Type</th><th>Target Close</th></tr></thead>
                    <tbody>
                      {closeRows.length === 0 ? (
                        <tr><td colSpan={5} className="text-muted text-center py-6">No target closings in the next 10 days.</td></tr>
                      ) : closeRows.map((r: any) => (
                        <tr key={r.id}>
                          <td className="font-mono"><Link to={`/e/jobs/${r.id}`} className="link">{r.job_no}</Link></td>
                          <td>{r.property || '—'}</td>
                          <td>{r.client || '—'}</td>
                          <td>{r.deal_type || '—'}</td>
                          <td className="font-mono">{fmtDate(r.target_close)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {queueTab === 'renewals' && (
                  <table className="grid">
                    <thead><tr><th>Lease</th><th>Unit</th><th>Tenant</th><th className="num">Annual Rent</th><th>Ends</th></tr></thead>
                    <tbody>
                      {renewalRows.length === 0 ? (
                        <tr><td colSpan={5} className="text-muted text-center py-6">No leases expiring in the next 90 days.</td></tr>
                      ) : renewalRows.map((r: any) => (
                        <tr key={r.id}>
                          <td className="font-mono"><Link to={`/e/leases/${r.id}`} className="link">{r.lease_no}</Link></td>
                          <td>{r.unit_title || '—'}</td>
                          <td>{r.tenant || '—'}</td>
                          <td className="num font-mono">{r.annual_rent ? aed(r.annual_rent / 100) : '—'}</td>
                          <td className="font-mono">{fmtDate(r.end_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </div>

          {/* Right 4 cols: Broker Leaderboard + Priority Alerts + 7-Day Operating Schedule */}
          <div className="xl:col-span-4 grid gap-5">
            {/* Broker Leaderboard */}
            <section className="card p-5">
              <div className="flex items-center justify-between gap-2 mb-3.5">
                <h2 className="m-0 text-[16px] font-bold text-ink flex items-center gap-2">
                  <Trophy size={17} className="text-amber-500" /> Broker Leaderboard
                </h2>
                <Link to="/agents" className="text-xs font-semibold link">All Brokers</Link>
              </div>
              {leaderboard.length === 0 ? (
                <p className="text-sm text-muted m-0">No active broker deal activity recorded yet.</p>
              ) : (
                <div className="grid gap-2.5">
                  {leaderboard.slice(0, 6).map((ag: any, idx: number) => (
                    <div key={ag.id} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-soft/60 px-3.5 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold font-mono ${idx === 0 ? 'bg-[#121212] text-[#51fec0]' : 'bg-white border border-black/[0.08] text-ink'}`}>
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-[14px] text-ink">{ag.name}</div>
                          <div className="text-[11.5px] text-muted">{ag.deals_count} deals · {ag.viewings_month} viewings (MTD)</div>
                        </div>
                      </div>
                      <div className="font-mono text-[13px] font-bold text-ink shrink-0">{aed(ag.deals_volume ?? 0)}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Priority Governance & Risk Alerts */}
            <section className="card p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="m-0 text-[16px] font-bold text-ink flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-500" /> Priority Alerts
                </h2>
                <span className="font-mono text-xs font-bold text-muted">{alerts.length}</span>
              </div>
              {alerts.length === 0 ? (
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3 py-2.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  Zero critical alerts — all compliance, SLA, and billing checks are clean.
                </div>
              ) : (
                <div className="grid gap-2">
                  {alerts.slice(0, 6).map((al: any, i: number) => (
                    <Link
                      key={i}
                      to={al.link.startsWith('#') ? '/dashboard' : al.link}
                      className={`flex items-start justify-between gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-medium no-underline transition-colors ${
                        al.level === 'danger'
                          ? 'border-rose-500/35 bg-rose-500/10 text-rose-900 dark:text-rose-200'
                          : al.level === 'warn'
                            ? 'border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200'
                            : 'border-line bg-soft text-ink'
                      }`}
                    >
                      <span className="leading-snug">{al.text}</span>
                      <ArrowUpRight size={14} className="shrink-0 mt-0.5 opacity-70" />
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* Weekly Operating Strip & Agenda */}
            <section className="card p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="m-0 text-[16px] font-bold text-ink flex items-center gap-2">
                  <CalendarDays size={16} className="text-emerald-600" /> Operating Week
                </h2>
                <Link to="/calendar" className="text-xs font-semibold link">Full Calendar</Link>
              </div>
              <div className="grid grid-cols-7 gap-1.5 mb-3.5">
                {weekDays.map(wd => (
                  <div
                    key={wd.key}
                    className={`rounded-xl py-2 text-center border ${
                      wd.isToday
                        ? 'bg-[#121212] text-white border-[#121212]'
                        : 'bg-soft/70 text-ink border-line'
                    }`}
                  >
                    <div className="text-[10px] font-semibold uppercase opacity-75">{wd.wk}</div>
                    <div className="text-[13px] font-bold font-mono mt-0.5">{wd.num}</div>
                  </div>
                ))}
              </div>
              {agenda.length === 0 ? (
                <p className="m-0 text-xs text-muted">No upcoming viewings, closings, or renewals scheduled this week.</p>
              ) : (
                <div className="grid gap-2">
                  {agenda.map(ev => (
                    <Link key={ev.id} to={ev.to} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-soft/60 px-3 py-2 no-underline hover:bg-hover transition-colors">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-ink">{ev.title}</div>
                        <div className="truncate text-[11.5px] text-muted">{ev.kind}{ev.sub ? ` · ${ev.sub}` : ''}</div>
                      </div>
                      <span className="font-mono text-[11.5px] text-muted shrink-0">{fmtDate(ev.at)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* ============================================================ 5B. ADMIN / HR / OFFICE ADMIN SEAL APPROVAL TRACKER */}
      {canDocs && roleProfile !== 'owner' && (
        <section className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3.5">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                <Stamp size={18} />
              </div>
              <div>
                <h2 className="m-0 text-[16.5px] font-bold text-ink">Document Templates &amp; Owner Seal Approval Status</h2>
                <p className="m-0 text-[13px] text-muted">Your role has authorized access to Company Document Templates. Applying the Company Seal or Owner Signature requires Owner Shabib Siraj’s approval.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/studio" className="btn green sm"><FileCode2 size={14} /> Open Letter Studio</Link>
              <Link to="/utilities/word" className="btn outline sm">Word Studio</Link>
            </div>
          </div>
          {sealApprovals.length === 0 ? (
            <div className="rounded-xl border border-line bg-soft/60 px-4 py-3 text-sm text-muted">
              You have no active Company Seal or Signature requests. Request approval from inside any Letter Studio or Word Studio document.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="grid">
                <thead><tr><th>Document</th><th>Requested Items</th><th>Status</th><th>Owner Note</th><th>Expires</th></tr></thead>
                <tbody>
                  {sealApprovals.map((s: any) => (
                    <tr key={s.id}>
                      <td className="font-semibold">{s.document_title}</td>
                      <td>{[s.include_seal && 'Company Seal', s.include_signature && 'Owner Signature'].filter(Boolean).join(' + ')}</td>
                      <td>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          s.status === 'Approved' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' :
                          s.status === 'Rejected' ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300' :
                          'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                        }`}>{s.status}</span>
                      </td>
                      <td className="text-muted">{s.decision_note || '—'}</td>
                      <td className="font-mono text-xs">{s.expires_at ? fmtDate(s.expires_at) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ============================================================ 5C. HR PINPOINT WORKSPACE */}
      {roleProfile === 'hr' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="m-0 text-[16.5px] font-bold text-ink">Pending Leave Approvals</h2>
              <Link to="/e/leave_requests" className="text-xs font-semibold link">Manage All</Link>
            </div>
            <div className="table-wrap">
              <table className="grid">
                <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th className="num">Days</th></tr></thead>
                <tbody>
                  {(ls.pending_leaves ?? []).length === 0 ? (
                    <tr><td colSpan={4} className="text-muted text-center py-5">No pending leave requests.</td></tr>
                  ) : (ls.pending_leaves ?? []).map((r: any) => (
                    <tr key={r.id}>
                      <td><Link to={`/e/leave_requests/${r.id}`} className="link">{r.employee_name || `Leave #${r.id}`}</Link></td>
                      <td>{r.leave_type}</td>
                      <td className="font-mono text-xs">{fmtDate(r.start_date)} → {fmtDate(r.end_date)}</td>
                      <td className="num font-mono">{r.days ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="m-0 text-[16.5px] font-bold text-ink">Visa &amp; Emirates ID Expiry Watchlist (45d)</h2>
              <Link to="/e/immigration_cases" className="text-xs font-semibold link">Open Immigration</Link>
            </div>
            <div className="table-wrap">
              <table className="grid">
                <thead><tr><th>Employee</th><th>Document</th><th>Expiry Date</th><th>Status</th></tr></thead>
                <tbody>
                  {(ls.expiring_visas ?? []).length === 0 ? (
                    <tr><td colSpan={4} className="text-muted text-center py-5">No staff visas or IDs expiring within 45 days.</td></tr>
                  ) : (ls.expiring_visas ?? []).map((r: any) => (
                    <tr key={r.id}>
                      <td><Link to={`/e/immigration_cases/${r.id}`} className="link">{r.employee_name || `#${r.id}`}</Link></td>
                      <td>{r.document_type || 'Visa / EID'}</td>
                      <td className="font-mono text-rose-600 dark:text-rose-300 font-semibold">{fmtDate(r.expiry_date)}</td>
                      <td>{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ============================================================ 5D. OFFICE ADMIN PINPOINT WORKSPACE */}
      {roleProfile === 'office_admin' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="m-0 text-[16.5px] font-bold text-ink">Open Support Tickets &amp; Reception Queue</h2>
              <Link to="/e/tickets" className="text-xs font-semibold link">All Tickets</Link>
            </div>
            <div className="table-wrap">
              <table className="grid">
                <thead><tr><th>Ref</th><th>Subject</th><th>Priority</th><th>Status</th></tr></thead>
                <tbody>
                  {(ls.open_tickets ?? []).length === 0 ? (
                    <tr><td colSpan={4} className="text-muted text-center py-5">All support tickets are resolved.</td></tr>
                  ) : (ls.open_tickets ?? []).map((t: any) => (
                    <tr key={t.id}>
                      <td className="font-mono"><Link to={`/e/tickets/${t.id}`} className="link">{t.ticket_no || `#${t.id}`}</Link></td>
                      <td>{t.subject}</td>
                      <td>{t.priority || 'Normal'}</td>
                      <td>{t.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="m-0 text-[16.5px] font-bold text-ink">Recent Company Documents</h2>
              <Link to="/studio" className="text-xs font-semibold link">Letter Studio</Link>
            </div>
            <div className="table-wrap">
              <table className="grid">
                <thead><tr><th>Doc No</th><th>Title</th><th>Category</th><th>Status</th></tr></thead>
                <tbody>
                  {(ls.recent_studio_docs ?? []).length === 0 ? (
                    <tr><td colSpan={4} className="text-muted text-center py-5">No documents drafted yet.</td></tr>
                  ) : (ls.recent_studio_docs ?? []).map((doc: any) => (
                    <tr key={doc.id}>
                      <td className="font-mono"><Link to={`/studio/${doc.id}`} className="link">{doc.doc_no}</Link></td>
                      <td>{doc.title}</td>
                      <td>{doc.category}</td>
                      <td>{doc.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ============================================================ 5E. AGENT / FIELD ADVISOR PINPOINT WORKSPACE */}
      {roleProfile === 'agent' && (
        <div className="grid gap-5 lg:grid-cols-12">
          <section className="card p-5 lg:col-span-7">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="m-0 text-[16.5px] font-bold text-ink">My Dispatched Vault Deals</h2>
                <p className="m-0 text-xs text-muted">Hard-masked owner privacy — place calls directly through SWK Phone.</p>
              </div>
              <Link to="/my-deals" className="btn green sm">Open All Deals <ArrowRight size={14} /></Link>
            </div>
            <div className="table-wrap">
              <table className="grid">
                <thead><tr><th>Community / Building</th><th>Unit</th><th>Status</th><th className="num">Asking Price</th></tr></thead>
                <tbody>
                  {(ls.my_assigned_deals ?? []).length === 0 ? (
                    <tr><td colSpan={4} className="text-muted text-center py-6">No CRM Vault deals currently dispatched to your desk.</td></tr>
                  ) : (ls.my_assigned_deals ?? []).map((deal: any) => (
                    <tr key={deal.id}>
                      <td>
                        <Link to="/my-deals" className="link">{deal.building_name || deal.community || `Deal #${deal.id}`}</Link>
                        <div className="text-xs text-muted">{deal.community}</div>
                      </td>
                      <td className="font-mono">{deal.unit_number || '—'} · {deal.bedrooms || deal.unit_type || ''}</td>
                      <td><span className="rounded-full bg-soft border border-line px-2.5 py-0.5 text-xs font-semibold">{deal.lead_status || 'Assigned'}</span></td>
                      <td className="num font-mono font-semibold">{deal.asking_price_aed ? aed(deal.asking_price_aed) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card p-5 lg:col-span-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="m-0 text-[16.5px] font-bold text-ink">Recent Daily Reports &amp; Attendance</h2>
              <Link to="/e/daily_reports?new=1" className="btn outline sm">New Report</Link>
            </div>
            <div className="grid gap-2.5">
              {(ls.my_daily_reports ?? []).slice(0, 4).map((rep: any) => (
                <Link key={rep.id} to={`/e/daily_reports/${rep.id}`} className="rounded-xl border border-line bg-soft/65 p-3 no-underline hover:bg-hover transition-colors">
                  <div className="flex items-center justify-between text-xs font-mono text-muted">
                    <span>{fmtDate(rep.report_date)}</span>
                    <span className="font-semibold text-ink">{rep.status || 'Submitted'}</span>
                  </div>
                  <div className="mt-1 text-[13px] text-ink line-clamp-2">{rep.summary || 'Daily activity report'}</div>
                </Link>
              ))}
              {(ls.my_daily_reports ?? []).length === 0 && (
                <div className="rounded-xl border border-line bg-soft/65 p-4 text-sm text-muted">
                  No daily reports submitted yet this month. Submit your end-of-day field summary before 19:00 GST.
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* ============================================================ 6. DUBAI DLD MARKET BENCHMARKS CAROUSEL */}
      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
          <div>
            <SectionEyebrow>Dubai Land Department Benchmarks</SectionEyebrow>
            <h2 className="m-0 mt-1 text-[20px] font-medium tracking-[-0.03em] text-[#121212]">
              Prime Dubai Community PSF &amp; Gross Yield Reference
            </h2>
          </div>
          <BracketLink to="/market" variant="light" size="sm">
            Open Full Market Pulse <ArrowRight size={12} />
          </BracketLink>
        </div>

        <SwissCarousel ariaLabel="Dubai community benchmarks carousel" hint="COMPARE DISTRICTS">
          {COMMUNITIES.slice(0, 10).map(c => (
            <Link
              key={c.name}
              to="/market"
              className="group w-[224px] shrink-0 snap-start rounded-[20px] border border-black/[0.08] bg-white/95 p-4 no-underline transition-all duration-300 hover:-translate-y-0.5 hover:border-[#121212]/30 hover:shadow-[0_18px_42px_rgba(12,56,96,0.12)]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13.5px] font-medium text-[#121212] truncate">{c.name}</span>
                <MapPin size={13} className="text-[#0e9f6e] shrink-0" />
              </div>
              <div className="mt-2.5 font-mono text-[18px] font-semibold text-[#121212] tabular-nums">
                AED {c.ppsf.toLocaleString('en-US')}<span className="text-[11px] font-normal text-[#64748b]">/sf</span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-black/[0.06] pt-2 text-[11.5px]">
                <span className="font-semibold text-[#0e9f6e]">{c.yieldPct}% yield</span>
                <span className="text-[#64748b]">{c.segment}</span>
              </div>
            </Link>
          ))}
        </SwissCarousel>
      </section>
    </div>
  )
}

function KpiCard({
  label,
  value,
  hint,
  icon,
  tone,
  to,
}: {
  label: string
  value: string
  hint: string
  icon: React.ReactNode
  tone: 'navy' | 'emerald' | 'gold' | 'rose' | 'slate' | 'amber'
  to?: string
}) {
  const accentText: Record<string, string> = {
    navy: 'text-[#ebc97c]',
    emerald: 'text-[#34d399]',
    gold: 'text-[#ebc97c]',
    amber: 'text-[#fbbf24]',
    rose: 'text-[#fda4af]',
    slate: 'text-white',
  }
  const iconBg: Record<string, string> = {
    navy: 'bg-[#d4a955]/20 text-[#ebc97c] border border-[#d4a955]/40',
    emerald: 'bg-[#1e6b43]/35 text-[#34d399] border border-[#34d399]/35',
    gold: 'bg-[#d4a955]/20 text-[#ebc97c] border border-[#d4a955]/40',
    amber: 'bg-[#d4a955]/20 text-[#ebc97c] border border-[#d4a955]/40',
    rose: 'bg-[#96202f]/40 text-[#fda4af] border border-[#fda4af]/35',
    slate: 'bg-white/10 text-white border border-white/20',
  }
  const inner = (
    <div className="swk-gloss-black p-5 h-full flex flex-col justify-between gap-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/70">{label}</span>
        <span className={`grid h-9 w-9 place-items-center rounded-xl shrink-0 ${iconBg[tone]}`}>{icon}</span>
      </div>
      <div>
        <div className={`font-mono text-[24px] sm:text-[26px] font-bold tracking-[-0.035em] leading-tight tabular-nums ${accentText[tone]}`}>
          {value}
        </div>
        <div className="mt-1.5 text-[12px] text-white/72 leading-snug">{hint}</div>
      </div>
    </div>
  )
  if (to && !to.startsWith('#')) {
    return <Link to={to} className="no-underline text-inherit block h-full">{inner}</Link>
  }
  if (to && to.startsWith('#')) {
    return <a href={to} className="no-underline text-inherit block h-full">{inner}</a>
  }
  return inner
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-[1560px] grid gap-5 pb-10">
      <div className="h-[150px] rounded-[26px] bg-soft animate-pulse" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map(i => <div key={i} className="h-[136px] rounded-[26px] bg-soft animate-pulse" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-[340px] rounded-[26px] bg-soft animate-pulse" />
        <div className="h-[340px] rounded-[26px] bg-soft animate-pulse" />
      </div>
    </div>
  )
}
