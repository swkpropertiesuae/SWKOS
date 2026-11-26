import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swk-v4-restructure-'))
process.env.DATA_DIR = tmpDir
process.env.DATABASE_URL = ''
process.env.APP_SECRET = 'test-swk-v4-restructure-secret-0123456789'
process.env.DEMO_ENABLED = 'false'

async function run() {
  const { mainDb, q } = await import('../src/server/db')
  const { syncSchema } = await import('../src/server/schema')
  const { seedReference, syncSwkStaffRoster } = await import('../src/server/seed')
  const { hashPassword } = await import('../src/server/auth')
  const { buildApp } = await import('../src/server/app')

  syncSchema()
  await seedReference()
  syncSwkStaffRoster()

  const pw = 'SwkV4Test#2026!'
  const setPw = (email: string) => {
    const id = q.val<number>(`SELECT id FROM users WHERE lower(email) = ? AND deleted_at IS NULL`, email.toLowerCase())
    if (id) q.run(`UPDATE users SET password_hash = ?, must_change_password = 0, active = 1 WHERE id = ?`, hashPassword(pw), id)
    return id
  }
  const ownerId = setPw('shabib@swk.properties')
  const adminId = setPw('admin@swk.properties')
  const haseebId = setPw('haseeb@swk.properties')
  const meenakshiId = setPw('meenakshi@swk.properties')
  const sanketId = setPw('sanketh@swk.rent')
  const saifullahId = setPw('saifullah@swk.properties')
  assert.ok(ownerId && adminId && haseebId && meenakshiId && sanketId && saifullahId)

  const app = await buildApp()
  let ipSeq = 10
  const login = async (email: string) => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: `127.0.50.${ipSeq++}`,
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web' },
      payload: { email, password: pw },
    })
    assert.equal(r.statusCode, 200, `Login failed for ${email}: ${r.body}`)
    return 'swk_sid=' + r.cookies.find((c: any) => c.name === 'swk_sid')!.value
  }
  const hdr = (cookie: string) => ({ cookie, 'x-swk-client': 'web', 'content-type': 'application/json' })

  try {
    // 1. Staff roster: Samarth deleted, Sanket Katariya renamed (keeping sanketh@swk.rent login!)
    const samarthUser = q.get(`SELECT id FROM users WHERE lower(email) LIKE 'samarth@%' AND deleted_at IS NULL`)
    const samarthEmp = q.get(`SELECT id FROM employees WHERE (emp_no = 'EMP-SAMARTH' OR lower(name) = 'samarth') AND deleted_at IS NULL`)
    assert.equal(samarthUser, undefined, 'Samarth user must be deleted')
    assert.equal(samarthEmp, undefined, 'Samarth employee must be deleted')
    const sanketRow = q.get<any>(`SELECT name, email FROM users WHERE lower(email) = 'sanketh@swk.rent' AND deleted_at IS NULL`)
    assert.equal(sanketRow?.name, 'Sanket Katariya', 'Sanketh must be renamed to Sanket Katariya')
    assert.equal(sanketRow?.email, 'sanketh@swk.rent', 'Sanket login email must stay untouched')

    const cOwner = await login('shabib@swk.properties')
    const cAdmin = await login('admin@swk.properties')
    const cHaseeb = await login('haseeb@swk.properties')
    const cMeenakshi = await login('meenakshi@swk.properties')
    const cAgent = await login('saifullah@swk.properties')

    // 2. Meenakshi Reception QR access (allowed) vs Admin/Vault/FieldLive/Shabib's Corner (denied)
    const qrMeenakshi = await app.inject({ method: 'GET', url: '/api/swk-ops/reception-token', headers: hdr(cMeenakshi) })
    assert.equal(qrMeenakshi.statusCode, 200, `Meenakshi must generate Reception QR: ${qrMeenakshi.body}`)
    assert.ok(qrMeenakshi.json().token, 'Reception QR token returned to Meenakshi')
    const qrAgent = await app.inject({ method: 'GET', url: '/api/swk-ops/reception-token', headers: hdr(cAgent) })
    assert.equal(qrAgent.statusCode, 403, 'Regular agent cannot generate Reception QR')
    const ctrlMeenakshi = await app.inject({ method: 'GET', url: '/api/swk-ops/attendance-control', headers: hdr(cMeenakshi) })
    assert.equal(ctrlMeenakshi.statusCode, 403, 'Meenakshi cannot access elevated attendance-control device approvals')

    // 3. Shabib's Corner & Privacy Fast Track: STRICT Owner-only isolation
    for (const [who, ck] of [['Admin', cAdmin], ['Haseeb', cHaseeb], ['Meenakshi', cMeenakshi], ['Agent', cAgent]] as const) {
      const r1 = await app.inject({ method: 'GET', url: '/api/owner-corner/overview', headers: hdr(ck) })
      assert.equal(r1.statusCode, 403, `${who} must be 403 blocked from Shabib's Corner`)
      const r2 = await app.inject({ method: 'POST', url: '/api/privacy-fast-track/jobs', headers: hdr(ck), payload: { client_name: 'X', property_label: 'Y' } })
      assert.equal(r2.statusCode, 403, `${who} must be 403 blocked from Privacy Fast Track`)
    }
    const ftCreate = await app.inject({
      method: 'POST',
      url: '/api/privacy-fast-track/jobs',
      headers: hdr(cOwner),
      payload: { client_name: 'VIP Cash Investor', property_label: 'Marina Gate 2 · 3201', community: 'Dubai Marina', deal_value_aed: 3200000, expected_cash_aed: 64000, urgency: 'CASH_IMMEDIATE', stage_12: '06_form_f' },
    })
    assert.equal(ftCreate.statusCode, 201, ftCreate.body)
    const ftJob = ftCreate.json()
    assert.ok(String(ftJob.ref_code).startsWith('FT-'))

    const ftInvCreate = await app.inject({
      method: 'POST',
      url: '/api/privacy-fast-track/invoices',
      headers: hdr(cOwner),
      payload: { job_id: ftJob.id, client_name: 'VIP Cash Investor', description: 'Private Advisory Fee', subtotal_aed: 50000, vat_rate: 5 },
    })
    assert.equal(ftInvCreate.statusCode, 201, ftInvCreate.body)
    assert.equal(ftInvCreate.json().total_aed, 52500)

    const ownerOv = await app.inject({ method: 'GET', url: '/api/owner-corner/overview', headers: hdr(cOwner) })
    assert.equal(ownerOv.statusCode, 200)
    assert.equal(ownerOv.json().fast_track.jobs.length, 1)
    assert.equal(ownerOv.json().consolidated_ledger.fast_track_total_aed, 52500)

    // 4. Master Log (CORE) 20 Registries + Office Admin Approval Gate
    const mlSummary = await app.inject({ method: 'GET', url: '/api/core-masters/summary', headers: hdr(cMeenakshi) })
    assert.equal(mlSummary.statusCode, 200)
    assert.equal(mlSummary.json().items.length, 20, 'CORE Master Log must expose all 20 registries')
    assert.equal(mlSummary.json().requires_owner_approval, true)
    assert.ok(String(mlSummary.json().head_office.address).includes('Al Saqr'), 'Head office must be Al Saqr Building SZR')

    // Meenakshi blocked from direct create on communities
    const directMut = await app.inject({
      method: 'POST',
      url: '/api/e/communities',
      headers: hdr(cMeenakshi),
      payload: { code: 'TESTDIRECT', name: 'Should Fail', emirate: 'Dubai', area: 'Dubai' },
    })
    assert.equal(directMut.statusCode, 403, 'Office Admin must NOT directly edit Master Log')

    // Meenakshi submits proposal -> Owner Shabib approves -> record commits!
    const propRes = await app.inject({
      method: 'POST',
      url: '/api/core-masters/change-requests',
      headers: hdr(cMeenakshi),
      payload: { entity: 'communities', action: 'create', payload: { code: 'TILAL', name: 'Tilal Al Ghaf', emirate: 'Dubai', area: 'Dubai', avg_price_sqft: 2150 }, reason: 'New luxury villa launch' },
    })
    assert.equal(propRes.statusCode, 201, propRes.body)
    const reqId = propRes.json().id

    // Admin cannot approve Master Log requests (Owner only)
    const badDecide = await app.inject({ method: 'POST', url: `/api/core-masters/change-requests/${reqId}/decide`, headers: hdr(cAdmin), payload: { decision: 'approve' } })
    assert.equal(badDecide.statusCode, 403)

    const goodDecide = await app.inject({ method: 'POST', url: `/api/core-masters/change-requests/${reqId}/decide`, headers: hdr(cOwner), payload: { decision: 'approve', note: 'Approved' } })
    assert.equal(goodDecide.statusCode, 200, goodDecide.body)
    assert.ok(q.val(`SELECT id FROM communities WHERE code = 'TILAL' AND deleted_at IS NULL`), 'Approved Master Log request must commit to DB')

    // 5. 12-Stage Pipeline + Command Center + Client Vault + Mortgage Desk + AI Case Studies
    const p12 = await app.inject({ method: 'GET', url: '/api/pipeline/12-stage', headers: hdr(cOwner) })
    assert.equal(p12.statusCode, 200)
    assert.equal(p12.json().stages.length, 12, 'Pipeline must have 12 stages')

    const cc = await app.inject({ method: 'GET', url: '/api/command-center/overview', headers: hdr(cOwner) })
    assert.equal(cc.statusCode, 200, cc.body)
    assert.ok(cc.json().attendance.total >= 10)

    const partyRes = await app.inject({ method: 'POST', url: '/api/e/parties', headers: hdr(cOwner), payload: { name: 'Vault Test Client', is_customer: true } })
    assert.equal(partyRes.statusCode, 201)
    const partyId = partyRes.json().id
    const vDet = await app.inject({ method: 'GET', url: `/api/client-vault/${partyId}`, headers: hdr(cOwner) })
    assert.equal(vDet.statusCode, 200)
    assert.equal(vDet.json().checklist.length, 13, 'Client Document Vault must enforce all 13 core documents')
    const vUpd = await app.inject({ method: 'POST', url: `/api/client-vault/${partyId}/item`, headers: hdr(cOwner), payload: { doc_key: 'passport', status: 'Verified', file_name: 'passport.pdf' } })
    assert.equal(vUpd.statusCode, 200)
    assert.equal(vUpd.json().status, 'Verified')

    const mBook = await app.inject({
      method: 'POST',
      url: '/api/mortgage-desk/events',
      headers: hdr(cOwner),
      payload: { client_name: 'Vault Test Client', bank_name: 'Emirates NBD', event_type: 'Valuation Booking', due_date: '2026-12-01', loan_amount_aed: 1600000 },
    })
    assert.equal(mBook.statusCode, 201)

    const csList = await app.inject({ method: 'GET', url: '/api/ai-case-studies', headers: hdr(cOwner) })
    assert.equal(csList.statusCode, 200)
    assert.ok(csList.json().rows.length >= 10, 'AI Case-Study Lab must pre-seed >= 10 UAE scenarios')
    const csMatch = await app.inject({ method: 'POST', url: '/api/ai-case-studies/query', headers: hdr(cOwner), payload: { scenario: 'bank valuation shortfall gap Creek Harbour' } })
    assert.equal(csMatch.statusCode, 200)
    assert.ok(csMatch.json().matches.length >= 1)

    // 6. Website Studio & Public CMS — 100% ZERO-SHABIB HARD LOCK
    const blockedUpdate = await app.inject({
      method: 'PUT',
      url: '/api/website/site-updates',
      headers: hdr(cOwner),
      payload: { announcement: 'Meet Shabib Siraj at SWK Properties' },
    })
    assert.equal(blockedUpdate.statusCode, 400, 'Website Studio MUST 400-reject any mention of Shabib Siraj')

    const cleanUpdate = await app.inject({
      method: 'PUT',
      url: '/api/website/site-updates',
      headers: hdr(cOwner),
      payload: { announcement: 'Direct Dubai Off-Plan Access · RERA ORN 51517 · 0% Buyer Fee' },
    })
    assert.equal(cleanUpdate.statusCode, 200, cleanUpdate.body)

    const pubCms = await app.inject({ method: 'GET', url: '/api/public/website/cms' })
    assert.equal(pubCms.statusCode, 200)
    assert.equal(/shabib|siraj/i.test(pubCms.body), false, 'Public website CMS MUST NEVER contain Shabib/Siraj')

    console.log('ALL SWK OS v4 RESTRUCTURE E2E TESTS PASSED!')
  } finally {
    await app.close()
    try { mainDb.close() } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

run().catch(err => {
  console.error('EXECUTIVE OS RESTRUCTURE TEST FAILED:', err)
  process.exit(1)
})
