import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  Crown,
  FileCode2,
  ListPlus,
  Plus,
  Save,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { del, get, post, put } from '../../lib/api'
import { useToast } from '../../lib/toast'
import { Badge, ErrorBox, Loading, useDialogs } from '../../ui/kit'
import { ModuleHeader, Pill } from '../../swk/ui'

interface CustomizerState {
  ownerAdminHardcoded: boolean
  fields: Array<{
    id: number
    entity: string
    name: string
    label: string
    type: string
    options?: string
    required: number | boolean
    sort: number
  }>
  customOptions: Record<string, string[]>
  templates: Array<{
    id: number
    code: string
    title: string
    category: string
    kind: string
    description?: string
    orientation: string
    letterhead: number | boolean
    is_system: number | boolean
    active: number | boolean
  }>
  entities: Array<{ key: string; label: string; plural: string; module: string }>
  branding: {
    company_name: string
    company_phone: string
    company_email: string
    company_address: string
    invoice_footer: string
    document_watermark_enabled: boolean
    document_watermark_opacity: number
  }
}

export default function OsCustomizerPage() {
  const toast = useToast()
  const dlg = useDialogs()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'fields' | 'options' | 'templates' | 'branding'>('fields')

  const q = useQuery({
    queryKey: ['customizer', 'state'],
    queryFn: () => get<CustomizerState>('/api/customizer/state'),
  })

  // Custom field form
  const [fEntity, setFEntity] = useState('employees')
  const [fLabel, setFLabel] = useState('')
  const [fName, setFName] = useState('')
  const [fType, setFType] = useState<'text' | 'textarea' | 'number' | 'date' | 'select' | 'bool'>('text')
  const [fOpts, setFOpts] = useState('')
  const [fReq, setFReq] = useState(false)
  const [fBusy, setFBusy] = useState(false)

  // Option group editor
  const [optGroup, setOptGroup] = useState('document_categories')
  const [newGroupKey, setNewGroupKey] = useState('')
  const [newOptionVal, setNewOptionVal] = useState('')
  const [optBusy, setOptBusy] = useState(false)

  // Template builder
  const [tCode, setTCode] = useState('')
  const [tTitle, setTTitle] = useState('')
  const [tCat, setTCat] = useState('Sales (Secondary)')
  const [tKind, setTKind] = useState('Contract')
  const [tDesc, setTDesc] = useState('')
  const [tLetterhead, setTLetterhead] = useState(true)
  const [tContent, setTContent] = useState('<h1>[Document Title]</h1>\n<p>Date: [Date]</p>\n<p>Prepared for: [Client Name]</p>\n<p>Enter your custom clauses and [placeholders] here.</p>')
  const [tBusy, setTBusy] = useState(false)

  // Branding editor
  const [bState, setBState] = useState<CustomizerState['branding'] | null>(null)
  const [bBusy, setBBusy] = useState(false)

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ['customizer'] })
    void qc.invalidateQueries({ queryKey: ['meta'] })
    void qc.invalidateQueries({ queryKey: ['studio'] })
  }

  if (q.error) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />
  if (!q.data) return <Loading label="Loading Owner & Admin No-Code OS Customizer…" />

  const d = q.data
  const branding = bState ?? d.branding
  const optionGroups = Object.keys(d.customOptions)
  const activeOpts = d.customOptions[optGroup] ?? []

  const addField = async (e: React.FormEvent) => {
    e.preventDefault()
    const key = (fName || fLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')).replace(/^[^a-z]+/, 'f_')
    if (!fLabel.trim() || !key) return
    setFBusy(true)
    try {
      await post('/api/customizer/fields', {
        entity: fEntity,
        name: key,
        label: fLabel.trim(),
        type: fType,
        options: fType === 'select' ? fOpts : '',
        required: fReq,
        sort: 100,
      })
      toast.ok(`Added "${fLabel}" live to ${fEntity} forms`)
      setFLabel(''); setFName(''); setFOpts(''); setFReq(false)
      refreshAll()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setFBusy(false)
    }
  }

  const removeField = async (id: number, label: string) => {
    if (!(await dlg.confirm({ title: 'Remove custom field?', message: `Remove "${label}" from OS forms? Existing data remains safely audited.`, danger: true, ok: 'Remove' }))) return
    try {
      await del(`/api/customizer/fields/${id}`)
      toast.ok('Custom field removed')
      refreshAll()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const saveOptionList = async (groupKey: string, nextList: string[]) => {
    setOptBusy(true)
    try {
      await put('/api/customizer/options', { groupKey, options: nextList })
      toast.ok(`Updated "${groupKey}" options live`)
      refreshAll()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setOptBusy(false)
    }
  }

  const addTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tTitle.trim() || !tContent.trim()) return
    setTBusy(true)
    try {
      await post('/api/customizer/templates', {
        code: tCode.trim() || undefined,
        title: tTitle.trim(),
        category: tCat,
        kind: tKind,
        description: tDesc.trim(),
        orientation: 'Portrait',
        letterhead: tLetterhead,
        active: true,
        content: tContent,
      })
      toast.ok(`Created template "${tTitle}" in Document Studio`)
      setTCode(''); setTTitle(''); setTDesc('')
      refreshAll()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setTBusy(false)
    }
  }

  const toggleTemplateActive = async (t: CustomizerState['templates'][number]) => {
    try {
      await put(`/api/customizer/templates/${t.id}`, { active: !t.active })
      toast.ok(`${t.code} ${t.active ? 'disabled' : 'activated'}`)
      refreshAll()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const deleteTemplate = async (t: CustomizerState['templates'][number]) => {
    if (!(await dlg.confirm({ title: `Remove template ${t.code}?`, message: t.title, danger: true, ok: 'Remove' }))) return
    try {
      await del(`/api/customizer/templates/${t.id}`)
      toast.ok(`Template ${t.code} removed`)
      refreshAll()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const saveBranding = async () => {
    setBBusy(true)
    try {
      await put('/api/customizer/branding', branding)
      toast.ok('Corporate letterhead, footer & watermark saved live')
      refreshAll()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBBusy(false)
    }
  }

  return (
    <div className="fade-in max-w-[1320px] mx-auto pb-8">
      <ModuleHeader
        eyebrow="Hardcoded Owner & Admin Exclusive · Zero IT Required"
        title="No-Code OS Customizer"
        subtitle="Add or remove live form fields across any module, manage dropdown option lists, publish new document templates (branded or brand-free), and control corporate document watermarks — without a developer."
        actions={
          <div className="flex flex-wrap gap-2">
            <Pill tone="champ"><Crown size={12} className="inline mr-1" /> Owner &amp; Admin Hardcoded</Pill>
            <Link to="/master-data" className="btn outline sm">Master Data &amp; Log</Link>
            <Link to="/studio" className="btn outline sm">Document Studio</Link>
          </div>
        }
      />

      <div className="tabs mb-4" role="tablist">
        <button type="button" className={tab === 'fields' ? 'active' : ''} onClick={() => setTab('fields')}>
          <SlidersHorizontal size={15} className="inline mr-1.5 -mt-0.5" /> Custom Fields ({d.fields.length})
        </button>
        <button type="button" className={tab === 'options' ? 'active' : ''} onClick={() => setTab('options')}>
          <ListPlus size={15} className="inline mr-1.5 -mt-0.5" /> Dropdowns &amp; Options ({optionGroups.length})
        </button>
        <button type="button" className={tab === 'templates' ? 'active' : ''} onClick={() => setTab('templates')}>
          <FileCode2 size={15} className="inline mr-1.5 -mt-0.5" /> Templates Builder ({d.templates.length})
        </button>
        <button type="button" className={tab === 'branding' ? 'active' : ''} onClick={() => setTab('branding')}>
          <Shield size={15} className="inline mr-1.5 -mt-0.5" /> Header, Footer &amp; Watermark
        </button>
      </div>

      {/* TAB 1: Custom Fields */}
      {tab === 'fields' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <form onSubmit={addField} className="card p-4 sm:p-5 lg:col-span-5 grid gap-3 self-start">
            <div className="flex items-center gap-2">
              <Sparkles size={17} className="text-emerald" />
              <h2 className="text-base font-bold m-0">Add Live Field to Any Module</h2>
            </div>
            <div>
              <label className="label">Target OS Module / Record Type</label>
              <select className="select" value={fEntity} onChange={e => setFEntity(e.target.value)}>
                {d.entities.map(ent => (
                  <option key={ent.key} value={ent.key}>{ent.plural} ({ent.key})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Display Label *</label>
                <input className="input" required value={fLabel} onChange={e => setFLabel(e.target.value)} placeholder="e.g. RERA Card Expiry" />
              </div>
              <div>
                <label className="label">Field Key (auto if blank)</label>
                <input className="input font-mono text-xs" value={fName} onChange={e => setFName(e.target.value)} placeholder="rera_card_expiry" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Field Type</label>
                <select className="select" value={fType} onChange={e => setFType(e.target.value as any)}>
                  <option value="text">Single-line Text</option>
                  <option value="textarea">Multi-line Notes</option>
                  <option value="number">Number / Amount</option>
                  <option value="date">Date Picker</option>
                  <option value="select">Dropdown List</option>
                  <option value="bool">Checkbox (Yes / No)</option>
                </select>
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                  <input type="checkbox" className="accent-emerald" checked={fReq} onChange={e => setFReq(e.target.checked)} />
                  Required Field
                </label>
              </div>
            </div>
            {fType === 'select' && (
              <div>
                <label className="label">Dropdown Options (comma-separated)</label>
                <input className="input" value={fOpts} onChange={e => setFOpts(e.target.value)} placeholder="VIP, Golden Visa, Cash Buyer, Mortgage" />
              </div>
            )}
            <button type="submit" className="btn green" disabled={fBusy || !fLabel.trim()}>
              <Plus size={15} /> {fBusy ? 'Publishing…' : 'Publish Custom Field Live'}
            </button>
            <p className="text-xs text-muted m-0">
              Appears immediately on create/edit forms and detail screens across desktop &amp; mobile with zero restart.
            </p>
          </form>

          <div className="card p-4 sm:p-5 lg:col-span-7">
            <h2 className="text-base font-bold mt-0 mb-3">Active Live Custom Fields ({d.fields.length})</h2>
            {d.fields.length === 0 ? (
              <div className="text-sm text-muted py-8 text-center border border-dashed border-line rounded-xl">
                No custom fields added yet. Use the form to add your first no-code field to Employees, Properties, Leads, Deals, or any other module.
              </div>
            ) : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Module</th>
                      <th>Label</th>
                      <th>Key</th>
                      <th>Type</th>
                      <th>Options</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.fields.map(f => (
                      <tr key={f.id}>
                        <td><Badge value={f.entity} tone="teal" /></td>
                        <td className="font-semibold">{f.label} {f.required ? <span className="text-red-500">*</span> : null}</td>
                        <td className="font-mono text-xs text-muted">{f.name}</td>
                        <td className="text-xs">{f.type}</td>
                        <td className="text-xs text-muted max-w-[180px] truncate">{f.options || '—'}</td>
                        <td className="text-right">
                          <button type="button" className="btn ghost icon sm text-red-600" onClick={() => void removeField(f.id, f.label)} aria-label={`Delete ${f.label}`}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Dropdowns & Option Lists */}
      {tab === 'options' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="card p-4 sm:p-5 lg:col-span-4">
            <h2 className="text-base font-bold mt-0 mb-3">Option Lists</h2>
            <div className="grid gap-1.5 mb-4">
              {optionGroups.map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setOptGroup(g)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-left text-sm font-semibold cursor-pointer ${
                    optGroup === g ? 'border-[#046c4e] bg-emerald-500/10 text-emerald' : 'border-line bg-card text-ink'
                  }`}
                >
                  <span className="font-mono text-xs">{g}</span>
                  <span className="text-xs opacity-75">{(d.customOptions[g] ?? []).length}</span>
                </button>
              ))}
            </div>
            <div className="pt-3 border-t border-line grid gap-2">
              <label className="label">Create New Option Group Key</label>
              <div className="flex gap-2">
                <input
                  className="input font-mono text-xs"
                  value={newGroupKey}
                  onChange={e => setNewGroupKey(e.target.value)}
                  placeholder="e.g. vip_tiers"
                />
                <button
                  type="button"
                  className="btn outline sm shrink-0"
                  disabled={!newGroupKey.trim() || optBusy}
                  onClick={async () => {
                    const clean = newGroupKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
                    if (!clean) return
                    await saveOptionList(clean, ['Option 1'])
                    setOptGroup(clean)
                    setNewGroupKey('')
                  }}
                >
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>
          </div>

          <div className="card p-4 sm:p-5 lg:col-span-8">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <div>
                <h2 className="text-base font-bold m-0">Editing Option Group: <code className="text-emerald">{optGroup}</code></h2>
                <p className="text-xs text-muted m-0 mt-0.5">Add or remove choices — updates live across Document Uploads, Social Media Pillars, and CRM selectors.</p>
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              <input
                className="input flex-1"
                value={newOptionVal}
                onChange={e => setNewOptionVal(e.target.value)}
                placeholder="Type a new option label (e.g. Emirates ID Front+Back, Golden Visa NOC)…"
                onKeyDown={e => {
                  if (e.key === 'Enter' && newOptionVal.trim()) {
                    e.preventDefault()
                    void saveOptionList(optGroup, [...activeOpts, newOptionVal.trim()])
                    setNewOptionVal('')
                  }
                }}
              />
              <button
                type="button"
                className="btn green"
                disabled={optBusy || !newOptionVal.trim()}
                onClick={() => {
                  void saveOptionList(optGroup, [...activeOpts, newOptionVal.trim()])
                  setNewOptionVal('')
                }}
              >
                <Plus size={15} /> Add Option
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {activeOpts.map((opt, idx) => (
                <span key={`${opt}-${idx}`} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-line bg-soft text-sm font-medium">
                  <span>{opt}</span>
                  <button
                    type="button"
                    className="bg-transparent border-0 text-red-600 cursor-pointer p-0 leading-none font-bold"
                    title={`Remove ${opt}`}
                    onClick={() => void saveOptionList(optGroup, activeOpts.filter((_, i) => i !== idx))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Document Templates Builder */}
      {tab === 'templates' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <form onSubmit={addTemplate} className="card p-4 sm:p-5 lg:col-span-5 grid gap-3 self-start">
            <h2 className="text-base font-bold m-0">Create Own Document Template</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Template Title *</label>
                <input className="input" required value={tTitle} onChange={e => setTTitle(e.target.value)} placeholder="e.g. Owner Exclusive Mandate Addendum" />
              </div>
              <div>
                <label className="label">Code (auto OWN-xxx)</label>
                <input className="input font-mono text-xs" value={tCode} onChange={e => setTCode(e.target.value)} placeholder="OWN-001" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Category</label>
                <input className="input" value={tCat} onChange={e => setTCat(e.target.value)} />
              </div>
              <div>
                <label className="label">Type</label>
                <select className="select" value={tKind} onChange={e => setTKind(e.target.value)}>
                  <option>Contract</option>
                  <option>Letter</option>
                  <option>Form</option>
                  <option>Certificate</option>
                  <option>Notice</option>
                  <option>Template</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">Description</label>
              <input className="input" value={tDesc} onChange={e => setTDesc(e.target.value)} placeholder="Short summary shown in Document Studio" />
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
              <input type="checkbox" className="accent-emerald" checked={tLetterhead} onChange={e => setTLetterhead(e.target.checked)} />
              Include SWK Corporate Header, Footer &amp; Faint Watermark (uncheck for Brand-Free Government/RERA forms)
            </label>
            <div>
              <label className="label">Template HTML / Clauses (use [Placeholders])</label>
              <textarea className="textarea font-mono text-xs" rows={8} value={tContent} onChange={e => setTContent(e.target.value)} />
            </div>
            <button type="submit" className="btn green" disabled={tBusy || !tTitle.trim()}>
              <Plus size={15} /> {tBusy ? 'Saving…' : 'Publish Template to Studio'}
            </button>
          </form>

          <div className="card p-4 sm:p-5 lg:col-span-7">
            <h2 className="text-base font-bold mt-0 mb-3">All Document Templates ({d.templates.length})</h2>
            <div className="table-wrap max-h-[540px]">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Title</th>
                    <th>Branding</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {d.templates.slice(0, 60).map(t => (
                    <tr key={t.id}>
                      <td className="font-mono text-xs font-bold whitespace-nowrap">{t.code}</td>
                      <td>
                        <div className="font-semibold text-sm">{t.title}</div>
                        <div className="text-[11px] text-muted">{t.category} · {t.kind}</div>
                      </td>
                      <td>
                        <Pill tone={t.letterhead ? 'oasis' : 'grey'}>{t.letterhead ? 'SWK Branded' : 'Brand-Free'}</Pill>
                      </td>
                      <td>
                        <button type="button" className={`btn sm ${t.active ? 'outline' : 'grey'}`} onClick={() => void toggleTemplateActive(t)}>
                          {t.active ? 'Active' : 'Hidden'}
                        </button>
                      </td>
                      <td className="text-right">
                        {!t.is_system && (
                          <button type="button" className="btn ghost icon sm text-red-600" onClick={() => void deleteTemplate(t)} aria-label={`Delete ${t.code}`}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {d.templates.length > 60 && (
              <div className="text-xs text-muted mt-2">
                Showing first 60 of {d.templates.length} templates (including your custom OWN-* templates &amp; A2A-01). Open <Link to="/studio">Document Studio</Link> to browse all.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: Corporate Header, Footer & Watermark */}
      {tab === 'branding' && (
        <div className="card p-5 max-w-2xl grid gap-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald" />
            <h2 className="text-base font-bold m-0">Corporate Document Header, Footer &amp; Faint Watermark</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Company Legal Name</label>
              <input className="input" value={branding.company_name} onChange={e => setBState({ ...branding, company_name: e.target.value })} />
            </div>
            <div>
              <label className="label">Corporate Phone</label>
              <input className="input" value={branding.company_phone} onChange={e => setBState({ ...branding, company_phone: e.target.value })} />
            </div>
            <div>
              <label className="label">Corporate Email</label>
              <input className="input" value={branding.company_email} onChange={e => setBState({ ...branding, company_email: e.target.value })} />
            </div>
            <div>
              <label className="label">Office Address</label>
              <input className="input" value={branding.company_address} onChange={e => setBState({ ...branding, company_address: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Default Corporate Document Footer Note</label>
            <input className="input" value={branding.invoice_footer} onChange={e => setBState({ ...branding, invoice_footer: e.target.value })} placeholder="e.g. Regulated by Dubai Land Department & RERA · ORN 51517" />
          </div>
          <div className="rounded-xl border border-line p-4 bg-soft grid gap-3">
            <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
              <input
                type="checkbox"
                className="accent-emerald"
                checked={branding.document_watermark_enabled}
                onChange={e => setBState({ ...branding, document_watermark_enabled: e.target.checked })}
              />
              Show Very Slight Corporate Crest Watermark on Branded SWK Documents
            </label>
            <div className="text-xs text-muted">
              Automatically omitted on brand-free statutory forms (such as RERA Form I A2A-01). Recommended opacity: 4%–5% (subtle executive finish).
            </div>
            <div>
              <label className="label">Watermark Visibility ({Math.round(branding.document_watermark_opacity * 1000) / 10}%)</label>
              <input
                type="range"
                min={0.02}
                max={0.1}
                step={0.005}
                value={branding.document_watermark_opacity}
                onChange={e => setBState({ ...branding, document_watermark_opacity: Number(e.target.value) })}
                className="w-full accent-emerald"
              />
            </div>
          </div>
          <div>
            <button type="button" className="btn green" disabled={bBusy} onClick={() => void saveBranding()}>
              <Save size={15} /> {bBusy ? 'Saving…' : 'Save Corporate Document Presentation'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
