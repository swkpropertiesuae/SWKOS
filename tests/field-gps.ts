import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Set isolated temp DATA_DIR BEFORE importing any server modules
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swk-field-gps-'))
process.env.DATA_DIR = tmpDir
process.env.DATABASE_URL = ''
process.env.APP_SECRET = 'test-field-gps-secret-0123456789abcdef'

async function readFirstSseEvent(
  url: string,
  headers: Record<string, string>,
  trigger: () => Promise<void>,
): Promise<{ status: number; contentType: string; chunk: string }> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 5000)
  try {
    const res = await fetch(url, { headers, signal: ac.signal })
    const contentType = res.headers.get('content-type') || ''
    if (!res.ok || !res.body) {
      return { status: res.status, contentType, chunk: await res.text().catch(() => '') }
    }
    const reader = res.body.getReader()
    const first = await reader.read()
    let chunk = first.value ? Buffer.from(first.value).toString('utf8') : ''
    await trigger()
    for (let i = 0; i < 6; i++) {
      if (chunk.includes('event: field_gps')) break
      const next = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value: undefined }>(r => setTimeout(() => r({ done: true, value: undefined }), 400)),
      ])
      if (next.value) chunk += Buffer.from(next.value).toString('utf8')
      if (next.done) break
    }
    try { await reader.cancel() } catch {}
    return { status: res.status, contentType, chunk }
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
  const { buildApp } = await import('../src/server/app')
  const { createRecord, getDef, SYSTEM_CTX } = await import('../src/server/engine')
  const { setPushTransportForTests } = await import('../src/server/integrations/push')
  const fieldGpsMod = await import('../src/server/routes/field-gps')

  let app: Awaited<ReturnType<typeof buildApp>> | null = null

  try {
    syncSchema()
    await seedReference()

    const { autoExpireFieldSessions, purgeOldGpsBatches } = fieldGpsMod as typeof fieldGpsMod & {
      autoExpireFieldSessions: (now?: Date) => { expired: number; reminded: number }
      purgeOldGpsBatches: (now?: Date) => { purged: number }
    }
    assert.equal(typeof autoExpireFieldSessions, 'function', 'autoExpireFieldSessions must be exported')
    assert.equal(typeof purgeOldGpsBatches, 'function', 'purgeOldGpsBatches must be exported')

    const ownerUser = q.get<{ id: number; email: string }>(`SELECT id, email FROM users WHERE lower(email) = 'shabib@swk.properties' AND deleted_at IS NULL`)!
    const adminUser = q.get<{ id: number; email: string }>(`SELECT id, email FROM users WHERE lower(email) = 'admin@swk.properties' AND deleted_at IS NULL`)!
    const haseebUser = q.get<{ id: number; email: string }>(`SELECT id, email FROM users WHERE lower(email) = 'haseeb@swk.properties' AND deleted_at IS NULL`)!
    const agent1User = q.get<{ id: number; email: string }>(`SELECT id, email FROM users WHERE lower(email) = 'talha@swk.properties' AND deleted_at IS NULL`)!
    const agent2User = q.get<{ id: number; email: string }>(`SELECT id, email FROM users WHERE lower(email) = 'fareed@swk.rent' AND deleted_at IS NULL`)!
    assert.ok(ownerUser && adminUser && haseebUser && agent1User && agent2User)

    // Create portal user to test staff-only 403
    const dxbBranchId = q.val<number>(`SELECT id FROM branches WHERE code = 'DXB'`)!
    const portalRoleId = q.val<number>(`SELECT id FROM roles WHERE name = 'Customer Portal'`)!
    const now = new Date().toISOString()
    const partyId = q.insert(
      `INSERT INTO parties(name, is_customer, status, created_at, updated_at) VALUES (?,?,?,?,?)`,
      'Portal GPS Denied Co', 1, 'Active', now, now,
    )
    const portalUserId = q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, party_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      'Portal GPS User', 'portal-gps@a.example', authMod.hashPassword('PortalGps-2026!'), portalRoleId, dxbBranchId, partyId, 1, 0, now, now,
    )

    // Register push subscription for Owner & Manager to verify SOS push channel + reminders
    const sentFcm: Array<{ userId: number; payload: any }> = []
    setPushTransportForTests({
      sendFcm: async (sub, _msg, payload) => {
        sentFcm.push({ userId: sub.user_id, payload })
      },
    })
    q.run(
      `INSERT INTO push_subscriptions(user_id, channel, endpoint_or_token, active, created_at) VALUES (?,?,?,?,?)`,
      ownerUser.id, 'fcm', 'fcm-owner-sos-test-tok', 1, now,
    )
    q.run(
      `INSERT INTO push_subscriptions(user_id, channel, endpoint_or_token, active, created_at) VALUES (?,?,?,?,?)`,
      agent1User.id, 'fcm', 'fcm-agent1-remind-tok', 1, now,
    )

    const ownerCookie = 'swk_sid=' + authMod.createSession(ownerUser.id).token
    const adminCookie = 'swk_sid=' + authMod.createSession(adminUser.id).token
    const haseebCookie = 'swk_sid=' + authMod.createSession(haseebUser.id).token
    const agent1Cookie = 'swk_sid=' + authMod.createSession(agent1User.id).token
    const agent2Cookie = 'swk_sid=' + authMod.createSession(agent2User.id).token
    const portalCookie = 'swk_sid=' + authMod.createSession(portalUserId).token

    app = await buildApp()
    const baseUrl = await app.listen({ port: 0, host: '127.0.0.1' })

    // -------------------------------------------------------------------------
    // Portal user rejected on /api/field-gps/* (403)
    // -------------------------------------------------------------------------
    const portalRes = await app.inject({
      method: 'GET',
      url: '/api/field-gps/my-session',
      headers: { cookie: portalCookie },
    })
    assert.equal(portalRes.statusCode, 403, `Portal user must be rejected with 403, got ${portalRes.statusCode}`)

    // -------------------------------------------------------------------------
    // 1. Field Agent starts duty -> posts valid ping -> GET /my-session shows active session & pin
    // -------------------------------------------------------------------------
    const startRes = await app.inject({
      method: 'POST',
      url: '/api/field-gps/sessions/start',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agent1Cookie },
      payload: { purpose: 'Viewing', community: 'Dubai Marina' },
    })
    assert.equal(startRes.statusCode, 200, `Start field session failed: ${startRes.statusCode} ${startRes.body}`)
    const startBody = startRes.json() as any
    const sessionId = Number(startBody.session?.id)
    assert.ok(sessionId > 0, 'Started session must return positive id')
    assert.equal(startBody.session.status, 'Active (On Duty)')

    const validPingAt = new Date().toISOString()
    const pingRes = await app.inject({
      method: 'POST',
      url: '/api/field-gps/pings',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agent1Cookie },
      payload: {
        points: [
          {
            lat: 25.0805,
            lng: 55.1403,
            accuracy_m: 12,
            speed_mps: 1.5,
            heading: 90,
            battery_pct: 84,
            is_mock: false,
            recorded_at: validPingAt,
            idempotency_key: 'valid-ping-key-001',
          },
        ],
      },
    })
    assert.equal(pingRes.statusCode, 200, `Valid ping failed: ${pingRes.statusCode} ${pingRes.body}`)
    assert.equal((pingRes.json() as any).accepted, 1)

    // Replay same idempotency_key -> deduplicated safely (0 new batch inserts)
    const replayRes = await app.inject({
      method: 'POST',
      url: '/api/field-gps/pings',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agent1Cookie },
      payload: {
        points: [
          {
            lat: 25.0805,
            lng: 55.1403,
            accuracy_m: 12,
            recorded_at: validPingAt,
            idempotency_key: 'valid-ping-key-001',
          },
        ],
      },
    })
    assert.equal(replayRes.statusCode, 200)
    assert.equal((replayRes.json() as any).accepted, 0, 'Replayed idempotency_key must not insert duplicate batch')

    // Reject poor accuracy (>150m) -> 400
    const badAccRes = await app.inject({
      method: 'POST',
      url: '/api/field-gps/pings',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agent1Cookie },
      payload: {
        points: [{ lat: 25.081, lng: 55.141, accuracy_m: 260, recorded_at: new Date().toISOString() }],
      },
    })
    assert.equal(badAccRes.statusCode, 400, `Expected 400 for accuracy > 150m, got ${badAccRes.statusCode}`)

    // Reject live ping timestamp skew > 5 min -> 400
    const stalePingRes = await app.inject({
      method: 'POST',
      url: '/api/field-gps/pings',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agent1Cookie },
      payload: {
        points: [{ lat: 25.081, lng: 55.141, accuracy_m: 10, recorded_at: new Date(Date.now() - 10 * 60_000).toISOString() }],
      },
    })
    assert.equal(stalePingRes.statusCode, 400, `Expected 400 for >5min skew on live ping, got ${stalePingRes.statusCode}`)

    // Offline replay (>5 min old, <=7d) succeeds with offline_replay: true, and impossible travel (>200 km/h) flags
    const replayOkRes = await app.inject({
      method: 'POST',
      url: '/api/field-gps/pings',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agent1Cookie },
      payload: {
        points: [
          {
            lat: 24.4539,
            lng: 54.3773, // Abu Dhabi (~120km from Dubai Marina in 10 min -> impossible speed flag)
            accuracy_m: 14,
            offline_replay: true,
            recorded_at: new Date(Date.now() - 10 * 60_000).toISOString(),
            idempotency_key: 'offline-replay-jump-001',
          },
        ],
      },
    })
    assert.equal(replayOkRes.statusCode, 200, `Offline replay should succeed: ${replayOkRes.statusCode} ${replayOkRes.body}`)
    const replayOkBody = replayOkRes.json() as any
    assert.ok(Array.isArray(replayOkBody.flags) && replayOkBody.flags.some((f: string) => /impossible travel/i.test(f)), 'Jump >200 km/h must trigger Impossible travel flag')

    // Restore clean Dubai Marina ping before my-session assertion
    const cleanPing2 = await app.inject({
      method: 'POST',
      url: '/api/field-gps/pings',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agent1Cookie },
      payload: {
        points: [{ lat: 25.0805, lng: 55.1403, accuracy_m: 10, recorded_at: new Date().toISOString(), idempotency_key: 'valid-ping-key-002' }],
      },
    })
    assert.equal(cleanPing2.statusCode, 200)

    const mySessRes = await app.inject({
      method: 'GET',
      url: '/api/field-gps/my-session',
      headers: { cookie: agent1Cookie },
    })
    assert.equal(mySessRes.statusCode, 200)
    const mySess = mySessRes.json() as any
    assert.equal(mySess.session?.id, sessionId)
    assert.equal(mySess.live_location?.lat, 25.0805)
    assert.equal(mySess.live_location?.lng, 55.1403)
    assert.ok(Array.isArray(mySess.points) && mySess.points.length >= 1, 'my-session must include own trail points')

    // Agent 2 cannot see Agent 1's active session via my-session
    const agent2MyRes = await app.inject({
      method: 'GET',
      url: '/api/field-gps/my-session',
      headers: { cookie: agent2Cookie },
    })
    assert.equal(agent2MyRes.statusCode, 200)
    assert.equal((agent2MyRes.json() as any).session, null, 'Agent 2 must NEVER see Agent 1 session')

    // -------------------------------------------------------------------------
    // 2. Field Agent posts is_mock: true -> 422 + gps_spoof_attempt audit + flagged
    // -------------------------------------------------------------------------
    const spoofRes = await app.inject({
      method: 'POST',
      url: '/api/field-gps/pings',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agent1Cookie },
      payload: {
        points: [
          {
            lat: 25.1972,
            lng: 55.2744,
            accuracy_m: 5,
            is_mock: true,
            recorded_at: new Date().toISOString(),
            idempotency_key: 'spoof-ping-001',
          },
        ],
      },
    })
    assert.equal(spoofRes.statusCode, 422, `Expected 422 for mock GPS, got ${spoofRes.statusCode}: ${spoofRes.body}`)
    const spoofAudit = q.all<any>(
      `SELECT * FROM audit_log WHERE action = 'gps_spoof_attempt' AND user_id = ?`,
      agent1User.id,
    )
    assert.ok(spoofAudit.length >= 1, 'gps_spoof_attempt audit_log entry must be recorded')
    const flaggedLoc = q.get<any>(`SELECT is_flagged, flag_reason FROM staff_live_locations WHERE user_id = ?`, agent1User.id)
    assert.equal(flaggedLoc?.is_flagged, 1, 'staff_live_locations.is_flagged must be marked 1 after mock GPS attempt')

    // [Fix Round 1 #2] Subsequent clean ping must keep is_flagged === 1 sticky on staff_live_locations
    const cleanAfterSpoof = await app.inject({
      method: 'POST',
      url: '/api/field-gps/pings',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agent1Cookie },
      payload: {
        points: [
          {
            lat: 25.0806,
            lng: 55.1404,
            accuracy_m: 11,
            speed_mps: 1.1,
            recorded_at: new Date().toISOString(),
            idempotency_key: 'clean-after-spoof-001',
          },
        ],
      },
    })
    assert.equal(cleanAfterSpoof.statusCode, 200)
    const stickyPin = q.get<any>(`SELECT is_flagged, flag_reason FROM staff_live_locations WHERE user_id = ?`, agent1User.id)
    assert.equal(stickyPin?.is_flagged, 1, 'Clean ping after spoof must preserve is_flagged === 1')
    assert.ok(String(stickyPin?.flag_reason || '').includes('Mock GPS detected'), 'Clean ping after spoof must preserve Mock GPS detected reason')

    // -------------------------------------------------------------------------
    // 3. Field Agent calling GET /live, GET /sessions/:id/trail, GET /stream -> 403 Forbidden
    // -------------------------------------------------------------------------
    const server = app!
    for (const url of ['/api/field-gps/live', `/api/field-gps/sessions/${sessionId}/trail`, '/api/field-gps/stream']) {
      const forbiddenRes = await server.inject({
        method: 'GET',
        url,
        headers: { cookie: agent1Cookie },
      })
      assert.equal(forbiddenRes.statusCode, 403, `Field agent must get 403 on ${url}, got ${forbiddenRes.statusCode}`)
    }

    // -------------------------------------------------------------------------
    // 4. Owner/Admin/Haseeb calling GET /live -> 200 + immutable row in location_access_logs
    //    Also test SSE stream + SOS emergency alert & push
    // -------------------------------------------------------------------------
    const logsBeforeLive = q.val<number>(`SELECT COUNT(*) FROM location_access_logs`) ?? 0
    const liveRes = await app.inject({
      method: 'GET',
      url: '/api/field-gps/live',
      headers: { cookie: ownerCookie },
    })
    assert.equal(liveRes.statusCode, 200, `Owner GET /live failed: ${liveRes.statusCode} ${liveRes.body}`)
    const liveBody = liveRes.json() as any
    const agent1LivePin = (liveBody.rows || []).find((r: any) => r.user_id === agent1User.id)
    assert.ok(agent1LivePin, 'Live map must include active agent pin')
    assert.equal(Number(agent1LivePin.is_flagged), 1, 'GET /live must expose sticky is_flagged === 1 after clean ping following spoof')
    const logsAfterLive = q.val<number>(`SELECT COUNT(*) FROM location_access_logs`) ?? 0
    assert.ok(logsAfterLive > logsBeforeLive, 'GET /live must insert immutable row into location_access_logs')

    // Admin and Haseeb also allowed on /live
    assert.equal((await app.inject({ method: 'GET', url: '/api/field-gps/live', headers: { cookie: adminCookie } })).statusCode, 200)
    assert.equal((await app.inject({ method: 'GET', url: '/api/field-gps/live', headers: { cookie: haseebCookie } })).statusCode, 200)

    // Trigger SOS -> dispatches swk_calls_sos push to Leadership (exactly 1 push per leader, zero duplicates)
    sentFcm.length = 0
    const sseEv = await readFirstSseEvent(
      `${baseUrl}/api/field-gps/stream`,
      { cookie: ownerCookie },
      async () => {
        const sosRes = await app!.inject({
          method: 'POST',
          url: '/api/field-gps/sos',
          headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agent1Cookie },
          payload: { lat: 25.0809, lng: 55.1408, reason: 'Client medical emergency at viewing' },
        })
        assert.equal(sosRes.statusCode, 200, `SOS endpoint failed: ${sosRes.statusCode} ${sosRes.body}`)
      },
    )
    assert.equal(sseEv.status, 200)
    assert.match(sseEv.contentType, /text\/event-stream/)
    assert.ok(sseEv.chunk.includes('event: field_gps'), `Expected SSE field_gps event, got: ${sseEv.chunk}`)
    await new Promise(r => setTimeout(r, 30))
    const ownerSosPushes = sentFcm.filter(p => p.userId === ownerUser.id && p.payload?.channel === 'swk_calls_sos')
    assert.equal(ownerSosPushes.length, 1, `Expected EXACTLY ONE SOS push per leader, got ${ownerSosPushes.length}`)
    assert.ok(String(ownerSosPushes[0]!.payload?.body || '').includes('25.0809'), 'SOS push must include exact Dubai coordinates')

    // Stop active session cleanly before historical & expiration checks
    const stopRes = await app.inject({
      method: 'POST',
      url: '/api/field-gps/sessions/stop',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agent1Cookie },
      payload: {},
    })
    assert.equal(stopRes.statusCode, 200)
    assert.equal((stopRes.json() as any).stopped, true)

    // [Fix Round 1 #1] Same-day closed session trail WITHOUT reason -> 400 + Denied log
    const sameDayClosedNoReason = await app.inject({
      method: 'GET',
      url: `/api/field-gps/sessions/${sessionId}/trail`,
      headers: { cookie: ownerCookie },
    })
    assert.equal(
      sameDayClosedNoReason.statusCode,
      400,
      `Same-day closed session trail without reason must return 400, got ${sameDayClosedNoReason.statusCode}`,
    )
    const sameDayDeniedLog = q.get<any>(
      `SELECT * FROM location_access_logs WHERE field_session_id = ? AND access_outcome = 'Denied – Off Hours Blocked' ORDER BY id DESC LIMIT 1`,
      sessionId,
    )
    assert.ok(sameDayDeniedLog, 'Denied same-day closed trail access must log Denied – Off Hours Blocked')

    // [Fix Round 1 #4] Stationary heartbeats (speed_mps=0, varying accuracy) do NOT false-flag;
    // >=5 identical coords + identical accuracy across distinct timestamps DO flag
    const a2Start = await app.inject({
      method: 'POST',
      url: '/api/field-gps/sessions/start',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agent2Cookie },
      payload: { purpose: 'Viewing', community: 'Downtown Dubai' },
    })
    assert.equal(a2Start.statusCode, 200)
    const baseStationaryMs = Date.now() - 4 * 60_000
    const stationaryRes = await app.inject({
      method: 'POST',
      url: '/api/field-gps/pings',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agent2Cookie },
      payload: {
        offline_replay: true,
        points: [10, 13, 9, 14, 11].map((acc, idx) => ({
          lat: 25.197201,
          lng: 55.274401,
          accuracy_m: acc,
          speed_mps: 0,
          recorded_at: new Date(baseStationaryMs + idx * 35_000).toISOString(),
          idempotency_key: `stationary-ok-${idx}`,
        })),
      },
    })
    assert.equal(stationaryRes.statusCode, 200)
    assert.equal(
      ((stationaryRes.json() as any).flags || []).length,
      0,
      'Realistic stationary heartbeats must NOT trigger Identical coordinates repeated',
    )

    // [Important #7]: Missing speed_mps (null) even with identical accuracy must NOT false-flag stationary GPS
    const stationaryNullSpeedRes = await app.inject({
      method: 'POST',
      url: '/api/field-gps/pings',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agent2Cookie },
      payload: {
        offline_replay: true,
        points: [0, 1, 2, 3, 4].map(idx => ({
          lat: 25.198101,
          lng: 55.275201,
          accuracy_m: 12,
          speed_mps: null,
          recorded_at: new Date(baseStationaryMs + 100_000 + idx * 15_000).toISOString(),
          idempotency_key: `stationary-null-speed-${idx}`,
        })),
      },
    })
    assert.equal(stationaryNullSpeedRes.statusCode, 200)
    assert.equal(
      ((stationaryNullSpeedRes.json() as any).flags || []).length,
      0,
      'Stationary pings with speed_mps=null must NOT false-positive Identical coordinates repeated',
    )

    // [Important #5]: offline_sync_queue_log must NOT store raw lat/lng in payload_json
    const queueRow = q.get<{ payload_json: string }>(
      `SELECT payload_json FROM offline_sync_queue_log WHERE idempotency_key = 'valid-ping-key-001'`,
    )
    assert.ok(queueRow, 'Expected offline_sync_queue_log entry for valid-ping-key-001')
    const queuePayload = JSON.parse(queueRow.payload_json)
    assert.equal('lat' in queuePayload, false, 'offline_sync_queue_log payload_json must omit raw lat')
    assert.equal('lng' in queuePayload, false, 'offline_sync_queue_log payload_json must omit raw lng')

    const fakeRepeatRes = await app.inject({
      method: 'POST',
      url: '/api/field-gps/pings',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agent2Cookie },
      payload: {
        offline_replay: true,
        points: [0, 1, 2, 3, 4].map(idx => ({
          lat: 25.211111,
          lng: 55.282222,
          accuracy_m: 5,
          speed_mps: 1.8,
          recorded_at: new Date(baseStationaryMs + 200_000 + idx * 10_000).toISOString(),
          idempotency_key: `fake-repeat-${idx}`,
        })),
      },
    })
    assert.equal(fakeRepeatRes.statusCode, 200)
    assert.ok(
      ((fakeRepeatRes.json() as any).flags || []).some((f: string) => /identical coordinates/i.test(f)),
      '>=5 identical coords with non-zero speed / identical accuracy must trigger Identical coordinates repeated flag',
    )
    await app.inject({
      method: 'POST',
      url: '/api/field-gps/sessions/stop',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agent2Cookie },
      payload: {},
    })

    // -------------------------------------------------------------------------
    // 5. Historical closed trail without reason -> 400; with reason -> 200 + compliance & access log
    // -------------------------------------------------------------------------
    const agent1EmpId = q.val<number>(`SELECT id FROM employees WHERE user_id = ? AND deleted_at IS NULL LIMIT 1`, agent1User.id)!
    const yesterday = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10)
    const closedOldSession = createRecord(
      getDef('field_sessions'),
      {
        employee_id: agent1EmpId,
        duty_date: yesterday,
        scheduled_start: `${yesterday}T09:00`,
        scheduled_end: `${yesterday}T18:00`,
        started_at: `${yesterday}T09:15`,
        ended_at: `${yesterday}T17:45`,
        status: 'Completed (Off Duty)',
        assigned_location: 'Downtown Dubai',
        last_lat: '25.1972',
        last_lng: '55.2744',
      },
      SYSTEM_CTX,
    )
    q.run(
      `INSERT INTO duty_location_batches (field_session_id, employee_id, user_id, points_json, points_count, last_lat, last_lng, accuracy_m, recorded_at, received_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      closedOldSession.id,
      agent1EmpId,
      agent1User.id,
      JSON.stringify([{ lat: 25.1972, lng: 55.2744, accuracy_m: 10, recorded_at: `${yesterday}T10:00:00.000Z` }]),
      1,
      '25.1972',
      '55.2744',
      10,
      `${yesterday}T10:00:00.000Z`,
      `${yesterday}T10:00:05.000Z`,
    )

    const trailNoReasonRes = await app.inject({
      method: 'GET',
      url: `/api/field-gps/sessions/${closedOldSession.id}/trail`,
      headers: { cookie: ownerCookie },
    })
    assert.equal(trailNoReasonRes.statusCode, 400, `Historical closed trail without reason must return 400, got ${trailNoReasonRes.statusCode}`)
    const deniedLog = q.get<any>(
      `SELECT * FROM location_access_logs WHERE field_session_id = ? AND access_outcome = 'Denied – Off Hours Blocked' ORDER BY id DESC LIMIT 1`,
      closedOldSession.id,
    )
    assert.ok(deniedLog, 'Denied off-hours access must log to location_access_logs')

    const trailWithReasonRes = await app.inject({
      method: 'GET',
      url: `/api/field-gps/sessions/${closedOldSession.id}/trail?reason=${encodeURIComponent('Audit investigation into client complaint #441')}`,
      headers: { cookie: ownerCookie },
    })
    assert.equal(trailWithReasonRes.statusCode, 200, `Historical closed trail with reason must return 200, got ${trailWithReasonRes.statusCode}: ${trailWithReasonRes.body}`)
    const trailData = trailWithReasonRes.json() as any
    assert.equal(trailData.points?.length, 1)
    const grantedExceptionLog = q.get<any>(
      `SELECT * FROM location_access_logs WHERE field_session_id = ? AND access_outcome = 'Granted – Documented Emergency Exception' ORDER BY id DESC LIMIT 1`,
      closedOldSession.id,
    )
    assert.ok(grantedExceptionLog, 'Historical trail access with reason must log exception in location_access_logs')
    const complianceCase = q.get<any>(
      `SELECT * FROM compliance_cases WHERE linked_entity = 'field_sessions' AND linked_record_id = ? AND case_category = 'Off-Hours GPS Access Alert (7.03)' ORDER BY id DESC LIMIT 1`,
      closedOldSession.id,
    )
    assert.ok(complianceCase, 'Historical/off-hours GPS access must create Control 3.10/7.03 compliance_cases alert')

    // -------------------------------------------------------------------------
    // 6. autoExpireFieldSessions() (>12h) & purgeOldGpsBatches() (>90d while retaining field_sessions)
    // -------------------------------------------------------------------------
    const middayUtc = new Date('2026-11-23T08:00:00.000Z') // 12:00 Asia/Dubai (well before 21:00)
    const oldStartedIso = new Date(middayUtc.getTime() - 13 * 3600_000).toISOString()
    const freshStartedIso = new Date(middayUtc.getTime() - 2 * 3600_000).toISOString()

    const expSession = createRecord(
      getDef('field_sessions'),
      {
        employee_id: agent1EmpId,
        duty_date: '2026-11-23',
        scheduled_start: oldStartedIso.slice(0, 16),
        scheduled_end: '2026-11-23T17:00',
        started_at: oldStartedIso.slice(0, 16),
        status: 'Active (On Duty)',
        assigned_location: 'Palm Jumeirah',
      },
      SYSTEM_CTX,
    )
    q.run(
      `INSERT INTO staff_live_locations (user_id, employee_id, field_session_id, lat, lng, accuracy_m, updated_at) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET field_session_id = excluded.field_session_id, updated_at = excluded.updated_at`,
      agent1User.id, agent1EmpId, expSession.id, 25.1124, 55.1390, 10, oldStartedIso,
    )

    const agent2EmpId = q.val<number>(`SELECT id FROM employees WHERE (user_id = ? OR lower(email) = ?) AND deleted_at IS NULL LIMIT 1`, agent2User.id, agent2User.email.toLowerCase())
      ?? createRecord(getDef('employees'), { name: 'Fareed', user_id: agent2User.id, email: agent2User.email, status: 'Active', branch_id: dxbBranchId }, SYSTEM_CTX).id

    const freshSession = createRecord(
      getDef('field_sessions'),
      {
        employee_id: agent2EmpId,
        duty_date: '2026-11-23',
        scheduled_start: freshStartedIso.slice(0, 16),
        scheduled_end: '2026-11-23T17:00',
        started_at: freshStartedIso.slice(0, 16),
        status: 'Active (On Duty)',
        assigned_location: 'Business Bay',
      },
      SYSTEM_CTX,
    )
    q.run(
      `INSERT INTO staff_live_locations (user_id, employee_id, field_session_id, lat, lng, accuracy_m, updated_at) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET field_session_id = excluded.field_session_id, updated_at = excluded.updated_at`,
      agent2User.id, agent2EmpId, freshSession.id, 25.1865, 55.2631, 10, freshStartedIso,
    )

    const expireOut = autoExpireFieldSessions(middayUtc)
    assert.equal(expireOut.expired, 1, `Expected 1 expired (>12h) session, got ${expireOut.expired}`)
    assert.equal(q.val<string>(`SELECT status FROM field_sessions WHERE id = ?`, expSession.id), 'Auto-Expired')
    assert.equal(q.val<string>(`SELECT status FROM field_sessions WHERE id = ?`, freshSession.id), 'Active (On Duty)')
    assert.equal(q.get(`SELECT * FROM staff_live_locations WHERE user_id = ?`, agent1User.id), undefined, 'Expired session pin must be removed from staff_live_locations')
    assert.ok(q.get(`SELECT * FROM staff_live_locations WHERE user_id = ?`, agent2User.id), 'Fresh active session pin must remain')

    // 19:35 Asia/Dubai (15:35 UTC) sends once-per-day friendly reminder for still-active freshSession
    const dubai1935Utc = new Date('2026-11-23T15:35:00.000Z')
    const remind1 = autoExpireFieldSessions(dubai1935Utc)
    assert.equal(remind1.expired, 0)
    assert.equal(remind1.reminded, 1, 'Expected 1 friendly reminder at 19:35 Asia/Dubai')
    const remind2 = autoExpireFieldSessions(new Date('2026-11-23T15:40:00.000Z'))
    assert.equal(remind2.reminded, 0, '19:30 reminder must be deduped once per day')

    // [Fix Round 1 #3] SOS Emergency Active session must NEVER be auto-expired at 21:00 Asia/Dubai
    const sosPersistSession = createRecord(
      getDef('field_sessions'),
      {
        employee_id: agent1EmpId,
        duty_date: '2026-11-23',
        scheduled_start: freshStartedIso.slice(0, 16),
        scheduled_end: '2026-11-23T17:00',
        started_at: freshStartedIso.slice(0, 16),
        status: 'SOS Emergency Active',
        sos_triggered: true,
        sos_reason: 'SOS beacon must stay live past 21:00',
        assigned_location: 'Palm Jumeirah SOS',
      },
      SYSTEM_CTX,
    )
    q.run(
      `INSERT INTO staff_live_locations (user_id, employee_id, field_session_id, lat, lng, accuracy_m, is_flagged, flag_reason, updated_at) VALUES (?,?,?,?,?,?,1,?,?)
       ON CONFLICT(user_id) DO UPDATE SET field_session_id = excluded.field_session_id, is_flagged = 1, flag_reason = excluded.flag_reason, updated_at = excluded.updated_at`,
      agent1User.id, agent1EmpId, sosPersistSession.id, 25.1124, 55.1390, 10, 'SOS Emergency', freshStartedIso,
    )

    // 21:05 Asia/Dubai (17:05 UTC) auto-stops normal active session at field_duty_auto_stop_hour (21)
    // while exempting SOS Emergency Active!
    const dubai2105Utc = new Date('2026-11-23T17:05:00.000Z')
    const stop21 = autoExpireFieldSessions(dubai2105Utc)
    assert.equal(stop21.expired, 1, 'Expected 1 normal active session to auto-expire past 21:00 Asia/Dubai (SOS exempted)')
    assert.equal(q.val<string>(`SELECT status FROM field_sessions WHERE id = ?`, freshSession.id), 'Auto-Expired')
    assert.equal(q.get(`SELECT * FROM staff_live_locations WHERE user_id = ?`, agent2User.id), undefined)
    assert.equal(q.val<string>(`SELECT status FROM field_sessions WHERE id = ?`, sosPersistSession.id), 'SOS Emergency Active', 'SOS Emergency Active session must survive 21:00 auto-stop')
    assert.ok(q.get(`SELECT * FROM staff_live_locations WHERE user_id = ?`, agent1User.id), 'SOS Emergency Active live pin must NOT be deleted past 21:00')

    // Test 90-day PDPL purge on duty_location_batches while retaining field_sessions
    const refNow = new Date('2026-11-23T08:00:00.000Z')
    const old95d = new Date(refNow.getTime() - 95 * 86_400_000).toISOString()
    const recent10d = new Date(refNow.getTime() - 10 * 86_400_000).toISOString()

    const ancientBatchId = q.insert(
      `INSERT INTO duty_location_batches (field_session_id, employee_id, user_id, points_json, points_count, last_lat, last_lng, accuracy_m, recorded_at, received_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      closedOldSession.id, agent1EmpId, agent1User.id, '[]', 1, '25.19', '55.27', 10, old95d, old95d,
    )
    const recentBatchId = q.insert(
      `INSERT INTO duty_location_batches (field_session_id, employee_id, user_id, points_json, points_count, last_lat, last_lng, accuracy_m, recorded_at, received_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      closedOldSession.id, agent1EmpId, agent1User.id, '[]', 1, '25.19', '55.27', 10, recent10d, recent10d,
    )

    // [Important #5]: Also test PDPL 90-day purge on offline_sync_queue_log GPS actions
    q.run(
      `INSERT INTO offline_sync_queue_log (idempotency_key, user_id, action_type, payload_json, result_json, queued_at, synced_at) VALUES (?,?,?,?,?,?,?)`,
      'ancient-gps-queue-95d', agent1User.id, 'field_gps_ping', '{"session_id":1}', '{"ok":true}', old95d, old95d,
    )
    q.run(
      `INSERT INTO offline_sync_queue_log (idempotency_key, user_id, action_type, payload_json, result_json, queued_at, synced_at) VALUES (?,?,?,?,?,?,?)`,
      'recent-gps-queue-10d', agent1User.id, 'field_gps_ping', '{"session_id":1}', '{"ok":true}', recent10d, recent10d,
    )

    const purgeOut = purgeOldGpsBatches(refNow)
    assert.ok(purgeOut.purged >= 2, `Expected >= 2 records purged (>90d batches + queue logs), got ${purgeOut.purged}`)
    assert.equal(q.get(`SELECT id FROM duty_location_batches WHERE id = ?`, ancientBatchId), undefined, '>90d batch must be deleted')
    assert.ok(q.get(`SELECT id FROM duty_location_batches WHERE id = ?`, recentBatchId), '<90d batch must be preserved')
    assert.equal(q.get(`SELECT id FROM offline_sync_queue_log WHERE idempotency_key = 'ancient-gps-queue-95d'`), undefined, '>90d offline_sync_queue_log GPS row must be deleted')
    assert.ok(q.get(`SELECT id FROM offline_sync_queue_log WHERE idempotency_key = 'recent-gps-queue-10d'`), '<90d offline_sync_queue_log GPS row must be preserved')
    assert.ok(q.get(`SELECT id FROM field_sessions WHERE id = ?`, closedOldSession.id), 'field_sessions summary row must be retained after PDPL batch purge')

    // [Important #6]: Verify liveBus channels are strictly isolated between demo and prod workspaces
    const { openDatabase, runInDb } = await import('../src/server/db')
    const { liveBus } = await import('../src/server/notify')
    const { buildApp: _unused } = { buildApp }
    void _unused
    const fakeDemoDb = openDatabase(path.join(tmpDir, 'demo-livebus.db'))
    try {
      const prodHits: any[] = []
      const demoHits: any[] = []
      const onProd = (ev: any) => prodHits.push(ev)
      const onDemo = (ev: any) => demoHits.push(ev)
      liveBus.on('field-gps:live:prod', onProd)
      liveBus.on('field-gps:live:demo', onDemo)
      const { liveScope } = await import('../src/server/notify')
      runInDb(fakeDemoDb, () => {
        assert.equal(liveScope(), 'demo')
        liveBus.emit(`field-gps:live:${liveScope()}`, { demoOnly: true })
      })
      assert.equal(liveScope(), 'prod')
      assert.equal(demoHits.length, 1)
      assert.equal(prodHits.length, 0, 'Demo liveBus emit must NEVER bleed into prod field-gps:live:prod channel')
      liveBus.off('field-gps:live:prod', onProd)
      liveBus.off('field-gps:live:demo', onDemo)
    } finally {
      fakeDemoDb.close()
    }

    console.log('Field GPS anti-spoof, Control 3.10/7.03 audit & PDPL purge checks passed.')
  } finally {
    try { setPushTransportForTests(null) } catch {}
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
