import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Camera,
  Copy,
  Download,
  FileCode2,
  FileImage,
  FileStack,
  FileText,
  Languages,
  Loader2,
  ScanText,
  Scissors,
  Stamp,
  Trash2,
} from 'lucide-react'
import { PDFDocument } from 'pdf-lib'
import { upload } from '../../lib/api'
import { useToast } from '../../lib/toast'
import { postForDownload, saveClientBlob } from '../../lib/utilities'
import { ModuleHeader } from '../../swk/ui'
import { Modal } from '../../ui/kit'

interface CapturedPage {
  id: string
  dataUrl: string
  blob: Blob
}

/** Everyday document tools. OCR, DOCX conversion, and watermarking run on SWK OS; PDF merging, splitting, camera scan, and image-to-PDF run locally in this browser. */
export default function DocumentToolsPage({ embedded = false }: { embedded?: boolean }) {
  const toast = useToast()
  const nav = useNavigate()
  const [busy, setBusy] = useState('')
  const [ocr, setOcr] = useState<{ file: string; text: string; method: string } | null>(null)
  const [range, setRange] = useState('1-2')

  // PDF/Image -> Word (.docx) options
  const [docxRtl, setDocxRtl] = useState(false)
  const [docxLetterhead, setDocxLetterhead] = useState(true)

  // PDF Watermark options
  const [wmText, setWmText] = useState('SWK PROPERTIES CONFIDENTIAL')
  const [wmOpacity, setWmOpacity] = useState('0.18')
  const [wmAngle, setWmAngle] = useState('45')

  // Camera Multi-Page Scan modal state
  const [camOpen, setCamOpen] = useState(false)
  const [camErr, setCamErr] = useState('')
  const [camReady, setCamReady] = useState(false)
  const [captures, setCaptures] = useState<CapturedPage[]>([])
  const [scanPdfName, setScanPdfName] = useState('swk-camera-scan')
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCamReady(false)
  }, [])

  useEffect(() => {
    if (!camOpen) {
      stopCamera()
      return
    }
    let cancelled = false
    setCamErr('')
    setCamReady(false)

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamErr('Camera access is not available in this browser context (requires HTTPS or localhost).')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1600 }, height: { ideal: 1200 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          video.setAttribute('playsinline', 'true')
          await video.play()
          if (!cancelled) setCamReady(true)
        }
      } catch (e: any) {
        if (!cancelled) {
          setCamErr(e?.message || 'Camera permission denied or no camera found.')
        }
      }
    }

    void start()
    return () => {
      cancelled = true
      stopCamera()
    }
  }, [camOpen, stopCamera])

  // Ensure camera is stopped on page unmount
  useEffect(() => () => stopCamera(), [stopCamera])

  const capturePhoto = async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      toast.error('Camera frame not ready yet')
      return
    }
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!blob) {
      toast.error('Could not capture frame')
      return
    }
    setCaptures(prev => [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, dataUrl, blob }])
    toast.ok(`Captured page ${captures.length + 1}`)
  }

  const moveCapture = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= captures.length) return
    setCaptures(prev => {
      const next = [...prev]
      const [item] = next.splice(idx, 1)
      next.splice(target, 0, item!)
      return next
    })
  }

  const removeCapture = (id: string) => {
    setCaptures(prev => prev.filter(c => c.id !== id))
  }

  const saveCapturesAsPdf = async () => {
    if (!captures.length) {
      toast.error('Capture at least one page first')
      return
    }
    setBusy('cam-pdf')
    try {
      const out = await PDFDocument.create()
      const A4: [number, number] = [595.28, 841.89]
      for (const cap of captures) {
        const bytes = await cap.blob.arrayBuffer()
        const img = await out.embedJpg(bytes)
        const k = Math.min((A4[0] - 36) / img.width, (A4[1] - 36) / img.height, 1)
        const page = out.addPage(A4)
        page.drawImage(img, {
          x: (A4[0] - img.width * k) / 2,
          y: (A4[1] - img.height * k) / 2,
          width: img.width * k,
          height: img.height * k,
        })
      }
      const cleanName = (scanPdfName.trim() || 'swk-camera-scan').replace(/\.pdf$/i, '')
      saveClientBlob(new Uint8Array(await out.save()), `${cleanName}.pdf`, 'application/pdf')
      toast.ok(`Created ${cleanName}.pdf (${captures.length} page${captures.length > 1 ? 's' : ''})`)
      setCamOpen(false)
      setCaptures([])
    } catch (e: any) {
      toast.error(e?.message || 'Failed to build PDF')
    } finally {
      setBusy('')
    }
  }

  const runOcr = async (f?: File) => {
    if (!f) return
    setBusy('ocr')
    try {
      const r = await upload([f], {}, '/api/ocr/extract')
      setOcr({ file: f.name, text: r.text || '', method: r.method })
      if (!r.text) toast.error('No readable text found.')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy('')
    }
  }

  const merge = async (files: FileList | null) => {
    if (!files || files.length < 2) {
      toast.error('Choose two or more PDF files')
      return
    }
    setBusy('merge')
    try {
      const out = await PDFDocument.create()
      for (const f of Array.from(files)) {
        const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true })
        ;(await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p))
      }
      saveClientBlob(new Uint8Array(await out.save()), 'merged.pdf', 'application/pdf')
      toast.ok(`${files.length} PDFs merged`)
    } catch (e: any) {
      toast.error(`Could not merge: ${e.message}`)
    } finally {
      setBusy('')
    }
  }

  const imagesToPdf = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy('img')
    try {
      const out = await PDFDocument.create()
      for (const f of Array.from(files)) {
        const bytes = await f.arrayBuffer()
        const img = /png$/i.test(f.type) ? await out.embedPng(bytes) : /jpe?g$/i.test(f.type) ? await out.embedJpg(bytes) : null
        if (!img) {
          toast.error(`${f.name}: use JPG or PNG`)
          continue
        }
        const A4: [number, number] = [595.28, 841.89]
        const k = Math.min((A4[0] - 48) / img.width, (A4[1] - 48) / img.height, 1)
        const page = out.addPage(A4)
        page.drawImage(img, {
          x: (A4[0] - img.width * k) / 2,
          y: (A4[1] - img.height * k) / 2,
          width: img.width * k,
          height: img.height * k,
        })
      }
      if (out.getPageCount()) {
        saveClientBlob(new Uint8Array(await out.save()), 'images.pdf', 'application/pdf')
        toast.ok('PDF created')
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy('')
    }
  }

  const extract = async (f?: File) => {
    if (!f) return
    setBusy('split')
    try {
      const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true })
      const n = src.getPageCount()
      const pages = [
        ...new Set(
          range.split(',').flatMap(part => {
            const [a, b] = part.split('-').map(x => Number(x.trim()))
            return a ? Array.from({ length: (b || a) - a + 1 }, (_, i) => a + i) : []
          }),
        ),
      ].filter(p => p >= 1 && p <= n)
      if (!pages.length) {
        toast.error(`Pages must be between 1 and ${n}`)
        return
      }
      const out = await PDFDocument.create()
      ;(await out.copyPages(src, pages.map(p => p - 1))).forEach(p => out.addPage(p))
      saveClientBlob(
        new Uint8Array(await out.save()),
        f.name.replace(/\.pdf$/i, '') + `-pages-${range.replace(/\s/g, '')}.pdf`,
        'application/pdf',
      )
      toast.ok('Extracted pages')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy('')
    }
  }

  const convertToDocx = async (f?: File) => {
    if (!f) return
    setBusy('docx')
    try {
      const fd = new FormData()
      fd.append('file', f)
      fd.append('target', 'docx')
      fd.append('rtl', docxRtl ? 'true' : 'false')
      fd.append('include_letterhead', docxLetterhead ? 'true' : 'false')
      const base = f.name.replace(/\.[^.]+$/, '') || 'converted'
      await postForDownload('/api/utilities/convert', fd, `${base}.docx`)
      toast.ok(`Converted "${f.name}" to .docx`)
    } catch (e: any) {
      toast.error(e?.message || 'Conversion failed')
    } finally {
      setBusy('')
    }
  }

  const watermarkPdf = async (f?: File) => {
    if (!f) return
    if (!wmText.trim()) {
      toast.error('Enter watermark text first')
      return
    }
    setBusy('watermark')
    try {
      const fd = new FormData()
      fd.append('file', f)
      fd.append('text', wmText.trim())
      fd.append('opacity', wmOpacity)
      fd.append('angle', wmAngle)
      const base = f.name.replace(/\.pdf$/i, '') || 'document'
      await postForDownload('/api/utilities/pdf/watermark', fd, `watermarked-${base}.pdf`)
      toast.ok('Watermarked PDF downloaded')
    } catch (e: any) {
      toast.error(e?.message || 'Watermarking failed')
    } finally {
      setBusy('')
    }
  }

  const handoffToWordStudio = () => {
    if (!ocr?.text) return
    sessionStorage.setItem(
      'swk.handoff.word',
      JSON.stringify({
        title: ocr.file.replace(/\.[^.]+$/, '') || 'OCR Draft',
        text: ocr.text,
        rtl: /[\u0600-\u06FF]/.test(ocr.text),
      }),
    )
    nav('/utilities/word?handoff=1')
  }

  const handoffToTranslator = () => {
    if (!ocr?.text) return
    sessionStorage.setItem(
      'swk.handoff.translate',
      JSON.stringify({
        filename: ocr.file,
        text: ocr.text,
      }),
    )
    nav('/utilities/translator?handoff=1')
  }

  const handoffToAiBrain = async () => {
    if (!ocr?.text) return
    const prompt = `Analyse this extracted document ("${ocr.file}") and summarise key UAE real estate details, parties, dates, and action items:\n\n${ocr.text}`
    sessionStorage.setItem('swk.handoff.ai', JSON.stringify({ prompt, filename: ocr.file }))
    try {
      await navigator.clipboard.writeText(prompt)
      toast.ok('Copied OCR text for AI Brain — paste in the prompt box')
    } catch {
      toast.ok('Opening SWK AI Brain')
    }
    nav('/ai')
  }

  const Tool = ({ icon: I, title, blurb, children }: { icon: typeof ScanText; title: string; blurb: string; children: React.ReactNode }) => (
    <section className="web-card flex flex-col gap-3 p-6">
      <span className="flex size-11 items-center justify-center rounded-full bg-[#121212] text-[#51fec0]"><I size={19} /></span>
      <div>
        <h2 className="m-0 text-[17px] font-medium tracking-[-0.02em]">{title}</h2>
        <p className="m-0 mt-1 text-[13px] text-[#737373]">{blurb}</p>
      </div>
      {children}
    </section>
  )

  const pick = (accept: string, multiple: boolean, onPick: (f: FileList | null) => void, label: string, key: string) => (
    <label className="web-btn mt-auto cursor-pointer self-start">
      {busy === key ? <Loader2 size={14} className="animate-spin" /> : null}
      {label}
      <input
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        disabled={!!busy}
        onChange={e => {
          onPick(e.target.files)
          e.target.value = ''
        }}
      />
    </label>
  )

  return (
    <div className="mx-auto max-w-[1380px] grid gap-5">
      {!embedded && (
        <ModuleHeader
          eyebrow="DOCUMENTS · OCR · CAMERA SCAN · DOCX · WATERMARK"
          title="Document & PDF Tools"
          subtitle="Run EN/AR OCR with one-click handoffs, scan multi-page documents with your camera, convert PDF/images to .docx, watermark PDFs, or merge and split files locally."
          icon={<ScanText size={24} />}
        />
      )}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <Tool icon={ScanText} title="OCR: document to text" blurb="PDF, scans, photos (JPG, PNG, TIFF), Word or text. English and Arabic.">
          {pick('.pdf,.docx,.txt,image/*,.tif,.tiff', false, f => void runOcr(f?.[0]), 'Choose document', 'ocr')}
        </Tool>

        <Tool icon={Camera} title="Camera Multi-Page Scan" blurb="Capture Emirates IDs, cheques, or contracts live and pack into one A4 PDF.">
          <button
            type="button"
            className="web-btn mt-auto cursor-pointer self-start"
            onClick={() => setCamOpen(true)}
          >
            <Camera size={14} /> Open Camera Scanner
          </button>
        </Tool>

        <Tool icon={FileText} title="PDF / Image to Word (.docx)" blurb="Convert PDFs, scans, or photos into an editable SWK Word .docx file.">
          <div className="flex flex-wrap gap-3 text-xs text-muted">
            <label className="swk-toggle">
              <input type="checkbox" checked={docxRtl} onChange={e => setDocxRtl(e.target.checked)} />
              <span>Arabic RTL</span>
            </label>
            <label className="swk-toggle">
              <input type="checkbox" checked={docxLetterhead} onChange={e => setDocxLetterhead(e.target.checked)} />
              <span>Letterhead</span>
            </label>
          </div>
          {pick('.pdf,.txt,.md,.html,image/*', false, f => void convertToDocx(f?.[0]), 'Convert to .docx', 'docx')}
        </Tool>

        <Tool icon={Stamp} title="PDF Watermark" blurb="Stamp a diagonal SWK confidentiality watermark across every page of a PDF.">
          <input
            className="input text-xs"
            value={wmText}
            maxLength={140}
            onChange={e => setWmText(e.target.value)}
            placeholder="Watermark text…"
            aria-label="Watermark text"
          />
          <div className="grid grid-cols-2 gap-2">
            <select className="select text-xs" value={wmOpacity} onChange={e => setWmOpacity(e.target.value)} aria-label="Watermark opacity">
              <option value="0.12">Light (12%)</option>
              <option value="0.18">Standard (18%)</option>
              <option value="0.30">Medium (30%)</option>
              <option value="0.45">Strong (45%)</option>
            </select>
            <select className="select text-xs" value={wmAngle} onChange={e => setWmAngle(e.target.value)} aria-label="Watermark angle">
              <option value="45">Diagonal 45°</option>
              <option value="30">Diagonal 30°</option>
              <option value="0">Horizontal 0°</option>
            </select>
          </div>
          {pick('application/pdf', false, f => void watermarkPdf(f?.[0]), 'Watermark PDF', 'watermark')}
        </Tool>

        <Tool icon={FileStack} title="Merge PDFs" blurb="Combine contracts, IDs and annexes into one file, in the order chosen.">
          {pick('application/pdf', true, f => void merge(f), 'Choose PDFs', 'merge')}
        </Tool>

        <Tool icon={FileImage} title="Photos to PDF" blurb="Passport, Emirates ID or cheque photos into one A4 PDF.">
          {pick('image/jpeg,image/png', true, f => void imagesToPdf(f), 'Choose photos', 'img')}
        </Tool>

        <Tool icon={Scissors} title="Extract pages" blurb="Keep only the pages you need, e.g. 1-2, 5.">
          <input className="input" value={range} onChange={e => setRange(e.target.value)} aria-label="Pages to keep" placeholder="1-2, 5" />
          {pick('application/pdf', false, f => void extract(f?.[0]), 'Choose PDF', 'split')}
        </Tool>
      </div>

      {ocr && (
        <section className="web-card mt-2 p-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="web-eyebrow flex-1">
              {ocr.file} · {ocr.method === 'ocr' ? 'read with OCR' : ocr.method === 'mixed' ? 'text + OCR' : 'text layer'}
            </div>
            <button type="button" className="btn outline sm" onClick={() => { void navigator.clipboard.writeText(ocr.text); toast.ok('Copied') }}>
              <Copy size={14} /> Copy
            </button>
            <button
              type="button"
              className="btn outline sm"
              onClick={() => saveClientBlob(ocr.text, ocr.file.replace(/\.[^.]+$/, '') + '.txt', 'text/plain;charset=utf-8')}
            >
              <Download size={14} /> Download .txt
            </button>
            <button type="button" className="btn green sm" onClick={handoffToWordStudio}>
              <FileCode2 size={14} /> Open in Word Studio
            </button>
            <button type="button" className="btn green sm" onClick={handoffToTranslator}>
              <Languages size={14} /> Send to Translator
            </button>
            <button type="button" className="btn outline sm" onClick={() => void handoffToAiBrain()}>
              <Bot size={14} /> Ask AI Brain
            </button>
          </div>
          <textarea
            className="textarea"
            style={{ minHeight: 320, fontFamily: 'var(--font-mono, monospace)', fontSize: 13 }}
            value={ocr.text}
            onChange={e => setOcr({ ...ocr, text: e.target.value })}
            aria-label="Extracted text"
          />
        </section>
      )}

      {/* Live Camera Multi-Page Scan Modal */}
      <Modal
        open={camOpen}
        onClose={() => setCamOpen(false)}
        title="Camera Multi-Page Scan to PDF"
        width={760}
        footer={
          <>
            <button type="button" className="btn outline" onClick={() => setCamOpen(false)}>
              Close
            </button>
            <div className="flex-1" />
            {captures.length > 0 && (
              <button type="button" className="btn outline" onClick={() => setCaptures([])}>
                Clear Pages
              </button>
            )}
            <button
              type="button"
              className="btn green"
              disabled={!captures.length || busy === 'cam-pdf'}
              onClick={() => void saveCapturesAsPdf()}
            >
              {busy === 'cam-pdf' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              Save {captures.length || ''} Page{captures.length === 1 ? '' : 's'} as PDF
            </button>
          </>
        }
      >
        <div className="grid gap-4">
          {camErr ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{camErr}</div>
          ) : (
            <div className="relative overflow-hidden rounded-2xl bg-black aspect-[4/3] border border-line">
              <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute inset-4 border-2 border-dashed border-[#51fec0]/60 rounded-xl pointer-events-none" />
              <div className="absolute bottom-3 inset-x-0 flex justify-center">
                <button
                  type="button"
                  disabled={!camReady}
                  onClick={() => void capturePhoto()}
                  className="rounded-full bg-[#0e9f6e] text-white px-5 py-2.5 text-sm font-semibold shadow-lg border-0 cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
                >
                  <Camera size={16} /> Capture Page ({captures.length + 1})
                </button>
              </div>
            </div>
          )}

          {captures.length > 0 && (
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b className="text-sm text-ink">Captured Pages ({captures.length})</b>
                <input
                  type="text"
                  className="input text-xs"
                  style={{ width: 220, minHeight: 32 }}
                  value={scanPdfName}
                  onChange={e => setScanPdfName(e.target.value)}
                  placeholder="PDF filename"
                  aria-label="Scanned PDF filename"
                />
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 max-h-[220px] overflow-auto">
                {captures.map((cap, idx) => (
                  <div key={cap.id} className="rounded-xl border border-line bg-soft p-1.5 flex flex-col gap-1">
                    <img src={cap.dataUrl} alt={`Captured page ${idx + 1}`} className="w-full h-24 object-cover rounded-lg" />
                    <div className="flex items-center justify-between text-[11px] px-1">
                      <span className="font-semibold">P{idx + 1}</span>
                      <div className="flex items-center gap-1">
                        <button type="button" disabled={idx === 0} onClick={() => moveCapture(idx, -1)} aria-label="Move left" className="bg-transparent border-0 p-0.5 cursor-pointer disabled:opacity-30">
                          <ArrowLeft size={12} />
                        </button>
                        <button type="button" disabled={idx === captures.length - 1} onClick={() => moveCapture(idx, 1)} aria-label="Move right" className="bg-transparent border-0 p-0.5 cursor-pointer disabled:opacity-30">
                          <ArrowRight size={12} />
                        </button>
                        <button type="button" onClick={() => removeCapture(cap.id)} aria-label="Remove page" className="bg-transparent border-0 p-0.5 text-signal cursor-pointer">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
