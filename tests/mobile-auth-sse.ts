import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Set isolated temp DATA_DIR BEFORE importing any server modules
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swk-mobile-sse-'))
process.env.DATA_DIR = tmpDir
process.env.DATABASE_URL = ''
process.env.APP_SECRET = 'test-mobile-sse-app-secret-0123456789abcdef'

function makeEcP256Jwk() {
  const { publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = publicKey.export({ format: 'jwk' }) as { kty: string; crv: string; x: string; y: string }
  const expectedDeviceId = crypto.createHash('sha256').update(`${jwk.x}.${jwk.y}`).digest('hex').slice(0, 40)
  return { jwk, expectedDeviceId }
}

async function openSseFirstChunk(url: string, headers: Record<string, string> = {}): Promise<{ status: number; contentType: string; headers: Headers; firstChunk: string }> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 4000)
  try {
    const res = await fetch(url, { headers, signal: ac.signal })
    const contentType = res.headers.get('content-type') || ''
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      return { status: res.status, contentType, headers: res.headers, firstChunk: text }
    }
    const reader = res.body.getReader()
    const { value } = await reader.read()
    const firstChunk = value ? Buffer.from(value).toString('utf8') : ''
    try { await reader.cancel() } catch {}
    return { status: res.status, contentType, headers: res.headers, firstChunk }
  } finally {
    clearTimeout(timer)
    ac.abort()
  }
}

