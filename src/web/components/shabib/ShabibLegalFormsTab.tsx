import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Download,
  ExternalLink,
  FileCode2,
  FileImage,
  FileSignature,
  FileText,
  Save,
  Sparkles,
} from 'lucide-react'
import { get, post } from '../../lib/api'
import { useToast } from '../../lib/toast'
import { postForDownload } from '../../lib/utilities'
import { safeHtml } from '../../studio/safe-html'
import {
  SWK_COMPANY_ADDRESS,
  SWK_COMPANY_EMAIL,
  SWK_COMPANY_NAME,
  SWK_COMPANY_PHONE,
  SWK_OFFICIAL_WEBSITES_TEXT,
  SWK_RERA_ORN,
  SWK_TRADE_LICENSE,
} from '@shared/corporate-footer'
import { CustomSelect } from '../CustomSelect'

function applyCompanyDefaults(html: string): string {
  const today = new Date().toISOString().slice(0, 10)
  return String(html || '')
    .replace(/\{\{\s*company_name\s*\}\}/gi, SWK_COMPANY_NAME)
    .replace(/\{\{\s*company_address\s*\}\}/gi, SWK_COMPANY_ADDRESS)
    .replace(/\{\{\s*company_phone\s*\}\}/gi, SWK_COMPANY_PHONE)
    .replace(/\{\{\s*company_email\s*\}\}/gi, SWK_COMPANY_EMAIL)
    .replace(/\{\{\s*company_website\s*\}\}/gi, SWK_OFFICIAL_WEBSITES_TEXT)
    .replace(/\{\{\s*rera_orn\s*\}\}/gi, SWK_RERA_ORN)
    .replace(/\{\{\s*trade_license\s*\}\}/gi, SWK_TRADE_LICENSE)
    .replace(/\{\{\s*today\s*\}\}/gi, today)
}

