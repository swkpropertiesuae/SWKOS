import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

// Set isolated temp DATA_DIR BEFORE importing any server modules
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swk-sip-vault-'))
process.env.DATA_DIR = tmpDir
process.env.DATABASE_URL = ''
process.env.APP_SECRET = 'test-sip-vault-app-secret-0123456789abcdef'

async function run() {
  const { mainDb, q } = await import('../src/server/db')
  const { syncSchema } = await import('../src/server/schema')
  const { seedReference } = await import('../src/server/seed')
  const { hashPassword } = await import('../src/server/auth')
  const { encryptSecret, setSettings } = await import('../src/server/settings')
  const { liveBus } = await import('../src/server/notify')
  const pushMod = await import('../src/server/integrations/push')
  const appMod = await import('../src/server/app')

  let app: Awaited<ReturnType<typeof appMod.buildApp>> | null = null
  let ipSeq = 10
  const nextIp = () => `127.0.9.${ipSeq++}`

  try {
    syncSchema()
    await seedReference()

    // Ensure redactUrl hides /api/public/sip/<secret>/...
    assert.equal(
      appMod.redactUrl('/api/public/sip/my-super-secret/resolve-vault-token'),
      '/api/public/sip/[redacted]/resolve-vault-token',
      'redactUrl must redact secret in /api/public/sip/:secret/...',
    )

    const dxbBranchId = q.val<number>(`SELECT id FROM branches WHERE code = 'DXB'`)!
    const portalRoleId = q.val<number>(`SELECT id FROM roles WHERE name = 'Customer Portal'`)!
    const now = new Date().toISOString()
    const pw = 'SwkSipPass-2026!'

    const setKnownPass = (email: string) => {
      const uid = q.val<number>(`SELECT id FROM users WHERE lower(email) = ?`, email.toLowerCase())!
      assert.ok(uid, `Expected seeded user ${email}`)
      q.run(`UPDATE users SET password_hash = ?, must_change_password = 0, active = 1 WHERE id = ?`, hashPassword(pw), uid)
      return uid
    }

    const adminId = setKnownPass('admin@swk.properties')
    const haseebId = setKnownPass('haseeb@swk.properties')
    const staffAId = setKnownPass('saifullah@swk.properties')
    const staffBId = setKnownPass('fareed@swk.rent')

    const partyId = q.insert(
      `INSERT INTO parties(name, is_customer, status, created_at, updated_at) VALUES (?,?,?,?,?)`,
      'Sip Portal Test Client',
      1,
      'Active',
      now,
      now,
    )
    const portalEmail = 'portal-sip-blocked@a.example'
    q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, party_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      'Portal Blocked User',
      portalEmail,
      hashPassword(pw),
      portalRoleId,
      dxbBranchId,
      partyId,
      1,
      0,
      now,
      now,
    )

    // Seed vault properties with known real owner phone numbers
    const rawOwnerPhoneA = '+971509876543'
    const rawOwnerDigitsA = '971509876543'
    const rawOwnerLocalDigitsA = '509876543'

    const propAId = q.insert(
      `INSERT INTO crm_vault_properties(
        external_deal_id, source_dataset, source_sheet, deal_division,
        dubai_area_community, building_or_project, exact_unit_door_no,
        owner_name, direct_mobile_enc, direct_mobile_masked,
        assigned_user_id, assigned_by_user_id, assigned_at, visible_fields_json,
        vault_status, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      'SIP-TEST-001',
      'custom_import',
      'Test',
      'SECONDARY_SALES',
      'JVC',
      'Bloom Heights',
      '1204',
      'Secret Owner Alpha',
      encryptSecret(rawOwnerPhoneA),
      'MASKED •••• 6543',
      staffAId,
      adminId,
      now,
      JSON.stringify({ show_owner_name: false, allow_masked_call: true, allow_masked_whatsapp: true }),
      'Assigned',
      now,
      now,
    )

    const propNoCallId = q.insert(
      `INSERT INTO crm_vault_properties(
        external_deal_id, source_dataset, source_sheet, deal_division,
        dubai_area_community, building_or_project, exact_unit_door_no,
        owner_name, direct_mobile_enc, direct_mobile_masked,
        assigned_user_id, assigned_by_user_id, assigned_at, visible_fields_json,
        vault_status, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      'SIP-TEST-002',
      'custom_import',
      'Test',
      'SECONDARY_SALES',
      'JVC',
      'Pantheon Elysee',
      '508',
      'Secret Owner Locked',
      encryptSecret('+971501234999'),
      'MASKED •••• 4999',
      staffAId,
      adminId,
      now,
      JSON.stringify({ show_owner_name: false, allow_masked_call: false }),
      'Assigned',
      now,
      now,
    )

    const propBId = q.insert(
      `INSERT INTO crm_vault_properties(
        external_deal_id, source_dataset, source_sheet, deal_division,
        dubai_area_community, building_or_project, exact_unit_door_no,
        owner_name, direct_mobile_enc, direct_mobile_masked,
        assigned_user_id, assigned_by_user_id, assigned_at, visible_fields_json,
        vault_status, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      'SIP-TEST-003',
      'custom_import',
      'Test',
      'SECONDARY_SALES',
      'Business Bay',
      'Executive Tower',
      '2503',
      'Secret Owner Bravo',
      encryptSecret('+971557778899'),
      'MASKED •••• 8899',
      staffBId,
      adminId,
      now,
      JSON.stringify({ show_owner_name: false, allow_masked_call: true }),
      'Assigned',
      now,
      now,
    )

    app = await appMod.buildApp()

    const loginWeb = async (email: string) => {
      const res = await app!.inject({
        method: 'POST',
        url: '/api/auth/login',
        remoteAddress: nextIp(),
        headers: { 'content-type': 'application/json', 'x-swk-client': 'web' },
        payload: { email, password: pw },
      })
      assert.equal(res.statusCode, 200, `Login failed for ${email}: ${res.body}`)
      return 'swk_sid=' + res.cookies.find((c: any) => c.name === 'swk_sid')!.value
    }

    const cookieAdmin = await loginWeb('admin@swk.properties')
    const cookieHaseeb = await loginWeb('haseeb@swk.properties')
    const cookieStaffA = await loginWeb('saifullah@swk.properties')
    const cookieStaffB = await loginWeb('fareed@swk.rent')
    const cookiePortal = await loginWeb(portalEmail)

    const headersFor = (cookie: string, json = true) => ({
      cookie,
      'x-swk-client': 'web',
      ...(json ? { 'content-type': 'application/json' } : {}),
    })

    // -------------------------------------------------------------------------
    // Portal users must receive 403 on all /api/sip/* endpoints
    // -------------------------------------------------------------------------
    for (const check of [
      { method: 'GET' as const, url: '/api/sip/my-config' },
      { method: 'GET' as const, url: '/api/sip/directory' },
      { method: 'POST' as const, url: `/api/sip/vault-call/${propAId}`, payload: {} },
      { method: 'GET' as const, url: '/api/sip/calls' },
      { method: 'GET' as const, url: '/api/sip/admin/extensions' },
    ]) {
      const res: { statusCode: number; body: string } = await app.inject({
        method: check.method,
        url: check.url,
        headers: headersFor(cookiePortal, !!check.payload),
        payload: check.payload,
      })
      assert.equal(res.statusCode, 403, `Portal user calling ${check.method} ${check.url} must get 403, got ${res.statusCode}: ${res.body}`)
    }

    // Before SIP is configured, my-config returns { configured: false }
    const unconfRes = await app.inject({
      method: 'GET',
      url: '/api/sip/my-config',
      headers: headersFor(cookieStaffA, false),
    })
    assert.equal(unconfRes.statusCode, 200, `Expected 200 on unconfigured my-config, got ${unconfRes.statusCode}: ${unconfRes.body}`)
    assert.equal(unconfRes.json().configured, false)

    // -------------------------------------------------------------------------
    // Admin RBAC: Staff A and Manager Haseeb must receive 403 on /api/sip/admin/*
    // -------------------------------------------------------------------------
    for (const [label, cookie] of [
      ['Staff A', cookieStaffA],
      ['Manager Haseeb', cookieHaseeb],
    ] as const) {
      const getExtRes: { statusCode: number; body: string } = await app.inject({
        method: 'GET',
        url: '/api/sip/admin/extensions',
        headers: headersFor(cookie, false),
      })
      assert.equal(getExtRes.statusCode, 403, `${label} must get 403 on GET /api/sip/admin/extensions, got ${getExtRes.statusCode}`)

      const putExtRes: { statusCode: number; body: string } = await app.inject({
        method: 'PUT',
        url: '/api/sip/admin/extensions',
        headers: headersFor(cookie),
        payload: { user_id: staffAId, extension_no: '999', sip_username: '999', sip_password: 'bad' },
      })
      assert.equal(putExtRes.statusCode, 403, `${label} must get 403 on PUT /api/sip/admin/extensions, got ${putExtRes.statusCode}`)

      const putCfgRes: { statusCode: number; body: string } = await app.inject({
        method: 'PUT',
        url: '/api/sip/admin/config',
        headers: headersFor(cookie),
        payload: { sip_enabled: true },
      })
      assert.equal(putCfgRes.statusCode, 403, `${label} must get 403 on PUT /api/sip/admin/config, got ${putCfgRes.statusCode}`)
    }

    // -------------------------------------------------------------------------
    // Admin configures SIP trunk + auto-generated secret + provisions extensions
    // -------------------------------------------------------------------------
    const autoCfgRes = await app.inject({
      method: 'PUT',
      url: '/api/sip/admin/config',
      headers: headersFor(cookieAdmin),
      payload: {
        sip_enabled: true,
        sip_ws_url: 'wss://pbx.local:8089/ws',
        sip_domain: 'pbx.local',
      },
    })
    assert.equal(autoCfgRes.statusCode, 200, `Auto-secret enable failed: ${autoCfgRes.body}`)
    const autoSecret = autoCfgRes.json().generated_webhook_secret as string
    assert.ok(autoSecret && autoSecret.startsWith('swk_sip_'), 'First enable without secret must auto-generate sip_webhook_secret')

    const pbxSecret = 'pbx-super-secret-2026-token'
    const cfgRes = await app.inject({
      method: 'PUT',
      url: '/api/sip/admin/config',
      headers: headersFor(cookieAdmin),
      payload: {
        sip_enabled: true,
        sip_ws_url: 'wss://pbx.local:8089/ws',
        sip_domain: 'pbx.local',
        sip_outbound_proxy: 'sip:proxy.pbx.local',
        sip_ice_servers: [{ urls: 'stun:stun.l.google.com:19302' }],
        sip_caller_id_mode: 'company_main',
        sip_vault_bridge_prefix: '99',
        sip_webhook_secret: pbxSecret,
      },
    })
    assert.equal(cfgRes.statusCode, 200, `Admin config PUT failed: ${cfgRes.body}`)

    const getCfgAdmin = await app.inject({
      method: 'GET',
      url: '/api/sip/admin/config',
      headers: headersFor(cookieAdmin, false),
    })
    assert.equal(getCfgAdmin.statusCode, 200)
    const adminCfgJson = getCfgAdmin.json()
    assert.equal(adminCfgJson.sip_webhook_secret, '********', 'Admin GET config must mask sip_webhook_secret')
    assert.equal(adminCfgJson.sip_vault_bridge_prefix, '99')

    const extARes = await app.inject({
      method: 'PUT',
      url: '/api/sip/admin/extensions',
      headers: headersFor(cookieAdmin),
      payload: {
        user_id: staffAId,
        extension_no: '101',
        sip_username: 'ext101',
        sip_password: 'ExtSecretPassword-A!',
        display_name: 'Saifullah SWK',
        allow_direct_dial: false,
        active: true,
      },
    })
    assert.equal(extARes.statusCode, 200, `Provision ext A failed: ${extARes.body}`)

    // Updating extension without sip_password preserves existing encrypted password
    const extAUpdateRes = await app.inject({
      method: 'PUT',
      url: '/api/sip/admin/extensions',
      headers: headersFor(cookieAdmin),
      payload: {
        user_id: staffAId,
        extension_no: '101',
        sip_username: 'ext101',
        display_name: 'Saifullah SWK Updated',
        allow_direct_dial: false,
        active: true,
      },
    })
    assert.equal(extAUpdateRes.statusCode, 200)

    const extBRes = await app.inject({
      method: 'PUT',
      url: '/api/sip/admin/extensions',
      headers: headersFor(cookieAdmin),
      payload: {
        user_id: staffBId,
        extension_no: '102',
        sip_username: 'ext102',
        sip_password: 'ExtSecretPassword-B!',
        display_name: 'Fareed SWK',
        allow_direct_dial: true,
        active: true,
      },
    })
    assert.equal(extBRes.statusCode, 200, `Provision ext B failed: ${extBRes.body}`)

    // Verify encrypted at rest and masked in admin GET
    const rawEncPassA = q.val<string>(`SELECT sip_password_enc FROM sip_extensions WHERE user_id = ?`, staffAId)!
    assert.ok(rawEncPassA.startsWith('enc:v1:'), 'sip_password_enc must be AES-256-GCM encrypted at rest')
    const listExtAdmin = await app.inject({
      method: 'GET',
      url: '/api/sip/admin/extensions',
      headers: headersFor(cookieAdmin, false),
    })
    assert.equal(listExtAdmin.statusCode, 200)
    assert.ok(!listExtAdmin.body.includes('ExtSecretPassword-A!'), 'Admin extension listing must mask sip_password')
    assert.ok(!listExtAdmin.body.includes('ExtSecretPassword-B!'), 'Admin extension listing must mask sip_password')

    // -------------------------------------------------------------------------
    // Assertion 1: Staff A sees ONLY Staff A's extension in /api/sip/my-config
    // -------------------------------------------------------------------------
    const myCfgA = await app.inject({
      method: 'GET',
      url: '/api/sip/my-config',
      headers: headersFor(cookieStaffA, false),
    })
    assert.equal(myCfgA.statusCode, 200, `my-config failed: ${myCfgA.body}`)
    const myCfgAJson = myCfgA.json()
    assert.equal(myCfgAJson.configured, true)
    assert.equal(myCfgAJson.ws_url, 'wss://pbx.local:8089/ws')
    assert.equal(myCfgAJson.domain, 'pbx.local')
    assert.equal(myCfgAJson.has_vault_prefix, true)
    assert.equal(myCfgAJson.extension.extension_no, '101')
    assert.equal(myCfgAJson.extension.sip_username, 'ext101')
    assert.equal(myCfgAJson.extension.sip_password, 'ExtSecretPassword-A!')
    assert.ok(!myCfgA.body.includes('ExtSecretPassword-B!'), 'Staff A must NEVER see Staff B SIP password')
    assert.ok(!myCfgA.body.includes('ext102'), 'Staff A my-config must NEVER contain Staff B extension')
    assert.ok(!myCfgA.body.includes(pbxSecret), 'Staff A my-config must NEVER leak sip_webhook_secret')

    // Directory exposes colleague extension numbers/names only, zero passwords
    const dirRes = await app.inject({
      method: 'GET',
      url: '/api/sip/directory',
      headers: headersFor(cookieStaffA, false),
    })
    assert.equal(dirRes.statusCode, 200)
    const dirJson = dirRes.json()
    assert.equal(dirJson.rows.length, 2)
    assert.ok(!dirRes.body.includes('ExtSecretPassword-A!') && !dirRes.body.includes('ExtSecretPassword-B!'), 'Directory must never leak passwords')

    // -------------------------------------------------------------------------
    // Assertion 2: Masked SIP Vault token returns dial_uri with ZERO raw digits
    // -------------------------------------------------------------------------
    const vaultCallRes = await app.inject({
      method: 'POST',
      url: `/api/sip/vault-call/${propAId}`,
      headers: headersFor(cookieStaffA),
      payload: {},
    })
    assert.equal(vaultCallRes.statusCode, 200, `vault-call failed: ${vaultCallRes.body}`)
    const vaultCallJson = vaultCallRes.json()
    assert.equal(vaultCallJson.ok, true)
    assert.equal(vaultCallJson.mode, 'sip_token')
    assert.match(vaultCallJson.dial_uri, /^sip:99vt_[0-9a-f]{24}@pbx\.local$/)
    assert.match(vaultCallJson.dial_target, /^99vt_[0-9a-f]{24}$/)
    assert.equal(vaultCallJson.expires_in_s, 60)
    assert.ok(!vaultCallRes.body.includes(rawOwnerPhoneA), 'Response must NOT contain raw owner phone')
    assert.ok(!vaultCallRes.body.includes(rawOwnerDigitsA), 'Response must NOT contain raw owner digits')
    assert.ok(!vaultCallRes.body.includes(rawOwnerLocalDigitsA), 'Response must NOT contain raw owner local digits')

    // Staff A cannot dial Staff B's property or a property with allow_masked_call = false
    const wrongPropRes = await app.inject({
      method: 'POST',
      url: `/api/sip/vault-call/${propBId}`,
      headers: headersFor(cookieStaffA),
      payload: {},
    })
    assert.equal(wrongPropRes.statusCode, 403, 'Agent cannot dial property assigned to another agent')

    const disabledPropRes = await app.inject({
      method: 'POST',
      url: `/api/sip/vault-call/${propNoCallId}`,
      headers: headersFor(cookieStaffA),
      payload: {},
    })
    assert.equal(disabledPropRes.statusCode, 403, 'Agent cannot dial property when allow_masked_call is false')

    // -------------------------------------------------------------------------
    // Assertion 3: PBX resolve-vault-token single-use + 404 replay + 403 bad secret
    // -------------------------------------------------------------------------
    const token = String(vaultCallJson.dial_target).slice(2) // strip prefix '99' -> 'vt_...'
    assert.ok(token.startsWith('vt_'))

    const badSecretResolve = await app.inject({
      method: 'POST',
      url: '/api/public/sip/wrong-secret-000/resolve-vault-token',
      headers: { 'content-type': 'application/json' },
      payload: { token },
    })
    assert.equal(badSecretResolve.statusCode, 403, `Bad PBX secret must return 403, got ${badSecretResolve.statusCode}`)

    const validResolve = await app.inject({
      method: 'POST',
      url: `/api/public/sip/${pbxSecret}/resolve-vault-token`,
      headers: { 'content-type': 'application/json' },
      payload: { token },
    })
    assert.equal(validResolve.statusCode, 200, `Valid PBX resolve failed: ${validResolve.body}`)
    assert.deepEqual(validResolve.json(), {
      ok: true,
      destination_e164: rawOwnerPhoneA,
      property_id: propAId,
    })

    // 2nd replay must return 404
    const replayResolve = await app.inject({
      method: 'POST',
      url: `/api/public/sip/${pbxSecret}/resolve-vault-token`,
      headers: { 'content-type': 'application/json' },
      payload: { token },
    })
    assert.equal(replayResolve.statusCode, 404, `Replayed vault token must return 404, got ${replayResolve.statusCode}`)

    // Expired token must return 404
    const expiredTok = 'vt_' + crypto.randomBytes(12).toString('hex')
    const expiredHash = crypto.createHash('sha256').update(expiredTok).digest('hex')
    q.run(
      `INSERT INTO sip_vault_call_tokens(token_hash, property_id, user_id, target_phone_enc, created_at, expires_at) VALUES (?,?,?,?,?,?)`,
      expiredHash,
      propAId,
      staffAId,
      encryptSecret(rawOwnerPhoneA),
      new Date(Date.now() - 120_000).toISOString(),
      new Date(Date.now() - 60_000).toISOString(),
    )
    const expiredResolve = await app.inject({
      method: 'POST',
      url: `/api/public/sip/${pbxSecret}/resolve-vault-token`,
      headers: { 'content-type': 'application/json' },
      payload: { token: expiredTok },
    })
    assert.equal(expiredResolve.statusCode, 404, `Expired vault token must return 404, got ${expiredResolve.statusCode}`)

    // -------------------------------------------------------------------------
    // Assertion 4: PBX incoming-wake triggers swk_calls_sos push & liveBus event
    // -------------------------------------------------------------------------
    const pushed: Array<{ channel: string; payload: any }> = []
    pushMod.setPushTransportForTests({
      sendFcm: async (_sub, _fcmMessage, payload) => {
        pushed.push({ channel: payload.channel, payload })
      },
    })
    q.run(
      `INSERT INTO push_subscriptions(user_id, device_id, channel, endpoint_or_token, active, created_at) VALUES (?,?,?,?,1,?)`,
      staffAId,
      'saif-pixel-1',
      'fcm',
      'fcm-token-saifullah-001',
      now,
    )

    const liveEvents: any[] = []
    const onSipLive = (ev: any) => liveEvents.push(ev)
    liveBus.on(`sip:${staffAId}`, onSipLive)

    const badWakeRes = await app.inject({
      method: 'POST',
      url: '/api/public/sip/wrong-secret/incoming-wake',
      headers: { 'content-type': 'application/json' },
      payload: { extension_no: '101', caller_id: '+971501112233', caller_name: 'VIP Buyer' },
    })
    assert.equal(badWakeRes.statusCode, 403)

    const wakeRes = await app.inject({
      method: 'POST',
      url: `/api/public/sip/${pbxSecret}/incoming-wake`,
      headers: { 'content-type': 'application/json' },
      payload: { extension_no: '101', caller_id: '+971501112233', caller_name: 'VIP Buyer', call_id: 'pbx-call-77' },
    })
    assert.equal(wakeRes.statusCode, 200, `incoming-wake failed: ${wakeRes.body}`)
    liveBus.off(`sip:${staffAId}`, onSipLive)

    assert.equal(pushed.length, 1, `Expected 1 push dispatch, got ${pushed.length}`)
    assert.equal(pushed[0]!.channel, 'swk_calls_sos')
    assert.equal(pushed[0]!.payload.url, '/phone?incoming=1')
    assert.ok(pushed[0]!.payload.tag.startsWith('swk-sip-'))
    assert.equal(liveEvents.length, 1, 'Expected liveBus sip:<userId> wake event')
    assert.equal(liveEvents[0]!.extension_no, '101')

    // -------------------------------------------------------------------------
    // Call logging & role-scoped call history (zero raw token/number leakage)
    // -------------------------------------------------------------------------
    const logARes = await app.inject({
      method: 'POST',
      url: '/api/sip/calls/log',
      headers: headersFor(cookieStaffA),
      payload: {
        call_id: 'sip-test-call-a1',
        direction: 'out',
        to_number: vaultCallJson.dial_uri,
        caller_name: 'Masked Vault Owner',
        duration_sec: 42,
        status: 'Completed',
        outcome: 'Callback requested',
        summary: `Called ${vaultCallJson.dial_target}`,
        is_vault_masked: true,
        property_id: propAId,
      },
    })
    assert.equal(logARes.statusCode, 200, `Log call A failed: ${logARes.body}`)

    const logBRes = await app.inject({
      method: 'POST',
      url: '/api/sip/calls/log',
      headers: headersFor(cookieStaffB),
      payload: {
        call_id: 'sip-test-call-b1',
        direction: 'out',
        to_number: '101',
        caller_name: 'Saifullah SWK',
        duration_sec: 15,
        status: 'Completed',
        outcome: 'Information given',
        summary: 'Internal extension sync',
      },
    })
    assert.equal(logBRes.statusCode, 200, `Log call B failed: ${logBRes.body}`)

    const callsA = await app.inject({
      method: 'GET',
      url: '/api/sip/calls',
      headers: headersFor(cookieStaffA, false),
    })
    assert.equal(callsA.statusCode, 200)
    const callsAJson = callsA.json()
    assert.equal(callsAJson.rows.length, 1, 'Non-leadership staff must see ONLY their own SIP calls')
    assert.equal(callsAJson.rows[0].call_id, 'sip-test-call-a1')
    assert.ok(!callsA.body.includes(token), 'Agent call history must mask vt_* vault token')
    assert.ok(!callsA.body.includes(rawOwnerDigitsA), 'Agent call history must never contain raw owner digits')

    const callsLeader = await app.inject({
      method: 'GET',
      url: '/api/sip/calls',
      headers: headersFor(cookieHaseeb, false),
    })
    assert.equal(callsLeader.statusCode, 200)
    assert.equal(callsLeader.json().rows.length, 2, 'Leadership must see all team SIP calls')

    // -------------------------------------------------------------------------
    // Fallback to bridge mode when sip_vault_bridge_prefix is cleared
    // -------------------------------------------------------------------------
    setSettings({ sip_vault_bridge_prefix: '' })
    const bridgeFallback = await app.inject({
      method: 'POST',
      url: `/api/sip/vault-call/${propAId}`,
      headers: headersFor(cookieStaffA),
      payload: {},
    })
    // Since Twilio/Webhook isn't configured, initiateMaskedBridgeCall fails closed with 409 (and zero phone digits!)
    assert.equal(bridgeFallback.statusCode, 409)
    assert.ok(!bridgeFallback.body.includes(rawOwnerDigitsA))

    // When webhook bridge IS configured, fallback returns { ok: true, mode: 'bridge', ... } without raw owner digits
    const mockServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ call_sid: 'wh-mock-call-1' }))
    })
    await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve))
    try {
      const addr = mockServer.address() as { port: number }
      setSettings({
        masked_call_provider: 'webhook',
        masked_call_webhook_url: `http://127.0.0.1:${addr.port}/bridge`,
        masked_call_caller_id: '+97144001234',
      })
      const bridgeOk = await app.inject({
        method: 'POST',
        url: `/api/sip/vault-call/${propAId}`,
        headers: headersFor(cookieStaffA),
        payload: {},
      })
      assert.equal(bridgeOk.statusCode, 200, `Bridge mode fallback failed: ${bridgeOk.body}`)
      assert.equal(bridgeOk.json().ok, true)
      assert.equal(bridgeOk.json().mode, 'bridge')
      assert.equal(bridgeOk.json().provider, 'webhook')
      assert.ok(!bridgeOk.body.includes(rawOwnerDigitsA), 'Bridge mode response must never contain raw owner phone')
    } finally {
      await new Promise<void>((resolve) => mockServer.close(() => resolve()))
    }

    // Admin DELETE extension removes Staff B's extension
    const delExtB = await app.inject({
      method: 'DELETE',
      url: `/api/sip/admin/extensions/${staffBId}`,
      headers: headersFor(cookieAdmin, false),
    })
    assert.equal(delExtB.statusCode, 200)
    const myCfgB = await app.inject({
      method: 'GET',
      url: '/api/sip/my-config',
      headers: headersFor(cookieStaffB, false),
    })
    assert.equal(myCfgB.statusCode, 200)
    assert.equal(myCfgB.json().configured, false)

    // Regression [Important #3]: When SIP trunk IS fully configured (including sip_ws_url + sip_vault_bridge_prefix),
    // an agent with NO active sip_extensions row (or inactive extension, or missing sip_ws_url) must fall back to bridge mode!
    setSettings({ sip_vault_bridge_prefix: '99', sip_ws_url: 'wss://pbx.local:8089/ws' })
    const mockBridgeNoExt = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ call_sid: 'wh-no-ext-fallback-1' }))
    })
    await new Promise<void>((resolve) => mockBridgeNoExt.listen(0, '127.0.0.1', resolve))
    try {
      const addr = mockBridgeNoExt.address() as { port: number }
      setSettings({
        masked_call_provider: 'webhook',
        masked_call_webhook_url: `http://127.0.0.1:${addr.port}/bridge`,
        masked_call_caller_id: '+97144001234',
      })
      // Staff B's extension was deleted above, so Staff B has no active extension row
      const noExtVaultCall = await app.inject({
        method: 'POST',
        url: `/api/sip/vault-call/${propBId}`,
        headers: headersFor(cookieStaffB),
        payload: {},
      })
      assert.equal(noExtVaultCall.statusCode, 200, `Agent without SIP extension must fall back to bridge: ${noExtVaultCall.body}`)
      assert.equal(noExtVaultCall.json().mode, 'bridge', 'Agent without SIP extension must receive mode=bridge, not sip_token')
      assert.ok(!noExtVaultCall.body.includes('971557778899'), 'Fallback bridge must never expose raw owner phone')

      // Disable Staff A's extension (active: false) -> Staff A also falls back to bridge mode
      const disableExtA = await app.inject({
        method: 'PUT',
        url: '/api/sip/admin/extensions',
        headers: headersFor(cookieAdmin),
        payload: {
          user_id: staffAId,
          extension_no: '101',
          sip_username: 'ext101',
          display_name: 'Saifullah SWK Disabled',
          active: false,
        },
      })
      assert.equal(disableExtA.statusCode, 200)
      const inactiveExtCall = await app.inject({
        method: 'POST',
        url: `/api/sip/vault-call/${propAId}`,
        headers: headersFor(cookieStaffA),
        payload: {},
      })
      assert.equal(inactiveExtCall.statusCode, 200)
      assert.equal(inactiveExtCall.json().mode, 'bridge', 'Inactive extension must fall back to bridge mode')

      // Re-enable Staff A's extension, clear sip_ws_url -> also falls back to bridge mode
      await app.inject({
        method: 'PUT',
        url: '/api/sip/admin/extensions',
        headers: headersFor(cookieAdmin),
        payload: {
          user_id: staffAId,
          extension_no: '101',
          sip_username: 'ext101',
          display_name: 'Saifullah SWK',
          active: true,
        },
      })
      setSettings({ sip_ws_url: '' })
      const missingWsCall = await app.inject({
        method: 'POST',
        url: `/api/sip/vault-call/${propAId}`,
        headers: headersFor(cookieStaffA),
        payload: {},
      })
      assert.equal(missingWsCall.statusCode, 200)
      assert.equal(missingWsCall.json().mode, 'bridge', 'Missing sip_ws_url must fall back to bridge mode')
    } finally {
      await new Promise<void>((resolve) => mockBridgeNoExt.close(() => resolve()))
    }

    console.log('ALL SIP SOFTPHONE & DUAL MASKED-VAULT PROTOCOL TESTS PASSED!')
  } finally {
    try { pushMod.setPushTransportForTests(null) } catch {}
    if (app) {
      try { await app.close() } catch {}
    }
    try { mainDb.close() } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