async function run() {
  const { mainDb, q } = await import('../src/server/db')
  const { syncSchema } = await import('../src/server/schema')
  const { seedReference } = await import('../src/server/seed')
  const authMod = await import('../src/server/auth')
  const appMod = await import('../src/server/app')
  const { config } = await import('../src/server/config')
  const { setSettings } = await import('../src/server/settings')

  let app: Awaited<ReturnType<typeof appMod.buildApp>> | null = null
  let addrCounter = 10
  const nextIp = () => `127.0.2.${addrCounter++}`

  try {
    syncSchema()
    await seedReference()

    const {
      hashPassword,
      issueStreamTicket,
      consumeStreamTicket,
      destroyDeviceSessions,
    } = authMod as typeof authMod & {
      issueStreamTicket: (userId: number) => { ticket: string; expires_in_s: number }
      consumeStreamTicket: (ticket: string) => any
      destroyDeviceSessions: (deviceId: string) => number
    }

    assert.equal(typeof issueStreamTicket, 'function', 'issueStreamTicket must be exported from src/server/auth.ts')
    assert.equal(typeof consumeStreamTicket, 'function', 'consumeStreamTicket must be exported from src/server/auth.ts')
    assert.equal(typeof destroyDeviceSessions, 'function', 'destroyDeviceSessions must be exported from src/server/auth.ts')

    const dxbBranchId = q.val<number>(`SELECT id FROM branches WHERE code = 'DXB'`)!
    const staffRoleId = q.val<number>(`SELECT id FROM roles WHERE name = 'Staff (Attendance & General)'`)!
    const portalRoleId = q.val<number>(`SELECT id FROM roles WHERE name = 'Customer Portal'`)!
    const now = new Date().toISOString()

    // Ensure clean staff user, second staff user, and portal user
    const staffPw = 'MobileAgent-2026!'
    const staffId = q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      'Mobile Agent One',
      'mobile-agent1@swk.rent',
      hashPassword(staffPw),
      staffRoleId,
      dxbBranchId,
      1,
      0,
      now,
      now,
    )
    const staff2Id = q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      'Mobile Agent Two',
      'mobile-agent2@swk.rent',
      hashPassword(staffPw),
      staffRoleId,
      dxbBranchId,
      1,
      0,
      now,
      now,
    )
    const partyId = q.insert(
      `INSERT INTO parties(name, is_customer, status, created_at, updated_at) VALUES (?,?,?,?,?)`,
      'Portal Mobile Denied Co',
      1,
      'Active',
      now,
      now,
    )
    const portalEmail = 'portal-mobile@a.example'
    q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, party_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      'Portal User',
      portalEmail,
      hashPassword(staffPw),
      portalRoleId,
      dxbBranchId,
      partyId,
      1,
      0,
      now,
      now,
    )

    app = await appMod.buildApp()
    const baseUrl = await app.listen({ port: 0, host: '127.0.0.1' })

    // Verify CSP headers include wss: in connectSrc, blob: in mediaSrc, and strict scriptSrc 'self'
    const healthRes = await app.inject({ method: 'GET', url: '/api/health' })
    assert.equal(healthRes.statusCode, 200)
    const csp = String(healthRes.headers['content-security-policy'] || '')
    assert.ok(csp.includes('wss:'), `Expected CSP connect-src to include wss:, got: ${csp}`)
    assert.ok(csp.includes('blob:'), `Expected CSP media-src to include blob:, got: ${csp}`)
    assert.match(csp, /script-src 'self'([;\s]|$)/, `Expected strict script-src 'self', got: ${csp}`)

    // Verify redactUrl hides ticket query parameter if exported
    if (typeof (appMod as any).redactUrl === 'function') {
      const redacted = (appMod as any).redactUrl('/api/chat/stream?ticket=secretTicket999&since_id=42')
      assert.ok(!redacted.includes('secretTicket999'), `redactUrl must strip ticket value, got: ${redacted}`)
      assert.ok(redacted.includes('ticket=[redacted]'), `redactUrl must replace ticket with [redacted], got: ${redacted}`)
    }

    // Mobile login without device_pub or device_id must be rejected with 400
    const missingDevRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json', 'x-swk-client': 'mobile' },
      payload: { email: 'mobile-agent1@swk.rent', password: staffPw },
    })
    assert.equal(missingDevRes.statusCode, 400, `Mobile login omitting device_pub and device_id must return 400, got ${missingDevRes.statusCode}: ${missingDevRes.body}`)

    // -----------------------------------------------------------------------
    // 1. Mobile login with x-swk-client: mobile returns session_token usable via x-swk-session
    // -----------------------------------------------------------------------
    const { jwk: jwk1, expectedDeviceId: devId1 } = makeEcP256Jwk()
    const mobileLoginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json', 'x-swk-client': 'mobile', 'user-agent': 'SWK-Android/1.0' },
      payload: {
        email: 'mobile-agent1@swk.rent',
        password: staffPw,
        device_pub: jwk1,
        device_name: 'Pixel 9 Pro',
        platform: 'android',
        app_version: '2.4.0',
      },
    })
    assert.equal(mobileLoginRes.statusCode, 200, `Mobile login failed: ${mobileLoginRes.body}`)
    const mobileLoginJson = mobileLoginRes.json() as any
    assert.equal(mobileLoginJson.ok, true)
    assert.ok(mobileLoginJson.session_token, 'Mobile login must return session_token')
    assert.equal(mobileLoginJson.device_id, devId1, 'device_id must match sha256(jwk.x.jwk.y).slice(0,40)')
    assert.equal(mobileLoginJson.device_status, 'Pending', 'Non-elevated staff device starts Pending')
    const mobileToken = mobileLoginJson.session_token as string

    // Verify device metadata was persisted in staff_devices
    const devRow1 = q.get<any>(`SELECT * FROM staff_devices WHERE user_id = ? AND device_id = ?`, staffId, devId1)
    assert.ok(devRow1, 'staff_devices row must be created on mobile login')
    assert.equal(devRow1.platform, 'android')
    assert.equal(devRow1.app_version, '2.4.0')
    assert.equal(devRow1.label, 'Pixel 9 Pro')

    // Verify X-SWK-Session requires x-swk-client: mobile on GET /api/auth/me
    const missingClientGet = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { 'x-swk-session': mobileToken },
    })
    assert.equal(missingClientGet.statusCode, 401, 'X-SWK-Session without x-swk-client: mobile must be rejected')

    const wrongClientGet = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { 'x-swk-client': 'web', 'x-swk-session': mobileToken },
    })
    assert.equal(wrongClientGet.statusCode, 401, 'X-SWK-Session with x-swk-client: web must be rejected')

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { 'x-swk-client': 'mobile', 'x-swk-session': mobileToken },
    })
    assert.equal(meRes.statusCode, 200, `GET /api/auth/me with mobile session failed: ${meRes.body}`)
    assert.equal((meRes.json() as any).email, 'mobile-agent1@swk.rent')

    // Verify POST mutation works with x-swk-client: mobile + x-swk-session (CSRF check passes)
    const patchProfileRes = await app.inject({
      method: 'PATCH',
      url: '/api/auth/profile',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'mobile', 'x-swk-session': mobileToken },
      payload: { about: 'Field Specialist - JVC' },
    })
    assert.equal(patchProfileRes.statusCode, 200, `Mobile mutation failed: ${patchProfileRes.body}`)

    // Mutation with missing x-swk-client header fails CSRF check
    const csrfBlockedRes = await app.inject({
      method: 'POST',
      url: '/api/auth/stream-ticket',
      headers: { 'x-swk-session': mobileToken },
    })
    assert.ok(csrfBlockedRes.statusCode === 401 || csrfBlockedRes.statusCode === 403)

    // Portal user is blocked from mobile login (403)
    const portalMobileRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json', 'x-swk-client': 'mobile' },
      payload: { email: portalEmail, password: staffPw, device_id: 'portal-dev-001' },
    })
    assert.equal(portalMobileRes.statusCode, 403, `Portal user must get 403 on mobile login, got ${portalMobileRes.statusCode}`)

    // Another user cannot reuse an already-registered device_pub/device_id
    const stolenDeviceRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json', 'x-swk-client': 'mobile' },
      payload: { email: 'mobile-agent2@swk.rent', password: staffPw, device_pub: jwk1 },
    })
    assert.equal(stolenDeviceRes.statusCode, 403, `Device bound to another user must return 403, got ${stolenDeviceRes.statusCode}`)

    // Session token must NEVER authenticate via query string
    const qsTokenRes = await app.inject({
      method: 'GET',
      url: `/api/notifications/stream?ticket=${encodeURIComponent(mobileToken)}`,
    })
    assert.equal(qsTokenRes.statusCode, 401, 'Session token passed as ?ticket= must be rejected with 401')

    const qsSessRes = await app.inject({
      method: 'GET',
      url: `/api/auth/me?session=${encodeURIComponent(mobileToken)}&token=${encodeURIComponent(mobileToken)}`,
    })
    assert.equal(qsSessRes.statusCode, 401, 'Session token in query string must never authenticate')

    // -----------------------------------------------------------------------
    // 2. One-Time SSE Stream Tickets: issuance, single-use replay, 30s expiry, live SSE
    // -----------------------------------------------------------------------
    const ticketRes = await app.inject({
      method: 'POST',
      url: '/api/auth/stream-ticket',
      headers: { 'x-swk-client': 'mobile', 'x-swk-session': mobileToken },
    })
    assert.equal(ticketRes.statusCode, 200, `POST /api/auth/stream-ticket failed: ${ticketRes.body}`)
    const ticketJson = ticketRes.json() as any
    assert.ok(typeof ticketJson.ticket === 'string' && ticketJson.ticket.length >= 20, 'Ticket must be opaque random token')
    assert.equal(ticketJson.expires_in_s, 30)

    // Ticket must NOT authenticate regular non-SSE endpoints
    const nonSseTicketRes = await app.inject({
      method: 'GET',
      url: `/api/auth/me?ticket=${encodeURIComponent(ticketJson.ticket)}`,
    })
    assert.equal(nonSseTicketRes.statusCode, 401, 'SSE ticket must NOT work on non-SSE endpoints')

    // 1st consumeStreamTicket succeeds
    const consumed1 = consumeStreamTicket(ticketJson.ticket)
    assert.ok(consumed1, '1st consumeStreamTicket(ticket) must return SessionUser')
    assert.equal(consumed1.id, staffId)

    // 2nd replay fails
    const consumed2 = consumeStreamTicket(ticketJson.ticket)
    assert.equal(consumed2, null, '2nd replay of consumeStreamTicket(ticket) must return null')

    // Real HTTP SSE endpoint tests (notifications + chat) with fresh tickets
    const notifTicketRes = await app.inject({
      method: 'POST',
      url: '/api/auth/stream-ticket',
      headers: { 'x-swk-client': 'mobile', 'x-swk-session': mobileToken },
    })
    const notifTicket = (notifTicketRes.json() as any).ticket as string
    const sseOk = await openSseFirstChunk(`${baseUrl}/api/notifications/stream?ticket=${encodeURIComponent(notifTicket)}`)
    assert.equal(sseOk.status, 200, `Expected 200 on /api/notifications/stream?ticket=..., got ${sseOk.status}: ${sseOk.firstChunk}`)
    assert.match(sseOk.contentType, /text\/event-stream/)
    assert.ok(sseOk.firstChunk.includes('retry:'), `Expected SSE retry frame, got: ${sseOk.firstChunk}`)

    // Replaying the same ticket over HTTP must return 401
    const sseReplay = await openSseFirstChunk(`${baseUrl}/api/notifications/stream?ticket=${encodeURIComponent(notifTicket)}`)
    assert.equal(sseReplay.status, 401, `Replayed SSE ticket over HTTP must return 401, got ${sseReplay.status}`)

    const chatTicketRes = await app.inject({
      method: 'POST',
      url: '/api/auth/stream-ticket',
      headers: { 'x-swk-client': 'mobile', 'x-swk-session': mobileToken },
    })
    const chatTicket = (chatTicketRes.json() as any).ticket as string
    const chatSse = await openSseFirstChunk(`${baseUrl}/api/chat/stream?ticket=${encodeURIComponent(chatTicket)}`, {
      Origin: 'https://os.swk.properties',
    })
    assert.equal(chatSse.status, 200, `Expected 200 on /api/chat/stream?ticket=..., got ${chatSse.status}`)
    assert.match(chatSse.contentType, /text\/event-stream/)
    assert.equal(chatSse.headers.get('access-control-allow-origin'), 'https://os.swk.properties', 'GET /api/chat/stream must preserve Access-Control-Allow-Origin')
    assert.equal(chatSse.headers.get('access-control-allow-credentials'), 'true', 'GET /api/chat/stream must preserve Access-Control-Allow-Credentials')

    // Expired ticket (>30s) returns null
    const expTicketRes = await app.inject({
      method: 'POST',
      url: '/api/auth/stream-ticket',
      headers: { 'x-swk-client': 'mobile', 'x-swk-session': mobileToken },
    })
    const expTicket = (expTicketRes.json() as any).ticket as string
    const realNow = Date.now
    try {
      const baseTime = realNow()
      Date.now = () => baseTime + 31_000
      assert.equal(consumeStreamTicket(expTicket), null, 'Ticket older than 30s must return null')
    } finally {
      Date.now = realNow
    }

    // -----------------------------------------------------------------------
    // 3. Blocking/revoking a device invalidates its x-swk-session (401) & deactivates push,
    //    WITHOUT invalidating a separate desktop cookie session for the same user
    // -----------------------------------------------------------------------
    const desktopLoginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web' },
      payload: { email: 'mobile-agent1@swk.rent', password: staffPw },
    })
    assert.equal(desktopLoginRes.statusCode, 200)
    const desktopCookie = 'swk_sid=' + desktopLoginRes.cookies.find((c: any) => c.name === 'swk_sid')!.value

    // Insert push subscription for this mobile device and another device for control check
    q.run(
      `INSERT INTO push_subscriptions(user_id, device_id, channel, endpoint_or_token, active, created_at) VALUES (?,?,?,?,?,?)`,
      staffId,
      devId1,
      'fcm',
      'fcm-token-dev1',
      1,
      now,
    )
    q.run(
      `INSERT INTO push_subscriptions(user_id, device_id, channel, endpoint_or_token, active, created_at) VALUES (?,?,?,?,?,?)`,
      staffId,
      'other-device-keep',
      'fcm',
      'fcm-token-other',
      1,
      now,
    )

    // Owner signs in (auto-approves own device) and revokes mobile-agent1's device via /api/auth/devices/:id/revoke
    const ownerMobileRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json', 'x-swk-client': 'mobile' },
      payload: { email: config.accounts.ownerEmail, password: config.accounts.ownerPassword, device_id: 'owner-phone-1', platform: 'ios' },
    })
    assert.equal(ownerMobileRes.statusCode, 200, `Owner mobile login failed: ${ownerMobileRes.body}`)
    const ownerMobileJson = ownerMobileRes.json() as any
    assert.equal(ownerMobileJson.device_status, 'Approved', 'Owner mobile device must self-approve')
    const ownerMobileTok = ownerMobileJson.session_token as string

    // Non-admin staff cannot revoke devices
    const staffRevokeRes = await app.inject({
      method: 'POST',
      url: `/api/auth/devices/${devRow1.id}/revoke`,
      headers: { 'content-type': 'application/json', 'x-swk-client': 'mobile', 'x-swk-session': mobileToken },
      payload: { reason: 'Unauthorized attempt' },
    })
    assert.equal(staffRevokeRes.statusCode, 403)

    const revokeRes = await app.inject({
      method: 'POST',
      url: `/api/auth/devices/${devRow1.id}/revoke`,
      headers: { 'content-type': 'application/json', 'x-swk-client': 'mobile', 'x-swk-session': ownerMobileTok },
      payload: { reason: 'Lost company handset' },
    })
    assert.equal(revokeRes.statusCode, 200, `Device revoke failed: ${revokeRes.body}`)

    // Check DB revocation state and push subscription deactivation
    const dev1After = q.get<any>(`SELECT status, revoked_at, revoked_reason FROM staff_devices WHERE id = ?`, devRow1.id)
    assert.equal(dev1After.status, 'Blocked')
    assert.ok(dev1After.revoked_at, 'revoked_at must be populated')
    assert.equal(dev1After.revoked_reason, 'Lost company handset')
    assert.equal(q.val<number>(`SELECT active FROM push_subscriptions WHERE endpoint_or_token = 'fcm-token-dev1'`), 0, 'Revoked device push subscription must be deactivated')
    assert.equal(q.val<number>(`SELECT active FROM push_subscriptions WHERE endpoint_or_token = 'fcm-token-other'`), 1, 'Other device push subscription must stay active')

    // Revoked mobile session immediately returns 401
    const revokedMe = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { 'x-swk-client': 'mobile', 'x-swk-session': mobileToken },
    })
    assert.equal(revokedMe.statusCode, 401, `Revoked mobile token must return 401, got ${revokedMe.statusCode}`)

    // Revoked device cannot log in again on mobile (403)
    const blockedRelogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json', 'x-swk-client': 'mobile' },
      payload: { email: 'mobile-agent1@swk.rent', password: staffPw, device_pub: jwk1 },
    })
    assert.equal(blockedRelogin.statusCode, 403, `Blocked/revoked device relogin must fail with 403, got ${blockedRelogin.statusCode}`)

    // Desktop cookie session for the SAME user remains 100% valid (200)
    const desktopMeAfter = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: desktopCookie },
    })
    assert.equal(desktopMeAfter.statusCode, 200, 'Desktop cookie session must NOT be invalidated by mobile device revocation')

    // Also test blocking via /api/swk-ops/attendance-control/device/:id destroys sessions & deactivates push
    const { jwk: jwk2, expectedDeviceId: devId2 } = makeEcP256Jwk()
    const agent2Login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json', 'x-swk-client': 'mobile' },
      payload: { email: 'mobile-agent2@swk.rent', password: staffPw, device_pub: jwk2, device_name: 'iPhone 15', platform: 'ios' },
    })
    assert.equal(agent2Login.statusCode, 200)
    const agent2Tok = (agent2Login.json() as any).session_token as string
    const devRow2 = q.get<any>(`SELECT id FROM staff_devices WHERE user_id = ? AND device_id = ?`, staff2Id, devId2)!
    q.run(
      `INSERT INTO push_subscriptions(user_id, device_id, channel, endpoint_or_token, active, created_at) VALUES (?,?,?,?,?,?)`,
      staff2Id,
      devId2,
      'apns',
      'apns-token-dev2',
      1,
      now,
    )

    const blockViaOps = await app.inject({
      method: 'POST',
      url: `/api/swk-ops/attendance-control/device/${devRow2.id}`,
      headers: { 'content-type': 'application/json', 'x-swk-client': 'mobile', 'x-swk-session': ownerMobileTok },
      payload: { approve: false },
    })
    assert.equal(blockViaOps.statusCode, 200)
    const agent2AfterBlock = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { 'x-swk-client': 'mobile', 'x-swk-session': agent2Tok },
    })
    assert.equal(agent2AfterBlock.statusCode, 401, 'Blocking via attendance-control must invalidate mobile session')
    assert.equal(q.val<number>(`SELECT active FROM push_subscriptions WHERE endpoint_or_token = 'apns-token-dev2'`), 0, 'Blocking via attendance-control must deactivate push subscription')

    // -----------------------------------------------------------------------
    // 4. mobile_require_device_approval = true rejects unapproved mobile device login with 403
    // -----------------------------------------------------------------------
    setSettings({ mobile_require_device_approval: true })
    const { jwk: jwk3, expectedDeviceId: devId3 } = makeEcP256Jwk()
    const pendingDeniedRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json', 'x-swk-client': 'mobile' },
      payload: { email: 'mobile-agent1@swk.rent', password: staffPw, device_pub: jwk3, device_name: 'Samsung S24', platform: 'android' },
    })
    assert.equal(pendingDeniedRes.statusCode, 403, `Expected 403 when mobile_require_device_approval=true and device is Pending, got ${pendingDeniedRes.statusCode}: ${pendingDeniedRes.body}`)
    assert.match(String((pendingDeniedRes.json() as any).error || ''), /approv|pending/i, 'Error must clearly mention pending approval')

    // Verify Owner still logs in cleanly even with mobile_require_device_approval = true
    const ownerStillOk = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json', 'x-swk-client': 'mobile' },
      payload: { email: config.accounts.ownerEmail, password: config.accounts.ownerPassword, device_id: 'owner-phone-2', platform: 'ios' },
    })
    assert.equal(ownerStillOk.statusCode, 200)

    // Once Owner approves devId3, mobile-agent1 can sign in
    const devRow3 = q.get<any>(`SELECT id FROM staff_devices WHERE user_id = ? AND device_id = ?`, staffId, devId3)!
    assert.ok(devRow3, 'Pending device must be recorded so Owner can approve it')
    const approveRes = await app.inject({
      method: 'POST',
      url: `/api/swk-ops/attendance-control/device/${devRow3.id}`,
      headers: { 'content-type': 'application/json', 'x-swk-client': 'mobile', 'x-swk-session': ownerMobileTok },
      payload: { approve: true },
    })
    assert.equal(approveRes.statusCode, 200)

    const approvedLoginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json', 'x-swk-client': 'mobile' },
      payload: { email: 'mobile-agent1@swk.rent', password: staffPw, device_pub: jwk3, device_name: 'Samsung S24', platform: 'android' },
    })
    assert.equal(approvedLoginRes.statusCode, 200, `Approved device login must succeed: ${approvedLoginRes.body}`)
    assert.equal((approvedLoginRes.json() as any).device_status, 'Approved')
    const approvedTok = (approvedLoginRes.json() as any).session_token as string
    const approvedTicket = ((await app.inject({
      method: 'POST',
      url: '/api/auth/stream-ticket',
      headers: { 'x-swk-client': 'mobile', 'x-swk-session': approvedTok },
    })).json() as any).ticket as string

    // Deleting staff_devices row must fail closed: 401 on bound mobile session and null on stream ticket
    q.run(`DELETE FROM staff_devices WHERE id = ?`, devRow3.id)
    const deletedDevMe = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { 'x-swk-client': 'mobile', 'x-swk-session': approvedTok },
    })
    assert.equal(deletedDevMe.statusCode, 401, `Deleted staff_devices row must fail closed with 401, got ${deletedDevMe.statusCode}`)
    assert.equal(consumeStreamTicket(approvedTicket), null, 'Stream ticket for deleted staff_devices row must fail closed with null')

    // Enabling mobile_require_device_approval must invalidate an existing Pending mobile session & ticket
    setSettings({ mobile_require_device_approval: false })
    const { jwk: jwk4 } = makeEcP256Jwk()
    const pendingPreLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json', 'x-swk-client': 'mobile' },
      payload: { email: 'mobile-agent2@swk.rent', password: staffPw, device_pub: jwk4, device_name: 'Pending Phone', platform: 'android' },
    })
    assert.equal(pendingPreLogin.statusCode, 200)
    const pendingTok = (pendingPreLogin.json() as any).session_token as string
    const pendingTicket = ((await app.inject({
      method: 'POST',
      url: '/api/auth/stream-ticket',
      headers: { 'x-swk-client': 'mobile', 'x-swk-session': pendingTok },
    })).json() as any).ticket as string
    setSettings({ mobile_require_device_approval: true })
    const pendingPostToggleMe = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { 'x-swk-client': 'mobile', 'x-swk-session': pendingTok },
    })
    assert.equal(pendingPostToggleMe.statusCode, 401, `Enabling mobile_require_device_approval must invalidate Pending mobile session, got ${pendingPostToggleMe.statusCode}`)
    assert.equal(consumeStreamTicket(pendingTicket), null, 'Enabling mobile_require_device_approval must reject Pending device stream ticket')

    // -----------------------------------------------------------------------
    // 5. [Important #2 & #9]: Logout invalidates pre-logout SSE tickets & verify-password works without rotating session
    // -----------------------------------------------------------------------
    setSettings({ mobile_require_device_approval: false })
    const { jwk: jwk5 } = makeEcP256Jwk()
    const logoutFlowLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json', 'x-swk-client': 'mobile' },
      payload: { email: 'mobile-agent1@swk.rent', password: staffPw, device_pub: jwk5, device_name: 'Logout Drill Phone', platform: 'ios' },
    })
    assert.equal(logoutFlowLogin.statusCode, 200, `Logout drill login failed: ${logoutFlowLogin.body}`)
    const flowTok = (logoutFlowLogin.json() as any).session_token as string

    // verify-password verifies without rotating session token; bad password rejected with 401
    const badVerifyRes = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-password',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'mobile', 'x-swk-session': flowTok },
      payload: { password: 'WrongPassword-123!' },
    })
    assert.equal(badVerifyRes.statusCode, 401, `Bad password verify must return 401, got ${badVerifyRes.statusCode}`)

    const okVerifyRes = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-password',
      headers: {
        'content-type': 'application/json',
        'x-swk-client': 'mobile',
        'x-swk-session': flowTok,
        origin: 'capacitor://localhost',
      },
      payload: { password: staffPw },
    })
    assert.equal(okVerifyRes.statusCode, 200, `Valid password verify failed: ${okVerifyRes.body}`)
    assert.equal((okVerifyRes.json() as any).ok, true)
    assert.equal((okVerifyRes.json() as any).session_token, undefined, 'verify-password must not issue/rotate a session token')
    assert.match(
      String(okVerifyRes.headers['access-control-expose-headers'] || ''),
      /Content-Disposition/i,
      'Capacitor CORS must expose Content-Disposition so cross-origin downloads preserve filenames',
    )

    // verify-password must also work when user has must_change_password = 1 (PASSWORD_SETUP allowlist)
    mainDb.prepare('UPDATE users SET must_change_password = 1 WHERE id = ?').run(staffId)
    try {
      const mcpVerifyRes = await app.inject({
        method: 'POST',
        url: '/api/auth/verify-password',
        headers: { 'content-type': 'application/json', 'x-swk-client': 'mobile', 'x-swk-session': flowTok },
        payload: { password: staffPw },
      })
      assert.equal(mcpVerifyRes.statusCode, 200, `verify-password under must_change_password=1 must return 200, got ${mcpVerifyRes.statusCode}`)
    } finally {
      mainDb.prepare('UPDATE users SET must_change_password = 0 WHERE id = ?').run(staffId)
    }

    // Session remains usable, issue two SSE tickets before logout
    const preLogoutTicketRes1 = await app.inject({
      method: 'POST',
      url: '/api/auth/stream-ticket',
      headers: { 'x-swk-client': 'mobile', 'x-swk-session': flowTok },
    })
    assert.equal(preLogoutTicketRes1.statusCode, 200)
    const preLogoutTicket1 = (preLogoutTicketRes1.json() as any).ticket as string

    const preLogoutTicketRes2 = await app.inject({
      method: 'POST',
      url: '/api/auth/stream-ticket',
      headers: { 'x-swk-client': 'mobile', 'x-swk-session': flowTok },
    })
    assert.equal(preLogoutTicketRes2.statusCode, 200)
    const preLogoutTicket2 = (preLogoutTicketRes2.json() as any).ticket as string

    // Logout destroys session and purges/invalidates pre-logout stream tickets
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { 'x-swk-client': 'mobile', 'x-swk-session': flowTok },
    })
    assert.equal(logoutRes.statusCode, 200)

    const postLogoutSse = await openSseFirstChunk(`${baseUrl}/api/notifications/stream?ticket=${encodeURIComponent(preLogoutTicket1)}`)
    assert.equal(postLogoutSse.status, 401, `Pre-logout SSE ticket must return 401 after logout, got ${postLogoutSse.status}`)
    assert.equal(consumeStreamTicket(preLogoutTicket2), null, 'consumeStreamTicket must reject ticket after session logout')

    // -----------------------------------------------------------------------
    // 6. Android APK crash-prevention invariants (Firebase guard, API 26 channels, SplashScreen, Biometrics, ErrorBoundary)
    // -----------------------------------------------------------------------
    const repoRoot = path.resolve(process.cwd())
    const swkSecureJava = fs.readFileSync(path.join(repoRoot, 'mobile/android/app/src/main/java/ae/swkproperties/os/SwkSecurePlugin.java'), 'utf8')
    const mainActivityJava = fs.readFileSync(path.join(repoRoot, 'mobile/android/app/src/main/java/ae/swkproperties/os/MainActivity.java'), 'utf8')
    const fieldSvcJava = fs.readFileSync(path.join(repoRoot, 'mobile/android/app/src/main/java/ae/swkproperties/os/SwkFieldLocationService.java'), 'utf8')
    const callSvcJava = fs.readFileSync(path.join(repoRoot, 'mobile/android/app/src/main/java/ae/swkproperties/os/SwkCallForegroundService.java'), 'utf8')
    const incomingSvcJava = fs.readFileSync(path.join(repoRoot, 'mobile/android/app/src/main/java/ae/swkproperties/os/SwkIncomingCallService.java'), 'utf8')
    const stylesXml = fs.readFileSync(path.join(repoRoot, 'mobile/android/app/src/main/res/values/styles.xml'), 'utf8')
    const capConfigTs = fs.readFileSync(path.join(repoRoot, 'mobile/capacitor.config.ts'), 'utf8')
    const mobileBridgeTs = fs.readFileSync(path.join(repoRoot, 'src/web/lib/mobileBridge.ts'), 'utf8')
    const mainTsx = fs.readFileSync(path.join(repoRoot, 'src/web/main.tsx'), 'utf8')

    assert.match(swkSecureJava, /public void isPushConfigured\(PluginCall call\)/, 'SwkSecurePlugin must expose isPushConfigured()')
    assert.match(swkSecureJava, /com\.google\.firebase\.FirebaseApp/, 'isPushConfigured() must check FirebaseApp initialization safely')
    assert.match(swkSecureJava, /allowedAuthenticators\(\)/, 'SwkSecurePlugin must use API-safe biometric authenticators for API 24-29')
    assert.match(swkSecureJava, /deleteSharedPreferences\("swk_secure"\)/, 'SwkSecurePlugin must recover from corrupted EncryptedSharedPreferences')
    assert.match(mobileBridgeTs, /isPushConfigured/, 'mobileBridge.registerNativePush must gate Android PushNotifications.register() on SwkSecure.isPushConfigured()')
    assert.match(mainActivityJava, /Build\.VERSION\.SDK_INT\s*<\s*Build\.VERSION_CODES\.O/, 'MainActivity must guard NotificationChannel creation on API 26+')
    assert.match(fieldSvcJava, /Build\.VERSION\.SDK_INT\s*<\s*Build\.VERSION_CODES\.O/, 'SwkFieldLocationService must guard NotificationChannel creation on API 26+')
    assert.match(callSvcJava, /Build\.VERSION\.SDK_INT\s*<\s*Build\.VERSION_CODES\.O/, 'SwkCallForegroundService must guard NotificationChannel creation on API 26+')
    assert.match(incomingSvcJava, /Build\.VERSION\.SDK_INT\s*<\s*Build\.VERSION_CODES\.O/, 'SwkIncomingCallService must guard NotificationChannel creation on API 26+')
    assert.match(stylesXml, /postSplashScreenTheme/, 'styles.xml Theme.SplashScreen must set postSplashScreenTheme')
    assert.match(stylesXml, /windowSplashScreenAnimatedIcon/, 'styles.xml Theme.SplashScreen must set windowSplashScreenAnimatedIcon')
    assert.match(capConfigTs, /launchShowDuration:\s*0/, 'capacitor.config.ts must set SplashScreen.launchShowDuration: 0 to avoid post-onCreate installSplashScreen crashes')
    assert.match(mainTsx, /class AppErrorBoundary/, 'main.tsx must wrap the app in AppErrorBoundary')

    console.log('Mobile auth, unified device binding & SSE ticket tests passed.')
  } finally {
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
