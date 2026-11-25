import type { FastifyInstance } from 'fastify'
import crypto from 'node:crypto'
import { z } from 'zod'
import { config } from '../config'
import { getSetting } from '../settings'
import { audit, can, getDef } from '../engine'
import { forbidden } from '../util'
import { need } from './helpers'
import { ingestLead } from './integrations'
import { PORTALS, isPortal, portalListings, portalXml, portalFeedToken, feedTokenMatches, portalEnquiry } from '../domain/portals'

const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y) }

export default async function portalRoutes(app: FastifyInstance) {
  // Portal crawlers fetch the feed a few times an hour; the token in the path is the only credential.
  app.get('/api/public/portal-feed/:token/:file', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { token, file } = req.params as { token: string; file: string }
    const portal = String(file).replace(/\.xml$/i, '').toLowerCase()
    if (!isPortal(portal) || !feedTokenMatches(token)) return reply.status(404).send({ error: 'Not found' })
    reply.header('cache-control', 'no-store').type('application/xml; charset=utf-8')
    return portalXml(portal)
  })

  // Enquiries pushed by a portal (or a forwarder such as Zapier/Make) land in the CRM, deduplicated and routed like every other lead.
  app.post('/api/public/portal-lead/:portal/:secret', { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { portal, secret } = req.params as { portal: string; secret: string }
    const expected = String(getSetting('lead_webhook_secret') || '')
    if (!isPortal(portal) || !expected || !same(expected, String(secret))) return reply.status(404).send({ error: 'Not found' })
    const b = z.object({
      external_id: z.string().max(120).optional(), name: z.string().max(120).optional(), email: z.string().email().max(160).optional().catch(undefined),
      phone: z.string().max(40).optional(), message: z.string().max(2000).optional(), source: z.string().max(60), department_division: z.string().max(60).optional(), owner_id: z.number().int().positive().optional(),
    }).refine(v => v.email || v.phone, 'Send an email or a phone number').parse(portalEnquiry(portal, req.body ?? {}))
    const r = ingestLead(b)
    if (r.duplicate) return { ok: true, lead_id: r.lead_id, duplicate_delivery: true }
    return reply.status(r.created ? 201 : 200).send({ ok: true, lead_id: r.lead_id, new_lead: r.created })
  })

  // What each portal receives, what is blocked and why. Feed URLs (which carry the token) are shown only to people who can edit properties.
  app.get('/api/portals/feeds', async (req) => {
    need(req, 'properties', 'view')
    const canEdit = !!req.user && !req.user.party_id && can(req.user, 'properties', 'edit')
    const base = String(config.baseUrl || '').replace(/\/+$/, '')
    const token = canEdit ? portalFeedToken() : null
    const portals = (Object.keys(PORTALS) as (keyof typeof PORTALS)[]).map(key => {
      const { eligible, blocked } = portalListings(key)
      return {
        key, name: PORTALS[key].label, live: eligible.length, blocked: blocked.length, blocked_listings: blocked,
        avg_quality: eligible.length ? Math.round(eligible.reduce((a, l) => a + l.quality, 0) / eligible.length) : null,
        low_quality: eligible.filter(l => l.quality < 70).map(l => ({ id: l.id, ref: l.ref, title: l.title, quality: l.quality, missing: l.quality_missing })),
        feed_url: token ? `${base}/api/public/portal-feed/${token}/${key}.xml` : null,
        lead_webhook: canEdit && getSetting('lead_webhook_secret') ? `${base}/api/public/portal-lead/${key}/<lead webhook secret>` : null,
      }
    })
    return { portals, note: 'Confirm the XML tags with each portal account manager before submitting the feed URL. Listings without a valid Trakheesi permit are never included.' }
  })

  app.post('/api/portals/feeds/rotate', async (req) => {
    need(req, 'properties', 'edit')
    if (!req.user || req.user.party_id) throw forbidden()
    portalFeedToken(true)
    audit(req.ctx, getDef('properties'), 0, 'portal_feed_token_rotated', { portal_feed_token: ['********', 'rotated'] }, 'Portal feeds')
    return { ok: true }
  })
}
