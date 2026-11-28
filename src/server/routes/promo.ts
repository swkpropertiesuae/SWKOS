/**
 * Dedicated CRM Promoter Showcase API (`/api/public/promo/:slug`)
 *
 * Serves a luxury, client-safe promotional showcase page on `os.swk.properties/p/:slug`
 * for off-plan launches that have an explicitly assigned internal CRM Promoter
 * (`promoter_name` + `promoter_phone` on `properties`).
 *
 * Strictly separate from `swkpropertiesuae.com` (`website.ts`) and `/api/public/share/:token`
 * (`share.ts`), which keep their zero-shabib public company website guards 100% intact.
 * Zero owner PII, zero tenant PII, zero internal CRM notes, and zero commission internals
 * ever leave the OS through this endpoint.
 */
import type { FastifyInstance } from 'fastify'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { q, tableExists } from '../db'
import { bad, fromCents, HttpError, nowIso } from '../util'
import { ingestLead } from './integrations'
import { notify } from '../notify'
import { normalizeMediaList } from '../../shared/media'
import { UAE_PROJECTS_BY_SLUG } from '../../shared/uae-catalog/projects'

export interface PromoTypology {
  key: string
  label: string
  subtitle: string
  priceAed: number
  monthlyAed: number
  monthlyNote: string
  dldMedianAed: number
  discountPct: string
  ejariRentRange: string
  grossYieldRange: string
  areaSqft: string
  floorPlanUrl: string
  schedule: Array<{ date: string; pct: string; amountAed: number; cumulative: string; highlight?: boolean }>
}

