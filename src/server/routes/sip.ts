import crypto from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { VOICE_OUTCOMES } from '../../shared/entities/automation'
import { canAccessCrmVault, canOpenEmployeeRecords } from '../../shared/swk-staff-access'
import { q, tx } from '../db'
import { initiateMaskedBridgeCall, resolveVaultOwnerForMaskedCall } from '../domain/crm-vault'
import { audit, getDef } from '../engine'
import { dispatchPushToUser } from '../integrations/push'
import { liveBus, liveScope } from '../notify'
import { decryptSecret, encryptSecret, getSetting, setSettings } from '../settings'
import { bad, conflict, forbidden, HttpError, notFound, nowIso, nowLocal, safeJson } from '../util'
import { idOf } from './helpers'

const MASKED_OWNER_LABEL = 'Masked Vault Owner'
const VAULT_TOKEN_PATTERN = /(?:[0-9A-Za-z*#+_-]{0,16})?vt_[0-9a-f]{8,}/gi
const VAULT_SIP_URI_PATTERN = /sip:[0-9A-Za-z*#+_-]{0,16}vt_[0-9a-f]{8,}@[^\s,;>]+/gi
const SIP_WS_TOKEN_PREFIX = 'swk_ws1.'
const DEFAULT_STUN_FALLBACK: IceServerEntry = { urls: 'stun:stun.l.google.com:19302' }

interface IceServerEntry {
  urls: string | string[]
  username?: string
  credential?: string
}

const iceServerSchema = z.object({
  urls: z.union([z.string().trim().min(1).max(500), z.array(z.string().trim().min(1).max(500)).min(1)]),
  username: z.string().max(200).optional(),
  credential: z.string().max(200).optional(),
})

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function timingSafeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length === 0 || bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

function parseIceServers(raw: unknown): IceServerEntry[] {
  const val = Array.isArray(raw) ? raw : safeJson<unknown>(typeof raw === 'string' ? raw : '[]', [])
  if (!Array.isArray(val)) return []
  const out: IceServerEntry[] = []
  for (const item of val) {
    const parsed = iceServerSchema.safeParse(item)
    if (parsed.success) out.push(parsed.data)
  }
  return out
}

function parseTurnUrls(raw: unknown): string[] {
  return String(raw ?? '')
    .split(/[\r\n,]+/)
    .map(s => s.trim())
    .filter(s => /^turns?:\/\/?[^\s]+$/i.test(s) || /^turns?:[^\s]+$/i.test(s))
}

function getOrCreateWsTokenSecret(): string {
  let s = String(getSetting('sip_ws_token_secret') || '').trim()
  if (!s) {
    s = 'swk_ws_sec_' + crypto.randomBytes(32).toString('hex')
    setSettings({ sip_ws_token_secret: s })
  }
  return s
}

function getWsTokenTtlSeconds(): number {
  const n = Number(getSetting('sip_ws_token_ttl_s') ?? 900)
  if (!Number.isFinite(n)) return 900
  return Math.max(120, Math.min(3600, Math.round(n)))
}

function getTurnTtlSeconds(): number {
  const n = Number(getSetting('sip_turn_ttl_s') ?? 3600)
  if (!Number.isFinite(n)) return 3600
  return Math.max(300, Math.min(14400, Math.round(n)))
}

function getIceTransportPolicy(): 'all' | 'relay' {
  return String(getSetting('sip_ice_transport_policy') || 'all').trim().toLowerCase() === 'relay' ? 'relay' : 'all'
}

/**
 * Mints a short-lived, HMAC-SHA256-signed, server-revocable WebSocket session token
 * for SIP.js so static SIP trunk passwords NEVER leave the server.
 */
function mintSipWsSessionToken(params: {
  userId: number
  extensionNo: string
  sipUsername: string
  sessionHash?: string | null
  ttlSeconds?: number
}) {
  const ttlS = params.ttlSeconds ?? getWsTokenTtlSeconds()
  const nowMs = Date.now()
  const iat = Math.floor(nowMs / 1000)
  const exp = iat + ttlS
  const jti = 'ws_' + crypto.randomBytes(12).toString('hex')
  const payload = {
    v: 1,
    jti,
    uid: params.userId,
    ext: params.extensionNo,
    usr: params.sipUsername,
    iat,
    exp,
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const sig = crypto
    .createHmac('sha256', getOrCreateWsTokenSecret())
    .update(encodedPayload)
    .digest('base64url')
  const token = `${SIP_WS_TOKEN_PREFIX}${encodedPayload}.${sig}`
  const issuedAtIso = new Date(nowMs).toISOString()
  const expiresAtIso = new Date(exp * 1000).toISOString()

  tx(() => {
    const staleBefore = new Date(nowMs - 24 * 3600_000).toISOString()
    q.run(`DELETE FROM sip_ws_sessions WHERE expires_at < ?`, staleBefore)
    q.run(
      `INSERT INTO sip_ws_sessions (jti, user_id, extension_no, sip_username, session_hash, issued_at, expires_at, revoked_at)
       VALUES (?,?,?,?,?,?,?,NULL)`,
      jti,
      params.userId,
      params.extensionNo,
      params.sipUsername,
      params.sessionHash ?? null,
      issuedAtIso,
      expiresAtIso,
    )
  })

  return { token, jti, expiresAtIso, ttlS }
}

function appendWsTokenToUrl(wsUrl: string, token: string): string {
  try {
    const u = new URL(wsUrl)
    u.searchParams.set('swk_ws_token', token)
    return u.toString()
  } catch {
    const sep = wsUrl.includes('?') ? '&' : '?'
    return `${wsUrl}${sep}swk_ws_token=${encodeURIComponent(token)}`
  }
}

/**
 * Generates RFC 8489 / coturn REST ephemeral TURN credentials (HMAC-SHA1 over `<unix_expiry>:<uid>:<ext>`)
 * backed by the regional UAE coturn relay, merged with configured STUN servers.
 */
function buildEphemeralIceServers(userId: number, extensionNo: string): {
  ice_servers: IceServerEntry[]
  ice_transport_policy: 'all' | 'relay'
  turn_configured: boolean
  turn_region: string
  turn_expires_at: string | null
  turn_ttl_s: number
} {
  const configuredIce = parseIceServers(getSetting('sip_ice_servers'))
  const turnUrls = parseTurnUrls(getSetting('sip_turn_urls'))
  const turnSecret = String(getSetting('sip_turn_secret') || '').trim()
  const turnRegion = String(getSetting('sip_turn_region') || 'UAE / Dubai (me-central-1)').trim()
  const turnTtlS = getTurnTtlSeconds()
  const policy = getIceTransportPolicy()

  // Keep STUN entries (and non-secret ICE servers); never re-emit static TURN passwords when dynamic coturn is enabled
  const baseServers: IceServerEntry[] = []
  for (const s of configuredIce) {
    const urlsList = Array.isArray(s.urls) ? s.urls : [s.urls]
    const hasTurn = urlsList.some(u => /^turns?:/i.test(u))
    if (hasTurn && turnUrls.length > 0 && turnSecret) continue
    baseServers.push(s)
  }

  let turnConfigured = false
  let turnExpiresAt: string | null = null
  if (turnUrls.length > 0 && turnSecret) {
    const expEpoch = Math.floor(Date.now() / 1000) + turnTtlS
    const username = `${expEpoch}:${userId}:${extensionNo}`
    const credential = crypto.createHmac('sha1', turnSecret).update(username).digest('base64')
    baseServers.push({
      urls: turnUrls,
      username,
      credential,
    })
    turnConfigured = true
    turnExpiresAt = new Date(expEpoch * 1000).toISOString()
  }

  if (baseServers.length === 0) {
    baseServers.push(DEFAULT_STUN_FALLBACK)
  }

  return {
    ice_servers: baseServers,
    ice_transport_policy: policy,
    turn_configured: turnConfigured,
    turn_region: turnRegion,
    turn_expires_at: turnExpiresAt,
    turn_ttl_s: turnTtlS,
  }
}

function revokeUserSipWsTokens(userId: number, jti?: string) {
  const now = nowIso()
  if (jti) {
    q.run(`UPDATE sip_ws_sessions SET revoked_at = ? WHERE user_id = ? AND jti = ? AND revoked_at IS NULL`, now, userId, jti)
  } else {
    q.run(`UPDATE sip_ws_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`, now, userId)
  }
}

function verifySipWsSessionToken(rawToken: string): {
  jti: string
  user_id: number
  extension_no: string
  sip_username: string
  display_name: string
  expires_at: string
} {
  const clean = rawToken.trim().replace(/^Bearer\s+/i, '')
  if (!clean.startsWith(SIP_WS_TOKEN_PREFIX)) {
    throw new HttpError(401, 'Invalid SIP WebSocket session token format')
  }
  const body = clean.slice(SIP_WS_TOKEN_PREFIX.length)
  const dot = body.indexOf('.')
  if (dot <= 0) throw new HttpError(401, 'Malformed SIP WebSocket session token')
  const encodedPayload = body.slice(0, dot)
  const providedSig = body.slice(dot + 1)
  const expectedSig = crypto
    .createHmac('sha256', getOrCreateWsTokenSecret())
    .update(encodedPayload)
    .digest('base64url')
  if (!timingSafeEquals(providedSig, expectedSig)) {
    throw new HttpError(401, 'Invalid SIP WebSocket session token signature')
  }

  let parsed: any
  try {
    parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
  } catch {
    throw new HttpError(401, 'Unreadable SIP WebSocket session token payload')
  }
  if (!parsed || parsed.v !== 1 || typeof parsed.jti !== 'string' || !Number.isInteger(parsed.uid) || !Number.isInteger(parsed.exp)) {
    throw new HttpError(401, 'Invalid SIP WebSocket session token claims')
  }
  const nowSec = Math.floor(Date.now() / 1000)
  if (parsed.exp <= nowSec) {
    throw new HttpError(401, 'SIP WebSocket session token has expired')
  }

  const row = q.get<{
    jti: string
    user_id: number
    extension_no: string
    sip_username: string
    expires_at: string
    revoked_at: string | null
  }>(`SELECT jti, user_id, extension_no, sip_username, expires_at, revoked_at FROM sip_ws_sessions WHERE jti = ?`, parsed.jti)

  if (!row || row.revoked_at !== null || row.user_id !== parsed.uid || Date.parse(row.expires_at) <= Date.now()) {
    throw new HttpError(401, 'SIP WebSocket session token was revoked or expired')
  }

  const ext = q.get<{ extension_no: string; sip_username: string; display_name: string | null; user_name: string }>(
    `SELECT s.extension_no, s.sip_username, s.display_name, u.name AS user_name
     FROM sip_extensions s
     JOIN users u ON u.id = s.user_id
     WHERE s.user_id = ? AND s.active = 1 AND u.active = 1 AND u.deleted_at IS NULL AND u.party_id IS NULL
     LIMIT 1`,
    row.user_id,
  )
  if (!ext || ext.extension_no !== row.extension_no || ext.sip_username !== row.sip_username) {
    throw new HttpError(403, 'SIP extension is no longer active for this user')
  }

  return {
    jti: row.jti,
    user_id: row.user_id,
    extension_no: ext.extension_no,
    sip_username: ext.sip_username,
    display_name: ext.display_name || ext.user_name,
    expires_at: row.expires_at,
  }
}

function maskVaultStrings(input: string): string {
  return input
    .replace(VAULT_SIP_URI_PATTERN, MASKED_OWNER_LABEL)
    .replace(VAULT_TOKEN_PATTERN, '[MASKED-VAULT]')
}

function containsVaultToken(input: string): boolean {
  return /(?:sip:)?[0-9A-Za-z*#+_-]{0,16}vt_[0-9a-f]{8,}/i.test(input)
}

function requireStaff(req: FastifyRequest) {
  if (!req.user || req.user.party_id) {
    throw forbidden('This area is for company staff')
  }
  return req.user
}

function requireSipAdmin(req: FastifyRequest) {
  const user = requireStaff(req)
  if (!canOpenEmployeeRecords(user)) {
    throw forbidden('Only Owner and Admin can manage SIP trunk settings and staff extensions.')
  }
  return user
}

function requirePbxSecret(req: FastifyRequest) {
  const expected = String(getSetting('sip_webhook_secret') || '').trim()
  const provided = String((req.params as any)?.secret ?? '').trim()
  if (!expected || !provided || !timingSafeEquals(expected, provided)) {
    throw forbidden('Invalid or unconfigured SIP webhook secret')
  }
}

export default async function sipRoutes(app: FastifyInstance) {
  // =========================================================================
  // Staff SIP Configuration, Colleague Directory, Call Logs & Live Wake Stream
  // =========================================================================

  const buildStaffSipSessionPayload = (req: FastifyRequest, user: ReturnType<typeof requireStaff>) => {
    const enabled = Boolean(getSetting('sip_enabled'))
    const wsUrl = String(getSetting('sip_ws_url') || '').trim()
    const domain = String(getSetting('sip_domain') || '').trim()

    if (!enabled || !wsUrl || !domain) {
      return {
        configured: false as const,
        reason: 'Company SIP/VoIP trunk is not enabled or configured yet.',
      }
    }

    const ext = q.get<{
      extension_no: string
      sip_username: string
      sip_password_enc: string
      display_name: string | null
      allow_direct_dial: number
    }>(
      `SELECT extension_no, sip_username, sip_password_enc, display_name, allow_direct_dial
       FROM sip_extensions
       WHERE user_id = ? AND active = 1`,
      user.id,
    )

    if (!ext) {
      return {
        configured: false as const,
        reason: 'No active SIP extension is assigned to your account.',
      }
    }

    const wsTok = mintSipWsSessionToken({
      userId: user.id,
      extensionNo: ext.extension_no,
      sipUsername: ext.sip_username,
      sessionHash: req.sessionHash ?? null,
    })
    const ice = buildEphemeralIceServers(user.id, ext.extension_no)

    return {
      configured: true as const,
      auth_mode: 'ephemeral_ws_token' as const,
      ws_url: wsUrl,
      ws_url_tokenized: appendWsTokenToUrl(wsUrl, wsTok.token),
      ws_session_token: wsTok.token,
      ws_token_jti: wsTok.jti,
      ws_token_expires_at: wsTok.expiresAtIso,
      ws_token_ttl_s: wsTok.ttlS,
      domain,
      outbound_proxy: String(getSetting('sip_outbound_proxy') || '').trim(),
      ice_servers: ice.ice_servers,
      ice_transport_policy: ice.ice_transport_policy,
      turn_configured: ice.turn_configured,
      turn_region: ice.turn_region,
      turn_expires_at: ice.turn_expires_at,
      turn_ttl_s: ice.turn_ttl_s,
      caller_id_mode: String(getSetting('sip_caller_id_mode') || 'company_main'),
      has_vault_prefix: Boolean(String(getSetting('sip_vault_bridge_prefix') || '').trim()),
      extension: {
        extension_no: ext.extension_no,
        sip_username: ext.sip_username,
        has_static_password: Boolean(ext.sip_password_enc),
        display_name: ext.display_name || user.name,
        allow_direct_dial: Boolean(ext.allow_direct_dial),
      },
    }
  }

  app.get('/api/sip/my-config', async (req, reply) => {
    reply.header('cache-control', 'no-store')
    const user = requireStaff(req)
    return buildStaffSipSessionPayload(req, user)
  })

  app.post('/api/sip/session-token', async (req, reply) => {
    reply.header('cache-control', 'no-store')
    const user = requireStaff(req)
    const payload = buildStaffSipSessionPayload(req, user)
    if (!payload.configured) {
      throw bad(payload.reason)
    }
    return payload
  })

  app.post('/api/sip/session-token/revoke', async (req) => {
    const user = requireStaff(req)
    const b = z.object({ jti: z.string().trim().max(80).optional() }).parse(req.body ?? {})
    revokeUserSipWsTokens(user.id, b.jti)
    return { ok: true }
  })

  app.get('/api/sip/directory', async (req) => {
    requireStaff(req)
    const rows = q.all<{
      user_id: number
      name: string
      extension_no: string
      display_name: string
      designation: string
    }>(
      `SELECT s.user_id,
              u.name,
              s.extension_no,
              COALESCE(NULLIF(s.display_name, ''), u.name) AS display_name,
              COALESCE(NULLIF(u.designation, ''), r.name, '') AS designation
       FROM sip_extensions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE s.active = 1 AND u.active = 1 AND u.deleted_at IS NULL AND u.party_id IS NULL
       ORDER BY s.extension_no ASC, u.name ASC`,
    )
    return { rows, directory: rows }
  })

  app.get('/api/sip/stream', async (req, reply) => {
    const user = requireStaff(req)
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
    res.write('retry: 4000\n\n')
    const send = (ev: unknown) => {
      try {
        res.write(`event: sip\ndata: ${JSON.stringify(ev)}\n\n`)
      } catch {
        /* closed */
      }
    }
    const channel = `sip:${liveScope()}:${user.id}`
    liveBus.on(channel, send)
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
      liveBus.off(channel, send)
    }
    req.raw.on('close', cleanup)
    res.on('close', cleanup)
  })

  // =========================================================================
  // Dual Masked-Vault Protocol (SIP 60s Single-Use Token OR Legacy Bridge)
  // =========================================================================

  app.post('/api/sip/vault-call/:propertyId', async (req) => {
    const user = requireStaff(req)
    const propertyId = idOf((req.params as any).propertyId)

    const sipEnabled = Boolean(getSetting('sip_enabled'))
    const sipWsUrl = String(getSetting('sip_ws_url') || '').trim()
    const sipDomain = String(getSetting('sip_domain') || '').trim()
    const vaultPrefix = String(getSetting('sip_vault_bridge_prefix') || '').trim()
    const callerExtension = q.get<{ id: number }>(
      `SELECT id FROM sip_extensions WHERE user_id = ? AND active = 1`,
      user.id,
    )

    if (sipEnabled && sipWsUrl && sipDomain && vaultPrefix && callerExtension) {
      const { ownerE164 } = resolveVaultOwnerForMaskedCall(user, propertyId)
      const token = 'vt_' + crypto.randomBytes(12).toString('hex')
      const tokenHash = sha256Hex(token)
      const now = nowIso()
      const expiresAt = new Date(Date.now() + 60_000).toISOString()
      const encryptedTarget = encryptSecret(ownerE164)

      tx(() => {
        // Clean up long-expired tokens (> 24h) while keeping recent ones for audit/replay semantics
        const staleBefore = new Date(Date.now() - 24 * 3600_000).toISOString()
        q.run(`DELETE FROM sip_vault_call_tokens WHERE expires_at < ?`, staleBefore)

        q.run(
          `INSERT INTO sip_vault_call_tokens (
            token_hash, property_id, user_id, target_phone_enc, created_at, expires_at, consumed_at
          ) VALUES (?,?,?,?,?,?,NULL)`,
          tokenHash,
          propertyId,
          user.id,
          encryptedTarget,
          now,
          expiresAt,
        )

        q.run(
          `INSERT INTO crm_masked_call_logs (
            vault_property_id, agent_user_id, agent_name, channel, provider, provider_call_sid, status, notes, created_at
          ) VALUES (?,?,?,?,?,?,?,?,?)`,
          propertyId,
          user.id,
          user.name,
          'sip_masked_token',
          'sip_webrtc',
          tokenHash.slice(0, 16),
          'Token Issued',
          'Single-use 60s SIP vault token issued (number strictly masked)',
          now,
        )

        q.run(`UPDATE crm_vault_properties SET last_contacted_at = ?, updated_at = ? WHERE id = ?`, now, now, propertyId)
      })

      const dialTarget = `${vaultPrefix}${token}`
      return {
        ok: true,
        mode: 'sip_token' as const,
        dial_uri: `sip:${dialTarget}@${sipDomain}`,
        dial_target: dialTarget,
        expires_in_s: 60,
        masked_label: MASKED_OWNER_LABEL,
      }
    }

    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim()
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'os.swk.properties').split(',')[0].trim()
    const baseUrl = process.env.APP_PUBLIC_URL || `${proto}://${host}`
    const bridge = await initiateMaskedBridgeCall(user, propertyId, baseUrl)
    return {
      ...bridge,
      ok: true,
      mode: 'bridge' as const,
    }
  })

  // =========================================================================
  // SIP Call Logging & Role-Scoped Call History
  // =========================================================================

  const callLogSchema = z.object({
    call_id: z.string().trim().min(3).max(120).optional(),
    direction: z.enum(['in', 'out']).default('out'),
    from_number: z.string().trim().max(120).optional(),
    to_number: z.string().trim().max(120).optional(),
    caller_name: z.string().trim().max(160).optional(),
    duration_sec: z.number().int().min(0).max(86400).optional(),
    status: z.enum(['In progress', 'Completed', 'Failed']).optional(),
    outcome: z.string().trim().max(120).optional(),
    summary: z.string().trim().max(2000).optional(),
    is_vault_masked: z.boolean().optional(),
    property_id: z.number().int().positive().nullable().optional(),
    started_at: z.string().trim().max(32).optional(),
    ended_at: z.string().trim().max(32).optional(),
  })

  app.post('/api/sip/calls/log', async (req) => {
    const user = requireStaff(req)
    const b = callLogSchema.parse(req.body ?? {})

    const ext = q.get<{ extension_no: string; display_name: string | null }>(
      `SELECT extension_no, display_name FROM sip_extensions WHERE user_id = ?`,
      user.id,
    )

    const rawFrom = String(b.from_number || '')
    const rawTo = String(b.to_number || '')
    const rawSummary = String(b.summary || '')
    const isVaultMasked = Boolean(
      b.is_vault_masked ||
        b.property_id ||
        containsVaultToken(rawFrom) ||
        containsVaultToken(rawTo) ||
        containsVaultToken(rawSummary),
    )

    const myExt = ext?.extension_no || `u:${user.id}`
    const safeFrom =
      b.direction === 'out'
        ? (rawFrom ? maskVaultStrings(rawFrom).slice(0, 60) : myExt)
        : isVaultMasked
          ? MASKED_OWNER_LABEL
          : maskVaultStrings(rawFrom).slice(0, 60) || 'Unknown'

    const safeTo =
      b.direction === 'out'
        ? isVaultMasked
          ? MASKED_OWNER_LABEL
          : maskVaultStrings(rawTo).slice(0, 60) || 'Unknown'
        : (rawTo ? maskVaultStrings(rawTo).slice(0, 60) : myExt)

    const callerName = isVaultMasked
      ? MASKED_OWNER_LABEL
      : maskVaultStrings(String(b.caller_name || (b.direction === 'out' ? safeTo : safeFrom))).slice(0, 120)

    const validOutcome = (VOICE_OUTCOMES as readonly string[]).includes(b.outcome || '')
      ? b.outcome!
      : b.status === 'Failed'
        ? 'Abandoned'
        : 'Information given'

    const safeSummary =
      maskVaultStrings(rawSummary).slice(0, 1000) ||
      (isVaultMasked ? `Masked Vault SIP call (${b.direction})` : `SIP ${b.direction} call · ${b.outcome || validOutcome}`)

    const rawCallId = b.call_id && !containsVaultToken(b.call_id) ? b.call_id : ''
    const callId = rawCallId && rawCallId.startsWith('sip-')
      ? rawCallId
      : `sip-${rawCallId || `${user.id}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`}`
    const now = nowIso()
    const localNow = nowLocal()
    const status = b.status ?? 'Completed'
    const durationSec = Math.max(0, Math.round(b.duration_sec ?? 0))
    const safeOutcome = b.outcome ? maskVaultStrings(b.outcome) : undefined
    const customJson = JSON.stringify({
      source: 'sip',
      user_id: user.id,
      user_name: user.name,
      extension_no: ext?.extension_no ?? null,
      is_vault_masked: isVaultMasked,
      property_id: b.property_id ?? null,
      raw_outcome: safeOutcome && safeOutcome !== validOutcome ? safeOutcome : undefined,
    })

    const existing = q.get<{ id: number; created_by: number | null }>(
      `SELECT id, created_by FROM voice_calls WHERE call_id = ? AND deleted_at IS NULL`,
      callId,
    )

    if (existing) {
      if (existing.created_by !== user.id && !canAccessCrmVault(user)) {
        throw forbidden('You can only update your own SIP call logs.')
      }
      q.run(
        `UPDATE voice_calls
         SET direction = ?, from_number = ?, to_number = ?, caller_name = ?,
             status = ?, outcome = ?, duration_sec = ?, ended_at = ?,
             summary = ?, custom = ?, updated_at = ?, updated_by = ?
         WHERE id = ?`,
        b.direction,
        safeFrom,
        safeTo,
        callerName,
        status,
        validOutcome,
        durationSec,
        b.ended_at || localNow,
        safeSummary,
        customJson,
        now,
        user.id,
        existing.id,
      )
      return { ok: true, id: existing.id, call_id: callId }
    }

    const id = q.insert(
      `INSERT INTO voice_calls (
        started_at, direction, from_number, to_number, caller_name,
        language, outcome, status, duration_sec, handoff, ended_at,
        call_id, summary, transcript, custom, version, created_at, updated_at, created_by, updated_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      b.started_at || localNow,
      b.direction,
      safeFrom,
      safeTo,
      callerName,
      'English',
      validOutcome,
      status,
      durationSec,
      0,
      status === 'In progress' ? null : (b.ended_at || localNow),
      callId,
      safeSummary,
      '[]',
      customJson,
      1,
      now,
      now,
      user.id,
      user.id,
    )

    return { ok: true, id, call_id: callId }
  })

  app.get('/api/sip/calls', async (req) => {
    const user = requireStaff(req)
    const leadership = canAccessCrmVault(user)
    const whereSql = leadership
      ? `vc.deleted_at IS NULL AND (vc.call_id LIKE 'sip-%' OR vc.custom LIKE '%"source":"sip"%')`
      : `vc.deleted_at IS NULL AND vc.created_by = ? AND (vc.call_id LIKE 'sip-%' OR vc.custom LIKE '%"source":"sip"%')`

    const rows = q.all<any>(
      `SELECT vc.id, vc.call_id, vc.started_at, vc.ended_at, vc.direction,
              vc.from_number, vc.to_number, vc.caller_name, vc.status,
              vc.outcome, vc.duration_sec, vc.summary, vc.custom,
              vc.created_by AS user_id, u.name AS user_name
       FROM voice_calls vc
       LEFT JOIN users u ON u.id = vc.created_by
       WHERE ${whereSql}
       ORDER BY vc.id DESC
       LIMIT 100`,
      ...(leadership ? [] : [user.id]),
    )

    const shaped = rows.map((r) => {
      const custom = safeJson<Record<string, any>>(r.custom, {})
      const masked = Boolean(custom?.is_vault_masked)
      return {
        id: r.id,
        call_id: r.call_id,
        started_at: r.started_at,
        ended_at: r.ended_at,
        direction: r.direction,
        from_number: masked && r.direction === 'in' ? MASKED_OWNER_LABEL : maskVaultStrings(String(r.from_number || '')),
        to_number: masked && r.direction === 'out' ? MASKED_OWNER_LABEL : maskVaultStrings(String(r.to_number || '')),
        caller_name: masked ? MASKED_OWNER_LABEL : maskVaultStrings(String(r.caller_name || '')),
        status: r.status,
        outcome: custom?.raw_outcome || r.outcome,
        duration_sec: Number(r.duration_sec || 0),
        summary: maskVaultStrings(String(r.summary || '')),
        user_id: r.user_id,
        user_name: r.user_name || custom?.user_name || '',
        extension_no: custom?.extension_no || '',
        is_vault_masked: masked,
      }
    })

    return { total: shaped.length, rows: shaped }
  })

  // =========================================================================
  // Owner & Admin SIP Configuration & Staff Extension Provisioning
  // =========================================================================

  app.get('/api/sip/admin/config', async (req) => {
    requireSipAdmin(req)
    const secretSet = Boolean(String(getSetting('sip_webhook_secret') || '').trim())
    const turnSecretSet = Boolean(String(getSetting('sip_turn_secret') || '').trim())
    return {
      sip_enabled: Boolean(getSetting('sip_enabled')),
      sip_ws_url: String(getSetting('sip_ws_url') || ''),
      sip_domain: String(getSetting('sip_domain') || ''),
      sip_outbound_proxy: String(getSetting('sip_outbound_proxy') || ''),
      sip_ice_servers: parseIceServers(getSetting('sip_ice_servers')),
      sip_caller_id_mode: String(getSetting('sip_caller_id_mode') || 'company_main'),
      sip_vault_bridge_prefix: String(getSetting('sip_vault_bridge_prefix') || ''),
      sip_webhook_secret: secretSet ? '********' : '',
      sip_webhook_secret_set: secretSet,
      sip_ws_token_ttl_s: getWsTokenTtlSeconds(),
      sip_turn_urls: String(getSetting('sip_turn_urls') || ''),
      sip_turn_secret: turnSecretSet ? '********' : '',
      sip_turn_secret_set: turnSecretSet,
      sip_turn_ttl_s: getTurnTtlSeconds(),
      sip_turn_region: String(getSetting('sip_turn_region') || 'UAE / Dubai (me-central-1)'),
      sip_ice_transport_policy: getIceTransportPolicy(),
    }
  })

  const adminConfigSchema = z.object({
    sip_enabled: z.boolean().optional(),
    sip_ws_url: z.string().trim().max(500).optional(),
    sip_domain: z.string().trim().max(255).optional(),
    sip_outbound_proxy: z.string().trim().max(500).optional(),
    sip_ice_servers: z.union([z.array(iceServerSchema), z.string().max(4000)]).optional(),
    sip_caller_id_mode: z.string().trim().max(40).optional(),
    sip_vault_bridge_prefix: z
      .string()
      .trim()
      .max(16)
      .regex(/^[0-9A-Za-z*#+_-]{0,16}$/, 'Use up to 16 digits, letters, or * # + _ - characters')
      .optional(),
    sip_webhook_secret: z.string().trim().max(200).optional(),
    regenerate_secret: z.boolean().optional(),
    sip_ws_token_ttl_s: z.number().int().min(120).max(3600).optional(),
    sip_turn_urls: z.string().trim().max(1500).optional(),
    sip_turn_secret: z.string().trim().max(256).optional(),
    regenerate_turn_secret: z.boolean().optional(),
    sip_turn_ttl_s: z.number().int().min(300).max(14400).optional(),
    sip_turn_region: z.string().trim().max(120).optional(),
    sip_ice_transport_policy: z.enum(['all', 'relay']).optional(),
  })

  app.put('/api/sip/admin/config', async (req) => {
    requireSipAdmin(req)
    const b = adminConfigSchema.parse(req.body ?? {})

    if (b.sip_ws_url && !/^wss?:\/\/[^\s/$.?#].[^\s]*$/i.test(b.sip_ws_url)) {
      throw bad('SIP WebSocket URL must start with wss:// or ws://')
    }

    const patch: Record<string, any> = {}
    if (b.sip_enabled !== undefined) patch.sip_enabled = b.sip_enabled
    if (b.sip_ws_url !== undefined) patch.sip_ws_url = b.sip_ws_url
    if (b.sip_domain !== undefined) patch.sip_domain = b.sip_domain
    if (b.sip_outbound_proxy !== undefined) patch.sip_outbound_proxy = b.sip_outbound_proxy
    if (b.sip_caller_id_mode !== undefined) patch.sip_caller_id_mode = b.sip_caller_id_mode || 'company_main'
    if (b.sip_vault_bridge_prefix !== undefined) patch.sip_vault_bridge_prefix = b.sip_vault_bridge_prefix
    if (b.sip_ws_token_ttl_s !== undefined) patch.sip_ws_token_ttl_s = b.sip_ws_token_ttl_s
    if (b.sip_turn_ttl_s !== undefined) patch.sip_turn_ttl_s = b.sip_turn_ttl_s
    if (b.sip_turn_region !== undefined) patch.sip_turn_region = b.sip_turn_region || 'UAE / Dubai (me-central-1)'
    if (b.sip_ice_transport_policy !== undefined) patch.sip_ice_transport_policy = b.sip_ice_transport_policy

    if (b.sip_turn_urls !== undefined) {
      const rawLines = b.sip_turn_urls
        .split(/[\r\n,]+/)
        .map(s => s.trim())
        .filter(Boolean)
      for (const u of rawLines) {
        if (!/^turns?:[^\s]+$/i.test(u)) {
          throw bad(`Invalid TURN URL "${u}". Must begin with turn: or turns:`)
        }
      }
      patch.sip_turn_urls = rawLines.join('\n')
    }

    if (b.sip_ice_servers !== undefined) {
      const rawArr = typeof b.sip_ice_servers === 'string' ? safeJson<unknown>(b.sip_ice_servers, null) : b.sip_ice_servers
      if (!Array.isArray(rawArr)) throw bad('sip_ice_servers must be a JSON array of ICE server objects')
      const validated = z.array(iceServerSchema).parse(rawArr)
      patch.sip_ice_servers = JSON.stringify(validated)
    }

    let generatedSecret: string | undefined
    const existingSecret = String(getSetting('sip_webhook_secret') || '').trim()
    const explicitSecret = b.sip_webhook_secret && b.sip_webhook_secret !== '********' ? b.sip_webhook_secret : ''

    if (b.regenerate_secret) {
      generatedSecret = 'swk_sip_' + crypto.randomBytes(24).toString('hex')
      patch.sip_webhook_secret = generatedSecret
    } else if (explicitSecret) {
      if (explicitSecret.length < 8) throw bad('SIP webhook secret must be at least 8 characters')
      patch.sip_webhook_secret = explicitSecret
    } else if (b.sip_enabled === true && !existingSecret) {
      generatedSecret = 'swk_sip_' + crypto.randomBytes(24).toString('hex')
      patch.sip_webhook_secret = generatedSecret
    }

    let generatedTurnSecret: string | undefined
    const explicitTurnSecret = b.sip_turn_secret && b.sip_turn_secret !== '********' ? b.sip_turn_secret : ''
    if (b.regenerate_turn_secret) {
      generatedTurnSecret = crypto.randomBytes(32).toString('hex')
      patch.sip_turn_secret = generatedTurnSecret
    } else if (explicitTurnSecret) {
      if (explicitTurnSecret.length < 12) throw bad('TURN shared secret (coturn static-auth-secret) must be at least 12 characters')
      patch.sip_turn_secret = explicitTurnSecret
    }

    setSettings(patch)
    const auditSnapshot = { ...patch }
    if ('sip_webhook_secret' in auditSnapshot) auditSnapshot.sip_webhook_secret = '[redacted]'
    if ('sip_turn_secret' in auditSnapshot) auditSnapshot.sip_turn_secret = '[redacted]'
    audit(req.ctx, getDef('branches'), 0, 'sip_config', auditSnapshot, 'SIP trunk configuration')

    const nowSecretSet = Boolean(String(getSetting('sip_webhook_secret') || '').trim())
    const nowTurnSecretSet = Boolean(String(getSetting('sip_turn_secret') || '').trim())
    return {
      ok: true,
      sip_enabled: Boolean(getSetting('sip_enabled')),
      sip_ws_url: String(getSetting('sip_ws_url') || ''),
      sip_domain: String(getSetting('sip_domain') || ''),
      sip_outbound_proxy: String(getSetting('sip_outbound_proxy') || ''),
      sip_ice_servers: parseIceServers(getSetting('sip_ice_servers')),
      sip_caller_id_mode: String(getSetting('sip_caller_id_mode') || 'company_main'),
      sip_vault_bridge_prefix: String(getSetting('sip_vault_bridge_prefix') || ''),
      sip_webhook_secret: nowSecretSet ? '********' : '',
      sip_webhook_secret_set: nowSecretSet,
      sip_ws_token_ttl_s: getWsTokenTtlSeconds(),
      sip_turn_urls: String(getSetting('sip_turn_urls') || ''),
      sip_turn_secret: nowTurnSecretSet ? '********' : '',
      sip_turn_secret_set: nowTurnSecretSet,
      sip_turn_ttl_s: getTurnTtlSeconds(),
      sip_turn_region: String(getSetting('sip_turn_region') || 'UAE / Dubai (me-central-1)'),
      sip_ice_transport_policy: getIceTransportPolicy(),
      ...(generatedSecret ? { generated_webhook_secret: generatedSecret } : {}),
      ...(generatedTurnSecret ? { generated_turn_secret: generatedTurnSecret } : {}),
    }
  })

  app.get('/api/sip/admin/extensions', async (req) => {
    requireSipAdmin(req)
    const rows = q.all<any>(
      `SELECT s.id, s.user_id, s.extension_no, s.sip_username,
              CASE WHEN s.sip_password_enc <> '' THEN 1 ELSE 0 END AS has_password,
              s.display_name, s.allow_direct_dial, s.active, s.updated_at,
              u.name AS user_name, u.email AS user_email, COALESCE(u.designation, r.name, '') AS designation
       FROM sip_extensions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.deleted_at IS NULL AND u.party_id IS NULL
       ORDER BY s.extension_no ASC, u.name ASC`,
    ).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      user_name: r.user_name,
      user_email: r.user_email,
      designation: r.designation,
      extension_no: r.extension_no,
      sip_username: r.sip_username,
      sip_password: r.has_password ? '********' : '',
      has_password: Boolean(r.has_password),
      display_name: r.display_name || r.user_name,
      allow_direct_dial: Boolean(r.allow_direct_dial),
      active: Boolean(r.active),
      updated_at: r.updated_at,
    }))

    const staff = q.all<any>(
      `SELECT u.id, u.name, u.email, COALESCE(u.designation, r.name, '') AS designation, r.name AS role_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.deleted_at IS NULL AND u.active = 1 AND u.party_id IS NULL
       ORDER BY u.name ASC`,
    )

    return { rows, staff }
  })

  const upsertExtensionSchema = z.object({
    user_id: z.number().int().positive(),
    extension_no: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9_+*#-]+$/, 'Invalid extension number'),
    sip_username: z.string().trim().min(1).max(120),
    sip_password: z.string().max(200).optional(),
    display_name: z.string().trim().max(120).optional(),
    allow_direct_dial: z.boolean().optional(),
    active: z.boolean().optional(),
  })

  app.put('/api/sip/admin/extensions', async (req) => {
    requireSipAdmin(req)
    const b = upsertExtensionSchema.parse(req.body ?? {})

    const targetUser = q.get<{ id: number; name: string }>(
      `SELECT id, name FROM users WHERE id = ? AND deleted_at IS NULL AND party_id IS NULL`,
      b.user_id,
    )
    if (!targetUser) throw notFound('Staff user not found')

    const conflictExt = q.get<{ user_id: number }>(
      `SELECT user_id FROM sip_extensions WHERE extension_no = ? AND user_id <> ?`,
      b.extension_no,
      b.user_id,
    )
    if (conflictExt) throw conflict(`Extension ${b.extension_no} is already assigned to another staff member`)

    const existing = q.get<{ id: number; sip_password_enc: string }>(
      `SELECT id, sip_password_enc FROM sip_extensions WHERE user_id = ?`,
      b.user_id,
    )

    let passwordEnc = existing?.sip_password_enc ?? ''
    if (b.sip_password && b.sip_password !== '********') {
      passwordEnc = encryptSecret(b.sip_password)
    }

    const now = nowIso()
    const displayName = b.display_name || targetUser.name
    const allowDirect = b.allow_direct_dial ? 1 : 0
    const active = b.active === false ? 0 : 1

    q.run(
      `INSERT INTO sip_extensions (user_id, extension_no, sip_username, sip_password_enc, display_name, allow_direct_dial, active, updated_at)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET
         extension_no = excluded.extension_no,
         sip_username = excluded.sip_username,
         sip_password_enc = excluded.sip_password_enc,
         display_name = excluded.display_name,
         allow_direct_dial = excluded.allow_direct_dial,
         active = excluded.active,
         updated_at = excluded.updated_at`,
      b.user_id,
      b.extension_no,
      b.sip_username,
      passwordEnc,
      displayName,
      allowDirect,
      active,
      now,
    )

    if (!active) {
      revokeUserSipWsTokens(b.user_id)
    }

    audit(
      req.ctx,
      getDef('users'),
      b.user_id,
      'sip_extension_upsert',
      { extension_no: b.extension_no, allow_direct_dial: Boolean(allowDirect), active: Boolean(active) },
      `${targetUser.name} (Ext ${b.extension_no})`,
    )

    return {
      ok: true,
      extension: {
        user_id: b.user_id,
        extension_no: b.extension_no,
        sip_username: b.sip_username,
        has_password: Boolean(passwordEnc),
        display_name: displayName,
        allow_direct_dial: Boolean(allowDirect),
        active: Boolean(active),
        updated_at: now,
      },
    }
  })

  app.delete('/api/sip/admin/extensions/:userId', async (req) => {
    requireSipAdmin(req)
    const userId = idOf((req.params as any).userId)
    const res = q.run(`DELETE FROM sip_extensions WHERE user_id = ?`, userId)
    if (res.changes === 0) throw notFound('SIP extension not found')
    revokeUserSipWsTokens(userId)
    audit(req.ctx, getDef('users'), userId, 'sip_extension_delete', null, `User #${userId}`)
    return { ok: true, user_id: userId }
  })

  // =========================================================================
  // Public PBX-Authenticated Webhooks (Secret Redacted in Request Logger)
  // =========================================================================

  const pbxGate = { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } }

  /**
   * Called by the SIP WebSocket gateway (Kamailio / Asterisk / FreeSWITCH / OpenSIPS)
   * on WSS upgrade or SIP REGISTER to authenticate the short-lived session token
   * without ever exposing static extension passwords to the browser.
   */
  app.post('/api/public/sip/:secret/verify-ws-token', pbxGate, async (req) => {
    requirePbxSecret(req)
    const b = z
      .object({
        token: z.string().trim().min(10).max(1200).optional(),
        authorization: z.string().trim().min(10).max(1200).optional(),
      })
      .parse(req.body ?? {})
    const raw = b.token || b.authorization || String(req.headers.authorization || '')
    if (!raw) throw bad('Missing SIP WebSocket session token')
    const verified = verifySipWsSessionToken(raw)
    return {
      ok: true,
      valid: true,
      ...verified,
    }
  })

  app.post('/api/public/sip/:secret/resolve-vault-token', pbxGate, async (req) => {
    requirePbxSecret(req)
    const b = z.object({ token: z.string().trim().min(4).max(160) }).parse(req.body ?? {})
    const tokenHash = sha256Hex(b.token)
    const now = nowIso()

    const consumed = tx(() => {
      const upd = q.run(
        `UPDATE sip_vault_call_tokens
         SET consumed_at = ?
         WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?`,
        now,
        tokenHash,
        now,
      )
      if (upd.changes !== 1) return null
      return (
        q.get<{ property_id: number; target_phone_enc: string }>(
          `SELECT property_id, target_phone_enc FROM sip_vault_call_tokens WHERE token_hash = ?`,
          tokenHash,
        ) ?? null
      )
    })

    if (!consumed) {
      throw notFound('Vault call token not found, expired, or already consumed')
    }

    const destinationE164 = decryptSecret(consumed.target_phone_enc)
    if (!destinationE164) {
      throw notFound('Vault destination phone could not be decrypted')
    }

    return {
      ok: true,
      destination_e164: destinationE164,
      property_id: consumed.property_id,
    }
  })

  app.post('/api/public/sip/:secret/incoming-wake', pbxGate, async (req) => {
    requirePbxSecret(req)
    const b = z
      .object({
        extension_no: z.string().trim().min(1).max(32),
        caller_id: z.string().trim().max(80).optional(),
        caller_name: z.string().trim().max(160).optional(),
        call_id: z.string().trim().max(120).optional(),
      })
      .parse(req.body ?? {})

    const ext = q.get<{ user_id: number; extension_no: string; display_name: string | null }>(
      `SELECT s.user_id, s.extension_no, s.display_name
       FROM sip_extensions s
       JOIN users u ON u.id = s.user_id
       WHERE s.extension_no = ? AND s.active = 1 AND u.active = 1 AND u.deleted_at IS NULL AND u.party_id IS NULL
       LIMIT 1`,
      b.extension_no,
    )
    if (!ext) throw notFound('Active SIP extension not found')

    const callId = b.call_id || `wake-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    const callerLabel = b.caller_name || b.caller_id || 'Unknown Caller'
    const body =
      b.caller_name && b.caller_id
        ? `${b.caller_name} (${b.caller_id}) · Ext ${ext.extension_no}`
        : `${callerLabel} · Ext ${ext.extension_no}`

    liveBus.emit(`sip:${liveScope()}:${ext.user_id}`, {
      type: 'incoming_wake',
      extension_no: ext.extension_no,
      call_id: callId,
      caller_id: b.caller_id || '',
      caller_name: b.caller_name || '',
      at: nowIso(),
    })

    const push = await dispatchPushToUser(ext.user_id, {
      title: 'Incoming SIP Call',
      body,
      url: '/phone?incoming=1',
      tag: 'swk-sip-' + callId,
      channel: 'swk_calls_sos',
      data: {
        type: 'incoming_call',
        call_id: callId,
        caller_id: b.caller_id || '',
        caller_name: b.caller_name || '',
      },
    })

    return {
      ok: true,
      user_id: ext.user_id,
      extension_no: ext.extension_no,
      call_id: callId,
      push,
    }
  })
}
