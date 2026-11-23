import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { CANONICAL_ELEVATED_EMAILS, canAccessFieldLiveMap } from '../../shared/swk-staff-access'
import { q, tx } from '../db'
import { distanceM, gpsFlags } from '../domain/attendance-security'
import { recordEnterpriseAudit } from '../domain/enterprise'
import { createRecord, getDef, patchRecord, SYSTEM_CTX } from '../engine'
import { dispatchPushToUser } from '../integrations/push'
import { liveBus, liveScope, notify, notifyLeadership } from '../notify'
import { loadUser } from '../auth'
import { getSetting } from '../settings'
import { addDays, bad, forbidden, HttpError, notFound, nowIso, safeJson } from '../util'
import { idOf } from './helpers'

const MAX_PINGS_PER_BATCH = 50
const LIVE_PING_MAX_SKEW_MS = 5 * 60_000
const TWELVE_HOURS_MS = 12 * 3_600_000

const startSchema = z.object({
  purpose: z.string().trim().min(1).max(80).optional(),
  community: z.string().trim().max(160).optional(),
  assigned_location: z.string().trim().max(240).optional(),
  viewing_id: z.number().int().positive().optional().nullable(),
  property_id: z.number().int().positive().optional().nullable(),
  appointment_ref: z.string().trim().max(120).optional().nullable(),
  lat: z.number().finite().min(-90).max(90).optional(),
  lng: z.number().finite().min(-180).max(180).optional(),
  accuracy_m: z.number().finite().min(0).max(50_000).optional(),
  speed_mps: z.number().finite().min(0).max(1000).optional().nullable(),
  heading: z.number().finite().min(0).max(360).optional().nullable(),
  battery_pct: z.number().finite().min(0).max(100).optional().nullable(),
  is_mock: z.boolean().optional(),
  recorded_at: z.string().trim().max(64).optional(),
  device_id: z.string().trim().max(80).optional(),
})

const pointSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  accuracy_m: z.number().finite().min(0).max(50_000),
  speed_mps: z.number().finite().min(0).max(1000).optional().nullable(),
  heading: z.number().finite().min(0).max(360).optional().nullable(),
  battery_pct: z.number().finite().min(0).max(100).optional().nullable(),
  is_mock: z.boolean().optional(),
  recorded_at: z.string().trim().max(64).optional(),
  idempotency_key: z.string().trim().min(4).max(120).regex(/^[A-Za-z0-9._:-]+$/).optional(),
  offline_replay: z.boolean().optional(),
})

const sosSchema = z.object({
  lat: z.number().finite().min(-90).max(90).optional(),
  lng: z.number().finite().min(-180).max(180).optional(),
  accuracy_m: z.number().finite().min(0).max(50_000).optional(),
  reason: z.string().trim().max(500).optional(),
  community: z.string().trim().max(160).optional(),
})

function dubaiTimeParts(now = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const o: Record<string, string> = {}
  for (const p of f.formatToParts(now)) o[p.type] = p.value
  const date = `${o.year}-${o.month}-${o.day}`
  const hour = Number(o.hour)
  const minute = Number(o.minute)
  return { date, hour, minute, hhmm: `${o.hour}:${o.minute}`, totalMinutes: hour * 60 + minute }
}

function parseTimestampMs(raw: unknown): number {
  const s = String(raw ?? '').trim()
  if (!s) return NaN
  let norm = s.replace(' ', 'T')
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(norm)) norm += ':00Z'
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(norm)) norm += 'Z'
  else if (/^\d{4}-\d{2}-\d{2}$/.test(norm)) norm += 'T00:00:00Z'
  return Date.parse(norm)
}

function maxGpsAccuracyM(): number {
  const v = Number(getSetting('gps_max_accuracy_m'))
  return Number.isFinite(v) && v > 0 ? v : 150
}

function autoStopHourDubai(): number {
  const v = Number(getSetting('field_duty_auto_stop_hour'))
  return Number.isFinite(v) && v >= 0 && v <= 24 ? v : 21
}

function gpsRetentionDays(): number {
  const raw = getSetting('gps_retention_days')
  if (raw === undefined || raw === null || raw === '') return 90
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) ? n : 90
}

function requireStaff(req: FastifyRequest) {
  if (!req.user || req.user.party_id) {
    throw forbidden('This area is for company staff')
  }
  return req.user
}

function requireLeadership(req: FastifyRequest) {
  const user = requireStaff(req)
  if (!canAccessFieldLiveMap(user)) {
    throw forbidden('Live Field GPS Map is restricted exclusively to Owner, Admin, and Operations Manager.')
  }
  return user
}

function resolveActiveEmployee(user: { id: number; email: string; name: string; branch_id: number | null }) {
  const emailLower = user.email.trim().toLowerCase()
  let emp = q.get<any>(
    `SELECT * FROM employees
     WHERE (user_id = ? OR lower(email) = ?) AND deleted_at IS NULL
     ORDER BY CASE WHEN user_id = ? THEN 0 ELSE 1 END, id ASC
     LIMIT 1`,
    user.id,
    emailLower,
    user.id,
  )
  if (emp && ['Terminated', 'Resigned'].includes(String(emp.status || ''))) {
    throw forbidden('Inactive employee profile cannot use field GPS tracking.')
  }
  if (!emp) {
    const branchId =
      user.branch_id ??
      q.val<number>(`SELECT id FROM branches WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 1`) ??
      null
    emp = createRecord(
      getDef('employees'),
      {
        name: user.name || emailLower.split('@')[0] || 'SWK Staff',
        user_id: user.id,
        email: emailLower,
        designation: 'Staff',
        status: 'Active',
        branch_id: branchId,
      },
      SYSTEM_CTX,
    )
  } else if (!emp.user_id) {
    q.run(`UPDATE employees SET user_id = ?, updated_at = ? WHERE id = ?`, user.id, nowIso(), emp.id)
    emp.user_id = user.id
  }
  const agentId =
    q.val<number>(
      `SELECT id FROM agents WHERE deleted_at IS NULL AND (employee_id = ? OR lower(email) = ?) ORDER BY id ASC LIMIT 1`,
      emp.id,
      emailLower,
    ) ?? null
  return { emp, agentId }
}

function getActiveSessionForEmployee(employeeId: number, requestedId?: number) {
  if (requestedId) {
    return q.get<any>(
      `SELECT * FROM field_sessions
       WHERE id = ? AND employee_id = ? AND deleted_at IS NULL
         AND status IN ('Active (On Duty)', 'SOS Emergency Active')
       LIMIT 1`,
      requestedId,
      employeeId,
    )
  }
  return q.get<any>(
    `SELECT * FROM field_sessions
     WHERE employee_id = ? AND deleted_at IS NULL
       AND status IN ('Active (On Duty)', 'SOS Emergency Active')
     ORDER BY id DESC
     LIMIT 1`,
    employeeId,
  )
}

function extractPurposeAndCommunity(session: any): { purpose: string | null; community: string | null } {
  const notes = String(session?.notes || '')
  const pMatch = /Purpose:\s*([^|\n]+)/i.exec(notes)
  const cMatch = /Community:\s*([^|\n]+)/i.exec(notes)
  let purpose = pMatch?.[1]?.trim() || null
  let community = cMatch?.[1]?.trim() || null
  if (!community && session?.assigned_location) {
    const loc = String(session.assigned_location).trim()
    const parts = loc.split('·').map(s => s.trim()).filter(Boolean)
    if (parts.length >= 2) {
      if (!purpose) purpose = parts[0]!
      community = parts.slice(1).join(' · ')
    } else if (loc && loc !== 'Dubai Field Duty') {
      community = loc
    }
  }
  return { purpose, community }
}

function emitLiveEvent(event: Record<string, unknown>) {
  liveBus.emit(`field-gps:live:${liveScope()}`, event)
}

