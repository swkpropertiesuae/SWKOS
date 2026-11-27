import zlib from 'node:zlib'

export interface PptxSlideSpec {
  eyebrow: string
  title: string
  subtitle?: string
  bullets?: string[]
  metrics?: { label: string; value: string }[]
  columns?: { heading: string; items: string[] }[]
  footer: string
  dark?: boolean
}

const xmlEsc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')

function textShape(opts: {
  id: number
  name: string
  x: number
  y: number
  cx: number
  cy: number
  paragraphs: { text: string; sizePt?: number; bold?: boolean; color?: string; align?: 'l' | 'ctr' | 'r'; spaceAfterPt?: number }[]
  fill?: string
  border?: string
}): string {
  const fillXml = opts.fill ? `<a:solidFill><a:srgbClr val="${opts.fill}"/></a:solidFill>` : `<a:noFill/>`
  const lineXml = opts.border
    ? `<a:ln w="12700"><a:solidFill><a:srgbClr val="${opts.border}"/></a:solidFill></a:ln>`
    : `<a:ln><a:noFill/></a:ln>`
  const pXml = opts.paragraphs
    .map(p => {
      const sz = Math.round((p.sizePt ?? 14) * 100)
      const col = p.color ?? '1E2926'
      const b = p.bold ? ' b="1"' : ''
      const algn = p.align ? ` algn="${p.align}"` : ''
      const spc = p.spaceAfterPt ? `<a:spcAft><a:spcPts val="${Math.round(p.spaceAfterPt * 100)}"/></a:spcAft>` : ''
      return `<a:p><a:pPr${algn}>${spc}</a:pPr><a:r><a:rPr lang="en-US" sz="${sz}"${b} dirty="0"><a:solidFill><a:srgbClr val="${col}"/></a:solidFill><a:latin typeface="Calibri"/></a:rPr><a:t>${xmlEsc(p.text)}</a:t></a:r></a:p>`
    })
    .join('')

  return `<p:sp>
  <p:nvSpPr><p:cNvPr id="${opts.id}" name="${xmlEsc(opts.name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
  <p:spPr>
    <a:xfrm><a:off x="${opts.x}" y="${opts.y}"/><a:ext cx="${opts.cx}" cy="${opts.cy}"/></a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
    ${fillXml}
    ${lineXml}
  </p:spPr>
  <p:txBody>
    <a:bodyPr wrap="square" lIns="127000" tIns="76200" rIns="127000" bIns="76200"/>
    <a:lstStyle/>
    ${pXml}
  </p:txBody>
</p:sp>`
}

function rectShape(id: number, name: string, x: number, y: number, cx: number, cy: number, fill: string): string {
  return `<p:sp>
  <p:nvSpPr><p:cNvPr id="${id}" name="${xmlEsc(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
  <p:spPr>
    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
    <a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>
    <a:ln><a:noFill/></a:ln>
  </p:spPr>
  <p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>
</p:sp>`
}

