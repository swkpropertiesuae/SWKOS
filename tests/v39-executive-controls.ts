import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const createdTmp = !process.env.DATA_DIR
const tmpDir = process.env.DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'swk-v39-exec-'))
process.env.DATA_DIR = tmpDir
process.env.APP_SECRET = process.env.APP_SECRET || 'test-v39-executive-controls-secret-0123456789'
process.env.DEMO_ENABLED = 'false'

async function main() {
  const { mainDb, q } = await import('../src/server/db')
  const { syncSchema } = await import('../src/server/schema')
  const { seedReference } = await import('../src/server/seed')
  const { hashPassword } = await import('../src/server/auth')
  const { buildApp } = await import('../src/server/app')
  const { classifyAutoTaskLane, preflightOmniRequest } = await import('../src/server/ai/omni-router')
  const { loadUser } = await import('../src/server/auth')

  syncSchema()
  await seedReference()

  const pw = 'SwkV39ExecTest-2026!'
  const setPw = (email: string) => {
    const uid = q.val<number>(`SELECT id FROM users WHERE lower(email) = ?`, email.toLowerCase())!
    assert.ok(uid, `Seeded user missing: ${email}`)
    q.run(`UPDATE users SET password_hash = ?, must_change_password = 0, active = 1 WHERE id = ?`, hashPassword(pw), uid)
    return uid
  }

  const ownerId = setPw('shabib@swk.properties')
  const adminId = setPw('admin@swk.properties')
  const haseebId = setPw('haseeb@swk.properties')
  const meenakshiId = setPw('meenakshi@swk.properties')
  const rahabaId = setPw('rahaba@swk.properties')
  const agentId = setPw('saifullah@swk.properties')
  void adminId; void haseebId; void meenakshiId; void rahabaId; void agentId

  const app = await buildApp()
  let ipSeq = 10
  const login = async (email: string) => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: `127.0.39.${ipSeq++}`,
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web' },
      payload: { email, password: pw },
    })
    assert.equal(r.statusCode, 200, `Login failed for ${email}: ${r.body}`)
    return 'swk_sid=' + r.cookies.find((c: any) => c.name === 'swk_sid')!.value
  }

  const req = (cookie: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: any) =>
    app.inject({
      method,
      url,
      headers: {
        cookie,
        'x-swk-client': 'web',
        ...(payload ? { 'content-type': 'application/json' } : {}),
      },
      ...(payload ? { payload } : {}),
    })

  try {
    const cOwner = await login('shabib@swk.properties')
    const cAdmin = await login('admin@swk.properties')
    const cHaseeb = await login('haseeb@swk.properties')
    const cMeenakshi = await login('meenakshi@swk.properties')
    const cRahaba = await login('rahaba@swk.properties')
    const cAgent = await login('saifullah@swk.properties')

    // -----------------------------------------------------------------------
    // 1. Shabib's Corner — Exclusively Owner
    // -----------------------------------------------------------------------
    const scOwner = await req(cOwner, 'GET', '/api/shabibs-corner/overview')
    assert.equal(scOwner.statusCode, 200, `Owner must access Shabib's Corner: ${scOwner.body}`)
    const scData = scOwner.json()
    assert.equal(scData.stages.length, 8, 'Shabib Corner must expose all 8 end-to-end brokerage stages')
    for (const [label, cookie] of [
      ['Admin', cAdmin],
      ['Haseeb', cHaseeb],
      ['Meenakshi', cMeenakshi],
      ['Rahaba', cRahaba],
      ['Field Agent', cAgent],
    ] as const) {
      const deny = await req(cookie, 'GET', '/api/shabibs-corner/overview')
      assert.equal(deny.statusCode, 403, `${label} must NOT access Shabib's Corner (got ${deny.statusCode})`)
    }
    console.log('✓ 1. Shabib’s Corner strictly exclusive to Owner (403 for all other roles)')

    // -----------------------------------------------------------------------
    // 2. Hardcoded Emergency Mandatory-Field Override — Owner & Admin ONLY
    // -----------------------------------------------------------------------
    // Without override, missing mandatory fields fail with 400
    const noOv = await req(cOwner, 'POST', '/api/e/properties', { sub_community: 'Dubai Marina' })
    assert.equal(noOv.statusCode, 400, 'Blank mandatory fields without override must fail with 400')

    // Owner with override succeeds with blank title* & property_type*
    const ovOwner = await req(cOwner, 'POST', '/api/e/properties', {
      sub_community: 'Dubai Marina',
      _emergency_override: true,
      _emergency_override_reason: 'VIP off-market booking — details arriving tomorrow morning',
    })
    assert.equal(ovOwner.statusCode, 201, `Owner emergency override must succeed: ${ovOwner.body}`)
    const ovOwnerRec = ovOwner.json()
    assert.equal(ovOwnerRec.custom?._emergency_override?.by_email, 'shabib@swk.properties')
    assert.ok(Array.isArray(ovOwnerRec.custom?._emergency_override?.bypassed_fields))
    assert.ok(ovOwnerRec.custom._emergency_override.bypassed_fields.includes('title'))
    const ovAuditCount = q.val<number>(`SELECT COUNT(*) FROM audit_log WHERE action = 'emergency_override' AND record_id = ?`, ovOwnerRec.id)
    assert.equal(ovAuditCount, 1, 'Emergency override must be stamped into permanent audit_log')

    // Admin with override also succeeds
    const ovAdmin = await req(cAdmin, 'POST', '/api/e/leads', {
      phone: '+971501234567',
      _emergency_override: true,
      _emergency_override_reason: 'Urgent walk-in executive lead capture',
    })
    assert.equal(ovAdmin.statusCode, 201, `Admin emergency override must succeed: ${ovAdmin.body}`)

    // Manager (Haseeb), Office Admin (Meenakshi), HR (Rahaba), and Agent MUST get 403
    for (const [label, cookie] of [
      ['Haseeb (Manager)', cHaseeb],
      ['Meenakshi (Office Admin)', cMeenakshi],
      ['Rahaba (HR)', cRahaba],
      ['Saifullah (Agent)', cAgent],
    ] as const) {
      const denyOv = await req(cookie, 'POST', '/api/e/leads', {
        phone: '+971509998888',
        _emergency_override: true,
        _emergency_override_reason: 'Unauthorized bypass attempt',
      })
      assert.equal(denyOv.statusCode, 403, `${label} must receive 403 on emergency override (got ${denyOv.statusCode})`)
    }
    console.log('✓ 2. Hardcoded Emergency Mandatory-Field Override verified (Owner/Admin 201 + audit_log; all others 403)')

    // -----------------------------------------------------------------------
    // 3. 158+ Document Templates — Exact 5-Person Whitelist & Zero-Trace Stealth
    // -----------------------------------------------------------------------
    for (const [label, cookie] of [
      ['Owner', cOwner],
      ['Admin', cAdmin],
      ['Haseeb', cHaseeb],
      ['Meenakshi', cMeenakshi],
      ['Rahaba', cRahaba],
    ] as const) {
      const t = await req(cookie, 'GET', '/api/e/doc_templates?pageSize=5')
      assert.equal(t.statusCode, 200, `${label} must have access to document templates (got ${t.statusCode})`)
      assert.ok(t.json().total >= 50, `${label} must see template library`)
      const m = await req(cookie, 'GET', '/api/meta')
      assert.ok(m.json().entities.some((e: any) => e.key === 'doc_templates'), `${label} meta includes doc_templates`)
    }

    // Restricted Field Agent sees ZERO trace anywhere
    const tAgent = await req(cAgent, 'GET', '/api/e/doc_templates?pageSize=5')
    assert.equal(tAgent.statusCode, 403, 'Field agent must receive 403 on /api/e/doc_templates')
    assert.ok(!/template|158|studio/i.test(tAgent.body), `Error message must NOT reveal templates exist: ${tAgent.body}`)

    const sAgent = await req(cAgent, 'GET', '/api/studio/fill-data')
    assert.equal(sAgent.statusCode, 403, 'Field agent must receive 403 on /api/studio/*')
    assert.ok(!/template|158|studio/i.test(sAgent.body), `Studio error must NOT leak templates: ${sAgent.body}`)

    const mAgent = await req(cAgent, 'GET', '/api/meta')
    assert.equal(mAgent.statusCode, 200)
    assert.ok(
      !mAgent.json().entities.some((e: any) => e.key === 'doc_templates' || e.key === 'studio_documents'),
      'Field agent /api/meta must NOT contain doc_templates or studio_documents',
    )
    console.log('✓ 3. 158+ Document Templates locked to exact 5-person whitelist with zero-trace stealth')

    // -----------------------------------------------------------------------
    // 4. Confidential AI Format Converter & Bulk Importer (Exact 5-Person Whitelist)
    // -----------------------------------------------------------------------
    const sampleRawCsv = [
      'Tower Name,Unit No,Beds,Asking Price,Community,Size SqFt',
      'Marina Gate 1,2402,2BR,2.85M,Dubai Marina,1380',
      'Azizi Riviera 43,310,Studio,860K,MBR City,420',
    ].join('\n')

    for (const [label, cookie] of [
      ['Owner', cOwner],
      ['Admin', cAdmin],
      ['Haseeb', cHaseeb],
      ['Meenakshi', cMeenakshi],
      ['Rahaba', cRahaba],
    ] as const) {
      const an = await req(cookie, 'POST', '/api/ai-importer/analyze', {
        target_entity: 'properties',
        raw_text: sampleRawCsv,
      })
      assert.equal(an.statusCode, 200, `${label} must access Confidential AI Importer: ${an.body}`)
      const d = an.json()
      assert.equal(d.total_rows, 2)
      assert.equal(d.normalized_rows[0].price, 2_850_000)
      assert.equal(d.normalized_rows[0].bedrooms, 2)
      assert.equal(d.normalized_rows[1].price, 860_000)
      assert.equal(d.normalized_rows[1].bedrooms, 0)
    }

    // Commit converted properties directly into SWK OS as Owner
    const anOwner = (await req(cOwner, 'POST', '/api/ai-importer/analyze', {
      target_entity: 'properties',
      raw_text: sampleRawCsv,
    })).json()
    const commitRes = await req(cOwner, 'POST', '/api/ai-importer/commit', {
      target_entity: 'properties',
      rows: anOwner.normalized_rows,
    })
    assert.equal(commitRes.statusCode, 200, `Commit failed: ${commitRes.body}`)
    assert.equal(commitRes.json().created, 2, 'Both AI-converted properties must import cleanly')

    // Vault isolation preserved: Meenakshi/Rahaba cannot import into crm_vault
    const vaultDeny = await req(cMeenakshi, 'POST', '/api/ai-importer/analyze', {
      target_entity: 'crm_vault',
      raw_text: sampleRawCsv,
    })
    assert.equal(vaultDeny.statusCode, 403, 'Meenakshi must not import into encrypted CRM Vault')

    // Restricted Field Agent blocked from Confidential AI Importer completely
    const impAgent = await req(cAgent, 'POST', '/api/ai-importer/analyze', {
      target_entity: 'properties',
      raw_text: sampleRawCsv,
    })
    assert.equal(impAgent.statusCode, 403, 'Field agent must be blocked from Confidential AI Importer')
    console.log('✓ 4. Confidential AI Format Converter & Bulk Importer verified for exact 5-person whitelist')

    // -----------------------------------------------------------------------
    // 5. Owner AI Brain — Auto Best-Model-Per-Task Orchestrator
    // -----------------------------------------------------------------------
    assert.equal(classifyAutoTaskLane([{ role: 'user', content: 'Analyse RERA Form F penalty clause and DLD 4% fee calculation' }]).lane, 'reasoning')
    assert.equal(classifyAutoTaskLane([{ role: 'user', content: 'Translate this lease renewal notice into Arabic' }]).lane, 'translate')
    assert.equal(classifyAutoTaskLane([{ role: 'user', content: 'Latest Dubai Creek Harbour price per sqft benchmark 2026' }]).lane, 'search')
    assert.equal(classifyAutoTaskLane([{ role: 'user', content: 'Draft quick thanks' }]).lane, 'fast')
    assert.equal(classifyAutoTaskLane([{ role: 'user', content: 'Inspect photo' }], true).lane, 'vision')

    // Verify Owner auto-mode selects Tier-1 Reasoning route when configured
    const now = new Date().toISOString()
    q.run(
      `INSERT INTO ai_provider_routes (label, provider_key, base_url, api_key_enc, model_id, lanes_json, tier, priority, zero_retention, rpm_limit, rpd_limit, enabled, created_at, updated_at)
       VALUES (?, ?, ?, '', ?, ?, ?, ?, 1, 60, 1000, 1, ?, ?)`,
      'Tier1 Flagship Reasoner', 'openai', 'https://api.openai.com/v1', 'o3-mini', '["reasoning","general"]', 'tier1', 10, now, now,
    )
    q.run(
      `INSERT INTO ai_provider_routes (label, provider_key, base_url, api_key_enc, model_id, lanes_json, tier, priority, zero_retention, rpm_limit, rpd_limit, enabled, created_at, updated_at)
       VALUES (?, ?, ?, '', ?, ?, ?, ?, 1, 60, 1000, 1, ?, ?)`,
      'Free Fast Model', 'groq', 'https://api.groq.com/openai/v1', 'llama-3.1-8b-instant', '["fast","general"]', 'free', 10, now, now,
    )

    const ownerUser = loadUser(ownerId)!
    const pfReason = preflightOmniRequest({
      lane: 'auto',
      user: ownerUser,
      messages: [{ role: 'user', content: 'Compare RERA Form F and Ejari compliance risk for an AED 5M villa' }],
    })
    assert.equal(pfReason.lane, 'reasoning')
    assert.equal(pfReason.candidates[0]!.model_id, 'o3-mini', 'Owner auto-mode must prioritize Tier-1 Reasoning model')
    assert.ok(pfReason.routingReason && pfReason.routingReason.length > 10)

    const pfFast = preflightOmniRequest({
      lane: 'auto',
      user: ownerUser,
      messages: [{ role: 'user', content: 'Say thank you' }],
    })
    assert.equal(pfFast.lane, 'fast')
    assert.equal(pfFast.candidates[0]!.model_id, 'llama-3.1-8b-instant', 'Quick draft must route to lowest-latency Fast model')
    console.log('✓ 5. Owner AI Brain Automatic Best-Model-Per-Task Orchestrator verified')

    // -----------------------------------------------------------------------
    // 6. SWK Inside External Messaging Bridge (WhatsApp / Facebook / Instagram)
    // -----------------------------------------------------------------------
    const chOwner = await req(cOwner, 'GET', '/api/chat/external-channels')
    assert.equal(chOwner.statusCode, 200)
    const chOwnerData = chOwner.json()
    assert.equal(chOwnerData.can_dispatch, true)
    assert.deepEqual(
      chOwnerData.channels.map((c: any) => c.platform),
      ['whatsapp', 'facebook', 'instagram'],
    )

    const chAgent = await req(cAgent, 'GET', '/api/chat/external-channels')
    assert.equal(chAgent.statusCode, 200)
    assert.equal(chAgent.json().can_dispatch, false)
    const sendAgent = await req(cAgent, 'POST', '/api/chat/external-send', {
      platform: 'whatsapp',
      recipient: '+971501234567',
      text: 'Test',
    })
    assert.equal(sendAgent.statusCode, 403, 'Field agent cannot send unmasked direct external messages from Inside')
    console.log('✓ 6. SWK Inside Omnichannel External Messaging Bridge (WA/FB/IG) & RBAC verified')

    // -----------------------------------------------------------------------
    // 7. Attendance QR (Wi-Fi Locked, NO GPS Gate) + Live Field GPS RBAC
    // -----------------------------------------------------------------------
    const pubWifi = (await app.inject({ method: 'GET', url: '/api/public/reception-qr/wifi-config' })).json()
    assert.equal(pubWifi.office_gps_enforce, false, 'Office QR remains Wi-Fi locked only (no 75m GPS gate)')
    assert.equal(pubWifi.qr_mode, 'rotating')
    assert.equal(pubWifi.qr_step_s, 20)

    const liveOwner = await req(cOwner, 'GET', '/api/field-gps/live')
    assert.equal(liveOwner.statusCode, 200, 'Owner can access Live Field GPS Map')
    const liveAgent = await req(cAgent, 'GET', '/api/field-gps/live')
    assert.equal(liveAgent.statusCode, 403, 'Field agent blocked from team Live Field GPS Map')
    const liveHr = await req(cRahaba, 'GET', '/api/field-gps/live')
    assert.equal(liveHr.statusCode, 403, 'HR blocked from Live Field GPS Map (Owner/Admin/Haseeb only)')
    console.log('✓ 7. Attendance QR Wi-Fi lock & Field Duty GPS RBAC verified')

    console.log('\nALL v3.9.0 EXECUTIVE CONTROLS & RBAC TESTS PASSED!')
  } finally {
    await app.close()
    try { mainDb.close() } catch {}
    if (createdTmp) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
    }
  }
}

main().catch(err => {
  console.error('v3.9.0 executive controls test failed:', err)
  process.exit(1)
})
