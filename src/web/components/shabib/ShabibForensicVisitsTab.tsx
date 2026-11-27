import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Camera,
  CheckCircle2,
  Download,
  ExternalLink,
  Flag,
  MapPin,
  Navigation,
  Plus,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { get, openAuthFile, post, upload } from '../../lib/api'
import { useToast } from '../../lib/toast'
import { AuthImg } from '../AuthMedia'
import { CustomSelect } from '../CustomSelect'

const aed = (n: unknown) => {
  const v = Number(n || 0)
  return v > 0 ? 'AED ' + Math.round(v).toLocaleString('en-US') : '—'
}

export function ShabibForensicVisitsTab() {
  const qc = useQueryClient()
  const toast = useToast()
  const [typeFilter, setTypeFilter] = useState('all')
  const [verifFilter, setVerifFilter] = useState('all')
  const [outcomeFilter, setOutcomeFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [verifNotes, setVerifNotes] = useState<Record<number, string>>({})

  const [form, setForm] = useState({
    report_type: 'Viewing',
    visit_date: new Date().toISOString().slice(0, 10),
    community: '',
    building_or_project: '',
    unit_no: '',
    gps_lat: '',
    gps_lng: '',
    gps_address_label: '',
    met_person_name: '',
    met_person_role: 'Owner',
    met_person_phone: '',
    met_person_email: '',
    owner_or_agent_name: '',
    owner_or_agent_phone: '',
    owner_or_agent_email: '',
    is_third_party: false,
    third_party_agency: '',
    third_party_agent_name: '',
    third_party_brn: '',
    third_party_phone: '',
    third_party_email: '',
    deal_category: 'Sale',
    asking_price_aed: '',
    final_price_aed: '',
    yearly_rent_aed: '',
    cheques_count: '',
    outcome: 'Follow-Up Pending',
    not_closed_reason: '',
    next_action_date: '',
    payment_stage: '',
    payment_mode: 'Cheque / PDC',
    payment_cheque_no: '',
    payment_bank: '',
    payment_amount_aed: '',
    forensic_notes: '',
  })
  const [stagedPhotos, setStagedPhotos] = useState<File[]>([])

  const q = useQuery({
    queryKey: ['shabib-field-reports', typeFilter, verifFilter, outcomeFilter],
    queryFn: () =>
      get<any>('/api/field-reports', {
        report_type: typeFilter,
        verification_status: verifFilter,
        outcome: outcomeFilter,
      }),
    refetchInterval: 30_000,
  })

  const refresh = () => void qc.invalidateQueries({ queryKey: ['shabib-field-reports'] })

  const pinCurrentGps = () => {
    if (!navigator.geolocation) {
      toast.error('Browser GPS not supported — enter coordinates manually.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setForm(f => ({
          ...f,
          gps_lat: pos.coords.latitude.toFixed(6),
          gps_lng: pos.coords.longitude.toFixed(6),
        }))
        toast.ok(`Pinned GPS: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`)
      },
      err => toast.error(err.message || 'Could not capture GPS location'),
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  const submitReport = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const payment_summary = form.payment_amount_aed
        ? [{
            stage: form.payment_stage || (form.outcome === 'Closed' ? 'Closing Payment / Deposit' : 'Proposed Payment'),
            payment_mode: form.payment_mode,
            cheque_no: form.payment_cheque_no,
            bank_name: form.payment_bank,
            cheque_date: form.visit_date,
            amount_aed: Number(form.payment_amount_aed) || 0,
            status: form.outcome === 'Closed' ? 'Received' : 'Pending',
          }]
        : []

      const created = await post<any>('/api/field-reports', {
        ...form,
        asking_price_aed: Number(form.asking_price_aed) || 0,
        final_price_aed: Number(form.final_price_aed) || 0,
        yearly_rent_aed: Number(form.yearly_rent_aed) || 0,
        cheques_count: Number(form.cheques_count) || 0,
        payment_summary,
      })
      if (stagedPhotos.length > 0 && created?.id) {
        await upload(stagedPhotos, { caption: `${form.building_or_project || 'Unit'} ${form.unit_no}` }, `/api/field-reports/${created.id}/photos`)
      }
      toast.ok(`Forensic ${form.report_type} ${created.report_no} logged`)
      setShowForm(false)
      setStagedPhotos([])
      refresh()
    } catch (err: any) {
      toast.error(err.message || 'Could not save forensic report')
    } finally {
      setBusy(false)
    }
  }

  const verifyReport = async (id: number, status: 'Verified' | 'Flagged' | 'Rejected') => {
    setBusy(true)
    try {
      await post(`/api/field-reports/${id}/verify`, { status, notes: verifNotes[id] || '' })
      toast.ok(`Report marked ${status}`)
      refresh()
    } catch (err: any) {
      toast.error(err.message || 'Verification failed')
    } finally {
      setBusy(false)
    }
  }

  const attachPhotoToExisting = async (id: number, files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      await upload([...files], { caption: 'Unit Photo' }, `/api/field-reports/${id}/photos`)
      toast.ok('Unit photo(s) uploaded to forensic dossier')
      refresh()
    } catch (err: any) {
      toast.error(err.message || 'Photo upload failed')
    } finally {
      setBusy(false)
    }
  }

  const rows: any[] = q.data?.rows ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-card p-5 shadow-xs">
        <div>
          <h2 className="m-0 text-[18px] font-bold text-ink flex items-center gap-2">
            <MapPin size={18} className="text-[#0e9f6e]" /> Forensic Site Visits &amp; Viewings (GPS-Pinned + Authority Verified)
          </h2>
          <p className="m-0 mt-0.5 text-xs text-muted">
            Stage-wise complete forensic record of whom staff met, pinned location, unit photos, owner/3rd-party full details, asking vs. final price, yearly rent, cheques, closed/not-closed outcome &amp; payment breakdown.
          </p>
        </div>
        <button type="button" onClick={() => setShowForm(s => !s)} className="btn bg-[#121212] text-[#51fec0]">
          <Plus size={15} /> {showForm ? 'Close Form' : 'Log New Forensic Visit / Viewing'}
        </button>
      </div>

      {/* Filters */}
      <div className="grid gap-2.5 sm:grid-cols-3 rounded-2xl border border-line bg-card p-3.5">
        <CustomSelect className="select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="all">All Types (Site Visits &amp; Viewings)</option>
          <option value="Site Visit">Site Visits Only</option>
          <option value="Viewing">Property Viewings Only</option>
        </CustomSelect>
        <CustomSelect className="select" value={verifFilter} onChange={e => setVerifFilter(e.target.value)}>
          <option value="all">All Verification States</option>
          <option value="Pending Verification">Pending Verification</option>
          <option value="Verified">Verified by Authority</option>
          <option value="Flagged">Flagged</option>
          <option value="Rejected">Rejected</option>
        </CustomSelect>
        <CustomSelect className="select" value={outcomeFilter} onChange={e => setOutcomeFilter(e.target.value)}>
          <option value="all">All Outcomes</option>
          <option value="Closed">Closed</option>
          <option value="Not Closed">Not Closed</option>
          <option value="Follow-Up Pending">Follow-Up Pending</option>
        </CustomSelect>
      </div>

      {/* Create Forensic Site Visit / Viewing Form */}
      {showForm && (
        <form onSubmit={submitReport} className="rounded-3xl border-2 border-[#121212]/15 bg-card p-5 space-y-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="m-0 text-[15px] font-bold text-ink">New Stage-Wise Forensic Site Visit / Viewing Report</h3>
            <button type="button" onClick={pinCurrentGps} className="btn outline !py-1.5 text-xs">
              <Navigation size={13} /> Pin Live GPS Location
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CustomSelect className="select" value={form.report_type} onChange={e => setForm({ ...form, report_type: e.target.value })}>
              <option value="Viewing">Property Viewing</option>
              <option value="Site Visit">Site Visit</option>
            </CustomSelect>
            <input type="date" className="input" value={form.visit_date} onChange={e => setForm({ ...form, visit_date: e.target.value })} />
            <input className="input" required placeholder="Community (e.g. Dubai Marina) *" value={form.community} onChange={e => setForm({ ...form, community: e.target.value })} />
            <input className="input" required placeholder="Project / Tower / Villa *" value={form.building_or_project} onChange={e => setForm({ ...form, building_or_project: e.target.value })} />
            <input className="input" placeholder="Unit No. (e.g. 1204)" value={form.unit_no} onChange={e => setForm({ ...form, unit_no: e.target.value })} />
            <input className="input" placeholder="GPS Lat (e.g. 25.0805)" value={form.gps_lat} onChange={e => setForm({ ...form, gps_lat: e.target.value })} />
            <input className="input" placeholder="GPS Lng (e.g. 55.1403)" value={form.gps_lng} onChange={e => setForm({ ...form, gps_lng: e.target.value })} />
            <input className="input" placeholder="Pinned Address / Landmark" value={form.gps_address_label} onChange={e => setForm({ ...form, gps_address_label: e.target.value })} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 border-t border-line pt-3">
            <input className="input" required placeholder="Whom Staff Met (Name) *" value={form.met_person_name} onChange={e => setForm({ ...form, met_person_name: e.target.value })} />
            <CustomSelect className="select" value={form.met_person_role} onChange={e => setForm({ ...form, met_person_role: e.target.value })}>
              {['Owner', 'Buyer', 'Tenant', 'Developer Rep', '3rd-Party Agent', 'Other'].map(r => <option key={r} value={r}>{r}</option>)}
            </CustomSelect>
            <input className="input" placeholder="Met Person Phone" value={form.met_person_phone} onChange={e => setForm({ ...form, met_person_phone: e.target.value })} />
            <input className="input" placeholder="Met Person Email" value={form.met_person_email} onChange={e => setForm({ ...form, met_person_email: e.target.value })} />
            <input className="input" placeholder="Owner / Direct Agent Name" value={form.owner_or_agent_name} onChange={e => setForm({ ...form, owner_or_agent_name: e.target.value })} />
            <input className="input" placeholder="Owner / Agent Phone" value={form.owner_or_agent_phone} onChange={e => setForm({ ...form, owner_or_agent_phone: e.target.value })} />
            <input className="input" placeholder="Owner / Agent Email" value={form.owner_or_agent_email} onChange={e => setForm({ ...form, owner_or_agent_email: e.target.value })} />
            <label className="flex items-center gap-2 text-xs font-semibold text-ink px-2">
              <input type="checkbox" checked={form.is_third_party} onChange={e => setForm({ ...form, is_third_party: e.target.checked })} />
              3rd-Party Agent Involved?
            </label>
          </div>

          {form.is_third_party && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 rounded-2xl border border-amber-200 bg-amber-50/40 p-3">
              <input className="input" placeholder="3rd-Party Agency Name" value={form.third_party_agency} onChange={e => setForm({ ...form, third_party_agency: e.target.value })} />
              <input className="input" placeholder="3rd-Party Agent Name" value={form.third_party_agent_name} onChange={e => setForm({ ...form, third_party_agent_name: e.target.value })} />
              <input className="input" placeholder="3rd-Party BRN" value={form.third_party_brn} onChange={e => setForm({ ...form, third_party_brn: e.target.value })} />
              <input className="input" placeholder="3rd-Party Phone" value={form.third_party_phone} onChange={e => setForm({ ...form, third_party_phone: e.target.value })} />
              <input className="input" placeholder="3rd-Party Email" value={form.third_party_email} onChange={e => setForm({ ...form, third_party_email: e.target.value })} />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 border-t border-line pt-3">
            <CustomSelect className="select" value={form.deal_category} onChange={e => setForm({ ...form, deal_category: e.target.value })}>
              {['Sale', 'Lease', 'Off-Plan', 'Handover', 'Property Management'].map(c => <option key={c} value={c}>{c}</option>)}
            </CustomSelect>
            <input type="number" className="input" placeholder="Asking Price (AED)" value={form.asking_price_aed} onChange={e => setForm({ ...form, asking_price_aed: e.target.value })} />
            <input type="number" className="input" placeholder="Final Negotiated Price (AED)" value={form.final_price_aed} onChange={e => setForm({ ...form, final_price_aed: e.target.value })} />
            <input type="number" className="input" placeholder="Yearly Rent (AED)" value={form.yearly_rent_aed} onChange={e => setForm({ ...form, yearly_rent_aed: e.target.value })} />
            <input type="number" className="input" placeholder="Cheques Count (e.g. 4)" value={form.cheques_count} onChange={e => setForm({ ...form, cheques_count: e.target.value })} />
            <CustomSelect className="select" value={form.outcome} onChange={e => setForm({ ...form, outcome: e.target.value })}>
              <option value="Follow-Up Pending">Follow-Up Pending</option>
              <option value="Closed">Closed</option>
              <option value="Not Closed">Not Closed</option>
            </CustomSelect>
            <input className="input" placeholder="If Not Closed — Exact Reason" value={form.not_closed_reason} onChange={e => setForm({ ...form, not_closed_reason: e.target.value })} />
            <input type="date" className="input" value={form.next_action_date} onChange={e => setForm({ ...form, next_action_date: e.target.value })} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 border-t border-line pt-3">
            <input className="input" placeholder="Payment Stage (e.g. 10% Deposit)" value={form.payment_stage} onChange={e => setForm({ ...form, payment_stage: e.target.value })} />
            <CustomSelect className="select" value={form.payment_mode} onChange={e => setForm({ ...form, payment_mode: e.target.value })}>
              {['Cheque / PDC', 'Manager Cheque', 'Bank Transfer (BT)', 'Cash', 'Botim', 'Escrow'].map(m => <option key={m} value={m}>{m}</option>)}
            </CustomSelect>
            <input className="input" placeholder="Cheque / Ref No." value={form.payment_cheque_no} onChange={e => setForm({ ...form, payment_cheque_no: e.target.value })} />
            <input className="input" placeholder="Bank Name" value={form.payment_bank} onChange={e => setForm({ ...form, payment_bank: e.target.value })} />
            <input type="number" className="input" placeholder="Payment Amount (AED)" value={form.payment_amount_aed} onChange={e => setForm({ ...form, payment_amount_aed: e.target.value })} />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <textarea className="input min-h-[70px]" placeholder="Complete stage-wise forensic notes, unit condition, client reaction & next steps…" value={form.forensic_notes} onChange={e => setForm({ ...form, forensic_notes: e.target.value })} />
            <div className="rounded-2xl border border-dashed border-line p-3 text-xs">
              <div className="font-bold text-ink flex items-center gap-1.5 mb-1.5"><Camera size={14} /> Attach Unit Photos (JPG / PNG / WebP)</div>
              <input type="file" accept="image/*" multiple onChange={e => setStagedPhotos(e.target.files ? [...e.target.files] : [])} />
              {stagedPhotos.length > 0 && <div className="mt-1 text-emerald-700 font-semibold">{stagedPhotos.length} photo(s) ready to upload</div>}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn outline">Cancel</button>
            <button disabled={busy} type="submit" className="btn green">Save Forensic Dossier</button>
          </div>
        </form>
      )}

      {/* Forensic Reports Feed */}
      {rows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line bg-card p-10 text-center text-sm text-muted">
          No forensic site visits or viewings match the selected filters yet. Staff submit GPS-pinned reports from Field Duty or log one above.
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map(r => (
            <div key={r.id} className="rounded-3xl border border-line bg-card p-5 shadow-xs space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#8a621c]">{r.report_no}</span>
                    <span className="rounded-full bg-[#121212] px-2.5 py-0.5 text-[10.5px] font-bold text-[#51fec0]">{r.report_type}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${
                      r.verification_status === 'Verified' ? 'bg-emerald-100 text-emerald-800'
                      : r.verification_status === 'Flagged' || r.verification_status === 'Rejected' ? 'bg-rose-100 text-rose-800'
                      : 'bg-amber-100 text-amber-800'
                    }`}>
                      {r.verification_status}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${
                      r.outcome === 'Closed' ? 'bg-emerald-600 text-white'
                      : r.outcome === 'Not Closed' ? 'bg-rose-600 text-white'
                      : 'bg-sky-100 text-sky-800'
                    }`}>
                      {r.outcome}
                    </span>
                  </div>
                  <h3 className="m-0 mt-1.5 text-[16px] font-bold text-ink">
                    {r.building_or_project || r.community || 'Property Visit'}{r.unit_no ? ` · Unit ${r.unit_no}` : ''}
                  </h3>
                  <div className="text-xs text-muted mt-0.5">
                    {r.community || 'UAE'} · {r.visit_date} · Logged by <b>{r.submitted_by_name}</b>
                    {r.gps_lat && r.gps_lng && (
                      <a
                        href={`https://maps.google.com/?q=${r.gps_lat},${r.gps_lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 inline-flex items-center gap-1 font-semibold text-sky-700 underline"
                      >
                        GPS Pin ({r.gps_lat}, {r.gps_lng}) <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => void openAuthFile(`/api/field-reports/${r.id}/export?format=pdf`)} className="btn outline !py-1 !px-2.5 text-[11px]"><Download size={12} /> PDF</button>
                  <button type="button" onClick={() => void openAuthFile(`/api/field-reports/${r.id}/export?format=docx`)} className="btn outline !py-1 !px-2.5 text-[11px]"><Download size={12} /> Word</button>
                  <button type="button" onClick={() => void openAuthFile(`/api/field-reports/${r.id}/export?format=jpeg`)} className="btn outline !py-1 !px-2.5 text-[11px]"><Download size={12} /> JPEG</button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                <div className="rounded-2xl bg-soft/60 p-3">
                  <div className="text-[10px] font-bold uppercase text-muted">Whom Staff Met</div>
                  <div className="mt-1 font-bold text-ink">{r.met_person_name || '—'} ({r.met_person_role || 'Contact'})</div>
                  <div className="text-muted">{r.met_person_phone || '—'} · {r.met_person_email || '—'}</div>
                </div>
                <div className="rounded-2xl bg-soft/60 p-3">
                  <div className="text-[10px] font-bold uppercase text-muted">Owner / Direct Agent</div>
                  <div className="mt-1 font-bold text-ink">{r.owner_or_agent_name || '—'}</div>
                  <div className="text-muted">{r.owner_or_agent_phone || '—'} · {r.owner_or_agent_email || '—'}</div>
                </div>
                <div className="rounded-2xl bg-soft/60 p-3">
                  <div className="text-[10px] font-bold uppercase text-muted">3rd-Party Complete Details</div>
                  {r.is_third_party ? (
                    <>
                      <div className="mt-1 font-bold text-amber-900">{r.third_party_agency || 'Agency'} · {r.third_party_agent_name || 'Agent'}</div>
                      <div className="text-muted">BRN {r.third_party_brn || '—'} · {r.third_party_phone || '—'} · {r.third_party_email || '—'}</div>
                    </>
                  ) : (
                    <div className="mt-1 text-muted">Direct (No 3rd Party)</div>
                  )}
                </div>
                <div className="rounded-2xl bg-soft/60 p-3">
                  <div className="text-[10px] font-bold uppercase text-muted">Pricing, Rent &amp; Cheques</div>
                  <div className="mt-1 font-bold text-ink">Ask: {aed(r.asking_price_aed)} → Final: {aed(r.final_price_aed)}</div>
                  <div className="text-muted">Rent/yr: {aed(r.yearly_rent_aed)} · {r.cheques_count || 0} cheque(s)</div>
                </div>
              </div>

              {r.outcome !== 'Closed' && r.not_closed_reason && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-3.5 py-2 text-xs text-rose-900">
                  <b>Not Closed / Pending Reason:</b> {r.not_closed_reason}
                  {r.next_action_date && <span className="ml-2 font-semibold">· Next Action: {r.next_action_date}</span>}
                </div>
              )}

              {r.payment_summary?.length > 0 && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-3 text-xs">
                  <div className="font-bold text-emerald-900 mb-1.5">Stage-Wise Payment &amp; Cheque Details</div>
                  <div className="space-y-1">
                    {r.payment_summary.map((p: any, i: number) => (
                      <div key={i} className="flex flex-wrap justify-between gap-2 border-b border-emerald-100 pb-1 last:border-0">
                        <span><b>{p.stage}</b> · {p.payment_mode} {p.cheque_no ? `(#${p.cheque_no})` : ''} {p.bank_name ? `· ${p.bank_name}` : ''}</span>
                        <span className="font-mono font-bold text-emerald-800">{aed(p.amount_aed)} · {p.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unit Photos + Add Photo */}
              <div className="flex flex-wrap items-center gap-3">
                {r.photos?.map((p: any) => (
                  <div key={p.idx} className="w-24 overflow-hidden rounded-xl border border-line bg-soft">
                    <AuthImg src={p.url} alt={p.caption} className="h-16 w-24 object-cover" />
                    <div className="truncate px-1.5 py-0.5 text-[10px] text-muted">{p.caption}</div>
                  </div>
                ))}
                <label className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-line px-3 py-2 text-xs font-semibold text-ink cursor-pointer hover:bg-soft">
                  <Camera size={13} /> Add Unit Photo
                  <input type="file" accept="image/*" multiple className="hidden" onChange={e => void attachPhotoToExisting(r.id, e.target.files)} />
                </label>
              </div>

              {/* Authority Verification Bar */}
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                {r.verified_by_name ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                    <ShieldCheck size={14} /> Reviewed by <b>{r.verified_by_name}</b> ({String(r.verified_at || '').slice(0, 16)})
                    {r.verification_notes ? ` — "${r.verification_notes}"` : ''}
                  </span>
                ) : (
                  <span className="text-xs text-amber-700 font-semibold">Awaiting Authority Verification</span>
                )}
                <div className="flex-1" />
                <input
                  className="input !h-8 !w-56 text-xs"
                  placeholder="Verification note…"
                  value={verifNotes[r.id] || ''}
                  onChange={e => setVerifNotes(prev => ({ ...prev, [r.id]: e.target.value }))}
                />
                <button disabled={busy} type="button" onClick={() => void verifyReport(r.id, 'Verified')} className="btn green !py-1 !px-2.5 text-xs">
                  <CheckCircle2 size={13} /> Verify
                </button>
                <button disabled={busy} type="button" onClick={() => void verifyReport(r.id, 'Flagged')} className="btn outline !py-1 !px-2.5 text-xs text-amber-800">
                  <Flag size={13} /> Flag
                </button>
                <button disabled={busy} type="button" onClick={() => void verifyReport(r.id, 'Rejected')} className="btn outline !py-1 !px-2.5 text-xs text-rose-700">
                  <XCircle size={13} /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
