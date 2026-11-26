/**
 * Client listing links: staff pick one or more inventory records and get a public link (/l/<token>) that shows
 * them as a world-class branded SWK luxury brochure. Every shared image is STRICTLY watermarked server-side
 * with BOTH the SWK App Icon and SWK Logo. Only client-safe fields leave the OS: no owner, tenant, internal notes,
 * commission or permit internals. Links expire, can be revoked, count views, and enquiries become leads.
 */
import type { FastifyInstance } from 'fastify'
import crypto from 'node:crypto'
import { z } from 'zod'
import { q } from '../db'
import { bad, HttpError, nowIso, safeJson } from '../util'
import { getDef, getRecord } from '../engine'
import { need } from './helpers'
import { ingestLead } from './integrations'
import { notify } from '../notify'
import { websiteImage } from '../../shared/entities/website'
import { hardcodedAccountFor } from '../../shared/swk-staff-access'
import { teamProfileByEmail } from '../../shared/swk-team-profiles'
import { watermarkPropertyImage } from '../domain/watermark'
import { sendStoredAttachment } from './files'
import { normalizeMediaList, type ProjectMediaKind } from '../../shared/media'

export const SHAREABLE = ['properties', 'units', 'website_listings'] as const

type SharedAssetRef = {
  kind: ProjectMediaKind
  title: string
  category?: string
  url: string
  attachmentId?: number
  mime?: string
}

const CURATED_DUBAI_GALLERY = [
  '/media/properties/marina-sky-penthouse-1.webp',
  '/media/properties/palm-garden-homes-1.webp',
  '/media/properties/hills-estate-golf-mansion-1.webp',
  '/media/properties/business-bay-executive-tower-2.webp',
  '/media/properties/creek-harbour-waterside-townhouse-1.webp',
  '/media/properties/jvc-boulevard-residences-2.webp',
  '/media/properties/arabian-ranches-courtyard-villa-2.webp',
  '/media/properties/villa-sanctuary-6.webp',
  '/media/properties/islands-2-1.webp',
  '/media/properties/river-cove-residences-1.webp',
  '/media/properties/golf-fields-1.webp',
] as const

type RawItem = {
  id: number
  title: string
  subtitle?: string
  purpose: string
  status?: string
  type?: string
  location?: string
  community?: string
  building_name?: string
  developer?: string
  price?: number
  price_label: string
  price_per_sqft?: number | null
  beds?: number | null
  baths?: number | null
  area?: number | null
  furnishing?: string
  tenure?: string
  completion?: string
  year_built?: number | null
  floor_no?: string | null
  parking_slots?: number | null
  view?: string | null
  payment_plan?: string
  rera_permit_no?: string | null
  roi_percent?: number | null
  is_off_plan?: boolean
  description: string[]
  features: string[]
  rawImages: string[]
  rawAssets: SharedAssetRef[]
  reference?: string
  floor_plan?: string
  tour?: string
  model_3d_url?: string
  brochure_url?: string
  video_url?: string
}

const lines = (v: unknown) => String(v ?? '').split(/\r?\n|•|,/).map(s => s.trim()).filter(Boolean)
const aed = (n?: number | null) => (n ? `AED ${Math.round(n).toLocaleString('en-US')}` : '')

function attachmentIdFromUrl(url: string | null | undefined): number | undefined {
  if (!url) return undefined
  const m = /^\/api\/files\/(\d+)\/download(?:$|\?)/.exec(url.trim())
  return m?.[1] ? Number(m[1]) : undefined
}

