import net from 'node:net'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { q } from '../db'
import { forbidden, nowIso } from '../util'
import { dispatchPushToUser, getVapidPublicKey } from '../integrations/push'

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = parts as [number, number, number, number]
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a >= 224) return true
  return false
}

function isPrivateOrReservedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0]!
  if (!lower) return true
  if (lower === '::' || lower === '::1') return true
  if (lower.startsWith('::ffff:')) {
    const rest = lower.slice(7)
    if (net.isIPv4(rest)) return isPrivateOrReservedIpv4(rest)
    const parts = rest.split(':')
    if (parts.length === 2) {
      const hi = parseInt(parts[0]!, 16)
      const lo = parseInt(parts[1]!, 16)
      if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
        return isPrivateOrReservedIpv4(`${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`)
      }
    }
    return true
  }
  const firstHex = parseInt(lower.split(':')[0] || '0', 16)
  if (Number.isNaN(firstHex)) return true
  // fe80::/10 link-local, fc00::/7 unique local, ff00::/8 multicast
  if ((firstHex & 0xffc0) === 0xfe80) return true
  if ((firstHex & 0xfe00) === 0xfc00) return true
  if ((firstHex & 0xff00) === 0xff00) return true
  return false
}

export function isSafePushEndpoint(rawUrl: string): boolean {
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  if (u.username || u.password) return false
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (!host) return false
  if (
    host === 'localhost' ||
    host === 'ip6-localhost' ||
    host === 'broadcasthost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return false
  }
  const ipKind = net.isIP(host)
  if (ipKind === 4) return !isPrivateOrReservedIpv4(host)
  if (ipKind === 6) return !isPrivateOrReservedIpv6(host)
  if (!host.includes('.')) return false
  return true
}

const webPushSchema = z.object({
  channel: z.literal('web_push'),
  endpoint: z
    .string()
    .trim()
    .url()
    .max(2048)
    .refine(isSafePushEndpoint, 'Push endpoint must be a public https:// URL'),
  keys: z.object({
    p256dh: z.string().trim().min(10).max(512),
    auth: z.string().trim().min(6).max(256),
  }),
  device_id: z.string().trim().min(2).max(80).optional(),
})

const nativePushSchema = z.object({
  channel: z.enum(['fcm', 'apns', 'apns_voip']),
  token: z.string().trim().min(6).max(4096),
  device_id: z.string().trim().min(2).max(80).optional(),
})

const subscribeSchema = z.union([webPushSchema, nativePushSchema])

export default async function (app: FastifyInstance) {
  const staffOnly = (req: FastifyRequest) => {
    if (!req.user || req.user.party_id) throw forbidden('Staff only')
    return req.user.id as number
  }

  app.get('/api/push/vapid-key', async (req) => {
    staffOnly(req)
    return { publicKey: getVapidPublicKey(), enabled: true }
  })

  app.post('/api/push/subscribe', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const uid = staffOnly(req)
    const b = subscribeSchema.parse(req.body ?? {})
    const now = nowIso()
    const ua = String(req.headers['user-agent'] || '').slice(0, 200) || null
    const deviceId = req.sessionDeviceId ?? b.device_id ?? null

    const endpointOrToken = b.channel === 'web_push' ? b.endpoint : b.token
    const p256dh = b.channel === 'web_push' ? b.keys.p256dh : null
    const authSecret = b.channel === 'web_push' ? b.keys.auth : null

    q.run(
      `INSERT INTO push_subscriptions(user_id, device_id, channel, endpoint_or_token, p256dh, auth_secret, user_agent, active, created_at, last_used_at)
       VALUES (?,?,?,?,?,?,?,1,?,?)
       ON CONFLICT(endpoint_or_token) DO UPDATE SET
         user_id = excluded.user_id,
         device_id = COALESCE(excluded.device_id, push_subscriptions.device_id),
         channel = excluded.channel,
         p256dh = excluded.p256dh,
         auth_secret = excluded.auth_secret,
         user_agent = excluded.user_agent,
         active = 1,
         last_used_at = excluded.last_used_at`,
      uid,
      deviceId,
      b.channel,
      endpointOrToken,
      p256dh,
      authSecret,
      ua,
      now,
      now,
    )

    return { ok: true, channel: b.channel }
  })

  app.delete('/api/push/unsubscribe', async (req) => {
    const uid = staffOnly(req)
    const body = (req.body ?? {}) as Record<string, unknown>
    const query = (req.query ?? {}) as Record<string, unknown>
    const parsed = z
      .object({
        endpoint: z.string().trim().min(4).max(4096).optional(),
        token: z.string().trim().min(4).max(4096).optional(),
        endpoint_or_token: z.string().trim().min(4).max(4096).optional(),
      })
      .parse({
        endpoint: body.endpoint ?? query.endpoint,
        token: body.token ?? query.token,
        endpoint_or_token: body.endpoint_or_token ?? query.endpoint_or_token,
      })

    const target = parsed.endpoint ?? parsed.token ?? parsed.endpoint_or_token
    if (!target) {
      const r = req.sessionDeviceId
        ? q.run(`UPDATE push_subscriptions SET active = 0 WHERE user_id = ? AND device_id = ?`, uid, req.sessionDeviceId)
        : null
      return { ok: true, deactivated: Number(r?.changes ?? 0) }
    }

    const r = q.run(
      `UPDATE push_subscriptions SET active = 0 WHERE user_id = ? AND endpoint_or_token = ?`,
      uid,
      target,
    )
    return { ok: true, deactivated: Number(r?.changes ?? 0) }
  })

  app.post('/api/push/test', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const uid = staffOnly(req)
    const result = await dispatchPushToUser(uid, {
      title: 'SWK OS Test Notification',
      body: 'Real-time push notifications are active on this device.',
      url: '/chat',
      tag: 'swk-push-test',
      channel: 'swk_ops_alerts',
    })
    return { ok: true, ...result }
  })
}
