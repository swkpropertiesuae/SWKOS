/**
 * OCR and document text extraction, all on this server (no outside service):
 *  - images (JPG, PNG, WebP, TIFF, BMP, GIF): Tesseract OCR, English + Arabic
 *  - PDF: the text layer; scanned pages without text are rendered and OCR'd
 *  - Word (.docx): text via mammoth;  .txt / .csv / .md: as is
 * mapToFields() then arranges the text into a record of any OS entity: through the connected AI provider when one is set
 * up, otherwise with label matching and patterns (e-mail, phone, Emirates ID, passport, dates, AED amounts).
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { config } from './config'
import type { EntityDef,FieldDef } from '../shared/types'
import { optValue } from '../shared/types'
import { aiConfigured,chat } from './ai/llm'

const require = createRequire(import.meta.url)
const MAX_OCR_PAGES = 15

let tessDir = ''
/** Tesseract language files ship in node_modules; copy them once into the data folder Tesseract reads from. */
function langDir() {
  if (tessDir) return tessDir
  tessDir = path.join(config.dataDir, 'tessdata')
  fs.mkdirSync(tessDir, { recursive: true })
  for (const lang of ['eng', 'ara']) {
    const dest = path.join(tessDir, `${lang}.traineddata.gz`)
    if (!fs.existsSync(dest)) fs.copyFileSync(path.join(path.dirname(require.resolve(`@tesseract.js-data/${lang}/package.json`)), '4.0.0', `${lang}.traineddata.gz`), dest)
  }
  return tessDir
}

let workerP: Promise<any> | null = null
let queue: Promise<unknown> = Promise.resolve()
async function worker() {
  if (!workerP) workerP = (async () => {
    const { createWorker } = await import('tesseract.js')
    return createWorker(['eng', 'ara'], 1, { langPath: langDir(), cachePath: langDir(), gzip: true, logger: () => {} })
  })().catch(e => { workerP = null; throw e })
  return workerP
}
/** One OCR job at a time on the shared worker, so a burst of uploads cannot exhaust memory. */
export function ocrImage(buf: Buffer): Promise<string> {
  const job = queue.then(async () => { const w = await worker(); const r = await w.recognize(buf); return String(r.data.text ?? '') })
  queue = job.catch(() => {})
  return job
}

async function pdfText(buf: Buffer): Promise<{ text: string; pages: number; ocrPages: number }> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const fonts = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts').replace(/\\/g, '/') + '/'
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, standardFontDataUrl: fonts }).promise
  const out: string[] = []
  let ocrPages = 0
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const tc = await page.getTextContent()
      let text = '', lastY: number | null = null
      for (const it of tc.items as any[]) { const y = it.transform?.[5]; if (lastY !== null && Math.abs(y - lastY) > 2) text += '\n'; else if (text && !text.endsWith(' ')) text += ' '; text += it.str; lastY = y }
      if (text.replace(/\s/g, '').length < 25 && ocrPages < MAX_OCR_PAGES) {
        // scanned page: render it and read it with OCR
        const viewport = page.getViewport({ scale: 2 })
        const cc = doc.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height))
        await page.render({ canvasContext: cc.context, viewport, canvas: cc.canvas }).promise
        const png: Buffer = cc.canvas.toBuffer('image/png')
        doc.canvasFactory.destroy(cc)
        text = await ocrImage(png)
        ocrPages++
      }
      out.push(text.trim())
    }
    return { text: out.join('\n\n').trim(), pages: doc.numPages, ocrPages }
  } finally {
    await doc.destroy().catch(() => {})
  }
}

