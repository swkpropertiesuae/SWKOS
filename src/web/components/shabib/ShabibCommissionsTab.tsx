import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  Download,
  Percent,
  Plus,
  Trash2,
  Wallet,
} from 'lucide-react'
import { CLOSING_TRACKS, SHABIB_PAYMENT_MODES, SHABIB_SETTLEMENT_STATUSES } from '@shared/shabib-workspace'
import { del, get, openAuthFile, post, put, upload } from '../../lib/api'
import { useToast } from '../../lib/toast'
import { CustomSelect } from '../CustomSelect'
import { FormAttachmentField } from '../FormAttachmentField'

const aed = (n: unknown) => 'AED ' + Math.round(Number(n || 0)).toLocaleString('en-US')

export function ShabibCommissionsTab() {
  const qc = useQueryClient()
  const toast = useToast()
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [modeFilter, setModeFilter] = useState('all')
  const [busy, setBusy] = useState(false)
  const [entryFiles, setEntryFiles] = useState<File[]>([])

  const [form, setForm] = useState({
    entry_type: 'Commission',
    agent_name: '',
    deal_ref: '',
    property_label: '',
    track: 'Secondary',
    gross_amount_aed: '',
    split_pct: '50',
    net_amount_aed: '',
    status: 'Pending',
    payment_mode: 'Bank Transfer (BT)',
    payment_reference: '',
    entry_date: new Date().toISOString().slice(0, 10),
    expense_category: '',
    is_third_party: false,
    third_party_agency: '',
    third_party_agent_name: '',
    third_party_brn: '',
    third_party_phone: '',
    third_party_email: '',
    third_party_payment_details: '',
    notes: '',
  })

  const q = useQuery({
    queryKey: ['shabib-commissions-expenses'],
    queryFn: () => get<any>('/api/shabib-workspace/commissions-expenses'),
    refetchInterval: 30_000,
  })

  const teamQ = useQuery({
    queryKey: ['shabib-team-daily-names'],
    queryFn: () => get<any>('/api/shabib-workspace/team-daily'),
  })

  const refresh = () => void qc.invalidateQueries({ queryKey: ['shabib-commissions-expenses'] })

  const createEntry = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const gross = Number(form.gross_amount_aed) || 0
      const pct = Number(form.split_pct) || 50
      const net = Number(form.net_amount_aed) || (form.entry_type === 'Commission' && gross > 0 ? Math.round(gross * (pct / 100)) : gross)
      const created = await post<any>('/api/shabib-workspace/commissions-expenses', {
        ...form,
        gross_amount_aed: gross || net,
        split_pct: pct,
        net_amount_aed: net,
      })
      if (entryFiles.length > 0 && created?.id) {
        await upload(entryFiles, { link_entity: 'shabib_commission_expenses', link_id: created.id, category: 'Settlement Proof' })
      }
      toast.ok(`${form.entry_type} logged in Owner Settlement Sheet${entryFiles.length ? ` (${entryFiles.length} attachment(s))` : ''}`)
      setEntryFiles([])
      setForm(f => ({
        ...f,
        deal_ref: '', property_label: '', gross_amount_aed: '', net_amount_aed: '', payment_reference: '',
        expense_category: '', third_party_agency: '', third_party_agent_name: '', third_party_brn: '',
        third_party_phone: '', third_party_email: '', third_party_payment_details: '', notes: '',
      }))
      refresh()
    } catch (err: any) {
      toast.error(err.message || 'Could not save entry')
    } finally {
      setBusy(false)
    }
  }

  const quickStatus = async (id: number, status: 'Pending' | 'Received' | 'Paid') => {
    try {
      await put(`/api/shabib-workspace/commissions-expenses/${id}`, { status })
      toast.ok(`Updated status to ${status}`)
      refresh()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const d = q.data
  const totals = d?.totals ?? { received_aed: 0, paid_aed: 0, pending_aed: 0, expenses_aed: 0, third_party_aed: 0, net_payable_aed: 0 }
  const entries: any[] = (d?.entries ?? []).filter((e: any) =>
    (statusFilter === 'all' || e.status === statusFilter) &&
    (typeFilter === 'all' || e.entry_type === typeFilter) &&
    (modeFilter === 'all' || e.payment_mode === modeFilter),
  )
  const agentSummary: any[] = d?.agent_summary ?? []
  const staffNames: string[] = (teamQ.data?.staff ?? []).map((s: any) => s.name).filter(Boolean)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-card p-5 shadow-xs">
        <div>
          <h2 className="m-0 text-[18px] font-bold text-ink flex items-center gap-2">
            <Percent size={18} className="text-[#0e9f6e]" /> Agent Commissions &amp; Agent Expenses Ledger
          </h2>
          <p className="m-0 mt-0.5 text-xs text-muted">
            Track Paid, Received &amp; Pending commissions alongside agent expenses &amp; advances via Cash, Bank Transfer (BT), Botim, or Cheque — with full 3rd-party agent payout details.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => void openAuthFile('/api/shabib-workspace/commissions-expenses/export?format=pdf')} className="btn outline !py-1.5 !px-3 text-xs"><Download size={13} /> Statement PDF</button>
          <button type="button" onClick={() => void openAuthFile('/api/shabib-workspace/commissions-expenses/export?format=docx')} className="btn outline !py-1.5 !px-3 text-xs"><Download size={13} /> Word</button>
          <button type="button" onClick={() => void openAuthFile('/api/shabib-workspace/commissions-expenses/export?format=jpeg')} className="btn outline !py-1.5 !px-3 text-xs"><Download size={13} /> JPEG</button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5">
          <div className="text-[10px] font-bold uppercase text-emerald-700">Received</div>
          <div className="mt-1 font-mono text-lg font-bold text-emerald-950">{aed(totals.received_aed)}</div>
        </div>
        <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-3.5">
          <div className="text-[10px] font-bold uppercase text-sky-700">Paid Out</div>
          <div className="mt-1 font-mono text-lg font-bold text-sky-950">{aed(totals.paid_aed)}</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5">
          <div className="text-[10px] font-bold uppercase text-amber-800">Pending</div>
          <div className="mt-1 font-mono text-lg font-bold text-amber-950">{aed(totals.pending_aed)}</div>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-3.5">
          <div className="text-[10px] font-bold uppercase text-rose-700">Agent Expenses</div>
          <div className="mt-1 font-mono text-lg font-bold text-rose-950">{aed(totals.expenses_aed)}</div>
        </div>
        <div className="rounded-2xl border border-line bg-card p-3.5">
          <div className="text-[10px] font-bold uppercase text-muted">3rd-Party Splits</div>
          <div className="mt-1 font-mono text-lg font-bold text-ink">{aed(totals.third_party_aed)}</div>
        </div>
        <div className="rounded-2xl border border-[#121212] bg-[#121212] p-3.5 text-white">
          <div className="text-[10px] font-bold uppercase text-[#51fec0]">Net Balance Due</div>
          <div className="mt-1 font-mono text-lg font-bold">{aed(totals.net_payable_aed)}</div>
        </div>
      </div>

      {/* Add Entry Form + Per-Agent Summary */}
      <div className="grid gap-5 lg:grid-cols-12">
        <form onSubmit={createEntry} className="lg:col-span-5 rounded-3xl border border-line bg-card p-5 space-y-3 shadow-xs">
          <h3 className="m-0 text-[15px] font-bold text-ink flex items-center gap-2">
            <Plus size={16} className="text-[#0e9f6e]" /> Record Commission / Agent Expense / 3rd-Party Split
          </h3>
          <div className="grid grid-cols-2 gap-2.5">
            <CustomSelect className="select" value={form.entry_type} onChange={e => setForm({ ...form, entry_type: e.target.value })}>
              {['Commission', 'Expense', 'Advance', '3rd-Party Split'].map(t => <option key={t} value={t}>{t}</option>)}
            </CustomSelect>
            <input
              list="swk-agent-names"
              className="input"
              required
              placeholder="Agent Name *"
              value={form.agent_name}
              onChange={e => setForm({ ...form, agent_name: e.target.value })}
            />
            <datalist id="swk-agent-names">
              {staffNames.map(n => <option key={n} value={n} />)}
            </datalist>
            <input className="input" placeholder="Deal Ref / Unit" value={form.deal_ref} onChange={e => setForm({ ...form, deal_ref: e.target.value })} />
            <input className="input" placeholder="Project / Property Label" value={form.property_label} onChange={e => setForm({ ...form, property_label: e.target.value })} />
            <CustomSelect className="select" value={form.track} onChange={e => setForm({ ...form, track: e.target.value })}>
              {CLOSING_TRACKS.map(t => <option key={t} value={t}>{t}</option>)}
            </CustomSelect>
            <input type="number" className="input" placeholder="Agent Split % (e.g. 50)" value={form.split_pct} onChange={e => setForm({ ...form, split_pct: e.target.value })} />
            <input type="number" className="input" placeholder="Gross Commission (AED)" value={form.gross_amount_aed} onChange={e => setForm({ ...form, gross_amount_aed: e.target.value })} />
            <input type="number" className="input" required placeholder="Net Amount (AED) *" value={form.net_amount_aed} onChange={e => setForm({ ...form, net_amount_aed: e.target.value })} />
            <CustomSelect className="select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              {SHABIB_SETTLEMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </CustomSelect>
            <CustomSelect className="select" value={form.payment_mode} onChange={e => setForm({ ...form, payment_mode: e.target.value })}>
              {SHABIB_PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
            </CustomSelect>
            <input className="input" placeholder="Payment Ref / Botim ID / Cheque No." value={form.payment_reference} onChange={e => setForm({ ...form, payment_reference: e.target.value })} />
            <input type="date" className="input" value={form.entry_date} onChange={e => setForm({ ...form, entry_date: e.target.value })} />
            {(form.entry_type === 'Expense' || form.entry_type === 'Advance') && (
              <input className="input col-span-2" placeholder="Expense Category (Fuel, Portal Boost, Marketing, Advance…)" value={form.expense_category} onChange={e => setForm({ ...form, expense_category: e.target.value })} />
            )}
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-ink">
            <input type="checkbox" checked={form.is_third_party || form.entry_type === '3rd-Party Split'} onChange={e => setForm({ ...form, is_third_party: e.target.checked })} />
            Include 3rd-Party Agent / Brokerage Details
          </label>
          {(form.is_third_party || form.entry_type === '3rd-Party Split') && (
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-amber-200 bg-amber-50/40 p-3">
              <input className="input text-xs" placeholder="3rd-Party Agency" value={form.third_party_agency} onChange={e => setForm({ ...form, third_party_agency: e.target.value })} />
              <input className="input text-xs" placeholder="3rd-Party Agent Name" value={form.third_party_agent_name} onChange={e => setForm({ ...form, third_party_agent_name: e.target.value })} />
              <input className="input text-xs" placeholder="BRN" value={form.third_party_brn} onChange={e => setForm({ ...form, third_party_brn: e.target.value })} />
              <input className="input text-xs" placeholder="Phone" value={form.third_party_phone} onChange={e => setForm({ ...form, third_party_phone: e.target.value })} />
              <input className="input text-xs" placeholder="Email" value={form.third_party_email} onChange={e => setForm({ ...form, third_party_email: e.target.value })} />
              <input className="input text-xs" placeholder="IBAN / Botim / Payout Account" value={form.third_party_payment_details} onChange={e => setForm({ ...form, third_party_payment_details: e.target.value })} />
            </div>
          )}
          <textarea className="input min-h-[54px] text-xs" placeholder="Notes / Deal breakdown…" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          <FormAttachmentField compact files={entryFiles} onChange={setEntryFiles} label="Attach receipt / invoice / cheque copy" />
          <button disabled={busy} type="submit" className="btn w-full justify-center bg-[#121212] text-[#51fec0]">
            <Wallet size={14} /> Save to Commissions &amp; Expenses Ledger
          </button>
        </form>

        {/* Per-Agent Balance Rollup */}
        <div className="lg:col-span-7 rounded-3xl border border-line bg-card p-5 shadow-xs overflow-x-auto">
          <h3 className="m-0 mb-3 text-[15px] font-bold text-ink">Per-Agent Net Commission vs. Expense Summary</h3>
          {agentSummary.length === 0 ? (
            <p className="text-xs text-muted">No agent commission or expense entries recorded yet.</p>
          ) : (
            <table className="w-full text-left text-xs border-collapse min-w-[540px]">
              <thead>
                <tr className="border-b border-line text-[10.5px] uppercase text-muted">
                  <th className="py-2 pr-2">Agent</th>
                  <th className="py-2 px-2">Received</th>
                  <th className="py-2 px-2">Paid</th>
                  <th className="py-2 px-2">Pending</th>
                  <th className="py-2 px-2">Expenses</th>
                  <th className="py-2 px-2">3rd Party</th>
                  <th className="py-2 pl-2 text-right">Net Due</th>
                </tr>
              </thead>
              <tbody>
                {agentSummary.map(a => (
                  <tr key={a.agent_name} className="border-b border-line/60">
                    <td className="py-2.5 pr-2 font-bold text-ink">{a.agent_name}</td>
                    <td className="py-2.5 px-2 font-mono text-emerald-700">{aed(a.commission_received)}</td>
                    <td className="py-2.5 px-2 font-mono text-sky-700">{aed(a.commission_paid)}</td>
                    <td className="py-2.5 px-2 font-mono text-amber-700">{aed(a.commission_pending)}</td>
                    <td className="py-2.5 px-2 font-mono text-rose-700">-{aed(a.expenses_total)}</td>
                    <td className="py-2.5 px-2 font-mono text-muted">{aed(a.third_party_total)}</td>
                    <td className="py-2.5 pl-2 text-right font-mono font-bold text-ink">{aed(a.net_due_aed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {((q.data?.os_sync_reference?.agent_commissions?.length ?? 0) > 0 || (q.data?.os_sync_reference?.employee_expenses?.length ?? 0) > 0) && (
            <div className="mt-4 rounded-2xl border border-line bg-soft/50 p-3 text-[11px] text-muted space-y-1">
              <div className="font-bold uppercase tracking-wider text-ink">Live ERP Finance Reference (Auto-Synced)</div>
              <div className="flex flex-wrap gap-3">
                {(q.data?.os_sync_reference?.agent_commissions ?? []).map((r: any) => (
                  <span key={`c-${r.status}`}>ERP Commissions ({r.status}): <b>{aed(r.agent_share_aed)}</b></span>
                ))}
                {(q.data?.os_sync_reference?.employee_expenses ?? []).map((r: any) => (
                  <span key={`e-${r.status}`}>ERP Expenses ({r.status}): <b>{aed(r.amount_aed)}</b></span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full Filterable Ledger */}
      <div className="rounded-3xl border border-line bg-card p-5 shadow-xs space-y-3 overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="m-0 text-[15px] font-bold text-ink">Itemised Ledger ({entries.length})</h3>
          <div className="flex flex-wrap gap-2">
            <CustomSelect compact className="select !h-8 text-xs !w-auto" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="all">All Types</option>
              {['Commission', 'Expense', 'Advance', '3rd-Party Split'].map(t => <option key={t} value={t}>{t}</option>)}
            </CustomSelect>
            <CustomSelect compact className="select !h-8 text-xs !w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              {SHABIB_SETTLEMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </CustomSelect>
            <CustomSelect compact className="select !h-8 text-xs !w-auto" value={modeFilter} onChange={e => setModeFilter(e.target.value)}>
              <option value="all">All Modes</option>
              {SHABIB_PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
            </CustomSelect>
          </div>
        </div>
        <table className="w-full text-left text-xs border-collapse min-w-[820px]">
          <thead>
            <tr className="border-b border-line text-[10.5px] uppercase text-muted">
              <th className="py-2 pr-2">Ref &amp; Date</th>
              <th className="py-2 px-2">Type &amp; Agent</th>
              <th className="py-2 px-2">Deal / 3rd-Party Details</th>
              <th className="py-2 px-2">Mode &amp; Ref</th>
              <th className="py-2 px-2">Net Amount</th>
              <th className="py-2 px-2">Status</th>
              <th className="py-2 pl-2 text-right">Quick Action</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.id} className="border-b border-line/60">
                <td className="py-2.5 pr-2">
                  <div className="font-mono font-bold text-[#8a621c]">{e.entry_no}</div>
                  <div className="text-[11px] text-muted">{e.entry_date}</div>
                </td>
                <td className="py-2.5 px-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    e.entry_type === 'Expense' || e.entry_type === 'Advance' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                  }`}>{e.entry_type}</span>
                  <div className="mt-0.5 font-bold text-ink">{e.agent_name}</div>
                </td>
                <td className="py-2.5 px-2">
                  <div className="font-semibold text-ink">{e.deal_ref || e.expense_category || e.track}</div>
                  {e.is_third_party && (
                    <div className="text-[11px] text-amber-800">
                      3rd Party: {e.third_party_agency} · {e.third_party_agent_name} ({e.third_party_phone}) {e.third_party_payment_details ? `· ${e.third_party_payment_details}` : ''}
                    </div>
                  )}
                </td>
                <td className="py-2.5 px-2">
                  <div className="font-semibold text-ink">{e.payment_mode}</div>
                  <div className="text-[11px] text-muted">{e.payment_reference || '—'}</div>
                </td>
                <td className="py-2.5 px-2 font-mono font-bold text-ink">{aed(e.net_amount_aed)}</td>
                <td className="py-2.5 px-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${
                    e.status === 'Paid' ? 'bg-sky-100 text-sky-800'
                    : e.status === 'Received' ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                  }`}>{e.status}</span>
                </td>
                <td className="py-2.5 pl-2 text-right whitespace-nowrap space-x-1.5">
                  {e.status !== 'Received' && (
                    <button type="button" onClick={() => void quickStatus(e.id, 'Received')} className="text-emerald-700 font-bold underline bg-transparent border-0 cursor-pointer text-[11px]">
                      Received
                    </button>
                  )}
                  {e.status !== 'Paid' && (
                    <button type="button" onClick={() => void quickStatus(e.id, 'Paid')} className="text-sky-700 font-bold underline bg-transparent border-0 cursor-pointer text-[11px]">
                      <CheckCircle2 size={11} className="inline" /> Paid
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => { await del(`/api/shabib-workspace/commissions-expenses/${e.id}`); toast.ok('Entry archived'); refresh() }}
                    className="text-rose-600 bg-transparent border-0 cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