function extractPlaceholders(html: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const cleaned = String(html || '').replace(/<[^>]+>/g, ' ')
  const re = /\[([^\[\]\r\n]{1,80})\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(cleaned)) !== null) {
    const key = m[1]!.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function escapeHtmlVal(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function ShabibLegalFormsTab() {
  const toast = useToast()
  const [title, setTitle] = useState('Agent-to-Agent (A2A / Form I) Co-Brokering Agreement')
  const [sourceTemplateId, setSourceTemplateId] = useState<number | null>(null)
  const [rawTemplateHtml, setRawTemplateHtml] = useState<string>('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [mode, setMode] = useState<'form' | 'edit'>('form')
  const [manualHtml, setManualHtml] = useState<string>('')
  const [includeLetterhead, setIncludeLetterhead] = useState(true)
  const [includeSeal, setIncludeSeal] = useState(true)
  const [includeSignature, setIncludeSignature] = useState(true)
  const [exporting, setExporting] = useState<'' | 'docx' | 'jpeg' | 'pdf' | 'save'>('')

  const shelfQ = useQuery({
    queryKey: ['shabib-legal-shelf'],
    queryFn: () => get<{ featured: any[]; all_templates: any[] }>('/api/shabib-workspace/legal-shelf'),
  })

  const loadTemplate = async (tpl: { template_id?: number | null; id?: number; title: string; content?: string }) => {
    const tid = tpl.template_id ?? tpl.id
    try {
      let html = tpl.content || ''
      if (!html && tid) {
        const full = await get<any>(`/api/e/doc_templates/${tid}`)
        html = full.content || ''
      }
      const cleanedHtml = applyCompanyDefaults(html)
      setSourceTemplateId(tid ?? null)
      setTitle(tpl.title)
      setRawTemplateHtml(cleanedHtml)
      setManualHtml(cleanedHtml)
      const placeholders = extractPlaceholders(cleanedHtml)
      const init: Record<string, string> = {}
      const today = new Date().toISOString().slice(0, 10)
      for (const p of placeholders) {
        if (/^date$/i.test(p)) init[p] = today
        else init[p] = ''
      }
      setValues(init)
      setMode('form')
      toast.ok(`Loaded fillable template: ${tpl.title}`)
    } catch (err: any) {
      toast.error(err.message || 'Could not load template')
    }
  }

  const placeholders = useMemo(() => extractPlaceholders(rawTemplateHtml), [rawTemplateHtml])

  const mergedHtml = useMemo(() => {
    if (mode === 'edit') return manualHtml
    let out = rawTemplateHtml || '<p>Select any UAE legal template above (A2A, LOI, Tenancy Contract, Ejari, NOC, Agreements) to fill &amp; export in Word, JPEG, or PDF.</p>'
    for (const key of placeholders) {
      const val = (values[key] ?? '').trim()
      if (!val) continue
      const safeVal = escapeHtmlVal(val)
      // Replace both plain [key] and markPlaceholders span-wrapped variants
      const spanRe = new RegExp(`<span[^>]*class="ph"[^>]*>\\[${escapeRegExp(key)}\\]<\\/span>`, 'g')
      out = out.replace(spanRe, `<strong>${safeVal}</strong>`)
      out = out.replace(new RegExp(`\\[${escapeRegExp(key)}\\]`, 'g'), `<strong>${safeVal}</strong>`)
    }
    return out
  }, [mode, manualHtml, rawTemplateHtml, placeholders, values])

  const switchToEditMode = () => {
    setManualHtml(mergedHtml)
    setMode('edit')
  }

  const switchToFormMode = () => {
    // Preserve any manual edits made in Edit Template mode as the new fillable base
    if (mode === 'edit' && manualHtml.trim()) {
      setRawTemplateHtml(manualHtml)
    }
    setMode('form')
  }

  const doExport = async (kind: 'docx' | 'jpeg' | 'pdf') => {
    if (!mergedHtml.trim()) {
      toast.error('Select a template first')
      return
    }
    setExporting(kind)
    try {
      const ext = kind === 'jpeg' ? 'jpg' : kind
      const endpoint = kind === 'docx' ? '/api/utilities/word/export-docx' : kind === 'jpeg' ? '/api/utilities/word/export-jpeg' : '/api/utilities/word/export-pdf'
      await postForDownload(
        endpoint,
        {
          title,
          html_content: mergedHtml,
          rtl: false,
          include_letterhead: includeLetterhead,
          include_seal: includeSeal,
          include_signature: includeSignature,
        },
        `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}.${ext}`,
      )
      toast.ok(`Downloaded ${kind.toUpperCase()} document`)
    } catch (err: any) {
      toast.error(err.message || `Export ${kind.toUpperCase()} failed`)
    } finally {
      setExporting('')
    }
  }

  const saveToWordStudio = async () => {
    if (!mergedHtml.trim()) return
    setExporting('save')
    try {
      const rec = await post<any>('/api/utilities/word', {
        title,
        html_content: mergedHtml,
        rtl: false,
        include_letterhead: includeLetterhead,
        include_seal: includeSeal,
        include_signature: includeSignature,
        source_template_id: sourceTemplateId,
      })
      toast.ok(`Saved "${rec.title}" to Word Studio (#${rec.id})`)
    } catch (err: any) {
      toast.error(err.message || 'Could not save draft')
    } finally {
      setExporting('')
    }
  }

  const featured = shelfQ.data?.featured ?? []
  const allTemplates = shelfQ.data?.all_templates ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-card p-5 shadow-xs">
        <div>
          <h2 className="m-0 text-[18px] font-bold text-ink flex items-center gap-2">
            <FileSignature size={18} className="text-[#0e9f6e]" /> Legal Forms &amp; Agreements Studio (Word `.docx` · `.jpeg` · Fillable Form)
          </h2>
          <p className="m-0 mt-0.5 text-xs text-muted">
            One-click fillable &amp; editable templates for Agent-to-Agent (A2A / Form I), Letter of Intent (LOI), Tenancy Contract, Ejari, NOC &amp; Agreements — export directly in Word, JPEG image, or PDF with Owner Seal &amp; Signature.
          </p>
        </div>
        <Link to="/utilities/word" className="btn outline text-xs">
          Open Full Word Studio <ExternalLink size={13} />
        </Link>
      </div>

      {/* Quick-Launch Legal Shelf */}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {featured.map((item: any) => (
          <button
            key={item.code}
            type="button"
            onClick={() => void loadTemplate(item)}
            className={`text-left rounded-2xl border p-3.5 cursor-pointer transition-all ${
              sourceTemplateId && sourceTemplateId === item.template_id
                ? 'border-[#121212] bg-[#121212] text-white shadow-sm'
                : 'border-line bg-card text-ink hover:border-[#121212]/40'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider">
              <span className={sourceTemplateId === item.template_id ? 'text-[#51fec0]' : 'text-[#8a621c]'}>{item.code}</span>
              <span className="rounded-full bg-black/10 px-2 py-0.5">{item.badge}</span>
            </div>
            <div className="mt-1.5 text-xs font-bold leading-snug">{item.short}</div>
          </button>
        ))}
      </div>

      {/* Browse All 160+ Library Templates */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-card p-3.5">
        <span className="text-xs font-bold text-ink">Or pick from all {allTemplates.length} SWK Templates:</span>
        <CustomSelect
          compact
          className="select !h-9 flex-1 min-w-[260px] text-xs"
          value={sourceTemplateId ? String(sourceTemplateId) : ''}
          onChange={e => {
            const found = allTemplates.find((t: any) => String(t.id) === e.target.value)
            if (found) void loadTemplate(found)
          }}
        >
          <option value="">Choose any contract, notice, HR, finance, or RERA template…</option>
          {allTemplates.map((t: any) => (
            <option key={t.id} value={t.id}>[{t.code}] {t.category} — {t.title}</option>
          ))}
        </CustomSelect>
      </div>

      {/* Side-by-Side Fillable Form / Editable Template + Live Preview & Export Bar */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-5 rounded-3xl border border-line bg-card p-5 space-y-3.5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={switchToFormMode}
                className={`rounded-full px-3 py-1 text-xs font-bold border cursor-pointer ${mode === 'form' ? 'bg-[#121212] text-[#51fec0] border-[#121212]' : 'bg-white text-ink border-line'}`}
              >
                <Sparkles size={12} className="inline mr-1" /> Fillable Form ({placeholders.length})
              </button>
              <button
                type="button"
                onClick={switchToEditMode}
                className={`rounded-full px-3 py-1 text-xs font-bold border cursor-pointer ${mode === 'edit' ? 'bg-[#121212] text-[#51fec0] border-[#121212]' : 'bg-white text-ink border-line'}`}
              >
                <FileCode2 size={12} className="inline mr-1" /> Edit Template
              </button>
            </div>
          </div>

          <input className="input font-semibold text-xs" value={title} onChange={e => setTitle(e.target.value)} placeholder="Document Title" />

          <div className="flex flex-wrap gap-3 text-xs font-semibold text-ink">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={includeLetterhead} onChange={e => setIncludeLetterhead(e.target.checked)} /> Letterhead</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={includeSeal} onChange={e => setIncludeSeal(e.target.checked)} /> Owner Seal</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={includeSignature} onChange={e => setIncludeSignature(e.target.checked)} /> Owner Signature</label>
          </div>

          {mode === 'form' ? (
            <div className="space-y-2.5 max-h-[460px] overflow-auto pr-1">
              {placeholders.length === 0 ? (
                <p className="text-xs text-muted">Click any legal form tile above (A2A, LOI, Tenancy, Ejari, NOC, MOU) to auto-generate fillable fields here.</p>
              ) : placeholders.map(ph => (
                <div key={ph}>
                  <label className="block text-[11px] font-bold text-muted mb-0.5">{ph}</label>
                  <input
                    className="input !h-8 text-xs"
                    placeholder={`Enter ${ph}…`}
                    value={values[ph] || ''}
                    onChange={e => setValues(v => ({ ...v, [ph]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          ) : (
            <textarea
              className="input min-h-[420px] font-mono text-xs"
              value={manualHtml}
              onChange={e => setManualHtml(e.target.value)}
              placeholder="Edit template HTML directly…"
            />
          )}

          {/* Export Buttons */}
          <div className="grid grid-cols-2 gap-2 border-t border-line pt-3">
            <button disabled={!!exporting} type="button" onClick={() => void doExport('docx')} className="btn bg-[#121212] text-[#51fec0] justify-center text-xs">
              <FileText size={13} /> {exporting === 'docx' ? 'Exporting…' : 'Word (.docx)'}
            </button>
            <button disabled={!!exporting} type="button" onClick={() => void doExport('jpeg')} className="btn green justify-center text-xs">
              <FileImage size={13} /> {exporting === 'jpeg' ? 'Rendering…' : 'Image (.jpeg)'}
            </button>
            <button disabled={!!exporting} type="button" onClick={() => void doExport('pdf')} className="btn outline justify-center text-xs">
              <Download size={13} /> {exporting === 'pdf' ? 'Exporting…' : 'PDF'}
            </button>
            <button disabled={!!exporting} type="button" onClick={() => void saveToWordStudio()} className="btn outline justify-center text-xs">
              <Save size={13} /> {exporting === 'save' ? 'Saving…' : 'Save Draft'}
            </button>
          </div>
        </div>

        {/* Live Document Sheet Preview */}
        <div className="lg:col-span-7 rounded-3xl border border-line bg-white p-6 shadow-xs overflow-auto max-h-[680px]">
          <div className="border-b-2 border-[#C8A253] pb-3 mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-widest text-[#0E3A2F]">SWK PROPERTIES L.L.C.</div>
              <div className="text-[11px] text-muted">RERA ORN 51517 · DET Licence 1511391 · Live Editable Document Preview</div>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10.5px] font-bold text-emerald-800">Word · JPEG · PDF Ready</span>
          </div>
          <div
            className="prose prose-sm max-w-none text-ink [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-line [&_th]:bg-soft/60 [&_th]:p-2 [&_th]:text-left [&_th]:text-xs [&_td]:border [&_td]:border-line [&_td]:p-2 [&_td]:text-xs"
            dangerouslySetInnerHTML={{ __html: safeHtml(mergedHtml) }}
          />
        </div>
      </div>
    </div>
  )
}
