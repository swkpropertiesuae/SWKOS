/**
 * Unified Forensic Dossier & Document Exporters (PDF, Word .docx, and Multi-Page JPEG)
 * Used by:
 *  - Shabib's Workspace Forensic Site Visit / Viewing Dossiers
 *  - Pin-to-Pin Closing Forensic Reports (Off-Plan, Secondary, Handover, Leasing, Property Mgmt)
 *  - Agent Commissions & Agent Expenses Statements
 *  - Word Studio / Legal Templates JPEG export (/api/utilities/word/export-jpeg)
 */
import { createCanvas, loadImage } from '@napi-rs/canvas'
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import {
  SWK_COMPANY_ADDRESS,
  SWK_COMPANY_EMAIL,
  SWK_COMPANY_NAME,
  SWK_COMPANY_PHONE,
  SWK_OFFICIAL_WEBSITES_TEXT,
  SWK_RERA_ORN,
  SWK_TRADE_LICENSE,
  corporateFooterDetails,
} from '../../shared/corporate-footer'
import { publicSettings } from '../settings'
import { htmlToText } from '../studio/sanitize'
import { toPdfSafeText } from './catalog-kit'

export type ForensicExportFormat = 'pdf' | 'docx' | 'jpeg'

export interface ForensicSection {
  title: string
  pairs?: Array<[string, string]>
  table?: { headers: string[]; rows: string[][] }
  bullets?: string[]
  note?: string
}

export interface StructuredForensicDoc {
  eyebrow: string
  refNo: string
  title: string
  subtitle?: string
  badges?: string[]
  generatedAt?: string
  sections: ForensicSection[]
}

const fmtDateNow = () => new Date().toISOString().slice(0, 10)

function wrapPdf(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const paragraphs = String(text ?? '').split(/\r?\n/)
  const out: string[] = []
  for (const para of paragraphs) {
    const safe = toPdfSafeText(para)
    if (!safe) continue
    const words = safe.split(/\s+/).filter(Boolean)
    let line = ''
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w
      if (font.widthOfTextAtSize(cand, size) <= maxWidth) line = cand
      else {
        if (line) out.push(line)
        line = w
      }
    }
    if (line) out.push(line)
  }
  return out.length ? out : ['-']
}

function drawPdfFooter(page: PDFPage, font: PDFFont, bold: PDFFont, pageNo: number, total: number) {
  const { width } = page.getSize()
  page.drawRectangle({ x: 36, y: 42, width: width - 72, height: 1, color: rgb(0.78, 0.63, 0.32) })
  page.drawText(
    toPdfSafeText(`${SWK_COMPANY_NAME} | RERA ORN ${SWK_RERA_ORN} | DET Licence ${SWK_TRADE_LICENSE}`),
    { x: 36, y: 28, size: 7.5, font: bold, color: rgb(0.055, 0.227, 0.184) },
  )
  page.drawText(
    toPdfSafeText(`${SWK_COMPANY_ADDRESS} | ${SWK_COMPANY_PHONE} | ${SWK_COMPANY_EMAIL}`),
    { x: 36, y: 16, size: 7, font, color: rgb(0.32, 0.38, 0.36) },
  )
  const right = toPdfSafeText(`${SWK_OFFICIAL_WEBSITES_TEXT}  |  Page ${pageNo} of ${total}`)
  const rw = font.widthOfTextAtSize(right, 7)
  page.drawText(right, { x: width - 36 - rw, y: 28, size: 7, font, color: rgb(0.32, 0.38, 0.36) })
}

