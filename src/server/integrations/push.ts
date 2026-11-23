import crypto from 'node:crypto'
import { generateVAPIDKeys, sendNotification } from 'web-push'
import { q, currentDb, inDemo } from '../db'
import { getSetting, setSettings } from '../settings'
import { nowIso } from '../util'

export type PushChannel = 'swk_messages' | 'swk_ops_alerts' | 'swk_calls_sos'

export type PushPayload = {
  title: string
  body: string
  url: string
  tag: string
  channel: PushChannel
  threadId?: number
  silent?: boolean
}

export interface PushSubscriptionRow {
  id: number
  user_id: number
  device_id: string | null
  channel: string
  endpoint_or_token: string
  p256dh: string | null
  auth_secret: string | null
}

export type PushTransportForTests = {
  sendWebPush?: (
    sub: PushSubscriptionRow,
    payloadJson: string,
    vapid: { subject: string; publicKey: string; privateKey: string },
  ) => Promise<void>
  sendFcm?: (
    sub: PushSubscriptionRow,
    fcmMessage: Record<string, any>,
    payload: PushPayload,
  ) => Promise<void>
  sendApns?: (sub: PushSubscriptionRow, payload: PushPayload) => Promise<void>
} | null

interface FcmServiceAccount {
  project_id: string
  client_email: string
  private_key: string
}

const ACTIVE_THREAD_TTL_MS = 90_000
const activeThreadsByDb = new WeakMap<object, Map<number, { threadId: number; expiresAt: number }>>()

function activeThreadsMap(): Map<number, { threadId: number; expiresAt: number }> {
  const db = currentDb()
  let map = activeThreadsByDb.get(db)
  if (!map) {
    map = new Map()
    activeThreadsByDb.set(db, map)
  }
  return map
}

let testTransport: PushTransportForTests = null
export function setPushTransportForTests(transport: PushTransportForTests): void {
  testTransport = transport
}

const fcmTokenCache = new Map<string, { token: string; expiresAt: number }>()

/** Mark which thread a user currently has open in the foreground (auto-expires after 90s). */
export function setActiveChatThread(userId: number, threadId: number | null): void {
  const map = activeThreadsMap()
  if (!threadId || threadId <= 0) {
    map.delete(userId)
    return
  }
  map.set(userId, { threadId, expiresAt: Date.now() + ACTIVE_THREAD_TTL_MS })
}

export function isThreadActiveForUser(userId: number, threadId: number): boolean {
  const map = activeThreadsMap()
  const entry = map.get(userId)
  if (!entry) return false
  if (Date.now() > entry.expiresAt) {
    map.delete(userId)
    return false
  }
  return entry.threadId === threadId
}

/** Auto-generate and store an encrypted VAPID keypair on first demand. */
export function getVapidKeys(): { publicKey: string; privateKey: string } {
  let publicKey = String(getSetting('vapid_public_key') || '').trim()
  let privateKey = String(getSetting('vapid_private_key') || '').trim()
  if (!publicKey || !privateKey) {
    const generated = generateVAPIDKeys()
    publicKey = generated.publicKey
    privateKey = generated.privateKey
    setSettings({ vapid_public_key: publicKey, vapid_private_key: privateKey })
  }
  return { publicKey, privateKey }
}

export function getVapidPublicKey(): string {
  return getVapidKeys().publicKey
}

function vapidSubject(): string {
  const raw = String(getSetting('company_email') || 'ops@swkpropertiesuae.com').trim()
  if (/^(mailto:|https:\/\/)/i.test(raw)) return raw
  return `mailto:${raw || 'ops@swkpropertiesuae.com'}`
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

export function buildFcmJwtAssertion(
  sa: Pick<FcmServiceAccount, 'client_email' | 'private_key'>,
  nowSec = Math.floor(Date.now() / 1000),
): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  )
  const unsigned = `${header}.${claims}`
  const pem = sa.private_key.replace(/\\n/g, '\n')
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  const signature = signer.sign(pem).toString('base64url')
  return `${unsigned}.${signature}`
}

function parseFcmServiceAccount(): FcmServiceAccount | null {
  const raw = String(getSetting('fcm_service_account_json') || process.env.FCM_SERVICE_ACCOUNT_JSON || '').trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed.project_id === 'string' &&
      typeof parsed.client_email === 'string' &&
      typeof parsed.private_key === 'string' &&
      parsed.project_id &&
      parsed.client_email &&
      parsed.private_key
    ) {
      return {
        project_id: parsed.project_id,
        client_email: parsed.client_email,
        private_key: parsed.private_key,
      }
    }
  } catch {
    /* invalid JSON */
  }
  return null
}

async function getFcmAccessToken(sa: FcmServiceAccount): Promise<string | null> {
  const cacheKey = `${sa.project_id}:${sa.client_email}`
  const cached = fcmTokenCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token
  const assertion = buildFcmJwtAssertion(sa)
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) return null
  const json = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null
  if (!json?.access_token) return null
  const ttlMs = Math.max(120, Number(json.expires_in) || 3600) * 1000
  fcmTokenCache.set(cacheKey, { token: json.access_token, expiresAt: Date.now() + ttlMs })
  return json.access_token
}

