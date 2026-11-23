import path from 'node:path'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { createCanvas } from '@napi-rs/canvas'
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
} from 'docx'
import { htmlToContent } from 'docx/html'
import mammoth from 'mammoth'
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'
import sanitizeHtml from 'sanitize-html'
import { z } from 'zod'
import { corporateFooterDetails } from '../../shared/corporate-footer'
import { looksLikeHtml, markdownToHtml } from '../../shared/studio-html'
import { canAccessCrmVault } from '../../shared/swk-staff-access'
import { omniChat, omniConfigured } from '../ai/omni-router'
import { scrubSensitivePii } from '../ai/pii-shield'
import { inDemo, q } from '../db'
import { can, type SessionUser } from '../engine'
import { extractText } from '../ocr'
import { publicSettings } from '../settings'
import { htmlToText, STUDIO_CLASSES } from '../studio/sanitize'
import { bad, forbidden, HttpError, notFound, nowIso, todayStr } from '../util'
import { idOf } from './helpers'

const MAX_HTML = 4_000_000
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

const SOURCE_LANGS = ['auto', 'en', 'ar', 'hi', 'ur', 'ru', 'zh', 'fr', 'es', 'fa'] as const
const TARGET_LANGS = ['en', 'ar', 'hi', 'ur', 'ru', 'zh', 'fr', 'es', 'fa'] as const
const TONES = ['legal_rera', 'whatsapp_client', 'executive_email', 'property_listing'] as const
const RTL_LANGS = new Set<string>(['ar', 'ur', 'fa'])

const LANG_NAMES: Record<string, string> = {
  auto: 'Auto-Detect',
  en: 'English',
  ar: 'Arabic',
  hi: 'Hindi',
  ur: 'Urdu',
  ru: 'Russian',
  zh: 'Chinese (Simplified)',
  fr: 'French',
  es: 'Spanish',
  fa: 'Persian (Farsi)',
}

const TONE_INSTRUCTIONS: Record<(typeof TONES)[number], string> = {
  legal_rera: 'Use formal, unambiguous UAE RERA / Dubai Land Department legal & statutory contract register.',
  whatsapp_client: 'Use polite, warm, clear, and concise client-ready WhatsApp messaging style.',
  executive_email: 'Use polished, executive Dubai real estate brokerage business email register.',
  property_listing: 'Use compelling, accurate Dubai luxury real estate portal listing copy without inventing specs.',
}

export const UAE_REAL_ESTATE_GLOSSARY: readonly { term: string; note: string }[] = [
  { term: 'Ejari', note: 'Mandatory RERA tenancy registration system (إيجاري)' },
  { term: 'Oqood', note: 'DLD off-plan interim sale registration portal (عقود)' },
  { term: 'Form A', note: 'RERA Seller-Broker Listing Agreement (نموذج أ)' },
  { term: 'Form B', note: 'RERA Buyer-Broker Representation Agreement (نموذج ب)' },
  { term: 'Form F', note: 'RERA Unified Sale Contract / MOU (نموذج ف / مذكرة تفاهم)' },
  { term: 'Form I', note: 'RERA Agent-to-Agent Co-Brokering Agreement (نموذج آي)' },
  { term: 'RERA', note: 'Real Estate Regulatory Agency (مؤسسة التنظيم العقاري)' },
  { term: 'DLD Trustee', note: 'Dubai Land Department Registration Trustee Office (أمين التسجيل العقاري)' },
  { term: 'Trakheesi', note: 'DLD Advertising Permit System (تراخيصي)' },
  { term: 'Makani', note: 'Dubai 10-digit smart geographic addressing number (مكاني)' },
  { term: 'NOC', note: 'Developer No Objection Certificate (شهادة عدم ممانعة)' },
  { term: 'Escrow', note: 'RERA regulated project Escrow Account (حساب الضمان العقاري)' },
  { term: 'PDC', note: 'Post-Dated Cheque (شيك مؤجل الدفع)' },
  { term: 'Golden Visa', note: 'UAE 10-Year Property Investor Residence Visa (الإقامة الذهبية)' },
]

const WORD_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup',
    'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col',
    'div', 'span', 'blockquote', 'hr', 'a', 'img', 'small', 'section', 'figure', 'figcaption',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
    td: ['colspan', 'rowspan', 'style', 'class', 'dir', 'lang'],
    th: ['colspan', 'rowspan', 'style', 'class', 'dir', 'lang'],
    col: ['span', 'style'],
    table: ['class', 'style', 'dir', 'lang'],
    '*': ['class', 'style', 'dir', 'lang'],
  },
  allowedClasses: { '*': STUDIO_CLASSES },
  allowedStyles: {
    '*': {
      'text-align': [/^(left|right|center|justify|start|end)$/],
      'vertical-align': [/^(top|middle|bottom)$/],
      direction: [/^(ltr|rtl)$/],
      width: [/^\d{1,3}(\.\d{1,2})?%$/],
      'text-decoration': [/^(underline|line-through|none)$/],
      'font-weight': [/^(normal|bold|[1-9]00)$/],
      'font-style': [/^(normal|italic)$/],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['data'] },
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'object', 'embed', 'svg', 'math'],
  transformTags: {
    a: (_tag, attribs) => ({
      tagName: 'a',
      attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' },
    }),
    img: (_tag, attribs) => {
      const src = String(attribs.src ?? '')
      const ok =
        /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(src) ||
        /^\/brand\/[\w./-]+$/.test(src)
      const out: Record<string, string> = ok ? { ...attribs, src } : { alt: String(attribs.alt ?? '') }
      return { tagName: 'img', attribs: out }
    },
  },
  exclusiveFilter: frame => frame.tag === 'img' && !frame.attribs.src,
}