export async function buildStructuredForensicPdf(doc: StructuredForensicDoc): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const primary = rgb(0.055, 0.227, 0.184)
  const accent = rgb(0.784, 0.635, 0.325)
  const ink = rgb(0.11, 0.15, 0.15)
  const muted = rgb(0.36, 0.42, 0.42)
  const soft = rgb(0.96, 0.96, 0.95)

  const W = 595.28
  const H = 841.89
  const M = 36
  let page = pdf.addPage([W, H])
  let y = H - 36

  const drawHeaderBanner = () => {
    page.drawRectangle({ x: 0, y: H - 102, width: W, height: 102, color: primary })
    page.drawRectangle({ x: 0, y: H - 106, width: W, height: 4, color: accent })
    page.drawText(toPdfSafeText(doc.eyebrow.toUpperCase()), { x: M, y: H - 28, size: 8, font: bold, color: accent })
    const refRight = toPdfSafeText(`REF: ${doc.refNo}  |  ${doc.generatedAt || fmtDateNow()}`)
    const rw = bold.widthOfTextAtSize(refRight, 8)
    page.drawText(refRight, { x: W - M - rw, y: H - 28, size: 8, font: bold, color: rgb(0.88, 0.92, 0.9) })
    const titleLines = wrapPdf(doc.title, bold, 16, W - M * 2).slice(0, 2)
    let ty = H - 52
    for (const l of titleLines) {
      page.drawText(l, { x: M, y: ty, size: 16, font: bold, color: rgb(1, 1, 1) })
      ty -= 20
    }
    if (doc.subtitle) {
      page.drawText(toPdfSafeText(doc.subtitle).slice(0, 105), { x: M, y: H - 92, size: 8.5, font, color: rgb(0.85, 0.89, 0.88) })
    }
    y = H - 124
  }

  const ensureSpace = (needed: number) => {
    if (y - needed < 64) {
      page = pdf.addPage([W, H])
      page.drawRectangle({ x: 0, y: H - 40, width: W, height: 40, color: primary })
      page.drawText(toPdfSafeText(`${doc.refNo} — ${doc.title}`).slice(0, 90), { x: M, y: H - 25, size: 9.5, font: bold, color: rgb(1, 1, 1) })
      y = H - 62
    }
  }

  drawHeaderBanner()

  if (doc.badges?.length) {
    let bx = M
    for (const b of doc.badges.slice(0, 5)) {
      const txt = toPdfSafeText(b).slice(0, 28)
      const bw = Math.min(160, bold.widthOfTextAtSize(txt, 7.5) + 14)
      if (bx + bw > W - M) break
      page.drawRectangle({ x: bx, y: y - 4, width: bw, height: 16, color: soft, borderColor: accent, borderWidth: 0.7 })
      page.drawText(txt, { x: bx + 7, y: y + 1, size: 7.5, font: bold, color: primary })
      bx += bw + 6
    }
    y -= 24
  }

  for (const sec of doc.sections) {
    ensureSpace(44)
    page.drawRectangle({ x: M, y: y - 4, width: W - M * 2, height: 20, color: primary })
    page.drawText(toPdfSafeText(sec.title.toUpperCase()), { x: M + 8, y: y + 2, size: 9, font: bold, color: rgb(1, 1, 1) })
    y -= 24

    if (sec.pairs?.length) {
      const colW = (W - M * 2 - 10) / 2
      for (let i = 0; i < sec.pairs.length; i += 2) {
        const left = sec.pairs[i]!
        const right = sec.pairs[i + 1]
        const lValLines = wrapPdf(left[1] || '—', font, 8.5, colW - 12).slice(0, 3)
        const rValLines = right ? wrapPdf(right[1] || '—', font, 8.5, colW - 12).slice(0, 3) : []
        const rowH = Math.max(26, Math.max(lValLines.length, rValLines.length) * 11 + 15)
        ensureSpace(rowH + 4)

        page.drawRectangle({ x: M, y: y - rowH + 12, width: colW, height: rowH, color: soft })
        page.drawText(toPdfSafeText(left[0]).slice(0, 40), { x: M + 6, y: y + 1, size: 7, font: bold, color: muted })
        let ly = y - 10
        for (const vl of lValLines) {
          page.drawText(vl, { x: M + 6, y: ly, size: 8.5, font, color: ink })
          ly -= 11
        }
        if (right) {
          const rx = M + colW + 10
          page.drawRectangle({ x: rx, y: y - rowH + 12, width: colW, height: rowH, color: soft })
          page.drawText(toPdfSafeText(right[0]).slice(0, 40), { x: rx + 6, y: y + 1, size: 7, font: bold, color: muted })
          let ry = y - 10
          for (const vr of rValLines) {
            page.drawText(vr, { x: rx + 6, y: ry, size: 8.5, font, color: ink })
            ry -= 11
          }
        }
        y -= rowH + 4
      }
    }

    if (sec.table && sec.table.headers.length > 0) {
      const cols = sec.table.headers.length
      const cw = (W - M * 2) / cols
      ensureSpace(26)
      page.drawRectangle({ x: M, y: y - 4, width: W - M * 2, height: 18, color: rgb(0.91, 0.93, 0.92) })
      sec.table.headers.forEach((h, ci) => {
        page.drawText(toPdfSafeText(h).slice(0, Math.max(10, Math.floor(cw / 5.2))), {
          x: M + ci * cw + 4,
          y: y + 1,
          size: 7.5,
          font: bold,
          color: primary,
        })
      })
      y -= 20
      for (let ri = 0; ri < sec.table.rows.length; ri++) {
        const row = sec.table.rows[ri]!
        ensureSpace(20)
        if (ri % 2 === 1) page.drawRectangle({ x: M, y: y - 4, width: W - M * 2, height: 16, color: soft })
        row.forEach((cell, ci) => {
          page.drawText(toPdfSafeText(cell || '—').slice(0, Math.max(12, Math.floor(cw / 4.8))), {
            x: M + ci * cw + 4,
            y: y,
            size: 7.5,
            font,
            color: ink,
          })
        })
        y -= 17
      }
      y -= 6
    }

    if (sec.bullets?.length) {
      for (const b of sec.bullets) {
        const lines = wrapPdf(`* ${b}`, font, 8.5, W - M * 2 - 12).slice(0, 3)
        ensureSpace(lines.length * 12 + 4)
        for (const l of lines) {
          page.drawText(l, { x: M + 6, y, size: 8.5, font, color: ink })
          y -= 12
        }
      }
      y -= 4
    }

    if (sec.note) {
      const lines = wrapPdf(sec.note, font, 8.5, W - M * 2 - 12).slice(0, 12)
      ensureSpace(lines.length * 12 + 8)
      for (const l of lines) {
        page.drawText(l, { x: M + 6, y, size: 8.5, font, color: ink })
        y -= 12
      }
      y -= 6
    }
    y -= 6
  }

  const pages = pdf.getPages()
  pages.forEach((p, idx) => drawPdfFooter(p, font, bold, idx + 1, pages.length))
  return Buffer.from(await pdf.save())
}