export type Extracted = { text: string; method: 'ocr' | 'text' | 'mixed'; pages: number }
export async function extractText(buf: Buffer, name: string, mime: string): Promise<Extracted> {
  const ext = path.extname(name).toLowerCase()
  if (mime === 'application/pdf' || ext === '.pdf') { const r = await pdfText(buf); return { text: r.text, pages: r.pages, method: r.ocrPages === 0 ? 'text' : r.ocrPages === r.pages ? 'ocr' : 'mixed' } }
  if (/^image\//.test(mime) || ['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.bmp', '.gif'].includes(ext)) return { text: (await ocrImage(buf)).trim(), method: 'ocr', pages: 1 }
  if (ext === '.docx' || mime.includes('wordprocessingml')) { const mammoth: any = await import('mammoth'); const r = await mammoth.extractRawText({ buffer: buf }); return { text: String(r.value ?? '').trim(), method: 'text', pages: 1 } }
  if (['.txt', '.csv', '.md', '.json', '.tsv'].includes(ext) || mime.startsWith('text/')) return { text: buf.toString('utf8').trim(), method: 'text', pages: 1 }
  throw new Error('This file type cannot be read. Use PDF, Word (.docx), an image (JPG, PNG, TIFF…) or a text/CSV file.')
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const importable = (def: EntityDef) => def.fields.filter(f => !f.readonly && !f.computed && !f.virtual && !f.secret && !f.hidden && f.type !== 'json' && f.type !== 'ref')
const toIsoDate = (s: string) => {
  const m = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s) ?? null
  if (m) { const y = m[3]!.length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}` }
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(s); if (iso) return iso[0]
  const t = Date.parse(s); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : ''
}
function coerce(f: FieldDef, raw: string): any {
  const v = raw.trim()
  if (!v) return undefined
  if (['money', 'number', 'int', 'percent'].includes(f.type)) { const n = Number(v.replace(/(aed|dhs?|,|\s)/gi, '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) && v.match(/\d/) ? (f.type === 'int' ? Math.round(n) : n) : undefined }
  if (f.type === 'date') return toIsoDate(v) || undefined
  if (f.type === 'bool') return /^(yes|true|y|1|✓)$/i.test(v)
  if (f.type === 'select') { const opts = (f.options ?? []).map(optValue); return opts.find(o => norm(o) === norm(v)) ?? opts.find(o => norm(v).includes(norm(o)) || norm(o).includes(norm(v))) }
  return v.slice(0, 2000)
}

/** Rule-based arrangement: "Label: value" lines matched to field labels, plus well-known UAE patterns. */
export function mapByRules(text: string, def: EntityDef): Record<string, any> {
  const fields = importable(def), rec: Record<string, any> = {}
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([^:\-–|]{2,48})\s*[:\-–|]\s*(.+)$/.exec(line)
    if (!m) continue
    const label = norm(m[1]!)
    const f = fields.find(x => norm(x.label) === label) ?? fields.find(x => label.length > 3 && (norm(x.label).includes(label) || label.includes(norm(x.label)) || label.includes(x.name.replace(/_/g, ' '))))
    if (f && rec[f.name] === undefined) { const v = coerce(f, m[2]!); if (v !== undefined) rec[f.name] = v }
  }
  const put = (pred: (f: FieldDef) => boolean, val: string | undefined) => { if (!val) return; const f = fields.find(x => pred(x) && rec[x.name] === undefined); if (f) { const v = coerce(f, val); if (v !== undefined) rec[f.name] = v } }
  put(f => f.type === 'email', /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(text)?.[0])
  put(f => f.type === 'phone', /(?:\+?971|00971|0)\s?5\d[\s-]?\d{3}[\s-]?\d{4}/.exec(text)?.[0])
  put(f => /emirates|eid/i.test(f.name), /784-?\d{4}-?\d{7}-?\d/.exec(text)?.[0])
  put(f => /passport/i.test(f.name), /\b[A-Z]{1,2}\d{6,8}\b/.exec(text)?.[0])
  put(f => /trn|tax/i.test(f.name), /\b100\d{12}\b/.exec(text)?.[0])
  put(f => f.type === 'money', /(?:AED|Dhs?\.?)\s?([\d,]+(?:\.\d+)?)/i.exec(text)?.[1])
  const titleField = fields.find(f => f.name === def.title[0])
  if (titleField && rec[titleField.name] === undefined) { const first = text.split(/\r?\n/).map(s => s.trim()).find(s => s.length > 2 && s.length < 120); if (first) rec[titleField.name] = first }
  return rec
}

/** AI arrangement: the model reads the text and returns one or more records with only this entity's fields. */
async function mapByAi(text: string, def: EntityDef): Promise<Record<string, any>[]> {
  const fields = importable(def)
  const spec = fields.map(f => `${f.name} (${f.label}; ${f.type}${f.type === 'select' ? `: ${(f.options ?? []).map(optValue).join(' | ')}` : ''})`).join('\n')
  const r = await chat([
    { role: 'system', content: 'You extract data from documents for a Dubai real estate company system. Reply with JSON only: {"records":[{...}]}. Use only the given field names. Dates as YYYY-MM-DD, numbers without currency or commas, select fields must use one of the listed options exactly. Leave out fields you cannot find. Never invent values.' },
    { role: 'user', content: `Record type: ${def.plural}\nFields:\n${spec}\n\nDocument text:\n${text.slice(0, 12000)}` },
  ], undefined, undefined, { maxTokens: 1800, temperature: 0 })
  const json = /\{[\s\S]*\}/.exec(r.content)?.[0]
  const parsed = json ? JSON.parse(json) : { records: [] }
  return (Array.isArray(parsed.records) ? parsed.records : []).slice(0, 50).map((x: Record<string, any>) => {
    const out: Record<string, any> = {}
    for (const f of fields) if (x[f.name] !== undefined && x[f.name] !== null && x[f.name] !== '') { const v = coerce(f, String(x[f.name])); if (v !== undefined) out[f.name] = v }
    return out
  }).filter((x: Record<string, any>) => Object.keys(x).length)
}

export async function mapToFields(text: string, def: EntityDef): Promise<{ records: Record<string, any>[]; by: 'ai' | 'rules' }> {
  if (aiConfigured()) { try { const recs = await mapByAi(text, def); if (recs.length) return { records: recs, by: 'ai' } } catch { /* fall back to rules */ } }
  const one = mapByRules(text, def)
  return { records: Object.keys(one).length ? [one] : [], by: 'rules' }
}