// 16:9 widescreen slide canvas: 12192000 x 6858000 EMU (13.333 in x 7.5 in)
function buildSlideXml(slide: PptxSlideSpec, index: number, total: number): string {
  const dark = Boolean(slide.dark)
  const bgColor = dark ? '0E3A2F' : 'F8F6F1'
  const titleColor = dark ? 'FFFFFF' : '0E3A2F'
  const subColor = dark ? 'E2D5B5' : '4A5A54'
  const bodyColor = dark ? 'F0EFEA' : '22302C'
  const gold = 'C8A253'

  const shapes: string[] = []
  let sid = 2

  // Top gold accent strip
  shapes.push(rectShape(sid++, 'TopGoldBar', 0, 0, 12192000, 95000, gold))
  // Left brand spine bar on dark slides
  if (dark) {
    shapes.push(rectShape(sid++, 'SidePanel', 0, 95000, 220000, 6763000, '092820'))
  }

  // Eyebrow + Title + Subtitle
  shapes.push(
    textShape({
      id: sid++,
      name: 'Header',
      x: 680000,
      y: dark ? 1100000 : 340000,
      cx: 10830000,
      cy: dark ? 2400000 : 1380000,
      paragraphs: [
        { text: slide.eyebrow.toUpperCase(), sizePt: 11, bold: true, color: gold, spaceAfterPt: 6 },
        { text: slide.title, sizePt: dark ? 34 : 25, bold: true, color: titleColor, spaceAfterPt: 8 },
        ...(slide.subtitle ? [{ text: slide.subtitle, sizePt: dark ? 15 : 13, color: subColor, spaceAfterPt: 4 }] : []),
      ],
    }),
  )

  let cursorY = dark ? 3600000 : 1820000

  // KPI Metric cards (up to 4 horizontally)
  if (slide.metrics?.length) {
    const mList = slide.metrics.slice(0, 4)
    const gap = 220000
    const cardW = Math.floor((10830000 - gap * (mList.length - 1)) / mList.length)
    mList.forEach((m, i) => {
      shapes.push(
        textShape({
          id: sid++,
          name: `Metric_${i + 1}`,
          x: 680000 + i * (cardW + gap),
          y: cursorY,
          cx: cardW,
          cy: 1080000,
          fill: dark ? '164A3D' : 'FFFFFF',
          border: dark ? 'C8A253' : 'DDD4C2',
          paragraphs: [
            { text: m.label.toUpperCase(), sizePt: 9.5, bold: true, color: gold, spaceAfterPt: 6 },
            { text: m.value, sizePt: 17, bold: true, color: dark ? 'FFFFFF' : '0E3A2F' },
          ],
        }),
      )
    })
    cursorY += 1280000
  }

  // Two-column layout if columns provided
  if (slide.columns?.length) {
    const cols = slide.columns.slice(0, 2)
    const gap = 320000
    const colW = Math.floor((10830000 - gap * (cols.length - 1)) / cols.length)
    const availH = Math.max(1600000, 6100000 - cursorY)
    cols.forEach((col, ci) => {
      shapes.push(
        textShape({
          id: sid++,
          name: `Col_${ci + 1}`,
          x: 680000 + ci * (colW + gap),
          y: cursorY,
          cx: colW,
          cy: availH,
          fill: dark ? '134337' : 'FFFFFF',
          border: dark ? '2A6355' : 'E4DEC9',
          paragraphs: [
            { text: col.heading, sizePt: 13.5, bold: true, color: dark ? 'E2D5B5' : '0E3A2F', spaceAfterPt: 8 },
            ...col.items.slice(0, 8).map(item => ({
              text: `•  ${item}`,
              sizePt: 11.5,
              color: bodyColor,
              spaceAfterPt: 5,
            })),
          ],
        }),
      )
    })
  } else if (slide.bullets?.length) {
    const availH = Math.max(1600000, 6100000 - cursorY)
    shapes.push(
      textShape({
        id: sid++,
        name: 'Bullets',
        x: 680000,
        y: cursorY,
        cx: 10830000,
        cy: availH,
        fill: dark ? '134337' : 'FFFFFF',
        border: dark ? '2A6355' : 'E4DEC9',
        paragraphs: slide.bullets.slice(0, 10).map(b => ({
          text: `•  ${b}`,
          sizePt: 13,
          color: bodyColor,
          spaceAfterPt: 7,
        })),
      }),
    )
  }

  // Footer band
  shapes.push(rectShape(sid++, 'FooterRule', 680000, 6280000, 10830000, 18000, dark ? 'C8A253' : 'D8CEBC'))
  shapes.push(
    textShape({
      id: sid++,
      name: 'FooterText',
      x: 680000,
      y: 6330000,
      cx: 9500000,
      cy: 360000,
      paragraphs: [{ text: slide.footer, sizePt: 9.5, color: dark ? 'D7CFC0' : '5C6B66' }],
    }),
  )
  shapes.push(
    textShape({
      id: sid++,
      name: 'SlideNum',
      x: 10200000,
      y: 6330000,
      cx: 1310000,
      cy: 360000,
      paragraphs: [{ text: `${index} / ${total}`, sizePt: 9.5, bold: true, color: gold, align: 'r' }],
    }),
  )

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="${bgColor}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${shapes.join('\n      ')}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`
}