function mergeFlagReasons(...sources: Array<string | null | undefined>): string | null {
  const seen = new Set<string>()
  const parts: string[] = []
  for (const src of sources) {
    if (!src) continue
    for (const piece of String(src).split(';')) {
      const clean = piece.trim()
      if (!clean || seen.has(clean)) continue
      seen.add(clean)
      parts.push(clean)
    }
  }
  return parts.length ? parts.join('; ').slice(0, 400) : null
}

function detectRepeatedIdenticalCoords(
  sessionId: number,
  acceptedPoints: Array<{
    lat: number
    lng: number
    accuracy_m: number
    speed_mps?: number | null
    recorded_at: string
  }>,
): boolean {
  const prior = decodeSessionTrail(sessionId).points.slice(-25)
  const combined = [
    ...prior.map(p => ({
      lat: p.lat,
      lng: p.lng,
      accuracy_m: p.accuracy_m,
      speed_mps: p.speed_mps,
      recorded_at: p.recorded_at,
    })),
    ...acceptedPoints,
  ]
  if (combined.length < 5) return false

  let runStart = 0
  for (let i = 1; i <= combined.length; i++) {
    const prev = combined[i - 1]!
    const cur = combined[i]
    const sameCoord =
      cur !== undefined &&
      cur.lat.toFixed(6) === prev.lat.toFixed(6) &&
      cur.lng.toFixed(6) === prev.lng.toFixed(6)
    if (sameCoord) continue

    const run = combined.slice(runStart, i)
    if (run.length >= 5) {
      const distinctTimestamps = new Set(run.map(p => p.recorded_at))
      if (distinctTimestamps.size >= 5) {
        const hasMovingSpeed = run.some(
          p =>
            p.speed_mps !== null &&
            p.speed_mps !== undefined &&
            Number.isFinite(Number(p.speed_mps)) &&
            Number(p.speed_mps) > 1.5,
        )
        const hasAnyPositiveSpeed = run.some(
          p =>
            p.speed_mps !== null &&
            p.speed_mps !== undefined &&
            Number.isFinite(Number(p.speed_mps)) &&
            Number(p.speed_mps) > 0,
        )
        const accuracies = run.map(p => p.accuracy_m)
        const identicalPositiveAccuracy =
          accuracies[0] !== null &&
          accuracies[0] !== undefined &&
          Number.isFinite(Number(accuracies[0])) &&
          Number(accuracies[0]) > 0 &&
          accuracies.every(a => a === accuracies[0])
        if (hasMovingSpeed || (hasAnyPositiveSpeed && identicalPositiveAccuracy)) {
          return true
        }
      }
    }
    runStart = i
  }
  return false
}

function recordSpoofAttempt(
  req: FastifyRequest,
  user: { id: number; name: string; email: string },
  emp: { id: number },
  session: any | undefined,
  coords: { lat?: number; lng?: number; accuracy_m?: number },
  detail: string,
) {
  const now = nowIso()
  q.run(
    `INSERT INTO audit_log(at, user_id, user_name, entity, record_id, record_label, action, changes, ip)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    now,
    user.id,
    user.name,
    session ? 'field_sessions' : 'users',
    session ? session.id : user.id,
    session ? (session.session_no || `Session #${session.id}`) : user.email,
    'gps_spoof_attempt',
    JSON.stringify({
      reason: 'Mock GPS detected',
      detail,
      employee_id: emp.id,
      lat: coords.lat ?? null,
      lng: coords.lng ?? null,
      accuracy_m: coords.accuracy_m ?? null,
    }),
    req.ip ?? null,
  )

  const existingLive = q.get<{ user_id: number; field_session_id: number | null; flag_reason: string | null }>(
    `SELECT user_id, field_session_id, flag_reason FROM staff_live_locations WHERE user_id = ?`,
    user.id,
  )
  const spoofReason = mergeFlagReasons(
    'Mock GPS detected',
    existingLive && (!session || existingLive.field_session_id === session.id) ? existingLive.flag_reason : null,
  ) ?? 'Mock GPS detected'
  if (existingLive) {
    q.run(
      `UPDATE staff_live_locations SET is_flagged = 1, flag_reason = ?, updated_at = ? WHERE user_id = ?`,
      spoofReason,
      now,
      user.id,
    )
  } else if (session && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
    const meta = extractPurposeAndCommunity(session)
    q.run(
      `INSERT INTO staff_live_locations (
        user_id, employee_id, field_session_id, lat, lng, accuracy_m, purpose, community, is_flagged, flag_reason, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,1,?,?)
      ON CONFLICT(user_id) DO UPDATE SET
        is_flagged = 1,
        flag_reason = excluded.flag_reason,
        updated_at = excluded.updated_at`,
      user.id,
      emp.id,
      session.id,
      coords.lat,
      coords.lng,
      coords.accuracy_m ?? null,
      meta.purpose,
      meta.community,
      spoofReason,
      now,
    )
  }

  if (session) {
    const note = `[${now.slice(0, 16)}] Mock GPS attempt blocked (${detail})`
    const combinedNote = [session.anomaly_note, note].filter(Boolean).join('\n').slice(0, 4000)
    q.run(
      `UPDATE field_sessions SET review_status = 'Pending Human Review', anomaly_note = ?, updated_at = ? WHERE id = ?`,
      combinedNote,
      now,
      session.id,
    )
  }

  notifyLeadership(
    `GPS Spoof Attempt Blocked: ${user.name}`,
    `Mock GPS telemetry rejected (${detail}). Flagged for review.`,
    '/field-live',
    'audit',
    `gps-spoof-${user.id}-${now.slice(0, 16)}`,
  )
  emitLiveEvent({
    type: 'spoof',
    user_id: user.id,
    employee_id: emp.id,
    name: user.name,
    field_session_id: session?.id ?? null,
    is_flagged: true,
    flag_reason: 'Mock GPS detected',
    updated_at: now,
  })
}

function decodeSessionTrail(sessionId: number) {
  const batches = q.all<{
    id: number
    points_json: string
    last_lat: string | null
    last_lng: string | null
    accuracy_m: number | null
    battery_pct: number | null
    recorded_at: string
    received_at: string
  }>(
    `SELECT id, points_json, last_lat, last_lng, accuracy_m, battery_pct, recorded_at, received_at
     FROM duty_location_batches
     WHERE field_session_id = ?
     ORDER BY received_at ASC, id ASC`,
    sessionId,
  )

  const points: Array<{
    lat: number
    lng: number
    accuracy_m: number | null
    speed_mps: number | null
    heading: number | null
    battery_pct: number | null
    recorded_at: string
    received_at: string
    batch_id: number
  }> = []

  for (const b of batches) {
    const parsed = safeJson<any[]>(b.points_json, [])
    if (Array.isArray(parsed) && parsed.length > 0) {
      for (const p of parsed) {
        const lat = Number(p?.lat)
        const lng = Number(p?.lng)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
        points.push({
          lat,
          lng,
          accuracy_m: p?.accuracy_m !== undefined && p?.accuracy_m !== null ? Number(p.accuracy_m) : b.accuracy_m,
          speed_mps: p?.speed_mps !== undefined && p?.speed_mps !== null ? Number(p.speed_mps) : null,
          heading: p?.heading !== undefined && p?.heading !== null ? Number(p.heading) : null,
          battery_pct: p?.battery_pct !== undefined && p?.battery_pct !== null ? Number(p.battery_pct) : b.battery_pct,
          recorded_at: String(p?.recorded_at || b.recorded_at),
          received_at: b.received_at,
          batch_id: b.id,
        })
      }
    } else if (b.last_lat !== null && b.last_lng !== null) {
      const lat = Number(b.last_lat)
      const lng = Number(b.last_lng)
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        points.push({
          lat,
          lng,
          accuracy_m: b.accuracy_m,
          speed_mps: null,
          heading: null,
          battery_pct: b.battery_pct,
          recorded_at: b.recorded_at,
          received_at: b.received_at,
          batch_id: b.id,
        })
      }
    }
  }

  points.sort((a, b) => {
    const ta = parseTimestampMs(a.recorded_at)
    const tb = parseTimestampMs(b.recorded_at)
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb
    return a.batch_id - b.batch_id
  })

  return { points, batchesCount: batches.length }
}

