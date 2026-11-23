/**
 * Client listing links: staff pick one or more inventory records and get a public link (/l/<token>) that shows
 * them as a branded listing page. Only client-safe fields leave the OS: no owner, tenant, internal notes,
 * commission or permit internals. Links expire, can be revoked, count views, and enquiries become leads.
 */
import type { FastifyInstance } from 'fastify'
import crypto from 'node:crypto'
import { z } from 'zod'
import { q } from '../db'
import { bad,HttpError,nowIso,safeJson } from '../util'
import { getDef,getRecord } from '../engine'
import { need } from './helpers'
import { ingestLead } from './integrations'
import { notify } from '../notify'
import { websiteImage } from '../../shared/entities/website'
import { hardcodedAccountFor } from '../../shared/swk-staff-access'
import { teamProfileByEmail } from '../../shared/swk-team-profiles'

export const SHAREABLE = ['properties', 'units', 'website_listings'] as const
type Item = { title: string; subtitle?: string; purpose: string; status?: string; type?: string; location?: string; developer?: string; price?: number; price_label: string; beds?: number | null; baths?: number | null; area?: number | null; furnishing?: string; completion?: string; payment_plan?: string; description: string[]; features: string[]; images: string[]; reference?: string; floor_plan?: string; tour?: string }

const lines = (v: unknown) => String(v ?? '').split(/\r?\n|•/).map(s => s.trim()).filter(Boolean)
const aed = (n?: number | null) => (n ? `AED ${Math.round(n).toLocaleString('en-US')}` : '')
const mediaUrls = (m: unknown) => (safeJson<any[]>(m as string, []) ?? []).map(x => (typeof x === 'string' ? x : x?.url)).filter((u: unknown): u is string => typeof u === 'string' && /^https:\/\//.test(u))

function toItem(entity: string, r: any): Item {
  if (entity === 'website_listings') {
    const base = safeJson<any>(r.payload, {}) ?? {}
    const imgs = [r.image_url, ...(base.images ?? [])].filter(Boolean).map((i: string) => websiteImage(i))
    return { title: r.title, subtitle: r.subtitle, purpose: r.purpose === 'rent' ? 'For rent' : r.purpose === 'off-plan' ? 'Off-plan' : 'For sale', status: r.status, type: r.property_type, location: [r.building, r.community].filter(Boolean).join(', '), developer: r.developer, price: r.price_aed, price_label: r.purpose === 'rent' ? `${aed(r.price_aed)} / year` : aed(r.price_aed), beds: r.bedrooms, baths: r.bathrooms, area: r.area_sqft, furnishing: r.furnished, completion: r.completion, payment_plan: r.payment_plan, description: lines(r.description), features: lines(r.features), images: [...new Set(imgs)].slice(0, 12), reference: r.reference }
  }
  if (entity === 'units') {
    const prop = r.property_id ? q.get<any>(`SELECT title, media, sub_community, building_name, address FROM properties WHERE id = ? AND deleted_at IS NULL`, r.property_id) : null
    const rent = r.rent_annual && !r.sale_price
    return { title: `${r.unit_type ?? 'Unit'} ${r.unit_no ?? ''}${prop ? ` · ${prop.title}` : ''}`.trim(), purpose: rent ? 'For rent' : 'For sale', status: r.status, type: r.unit_type, location: prop ? [prop.building_name, prop.sub_community].filter(Boolean).join(', ') : '', price: r.sale_price || r.rent_annual, price_label: rent ? `${aed(r.rent_annual)} / year` : aed(r.sale_price), beds: r.bedrooms, baths: r.bathrooms, area: r.area_sqft, furnishing: r.furnishing, description: [r.view ? `View: ${r.view}` : '', r.floor_no ? `Floor ${r.floor_no}` : ''].filter(Boolean), features: [r.has_balcony && 'Balcony', r.has_maid_room && "Maid's room", r.has_study && 'Study', r.is_corner && 'Corner unit', r.parking_slots && `Parking: ${r.parking_slots}`].filter(Boolean) as string[], images: prop ? mediaUrls(prop.media) : [], floor_plan: r.floor_plan_url || undefined, tour: r.virtual_tour_url || undefined }
  }
  const rent = r.department_division === 'Leasing' || (!r.price && r.rent_annual)
  return { title: r.title, purpose: r.is_off_plan ? 'Off-plan' : rent ? 'For rent' : 'For sale', status: r.status, type: r.property_type, location: [r.building_name, r.sub_community, r._labels?.community_ref].filter(Boolean).join(', '), developer: r._labels?.developer_ref, price: rent ? r.rent_annual : r.price, price_label: rent ? `${aed(r.rent_annual)} / year` : aed(r.price), beds: r.bedrooms, baths: r.bathrooms, area: r.area_sqft, furnishing: r.furnishing, completion: r.completion_year ? String(r.completion_year) : undefined, payment_plan: r.payment_plan, description: lines(r.description), features: [...lines(r.features), ...lines(r.amenities)].slice(0, 16), images: mediaUrls(r.media), reference: r.property_no }
}

export default async function (app: FastifyInstance) {
  app.post('/api/share-links', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const b = z.object({ entity: z.enum(SHAREABLE), ids: z.array(z.number().int().positive()).min(1).max(30), title: z.string().trim().max(120).optional(), client_name: z.string().trim().max(120).optional(), expires_days: z.number().int().min(1).max(180).default(30) }).parse(req.body ?? {})
    const def = getDef(b.entity)
    need(req, def.module, 'view')
    for (const id of b.ids) getRecord(def, id, req.ctx) // enforces the sharer's own record visibility
    const token = crypto.randomBytes(18).toString('base64url')
    const expires = new Date(Date.now() + b.expires_days * 864e5).toISOString()
    q.run(`INSERT INTO share_links (token, entity, ref_ids, title, client_name, created_by, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?)`, token, b.entity, JSON.stringify([...new Set(b.ids)]), b.title || null, b.client_name || null, req.user!.id, nowIso(), expires)
    return { token, path: `/l/${token}`, expires_at: expires }
  })
  app.get('/api/share-links', async (req) => {
    if (!req.user || req.user.party_id) throw new HttpError(403, 'Staff only')
    return q.all(`SELECT id, token, entity, ref_ids, title, client_name, created_at, expires_at, revoked_at, views, last_viewed_at FROM share_links WHERE created_by = ? ORDER BY id DESC LIMIT 200`, req.user.id)
  })
  app.delete('/api/share-links/:id', async (req) => {
    if (!req.user || req.user.party_id) throw new HttpError(403, 'Staff only')
    q.run(`UPDATE share_links SET revoked_at = ? WHERE id = ? AND created_by = ?`, nowIso(), Number((req.params as any).id), req.user.id)
    return { ok: true }
  })

  const load = (token: string) => {
    const l = q.get<any>(`SELECT * FROM share_links WHERE token = ?`, token)
    if (!l || l.revoked_at || (l.expires_at && l.expires_at < nowIso())) throw new HttpError(404, 'This listing link has expired. Ask your SWK consultant for a new one.')
    return l
  }
  app.get('/api/public/share/:token', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req, reply) => {
    reply.header('cache-control', 'no-store')
    const l = load(String((req.params as any).token))
    const def = getDef(l.entity)
    const items = (safeJson<number[]>(l.ref_ids, []) ?? []).map(id => q.get<any>(`SELECT * FROM "${l.entity}" WHERE id = ? AND deleted_at IS NULL`, id)).filter(Boolean)
      .map(r => { try { return toItem(l.entity, getRecord(def, r.id, { user: null, system: true })) } catch { return null } }).filter(Boolean)
    q.run(`UPDATE share_links SET views = views + 1, last_viewed_at = ? WHERE id = ?`, nowIso(), l.id)
    const u = q.get<any>(`SELECT name, email, phone, work_phone, designation FROM users WHERE id = ?`, l.created_by)
    const acc = hardcodedAccountFor(u?.email), web = teamProfileByEmail(acc?.email ?? u?.email)
    return {
      title: l.title, client_name: l.client_name, expires_at: l.expires_at, items,
      agent: u ? { name: u.name, title: web?.title || u.designation || 'Property Consultant', phone: u.work_phone || '+971 56 433 0448', email: u.email, photo: web?.photo ?? null } : null,
      company: { name: 'SWK Properties LLC', orn: '51517', address: '25th Floor, Al Saqr Building, Sheikh Zayed Road, Dubai, UAE', phone: '+971 56 433 0448', website: 'https://www.swkpropertiesuae.com' },
    }
  })
  app.post('/api/public/share/:token/enquiry', { config: { rateLimit: { max: 6, timeWindow: '10 minutes' } } }, async (req) => {
    const l = load(String((req.params as any).token))
    const b = z.object({ name: z.string().trim().min(2).max(120), phone: z.string().trim().min(6).max(30), email: z.string().trim().email().max(200).optional().or(z.literal('')), message: z.string().trim().max(2000).optional(), item: z.string().trim().max(200).optional(), consent: z.boolean().optional() }).parse(req.body ?? {})
    if (!/^\+?[\d\s()-]{6,}$/.test(b.phone)) throw bad('Enter a valid phone number')
    const r = ingestLead({ name: b.name, phone: b.phone, email: b.email || undefined, message: `Enquiry from shared listing link${l.client_name ? ` (${l.client_name})` : ''}${b.item ? ` about: ${b.item}` : ''}\n${b.message ?? ''}`.trim(), source: 'Website', consent: b.consent })
    notify(l.created_by, `New enquiry from your listing link: ${b.name}`, b.item ?? l.title ?? '', `/e/leads/${r.lead_id}`, 'info')
    return { ok: true }
  })
}
