import type { FastifyInstance } from 'fastify'
import { config } from '../config'
import { createRecord, findOne, getDef, getRecord, updateRecord } from '../engine'
import { bad, HttpError } from '../util'
import { need } from './helpers'
import {
  buildCatalogBrochurePdf,
  buildCatalogDeckPptx,
  buildCatalogKitManifest,
  buildCatalogSocialKit,
  buildPaymentPlanPdf,
  type CatalogKitEntity,
} from '../domain/catalog-kit'
import { normalizeMediaList } from '../../shared/media'
import { assertZeroShabibPublicPayload } from '../../shared/zero-shabib-guard'

const ALLOWED_ENTITIES = new Set<CatalogKitEntity>(['properties', 'developers', 'communities'])

function parseEntityAndId(req: any): { entity: CatalogKitEntity; id: number } {
  const entity = String(req.params?.entity || '') as CatalogKitEntity
  const id = Number(req.params?.id)
  if (!ALLOWED_ENTITIES.has(entity)) throw new HttpError(404, 'Unsupported catalog entity')
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid record ID')
  return { entity, id }
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
  // 1. Complete Kit Manifest (Brochure PDF, Payment Plan PDF, PPTX Deck, Video/3D, Amenities, 8-Platform Social)
  app.get('/api/catalog-kit/:entity/:id', async (req) => {
    const { entity, id } = parseEntityAndId(req)
    const rec = loadAuthorizedRecord(req, entity, id)
    return buildCatalogKitManifest(entity, rec)
  })

  // 2. On-Demand Branded Brochure PDF (Project, Developer, or Community)
  app.get('/api/catalog-kit/:entity/:id/brochure.pdf', async (req, reply) => {
    const { entity, id } = parseEntityAndId(req)
    const rec = loadAuthorizedRecord(req, entity, id)
    const buf = await buildCatalogBrochurePdf(entity, rec)
    const fname = `${safeFileSlug(rec.title || rec.name)}-swk-brochure.pdf`
    reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `inline; filename="${fname}"`)
      .header('cache-control', 'private, max-age=300')
    return buf
  })

  // 3. Dedicated Payment Plan & Emirate Fee Schedule PDF (Dubai 4% DLD / Abu Dhabi 2% ADM)
  app.get('/api/catalog-kit/:entity/:id/payment-plan.pdf', async (req, reply) => {
    const { entity, id } = parseEntityAndId(req)
    if (entity !== 'properties') throw bad('Payment plan PDF is generated for projects')
    const rec = loadAuthorizedRecord(req, entity, id)
    const buf = await buildPaymentPlanPdf(rec)
    const fname = `${safeFileSlug(rec.title)}-payment-plan.pdf`
    reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `inline; filename="${fname}"`)
      .header('cache-control', 'private, max-age=300')
    return buf
  })

  // 4. Genuine OOXML PowerPoint Presentation Deck (.pptx)
  app.get('/api/catalog-kit/:entity/:id/deck.pptx', async (req, reply) => {
    const { entity, id } = parseEntityAndId(req)
    const rec = loadAuthorizedRecord(req, entity, id)
    const buf = buildCatalogDeckPptx(entity, rec)
    const fname = `${safeFileSlug(rec.title || rec.name)}-swk-deck.pptx`
    reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
      .header('content-disposition', `attachment; filename="${fname}"`)
      .header('cache-control', 'private, max-age=300')
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
