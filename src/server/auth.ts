import crypto from 'node:crypto'
import { q, inDemo } from './db'
import { config } from './config'
import { nowIso,safeJson,bad,HttpError } from './util'
import { decryptSecret, getSetting, hmacWithAppSecret } from './settings'
import type { SessionUser,Perms } from './engine'
import {
  isRestrictedStaffUser,
  RESTRICTED_STAFF_PERMISSIONS,
  SWK_STAFF_ACCOUNTS,
  hardcodedAccountFor,
  HARDCODED_ROLE_PERMISSIONS,
  NON_ELEVATED_ASSIGNABLE_ROLES,
  isElevatedCanonicalEmail,
  isSwkCompanyEmail,
  hasWildcardPermission,
  type NonElevatedAssignableRole,
} from '../shared/swk-staff-access'
import { syncSwkStaffRoster } from './seed'

// ---------------------------------------------------------------- passwords (scrypt)
const N = 16384, R = 8, P = 1, KEYLEN = 64
export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(pw, salt, KEYLEN, { N, r: R, p: P })
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`
}
export function verifyPassword(pw: string, stored: string | null | undefined): boolean {
  if (!stored) { crypto.scryptSync(pw, 'x'.repeat(16), KEYLEN, { N, r: R, p: P }); return false } // constant-ish time for unknown users
  const [alg, n, r, p, salt, hash] = stored.split('$')
  if (alg !== 'scrypt') return false
  const calc = crypto.scryptSync(pw, Buffer.from(salt, 'base64'), KEYLEN, { N: Number(n), r: Number(r), p: Number(p) })
  const exp = Buffer.from(hash, 'base64')
  return exp.length === calc.length && crypto.timingSafeEqual(exp, calc)
}
export function validatePasswordStrength(pw: string) {
  if (pw.length > 200) throw bad('Password must be no more than 200 characters')
  if (pw.length < 10) throw bad('Password must be at least 10 characters')
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !(/\d/.test(pw) || /[^a-zA-Z0-9]/.test(pw))) {
    throw bad('Password needs upper-case, lower-case letters and a digit or symbol')
  }
}

// ---------------------------------------------------------------- sessions & SSE stream tickets
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex')
export function createSession(userId: number, ip?: string, ua?: string, deviceId?: string | null) {
  const token = crypto.randomBytes(32).toString('base64url')
  const now = new Date()
  const exp = new Date(now.getTime() + config.sessionHours * 3600_000)
  const cleanDev = deviceId ? String(deviceId).trim().slice(0, 80) : null
  q.run(
    `INSERT INTO sessions(id, user_id, created_at, expires_at, last_seen, ip, user_agent, device_id) VALUES (?,?,?,?,?,?,?,?)`,
    sha(token),
    userId,
    now.toISOString(),
    exp.toISOString(),
    now.toISOString(),
    ip ?? null,
    (ua ?? '').slice(0, 200),
    cleanDev,
  )
  return { token, expires: exp }
}
export function destroySession(token: string) { destroySessionByHash(sha(token)) }
export function destroySessionByHash(hash: string) {
  for (const [k, v] of streamTickets) {
    if (v.sessionHash === hash) streamTickets.delete(k)
  }
  try {
    q.run(`UPDATE sip_ws_sessions SET revoked_at = ? WHERE session_hash = ? AND revoked_at IS NULL`, nowIso(), hash)
  } catch { /* table may not exist before first migration */ }
  q.run(`DELETE FROM sessions WHERE id = ?`, hash)
}
export function destroyUserSessions(userId: number, exceptHash?: string) {
  for (const [k, v] of streamTickets) {
    if (v.userId === userId) streamTickets.delete(k)
  }
  try {
    q.run(`UPDATE sip_ws_sessions SET revoked_at = ? WHERE user_id = ? AND COALESCE(session_hash, '') <> ? AND revoked_at IS NULL`, nowIso(), userId, exceptHash ?? '')
  } catch { /* ignore */ }
  q.run(`DELETE FROM sessions WHERE user_id = ? AND id <> ?`, userId, exceptHash ?? '')
}

const STREAM_TICKET_TTL_MS = 30_000
interface StreamTicketEntry {
  userId: number
  deviceId: string | null
  sessionHash: string | null
  isDemo: boolean
  expiresAt: number
}
const streamTickets = new Map<string, StreamTicketEntry>()

export function destroyDeviceSessions(deviceId: string): number {
  const clean = String(deviceId || '').trim().slice(0, 80)
  if (!clean) return 0
  for (const [k, v] of streamTickets) {
    if (v.deviceId === clean) streamTickets.delete(k)
  }
  try {
    q.run(
      `UPDATE sip_ws_sessions SET revoked_at = ?
       WHERE revoked_at IS NULL AND session_hash IN (SELECT id FROM sessions WHERE device_id = ?)`,
      nowIso(),
      clean,
    )
  } catch { /* ignore */ }
  const res = q.run(`DELETE FROM sessions WHERE device_id = ?`, clean)
  return Number(res?.changes ?? 0)
}

export function issueStreamTicket(userId: number, deviceId?: string | null, sessHash?: string | null): { ticket: string; expires_in_s: number } {
  const u = loadUser(userId)
  if (!u || u.party_id) throw new HttpError(403, 'Staff only')
  const now = Date.now()
  for (const [k, v] of streamTickets) {
    if (v.expiresAt <= now) streamTickets.delete(k)
  }
  if (streamTickets.size > 10_000) streamTickets.clear()
  const ticket = crypto.randomBytes(32).toString('base64url')
  streamTickets.set(sha(ticket), {
    userId,
    deviceId: deviceId ? String(deviceId).trim().slice(0, 80) : null,
    sessionHash: sessHash ? String(sessHash).trim() : null,
    isDemo: inDemo(),
    expiresAt: now + STREAM_TICKET_TTL_MS,
  })
  return { ticket, expires_in_s: Math.floor(STREAM_TICKET_TTL_MS / 1000) }
}

export function isDemoStreamTicket(ticket: string | undefined): boolean {
  if (!ticket || typeof ticket !== 'string') return false
  const clean = ticket.trim()
  if (!clean) return false
  const entry = streamTickets.get(sha(clean))
  return !!entry && entry.expiresAt > Date.now() && entry.isDemo
}

function isDeviceSessionAuthorized(userId: number, deviceId: string): boolean {
  const dev = q.get<{ status: string; revoked_at: string | null }>(
    `SELECT status, revoked_at FROM staff_devices WHERE user_id = ? AND device_id = ?`,
    userId,
    deviceId,
  )
  if (!dev || dev.status === 'Blocked' || !!dev.revoked_at) return false
  if (getSetting('mobile_require_device_approval') && dev.status !== 'Approved') return false
  return true
}

export function consumeStreamTicket(ticket: string | undefined): SessionUser | null {
  if (!ticket || typeof ticket !== 'string') return null
  const clean = ticket.trim()
  if (!clean) return null
  const h = sha(clean)
  const entry = streamTickets.get(h)
  if (!entry) return null
  streamTickets.delete(h)
  if (Date.now() > entry.expiresAt) return null
  if (entry.isDemo !== inDemo()) return null
  if (entry.sessionHash) {
    const sess = q.get<{ expires_at: string }>(
      `SELECT expires_at FROM sessions WHERE id = ? AND user_id = ?`,
      entry.sessionHash,
      entry.userId,
    )
    if (!sess || new Date(sess.expires_at) < new Date()) return null
  }
  if (entry.deviceId && !isDeviceSessionAuthorized(entry.userId, entry.deviceId)) return null
  const user = loadUser(entry.userId)
  if (!user || user.party_id) return null
  return user
}

export function findCanonicalElevatedUser(preferAdmin = true): SessionUser | null {
  const emails = preferAdmin
    ? ['admin@swk.properties', 'shabib@swk.properties', 'haseeb@swk.properties']
    : ['shabib@swk.properties', 'admin@swk.properties', 'haseeb@swk.properties']
  for (const email of emails) {
    const row = q.get<{ id: number }>(
      `SELECT id FROM users WHERE deleted_at IS NULL AND active = 1 AND party_id IS NULL AND lower(email) = ? LIMIT 1`,
      email,
    )
    if (row) {
      const u = loadUser(row.id)
      if (u && !u.party_id && isElevatedCanonicalEmail(u.email)) return u
    }
  }
  if (inDemo()) {
    const demoRow = q.get<{ id: number }>(
      `SELECT id FROM users WHERE deleted_at IS NULL AND active = 1 AND party_id IS NULL AND lower(email) = 'demo@swkpropertiesuae.com' LIMIT 1`,
    )
    if (demoRow) {
      const u = loadUser(demoRow.id)
      if (u && !u.party_id) return u
    }
  }
  return null
}

export const sessionHash = sha

const NON_ELEVATED_SET = new Set<string>(NON_ELEVATED_ASSIGNABLE_ROLES)
const ELEVATED_ROLE_NAMES = new Set(['owner', 'admin', 'manager'])

function roleGrantPayload(userId: number, email: string, roleName: string): string {
  return `swk-role-v1:${userId}:${String(email || '').trim().toLowerCase()}:${roleName}`
}

export function signRoleGrant(userId: number, email: string, roleName: NonElevatedAssignableRole): string {
  if (!Number.isInteger(userId) || userId <= 0) throw bad('Invalid user id for role grant signature')
  if (!NON_ELEVATED_SET.has(roleName)) throw bad(`Role "${roleName}" is not eligible for a signed non-elevated grant`)
  return hmacWithAppSecret(roleGrantPayload(userId, email, roleName))
}

export function verifyRoleGrant(
  userId: number,
  email: string,
  roleName: string,
  sig: string | null | undefined,
): boolean {
  if (!Number.isInteger(userId) || userId <= 0) return false
  if (!NON_ELEVATED_SET.has(roleName)) return false
  if (typeof sig !== 'string') return false
  const cleanSig = sig.trim()
  if (!cleanSig) return false
  const expected = hmacWithAppSecret(roleGrantPayload(userId, email, roleName))
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(cleanSig, 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

function isElevatedRoleOrWildcard(roleName: string | null | undefined, perms: Perms): boolean {
  if (hasWildcardPermission(perms)) return true
  return ELEVATED_ROLE_NAMES.has(String(roleName || '').trim().toLowerCase())
}

function logSecurityTamper(userId: number, email: string, attemptedRole: string | null | undefined, reason: string) {
  try {
    const changes = JSON.stringify({
      attempted_role: attemptedRole ?? null,
      enforced_role: 'Staff (Attendance & General)',
      reason,
    })
    const cutoff = new Date(Date.now() - 60_000).toISOString()
    const recent = q.get<{ id: number }>(
      `SELECT id FROM audit_log WHERE entity = 'users' AND record_id = ? AND action = 'security_tamper' AND changes = ? AND at >= ? ORDER BY id DESC LIMIT 1`,
      userId,
      changes,
      cutoff,
    )
    if (recent) return
    q.run(
      `INSERT INTO audit_log(at, user_id, user_name, entity, record_id, record_label, action, changes, ip) VALUES (?,?,?,?,?,?,?,?,?)`,
      nowIso(),
      userId,
      email,
      'users',
      userId,
      email,
      'security_tamper',
      changes,
      null,
    )
  } catch {
    /* non-fatal so read queries never crash */
  }
}

export function loadUser(userId: number): SessionUser | null {
  const u = q.get(`SELECT u.*, r.name AS role_name, r.permissions FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND u.deleted_at IS NULL AND u.active = 1`, userId)
  if (!u) return null
  const perms = safeJson<Perms>(u.permissions, {})
  const userObj: SessionUser = { id: u.id, name: u.name, email: u.email, role_id: u.role_id, role_name: u.role_name ?? '', permissions: perms, branch_id: u.branch_id, party_id: u.party_id ?? null }
  const email = String(userObj.email || '').trim().toLowerCase()
  const demoMode = inDemo()

  // Customer portal accounts may never carry elevated/wildcard permissions.
  if (userObj.party_id) {
    if (isElevatedRoleOrWildcard(userObj.role_name, perms)) {
      logSecurityTamper(userObj.id, email, u.role_name, 'portal_user_elevated_role_tamper')
      userObj.role_name = 'Customer Portal'
      userObj.permissions = {}
    }
    return userObj
  }

  // Isolated demo presenter exception inside demo DB only.
  if (demoMode && email === 'demo@swkpropertiesuae.com') {
    return userObj
  }

  // 1. Hardcoded SWK staff accounts: locked to their exact hardcoded role in code.
  const fixed = hardcodedAccountFor(email)
  if (fixed) {
    const fixedIsElevated = ELEVATED_ROLE_NAMES.has(fixed.roleName.toLowerCase())
    if (fixedIsElevated && !isElevatedCanonicalEmail(email) && !demoMode) {
      logSecurityTamper(userObj.id, email, u.role_name, 'non_canonical_elevated_alias')
      userObj.role_name = 'Staff (Attendance & General)'
      userObj.permissions = RESTRICTED_STAFF_PERMISSIONS
      return userObj
    }
    if (!fixed.fullAccess && isElevatedRoleOrWildcard(u.role_name, perms)) {
      logSecurityTamper(userObj.id, email, u.role_name, 'hardcoded_staff_role_tamper')
    }
    userObj.role_name = fixed.roleName
    userObj.permissions = HARDCODED_ROLE_PERMISSIONS[fixed.roleName] as Perms
    return userObj
  }

  // 2. Non-hardcoded SWK company staff (#13–25+): hard-clamped to {HR, Office Admin, Staff (Attendance & General)}.
  //    HR and Office Admin require a valid APP_SECRET-HMAC role_grant_sig.
  if (isSwkCompanyEmail(email)) {
    const dbRole = String(u.role_name ?? '').trim()
    if ((dbRole === 'HR' || dbRole === 'Office Admin') && !hasWildcardPermission(perms)) {
      if (verifyRoleGrant(userObj.id, email, dbRole, u.role_grant_sig)) {
        userObj.role_name = dbRole
        userObj.permissions = HARDCODED_ROLE_PERMISSIONS[dbRole] as Perms
        return userObj
      }
      logSecurityTamper(userObj.id, email, dbRole, 'missing_or_invalid_role_grant_sig')
      userObj.role_name = 'Staff (Attendance & General)'
      userObj.permissions = RESTRICTED_STAFF_PERMISSIONS
      return userObj
    }
    if (dbRole === 'Staff (Attendance & General)' && !hasWildcardPermission(perms)) {
      userObj.role_name = 'Staff (Attendance & General)'
      userObj.permissions = RESTRICTED_STAFF_PERMISSIONS
      return userObj
    }
    logSecurityTamper(userObj.id, email, dbRole || (hasWildcardPermission(perms) ? '*' : 'unknown'), 'disallowed_swk_staff_role')
    userObj.role_name = 'Staff (Attendance & General)'
    userObj.permissions = RESTRICTED_STAFF_PERMISSIONS
    return userObj
  }

  // 3. Non-SWK non-portal accounts (e.g. test fixtures): hard-blocked from elevated roles or wildcard '*'.
  if (isElevatedRoleOrWildcard(u.role_name, perms)) {
    logSecurityTamper(userObj.id, email, u.role_name || '*', 'non_canonical_elevated_role_tamper')
    userObj.role_name = 'Staff (Attendance & General)'
    userObj.permissions = RESTRICTED_STAFF_PERMISSIONS
    return userObj
  }

  const dbRole = String(u.role_name ?? '').trim()
  if (dbRole === 'HR' || dbRole === 'Office Admin') {
    if (verifyRoleGrant(userObj.id, email, dbRole, u.role_grant_sig)) {
      userObj.role_name = dbRole
      userObj.permissions = HARDCODED_ROLE_PERMISSIONS[dbRole] as Perms
      return userObj
    }
    logSecurityTamper(userObj.id, email, dbRole, 'missing_or_invalid_role_grant_sig')
    userObj.role_name = 'Staff (Attendance & General)'
    userObj.permissions = RESTRICTED_STAFF_PERMISSIONS
    return userObj
  }

  if (isRestrictedStaffUser(userObj)) {
    userObj.permissions = RESTRICTED_STAFF_PERMISSIONS
    userObj.role_name = 'Staff (Attendance & General)'
  }
  return userObj
}

export function userFromToken(token: string | undefined): { user: SessionUser; hash: string; deviceId: string | null } | null {
  if (!token) return null
  const h = sha(token)
  const s = q.get(`SELECT * FROM sessions WHERE id = ?`, h)
  if (!s) return null
  const now = new Date()
  if (new Date(s.expires_at) < now) { q.run(`DELETE FROM sessions WHERE id = ?`, h); return null }
  const deviceId: string | null = s.device_id ? String(s.device_id) : null
  if (deviceId && !isDeviceSessionAuthorized(s.user_id, deviceId)) {
    q.run(`DELETE FROM sessions WHERE id = ?`, h)
    return null
  }
  const user = loadUser(s.user_id)
  if (!user) return null
  if (deviceId && user.party_id) return null
  if (now.getTime() - new Date(s.last_seen).getTime() > 60_000) {
    // sliding expiry
    q.run(`UPDATE sessions SET last_seen = ?, expires_at = ? WHERE id = ?`, now.toISOString(), new Date(now.getTime() + config.sessionHours * 3600_000).toISOString(), h)
  }
  return { user, hash: h, deviceId }
}

export function userFromApiKey(key: string | undefined): SessionUser | null {
  if (!key || !key.startsWith('elv_')) return null
  const row = q.get(`SELECT * FROM api_keys WHERE key_hash = ? AND active = 1 AND deleted_at IS NULL`, sha(key))
  if (!row) return null
  q.run(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`, nowIso().slice(0, 16), row.id)
  const u = loadUser(row.user_id)
  return u ? { ...u, apiKey: true } : null
}
export function newApiKey() {
  const key = 'elv_' + crypto.randomBytes(24).toString('base64url')
  return { key, hash: sha(key), prefix: key.slice(0, 8) }
}

