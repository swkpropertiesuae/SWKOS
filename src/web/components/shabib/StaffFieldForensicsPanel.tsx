import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Camera,
  CheckCircle2,
  Circle,
  ClipboardList,
  Download,
  Flag,
  MapPin,
  Navigation,
  Plus,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { get, openAuthFile, patch, post, upload } from '../../lib/api'
import { useToast } from '../../lib/toast'
import { CustomSelect } from '../CustomSelect'

export function StaffFieldForensicsPanel() {
  const qc = useQueryClient()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [verifNote, setVerifNote] = useState<Record<number, string>>({})
  const [photos, setPhotos] = useState<File[]>([])
  const [f, setF] = useState({
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
    payment_amount_aed: '',
    payment_mode: 'Cheque / PDC',
    payment_cheque_no: '',
    payment_bank: '',
    forensic_notes: '',
  })

  const ctxQ = useQuery({
    queryKey: ['field-reports-my-context'],
    queryFn: () => get<{ is_verifier: boolean; is_owner: boolean; my_tasks: any[] }>('/api/field-reports/my-context'),
    refetchInterval: 30_000,
  })

  const reportsQ = useQuery({
    queryKey: ['field-reports-staff-list'],
    queryFn: () => get<{ rows: any[]; can_verify: boolean }>('/api/field-reports'),
    refetchInterval: 30_000,
  })

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['field-reports-my-context'] })
    void qc.invalidateQueries({ queryKey: ['field-reports-staff-list'] })
  }

  const pinGps = () => {
    if (!navigator.geolocation) {
      toast.error('GPS unavailable on this browser')
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setF(prev => ({ ...prev, gps_lat: pos.coords.latitude.toFixed(6), gps_lng: pos.coords.longitude.toFixed(6) }))
        toast.ok(`GPS pinned: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`)
      },
      err => toast.error(err.message || 'Could not acquire GPS'),
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  const submitReport = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const payment_summary = f.payment_amount_aed
        ? [{
            stage: f.outcome === 'Closed' ? 'Closing Payment' : 'Proposed Payment',
            payment_mode: f.payment_mode,
            cheque_no: f.payment_cheque_no,
            bank_name: f.payment_bank,
            cheque_date: f.visit_date,
            amount_aed: Number(f.payment_amount_aed) || 0,
            status: f.outcome === 'Closed' ? 'Received' : 'Pending',
          }]
        : []
      const created = await post<any>('/api/field-reports', {
        ...f,
        asking_price_aed: Number(f.asking_price_aed) || 0,
        final_price_aed: Number(f.final_price_aed) || 0,
        yearly_rent_aed: Number(f.yearly_rent_aed) || 0,
        cheques_count: Number(f.cheques_count) || 0,
        payment_summary,
      })
      if (photos.length > 0 && created?.id) {
        await upload(photos, { caption: `${f.building_or_project || 'Unit'} ${f.unit_no}` }, `/api/field-reports/${created.id}/photos`)
      }
      toast.ok(`Submitted Forensic ${f.report_type} (${created.report_no}) for Authority Verification`)
      setShowForm(false)
      setPhotos([])
      refresh()
    } catch (err: any) {
      toast.error(err.message || 'Submission failed')
    } finally {
      setBusy(false)
    }
  }

  const toggleMyTask = async (id: number) => {
    try {
      await patch(`/api/field-reports/my-tasks/${id}/toggle`, {})
      refresh()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const verify = async (id: number, status: 'Verified' | 'Flagged' | 'Rejected') => {
    setBusy(true)
    try {
      await post(`/api/field-reports/${id}/verify`, { status, notes: verifNote[id] || '' })
      toast.ok(`Marked report ${status}`)
      refresh()
    } catch (err: any) {
      toast.error(err.message || 'Verification failed')
    } finally {
      setBusy(false)
    }
  }

  const myTasks = ctxQ.data?.my_tasks ?? []
  const isVerifier = Boolean(ctxQ.data?.is_verifier)
  const reports = reportsQ.data?.rows ?? []

  return (
    <div className="space-y-5 mt-6">
      {/* My Daily Tasks Assigned by Owner */}
      <section className="swk-card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="m-0 text-sm font-bold text-ink flex items-center gap-2">
              <ClipboardList size={15} className="text-[#0e9f6e]" /> My Daily To-Do List ({myTasks.filter(t => t.status !== 'Done').length} open)
            </h2>
            <p className="m-0 text-xs text-muted">Tasks assigned to you by Owner / Leadership — tick off as you complete each task today.</p>
          </div>
          {isVerifier && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#121212] px-3 py-1 text-[11px] font-bold text-[#51fec0]">
              <ShieldCheck size={12} /> Designated Site-Visit Verification Authority
            </span>
          )}
        </div>
        {myTasks.length === 0 ? (
          <p className="m-0 text-xs text-muted">No tasks assigned to you right now.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {myTasks.map(t => (
              <div key={t.id} className="flex items-start gap-2 rounded-xl border border-line bg-soft/40 p-2.5 text-xs">
                <button
                  type="button"
                  onClick={() => void toggleMyTask(t.id)}
                  className="mt-0.5 bg-transparent border-0 p-0 cursor-pointer text-emerald-600"
                >
                  {t.status === 'Done' ? <CheckCircle2 size={15} /> : <Circle size={15} className="text-muted" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`font-semibold text-ink ${t.status === 'Done' ? 'line-through opacity-65' : ''}`}>{t.title}</div>
                  <div className="text-[11px] text-muted">Due {t.due_date || 'Today'} · {t.priority || 'Normal'}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Forensic Site Visit & Viewing Submission + Authority Verification Queue */}
      <section className="swk-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="m-0 text-sm font-bold text-ink flex items-center gap-2">
              <MapPin size={15} className="text-[#0e9f6e]" /> Forensic Site Visits &amp; Viewings ({reports.length})
            </h2>
            <p className="m-0 text-xs text-muted">
              Pin your live GPS location, attach unit photos, log whom you met, owner/3rd-party full details, asking/final price, cheques &amp; closing outcome.
            </p>
          </div>
          <button type="button" onClick={() => setShowForm(s => !s)} className="btn bg-[#121212] text-[#51fec0] text-xs">
            <Plus size={14} /> {showForm ? 'Close Form' : 'Submit Forensic Visit / Viewing'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={submitReport} className="rounded-2xl border border-line bg-soft/40 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="text-xs text-ink">Complete Forensic Visit / Viewing Dossier</b>
              <button type="button" onClick={pinGps} className="btn outline !py-1 text-xs"><Navigation size={12} /> Pin GPS</button>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <CustomSelect className="select" value={f.report_type} onChange={e => setF({ ...f, report_type: e.target.value })}>
                <option value="Viewing">Property Viewing</option>
                <option value="Site Visit">Site Visit</option>
              </CustomSelect>
              <input className="input" required placeholder="Community *" value={f.community} onChange={e => setF({ ...f, community: e.target.value })} />
              <input className="input" required placeholder="Project / Tower *" value={f.building_or_project} onChange={e => setF({ ...f, building_or_project: e.target.value })} />
              <input className="input" placeholder="Unit No." value={f.unit_no} onChange={e => setF({ ...f, unit_no: e.target.value })} />
              <input className="input" placeholder="GPS Lat" value={f.gps_lat} onChange={e => setF({ ...f, gps_lat: e.target.value })} />
              <input className="input" placeholder="GPS Lng" value={f.gps_lng} onChange={e => setF({ ...f, gps_lng: e.target.value })} />
              <input className="input" required placeholder="Whom You Met (Name) *" value={f.met_person_name} onChange={e => setF({ ...f, met_person_name: e.target.value })} />
              <input className="input" placeholder="Met Person Phone" value={f.met_person_phone} onChange={e => setF({ ...f, met_person_phone: e.target.value })} />
              <input className="input" placeholder="Owner / Agent Name" value={f.owner_or_agent_name} onChange={e => setF({ ...f, owner_or_agent_name: e.target.value })} />
              <input className="input" placeholder="Owner / Agent Phone" value={f.owner_or_agent_phone} onChange={e => setF({ ...f, owner_or_agent_phone: e.target.value })} />
              <input className="input" placeholder="Owner / Agent Email" value={f.owner_or_agent_email} onChange={e => setF({ ...f, owner_or_agent_email: e.target.value })} />
              <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={f.is_third_party} onChange={e => setF({ ...f, is_third_party: e.target.checked })} /> 3rd-Party Agent?</label>
            </div>
            {f.is_third_party && (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <input className="input text-xs" placeholder="3rd-Party Agency" value={f.third_party_agency} onChange={e => setF({ ...f, third_party_agency: e.target.value })} />
                <input className="input text-xs" placeholder="3rd-Party Agent" value={f.third_party_agent_name} onChange={e => setF({ ...f, third_party_agent_name: e.target.value })} />
                <input className="input text-xs" placeholder="BRN" value={f.third_party_brn} onChange={e => setF({ ...f, third_party_brn: e.target.value })} />
                <input className="input text-xs" placeholder="Phone" value={f.third_party_phone} onChange={e => setF({ ...f, third_party_phone: e.target.value })} />
                <input className="input text-xs" placeholder="Email" value={f.third_party_email} onChange={e => setF({ ...f, third_party_email: e.target.value })} />
              </div>
            )}
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <input type="number" className="input" placeholder="Asking Price (AED)" value={f.asking_price_aed} onChange={e => setF({ ...f, asking_price_aed: e.target.value })} />
              <input type="number" className="input" placeholder="Final Price (AED)" value={f.final_price_aed} onChange={e => setF({ ...f, final_price_aed: e.target.value })} />
              <input type="number" className="input" placeholder="Yearly Rent (AED)" value={f.yearly_rent_aed} onChange={e => setF({ ...f, yearly_rent_aed: e.target.value })} />
              <input type="number" className="input" placeholder="Cheques Count" value={f.cheques_count} onChange={e => setF({ ...f, cheques_count: e.target.value })} />
              <CustomSelect className="select" value={f.outcome} onChange={e => setF({ ...f, outcome: e.target.value })}>
                <option value="Follow-Up Pending">Follow-Up Pending</option>
                <option value="Closed">Closed</option>
                <option value="Not Closed">Not Closed</option>
              </CustomSelect>
              <input className="input" placeholder="If Not Closed — Reason" value={f.not_closed_reason} onChange={e => setF({ ...f, not_closed_reason: e.target.value })} />
              <input type="number" className="input" placeholder="Payment / Cheque Amt (AED)" value={f.payment_amount_aed} onChange={e => setF({ ...f, payment_amount_aed: e.target.value })} />
              <label className="flex items-center gap-1.5 rounded-xl border border-dashed border-line bg-white px-2.5 py-1.5 text-xs font-semibold cursor-pointer">
                <Camera size={13} /> {photos.length ? `${photos.length} Photo(s)` : 'Attach Unit Photos'}
                <input type="file" accept="image/*" multiple className="hidden" onChange={e => setPhotos(e.target.files ? [...e.target.files] : [])} />
              </label>
            </div>
            <textarea className="input min-h-[60px] text-xs" placeholder="Forensic summary & payment notes…" value={f.forensic_notes} onChange={e => setF({ ...f, forensic_notes: e.target.value })} />
            <button disabled={busy} type="submit" className="btn green text-xs">Submit Forensic Dossier</button>
          </form>
        )}

        <div className="space-y-2.5">
          {reports.slice(0, 20).map(r => (
            <div key={r.id} className="rounded-2xl border border-line bg-white p-3.5 text-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono font-bold text-[#8a621c] mr-2">{r.report_no}</span>
                  <b className="text-ink">{r.building_or_project || r.community}{r.unit_no ? ` · Unit ${r.unit_no}` : ''}</b>
                  <span className="ml-2 text-muted">({r.report_type} · {r.outcome} · {r.verification_status})</span>
                </div>
                <button type="button" onClick={() => void openAuthFile(`/api/field-reports/${r.id}/export?format=pdf`)} className="btn outline !py-0.5 !px-2 text-[11px]">
                  <Download size={11} /> PDF
                </button>
              </div>
              <div className="text-muted">
                Submitted by <b>{r.submitted_by_name}</b> · Met: <b>{r.met_person_name || '—'}</b> · GPS: {r.gps_lat && r.gps_lng ? `${r.gps_lat}, ${r.gps_lng}` : 'None'} · Photos: {r.photos?.length || 0}
              </div>
              {isVerifier && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line">
                  <input
                    className="input !h-7 !w-48 text-xs"
                    placeholder="Authority verification note…"
                    value={verifNote[r.id] || ''}
                    onChange={e => setVerifNote(prev => ({ ...prev, [r.id]: e.target.value }))}
                  />
                  <button disabled={busy} type="button" onClick={() => void verify(r.id, 'Verified')} className="btn green !py-0.5 !px-2 text-[11px]"><CheckCircle2 size={11} /> Verify</button>
                  <button disabled={busy} type="button" onClick={() => void verify(r.id, 'Flagged')} className="btn outline !py-0.5 !px-2 text-[11px]"><Flag size={11} /> Flag</button>
                  <button disabled={busy} type="button" onClick={() => void verify(r.id, 'Rejected')} className="btn outline !py-0.5 !px-2 text-[11px]"><XCircle size={11} /> Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