// ------------------------------------------------------------------ Pure-TS ZIP writer (RFC 1951 deflate)
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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function createZip(entries: { name: string; content: string | Buffer }[]): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8')
    const raw = Buffer.isBuffer(e.content) ? e.content : Buffer.from(e.content, 'utf8')
    const comp = zlib.deflateRawSync(raw)
    const crc = crc32(raw)

    // Local file header (30 bytes)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4) // version needed
    lh.writeUInt16LE(0, 6) // flags
    lh.writeUInt16LE(8, 8) // method: deflate
    lh.writeUInt16LE(0, 10) // mod time
    lh.writeUInt16LE(0, 12) // mod date
    lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(comp.length, 18)
    lh.writeUInt32LE(raw.length, 22)
    lh.writeUInt16LE(nameBuf.length, 26)
    lh.writeUInt16LE(0, 28)

    localParts.push(lh, nameBuf, comp)

    // Central directory header (46 bytes)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)
    ch.writeUInt16LE(20, 4) // version made by
    ch.writeUInt16LE(20, 6) // version needed
    ch.writeUInt16LE(0, 8) // flags
    ch.writeUInt16LE(8, 10) // method: deflate
    ch.writeUInt16LE(0, 12)
    ch.writeUInt16LE(0, 14)
    ch.writeUInt32LE(crc, 16)
    ch.writeUInt32LE(comp.length, 20)
    ch.writeUInt32LE(raw.length, 24)
    ch.writeUInt16LE(nameBuf.length, 28)
    ch.writeUInt16LE(0, 30)
    ch.writeUInt16LE(0, 32)
    ch.writeUInt16LE(0, 34)
    ch.writeUInt16LE(0, 36)
    ch.writeUInt32LE(0, 38)
    ch.writeUInt32LE(offset, 42)

    centralParts.push(ch, nameBuf)
    offset += lh.length + nameBuf.length + comp.length
  }

  const centralDir = Buffer.concat(centralParts)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralDir.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...localParts, centralDir, eocd])
}

/** Build a valid 16:9 OOXML PowerPoint (.pptx) file from slide specs. */
export function buildPptxBuffer(slides: PptxSlideSpec[]): Buffer {
  const safeSlides = slides.length ? slides : [{ eyebrow: 'SWK Properties', title: 'Presentation', footer: 'SWK Properties LLC' }]
  const n = safeSlides.length

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  ${safeSlides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('\n  ')}
</Types>`

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`

  const presXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>
    ${safeSlides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('\n    ')}
  </p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000" type="screen16x9"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`

  const presRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  ${safeSlides.map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('\n  ')}
</Relationships>`

  const slideMasterXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`

  const slideMasterRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`

  const slideLayoutXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`

  const slideLayoutRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`

  const themeXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="SWK Luxury">
  <a:themeElements>
    <a:clrScheme name="SWK">
      <a:dk1><a:srgbClr val="0E3A2F"/></a:dk1><a:lt1><a:srgbClr val="F8F6F1"/></a:lt1>
      <a:dk2><a:srgbClr val="1C2B27"/></a:dk2><a:lt2><a:srgbClr val="EFECE4"/></a:lt2>
      <a:accent1><a:srgbClr val="C8A253"/></a:accent1><a:accent2><a:srgbClr val="0E3A2F"/></a:accent2>
      <a:accent3><a:srgbClr val="2D6A5B"/></a:accent3><a:accent4><a:srgbClr val="8A621C"/></a:accent4>
      <a:accent5><a:srgbClr val="4A5A54"/></a:accent5><a:accent6><a:srgbClr val="DDD4C2"/></a:accent6>
      <a:hlink><a:srgbClr val="0E3A2F"/></a:hlink><a:folHlink><a:srgbClr val="8A621C"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="SWK"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>
    <a:fmtScheme name="SWK"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>
  </a:themeElements>
</a:theme>`

  const slideRel = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`

  const files: { name: string; content: string }[] = [
    { name: '[Content_Types].xml', content: contentTypes },
    { name: '_rels/.rels', content: rootRels },
    { name: 'ppt/presentation.xml', content: presXml },
    { name: 'ppt/_rels/presentation.xml.rels', content: presRels },
    { name: 'ppt/slideMasters/slideMaster1.xml', content: slideMasterXml },
    { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', content: slideMasterRels },
    { name: 'ppt/slideLayouts/slideLayout1.xml', content: slideLayoutXml },
    { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', content: slideLayoutRels },
    { name: 'ppt/theme/theme1.xml', content: themeXml },
  ]

  safeSlides.forEach((s, idx) => {
    files.push({ name: `ppt/slides/slide${idx + 1}.xml`, content: buildSlideXml(s, idx + 1, n) })
    files.push({ name: `ppt/slides/_rels/slide${idx + 1}.xml.rels`, content: slideRel })
  })

  return createZip(files)
}