export async function buildStructuredForensicDocx(doc: StructuredForensicDoc): Promise<Buffer> {
  const children: any[] = [
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: doc.eyebrow.toUpperCase(), bold: true, size: 18, color: 'C8A253' }),
        new TextRun({ text: `   |   REF: ${doc.refNo}   |   ${doc.generatedAt || fmtDateNow()}`, size: 18, color: '5B6778' }),
      ],
    }),
    new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: doc.title, bold: true, size: 32, color: '0E3A2F' })],
    }),
  ]
  if (doc.subtitle) {
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: doc.subtitle, size: 20, color: '4A5568' })],
      }),
    )
  }
  if (doc.badges?.length) {
    children.push(
      new Paragraph({
        spacing: { after: 140 },
        children: [new TextRun({ text: doc.badges.join('  •  '), bold: true, size: 18, color: '0E3A2F' })],
      }),
    )
  }

  for (const sec of doc.sections) {
    children.push(
      new Paragraph({
        spacing: { before: 180, after: 80 },
        border: { bottom: { color: 'C8A253', size: 6, style: BorderStyle.SINGLE, space: 4 } },
        children: [new TextRun({ text: sec.title.toUpperCase(), bold: true, size: 22, color: '0E3A2F' })],
      }),
    )

    if (sec.pairs?.length) {
      const rows = sec.pairs.map(
        ([k, v]) =>
          new TableRow({
            children: [
              new TableCell({
                width: { size: 32, type: WidthType.PERCENTAGE },
                children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, size: 18, color: '334155' })] })],
              }),
              new TableCell({
                width: { size: 68, type: WidthType.PERCENTAGE },
                children: [new Paragraph({ children: [new TextRun({ text: v || '—', size: 18, color: '111827' })] })],
              }),
            ],
          }),
      )
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }))
    }

    if (sec.table && sec.table.headers.length > 0) {
      const headerRow = new TableRow({
        tableHeader: true,
        children: sec.table.headers.map(
          h =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 17, color: '0E3A2F' })] })],
            }),
        ),
      })
      const dataRows = sec.table.rows.map(
        r =>
          new TableRow({
            children: r.map(
              c =>
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: c || '—', size: 17 })] })],
                }),
            ),
          }),
      )
      children.push(
        new Paragraph({ spacing: { before: 80, after: 40 }, children: [] }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...dataRows] }),
      )
    }

    if (sec.bullets?.length) {
      for (const b of sec.bullets) {
        children.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: `• ${b}`, size: 18 })],
          }),
        )
      }
    }
    if (sec.note) {
      children.push(
        new Paragraph({
          spacing: { before: 60, after: 80 },
          children: [new TextRun({ text: sec.note, size: 18 })],
        }),
      )
    }
  }

  const footerMeta = corporateFooterDetails(publicSettings())
  const document = new Document({
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: `${SWK_COMPANY_NAME}  |  RERA ORN ${SWK_RERA_ORN}`, size: 16, color: '64748B' })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `${footerMeta.name} | ${footerMeta.address} | ${footerMeta.phone} | ${footerMeta.website}`,
                    size: 15,
                    color: '64748B',
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  })
  return Buffer.from(await Packer.toBuffer(document))
}

