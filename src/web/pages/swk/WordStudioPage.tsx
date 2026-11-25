import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlignRight,
  BookTemplate,
  Check,
  Download,
  FileCode2,
  FilePlus2,
  FileText,
  FileUp,
  Languages,
  Loader2,
  MessagesSquare,
  Save,
  Search,
  Shield,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react'
import { canAccessDocumentTemplates, canRequestCompanySeal } from '@shared/swk-staff-access'
import { SealApprovalPanel } from '../../components/SealApprovalPanel'
import { looksLikeHtml, markPlaceholders, markdownToHtml, mergeCompanyTokens, presentDocumentHtml } from '@shared/studio-html'
import { del, get, post, put, upload } from '../../lib/api'
import { fmtDate, todayIso } from '../../lib/format'
import { useMeta } from '../../lib/meta'
import { useToast } from '../../lib/toast'
import { postForDownload, saveClientBlob } from '../../lib/utilities'
import { CorporateFooter } from '../../components/CorporateFooter'
import { ShareToInsideModal } from '../../components/ShareToInsideModal'
import { Letterhead } from '../../print/PrintPage'
import { RichEditor, type RichEditorHandle } from '../../studio/RichEditor'
import { safeHtml } from '../../studio/safe-html'
import { ModuleHeader, Pill } from '../../swk/ui'
import { Modal, useDialogs } from '../../ui/kit'

export interface WordDocumentRecord {
  id: number
  user_id: number
  title: string
  html_content: string
  rtl: boolean
  include_letterhead: boolean
  include_seal: boolean
  include_signature?: boolean
  source_template_id: number | null
  linked_entity: string | null
  linked_id: number | null
  created_at: string
  updated_at: string
}

interface DocTemplateRow {
  id: number
  code: string
  title: string
  category: string
  kind: string
  description?: string
  orientation?: string
  letterhead?: boolean
  active: boolean
  content?: string
}

const AI_PRESETS = [
  { key: 'improve', label: 'Improve clarity', prompt: 'Rewrite the following document content so it is clearer, sharper, and executive-ready while keeping all facts, numbers, and [placeholders] intact.' },
  { key: 'legal', label: 'Formal UAE RERA', prompt: 'Rewrite this text in formal UAE RERA / Dubai Land Department statutory brokerage register, preserving every fact, date, AED figure, and [placeholder].' },
  { key: 'shorten', label: 'Make concise', prompt: 'Shorten this text to the essential points without dropping any numbers, dates, obligations, or [placeholders].' },
  { key: 'expand', label: 'Expand detail', prompt: 'Expand this draft with helpful Dubai real estate clause structure and clarity without inventing prices or names; use [placeholders] for missing facts.' },
] as const

