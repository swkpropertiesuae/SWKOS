import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const createdTmp = !process.env.DATA_DIR
const tmpDir = process.env.DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'swk-sip-turn-hardening-'))
process.env.DATA_DIR = tmpDir
process.env.APP_SECRET = process.env.APP_SECRET || 'test-sip-turn-hardening-secret-0123456789'
process.env.DEMO_ENABLED = 'false'

async function main() {
  const { mainDb, q } = await import('../src/server/db')
  const { syncSchema } = await import('../src/server/schema')
  const { seedReference } = await import('../src/server/seed')
  const { hashPassword } = await import('../src/server/auth')
  const { buildApp } = await import('../src/server/app')

  syncSchema()
  await seedReference()

  const pw = 'SwkSipHardened-2026!'
  const setPw = (email: string) => {
    const uid = q.val<number>(`SELECT id FROM users WHERE lower(email) = ?`, email.toLowerCase())!
    q.run(`UPDATE users SET password_hash = ?, must_change_password = 0, active = 1 WHERE id = ?`, hashPassword(pw), uid)
    return uid
  }
  const adminId = setPw('admin@swk.properties')
  const agentId = setPw('saifullah@swk.properties')
  assert.ok(adminId && agentId)

  const app = await buildApp()
  let seq = 20
  const login = async (email: string) => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: `127.0.10.${seq++}`,
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web' },
      payload: { email, password: pw },
    })
    assert.equal(r.statusCode, 200, `Login failed: ${r.body}`)
    return 'swk_sid=' + r.cookies.find((c: any) => c.name === 'swk_sid')!.value
  }

  try {
    const cookieAdmin = await login('admin@swk.properties')
    const cookieAgent = await login('saifullah@swk.properties')

    const turnSecret = 'coturn-dubai-me-central-1-shared-secret-2026!'
    const pbxSecret = 'swk_pbx_hardened_webhook_secret_2026'

    // 1. Configure SIP trunk with Regional UAE coturn TURN + Short-Lived WS Session Tokens
    const cfgPut = await app.inject({
      method: 'PUT',
      url: '/api/sip/admin/config',
      headers: { cookie: cookieAdmin, 'x-swk-client': 'web', 'content-type': 'application/json' },
      payload: {
        sip_enabled: true,
        sip_ws_url: 'wss://pbx.swk.properties:8089/ws',
        sip_domain: 'pbx.swk.properties',
        sip_webhook_secret: pbxSecret,
        sip_ws_token_ttl_s: 600,
        sip_turn_urls: [
          'turn:turn-dxb.swk.properties:3478?transport=udp',
          'turn:turn-dxb.swk.properties:3478?transport=tcp',
          'turns:turn-dxb.swk.properties:443?transport=tcp',
        ].join('\n'),
        sip_turn_secret: turnSecret,
        sip_turn_ttl_s: 1800,
        sip_turn_region: 'UAE / Dubai (me-central-1)',
        sip_ice_transport_policy: 'all',
        sip_ice_servers: [{ urls: 'stun:stun.l.google.com:19302' }],
      },
    })
    assert.equal(cfgPut.statusCode, 200, `PUT admin/config failed: ${cfgPut.body}`)
    assert.ok(!cfgPut.body.includes(turnSecret), 'PUT response must mask sip_turn_secret')

    // Verify sip_turn_secret is encrypted at rest in settings table & masked on GET
    const rawSetting = q.val<string>(`SELECT value FROM settings WHERE key = 'sip_turn_secret'`)!
    assert.ok(rawSetting.includes('enc:v1:'), 'sip_turn_secret must be AES-256-GCM encrypted at rest')
    const cfgGet = await app.inject({
      method: 'GET',
      url: '/api/sip/admin/config',
      headers: { cookie: cookieAdmin, 'x-swk-client': 'web' },
    })
    assert.equal(cfgGet.statusCode, 200)
    assert.equal(cfgGet.json().sip_turn_secret, '********')
    assert.equal(cfgGet.json().sip_turn_secret_set, true)
    assert.ok(!cfgGet.body.includes(turnSecret), 'GET admin/config must never leak raw coturn secret')

    // 2. Provision agent SIP extension with static trunk password (which MUST NEVER reach browser!)
    const staticTrunkPassword = 'SuperSecretStaticTrunkPassword-NEVER-TO-BROWSER!'
    const extPut = await app.inject({
      method: 'PUT',
      url: '/api/sip/admin/extensions',
      headers: { cookie: cookieAdmin, 'x-swk-client': 'web', 'content-type': 'application/json' },
      payload: {
        user_id: agentId,
        extension_no: '104',
        sip_username: 'ext104',
        sip_password: staticTrunkPassword,
        display_name: 'Saifullah SWK',
        allow_direct_dial: false,
        active: true,
      },
    })
    assert.equal(extPut.statusCode, 200, `Provision ext failed: ${extPut.body}`)

    // 3. Fetch /api/sip/my-config -> ZERO static password, valid short-lived WS token + RFC 8489 coturn TURN
    const myCfg = await app.inject({
      method: 'GET',
      url: '/api/sip/my-config',
      headers: { cookie: cookieAgent, 'x-swk-client': 'web' },
    })
    assert.equal(myCfg.statusCode, 200, `my-config failed: ${myCfg.body}`)
    assert.ok(!myCfg.body.includes(staticTrunkPassword), 'Static SIP password must NEVER leak to browser!')
    assert.ok(!myCfg.body.includes(turnSecret), 'Raw coturn shared secret must NEVER leak to browser!')

    const cfgJson = myCfg.json()
    assert.equal(cfgJson.configured, true)
    assert.equal(cfgJson.auth_mode, 'ephemeral_ws_token')
    assert.equal(cfgJson.extension.sip_password, undefined)
    assert.match(cfgJson.ws_session_token, /^swk_ws1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    assert.equal(cfgJson.ws_token_ttl_s, 600)
    assert.ok(cfgJson.ws_url_tokenized.includes(`swk_ws_token=${encodeURIComponent(cfgJson.ws_session_token)}`))
    assert.equal(cfgJson.turn_configured, true)
    assert.equal(cfgJson.turn_region, 'UAE / Dubai (me-central-1)')
    assert.equal(cfgJson.ice_transport_policy, 'all')

    // Cryptographically verify RFC 8489 / coturn REST ephemeral TURN credential!
    const turnEntry = cfgJson.ice_servers.find((s: any) =>
      Array.isArray(s.urls) ? s.urls.some((u: string) => u.startsWith('turn:')) : String(s.urls).startsWith('turn:'),
    )
    assert.ok(turnEntry, 'ice_servers must contain regional coturn TURN entry')
    assert.equal(turnEntry.urls.length, 3, 'Must include UDP, TCP, and TLS 443 TURN URLs for UAE 5G traversal')
    const [expStr, uidStr, extStr] = String(turnEntry.username).split(':')
    assert.equal(Number(uidStr), agentId)
    assert.equal(extStr, '104')
    assert.ok(Number(expStr) > Math.floor(Date.now() / 1000) + 1700, 'TURN expiry must be ~1800s in future')
    const expectedTurnCred = crypto.createHmac('sha1', turnSecret).update(turnEntry.username).digest('base64')
    assert.equal(turnEntry.credential, expectedTurnCred, 'TURN credential must match RFC 8489 coturn HMAC-SHA1')

    // 4. PBX verifies valid short-lived WS session token via /api/public/sip/:secret/verify-ws-token
    const verifyOk = await app.inject({
      method: 'POST',
      url: `/api/public/sip/${pbxSecret}/verify-ws-token`,
      headers: { 'content-type': 'application/json' },
      payload: { token: cfgJson.ws_session_token },
    })
    assert.equal(verifyOk.statusCode, 200, `verify-ws-token failed: ${verifyOk.body}`)
    assert.equal(verifyOk.json().valid, true)
    assert.equal(verifyOk.json().extension_no, '104')
    assert.equal(verifyOk.json().sip_username, 'ext104')

    // Tampered token MUST be rejected 401
    const verifyTampered = await app.inject({
      method: 'POST',
      url: `/api/public/sip/${pbxSecret}/verify-ws-token`,
      headers: { 'content-type': 'application/json' },
      payload: { token: cfgJson.ws_session_token.slice(0, -4) + 'AAAA' },
    })
    assert.equal(verifyTampered.statusCode, 401, 'Tampered WS token must be rejected with 401')

    // 5. Refresh endpoint mints a fresh short-lived WS token + fresh TURN credentials (for Wi-Fi <-> 5G handoff)
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/api/sip/session-token',
      headers: { cookie: cookieAgent, 'x-swk-client': 'web', 'content-type': 'application/json' },
      payload: {},
    })
    assert.equal(refreshRes.statusCode, 200, `session-token refresh failed: ${refreshRes.body}`)
    const freshJson = refreshRes.json()
    assert.notEqual(freshJson.ws_token_jti, cfgJson.ws_token_jti, 'Refresh must mint distinct jti')
    assert.ok(!refreshRes.body.includes(staticTrunkPassword), 'Refresh must NEVER expose static password')

    // 6. Explicit revoke immediately invalidates the revoked WS token at the PBX verifier
    const revokeRes = await app.inject({
      method: 'POST',
      url: '/api/sip/session-token/revoke',
      headers: { cookie: cookieAgent, 'x-swk-client': 'web', 'content-type': 'application/json' },
      payload: { jti: cfgJson.ws_token_jti },
    })
    assert.equal(revokeRes.statusCode, 200)
    const verifyRevoked = await app.inject({
      method: 'POST',
      url: `/api/public/sip/${pbxSecret}/verify-ws-token`,
      headers: { 'content-type': 'application/json' },
      payload: { token: cfgJson.ws_session_token },
    })
    assert.equal(verifyRevoked.statusCode, 401, 'Revoked WS token must be rejected 401')

    // 7. Logging out immediately revokes all active SIP WS session tokens tied to that session!
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: cookieAgent, 'x-swk-client': 'web' },
    })
    assert.equal(logoutRes.statusCode, 200)
    const verifyAfterLogout = await app.inject({
      method: 'POST',
      url: `/api/public/sip/${pbxSecret}/verify-ws-token`,
      headers: { 'content-type': 'application/json' },
      payload: { token: freshJson.ws_session_token },
    })
    assert.equal(verifyAfterLogout.statusCode, 401, 'Logout must automatically revoke linked SIP WS session tokens')

    // 8. Re-login, mint token, then Admin disables extension -> PBX verifier immediately rejects!
    const cookieAgent2 = await login('saifullah@swk.properties')
    const fresh2 = (
      await app.inject({
        method: 'POST',
        url: '/api/sip/session-token',
        headers: { cookie: cookieAgent2, 'x-swk-client': 'web', 'content-type': 'application/json' },
        payload: {},
      })
    ).json()
    await app.inject({
      method: 'PUT',
      url: '/api/sip/admin/extensions',
      headers: { cookie: cookieAdmin, 'x-swk-client': 'web', 'content-type': 'application/json' },
      payload: { user_id: agentId, extension_no: '104', sip_username: 'ext104', active: false },
    })
    const verifyDisabled = await app.inject({
      method: 'POST',
      url: `/api/public/sip/${pbxSecret}/verify-ws-token`,
      headers: { 'content-type': 'application/json' },
      payload: { token: fresh2.ws_session_token },
    })
    assert.ok(verifyDisabled.statusCode === 401 || verifyDisabled.statusCode === 403, 'Disabling extension must invalidate active WS token')

    console.log('✅ SIP/VoIP Ephemeral WS Token + Regional coturn TURN Hardening Test PASSED (all assertions green!)')
  } finally {
    await app.close()
    if (!process.env.DATABASE_URL) {
      try { mainDb?.close?.() } catch { /* ignore */ }
    }
    if (createdTmp) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  }
}

main().catch(err => {
  console.error('❌ SIP/TURN hardening test failed:', err)
  process.exit(1)
})