function extractMediaBundle(
  mediaRaw: unknown,
  extras: {
    video_url?: string | null
    virtual_tour_url?: string | null
    model_3d_url?: string | null
    floor_plan_url?: string | null
    brochure_url?: string | null
  },
) {
  const list = normalizeMediaList(mediaRaw)
  const photoUrls = list
    .filter(m => m.kind === 'photo')
    .sort((a, b) => Number(!!b.is_cover) - Number(!!a.is_cover) || a.order - b.order)
    .map(m => m.url)

  const rawAssets: SharedAssetRef[] = []
  const seen = new Set<string>()
  const pushAsset = (kind: ProjectMediaKind, url: string | null | undefined, title: string, category?: string, mime?: string, attId?: number) => {
    if (!url || !url.trim()) return
    const clean = url.trim()
    const key = `${kind}|${clean}`
    if (seen.has(key)) return
    seen.add(key)
    rawAssets.push({
      kind,
      title,
      category,
      url: clean,
      attachmentId: attId ?? attachmentIdFromUrl(clean),
      mime,
    })
  }

  for (const m of list) {
    if (m.kind === 'photo') continue
    pushAsset(m.kind, m.url, m.title || m.category || m.kind, m.category, m.mime, m.attachment_id)
  }
  pushAsset('video', extras.video_url, 'Official Project Video', 'Project Launch Film')
  pushAsset('tour3d', extras.virtual_tour_url, '360° / 3D Virtual Tour', '360° Virtual Tour')
  pushAsset('tour3d', extras.model_3d_url, 'Interactive 3D Model', 'Interactive 3D Model')
  pushAsset('floorplan', extras.floor_plan_url, 'Official Floor Plan', 'Floor Plan')
  pushAsset('brochure', extras.brochure_url, 'Developer Brochure', 'Official Brochure')

  return { photoUrls, rawAssets }
}

function fallbackImagesFor(seed: number, text: string, existing: string[]): string[] {
  const out = [...new Set(existing)]
  if (out.length >= 4) return out.slice(0, 12)
  const low = text.toLowerCase()
  const primary =
    low.includes('marina') ? '/media/properties/marina-sky-penthouse-1.webp'
    : low.includes('palm') ? '/media/properties/palm-garden-homes-1.webp'
    : low.includes('hills') ? '/media/properties/hills-estate-golf-mansion-1.webp'
    : low.includes('business bay') || low.includes('downtown') ? '/media/properties/business-bay-executive-tower-2.webp'
    : low.includes('creek') ? '/media/properties/creek-harbour-waterside-townhouse-1.webp'
    : low.includes('jvc') || low.includes('jvt') ? '/media/properties/jvc-boulevard-residences-2.webp'
    : low.includes('ranches') || low.includes('villa') ? '/media/properties/arabian-ranches-courtyard-villa-2.webp'
    : CURATED_DUBAI_GALLERY[Math.abs(seed) % CURATED_DUBAI_GALLERY.length]!
  if (!out.includes(primary)) out.push(primary)
  for (let i = 0; i < CURATED_DUBAI_GALLERY.length && out.length < 4; i++) {
    const pick = CURATED_DUBAI_GALLERY[(Math.abs(seed) + i + 1) % CURATED_DUBAI_GALLERY.length]!
    if (!out.includes(pick)) out.push(pick)
  }
  return out.slice(0, 12)
}