const ARTS_DISTRICT_TYPOLOGIES: PromoTypology[] = [
  {
    key: 'studio',
    label: 'Studio Residence',
    subtitle: 'Efficient Single-Bay Gallery Plan · Walk-In Shower · Private Balcony',
    priceAed: 525_000,
    monthlyAed: 2_500,
    monthlyNote: 'From AED 2,500 / month',
    dldMedianAed: 721_365,
    discountPct: '-27.2%',
    ejariRentRange: 'AED 40,000 – 45,000 / yr',
    grossYieldRange: '7.6% – 8.6% p.a.',
    areaSqft: '385 – 460 sq ft',
    floorPlanUrl: '/media/launches/the-arts-district-by-binghatti-fp-studio.webp',
    schedule: [
      { date: '31-Dec-2026', pct: '20.00%', amountAed: 105_000, cumulative: '20.0%', highlight: true },
      { date: 'Jan – May 2027 (×5 mo)', pct: '0.50% / mo', amountAed: 2_500, cumulative: '22.5%' },
      { date: '30-Jun-2027', pct: '5.00%', amountAed: 26_250, cumulative: '27.5%', highlight: true },
      { date: 'Jul – Nov 2027 (×5 mo)', pct: '0.50% / mo', amountAed: 2_500, cumulative: '30.0%' },
      { date: '31-Dec-2027', pct: '10.00%', amountAed: 52_500, cumulative: '40.0%', highlight: true },
      { date: 'Jan – May 2028 (×5 mo)', pct: '0.50% / mo', amountAed: 2_625, cumulative: '42.5%' },
      { date: '30-Jun-2028', pct: '10.00%', amountAed: 52_500, cumulative: '52.5%', highlight: true },
      { date: 'Jul – Aug 2028 (×2 mo)', pct: '0.50% / mo', amountAed: 2_625, cumulative: '53.5%' },
      { date: '30-Sep-2028', pct: '0.70%', amountAed: 3_875, cumulative: '54.0%' },
      { date: '31-Oct-2028', pct: '6.00%', amountAed: 31_500, cumulative: '60.0%', highlight: true },
      { date: 'On Completion (Q4 2028)', pct: '40.00%', amountAed: 210_000, cumulative: '100.0%', highlight: true },
    ],
  },
  {
    key: '1br',
    label: '1-Bedroom Residence',
    subtitle: 'Full-Width Living Gallery · Powder Room · En-Suite Master · Balcony',
    priceAed: 850_000,
    monthlyAed: 4_250,
    monthlyNote: 'From AED 4,250 / month',
    dldMedianAed: 970_000,
    discountPct: '-12.4%',
    ejariRentRange: 'AED 54,000 – 64,000 / yr',
    grossYieldRange: '6.8% – 7.5% p.a.',
    areaSqft: '680 – 820 sq ft',
    floorPlanUrl: '/media/launches/the-arts-district-by-binghatti-fp-1br.webp',
    schedule: [
      { date: '31-Dec-2026', pct: '20.00%', amountAed: 170_000, cumulative: '20.0%', highlight: true },
      { date: 'Jan – May 2027 (×5 mo)', pct: '0.50% / mo', amountAed: 4_250, cumulative: '22.5%' },
      { date: '30-Jun-2027', pct: '5.00%', amountAed: 42_500, cumulative: '27.5%', highlight: true },
      { date: 'Jul – Nov 2027 (×5 mo)', pct: '0.50% / mo', amountAed: 4_250, cumulative: '30.0%' },
      { date: '31-Dec-2027', pct: '10.00%', amountAed: 85_000, cumulative: '40.0%', highlight: true },
      { date: 'Jan – May 2028 (×5 mo)', pct: '0.50% / mo', amountAed: 4_250, cumulative: '42.5%' },
      { date: '30-Jun-2028', pct: '10.00%', amountAed: 85_000, cumulative: '52.5%', highlight: true },
      { date: 'Jul – Sep 2028 (×3 mo)', pct: '0.50% / mo', amountAed: 4_250, cumulative: '54.0%' },
      { date: '31-Oct-2028', pct: '6.00%', amountAed: 51_000, cumulative: '60.0%', highlight: true },
      { date: 'On Completion (Q4 2028)', pct: '40.00%', amountAed: 340_000, cumulative: '100.0%', highlight: true },
    ],
  },
  {
    key: '2br',
    label: '2-Bedroom Corner Residence',
    subtitle: 'Dual-Aspect Panoramic Wrap-Around Terrace · Twin En-Suites · Island Kitchen',
    priceAed: 1_300_000,
    monthlyAed: 5_200,
    monthlyNote: 'Promo AED 5,000/mo · Schedule AED 5,200/mo (\'27)',
    dldMedianAed: 1_524_300,
    discountPct: '-14.7%',
    ejariRentRange: 'AED 70,000 – 90,000 / yr',
    grossYieldRange: '6.3% – 6.9% p.a.',
    areaSqft: '1,120 – 1,350 sq ft',
    floorPlanUrl: '/media/launches/the-arts-district-by-binghatti-fp-2br.webp',
    schedule: [
      { date: '31-Dec-2026', pct: '20.00%', amountAed: 260_000, cumulative: '20.0%', highlight: true },
      { date: 'Jan – May 2027 (×5 mo)', pct: '0.40% / mo', amountAed: 5_200, cumulative: '22.0%' },
      { date: '30-Jun-2027', pct: '5.00%', amountAed: 65_000, cumulative: '27.0%', highlight: true },
      { date: 'Jul – Nov 2027 (×5 mo)', pct: '0.40% / mo', amountAed: 5_200, cumulative: '29.0%' },
      { date: '31-Dec-2027', pct: '10.00%', amountAed: 130_000, cumulative: '39.0%', highlight: true },
      { date: 'Jan – May 2028 (×5 mo)', pct: '0.50% / mo', amountAed: 6_500, cumulative: '41.5%' },
      { date: '30-Jun-2028', pct: '10.00%', amountAed: 130_000, cumulative: '51.5%', highlight: true },
      { date: 'Jul – Sep 2028 (×3 mo)', pct: '0.50% / mo', amountAed: 6_500, cumulative: '53.0%' },
      { date: '31-Oct-2028', pct: '7.00%', amountAed: 91_000, cumulative: '60.0%', highlight: true },
      { date: 'On Completion (Q4 2028)', pct: '40.00%', amountAed: 520_000, cumulative: '100.0%', highlight: true },
    ],
  },
]

const ARTS_DISTRICT_DRIVE_TIMES = [
  { mins: '10', place: 'Meydan Racecourse & Nad Al Sheba', note: 'Adjacent AED 2,600/sqft luxury corridor' },
  { mins: '14', place: 'Dubai Creek Harbour', note: 'Waterfront marina & cultural skyline' },
  { mins: '15', place: 'Dubai International Airport (DXB)', note: 'Direct highway access via E311 & E66' },
  { mins: '17', place: 'Burj Khalifa & Dubai Mall', note: 'Downtown cultural & retail core' },
  { mins: '22', place: 'DIFC & Business Bay', note: 'Financial hub & fine dining district' },
  { mins: '35', place: 'Palm Jumeirah & Dubai Marina', note: 'Beachfront resorts & yacht clubs' },
]