// ---------------------------------------------------------------- login with lockout
const MAX_FAILS = 5
function findUserForLogin(e: string, staffMatch: (typeof SWK_STAFF_ACCOUNTS)[number] | undefined) {
  let row = q.get(`SELECT * FROM users WHERE lower(email) = ? AND deleted_at IS NULL`, e)
  if (!row && staffMatch) {
    for (const candidate of [staffMatch.email, ...staffMatch.aliases]) {
      row = q.get(`SELECT * FROM users WHERE lower(email) = ? AND deleted_at IS NULL`, candidate.toLowerCase())
      if (row) break
    }
  }
  return row
}
export function attemptLogin(email: string, password: string, totp: string | undefined, ip?: string, ua?: string): { user: SessionUser; needsTotp?: false } | { needsTotp: true } {
  const e = email.trim().toLowerCase()
  const staffMatch = SWK_STAFF_ACCOUNTS.find(a => a.email.toLowerCase() === e || a.aliases.some(al => al.toLowerCase() === e))
  let row = findUserForLogin(e, staffMatch)
  if (!row && staffMatch) {
    // creates only the missing account; never resets anyone else's password
    try { syncSwkStaffRoster() } catch { /* ignore */ }
    row = findUserForLogin(e, staffMatch)
  }
  const log = (success: boolean, reason: string) => q.run(`INSERT INTO login_events(at, email, user_id, success, reason, ip, user_agent) VALUES (?,?,?,?,?,?,?)`, nowIso(), e, row?.id ?? null, success ? 1 : 0, reason, ip ?? null, (ua ?? '').slice(0, 200))
  const nowMin = nowIso().slice(0, 16)
  if (row?.locked_until && row.locked_until > nowMin) { log(false, 'locked'); throw new HttpError(423, 'Account temporarily locked after repeated failures. Try again in 15 minutes.') }
  const priorFails = row?.locked_until && row.locked_until <= nowMin ? 0 : (row?.failed_logins ?? 0)
  const ok = verifyPassword(password, row?.password_hash)
  if (!row || !ok || !row.active) {
    if (row) {
      const fails = priorFails + 1
      q.run(`UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?`, fails, fails >= MAX_FAILS ? new Date(Date.now() + 15 * 60_000).toISOString().slice(0, 16) : null, row.id)
    }
    log(false, !row ? 'unknown user' : !row.active ? 'inactive' : 'bad password')
    throw new HttpError(401, 'Incorrect e-mail or password')
  }
  if (row.totp_secret) {
    if (!totp) return { needsTotp: true }
    if (!verifyTotp(decryptSecret(row.totp_secret), totp)) {
      const fails = priorFails + 1
      q.run('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?', fails, fails >= MAX_FAILS ? new Date(Date.now() + 15 * 60_000).toISOString().slice(0, 16) : null, row.id)
      log(false, 'bad totp'); throw new HttpError(401, 'Invalid authenticator code')
    }
  }
  q.run(`UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE id = ?`, nowMin, row.id)
  log(true, 'ok')
  const user = loadUser(row.id)
  if (!user) throw new HttpError(401, 'Account unavailable')
  return { user }
}

// ---------------------------------------------------------------- TOTP (RFC 6238)
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export function newTotpSecret(): string {
  const b = crypto.randomBytes(20); let bits = '', out = ''
  for (const x of b) bits += x.toString(2).padStart(8, '0')
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]
  return out
}
function b32decode(s: string): Buffer {
  let bits = ''
  for (const c of s.replace(/=+$/, '').toUpperCase()) { const v = B32.indexOf(c); if (v >= 0) bits += v.toString(2).padStart(5, '0') }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}
export function totpAt(secret: string, t: number): string {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(t / 30)))
  const h = crypto.createHmac('sha1', b32decode(secret)).update(counter).digest()
  const o = h[h.length - 1] & 0xf
  const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(code % 1_000_000).padStart(6, '0')
}
export function verifyTotp(secret: string, code: string): boolean {
  if (typeof secret !== 'string' || !/^[A-Z2-7]{16,64}$/i.test(secret) || !/^\d{6}$/.test(String(code).trim())) return false
  const now = Date.now() / 1000
  return [-1, 0, 1].some(w => totpAt(secret, now + w * 30) === String(code).trim())
}
