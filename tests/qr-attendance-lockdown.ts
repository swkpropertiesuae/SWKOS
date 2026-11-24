import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const createdTmp = !process.env.DATA_DIR
const tmpDir = process.env.DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'swk-qr-lockdown-'))
process.env.DATA_DIR = tmpDir
process.env.APP_SECRET = process.env.APP_SECRET || 'test-qr-attendance-lockdown-secret-0123456789'
process.env.DEMO_ENABLED = 'false'

async function main() {
  const { mainDb, q } = await import('../src/server/db')
  const { syncSchema } = await import('../src/server/schema')
  const { seedReference } = await import('../src/server/seed')
  const { hashPassword } = await import('../src/server/auth')
  const { currentQrToken, inspectQrToken } = await import('../src/server/domain/attendance-security')
  const { buildApp } = await import('../src/server/app')

  syncSchema()
  await seedReference()

  const pw = 'SwkQrLockdown-2026!'
  const setPw = (email: string) => {
    const uid = q.val<number>(`SELECT id FROM users WHERE lower(email) = ?`, email.toLowerCase())!
    q.run(`UPDATE users SET password_hash = ?, must_change_password = 0, active = 1 WHERE id = ?`, hashPassword(pw), uid)
    return uid
  }
  const adminId = setPw('admin@swk.properties')
  const managerId = setPw('haseeb@swk.properties')
  const agentId = setPw('saifullah@swk.properties')
  assert.ok(adminId && managerId && agentId)

  const app = await buildApp()
  let ipSeq = 40
  const login = async (email: string) => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: `127.0.12.${ipSeq++}`,
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web' },
      payload: { email, password: pw },
    })
    assert.equal(r.statusCode, 200, `Login failed for ${email}: ${r.body}`)
    return 'swk_sid=' + r.cookies.find((c: any) => c.name === 'swk_sid')!.value
  }

  const mkDeviceKey = () => {
    const kp = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const j = kp.publicKey.export({ format: 'jwk' }) as any
    return { priv: kp.privateKey, pub: { kty: j.kty, crv: j.crv, x: j.x, y: j.y } }
  }

  try {
    const cookieAdmin = await login('admin@swk.properties')
    const cookieManager = await login('haseeb@swk.properties')

    // 1. Verify locked-down defaults: rotating 20s QR + Al Saqr Business Tower 75m GPS
    const pubWifi = (await app.inject({ method: 'GET', url: '/api/public/reception-qr/wifi-config' })).json()
    assert.equal(pubWifi.qr_mode, 'rotating', 'Default QR mode must be rotating')
    assert.equal(pubWifi.qr_step_s, 20, 'Default QR rotation step must be 20 seconds')
    assert.equal(pubWifi.qr_require_live_camera, true, 'Live camera capture must be required by default')
    assert.equal(pubWifi.office_gps_enforce, true, 'Al Saqr Business Tower GPS enforcement must be active by default')
    assert.equal(pubWifi.office_gps_radius_m, 75, 'Default tight GPS radius must be 75m')
    assert.equal(pubWifi.gps_max_accuracy_m, 65, 'Default max GPS accuracy must be 65m')
    assert.ok(Math.abs(pubWifi.office_gps_lat - 25.2131) < 0.001, 'Office lat must anchor to Al Saqr Business Tower')
    assert.ok(Math.abs(pubWifi.office_gps_lng - 55.2768) < 0.001, 'Office lng must anchor to Al Saqr Business Tower')
    assert.ok(/Al Saqr Business Tower/i.test(pubWifi.office_gps_name))

    // 2. Verify short-TTL rotating token expiry math (valid at t0 & t0+20s, EXPIRED at t0+45s!)
    const t0 = Date.now()
    const tok0 = currentQrToken(t0)
    assert.equal(tok0.mode, 'rotating')
    assert.equal(tok0.step_s, 20)
    assert.equal(tok0.max_ttl_s, 40)
    assert.equal(inspectQrToken(tok0.token, t0).valid, true)
    assert.equal(inspectQrToken(tok0.token, t0 + 19_000).valid, true)
    assert.equal(inspectQrToken(tok0.token, t0 + 45_000).valid, false, 'Screenshot older than 40s MUST expire')

    // 3. Lock office Wi-Fi IP as Admin
    const lockRes = await app.inject({
      method: 'POST',
      url: '/api/swk-ops/attendance-setup',
      headers: { cookie: cookieAdmin, 'x-swk-client': 'web', 'content-type': 'application/json' },
      payload: { lock_current_ip: true },
    })
    assert.equal(lockRes.statusCode, 200, `Lock office IP failed: ${lockRes.body}`)

    const getToken = async () => {
      const r = await app.inject({
        method: 'GET',
        url: '/api/swk-ops/reception-token',
        headers: { cookie: cookieManager, 'x-swk-client': 'web' },
      })
      assert.equal(r.statusCode, 200)
      return r.json().token as string
    }

    const devKey = mkDeviceKey()
    const attemptCheckIn = async (payload: string, overrides: Record<string, any> = {}) => {
      const ch = (await app.inject({ method: 'GET', url: '/api/public/reception-qr/challenge' })).json().challenge
      const sig = crypto.sign('sha256', Buffer.from(`${ch}.${payload}`), { key: devKey.priv, dsaEncoding: 'ieee-p1363' }).toString('base64url')
      return app.inject({
        method: 'POST',
        url: '/api/public/reception-qr/scan-login-checkin',
        headers: { 'content-type': 'application/json' },
        payload: {
          email: 'saifullah@swk.properties',
          password: pw,
          qr_payload: payload,
          challenge: ch,
          device_pub: devKey.pub,
          device_sig: sig,
          device_name: 'iPhone 16 Pro',
          capture_source: 'live_camera',
          captured_at: new Date().toISOString(),
          gps_lat: 25.21315,
          gps_lng: 55.27685,
          gps_accuracy_m: 12,
          ...overrides,
        },
      })
    }

    // 4. Reject static screenshot / forwarded #c= link (missing live_camera capture attestation)
    const linkSpoof = await attemptCheckIn(await getToken(), { capture_source: 'link_hash' })
    assert.equal(linkSpoof.statusCode, 403, `Forwarded link spoof must be rejected 403, got ${linkSpoof.statusCode}: ${linkSpoof.body}`)
    assert.match(linkSpoof.json().error, /screenshot|camera/i)

    // 5. Reject stale camera capture timestamp (> 45s old)
    const staleCap = await attemptCheckIn(await getToken(), { captured_at: new Date(Date.now() - 60_000).toISOString() })
    assert.equal(staleCap.statusCode, 400, `Stale capture must be rejected 400, got ${staleCap.statusCode}`)

    // First valid attempt triggers pending device approval -> approve device as Manager
    const pendingRes = await attemptCheckIn(await getToken())
    assert.equal(pendingRes.statusCode, 403)
    const devices = (
      await app.inject({
        method: 'GET',
        url: '/api/swk-ops/attendance-control',
        headers: { cookie: cookieManager, 'x-swk-client': 'web' },
      })
    ).json().devices
    const pend = devices.find((d: any) => d.status === 'Pending')
    assert.ok(pend, 'Pending device must appear for Manager approval')
    await app.inject({
      method: 'POST',
      url: `/api/swk-ops/attendance-control/device/${pend.id}`,
      headers: { cookie: cookieManager, 'x-swk-client': 'web', 'content-type': 'application/json' },
      payload: { approve: true },
    })

    // 6. Reject missing GPS
    const noGps = await attemptCheckIn(await getToken(), { gps_lat: undefined, gps_lng: undefined, gps_accuracy_m: undefined })
    assert.equal(noGps.statusCode, 403, `Missing GPS must be rejected 403: ${noGps.body}`)

    // 7. Reject remote GPS outside 75m Al Saqr Business Tower perimeter (~130m down Sheikh Zayed Road & Dubai Marina)
    const downSzr = await attemptCheckIn(await getToken(), { gps_lat: 25.2143, gps_lng: 55.2768, gps_accuracy_m: 10 })
    assert.equal(downSzr.statusCode, 403, `130m outside Al Saqr must be rejected 403: ${downSzr.body}`)
    assert.match(downSzr.json().error, /Al Saqr Business Tower/i)

    const marinaSpoof = await attemptCheckIn(await getToken(), { gps_lat: 25.0805, gps_lng: 55.1403, gps_accuracy_m: 10 })
    assert.equal(marinaSpoof.statusCode, 403, `Dubai Marina remote check-in must be rejected 403: ${marinaSpoof.body}`)

    // 8. Reject coarse GPS accuracy (> 65m) and synthetic 0m mock GPS
    const coarseGps = await attemptCheckIn(await getToken(), { gps_accuracy_m: 120 })
    assert.equal(coarseGps.statusCode, 403, `Coarse GPS (>65m) must be rejected 403: ${coarseGps.body}`)
    const mockZeroGps = await attemptCheckIn(await getToken(), { gps_accuracy_m: 0 })
    assert.equal(mockZeroGps.statusCode, 403, `Synthetic 0m mock GPS must be rejected 403: ${mockZeroGps.body}`)

    // 9. Valid rotating QR + live_camera + Al Saqr Business Tower GPS (within 75m) -> 200 OK!
    const validTok = await getToken()
    const okRes = await attemptCheckIn(validTok)
    assert.equal(okRes.statusCode, 200, `Valid Al Saqr check-in failed: ${okRes.body}`)
    const okJson = okRes.json()
    assert.equal(okJson.verified, true)
    assert.equal(okJson.verification_summary.gps_verified, true)
    assert.equal(okJson.verification_summary.qr_mode, 'rotating')
    assert.equal(okJson.verification_summary.capture_source, 'live_camera')
    assert.ok(okJson.verification_summary.distance_m <= 20, `Expected <=20m from Al Saqr, got ${okJson.verification_summary.distance_m}`)
    assert.match(okJson.verification_summary.office_name, /Al Saqr Business Tower/i)

    // 10. Single-use rotating QR nonce burn: replaying exact same rotating token MUST fail 400!
    const replayRes = await attemptCheckIn(validTok)
    assert.equal(replayRes.statusCode, 400, `Replaying burned rotating QR frame must fail 400, got ${replayRes.statusCode}: ${replayRes.body}`)
    assert.match(replayRes.json().error, /already been used/i)

    console.log('✅ QR Camera Attendance Lockdown (20s Rotating QR + Live Camera + Al Saqr 75m GPS) Test PASSED!')
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
  console.error('❌ QR attendance lockdown test failed:', err)
  process.exit(1)
})
