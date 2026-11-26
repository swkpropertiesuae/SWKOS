import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Database,
  Lock,
  MapPin,
  Plus,
  Send,
  ShieldCheck,
  Wifi,
  XCircle,
} from 'lucide-react'
import { get, post } from '../../lib/api'
import { useToast } from '../../lib/toast'
import { CORE_MASTER_REGISTRIES } from '@shared/swk-pipeline'

const GROUPS = [
  'All',
  'Core Masters',
  'Finance & Compliance',
  'People & Access',
  'Real Estate Operations',
  'Platform & Automation',
] as const

export default function MasterLogPage() {
  const [group, setGroup] = useState<(typeof GROUPS)[number]>('All')
  const [search, setSearch] = useState('')
  const [proposeOpen, setProposeOpen] = useState(false)
  const [propEntity, setPropEntity] = useState('communities')
  const [propCode, setPropCode] = useState('')
  const [propName, setPropName] = useState('')
  const [propExtra, setPropExtra] = useState('')
  const [propReason, setPropReason] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const qc = useQueryClient()

  const sumQ = useQuery({
    queryKey: ['core-masters-summary'],
    queryFn: () => get<any>('/api/core-masters/summary'),
  })
  const reqQ = useQuery({
    queryKey: ['core-masters-requests'],
    queryFn: () => get<any>('/api/core-masters/change-requests'),
  })

  const items: any[] = sumQ.data?.items ?? CORE_MASTER_REGISTRIES.map(m => ({ ...m, count: 0 }))
  const shown = useMemo(() => {
    const t = search.trim().toLowerCase()
    return items.filter(i => (group === 'All' || i.group === group) && (!t || `${i.title} ${i.subtitle} ${i.key}`.toLowerCase().includes(t)))
  }, [items, group, search])

  const submitProposal = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const payload: Record<string, any> = { name: propName.trim() }
      if (propCode.trim()) payload.code = propCode.trim().toUpperCase()
      if (propEntity === 'communities') {
        payload.emirate = 'Dubai'
        payload.area = 'Dubai'
        if (propExtra.trim()) payload.avg_price_sqft = Number(propExtra) || undefined
      } else if (propEntity === 'developers') {
        payload.emirate = 'Dubai'
        if (propExtra.trim()) payload.rera_id = propExtra.trim()
      } else if (propExtra.trim()) {
        payload.description = propExtra.trim()
      }
      await post('/api/core-masters/change-requests', {
        entity: propEntity,
        action: 'create',
        record_label: `${propCode ? propCode.toUpperCase() + ' – ' : ''}${propName.trim()}`,
        payload,
        reason: propReason.trim(),
      })
      toast.ok('Submitted to Owner Shabib for Master Log approval')
      setProposeOpen(false)
      setPropCode(''); setPropName(''); setPropExtra(''); setPropReason('')
      void qc.invalidateQueries({ queryKey: ['core-masters-requests'] })
      void qc.invalidateQueries({ queryKey: ['core-masters-summary'] })
    } catch (err: any) { toast.error(err.message) } finally { setBusy(false) }
  }

  const decide = async (id: number, decision: 'approve' | 'reject') => {
    setBusy(true)
    try {
      await post(`/api/core-masters/change-requests/${id}/decide`, { decision })
      toast.ok(decision === 'approve' ? 'Approved & saved to Master Log' : 'Rejected')
      void qc.invalidateQueries({ queryKey: ['core-masters-requests'] })
      void qc.invalidateQueries({ queryKey: ['core-masters-summary'] })
    } catch (err: any) { toast.error(err.message) } finally { setBusy(false) }
  }

  const ho = sumQ.data?.head_office
  const requests: any[] = reqQ.data?.rows ?? []
  const canApprove = Boolean(reqQ.data?.can_approve)
  const requiresApproval = Boolean(sumQ.data?.requires_owner_approval)

  return (
    <div className="mx-auto max-w-[1360px] space-y-6 pb-10">
      {/* Header */}
      <section className="rounded-[28px] border border-line bg-gradient-to-br from-[#0b1f2a] via-[#122d3c] to-[#0a1a24] p-6 text-white shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d4a752]/40 bg-[#d4a752]/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#f3d27a]">
              <Database size={13} /> CORE Headquarters · Single Source of Truth
            </div>
            <h1 className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-white">
              Master Log (CORE)
            </h1>
            <p className="mt-1 max-w-2xl text-[13.5px] text-slate-300">
              All 20 foundational SWK Properties registries. Only Owner Shabib &amp; System Admin edit directly; Office Admin Meenakshi submits additions/edits into the Owner Approval Gate.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setProposeOpen(v => !v)} className="inline-flex items-center gap-1.5 rounded-full bg-[#d4a752] px-4 py-2 text-xs font-bold text-[#0b1f2a] border-0 cursor-pointer hover:bg-[#e5be6e]">
              <Plus size={14} /> {requiresApproval ? 'Request Master Add (Needs Approval)' : 'Propose Master Change'}
            </button>
            <Link to="/e/branches" className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold text-white no-underline hover:bg-white/20">
              <MapPin size={14} className="text-[#f3d27a]" /> Office Geofence
            </Link>
          </div>
        </div>

        {/* Head Office Geofence & Wi-Fi Strip */}
        {ho && (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-white/15 bg-white/8 px-4 py-3 text-xs">
            <span className="inline-flex items-center gap-1.5 font-bold text-[#f3d27a]"><Building2 size={14} /> {ho.name}</span>
            <span className="text-slate-300">{ho.address}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-slate-200">
              <Wifi size={12} className="text-emerald-400" /> Wi-Fi: {ho.wifi_ssid} ({ho.wifi_locked ? 'IP Locked' : 'Setup Pending'})
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-slate-200">
              <MapPin size={12} className="text-sky-300" /> Geofence: {ho.gps_lat}, {ho.gps_lng} ({ho.geofence_radius_m}m)
            </span>
          </div>
        )}
      </section>

      {/* Office Admin Approval Proposal Drawer */}
      {proposeOpen && (
        <form onSubmit={submitProposal} className="rounded-3xl border border-[#d4a752]/50 bg-[#fefaf0] dark:bg-card p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="m-0 text-[16px] font-bold text-ink flex items-center gap-2">
              <Send size={16} className="text-[#8a621c]" /> Submit CORE Master Log Request for Owner Approval
            </h2>
            <button type="button" onClick={() => setProposeOpen(false)} className="text-xs underline bg-transparent border-0 cursor-pointer text-muted">Close</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <select className="select" value={propEntity} onChange={e => setPropEntity(e.target.value)}>
              {CORE_MASTER_REGISTRIES.filter(m => m.adminCanPropose).map(m => (
                <option key={m.key} value={m.key}>{m.title}</option>
              ))}
            </select>
            <input className="input" placeholder="Code (e.g. JVC, EMAAR)" value={propCode} onChange={e => setPropCode(e.target.value)} />
            <input className="input" required placeholder="Name / Title *" value={propName} onChange={e => setPropName(e.target.value)} />
            <input className="input" placeholder={propEntity === 'communities' ? 'Avg AED / sq.ft' : propEntity === 'developers' ? 'RERA Dev ID' : 'Description / Details'} value={propExtra} onChange={e => setPropExtra(e.target.value)} />
          </div>
          <input className="input" required placeholder="Business reason for Owner Shabib's approval *" value={propReason} onChange={e => setPropReason(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setProposeOpen(false)} className="btn outline">Cancel</button>
            <button disabled={busy} type="submit" className="btn bg-[#0b1f2a] text-[#f3d27a]">
              <Send size={14} /> Send for Owner Sign-Off
            </button>
          </div>
        </form>
      )}

      {/* Filter Pills + Search */}
      <div className="flex flex-wrap items-center gap-2">
        {GROUPS.map(g => (
          <button
            key={g}
            type="button"
            onClick={() => setGroup(g)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-bold cursor-pointer transition-colors ${
              group === g ? 'border-[#0b1f2a] bg-[#0b1f2a] text-[#f3d27a]' : 'border-line bg-card text-ink hover:border-ink/30'
            }`}
          >
            {g}
          </button>
        ))}
        <div className="flex-1" />
        <input
          className="input max-w-[260px] h-9 text-xs"
          placeholder="Filter 20 CORE registries…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Exact 20-Card Master Log Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map(card => (
          <Link
            key={card.key}
            to={card.route}
            className="group rounded-[22px] border border-line bg-card p-5 no-underline shadow-xs transition-all hover:-translate-y-0.5 hover:border-[#0b1f2a]/40 hover:shadow-md flex flex-col justify-between gap-3"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#8a621c]">{card.group}</span>
                <span className="rounded-full bg-soft px-2.5 py-0.5 text-xs font-extrabold text-ink tabular-nums">{card.count}</span>
              </div>
              <h3 className="m-0 mt-2 text-[16px] font-bold text-ink group-hover:text-[#1d4ed8]">{card.title}</h3>
              <p className="mt-1 mb-0 text-xs text-muted leading-relaxed">{card.subtitle}</p>
            </div>
            <div className="pt-2.5 border-t border-line flex items-center justify-between text-xs">
              <span className="font-mono text-[11px] text-muted">{card.key}</span>
              <span className="inline-flex items-center gap-1 font-bold text-[#0b1f2a] dark:text-[#f3d27a]">
                {card.ownerOnlyDirect && <Lock size={11} />} Open Master <ArrowUpRight size={13} />
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* Master Change Requests History / Approval Queue */}
      {requests.length > 0 && (
        <section className="rounded-3xl border border-line bg-card p-5 shadow-xs space-y-3">
          <h2 className="m-0 text-[16px] font-bold text-ink flex items-center gap-2">
            <ShieldCheck size={17} className="text-[#047857]" /> Master Log Approval Queue ({requests.filter(r => r.status === 'Pending').length} Pending)
          </h2>
          <div className="space-y-2.5">
            {requests.slice(0, 15).map(r => (
              <div key={r.id} className="rounded-2xl border border-line p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-mono font-bold uppercase text-[#8a621c] mr-2">{r.entity}</span>
                  <b className="text-ink">{r.record_label}</b>
                  <span className="ml-2 text-muted">· {r.requested_by_name} · {r.reason}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 font-bold ${
                    r.status === 'Approved' ? 'bg-emerald-50 text-emerald-700' : r.status === 'Rejected' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'
                  }`}>{r.status}</span>
                  {canApprove && r.status === 'Pending' && (
                    <>
                      <button disabled={busy} type="button" onClick={() => void decide(r.id, 'approve')} className="btn green sm"><CheckCircle2 size={13} /> Approve</button>
                      <button disabled={busy} type="button" onClick={() => void decide(r.id, 'reject')} className="btn outline sm text-rose-700"><XCircle size={13} /> Reject</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
