import { useMemo, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpRight,
  Briefcase,
  CheckCircle2,
  Crown,
  Flame,
  GripVertical,
  KanbanSquare,
  Landmark,
  LayoutList,
  Plus,
  Search,
  Wallet,
} from 'lucide-react'
import { get, post } from '../../lib/api'
import { useMeta } from '../../lib/meta'
import { useToast } from '../../lib/toast'
import { canAccessShabibsCorner } from '@shared/swk-staff-access'
import { PIPELINE_12_STAGES, type PipelineStageDef } from '@shared/swk-pipeline'

const aed = (n: number) => 'AED ' + Math.round(Number(n) || 0).toLocaleString('en-US')

export default function PipelinePage() {
  const { me, can } = useMeta()
  const qc = useQueryClient()
  const toast = useToast()
  const [view, setView] = useState<'kanban' | 'table'>('kanban')
  const [dept, setDept] = useState('All')
  const [term, setTerm] = useState('')
  const [overStage, setOverStage] = useState<string | null>(null)
  const [activeStageGuide, setActiveStageGuide] = useState<PipelineStageDef | null>(null)

  const q = useQuery({
    queryKey: ['pipeline-12-stage'],
    queryFn: () => get<any>('/api/pipeline/12-stage'),
    refetchInterval: 45_000,
  })

  const canEdit = can('sales', 'edit')
  const isOwner = canAccessShabibsCorner(me)

  const moveMut = useMutation({
    mutationFn: ({ jobId, stage_12 }: { jobId: number; stage_12: string }) =>
      post(`/api/pipeline/12-stage/${jobId}/move`, { stage_12 }),
    onSuccess: (_d, vars) => {
      const label = PIPELINE_12_STAGES.find(s => s.code === vars.stage_12)?.label ?? vars.stage_12
      toast.ok(`Deal moved to ${label}`)
      void qc.invalidateQueries({ queryKey: ['pipeline-12-stage'] })
      void qc.invalidateQueries({ queryKey: ['owner-corner-overview'] })
    },
    onError: (e: any) => toast.error(e?.message || 'Could not move deal stage'),
  })

  const stages: any[] = useMemo(() => {
    const raw: any[] = q.data?.stages ?? PIPELINE_12_STAGES.map(s => ({ ...s, count: 0, deal_value_aed: 0, expected_commission_aed: 0, weighted_cash_aed: 0, deals: [] }))
    const t = term.trim().toLowerCase()
    return raw.map(st => {
      const deals = (st.deals ?? []).filter((d: any) =>
        (dept === 'All' || d.department_division === dept) &&
        (!t || `${d.job_no || ''} ${d.deal_name || ''} ${d.client_name || ''} ${d.property_title || ''} ${d.agent_name || ''}`.toLowerCase().includes(t)),
      )
      return {
        ...st,
        deals,
        shownCount: deals.length,
        shownValue: deals.reduce((s: number, d: any) => s + Number(d.deal_value_aed || 0), 0),
        shownComm: deals.reduce((s: number, d: any) => s + Number(d.commission_aed || 0), 0),
      }
    })
  }, [q.data, dept, term])

  const totals = q.data?.totals ?? { total_deals: 0, open_leads: 0, active_inventory: 0, active_mortgages: 0, pipeline_value_aed: 0, expected_commission_aed: 0, weighted_gold_rush_aed: 0 }

  const onDragStart = (e: DragEvent, jobId: number) => {
    e.dataTransfer.setData('text/plain', String(jobId))
    e.dataTransfer.effectAllowed = 'move'
  }
  const onDrop = (e: DragEvent, stageCode: string) => {
    e.preventDefault()
    setOverStage(null)
    if (!canEdit) { toast.error('No edit permission for pipeline stages'); return }
    const jobId = Number(e.dataTransfer.getData('text/plain'))
    if (jobId) moveMut.mutate({ jobId, stage_12: stageCode })
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 pb-10">
      {/* Header + Gold Rush KPIs */}
      <section className="rounded-[28px] bg-gradient-to-br from-[#0b1f2a] via-[#133240] to-[#08151d] p-6 text-white shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#d4a752]/20 border border-[#d4a752]/40 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#f3d27a]">
              <KanbanSquare size={13} /> 12-Stage Pipeline Playbook · Inventory to Final Closure
            </div>
            <h1 className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-white">Pipeline Playbook &amp; Gold-Rush Board</h1>
            <p className="mt-1 text-xs text-slate-300 max-w-2xl">
              Drag deals seamlessly across all 12 UAE brokerage &amp; mortgage milestones. Every stage tracks live deal count, AED volume, and expected cash collection velocity.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isOwner && (
              <Link to="/shabibs-corner" className="inline-flex items-center gap-1.5 rounded-full border border-[#d4a752]/50 bg-[#d4a752]/20 px-4 py-2 text-xs font-bold text-[#f3d27a] no-underline hover:bg-[#d4a752] hover:text-[#0b1f2a]">
                <Crown size={14} /> Privacy Fast Track
              </Link>
            )}
            <Link to="/mortgage-desk" className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-4 py-2 text-xs font-bold text-white no-underline hover:bg-white/20">
              <Landmark size={14} className="text-[#f3d27a]" /> Mortgage Desk ({totals.active_mortgages})
            </Link>
            <Link to="/e/jobs?new=1" className="inline-flex items-center gap-1.5 rounded-full bg-[#d4a752] px-4 py-2 text-xs font-bold text-[#0b1f2a] no-underline hover:bg-[#e5be6e]">
              <Plus size={14} /> New Deal File
            </Link>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            ['Active Pipeline Value', aed(totals.pipeline_value_aed), `${totals.total_deals} active deal files`],
            ['Gold-Rush Weighted Cash', aed(totals.weighted_gold_rush_aed), 'Probability-adjusted commission'],
            ['Full Expected Commission', aed(totals.expected_commission_aed), '2% sale / 5% lease est.'],
            ['Open CRM Leads', String(totals.open_leads), 'Stage 03 intake queue'],
            ['Verified Inventory', String(totals.active_inventory), 'Stage 01–02 active listings'],
          ].map(([label, value, sub]) => (
            <div key={label} className="rounded-2xl border border-white/15 bg-white/8 p-3.5">
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-300">{label}</div>
              <div className="mt-1 text-[18px] font-bold tabular-nums text-white">{value}</div>
              <div className="text-[11px] text-[#f3d27a]/90">{sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 12-Stage Compact Stage Counter Bar */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-12">
        {stages.map(s => (
          <button
            key={s.code}
            type="button"
            onClick={() => setActiveStageGuide(activeStageGuide?.code === s.code ? null : s)}
            className="rounded-2xl border border-line bg-card p-2.5 text-left cursor-pointer hover:border-ink/40 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex size-5 items-center justify-center rounded-md text-[10px] font-extrabold text-white" style={{ background: s.color }}>
                {String(s.step).padStart(2, '0')}
              </span>
              <b className="text-base font-extrabold text-ink tabular-nums">{s.shownCount}</b>
            </div>
            <div className="mt-1 truncate text-[11px] font-bold text-ink">{s.shortLabel}</div>
          </button>
        ))}
      </div>

      {activeStageGuide && (
        <div className="rounded-2xl border border-[#d4a752]/50 bg-[#fefaf0] dark:bg-card p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div>
            <b className="text-sm text-ink">{activeStageGuide.label} Playbook</b>
            <p className="m-0 mt-0.5 text-body">{activeStageGuide.playbookHint}</p>
            <p className="m-0 mt-1 text-emerald-700 font-semibold">Exit Gate: {activeStageGuide.exitGate}</p>
          </div>
          <button type="button" onClick={() => setActiveStageGuide(null)} className="btn outline sm">Close Guide</button>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[220px] max-w-[360px]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-9 h-10 text-xs" placeholder="Search deal, client, property, advisor…" value={term} onChange={e => setTerm(e.target.value)} />
        </div>
        {['All', 'Sales of Off-Plan Projects', 'Secondary Projects', 'Leasing'].map(d => (
          <button
            key={d}
            type="button"
            onClick={() => setDept(d)}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold cursor-pointer ${
              dept === d ? 'border-[#0b1f2a] bg-[#0b1f2a] text-[#f3d27a]' : 'border-line bg-card text-ink'
            }`}
          >
            {d === 'Sales of Off-Plan Projects' ? 'Off-Plan' : d === 'Secondary Projects' ? 'Secondary' : d}
          </button>
        ))}
        <div className="flex-1" />
        <div className="inline-flex rounded-full border border-line bg-card p-1">
          <button type="button" onClick={() => setView('kanban')} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold border-0 cursor-pointer ${view === 'kanban' ? 'bg-[#0b1f2a] text-[#f3d27a]' : 'bg-transparent text-ink'}`}>
            <KanbanSquare size={13} /> Kanban
          </button>
          <button type="button" onClick={() => setView('table')} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold border-0 cursor-pointer ${view === 'table' ? 'bg-[#0b1f2a] text-[#f3d27a]' : 'bg-transparent text-ink'}`}>
            <LayoutList size={13} /> Table
          </button>
        </div>
      </div>

      {/* 12-Stage Kanban Board */}
      {view === 'kanban' ? (
        <div className="flex gap-3.5 overflow-x-auto pb-4 snap-x">
          {stages.map(s => (
            <div
              key={s.code}
              onDragOver={e => { e.preventDefault(); setOverStage(s.code) }}
              onDragLeave={() => setOverStage(cur => (cur === s.code ? null : cur))}
              onDrop={e => onDrop(e, s.code)}
              className={`w-[285px] shrink-0 snap-start rounded-3xl border p-3.5 flex flex-col gap-3 transition-colors ${
                overStage === s.code ? 'border-[#d4a752] bg-[#fef7e6]/60 dark:bg-soft' : 'border-line bg-card'
              }`}
            >
              <div className="flex items-start justify-between gap-2 pb-2 border-b border-line">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex size-5 items-center justify-center rounded-md text-[10px] font-extrabold text-white shrink-0" style={{ background: s.color }}>
                      {String(s.step).padStart(2, '0')}
                    </span>
                    <b className="truncate text-[13px] text-ink">{s.shortLabel}</b>
                  </div>
                  <div className="mt-1 text-[11px] font-semibold text-emerald-700 tabular-nums">{aed(s.shownValue)}</div>
                </div>
                <span className="rounded-full bg-soft px-2.5 py-0.5 text-xs font-extrabold text-ink">{s.shownCount}</span>
              </div>

              <div className="space-y-2.5 min-h-[140px]">
                {s.deals.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-line p-4 text-center text-[11px] text-muted">
                    Drop deal here · {s.exitGate}
                  </div>
                ) : s.deals.map((d: any) => (
                  <div
                    key={d.id}
                    draggable={canEdit}
                    onDragStart={e => onDragStart(e, d.id)}
                    className="rounded-2xl border border-line bg-soft/60 p-3 space-y-2 cursor-grab active:cursor-grabbing hover:border-ink/35"
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="min-w-0">
                        <div className="font-mono text-[10.5px] font-bold text-[#8a621c]">{d.job_no || `DL-${d.id}`}</div>
                        <Link to={`/e/jobs/${d.id}`} className="block text-[13px] font-bold text-ink no-underline hover:underline leading-snug">
                          {d.deal_name}
                        </Link>
                      </div>
                      <GripVertical size={14} className="text-muted shrink-0" />
                    </div>
                    <div className="text-[11px] text-muted truncate">{d.client_name} · {d.property_title}</div>
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-line/70">
                      <b className="text-ink tabular-nums">{aed(d.deal_value_aed)}</b>
                      <span className="text-[11px] font-bold text-emerald-700 tabular-nums">
                        <Wallet size={10} className="inline mr-0.5" />{aed(d.commission_aed)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-[10.5px] text-muted truncate">{d.agent_name}</span>
                      {canEdit && (
                        <select
                          aria-label={`Move ${d.deal_name}`}
                          className="select h-7 py-0 text-[10.5px] max-w-[125px]"
                          value={d.stage_12}
                          onChange={e => moveMut.mutate({ jobId: d.id, stage_12: e.target.value })}
                        >
                          {PIPELINE_12_STAGES.map(opt => <option key={opt.code} value={opt.code}>{String(opt.step).padStart(2, '0')} · {opt.shortLabel}</option>)}
                        </select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-line bg-card overflow-x-auto shadow-xs">
          <table className="w-full text-xs">
            <thead className="bg-soft text-left">
              <tr>
                <th className="p-3">Deal No.</th><th className="p-3">Deal &amp; Client</th><th className="p-3">12-Stage Playbook</th>
                <th className="p-3">Advisor</th><th className="p-3">Value (AED)</th><th className="p-3">Est. Comm.</th><th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {stages.flatMap(s => s.deals.map((d: any) => ({ ...d, stageLabel: s.label, stageColor: s.color }))).map((d: any) => (
                <tr key={d.id} className="border-t border-line">
                  <td className="p-3 font-mono font-bold text-[#8a621c]">{d.job_no || d.id}</td>
                  <td className="p-3"><b className="text-ink">{d.deal_name}</b><div className="text-muted">{d.client_name} · {d.property_title}</div></td>
                  <td className="p-3"><span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white" style={{ background: d.stageColor }}>{d.stageLabel}</span></td>
                  <td className="p-3">{d.agent_name}</td>
                  <td className="p-3 font-bold tabular-nums">{aed(d.deal_value_aed)}</td>
                  <td className="p-3 font-bold text-emerald-700 tabular-nums">{aed(d.commission_aed)}</td>
                  <td className="p-3"><Link to={`/e/jobs/${d.id}`} className="inline-flex items-center gap-1 font-bold text-[#2563eb] no-underline">Open <ArrowUpRight size={12} /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
