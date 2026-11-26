import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Crown,
  Database,
  FileText,
  Flame,
  KanbanSquare,
  Lock,
  Plus,
  Receipt,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Wallet,
  XCircle,
} from 'lucide-react'
import { del, get, post, put } from '../../lib/api'
import { useToast } from '../../lib/toast'
import { PIPELINE_12_STAGES } from '@shared/swk-pipeline'

type Tab = 'fast-track' | 'playbook' | 'approvals' | 'bulk-ai' | 'ledger'

const aed = (n: number) => 'AED ' + Math.round(Number(n) || 0).toLocaleString('en-US')

export default function ShabibsCornerPage() {
  const [sp, setSp] = useSearchParams()
  const initialTab = (['fast-track', 'playbook', 'approvals', 'bulk-ai', 'ledger'].includes(sp.get('tab') || '')
    ? sp.get('tab')
    : 'fast-track') as Tab
  const [tab, setTab] = useState<Tab>(initialTab)
  const qc = useQueryClient()
  const toast = useToast()

  const ovQ = useQuery({
    queryKey: ['owner-corner-overview'],
    queryFn: () => get<any>('/api/owner-corner/overview'),
    refetchInterval: 45_000,
  })

  // Fast-track new job state
  const [ftJob, setFtJob] = useState({
    client_name: '',
    client_phone: '',
    property_label: '',
    community: '',
    deal_type: 'Secondary Sale',
    deal_value_aed: '',
    expected_cash_aed: '',
    urgency: 'CASH_IMMEDIATE',
    stage_12: '05_offer',
    target_cash_date: '',
    notes: '',
  })
  const [ftInv, setFtInv] = useState({
    job_id: '',
    client_name: '',
    client_trn: '',
    description: '',
    subtotal_aed: '',
    vat_rate: '5',
    due_date: '',
  })
  const [ftDoc, setFtDoc] = useState({
    job_id: '',
    title: '',
    doc_type: 'Private Memo',
    content_text: '',
  })
  const [bulkTarget, setBulkTarget] = useState<'leads' | 'fast_track' | 'properties'>('fast_track')
  const [bulkText, setBulkText] = useState('')
  const [bulkPreview, setBulkPreview] = useState<any>(null)
  const [busy, setBusy] = useState(false)

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['owner-corner-overview'] })
    void qc.invalidateQueries({ queryKey: ['core-masters-summary'] })
  }

  const switchTab = (next: Tab) => {
    setTab(next)
    setSp(next === 'fast-track' ? {} : { tab: next })
  }

  const createFastJob = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await post('/api/privacy-fast-track/jobs', {
        ...ftJob,
        deal_value_aed: Number(ftJob.deal_value_aed) || 0,
        expected_cash_aed: Number(ftJob.expected_cash_aed) || 0,
      })
      toast.ok('Privacy Fast-Track deal created (Master Log bypassed)')
      setFtJob({
        client_name: '', client_phone: '', property_label: '', community: '',
        deal_type: 'Secondary Sale', deal_value_aed: '', expected_cash_aed: '',
        urgency: 'CASH_IMMEDIATE', stage_12: '05_offer', target_cash_date: '', notes: '',
      })
      refresh()
    } catch (err: any) { toast.error(err.message) } finally { setBusy(false) }
  }

  const createFastInvoice = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await post('/api/privacy-fast-track/invoices', {
        job_id: ftInv.job_id ? Number(ftInv.job_id) : undefined,
        client_name: ftInv.client_name,
        client_trn: ftInv.client_trn || undefined,
        description: ftInv.description,
        subtotal_aed: Number(ftInv.subtotal_aed) || 0,
        vat_rate: Number(ftInv.vat_rate) || 5,
        due_date: ftInv.due_date || undefined,
      })
      toast.ok('Custom private UAE VAT invoice issued')
      setFtInv({ job_id: '', client_name: '', client_trn: '', description: '', subtotal_aed: '', vat_rate: '5', due_date: '' })
      refresh()
    } catch (err: any) { toast.error(err.message) } finally { setBusy(false) }
  }

  const createFastDoc = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await post('/api/privacy-fast-track/docs', {
        job_id: ftDoc.job_id ? Number(ftDoc.job_id) : undefined,
        title: ftDoc.title,
        doc_type: ftDoc.doc_type,
        content_text: ftDoc.content_text,
      })
      toast.ok('Private executive document saved to Owner Vault')
      setFtDoc({ job_id: '', title: '', doc_type: 'Private Memo', content_text: '' })
      refresh()
    } catch (err: any) { toast.error(err.message) } finally { setBusy(false) }
  }

  const decideMasterReq = async (id: number, decision: 'approve' | 'reject') => {
    setBusy(true)
    try {
      await post(`/api/core-masters/change-requests/${id}/decide`, { decision })
      toast.ok(decision === 'approve' ? 'Master Log request approved & committed' : 'Master Log request rejected')
      refresh()
    } catch (err: any) { toast.error(err.message) } finally { setBusy(false) }
  }

  const runBulkAi = async (dryRun: boolean) => {
    setBusy(true)
    try {
      const res = await post<any>('/api/owner-corner/bulk-ai-upload', {
        target: bulkTarget,
        raw_text: bulkText,
        dry_run: dryRun,
      })
      if (dryRun) {
        setBulkPreview(res)
        toast.ok(`Parsed ${res.count} structured rows ready for import`)
      } else {
        toast.ok(`Imported ${res.created} record(s) into ${bulkTarget}`)
        setBulkPreview(null)
        setBulkText('')
        refresh()
      }
    } catch (err: any) { toast.error(err.message) } finally { setBusy(false) }
  }

  const data = ovQ.data
  const ft = data?.fast_track ?? { jobs: [], invoices: [], docs: [], immediate_cash_count: 0, immediate_cash_aed: 0, total_fast_track_value_aed: 0 }
  const ap = data?.approvals ?? { master_requests: [], seal_requests: [], universal_approvals: [], delete_requests: [], total_pending: 0 }
  const pl = data?.pipeline ?? { stages: [], totals: { total_deals: 0, weighted_gold_rush_aed: 0, pipeline_value_aed: 0, expected_commission_aed: 0 } }
  const led = data?.consolidated_ledger ?? { standard_total_aed: 0, fast_track_total_aed: 0, combined_total_aed: 0, combined_vat_aed: 0 }

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 pb-10">
      {/* Executive Owner Hero */}
      <section className="rounded-[28px] border border-[#d4a752]/40 bg-gradient-to-br from-[#0b1f2a] via-[#102b3a] to-[#08151d] p-6 text-white shadow-[0_22px_54px_-22px_rgba(8,21,29,0.65)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d4a752]/40 bg-[#d4a752]/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#f3d27a]">
              <Crown size={13} /> Owner Exclusive · Zero-Leak Private Command
            </div>
            <h1 className="mt-2.5 text-[28px] sm:text-[34px] font-bold tracking-[-0.03em] text-white">
              Shabib&apos;s Corner
            </h1>
            <p className="mt-1 max-w-2xl text-[14px] text-slate-300">
              Direct Owner workspace: Privacy Fast Track (bypass Master Log for urgent cash &amp; VIP deals), 12-Stage Gold-Rush Playbook, Bulk AI Upload, Master Log Governance, and Owner Consolidated Ledger. Invisible to all staff and admin.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/master-log" className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold text-white no-underline hover:bg-white/20">
              <Database size={14} className="text-[#f3d27a]" /> Master Log (CORE)
            </Link>
            <Link to="/pipeline" className="inline-flex items-center gap-1.5 rounded-full bg-[#d4a752] px-4 py-2 text-xs font-bold text-[#0b1f2a] no-underline hover:bg-[#e5be6e]">
              <KanbanSquare size={14} /> 12-Stage Kanban
            </Link>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-rose-400/30 bg-rose-500/15 p-4">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-rose-200">
              <span>Immediate Cash Rush</span> <Flame size={14} />
            </div>
            <div className="mt-2 text-[22px] font-bold tabular-nums text-white">{aed(ft.immediate_cash_aed)}</div>
            <div className="mt-0.5 text-xs text-rose-100/80">{ft.immediate_cash_count} urgent private file(s)</div>
          </div>
          <div className="rounded-2xl border border-[#d4a752]/30 bg-white/8 p-4">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#f3d27a]">
              <span>Gold-Rush Weighted Cash</span> <Wallet size={14} />
            </div>
            <div className="mt-2 text-[22px] font-bold tabular-nums text-white">{aed(pl.totals.weighted_gold_rush_aed)}</div>
            <div className="mt-0.5 text-xs text-slate-300">{pl.totals.total_deals} deals across 12 stages</div>
          </div>
          <div className="rounded-2xl border border-amber-400/30 bg-amber-500/15 p-4">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-amber-200">
              <span>Owner Approvals Waiting</span> <ShieldCheck size={14} />
            </div>
            <div className="mt-2 text-[22px] font-bold tabular-nums text-white">{ap.total_pending}</div>
            <div className="mt-0.5 text-xs text-amber-100/80">{ap.master_requests.length} Master Log · {ap.seal_requests.length} Seals</div>
          </div>
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/15 p-4">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-emerald-200">
              <span>Consolidated Gross + VAT</span> <Lock size={14} />
            </div>
            <div className="mt-2 text-[22px] font-bold tabular-nums text-white">{aed(led.combined_total_aed)}</div>
            <div className="mt-0.5 text-xs text-emerald-100/80">VAT 201 Est: {aed(led.combined_vat_aed)}</div>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'fast-track', label: `Privacy Fast Track (${ft.jobs.length})`, icon: Lock },
          { id: 'playbook', label: '12-Stage Playbook & Gold Rush', icon: KanbanSquare },
          { id: 'approvals', label: `Owner Approvals (${ap.total_pending})`, icon: ShieldCheck },
          { id: 'bulk-ai', label: 'Bulk AI Upload', icon: Upload },
          { id: 'ledger', label: 'Owner Consolidated Ledger', icon: Receipt },
        ].map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => switchTab(t.id as Tab)}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-bold cursor-pointer transition-all ${
              tab === t.id
                ? 'border-[#0b1f2a] bg-[#0b1f2a] text-[#f3d27a] shadow-sm'
                : 'border-line bg-card text-ink hover:border-ink/30'
            }`}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: PRIVACY FAST TRACK */}
      {tab === 'fast-track' && (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-5 space-y-5">
            <form onSubmit={createFastJob} className="rounded-3xl border border-line bg-card p-5 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <h2 className="m-0 text-[16px] font-bold text-ink flex items-center gap-2">
                  <Flame size={17} className="text-rose-600" /> New Privacy Fast-Track Deal
                </h2>
                <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[10.5px] font-bold text-rose-700">Bypasses Master Log</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <input className="input" required placeholder="VIP Client Name *" value={ftJob.client_name} onChange={e => setFtJob({ ...ftJob, client_name: e.target.value })} />
                <input className="input" placeholder="Private Phone" value={ftJob.client_phone} onChange={e => setFtJob({ ...ftJob, client_phone: e.target.value })} />
                <input className="input col-span-2" required placeholder="Property / Unit Label *" value={ftJob.property_label} onChange={e => setFtJob({ ...ftJob, property_label: e.target.value })} />
                <input className="input" placeholder="Community (e.g. Marina)" value={ftJob.community} onChange={e => setFtJob({ ...ftJob, community: e.target.value })} />
                <select className="select" value={ftJob.urgency} onChange={e => setFtJob({ ...ftJob, urgency: e.target.value })}>
                  <option value="CASH_IMMEDIATE">CASH NEEDED IMMEDIATELY</option>
                  <option value="VIP_PRIVATE">VIP PRIVATE FAST LANE</option>
                  <option value="CONFIDENTIAL">CONFIDENTIAL OWNER FILE</option>
                </select>
                <input className="input" type="number" placeholder="Deal Value (AED)" value={ftJob.deal_value_aed} onChange={e => setFtJob({ ...ftJob, deal_value_aed: e.target.value })} />
                <input className="input" type="number" placeholder="Expected Cash / Fee (AED)" value={ftJob.expected_cash_aed} onChange={e => setFtJob({ ...ftJob, expected_cash_aed: e.target.value })} />
                <select className="select" value={ftJob.stage_12} onChange={e => setFtJob({ ...ftJob, stage_12: e.target.value })}>
                  {PIPELINE_12_STAGES.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
                </select>
                <input className="input" type="date" value={ftJob.target_cash_date} onChange={e => setFtJob({ ...ftJob, target_cash_date: e.target.value })} />
              </div>
              <textarea className="input min-h-[68px]" placeholder="Confidential instructions / cash arrangement notes…" value={ftJob.notes} onChange={e => setFtJob({ ...ftJob, notes: e.target.value })} />
              <button disabled={busy} type="submit" className="btn w-full justify-center bg-[#0b1f2a] text-[#f3d27a]">
                <Plus size={15} /> Create Private Fast-Track File
              </button>
            </form>

            {/* Custom Private UAE VAT Invoice */}
            <form onSubmit={createFastInvoice} className="rounded-3xl border border-line bg-card p-5 space-y-3 shadow-xs">
              <h3 className="m-0 text-[15px] font-bold text-ink flex items-center gap-2">
                <Receipt size={16} className="text-[#8a621c]" /> Issue Custom Private UAE VAT Invoice
              </h3>
              <div className="grid grid-cols-2 gap-2.5">
                <select className="select col-span-2" value={ftInv.job_id} onChange={e => {
                  const job = ft.jobs.find((j: any) => String(j.id) === e.target.value)
                  setFtInv({ ...ftInv, job_id: e.target.value, client_name: job ? job.client_name : ftInv.client_name })
                }}>
                  <option value="">Standalone Custom Invoice (or link Fast-Track File)</option>
                  {ft.jobs.map((j: any) => <option key={j.id} value={j.id}>{j.ref_code} · {j.client_name} ({j.property_label})</option>)}
                </select>
                <input className="input" required placeholder="Billed To (Client) *" value={ftInv.client_name} onChange={e => setFtInv({ ...ftInv, client_name: e.target.value })} />
                <input className="input" placeholder="Client TRN (optional)" value={ftInv.client_trn} onChange={e => setFtInv({ ...ftInv, client_trn: e.target.value })} />
                <input className="input col-span-2" required placeholder="Service / Advisory Description *" value={ftInv.description} onChange={e => setFtInv({ ...ftInv, description: e.target.value })} />
                <input className="input" type="number" required placeholder="Subtotal (AED) *" value={ftInv.subtotal_aed} onChange={e => setFtInv({ ...ftInv, subtotal_aed: e.target.value })} />
                <input className="input" type="number" placeholder="VAT %" value={ftInv.vat_rate} onChange={e => setFtInv({ ...ftInv, vat_rate: e.target.value })} />
              </div>
              <button disabled={busy} type="submit" className="btn green w-full justify-center">
                <Receipt size={15} /> Generate Segregated Private Invoice
              </button>
            </form>

            {/* Quick Private Executive Document */}
            <form onSubmit={createFastDoc} className="rounded-3xl border border-line bg-card p-5 space-y-3 shadow-xs">
              <h3 className="m-0 text-[15px] font-bold text-ink flex items-center gap-2">
                <FileText size={16} className="text-[#0b1f2a]" /> Create Private Document / Mandate
              </h3>
              <div className="grid grid-cols-2 gap-2.5">
                <input className="input" required placeholder="Document Title *" value={ftDoc.title} onChange={e => setFtDoc({ ...ftDoc, title: e.target.value })} />
                <select className="select" value={ftDoc.doc_type} onChange={e => setFtDoc({ ...ftDoc, doc_type: e.target.value })}>
                  {['Private Memo', 'Mandate', 'Agreement', 'MOU', 'NOC', 'Invoice', 'KYC'].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <textarea className="input min-h-[76px]" required placeholder="Private terms, payment undertaking, or VIP client instructions…" value={ftDoc.content_text} onChange={e => setFtDoc({ ...ftDoc, content_text: e.target.value })} />
              <button disabled={busy} type="submit" className="btn outline w-full justify-center">
                <Lock size={14} /> Save to Owner Private Docs
              </button>
            </form>
          </div>

          {/* Right: Live Fast Track Board + Invoices + Docs */}
          <div className="lg:col-span-7 space-y-5">
            <div className="rounded-3xl border border-line bg-card p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="m-0 text-[17px] font-bold text-ink">Active Privacy Fast-Track Files ({ft.jobs.length})</h2>
                  <p className="m-0 text-xs text-muted">100% isolated from Master Log &amp; invisible to Admin, Manager, and Staff.</p>
                </div>
              </div>
              {ft.jobs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
                  No Privacy Fast-Track files yet. Create a VIP or Immediate Cash deal on the left to bypass Master Log instantly.
                </div>
              ) : (
                <div className="space-y-3">
                  {ft.jobs.map((j: any) => (
                    <div key={j.id} className="rounded-2xl border border-line bg-soft/60 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-[#8a621c]">{j.ref_code}</span>
                            <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${
                              j.urgency === 'CASH_IMMEDIATE' ? 'bg-rose-600 text-white' : 'bg-[#0b1f2a] text-[#f3d27a]'
                            }`}>
                              {j.urgency === 'CASH_IMMEDIATE' ? 'CASH NEEDED IMMEDIATELY' : j.urgency.replace('_', ' ')}
                            </span>
                            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10.5px] font-semibold text-emerald-700">{j.status}</span>
                          </div>
                          <div className="mt-1.5 text-[15px] font-bold text-ink">{j.client_name} · {j.property_label}</div>
                          <div className="text-xs text-muted">{j.community || 'Dubai'} {j.client_phone ? `· ${j.client_phone}` : ''} {j.target_cash_date ? `· Target Cash: ${j.target_cash_date}` : ''}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-emerald-700 tabular-nums">{aed(j.expected_cash_aed)} cash</div>
                          <div className="text-xs text-muted tabular-nums">Deal: {aed(j.deal_value_aed)}</div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 pt-2.5 border-t border-line">
                        <select
                          className="select text-xs h-8 py-0 max-w-[230px]"
                          value={j.stage_12}
                          onChange={async e => {
                            await put(`/api/privacy-fast-track/jobs/${j.id}`, { stage_12: e.target.value })
                            toast.ok('Stage updated')
                            refresh()
                          }}
                        >
                          {PIPELINE_12_STAGES.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
                        </select>
                        <select
                          className="select text-xs h-8 py-0 max-w-[150px]"
                          value={j.status}
                          onChange={async e => {
                            await put(`/api/privacy-fast-track/jobs/${j.id}`, { status: e.target.value })
                            toast.ok('Status updated')
                            refresh()
                          }}
                        >
                          {['Active', 'Cash Collected', 'Closed', 'On Hold'].map(st => <option key={st} value={st}>{st}</option>)}
                        </select>
                        <div className="flex-1" />
                        <button
                          type="button"
                          onClick={async () => { await del(`/api/privacy-fast-track/jobs/${j.id}`); toast.ok('Archived'); refresh() }}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 cursor-pointer"
                        >
                          <Trash2 size={12} /> Archive
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-line bg-card p-5 shadow-xs">
                <h3 className="m-0 mb-3 text-[15px] font-bold text-ink">Private Invoices ({ft.invoices.length})</h3>
                <div className="space-y-2.5 max-h-[280px] overflow-auto">
                  {ft.invoices.length === 0 ? <p className="text-xs text-muted">No private invoices issued yet.</p> : ft.invoices.map((inv: any) => (
                    <div key={inv.id} className="rounded-xl border border-line p-3 text-xs">
                      <div className="flex justify-between font-bold text-ink">
                        <span className="font-mono text-[#8a621c]">{inv.invoice_no}</span>
                        <span>{aed(inv.total_aed)}</span>
                      </div>
                      <div className="mt-0.5 text-ink">{inv.client_name} · {inv.description}</div>
                      <div className="mt-1.5 flex items-center justify-between text-muted">
                        <span>VAT: {aed(inv.vat_aed)} · {inv.status}</span>
                        {inv.status !== 'Paid' && (
                          <button type="button" className="text-emerald-700 font-bold underline bg-transparent border-0 cursor-pointer"
                            onClick={async () => { await put(`/api/privacy-fast-track/invoices/${inv.id}`, { status: 'Paid' }); toast.ok('Marked Paid'); refresh() }}>
                            Mark Paid
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-3xl border border-line bg-card p-5 shadow-xs">
                <h3 className="m-0 mb-3 text-[15px] font-bold text-ink">Private Owner Docs ({ft.docs.length})</h3>
                <div className="space-y-2.5 max-h-[280px] overflow-auto">
                  {ft.docs.length === 0 ? <p className="text-xs text-muted">No private memos or mandates yet.</p> : ft.docs.map((d: any) => (
                    <div key={d.id} className="rounded-xl border border-line p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <b className="text-ink truncate">{d.title}</b>
                        <span className="rounded-full bg-soft px-2 py-0.5 text-[10px] font-bold text-[#0b1f2a]">{d.doc_type}</span>
                      </div>
                      <p className="mt-1 mb-0 text-muted line-clamp-2">{d.content_text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: 12-STAGE PLAYBOOK & GOLD RUSH */}
      {tab === 'playbook' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="m-0 text-[18px] font-bold text-ink">12-Stage Deal Playbook · Gold-Rush Cash Velocity</h2>
              <p className="m-0 text-xs text-muted">Live deal count, total value, and weighted expected commission at every stage from Inventory to Final Closure.</p>
            </div>
            <Link to="/pipeline" className="btn bg-[#0b1f2a] text-[#f3d27a] no-underline">
              Open Interactive 12-Stage Kanban <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pl.stages.map((s: any) => (
              <div key={s.code} className="rounded-2xl border border-line bg-card p-4 shadow-xs flex flex-col justify-between gap-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="inline-flex size-8 items-center justify-center rounded-xl text-xs font-extrabold text-white" style={{ background: s.color }}>
                    {String(s.step).padStart(2, '0')}
                  </span>
                  <span className="rounded-full bg-soft px-2.5 py-0.5 text-xs font-extrabold text-ink">
                    {s.count} {s.count === 1 ? 'deal' : 'deals'}
                  </span>
                </div>
                <div>
                  <div className="text-[14.5px] font-bold text-ink">{s.label}</div>
                  <p className="mt-0.5 mb-0 text-xs text-muted line-clamp-2">{s.playbookHint}</p>
                </div>
                <div className="pt-2 border-t border-line flex items-center justify-between text-xs">
                  <span className="text-muted">Value: <b className="text-ink">{aed(s.deal_value_aed)}</b></span>
                  <span className="font-bold text-emerald-700">{aed(s.weighted_cash_aed)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: ALL OWNER APPROVALS */}
      {tab === 'approvals' && (
        <div className="space-y-5">
          <div className="rounded-3xl border border-line bg-card p-5 shadow-xs">
            <h2 className="m-0 mb-3 text-[16px] font-bold text-ink flex items-center gap-2">
              <Database size={17} className="text-[#8a621c]" /> Master Log Change Requests from Office Admin ({ap.master_requests.length})
            </h2>
            {ap.master_requests.length === 0 ? (
              <p className="text-sm text-muted m-0">No pending Master Log proposals. When Office Admin Meenakshi proposes a CORE Master addition or edit, it lands here for your sign-off.</p>
            ) : (
              <div className="space-y-3">
                {ap.master_requests.map((r: any) => (
                  <div key={r.id} className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-[#0b1f2a] px-2.5 py-0.5 text-[11px] font-bold text-[#f3d27a] uppercase">{r.entity}</span>
                        <span className="text-xs font-bold uppercase text-amber-800">{r.action}</span>
                        <span className="text-xs text-muted">by {r.requested_by_name} ({r.requested_by_email})</span>
                      </div>
                      <div className="text-sm font-bold text-ink">{r.record_label}</div>
                      <div className="text-xs text-body">Reason: {r.reason}</div>
                      <pre className="mt-2 rounded-xl bg-white/80 p-2.5 text-[11px] text-ink overflow-x-auto border border-line">{JSON.stringify(r.payload, null, 2)}</pre>
                    </div>
                    <div className="flex gap-2">
                      <button disabled={busy} type="button" onClick={() => void decideMasterReq(r.id, 'approve')} className="btn green">
                        <CheckCircle2 size={14} /> Approve &amp; Commit
                      </button>
                      <button disabled={busy} type="button" onClick={() => void decideMasterReq(r.id, 'reject')} className="btn outline text-rose-700 border-rose-300">
                        <XCircle size={14} /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Link to="/e/universal_approvals" className="rounded-2xl border border-line bg-card p-5 no-underline hover:border-ink/40">
              <div className="text-xs font-bold uppercase text-muted">Universal Approvals</div>
              <div className="mt-1 text-2xl font-bold text-ink">{ap.universal_approvals.length}</div>
              <div className="mt-2 text-xs font-semibold text-[#2563eb]">Review queue →</div>
            </Link>
            <Link to="/recycle-bin" className="rounded-2xl border border-line bg-card p-5 no-underline hover:border-ink/40">
              <div className="text-xs font-bold uppercase text-muted">Delete Bin Requests</div>
              <div className="mt-1 text-2xl font-bold text-ink">{ap.delete_requests.length}</div>
              <div className="mt-2 text-xs font-semibold text-[#2563eb]">Open Delete Bin →</div>
            </Link>
            <Link to="/dashboard" className="rounded-2xl border border-line bg-card p-5 no-underline hover:border-ink/40">
              <div className="text-xs font-bold uppercase text-muted">Corporate Seal &amp; Signature Requests</div>
              <div className="mt-1 text-2xl font-bold text-ink">{ap.seal_requests.length}</div>
              <div className="mt-2 text-xs font-semibold text-[#2563eb]">Sign off seals →</div>
            </Link>
          </div>
        </div>
      )}

      {/* TAB 4: BULK AI UPLOAD */}
      {tab === 'bulk-ai' && (
        <div className="rounded-3xl border border-line bg-card p-6 space-y-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="m-0 text-[17px] font-bold text-ink flex items-center gap-2">
                <Sparkles size={18} className="text-[#8a621c]" /> Bulk AI Ingestion Engine (Owner Exclusive)
              </h2>
              <p className="m-0 text-xs text-muted">Paste raw WhatsApp buyer lists, CSV exports, or developer availability lines (`Name, Phone, Community/Property, AED Value`). Auto-detects UAE numbers, emails, and AED budgets.</p>
            </div>
            <select className="select max-w-[260px]" value={bulkTarget} onChange={e => setBulkTarget(e.target.value as any)}>
              <option value="fast_track">Target: Privacy Fast Track (Owner Only)</option>
              <option value="leads">Target: CRM Leads Register</option>
              <option value="properties">Target: Master Properties Inventory</option>
            </select>
          </div>
          <textarea
            className="input min-h-[160px] font-mono text-xs"
            placeholder={'Ahmed Al Mansoori, +971501234567, Dubai Hills 4BR Villa, AED 4.8M\nSarah Jenkins | +971559988776 | Dubai Creek Harbour 2BR | 2.1M'}
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button disabled={busy || !bulkText.trim()} type="button" onClick={() => void runBulkAi(true)} className="btn outline">
              Preview Parsed Rows
            </button>
            <button disabled={busy || !bulkText.trim()} type="button" onClick={() => void runBulkAi(false)} className="btn bg-[#0b1f2a] text-[#f3d27a]">
              <Upload size={14} /> Commit Bulk Import Now
            </button>
          </div>
          {bulkPreview?.preview?.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-line">
              <table className="w-full text-xs">
                <thead className="bg-soft text-left">
                  <tr><th className="p-2.5">Name</th><th className="p-2.5">Phone</th><th className="p-2.5">Community / Property</th><th className="p-2.5">Est. Value</th></tr>
                </thead>
                <tbody>
                  {bulkPreview.preview.map((r: any, idx: number) => (
                    <tr key={idx} className="border-t border-line">
                      <td className="p-2.5 font-semibold">{r.name}</td>
                      <td className="p-2.5 font-mono">{r.phone || '—'}</td>
                      <td className="p-2.5">{r.community_or_property}</td>
                      <td className="p-2.5 font-bold text-emerald-700">{r.value_aed ? aed(r.value_aed) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: CONSOLIDATED OWNER LEDGER */}
      {tab === 'ledger' && (
        <div className="rounded-3xl border border-line bg-card p-6 space-y-5 shadow-xs">
          <div className="flex items-center gap-2 text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl p-3.5 text-xs font-semibold">
            <AlertTriangle size={16} /> Owner-Only Consolidated View: Combines Standard Company Invoices with Privacy Fast-Track Invoices for executive P&amp;L and UAE FTA VAT 201 forecasting. Staff and Admin only ever see the Standard ledger.
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-line p-4 bg-soft/50">
              <div className="text-xs font-bold uppercase text-muted">Standard Company Ledger</div>
              <div className="mt-2 text-xl font-bold text-ink">{aed(led.standard_total_aed)}</div>
              <div className="text-xs text-muted mt-1">VAT: {aed(led.standard_vat_aed)}</div>
            </div>
            <div className="rounded-2xl border border-[#d4a752]/50 p-4 bg-[#fef7e6]/50">
              <div className="text-xs font-bold uppercase text-[#8a621c]">Privacy Fast-Track Ledger</div>
              <div className="mt-2 text-xl font-bold text-[#0b1f2a]">{aed(led.fast_track_total_aed)}</div>
              <div className="text-xs text-[#8a621c] mt-1">VAT: {aed(led.fast_track_vat_aed)}</div>
            </div>
            <div className="rounded-2xl border border-emerald-300 p-4 bg-emerald-50/50">
              <div className="text-xs font-bold uppercase text-emerald-800">Consolidated Total (FTA VAT 201)</div>
              <div className="mt-2 text-xl font-bold text-emerald-900">{aed(led.combined_total_aed)}</div>
              <div className="text-xs text-emerald-700 mt-1">Total Output VAT: {aed(led.combined_vat_aed)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
