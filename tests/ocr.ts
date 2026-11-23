/** OCR self-check: an image, a text PDF and a scanned PDF are read and mapped to a lead. Run: npm run test:ocr */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createCanvas } from '@napi-rs/canvas'
import { PDFDocument,StandardFonts } from 'pdf-lib'
process.env.DATA_DIR ??= fs.mkdtempSync(path.join(os.tmpdir(), 'swk-ocr-'))
const { extractText,mapByRules } = await import('../src/server/ocr')
const { ENTITIES } = await import('../src/shared/entities')

const c = createCanvas(1000, 420), g = c.getContext('2d')
g.fillStyle = '#fff'; g.fillRect(0, 0, 1000, 420); g.fillStyle = '#000'; g.font = '34px sans-serif'
;['Company: Al Noor Trading LLC', 'Email: info@alnoor.ae', 'Phone: +971 50 123 4567', 'Estimated value: AED 2,450,000'].forEach((t, i) => g.fillText(t, 40, 70 + i * 80))
const png = c.toBuffer('image/png')

const img = await extractText(png, 'card.png', 'image/png')
assert.match(img.text, /Al Noor Trading/); assert.equal(img.method, 'ocr')
const lead = mapByRules(img.text, ENTITIES.leads!)
assert.equal(lead.email, 'info@alnoor.ae'); assert.equal(lead.est_value, 2450000); assert.match(String(lead.company), /Al Noor/)

const pdf = await PDFDocument.create(); const f = await pdf.embedFont(StandardFonts.Helvetica)
pdf.addPage().drawText('Tenant name: John Smith\nAnnual rent: AED 95,000', { x: 50, y: 700, size: 14, font: f, lineHeight: 20 })
const t = await extractText(Buffer.from(await pdf.save()), 'lease.pdf', 'application/pdf')
assert.equal(t.method, 'text'); assert.match(t.text, /John Smith/)

const scan = await PDFDocument.create(); const im = await scan.embedPng(png); scan.addPage([1000, 420]).drawImage(im, { x: 0, y: 0, width: 1000, height: 420 })
const s = await extractText(Buffer.from(await scan.save()), 'scan.pdf', 'application/pdf')
assert.equal(s.method, 'ocr'); assert.match(s.text, /info@alnoor\.ae/)
console.log('OCR passed: image, text PDF and scanned PDF read; fields mapped to a lead.')
process.exit(0)