export function cleanWordHtml(raw: unknown): string {
  const s = String(raw ?? '')
  if (s.length > MAX_HTML) throw bad('Document HTML exceeds maximum allowed size (4 MB)')
  return sanitizeHtml(s, WORD_SANITIZE_OPTIONS).trim()
}

function requireStaff(req: FastifyRequest): SessionUser {
  if (!req.user || req.user.party_id) throw forbidden('This area is for company staff')
  return req.user
}

function canAttachSeal(user: SessionUser): boolean {
  return can(user, 'documents', 'create') || canAccessCrmVault(user)
}

function assertSealAllowed(user: SessionUser, includeSeal: boolean | undefined): void {
  if (includeSeal && !canAttachSeal(user)) {
    throw forbidden('Only authorized staff with document creation access or leadership can attach the SWK company seal.')
  }
}

function safeFilename(title: string, ext: string): string {
  const base = String(title || 'swk-document')
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'swk-document'
  return `${base}.${ext.replace(/^\./, '')}`
}

function parseSealImage(): { type: 'png' | 'jpg'; buf: Buffer } | null {
  const raw = String(publicSettings(true).document_seal || '')
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(raw)
  if (!m) return null
  try {
    const buf = Buffer.from(m[2]!, 'base64')
    if (!buf.length) return null
    return { type: m[1] === 'png' ? 'png' : 'jpg', buf }
  } catch {
    return null
  }
}

function shapeWordRow(r: any) {
  return {
    id: r.id,
    user_id: r.user_id,
    title: r.title,
    html_content: r.html_content ?? '',
    rtl: Boolean(r.rtl),
    include_letterhead: Boolean(r.include_letterhead),
    include_seal: Boolean(r.include_seal),
    source_template_id: r.source_template_id ?? null,
    linked_entity: r.linked_entity ?? null,
    linked_id: r.linked_id ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function plainTextToHtml(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return '<p></p>'
  if (looksLikeHtml(trimmed)) return trimmed
  return markdownToHtml(trimmed) || `<p>${escapeHtml(trimmed).replace(/\n/g, '<br>')}</p>`
}

async function buildDocxBuffer(opts: {
  title: string
  html_content: string
  rtl: boolean
  include_letterhead: boolean
  include_seal: boolean
}): Promise<Buffer> {
  const sanitized = cleanWordHtml(opts.html_content)
  const normalizedHtml = sanitized
    ? (looksLikeHtml(sanitized) ? sanitized : plainTextToHtml(sanitized))
    : `<p>${escapeHtml(opts.title || 'SWK Document')}</p>`

  const wrappedHtml = opts.rtl ? `<div dir="rtl">${normalizedHtml}</div>` : normalizedHtml
  const parsedChildren = [...htmlToContent(wrappedHtml)]
  const children: any[] = parsedChildren.length
    ? parsedChildren
    : [
        new Paragraph({
          bidirectional: opts.rtl || undefined,
          children: [new TextRun({ text: htmlToText(normalizedHtml) || opts.title || ' ', rightToLeft: opts.rtl || undefined })],
        }),
      ]

  if (opts.include_seal) {
    const seal = parseSealImage()
    if (seal) {
      children.push(
        new Paragraph({
          spacing: { before: 320 },
          alignment: opts.rtl ? AlignmentType.LEFT : AlignmentType.RIGHT,
          children: [
            new ImageRun({
              type: seal.type,
              data: seal.buf,
              transformation: { width: 92, height: 92 },
            }),
          ],
        }),
      )
    }
  }

  const company = corporateFooterDetails(publicSettings())
  const headers = opts.include_letterhead
    ? {
        default: new Header({
          children: [
            new Paragraph({
              alignment: opts.rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              border: { bottom: { color: 'C9A96E', space: 4, style: BorderStyle.SINGLE, size: 12 } },
              children: [
                new TextRun({ text: `${company.name}  `, bold: true, size: 20, color: '112D23' }),
                new TextRun({ text: `|  ${company.address}  |  ${company.website}`, size: 16, color: '5F5549' }),
              ],
            }),
          ],
        }),
      }
    : undefined

  const footers = opts.include_letterhead
    ? {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              border: { top: { color: 'C9A96E', space: 4, style: BorderStyle.SINGLE, size: 6 } },
              children: [
                new TextRun({
                  text: `${company.name} · ${company.phone} · ${company.email} · ${company.website}`,
                  size: 16,
                  color: '5F5549',
                }),
              ],
            }),
          ],
        }),
      }
    : undefined

  const doc = new Document({
    title: opts.title || 'SWK Document',
    sections: [
      {
        properties: {},
        headers,
        footers,
        children,
      },
    ],
  })
  return Buffer.from(await Packer.toBuffer(doc))
}

interface PdfBlock {
  kind: 'h1' | 'h2' | 'h3' | 'li' | 'hr' | 'p'
  text: string
}

