/**
 * Zero-Dependency Multi-Sheet OOXML Microsoft Excel (.xlsx) Builder
 *
 * Produces valid Office Open XML SpreadsheetML (.xlsx) workbooks compatible with
 * Microsoft Excel, Apple Numbers, LibreOffice Calc, and Google Sheets.
 *
 * Features:
 *  - Glossy SWK Obsidian Black (#0A0B0E) header row with Imperial Gold (#EBC97C) bold text
 *  - Alternating crisp pearl data rows (#FAF9F6) with hairline borders
 *  - Frozen top header row + AutoFilter on every worksheet
 *  - Auto-fitted column widths
 *  - Native numeric & inline string cells with formula-injection protection
 */
import zlib from 'node:zlib'

export interface XlsxSheetSpec {
  name: string
  headers: string[]
  rows: Array<Array<string | number | boolean | null | undefined>>
}

const xmlEsc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')

/** Neutralize Excel formula injection on untrusted text values while keeping cells under Excel's 32,767-char limit. */
function safeExcelText(raw: string): string {
  const clean = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
  const clipped = clean.length > 32000 ? clean.slice(0, 32000) : clean
  if (/^[=+\-@\t\r\n]/.test(clipped)) return `'${clipped}`
  return clipped
}

/** Convert 0-based column index to Excel column letters (0 -> A, 25 -> Z, 26 -> AA). */
function colLetters(idx: number): string {
  let n = idx + 1
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

/** Sanitize and deduplicate worksheet names to Excel's 31-char limit. */
function sanitizeSheetNames(sheets: XlsxSheetSpec[]): string[] {
  const used = new Set<string>()
  return sheets.map((sh, i) => {
    let base = String(sh.name || `Sheet_${i + 1}`)
      .replace(/[\[\]:*?/\\']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 31)
    if (!base) base = `Sheet_${i + 1}`
    let cand = base
    let n = 2
    while (used.has(cand.toLowerCase())) {
      const suffix = `_${n++}`
      cand = base.slice(0, Math.max(1, 31 - suffix.length)) + suffix
    }
    used.add(cand.toLowerCase())
    return cand
  })
}

function buildWorksheetXml(sheet: XlsxSheetSpec): string {
  const headers = sheet.headers.length ? sheet.headers : ['Info']
  const colCount = headers.length
  const widths = headers.map(h => Math.min(48, Math.max(12, String(h).length + 4)))

  for (const row of sheet.rows.slice(0, 500)) {
    for (let c = 0; c < colCount; c++) {
      const len = String(row[c] ?? '').length
      if (len + 3 > widths[c]!) widths[c] = Math.min(52, len + 3)
    }
  }

  const colsXml = `<cols>${widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w.toFixed(1)}" customWidth="1"/>`)
    .join('')}</cols>`

  const lastCol = colLetters(colCount - 1)
  const lastRow = Math.max(1, sheet.rows.length + 1)

  const rowXmlParts: string[] = []
  // Row 1: Styled Header Row (style s="1")
  const headerCells = headers
    .map((h, c) => `<c r="${colLetters(c)}1" t="inlineStr" s="1"><is><t>${xmlEsc(safeExcelText(String(h)))}</t></is></c>`)
    .join('')
  rowXmlParts.push(`<row r="1" ht="24" customHeight="1">${headerCells}</row>`)

  // Data Rows (style s="2" standard / s="3" zebra / s="4" numeric / s="5" numeric zebra)
  for (let r = 0; r < sheet.rows.length; r++) {
    const rowNum = r + 2
    const row = sheet.rows[r]!
    const zebra = r % 2 === 1
    const cells: string[] = []
    for (let c = 0; c < colCount; c++) {
      const val = row[c]
      const ref = `${colLetters(c)}${rowNum}`
      if (val === null || val === undefined || val === '') {
        cells.push(`<c r="${ref}" s="${zebra ? 3 : 2}"/>`)
      } else if (typeof val === 'number' && Number.isFinite(val)) {
        cells.push(`<c r="${ref}" t="n" s="${zebra ? 5 : 4}"><v>${val}</v></c>`)
      } else if (typeof val === 'boolean') {
        cells.push(`<c r="${ref}" t="inlineStr" s="${zebra ? 3 : 2}"><is><t>${val ? 'Yes' : 'No'}</t></is></c>`)
      } else {
        const text = safeExcelText(String(val))
        cells.push(`<c r="${ref}" t="inlineStr" s="${zebra ? 3 : 2}"><is><t>${xmlEsc(text)}</t></is></c>`)
      }
    }
    rowXmlParts.push(`<row r="${rowNum}" ht="19">${cells.join('')}</row>`)
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="19"/>
  ${colsXml}
  <sheetData>${rowXmlParts.join('')}</sheetData>
  <autoFilter ref="A1:${lastCol}${lastRow}"/>
</worksheet>`
}

function buildStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="#,##0.##"/>
  </numFmts>
  <fonts count="2">
    <font><sz val="10"/><color rgb="FF0A0B0E"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FFEBC97C"/><name val="Calibri"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0A0B0E"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFAF8F3"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFE5E7EB"/></left>
      <right style="thin"><color rgb="FFE5E7EB"/></right>
      <top style="thin"><color rgb="FFE5E7EB"/></top>
      <bottom style="thin"><color rgb="FFE5E7EB"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="6">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="0"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
  </cellXfs>
</styleSheet>`
}

// IEEE 802.3 CRC32 table for pure Node ZIP packaging
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    t[i] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function createZip(entries: Array<{ name: string; content: string | Buffer }>): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8')
    const data = Buffer.isBuffer(e.content) ? e.content : Buffer.from(e.content, 'utf8')
    const compressed = zlib.deflateRawSync(data, { level: 6 })
    const crc = crc32(data)

    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4)
    lh.writeUInt16LE(0, 6)
    lh.writeUInt16LE(8, 8) // deflate
    lh.writeUInt16LE(0, 10)
    lh.writeUInt16LE(0x0021, 12)
    lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(compressed.length, 18)
    lh.writeUInt32LE(data.length, 22)
    lh.writeUInt16LE(nameBuf.length, 26)
    lh.writeUInt16LE(0, 28)

    localParts.push(lh, nameBuf, compressed)

    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)
    ch.writeUInt16LE(20, 4)
    ch.writeUInt16LE(20, 6)
    ch.writeUInt16LE(0, 8)
    ch.writeUInt16LE(8, 10)
    ch.writeUInt16LE(0, 12)
    ch.writeUInt16LE(0x0021, 14)
    ch.writeUInt32LE(crc, 16)
    ch.writeUInt32LE(compressed.length, 20)
    ch.writeUInt32LE(data.length, 24)
    ch.writeUInt16LE(nameBuf.length, 28)
    ch.writeUInt16LE(0, 30)
    ch.writeUInt16LE(0, 32)
    ch.writeUInt16LE(0, 34)
    ch.writeUInt16LE(0, 36)
    ch.writeUInt32LE(0, 38)
    ch.writeUInt32LE(offset, 42)

    centralParts.push(ch, nameBuf)
    offset += lh.length + nameBuf.length + compressed.length
  }

  const centralBuf = Buffer.concat(centralParts)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...localParts, centralBuf, eocd])
}

export function buildXlsxBuffer(sheets: XlsxSheetSpec[]): Buffer {
  const safeSheets = sheets.length ? sheets : [{ name: 'Summary', headers: ['Status'], rows: [['Empty']] }]
  const names = sanitizeSheetNames(safeSheets)

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${safeSheets
    .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join('\n  ')}
</Types>`

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${names.map((nm, i) => `<sheet name="${xmlEsc(nm)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('\n    ')}
  </sheets>
</workbook>`

  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${safeSheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join('\n  ')}
  <Relationship Id="rId${safeSheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

  const files: Array<{ name: string; content: string }> = [
    { name: '[Content_Types].xml', content: contentTypes },
    { name: '_rels/.rels', content: rootRels },
    { name: 'xl/workbook.xml', content: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', content: wbRels },
    { name: 'xl/styles.xml', content: buildStylesXml() },
  ]

  safeSheets.forEach((sh, i) => {
    files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, content: buildWorksheetXml(sh) })
  })

  return createZip(files)
}
