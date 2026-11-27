import type { FastifyInstance } from 'fastify'
import { config } from '../config'
import { q } from '../db'
import { createRecord, findOne, getDef, getRecord, updateRecord } from '../engine'
import { bad, forbidden, HttpError, nowIso } from '../util'
import { need } from './helpers'
import {
  buildCatalogBrochurePdf,
  buildCatalogDeckPptx,
  buildCatalogKitManifest,
  buildCatalogSocialKit,
  buildPaymentPlanPdf,
  getCompanyDefaultBrochureTheme,
  resolveEffectiveBrochureTheme,
  saveCompanyDefaultBrochureTheme,
  type CatalogKitEntity,
} from '../domain/catalog-kit'
import { BROCHURE_PRESETS, normalizeBrochureTheme, type BrochureThemeConfig } from '../../shared/brochure-theme'
import { normalizeMediaList } from '../../shared/media'
import { isAdminSwkUser, isOfficeAdminMeenakshi, isOwnerSwkUser } from '../../shared/swk-staff-access'
import { assertZeroShabibPublicPayload } from '../../shared/zero-shabib-guard'

const ALLOWED_ENTITIES = new Set<CatalogKitEntity>(['properties', 'developers', 'communities', 'units'])

function parseEntityAndId(req: any): { entity: CatalogKitEntity; id: number } {
  const entity = String(req.params?.entity || '') as CatalogKitEntity
  const id = Number(req.params?.id)
  if (!ALLOWED_ENTITIES.has(entity)) throw new HttpError(404, 'Unsupported catalog entity')
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid record ID')
  return { entity, id }
}

function runThemeCheck<T>(fn: () => T): T {
  try {
    return fn()
  } catch (e: any) {
    throw bad(e?.message || 'Invalid brochure theme configuration')
  }
}

function parseQueryThemeOverride(query: any): Partial<BrochureThemeConfig> | null {
  if (!query || typeof query !== 'object') return null
  const out: Partial<BrochureThemeConfig> = {}
  if (query.preset) out.preset = String(query.preset) as any
  if (query.primary) out.primaryHex = String(query.primary)
  if (query.accent) out.accentHex = String(query.accent)
  if (query.surface) out.surfaceHex = String(query.surface)
  if (query.ink) out.inkHex = String(query.ink)
  if (query.layout) out.coverLayout = String(query.layout) as any
  if (query.tagline) out.headerTagline = String(query.tagline)
  if (query.footerNote !== undefined) out.footerNote = String(query.footerNote)
  if (!Object.keys(out).length) return null
  runThemeCheck(() => assertZeroShabibPublicPayload(out, 'Brochure Theme Query Override'))
  return out
}

function loadAuthorizedRecord(req: any, entity: CatalogKitEntity, id: number) {
  const def = getDef(entity)
  need(req, def.module, 'view')
  return getRecord(def, id, req.ctx)
}

const safeFileSlug = (s: unknown) =>
  String(s || 'swk-catalog')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'swk-catalog'

