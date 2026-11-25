import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, ExternalLink, FileText, Image as ImageIcon, Loader2, X } from 'lucide-react'
import { downloadAuthFile, fetchAuthBlob, openAuthFile } from '../lib/api'
import { fmtDate, todayIso } from '../lib/format'

export interface PreviewFileRecord {
  id: number
  file_name: string
  category?: string
  size?: number
  mime?: string
  expiry_date?: string | null
  note?: string | null
  doc_version?: number
}

function fileKind(name: string, mime?: string): 'pdf' | 'image' | 'text' | 'other' {
  const lower = String(name || '').toLowerCase()
  const m = String(mime || '').toLowerCase()
  if (lower.endsWith('.pdf') || m.includes('pdf')) return 'pdf'
  if (/\.(png|jpe?g|gif|webp)$/.test(lower) || m.startsWith('image/')) return 'image'
  if (/\.(txt|csv|log|md)$/.test(lower) || m.startsWith('text/')) return 'text'
  return 'other'
}

async function renderPdfBlobToImages(blob: Blob, maxPages = 15): Promise<{ pages: string[]; totalPages: number }> {
  const [pdfjs, workerMod] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default
  }
  const data = new Uint8Array(await blob.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise
  const totalPages = doc.numPages
  const count = Math.min(totalPages, maxPages)
  const pages: string[] = []
  for (let i = 1; i <= count; i++) {
    const page = await doc.getPage(i)
    const baseVp = page.getViewport({ scale: 1 })
    const targetWidth = Math.min(1200, Math.max(760, window.innerWidth * Math.min(window.devicePixelRatio || 1.5, 2)))
    const scale = Math.min(2.4, Math.max(1.15, targetWidth / Math.max(1, baseVp.width)))
    const vp = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(vp.width)
    canvas.height = Math.round(vp.height)
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise
      pages.push(canvas.toDataURL('image/png'))
    }
  }
  await doc.destroy()
  return { pages, totalPages }
}

/**
 * 100% Fit-to-Screen Responsive Document & PDF Preview Modal.
 * Renders PDFs via pdfjs-dist into crisp width-fitted pages so Android, iOS,
 * mobile browsers, and desktop all display PDFs sharply with zero broken frames or overflow.
 */