function toRawItem(entity: string, r: any): RawItem {
  if (entity === 'website_listings') {
    const base = safeJson<any>(r.payload, {}) ?? {}
    const bundle = extractMediaBundle(r.media, {
      video_url: r.video_url || base.video_url || base.videoUrl,
      virtual_tour_url: r.virtual_tour_url || base.virtual_tour_url || base.virtualTourUrl,
      model_3d_url: r.model_3d_url || base.model_3d_url || base.model3dUrl,
      floor_plan_url: r.floor_plan_url || base.floor_plan_url || base.floorPlanUrl,
      brochure_url: r.brochure_url || base.brochure_url || base.brochureUrl,
    })
    const imgs = [...bundle.photoUrls, r.image_url, ...(base.images ?? [])]
      .filter(Boolean)
      .map((i: string) => (i.startsWith('/api/files/') || i.startsWith('/media/') ? i : websiteImage(i)))
    const price = Number(r.price_aed || 0) || undefined
    const area = Number(r.area_sqft || 0) || null
    const ppsf = price && area ? Math.round(price / area) : null
    return {
      id: Number(r.id || 0),
      title: r.title,
      subtitle: r.subtitle,
      purpose: r.purpose === 'rent' ? 'For rent' : r.purpose === 'off-plan' ? 'Off-plan' : 'For sale',
      status: r.status,
      type: r.property_type || 'Residence',
      location: [r.building, r.community].filter(Boolean).join(', '),
      community: r.community || undefined,
      building_name: r.building || undefined,
      developer: r.developer,
      price,
      price_label: r.purpose === 'rent' ? `${aed(price)} / year` : aed(price),
      price_per_sqft: ppsf,
      beds: r.bedrooms,
      baths: r.bathrooms,
      area,
      furnishing: r.furnished,
      tenure: 'Freehold',
      completion: r.completion,
      payment_plan: r.payment_plan,
      rera_permit_no: r.permit_no || base.permit_no || null,
      roi_percent: base.roi_percent ? Number(base.roi_percent) : 6.8,
      is_off_plan: r.purpose === 'off-plan',
      description: String(r.description ?? '').split(/\r?\n/).map(s => s.trim()).filter(Boolean),
      features: lines(r.features),
      rawImages: fallbackImagesFor(Number(r.id || 1), `${r.title} ${r.community}`, imgs),
      rawAssets: bundle.rawAssets,
      reference: r.reference,
      floor_plan: r.floor_plan_url || base.floor_plan_url || base.floorPlanUrl || undefined,
      tour: r.virtual_tour_url || base.virtual_tour_url || base.virtualTourUrl || undefined,
      model_3d_url: r.model_3d_url || base.model_3d_url || base.model3dUrl || undefined,
      brochure_url: r.brochure_url || base.brochure_url || base.brochureUrl || undefined,
      video_url: r.video_url || base.video_url || base.videoUrl || undefined,
    }
  }
  if (entity === 'units') {
    const prop = r.property_id
      ? q.get<any>(`SELECT id, title, media, sub_community, building_name, address, rera_permit_no, tenure, video_url, virtual_tour_url, model_3d_url, floor_plan_url, brochure_url FROM properties WHERE id = ? AND deleted_at IS NULL`, r.property_id)
      : null
    const rent = r.rent_annual && !r.sale_price
    const price = Number(r.sale_price || r.rent_annual || 0) || undefined
    const area = Number(r.area_sqft || 0) || null
    const ppsf = !rent && price && area ? Math.round(price / area) : null
    const unitBundle = extractMediaBundle(r.media, {
      video_url: r.video_url || prop?.video_url,
      virtual_tour_url: r.virtual_tour_url || prop?.virtual_tour_url,
      model_3d_url: prop?.model_3d_url,
      floor_plan_url: r.floor_plan_url || prop?.floor_plan_url,
      brochure_url: prop?.brochure_url,
    })
    const propBundle = prop ? extractMediaBundle(prop.media, {}) : { photoUrls: [], rawAssets: [] }
    const rawImgs = fallbackImagesFor(
      Number(r.id || 1),
      `${prop?.title || ''} ${prop?.sub_community || ''}`,
      [...unitBundle.photoUrls, ...propBundle.photoUrls],
    )
    return {
      id: Number(r.id || 0),
      title: `${r.unit_type ?? 'Residence'} ${r.unit_no ?? ''}${prop ? ` · ${prop.title}` : ''}`.trim(),
      purpose: rent ? 'For rent' : 'For sale',
      status: r.status,
      type: r.unit_type || 'Apartment',
      location: prop ? [prop.building_name, prop.sub_community].filter(Boolean).join(', ') : '',
      community: prop?.sub_community || undefined,
      building_name: prop?.building_name || undefined,
      price,
      price_label: rent ? `${aed(r.rent_annual)} / year` : aed(r.sale_price),
      price_per_sqft: ppsf,
      beds: r.bedrooms,
      baths: r.bathrooms,
      area,
      furnishing: r.furnishing,
      tenure: prop?.tenure || 'Freehold',
      floor_no: r.floor_no ? String(r.floor_no) : null,
      parking_slots: r.parking_slots ? Number(r.parking_slots) : null,
      view: r.view || null,
      rera_permit_no: prop?.rera_permit_no || null,
      roi_percent: 6.9,
      description: [r.view ? `Panoramic ${r.view} view` : '', r.floor_no ? `Positioned on Floor ${r.floor_no}` : ''].filter(Boolean),
      features: [
        r.has_balcony && 'Private Balcony',
        r.has_maid_room && "Maid's Room",
        r.has_study && 'Dedicated Study',
        r.is_corner && 'Corner Unit',
        r.parking_slots && `${r.parking_slots} Covered Parking`,
      ].filter(Boolean) as string[],
      rawImages: rawImgs,
      rawAssets: [...unitBundle.rawAssets, ...propBundle.rawAssets],
      reference: r.unit_no ? `UNIT-${r.unit_no}` : `U-${r.id}`,
      floor_plan: r.floor_plan_url || prop?.floor_plan_url || undefined,
      tour: r.virtual_tour_url || prop?.virtual_tour_url || undefined,
      model_3d_url: prop?.model_3d_url || undefined,
      brochure_url: prop?.brochure_url || undefined,
      video_url: r.video_url || prop?.video_url || undefined,
    }
  }
  const rent = r.department_division === 'Leasing' || (!r.price && r.rent_annual)
  const price = Number(rent ? r.rent_annual : r.price) || undefined
  const area = Number(r.area_sqft || 0) || null
  const ppsf = !rent && price && area ? Math.round(price / area) : Number(r.price_per_sqft || 0) || null
  const roi = r.price && r.rent_annual ? Math.round((Number(r.rent_annual) / Number(r.price)) * 1000) / 10 : 7.1
  const location = [r.building_name, r.sub_community, r._labels?.community_ref].filter(Boolean).join(', ')
  const bundle = extractMediaBundle(r.media, {
    video_url: r.video_url,
    virtual_tour_url: r.virtual_tour_url,
    model_3d_url: r.model_3d_url,
    floor_plan_url: r.floor_plan_url,
    brochure_url: r.brochure_url,
  })
  const rawImgs = fallbackImagesFor(Number(r.id || 1), `${r.title || ''} ${location}`, bundle.photoUrls)
  return {
    id: Number(r.id || 0),
    title: r.title,
    purpose: r.is_off_plan ? 'Off-plan' : rent ? 'For rent' : 'For sale',
    status: r.status,
    type: r.property_type || 'Apartment',
    location,
    community: r._labels?.community_ref || r.sub_community || undefined,
    building_name: r.building_name || undefined,
    developer: r._labels?.developer_ref || (isNaN(Number(r.developer_id)) ? r.developer_id : undefined),
    price,
    price_label: rent ? `${aed(r.rent_annual)} / year` : aed(r.price),
    price_per_sqft: ppsf,
    beds: r.bedrooms,
    baths: r.bathrooms,
    area,
    furnishing: r.furnishing,
    tenure: r.tenure || 'Freehold',
    completion: r.completion_year ? String(r.completion_year) : undefined,
    year_built: r.year_built ? Number(r.year_built) : null,
    floor_no: r.floor_no ? String(r.floor_no) : null,
    parking_slots: r.parking_slots ? Number(r.parking_slots) : null,
    view: r.view || null,
    payment_plan: r.payment_plan,
    rera_permit_no: r.rera_permit_no || null,
    roi_percent: roi,
    is_off_plan: Boolean(r.is_off_plan),
    description: String(r.description ?? '').split(/\r?\n/).map(s => s.trim()).filter(Boolean),
    features: [...lines(r.features), ...lines(r.amenities)].slice(0, 18),
    rawImages: rawImgs,
    rawAssets: bundle.rawAssets,
    reference: r.property_no || `SWK-${r.id}`,
    floor_plan: r.floor_plan_url || undefined,
    tour: r.virtual_tour_url || undefined,
    model_3d_url: r.model_3d_url || undefined,
    brochure_url: r.brochure_url || undefined,
    video_url: r.video_url || undefined,
  }
}

