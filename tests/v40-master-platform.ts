import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const createdTmp = !process.env.DATA_DIR
const tmpDir = process.env.DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'swk-v40-master-'))
process.env.DATA_DIR = tmpDir
process.env.APP_SECRET = process.env.APP_SECRET || 'test-v40-master-platform-secret-0123456789'
process.env.DEMO_ENABLED = 'false'

function buildMultipart(fields: Record<string, string>, file: { field: string; filename: string; contentType: string; content: Buffer }) {
  const boundary = '----SwkV40Boundary998877'
  const chunks: Buffer[] = []
  for (const [k, v] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`))
  }
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
    ),
  )
  chunks.push(file.content)
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`))
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat(chunks),
  }
}

async function main() {
  const { mainDb, q } = await import('../src/server/db')
  const { syncSchema } = await import('../src/server/schema')
  const { seedReference } = await import('../src/server/seed')
  const { hashPassword } = await import('../src/server/auth')
  const { buildApp } = await import('../src/server/app')

  syncSchema()
  await seedReference()

  const pw = 'SwkV40MasterTest-2026!'
  const setPw = (email: string) => {
    const uid = q.val<number>(`SELECT id FROM users WHERE lower(email) = ?`, email.toLowerCase())!
    assert.ok(uid, `Seeded user missing: ${email}`)
    q.run(`UPDATE users SET password_hash = ?, must_change_password = 0, active = 1 WHERE id = ?`, hashPassword(pw), uid)
    return uid
  }

  const ownerId = setPw('shabib@swk.properties')
  setPw('admin@swk.properties')
  setPw('haseeb@swk.properties')
  const meenakshiId = setPw('meenakshi@swk.properties')
  setPw('rahaba@swk.properties')
  setPw('saifullah@swk.properties')

  const app = await buildApp()
  let ipSeq = 10
  const login = async (email: string) => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: `127.0.40.${ipSeq++}`,
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web' },
      payload: { email, password: pw },
    })
    assert.equal(r.statusCode, 200, `Login failed for ${email}: ${r.body}`)
    return 'swk_sid=' + r.cookies.find((c: any) => c.name === 'swk_sid')!.value
  }

  const req = (cookie: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: any) =>
    app.inject({
      method,
      url,
      headers: {
        cookie,
        'x-swk-client': 'web',
        ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(payload !== undefined ? { payload } : {}),
    })

  const ownerCookie = await login('shabib@swk.properties')
  const adminCookie = await login('admin@swk.properties')
  const haseebCookie = await login('haseeb@swk.properties')
  const meenakshiCookie = await login('meenakshi@swk.properties')
  const rahabaCookie = await login('rahaba@swk.properties')
  const agentCookie = await login('saifullah@swk.properties')

  let passed = 0
  const check = (name: string, cond: unknown, detail?: any) => {
    assert.ok(cond, `${name}${detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ''}`)
    passed++
    console.log(`  PASS  ${name}`)
  }

  try {
    // 1. UAE Enterprise Anti-Hacking Headers & Perimeter Intrusion Blocking
    const health = await app.inject({ method: 'GET', url: '/api/health' })
    check('UAE Security Shield header present', health.headers['x-swk-security-shield'] === 'UAE-Enterprise-v4')
    check('Permissions-Policy header enforced', String(health.headers['permissions-policy'] || '').includes('payment=()'))
    check('COOP & CORP headers enforced', health.headers['cross-origin-opener-policy'] === 'same-origin' && health.headers['cross-origin-resource-policy'] === 'same-origin')
    check('API Cache-Control no-store enforced', String(health.headers['cache-control'] || '').includes('no-store'))

    const protoAttack = await app.inject({
      method: 'POST',
      url: '/api/customizer/fields',
      headers: { cookie: ownerCookie, 'x-swk-client': 'web', 'content-type': 'application/json' },
      payload: '{"entity":"employees","name":"ok_key","label":"X","type":"text","__proto__":{"polluted":true}}',
    })
    check('Prototype pollution (__proto__) payload blocked with 400', protoAttack.statusCode === 400, protoAttack.body)

    const travAttack = await app.inject({
      method: 'GET',
      url: '/api/master-hub/log?q=..%2f..%2fetc%2fpasswd',
      headers: { cookie: ownerCookie },
    })
    check('Path traversal probe blocked with 400', travAttack.statusCode === 400, travAttack.body)

    const sqliAttack = await app.inject({
      method: 'GET',
      url: "/api/master-hub/log?q=1%20UNION%20SELECT%20password_hash%20FROM%20users",
      headers: { cookie: ownerCookie },
    })
    check('SQLi URL probe blocked with 400', sqliAttack.statusCode === 400, sqliAttack.body)

    // 2. Employee History PDF Upload (Emirates ID / Visa) + Magic-Byte Anti-Spoof + HR PII Isolation
    const empId = q.val<number>(`SELECT id FROM employees WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 1`)!
    assert.ok(empId > 0, 'Seeded employee required')

    const fakePdfMp = buildMultipart(
      { link_entity: 'employees', link_id: String(empId), category: 'Emirates ID' },
      { field: 'file', filename: 'malicious_disguised.pdf', contentType: 'application/pdf', content: Buffer.from('<script>alert(1)</script>') },
    )
    const fakePdfRes = await app.inject({
      method: 'POST',
      url: '/api/files',
      headers: { cookie: ownerCookie, 'x-swk-client': 'web', 'content-type': fakePdfMp.contentType },
      payload: fakePdfMp.body,
    })
    check('Disguised script/fake PDF rejected by magic-byte shield (400)', fakePdfRes.statusCode === 400, fakePdfRes.body)

    const validPdfBytes = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n')
    const eidPdfMp = buildMultipart(
      { link_entity: 'employees', link_id: String(empId), category: 'Emirates ID', expiry_date: '2028-12-31', note: 'EID 784-1990-1234567-1' },
      { field: 'file', filename: 'Emirates_ID_Front_Back.pdf', contentType: 'application/pdf', content: validPdfBytes },
    )
    const eidUploadRes = await app.inject({
      method: 'POST',
      url: '/api/files',
      headers: { cookie: rahabaCookie, 'x-swk-client': 'web', 'content-type': eidPdfMp.contentType },
      payload: eidPdfMp.body,
    })
    check('HR Rahaba can upload valid Emirates ID PDF to Employee history (200)', eidUploadRes.statusCode === 200, eidUploadRes.body)
    const uploadedEidId = eidUploadRes.json()[0].id
    check('Uploaded Emirates ID PDF stored with ID', uploadedEidId > 0)

    const agentDlEid = await req(agentCookie, 'GET', `/api/files/${uploadedEidId}/download`)
    check('Restricted agent BLOCKED from downloading Employee EID PDF (403)', agentDlEid.statusCode === 403)
    const meenakshiDlEid = await req(meenakshiCookie, 'GET', `/api/files/${uploadedEidId}/download`)
    check('Office Admin Meenakshi BLOCKED from downloading Employee EID PDF (403)', meenakshiDlEid.statusCode === 403)
    const ownerDlEid = await req(ownerCookie, 'GET', `/api/files/${uploadedEidId}/download`)
    check('Owner CAN download & preview Employee EID PDF (200 + %PDF-)', ownerDlEid.statusCode === 200 && ownerDlEid.body.startsWith('%PDF-'))

    // 3. Hardcoded Owner & Admin No-Code OS Customizer
    for (const [label, cookie] of [
      ['Haseeb', haseebCookie],
      ['Meenakshi', meenakshiCookie],
      ['Rahaba', rahabaCookie],
      ['Agent', agentCookie],
    ] as const) {
      const deny = await req(cookie, 'GET', '/api/customizer/state')
      check(`No-Code OS Customizer BLOCKED for ${label} (403)`, deny.statusCode === 403)
    }

    const custOwner = await req(ownerCookie, 'GET', '/api/customizer/state')
    check('Owner can open No-Code OS Customizer (200)', custOwner.statusCode === 200 && custOwner.json().ownerAdminHardcoded === true)
    const custAdmin = await req(adminCookie, 'GET', '/api/customizer/state')
    check('Admin can open No-Code OS Customizer (200)', custAdmin.statusCode === 200)

    const addFieldRes = await req(ownerCookie, 'POST', '/api/customizer/fields', {
      entity: 'employees',
      name: 'visa_sponsor_ref',
      label: 'Visa Sponsor Reference',
      type: 'text',
      required: false,
      sort: 50,
    })
    check('Owner creates live custom field on Employees without IT (200)', addFieldRes.statusCode === 200, addFieldRes.body)
    const metaAfterField = await req(ownerCookie, 'GET', '/api/meta')
    const empMeta = metaAfterField.json().entities.find((e: any) => e.key === 'employees')
    check('New custom field immediately reflected in live /api/meta for Employees', empMeta.customFieldDefs.some((f: any) => f.name === 'visa_sponsor_ref'))

    const optRes = await req(adminCookie, 'PUT', '/api/customizer/options', {
      groupKey: 'document_categories',
      options: ['Emirates ID', 'Residence Visa', 'Golden Visa Card', 'RERA BRN Card'],
    })
    check('Admin updates custom dropdown option list without IT (200)', optRes.statusCode === 200 && optRes.json().options.includes('Golden Visa Card'))

    const tplRes = await req(ownerCookie, 'POST', '/api/customizer/templates', {
      title: 'Owner Custom VIP Undertaking',
      category: 'Sales (Secondary)',
      kind: 'Letter',
      letterhead: true,
      content: '<h1>VIP Undertaking</h1><p>Client: [Client Name]</p>',
    })
    check('Owner creates own document template without IT (200)', tplRes.statusCode === 200 && String(tplRes.json().code).startsWith('OWN-'))

    // 4. Exact Brand-Free RERA Form I A2A Template (A2A-01)
    const a2aRow = q.get<any>(`SELECT * FROM doc_templates WHERE code = 'A2A-01' AND deleted_at IS NULL`)
    check('Brand-Free RERA Form I A2A-01 template installed automatically', !!a2aRow)
    check('A2A-01 has letterhead=0 (zero SWK brand asset / watermark)', Number(a2aRow.letterhead) === 0)
    const a2aHtml = String(a2aRow.content || '')
    check('A2A-01 contains verbatim RERA By-Law 85 & Parts 1-4 clauses',
      a2aHtml.includes('AGENT to AGENT AGREEMENT') &&
      a2aHtml.includes('By-Law No. (85) of 2006') &&
      a2aHtml.includes('PART 1. THE PARTIES') &&
      a2aHtml.includes('PART 2. THE PROPERTY') &&
      a2aHtml.includes('PART 3. THE COMMISSION') &&
      a2aHtml.includes('PART 4. SIGNATURES') &&
      a2aHtml.includes('IN THE EVENT AGENT A DOES NOT RESPOND WITHIN 24 HOURS'),
    )
    check('A2A-01 contains ZERO SWK brand assets, logos, or pre-filled deal names',
      !a2aHtml.includes('/brand/') && !a2aHtml.toLowerCase().includes('swk properties') && !a2aHtml.toLowerCase().includes('labor camp'),
    )

    // 5. Complete Social Media Suite + 30-Day Batch Scheduler + Owner -> Meenakshi Handover
    const socialAgentDeny = await req(agentCookie, 'GET', '/api/social/overview')
    check('Restricted field agent BLOCKED from Social Media Suite (403)', socialAgentDeny.statusCode === 403)

    const gen30 = await req(ownerCookie, 'POST', '/api/social/generate-30-days', {
      start_date: '2026-12-01',
      batch_label: 'Dec 2026 SWK 30-Day Blitz',
      platforms: ['Instagram', 'Facebook', 'LinkedIn', 'TikTok'],
      posting_time: '11:00',
      days: 30,
    })
    check('Owner generates complete 30-day schedule in one click (30 posts)', gen30.statusCode === 200 && gen30.json().created_count === 30, gen30.body)

    const handover = await req(ownerCookie, 'POST', '/api/social/handover', {
      batch_label: 'Dec 2026 SWK 30-Day Blitz',
      handover_note: 'Please schedule all 30 posts on Meta Business Suite & LinkedIn',
    })
    check('Owner hands over all 30 posts to Meenakshi in one click', handover.statusCode === 200 && handover.json().handed_over_count === 30, handover.body)

    const meenakshiNotif = q.get<any>(
      `SELECT * FROM notifications WHERE user_id = ? AND title LIKE 'Social Media Handover%' ORDER BY id DESC LIMIT 1`,
      meenakshiId,
    )
    check('Meenakshi receives live notification upon 30-day handover', !!meenakshiNotif)

    const firstPostId = gen30.json().ids[0]
    const meenakshiSubmit = await req(meenakshiCookie, 'POST', `/api/social/posts/${firstPostId}/submit`, {
      status: 'Published',
      published_url: 'https://instagram.com/p/SWK-Dec-Day01',
      submission_notes: 'Published live on Instagram Reels at 11:00 GST',
    })
    check('Meenakshi marks handed-over post Published with live URL (200)', meenakshiSubmit.statusCode === 200 && meenakshiSubmit.json().status === 'Published')

    const ownerConfirmNotif = q.get<any>(
      `SELECT * FROM notifications WHERE user_id = ? AND title LIKE 'Social Post Published%' ORDER BY id DESC LIMIT 1`,
      ownerId,
    )
    check('Owner receives live confirmation notification when Meenakshi publishes', !!ownerConfirmNotif)

    // 6. Master Data Registry, 360° Master Log & Gap Analyzer
    const masterOv = await req(ownerCookie, 'GET', '/api/master-hub/overview')
    const masterData = masterOv.json()
    check('Master Data Hub overview returns registry, gaps & security shield',
      masterOv.statusCode === 200 &&
      masterData.registry.length >= 15 &&
      masterData.gaps.length >= 4 &&
      masterData.security.blockedProbesSinceBoot >= 3,
      { reg: masterData.registry?.length, blocked: masterData.security?.blockedProbesSinceBoot },
    )
    const masterLog = await req(ownerCookie, 'GET', '/api/master-hub/log?source=all')
    check('360° Master Log returns unified audit/login/attachment timeline', masterLog.statusCode === 200 && masterLog.json().rows.length > 0)
    const masterCsv = await req(ownerCookie, 'GET', '/api/master-hub/log/export.csv')
    check('Master Log CSV export streams valid UTF-8 CSV', masterCsv.statusCode === 200 && masterCsv.body.includes('Timestamp (UTC)'))
    const agentMasterDeny = await req(agentCookie, 'GET', '/api/master-hub/overview')
    check('Restricted field agent BLOCKED from Master Data Hub (403)', agentMasterDeny.statusCode === 403)

    console.log(`\nALL ${passed} V4.0.0 MASTER PLATFORM, SECURITY, A2A & SOCIAL MEDIA CHECKS PASSED!`)
  } finally {
    await app.close()
    try { mainDb.close() } catch { /* ignore */ }
    if (createdTmp) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
