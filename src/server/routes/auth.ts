import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { dirs } from '../config'
import { openStored,persistUpload,removeStored } from '../integrations/storage'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { q,tx } from '../db'
import { COOKIE,DEMO_PREFIX } from '../app'
import { runInDb,inDemo } from '../db'
import { getDemoDb } from '../demo/workspace'
import { config } from '../config'
import { attemptLogin,createSession,destroyDeviceSessions,destroySessionByHash,destroyUserSessions,hashPassword,issueStreamTicket,loadUser,newTotpSecret,sessionHash,validatePasswordStrength,verifyPassword,verifyTotp } from '../auth'
import { bad,HttpError,nowIso } from '../util'
import { audit,getDef } from '../engine'
import { getSetting,encryptSecret,decryptSecret } from '../settings'
import { canOpenEmployeeRecords,isFullAccessSwkUser,isOwnerSwkUser } from '../../shared/swk-staff-access'

function deriveEcDeviceId(jwk: { kty: string; crv: string; x: string; y: string }): string {
  try {
    crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, format: 'jwk' })
  } catch {
    throw bad('Invalid EC P-256 device public key')
  }
  return crypto.createHash('sha256').update(`${jwk.x}.${jwk.y}`).digest('hex').slice(0, 40)
}

export default async function (app: FastifyInstance) {
  const setCookie = (req: any, reply: any, token: string, expires: Date) => {
    const secure = config.cookieSecure ?? (config.isProd && (req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https'))
    reply.setCookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: !!secure, path: '/', expires })
  }

  app.get('/api/auth/branding', async () => ({ company_name: getSetting('company_name'), base_currency: getSetting('base_currency') }))

  app.post('/api/auth/login', { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } }, async (req, reply) => {
    const clientHeader = String(req.headers['x-swk-client'] || '').trim().toLowerCase()
    const isMobileClient = clientHeader === 'mobile'
    const b = z.object({
      email: z.string().min(3).max(200),
      password: z.string().min(1).max(200),
      totp: z.string().max(10).optional(),
      device_id: z.string().trim().min(4).max(80).optional(),
      device_pub: z.object({
        kty: z.literal('EC'),
        crv: z.literal('P-256'),
        x: z.string().min(10).max(200),
        y: z.string().min(10).max(200),
      }).optional(),
      device_name: z.string().trim().max(120).optional(),
      platform: z.string().trim().max(40).optional(),
      app_version: z.string().trim().max(40).optional(),
    }).parse(req.body)

    let resolvedMobileDeviceId: string | undefined
    if (isMobileClient) {
      if (!b.device_pub && !b.device_id) {
        throw bad('device_pub or device_id is required for mobile sign-in')
      }
      if (b.device_id !== undefined && !/^[A-Za-z0-9._:-]{4,80}$/.test(b.device_id)) {
        throw bad('Invalid device_id format')
      }
      if (b.device_pub) {
        const derived = deriveEcDeviceId(b.device_pub)
        if (b.device_id && b.device_id !== derived) {
          throw bad('device_id does not match device_pub')
        }
        resolvedMobileDeviceId = derived
      } else {
        resolvedMobileDeviceId = b.device_id!
      }
    }

    const isDemoLogin = config.demo.enabled && b.email.trim().toLowerCase() === config.demo.email
    if (isDemoLogin && !getDemoDb()) throw new HttpError(503, 'The demo workspace is still being prepared. Try again in a minute.')
    const work = () => {
      const r = attemptLogin(b.email, b.password, b.totp, req.ip, req.headers['user-agent'])
      if ('needsTotp' in r && r.needsTotp) return { needsTotp: true as const }
      const user = (r as any).user
      if (isMobileClient) {
        if (user.party_id) {
          throw new HttpError(403, 'Mobile staff sessions are not available for customer portal accounts.')
        }
        const deviceId = resolvedMobileDeviceId!
        const ownerConflict = q.get<{ user_id: number }>(
          `SELECT user_id FROM staff_devices WHERE device_id = ? AND user_id <> ? LIMIT 1`,
          deviceId,
          user.id,
        )
        if (ownerConflict) {
          throw new HttpError(403, 'This device is registered to another person. Each person must use their own phone.')
        }
        const existingDev = q.get<{ id: number; status: string; label: string | null; revoked_at: string | null }>(
          `SELECT id, status, label, revoked_at FROM staff_devices WHERE user_id = ? AND device_id = ?`,
          user.id,
          deviceId,
        )
        if (existingDev && (existingDev.status === 'Blocked' || !!existingDev.revoked_at)) {
          throw new HttpError(403, 'This device has been blocked or revoked by an administrator.')
        }
        const selfApprove = isFullAccessSwkUser(user)
        const now = nowIso()
        const label = String(b.device_name || req.headers['user-agent'] || 'SWK Mobile').trim().slice(0, 80) || 'SWK Mobile'
        const platform = b.platform ? String(b.platform).trim().slice(0, 40) : null
        const appVersion = b.app_version ? String(b.app_version).trim().slice(0, 40) : null
        let deviceStatus: 'Approved' | 'Pending'
        if (existingDev) {
          deviceStatus = existingDev.status === 'Approved' || selfApprove ? 'Approved' : 'Pending'
          q.run(
            `UPDATE staff_devices SET status = ?, label = ?, platform = COALESCE(?, platform), app_version = COALESCE(?, app_version), last_seen = ? WHERE id = ?`,
            deviceStatus,
            b.device_name ? label : (existingDev.label || label),
            platform,
            appVersion,
            now,
            existingDev.id,
          )
        } else {
          deviceStatus = selfApprove ? 'Approved' : 'Pending'
          q.run(
            `INSERT INTO staff_devices (user_id, device_id, label, status, first_seen, last_seen, platform, app_version) VALUES (?,?,?,?,?,?,?,?)`,
            user.id,
            deviceId,
            label,
            deviceStatus,
            now,
            now,
            platform,
            appVersion,
          )
        }
        if (getSetting('mobile_require_device_approval') && deviceStatus !== 'Approved') {
          throw new HttpError(403, 'This mobile device is pending approval by the Owner or Manager.')
        }
        const s = createSession(user.id, req.ip, req.headers['user-agent'], deviceId)
        const must = q.val<number>(`SELECT must_change_password FROM users WHERE id = ?`, user.id)
        return { user, s, must, deviceId, deviceStatus }
      }
      const s = createSession(user.id, req.ip, req.headers['user-agent'])
      const must = q.val<number>(`SELECT must_change_password FROM users WHERE id = ?`, user.id)
      return { user, s, must }
    }
    const out = isDemoLogin ? runInDb(getDemoDb()!, work) : work()
    if ('needsTotp' in out) return { needsTotp: true }
    if (isMobileClient) {
      reply.header('cache-control', 'no-store')
      return {
        ok: true,
        demo: isDemoLogin,
        user: { id: out.user.id, name: out.user.name, email: out.user.email, role: out.user.role_name },
        mustChangePassword: !!out.must,
        session_token: (isDemoLogin ? DEMO_PREFIX : '') + out.s.token,
        device_id: out.deviceId,
        device_status: out.deviceStatus,
      }
    }
    setCookie(req, reply, (isDemoLogin ? DEMO_PREFIX : '') + out.s.token, out.s.expires)
    return {
      ok: true,
      demo: isDemoLogin,
      user: { id: out.user.id, name: out.user.name, email: out.user.email, role: out.user.role_name },
      mustChangePassword: !!out.must,
    }
  })

  app.post('/api/auth/stream-ticket', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const u = req.user!
    if (u.party_id) throw new HttpError(403, 'Staff only')
    reply.header('cache-control', 'no-store')
    return issueStreamTicket(u.id, req.sessionDeviceId ?? null, req.sessionHash ?? null)
  })

  app.post('/api/auth/verify-password', { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } }, async (req) => {
    const u = req.user!
    if (u.apiKey) throw new HttpError(403, 'API keys cannot verify interactive user passwords')
    const b = z.object({
      password: z.string().min(1).max(200),
      totp: z.string().max(10).optional(),
    }).parse(req.body ?? {})
    const row = q.get<any>(
      `SELECT id, email, active, password_hash, totp_secret, failed_logins, locked_until FROM users WHERE id = ? AND deleted_at IS NULL`,
      u.id,
    )
    const logVerify = (success: boolean, reason: string) =>
      q.run(
        `INSERT INTO login_events(at, email, user_id, success, reason, ip, user_agent) VALUES (?,?,?,?,?,?,?)`,
        nowIso(),
        String(row?.email || u.email).toLowerCase(),
        u.id,
        success ? 1 : 0,
        reason,
        req.ip ?? null,
        String(req.headers['user-agent'] ?? '').slice(0, 200),
      )
    if (row?.locked_until && row.locked_until > nowIso().slice(0, 16)) {
      logVerify(false, 'verify_locked')
      throw new HttpError(423, 'Account temporarily locked after repeated failures. Try again in 15 minutes.')
    }
    const ok = verifyPassword(b.password, row?.password_hash)
    if (!row || !ok || !row.active) {
      if (row) {
        const fails = (row.failed_logins ?? 0) + 1
        q.run(
          `UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?`,
          fails,
          fails >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString().slice(0, 16) : null,
          row.id,
        )
      }
      logVerify(false, !row ? 'verify_unknown' : !row.active ? 'verify_inactive' : 'verify_bad_password')
      throw new HttpError(401, 'Incorrect password')
    }
    if (row.totp_secret) {
      if (!b.totp) return { ok: false, needsTotp: true }
      if (!verifyTotp(decryptSecret(row.totp_secret), b.totp)) {
        const fails = (row.failed_logins ?? 0) + 1
        q.run(
          `UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?`,
          fails,
          fails >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString().slice(0, 16) : null,
          row.id,
        )
        logVerify(false, 'verify_bad_totp')
        throw new HttpError(401, 'Invalid authenticator code')
      }
    }
    q.run(`UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?`, row.id)
    logVerify(true, 'verify_ok')
    return { ok: true }
  })

  app.post('/api/auth/devices/:id/revoke', async (req) => {
    if (!canOpenEmployeeRecords(req.user)) {
      throw new HttpError(403, 'Only the Owner and the Admin can revoke staff devices.')
    }
    const rawId = String((req.params as any).id ?? '').trim()
    if (!rawId) throw bad('Invalid device identifier')
    const device = /^\d+$/.test(rawId)
      ? q.get<{ id: number; user_id: number; device_id: string; label: string | null }>(
          `SELECT id, user_id, device_id, label FROM staff_devices WHERE id = ?`,
          Number(rawId),
        ) ?? q.get<{ id: number; user_id: number; device_id: string; label: string | null }>(
          `SELECT id, user_id, device_id, label FROM staff_devices WHERE device_id = ?`,
          rawId,
        )
      : q.get<{ id: number; user_id: number; device_id: string; label: string | null }>(
          `SELECT id, user_id, device_id, label FROM staff_devices WHERE device_id = ?`,
          rawId,
        )
    if (!device) throw new HttpError(404, 'Device not found')
    const targetUser = loadUser(device.user_id)
    if (isOwnerSwkUser(targetUser) && !isOwnerSwkUser(req.user)) {
      throw new HttpError(403, 'Only the Owner can revoke an Owner device.')
    }
    const body = z.object({ reason: z.string().trim().max(240).optional() }).parse(req.body ?? {})
    const reason = body.reason || 'Revoked by administrator'
    const revokedAt = nowIso()
    const counts = tx(() => {
      q.run(
        `UPDATE staff_devices SET status = 'Blocked', decided_by = ?, revoked_at = ?, revoked_reason = ? WHERE id = ?`,
        req.user!.id,
        revokedAt,
        reason,
        device.id,
      )
      const sessionsRevoked = destroyDeviceSessions(device.device_id)
      const pushRes = q.run(`UPDATE push_subscriptions SET active = 0 WHERE device_id = ?`, device.device_id)
      audit(
        req.ctx,
        getDef('users'),
        device.user_id,
        'device-revoke',
        { device_id: device.device_id, reason },
        device.label || device.device_id,
      )
      return { sessionsRevoked, pushDeactivated: Number(pushRes?.changes ?? 0) }
    })
    return {
      ok: true,
      id: device.id,
      device_id: device.device_id,
      status: 'Blocked',
      revoked_at: revokedAt,
      revoked_reason: reason,
      sessions_revoked: counts.sessionsRevoked,
      push_deactivated: counts.pushDeactivated,
    }
  })

  app.post('/api/auth/logout', async (req, reply) => {
    // The request hook resolved the session cookie to its hash.
    if (req.sessionHash) destroySessionByHash(req.sessionHash)
    reply.clearCookie(COOKIE, { path: '/' })
    return { ok: true }
  })

  app.get('/api/auth/me', async (req) => {
    const u = req.user!
    const row = q.get(`SELECT totp_secret, must_change_password, password_hash, last_login_at FROM users WHERE id = ?`, u.id)
    const config0 = config.accounts
    const usingDefault = !inDemo() && [config0.adminPassword, config0.managerPassword].some(p => verifyPassword(p, row?.password_hash))
    return { demo: inDemo(), id: u.id, name: u.name, email: u.email, role: u.role_name, permissions: u.permissions, branch_id: u.branch_id, party_id: u.party_id, totp: !!row?.totp_secret, mustChangePassword: !!row?.must_change_password, defaultPassword: usingDefault, lastLogin: row?.last_login_at }
  })

  // ---- Own profile, internal only: photo, internal phone, short about line and languages. Name, e-mail, role and designation stay with HR / Admin.
  app.get('/api/auth/profile', async (req) => {
    const u = req.user!
    const r = q.get<any>(`SELECT name, email, designation, work_phone, about, languages, photo_stored FROM users WHERE id = ?`, u.id)
    return { name: r?.name, email: r?.email, designation: r?.designation, work_phone: r?.work_phone ?? '', about: r?.about ?? '', languages: r?.languages ?? '', has_photo: !!r?.photo_stored, photo_url: r?.photo_stored ? `/api/users/${u.id}/photo` : null }
  })
  app.patch('/api/auth/profile', async (req) => {
    const u = req.user!
    if (u.party_id) throw new HttpError(403, 'Staff only')
    const b = z.object({ work_phone: z.string().trim().max(40).regex(/^[+\d\s()-]*$/, 'Use digits, spaces, + ( ) or -').optional(), about: z.string().trim().max(280).optional(), languages: z.string().trim().max(120).optional() }).parse(req.body ?? {})
    for (const [k, v] of Object.entries(b)) if (v !== undefined) q.run(`UPDATE users SET ${k} = ?, updated_at = ? WHERE id = ?`, v || null, new Date().toISOString(), u.id)
    return { ok: true }
  })
  app.post('/api/auth/profile/photo', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const u = req.user!
    if (u.party_id) throw new HttpError(403, 'Staff only')
    const part = await (req as any).file()
    if (!part) throw new HttpError(400, 'Choose a photo')
    const mime = String(part.mimetype || '').toLowerCase()
    if (!/^image\/(png|jpe?g|webp)$/.test(mime)) { part.file.resume(); throw new HttpError(400, 'Use a JPG, PNG or WebP photo') }
    const buf: Buffer = await part.toBuffer()
    if (buf.length > 5 * 1024 * 1024) throw new HttpError(400, 'Photos can be up to 5 MB')
    const ext = mime.includes('png') ? '.png' : mime.includes('webp') ? '.webp' : '.jpg'
    const rel = path.join('profile', `${u.id}-${crypto.randomBytes(6).toString('hex')}${ext}`)
    fs.mkdirSync(path.join(dirs.uploads, 'profile'), { recursive: true })
    fs.writeFileSync(path.join(dirs.uploads, rel), buf)
    const stored = await persistUpload(rel, mime)
    const old = q.val<string>(`SELECT photo_stored FROM users WHERE id = ?`, u.id)
    q.run(`UPDATE users SET photo_stored = ?, updated_at = ? WHERE id = ?`, stored, new Date().toISOString(), u.id)
    if (old) void removeStored(old)
    return { ok: true, photo_url: `/api/users/${u.id}/photo?v=${Date.now()}` }
  })
  app.delete('/api/auth/profile/photo', async (req) => {
    const u = req.user!
    const old = q.val<string>(`SELECT photo_stored FROM users WHERE id = ?`, u.id)
    q.run(`UPDATE users SET photo_stored = NULL WHERE id = ?`, u.id)
    if (old) void removeStored(old)
    return { ok: true }
  })
  // Staff photos are visible to signed-in staff only (chat, team directory, top bar). Lookup by id or by e-mail.
  app.get('/api/users/:id/photo', async (req, reply) => {
    if (!req.user || req.user.party_id) throw new HttpError(403, 'Staff only')
    const key = String((req.params as any).id)
    const stored = /^\d+$/.test(key) ? q.val<string>(`SELECT photo_stored FROM users WHERE id = ? AND deleted_at IS NULL`, Number(key)) : q.val<string>(`SELECT photo_stored FROM users WHERE lower(email) = ? AND deleted_at IS NULL`, key.toLowerCase())
    const stream = stored ? await openStored(stored) : null
    if (!stream) return reply.status(404).send({ error: 'No photo' })
    reply.header('content-type', /\.png$/i.test(stored!) ? 'image/png' : /\.webp$/i.test(stored!) ? 'image/webp' : 'image/jpeg')
    reply.header('cache-control', 'private, max-age=300')
    return reply.send(stream)
  })

  app.post('/api/auth/change-password', { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } }, async (req) => {
    const b = z.object({ current: z.string().max(200), next: z.string().max(200) }).parse(req.body)
    const row = q.get(`SELECT * FROM users WHERE id = ?`, req.user!.id)
    if (!verifyPassword(b.current, row?.password_hash)) throw new HttpError(400, 'Current password is incorrect')
    validatePasswordStrength(b.next)
    if (b.next === b.current) throw bad('Choose a different password')
    q.run(`UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?`, hashPassword(b.next), nowIso(), req.user!.id)
    destroyUserSessions(req.user!.id, req.sessionHash)
    q.run('DELETE FROM settings WHERE key = ?', `totp-pending:${req.user!.id}`)
    audit(req.ctx, getDef('users'), req.user!.id, 'password-change', null, req.user!.name)
    return { ok: true }
  })

  const totpLimit = { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } }
  app.post('/api/auth/totp/setup', totpLimit, async (req) => {
    const { password } = z.object({ password: z.string().min(1).max(200) }).parse(req.body)
    const row = q.get('SELECT password_hash, totp_secret FROM users WHERE id = ?', req.user!.id)
    if (!verifyPassword(password, row?.password_hash)) throw bad('Password is incorrect')
    if (row?.totp_secret) throw bad('Two-step verification is already enabled. Disable it with your password and authenticator code before setting up a replacement.')
    const secret = newTotpSecret()
    const pending = { secret: encryptSecret(secret), session: req.sessionHash, expires: Date.now() + 10 * 60_000 }
    q.run(`INSERT INTO settings(key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, `totp-pending:${req.user!.id}`, JSON.stringify(pending), nowIso())
    const issuer = 'SWK OS'
    return { secret, uri: `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(req.user!.email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30` }
  })
  app.post('/api/auth/totp/enable', totpLimit, async (req) => {
    const { code } = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(req.body)
    const raw = q.val<string>(`SELECT value FROM settings WHERE key = ?`, `totp-pending:${req.user!.id}`)
    if (!raw) throw bad('Start the setup first')
    const pending = JSON.parse(raw)
    if (!pending || typeof pending !== 'object' || pending.session !== req.sessionHash || !Number.isFinite(pending.expires) || pending.expires < Date.now()) throw bad('Authenticator setup expired or belongs to another session. Start setup again.')
    if (q.val('SELECT totp_secret FROM users WHERE id = ?', req.user!.id)) throw bad('Two-step verification is already enabled')
    const secret = decryptSecret(pending.secret)
    if (!verifyTotp(secret, code)) throw bad('That code is not valid — check your authenticator app clock')
    tx(() => {
      q.run(`UPDATE users SET totp_secret = ? WHERE id = ?`, encryptSecret(secret), req.user!.id)
      q.run(`DELETE FROM settings WHERE key = ?`, `totp-pending:${req.user!.id}`)
      destroyUserSessions(req.user!.id, req.sessionHash)
      audit(req.ctx, getDef('users'), req.user!.id, 'totp-enabled', null, req.user!.name)
    })
    return { ok: true }
  })
  app.post('/api/auth/totp/disable', totpLimit, async (req) => {
    const { password, code } = z.object({ password: z.string().min(1).max(200), code: z.string().regex(/^\d{6}$/) }).parse(req.body)
    const row = q.get(`SELECT password_hash, totp_secret FROM users WHERE id = ?`, req.user!.id)
    if (!verifyPassword(password, row?.password_hash)) throw bad('Password is incorrect')
    if (!row?.totp_secret || !verifyTotp(decryptSecret(row.totp_secret), code)) throw bad('Authenticator code is incorrect')
    tx(() => {
      q.run(`UPDATE users SET totp_secret = NULL WHERE id = ?`, req.user!.id)
      q.run('DELETE FROM settings WHERE key = ?', `totp-pending:${req.user!.id}`)
      destroyUserSessions(req.user!.id, req.sessionHash)
      audit(req.ctx, getDef('users'), req.user!.id, 'totp-disabled', null, req.user!.name)
    })
    return { ok: true }
  })

  app.get('/api/auth/sessions', async (req) => {
    const rows = q.all(`SELECT id, created_at, last_seen, ip, user_agent, device_id FROM sessions WHERE user_id = ? ORDER BY last_seen DESC`, req.user!.id)
    return rows.map(r => ({ id: r.id.slice(0, 16), current: r.id === req.sessionHash, created_at: r.created_at, last_seen: r.last_seen, ip: r.ip, user_agent: r.user_agent, device_id: r.device_id ?? null }))
  })
  app.delete('/api/auth/sessions/:id', async (req) => {
    const id = String((req.params as any).id)
    q.run(`DELETE FROM sessions WHERE user_id = ? AND id LIKE ? AND id <> ?`, req.user!.id, id.replace(/[%_]/g, '') + '%', req.sessionHash ?? '')
    return { ok: true }
  })
  app.get('/api/auth/login-history', async (req) => q.all(`SELECT at, success, reason, ip, user_agent FROM login_events WHERE user_id = ? ORDER BY id DESC LIMIT 20`, req.user!.id))
  void sessionHash
}
