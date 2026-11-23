import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  BookOpenCheck,
  Check,
  Copy,
  Download,
  FileCode2,
  FileUp,
  Languages,
  Loader2,
  Lock,
  MessagesSquare,
  ShieldCheck,
  Volume2,
  X,
} from 'lucide-react'
import { canAccessCrmVault } from '@shared/swk-staff-access'
import { post } from '../../lib/api'
import { useMeta } from '../../lib/meta'
import { useToast } from '../../lib/toast'
import { downloadBase64File, postForDownload, saveClientBlob } from '../../lib/utilities'
import { ShareToInsideModal } from '../../components/ShareToInsideModal'
import { ModuleHeader, Pill } from '../../swk/ui'

type SourceLang = 'auto' | 'en' | 'ar' | 'hi' | 'ur' | 'ru' | 'zh' | 'fr' | 'es' | 'fa'
type TargetLang = Exclude<SourceLang, 'auto'>
type TonePreset = 'legal_rera' | 'whatsapp_client' | 'executive_email' | 'property_listing'

const LANGUAGES: { code: TargetLang; label: string; bcp47: string; rtl?: boolean }[] = [
  { code: 'en', label: 'English', bcp47: 'en-US' },
  { code: 'ar', label: 'Arabic (العربية)', bcp47: 'ar-AE', rtl: true },
  { code: 'hi', label: 'Hindi (हिन्दी)', bcp47: 'hi-IN' },
  { code: 'ur', label: 'Urdu (اردو)', bcp47: 'ur-PK', rtl: true },
  { code: 'ru', label: 'Russian (Русский)', bcp47: 'ru-RU' },
  { code: 'zh', label: 'Chinese (中文)', bcp47: 'zh-CN' },
  { code: 'fr', label: 'French (Français)', bcp47: 'fr-FR' },
  { code: 'es', label: 'Spanish (Español)', bcp47: 'es-ES' },
  { code: 'fa', label: 'Persian (فارسی)', bcp47: 'fa-IR', rtl: true },
]

const TONES: { value: TonePreset; label: string; desc: string }[] = [
  { value: 'legal_rera', label: 'RERA / DLD Legal', desc: 'Formal statutory contract & notice wording' },
  { value: 'whatsapp_client', label: 'WhatsApp Client', desc: 'Warm, clear & concise client chat style' },
  { value: 'executive_email', label: 'Executive Email', desc: 'Polished brokerage & investor correspondence' },
  { value: 'property_listing', label: 'Listing Copy', desc: 'Compelling luxury portal description' },
]

const GLOSSARY_CHIPS = [
  'Ejari', 'Oqood', 'Form A', 'Form B', 'Form F', 'Form I', 'RERA',
  'DLD Trustee', 'Trakheesi', 'Makani', 'NOC', 'Escrow', 'PDC', 'Golden Visa',
]

const RTL_LANGS = new Set<string>(['ar', 'ur', 'fa'])

interface TranslateResponse {
  translated_text: string
  tokens: number
  model: string
  provider: string
  zero_retention: boolean
  pii_redacted: number
  source_lang: string
  target_lang: string
  tone: string
  glossary_lock: boolean
  rtl: boolean
}

interface TranslateDocResponse {
  filename: string
  source_lang: string
  target_lang: string
  tone: string
  glossary_lock: boolean
  rtl: boolean
  extraction: { method: string; pages: number }
  chunks: number
  translated_text: string
  docx_base64: string
  docx_filename: string
  model: string
  provider: string
  zero_retention: boolean
  pii_redacted: number
}

