import { useState } from 'react'
import { Copy,Download,FileImage,FileStack,Loader2,ScanText,Scissors } from 'lucide-react'
import { PDFDocument } from 'pdf-lib'
import { upload } from '../../lib/api'
import { useToast } from '../../lib/toast'

const save = (bytes: Uint8Array | string, name: string, type: string) => {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Everyday document tools. OCR runs on the SWK OS server; PDF merging, splitting and image-to-PDF run in this browser, so files never leave the office for those. */
export default function DocumentToolsPage() {
  const toast = useToast()
  const [busy, setBusy] = useState(''), [ocr, setOcr] = useState<{ file: string; text: string; method: string } | null>(null)
  const [range, setRange] = useState('1-2')

  const runOcr = async (f?: File) => {
    if (!f) return
    setBusy('ocr')
    try { const r = await upload([f], {}, '/api/ocr/extract'); setOcr({ file: f.name, text: r.text || '', method: r.method }); if (!r.text) toast.error('No readable text found.') } catch (e: any) { toast.error(e.message) } finally { setBusy('') }
  }
  const merge = async (files: FileList | null) => {
    if (!files || files.length < 2) { toast.error('Choose two or more PDF files'); return }
    setBusy('merge')
    try {
      const out = await PDFDocument.create()
      for (const f of Array.from(files)) { const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true }); (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p)) }
      save(await out.save(), 'merged.pdf', 'application/pdf'); toast.ok(`${files.length} PDFs merged`)
    } catch (e: any) { toast.error(`Could not merge: ${e.message}`) } finally { setBusy('') }
  }
  const imagesToPdf = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy('img')
    try {
      const out = await PDFDocument.create()
      for (const f of Array.from(files)) {
        const bytes = await f.arrayBuffer()
        const img = /png$/i.test(f.type) ? await out.embedPng(bytes) : /jpe?g$/i.test(f.type) ? await out.embedJpg(bytes) : null
        if (!img) { toast.error(`${f.name}: use JPG or PNG`); continue }
        const A4 = [595.28, 841.89] as const, k = Math.min((A4[0] - 48) / img.width, (A4[1] - 48) / img.height, 1)
        const page = out.addPage([...A4]); page.drawImage(img, { x: (A4[0] - img.width * k) / 2, y: (A4[1] - img.height * k) / 2, width: img.width * k, height: img.height * k })
      }
      if (out.getPageCount()) { save(await out.save(), 'images.pdf', 'application/pdf'); toast.ok('PDF created') }
    } catch (e: any) { toast.error(e.message) } finally { setBusy('') }
  }
  const extract = async (f?: File) => {
    if (!f) return
    setBusy('split')
    try {
      const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true }), n = src.getPageCount()
      const pages = [...new Set(range.split(',').flatMap(part => { const [a, b] = part.split('-').map(x => Number(x.trim())); return a ? Array.from({ length: (b || a) - a + 1 }, (_, i) => a + i) : [] }))].filter(p => p >= 1 && p <= n)
      if (!pages.length) { toast.error(`Pages must be between 1 and ${n}`); return }
      const out = await PDFDocument.create(); (await out.copyPages(src, pages.map(p => p - 1))).forEach(p => out.addPage(p))
      save(await out.save(), f.name.replace(/\.pdf$/i, '') + `-pages-${range.replace(/\s/g, '')}.pdf`, 'application/pdf')
    } catch (e: any) { toast.error(e.message) } finally { setBusy('') }
  }

  const Tool = ({ icon: I, title, blurb, children }: { icon: typeof ScanText; title: string; blurb: string; children: React.ReactNode }) => (
    <section className="web-card flex flex-col gap-3 p-6">
      <span className="flex size-11 items-center justify-center rounded-full bg-[#121212] text-[#51fec0]"><I size={19} /></span>
      <div><h2 className="m-0 text-[17px] font-medium tracking-[-0.02em]">{title}</h2><p className="m-0 mt-1 text-[13px] text-[#737373]">{blurb}</p></div>
      {children}
    </section>
  )
  const pick = (accept: string, multiple: boolean, onPick: (f: FileList | null) => void, label: string, key: string) => (
    <label className="web-btn mt-auto cursor-pointer self-start">{busy === key ? <Loader2 size={14} className="animate-spin" /> : null}{label}<input type="file" hidden accept={accept} multiple={multiple} disabled={!!busy} onChange={e => { onPick(e.target.files); e.target.value = '' }} /></label>
  )

  return (
    <div className="mx-auto max-w-[1260px]">
      <header className="mb-8"><div className="web-eyebrow">Documents & Manual</div><h1 className="web-title">Document tools</h1><p className="web-lead">Read scans and photos with OCR, merge or split PDFs and turn photos into a PDF. To import documents straight into records (leads, tenants, properties…), use “Smart import (OCR)” on that list.</p></header>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Tool icon={ScanText} title="OCR: document to text" blurb="PDF, scans, photos (JPG, PNG, TIFF), Word or text. English and Arabic.">{pick('.pdf,.docx,.txt,image/*,.tif,.tiff', false, f => void runOcr(f?.[0]), 'Choose document', 'ocr')}</Tool>
        <Tool icon={FileStack} title="Merge PDFs" blurb="Combine contracts, IDs and annexes into one file, in the order chosen.">{pick('application/pdf', true, f => void merge(f), 'Choose PDFs', 'merge')}</Tool>
        <Tool icon={FileImage} title="Photos to PDF" blurb="Passport, Emirates ID or cheque photos into one A4 PDF.">{pick('image/jpeg,image/png', true, f => void imagesToPdf(f), 'Choose photos', 'img')}</Tool>
        <Tool icon={Scissors} title="Extract pages" blurb="Keep only the pages you need, e.g. 1-2, 5.">
          <input className="input" value={range} onChange={e => setRange(e.target.value)} aria-label="Pages to keep" placeholder="1-2, 5" />
          {pick('application/pdf', false, f => void extract(f?.[0]), 'Choose PDF', 'split')}
        </Tool>
      </div>
      {ocr && (
        <section className="web-card mt-8 p-6">
          <div className="mb-3 flex flex-wrap items-center gap-2"><div className="web-eyebrow flex-1">{ocr.file} · {ocr.method === 'ocr' ? 'read with OCR' : ocr.method === 'mixed' ? 'text + OCR' : 'text layer'}</div>
            <button className="btn outline sm" onClick={() => { void navigator.clipboard.writeText(ocr.text); toast.ok('Copied') }}><Copy size={14} /> Copy</button>
            <button className="btn outline sm" onClick={() => save(ocr.text, ocr.file.replace(/\.[^.]+$/, '') + '.txt', 'text/plain')}><Download size={14} /> Download .txt</button></div>
          <textarea className="textarea" style={{ minHeight: 320, fontFamily: 'var(--font-mono, monospace)', fontSize: 13 }} value={ocr.text} onChange={e => setOcr({ ...ocr, text: e.target.value })} aria-label="Extracted text" />
        </section>
      )}
    </div>
  )
}
