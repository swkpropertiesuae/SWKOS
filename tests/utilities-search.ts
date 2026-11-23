import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { Document, Packer, Paragraph, TextRun } from 'docx'
import { unzipSync } from 'fflate'
import mammoth from 'mammoth'
import { PDFDocument, StandardFonts } from 'pdf-lib'

// Set isolated temp DATA_DIR BEFORE importing any server modules
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swk-utilities-search-'))
process.env.DATA_DIR = tmpDir
process.env.DATABASE_URL = ''
process.env.APP_SECRET = 'test-utilities-search-secret-0123456789abcdef'
process.env.DEMO_ENABLED = 'true'

function buildMultipart(
  fields: Record<string, string>,
  file?: { fieldname: string; filename: string; contentType: string; data: Buffer },
): { contentType: string; body: Buffer } {
  const boundary = '----SwkTestBoundary' + Math.random().toString(36).slice(2)
  const chunks: Buffer[] = []
  for (const [k, v] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`,
        'utf8',
      ),
    )
  }
  if (file) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldname}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
        'utf8',
      ),
    )
    chunks.push(file.data)
    chunks.push(Buffer.from('\r\n', 'utf8'))
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'))
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat(chunks),
  }
}

async function run() {
  const { mainDb, q, runInDb } = await import('../src/server/db')
  const { syncSchema } = await import('../src/server/schema')
  const { seedReference } = await import('../src/server/seed')
  const { encryptSecret, setSettings } = await import('../src/server/settings')
  const authMod = await import('../src/server/auth')
  const { createRecord, getDef, SYSTEM_CTX } = await import('../src/server/engine')
  const { getDemoDb, rebuildDemoWorkspace } = await import('../src/server/demo/workspace')
  const { buildApp } = await import('../src/server/app')
  const webSearchMod = await import('../src/server/integrations/web-search')

  // Local mock OpenAI-compatible gateway so translate & search synthesis run offline
  const llmCalls: { url: string; body: any }[] = []
  const llmServer = http.createServer((req, res) => {
    let raw = ''
    req.on('data', c => { raw += c })
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {}
      llmCalls.push({ url: req.url || '', body })
      const userMsgs = (body.messages ?? []).filter((m: any) => m.role === 'user')
      const lastUser = String(userMsgs[userMsgs.length - 1]?.content ?? '')
      if ((req.url || '').startsWith('/free-route/')) {
        const reply = `[AR-TRANSLATED] ${lastUser}`
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          choices: [{ message: { role: 'assistant', content: reply } }],
          usage: { total_tokens: 45 },
        }))
        return
      }
      if ((req.url || '').startsWith('/zr-route/')) {
        const reply = `Synthesized insight: ${lastUser.slice(0, 180)}`
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          choices: [{ message: { role: 'assistant', content: reply } }],
          usage: { total_tokens: 30 },
        }))
        return
      }
      res.writeHead(404).end()
    })
  })
  await new Promise<void>(resolve => llmServer.listen(0, '127.0.0.1', resolve))
  const llmPort = (llmServer.address() as { port: number }).port
  const llmBase = `http://127.0.0.1:${llmPort}`

  let app: Awaited<ReturnType<typeof buildApp>> | null = null
  let demoDbRef: ReturnType<typeof getDemoDb> = null

  try {
    syncSchema()
    await seedReference()

    const now = new Date().toISOString()
    const dxbBranchId = q.val<number>(`SELECT id FROM branches WHERE code = 'DXB'`)!
    const staffRoleId = q.val<number>(`SELECT id FROM roles WHERE name = 'Staff (Attendance & General)'`)!
    const hrRoleId = q.val<number>(`SELECT id FROM roles WHERE name = 'HR'`)!
    const officeAdminRoleId = q.val<number>(`SELECT id FROM roles WHERE name = 'Office Admin'`)!

    const ownerRow = q.get<{ id: number }>(`SELECT id FROM users WHERE lower(email) = 'shabib@swk.properties'`)!
    const ownerCookie = 'swk_sid=' + authMod.createSession(ownerRow.id).token

    // Create two field agents, an HR user, an Office Admin user, and a portal user
    const agentAId = q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      'Search Agent A', 'search-agent-a@swk.rent', authMod.hashPassword('AgentA-Test-2026!'), staffRoleId, dxbBranchId, 1, 0, now, now,
    )
    const agentBId = q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      'Search Agent B', 'search-agent-b@swk.rent', authMod.hashPassword('AgentB-Test-2026!'), staffRoleId, dxbBranchId, 1, 0, now, now,
    )
    const hrId = q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      'Signed HR Search', 'hr-search@swk.properties', authMod.hashPassword('HrSearch-2026!'), hrRoleId, dxbBranchId, 1, 0, now, now,
    )
    q.run(
      `UPDATE users SET role_grant_sig = ?, role_granted_by = ? WHERE id = ?`,
      authMod.signRoleGrant(hrId, 'hr-search@swk.properties', 'HR'), ownerRow.id, hrId,
    )
    const officeAdminId = q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      'Signed Office Admin', 'office-search@swk.properties', authMod.hashPassword('OfficeSearch-2026!'), officeAdminRoleId, dxbBranchId, 1, 0, now, now,
    )
    q.run(
      `UPDATE users SET role_grant_sig = ?, role_granted_by = ? WHERE id = ?`,
      authMod.signRoleGrant(officeAdminId, 'office-search@swk.properties', 'Office Admin'), ownerRow.id, officeAdminId,
    )
    const portalPartyId = q.insert(
      `INSERT INTO parties(code, name, is_customer, status, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
      'P-UTIL-PORTAL', 'Portal Search Party', 1, 'Active', now, now,
    )
    const portalUserId = q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, party_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      'Portal Util User', 'portal-util@example.com', authMod.hashPassword('PortalUtil-2026!'), staffRoleId, dxbBranchId, portalPartyId, 1, 0, now, now,
    )

    const agentACookie = 'swk_sid=' + authMod.createSession(agentAId).token
    const agentBCookie = 'swk_sid=' + authMod.createSession(agentBId).token
    const hrCookie = 'swk_sid=' + authMod.createSession(hrId).token
    const officeCookie = 'swk_sid=' + authMod.createSession(officeAdminId).token
    const portalCookie = 'swk_sid=' + authMod.createSession(portalUserId).token

    app = await buildApp()

    // =========================================================================
    // 0. Staff-only 403 gate for portal users
    // =========================================================================
    const portalWordRes = await app.inject({
      method: 'GET',
      url: '/api/utilities/word',
      headers: { cookie: portalCookie },
    })
    assert.equal(portalWordRes.statusCode, 403, 'Portal user must get 403 on /api/utilities/word')

    const portalSearchRes = await app.inject({
      method: 'POST',
      url: '/api/search/unified',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: portalCookie },
      payload: { q: 'Marina' },
    })
    assert.equal(portalSearchRes.statusCode, 403, 'Portal user must get 403 on /api/search/unified')

    // =========================================================================
    // 1. Word Import XSS Sanitization + CRUD Privacy Scoping
    // =========================================================================
    const htmlWithXss = [
      '<h1>RERA Notice</h1>',
      '<script>alert(1)</script>',
      '<img src="x" onerror="alert(1)">',
      '<iframe src="https://evil.example"></iframe>',
      '<a href="javascript:alert(1)">Bad Link</a>',
      '<p dir="rtl" onclick="alert(2)">عقد إيجار آمن</p>',
    ].join('')
    const importHtmlMp = buildMultipart({}, {
      fieldname: 'file',
      filename: 'xss-test.html',
      contentType: 'text/html',
      data: Buffer.from(htmlWithXss, 'utf8'),
    })
    const importHtmlRes = await app.inject({
      method: 'POST',
      url: '/api/utilities/word/import-docx',
      headers: { 'content-type': importHtmlMp.contentType, 'x-swk-client': 'web', cookie: agentACookie },
      payload: importHtmlMp.body,
    })
    assert.equal(importHtmlRes.statusCode, 200, `import-docx (html) failed: ${importHtmlRes.body}`)
    const importedHtmlJson = importHtmlRes.json() as any
    assert.ok(!/<script/i.test(importedHtmlJson.html_content), 'Sanitizer must strip <script>')
    assert.ok(!/alert\(1\)/i.test(importedHtmlJson.html_content), 'Sanitizer must strip <script> payload')
    assert.ok(!/onerror=/i.test(importedHtmlJson.html_content), 'Sanitizer must strip onerror= handlers')
    assert.ok(!/onclick=/i.test(importedHtmlJson.html_content), 'Sanitizer must strip onclick= handlers')
    assert.ok(!/<iframe/i.test(importedHtmlJson.html_content), 'Sanitizer must strip <iframe>')
    assert.ok(!/javascript:/i.test(importedHtmlJson.html_content), 'Sanitizer must strip javascript: hrefs')
    assert.ok(importedHtmlJson.html_content.includes('dir="rtl"'), 'Sanitizer must preserve dir="rtl"')
    assert.ok(importedHtmlJson.html_content.includes('عقد إيجار آمن'), 'Sanitizer must keep clean Arabic text')

    // Also import a real .docx buffer via mammoth
    const sampleDocx = new Document({
      sections: [{
        children: [
          new Paragraph({ children: [new TextRun({ text: 'SWK Brokerage Offer', bold: true })] }),
          new Paragraph({ children: [new TextRun('Unit 1012 Marina Gate')] }),
        ],
      }],
    })
    const sampleDocxBuf = await Packer.toBuffer(sampleDocx)
    const importDocxMp = buildMultipart({}, {
      fieldname: 'file',
      filename: 'offer.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      data: sampleDocxBuf,
    })
    const importDocxRes = await app.inject({
      method: 'POST',
      url: '/api/utilities/word/import-docx',
      headers: { 'content-type': importDocxMp.contentType, 'x-swk-client': 'web', cookie: agentACookie },
      payload: importDocxMp.body,
    })
    assert.equal(importDocxRes.statusCode, 200, `import-docx (.docx) failed: ${importDocxRes.body}`)
    assert.match(importDocxRes.json().html_content, /SWK Brokerage Offer/)
    assert.match(importDocxRes.json().text, /Unit 1012 Marina Gate/)

    // Word CRUD: Field Agent cannot set include_seal=true
    const forbiddenSealRes = await app.inject({
      method: 'POST',
      url: '/api/utilities/word',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agentACookie },
      payload: { title: 'Sealed Attempt', html_content: '<p>Test</p>', include_seal: true },
    })
    assert.equal(forbiddenSealRes.statusCode, 403, 'Field agent must not set include_seal=true')

    // Word CRUD: Agent A creates private doc (with XSS attempt that gets stripped)
    const createDocRes = await app.inject({
      method: 'POST',
      url: '/api/utilities/word',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agentACookie },
      payload: {
        title: 'Agent A Marina Deal Notes',
        html_content: '<p>Marina Gate viewing checklist</p><script>alert(9)</script>',
        rtl: false,
        include_letterhead: true,
      },
    })
    assert.equal(createDocRes.statusCode, 201, `Word create failed: ${createDocRes.body}`)
    const agentADoc = createDocRes.json() as any
    assert.ok(agentADoc.id > 0)
    assert.ok(!agentADoc.html_content.includes('<script>'))

    // Agent B AND Owner cannot read, edit, or delete Agent A's private Word doc
    const serverApp = app
    for (const [label, cookie] of [['Agent B', agentBCookie], ['Owner', ownerCookie]] as const) {
      const rGet = await serverApp.inject({ method: 'GET', url: `/api/utilities/word/${agentADoc.id}`, headers: { cookie } })
      assert.equal(rGet.statusCode, 404, `${label} must get 404 reading Agent A private Word doc`)
      const rPut = await serverApp.inject({
        method: 'PUT',
        url: `/api/utilities/word/${agentADoc.id}`,
        headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie },
        payload: { title: 'Tampered' },
      })
      assert.equal(rPut.statusCode, 404, `${label} must get 404 editing Agent A private Word doc`)
      const rDel = await serverApp.inject({
        method: 'DELETE',
        url: `/api/utilities/word/${agentADoc.id}`,
        headers: { 'x-swk-client': 'web', cookie },
      })
      assert.equal(rDel.statusCode, 404, `${label} must get 404 deleting Agent A private Word doc`)
    }

    // Agent A can read, update, and export own saved doc by { id }
    const ownGet = await serverApp.inject({ method: 'GET', url: `/api/utilities/word/${agentADoc.id}`, headers: { cookie: agentACookie } })
    assert.equal(ownGet.statusCode, 200)
    const ownPut = await serverApp.inject({
      method: 'PUT',
      url: `/api/utilities/word/${agentADoc.id}`,
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agentACookie },
      payload: { html_content: '<p>Marina Gate viewing checklist updated</p>' },
    })
    assert.equal(ownPut.statusCode, 200)
    assert.match(ownPut.json().html_content, /updated/)
    const ownExportById = await serverApp.inject({
      method: 'POST',
      url: '/api/utilities/word/export-docx',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agentACookie },
      payload: { id: agentADoc.id },
    })
    assert.equal(ownExportById.statusCode, 200)
    assert.equal(ownExportById.rawPayload.subarray(0, 2).toString('ascii'), 'PK')

    // Owner creates own private Word doc (to test search isolation later)
    const ownerDocRes = await app.inject({
      method: 'POST',
      url: '/api/utilities/word',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: ownerCookie },
      payload: {
        title: 'Owner Private Marina Board Memo',
        html_content: '<p>Confidential Marina executive plan</p>',
      },
    })
    assert.equal(ownerDocRes.statusCode, 201)

    // =========================================================================
    // 2. Word Export .docx (PK magic bytes, Arabic RTL, mammoth re-extraction) + .pdf + convert
    // =========================================================================
    const arabicHeading = 'عقد إيجار دبي مارينا'
    const arabicBody = 'مذكرة تفاهم بيع عقار في دبي مارينا وفقاً لقانون ريرا'
    const exportDocxRes = await app.inject({
      method: 'POST',
      url: '/api/utilities/word/export-docx',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agentACookie },
      payload: {
        title: 'Dubai Marina Arabic Addendum',
        html_content: `<h1>SWK Real Estate Heading</h1><h2>${arabicHeading}</h2><p dir="rtl">${arabicBody}</p><ul><li>RERA Form F</li></ul>`,
        rtl: true,
        include_letterhead: true,
      },
    })
    assert.equal(exportDocxRes.statusCode, 200, `export-docx failed: ${exportDocxRes.body}`)
    const docxBuf = exportDocxRes.rawPayload
    assert.equal(docxBuf.subarray(0, 2).toString('ascii'), 'PK', 'Exported .docx must start with PK ZIP magic bytes')
    const reExtracted = await mammoth.extractRawText({ buffer: docxBuf })
    assert.ok(reExtracted.value.includes('SWK Real Estate Heading'), 'mammoth must re-extract English heading')
    assert.ok(reExtracted.value.includes(arabicHeading), 'mammoth must re-extract Arabic RTL heading')
    assert.ok(reExtracted.value.includes(arabicBody), 'mammoth must re-extract Arabic RTL body')
    const zipEntries = unzipSync(new Uint8Array(docxBuf))
    const docXml = new TextDecoder().decode(zipEntries['word/document.xml'])
    assert.ok(docXml.includes('w:bidi') || docXml.includes('w:rtl'), 'Exported RTL .docx XML must include bidi/rtl flags')

    // Word Export PDF (works without Chrome installed via pdf-lib)
    const exportPdfRes = await app.inject({
      method: 'POST',
      url: '/api/utilities/word/export-pdf',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agentACookie },
      payload: {
        title: 'SWK Export PDF',
        html_content: `<h1>Dubai Marina Summary</h1><p>${arabicBody}</p>`,
        rtl: true,
        include_letterhead: true,
      },
    })
    assert.equal(exportPdfRes.statusCode, 200, `export-pdf failed: ${exportPdfRes.body}`)
    assert.equal(exportPdfRes.rawPayload.subarray(0, 5).toString('ascii'), '%PDF-', 'export-pdf must return valid %PDF- buffer')

    // Universal Converter (.txt -> .docx, .docx -> .pdf, .docx -> .txt, .pdf -> .docx)
    const txtToDocxMp = buildMultipart({ target: 'docx' }, {
      fieldname: 'file',
      filename: 'notes.txt',
      contentType: 'text/plain',
      data: Buffer.from('# Marina Viewing\nEjari contract check complete.', 'utf8'),
    })
    const convDocxRes = await serverApp.inject({
      method: 'POST',
      url: '/api/utilities/convert',
      headers: { 'content-type': txtToDocxMp.contentType, 'x-swk-client': 'web', cookie: agentACookie },
      payload: txtToDocxMp.body,
    })
    assert.equal(convDocxRes.statusCode, 200, `convert txt->docx failed: ${convDocxRes.body}`)
    assert.equal(convDocxRes.rawPayload.subarray(0, 2).toString('ascii'), 'PK')

    const docxToPdfMp = buildMultipart({ target: 'pdf' }, {
      fieldname: 'file',
      filename: 'notes.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      data: sampleDocxBuf,
    })
    const convPdfRes = await serverApp.inject({
      method: 'POST',
      url: '/api/utilities/convert',
      headers: { 'content-type': docxToPdfMp.contentType, 'x-swk-client': 'web', cookie: agentACookie },
      payload: docxToPdfMp.body,
    })
    assert.equal(convPdfRes.statusCode, 200, `convert docx->pdf failed: ${convPdfRes.body}`)
    assert.equal(convPdfRes.rawPayload.subarray(0, 5).toString('ascii'), '%PDF-')

    const docxToTxtMp = buildMultipart({ target: 'txt' }, {
      fieldname: 'file',
      filename: 'notes.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      data: sampleDocxBuf,
    })
    const convTxtRes = await serverApp.inject({
      method: 'POST',
      url: '/api/utilities/convert',
      headers: { 'content-type': docxToTxtMp.contentType, 'x-swk-client': 'web', cookie: agentACookie },
      payload: docxToTxtMp.body,
    })
    assert.equal(convTxtRes.statusCode, 200)
    assert.match(convTxtRes.body, /Unit 1012 Marina Gate/)

    // Corrupt .docx uploads must return 400 (not 500) in both /convert and /translate-document
    const corruptDocxMp = buildMultipart({ target: 'pdf' }, {
      fieldname: 'file',
      filename: 'corrupt.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      data: Buffer.from('not-a-valid-zip-docx-payload', 'utf8'),
    })
    const corruptConvRes = await serverApp.inject({
      method: 'POST',
      url: '/api/utilities/convert',
      headers: { 'content-type': corruptDocxMp.contentType, 'x-swk-client': 'web', cookie: agentACookie },
      payload: corruptDocxMp.body,
    })
    assert.equal(corruptConvRes.statusCode, 400, `Expected 400 for corrupt .docx in /convert, got ${corruptConvRes.statusCode}: ${corruptConvRes.body}`)

    const corruptTrDocMp = buildMultipart({ source_lang: 'en', target_lang: 'ar' }, {
      fieldname: 'file',
      filename: 'corrupt.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      data: Buffer.from('not-a-valid-zip-docx-payload', 'utf8'),
    })
    const corruptTrDocRes = await serverApp.inject({
      method: 'POST',
      url: '/api/utilities/translate-document',
      headers: { 'content-type': corruptTrDocMp.contentType, 'x-swk-client': 'web', cookie: agentACookie },
      payload: corruptTrDocMp.body,
    })
    assert.equal(corruptTrDocRes.statusCode, 400, `Expected 400 for corrupt .docx in /translate-document, got ${corruptTrDocRes.statusCode}: ${corruptTrDocRes.body}`)

    // =========================================================================
    // 3. PDF Watermark & PDF -> .docx Convert
    // =========================================================================
    const srcPdf = await PDFDocument.create()
    const helv = await srcPdf.embedFont(StandardFonts.Helvetica)
    srcPdf.addPage().drawText('SWK Page 1 - Dubai Marina Unit 501', { x: 50, y: 700, size: 14, font: helv })
    srcPdf.addPage().drawText('SWK Page 2 - RERA Form F', { x: 50, y: 700, size: 14, font: helv })
    const srcPdfBuf = Buffer.from(await srcPdf.save())

    const pdfToDocxMp = buildMultipart({ target: 'docx' }, {
      fieldname: 'file',
      filename: 'contract.pdf',
      contentType: 'application/pdf',
      data: srcPdfBuf,
    })
    const convPdfToDocx = await serverApp.inject({
      method: 'POST',
      url: '/api/utilities/convert',
      headers: { 'content-type': pdfToDocxMp.contentType, 'x-swk-client': 'web', cookie: agentACookie },
      payload: pdfToDocxMp.body,
    })
    assert.equal(convPdfToDocx.statusCode, 200, `convert pdf->docx failed: ${convPdfToDocx.body}`)
    assert.equal(convPdfToDocx.rawPayload.subarray(0, 2).toString('ascii'), 'PK')
    const pdfDocxText = await mammoth.extractRawText({ buffer: convPdfToDocx.rawPayload })
    assert.match(pdfDocxText.value, /Dubai Marina Unit 501/)

    const wmMp = buildMultipart({ text: 'SWK PROPERTIES CONFIDENTIAL - MARINA 501' }, {
      fieldname: 'file',
      filename: 'contract.pdf',
      contentType: 'application/pdf',
      data: srcPdfBuf,
    })
    const wmRes = await app.inject({
      method: 'POST',
      url: '/api/utilities/pdf/watermark',
      headers: { 'content-type': wmMp.contentType, 'x-swk-client': 'web', cookie: agentACookie },
      payload: wmMp.body,
    })
    assert.equal(wmRes.statusCode, 200, `pdf/watermark failed: ${wmRes.body}`)
    assert.equal(wmRes.rawPayload.subarray(0, 5).toString('ascii'), '%PDF-', 'Watermarked PDF must start with %PDF-')
    const wmLoaded = await PDFDocument.load(wmRes.rawPayload)
    assert.equal(wmLoaded.getPageCount(), 2, 'Watermarked PDF must preserve both pages')

    // =========================================================================
    // 4. Unified Role-Scoped Hybrid Search (ZERO-LEAK) & Web Search Adapters
    // =========================================================================
    // Seed confidential & public fixtures all containing "Marina"
    // Seed cross-module attachments to verify Office Admin attachment RBAC scoping
    const empRec = createRecord(getDef('employees'), {
      emp_no: 'EMP-MARINA-99',
      name: 'Confidential Marina Payroll Director',
      email: 'marina-hr-secret@swk.properties',
      status: 'Active',
      join_date: '2026-01-01',
    }, SYSTEM_CTX)

    const partyId = q.insert(
      `INSERT INTO parties(code, name, is_customer, status, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
      'P-MARINA-1', 'Marina Investor Client', 1, 'Active', now, now,
    )
    const invId = q.insert(
      `INSERT INTO invoices(invoice_no, doc_type, party_id, invoice_date, currency, status, reference, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      'INV-MARINA-777', 'Tax Invoice', partyId, '2026-11-01', 'AED', 'Posted', 'Marina Commission Invoice Secret', now, now,
    )
    const ticketRec = createRecord(getDef('tickets'), {
      subject: 'Marina AC Maintenance Ticket',
      status: 'Open',
      priority: 'Medium',
    }, SYSTEM_CTX)
    q.insert(
      `INSERT INTO attachments(file_name, stored_name, size, mime, category, link_entity, link_id, link_label, note, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      'Marina Employee Salary.pdf', 'test/emp.pdf', 1200, 'application/pdf', 'KYC', 'employees', empRec.id, 'EMP-MARINA-99', 'Confidential HR file', now, now,
    )
    q.insert(
      `INSERT INTO attachments(file_name, stored_name, size, mime, category, link_entity, link_id, link_label, note, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      'Marina Commission Invoice.pdf', 'test/inv.pdf', 1400, 'application/pdf', 'Invoice / Bill', 'invoices', invId, 'INV-MARINA-777', 'Confidential finance file', now, now,
    )
    q.insert(
      `INSERT INTO attachments(file_name, stored_name, size, mime, category, link_entity, link_id, link_label, note, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      'Marina Ticket Photo.png', 'test/tkt.png', 900, 'image/png', 'Photo', 'tickets', ticketRec.id, ticketRec.ticket_no, 'Support ticket attachment', now, now,
    )
    q.insert(
      `INSERT INTO attachments(file_name, stored_name, size, mime, category, link_entity, link_id, link_label, note, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      'Marina General Brochure.pdf', 'test/gen.pdf', 1800, 'application/pdf', 'General', null, null, null, 'Public reception brochure', now, now,
    )

    createRecord(getDef('leads'), {
      company: 'Marina Walk-In Enquiry LLC',
      contact_name: 'Nadia Marina',
      email: 'nadia@example.com',
      phone: '+971504445566',
      status: 'New',
      source: 'Website',
    }, SYSTEM_CTX)

    // Unassigned Vault property (Agent A MUST NOT see)
    q.insert(
      `INSERT INTO crm_vault_properties(
        external_deal_id, source_dataset, source_sheet, deal_division, dubai_area_community,
        building_or_project, owner_name, direct_mobile_enc, direct_mobile_masked,
        vault_status, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      'VAULT-MARINA-SECRET', 'cluster_1920', 'Sheet1', 'Secondary', 'Dubai Marina',
      'Marina Secret Unassigned Tower', 'Secret Unassigned Owner', encryptSecret('+971509998877'), 'MASKED •••• 8877',
      'In Vault', now, now,
    )

    // Assigned Vault property for Agent A (Agent A sees ONLY masked form, NEVER raw phone)
    q.insert(
      `INSERT INTO crm_vault_properties(
        external_deal_id, source_dataset, source_sheet, deal_division, dubai_area_community,
        building_or_project, owner_name, direct_mobile_enc, direct_mobile_masked,
        assigned_user_id, assigned_by_user_id, assigned_at, vault_status, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      'VAULT-MARINA-ASSIGNED', 'cluster_1920', 'Sheet1', 'Secondary', 'Dubai Marina',
      'Marina Gate Assigned Tower', 'Protected Seller', encryptSecret('+971501112233'), 'MASKED •••• 2233',
      agentAId, ownerRow.id, now, 'Assigned', now, now,
    )

    // Private DM between Owner and Agent B (Agent A MUST NOT see)
    const dmThreadId = q.insert(
      `INSERT INTO chat_threads(title, kind, created_by, created_at) VALUES (?,?,?,?)`,
      null, 'dm', ownerRow.id, now,
    )
    q.run(`INSERT INTO chat_members(thread_id, user_id, role, joined_at) VALUES (?,?,?,?)`, dmThreadId, ownerRow.id, 'member', now)
    q.run(`INSERT INTO chat_members(thread_id, user_id, role, joined_at) VALUES (?,?,?,?)`, dmThreadId, agentBId, 'member', now)
    q.run(`INSERT INTO chat_messages(thread_id, user_id, body, kind, created_at) VALUES (?,?,?,?,?)`, dmThreadId, ownerRow.id, 'Private Marina secret between Owner and B', 'text', now)

    // Public website listing
    createRecord(getDef('website_listings'), {
      reference: 'SWK-DXB-MARINA-1',
      slug: 'marina-gate-penthouse',
      title: 'Marina Gate Waterfront Penthouse',
      purpose: 'buy',
      status: 'available',
      property_type: 'Penthouse',
      published: true,
      community: 'Dubai Marina',
      building: 'Marina Gate',
      price_aed: 5200000,
      bedrooms: 4,
      area_sqft: 3800,
    }, SYSTEM_CTX)

    // Field Agent unified search
    const agentSearchRes = await app.inject({
      method: 'POST',
      url: '/api/search/unified',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agentACookie },
      payload: { q: 'Marina', scopes: ['internal', 'website', 'market'] },
    })
    assert.equal(agentSearchRes.statusCode, 200, `Unified search failed: ${agentSearchRes.body}`)
    const agentSearch = agentSearchRes.json() as any
    const agentHits = agentSearch.results as any[]

    assert.ok(agentHits.some(h => h.entity === 'website_listings' && h.title.includes('Marina Gate Waterfront Penthouse')), 'Field agent must receive matching website_listings')
    assert.ok(agentHits.some(h => h.entity === 'market_area' && h.title.includes('Dubai Marina')), 'Field agent must receive matching DUBAI_AREAS_24')
    assert.ok(agentHits.some(h => h.entity === 'word_documents' && h.title.includes('Agent A Marina Deal Notes')), 'Field agent must receive own word_documents')

    // Zero-leak assertions for Field Agent
    assert.equal(agentHits.filter(h => h.entity === 'employees').length, 0, 'Field agent must get ZERO employees')
    assert.equal(agentHits.filter(h => h.entity === 'invoices').length, 0, 'Field agent must get ZERO invoices')
    assert.equal(agentHits.filter(h => h.entity === 'crm_vault_properties').length, 0, 'Field agent must get ZERO raw crm_vault_properties')
    assert.equal(agentHits.filter(h => h.entity === 'leads').length, 0, 'Field agent must get ZERO leads')
    assert.ok(!agentSearchRes.body.includes('Owner Private Marina Board Memo'), 'Field agent must NEVER see Owner word_documents')
    assert.ok(!agentSearchRes.body.includes('Private Marina secret between Owner and B'), 'Field agent must NEVER see private DMs')
    assert.ok(!agentSearchRes.body.includes('Marina Secret Unassigned Tower'), 'Field agent must NEVER see unassigned Vault deals')
    assert.ok(!agentSearchRes.body.includes('+971501112233'), 'Field agent must NEVER see unmasked Vault phone')
    assert.ok(!agentSearchRes.body.includes('+971509998877'), 'Field agent must NEVER see unassigned Vault phone')

    // HR search: sees employees, NEVER invoices or crm_vault_properties
    const hrSearchRes = await app.inject({
      method: 'POST',
      url: '/api/search/unified',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: hrCookie },
      payload: { q: 'Marina', scopes: ['internal'] },
    })
    assert.equal(hrSearchRes.statusCode, 200)
    const hrHits = (hrSearchRes.json() as any).results as any[]
    assert.ok(hrHits.some(h => h.entity === 'employees'), 'HR must see employees')
    assert.equal(hrHits.filter(h => h.entity === 'invoices').length, 0, 'HR must get ZERO invoices')
    assert.equal(hrHits.filter(h => h.entity === 'crm_vault_properties').length, 0, 'HR must get ZERO crm_vault_properties')

    // Office Admin search: sees leads + tickets/unlinked attachments, NEVER employees/invoices/crm_vault_properties or HR/Finance attachments
    const officeSearchRes = await serverApp.inject({
      method: 'POST',
      url: '/api/search/unified',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: officeCookie },
      payload: { q: 'Marina', scopes: ['internal'] },
    })
    assert.equal(officeSearchRes.statusCode, 200)
    const officeHits = (officeSearchRes.json() as any).results as any[]
    assert.ok(officeHits.some(h => h.entity === 'leads'), 'Office Admin must see leads')
    assert.ok(officeHits.some(h => h.entity === 'attachments' && h.title === 'Marina Ticket Photo.png'), 'Office Admin must see tickets-linked attachments')
    assert.ok(officeHits.some(h => h.entity === 'attachments' && h.title === 'Marina General Brochure.pdf'), 'Office Admin must see unlinked general attachments')
    assert.ok(!officeSearchRes.body.includes('Marina Employee Salary.pdf'), 'Office Admin must NEVER see employees-linked attachments')
    assert.ok(!officeSearchRes.body.includes('Marina Commission Invoice.pdf'), 'Office Admin must NEVER see invoices-linked attachments')
    assert.equal(officeHits.filter(h => h.entity === 'employees').length, 0, 'Office Admin must get ZERO employees')
    assert.equal(officeHits.filter(h => h.entity === 'invoices').length, 0, 'Office Admin must get ZERO invoices')
    assert.equal(officeHits.filter(h => h.entity === 'crm_vault_properties').length, 0, 'Office Admin must get ZERO crm_vault_properties')

    // Leadership search: sees employees, invoices, crm_vault_properties, and all attachments; NEVER Agent A's private word doc
    const ownerSearchRes = await serverApp.inject({
      method: 'POST',
      url: '/api/search/unified',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: ownerCookie },
      payload: { q: 'Marina', scopes: ['internal'], limit: 50 },
    })
    assert.equal(ownerSearchRes.statusCode, 200)
    const ownerHits = (ownerSearchRes.json() as any).results as any[]
    assert.ok(ownerHits.some(h => h.entity === 'employees'), 'Owner must see employees')
    assert.ok(ownerHits.some(h => h.entity === 'invoices'), 'Owner must see invoices')
    assert.ok(ownerHits.some(h => h.entity === 'crm_vault_properties'), 'Owner must see crm_vault_properties')
    assert.ok(ownerHits.some(h => h.entity === 'attachments' && h.title === 'Marina Employee Salary.pdf'), 'Owner must see employees attachment')
    assert.ok(!ownerSearchRes.body.includes('Agent A Marina Deal Notes'), 'Owner must NEVER see another user private word_documents')

    // Web Search integration tests via injectable hook (zero external network)
    webSearchMod.setWebSearchFetcherForTests(async (url: string, init?: RequestInit) => {
      if (url.includes('duckduckgo.com') && url.includes('timeout-body-test')) {
        return {
          ok: true,
          status: 200,
          text: () => new Promise<string>((_resolve, reject) => {
            const sig = init?.signal
            if (sig?.aborted) return reject(sig.reason ?? new Error('Aborted'))
            sig?.addEventListener('abort', () => reject(sig.reason ?? new Error('Timed out')), { once: true })
          }),
        } as unknown as Response
      }
      if (url.includes('duckduckgo.com')) {
        return new Response(
          `<html><body>
            <div class="result">
              <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fdubailand.gov.ae%2Fejari"><b>Ejari</b> Official &#9999999; &amp;#9999999;<script>alert(1)</script></a>
              <a class="result__snippet">Register Dubai tenancy <b>contracts</b> safely &#9999999; &amp;#x110000;.</a>
            </div>
          </body></html>`,
          { status: 200, headers: { 'content-type': 'text/html' } },
        )
      }
      if (url.includes('api.tavily.com')) {
        return new Response(JSON.stringify({
          results: [{ title: 'Tavily DLD Guide', url: 'https://dubailand.gov.ae/dld', content: 'Official DLD portal' }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url.includes('api.search.brave.com')) {
        return new Response(JSON.stringify({
          web: { results: [{ title: 'Brave RERA Guide', url: 'https://rera.ae/form-f', description: 'Form F contract rules' }] },
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url.includes('searx.local')) {
        return new Response(JSON.stringify({
          results: [{ title: 'SearXNG Dubai', url: 'https://example.ae/market', content: 'Market overview', engine: 'google' }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      throw new Error(`Unexpected web search URL: ${url}`)
    })

    setSettings({ web_search_provider: 'duckduckgo' })
    const ddg = await webSearchMod.searchWeb('Ejari Dubai')
    assert.equal(ddg.provider, 'duckduckgo')
    assert.equal(ddg.results.length, 1)
    assert.equal(ddg.results[0]!.url, 'https://dubailand.gov.ae/ejari')
    assert.ok(!ddg.results[0]!.title.includes('<script>') && !ddg.results[0]!.title.includes('alert(1)'))
    assert.ok(ddg.results[0]!.title.includes('&#9999999;'), 'Malformed decimal entity out of Unicode range must stay un-decoded without throwing RangeError')
    assert.ok(ddg.results[0]!.snippet.includes('&#x110000;'), 'Malformed hex entity out of Unicode range must stay un-decoded without throwing RangeError')

    // Body-read timeout must remain armed until res.text() finishes
    await assert.rejects(
      () => webSearchMod.searchWeb('timeout-body-test', { timeoutMs: 1000 }),
      /timed out/i,
      'AbortController timeout must stay active through body read',
    )

    setSettings({ web_search_provider: 'tavily', web_search_api_key: 'tvly-key' })
    const tvly = await webSearchMod.searchWeb('DLD')
    assert.equal(tvly.provider, 'tavily')
    assert.equal(tvly.results[0]!.title, 'Tavily DLD Guide')

    setSettings({ web_search_provider: 'brave', web_search_api_key: 'brave-key' })
    const brv = await webSearchMod.searchWeb('Form F')
    assert.equal(brv.provider, 'brave')
    assert.equal(brv.results[0]!.title, 'Brave RERA Guide')

    setSettings({ web_search_provider: 'searxng', web_search_searxng_url: 'https://searx.local' })
    const sx = await webSearchMod.searchWeb('Dubai')
    assert.equal(sx.provider, 'searxng')
    assert.equal(sx.results[0]!.source, 'google')

    // Unconditional Demo-mode verification (zero outbound network & zero LLM calls)
    await rebuildDemoWorkspace()
    const demoDb = getDemoDb()
    assert.ok(demoDb, 'Demo DB must be initialized for unconditional inDemo() verification')
    demoDbRef = demoDb

    webSearchMod.setWebSearchFetcherForTests(async () => {
      throw new Error('Demo mode must NEVER call web fetch!')
    })
    await runInDb(demoDb, async () => {
      const demoWebRes = await webSearchMod.searchWeb('Dubai Marina')
      assert.equal(demoWebRes.provider, 'demo')
      assert.ok(demoWebRes.results.length >= 1)
    })

    const demoLoginRes = await serverApp.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web' },
      payload: { email: 'demo@swkpropertiesuae.com', password: process.env.DEMO_PASSWORD ?? 'Demo@SWK2026' },
    })
    assert.equal(demoLoginRes.statusCode, 200, `Demo login failed: ${demoLoginRes.body}`)
    const demoCookie = 'swk_sid=' + demoLoginRes.cookies.find((c: any) => c.name === 'swk_sid')!.value

    const llmCallsBeforeDemo = llmCalls.length
    const demoTranslateRes = await serverApp.inject({
      method: 'POST',
      url: '/api/utilities/translate',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: demoCookie },
      payload: { text: 'Ejari renewal for Dubai Marina', source_lang: 'en', target_lang: 'ar' },
    })
    assert.equal(demoTranslateRes.statusCode, 200, `Demo translate failed: ${demoTranslateRes.body}`)
    assert.equal(demoTranslateRes.json().provider, 'demo')

    const demoSearchRes = await serverApp.inject({
      method: 'POST',
      url: '/api/search/unified',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: demoCookie },
      payload: { q: 'Marina', scopes: ['internal', 'website', 'market', 'web'], synthesize: true },
    })
    assert.equal(demoSearchRes.statusCode, 200, `Demo unified search failed: ${demoSearchRes.body}`)
    assert.equal(demoSearchRes.json().synthesis?.provider, 'demo')
    assert.ok(demoSearchRes.json().by_scope?.web?.length >= 1, 'Demo unified search must return deterministic web results')
    assert.equal(llmCalls.length, llmCallsBeforeDemo, 'Demo mode must NEVER make outbound LLM requests')

    webSearchMod.setWebSearchFetcherForTests(null)

    // =========================================================================
    // 5. Dedicated UAE Real Estate Translator (Language validation + Glossary + PII Scrub)
    // =========================================================================
    // Invalid language code -> 400
    const badLangRes = await app.inject({
      method: 'POST',
      url: '/api/utilities/translate',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agentACookie },
      payload: { text: 'Hello world', source_lang: 'en', target_lang: 'klingon' },
    })
    assert.equal(badLangRes.statusCode, 400, 'Invalid target_lang must return 400')

    const badToneRes = await app.inject({
      method: 'POST',
      url: '/api/utilities/translate',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agentACookie },
      payload: { text: 'Hello world', source_lang: 'en', target_lang: 'ar', tone: 'invalid_tone' },
    })
    assert.equal(badToneRes.statusCode, 400, 'Invalid tone must return 400')

    // Configure free route (zero_retention: false) & zero-retention route for synthesis
    q.run(
      `INSERT INTO ai_provider_routes(label, provider_key, base_url, api_key_enc, model_id, lanes_json, tier, priority, zero_retention, enabled, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      'Free Translate Route', 'groq', `${llmBase}/free-route`, encryptSecret('k-free'), 'llama-3.3-70b-versatile',
      JSON.stringify(['translate', 'search', 'general']), 'free', 10, 0, 1, now, now,
    )
    q.run(
      `INSERT INTO ai_provider_routes(label, provider_key, base_url, api_key_enc, model_id, lanes_json, tier, priority, zero_retention, enabled, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      'ZeroRetention Search Route', 'cloudflare', `${llmBase}/zr-route`, encryptSecret('k-zr'), '@cf/meta/llama-3.3-70b',
      JSON.stringify(['search', 'general']), 'free', 20, 1, 1, now, now,
    )

    llmCalls.length = 0
    const piiText = 'Please renew Ejari and Oqood under RERA Form F for client +971 50 777 8899, Emirates ID 784-1990-1234567-1, email buyer@example.com, IBAN AE070331234567890123456.'
    const trRes = await app.inject({
      method: 'POST',
      url: '/api/utilities/translate',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agentACookie },
      payload: {
        text: piiText,
        source_lang: 'en',
        target_lang: 'ar',
        tone: 'legal_rera',
        glossary_lock: true,
      },
    })
    assert.equal(trRes.statusCode, 200, `Translate failed: ${trRes.body}`)
    const trJson = trRes.json() as any
    assert.equal(trJson.rtl, true)
    assert.ok(trJson.pii_redacted >= 4, `Expected >=4 PII tokens scrubbed, got ${trJson.pii_redacted}`)
    assert.ok(llmCalls.length >= 1, 'Translate must invoke Omni-Route LLM')

    const freeCall = llmCalls.find(c => c.url.startsWith('/free-route/'))!
    assert.ok(freeCall, 'Expected call to free route')
    const sentPayloadStr = JSON.stringify(freeCall.body.messages)
    for (const term of ['Ejari', 'Oqood', 'Form F', 'RERA']) {
      assert.ok(sentPayloadStr.includes(term), `Glossary term "${term}" must be injected in prompt`)
    }
    assert.ok(!sentPayloadStr.includes('+971 50 777 8899'), 'Raw phone must be scrubbed before free route')
    assert.ok(!sentPayloadStr.includes('784-1990-1234567-1'), 'Raw Emirates ID must be scrubbed before free route')
    assert.ok(!sentPayloadStr.includes('buyer@example.com'), 'Raw email must be scrubbed before free route')
    assert.ok(!sentPayloadStr.includes('AE070331234567890123456'), 'Raw IBAN must be scrubbed before free route')
    assert.ok(trJson.translated_text.includes('+971 50 777 8899'), 'PII must be restored locally in translated_text')

    // Document translation endpoint (.txt -> translated text + .docx payload)
    const trDocMp = buildMultipart({ source_lang: 'en', target_lang: 'ar', tone: 'executive_email' }, {
      fieldname: 'file',
      filename: 'rera-memo.txt',
      contentType: 'text/plain',
      data: Buffer.from('Ejari renewal notice for Dubai Marina Unit 501.', 'utf8'),
    })
    const trDocRes = await app.inject({
      method: 'POST',
      url: '/api/utilities/translate-document',
      headers: { 'content-type': trDocMp.contentType, 'x-swk-client': 'web', cookie: agentACookie },
      payload: trDocMp.body,
    })
    assert.equal(trDocRes.statusCode, 200, `translate-document failed: ${trDocRes.body}`)
    const trDocJson = trDocRes.json() as any
    assert.ok(trDocJson.translated_text.includes('[AR-TRANSLATED]'))
    assert.ok(trDocJson.docx_base64, 'translate-document must include docx_base64')
    assert.equal(Buffer.from(trDocJson.docx_base64, 'base64').subarray(0, 2).toString('ascii'), 'PK')

    // Oversized document (>60,000 chars) must fail cleanly with 400 (not dump an oversized trailing chunk)
    const hugeText = ('RERA Form F tenancy addendum clause for Dubai Marina.\n\n').repeat(1300)
    const hugeTrMp = buildMultipart({ source_lang: 'en', target_lang: 'ar' }, {
      fieldname: 'file',
      filename: 'huge-contract.txt',
      contentType: 'text/plain',
      data: Buffer.from(hugeText, 'utf8'),
    })
    const hugeTrRes = await serverApp.inject({
      method: 'POST',
      url: '/api/utilities/translate-document',
      headers: { 'content-type': hugeTrMp.contentType, 'x-swk-client': 'web', cookie: agentACookie },
      payload: hugeTrMp.body,
    })
    assert.equal(hugeTrRes.statusCode, 400, `Expected 400 for >60k char document, got ${hugeTrRes.statusCode}: ${hugeTrRes.body}`)

    // Multi-chunk document translation counts as 1 staff RPM/RPD request (no mid-document 429)
    setSettings({ ai_staff_rpm_limit: 1 })
    const multiChunkText = Array.from({ length: 4 }, (_, i) =>
      `Paragraph ${i + 1}: ` + 'Dubai Marina RERA Form F lease obligation. '.repeat(65),
    ).join('\n\n')
    const multiChunkMp = buildMultipart({ source_lang: 'en', target_lang: 'ar', tone: 'legal_rera' }, {
      fieldname: 'file',
      filename: 'multi-chunk-contract.txt',
      contentType: 'text/plain',
      data: Buffer.from(multiChunkText, 'utf8'),
    })
    llmCalls.length = 0
    const multiRes = await serverApp.inject({
      method: 'POST',
      url: '/api/utilities/translate-document',
      headers: { 'content-type': multiChunkMp.contentType, 'x-swk-client': 'web', cookie: agentBCookie },
      payload: multiChunkMp.body,
    })
    assert.equal(multiRes.statusCode, 200, `Multi-chunk translate-document must not 429 under RPM=1, got ${multiRes.statusCode}: ${multiRes.body}`)
    assert.ok(multiRes.json().chunks >= 3, `Expected >=3 chunks, got ${multiRes.json().chunks}`)
    assert.equal(llmCalls.length, multiRes.json().chunks)
    const agentBUsage = q.val<number>(`SELECT req_count FROM ai_usage_daily WHERE user_id = ?`, agentBId)
    assert.equal(agentBUsage, 1, `Multi-chunk translate-document must charge only 1 quota request, got ${agentBUsage}`)
    setSettings({ ai_staff_rpm_limit: 10 })

    // Unified search with synthesize: true (Field Agent sends ONLY public snippets, NEVER internal hits)
    llmCalls.length = 0
    const synthAgentRes = await serverApp.inject({
      method: 'POST',
      url: '/api/search/unified',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agentACookie },
      payload: { q: 'Marina', scopes: ['internal', 'website', 'market'], synthesize: true },
    })
    assert.equal(synthAgentRes.statusCode, 200, `Unified search synthesize failed: ${synthAgentRes.body}`)
    const synthJson = synthAgentRes.json() as any
    assert.ok(synthJson.synthesis?.answer, 'Expected synthesized answer')
    assert.ok(Array.isArray(synthJson.synthesis?.citations), 'Expected synthesis citations')
    const synthPrompt = JSON.stringify(llmCalls[0]?.body?.messages ?? [])
    assert.ok(!synthPrompt.includes('Agent A Marina Deal Notes'), 'Public synthesis must NOT send internal docs')
    assert.ok(!synthPrompt.includes('MASKED'), 'Public synthesis must NOT send internal Vault rows')

    // Field agent cannot use confidential: true synthesis
    const forbiddenConfSearch = await serverApp.inject({
      method: 'POST',
      url: '/api/search/unified',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agentACookie },
      payload: { q: 'Marina', synthesize: true, confidential: true },
    })
    assert.equal(forbiddenConfSearch.statusCode, 403, 'Field agent must get 403 on confidential search synthesis')

    // Leadership confidential: true synthesis hits ONLY zero-retention route
    llmCalls.length = 0
    const leaderConfSearch = await serverApp.inject({
      method: 'POST',
      url: '/api/search/unified',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: ownerCookie },
      payload: { q: 'Marina', scopes: ['internal', 'website'], synthesize: true, confidential: true },
    })
    assert.equal(leaderConfSearch.statusCode, 200, `Leadership confidential synthesis failed: ${leaderConfSearch.body}`)
    assert.equal(leaderConfSearch.json().synthesis?.zero_retention, true)
    assert.ok(llmCalls.some(c => c.url.startsWith('/zr-route/')), 'Confidential synthesis must route through zero-retention route')
    assert.ok(!llmCalls.some(c => c.url.startsWith('/free-route/')), 'Confidential synthesis must NEVER touch non-zero-retention free route')

    // Agent A can delete own Word doc cleanly
    const ownDel = await serverApp.inject({
      method: 'DELETE',
      url: `/api/utilities/word/${agentADoc.id}`,
      headers: { 'x-swk-client': 'web', cookie: agentACookie },
    })
    assert.equal(ownDel.statusCode, 200)
    const afterDel = await serverApp.inject({
      method: 'GET',
      url: `/api/utilities/word/${agentADoc.id}`,
      headers: { cookie: agentACookie },
    })
    assert.equal(afterDel.statusCode, 404)

    console.log('All Task 7 utilities, converter, PDF watermark, translator & zero-leak unified search tests passed.')
  } finally {
    webSearchMod.setWebSearchFetcherForTests(null)
    try { await app?.close() } catch {}
    try {
      llmServer.closeAllConnections?.()
      await new Promise<void>(resolve => llmServer.close(() => resolve()))
    } catch {}
    try { demoDbRef?.close() } catch {}
    try { mainDb.close() } catch {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  }
}

run().then(
  () => process.exit(0),
  err => {
    console.error(err)
    process.exit(1)
  },
)