export default function TranslatorPage({ embedded = false }: { embedded?: boolean }) {
  const { me } = useMeta()
  const toast = useToast()
  const nav = useNavigate()
  const isLeadership = canAccessCrmVault(me)

  const [sourceLang, setSourceLang] = useState<SourceLang>('auto')
  const [targetLang, setTargetLang] = useState<TargetLang>('ar')
  const [tone, setTone] = useState<TonePreset>('legal_rera')
  const [glossaryLock, setGlossaryLock] = useState(true)
  const [confidential, setConfidential] = useState(false)

  const [sourceText, setSourceText] = useState('')
  const [translatedText, setTranslatedText] = useState('')
  const [metaInfo, setMetaInfo] = useState<{
    model?: string
    provider?: string
    zero_retention?: boolean
    pii_redacted?: number
    rtl?: boolean
    docFilename?: string
    docxBase64?: string
    docxFilename?: string
    extractionNote?: string
  } | null>(null)

  const [busy, setBusy] = useState(false)
  const [docBusy, setDocBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  const docInputRef = useRef<HTMLInputElement>(null)

  // Receive handoff text from OCR / Document Tools
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('swk.handoff.translate')
      if (raw) {
        sessionStorage.removeItem('swk.handoff.translate')
        const parsed = JSON.parse(raw) as { text?: string; filename?: string }
        if (parsed.text) {
          setSourceText(parsed.text.slice(0, 24_000))
          toast.ok(parsed.filename ? `Loaded text from ${parsed.filename}` : 'Loaded text into Translator')
        }
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isSourceRtl = RTL_LANGS.has(sourceLang) || (sourceLang === 'auto' && /[\u0600-\u06FF]/.test(sourceText))
  const isTargetRtl = metaInfo?.rtl ?? RTL_LANGS.has(targetLang)

  const swapLanguages = () => {
    if (sourceLang === 'auto') return
    const prevSrc = sourceLang
    const prevTgt = targetLang
    setSourceLang(prevTgt)
    setTargetLang(prevSrc)
    if (translatedText.trim()) {
      setSourceText(translatedText)
      setTranslatedText(sourceText)
    }
  }

  const runTranslate = async () => {
    const clean = sourceText.trim()
    if (!clean) {
      toast.error('Enter text to translate')
      return
    }
    setBusy(true)
    try {
      const res = await post<TranslateResponse>('/api/utilities/translate', {
        text: clean,
        source_lang: sourceLang,
        target_lang: targetLang,
        tone,
        glossary_lock: glossaryLock,
        confidential: isLeadership ? confidential : false,
      })
      setTranslatedText(res.translated_text)
      setMetaInfo({
        model: res.model,
        provider: res.provider,
        zero_retention: res.zero_retention,
        pii_redacted: res.pii_redacted,
        rtl: res.rtl,
      })
    } catch (e: any) {
      toast.error(e?.message || 'Translation failed')
    } finally {
      setBusy(false)
    }
  }

  const handleDocumentUpload = async (file?: File) => {
    if (!file) return
    setDocBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('source_lang', sourceLang)
      fd.append('target_lang', targetLang)
      fd.append('tone', tone)
      fd.append('glossary_lock', glossaryLock ? 'true' : 'false')
      fd.append('confidential', isLeadership && confidential ? 'true' : 'false')
      fd.append('output_format', 'json')

      const res = await fetch('/api/utilities/translate-document', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'x-swk-client': 'web' },
        body: fd,
      })
      const data = (await res.json().catch(() => ({}))) as TranslateDocResponse & { error?: string }
      if (!res.ok) throw new Error(data.error || 'Document translation failed')

      setTranslatedText(data.translated_text)
      setMetaInfo({
        model: data.model,
        provider: data.provider,
        zero_retention: data.zero_retention,
        pii_redacted: data.pii_redacted,
        rtl: data.rtl,
        docFilename: data.filename,
        docxBase64: data.docx_base64,
        docxFilename: data.docx_filename,
        extractionNote: `${data.extraction.pages} page(s) · ${data.chunks} chunk(s) · ${data.extraction.method}`,
      })
      toast.ok(`Translated "${data.filename}"`)
    } catch (e: any) {
      toast.error(e?.message || 'Could not translate document')
    } finally {
      setDocBusy(false)
    }
  }

  const speak = (text: string, langCode: string) => {
    if (!text.trim()) return
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      toast.error('Text-to-speech is not supported in this browser')
      return
    }
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text.slice(0, 3000))
    const langMeta = LANGUAGES.find(l => l.code === langCode)
    if (langMeta) utter.lang = langMeta.bcp47
    else if (/[\u0600-\u06FF]/.test(text)) utter.lang = 'ar-AE'
    else utter.lang = 'en-US'
    window.speechSynthesis.speak(utter)
  }

  const copyOutput = async () => {
    if (!translatedText) return
    try {
      await navigator.clipboard.writeText(translatedText)
      setCopied(true)
      toast.ok('Copied translation')
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Could not copy')
    }
  }

  const exportDocx = async () => {
    if (!translatedText.trim()) return
    if (metaInfo?.docxBase64 && metaInfo?.docxFilename) {
      downloadBase64File(
        metaInfo.docxBase64,
        metaInfo.docxFilename,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      )
      toast.ok('Downloaded translated .docx')
      return
    }
    try {
      await postForDownload(
        '/api/utilities/word/export-docx',
        {
          title: `SWK Translation (${targetLang.toUpperCase()})`,
          html_content: translatedText
            .split(/\n{2,}/)
            .map(p => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`)
            .join(''),
          rtl: isTargetRtl,
          include_letterhead: true,
          include_seal: false,
        },
        `swk-translation-${targetLang}.docx`,
      )
      toast.ok('Exported .docx')
    } catch (e: any) {
      toast.error(e?.message || 'Export .docx failed')
    }
  }

  const openInWordStudio = () => {
    if (!translatedText.trim()) return
    sessionStorage.setItem(
      'swk.handoff.word',
      JSON.stringify({
        title: metaInfo?.docFilename
          ? `${metaInfo.docFilename.replace(/\.[^.]+$/, '')} (${targetLang.toUpperCase()})`
          : `Translation (${targetLang.toUpperCase()})`,
        text: translatedText,
        rtl: isTargetRtl,
      }),
    )
    nav('/utilities/word?handoff=1')
  }

  return (
    <div className="mx-auto max-w-[1440px] grid gap-4">
      {!embedded && (
        <ModuleHeader
          eyebrow="UAE REAL ESTATE TRANSLATOR · GLOSSARY LOCK · DOCX"
          title="SWK UAE Translator"
          subtitle="Bilingual and 9-language Dubai property translator with RERA/DLD statutory terminology lock, tone presets, full-document .pdf/.docx translation, and voice playback."
          icon={<Languages size={24} />}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn outline sm"
                disabled={docBusy}
                onClick={() => docInputRef.current?.click()}
              >
                {docBusy ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />}
                {docBusy ? 'Translating Document…' : 'Translate Document (.pdf/.docx)'}
              </button>
              <input
                ref={docInputRef}
                type="file"
                hidden
                accept=".pdf,.docx,.txt,.md,.html,image/*"
                onChange={e => {
                  void handleDocumentUpload(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </div>
          }
        />
      )}

      {/* Controls Bar */}
      <div className="rounded-2xl border border-line bg-card p-4 grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[260px]">
            <select
              className="select"
              value={sourceLang}
              onChange={e => setSourceLang(e.target.value as SourceLang)}
              aria-label="Source language"
            >
              <option value="auto">Auto-Detect Language</option>
              {LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>

            <button
              type="button"
              className="btn outline icon"
              disabled={sourceLang === 'auto'}
              onClick={swapLanguages}
              title="Swap source and target languages"
              aria-label="Swap languages"
            >
              <ArrowLeftRight size={16} />
            </button>

            <select
              className="select"
              value={targetLang}
              onChange={e => setTargetLang(e.target.value as TargetLang)}
              aria-label="Target language"
            >
              {LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>

          <select
            className="select"
            style={{ width: 'auto', minWidth: 200 }}
            value={tone}
            onChange={e => setTone(e.target.value as TonePreset)}
            aria-label="Translation tone"
          >
            {TONES.map(t => (
              <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>
            ))}
          </select>

          <label className="swk-toggle text-xs">
            <input type="checkbox" checked={glossaryLock} onChange={e => setGlossaryLock(e.target.checked)} />
            <span className="inline-flex items-center gap-1 font-medium">
              <BookOpenCheck size={14} className="text-[#0e9f6e]" /> UAE Glossary Lock
            </span>
          </label>

          {isLeadership && (
            <label className="swk-toggle text-xs" title="Enforces zero-retention AI routing for Leadership">
              <input type="checkbox" checked={confidential} onChange={e => setConfidential(e.target.checked)} />
              <span className="inline-flex items-center gap-1 font-medium">
                <Lock size={14} className="text-[#0e9f6e]" /> Confidential Mode
              </span>
            </label>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {embedded && (
              <>
                <button
                  type="button"
                  className="btn outline sm"
                  disabled={docBusy}
                  onClick={() => docInputRef.current?.click()}
                >
                  {docBusy ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
                  Translate File
                </button>
                <input
                  ref={docInputRef}
                  type="file"
                  hidden
                  accept=".pdf,.docx,.txt,.md,.html,image/*"
                  onChange={e => {
                    void handleDocumentUpload(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
              </>
            )}
            <button type="button" className="btn green" disabled={busy || !sourceText.trim()} onClick={() => void runTranslate()}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Languages size={15} />}
              {busy ? 'Translating…' : 'Translate'}
            </button>
          </div>
        </div>

        {glossaryLock && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-line">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted mr-1">Glossary Lock:</span>
            {GLOSSARY_CHIPS.map(term => (
              <span key={term} className="rounded-full bg-soft border border-line px-2 py-0.5 text-[11px] text-ink font-medium">
                {term}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Side-by-Side Panes */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Source Pane */}
        <section className="rounded-2xl border border-line bg-card p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <b className="text-sm text-ink">Source Text</b>
              <Pill tone="grey">{sourceText.length.toLocaleString('en-US')} / 24,000</Pill>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="btn outline sm"
                disabled={!sourceText.trim()}
                onClick={() => speak(sourceText, sourceLang === 'auto' ? (isSourceRtl ? 'ar' : 'en') : sourceLang)}
                title="Listen"
              >
                <Volume2 size={14} /> Listen
              </button>
              {sourceText && (
                <button
                  type="button"
                  className="btn outline sm"
                  onClick={() => { setSourceText(''); setTranslatedText(''); setMetaInfo(null) }}
                >
                  <X size={14} /> Clear
                </button>
              )}
            </div>
          </div>

          <textarea
            className="textarea flex-1"
            style={{ minHeight: 320, fontSize: 14.5, lineHeight: 1.65 }}
            dir={isSourceRtl ? 'rtl' : 'ltr'}
            maxLength={24_000}
            value={sourceText}
            onChange={e => setSourceText(e.target.value)}
            placeholder="Paste Form F clauses, Ejari notices, NOC letters, WhatsApp client messages, or listing copy…"
            aria-label="Source text to translate"
          />

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted">Quick sample:</span>
            <button
              type="button"
              className="rounded-lg border border-line bg-soft px-2 py-1 text-xs text-ink hover:bg-hover cursor-pointer"
              onClick={() => setSourceText('Dear Client, please find attached Form F (MOU) and Ejari renewal notice for your 2-bedroom apartment in Dubai Creek Harbour. The DLD Trustee transfer is scheduled for Thursday at 11:00 AM with a 10% security deposit PDC.')}
            >
              RERA Transfer Notice
            </button>
            <button
              type="button"
              className="rounded-lg border border-line bg-soft px-2 py-1 text-xs text-ink hover:bg-hover cursor-pointer"
              onClick={() => setSourceText('مرحباً، يرجى تزويدنا بنسخة من شهادة عدم الممانعة (NOC) وعقد الإيجار (إيجاري) لاستكمال إجراءات نقل الملكية في دائرة الأراضي والأملاك بدبي.')}
            >
              Arabic NOC Request
            </button>
          </div>
        </section>

        {/* Target Pane */}
        <section className="rounded-2xl border border-line bg-card p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <b className="text-sm text-ink">Translated Output</b>
              {isTargetRtl && <Pill tone="champ">RTL</Pill>}
              {metaInfo?.zero_retention && (
                <Pill tone="oasis">
                  <ShieldCheck size={12} className="inline mr-1" />Zero-Retention
                </Pill>
              )}
              {Boolean(metaInfo?.pii_redacted) && (
                <Pill tone="navy">{metaInfo?.pii_redacted} PII shielded</Pill>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                className="btn outline sm"
                disabled={!translatedText.trim()}
                onClick={() => speak(translatedText, targetLang)}
              >
                <Volume2 size={14} /> Listen
              </button>
              <button type="button" className="btn outline sm" disabled={!translatedText} onClick={() => void copyOutput()}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <textarea
            className="textarea flex-1"
            style={{ minHeight: 320, fontSize: 14.5, lineHeight: 1.65 }}
            dir={isTargetRtl ? 'rtl' : 'ltr'}
            value={translatedText}
            onChange={e => setTranslatedText(e.target.value)}
            placeholder="Translation appears here…"
            aria-label="Translated text"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11.5px] text-muted">
              {metaInfo?.extractionNote
                ? `${metaInfo.docFilename} · ${metaInfo.extractionNote}`
                : metaInfo?.model
                  ? `Model: ${metaInfo.model} (${metaInfo.provider})`
                  : 'Ready for text or document translation'}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" className="btn outline sm" disabled={!translatedText.trim()} onClick={() => void exportDocx()}>
                <Download size={14} /> .docx
              </button>
              <button
                type="button"
                className="btn outline sm"
                disabled={!translatedText.trim()}
                onClick={() => saveClientBlob(translatedText, `swk-translation-${targetLang}.txt`, 'text/plain;charset=utf-8')}
              >
                <Download size={14} /> .txt
              </button>
              <button type="button" className="btn outline sm" disabled={!translatedText.trim()} onClick={openInWordStudio}>
                <FileCode2 size={14} /> Word Studio
              </button>
              <button type="button" className="btn green sm" disabled={!translatedText.trim()} onClick={() => setShareOpen(true)}>
                <MessagesSquare size={14} /> Share to Inside
              </button>
            </div>
          </div>
        </section>
      </div>

      <ShareToInsideModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Share Translation to Inside"
        initialMessage={translatedText.slice(0, 3500)}
      />
    </div>
  )
}