export function buildFcmMessage(token: string, payload: PushPayload): Record<string, any> {
  return {
    message: {
      token,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: {
        url: payload.url,
        tag: payload.tag,
        channel: payload.channel,
        ...(payload.threadId !== undefined ? { threadId: String(payload.threadId) } : {}),
      },
      android: {
        priority: 'HIGH',
        notification: {
          channel_id: payload.channel,
          tag: payload.tag,
          sound: payload.channel === 'swk_calls_sos' ? 'sos_ring' : 'default',
        },
      },
      apns: {
        headers: {
          'apns-priority': '10',
        },
        payload: {
          aps: {
            sound: 'default',
            'thread-id': payload.tag,
          },
        },
      },
    },
  }
}

function isGoneError(err: any): boolean {
  const status = Number(err?.statusCode ?? err?.status ?? 0)
  return status === 404 || status === 410
}

function maskPayloadForPrivacy(payload: PushPayload): PushPayload {
  if (!getSetting('push_hide_preview_global')) return payload
  return {
    ...payload,
    body: payload.channel === 'swk_messages' ? 'New message in SWK Inside' : 'New SWK OS notification',
  }
}

async function sendOneWebPush(sub: PushSubscriptionRow, payload: PushPayload): Promise<void> {
  if (!sub.p256dh || !sub.auth_secret) {
    throw Object.assign(new Error('Missing Web Push keys'), { statusCode: 410 })
  }
  const vapid = getVapidKeys()
  const subject = vapidSubject()
  const wirePayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag,
    channel: payload.channel,
    threadId: payload.threadId,
  })
  if (testTransport?.sendWebPush) {
    await testTransport.sendWebPush(sub, wirePayload, { subject, ...vapid })
    return
  }
  await sendNotification(
    {
      endpoint: sub.endpoint_or_token,
      keys: { p256dh: sub.p256dh, auth: sub.auth_secret },
    },
    wirePayload,
    {
      vapidDetails: { subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      TTL: 60 * 60 * 12,
      urgency: payload.channel === 'swk_calls_sos' ? 'high' : 'normal',
    },
  )
}

async function sendOneFcm(sub: PushSubscriptionRow, payload: PushPayload): Promise<void> {
  const fcmMessage = buildFcmMessage(sub.endpoint_or_token, payload)
  if (testTransport?.sendFcm) {
    await testTransport.sendFcm(sub, fcmMessage, payload)
    return
  }
  const sa = parseFcmServiceAccount()
  if (!sa) throw new Error('FCM service account not configured')
  const accessToken = await getFcmAccessToken(sa)
  if (!accessToken) throw new Error('Failed to obtain FCM OAuth2 access token')
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(fcmMessage),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    const isUnregistered = res.status === 404 || res.status === 410 || /UNREGISTERED|NOT_FOUND/i.test(errText)
    throw Object.assign(new Error(`FCM send failed (${res.status}): ${errText}`), {
      statusCode: isUnregistered ? 410 : res.status,
    })
  }
}

export async function dispatchPushToUser(
  userId: number,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  if (inDemo()) return { sent: 0, failed: 0 }
  if (!userId || userId <= 0 || payload.silent) return { sent: 0, failed: 0 }
  if (payload.threadId && isThreadActiveForUser(userId, payload.threadId)) {
    return { sent: 0, failed: 0 }
  }

  let subs: PushSubscriptionRow[] = []
  try {
    const u = q.get<{ id: number; party_id: number | null; active: number; deleted_at: string | null }>(
      `SELECT id, party_id, active, deleted_at FROM users WHERE id = ?`,
      userId,
    )
    if (!u || !u.active || u.deleted_at || u.party_id) return { sent: 0, failed: 0 }
    subs = q.all<PushSubscriptionRow>(
      `SELECT id, user_id, device_id, channel, endpoint_or_token, p256dh, auth_secret
       FROM push_subscriptions
       WHERE user_id = ? AND active = 1`,
      userId,
    )
  } catch {
    return { sent: 0, failed: 0 }
  }

  if (!subs.length) return { sent: 0, failed: 0 }

  const effective = maskPayloadForPrivacy(payload)
  let sent = 0
  let failed = 0

  for (const sub of subs) {
    try {
      if (sub.device_id) {
        const dev = q.get<{ status: string; revoked_at: string | null }>(
          `SELECT status, revoked_at FROM staff_devices WHERE user_id = ? AND device_id = ?`,
          userId,
          sub.device_id,
        )
        if (dev && (dev.status === 'Blocked' || !!dev.revoked_at)) {
          q.run(`UPDATE push_subscriptions SET active = 0 WHERE id = ?`, sub.id)
          continue
        }
      }

      if (sub.channel === 'web_push') {
        await sendOneWebPush(sub, effective)
      } else if (sub.channel === 'fcm') {
        await sendOneFcm(sub, effective)
      } else if (sub.channel === 'apns' && testTransport?.sendApns) {
        await testTransport.sendApns(sub, effective)
      } else {
        failed++
        continue
      }
      q.run(`UPDATE push_subscriptions SET last_used_at = ? WHERE id = ?`, nowIso(), sub.id)
      sent++
    } catch (err) {
      failed++
      if (isGoneError(err)) {
        try {
          q.run(`UPDATE push_subscriptions SET active = 0 WHERE id = ?`, sub.id)
        } catch {
          /* ignore */
        }
      }
    }
  }

  return { sent, failed }
}