function htmlToPdfBlocks(html: string): PdfBlock[] {
  const clean = cleanWordHtml(html)
  if (!clean) return []
  const tokenized = clean
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<(?:th|td)[^>]*>/gi, ' ')
    .replace(/<\/(?:th|td)>/gi, ' | ')
    .replace(/<hr\b[^>]*>/gi, '\n@@HR@@\n')
    .replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, (_m, inner) => `\n@@H1@@${htmlToText(inner)}\n`)
    .replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, (_m, inner) => `\n@@H2@@${htmlToText(inner)}\n`)
    .replace(/<h[3-6]\b[^>]*>([\s\S]*?)<\/h[3-6]>/gi, (_m, inner) => `\n@@H3@@${htmlToText(inner)}\n`)
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_m, inner) => `\n@@LI@@• ${htmlToText(inner)}\n`)
    .replace(/<\/(?:p|div|blockquote|ul|ol|table|thead|tbody|tfoot|section|figure|figcaption)>/gi, '\n')

  const plain = htmlToText(tokenized.replace(/\n/g, ' @@NL@@ ')).replace(/\s*@@NL@@\s*/g, '\n')
  const blocks: PdfBlock[] = []
  for (const rawLine of plain.split(/\n+/)) {
    const line = rawLine.trim()
    if (!line) continue
    if (line === '@@HR@@') {
      blocks.push({ kind: 'hr', text: '' })
    } else if (line.startsWith('@@H1@@')) {
      const text = line.slice(6).trim()
      if (text) blocks.push({ kind: 'h1', text })
    } else if (line.startsWith('@@H2@@')) {
      const text = line.slice(6).trim()
      if (text) blocks.push({ kind: 'h2', text })
    } else if (line.startsWith('@@H3@@')) {
      const text = line.slice(6).trim()
      if (text) blocks.push({ kind: 'h3', text })
    } else if (line.startsWith('@@LI@@')) {
      const text = line.slice(6).trim()
      if (text) blocks.push({ kind: 'li', text })
    } else {
      blocks.push({ kind: 'p', text: line.replace(/\|\s*$/, '').trim() })
    }
  }
  return blocks
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (!cur) {
      cur = w
    } else if (cur.length + 1 + w.length <= maxChars) {
      cur += ' ' + w
    } else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  return lines
}

function canEncodeWinAnsi(font: any, text: string): boolean {
  try {
    font.encodeText(text)
    return true
  } catch {
    return false
  }
}

function renderUnicodeLinePng(text: string, opts: { fontSize: number; bold: boolean; rtl: boolean; widthPt: number }): Buffer {
  const scale = 2
  const widthPx = Math.max(200, Math.round(opts.widthPt * scale))
  const fontPx = Math.round(opts.fontSize * scale)
  const heightPx = Math.max(28, Math.round(fontPx * 1.65))
  const canvas = createCanvas(widthPx, heightPx)
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, widthPx, heightPx)
  ctx.fillStyle = '#1f2937'
  ctx.font = `${opts.bold ? 'bold ' : ''}${fontPx}px Arial, Tahoma, "Segoe UI", sans-serif`
  ctx.direction = opts.rtl ? 'rtl' : 'ltr'
  ctx.textAlign = opts.rtl ? 'right' : 'left'
  ctx.textBaseline = 'middle'
  const x = opts.rtl ? widthPx - 2 : 2
  ctx.fillText(text, x, Math.round(heightPx / 2))
  return canvas.toBuffer('image/png')
}

async function renderDocumentToPdfBuffer(opts: {
  title: string
  html_content: string
  rtl: boolean
  include_letterhead: boolean
  include_seal: boolean
}): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create()
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const company = corporateFooterDetails(publicSettings())

  const pageWidth = 595.28
  const pageHeight = 841.89
  const marginX = 50
  const contentWidth = pageWidth - marginX * 2
  const topStart = opts.include_letterhead ? pageHeight - 92 : pageHeight - 54
  const bottomLimit = opts.include_letterhead ? 64 : 46

  const drawChrome = (page: any) => {
    if (!opts.include_letterhead) return
    const hdrText = `${company.name}  |  ${company.address}`
    if (canEncodeWinAnsi(fontBold, company.name)) {
      page.drawText(company.name, { x: marginX, y: pageHeight - 36, size: 11, font: fontBold, color: rgb(0.07, 0.18, 0.14) })
    }
    if (canEncodeWinAnsi(fontRegular, hdrText)) {
      page.drawText(`${company.address}  ·  ${company.website}`, { x: marginX, y: pageHeight - 50, size: 8, font: fontRegular, color: rgb(0.37, 0.33, 0.29) })
    }
    page.drawLine({
      start: { x: marginX, y: pageHeight - 58 },
      end: { x: pageWidth - marginX, y: pageHeight - 58 },
      thickness: 1.5,
      color: rgb(0.79, 0.66, 0.43),
    })
    page.drawLine({
      start: { x: marginX, y: 48 },
      end: { x: pageWidth - marginX, y: 48 },
      thickness: 0.75,
      color: rgb(0.79, 0.66, 0.43),
    })
    const ftrText = `${company.name} · ${company.phone} · ${company.email} · ${company.website}`
    if (canEncodeWinAnsi(fontRegular, ftrText)) {
      page.drawText(ftrText, { x: marginX, y: 34, size: 8, font: fontRegular, color: rgb(0.37, 0.33, 0.29) })
    }
  }

  let page = pdfDoc.addPage([pageWidth, pageHeight])
  drawChrome(page)
  let y = topStart

  const ensureSpace = (needed: number) => {
    if (y - needed < bottomLimit) {
      page = pdfDoc.addPage([pageWidth, pageHeight])
      drawChrome(page)
      y = topStart
    }
  }

  const blocks = htmlToPdfBlocks(opts.html_content)
  if (!blocks.length && opts.title) blocks.push({ kind: 'h1', text: opts.title })

  for (const b of blocks) {
    if (b.kind === 'hr') {
      ensureSpace(14)
      page.drawLine({
        start: { x: marginX, y: y - 4 },
        end: { x: pageWidth - marginX, y: y - 4 },
        thickness: 0.5,
        color: rgb(0.75, 0.75, 0.75),
      })
      y -= 14
      continue
    }
    const fontSize = b.kind === 'h1' ? 16 : b.kind === 'h2' ? 13 : b.kind === 'h3' ? 11.5 : 10.5
    const bold = b.kind === 'h1' || b.kind === 'h2' || b.kind === 'h3'
    const font = bold ? fontBold : fontRegular
    const lineHeight = fontSize * 1.48
    const maxChars = Math.max(24, Math.floor((contentWidth / (fontSize * 0.52))))
    const hasRtlChars = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(b.text)
    const isRtl = opts.rtl || hasRtlChars
    const lines = wrapText(b.text, hasRtlChars ? Math.floor(maxChars * 0.85) : maxChars)

    for (const line of lines) {
      ensureSpace(lineHeight + 2)
      if (canEncodeWinAnsi(font, line) && !hasRtlChars) {
        const w = font.widthOfTextAtSize(line, fontSize)
        const x = isRtl ? Math.max(marginX, pageWidth - marginX - w) : marginX + (b.kind === 'li' ? 10 : 0)
        page.drawText(line, { x, y: y - fontSize, size: fontSize, font, color: rgb(0.12, 0.16, 0.22) })
      } else {
        try {
          const png = renderUnicodeLinePng(line, { fontSize, bold, rtl: isRtl, widthPt: contentWidth })
          const img = await pdfDoc.embedPng(png)
          const hPt = fontSize * 1.65
          page.drawImage(img, { x: marginX, y: y - hPt + 2, width: contentWidth, height: hPt })
        } catch {
          const safe = line.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')
          page.drawText(safe, { x: marginX, y: y - fontSize, size: fontSize, font, color: rgb(0.12, 0.16, 0.22) })
        }
      }
      y -= lineHeight
    }
    y -= b.kind === 'h1' ? 8 : b.kind === 'h2' ? 6 : 4
  }

  if (opts.include_seal) {
    const seal = parseSealImage()
    if (seal) {
      ensureSpace(85)
      try {
        const embedded = seal.type === 'png' ? await pdfDoc.embedPng(seal.buf) : await pdfDoc.embedJpg(seal.buf)
        const x = opts.rtl ? marginX : pageWidth - marginX - 78
        page.drawImage(embedded, { x, y: y - 78, width: 78, height: 78 })
      } catch {
        /* ignore invalid seal image bytes */
      }
    }
  }

  return Buffer.from(await pdfDoc.save())
}

