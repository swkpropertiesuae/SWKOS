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
      {/* Header */}
      <section className="rounded-[28px] bg-gradient-to-br from-[#0b1f2a] via-[#132f3f] to-[#08151d] p-6 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.15em] text-[#c5e86c]">
              <Radio size={13} /> Live Operations Cockpit · Al Saqr Building SZR
            </div>
            <h1 className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-white">Command Center</h1>
            <p className="mt-1 text-xs text-slate-300">
              12-stage live deal counts, critical alerts, today&apos;s personal &amp; team tasks, assigned clients, office QR attendance &amp; live Field GPS radar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/reception-qr" className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-4 py-2 text-xs font-bold text-white no-underline hover:bg-white/20">
              <QrCode size={14} className="text-[#f3d27a]" /> Office QR ({att.checked_in}/{att.total})
            </Link>
            <Link to="/field-live" className="inline-flex items-center gap-1.5 rounded-full bg-[#d4a752] px-4 py-2 text-xs font-bold text-[#0b1f2a] no-underline hover:bg-[#e5be6e]">
              <MapPinned size={14} /> Live Field GPS ({gps.active_count})
            </Link>
          </div>
        </div>

        {/* Critical Alerts Strip */}
        {alerts.length > 0 && (
          <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {alerts.map((a, i) => (
              <Link
                key={i}
                to={a.to}
                className={`rounded-2xl border p-3.5 no-underline transition-colors ${
                  a.severity === 'critical'
                    ? 'border-rose-400/40 bg-rose-500/20 text-white'
                    : a.severity === 'warning'
                      ? 'border-amber-400/40 bg-amber-500/20 text-white'
                      : 'border-white/20 bg-white/10 text-white'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  <AlertTriangle size={13} /> {a.title}
                </div>
                <div className="mt-1 text-[11.5px] text-white/80">{a.detail}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 12-Stage Live Lead & Deal Counters */}
      <section className="rounded-3xl border border-line bg-card p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <h2 className="m-0 text-[16px] font-bold text-ink">12-Stage Pipeline Live Counters</h2>
          <Link to="/pipeline" className="text-xs font-bold text-[#2563eb] no-underline inline-flex items-center gap-1">
            Open Kanban <ArrowUpRight size={13} />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {stages.map(s => (
            <Link key={s.code} to="/pipeline" className="rounded-2xl border border-line bg-soft/60 p-3 no-underline hover:border-ink/40">
              <div className="flex items-center justify-between">
                <span className="inline-flex size-6 items-center justify-center rounded-lg text-[11px] font-bold text-white" style={{ background: s.color }}>
                  {String(s.step).padStart(2, '0')}
                </span>
                <b className="text-lg font-extrabold text-ink tabular-nums">{s.count}</b>
              </div>
              <div className="mt-1.5 truncate text-xs font-bold text-ink">{s.shortLabel}</div>
              <div className="text-[11px] text-emerald-700 font-semibold tabular-nums">{aed(s.deal_value_aed)}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Tasks Monitor: My Tasks Today + Team Tasks + Individual Breakdown */}
      <section className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-3xl border border-line bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="m-0 text-[15px] font-bold text-ink flex items-center gap-2"><ClipboardList size={16} className="text-[#2563eb]" /> My Tasks Today ({tasks.my_tasks.length})</h3>
            <Link to="/my-work" className="text-xs font-semibold text-[#2563eb] no-underline">View all</Link>
          </div>
          <div className="space-y-2 max-h-[260px] overflow-auto">
            {tasks.my_tasks.length === 0 ? <p className="text-xs text-muted">All caught up on personal tasks.</p> : tasks.my_tasks.map((t: any) => (
              <Link key={t.id} to={`/e/tasks/${t.id}`} className="block rounded-xl border border-line p-2.5 text-xs no-underline hover:bg-soft">
                <div className="font-bold text-ink">{t.title}</div>
                <div className="mt-0.5 text-muted flex justify-between"><span>{t.priority || 'Normal'}</span><span>Due {t.due_date || 'Today'}</span></div>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-line bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="m-0 text-[15px] font-bold text-ink flex items-center gap-2"><Users size={16} className="text-[#8a621c]" /> Individual Staff Task Monitor</h3>
            <Link to="/e/tasks" className="text-xs font-semibold text-[#2563eb] no-underline">All tasks</Link>
          </div>
          <div className="space-y-2 max-h-[260px] overflow-auto">
            {tasks.individual_summary.length === 0 ? <p className="text-xs text-muted">No open team tasks.</p> : tasks.individual_summary.map((s: any) => (
              <div key={s.name} className="rounded-xl border border-line p-2.5 flex items-center justify-between text-xs">
                <b className="text-ink">{s.name}</b>
                <div className="flex gap-1.5">
                  <span className="rounded-full bg-soft px-2 py-0.5 font-bold">{s.total} open</span>
                  {s.overdue > 0 && <span className="rounded-full bg-rose-50 px-2 py-0.5 font-bold text-rose-700">{s.overdue} overdue</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-line bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="m-0 text-[15px] font-bold text-ink flex items-center gap-2"><Landmark size={16} className="text-emerald-700" /> Mortgage &amp; Valuation Deadlines</h3>
            <Link to="/mortgage-desk" className="text-xs font-semibold text-[#2563eb] no-underline">Mortgage Desk</Link>
          </div>
          <div className="space-y-2 max-h-[260px] overflow-auto">
            {mort.length === 0 ? <p className="text-xs text-muted">No pending valuation/bank deadlines.</p> : mort.map((m: any) => (
              <div key={m.id} className="rounded-xl border border-line p-2.5 text-xs">
                <div className="flex justify-between font-bold text-ink"><span>{m.client_name}</span><span className="text-[#8a621c]">{m.due_date}</span></div>
                <div className="text-muted mt-0.5">{m.event_type} · {m.bank_name} · {m.status}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Attendance Board + Field GPS + Assigned Clients */}
      <section className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-5 rounded-3xl border border-line bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="m-0 text-[15px] font-bold text-ink flex items-center gap-2"><Clock size={16} className="text-emerald-700" /> Office Attendance Today ({att.checked_in}/{att.total})</h3>
            <Link to="/reception-qr" className="text-xs font-semibold text-[#2563eb] no-underline">QR Screen</Link>
          </div>
          <div className="space-y-2 max-h-[300px] overflow-auto">
            {att.board.map((row: any) => (
              <div key={row.employee_id} className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-xs">
                <div>
                  <b className="text-ink">{row.name}</b>
                  <span className="ml-1.5 text-muted">{row.designation}</span>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold ${
                  row.checked_in ? 'bg-emerald-50 text-emerald-700' : 'bg-soft text-muted'
                }`}>
                  {row.checked_in && <CheckCircle2 size={11} />}
                  {row.checked_in ? `${row.status}` : 'Not In'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7 rounded-3xl border border-line bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="m-0 text-[15px] font-bold text-ink">Assigned Clients (Referrals &amp; Staff Desk)</h3>
            <Link to="/e/leads" className="text-xs font-semibold text-[#2563eb] no-underline">All CRM Leads</Link>
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
