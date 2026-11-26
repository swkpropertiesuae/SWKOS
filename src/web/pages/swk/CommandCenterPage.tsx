import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Clock,
  Landmark,
  MapPinned,
  QrCode,
  Radio,
  Users,
} from 'lucide-react'
import { get } from '../../lib/api'
import { BracketLink, LiveStatusDot, SectionEyebrow, SwissCarousel, SwissHeroHeader } from '../../components/ui/SwissPrimitives'

const aed = (n: number) => 'AED ' + Math.round(Number(n) || 0).toLocaleString('en-US')

export default function CommandCenterPage() {
  const q = useQuery({
    queryKey: ['command-center-overview'],
    queryFn: () => get<any>('/api/command-center/overview'),
    refetchInterval: 30_000,
  })
  const d = q.data
  const stages: any[] = d?.pipeline?.stages ?? []
  const att = d?.attendance ?? { checked_in: 0, total: 0, board: [] }
  const gps = d?.field_gps ?? { active_count: 0, sessions: [] }
  const tasks = d?.tasks ?? { my_tasks: [], team_tasks: [], individual_summary: [] }
  const clients: any[] = d?.assigned_clients ?? []
  const alerts: any[] = d?.critical_alerts ?? []
  const mort: any[] = d?.mortgage_deadlines ?? []

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 pb-10">
      {/* Swiss Architectural Header */}
      <SwissHeroHeader
        eyebrow="Live Operations Cockpit · Al Saqr Building SZR"
        badge={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#a7f3d0] bg-[#ecfdf5] px-2.5 py-0.5 text-[10.5px] font-semibold text-[#047857]">
            <LiveStatusDot /> Live Feed
          </span>
        }
        title="Command Center"
        subtitle="12-stage live deal counts, critical alerts, today's personal & team tasks, assigned clients, office QR attendance & live Field GPS radar."
        actions={
          <>
            <BracketLink to="/reception-qr" variant="light" size="sm">
              <QrCode size={14} /> Office QR ({att.checked_in}/{att.total})
            </BracketLink>
            <BracketLink to="/field-live" variant="dark" size="sm">
              <MapPinned size={14} className="text-[#51fec0]" /> Live Field GPS ({gps.active_count})
            </BracketLink>
          </>
        }
      >
        {/* Critical Alerts Strip */}
        {alerts.length > 0 && (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {alerts.map((a, i) => (
              <Link
                key={i}
                to={a.to}
                className={`rounded-2xl border p-3.5 no-underline transition-all hover:-translate-y-0.5 ${
                  a.severity === 'critical'
                    ? 'border-[#fecaca] bg-[#fef2f2] text-[#991b1b]'
                    : a.severity === 'warning'
                      ? 'border-[#fde68a] bg-[#fffbeb] text-[#92400e]'
                      : 'border-black/[0.08] bg-[#f4f7fa] text-[#121212]'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <AlertTriangle size={13} /> {a.title}
                </div>
                <div className="mt-1 text-[11.5px] opacity-85">{a.detail}</div>
              </Link>
            ))}
          </div>
        )}
      </SwissHeroHeader>

      {/* 12-Stage Live Lead & Deal Carousel */}
      <section className="card p-5 sm:p-6">
        <div className="flex items-end justify-between gap-2 mb-4">
          <div>
            <SectionEyebrow>Pipeline Velocity</SectionEyebrow>
            <h2 className="m-0 mt-1 text-[19px] font-medium tracking-[-0.03em] text-[#121212]">12-Stage Pipeline Live Counters</h2>
          </div>
          <BracketLink to="/pipeline" variant="light" size="sm">
            Open Kanban <ArrowUpRight size={13} />
          </BracketLink>
        </div>
        <SwissCarousel ariaLabel="Command center 12-stage counters" hint="SWIPE STAGES">
          {stages.map(s => (
            <Link key={s.code} to="/pipeline" className="w-[196px] shrink-0 snap-start rounded-[20px] border border-black/[0.08] bg-white/95 p-3.5 no-underline transition-all hover:-translate-y-0.5 hover:border-[#121212]/30 hover:shadow-[0_16px_36px_rgba(12,56,96,0.11)]">
              <div className="flex items-center justify-between">
                <span className="inline-flex h-6 px-2 items-center justify-center rounded-full bg-[#121212] font-mono text-[10px] font-semibold text-[#51fec0]">
                  {String(s.step).padStart(2, '0')}
                </span>
                <b className="font-mono text-xl font-semibold text-[#121212] tabular-nums">{s.count}</b>
              </div>
              <div className="mt-2.5 truncate text-xs font-medium text-[#121212]">{s.shortLabel}</div>
              <div className="mt-1 font-mono text-[11px] text-[#0e9f6e] font-semibold tabular-nums">{aed(s.deal_value_aed)}</div>
            </Link>
          ))}
        </SwissCarousel>
      </section>

      {/* Tasks Monitor: My Tasks Today + Team Tasks + Individual Breakdown */}
      <section className="grid gap-5 lg:grid-cols-3">
        <div className="card p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="m-0 text-[15px] font-medium tracking-[-0.02em] text-[#121212] flex items-center gap-2 min-w-0 truncate"><ClipboardList size={15} className="text-[#121212] shrink-0" /> <span className="truncate">My Tasks Today ({tasks.my_tasks.length})</span></h3>
            <Link to="/my-work" className="text-xs font-medium text-[#0e9f6e] hover:text-[#121212] no-underline shrink-0">View all</Link>
          </div>
          <div className="space-y-2 max-h-[260px] overflow-auto">
            {tasks.my_tasks.length === 0 ? <p className="text-xs text-muted">All caught up on personal tasks.</p> : tasks.my_tasks.map((t: any) => (
              <Link key={t.id} to={`/e/tasks/${t.id}`} className="block rounded-xl border border-line bg-white/80 p-2.5 text-xs no-underline hover:bg-soft">
                <div className="font-semibold text-ink">{t.title}</div>
                <div className="mt-0.5 text-muted flex justify-between"><span>{t.priority || 'Normal'}</span><span>Due {t.due_date || 'Today'}</span></div>
              </Link>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="m-0 text-[15px] font-medium tracking-[-0.02em] text-[#121212] flex items-center gap-2 min-w-0 truncate"><Users size={15} className="text-[#121212] shrink-0" /> <span className="truncate">Individual Staff Tasks</span></h3>
            <Link to="/e/tasks" className="text-xs font-medium text-[#0e9f6e] hover:text-[#121212] no-underline shrink-0">All tasks</Link>
          </div>
          <div className="space-y-2 max-h-[260px] overflow-auto">
            {tasks.individual_summary.length === 0 ? <p className="text-xs text-muted">No open team tasks.</p> : tasks.individual_summary.map((s: any) => (
              <div key={s.name} className="rounded-xl border border-line bg-white/80 p-2.5 flex items-center justify-between text-xs">
                <b className="text-ink">{s.name}</b>
                <div className="flex gap-1.5">
                  <span className="rounded-full bg-soft px-2 py-0.5 font-semibold">{s.total} open</span>
                  {s.overdue > 0 && <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">{s.overdue} overdue</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="m-0 text-[15px] font-medium tracking-[-0.02em] text-[#121212] flex items-center gap-2 min-w-0 truncate"><Landmark size={15} className="text-[#0e9f6e] shrink-0" /> <span className="truncate">Mortgage &amp; Valuation</span></h3>
            <Link to="/mortgage-desk" className="text-xs font-medium text-[#0e9f6e] hover:text-[#121212] no-underline shrink-0">Mortgage Desk</Link>
          </div>
          <div className="space-y-2 max-h-[260px] overflow-auto">
            {mort.length === 0 ? <p className="text-xs text-muted">No pending valuation/bank deadlines.</p> : mort.map((m: any) => (
              <div key={m.id} className="rounded-xl border border-line bg-white/80 p-2.5 text-xs">
                <div className="flex justify-between font-semibold text-ink"><span>{m.client_name}</span><span className="font-mono text-[#0e9f6e]">{m.due_date}</span></div>
                <div className="text-muted mt-0.5">{m.event_type} · {m.bank_name} · {m.status}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Attendance Board + Field GPS + Assigned Clients */}
      <section className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-5 card p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="m-0 text-[15px] font-medium tracking-[-0.02em] text-[#121212] flex items-center gap-2 min-w-0 truncate"><Clock size={15} className="text-[#0e9f6e] shrink-0" /> <span className="truncate">Office Attendance Today ({att.checked_in}/{att.total})</span></h3>
            <Link to="/reception-qr" className="text-xs font-medium text-[#0e9f6e] hover:text-[#121212] no-underline shrink-0">QR Screen</Link>
          </div>
          <div className="space-y-2 max-h-[300px] overflow-auto">
            {att.board.map((row: any) => (
              <div key={row.employee_id} className="flex items-center justify-between rounded-xl border border-line bg-white/80 px-3 py-2 text-xs">
                <div>
                  <b className="text-ink">{row.name}</b>
                  <span className="ml-1.5 text-muted">{row.designation}</span>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold ${
                  row.checked_in ? 'bg-[#ecfdf5] text-[#047857]' : 'bg-soft text-muted'
                }`}>
                  {row.checked_in && <CheckCircle2 size={11} />}
                  {row.checked_in ? `${row.status}` : 'Not In'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7 card p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="m-0 text-[15px] font-medium tracking-[-0.02em] text-[#121212] min-w-0 truncate">Assigned Clients (Referrals &amp; Staff Desk)</h3>
            <Link to="/e/leads" className="text-xs font-medium text-[#0e9f6e] hover:text-[#121212] no-underline shrink-0">All CRM Leads</Link>
          </div>
          <div className="overflow-x-auto max-h-[300px]">
            <table className="w-full text-xs">
              <thead className="bg-soft text-left">
                <tr><th className="p-2">Client</th><th className="p-2">Source</th><th className="p-2">Target</th><th className="p-2">Assigned Staff</th><th className="p-2">Budget</th></tr>
              </thead>
              <tbody>
                {clients.length === 0 ? (
                  <tr><td colSpan={5} className="p-4 text-center text-muted">No active assigned clients yet.</td></tr>
                ) : clients.slice(0, 15).map((c: any) => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="p-2 font-bold"><Link to={`/e/leads/${c.id}`} className="text-ink no-underline hover:underline">{c.client_name}</Link></td>
                    <td className="p-2">{c.source || 'Direct'}</td>
                    <td className="p-2 text-muted">{c.destination || 'Dubai'}</td>
                    <td className="p-2 font-semibold">{c.owner_name || 'Lead Pool'}</td>
                    <td className="p-2 font-bold text-emerald-700">{c.est_value_aed ? aed(c.est_value_aed) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  )
}
