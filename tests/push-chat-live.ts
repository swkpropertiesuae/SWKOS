import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Isolated temp DATA_DIR BEFORE importing any server modules
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swk-push-live-'))
process.env.DATA_DIR = tmpDir
process.env.DATABASE_URL = ''
process.env.APP_SECRET = 'test-push-chat-live-secret-0123456789abcdef'

async function waitFor(pred: () => boolean, timeoutMs = 1000, label = 'condition'): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (pred()) return
    await new Promise(r => setTimeout(r, 10))
  }
  if (!pred()) throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`)
}

async function collectSseChunks(url: string, minBytes = 10, timeoutMs = 1500): Promise<{ status: number; contentType: string; text: string }> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  let text = ''
  try {
    const res = await fetch(url, { signal: ac.signal })
    const contentType = res.headers.get('content-type') || ''
    if (!res.ok || !res.body) {
      const errBody = await res.text().catch(() => '')
      return { status: res.status, contentType, text: errBody }
    }
    const reader = res.body.getReader()
    const deadline = Date.now() + timeoutMs - 150
    while (Date.now() < deadline) {
      const remaining = Math.max(50, deadline - Date.now())
      const readPromise = reader.read()
      const race = await Promise.race([
        readPromise,
        new Promise<{ done: true; value: undefined }>(resolve => setTimeout(() => resolve({ done: true, value: undefined }), remaining)),
      ])
      if (race.done || !race.value) break
      text += Buffer.from(race.value).toString('utf8')
      if (text.length >= minBytes && text.includes('\n\n')) {
        // Give a tiny window for synchronous catch-up frames flushed right after retry:
        await new Promise(r => setTimeout(r, 80))
        break
      }
    }
    try { await reader.cancel() } catch {}
    return { status: res.status, contentType, text }
  } catch {
    return { status: 200, contentType: 'text/event-stream', text }
  } finally {
    clearTimeout(timer)
    ac.abort()
  }
}

function parseSseEvents(raw: string): Array<{ event: string; data: any }> {
  const out: Array<{ event: string; data: any }> = []
  for (const block of raw.split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/).filter(l => l && !l.startsWith(':'))
    let event = 'message'
    const dataLines: string[] = []
    for (const l of lines) {
      if (l.startsWith('event:')) event = l.slice(6).trim()
      else if (l.startsWith('data:')) dataLines.push(l.slice(5).trim())
    }
    if (!dataLines.length) continue
    try {
      out.push({ event, data: JSON.parse(dataLines.join('\n')) })
    } catch {
      out.push({ event, data: dataLines.join('\n') })
    }
  }
  return out
}

async function run() {
  const { mainDb, q, runInDb } = await import('../src/server/db')
  const { syncSchema } = await import('../src/server/schema')
  const { seedReference } = await import('../src/server/seed')
  const authMod = await import('../src/server/auth')
  const appMod = await import('../src/server/app')
  const { setSettings, getSetting } = await import('../src/server/settings')
  const { notify } = await import('../src/server/notify')

  // Import push integration dynamically so missing module produces clean RED test failure
  const pushMod = await import('../src/server/integrations/push') as any

  let app: Awaited<ReturnType<typeof appMod.buildApp>> | null = null
  let addrCounter = 20
  const nextIp = () => `127.0.3.${addrCounter++}`

  try {
    syncSchema()
    await seedReference()

    const { hashPassword } = authMod
    const {
      setPushTransportForTests,
      dispatchPushToUser,
      getVapidPublicKey,
      buildFcmJwtAssertion,
    } = pushMod

    assert.equal(typeof setPushTransportForTests, 'function', 'setPushTransportForTests must be exported')
    assert.equal(typeof dispatchPushToUser, 'function', 'dispatchPushToUser must be exported')
    assert.equal(typeof getVapidPublicKey, 'function', 'getVapidPublicKey must be exported')

    const dxbBranchId = q.val<number>(`SELECT id FROM branches WHERE code = 'DXB'`)!
    const staffRoleId = q.val<number>(`SELECT id FROM roles WHERE name = 'Staff (Attendance & General)'`)!
    const portalRoleId = q.val<number>(`SELECT id FROM roles WHERE name = 'Customer Portal'`)!
    const now = new Date().toISOString()
    const pw = 'InsideLive-2026!'

    const userAId = q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      'Agent Alpha', 'alpha@swk.rent', hashPassword(pw), staffRoleId, dxbBranchId, 1, 0, now, now,
    )
    const userBId = q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      'Agent Bravo', 'bravo@swk.rent', hashPassword(pw), staffRoleId, dxbBranchId, 1, 0, now, now,
    )
    const partyId = q.insert(
      `INSERT INTO parties(name, is_customer, status, created_at, updated_at) VALUES (?,?,?,?,?)`,
      'Portal Blocked Client', 1, 'Active', now, now,
    )
    const portalEmail = 'portal-chat-blocked@a.example'
    q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, party_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      'Portal User', portalEmail, hashPassword(pw), portalRoleId, dxbBranchId, partyId, 1, 0, now, now,
    )

    app = await appMod.buildApp()
    const baseUrl = await app.listen({ port: 0, host: '127.0.0.1' })

    const loginMobile = async (email: string, deviceId: string) => {
      const res = await app!.inject({
        method: 'POST',
        url: '/api/auth/login',
        remoteAddress: nextIp(),
        headers: { 'content-type': 'application/json', 'x-swk-client': 'mobile' },
        payload: { email, password: pw, device_id: deviceId, platform: 'android' },
      })
      assert.equal(res.statusCode, 200, `Login failed for ${email}: ${res.body}`)
      return res.json().session_token as string
    }

    const loginWeb = async (email: string) => {
      const res = await app!.inject({
        method: 'POST',
        url: '/api/auth/login',
        remoteAddress: nextIp(),
        headers: { 'content-type': 'application/json', 'x-swk-client': 'web' },
        payload: { email, password: pw },
      })
      assert.equal(res.statusCode, 200, `Web login failed for ${email}: ${res.body}`)
      return 'swk_sid=' + res.cookies.find((c: any) => c.name === 'swk_sid')!.value
    }

    const tokA = await loginMobile('alpha@swk.rent', 'alpha-dev-01')
    const tokB = await loginMobile('bravo@swk.rent', 'bravo-dev-01')
    const cookiePortal = await loginWeb(portalEmail)

    const hA = { 'content-type': 'application/json', 'x-swk-client': 'mobile', 'x-swk-session': tokA }
    const hB = { 'content-type': 'application/json', 'x-swk-client': 'mobile', 'x-swk-session': tokB }

    // Capture push dispatches deterministically
    const webPushCalls: Array<{ sub: any; payload: any; vapid: any }> = []
    const fcmCalls: Array<{ sub: any; fcmMessage: any; payload: any }> = []
    setPushTransportForTests({
      sendWebPush: async (sub: any, payloadJson: string, vapid: any) => {
        webPushCalls.push({ sub, payload: JSON.parse(payloadJson), vapid })
      },
      sendFcm: async (sub: any, fcmMessage: any, payload: any) => {
        fcmCalls.push({ sub, fcmMessage, payload })
      },
    })

    // -------------------------------------------------------------------------
    // Scenario 1: VAPID key auto-gen & encryption + Web Push + FCM subscription
    //             + DM from User A -> User B dispatches swk_messages push to /chat?t=<tid>
    // -------------------------------------------------------------------------
    const vapidRes = await app.inject({
      method: 'GET',
      url: '/api/push/vapid-key',
      headers: { 'x-swk-client': 'mobile', 'x-swk-session': tokB },
    })
    assert.equal(vapidRes.statusCode, 200, `GET /api/push/vapid-key failed: ${vapidRes.body}`)
    const vapidJson = vapidRes.json() as any
    assert.equal(vapidJson.enabled, true)
    assert.ok(typeof vapidJson.publicKey === 'string' && vapidJson.publicKey.length > 30, 'VAPID publicKey must be generated')
    const rawPrivRow = q.val<string>(`SELECT value FROM settings WHERE key = 'vapid_private_key'`)!
    assert.ok(rawPrivRow && rawPrivRow.includes('enc:v1:'), 'vapid_private_key must be AES-256-GCM encrypted in DB')
    assert.ok(getSetting('vapid_private_key'), 'decrypted vapid_private_key must be non-empty')

    const subWebRes = await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      headers: hB,
      payload: {
        channel: 'web_push',
        endpoint: 'https://push.example.test/wp/bravo-1',
        keys: { p256dh: 'BOr6x7h2V2xH7kH8Y9M0N1O2P3Q4R5S6T7U8V9W0X1Y2Z3', auth: 'authSecret123456' },
      },
    })
    assert.equal(subWebRes.statusCode, 200, `Web push subscribe failed: ${subWebRes.body}`)

    const subFcmRes = await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      headers: hB,
      payload: {
        channel: 'fcm',
        token: 'fcm-bravo-device-token-001',
        device_id: 'bravo-dev-01',
      },
    })
    assert.equal(subFcmRes.statusCode, 200, `FCM subscribe failed: ${subFcmRes.body}`)

    // Start DM A -> B
    const dmRes = await app.inject({
      method: 'POST',
      url: '/api/chat/threads',
      headers: hA,
      payload: { user_ids: [userBId] },
    })
    assert.equal(dmRes.statusCode, 200, `Create DM failed: ${dmRes.body}`)
    const tid = (dmRes.json() as any).id as number

    const msg1Res = await app.inject({
      method: 'POST',
      url: `/api/chat/threads/${tid}/messages`,
      headers: hA,
      payload: { body: 'Buyer arrived at Marina Gate 2' },
    })
    assert.equal(msg1Res.statusCode, 200, `Send m1 failed: ${msg1Res.body}`)
    const m1 = (msg1Res.json() as any).id as number

    await waitFor(() => webPushCalls.length === 1 && fcmCalls.length === 1, 1000, 'DM push dispatches')
    assert.equal(webPushCalls.length, 1, `Expected 1 Web Push call, got ${webPushCalls.length}`)
    assert.equal(fcmCalls.length, 1, `Expected 1 FCM call, got ${fcmCalls.length}`)
    assert.equal(webPushCalls[0]!.payload.channel, 'swk_messages')
    assert.equal(webPushCalls[0]!.payload.url, `/chat?t=${tid}`)
    assert.equal(webPushCalls[0]!.payload.tag, `swk-chat-${tid}`)
    assert.ok(webPushCalls[0]!.payload.body.includes('Buyer arrived at Marina Gate 2'))
    assert.equal(fcmCalls[0]!.payload.channel, 'swk_messages')
    assert.equal(fcmCalls[0]!.payload.url, `/chat?t=${tid}`)
    assert.equal(fcmCalls[0]!.fcmMessage.message.android.notification.channel_id, 'swk_messages')

    // -------------------------------------------------------------------------
    // Scenario 2: Active thread foreground suppression via POST /api/chat/active-thread
    // -------------------------------------------------------------------------
    webPushCalls.length = 0
    fcmCalls.length = 0
    const actRes = await app.inject({
      method: 'POST',
      url: '/api/chat/active-thread',
      headers: hB,
      payload: { thread_id: tid },
    })
    assert.equal(actRes.statusCode, 200, `POST /api/chat/active-thread failed: ${actRes.body}`)

    const msg2Res = await app.inject({
      method: 'POST',
      url: `/api/chat/threads/${tid}/messages`,
      headers: hA,
      payload: { body: 'Unit 2404 keys are with reception' },
    })
    assert.equal(msg2Res.statusCode, 200)
    const m2 = (msg2Res.json() as any).id as number
    await new Promise(r => setTimeout(r, 40))

    assert.equal(webPushCalls.length, 0, 'Active foreground thread must suppress Web Push')
    assert.equal(fcmCalls.length, 0, 'Active foreground thread must suppress FCM push')

    // Leaving active thread re-enables push
    const clearActRes = await app.inject({
      method: 'POST',
      url: '/api/chat/active-thread',
      headers: hB,
      payload: { thread_id: null },
    })
    assert.equal(clearActRes.statusCode, 200)

    // -------------------------------------------------------------------------
    // Scenario 3: push_hide_preview_global = true masks title & body
    // -------------------------------------------------------------------------
    setSettings({ push_hide_preview_global: true })
    const secretDealBody = 'Confidential AED 14.5M cash offer from VIP client'
    const msg3Res = await app.inject({
      method: 'POST',
      url: `/api/chat/threads/${tid}/messages`,
      headers: hA,
      payload: { body: secretDealBody },
    })
    assert.equal(msg3Res.statusCode, 200)
    const m3 = (msg3Res.json() as any).id as number
    await waitFor(() => webPushCalls.length === 1 && fcmCalls.length === 1, 1000, 'masked DM pushes')

    assert.equal(webPushCalls.length, 1, 'Expected push when thread no longer active')
    assert.equal(fcmCalls.length, 1, 'Expected FCM push when thread no longer active')
    assert.equal(webPushCalls[0]!.payload.title, 'SWK Inside')
    assert.equal(fcmCalls[0]!.payload.title, 'SWK Inside')
    assert.equal(webPushCalls[0]!.payload.body, 'New message in SWK Inside')
    assert.equal(fcmCalls[0]!.payload.body, 'New message in SWK Inside')
    assert.ok(!JSON.stringify(webPushCalls[0]!.payload).includes('Agent Alpha'), 'Sender name title must be masked when push_hide_preview_global=true')
    assert.ok(!JSON.stringify(fcmCalls[0]!.fcmMessage).includes('Agent Alpha'), 'Sender name title must be masked in FCM when push_hide_preview_global=true')
    assert.ok(!JSON.stringify(webPushCalls[0]!.payload).includes('14.5M'), 'Zero message body must leak when push_hide_preview_global=true')
    assert.ok(!JSON.stringify(fcmCalls[0]!.fcmMessage).includes('14.5M'), 'Zero message body must leak in FCM when push_hide_preview_global=true')

    // Privacy masking also masks title & body for non-chat notify()
    webPushCalls.length = 0
    fcmCalls.length = 0
    notify(userBId, 'Confidential Deal #44 AED 25M', 'VIP seller agreed', '/e/jobs/44', 'approval')
    await waitFor(() => webPushCalls.length === 1 && fcmCalls.length === 1, 1000, 'masked ops alert')
    assert.equal(webPushCalls[0]!.payload.title, 'SWK OS')
    assert.equal(webPushCalls[0]!.payload.body, 'New SWK OS notification')
    assert.ok(!JSON.stringify(fcmCalls[0]!.fcmMessage).includes('25M'), 'Ops notification title/body must be masked under privacy lock screen mode')

    // -------------------------------------------------------------------------
    // Scenario 4: Reconnect catch-up /api/chat/stream?ticket=<t>&since_id=<m1>
    //             replays m2, m3 in ascending ID order without duplicating m1
    // -------------------------------------------------------------------------
    const ticketRes = await app.inject({
      method: 'POST',
      url: '/api/auth/stream-ticket',
      headers: { 'x-swk-client': 'mobile', 'x-swk-session': tokB },
    })
    assert.equal(ticketRes.statusCode, 200)
    const sseTicket = (ticketRes.json() as any).ticket as string

    const sseRes = await collectSseChunks(`${baseUrl}/api/chat/stream?ticket=${encodeURIComponent(sseTicket)}&since_id=${m1}`, 80, 1200)
    assert.equal(sseRes.status, 200, `SSE ?since_id=${m1} failed: ${sseRes.text}`)
    assert.match(sseRes.contentType, /text\/event-stream/)
    assert.ok(sseRes.text.includes('retry: 3000'), 'SSE must start with retry: 3000')

    const events = parseSseEvents(sseRes.text).filter(e => e.event === 'chat' && e.data?.type === 'message')
    const replayedIds = events.map(e => e.data.message.id)
    assert.deepEqual(replayedIds, [m2, m3], `Expected missed messages [${m2}, ${m3}] in ascending order without ${m1}, got ${JSON.stringify(replayedIds)}`)

    // -------------------------------------------------------------------------
    // Scenario 5: All-ops notify() dispatches swk_ops_alerts + portal user gets 403
    // -------------------------------------------------------------------------
    setSettings({ push_hide_preview_global: false })
    webPushCalls.length = 0
    fcmCalls.length = 0

    notify(userBId, 'Approval needed', 'Withdrawal #4', '/withdrawals', 'approval')
    await waitFor(() => webPushCalls.length === 1 && fcmCalls.length === 1, 1000, 'ops approval push')

    assert.equal(webPushCalls.length, 1, 'notify() must trigger Web Push dispatch')
    assert.equal(fcmCalls.length, 1, 'notify() must trigger FCM push dispatch')
    assert.equal(webPushCalls[0]!.payload.channel, 'swk_ops_alerts')
    assert.equal(webPushCalls[0]!.payload.url, '/withdrawals')
    assert.equal(webPushCalls[0]!.payload.title, 'Approval needed')
    assert.equal(webPushCalls[0]!.payload.body, 'Withdrawal #4')

    // SOS notify() uses swk_calls_sos channel
    webPushCalls.length = 0
    fcmCalls.length = 0
    notify(userBId, 'Field Duty SOS', 'Agent triggered SOS near Marina', '/field-live', 'sos')
    await waitFor(() => webPushCalls.length === 1 && fcmCalls.length === 1, 1000, 'SOS push')
    assert.equal(webPushCalls[0]!.payload.channel, 'swk_calls_sos')
    assert.equal(fcmCalls[0]!.fcmMessage.message.android.notification.channel_id, 'swk_calls_sos')

    // Portal user gets 403 on all /api/chat/* and /api/push/* routes
    const portalChecks: Array<{ method: 'GET' | 'POST' | 'DELETE'; url: string; payload?: Record<string, unknown> }> = [
      { method: 'GET', url: '/api/chat/threads' },
      { method: 'POST', url: '/api/chat/active-thread', payload: { thread_id: tid } },
      { method: 'GET', url: '/api/push/vapid-key' },
      { method: 'POST', url: '/api/push/subscribe', payload: { channel: 'fcm', token: 'bad' } },
      { method: 'DELETE', url: '/api/push/unsubscribe', payload: { endpoint: 'x' } },
      { method: 'POST', url: '/api/push/test', payload: {} },
    ]
    for (const check of portalChecks) {
      const portalRes: { statusCode: number; body: string } = await app.inject({
        method: check.method,
        url: check.url,
        headers: { cookie: cookiePortal, 'x-swk-client': 'web', ...(check.payload ? { 'content-type': 'application/json' } : {}) },
        payload: check.payload,
      })
      assert.equal(portalRes.statusCode, 403, `Portal user calling ${check.method} ${check.url} must get 403, got ${portalRes.statusCode}: ${portalRes.body}`)
    }

    // -------------------------------------------------------------------------
    // Additional checks: location message, 410 dead subscription cleanup, inDemo() zero outbound, RSA JWT
    // -------------------------------------------------------------------------
    const locRes = await app.inject({
      method: 'POST',
      url: `/api/chat/threads/${tid}/messages`,
      headers: hA,
      payload: { kind: 'location', location: { lat: 25.0772, lng: 55.1332, label: 'Dubai Marina Gate 2' } },
    })
    assert.equal(locRes.statusCode, 200, `Location message failed: ${locRes.body}`)
    const msgsList = (await app.inject({ method: 'GET', url: `/api/chat/threads/${tid}/messages`, headers: hB })).json() as any
    const locMsg = msgsList.messages.find((x: any) => x.kind === 'location')
    assert.ok(locMsg, 'Location message must be persisted with kind=location')
    assert.equal(JSON.parse(locMsg.body).label, 'Dubai Marina Gate 2')

    // 410 Gone auto-deactivates dead subscription
    setPushTransportForTests({
      sendWebPush: async () => {
        const err: any = new Error('Gone')
        err.statusCode = 410
        throw err
      },
      sendFcm: async () => {},
    })
    const res410 = await dispatchPushToUser(userBId, {
      title: 'Ping',
      body: 'Check 410',
      url: '/home',
      tag: 'test-410',
      channel: 'swk_ops_alerts',
    })
    assert.equal(res410.failed, 1)
    assert.equal(res410.sent, 1)
    assert.equal(
      q.val<number>(`SELECT active FROM push_subscriptions WHERE endpoint_or_token = 'https://push.example.test/wp/bravo-1'`),
      0,
      'HTTP 410 must set push_subscriptions.active = 0',
    )

    // Unsubscribe endpoint
    const unsubRes = await app.inject({
      method: 'DELETE',
      url: '/api/push/unsubscribe',
      headers: hB,
      payload: { token: 'fcm-bravo-device-token-001' },
    })
    assert.equal(unsubRes.statusCode, 200)
    assert.equal(
      q.val<number>(`SELECT active FROM push_subscriptions WHERE endpoint_or_token = 'fcm-bravo-device-token-001'`),
      0,
      'DELETE /api/push/unsubscribe must set active = 0',
    )

    // Demo workspace never fires outbound push
    let demoPushCount = 0
    setPushTransportForTests({
      sendWebPush: async () => { demoPushCount++ },
      sendFcm: async () => { demoPushCount++ },
    })
    const { openDatabase } = await import('../src/server/db')
    const fakeDemoDb = openDatabase(path.join(tmpDir, 'demo-check.db'))
    try {
      await runInDb(fakeDemoDb, async () => {
        const out = await dispatchPushToUser(1, { title: 'Demo', body: 'Should not send', url: '/home', tag: 'demo', channel: 'swk_ops_alerts' })
        assert.deepEqual(out, { sent: 0, failed: 0 })
      })
    } finally {
      fakeDemoDb.close()
    }
    assert.equal(demoPushCount, 0, 'Demo workspace must never send outbound push notifications')

    // Verify FCM RSA-SHA256 JWT assertion builder if exported
    if (typeof buildFcmJwtAssertion === 'function') {
      const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
      const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
      const jwt = buildFcmJwtAssertion({ client_email: 'fcm@swk-test.iam.gserviceaccount.com', private_key: pem })
      assert.equal(jwt.split('.').length, 3, 'FCM JWT must have 3 segments')
    }

    // Muted thread suppresses push & postAutomationMessage pushes to non-sender, non-muted recipients
    const grpRes = await app.inject({
      method: 'POST',
      url: '/api/chat/threads',
      headers: hA,
      payload: { title: 'Marina Launch Team', user_ids: [userBId], group: true },
    })
    assert.equal(grpRes.statusCode, 200)
    const grpId = (grpRes.json() as any).id as number

    // Re-subscribe Web Push for User B and capture
    await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      headers: hB,
      payload: {
        channel: 'web_push',
        endpoint: 'https://push.example.test/wp/bravo-2',
        keys: { p256dh: 'BOr6x7h2V2xH7kH8Y9M0N1O2P3Q4R5S6T7U8V9W0X1Y2Z3', auth: 'authSecret123456' },
      },
    })
    const autoCalls: any[] = []
    setPushTransportForTests({
      sendWebPush: async (_sub: any, payloadJson: string) => { autoCalls.push(JSON.parse(payloadJson)) },
    })
    const { postAutomationMessage } = await import('../src/server/routes/chat')
    postAutomationMessage(grpId, userAId, 'Automated viewing reminder at 16:00')
    await waitFor(() => autoCalls.length === 1, 1000, 'automation push')
    assert.equal(autoCalls.length, 1, 'postAutomationMessage must dispatch push to non-muted recipients')
    assert.equal(autoCalls[0]!.channel, 'swk_messages')
    assert.equal(autoCalls[0]!.url, `/chat?t=${grpId}`)

    // Mute group for User B -> suppresses push
    autoCalls.length = 0
    await app.inject({
      method: 'POST',
      url: `/api/chat/threads/${grpId}/prefs`,
      headers: hB,
      payload: { muted: true },
    })
    postAutomationMessage(grpId, userAId, 'Should stay muted')
    await new Promise(r => setTimeout(r, 40))
    assert.equal(autoCalls.length, 0, 'Muted group must suppress external push')

    // POST /api/push/test dispatches test notification to caller
    const testPushRes = await app.inject({
      method: 'POST',
      url: '/api/push/test',
      headers: hB,
      payload: {},
    })
    assert.equal(testPushRes.statusCode, 200)
    assert.equal((testPushRes.json() as any).sent, 1)

    // Reconnect with since_id = latest message returns zero duplicate messages
    const latestId = q.val<number>(`SELECT MAX(id) FROM chat_messages`)!
    const t2Res = await app.inject({
      method: 'POST',
      url: '/api/auth/stream-ticket',
      headers: { 'x-swk-client': 'mobile', 'x-swk-session': tokB },
    })
    const t2 = (t2Res.json() as any).ticket as string
    const emptyCatchup = await collectSseChunks(`${baseUrl}/api/chat/stream?ticket=${encodeURIComponent(t2)}&since_id=${latestId}`, 10, 400)
    assert.equal(parseSseEvents(emptyCatchup.text).filter(e => e.event === 'chat' && e.data?.type === 'message').length, 0, 'since_id at tip must not replay duplicate messages')

    // Verify public/sw.js never caches /api/ and guards protocol-relative URLs
    const swSrc = fs.readFileSync(path.resolve('public/sw.js'), 'utf8')
    assert.ok(swSrc.includes("startsWith('/api/')"), 'public/sw.js must explicitly bypass /api/*')
    assert.ok(swSrc.includes("!rawUrl.startsWith('//')"), 'public/sw.js must reject protocol-relative // URLs')
    assert.ok(swSrc.includes('target.origin !== self.location.origin'), 'public/sw.js must enforce same-origin navigation')

    // Fix Round 1 regressions: SSRF endpoint validation & mobile sessionDeviceId precedence
    const badEndpoints = [
      'http://127.0.0.1/hook',
      'https://127.0.0.1/hook',
      'http://push.example.test/wp/plain-http',
      'https://localhost/wp/1',
      'https://10.0.0.5/wp/1',
      'https://192.168.1.2/wp/1',
      'https://172.16.0.1/wp/1',
      'https://169.254.169.254/latest/meta-data',
      'https://0.0.0.0/wp/1',
      'https://[::1]/wp/1',
      'https://[::ffff:127.0.0.1]/wp/1',
      'https://[fe80::1]/wp/1',
      'https://[fd12:3456::1]/wp/1',
      'https://service.internal/wp/1',
      'https://printer.local/wp/1',
    ]
    for (const badEp of badEndpoints) {
      const badRes: { statusCode: number; body: string } = await app.inject({
        method: 'POST',
        url: '/api/push/subscribe',
        headers: hB,
        payload: {
          channel: 'web_push',
          endpoint: badEp,
          keys: { p256dh: 'BOr6x7h2V2xH7kH8Y9M0N1O2P3Q4R5S6T7U8V9W0X1Y2Z3', auth: 'authSecret123456' },
        },
      })
      assert.equal(badRes.statusCode, 400, `Unsafe push endpoint ${badEp} must be rejected with 400, got ${badRes.statusCode}: ${badRes.body}`)
    }

    // Mobile session's bound sessionDeviceId must override arbitrary body device_id
    const spoofSubRes = await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      headers: hB,
      payload: {
        channel: 'fcm',
        token: 'fcm-bravo-device-spoof-check',
        device_id: 'attacker-arbitrary-device-999',
      },
    })
    assert.equal(spoofSubRes.statusCode, 200, `FCM subscribe failed: ${spoofSubRes.body}`)
    assert.equal(
      q.val<string>(`SELECT device_id FROM push_subscriptions WHERE endpoint_or_token = 'fcm-bravo-device-spoof-check'`),
      'bravo-dev-01',
      'Mobile sessionDeviceId must take precedence over body device_id',
    )

    // [Important #10]: apns_voip channel subscribes cleanly and ONLY receives incoming call wakes
    const apnsVoipSub = await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      headers: hB,
      payload: { channel: 'apns_voip', token: 'voip-pushkit-token-bravo-01' },
    })
    assert.equal(apnsVoipSub.statusCode, 200, `apns_voip subscribe failed: ${apnsVoipSub.body}`)
    const apnsAlerts: Array<{ channel: string; isVoip: boolean; payload: any }> = []
    setPushTransportForTests({
      sendWebPush: async () => {},
      sendFcm: async () => {},
      sendApns: async (_sub: any, payload: any, meta: { isVoip: boolean; channel: 'apns' | 'apns_voip' }) => {
        apnsAlerts.push({ channel: meta.channel, isVoip: meta.isVoip, payload })
      },
    })
    await dispatchPushToUser(userBId, {
      title: 'Regular Message',
      body: 'Must never wake PushKit VoIP',
      url: '/chat',
      tag: 'chat-skip-voip',
      channel: 'swk_messages',
    })
    await dispatchPushToUser(userBId, {
      title: 'SOS GPS Alert',
      body: 'Not a CallKit incoming call',
      url: '/field-live',
      tag: 'sos-skip-voip',
      channel: 'swk_calls_sos',
    })
    assert.equal(apnsAlerts.filter(a => a.channel === 'apns_voip').length, 0, 'Non-call notifications must NEVER hit apns_voip PushKit subscription')

    await dispatchPushToUser(userBId, {
      title: 'Incoming SIP Call',
      body: 'VIP Caller · Ext 102',
      url: '/phone?incoming=1',
      tag: 'sip-call-voip-1',
      channel: 'swk_calls_sos',
      data: { type: 'incoming_call', call_id: 'call-voip-1' },
    })
    const voipHits = apnsAlerts.filter(a => a.channel === 'apns_voip')
    assert.equal(voipHits.length, 1, 'Incoming call wake must dispatch to apns_voip')
    assert.equal(voipHits[0]!.isVoip, true)

    console.log('Push & Inside live messaging tests passed.')
  } finally {
    try { pushMod?.setPushTransportForTests?.(null) } catch {}
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