async function readSingleMultipartUpload(req: FastifyRequest): Promise<{
  fields: Record<string, string>
  file: { buf: Buffer; name: string; mime: string }
}> {
  if (!req.isMultipart()) throw bad('Expected a multipart file upload')
  const fields: Record<string, string> = {}
  let file: { buf: Buffer; name: string; mime: string } | null = null
  for await (const part of req.parts()) {
    if (part.type === 'field') {
      fields[part.fieldname] = String(part.value ?? '')
      continue
    }
    if (file) {
      part.file.resume()
      continue
    }
    const buf = await part.toBuffer()
    if (buf.length > MAX_UPLOAD_BYTES) {
      throw bad(`File "${part.filename || 'upload'}" exceeds the 20 MB limit`)
    }
    file = {
      buf,
      name: (part.filename || 'document').slice(0, 180),
      mime: String(part.mimetype || '').split(';')[0]!.trim().toLowerCase(),
    }
  }
  if (!file) throw bad('No file received')
  return { fields, file }
}

function buildTranslatorSystemPrompt(opts: {
  source_lang: string
  target_lang: string
  tone: (typeof TONES)[number]
  glossary_lock: boolean
}): string {
  const srcLabel = LANG_NAMES[opts.source_lang] ?? opts.source_lang
  const tgtLabel = LANG_NAMES[opts.target_lang] ?? opts.target_lang
  const lines = [
    `You are a specialist UAE Real Estate legal & commercial translator for SWK Properties LLC (Dubai, UAE).`,
    `Translate the user's text from ${srcLabel} to ${tgtLabel}.`,
    TONE_INSTRUCTIONS[opts.tone],
    'Preserve all numbers, dates, AED amounts, unit numbers, and placeholders like [PHONE_1], [EID_1], [IBAN_1], [EMAIL_1], [VAULT_REF_1], [PASSPORT_1] verbatim without altering or translating the brackets.',
    'Return ONLY the translated text without commentary or preamble.',
  ]
  if (opts.glossary_lock) {
    const glossaryLines = UAE_REAL_ESTATE_GLOSSARY.map(g => `- ${g.term}: ${g.note}`).join('\n')
    lines.push(
      `MANDATORY UAE REAL ESTATE STATUTORY GLOSSARY LOCK (keep exact statutory terminology accurate and consistent):\n${glossaryLines}`,
    )
  }
  return lines.join('\n\n')
}

function chunkTextForTranslation(text: string, maxChunkChars = 3500): string[] {
  const normalized = text.trim()
  if (!normalized) return []
  if (normalized.length <= maxChunkChars) return [normalized]
  const chunks: string[] = []
  let remaining = normalized
  while (remaining.length > maxChunkChars && chunks.length < 20) {
    let splitAt = remaining.lastIndexOf('\n\n', maxChunkChars)
    if (splitAt < maxChunkChars * 0.4) splitAt = remaining.lastIndexOf('\n', maxChunkChars)
    if (splitAt < maxChunkChars * 0.4) splitAt = remaining.lastIndexOf(' ', maxChunkChars)
    if (splitAt <= 0) splitAt = maxChunkChars
    chunks.push(remaining.slice(0, splitAt).trim())
    remaining = remaining.slice(splitAt).trim()
  }
  if (remaining) chunks.push(remaining)
  return chunks.filter(Boolean)
}