export default async function (app: FastifyInstance) {
  // 0a. Company Default Brochure Theme & Presets
  app.get('/api/catalog-kit/theme/default', async (req) => {
    if (!req.user || req.user.party_id) throw forbidden('Staff access required')
    return { theme: getCompanyDefaultBrochureTheme(), presets: BROCHURE_PRESETS }
  })

  app.put('/api/catalog-kit/theme/default', async (req) => {
    if (!isOwnerSwkUser(req.user) && !isAdminSwkUser(req.user)) {
      throw forbidden('Only Owner or Admin can update the company default brochure theme.')
    }
    const theme = runThemeCheck(() => saveCompanyDefaultBrochureTheme(req.body ?? {}))
    return { ok: true, theme }
  })

  // 0b. Save Per-Record Brochure Theme (Community, Developer, Project, or Unit)
  app.put('/api/catalog-kit/:entity/:id/theme', async (req) => {
    const { entity, id } = parseEntityAndId(req)
    const def = getDef(entity)
    need(req, def.module, 'edit')
    const rec = getRecord(def, id, req.ctx)
    const base = resolveEffectiveBrochureTheme(rec)
    const theme = runThemeCheck(() => normalizeBrochureTheme(req.body ?? {}, base))
    q.run(`UPDATE "${entity}" SET brochure_theme_json = ?, updated_at = ? WHERE id = ?`, JSON.stringify(theme), nowIso(), id)
    return { ok: true, entity, id, theme }
  })

  // 0c. Unified Rich Creator for Community, Developer, Project, or Unit (with details, media & custom brochure theme)
  app.post('/api/catalog-kit/create', async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, any>
    const entity = String(b.entity || '') as CatalogKitEntity
    if (!ALLOWED_ENTITIES.has(entity)) throw bad('entity must be communities, developers, properties, or units')
    const def = getDef(entity)
    need(req, def.module, 'create')
    if ((entity === 'communities' || entity === 'developers') && isOfficeAdminMeenakshi(req.user)) {
      throw forbidden('Office Admin must submit new Communities & Developers via Master Log approval.')
    }

    const theme = b.theme ? runThemeCheck(() => normalizeBrochureTheme(b.theme, getCompanyDefaultBrochureTheme())) : null
    const extraMedia = Array.isArray(b.media) ? normalizeMediaList(b.media) : []
    if (b.cover_image_url && !extraMedia.some(m => m.url === b.cover_image_url)) {
      extraMedia.unshift({
        id: `cover-${Date.now()}`,
        kind: 'photo',
        url: String(b.cover_image_url).trim(),
        title: String(b.title || b.name || b.unit_no || 'Cover'),
        is_cover: true,
        order: 0,
      })
    }

    let payload: Record<string, any> = {}
    if (entity === 'communities') {
      const name = String(b.name || '').trim()
      if (!name) throw bad('Community name is required')
      const code = String(b.code || name.replace(/[^A-Za-z0-9]/g, '').slice(0, 8)).toUpperCase() || `COM${Date.now() % 10000}`
      payload = {
        code,
        name,
        ticker: b.ticker || code,
        emirate: b.emirate || 'Dubai',
        area: b.area || b.emirate || 'Dubai',
        segment: b.segment || 'Prime',
        master_developer: b.master_developer || '',
        rera_community_id: b.rera_community_id || '',
        avg_price_sqft: Number(b.avg_price_sqft) || 0,
        avg_rent_annual: Number(b.avg_rent_annual) || 0,
        gross_yield_pct: Number(b.gross_yield_pct) || 6.5,
        service_charge_sqft: Number(b.service_charge_sqft) || 15,
        description: b.description || '',
        key_landmarks: b.key_landmarks || '',
        amenities: b.amenities || '',
        metro_transit: b.metro_transit || '',
        schools: b.schools || '',
        hospitals: b.hospitals || '',
        future_outlook: b.future_outlook || '',
        closing_keywords: b.closing_keywords || '',
        video_url: b.video_url || undefined,
        virtual_tour_url: b.virtual_tour_url || undefined,
        brochure_url: b.brochure_url || undefined,
        ppt_url: b.ppt_url || undefined,
        media: extraMedia,
        brochure_theme_json: theme ?? undefined,
        active: true,
      }
    } else if (entity === 'developers') {
      const name = String(b.name || '').trim()
      if (!name) throw bad('Developer name is required')
      const code = String(b.code || name.replace(/[^A-Za-z0-9]/g, '').slice(0, 8)).toUpperCase() || `DEV${Date.now() % 10000}`
      payload = {
        code,
        name,
        short_name: b.short_name || name.replace(/\s+(Properties|Developments|Development|Realty|Holding|Group|Real Estate).*$/i, '').trim() || name,
        emirate: b.emirate || 'Dubai',
        tier: b.tier || 'Tier-1 Developer',
        founded_year: b.founded_year ? Number(b.founded_year) : undefined,
        headquarters: b.headquarters || `${b.emirate || 'Dubai'}, UAE`,
        rera_id: b.rera_id || '',
        trade_license: b.trade_license || '',
        contact_person: b.contact_person || '',
        phone: b.phone || '',
        email: b.email || '',
        website: b.website || '',
        address: b.address || '',
        description: b.description || '',
        specialties: b.specialties || '',
        amenities_standard: b.amenities_standard || '',
        flagship_projects: b.flagship_projects || '',
        video_url: b.video_url || undefined,
        virtual_tour_url: b.virtual_tour_url || undefined,
        brochure_url: b.brochure_url || undefined,
        ppt_url: b.ppt_url || undefined,
        media: extraMedia,
        brochure_theme_json: theme ?? undefined,
        active: true,
      }
    } else if (entity === 'properties') {
      const title = String(b.title || '').trim()
      if (!title) throw bad('Project title (e.g. Shahrukhz by Danube) is required')
      payload = {
        title,
        project_name: String(b.project_name || title.replace(/\s+by\s+.+$/i, '')).trim(),
        emirate: b.emirate || 'Dubai',
        department_division: b.department_division || (b.is_off_plan ? 'Sales of Off-Plan Projects' : 'Secondary Projects'),
        property_type: b.property_type || 'Apartment',
        status: b.status || (b.is_off_plan ? 'Off-Plan' : 'Available'),
        launch_status: b.launch_status || (b.is_off_plan ? 'Active Off-Plan' : 'Ready / Completed'),
        is_off_plan: Boolean(b.is_off_plan),
        developer_ref: b.developer_ref ? Number(b.developer_ref) : undefined,
        developer_id: b.developer_name || undefined,
        community_ref: b.community_ref ? Number(b.community_ref) : undefined,
        community_id: b.community_name || undefined,
        price: Number(b.price) || 0,
        rent_annual: Number(b.rent_annual) || 0,
        bedrooms: b.bedrooms !== undefined && b.bedrooms !== '' ? Number(b.bedrooms) : undefined,
        bathrooms: b.bathrooms !== undefined && b.bathrooms !== '' ? Number(b.bathrooms) : undefined,
        area_sqft: b.area_sqft ? Number(b.area_sqft) : undefined,
        completion_year: b.completion_year ? Number(b.completion_year) : undefined,
        handover_quarter: b.handover_quarter || '',
        payment_plan: b.payment_plan || '60/40',
        payment_plan_summary: b.payment_plan_summary || '',
        unit_mix: b.unit_mix || '',
        promo_headline: b.promo_headline || '',
        promo_badge: b.promo_badge || '',
        promo_benefits: b.promo_benefits || '',
        description: b.description || '',
        features: b.features || '',
        amenities: b.amenities || '',
        video_url: b.video_url || undefined,
        virtual_tour_url: b.virtual_tour_url || undefined,
        model_3d_url: b.model_3d_url || undefined,
        floor_plan_url: b.floor_plan_url || undefined,
        brochure_url: b.brochure_url || undefined,
        ppt_url: b.ppt_url || undefined,
        payment_plan_pdf_url: b.payment_plan_pdf_url || undefined,
        media: extraMedia,
        brochure_theme_json: theme ?? undefined,
        active: true,
      }
    } else {
      // units
      const unitNo = String(b.unit_no || '').trim()
      const propId = Number(b.property_id)
      if (!unitNo || !Number.isInteger(propId) || propId <= 0) throw bad('unit_no and valid property_id are required')
      payload = {
        unit_no: unitNo,
        property_id: propId,
        unit_type: b.unit_type || 'Residential',
        status: b.status || 'Available',
        bedrooms: b.bedrooms !== undefined && b.bedrooms !== '' ? Number(b.bedrooms) : 1,
        bathrooms: b.bathrooms !== undefined && b.bathrooms !== '' ? Number(b.bathrooms) : 2,
        area_sqft: b.area_sqft ? Number(b.area_sqft) : undefined,
        sale_price: Number(b.sale_price) || 0,
        rent_annual: Number(b.rent_annual) || 0,
        service_charge_annual: Number(b.service_charge_annual) || 0,
        furnishing: b.furnishing || 'Unfurnished',
        floor_no: b.floor_no ? Number(b.floor_no) : undefined,
        view: b.view || '',
        parking_slots: b.parking_slots || '1',
        has_balcony: b.has_balcony !== undefined ? Boolean(b.has_balcony) : true,
        floor_plan_url: b.floor_plan_url || undefined,
        virtual_tour_url: b.virtual_tour_url || undefined,
        video_url: b.video_url || undefined,
        unit_notes: b.unit_notes || '',
        media: extraMedia,
        brochure_theme_json: theme ?? undefined,
        active: true,
      }
    }

    const created = createRecord(def, payload, req.ctx)
    const id = Number(created.id)
    if (entity === 'properties' || entity === 'developers' || entity === 'communities') {
      const updates: string[] = []
      const vals: any[] = []
      if (!created.brochure_url) { updates.push('brochure_url = ?'); vals.push(`/api/catalog-kit/${entity}/${id}/brochure.pdf`) }
      if (!created.ppt_url) { updates.push('ppt_url = ?'); vals.push(`/api/catalog-kit/${entity}/${id}/deck.pptx`) }
      if (entity === 'properties' && !created.payment_plan_pdf_url) { updates.push('payment_plan_pdf_url = ?'); vals.push(`/api/catalog-kit/${entity}/${id}/payment-plan.pdf`) }
      if (updates.length) {
        q.run(`UPDATE "${entity}" SET ${updates.join(', ')} WHERE id = ?`, ...vals, id)
      }
    }
    const fresh = getRecord(def, id, req.ctx)
    reply.status(201)
    return {
      ok: true,
      entity,
      record: fresh,
      kit: buildCatalogKitManifest(entity, fresh),
    }
  })

  // 1. Complete Kit Manifest (Brochure PDF, Payment Plan PDF, PPTX Deck, Video/3D, Amenities, 8-Platform Social)
  app.get('/api/catalog-kit/:entity/:id', async (req) => {
    const { entity, id } = parseEntityAndId(req)
    const rec = loadAuthorizedRecord(req, entity, id)
    return buildCatalogKitManifest(entity, rec)
  })

  // 2. On-Demand Branded Brochure PDF (Project, Developer, Community, or Unit)
  app.get('/api/catalog-kit/:entity/:id/brochure.pdf', async (req, reply) => {
    const { entity, id } = parseEntityAndId(req)
    const rec = loadAuthorizedRecord(req, entity, id)
    const override = parseQueryThemeOverride(req.query)
    const buf = await buildCatalogBrochurePdf(entity, rec, override)
    const fname = `${safeFileSlug(rec.title || rec.name || rec.unit_no)}-swk-brochure.pdf`
    reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `inline; filename="${fname}"`)
      .header('cache-control', override ? 'no-store' : 'private, max-age=300')
    return buf
  })

  // 3. Dedicated Payment Plan & Emirate Fee Schedule PDF (Dubai 4% DLD / Abu Dhabi 2% ADM)
  app.get('/api/catalog-kit/:entity/:id/payment-plan.pdf', async (req, reply) => {
    const { entity, id } = parseEntityAndId(req)
    if (entity !== 'properties' && entity !== 'units') throw bad('Payment plan PDF is generated for projects and units')
    const rec = loadAuthorizedRecord(req, entity, id)
    const override = parseQueryThemeOverride(req.query)
    const buf = await buildPaymentPlanPdf(rec, entity, override)
    const fname = `${safeFileSlug(rec.title || rec.unit_no)}-payment-plan.pdf`
    reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `inline; filename="${fname}"`)
      .header('cache-control', override ? 'no-store' : 'private, max-age=300')
    return buf
  })

  // 4. Genuine OOXML PowerPoint Presentation Deck (.pptx)
  app.get('/api/catalog-kit/:entity/:id/deck.pptx', async (req, reply) => {
    const { entity, id } = parseEntityAndId(req)
    const rec = loadAuthorizedRecord(req, entity, id)
    const override = parseQueryThemeOverride(req.query)
    const buf = buildCatalogDeckPptx(entity, rec, override)
    const fname = `${safeFileSlug(rec.title || rec.name || rec.unit_no)}-swk-deck.pptx`
    reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
      .header('content-disposition', `attachment; filename="${fname}"`)
      .header('cache-control', override ? 'no-store' : 'private, max-age=300')
    return buf
  })

  // 5. 8-Platform Bilingual (EN + AR) Social Media Templates & Messaging Drafts
  app.get('/api/catalog-kit/:entity/:id/social', async (req) => {
    const { entity, id } = parseEntityAndId(req)
    const rec = loadAuthorizedRecord(req, entity, id)
    return buildCatalogSocialKit(entity, rec)
  })

  // 6. Safe Draft-First Idempotent Promote Off-Plan Project -> Website Studio (Owner/Admin website:edit ONLY)
  // NEVER auto-publishes (`published: false`, `active: false`) and NEVER overwrites an already-published website row.
  app.post('/api/catalog-kit/offplan/:id/promote-website', async (req) => {
    need(req, 'website', 'edit')
    const id = Number((req.params as any).id)
    if (!Number.isInteger(id) || id <= 0) throw bad('Invalid project ID')
    const prop = getRecord(getDef('properties'), id, req.ctx)
    const slug = safeFileSlug(prop.title)
    const ref = `SWK-${prop.emirate === 'Abu Dhabi' ? 'AUH' : 'DXB'}-${String(prop.property_no || `PRJ-${id}`).replace(/[^A-Z0-9-]/gi, '').slice(-10)}`
    const devName = prop._labels?.developer_ref || (typeof prop.developer_id === 'string' ? prop.developer_id : 'Master Developer')
    const commName = prop._labels?.community_ref || prop.community_id || prop.sub_community || prop.emirate || 'Dubai'
    const media = normalizeMediaList(prop.media)
    const rawCover = media.find(m => m.kind === 'photo' && m.is_cover)?.url || media.find(m => m.kind === 'photo')?.url || '/media/communities/downtown-dubai.webp'
    const basePublic = config.baseUrl ? config.baseUrl.replace(/\/$/, '') : ''
    const toPublicUrl = (u?: string | null): string | undefined => {
      if (!u) return undefined
      const clean = String(u).trim()
      if (!clean || clean.startsWith('/api/catalog-kit/') || clean.startsWith('/api/files/')) return undefined
      if (/^https?:\/\//i.test(clean)) return clean
      return basePublic && clean.startsWith('/media/') ? `${basePublic}${clean}` : clean
    }
    const coverImg = toPublicUrl(rawCover) || rawCover
    const publicBrochure = toPublicUrl(prop.brochure_url)
    const publicTour = toPublicUrl(prop.virtual_tour_url)
    const publicVideo = toPublicUrl(prop.video_url)
    const priceAed = Number(prop.price || 0) || 1_000_000
    const priceM = priceAed >= 1_000_000 ? `From AED ${(priceAed / 1_000_000).toFixed(2)}M` : `From AED ${Math.round(priceAed / 1000)}K`

    const wlDef = getDef('website_listings')
    const existingListing = findOne('website_listings', 'lower(slug) = lower(?)', slug)
    let listing: any
    if (existingListing) {
      // Preserve live published listing untouched — only refresh draft rows!
      if (existingListing.published) {
        listing = getRecord(wlDef, Number(existingListing.id), req.ctx)
      } else {
        const draftPatch = {
          title: prop.title,
          subtitle: prop.promo_headline || `${prop.unit_mix || prop.property_type} in ${commName}, ${prop.emirate || 'Dubai'}`,
          price_aed: priceAed,
          payment_plan: prop.payment_plan_summary || prop.payment_plan || '60/40',
          handover: prop.handover_quarter || (prop.completion_year ? String(prop.completion_year) : 'Q4 2028'),
          image_url: coverImg,
          brochure_url: publicBrochure || null,
          virtual_tour_url: publicTour,
          video_url: publicVideo,
          description: prop.description || '',
          features: prop.amenities || prop.features || '',
        }
        assertZeroShabibPublicPayload(draftPatch, 'Off-Plan Website Draft Listing')
        listing = updateRecord(wlDef, Number(existingListing.id), draftPatch, req.ctx)
      }
    } else {
      const uniqueRef = findOne('website_listings', 'reference = ?', ref) ? `${ref}-${id}` : ref
      const wlPayload = {
        reference: uniqueRef,
        slug,
        title: prop.title,
        subtitle: prop.promo_headline || `${prop.unit_mix || prop.property_type} in ${commName}, ${prop.emirate || 'Dubai'}`,
        purpose: prop.is_off_plan ? 'off-plan' : 'buy',
        status: 'available',
        property_type: ['Apartment', 'Villa', 'Townhouse', 'Penthouse', 'Duplex', 'Office'].includes(String(prop.property_type)) ? prop.property_type : 'Apartment',
        published: false,
        hot_offer: true,
        badge: 'New Launch',
        community: commName,
        community_slug: safeFileSlug(commName),
        building: prop.project_name || prop.title,
        developer: devName,
        developer_slug: safeFileSlug(devName),
        price_aed: priceAed,
        bedrooms: prop.bedrooms ?? 1,
        bathrooms: prop.bathrooms ?? 2,
        area_sqft: prop.area_sqft ?? 750,
        furnished: prop.furnishing === 'Fully Furnished' ? 'Furnished' : prop.furnishing === 'Semi-Furnished' ? 'Partly furnished' : 'Unfurnished',
        completion: prop.is_off_plan ? 'Off-Plan' : 'Ready',
        handover: prop.handover_quarter || (prop.completion_year ? String(prop.completion_year) : 'Q4 2028'),
        payment_plan: prop.payment_plan_summary || prop.payment_plan || '60/40',
        image_url: coverImg,
        brochure_url: publicBrochure || undefined,
        virtual_tour_url: publicTour,
        video_url: publicVideo,
        description: prop.description || '',
        features: prop.amenities || prop.features || '',
      }
      assertZeroShabibPublicPayload(wlPayload, 'Off-Plan Website Draft Listing')
      listing = createRecord(wlDef, wlPayload, req.ctx)
    }

    const wpDef = getDef('website_promotions')
    const promoHref = `/off-plan/${slug}`
    const existingPromo = findOne('website_promotions', 'lower(href) = lower(?)', promoHref)
    let promotion: any
    if (existingPromo) {
      promotion = getRecord(wpDef, Number(existingPromo.id), req.ctx)
    } else {
      const wpPayload = {
        title: prop.promo_headline || `${prop.title} — ${priceM}`,
        short_title: String(prop.project_name || prop.title).slice(0, 32),
        eyebrow: `OFF-PLAN LAUNCH · ${String(devName).toUpperCase().slice(0, 36)}`,
        tab: 'off-plan',
        active: false,
        developer: devName,
        community: commName,
        price_guide: priceM,
        plan_highlight: prop.promo_badge || prop.payment_plan_summary || 'Direct Developer Allocation · 0% Commission',
        image: coverImg,
        href: promoHref,
        benefits: prop.promo_benefits || 'Direct Developer Allocation (0% Buyer Commission)\nOfficial PDF Brochure, Payment Plan & 3D Tour',
      }
      assertZeroShabibPublicPayload(wpPayload, 'Off-Plan Website Draft Promotion')
      promotion = createRecord(wpDef, wpPayload, req.ctx)
    }

    return {
      ok: true,
      draftNotice: 'Saved as Website Studio draft (published=false, active=false). Review and publish from Website Studio when ready.',
      listing,
      promotion,
    }
  })
}