function wrapCanvasLines(ctx: any, text: string, maxW: number): string[] {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (!words.length) return ['']
  const out: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width <= maxW) line = test
    else {
      if (line) out.push(line)
      line = w
    }
  }
  if (line) out.push(line)
  return out
}

export async function buildStructuredForensicJpeg(doc: StructuredForensicDoc): Promise<Buffer> {
  const lines: Array<{ kind: 'sec' | 'pair' | 'row' | 'text'; text: string; sub?: string }> = []
  for (const sec of doc.sections) {
    lines.push({ kind: 'sec', text: sec.title.toUpperCase() })
    for (const [k, v] of sec.pairs || []) {
      lines.push({ kind: 'pair', text: k, sub: v || '—' })
    }
    if (sec.table && sec.table.headers.length) {
      lines.push({ kind: 'row', text: sec.table.headers.join('  |  ') })
      for (const r of sec.table.rows) lines.push({ kind: 'text', text: r.map(c => c || '—').join('  |  ') })
    }
    for (const b of sec.bullets || []) lines.push({ kind: 'text', text: `• ${b}` })
    if (sec.note) lines.push({ kind: 'text', text: sec.note })
  }

  const W = 1240
  const PAD = 60
  const lineH = 30

  // Measure true height before creating final canvas so no lines or long notes get clipped
  const measureCanvas = createCanvas(W, 120)
  const mctx = measureCanvas.getContext('2d')
  let measuredH = 262 + (doc.badges?.length ? 40 : 0)
  const prewrapped: Array<
    | { kind: 'sec'; text: string }
    | { kind: 'pair'; label: string; valLines: string[] }
    | { kind: 'row'; text: string }
    | { kind: 'text'; textLines: string[] }
  > = []

  for (const item of lines) {
    if (item.kind === 'sec') {
      prewrapped.push({ kind: 'sec', text: item.text })
      measuredH += 44
    } else if (item.kind === 'pair') {
      mctx.font = '18px sans-serif'
      const valLines = wrapCanvasLines(mctx, String(item.sub || '—'), W - PAD * 2 - 345)
      prewrapped.push({ kind: 'pair', label: item.text, valLines })
      measuredH += Math.max(38, valLines.length * 26 + 14)
    } else if (item.kind === 'row') {
      prewrapped.push({ kind: 'row', text: item.text })
      measuredH += 36
    } else {
      mctx.font = '18px sans-serif'
      const textLines: string[] = []
      for (const para of String(item.text || '').split(/\r?\n/)) {
        const t = para.trim()
        if (!t) continue
        textLines.push(...wrapCanvasLines(mctx, t, W - PAD * 2 - 20))
      }
      prewrapped.push({ kind: 'text', textLines: textLines.length ? textLines : ['—'] })
      measuredH += Math.max(1, textLines.length) * lineH + 10
    }
  }

  const estH = Math.min(1754 * 8, Math.max(1754, measuredH + 150))
  const canvas = createCanvas(W, estH)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, W, estH)

  // Header banner
  ctx.fillStyle = '#0E3A2F'
  ctx.fillRect(0, 0, W, 210)
  ctx.fillStyle = '#C8A253'
  ctx.fillRect(0, 210, W, 8)

  ctx.fillStyle = '#C8A253'
  ctx.font = 'bold 20px sans-serif'
  ctx.fillText(doc.eyebrow.toUpperCase(), PAD, 58)

  ctx.fillStyle = '#D8E3DF'
  ctx.font = 'bold 18px sans-serif'
  const refTxt = `REF: ${doc.refNo}  •  ${doc.generatedAt || fmtDateNow()}`
  ctx.fillText(refTxt, W - PAD - ctx.measureText(refTxt).width, 58)

  ctx.fillStyle = '#FFFFFF'
  ctx.font = 'bold 36px sans-serif'
  const titleLines = wrapCanvasLines(ctx, doc.title, W - PAD * 2).slice(0, 2)
  let y = 112
  for (const tl of titleLines) {
    ctx.fillText(tl, PAD, y)
    y += 44
  }
  if (doc.subtitle) {
    ctx.fillStyle = '#D1DDD9'
    ctx.font = '20px sans-serif'
    ctx.fillText(doc.subtitle.slice(0, 105), PAD, 188)
  }

  y = 262
  if (doc.badges?.length) {
    ctx.font = 'bold 18px sans-serif'
    ctx.fillStyle = '#0E3A2F'
    ctx.fillText(doc.badges.join('   •   ').slice(0, 110), PAD, y)
    y += 40
  }

  for (const item of prewrapped) {
    if (y > estH - 130) break
    if (item.kind === 'sec') {
      y += 10
      ctx.fillStyle = '#0E3A2F'
      ctx.fillRect(PAD, y - 26, W - PAD * 2, 38)
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 19px sans-serif'
      ctx.fillText(item.text, PAD + 14, y)
      y += 30
    } else if (item.kind === 'pair') {
      const boxH = Math.max(34, item.valLines.length * 26 + 10)
      ctx.fillStyle = '#F8F9FA'
      ctx.fillRect(PAD, y - 22, W - PAD * 2, boxH)
      ctx.fillStyle = '#475569'
      ctx.font = 'bold 17px sans-serif'
      ctx.fillText(`${item.label}:`, PAD + 12, y)
      ctx.fillStyle = '#111827'
      ctx.font = '18px sans-serif'
      item.valLines.forEach((vl, vi) => {
        if (y + vi * 26 <= estH - 130) ctx.fillText(vl, PAD + 330, y + vi * 26)
      })
      y += boxH + 4
    } else if (item.kind === 'row') {
      ctx.fillStyle = '#E8EFEA'
      ctx.fillRect(PAD, y - 22, W - PAD * 2, 32)
      ctx.fillStyle = '#0E3A2F'
      ctx.font = 'bold 16px sans-serif'
      ctx.fillText(item.text.slice(0, 115), PAD + 10, y)
      y += 34
    } else {
      ctx.fillStyle = '#1F2937'
      ctx.font = '18px sans-serif'
      for (const wl of item.textLines) {
        if (y > estH - 130) break
        ctx.fillText(wl, PAD + 10, y)
        y += lineH
      }
      y += 6
    }
  }

  // Corporate Footer
  ctx.fillStyle = '#C8A253'
  ctx.fillRect(PAD, estH - 96, W - PAD * 2, 2)
  ctx.fillStyle = '#0E3A2F'
  ctx.font = 'bold 18px sans-serif'
  ctx.fillText(`${SWK_COMPANY_NAME}  |  RERA ORN ${SWK_RERA_ORN}  |  DET Licence ${SWK_TRADE_LICENSE}`, PAD, estH - 64)
  ctx.fillStyle = '#475569'
  ctx.font = '16px sans-serif'
  ctx.fillText(`${SWK_COMPANY_ADDRESS}  |  ${SWK_COMPANY_PHONE}  |  ${SWK_OFFICIAL_WEBSITES_TEXT}`, PAD, estH - 36)

  return canvas.toBuffer('image/jpeg', 90)
}