/**
 * Scheduler helper: auto-closes active field sessions whose elapsed duration >= 12 hours
 * OR whose Asia/Dubai local hour >= `field_duty_auto_stop_hour` (default 21), sends a friendly
 * once-per-day 19:30 Asia/Dubai reminder push if still active, and removes expired live pins.
 */
export function autoExpireFieldSessions(now = new Date()): { expired: number; reminded: number } {
  const { date: dubaiDate, hour: dubaiHour, totalMinutes: dubaiMins } = dubaiTimeParts(now)
  const autoStopHour = autoStopHourDubai()
  const active = q.all<any>(
    `SELECT * FROM field_sessions
     WHERE deleted_at IS NULL
       AND status IN ('Active (On Duty)', 'SOS Emergency Active')
     ORDER BY id ASC`,
  )

  let expired = 0
  let reminded = 0
  const nowUtcIso = now.toISOString()

  for (const s of active) {
    const isSos = s.status === 'SOS Emergency Active'
    const startMs = parseTimestampMs(s.started_at || s.created_at)
    const elapsed12h = !isSos && Number.isFinite(startMs) && (now.getTime() - startMs) >= TWELVE_HOURS_MS
    const pastAutoStopHour = !isSos && dubaiHour >= autoStopHour
    const pastDutyDay =
      !isSos &&
      Boolean(s.duty_date) &&
      String(s.duty_date) < dubaiDate &&
      (!Number.isFinite(startMs) || now.getTime() - startMs >= 3 * 3_600_000)

    const emp = q.get<{ id: number; user_id: number | null; name: string }>(
      `SELECT id, user_id, name FROM employees WHERE id = ?`,
      s.employee_id,
    )
    const liveRow = q.get<{ user_id: number }>(
      `SELECT user_id FROM staff_live_locations WHERE field_session_id = ?`,
      s.id,
    )
    const empUserId = emp?.user_id ?? liveRow?.user_id ?? null

    if (elapsed12h || pastAutoStopHour || pastDutyDay) {
      const reasonNote = elapsed12h
        ? 'Auto-expired after reaching 12-hour continuous field duty limit'
        : pastAutoStopHour
          ? `Auto-expired at ${String(autoStopHour).padStart(2, '0')}:00 Asia/Dubai end-of-duty cutoff`
          : 'Auto-expired from previous duty day'

      tx(() => {
        patchRecord(
          getDef('field_sessions'),
          s.id,
          {
            status: 'Auto-Expired',
            ended_at: nowUtcIso.slice(0, 16),
            notes: [s.notes, reasonNote].filter(Boolean).join(' | ').slice(0, 4000),
          },
          SYSTEM_CTX,
        )
        q.run(`DELETE FROM staff_live_locations WHERE field_session_id = ? OR employee_id = ?`, s.id, s.employee_id)
      })

      emitLiveEvent({
        type: 'session_expired',
        field_session_id: s.id,
        employee_id: s.employee_id,
        user_id: empUserId,
        reason: reasonNote,
        updated_at: nowUtcIso,
      })

      if (empUserId) {
        notify(
          empUserId,
          'Field duty session auto-stopped',
          `${reasonNote}. Remember to submit your daily work summary before signing off.`,
          '/field-duty',
          'info',
          `field-autoexp-${s.id}`,
        )
      }
      expired++
      continue
    }

    // Friendly 19:30 Asia/Dubai reminder if still active before auto-stop hour (exempt SOS emergencies)
    if (!isSos && empUserId && dubaiMins >= 19 * 60 + 30 && dubaiHour < autoStopHour) {
      const dedupeKey = `field-duty-1930-${s.id}-${dubaiDate}`
      const alreadySent = q.val<number>(
        `SELECT 1 FROM notifications WHERE user_id = ? AND dedupe_key = ? LIMIT 1`,
        empUserId,
        dedupeKey,
      )
      if (!alreadySent) {
        notify(
          empUserId,
          'Field duty reminder (7:30 PM)',
          `Your field duty session (${s.session_no || 'Active'}) is still running. Stop field duty when back or before ${String(autoStopHour).padStart(2, '0')}:00.`,
          '/field-duty',
          'info',
          dedupeKey,
        )
        reminded++
      }
    }
  }

  // Sweep any stale live pins belonging to closed/deleted sessions
  q.run(
    `DELETE FROM staff_live_locations
     WHERE field_session_id IS NOT NULL
       AND field_session_id IN (
         SELECT id FROM field_sessions
         WHERE deleted_at IS NOT NULL OR status NOT IN ('Active (On Duty)', 'SOS Emergency Active')
       )`,
  )

  return { expired, reminded }
}

/**
 * PDPL 90-day data minimisation purge: deletes raw `duty_location_batches` telemetry older than
 * `gps_retention_days` (default 90) while preserving summarised `field_sessions` records.
 */