export function DocumentPreviewModal({
  file,
  onClose,
}: {
  file: PreviewFileRecord | null
  onClose: () => void
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [pdfPages, setPdfPages] = useState<string[]>([])
  const [pdfTotalPages, setPdfTotalPages] = useState(0)
  const [textPreview, setTextPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!file) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [file, onClose])

  useEffect(() => {
    if (!file) {
      setBlobUrl(null)
      setPdfPages([])
      setPdfTotalPages(0)
      setTextPreview(null)
      setErr('')
      return
    }
    const ac = new AbortController()
    let createdUrl: string | null = null
    setLoading(true)
    setErr('')
    setBlobUrl(null)
    setPdfPages([])
    setPdfTotalPages(0)
    setTextPreview(null)

    const kind = fileKind(file.file_name, file.mime)
    fetchAuthBlob(`/api/files/${file.id}/download`, ac.signal, file.file_name)
      .then(async ({ blob, contentType }) => {
        if (ac.signal.aborted) return
        if (kind === 'text') {
          const txt = await blob.text()
          setTextPreview(txt.slice(0, 60_000))
        } else if (kind === 'pdf') {
          const typedBlob = new Blob([blob], { type: 'application/pdf' })
          createdUrl = URL.createObjectURL(typedBlob)
          setBlobUrl(createdUrl)
          try {
            const rendered = await renderPdfBlobToImages(typedBlob)
            if (!ac.signal.aborted) {
              setPdfPages(rendered.pages)
              setPdfTotalPages(rendered.totalPages)
            }
          } catch {
            // Fall back cleanly to browser native iframe/download below
          }
        } else {
          const typedBlob = contentType && blob.type !== contentType ? new Blob([blob], { type: contentType }) : blob
          createdUrl = URL.createObjectURL(typedBlob)
          setBlobUrl(createdUrl)
        }
      })
      .catch((e: any) => {
        if (ac.signal.aborted) return
        setErr(e?.message || 'Unable to load document preview')
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false)
      })

    return () => {
      ac.abort()
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [file])

  if (!file) return null
  const kind = fileKind(file.file_name, file.mime)
  const isExpired = !!file.expiry_date && file.expiry_date < todayIso()

  return createPortal(
    <div
      className="fixed inset-0 z-[260] bg-[#061218cc] backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${file.file_name}`}
    >
      <div
        className="bg-card border border-line rounded-2xl shadow-2xl flex flex-col overflow-hidden fade-in"
        style={{
          width: 'min(1080px, calc(100vw - 16px))',
          height: 'min(90dvh, calc(100dvh - 16px))',
          maxWidth: '100%',
          maxHeight: '100%',
        }}
      >
        {/* Branded Corporate Header */}
        <div
          className="flex items-center justify-between gap-2 px-3 sm:px-5 py-3 border-b border-line shrink-0"
          style={{ background: 'linear-gradient(135deg, #0a1b24 0%, #102a36 100%)', color: '#fff' }}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(200,155,60,0.18)', color: '#e2b857' }}>
              {kind === 'image' ? <ImageIcon size={17} /> : <FileText size={17} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-sm sm:text-[15px] truncate text-white">{file.file_name}</div>
              <div className="flex items-center gap-2 flex-wrap text-[11px]" style={{ color: 'rgba(255,255,255,0.74)' }}>
                {file.category && <span className="font-semibold" style={{ color: '#e2b857' }}>{file.category}</span>}
                {file.doc_version && <span>· v{file.doc_version}</span>}
                {file.size ? <span>· {Math.max(1, Math.round(file.size / 1024))} KB</span> : null}
                {pdfTotalPages > 0 && <span>· {pdfTotalPages} pg</span>}
                {file.expiry_date && (
                  <span className={isExpired ? 'text-red-300 font-bold' : ''}>
                    · {isExpired ? 'Expired' : 'Expires'} {fmtDate(file.expiry_date)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              className="btn sm"
              style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
              onClick={() => void downloadAuthFile(`/api/files/${file.id}/download?inline=0`, file.file_name)}
              title="Download file"
            >
              <Download size={14} /> <span className="hidden sm:inline">Download</span>
            </button>
            <button
              type="button"
              className="btn sm"
              style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
              onClick={() => void openAuthFile(`/api/files/${file.id}/download`, file.file_name)}
              title="Open in new tab"
            >
              <ExternalLink size={14} /> <span className="hidden md:inline">New Tab</span>
            </button>
            <button
              type="button"
              className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/10 hover:bg-white/20 text-white border-0 cursor-pointer"
              onClick={onClose}
              aria-label="Close document preview"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {file.note && (
          <div className="px-4 py-2 text-xs bg-soft border-b border-line text-ink shrink-0">
            <b>Note:</b> {file.note}
          </div>
        )}

        {/* Viewport-fitted Content Body */}
        <div className="flex-1 min-h-0 bg-soft relative flex flex-col overflow-auto">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted p-6">
              <Loader2 size={28} className="animate-spin text-emerald" />
              <div className="text-sm font-semibold">Rendering secure fit-to-screen preview…</div>
            </div>
          ) : err ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
              <div className="text-sm font-bold text-red-600 mb-2">{err}</div>
              <button
                type="button"
                className="btn green sm"
                onClick={() => void downloadAuthFile(`/api/files/${file.id}/download?inline=0`, file.file_name)}
              >
                <Download size={14} /> Download File Directly
              </button>
            </div>
          ) : kind === 'pdf' && pdfPages.length > 0 ? (
            <div className="w-full flex-1 overflow-y-auto p-2.5 sm:p-4 flex flex-col items-center gap-3">
              {pdfPages.map((src, idx) => (
                <div key={idx} className="w-full max-w-[880px] bg-white rounded-xl shadow-md border border-line overflow-hidden">
                  <img
                    src={src}
                    alt={`${file.file_name} — Page ${idx + 1}`}
                    className="w-full h-auto block"
                  />
                  <div className="px-3 py-1 text-[10.5px] font-semibold text-muted bg-soft border-t border-line flex justify-between">
                    <span>{file.file_name}</span>
                    <span>Page {idx + 1} of {pdfTotalPages}</span>
                  </div>
                </div>
              ))}
              {pdfTotalPages > pdfPages.length && (
                <div className="text-xs text-muted pb-2">
                  Showing first {pdfPages.length} of {pdfTotalPages} pages. Click <b>Download</b> to view the full PDF.
                </div>
              )}
            </div>
          ) : kind === 'pdf' && blobUrl ? (
            <iframe
              src={`${blobUrl}#view=FitH`}
              title={file.file_name}
              className="w-full flex-1 border-0 bg-white"
            />
          ) : kind === 'image' && blobUrl ? (
            <div className="w-full flex-1 p-3 flex items-center justify-center overflow-auto">
              <img
                src={blobUrl}
                alt={file.file_name}
                className="max-w-full max-h-full object-contain rounded-lg shadow-md"
              />
            </div>
          ) : kind === 'text' && textPreview !== null ? (
            <pre className="w-full flex-1 m-0 p-4 text-xs font-mono whitespace-pre-wrap break-words overflow-auto bg-card text-ink">
              {textPreview}
            </pre>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
              <FileText size={44} className="mx-auto text-emerald mb-3 opacity-80" />
              <div className="font-bold text-base mb-1">{file.file_name}</div>
              <p className="text-xs text-muted mb-4">
                This file format downloads cleanly to your device for viewing in Word, Excel, or your native viewer.
              </p>
              <button
                type="button"
                className="btn green"
                onClick={() => void downloadAuthFile(`/api/files/${file.id}/download?inline=0`, file.file_name)}
              >
                <Download size={15} /> Download {file.file_name}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