export async function exportStructuredDossier(
  doc: StructuredForensicDoc,
  format: ForensicExportFormat,
): Promise<{ buffer: Buffer; mime: string; ext: string }> {
  if (format === 'docx') {
    return {
      buffer: await buildStructuredForensicDocx(doc),
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ext: 'docx',
    }
  }
  if (format === 'jpeg') {
    return {
      buffer: await buildStructuredForensicJpeg(doc),
      mime: 'image/jpeg',
      ext: 'jpg',
    }
  }
  return {
    buffer: await buildStructuredForensicPdf(doc),
    mime: 'application/pdf',
    ext: 'pdf',
  }
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n) => {
      const code = Number(n)
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : ''
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => {
      const code = parseInt(hex, 16)
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : ''
    })
}

type WordBlock =
  | { kind: 'h1' | 'h2' | 'h3'; text: string }
  | { kind: 'table_row'; cells: string[]; header: boolean }
  | { kind: 'bullet'; text: string }
  | { kind: 'para'; text: string }
  | { kind: 'rule' }

function parseWordHtmlBlocks(rawHtml: string): WordBlock[] {
  const cleaned = String(rawHtml || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
  const blocks: WordBlock[] = []

  // First extract block-level elements in document order
  const tokenRe = /<(h[1-3]|tr|li|p|div|hr)\b[^>]*>([\s\S]*?)<\/\1>|<hr\b[^>]*\/?>/gi
  const stripInline = (s: string) =>
    decodeHtmlEntities(s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
      .replace(/[ \t]+/g, ' ')
      .trim()

  let matchedAny = false
  let m: RegExpExecArray | null
  while ((m = tokenRe.exec(cleaned)) !== null) {
    matchedAny = true
    const tag = (m[1] || 'hr').toLowerCase()
    const inner = m[2] || ''
    if (tag === 'hr') {
      blocks.push({ kind: 'rule' })
      continue
    }
    // Skip wrapper <div> elements that contain nested block tags so we don't duplicate child blocks
    if (tag === 'div' && /<(h[1-3]|tr|li|p|table|ul|ol|div)\b/i.test(inner)) {
      const innerBlocks = parseWordHtmlBlocks(inner)
      blocks.push(...innerBlocks)
      continue
    }
    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      const t = stripInline(inner).replace(/\n+/g, ' ')
      if (t) blocks.push({ kind: tag, text: t })
      continue
    }
    if (tag === 'tr') {
      const cells: string[] = []
      let isHeader = false
      const cellRe = /<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi
      let cm: RegExpExecArray | null
      while ((cm = cellRe.exec(inner)) !== null) {
        if (cm[1]!.toLowerCase() === 'th') isHeader = true
        cells.push(stripInline(cm[2] || '').replace(/\n+/g, ' '))
      }
      if (cells.some(Boolean)) blocks.push({ kind: 'table_row', cells, header: isHeader })
      continue
    }
    if (tag === 'li') {
      const t = stripInline(inner).replace(/\n+/g, ' ')
      if (t) blocks.push({ kind: 'bullet', text: t })
      continue
    }
    // p or leaf div
    const txt = stripInline(inner)
    for (const ln of txt.split(/\r?\n/)) {
      const s = ln.trim()
      if (s) blocks.push({ kind: 'para', text: s })
    }
  }

  if (!matchedAny) {
    const fallback = htmlToText(rawHtml || '')
    for (const ln of fallback.split(/\r?\n/)) {
      const s = ln.trim()
      if (s) blocks.push({ kind: 'para', text: s })
    }
  }
  return blocks
}

/**
 * Multi-page A4 JPEG renderer for Word Studio & Legal Forms (A2A, LOI, Tenancy, Ejari, NOC, Agreements).
 * Preserves HTML headings, tables, bullet lists, and paragraphs, and paginates dynamically by true pixel height
 * (up to 8 vertical A4 pages @ 1240x1754) so zero lines are dropped.
 */
export async function renderWordHtmlToJpegBuffer(opts: {
  title: string
  html_content: string
  rtl?: boolean
  include_letterhead?: boolean
  include_seal?: boolean
  include_signature?: boolean
}): Promise<Buffer> {
  const blocks = parseWordHtmlBlocks(opts.html_content || '')
  if (!blocks.length) blocks.push({ kind: 'para', text: opts.title || 'SWK Document' })

  const W = 1240
  const PAGE_H = 1754
  const PAD = 74
  const CONTENT_W = W - PAD * 2

  const scratch = createCanvas(W, 120)
  const sctx = scratch.getContext('2d')

  type DrawOp =
    | { kind: 'heading'; text: string; font: string; height: number; topGap: number }
    | { kind: 'table_row'; cells: string[]; header: boolean; linesPerCell: string[][]; height: number }
    | { kind: 'line'; text: string; font: string; indent: number; height: number; color: string }
    | { kind: 'rule'; height: number }
    | { kind: 'spacer'; height: number }

  const ops: DrawOp[] = []
  for (const b of blocks) {
    if (b.kind === 'rule') {
      ops.push({ kind: 'rule', height: 22 })
    } else if (b.kind === 'h1' || b.kind === 'h2' || b.kind === 'h3') {
      const font = b.kind === 'h1' ? 'bold 26px sans-serif' : b.kind === 'h2' ? 'bold 23px sans-serif' : 'bold 20px sans-serif'
      const lh = b.kind === 'h1' ? 36 : b.kind === 'h2' ? 32 : 28
      sctx.font = font
      const ls = wrapCanvasLines(sctx, b.text, CONTENT_W)
      ls.forEach((l, i) => ops.push({ kind: 'heading', text: l, font, height: lh, topGap: i === 0 ? 12 : 0 }))
      ops.push({ kind: 'spacer', height: 6 })
    } else if (b.kind === 'table_row') {
      const colCount = Math.max(1, Math.min(6, b.cells.length))
      const colW = Math.floor((CONTENT_W - 16) / colCount) - 14
      sctx.font = b.header ? 'bold 18px sans-serif' : '18px sans-serif'
      const linesPerCell = b.cells.slice(0, colCount).map(c => wrapCanvasLines(sctx, c || '—', Math.max(80, colW)))
      const maxLines = Math.max(1, ...linesPerCell.map(l => l.length))
      ops.push({ kind: 'table_row', cells: b.cells.slice(0, colCount), header: b.header, linesPerCell, height: maxLines * 25 + 16 })
    } else if (b.kind === 'bullet') {
      sctx.font = '20px sans-serif'
      const ls = wrapCanvasLines(sctx, `•  ${b.text}`, CONTENT_W - 18)
      for (const l of ls) ops.push({ kind: 'line', text: l, font: '20px sans-serif', indent: 14, height: 29, color: '#1E293B' })
      ops.push({ kind: 'spacer', height: 4 })
    } else {
      sctx.font = '20px sans-serif'
      const ls = wrapCanvasLines(sctx, b.text, CONTENT_W)
      for (const l of ls) ops.push({ kind: 'line', text: l, font: '20px sans-serif', indent: 0, height: 29, color: '#1E293B' })
      ops.push({ kind: 'spacer', height: 8 })
    }
  }

  // Dynamic cursor-based pagination (zero dropped lines, up to 8 vertical A4 pages)
  sctx.font = 'bold 30px sans-serif'
  const titleLines = wrapCanvasLines(sctx, opts.title || 'SWK Properties Document', CONTENT_W).slice(0, 2)
  const firstPageStart = (opts.include_letterhead !== false ? 218 : 72) + titleLines.length * 40 + 28
  const nextPageStart = opts.include_letterhead !== false ? 124 : 72
  const bottomLimit = (isLastCandidate: boolean) => PAGE_H - (isLastCandidate && (opts.include_seal || opts.include_signature) ? 265 : 135)

  const pages: DrawOp[][] = [[]]
  let curY = firstPageStart
  for (const op of ops) {
    const needH = op.height + (op.kind === 'heading' ? op.topGap : 0)
    if (curY + needH > PAGE_H - 135 && pages[pages.length - 1]!.length > 0) {
      if (pages.length >= 8) break
      pages.push([])
      curY = nextPageStart
    }
    pages[pages.length - 1]!.push(op)
    curY += needH
  }
  // Ensure seal/signature fits cleanly on final page without colliding with last paragraph
  if ((opts.include_seal || opts.include_signature) && curY > bottomLimit(true) && pages.length < 8) {
    pages.push([])
  }

  const totalPages = Math.max(1, pages.length)
  const totalH = PAGE_H * totalPages
  const canvas = createCanvas(W, totalH)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, W, totalH)

  const settings = publicSettings(true)
  const footerMeta = corporateFooterDetails(settings)

  for (let p = 0; p < totalPages; p++) {
    const topY = p * PAGE_H
    if (p > 0) {
      ctx.fillStyle = '#CBD5E1'
      ctx.fillRect(0, topY, W, 2)
    }

    let y = topY + 72
    if (opts.include_letterhead !== false) {
      ctx.fillStyle = '#0E3A2F'
      ctx.fillRect(0, topY, W, p === 0 ? 156 : 74)
      ctx.fillStyle = '#C8A253'
      ctx.fillRect(0, topY + (p === 0 ? 156 : 74), W, 6)
      ctx.fillStyle = '#FFFFFF'
      ctx.font = p === 0 ? 'bold 30px sans-serif' : 'bold 20px sans-serif'
      ctx.fillText(SWK_COMPANY_NAME, PAD, topY + (p === 0 ? 58 : 44))
      if (p === 0) {
        ctx.fillStyle = '#C8A253'
        ctx.font = 'bold 18px sans-serif'
        ctx.fillText(`RERA ORN ${SWK_RERA_ORN}  •  DET Licence ${SWK_TRADE_LICENSE}`, PAD, topY + 94)
        ctx.fillStyle = '#D7E2DE'
        ctx.font = '16px sans-serif'
        ctx.fillText(`${SWK_COMPANY_ADDRESS}  |  ${SWK_COMPANY_PHONE}  |  ${SWK_COMPANY_EMAIL}`, PAD, topY + 126)
      }
      y = topY + (p === 0 ? 218 : 124)
    }

    if (p === 0) {
      ctx.fillStyle = '#0E3A2F'
      ctx.font = 'bold 30px sans-serif'
      for (const tl of titleLines) {
        ctx.fillText(tl, PAD, y)
        y += 40
      }
      ctx.fillStyle = '#C8A253'
      ctx.fillRect(PAD, y - 14, 180, 3)
      y += 28
    }

    for (const op of pages[p]!) {
      if (op.kind === 'spacer') {
        y += op.height
      } else if (op.kind === 'rule') {
        ctx.fillStyle = '#CBD5E1'
        ctx.fillRect(PAD, y - 8, CONTENT_W, 2)
        y += op.height
      } else if (op.kind === 'heading') {
        y += op.topGap
        ctx.fillStyle = '#0E3A2F'
        ctx.font = op.font
        if (opts.rtl) {
          const tw = ctx.measureText(op.text).width
          ctx.fillText(op.text, Math.max(PAD, W - PAD - tw), y)
        } else {
          ctx.fillText(op.text, PAD, y)
        }
        y += op.height
      } else if (op.kind === 'table_row') {
        const colCount = op.linesPerCell.length
        const colW = Math.floor(CONTENT_W / colCount)
        ctx.fillStyle = op.header ? '#0E3A2F' : '#F8FAFC'
        ctx.fillRect(PAD, y - 20, CONTENT_W, op.height)
        ctx.strokeStyle = '#CBD5E1'
        ctx.lineWidth = 1
        ctx.strokeRect(PAD, y - 20, CONTENT_W, op.height)
        ctx.font = op.header ? 'bold 18px sans-serif' : '18px sans-serif'
        ctx.fillStyle = op.header ? '#FFFFFF' : '#1E293B'
        op.linesPerCell.forEach((cellLines, ci) => {
          const cx = PAD + ci * colW + 10
          if (ci > 0) {
            ctx.beginPath()
            ctx.moveTo(PAD + ci * colW, y - 20)
            ctx.lineTo(PAD + ci * colW, y - 20 + op.height)
            ctx.stroke()
          }
          cellLines.forEach((cl, li) => {
            ctx.fillText(cl, cx, y + 2 + li * 25)
          })
        })
        y += op.height + 2
      } else {
        ctx.fillStyle = op.color
        ctx.font = op.font
        if (opts.rtl) {
          const tw = ctx.measureText(op.text).width
          ctx.fillText(op.text, Math.max(PAD, W - PAD - op.indent - tw), y)
        } else {
          ctx.fillText(op.text, PAD + op.indent, y)
        }
        y += op.height
      }
    }

    // Optional authorized seal & signature on final page
    if (p === totalPages - 1 && (opts.include_seal || opts.include_signature)) {
      let sx = PAD
      const sy = topY + PAGE_H - 245
      for (const [enabled, key, w, h] of [
        [opts.include_signature, 'document_signature', 180, 72],
        [opts.include_seal, 'document_seal', 110, 110],
      ] as const) {
        if (!enabled) continue
        const raw = String(settings[key] || '')
        const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(raw)
        if (!m) continue
        try {
          const img = await loadImage(Buffer.from(m[2]!, 'base64'))
          ctx.drawImage(img, sx, sy, w, h)
          sx += w + 28
        } catch {
          /* ignore malformed stamp data */
        }
      }
    }

    // Corporate Footer per page
    ctx.fillStyle = '#C8A253'
    ctx.fillRect(PAD, topY + PAGE_H - 96, W - PAD * 2, 2)
    ctx.fillStyle = '#0E3A2F'
    ctx.font = 'bold 16px sans-serif'
    ctx.fillText(`${footerMeta.name} | RERA ORN ${SWK_RERA_ORN}`, PAD, topY + PAGE_H - 64)
    ctx.fillStyle = '#475569'
    ctx.font = '15px sans-serif'
    ctx.fillText(`${footerMeta.address} | ${footerMeta.phone} | ${footerMeta.website}`, PAD, topY + PAGE_H - 36)
    const pgTxt = `Page ${p + 1} of ${totalPages}`
    ctx.fillText(pgTxt, W - PAD - ctx.measureText(pgTxt).width, topY + PAGE_H - 64)
  }

  return canvas.toBuffer('image/jpeg', 90)
}