export function purgeOldGpsBatches(now = new Date()): { purged: number } {
  const days = gpsRetentionDays()
  if (days <= 0) return { purged: 0 }
  const cutoffIso = new Date(now.getTime() - days * 86_400_000).toISOString()
  const batchRes = q.run(`DELETE FROM duty_location_batches WHERE received_at < ?`, cutoffIso)
  const queueRes = q.run(
    `DELETE FROM offline_sync_queue_log WHERE action_type IN ('field_gps_ping', 'field_gps_batch') AND synced_at < ?`,
    cutoffIso,
  )
  const purgedBatches = Number((batchRes as any)?.changes ?? 0)
  const purgedQueue = Number((queueRes as any)?.changes ?? 0)
  const purged = purgedBatches + purgedQueue
  if (purged > 0) {
    q.run(
      `INSERT INTO audit_log(at, user_id, user_name, entity, record_id, record_label, action, changes, ip)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      nowIso(),
      null,
      'System',
      'field_sessions',
      0,
      'PDPL GPS Purge',
      'pdpl_gps_purge',
      JSON.stringify({ purged_batches: purgedBatches, purged_queue_logs: purgedQueue, retention_days: days, cutoff: cutoffIso }),
      null,
    )
  }
  return { purged }
}

export default async function fieldGpsRoutes(app: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // Agent Endpoints (any authenticated company staff; portal accounts -> 403)
  // ---------------------------------------------------------------------------

  app.post('/api/field-gps/sessions/start', async (req) => {
    const user = requireStaff(req)
    const b = startSchema.parse(req.body ?? {})
    const { emp, agentId } = resolveActiveEmployee(user)

    const existingActive = getActiveSessionForEmployee(emp.id)
    if (b.is_mock === true) {
      recordSpoofAttempt(
        req,
        user,
        emp,
        existingActive,
        { lat: b.lat, lng: b.lng, accuracy_m: b.accuracy_m },
        'is_mock flag set on session start',
      )
      throw new HttpError(422, 'Mock GPS detected')
    }

    const maxAcc = maxGpsAccuracyM()
    const hasCoords = b.lat !== undefined || b.lng !== undefined
    if (hasCoords && (b.lat === undefined || b.lng === undefined)) {
      throw bad('Both lat and lng are required when initial coordinates are supplied')
    }
    if (hasCoords && b.accuracy_m !== undefined && b.accuracy_m > maxAcc) {
      throw bad(`GPS accuracy ${Math.round(b.accuracy_m)}m exceeds maximum allowed ${maxAcc}m`)
    }

    const now = new Date()
    const nowUtc = now.toISOString()
    const dubai = dubaiTimeParts(now)
    const autoStopHour = autoStopHourDubai()
    const dubaiStopMs = Date.parse(`${dubai.date}T${String(autoStopHour).padStart(2, '0')}:00:00+04:00`)
    const scheduledEndIso = new Date(
      Math.max(Number.isFinite(dubaiStopMs) ? dubaiStopMs : now.getTime() + 4 * 3_600_000, now.getTime() + 3_600_000),
    ).toISOString()

    if (existingActive) {
      let livePin = q.get<any>(`SELECT * FROM staff_live_locations WHERE user_id = ?`, user.id) ?? null
      if (hasCoords && b.lat !== undefined && b.lng !== undefined) {
        const meta = extractPurposeAndCommunity(existingActive)
        const stickySos = existingActive.status === 'SOS Emergency Active'
        const stickyReview = existingActive.review_status === 'Pending Human Review'
        const stickyPrior = Boolean(livePin && livePin.field_session_id === existingActive.id && livePin.is_flagged === 1)
        const stickyFlagged = stickySos || stickyReview || stickyPrior
        const stickyReason = stickyFlagged
          ? mergeFlagReasons(
              stickySos ? 'SOS Emergency' : null,
              livePin && livePin.field_session_id === existingActive.id ? livePin.flag_reason : null,
              stickyReview && !livePin?.flag_reason ? 'Flagged for human review' : null,
            )
          : null
        q.run(
          `INSERT INTO staff_live_locations (
            user_id, employee_id, field_session_id, lat, lng, accuracy_m, speed_mps, heading, battery_pct, purpose, community, is_flagged, flag_reason, updated_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(user_id) DO UPDATE SET
            employee_id = excluded.employee_id,
            field_session_id = excluded.field_session_id,
            lat = excluded.lat,
            lng = excluded.lng,
            accuracy_m = excluded.accuracy_m,
            speed_mps = excluded.speed_mps,
            heading = excluded.heading,
            battery_pct = excluded.battery_pct,
            is_flagged = excluded.is_flagged,
            flag_reason = excluded.flag_reason,
            updated_at = excluded.updated_at`,
          user.id,
          emp.id,
          existingActive.id,
          b.lat,
          b.lng,
          b.accuracy_m ?? null,
          b.speed_mps ?? null,
          b.heading ?? null,
          b.battery_pct !== undefined && b.battery_pct !== null ? Math.round(b.battery_pct) : null,
          b.purpose ?? meta.purpose,
          b.community ?? meta.community,
          stickyFlagged ? 1 : 0,
          stickyReason,
          nowUtc,
        )
        livePin = q.get<any>(`SELECT * FROM staff_live_locations WHERE user_id = ?`, user.id) ?? null
      }
      return { ok: true, already_active: true, session: existingActive, live_location: livePin }
    }

    const purpose = b.purpose || 'Viewing'
    const community = b.community?.trim() || ''
    const assignedLocation =
      b.assigned_location?.trim() ||
      [purpose, community].filter(Boolean).join(' · ') ||
      'Dubai Field Duty'
    const retentionDays = Math.max(1, gpsRetentionDays())

    const session = tx(() => {
      const created = createRecord(
        getDef('field_sessions'),
        {
          employee_id: emp.id,
          agent_id: agentId,
          duty_date: dubai.date,
          scheduled_start: nowUtc.slice(0, 16),
          scheduled_end: scheduledEndIso.slice(0, 16),
          started_at: nowUtc.slice(0, 16),
          status: 'Active (On Duty)',
          assigned_location: assignedLocation,
          viewing_id: b.viewing_id ?? null,
          property_id: b.property_id ?? null,
          appointment_ref: b.appointment_ref ?? null,
          last_lat: hasCoords ? String(b.lat) : null,
          last_lng: hasCoords ? String(b.lng) : null,
          gps_accuracy_m: hasCoords && b.accuracy_m !== undefined ? b.accuracy_m : null,
          last_location_at: hasCoords ? (b.recorded_at ? b.recorded_at.slice(0, 16) : nowUtc.slice(0, 16)) : null,
          last_location_received_at: hasCoords ? nowUtc.slice(0, 16) : null,
          retention_until: addDays(dubai.date, retentionDays),
          notes: `Purpose: ${purpose}${community ? ` | Community: ${community}` : ''}`,
        },
        { ...req.ctx, system: true },
      )

      if (hasCoords && b.lat !== undefined && b.lng !== undefined) {
        const recAt = b.recorded_at || nowUtc
        q.run(
          `INSERT INTO duty_location_batches (
            field_session_id, employee_id, user_id, device_id, points_json, points_count, last_lat, last_lng, accuracy_m, battery_pct, recorded_at, received_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          created.id,
          emp.id,
          user.id,
          b.device_id ?? req.sessionDeviceId ?? null,
          JSON.stringify([
            {
              lat: b.lat,
              lng: b.lng,
              accuracy_m: b.accuracy_m ?? null,
              speed_mps: b.speed_mps ?? null,
              heading: b.heading ?? null,
              battery_pct: b.battery_pct !== undefined && b.battery_pct !== null ? Math.round(b.battery_pct) : null,
              recorded_at: recAt,
            },
          ]),
          1,
          String(b.lat),
          String(b.lng),
          b.accuracy_m ?? null,
          b.battery_pct !== undefined && b.battery_pct !== null ? Math.round(b.battery_pct) : null,
          recAt,
          nowUtc,
        )

        q.run(
          `INSERT INTO staff_live_locations (
            user_id, employee_id, field_session_id, lat, lng, accuracy_m, speed_mps, heading, battery_pct, purpose, community, is_flagged, flag_reason, updated_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,0,NULL,?)
          ON CONFLICT(user_id) DO UPDATE SET
            employee_id = excluded.employee_id,
            field_session_id = excluded.field_session_id,
            lat = excluded.lat,
            lng = excluded.lng,
            accuracy_m = excluded.accuracy_m,
            speed_mps = excluded.speed_mps,
            heading = excluded.heading,
            battery_pct = excluded.battery_pct,
            purpose = excluded.purpose,
            community = excluded.community,
            is_flagged = 0,
            flag_reason = NULL,
            updated_at = excluded.updated_at`,
          user.id,
          emp.id,
          created.id,
          b.lat,
          b.lng,
          b.accuracy_m ?? null,
          b.speed_mps ?? null,
          b.heading ?? null,
          b.battery_pct !== undefined && b.battery_pct !== null ? Math.round(b.battery_pct) : null,
          purpose,
          community || assignedLocation,
          nowUtc,
        )
      }

      return created
    })

    const liveLocation = q.get<any>(`SELECT * FROM staff_live_locations WHERE user_id = ?`, user.id) ?? null
    emitLiveEvent({
      type: 'session_started',
      user_id: user.id,
      employee_id: emp.id,
      name: user.name,
      field_session_id: session.id,
      session_no: session.session_no,
      purpose,
      community: community || assignedLocation,
      live_location: liveLocation,
      updated_at: nowUtc,
    })

    return { ok: true, already_active: false, session, live_location: liveLocation }
  })

  app.post('/api/field-gps/pings', async (req) => {
    const user = requireStaff(req)
    const rawBody = (req.body ?? {}) as Record<string, any>
    const bodySchema = z.object({
      field_session_id: z.number().int().positive().optional(),
      device_id: z.string().trim().max(80).optional(),
      network_type: z.string().trim().max(40).optional(),
      idempotency_key: z.string().trim().min(4).max(120).regex(/^[A-Za-z0-9._:-]+$/).optional(),
      offline_replay: z.boolean().optional(),
      points: z.array(pointSchema).min(1).max(MAX_PINGS_PER_BATCH).optional(),
    })
    const metaParsed = bodySchema.parse(rawBody)

    const rawPoints = Array.isArray(rawBody.points)
      ? metaParsed.points!
      : rawBody.lat !== undefined && rawBody.lng !== undefined
        ? [pointSchema.parse(rawBody)]
        : null

    if (!rawPoints || rawPoints.length < 1 || rawPoints.length > MAX_PINGS_PER_BATCH) {
      throw bad(`Send between 1 and ${MAX_PINGS_PER_BATCH} GPS points`)
    }

    const { emp } = resolveActiveEmployee(user)
    const activeSession = getActiveSessionForEmployee(emp.id, metaParsed.field_session_id)

    // 1. Mock GPS anti-spoof gate (checked BEFORE session state or anything else, outside tx so audit persists)
    const mockPt = rawPoints.find(p => p.is_mock === true)
    if (mockPt) {
      recordSpoofAttempt(
        req,
        user,
        emp,
        activeSession,
        { lat: mockPt.lat, lng: mockPt.lng, accuracy_m: mockPt.accuracy_m },
        'is_mock=true telemetry flag',
      )
      throw new HttpError(422, 'Mock GPS detected')
    }

    if (!activeSession) {
      throw bad('No active field duty session. Start field duty first.')
    }

    // 2. Accuracy & timestamp skew validation
    const maxAcc = maxGpsAccuracyM()
    const nowMs = Date.now()
    const nowUtc = new Date(nowMs).toISOString()

    const normalized = rawPoints.map(p => {
      if (p.accuracy_m > maxAcc) {
        throw bad(`GPS accuracy ${Math.round(p.accuracy_m)}m exceeds maximum allowed ${maxAcc}m`)
      }
      const recStr = p.recorded_at || nowUtc
      const recMs = parseTimestampMs(recStr)
      if (!Number.isFinite(recMs)) {
        throw bad('Invalid recorded_at timestamp')
      }
      const isReplay = Boolean(p.offline_replay ?? metaParsed.offline_replay)
      if (recMs > nowMs + LIVE_PING_MAX_SKEW_MS) {
        throw bad('GPS timestamp cannot be in the future')
      }
      if (!isReplay && nowMs - recMs > LIVE_PING_MAX_SKEW_MS) {
        throw bad('Live GPS ping timestamp skew exceeds 5 minutes')
      }
      if (isReplay && nowMs - recMs > 7 * 86_400_000) {
        throw bad('Offline GPS replay point is older than 7 days')
      }
      return {
        ...p,
        recorded_at: new Date(recMs).toISOString(),
        recMs,
        battery_pct: p.battery_pct !== undefined && p.battery_pct !== null ? Math.round(p.battery_pct) : null,
      }
    })

    // 3. Batch-level idempotency check
    if (metaParsed.idempotency_key) {
      const prior = q.get<{ result_json: string | null; user_id: number }>(
        `SELECT result_json, user_id FROM offline_sync_queue_log WHERE idempotency_key = ?`,
        metaParsed.idempotency_key,
      )
      if (prior && prior.user_id === user.id && prior.result_json) {
        return { ...JSON.parse(prior.result_json), replay: true }
      }
    }

    // 4. Per-point idempotency deduplication
    const pointKeys = normalized.map(p => p.idempotency_key).filter((k): k is string => Boolean(k))
    const seenKeys = new Set<string>()
    if (pointKeys.length > 0) {
      const ph = pointKeys.map(() => '?').join(',')
      for (const row of q.all<{ idempotency_key: string }>(
        `SELECT idempotency_key FROM offline_sync_queue_log WHERE idempotency_key IN (${ph})`,
        ...pointKeys,
      )) {
        seenKeys.add(row.idempotency_key)
      }
    }

    const acceptedPoints = normalized.filter(p => !p.idempotency_key || !seenKeys.has(p.idempotency_key))
    if (acceptedPoints.length === 0) {
      return {
        ok: true,
        session_id: activeSession.id,
        accepted: 0,
        deduplicated: normalized.length,
        replay: true,
        flags: [],
      }
    }

    acceptedPoints.sort((a, b) => a.recMs - b.recMs)
    const firstPt = acceptedPoints[0]!
    const lastPt = acceptedPoints[acceptedPoints.length - 1]!

    // 5. Anti-spoof heuristics: attendance-security gpsFlags() + inter/intra-batch speed + repeated identical coordinates
    const flags = new Set<string>(gpsFlags(user.id, lastPt.lat, lastPt.lng))

    const prevBatch = q.get<{ last_lat: string | null; last_lng: string | null; recorded_at: string }>(
      `SELECT last_lat, last_lng, recorded_at FROM duty_location_batches WHERE field_session_id = ? ORDER BY id DESC LIMIT 1`,
      activeSession.id,
    )
    if (prevBatch?.last_lat !== null && prevBatch?.last_lat !== undefined && prevBatch?.last_lng !== null && prevBatch?.last_lng !== undefined) {
      const prevLat = Number(prevBatch.last_lat)
      const prevLng = Number(prevBatch.last_lng)
      const prevMs = parseTimestampMs(prevBatch.recorded_at)
      if (Number.isFinite(prevLat) && Number.isFinite(prevLng) && Number.isFinite(prevMs)) {
        const dtHours = Math.abs(firstPt.recMs - prevMs) / 3_600_000
        const km = distanceM([prevLat, prevLng], [firstPt.lat, firstPt.lng]) / 1000
        if (km > 2 && (dtHours === 0 || (dtHours < 12 && km / dtHours > 200))) {
          flags.add(`Impossible travel: ${Math.round(km)} km in ${Math.max(1, Math.round(dtHours * 60))} min`)
        }
      }
    }

    for (let i = 1; i < acceptedPoints.length; i++) {
      const prev = acceptedPoints[i - 1]!
      const cur = acceptedPoints[i]!
      const dtHours = Math.abs(cur.recMs - prev.recMs) / 3_600_000
      const km = distanceM([prev.lat, prev.lng], [cur.lat, cur.lng]) / 1000
      if (km > 2 && (dtHours === 0 || (dtHours < 12 && km / dtHours > 200))) {
        flags.add(`Impossible travel: ${Math.round(km)} km in ${Math.max(1, Math.round(dtHours * 60))} min`)
      }
    }

    for (const p of acceptedPoints) {
      if (p.speed_mps !== null && p.speed_mps !== undefined && p.speed_mps * 3.6 > 200) {
        flags.add(`Implausible speed reported (${Math.round(p.speed_mps * 3.6)} km/h)`)
      }
    }

    if (detectRepeatedIdenticalCoords(activeSession.id, acceptedPoints)) {
      flags.add('Identical coordinates repeated (possible fake GPS)')
    }

    const flagList = [...flags]
    const existingLive = q.get<{ field_session_id: number | null; is_flagged: number; flag_reason: string | null }>(
      `SELECT field_session_id, is_flagged, flag_reason FROM staff_live_locations WHERE user_id = ?`,
      user.id,
    )
    const isSosActive = activeSession.status === 'SOS Emergency Active'
    const isPendingHumanReview = activeSession.review_status === 'Pending Human Review'
    const hadSameSessionLiveFlag = Boolean(
      existingLive && existingLive.field_session_id === activeSession.id && existingLive.is_flagged === 1,
    )
    const isFlagged = isSosActive || isPendingHumanReview || hadSameSessionLiveFlag || flagList.length > 0

    const fallbackAnomalyReason =
      isPendingHumanReview && !hadSameSessionLiveFlag && flagList.length === 0
        ? (String(activeSession.anomaly_note || '').split('\n').pop()?.replace(/^\[[^\]]+\]\s*/, '').trim() || 'Session flagged for human review')
        : null

    const flagReason = isFlagged
      ? mergeFlagReasons(
          isSosActive ? 'SOS Emergency' : null,
          hadSameSessionLiveFlag ? existingLive?.flag_reason : null,
          fallbackAnomalyReason,
          ...flagList,
        )
      : null

    const meta = extractPurposeAndCommunity(activeSession)
    const deviceId = metaParsed.device_id ?? req.sessionDeviceId ?? null

    const { batchId, liveLocation } = tx(() => {
      const insertedId = q.insert(
        `INSERT INTO duty_location_batches (
          field_session_id, employee_id, user_id, device_id, points_json, points_count, last_lat, last_lng, accuracy_m, battery_pct, network_type, recorded_at, received_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        activeSession.id,
        emp.id,
        user.id,
        deviceId,
        JSON.stringify(
          acceptedPoints.map(({ recMs: _recMs, ...rest }) => rest),
        ),
        acceptedPoints.length,
        String(lastPt.lat),
        String(lastPt.lng),
        lastPt.accuracy_m,
        lastPt.battery_pct,
        metaParsed.network_type ?? null,
        lastPt.recorded_at,
        nowUtc,
      )

      q.run(
        `INSERT INTO staff_live_locations (
          user_id, employee_id, field_session_id, lat, lng, accuracy_m, speed_mps, heading, battery_pct, purpose, community, is_flagged, flag_reason, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET
          employee_id = excluded.employee_id,
          field_session_id = excluded.field_session_id,
          lat = excluded.lat,
          lng = excluded.lng,
          accuracy_m = excluded.accuracy_m,
          speed_mps = excluded.speed_mps,
          heading = excluded.heading,
          battery_pct = COALESCE(excluded.battery_pct, staff_live_locations.battery_pct),
          purpose = COALESCE(excluded.purpose, staff_live_locations.purpose),
          community = COALESCE(excluded.community, staff_live_locations.community),
          is_flagged = excluded.is_flagged,
          flag_reason = excluded.flag_reason,
          updated_at = excluded.updated_at`,
        user.id,
        emp.id,
        activeSession.id,
        lastPt.lat,
        lastPt.lng,
        lastPt.accuracy_m,
        lastPt.speed_mps ?? null,
        lastPt.heading ?? null,
        lastPt.battery_pct,
        meta.purpose,
        meta.community,
        isFlagged ? 1 : 0,
        flagReason,
        nowUtc,
      )

      if (flagList.length > 0) {
        const nextNote = [activeSession.anomaly_note, `[${nowUtc.slice(0, 16)}] ${flagList.join('; ')}`]
          .filter(Boolean)
          .join('\n')
          .slice(0, 4000)
        q.run(
          `UPDATE field_sessions
           SET last_lat = ?, last_lng = ?, gps_accuracy_m = ?, last_location_at = ?, last_location_received_at = ?,
               review_status = 'Pending Human Review', anomaly_note = ?, updated_at = ?
           WHERE id = ?`,
          String(lastPt.lat),
          String(lastPt.lng),
          lastPt.accuracy_m,
          lastPt.recorded_at.slice(0, 16),
          nowUtc.slice(0, 16),
          nextNote,
          nowUtc,
          activeSession.id,
        )
      } else {
        q.run(
          `UPDATE field_sessions
           SET last_lat = ?, last_lng = ?, gps_accuracy_m = ?, last_location_at = ?, last_location_received_at = ?, updated_at = ?
           WHERE id = ?`,
          String(lastPt.lat),
          String(lastPt.lng),
          lastPt.accuracy_m,
          lastPt.recorded_at.slice(0, 16),
          nowUtc.slice(0, 16),
          nowUtc,
          activeSession.id,
        )
      }

      const resultSummary = {
        ok: true,
        batch_id: insertedId,
        session_id: activeSession.id,
        accepted: acceptedPoints.length,
        deduplicated: normalized.length - acceptedPoints.length,
        flags: flagList,
      }

      for (const p of acceptedPoints) {
        if (!p.idempotency_key) continue
        q.run(
          `INSERT INTO offline_sync_queue_log (idempotency_key, user_id, device_id, action_type, payload_json, result_json, queued_at, synced_at)
           VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`,
          p.idempotency_key,
          user.id,
          deviceId,
          'field_gps_ping',
          JSON.stringify({ session_id: activeSession.id, recorded_at: p.recorded_at }),
          JSON.stringify(resultSummary),
          p.recorded_at,
          nowUtc,
        )
      }

      if (metaParsed.idempotency_key) {
        q.run(
          `INSERT INTO offline_sync_queue_log (idempotency_key, user_id, device_id, action_type, payload_json, result_json, queued_at, synced_at)
           VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`,
          metaParsed.idempotency_key,
          user.id,
          deviceId,
          'field_gps_batch',
          JSON.stringify({ session_id: activeSession.id, count: acceptedPoints.length }),
          JSON.stringify(resultSummary),
          lastPt.recorded_at,
          nowUtc,
        )
      }

      const pin = q.get<any>(`SELECT * FROM staff_live_locations WHERE user_id = ?`, user.id) ?? null
      return { batchId: insertedId, liveLocation: pin }
    })

    if (flagList.length > 0) {
      notifyLeadership(
        `GPS Anomaly Alert: ${user.name}`,
        `${flagList.join('; ')} (${activeSession.session_no || `Session #${activeSession.id}`})`,
        '/field-live',
        'audit',
        `gps-anom-${activeSession.id}-${dubaiTimeParts(new Date(nowMs)).date}`,
      )
    }

    emitLiveEvent({
      type: 'ping',
      user_id: user.id,
      employee_id: emp.id,
      name: user.name,
      email: user.email,
      field_session_id: activeSession.id,
      session_no: activeSession.session_no,
      session_status: activeSession.status,
      lat: lastPt.lat,
      lng: lastPt.lng,
      accuracy_m: lastPt.accuracy_m,
      speed_mps: lastPt.speed_mps ?? null,
      heading: lastPt.heading ?? null,
      battery_pct: liveLocation?.battery_pct ?? lastPt.battery_pct,
      purpose: liveLocation?.purpose ?? meta.purpose,
      community: liveLocation?.community ?? meta.community,
      is_flagged: isFlagged,
      flag_reason: flagReason,
      updated_at: nowUtc,
    })

    return {
      ok: true,
      batch_id: batchId,
      session_id: activeSession.id,
      accepted: acceptedPoints.length,
      deduplicated: normalized.length - acceptedPoints.length,
      flags: flagList,
      live_location: liveLocation,
    }
  })

  app.post('/api/field-gps/sessions/stop', async (req) => {
    const user = requireStaff(req)
    const { emp } = resolveActiveEmployee(user)
    const active = getActiveSessionForEmployee(emp.id)
    if (!active) {
      q.run(`DELETE FROM staff_live_locations WHERE user_id = ?`, user.id)
      return { ok: true, stopped: false, session: null }
    }

    const nowUtc = nowIso()
    const updated = tx(() => {
      const s = patchRecord(
        getDef('field_sessions'),
        active.id,
        {
          status: 'Completed (Off Duty)',
          ended_at: nowUtc.slice(0, 16),
        },
        { ...req.ctx, system: true },
      )
      q.run(`DELETE FROM staff_live_locations WHERE user_id = ? OR field_session_id = ?`, user.id, active.id)
      return s
    })

    emitLiveEvent({
      type: 'session_stopped',
      user_id: user.id,
      employee_id: emp.id,
      field_session_id: active.id,
      session_no: active.session_no,
      updated_at: nowUtc,
    })

    return { ok: true, stopped: true, session: updated }
  })

  app.post('/api/field-gps/sos', async (req) => {
    const user = requireStaff(req)
    const b = sosSchema.parse(req.body ?? {})
    const { emp, agentId } = resolveActiveEmployee(user)
    const existing = getActiveSessionForEmployee(emp.id)
    const now = new Date()
    const nowUtc = now.toISOString()
    const dubai = dubaiTimeParts(now)

    const existingPin = q.get<{ lat: number; lng: number; accuracy_m: number | null }>(
      `SELECT lat, lng, accuracy_m FROM staff_live_locations WHERE user_id = ?`,
      user.id,
    )
    const lat = b.lat ?? existingPin?.lat ?? (existing?.last_lat ? Number(existing.last_lat) : 25.2048)
    const lng = b.lng ?? existingPin?.lng ?? (existing?.last_lng ? Number(existing.last_lng) : 55.2708)
    const accuracyM = b.accuracy_m ?? existingPin?.accuracy_m ?? null
    const sosReason = b.reason?.trim() || 'Emergency SOS panic button triggered by field agent'
    const coordsText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`

    const session = tx(() => {
      let s: any
      if (existing) {
        s = patchRecord(
          getDef('field_sessions'),
          existing.id,
          {
            status: 'SOS Emergency Active',
            sos_triggered: true,
            sos_reason: sosReason,
            last_lat: String(lat),
            last_lng: String(lng),
            gps_accuracy_m: accuracyM,
            last_location_at: nowUtc.slice(0, 16),
            last_location_received_at: nowUtc.slice(0, 16),
          },
          { ...req.ctx, system: true },
        )
      } else {
        const autoStopHour = autoStopHourDubai()
        const dubaiStopMs = Date.parse(`${dubai.date}T${String(autoStopHour).padStart(2, '0')}:00:00+04:00`)
        const scheduledEndIso = new Date(
          Math.max(Number.isFinite(dubaiStopMs) ? dubaiStopMs : now.getTime() + 4 * 3_600_000, now.getTime() + 3_600_000),
        ).toISOString()
        s = createRecord(
          getDef('field_sessions'),
          {
            employee_id: emp.id,
            agent_id: agentId,
            duty_date: dubai.date,
            scheduled_start: nowUtc.slice(0, 16),
            scheduled_end: scheduledEndIso.slice(0, 16),
            started_at: nowUtc.slice(0, 16),
            status: 'SOS Emergency Active',
            assigned_location: b.community || 'Emergency SOS Location',
            sos_triggered: true,
            sos_reason: sosReason,
            last_lat: String(lat),
            last_lng: String(lng),
            gps_accuracy_m: accuracyM,
            last_location_at: nowUtc.slice(0, 16),
            last_location_received_at: nowUtc.slice(0, 16),
            retention_until: addDays(dubai.date, Math.max(1, gpsRetentionDays())),
            notes: `Purpose: Emergency SOS${b.community ? ` | Community: ${b.community}` : ''}`,
          },
          { ...req.ctx, system: true },
        )
      }

      const meta = extractPurposeAndCommunity(s)
      q.run(
        `INSERT INTO staff_live_locations (
          user_id, employee_id, field_session_id, lat, lng, accuracy_m, purpose, community, is_flagged, flag_reason, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,1,?,?)
        ON CONFLICT(user_id) DO UPDATE SET
          employee_id = excluded.employee_id,
          field_session_id = excluded.field_session_id,
          lat = excluded.lat,
          lng = excluded.lng,
          accuracy_m = COALESCE(excluded.accuracy_m, staff_live_locations.accuracy_m),
          is_flagged = 1,
          flag_reason = excluded.flag_reason,
          updated_at = excluded.updated_at`,
        user.id,
        emp.id,
        s.id,
        lat,
        lng,
        accuracyM,
        meta.purpose || 'SOS Emergency',
        b.community || meta.community || s.assigned_location,
        `SOS Emergency: ${sosReason}`.slice(0, 400),
        nowUtc,
      )

      q.run(
        `INSERT INTO audit_log(at, user_id, user_name, entity, record_id, record_label, action, changes, ip)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        nowUtc,
        user.id,
        user.name,
        'field_sessions',
        s.id,
        s.session_no || `Session #${s.id}`,
        'field_gps_sos',
        JSON.stringify({ lat, lng, reason: sosReason }),
        req.ip ?? null,
      )

      return s
    })

    const liveLocation = q.get<any>(`SELECT * FROM staff_live_locations WHERE user_id = ?`, user.id) ?? null
    const sosTitle = `SOS EMERGENCY: ${user.name}`
    const sosBody = `${sosReason} · Dubai GPS: ${coordsText}`

    emitLiveEvent({
      type: 'sos',
      user_id: user.id,
      employee_id: emp.id,
      name: user.name,
      email: user.email,
      field_session_id: session.id,
      session_no: session.session_no,
      session_status: 'SOS Emergency Active',
      lat,
      lng,
      accuracy_m: accuracyM,
      is_flagged: true,
      flag_reason: `SOS Emergency: ${sosReason}`,
      reason: sosReason,
      live_location: liveLocation,
      updated_at: nowUtc,
    })

    // Notify Leadership in-app (skip automatic generic push) + send exactly one high-priority SOS push per canonical leader
    notifyLeadership(sosTitle, sosBody, '/field-live', 'sos', undefined, { skipPush: true })

    const canonicalEmails = [...CANONICAL_ELEVATED_EMAILS]
    const rawLeaders = q.all<{ id: number }>(
      `SELECT id FROM users
       WHERE deleted_at IS NULL AND active = 1 AND party_id IS NULL
         AND lower(email) IN (${canonicalEmails.map(() => '?').join(',')})`,
      ...canonicalEmails,
    )
    const verifiedLeaders = rawLeaders
      .map(l => loadUser(l.id))
      .filter((u): u is NonNullable<ReturnType<typeof loadUser>> => !!u && canAccessFieldLiveMap(u))
    await Promise.allSettled(
      verifiedLeaders.map(l =>
        dispatchPushToUser(l.id, {
          title: sosTitle,
          body: sosBody,
          url: '/field-live',
          tag: `swk-sos-${session.id}`,
          channel: 'swk_calls_sos',
        }),
      ),
    )

    return { ok: true, session, live_location: liveLocation, coordinates: { lat, lng } }
  })

  app.get('/api/field-gps/my-session', async (req) => {
    const user = requireStaff(req)
    const { emp } = resolveActiveEmployee(user)
    const todayDubai = dubaiTimeParts().date
    const active = getActiveSessionForEmployee(emp.id) ?? null
    const latestToday =
      active ??
      q.get<any>(
        `SELECT * FROM field_sessions
         WHERE employee_id = ? AND duty_date = ? AND deleted_at IS NULL
         ORDER BY id DESC LIMIT 1`,
        emp.id,
        todayDubai,
      ) ??
      null

    const liveLocation = active
      ? (q.get<any>(`SELECT * FROM staff_live_locations WHERE user_id = ?`, user.id) ?? null)
      : null

    const trail = active ? decodeSessionTrail(active.id) : latestToday ? decodeSessionTrail(latestToday.id) : { points: [], batchesCount: 0 }

    return {
      session: active,
      latest_today_session: latestToday,
      live_location: liveLocation,
      points: trail.points,
      batches_count: trail.batchesCount,
      config: {
        max_accuracy_m: maxGpsAccuracyM(),
        auto_stop_hour_dubai: autoStopHourDubai(),
        retention_days: gpsRetentionDays(),
      },
    }
  })

  // ---------------------------------------------------------------------------
  // Leadership ONLY Endpoints (Owner, Admin, Operations Manager Haseeb)
  // ---------------------------------------------------------------------------

  app.get('/api/field-gps/live', async (req) => {
    const leader = requireLeadership(req)
    const rows = q.all<any>(
      `SELECT sll.user_id, sll.employee_id, sll.field_session_id,
              sll.lat, sll.lng, sll.accuracy_m, sll.speed_mps, sll.heading, sll.battery_pct,
              sll.purpose, sll.community, sll.is_flagged, sll.flag_reason, sll.updated_at,
              u.name AS user_name, u.email AS user_email, u.designation,
              e.emp_no, e.phone,
              fs.session_no, fs.status AS session_status, fs.assigned_location,
              fs.started_at, fs.duty_date, fs.sos_triggered, fs.sos_reason
       FROM staff_live_locations sll
       JOIN users u ON u.id = sll.user_id
       LEFT JOIN employees e ON e.id = sll.employee_id
       LEFT JOIN field_sessions fs ON fs.id = sll.field_session_id
       WHERE u.deleted_at IS NULL AND u.active = 1
         AND (fs.id IS NULL OR (fs.deleted_at IS NULL AND fs.status IN ('Active (On Duty)', 'SOS Emergency Active')))
       ORDER BY sll.is_flagged DESC, sll.updated_at DESC`,
    )

    // Control 3.10 immutable audit logging on every Leadership live map view
    const accessedAt = nowIso()
    if (rows.length > 0) {
      tx(() => {
        for (const r of rows) {
          createRecord(
            getDef('location_access_logs'),
            {
              field_session_id: r.field_session_id ?? null,
              employee_id: r.employee_id ?? null,
              accessed_by: leader.id,
              accessed_at: accessedAt,
              is_within_work_hours: true,
              access_outcome: 'Granted – Active Duty',
              exception_reason: 'Leadership Live Field Map view',
              security_review_required: false,
            },
            { ...req.ctx, system: true },
          )
        }
      })
    } else {
      createRecord(
        getDef('location_access_logs'),
        {
          field_session_id: null,
          employee_id: null,
          accessed_by: leader.id,
          accessed_at: accessedAt,
          is_within_work_hours: true,
          access_outcome: 'Granted – Active Duty',
          exception_reason: 'Leadership Live Field Map view (0 active agents)',
          security_review_required: false,
        },
        { ...req.ctx, system: true },
      )
    }

    const recentClosed = q.all<any>(
      `SELECT fs.id, fs.session_no, fs.employee_id, fs.duty_date, fs.status, fs.assigned_location,
              fs.started_at, fs.ended_at, fs.sos_triggered,
              e.name AS employee_name, e.emp_no, e.user_id
       FROM field_sessions fs
       LEFT JOIN employees e ON e.id = fs.employee_id
       WHERE fs.deleted_at IS NULL
         AND fs.status NOT IN ('Active (On Duty)', 'SOS Emergency Active')
       ORDER BY fs.id DESC
       LIMIT 25`,
    )

    return {
      rows,
      agents: rows,
      recent_closed_sessions: recentClosed,
      server_time: accessedAt,
    }
  })

  app.get('/api/field-gps/stream', async (req, reply) => {
    requireLeadership(req)
    reply.hijack()
    const res = reply.raw
    const baseHeaders = reply.getHeaders() as Record<string, string | string[] | number | undefined>
    res.writeHead(200, {
      ...baseHeaders,
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    res.write('retry: 3000\n\n')
    const send = (ev: unknown) => {
      try {
        res.write(`event: field_gps\ndata: ${JSON.stringify(ev)}\n\n`)
      } catch {
        /* closed */
      }
    }
    const gpsChannel = `field-gps:live:${liveScope()}`
    liveBus.on(gpsChannel, send)
    const ping = setInterval(() => {
      try {
        res.write(': ping\n\n')
      } catch {
        /* closed */
      }
    }, 20_000)
    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      clearInterval(ping)
      liveBus.off(gpsChannel, send)
    }
    req.raw.on('close', cleanup)
    res.on('close', cleanup)
  })

  app.get('/api/field-gps/sessions/:id/trail', async (req) => {
    const leader = requireLeadership(req)
    const sessionId = idOf((req.params as any).id)
    const session = q.get<any>(`SELECT * FROM field_sessions WHERE id = ? AND deleted_at IS NULL`, sessionId)
    if (!session) throw notFound('Field session not found')

    const dubai = dubaiTimeParts()
    const autoStopHour = autoStopHourDubai()
    const isActive = session.status === 'Active (On Duty)' || session.status === 'SOS Emergency Active'
    const isActiveOrTodayDuty =
      session.status === 'SOS Emergency Active' ||
      (isActive && (!session.duty_date || String(session.duty_date) >= dubai.date) && dubai.hour < autoStopHour)

    const reason = String((req.query as any)?.reason ?? '').trim()
    const accessedAt = nowIso()

    if (!isActiveOrTodayDuty) {
      if (reason.length < 8) {
        createRecord(
          getDef('location_access_logs'),
          {
            field_session_id: session.id,
            employee_id: session.employee_id,
            accessed_by: leader.id,
            accessed_at: accessedAt,
            is_within_work_hours: false,
            access_outcome: 'Denied – Off Hours Blocked',
            exception_reason: reason || 'Attempted historical / off-hours trail lookup without valid reason (>= 8 chars)',
            security_review_required: true,
          },
          { ...req.ctx, system: true },
        )
        createRecord(
          getDef('compliance_cases'),
          {
            title: `Off-hours employee GPS trail access blocked: Session ${session.session_no || session.id}`,
            case_category: 'Off-Hours GPS Access Alert (7.03)',
            source_type: 'Automated Anomaly Lead',
            severity: 'High',
            subject_user_id: leader.id,
            linked_entity: 'field_sessions',
            linked_record_id: session.id,
            evidence_summary: `User ${leader.name} (#${leader.id}) requested historical/off-hours trail for employee #${session.employee_id} (Session ${session.session_no || session.id}, duty_date ${session.duty_date}, status ${session.status}) without a valid documented reason (>= 8 chars). Outcome: Denied (400).`,
          },
          { ...req.ctx, system: true },
        )
        throw bad('Privacy & Field Presence Control (3.10 / 7.03): Historical or off-hours GPS trail access requires a documented reason of at least 8 characters.')
      }

      tx(() => {
        createRecord(
          getDef('location_access_logs'),
          {
            field_session_id: session.id,
            employee_id: session.employee_id,
            accessed_by: leader.id,
            accessed_at: accessedAt,
            is_within_work_hours: false,
            access_outcome: 'Granted – Documented Emergency Exception',
            exception_reason: reason,
            security_review_required: true,
          },
          { ...req.ctx, system: true },
        )
        createRecord(
          getDef('compliance_cases'),
          {
            title: `Off-hours employee GPS trail access exception: Session ${session.session_no || session.id}`,
            case_category: 'Off-Hours GPS Access Alert (7.03)',
            source_type: 'Automated Anomaly Lead',
            severity: 'High',
            subject_user_id: leader.id,
            linked_entity: 'field_sessions',
            linked_record_id: session.id,
            evidence_summary: `User ${leader.name} (#${leader.id}) accessed historical/off-hours GPS trail for employee #${session.employee_id} (Session ${session.session_no || session.id}, duty_date ${session.duty_date}, status ${session.status}). Reason: ${reason}`,
          },
          { ...req.ctx, system: true },
        )
        recordEnterpriseAudit(
          req.ctx,
          '3.10',
          '7.03',
          'field_gps.historical_trail_accessed',
          'field_sessions',
          session.id,
          `Leadership accessed historical/off-hours GPS trail for ${session.session_no || session.id}`,
          { reason },
        )
      })
    } else {
      createRecord(
        getDef('location_access_logs'),
        {
          field_session_id: session.id,
          employee_id: session.employee_id,
          accessed_by: leader.id,
          accessed_at: accessedAt,
          is_within_work_hours: true,
          access_outcome: 'Granted – Active Duty',
          exception_reason: reason || 'Standard active-duty Leadership map inspection',
          security_review_required: false,
        },
        { ...req.ctx, system: true },
      )
    }

    const { points, batchesCount } = decodeSessionTrail(session.id)
    let totalDistanceM = 0
    for (let i = 1; i < points.length; i++) {
      totalDistanceM += distanceM([points[i - 1]!.lat, points[i - 1]!.lng], [points[i]!.lat, points[i]!.lng])
    }

    return {
      session,
      points,
      batches_count: batchesCount,
      total_distance_m: totalDistanceM,
      within_duty_hours: isActiveOrTodayDuty,
    }
  })
}