const ARTS_DISTRICT_DLD_PROOF = [
  { metric: 'AED 60.02 B', label: 'Binghatti DLD Sales Volume', sub: '39,065 registered transactions (2022–2026 YTD)' },
  { metric: '+133.7%', label: 'Nadd Hessa Median Surge', sub: 'AED 440K (2021) to AED 1.03M (2026)' },
  { metric: '-27.2%', label: 'Day-1 Launch Arbitrage', sub: 'Studio AED 525K vs AED 721K DSO median' },
  { metric: '8.6%', label: 'Peak Ejari Gross Yield', sub: 'Verified DSO / Nadd Hessa rental contracts' },
]

function publicAssetIfExists(relUrl: string): string | null {
  const clean = relUrl.replace(/^\/+/, '')
  const candidates = [
    path.resolve('dist/web', clean),
    path.resolve('public', clean),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return relUrl
  }
  return null
}

export function resolvePromoProjectBySlug(rawSlug: string) {
  const slug = String(rawSlug || '').trim().toLowerCase()
  if (!slug || slug.length > 100 || !/^[a-z0-9-]+$/.test(slug)) return null
  const spec = UAE_PROJECTS_BY_SLUG.get(slug)
  let prop: any = null
  if (spec) {
    prop = q.get<any>(
      `SELECT * FROM properties WHERE deleted_at IS NULL AND (lower(title) = ? OR notes LIKE ?) ORDER BY id DESC LIMIT 1`,
      spec.title.toLowerCase(),
      `%Slug: ${slug}.%`,
    )
  }
  if (!prop) {
    const titleGuess = slug.replace(/-/g, ' ')
    prop = q.get<any>(
      `SELECT * FROM properties WHERE deleted_at IS NULL AND lower(title) = ? ORDER BY id DESC LIMIT 1`,
      titleGuess,
    )
  }
  if (!prop) return null
  const promoterName = String(prop.promoter_name || '').trim()
  const promoterPhone = String(prop.promoter_phone || '').trim()
  if (!promoterName) return null
  return { prop, spec, slug, promoterName, promoterPhone }
}

export function buildPromoOgMeta(slug: string, origin: string) {
  try {
    const hit = resolvePromoProjectBySlug(slug)
    if (!hit) return null
    const { prop, spec, promoterName, promoterPhone } = hit
    const isArts = hit.slug === 'the-arts-district-by-binghatti'
    const title = isArts
      ? `The Arts District by Binghatti — Exclusive Launch with ${promoterName}`
      : `${prop.title} — Priority Launch with ${promoterName}`
    const fromPrice = Math.round(fromCents(prop.price) || spec?.fromPrice || 525_000)
    const description = isArts
      ? `EOI Now Open · Studios from AED 525,000 (AED 2,500/mo), 1BR from AED 850K, 2BR Corner from AED 1.30M on 60/40 Plan. Watch Official Film, explore 3D Floor Plans & reserve directly with ${promoterName} (${promoterPhone}).`
      : `Starting from AED ${fromPrice.toLocaleString('en-US')} · Reserve priority allocation directly with ${promoterName} (${promoterPhone}).`
    const media = normalizeMediaList(prop.media)
    const firstPhoto = media.find(m => m.kind === 'photo')?.url || spec?.cover || '/media/launches/the-arts-district-by-binghatti-1.webp'
    const image = firstPhoto.startsWith('http') ? firstPhoto : `${origin.replace(/\/$/, '')}${firstPhoto}`
    return { title, description, image, url: `${origin.replace(/\/$/, '')}/p/${hit.slug}` }
  } catch {
    return null
  }
}