function textToCleanHtml(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return '<p><br></p>'
  if (looksLikeHtml(trimmed)) return safeHtml(trimmed)
  const md = markdownToHtml(trimmed)
  if (md) return safeHtml(md)
  return safeHtml(
    trimmed
      .split(/\n{2,}/)
      .map(p => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`)
      .join(''),
  )
}

function htmlToPlainText(html: string): string {
  const clean = safeHtml(html)
  const doc = new DOMParser().parseFromString(clean, 'text/html')
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
}

export default function WordStudioPage({ embedded = false }: { embedded?: boolean }) {
  const { me, meta, can } = useMeta()
  const toast = useToast()
  const dlg = useDialogs()
  const qc = useQueryClient()
  const [sp, setSp] = useSearchParams()

  const canSeal = canRequestCompanySeal(me)
  const canViewTemplates = canAccessDocumentTemplates(me)

  const editorRef = useRef<RichEditorHandle>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const htmlRef = useRef('<p><br></p>')

  const [docId, setDocId] = useState<number | null>(null)
  const [title, setTitle] = useState('Untitled SWK Document')
  const [html, setHtml] = useState('<p><br></p>')
  const [rtl, setRtl] = useState(false)
  const [includeLetterhead, setIncludeLetterhead] = useState(true)
  const [includeSeal, setIncludeSeal] = useState(false)
  const [includeSignature, setIncludeSignature] = useState(false)
  const [sourceTemplateId, setSourceTemplateId] = useState<number | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState<'' | 'docx' | 'pdf'>('')
  const [importing, setImporting] = useState(false)

  const [docSearch, setDocSearch] = useState('')
  const [tplOpen, setTplOpen] = useState(false)
  const [tplSearch, setTplSearch] = useState('')
  const [tplBusyId, setTplBusyId] = useState<number | null>(null)

  const [aiOpen, setAiOpen] = useState(true)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiResult, setAiResult] = useState<{ html: string; label: string } | null>(null)

  const [shareOpen, setShareOpen] = useState(false)
  const [shareMsg, setShareMsg] = useState('')

  const docsQ = useQuery({
    queryKey: ['word-docs'],
    queryFn: () => get<{ docs: WordDocumentRecord[] }>('/api/utilities/word'),
  })

  const templatesQ = useQuery({
    queryKey: ['word-doc-templates'],
    enabled: tplOpen && canViewTemplates,
    queryFn: () => get<{ rows: DocTemplateRow[] }>('/api/e/doc_templates', { pageSize: 500, sort: 'code', dir: 'asc' }),
  })

  const loadIntoEditor = useCallback((rec: {
    id: number | null
    title: string
    html_content: string
    rtl?: boolean
    include_letterhead?: boolean
    include_seal?: boolean
    include_signature?: boolean
    source_template_id?: number | null
    dirty?: boolean
  }) => {
    const clean = safeHtml(rec.html_content || '<p><br></p>')
    setDocId(rec.id)
    setTitle(rec.title || 'Untitled SWK Document')
    setHtml(clean)
    htmlRef.current = clean
    setRtl(Boolean(rec.rtl))
    setIncludeLetterhead(rec.include_letterhead !== false)
    setIncludeSeal(canSeal && Boolean(rec.include_seal))
    setIncludeSignature(canSeal && Boolean(rec.include_signature))
    setSourceTemplateId(rec.source_template_id ?? null)
    setDirty(Boolean(rec.dirty))
    setAiResult(null)
  }, [canSeal])

  const syncQueryId = useCallback((id: number | null) => {
    setSp(prev => {
      const next = new URLSearchParams(prev)
      if (id) next.set('id', String(id))
      else next.delete('id')
      next.delete('handoff')
      return next
    }, { replace: true })
  }, [setSp])

  // Load handoff payload (from OCR or Translator) or ?id= record
  const handoffChecked = useRef(false)
  const loadedParamIdRef = useRef<number | null>(null)
  const qId = Number(sp.get('id') || 0)

  useEffect(() => {
    if (!handoffChecked.current) {
      handoffChecked.current = true
      try {
        const raw = sessionStorage.getItem('swk.handoff.word')
        if (raw) {
          sessionStorage.removeItem('swk.handoff.word')
          const parsed = JSON.parse(raw) as { title?: string; html_content?: string; text?: string; rtl?: boolean }
          const nextHtml = parsed.html_content
            ? safeHtml(parsed.html_content)
            : textToCleanHtml(parsed.text || '')
          loadIntoEditor({
            id: null,
            title: parsed.title || 'Imported Draft',
            html_content: nextHtml,
            rtl: Boolean(parsed.rtl),
            include_letterhead: true,
            include_seal: false,
            dirty: true,
          })
          toast.ok('Loaded draft into Word Studio')
          return
        }
      } catch {
        /* ignore invalid sessionStorage */
      }
    }

    if (!qId) {
      loadedParamIdRef.current = null
    } else if (qId > 0 && qId !== docId && qId !== loadedParamIdRef.current) {
      loadedParamIdRef.current = qId
      get<WordDocumentRecord>(`/api/utilities/word/${qId}`)
        .then(rec => loadIntoEditor(rec))
        .catch((e: any) => toast.error(e?.message || 'Document not found'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qId, docId, loadIntoEditor])

  const savedDocs = useMemo(() => {
    const list = docsQ.data?.docs ?? []
    const needle = docSearch.trim().toLowerCase()
    if (!needle) return list
    return list.filter(d => d.title.toLowerCase().includes(needle))
  }, [docsQ.data, docSearch])

  const filteredTemplates = useMemo(() => {
    const list = (templatesQ.data?.rows ?? []).filter(t => t.active)
    const needle = tplSearch.trim().toLowerCase()
    if (!needle) return list
    return list.filter(t =>
      `${t.code} ${t.title} ${t.category} ${t.kind} ${t.description ?? ''}`.toLowerCase().includes(needle),
    )
  }, [templatesQ.data, tplSearch])

  const onEditorChange = useCallback((nextHtml: string) => {
    htmlRef.current = nextHtml
    setHtml(nextHtml)
    setDirty(true)
  }, [])

  const newBlank = async () => {
    if (dirty && !(await dlg.confirm({ title: 'Discard unsaved changes?', message: 'Start a new blank Word document?', ok: 'New document' }))) return
    loadIntoEditor({
      id: null,
      title: 'Untitled SWK Document',
      html_content: '<p><br></p>',
      rtl: false,
      include_letterhead: true,
      include_seal: false,
      dirty: false,
    })
    syncQueryId(null)
  }

  const openSavedDoc = async (rec: WordDocumentRecord) => {
    if (rec.id === docId) return
    if (dirty && !(await dlg.confirm({ title: 'Discard unsaved edits?', message: `Open "${rec.title}" without saving current edits?`, ok: 'Open' }))) return
    loadIntoEditor(rec)
    syncQueryId(rec.id)
  }

  const saveDocument = async (quiet = false): Promise<WordDocumentRecord | null> => {
    const cleanTitle = title.trim() || 'Untitled SWK Document'
    const cleanHtml = safeHtml(htmlRef.current)
    setSaving(true)
    try {
      const payload = {
        title: cleanTitle,
        html_content: cleanHtml,
        rtl,
        include_letterhead: includeLetterhead,
        include_seal: canSeal ? includeSeal : false,
        include_signature: canSeal ? includeSignature : false,
        source_template_id: sourceTemplateId,
      }
      const saved = docId
        ? await put<WordDocumentRecord>(`/api/utilities/word/${docId}`, payload)
        : await post<WordDocumentRecord>('/api/utilities/word', payload)
      setDocId(saved.id)
      setTitle(saved.title)
      setDirty(false)
      syncQueryId(saved.id)
      await qc.invalidateQueries({ queryKey: ['word-docs'] })
      if (!quiet) toast.ok('Saved to private Word Studio')
      return saved
    } catch (e: any) {
      toast.error(e?.message || 'Could not save document')
      return null
    } finally {
      setSaving(false)
    }
  }

  const deleteSavedDoc = async (rec: WordDocumentRecord) => {
    const ok = await dlg.confirm({
      title: `Delete "${rec.title}"?`,
      message: 'This moves the private Word document to deleted status.',
      danger: true,
      ok: 'Delete',
    })
    if (!ok) return
    try {
      await del(`/api/utilities/word/${rec.id}`)
      if (docId === rec.id) {
        loadIntoEditor({ id: null, title: 'Untitled SWK Document', html_content: '<p><br></p>', dirty: false })
        syncQueryId(null)
      }
      await qc.invalidateQueries({ queryKey: ['word-docs'] })
      toast.ok('Document deleted')
    } catch (e: any) {
      toast.error(e?.message || 'Could not delete document')
    }
  }

  const handleImportDocx = async (f?: File) => {
    if (!f) return
    setImporting(true)
    try {
      const res = await upload([f], {}, '/api/utilities/word/import-docx')
      const clean = safeHtml(res.html_content || textToCleanHtml(res.text || ''))
      loadIntoEditor({
        id: null,
        title: res.title || f.name.replace(/\.[^.]+$/, ''),
        html_content: clean,
        rtl: /[\u0600-\u06FF]/.test(res.text || ''),
        include_letterhead: true,
        include_seal: false,
        dirty: true,
      })
      syncQueryId(null)
      toast.ok(`Imported "${f.name}"`)
    } catch (e: any) {
      toast.error(e?.message || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const useTemplate = async (tpl: DocTemplateRow) => {
    setTplBusyId(tpl.id)
    try {
      const full = await get<DocTemplateRow>(`/api/e/doc_templates/${tpl.id}`)
      const merged = markPlaceholders(
        mergeCompanyTokens(presentDocumentHtml(full.content ?? '', full.title ?? tpl.title), meta?.settings ?? {}, todayIso()),
      )
      loadIntoEditor({
        id: null,
        title: full.title || tpl.title,
        html_content: safeHtml(merged),
        rtl: false,
        include_letterhead: full.letterhead !== false,
        include_seal: false,
        source_template_id: tpl.id,
        dirty: true,
      })
      syncQueryId(null)
      setTplOpen(false)
      toast.ok(`Loaded template ${tpl.code}`)
    } catch (e: any) {
      toast.error(e?.message || 'Could not load template')
    } finally {
      setTplBusyId(null)
    }
  }

  const exportFile = async (format: 'docx' | 'pdf' | 'txt') => {
    const baseName = (title.trim() || 'swk-document').replace(/[^\w.\- ]+/g, '_')
    if (format === 'txt') {
      saveClientBlob(htmlToPlainText(htmlRef.current), `${baseName}.txt`, 'text/plain;charset=utf-8')
      toast.ok('Downloaded .txt')
      return
    }
    setExporting(format)
    try {
      await postForDownload(
        format === 'docx' ? '/api/utilities/word/export-docx' : '/api/utilities/word/export-pdf',
        {
          id: docId ?? undefined,
          title: title.trim() || 'SWK Document',
          html_content: safeHtml(htmlRef.current),
          rtl,
          include_letterhead: includeLetterhead,
          include_seal: canSeal ? includeSeal : false,
          include_signature: canSeal ? includeSignature : false,
        },
        `${baseName}.${format}`,
      )
      toast.ok(`Exported .${format}`)
    } catch (e: any) {
      toast.error(e?.message || `Export .${format} failed`)
    } finally {
      setExporting('')
    }
  }

  const runAiAssist = async (instruction: string, kind: 'chat' | 'translate-ar' | 'translate-en', label: string) => {
    const selText = editorRef.current?.selectionText().trim()
    const sourceText = selText || htmlToPlainText(htmlRef.current)
    if (!sourceText && kind !== 'chat') {
      toast.error('Add some document text first')
      return
    }
    if (kind === 'chat' && !instruction.trim()) {
      toast.error('Enter an AI instruction')
      return
    }
    setAiBusy(true)
    try {
      if (kind === 'translate-ar' || kind === 'translate-en') {
        const target = kind === 'translate-ar' ? 'ar' : 'en'
        const res = await post<{ translated_text: string }>('/api/utilities/translate', {
          text: sourceText.slice(0, 24_000),
          source_lang: 'auto',
          target_lang: target,
          tone: 'legal_rera',
          glossary_lock: true,
          confidential: false,
        })
        setAiResult({ html: textToCleanHtml(res.translated_text), label })
      } else {
        const fullPrompt = sourceText
          ? `${instruction.trim()}\n\nDocument source:\n"""\n${sourceText.slice(0, 16_000)}\n"""\n\nReturn clean formatted text or markdown ready to place in the document.`
          : instruction.trim()
        const res = await post<{ content: string }>('/api/omni-ai/chat', {
          message: fullPrompt,
          mode: 'general',
          confidential: false,
        })
        setAiResult({ html: textToCleanHtml(res.content || ''), label })
      }
    } catch (e: any) {
      toast.error(e?.message || 'AI Assist failed')
    } finally {
      setAiBusy(false)
    }
  }

  const applyAiResult = (mode: 'selection' | 'replace' | 'append') => {
    if (!aiResult) return
    const clean = safeHtml(aiResult.html)
    if (mode === 'selection') {
      editorRef.current?.replaceSelection(clean)
    } else if (mode === 'replace') {
      editorRef.current?.replaceAll(clean)
    } else {
      const merged = `${htmlRef.current}<p><br></p>${clean}`
      editorRef.current?.replaceAll(merged)
    }
    setDirty(true)
    toast.ok('Applied AI draft to document')
  }

  const handleShareInside = async () => {
    let targetId = docId
    if (!targetId || dirty) {
      const saved = await saveDocument(true)
      if (!saved) return
      targetId = saved.id
    }
    const url = `${window.location.origin}/utilities/word?id=${targetId}`
    setShareMsg(`📄 *${title.trim() || 'SWK Document'}*\nOpen in Word Studio: ${url}`)
    setShareOpen(true)
  }

  const paperTop = includeLetterhead && meta?.settings ? <Letterhead /> : undefined
  const paperBottom = includeLetterhead || (canSeal && (includeSeal || includeSignature)) ? (
    <div>
      {canSeal && (includeSeal || includeSignature) && (
        <div className={`mt-6 flex items-end gap-4 ${rtl ? 'justify-start' : 'justify-end'}`}>
          {includeSignature && (
            meta?.settings?.document_signature ? (
              <img src={meta.settings.document_signature} alt="SWK Owner Signature" className="h-14 max-w-[160px] object-contain" />
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-ink">
                Owner Signature attached on export
              </span>
            )
          )}
          {includeSeal && (
            meta?.settings?.document_seal ? (
              <img src={meta.settings.document_seal} alt="SWK Company Seal" className="h-20 w-20 object-contain" />
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#0e9f6e]/40 bg-[#e8fff6] px-3 py-1.5 text-xs font-semibold text-[#121212]">
                <Shield size={14} className="text-[#0e9f6e]" /> SWK Seal attached on export
              </span>
            )
          )}
        </div>
      )}
      {includeLetterhead && meta?.settings && <CorporateFooter />}
    </div>
  ) : undefined

  return (
    <div className="mx-auto max-w-[1620px] grid gap-4">
      {!embedded && (
        <ModuleHeader
          eyebrow="PRIVATE WORD STUDIO · DOCX · PDF · RTL"
          title="SWK Word Studio"
          subtitle="Draft private bilingual contracts, RERA notices, NOC letters, and client memos with official SWK letterhead, inline AI Assist, and instant .docx / .pdf export."
          icon={<FileCode2 size={24} />}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn outline sm" onClick={() => void newBlank()}>
                <FilePlus2 size={15} /> Blank
              </button>
              {canViewTemplates && (
                <button type="button" className="btn outline sm" onClick={() => setTplOpen(true)}>
                  <BookTemplate size={15} /> Templates
                </button>
              )}
              <button
                type="button"
                className="btn outline sm"
                disabled={importing}
                onClick={() => importInputRef.current?.click()}
              >
                {importing ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />}
                Open .docx
              </button>
              <input
                ref={importInputRef}
                type="file"
                hidden
                accept=".docx,.html,.htm,.txt,.md,.csv"
                onChange={e => {
                  void handleImportDocx(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              <button type="button" className="btn green sm" disabled={saving} onClick={() => void saveDocument(false)}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : dirty ? <Save size={15} /> : <Check size={15} />}
                {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
              </button>
              <button type="button" className="btn outline sm" disabled={!!exporting} onClick={() => void exportFile('docx')}>
                {exporting === 'docx' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                .docx
              </button>
              <button type="button" className="btn outline sm" disabled={!!exporting} onClick={() => void exportFile('pdf')}>
                {exporting === 'pdf' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                .pdf
              </button>
              <button type="button" className="btn outline sm" onClick={() => void exportFile('txt')}>
                <FileText size={15} /> .txt
              </button>
              <button type="button" className="btn outline sm" onClick={() => void handleShareInside()}>
                <MessagesSquare size={15} /> Share to Inside
              </button>
            </div>
          }
        />
      )}

      {embedded && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn outline sm" onClick={() => void newBlank()}><FilePlus2 size={14} /> Blank</button>
            {canViewTemplates && <button type="button" className="btn outline sm" onClick={() => setTplOpen(true)}><BookTemplate size={14} /> Templates</button>}
            <button type="button" className="btn outline sm" disabled={importing} onClick={() => importInputRef.current?.click()}>
              {importing ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />} Open .docx
            </button>
            <input ref={importInputRef} type="file" hidden accept=".docx,.html,.htm,.txt,.md,.csv" onChange={e => { void handleImportDocx(e.target.files?.[0]); e.target.value = '' }} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn green sm" disabled={saving} onClick={() => void saveDocument(false)}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {dirty ? 'Save' : 'Saved'}
            </button>
            <button type="button" className="btn outline sm" disabled={!!exporting} onClick={() => void exportFile('docx')}><Download size={14} /> .docx</button>
            <button type="button" className="btn outline sm" disabled={!!exporting} onClick={() => void exportFile('pdf')}><Download size={14} /> .pdf</button>
            <button type="button" className="btn outline sm" onClick={() => void exportFile('txt')}><FileText size={14} /> .txt</button>
            <button type="button" className="btn outline sm" onClick={() => void handleShareInside()}><MessagesSquare size={14} /> Inside</button>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_310px] items-start">
        {/* Left sidebar: My Private Word Docs */}
        <aside className="rounded-2xl border border-line bg-card p-3.5 grid gap-3">
          <div className="flex items-center justify-between">
            <b className="text-[13.5px] text-ink">My Word Docs</b>
            <Pill tone="grey">{docsQ.data?.docs.length ?? 0}</Pill>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              className="input"
              style={{ paddingLeft: 32, minHeight: 34 }}
              value={docSearch}
              onChange={e => setDocSearch(e.target.value)}
              placeholder="Search saved docs…"
              aria-label="Search saved Word documents"
            />
          </div>
          <div className="max-h-[480px] overflow-auto grid gap-1.5">
            {docsQ.isLoading ? (
              <div className="p-3 text-xs text-muted flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</div>
            ) : !savedDocs.length ? (
              <div className="p-3 text-xs text-muted">No saved Word documents yet. Click Save to store your first draft.</div>
            ) : (
              savedDocs.map(d => {
                const active = d.id === docId
                return (
                  <div
                    key={d.id}
                    className={`group flex items-start gap-2 rounded-xl border p-2.5 transition-colors ${
                      active ? 'border-[#0e9f6e] bg-[#e8fff6]/70' : 'border-line bg-card hover:bg-hover'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => void openSavedDoc(d)}
                      className="flex-1 min-w-0 text-left bg-transparent border-0 p-0 cursor-pointer"
                    >
                      <div className="truncate text-[13px] font-semibold text-ink">{d.title}</div>
                      <div className="text-[11px] text-muted mt-0.5">
                        {fmtDate(d.updated_at)}
                        {d.rtl ? ' · RTL' : ''}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteSavedDoc(d)}
                      aria-label={`Delete ${d.title}`}
                      className="opacity-60 hover:opacity-100 bg-transparent border-0 p-1 text-muted hover:text-signal cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </aside>

        {/* Center: Document Controls + RichEditor */}
        <section className="min-w-0 grid gap-3">
          <div className="rounded-2xl border border-line bg-card p-3.5 flex flex-wrap items-center gap-3">
            <input
              type="text"
              className="input flex-1 min-w-[220px] font-semibold"
              value={title}
              maxLength={200}
              onChange={e => { setTitle(e.target.value); setDirty(true) }}
              placeholder="Document title…"
              aria-label="Document title"
            />
            <label className="swk-toggle text-xs">
              <input type="checkbox" checked={rtl} onChange={e => { setRtl(e.target.checked); setDirty(true) }} />
              <span className="inline-flex items-center gap-1"><AlignRight size={13} /> Arabic RTL</span>
            </label>
            <label className="swk-toggle text-xs">
              <input type="checkbox" checked={includeLetterhead} onChange={e => { setIncludeLetterhead(e.target.checked); setDirty(true) }} />
              <span>Letterhead</span>
            </label>
            {canSeal && (
              <SealApprovalPanel
                compact
                sourceType="word"
                sourceId={docId}
                documentTitle={title}
                includeSeal={includeSeal}
                includeSignature={includeSignature}
                onToggleSeal={v => { setIncludeSeal(v); setDirty(true) }}
                onToggleSignature={v => { setIncludeSignature(v); setDirty(true) }}
              />
            )}
          </div>

          <div dir={rtl ? 'rtl' : 'ltr'} className="min-w-0">
            <RichEditor
              ref={editorRef}
              value={html}
              onChange={onEditorChange}
              label="Word Studio Document"
              paperTop={paperTop}
              paperBottom={paperBottom}
            />
          </div>
        </section>

        {/* Right sidebar: Inline AI Assist */}
        <aside className="rounded-2xl border border-line bg-card p-3.5 grid gap-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink">
              <Sparkles size={15} className="text-[#0e9f6e]" /> Inline AI Assist
            </span>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setAiOpen(o => !o)}
            >
              {aiOpen ? 'Hide' : 'Show'}
            </button>
          </div>

          {aiOpen && (
            <>
              <p className="m-0 text-[12px] text-muted leading-snug">
                Highlight text inside the paper to transform only your selection, or run on the full draft.
              </p>

              <div className="grid grid-cols-2 gap-1.5">
                {AI_PRESETS.map(p => (
                  <button
                    key={p.key}
                    type="button"
                    disabled={aiBusy}
                    onClick={() => void runAiAssist(p.prompt, 'chat', p.label)}
                    className="rounded-xl border border-line bg-soft px-2.5 py-2 text-left text-[12px] font-medium text-ink hover:bg-hover cursor-pointer disabled:opacity-50"
                  >
                    <Wand2 size={12} className="inline mr-1 text-[#0e9f6e]" />
                    {p.label}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={aiBusy}
                  onClick={() => void runAiAssist('', 'translate-ar', 'Arabic (UAE Legal)')}
                  className="rounded-xl border border-line bg-soft px-2.5 py-2 text-left text-[12px] font-medium text-ink hover:bg-hover cursor-pointer disabled:opacity-50"
                >
                  <Languages size={12} className="inline mr-1 text-[#0e9f6e]" />
                  To Arabic
                </button>
                <button
                  type="button"
                  disabled={aiBusy}
                  onClick={() => void runAiAssist('', 'translate-en', 'English (UAE Legal)')}
                  className="rounded-xl border border-line bg-soft px-2.5 py-2 text-left text-[12px] font-medium text-ink hover:bg-hover cursor-pointer disabled:opacity-50"
                >
                  <Languages size={12} className="inline mr-1 text-[#0e9f6e]" />
                  To English
                </button>
              </div>

              <div className="grid gap-2">
                <textarea
                  className="textarea text-[12.5px]"
                  rows={3}
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  placeholder="Custom instruction (e.g., Draft a polite DLD transfer reminder for Business Bay Unit 1205)…"
                  aria-label="Custom AI instruction"
                />
                <button
                  type="button"
                  className="btn green sm w-full"
                  disabled={aiBusy || !aiPrompt.trim()}
                  onClick={() => void runAiAssist(aiPrompt, 'chat', 'Custom AI Draft')}
                >
                  {aiBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {aiBusy ? 'Generating…' : 'Generate with AI'}
                </button>
              </div>

              {aiResult && (
                <div className="grid gap-2 border-t border-line pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#0e9f6e]">{aiResult.label}</span>
                    <button type="button" className="text-xs text-muted underline bg-transparent border-0 cursor-pointer" onClick={() => setAiResult(null)}>
                      Clear
                    </button>
                  </div>
                  <div
                    className="studio-ai-result p-2.5 text-[12.5px] bg-soft"
                    dir={rtl ? 'rtl' : 'ltr'}
                    dangerouslySetInnerHTML={{ __html: safeHtml(aiResult.html) }}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" className="btn green sm flex-1" onClick={() => applyAiResult('selection')}>
                      Insert / Selection
                    </button>
                    <button type="button" className="btn outline sm flex-1" onClick={() => applyAiResult('replace')}>
                      Replace All
                    </button>
                    <button type="button" className="btn outline sm w-full" onClick={() => applyAiResult('append')}>
                      Append Below
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </aside>
      </div>

      {/* Template Picker Modal — strictly mounted ONLY for the 5 authorized accounts */}
      {canViewTemplates && (
      <Modal
        open={tplOpen}
        onClose={() => setTplOpen(false)}
        title="Load Letter Studio Template"
        width={760}
      >
        <div className="grid gap-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              className="input"
              style={{ paddingLeft: 34 }}
              value={tplSearch}
              onChange={e => setTplSearch(e.target.value)}
              placeholder="Search 158 SWK & RERA templates…"
              aria-label="Search templates"
            />
          </div>
          <div className="max-h-[420px] overflow-auto grid sm:grid-cols-2 gap-2.5">
            {templatesQ.isLoading ? (
              <div className="p-4 text-sm text-muted flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Loading templates…</div>
            ) : !filteredTemplates.length ? (
              <div className="p-4 text-sm text-muted">No matching templates found.</div>
            ) : (
              filteredTemplates.map(t => (
                <div key={t.id} className="rounded-xl border border-line bg-card p-3 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono text-muted">{t.code}</span>
                    <Pill tone="navy">{t.category}</Pill>
                  </div>
                  <div className="text-[13.5px] font-semibold text-ink">{t.title}</div>
                  {t.description && <div className="text-[12px] text-muted line-clamp-2">{t.description}</div>}
                  <button
                    type="button"
                    className="btn green sm mt-auto self-start"
                    disabled={tplBusyId === t.id}
                    onClick={() => void useTemplate(t)}
                  >
                    {tplBusyId === t.id ? <Loader2 size={13} className="animate-spin" /> : null}
                    Load into Editor
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>
      )}

      <ShareToInsideModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Share Word Document to Inside"
        initialMessage={shareMsg}
      />
    </div>
  )
}
