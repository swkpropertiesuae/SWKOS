import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  Download,
  Plus,
  Trash2,
} from 'lucide-react'
import { CLOSING_TRACKS, SHABIB_PAYMENT_MODES, type ClosingStageItem, type ClosingTrack } from '@shared/shabib-workspace'
import { del, get, openAuthFile, post, put } from '../../lib/api'
import { useToast } from '../../lib/toast'
import { CustomSelect } from '../CustomSelect'

const aed = (n: unknown) => {
  const v = Number(n || 0)
  return v > 0 ? 'AED ' + Math.round(v).toLocaleString('en-US') : '—'
}

export function ShabibClosingsTab() {
  const qc = useQueryClient()
  const toast = useToast()
  const [trackFilter, setTrackFilter] = useState<'all' | ClosingTrack>('all')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [busy, setBusy] = useState(false)

  const [form, setForm] = useState({
    track: 'Secondary' as ClosingTrack,
    title: '',
    job_id: '',
    lease_id: '',
    community: '',
    building_or_project: '',
    unit_no: '',
    agent_name: '',
    client_name: '',
    client_phone: '',
    client_email: '',
    client_passport_eid: '',
    counterparty_name: '',
    counterparty_phone: '',
    counterparty_email: '',
    is_third_party: false,
    third_party_agency: '',
    third_party_agent: '',
    third_party_brn: '',
    third_party_phone: '',
    third_party_email: '',
    asking_price_aed: '',
    agreed_price_aed: '',
    yearly_rent_aed: '',
    deposit_aed: '',
    dld_or_adm_fee_aed: '',
    agency_commission_aed: '',
    vat_aed: '',
    total_cheques_count: '',
    payment_mode: 'Bank Transfer (BT)',
    escrow_or_bank_ref: '',
    ejari_or_oqood_or_deed_ref: '',
    noc_ref: '',
    handover_date: '',
    keys_and_meters_summary: '',
    notes: '',
  })

  const [newCheque, setNewCheque] = useState({
    cheque_no: '',
    bank_name: '',
    payee_name: '',
    payer_name: '',
    purpose: 'Rent Instalment',
    payment_method: 'Cheque / PDC',
    amount_aed: '',
    cheque_date: new Date().toISOString().slice(0, 10),
    status: 'Pending',
    notes: '',
  })

  const q = useQuery({
    queryKey: ['shabib-closings', trackFilter],
    queryFn: () => get<any>('/api/shabib-workspace/closings', { track: trackFilter }),
    refetchInterval: 30_000,
  })

  const refresh = () => void qc.invalidateQueries({ queryKey: ['shabib-closings'] })
  const dossiers: any[] = q.data?.dossiers ?? []
  const active = dossiers.find(d => d.id === selectedId) ?? dossiers[0] ?? null

  const createDossier = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const created = await post<any>('/api/shabib-workspace/closings', {
        ...form,
        job_id: form.job_id ? Number(form.job_id) : undefined,
        lease_id: form.lease_id ? Number(form.lease_id) : undefined,
        asking_price_aed: Number(form.asking_price_aed) || 0,
        agreed_price_aed: Number(form.agreed_price_aed) || 0,
        yearly_rent_aed: Number(form.yearly_rent_aed) || 0,
        deposit_aed: Number(form.deposit_aed) || 0,
        dld_or_adm_fee_aed: Number(form.dld_or_adm_fee_aed) || 0,
        agency_commission_aed: Number(form.agency_commission_aed) || 0,
        vat_aed: Number(form.vat_aed) || 0,
        total_cheques_count: Number(form.total_cheques_count) || 0,
      })
      toast.ok(`Pin-to-Pin Closing Dossier ${created.dossier_no} created`)
      setSelectedId(created.id)
      setShowCreate(false)
      refresh()
    } catch (err: any) {
      toast.error(err.message || 'Could not create dossier')
    } finally {
      setBusy(false)
    }
  }

  const updateStage = async (dossier: any, stageIdx: number, patch: Partial<ClosingStageItem>) => {
    const nextStages = (dossier.stages || []).map((st: ClosingStageItem, i: number) =>
      i === stageIdx
        ? {
            ...st,
            ...patch,
            completed_at: patch.status === 'Completed' ? new Date().toISOString().slice(0, 10) : st.completed_at,
          }
        : st,
    )
    try {
      await put(`/api/shabib-workspace/closings/${dossier.id}`, { stages: nextStages })
      refresh()
    } catch (err: any) {
      toast.error(err.message || 'Could not update stage')
    }
  }

  const updateDossierStatus = async (dossier: any, status: string) => {
    try {
      await put(`/api/shabib-workspace/closings/${dossier.id}`, { status })
      toast.ok(`Dossier marked ${status}`)
      refresh()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const addCheque = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!active) return
    setBusy(true)
    try {
      await post(`/api/shabib-workspace/closings/${active.id}/cheques`, {
        ...newCheque,
        amount_aed: Number(newCheque.amount_aed) || 0,
      })
      toast.ok('Cheque / Payment row logged')
      setNewCheque({
        cheque_no: '', bank_name: '', payee_name: '', payer_name: '', purpose: 'Rent Instalment',
        payment_method: 'Cheque / PDC', amount_aed: '', cheque_date: new Date().toISOString().slice(0, 10), status: 'Pending', notes: '',
      })
      refresh()
    } catch (err: any) {
      toast.error(err.message || 'Could not add cheque')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-card p-5 shadow-xs">
        <div>
          <h2 className="m-0 text-[18px] font-bold text-ink flex items-center gap-2">
            <ClipboardCheck size={18} className="text-[#0e9f6e]" /> Pin-to-Pin Closing Forensic Dossiers (Scratch → Handover)
          </h2>
          <p className="m-0 mt-0.5 text-xs text-muted">
            Every milestone from lead/viewing through KYC, agreements, cheque-by-cheque ledger, NOC/Ejari/DLD transfer &amp; key handover across Off-Plan, Secondary, Handover, Leasing, and Property Management.
          </p>
        </div>
        <button type="button" onClick={() => setShowCreate(s => !s)} className="btn bg-[#121212] text-[#51fec0]">
          <Plus size={15} /> {showCreate ? 'Close Creator' : 'New Closing Dossier'}
        </button>
      </div>

      {/* 5-Track Pills */}
      <div className="flex flex-wrap gap-2">
        {(['all', ...CLOSING_TRACKS] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTrackFilter(t)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-bold cursor-pointer ${
              trackFilter === t ? 'border-[#121212] bg-[#121212] text-[#51fec0]' : 'border-line bg-white text-ink hover:bg-soft'
            }`}
          >
            {t === 'all' ? `All 5 Tracks (${dossiers.length})` : t}
          </button>
        ))}
      </div>

      {showCreate && (
        <form onSubmit={createDossier} className="rounded-3xl border-2 border-[#121212]/15 bg-card p-5 space-y-4 shadow-sm">
          <h3 className="m-0 text-[15px] font-bold text-ink">Create Pin-to-Pin Closing Dossier (Scratch or Import from Live Deal / Lease)</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CustomSelect className="select" value={form.track} onChange={e => setForm({ ...form, track: e.target.value as ClosingTrack })}>
              {CLOSING_TRACKS.map(t => <option key={t} value={t}>{t} Track</option>)}
            </CustomSelect>
            <CustomSelect className="select" value={form.job_id} onChange={e => setForm({ ...form, job_id: e.target.value })}>
              <option value="">Optional: Import from Live Deal…</option>
              {(q.data?.live_jobs ?? []).map((j: any) => <option key={j.id} value={j.id}>{j.job_no} · {j.client_name} ({j.deal_name})</option>)}
            </CustomSelect>
            <CustomSelect className="select" value={form.lease_id} onChange={e => setForm({ ...form, lease_id: e.target.value })}>
              <option value="">Optional: Import from Live Lease…</option>
              {(q.data?.live_leases ?? []).map((l: any) => <option key={l.id} value={l.id}>{l.lease_no} · {l.tenant_name}</option>)}
            </CustomSelect>
            <input className="input" placeholder="Dossier Title (e.g. Shahrukhz Unit 1402) *" required={!form.job_id && !form.lease_id} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            <input className="input" placeholder="Client Full Name *" required={!form.job_id && !form.lease_id} value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} />
            <input className="input" placeholder="Client Phone" value={form.client_phone} onChange={e => setForm({ ...form, client_phone: e.target.value })} />
            <input className="input" placeholder="Client Email" value={form.client_email} onChange={e => setForm({ ...form, client_email: e.target.value })} />
            <input className="input" placeholder="Client Passport / EID" value={form.client_passport_eid} onChange={e => setForm({ ...form, client_passport_eid: e.target.value })} />
            <input className="input" placeholder="Community" value={form.community} onChange={e => setForm({ ...form, community: e.target.value })} />
            <input className="input" placeholder="Project / Tower" value={form.building_or_project} onChange={e => setForm({ ...form, building_or_project: e.target.value })} />
            <input className="input" placeholder="Unit No." value={form.unit_no} onChange={e => setForm({ ...form, unit_no: e.target.value })} />
            <input className="input" placeholder="SWK Agent Name" value={form.agent_name} onChange={e => setForm({ ...form, agent_name: e.target.value })} />
            <input className="input" placeholder="Seller / Landlord / Developer" value={form.counterparty_name} onChange={e => setForm({ ...form, counterparty_name: e.target.value })} />
            <input className="input" placeholder="Counterparty Phone" value={form.counterparty_phone} onChange={e => setForm({ ...form, counterparty_phone: e.target.value })} />
            <input type="number" className="input" placeholder="Agreed Price (AED)" value={form.agreed_price_aed} onChange={e => setForm({ ...form, agreed_price_aed: e.target.value })} />
            <input type="number" className="input" placeholder="Yearly Rent (AED)" value={form.yearly_rent_aed} onChange={e => setForm({ ...form, yearly_rent_aed: e.target.value })} />
            <input type="number" className="input" placeholder="Deposit (AED)" value={form.deposit_aed} onChange={e => setForm({ ...form, deposit_aed: e.target.value })} />
            <input type="number" className="input" placeholder="Agency Commission (AED)" value={form.agency_commission_aed} onChange={e => setForm({ ...form, agency_commission_aed: e.target.value })} />
            <input type="number" className="input" placeholder="Total Cheques Count" value={form.total_cheques_count} onChange={e => setForm({ ...form, total_cheques_count: e.target.value })} />
            <CustomSelect className="select" value={form.payment_mode} onChange={e => setForm({ ...form, payment_mode: e.target.value })}>
              {SHABIB_PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
            </CustomSelect>
            <input className="input" placeholder="Title Deed / Oqood / Ejari No." value={form.ejari_or_oqood_or_deed_ref} onChange={e => setForm({ ...form, ejari_or_oqood_or_deed_ref: e.target.value })} />
            <input className="input" placeholder="Developer / Bank NOC Ref" value={form.noc_ref} onChange={e => setForm({ ...form, noc_ref: e.target.value })} />
            <input type="date" className="input" value={form.handover_date} onChange={e => setForm({ ...form, handover_date: e.target.value })} />
            <input className="input" placeholder="Keys / DEWA / Chiller Summary" value={form.keys_and_meters_summary} onChange={e => setForm({ ...form, keys_and_meters_summary: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="btn outline">Cancel</button>
            <button disabled={busy} type="submit" className="btn green">Create Closing Dossier</button>
          </div>
        </form>
      )}

      {/* Split Layout: Left Dossier List, Right Pin-to-Pin Forensic Detail & Cheque Ledger */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-4 space-y-2.5">
          {dossiers.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-line bg-card p-8 text-center text-xs text-muted">
              No closing dossiers yet for this track. Click &ldquo;New Closing Dossier&rdquo; to start from scratch or import any active Deal / Lease.
            </div>
          ) : dossiers.map(d => {
            const doneCount = (d.stages || []).filter((s: any) => s.status === 'Completed').length
            const totalCount = (d.stages || []).length || 1
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedId(d.id)}
                className={`w-full text-left rounded-2xl border p-4 cursor-pointer transition-all ${
                  active?.id === d.id ? 'border-[#121212] bg-[#121212] text-white shadow-sm' : 'border-line bg-card text-ink hover:border-[#121212]/40'
                }`}
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className={`font-mono font-bold ${active?.id === d.id ? 'text-[#51fec0]' : 'text-[#8a621c]'}`}>{d.dossier_no}</span>
                  <span className="rounded-full bg-white/15 px-2 py-0.5 font-semibold">{d.track}</span>
                </div>
                <div className="mt-1 font-bold text-sm truncate">{d.title}</div>
                <div className={`text-xs mt-0.5 ${active?.id === d.id ? 'text-white/75' : 'text-muted'}`}>
                  {d.client_name} · {doneCount}/{totalCount} stages · {(d.cheques || []).length} cheque(s)
                </div>
              </button>
            )
          })}
        </div>

        <div className="lg:col-span-8">
          {!active ? (
            <div className="rounded-3xl border border-line bg-card p-10 text-center text-sm text-muted">
              Select a closing dossier on the left to inspect all stages, client details, cheques &amp; exports.
            </div>
          ) : (
            <div className="rounded-3xl border border-line bg-card p-5 space-y-5 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#8a621c]">{active.dossier_no}</span>
                    <span className="rounded-full bg-[#121212] px-2.5 py-0.5 text-[10.5px] font-bold text-[#51fec0]">{active.track}</span>
                    <CustomSelect
                      compact
                      className="select !h-7 !text-xs !w-auto"
                      value={active.status}
                      onChange={e => void updateDossierStatus(active, e.target.value)}
                    >
                      {['In Progress', 'Ready for Transfer', 'Handed Over', 'Closed', 'On Hold'].map(st => <option key={st} value={st}>{st}</option>)}
                    </CustomSelect>
                  </div>
                  <h3 className="m-0 mt-1.5 text-[18px] font-bold text-ink">{active.title}</h3>
                  <div className="text-xs text-muted">
                    Client: <b>{active.client_name}</b> {active.client_phone ? `(${active.client_phone})` : ''} · Price: <b>{aed(active.agreed_price_aed)}</b> · Rent: <b>{aed(active.yearly_rent_aed)}</b> · Commission: <b>{aed(active.agency_commission_aed)}</b>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => void openAuthFile(`/api/shabib-workspace/closings/${active.id}/export?format=pdf`)} className="btn outline !py-1 !px-2.5 text-[11px]"><Download size={12} /> PDF</button>
                  <button type="button" onClick={() => void openAuthFile(`/api/shabib-workspace/closings/${active.id}/export?format=docx`)} className="btn outline !py-1 !px-2.5 text-[11px]"><Download size={12} /> Word</button>
                  <button type="button" onClick={() => void openAuthFile(`/api/shabib-workspace/closings/${active.id}/export?format=jpeg`)} className="btn outline !py-1 !px-2.5 text-[11px]"><Download size={12} /> JPEG</button>
                </div>
              </div>

              {/* Pin-to-Pin Stage Checklist */}
              <div>
                <h4 className="m-0 mb-2.5 text-xs font-bold uppercase tracking-wider text-muted">Pin-to-Pin Closing Milestones (Scratch → Handover)</h4>
                <div className="space-y-2">
                  {(active.stages || []).map((st: ClosingStageItem, idx: number) => (
                    <div key={st.code || idx} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-soft/40 p-2.5 text-xs">
                      <CheckCircle2 size={15} className={st.status === 'Completed' ? 'text-emerald-600' : 'text-muted/50'} />
                      <span className="font-semibold text-ink flex-1 min-w-[200px]">{st.label}</span>
                      <CustomSelect
                        compact
                        className="select !h-7 !text-xs !w-[130px]"
                        value={st.status}
                        onChange={e => void updateStage(active, idx, { status: e.target.value as any })}
                      >
                        {['Pending', 'In Progress', 'Completed', 'Blocked', 'N/A'].map(s => <option key={s} value={s}>{s}</option>)}
                      </CustomSelect>
                      <input
                        className="input !h-7 !w-44 text-xs"
                        placeholder="Ref / Receipt / Notes"
                        defaultValue={st.reference || st.notes || ''}
                        onBlur={e => {
                          if (e.target.value !== (st.reference || st.notes || '')) {
                            void updateStage(active, idx, { reference: e.target.value })
                          }
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Cheque-by-Cheque Payment Ledger */}
              <div className="border-t border-line pt-4 space-y-3">
                <h4 className="m-0 text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                  <CreditCard size={14} className="text-[#0e9f6e]" /> Cheque-by-Cheque &amp; Payment Ledger ({(active.cheques || []).length})
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse min-w-[640px]">
                    <thead>
                      <tr className="border-b border-line text-[10.5px] uppercase text-muted">
                        <th className="py-2 pr-2">Cheque / Ref</th>
                        <th className="py-2 px-2">Bank &amp; Purpose</th>
                        <th className="py-2 px-2">Method</th>
                        <th className="py-2 px-2">Date</th>
                        <th className="py-2 px-2">Amount</th>
                        <th className="py-2 px-2">Status</th>
                        <th className="py-2 pl-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(active.cheques || []).map((c: any) => (
                        <tr key={c.id} className="border-b border-line/60">
                          <td className="py-2 pr-2 font-mono font-bold text-ink">{c.cheque_no || '—'}</td>
                          <td className="py-2 px-2"><b>{c.purpose}</b> · {c.bank_name || '—'}</td>
                          <td className="py-2 px-2">{c.payment_method}</td>
                          <td className="py-2 px-2">{c.cheque_date || '—'}</td>
                          <td className="py-2 px-2 font-mono font-bold text-emerald-700">{aed(c.amount_aed)}</td>
                          <td className="py-2 px-2">
                            <CustomSelect
                              compact
                              className="select !h-7 !text-[11px] !w-[115px]"
                              value={c.status}
                              onChange={async e => {
                                await put(`/api/shabib-workspace/closings/${active.id}/cheques/${c.id}`, { status: e.target.value })
                                refresh()
                              }}
                            >
                              {['Pending', 'Received', 'Deposited', 'Cleared', 'Bounced', 'Paid', 'Replaced'].map(st => <option key={st} value={st}>{st}</option>)}
                            </CustomSelect>
                          </td>
                          <td className="py-2 pl-2 text-right">
                            <button
                              type="button"
                              onClick={async () => { await del(`/api/shabib-workspace/closings/${active.id}/cheques/${c.id}`); refresh() }}
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

                {/* Add Cheque Row */}
                <form onSubmit={addCheque} className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6 rounded-2xl bg-soft/60 p-3">
                  <input className="input !h-8 text-xs" placeholder="Cheque / Ref No." value={newCheque.cheque_no} onChange={e => setNewCheque({ ...newCheque, cheque_no: e.target.value })} />
                  <input className="input !h-8 text-xs" placeholder="Bank Name" value={newCheque.bank_name} onChange={e => setNewCheque({ ...newCheque, bank_name: e.target.value })} />
                  <CustomSelect compact className="select !h-8 text-xs" value={newCheque.purpose} onChange={e => setNewCheque({ ...newCheque, purpose: e.target.value })}>
                    {['Booking Deposit', 'Security Deposit', 'Down Payment', 'Rent Instalment', 'DLD/ADM Fee', 'Agency Commission', 'Developer Instalment', 'Manager Cheque', 'Other'].map(p => <option key={p} value={p}>{p}</option>)}
                  </CustomSelect>
                  <CustomSelect compact className="select !h-8 text-xs" value={newCheque.payment_method} onChange={e => setNewCheque({ ...newCheque, payment_method: e.target.value })}>
                    {SHABIB_PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                  </CustomSelect>
                  <input type="number" required className="input !h-8 text-xs" placeholder="Amount (AED) *" value={newCheque.amount_aed} onChange={e => setNewCheque({ ...newCheque, amount_aed: e.target.value })} />
                  <button disabled={busy} type="submit" className="btn green !h-8 !py-0 justify-center text-xs"><Plus size={13} /> Add Cheque</button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