export default async function (app: FastifyInstance) {
  app.get('/api/public/promo/:slug', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req, reply) => {
    reply.header('cache-control', 'no-store')
    const hit = resolvePromoProjectBySlug(String((req.params as any).slug || ''))
    if (!hit) throw new HttpError(404, 'Promoter showcase not found.')

    const { prop, spec, slug, promoterName, promoterPhone } = hit
    const isArts = slug === 'the-arts-district-by-binghatti'
    const media = normalizeMediaList(prop.media)
    const photos = media
      .filter(m => m.kind === 'photo')
      .sort((a, b) => Number(!!b.is_cover) - Number(!!a.is_cover) || a.order - b.order)
      .map((m, idx) => ({
        url: m.url,
        title: m.title || `${prop.title} — Render ${idx + 1}`,
        category: m.category || (idx === 0 ? 'Exterior' : '3D Render'),
      }))

    const floorPlans = media
      .filter(m => m.kind === 'floorplan')
      .map(m => ({ url: m.url, title: m.title || 'Official 2D → 3D Floor Plan', category: m.category || 'Floor Plan' }))

    const devName =
      (prop.developer_ref && q.val<string>(`SELECT name FROM developers WHERE id = ?`, prop.developer_ref)) ||
      (typeof prop.developer_id === 'string' && isNaN(Number(prop.developer_id)) ? prop.developer_id : null) ||
      'Binghatti'
    const commName =
      (prop.community_ref && q.val<string>(`SELECT name FROM communities WHERE id = ?`, prop.community_ref)) ||
      prop.community_id ||
      prop.sub_community ||
      'Dubai Silicon Oasis'

    const promoterUser = prop.promoter_id && tableExists('users')
      ? q.get<any>(`SELECT email, designation FROM users WHERE id = ? AND deleted_at IS NULL`, prop.promoter_id)
      : null

    // Prefer dedicated Shabib-branded Binghatti kit files when present on disk; fall back to project media URLs
    const videoUrl = (isArts && publicAssetIfExists('/media/launches/the-arts-district-by-binghatti-film-shabib.mp4')) || prop.video_url || null
    const brochureUrl = (isArts && publicAssetIfExists('/media/launches/the-arts-district-by-binghatti-brochure-shabib.pdf')) || prop.brochure_url || null
    const paymentPlanPdfUrl = (isArts && publicAssetIfExists('/media/launches/the-arts-district-by-binghatti-payment-plan-shabib.pdf')) || prop.payment_plan_pdf_url || null
    const pptUrl = (isArts && publicAssetIfExists('/media/launches/the-arts-district-by-binghatti-deck-shabib.pptx')) || prop.ppt_url || null

    const cleanPhone = promoterPhone || '+971 55 155 4680'
    const waDigits = cleanPhone.replace(/[^\d]/g, '')

    return {
      slug,
      theme: isArts ? 'binghatti-arts-district' : 'luxury-obsidian',
      brandAssets: isArts
        ? {
            logoWhite: publicAssetIfExists('/media/launches/the-arts-district-by-binghatti-logo-white.png'),
            logoBurgundy: publicAssetIfExists('/media/launches/the-arts-district-by-binghatti-logo-burgundy.png'),
            sunburstOrange: publicAssetIfExists('/media/launches/the-arts-district-by-binghatti-sunburst-orange.png'),
            sunburstGold: publicAssetIfExists('/media/launches/the-arts-district-by-binghatti-sunburst-gold.png'),
            desertSilkBg: publicAssetIfExists('/media/launches/the-arts-district-by-binghatti-desert-silk.jpg'),
          }
        : null,
      project: {
        id: Number(prop.id),
        reference: prop.property_no || `PRJ-${prop.id}`,
        title: prop.title,
        subtitle: isArts
          ? "A New Year. A New Icon. Dubai's Next District for the Arts."
          : prop.promo_headline || `${prop.unit_mix || prop.property_type} in ${commName}, ${prop.emirate || 'Dubai'}`,
        developer: devName,
        community: commName,
        emirate: prop.emirate || 'Dubai',
        handover: prop.handover_quarter || (prop.completion_year ? `Q4 ${prop.completion_year}` : 'Q4 2028'),
        paymentPlan: prop.payment_plan || '60/40',
        paymentPlanSummary: prop.payment_plan_summary || '60/40 Flexible Plan · 20% Booking · From AED 2,500/mo · 40% Handover',
        fromPrice: Math.round(fromCents(prop.price) || spec?.fromPrice || 525_000),
        unitMix: prop.unit_mix || 'Studio, 1BR & 2BR Corner Residences',
        roiPercent: Number(prop.roi_percent || spec?.expectedYieldPct || 8.1),
        tenure: prop.tenure || 'Freehold',
        furnishing: prop.furnishing || 'Semi-Furnished',
        promoBadge: prop.promo_badge || 'OFFICIAL LAUNCH · EOI OPEN 28 NOV 2026',
        promoHeadline: prop.promo_headline || 'Studios from AED 525K (AED 2,500/mo) · 60/40 Launch Plan · 0% Commission',
        description: String(prop.description || ''),
        amenities: String(prop.amenities || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean),
        features: String(prop.features || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean),
        tourUrl: prop.virtual_tour_url || null,
        photos,
        floorPlans,
        videoUrl,
        brochureUrl,
        paymentPlanPdfUrl,
        pptUrl,
      },
      typologies: isArts ? ARTS_DISTRICT_TYPOLOGIES : [],
      driveTimes: isArts ? ARTS_DISTRICT_DRIVE_TIMES : [],
      dldProof: isArts ? ARTS_DISTRICT_DLD_PROOF : [],
      promoter: {
        name: promoterName,
        title: 'Private Client Advisor & Lead Off-Plan Promoter',
        phone: cleanPhone,
        whatsappDigits: waDigits,
        whatsappUrl: `https://wa.me/${waDigits}`,
        email: promoterUser?.email || 'shabib@swk.properties',
        location: 'Dubai, United Arab Emirates',
      },
    }
  })

  app.post('/api/public/promo/:slug/enquiry', { config: { rateLimit: { max: 6, timeWindow: '10 minutes' } } }, async (req) => {
    const hit = resolvePromoProjectBySlug(String((req.params as any).slug || ''))
    if (!hit) throw new HttpError(404, 'Promoter showcase not found.')

    const b = z
      .object({
        name: z.string().trim().min(2).max(120),
        phone: z.string().trim().min(6).max(30),
        email: z.string().trim().email().max(200).optional().or(z.literal('')),
        unit_type: z.string().trim().max(80).optional(),
        budget: z.string().trim().max(80).optional(),
        message: z.string().trim().max(2000).optional(),
        consent: z.boolean().optional(),
      })
      .parse(req.body ?? {})

    if (!/^\+?[\d\s()-]{6,}$/.test(b.phone)) throw bad('Enter a valid phone number')

    const details = [
      `VIP Promoter Link Enquiry (${hit.prop.title})`,
      `Promoter: ${hit.promoterName} (${hit.promoterPhone})`,
      b.unit_type ? `Interested Unit: ${b.unit_type}` : '',
      b.budget ? `Budget / Plan: ${b.budget}` : '',
      b.message || '',
    ].filter(Boolean).join('\n')

    const r = ingestLead({
      name: b.name,
      phone: b.phone,
      email: b.email || undefined,
      message: details,
      source: 'WhatsApp',
      consent: b.consent,
    })

    // Directly attribute lead in CRM to the assigned Promoter & active Launch Campaign
    const promoterId = hit.prop.promoter_id ? Number(hit.prop.promoter_id) : null
    const campaignId = tableExists('campaigns')
      ? (q.val<number>(`SELECT id FROM campaigns WHERE property_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1`, hit.prop.id) ?? null)
      : null
    if (r?.lead_id) {
      q.run(
        `UPDATE leads SET owner_id = COALESCE(?, owner_id), promoter_id = COALESCE(?, promoter_id), campaign_id = COALESCE(?, campaign_id), destination = COALESCE(NULLIF(destination, ''), ?), department_division = 'Sales of Off-Plan Projects', updated_at = ? WHERE id = ?`,
        promoterId,
        promoterId,
        campaignId,
        hit.prop.title,
        nowIso(),
        r.lead_id,
      )
    }

    if (promoterId) {
      notify(
        promoterId,
        `VIP Promoter Link Lead: ${b.name}`,
        `${hit.prop.title}${b.unit_type ? ` · ${b.unit_type}` : ''} (${b.phone})`,
        `/e/leads/${r.lead_id}`,
        'info',
      )
    }

    return { ok: true, lead_id: r.lead_id }
  })
}
