import crypto from 'node:crypto'
import { q } from '../db'
import { HttpError, nowIso } from '../util'
import { getSetting, setSettings } from '../settings'
import { verifyPassword } from '../auth'

// ---------------------------------------------------------------- rotating reception QR token
const STEP_MS = 30_000
const VALID_STEPS = 3 // current 30 s window plus the two before it: about 90 s to scan and sign in
function secret(): string {
  let s = String(getSetting('qr_token_secret') || '')
  if (!s) { s = crypto.randomBytes(32).toString('hex'); setSettings({ qr_token_secret: s }) }
  return s
}
const sign = (w: number) => crypto.createHmac('sha256', secret()).update('qr:' + w).digest('hex').slice(0, 16)
export function currentQrToken(now = Date.now()) {
  const w = Math.floor(now / STEP_MS)
  return { token: `${w}.${sign(w)}`, expires_in: Math.ceil(((w + 1) * STEP_MS - now) / 1000), step_s: STEP_MS / 1000 }
}
export function qrTokenValid(token: unknown, now = Date.now()): boolean {
  const m = /^(\d{1,12})\.([0-9a-f]{16})$/.exec(String(token ?? ''))
  if (!m) return false
  const w = Number(m[1]), cur = Math.floor(now / STEP_MS)
  if (cur - w < 0 || cur - w >= VALID_STEPS) return false
  const a = Buffer.from(m[2]), b = Buffer.from(sign(w))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// ---------------------------------------------------------------- check-in sign-in that cannot lock another person out
const fails = new Map<string, { n: number; t: number }>()
const WINDOW_MS = 15 * 60_000, MAX_PER_IP = 8
/** Wrong passwords on this public endpoint count against the caller's IP, not the person's account. */
export function checkPasswordForCheckin(email: string, password: string, ip: string) {
  const f = fails.get(ip)
  if (f && Date.now() - f.t < WINDOW_MS && f.n >= MAX_PER_IP) throw new HttpError(429, 'Too many wrong attempts from this connection. Try again in 15 minutes.')
  const row = q.get(`SELECT id, password_hash, active, must_change_password, locked_until FROM users WHERE lower(email) = ? AND party_id IS NULL AND deleted_at IS NULL`, email.trim().toLowerCase())
  if (!row || !row.active || !verifyPassword(password, row.password_hash)) {
    const cur = f && Date.now() - f.t < WINDOW_MS ? f : { n: 0, t: Date.now() }
    fails.set(ip, { n: cur.n + 1, t: cur.t })
    throw new HttpError(401, 'Incorrect e-mail or password')
  }
  fails.delete(ip)
  if (row.must_change_password) throw new HttpError(403, 'Sign in to SWK OS once and choose your own password before you can check in.')
  return row.id as number
}

// ---------------------------------------------------------------- device binding
/** A person's phone or computer must be approved by the Owner or Manager before it can check in. Owner and Manager devices approve themselves. */
export function deviceGate(userId: number, deviceId: string, label: string, selfApprove: boolean): 'Approved' | 'Pending' {
  if (!getSetting('device_binding_enforce')) return 'Approved'
  if (!deviceId) throw new HttpError(400, 'This device could not be identified. Reload the page and try again.')
  const row = q.get(`SELECT id, status FROM staff_devices WHERE user_id = ? AND device_id = ?`, userId, deviceId)
  if (row) {
    q.run(`UPDATE staff_devices SET last_seen = ? WHERE id = ?`, nowIso(), row.id)
    return row.status === 'Approved' ? 'Approved' : 'Pending'
  }
  const status = selfApprove ? 'Approved' : 'Pending'
  q.run(`INSERT INTO staff_devices (user_id, device_id, label, status, first_seen, last_seen) VALUES (?,?,?,?,?,?)`, userId, deviceId.slice(0, 80), label.slice(0, 80), status, nowIso(), nowIso())
  return status
}

// ---------------------------------------------------------------- GPS sanity
export function distanceM(a: [number, number], b: [number, number]) {
  const rad = (d: number) => d * Math.PI / 180, R = 6371000
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)))
}
/** Reasons a location fix looks wrong: impossible speed since the last fix, or the exact same coordinates again and again. */
export function gpsFlags(userId: number, lat: number, lng: number): string[] {
  const flags: string[] = []
  const prev = q.get(`SELECT gps_lat, gps_lng, created_at FROM attendance_events WHERE user_id = ? AND gps_lat IS NOT NULL AND gps_lat <> '' AND deleted_at IS NULL ORDER BY id DESC LIMIT 1`, userId)
  if (prev) {
    const hours = (Date.now() - new Date(String(prev.created_at).replace(' ', 'T') + (String(prev.created_at).endsWith('Z') ? '' : 'Z')).getTime()) / 3_600_000
    const km = distanceM([Number(prev.gps_lat), Number(prev.gps_lng)], [lat, lng]) / 1000
    if (hours > 0 && hours < 12 && km > 5 && km / hours > 200) flags.push(`Impossible travel: ${Math.round(km)} km in ${Math.round(hours * 60)} min`)
  }
  const same = q.val<number>(`SELECT COUNT(*) FROM attendance_events WHERE user_id = ? AND gps_lat = ? AND gps_lng = ? AND deleted_at IS NULL`, userId, String(lat), String(lng)) ?? 0
  if (same >= 2) flags.push('Identical coordinates repeated (possible fake GPS)')
  return flags
}