async function runTranslation(opts: {
  text: string
  source_lang: (typeof SOURCE_LANGS)[number]
  target_lang: (typeof TARGET_LANGS)[number]
  tone: (typeof TONES)[number]
  glossary_lock: boolean
  confidential: boolean
  user: SessionUser
}): Promise<{
  translated_text: string
  model: string
  provider: string
  zero_retention: boolean
  pii_redacted: number
}> {
  if (inDemo()) {
    const scrubbed = scrubSensitivePii(opts.text)
    const glossaryTag = opts.glossary_lock ? ' [Glossary Lock: Ejari/Oqood/Form F/RERA]' : ''
    return {
      translated_text: `[Demo ${opts.target_lang.toUpperCase()} · ${opts.tone}${glossaryTag}] ${opts.text}`,
      model: 'demo-translator',
      provider: 'demo',
      zero_retention: true,
      pii_redacted: scrubbed.redactedCount,
    }
  }
  if (!omniConfigured()) {
    throw new HttpError(503, 'AI translation is not configured. Ask an Owner or Admin to configure an Omni-Route provider.')
  }

  const sysPrompt = buildTranslatorSystemPrompt(opts)
  const res = await omniChat({
    lane: 'translate',
    user: opts.user,
    confidential: opts.confidential,
    zeroRetentionOnly: opts.confidential,
    temperature: 0.1,
    maxTokens: 4000,
    messages: [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: opts.text },
    ],
  })
  return {
    translated_text: res.content.trim(),
    model: res.model,
    provider: res.provider,
    zero_retention: res.zeroRetention,
    pii_redacted: res.piiRedacted,
  }
}