function loadShareRawItems(l: any): RawItem[] {
  const def = getDef(l.entity)
  return (safeJson<number[]>(l.ref_ids, []) ?? [])
    .map(id => q.get<any>(`SELECT * FROM "${l.entity}" WHERE id = ? AND deleted_at IS NULL`, id))
    .filter(Boolean)
    .map(r => {
      try {
        return toRawItem(l.entity, getRecord(def, r.id, { user: null, system: true }))
      } catch {
        return null
      }
    })
    .filter((x): x is RawItem => Boolean(x))
}

export default async function (app: FastifyInstance) {
  app.post('/api/share-links', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const b = z
      .object({
        entity: z.enum(SHAREABLE),
        ids: z.array(z.number().int().positive()).min(1).max(30),
        title: z.string().trim().max(120).optional(),
        client_name: z.string().trim().max(120).optional(),
        expires_days: z.number().int().min(1).max(180).default(30),
      })
      .parse(req.body ?? {})
    const def = getDef(b.entity)
    need(req, def.module, 'view')
    for (const id of b.ids) getRecord(def, id, req.ctx) // enforces the sharer's own record visibility
    const token = crypto.randomBytes(18).toString('base64url')
    const expires = new Date(Date.now() + b.expires_days * 864e5).toISOString()
    q.run(
      `INSERT INTO share_links (token, entity, ref_ids, title, client_name, created_by, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?)`,
      token,
      b.entity,
      JSON.stringify([...new Set(b.ids)]),
      b.title || null,
      b.client_name || null,
      req.user!.id,
      nowIso(),
      expires,
    )
    return { token, path: `/l/${token}`, expires_at: expires }
  })

  app.get('/api/share-links', async (req) => {
    if (!req.user || req.user.party_id) throw new HttpError(403, 'Staff only')
    return q.all(
      `SELECT id, token, entity, ref_ids, title, client_name, created_at, expires_at, revoked_at, views, last_viewed_at FROM share_links WHERE created_by = ? ORDER BY id DESC LIMIT 200`,
      req.user.id,
    )
  })

  app.delete('/api/share-links/:id', async (req) => {
    if (!req.user || req.user.party_id) throw new HttpError(403, 'Staff only')
    q.run(`UPDATE share_links SET revoked_at = ? WHERE id = ? AND created_by = ?`, nowIso(), Number((req.params as any).id), req.user.id)
    return { ok: true }
  })

  const load = (token: string) => {
    const l = q.get<any>(`SELECT * FROM share_links WHERE token = ?`, token)
    if (!l || l.revoked_at || (l.expires_at && l.expires_at < nowIso())) {
      throw new HttpError(404, 'This listing link has expired. Ask your SWK consultant for a new one.')
    }
    return l
  }

  /** STRICT WATERMARKED IMAGE ENDPOINT: Every shared brochure photo is server-composited with SWK Logo + App Icon. */
  app.get(
    '/api/public/share/:token/image/:itemIdx/:imgIdx',
    { config: { rateLimit: { max: 240, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const p = req.params as any
      const l = load(String(p.token))
      const itemIdx = Number(p.itemIdx)
      const imgIdx = Number(p.imgIdx)
      if (!Number.isInteger(itemIdx) || itemIdx < 0 || !Number.isInteger(imgIdx) || imgIdx < 0) {
        throw new HttpError(404, 'Image not found')
      }
      const items = loadShareRawItems(l)
      const item = items[itemIdx]
      if (!item || !item.rawImages[imgIdx]) throw new HttpError(404, 'Image not found')
      const jpg = await watermarkPropertyImage(item.rawImages[imgIdx]!, {
        propertyRef: item.reference,
        title: item.title,
      })
      reply
        .header('content-type', 'image/jpeg')
        .header('cache-control', 'public, max-age=3600')
        .header('x-swk-watermark', 'logo+icon')
      return jpg
    },
  )

  /** SCOPED PUBLIC MEDIA STREAMER: Streams uploaded videos, PDF floor plans, brochures, and .glb 3D files ONLY when bound to a valid share link. */
  app.get(
    '/api/public/share/:token/asset/:itemIdx/:assetIdx',
    { config: { rateLimit: { max: 240, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const p = req.params as any
      const l = load(String(p.token))
      const itemIdx = Number(p.itemIdx)
      const assetIdx = Number(p.assetIdx)
      if (!Number.isInteger(itemIdx) || itemIdx < 0 || !Number.isInteger(assetIdx) || assetIdx < 0) {
        throw new HttpError(404, 'Asset not found')
      }
      const items = loadShareRawItems(l)
      const asset = items[itemIdx]?.rawAssets[assetIdx]
      if (!asset?.attachmentId) throw new HttpError(404, 'Asset not found')
      const att = q.get<any>(`SELECT * FROM attachments WHERE id = ? AND deleted_at IS NULL`, asset.attachmentId)
      if (!att) throw new HttpError(404, 'Asset not found')
      return sendStoredAttachment(att, req, reply, { cachePublic: true })
    },
  )

  app.get('/api/public/share/:token', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req, reply) => {
    reply.header('cache-control', 'no-store')
    const token = String((req.params as any).token)
    const l = load(token)
    const rawItems = loadShareRawItems(l)
    // Strictly replace every image URL with our server-watermarked endpoint and proxy uploaded assets via token-scoped URLs!
    const items = rawItems.map((it, itemIdx) => {
      const { rawImages, rawAssets, ...rest } = it
      const resolveAssetUrl = (asset: SharedAssetRef, assetIdx: number) =>
        asset.attachmentId
          ? `/api/public/share/${encodeURIComponent(token)}/asset/${itemIdx}/${assetIdx}`
          : asset.url
      const mappedAssets = rawAssets.map((a, assetIdx) => ({
        kind: a.kind,
        title: a.title,
        category: a.category,
        mime: a.mime,
        url: resolveAssetUrl(a, assetIdx),
      }))
      const resolveSingle = (rawUrl?: string) => {
        if (!rawUrl) return undefined
        const idx = rawAssets.findIndex(a => a.url === rawUrl)
        if (idx >= 0) return resolveAssetUrl(rawAssets[idx]!, idx)
        if (rawUrl.startsWith('/api/files/')) return undefined
        return rawUrl
      }
      const isModel3dAsset = (a: { url: string; mime?: string }) =>
        /\.(glb|gltf|usdz)(\?|#|$)/i.test(a.url) || Boolean(a.mime && /gltf|model\//i.test(a.mime))
      const videos = mappedAssets.filter(a => a.kind === 'video')
      const tours3d = mappedAssets.filter(a => a.kind === 'tour3d')
      const floor_plans = mappedAssets.filter(a => a.kind === 'floorplan')
      const brochures = mappedAssets.filter(a => a.kind === 'brochure')
      return {
        ...rest,
        watermarked: true,
        images: rawImages.map((_, imgIdx) => `/api/public/share/${encodeURIComponent(token)}/image/${itemIdx}/${imgIdx}`),
        video_url: resolveSingle(rest.video_url) || videos[0]?.url,
        tour: resolveSingle(rest.tour) || tours3d.find(t => !isModel3dAsset(t))?.url || tours3d[0]?.url,
        model_3d_url: resolveSingle(rest.model_3d_url) || tours3d.find(isModel3dAsset)?.url,
        floor_plan: resolveSingle(rest.floor_plan) || floor_plans[0]?.url,
        brochure_url: resolveSingle(rest.brochure_url) || brochures[0]?.url,
        videos,
        tours3d,
        floor_plans,
        brochures,
      }
    })
    q.run(`UPDATE share_links SET views = views + 1, last_viewed_at = ? WHERE id = ?`, nowIso(), l.id)
    const u = q.get<any>(`SELECT name, email, phone, work_phone, designation FROM users WHERE id = ?`, l.created_by)
    const acc = hardcodedAccountFor(u?.email)
    const web = teamProfileByEmail(acc?.email ?? u?.email)
    return {
      title: l.title,
      client_name: l.client_name,
      expires_at: l.expires_at,
      items,
      agent: u
        ? {
            name: u.name,
            title: web?.title || u.designation || 'Private Client Advisor',
            phone: u.work_phone || '+971 56 433 0448',
            email: u.email,
            photo: web?.photo ?? null,
          }
        : null,
      company: {
        name: 'SWK Properties LLC',
        orn: '51517',
        trade_license: '1511391',
        address: '25th Floor, Al Saqr Building, Sheikh Zayed Road, Dubai, UAE',
        phone: '+971 56 433 0448',
        website: 'https://www.swkpropertiesuae.com',
      },
    }
  })

  app.post('/api/public/share/:token/enquiry', { config: { rateLimit: { max: 6, timeWindow: '10 minutes' } } }, async (req) => {
    const l = load(String((req.params as any).token))
    const b = z
      .object({
        name: z.string().trim().min(2).max(120),
        phone: z.string().trim().min(6).max(30),
        email: z.string().trim().email().max(200).optional().or(z.literal('')),
        message: z.string().trim().max(2000).optional(),
        item: z.string().trim().max(200).optional(),
        consent: z.boolean().optional(),
      })
      .parse(req.body ?? {})
    if (!/^\+?[\d\s()-]{6,}$/.test(b.phone)) throw bad('Enter a valid phone number')
    const r = ingestLead({
      name: b.name,
      phone: b.phone,
      email: b.email || undefined,
      message: `Enquiry from SWK luxury brochure${l.client_name ? ` (${l.client_name})` : ''}${b.item ? ` about: ${b.item}` : ''}\n${b.message ?? ''}`.trim(),
      source: 'Website',
      consent: b.consent,
    })
    notify(l.created_by, `New brochure enquiry: ${b.name}`, b.item ?? l.title ?? '', `/e/leads/${r.lead_id}`, 'info')
    return { ok: true }
  })
}
