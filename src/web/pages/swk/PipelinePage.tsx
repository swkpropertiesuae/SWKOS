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
import { BracketLink, SwissHeroHeader } from '../../components/ui/SwissPrimitives'

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
      {/* Swiss Architectural Header + Gold-Rush KPI Strip */}
      <SwissHeroHeader
        eyebrow="12-Stage Pipeline Playbook · Inventory to Final Closure"
        title="Pipeline Playbook & Gold-Rush Board"
        subtitle="Drag deals seamlessly across all 12 UAE brokerage & mortgage milestones. Every stage tracks live deal count, AED volume, and expected cash collection velocity."
        actions={
          <>
            {isOwner && (
              <BracketLink to="/shabibs-corner" variant="light" size="sm">
                <Crown size={13} className="text-[#0e9f6e]" /> Privacy Fast Track
              </BracketLink>
            )}
            <BracketLink to="/mortgage-desk" variant="light" size="sm">
              <Landmark size={13} /> Mortgage Desk ({totals.active_mortgages})
            </BracketLink>
            <BracketLink to="/e/jobs?new=1" variant="dark" size="sm">
              <Plus size={13} className="text-[#51fec0]" /> New Deal File
            </BracketLink>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            ['Active Pipeline Value', aed(totals.pipeline_value_aed), `${totals.total_deals} active deal files`],
            ['Gold-Rush Weighted Cash', aed(totals.weighted_gold_rush_aed), 'Probability-adjusted commission'],
            ['Full Expected Commission', aed(totals.expected_commission_aed), '2% sale / 5% lease est.'],
            ['Open CRM Leads', String(totals.open_leads), 'Stage 03 intake queue'],
            ['Verified Inventory', String(totals.active_inventory), 'Stage 01–02 active listings'],
          ].map(([label, value, sub]) => (
            <div key={label} className="rounded-2xl border border-black/[0.08] bg-white/90 p-3.5 shadow-[0_6px_18px_rgba(12,56,96,0.05)]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#5b6778]">{label}</div>
              <div className="mt-1 font-mono text-[18px] font-semibold tabular-nums text-[#121212]">{value}</div>
              <div className="mt-0.5 text-[11px] text-[#0e9f6e] font-medium">{sub}</div>
            </div>
          ))}
        </div>
      </SwissHeroHeader>

      {/* 12-Stage Compact Stage Counter Bar */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-12">
        {stages.map(s => (
          <button
            key={s.code}
            type="button"
            onClick={() => setActiveStageGuide(activeStageGuide?.code === s.code ? null : s)}
            className={`rounded-2xl border p-2.5 text-left cursor-pointer transition-all ${
              activeStageGuide?.code === s.code
                ? 'border-[#121212] bg-[#121212] text-white shadow-md'
                : 'border-white/88 bg-white/86 text-[#121212] backdrop-blur-xl hover:border-[#121212]/30'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`inline-flex h-5 px-1.5 items-center justify-center rounded-full font-mono text-[9.5px] font-semibold ${activeStageGuide?.code === s.code ? 'bg-[#51fec0] text-[#121212]' : 'bg-[#121212] text-[#51fec0]'}`}>
                {String(s.step).padStart(2, '0')}
              </span>
              <b className="font-mono text-base font-semibold tabular-nums">{s.shownCount}</b>
            </div>
            <div className="mt-1 truncate text-[11px] font-medium">{s.shortLabel}</div>
          </button>
        ))}
      </div>

      {activeStageGuide && (
        <div className="rounded-2xl border border-black/[0.1] bg-white/92 backdrop-blur-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
          <div>
            <b className="text-sm text-[#121212]">{activeStageGuide.label} Playbook</b>
            <p className="m-0 mt-0.5 text-[#475569]">{activeStageGuide.playbookHint}</p>
            <p className="m-0 mt-1 text-[#0e9f6e] font-semibold">Exit Gate: {activeStageGuide.exitGate}</p>
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
            className={`rounded-full border px-3.5 py-1.5 text-xs font-medium cursor-pointer transition-colors ${
              dept === d ? 'border-[#121212] bg-[#121212] text-white' : 'border-white/88 bg-white/85 text-[#121212] hover:border-[#121212]/30'
            }`}
          >
            {d === 'Sales of Off-Plan Projects' ? 'Off-Plan' : d === 'Secondary Projects' ? 'Secondary' : d}
          </button>
        ))}
        <div className="flex-1" />
        <div className="inline-flex rounded-full border border-line bg-card p-1">
          <button type="button" onClick={() => setView('kanban')} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold border-0 cursor-pointer ${view === 'kanban' ? 'bg-[#121212] text-[#51fec0]' : 'bg-transparent text-ink'}`}>
            <KanbanSquare size={13} /> Kanban
          </button>
          <button type="button" onClick={() => setView('table')} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold border-0 cursor-pointer ${view === 'table' ? 'bg-[#121212] text-[#51fec0]' : 'bg-transparent text-ink'}`}>
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
              className={`w-[285px] shrink-0 snap-start rounded-[24px] border p-3.5 flex flex-col gap-3 backdrop-blur-2xl transition-colors ${
                overStage === s.code ? 'border-[#121212] bg-white shadow-lg' : 'border-white/88 bg-white/86 shadow-[0_14px_38px_rgba(12,56,96,0.08)]'
              }`}
            >
              <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-black/[0.06]">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-5 px-2 items-center justify-center rounded-full bg-[#121212] font-mono text-[9.5px] font-semibold text-[#51fec0] shrink-0">
                      {String(s.step).padStart(2, '0')}
                    </span>
                    <b className="truncate text-[13px] font-medium text-[#121212]">{s.shortLabel}</b>
                  </div>
                  <div className="mt-1 font-mono text-[11px] font-semibold text-[#0e9f6e] tabular-nums">{aed(s.shownValue)}</div>
                </div>
                <span className="rounded-full bg-[#f4f7fa] border border-black/[0.06] px-2.5 py-0.5 font-mono text-xs font-semibold text-[#121212]">{s.shownCount}</span>
              </div>

              <div className="space-y-2.5 min-h-[140px]">
                {s.deals.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-black/[0.12] p-4 text-center text-[11px] text-[#64748b]">
                    Drop deal here · {s.exitGate}
                  </div>
                ) : s.deals.map((d: any) => (
                  <div
                    key={d.id}
                    draggable={canEdit}
                    onDragStart={e => onDragStart(e, d.id)}
                    className="rounded-2xl border border-black/[0.08] bg-white p-3 space-y-2 cursor-grab active:cursor-grabbing shadow-[0_4px_14px_rgba(12,56,96,0.05)] hover:border-[#121212]/30"
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="min-w-0">
                        <div className="font-mono text-[10px] font-semibold text-[#0e9f6e]">{d.job_no || `DL-${d.id}`}</div>
                        <Link to={`/e/jobs/${d.id}`} className="block text-[13px] font-semibold text-[#121212] no-underline hover:underline leading-snug">
                          {d.deal_name}
                        </Link>
                      </div>
                      <GripVertical size={14} className="text-muted shrink-0" />
                    </div>
                    <div className="text-[11px] text-[#5b6778] truncate">{d.client_name} · {d.property_title}</div>
                    <div className="flex items-center justify-between text-xs pt-1.5 border-t border-black/[0.06]">
                      <b className="font-mono text-[#121212] tabular-nums">{aed(d.deal_value_aed)}</b>
                      <span className="font-mono text-[11px] font-semibold text-[#0e9f6e] tabular-nums">
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