export default async function utilitiesRoutes(app: FastifyInstance) {
  // =========================================================================
  // 1. Private Word Documents CRUD (Strictly scoped to req.user.id)
  // =========================================================================

  app.get('/api/utilities/word', async (req) => {
    const user = requireStaff(req)
    const term = String((req.query as any)?.q ?? '').trim().toLowerCase()
    const rows = term
      ? q.all<any>(
          `SELECT id, user_id, title, html_content, rtl, include_letterhead, include_seal, source_template_id, linked_entity, linked_id, created_at, updated_at
           FROM word_documents
           WHERE user_id = ? AND deleted_at IS NULL
             AND (lower(title) LIKE ? ESCAPE '\\' OR lower(html_content) LIKE ? ESCAPE '\\')
           ORDER BY updated_at DESC, id DESC
           LIMIT 200`,
          user.id,
          `%${term.replace(/[\\%_]/g, c => '\\' + c)}%`,
          `%${term.replace(/[\\%_]/g, c => '\\' + c)}%`,
        )
      : q.all<any>(
          `SELECT id, user_id, title, html_content, rtl, include_letterhead, include_seal, source_template_id, linked_entity, linked_id, created_at, updated_at
           FROM word_documents
           WHERE user_id = ? AND deleted_at IS NULL
           ORDER BY updated_at DESC, id DESC
           LIMIT 200`,
          user.id,
        )
    const docs = rows.map(shapeWordRow)
    return { docs, rows: docs }
  })

  app.get('/api/utilities/word/:id', async (req) => {
    const user = requireStaff(req)
    const id = idOf((req.params as any).id)
    const row = q.get<any>(
      `SELECT id, user_id, title, html_content, rtl, include_letterhead, include_seal, source_template_id, linked_entity, linked_id, created_at, updated_at
       FROM word_documents
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
      id,
      user.id,
    )
    if (!row) throw notFound('Word document not found')
    return shapeWordRow(row)
  })

  const wordCreateSchema = z.object({
    title: z.string().trim().min(1).max(200),
    html_content: z.string().max(MAX_HTML).optional(),
    rtl: z.boolean().optional(),
    include_letterhead: z.boolean().optional(),
    include_seal: z.boolean().optional(),
    source_template_id: z.number().int().positive().nullable().optional(),
    linked_entity: z.string().trim().max(64).nullable().optional(),
    linked_id: z.number().int().positive().nullable().optional(),
  })

  app.post('/api/utilities/word', async (req, reply) => {
    const user = requireStaff(req)
    const b = wordCreateSchema.parse(req.body ?? {})
    assertSealAllowed(user, b.include_seal)

    let rawHtml = b.html_content ?? ''
    if (!rawHtml && b.source_template_id) {
      const tpl = q.get<{ content: string; active: number }>(
        `SELECT content, active FROM doc_templates WHERE id = ? AND deleted_at IS NULL`,
        b.source_template_id,
      )
      if (tpl && tpl.active) rawHtml = tpl.content ?? ''
    }

    const cleanHtml = cleanWordHtml(rawHtml)
    const now = nowIso()
    const id = q.insert(
      `INSERT INTO word_documents (
        user_id, title, html_content, rtl, include_letterhead, include_seal,
        source_template_id, linked_entity, linked_id, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      user.id,
      b.title,
      cleanHtml,
      b.rtl ? 1 : 0,
      b.include_letterhead !== false ? 1 : 0,
      b.include_seal ? 1 : 0,
      b.source_template_id ?? null,
      b.linked_entity ?? null,
      b.linked_id ?? null,
      now,
      now,
    )
    const created = q.get<any>(`SELECT * FROM word_documents WHERE id = ? AND user_id = ?`, id, user.id)!
    reply.code(201)
    return shapeWordRow(created)
  })

  const wordUpdateSchema = wordCreateSchema.partial()

  const handleWordUpdate = async (req: FastifyRequest) => {
    const user = requireStaff(req)
    const id = idOf((req.params as any).id)
    const existing = q.get<any>(
      `SELECT * FROM word_documents WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
      id,
      user.id,
    )
    if (!existing) throw notFound('Word document not found')
    const b = wordUpdateSchema.parse(req.body ?? {})
    assertSealAllowed(user, b.include_seal)

    const title = b.title ?? existing.title
    const htmlContent = b.html_content !== undefined ? cleanWordHtml(b.html_content) : existing.html_content
    const rtl = b.rtl !== undefined ? (b.rtl ? 1 : 0) : existing.rtl
    const includeLetterhead =
      b.include_letterhead !== undefined ? (b.include_letterhead ? 1 : 0) : existing.include_letterhead
    const includeSeal = b.include_seal !== undefined ? (b.include_seal ? 1 : 0) : existing.include_seal
    const linkedEntity = b.linked_entity !== undefined ? b.linked_entity : existing.linked_entity
    const linkedId = b.linked_id !== undefined ? b.linked_id : existing.linked_id
    const now = nowIso()

    q.run(
      `UPDATE word_documents
       SET title = ?, html_content = ?, rtl = ?, include_letterhead = ?, include_seal = ?,
           linked_entity = ?, linked_id = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
      title,
      htmlContent,
      rtl,
      includeLetterhead,
      includeSeal,
      linkedEntity,
      linkedId,
      now,
      id,
      user.id,
    )
    const updated = q.get<any>(`SELECT * FROM word_documents WHERE id = ? AND user_id = ?`, id, user.id)!
    return shapeWordRow(updated)
  }

  app.put('/api/utilities/word/:id', handleWordUpdate)
  app.patch('/api/utilities/word/:id', handleWordUpdate)

  app.delete('/api/utilities/word/:id', async (req) => {
    const user = requireStaff(req)
    const id = idOf((req.params as any).id)
    const now = nowIso()
    const res = q.run(
      `UPDATE word_documents SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
      now,
      now,
      id,
      user.id,
    )
    if (!res.changes) throw notFound('Word document not found')
    return { ok: true, id }
  })

  // =========================================================================
  // 2. Word Import / Export (.docx & .pdf) & Universal Converter
  // =========================================================================

  app.post('/api/utilities/word/import-docx', async (req) => {
    requireStaff(req)
    const { fields, file } = await readSingleMultipartUpload(req)
    const ext = path.extname(file.name).toLowerCase()

    let rawHtml = ''
    let warnings: string[] = []
    if (ext === '.docx' || file.mime.includes('wordprocessingml')) {
      try {
        const res = await mammoth.convertToHtml({ buffer: file.buf })
        rawHtml = String(res.value ?? '')
        warnings = (res.messages ?? []).map(m => m.message).filter(Boolean)
      } catch (e: any) {
        throw bad(`Could not read .docx file: ${e?.message ?? e}`)
      }
    } else if (ext === '.html' || ext === '.htm' || file.mime === 'text/html') {
      rawHtml = file.buf.toString('utf8')
    } else if (['.txt', '.md', '.csv'].includes(ext) || file.mime.startsWith('text/')) {
      rawHtml = plainTextToHtml(file.buf.toString('utf8'))
    } else {
      throw bad('Unsupported file type. Upload a .docx, .html, .txt, or .md file.')
    }

    const htmlContent = cleanWordHtml(rawHtml)
    const text = htmlToText(htmlContent)
    const title = String(fields.title || path.basename(file.name, ext) || 'Imported Document').trim().slice(0, 200)
    return { title, html_content: htmlContent, text, filename: file.name, warnings }
  })

  const exportSchema = z.object({
    id: z.number().int().positive().optional(),
    title: z.string().trim().min(1).max(200).optional(),
    html_content: z.string().max(MAX_HTML).optional(),
    rtl: z.boolean().optional(),
    include_letterhead: z.boolean().optional(),
    include_seal: z.boolean().optional(),
  })

  function resolveExportPayload(user: SessionUser, rawBody: unknown) {
    const b = exportSchema.parse(rawBody ?? {})
    let saved: any = null
    if (b.id !== undefined) {
      saved = q.get<any>(
        `SELECT * FROM word_documents WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
        b.id,
        user.id,
      )
      if (!saved) throw notFound('Word document not found')
    }
    const title = b.title ?? saved?.title ?? 'SWK Document'
    const htmlContent = b.html_content ?? saved?.html_content ?? ''
    const rtl = b.rtl !== undefined ? b.rtl : Boolean(saved?.rtl)
    const includeLetterhead =
      b.include_letterhead !== undefined
        ? b.include_letterhead
        : saved
          ? Boolean(saved.include_letterhead)
          : true
    const includeSeal = b.include_seal !== undefined ? b.include_seal : Boolean(saved?.include_seal)
    assertSealAllowed(user, includeSeal)
    return {
      title,
      html_content: htmlContent,
      rtl,
      include_letterhead: includeLetterhead,
      include_seal: includeSeal,
    }
  }

  app.post('/api/utilities/word/export-docx', async (req, reply) => {
    const user = requireStaff(req)
    const payload = resolveExportPayload(user, req.body)
    const buf = await buildDocxBuffer(payload)
    reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      .header('content-disposition', `attachment; filename="${safeFilename(payload.title, 'docx')}"`)
    return buf
  })

  app.post('/api/utilities/word/export-pdf', async (req, reply) => {
    const user = requireStaff(req)
    const payload = resolveExportPayload(user, req.body)
    const buf = await renderDocumentToPdfBuffer(payload)
    reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `attachment; filename="${safeFilename(payload.title, 'pdf')}"`)
    return buf
  })

  app.post('/api/utilities/convert', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    requireStaff(req)
    const { fields, file } = await readSingleMultipartUpload(req)
    const target = z.enum(['docx', 'pdf', 'txt']).parse(String(fields.target || '').trim().toLowerCase())
    const rtl = fields.rtl === 'true' || fields.rtl === '1'
    const includeLetterhead = fields.include_letterhead !== 'false' && fields.include_letterhead !== '0'
    const ext = path.extname(file.name).toLowerCase()
    const baseName = path.basename(file.name, ext) || 'converted'

    let html = ''
    let plainText = ''
    let method = 'text'
    let pages = 1

    if (ext === '.docx' || file.mime.includes('wordprocessingml')) {
      const converted = await mammoth.convertToHtml({ buffer: file.buf })
      html = cleanWordHtml(converted.value ?? '')
      plainText = (await mammoth.extractRawText({ buffer: file.buf })).value ?? htmlToText(html)
    } else if (ext === '.html' || ext === '.htm' || file.mime === 'text/html') {
      html = cleanWordHtml(file.buf.toString('utf8'))
      plainText = htmlToText(html)
    } else if (
      ext === '.pdf' ||
      file.mime === 'application/pdf' ||
      /^image\//.test(file.mime) ||
      ['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.bmp', '.gif'].includes(ext)
    ) {
      if ((ext === '.pdf' || file.mime === 'application/pdf') && target === 'pdf') {
        try {
          const loaded = await PDFDocument.load(file.buf, { ignoreEncryption: true })
          const out = Buffer.from(await loaded.save())
          reply
            .header('content-type', 'application/pdf')
            .header('content-disposition', `attachment; filename="${safeFilename(baseName, 'pdf')}"`)
          return out
        } catch {
          throw bad('Could not read the uploaded PDF file')
        }
      }
      const ex = await extractText(file.buf, file.name, file.mime)
      plainText = ex.text
      method = ex.method
      pages = ex.pages
      html = cleanWordHtml(plainTextToHtml(plainText))
    } else if (['.txt', '.md', '.csv', '.tsv', '.json'].includes(ext) || file.mime.startsWith('text/')) {
      plainText = file.buf.toString('utf8').trim()
      html = cleanWordHtml(plainTextToHtml(plainText))
    } else {
      throw bad('Unsupported source file. Upload .pdf, .docx, image, .html, .txt, or .md.')
    }

    reply.header('x-convert-method', method).header('x-convert-pages', String(pages))

    if (target === 'txt') {
      reply
        .header('content-type', 'text/plain; charset=utf-8')
        .header('content-disposition', `attachment; filename="${safeFilename(baseName, 'txt')}"`)
      return Buffer.from(plainText, 'utf8')
    }

    if (target === 'docx') {
      const buf = await buildDocxBuffer({
        title: baseName,
        html_content: html || plainTextToHtml(plainText),
        rtl,
        include_letterhead: includeLetterhead,
        include_seal: false,
      })
      reply
        .header('content-type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        .header('content-disposition', `attachment; filename="${safeFilename(baseName, 'docx')}"`)
      return buf
    }

    const pdfBuf = await renderDocumentToPdfBuffer({
      title: baseName,
      html_content: html || plainTextToHtml(plainText),
      rtl,
      include_letterhead: includeLetterhead,
      include_seal: false,
    })
    reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `attachment; filename="${safeFilename(baseName, 'pdf')}"`)
    return pdfBuf
  })

  // =========================================================================
  // 3. PDF Watermark
  // =========================================================================

  app.post('/api/utilities/pdf/watermark', async (req, reply) => {
    const user = requireStaff(req)
    const { fields, file } = await readSingleMultipartUpload(req)
    const ext = path.extname(file.name).toLowerCase()
    if (ext !== '.pdf' && file.mime !== 'application/pdf') {
      throw bad('Upload a PDF file to watermark')
    }

    const watermarkText = String(fields.text || fields.watermark || `SWK PROPERTIES CONFIDENTIAL · ${user.name} · ${todayStr()}`)
      .trim()
      .slice(0, 140)
    if (!watermarkText) throw bad('Watermark text cannot be empty')
    const opacity = Math.min(0.65, Math.max(0.05, Number(fields.opacity) || 0.18))
    const angleDeg = Number.isFinite(Number(fields.angle)) ? Number(fields.angle) : 45

    let pdfDoc: PDFDocument
    try {
      pdfDoc = await PDFDocument.load(file.buf, { ignoreEncryption: true })
    } catch {
      throw bad('The uploaded file is not a valid or readable PDF.')
    }

    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const winAnsiOk = canEncodeWinAnsi(font, watermarkText)
    let fallbackPngImg: any = null
    if (!winAnsiOk) {
      const png = renderUnicodeLinePng(watermarkText, { fontSize: 28, bold: true, rtl: false, widthPt: 480 })
      fallbackPngImg = await pdfDoc.embedPng(png)
    }

    for (const page of pdfDoc.getPages()) {
      const { width, height } = page.getSize()
      const diag = Math.hypot(width, height)
      if (winAnsiOk) {
        const baseWidth = font.widthOfTextAtSize(watermarkText, 24) || 100
        const targetWidth = Math.min(diag * 0.65, width * 0.95)
        const fontSize = Math.min(36, Math.max(14, Math.floor((24 * targetWidth) / baseWidth)))
        const textWidth = font.widthOfTextAtSize(watermarkText, fontSize)
        const rad = (angleDeg * Math.PI) / 180
        const x = width / 2 - (textWidth / 2) * Math.cos(rad)
        const y = height / 2 - (textWidth / 2) * Math.sin(rad)
        page.drawText(watermarkText, {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(0.45, 0.45, 0.45),
          opacity,
          rotate: degrees(angleDeg),
        })
      } else if (fallbackPngImg) {
        page.drawImage(fallbackPngImg, {
          x: width * 0.15,
          y: height * 0.4,
          width: width * 0.7,
          height: 46,
          opacity,
          rotate: degrees(angleDeg),
        })
      }
    }

    const out = Buffer.from(await pdfDoc.save())
    reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `attachment; filename="${safeFilename('watermarked-' + path.basename(file.name, ext), 'pdf')}"`)
    return out
  })

  // =========================================================================
  // 4. Dedicated UAE Real Estate Translator (Text & Multipart Document)
  // =========================================================================

  const translateSchema = z.object({
    text: z.string().trim().min(1).max(24_000),
    source_lang: z.enum(SOURCE_LANGS).default('auto'),
    target_lang: z.enum(TARGET_LANGS),
    tone: z.enum(TONES).default('legal_rera'),
    glossary_lock: z.boolean().default(true),
    confidential: z.boolean().default(false),
  })

  app.post('/api/utilities/translate', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const user = requireStaff(req)
    const b = translateSchema.parse(req.body ?? {})
    if (b.confidential && !canAccessCrmVault(user)) {
      throw forbidden('Confidential Mode translation is restricted to Leadership (Owner, Admin, Operations Manager).')
    }

    const result = await runTranslation({
      text: b.text,
      source_lang: b.source_lang,
      target_lang: b.target_lang,
      tone: b.tone,
      glossary_lock: b.glossary_lock,
      confidential: b.confidential,
      user,
    })

    return {
      ...result,
      source_lang: b.source_lang,
      target_lang: b.target_lang,
      tone: b.tone,
      glossary_lock: b.glossary_lock,
      glossary_terms: b.glossary_lock ? UAE_REAL_ESTATE_GLOSSARY.map(g => g.term) : [],
      rtl: RTL_LANGS.has(b.target_lang),
    }
  })

  app.post('/api/utilities/translate-document', { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } }, async (req, reply) => {
    const user = requireStaff(req)
    const { fields, file } = await readSingleMultipartUpload(req)
    const params = z
      .object({
        source_lang: z.enum(SOURCE_LANGS).default('auto'),
        target_lang: z.enum(TARGET_LANGS),
        tone: z.enum(TONES).default('legal_rera'),
        glossary_lock: z.boolean().default(true),
        confidential: z.boolean().default(false),
        output_format: z.enum(['json', 'docx']).default('json'),
      })
      .parse({
        source_lang: fields.source_lang || 'auto',
        target_lang: fields.target_lang,
        tone: fields.tone || 'legal_rera',
        glossary_lock: fields.glossary_lock !== 'false' && fields.glossary_lock !== '0',
        confidential: fields.confidential === 'true' || fields.confidential === '1',
        output_format: fields.output_format === 'docx' || fields.download === '1' ? 'docx' : 'json',
      })

    if (params.confidential && !canAccessCrmVault(user)) {
      throw forbidden('Confidential Mode translation is restricted to Leadership.')
    }

    const ext = path.extname(file.name).toLowerCase()
    const baseName = path.basename(file.name, ext) || 'translated-document'
    const ex =
      ext === '.html' || ext === '.htm' || file.mime === 'text/html'
        ? { text: htmlToText(cleanWordHtml(file.buf.toString('utf8'))), method: 'text' as const, pages: 1 }
        : await extractText(file.buf, file.name, file.mime)

    if (!ex.text.trim()) throw bad('No readable text found in uploaded document')

    const chunks = chunkTextForTranslation(ex.text, 3500)
    const translatedChunks: string[] = []
    let totalPii = 0
    let model = ''
    let provider = ''
    let zeroRetention = true

    for (const chunk of chunks) {
      const r = await runTranslation({
        text: chunk,
        source_lang: params.source_lang,
        target_lang: params.target_lang,
        tone: params.tone,
        glossary_lock: params.glossary_lock,
        confidential: params.confidential,
        user,
      })
      translatedChunks.push(r.translated_text)
      totalPii += r.pii_redacted
      model = r.model
      provider = r.provider
      zeroRetention = zeroRetention && r.zero_retention
    }

    const translatedText = translatedChunks.join('\n\n')
    const isRtl = RTL_LANGS.has(params.target_lang)
    const translatedHtml = translatedText
      .split(/\n{2,}/)
      .map(p => `<p${isRtl ? ' dir="rtl"' : ''}>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
      .join('\n')

    const docxBuf = await buildDocxBuffer({
      title: `${baseName} (${params.target_lang.toUpperCase()})`,
      html_content: translatedHtml,
      rtl: isRtl,
      include_letterhead: true,
      include_seal: false,
    })

    if (params.output_format === 'docx') {
      reply
        .header('content-type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        .header('content-disposition', `attachment; filename="${safeFilename(baseName + '-' + params.target_lang, 'docx')}"`)
      return docxBuf
    }

    return {
      filename: file.name,
      source_lang: params.source_lang,
      target_lang: params.target_lang,
      tone: params.tone,
      glossary_lock: params.glossary_lock,
      rtl: isRtl,
      extraction: { method: ex.method, pages: ex.pages },
      chunks: chunks.length,
      translated_text: translatedText,
      docx_base64: docxBuf.toString('base64'),
      docx_filename: safeFilename(`${baseName}-${params.target_lang}`, 'docx'),
      model,
      provider,
      zero_retention: zeroRetention,
      pii_redacted: totalPii,
    }
  })
}
