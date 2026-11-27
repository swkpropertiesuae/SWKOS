import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { q } from '../db'
import { fromCents } from '../util'
import { SWK_COMPANY_ADDRESS, SWK_COMPANY_EMAIL, SWK_COMPANY_NAME, SWK_COMPANY_PHONE, SWK_OFFICIAL_WEBSITES_TEXT, SWK_RERA_ORN, SWK_TRADE_LICENSE } from '../../shared/corporate-footer'
import { normalizeMediaList } from '../../shared/media'
import { generateSocialMediaKit, type SocialKitBundle } from '../../shared/social-templates'
import { UAE_COMMUNITIES } from '../../shared/uae-catalog/communities'
import { UAE_DEVELOPERS } from '../../shared/uae-catalog/developers'
import { UAE_PROJECTS } from '../../shared/uae-catalog/projects'
import { assertZeroShabibPublicPayload } from '../../shared/zero-shabib-guard'
import { buildPptxBuffer, type PptxSlideSpec } from './pptx-builder'

export type CatalogKitEntity = 'properties' | 'developers' | 'communities'

/** Sanitize arbitrary UTF-8 strings for pdf-lib StandardFonts (WinAnsi encoding) so non-WinAnsi glyphs never throw. */
export function toPdfSafeText(input: unknown): string {
  return String(input ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2022/g, '*')
    .replace(/\u00B7/g, ' | ')
    .replace(/\u2026/g, '...')
    .replace(/\u00D7/g, 'x')
    .replace(/\u2192/g, '->')
    .replace(/\u2265/g, '>=')
    .replace(/\u2264/g, '<=')
    .replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

const aed = (n?: number | null) => (n && n > 0 ? `AED ${Math.round(n).toLocaleString('en-US')}` : 'Price on Request')
const splitLines = (v: unknown) => String(v ?? '').split(/\r?\n|•/).map(s => s.trim()).filter(Boolean)

export interface EmirateFeeSummary {
  emirate: string
  authority: string
  registrationFeePct: number
  registrationFeeAed: number
  adminFeeAed: number
  trusteeFeeAed: number
  totalClosingFeesAed: number
  goldenVisaEligible: boolean
  investorVisaEligible: boolean
}

export interface PaymentMilestoneRow {
  stage: string
  timing: string
  pct: number
  amountAed: number
}

export function computeEmirateFeeSummary(emirateRaw: string | null | undefined, priceAed: number): EmirateFeeSummary {
  const isAbuDhabi = /abu\s*dhabi/i.test(String(emirateRaw || ''))
  const emirate = isAbuDhabi ? 'Abu Dhabi' : 'Dubai'
  const registrationFeePct = isAbuDhabi ? 2 : 4
  const registrationFeeAed = Math.round(priceAed * (registrationFeePct / 100))
  const adminFeeAed = isAbuDhabi ? 500 : 580
  const trusteeFeeAed = isAbuDhabi ? 0 : priceAed >= 500_000 ? 4_200 : 2_100
  return {
    emirate,
    authority: isAbuDhabi ? 'Abu Dhabi Municipality (ADM / DMT)' : 'Dubai Land Department (DLD / RERA)',
    registrationFeePct,
    registrationFeeAed,
    adminFeeAed,
    trusteeFeeAed,
    totalClosingFeesAed: registrationFeeAed + adminFeeAed + trusteeFeeAed,
    goldenVisaEligible: priceAed >= 2_000_000,
    investorVisaEligible: priceAed >= 750_000,
  }
}

export function buildPaymentMilestones(rec: Record<string, any>): { planLabel: string; rows: PaymentMilestoneRow[] } {
  const price = Number(rec.price || 0)
  const isOffPlan = Boolean(rec.is_off_plan)
  const planSummary = String(rec.payment_plan_summary || '').trim()
  const planOption = String(rec.payment_plan || '').trim()
  const planLabel = planSummary || planOption || (isOffPlan ? '60/40' : '100% on completion')
  const combined = `${planOption} ${planSummary}`.trim()
  const handover = String(rec.handover_quarter || (rec.completion_year ? `Q4 ${rec.completion_year}` : 'On Handover'))

  if (!isOffPlan || /100%\s*on\s*completion/i.test(combined)) {
    return {
      planLabel,
      rows: [
        { stage: 'MOU / Booking Deposit (Form F)', timing: 'Upon Signing', pct: 10, amountAed: Math.round(price * 0.1) },
        { stage: 'Down Payment Balance / Mortgage Equity', timing: 'At Transfer Prep', pct: 10, amountAed: Math.round(price * 0.1) },
        { stage: 'Final Balance (Cash or Up to 80% UAE Bank Finance)', timing: 'At Trustee Transfer', pct: 80, amountAed: Math.round(price * 0.8) },
      ],
    }
  }

  let booking = 10
  let construction = 50
  let handoverPct = 40
  let postPct = 0

  // 1) Parse explicit percentages from summary if present (e.g. "10% Booking · 50% Construction · 15% Handover · 25% Post-Handover")
  const mBook = combined.match(/(\d+(?:\.\d+)?)%\s*(?:booking|down)/i)
  const mConst = combined.match(/(\d+(?:\.\d+)?)%\s*(?:during\s+)?construction/i)
  const mHand = combined.match(/(\d+(?:\.\d+)?)%\s*(?:on\s+)?handover(?!\s*-)/i)
  const mPost = combined.match(/(\d+(?:\.\d+)?)%\s*post[\s-]*handover/i)
  if (mBook || mConst || mHand || mPost) {
    booking = mBook ? Number(mBook[1]) : 10
    construction = mConst ? Number(mConst[1]) : 0
    handoverPct = mHand ? Number(mHand[1]) : 0
    postPct = mPost ? Number(mPost[1]) : 0
    const sum = booking + construction + handoverPct + postPct
    if (Math.abs(sum - 100) > 0.1) {
      // Normalize rounding drift cleanly onto construction/handover
      const diff = Number((100 - sum).toFixed(2))
      if (construction > 0) construction = Math.max(0, Number((construction + diff).toFixed(2)))
      else handoverPct = Math.max(0, Number((handoverPct + diff).toFixed(2)))
    }
  } else if (/1%\s*monthly/i.test(combined)) {
    booking = 10; construction = 55; handoverPct = 0; postPct = 35
  } else if (/post[\s-]*handover\s*3y|3[\s-]*year\s+post[\s-]*handover|65\/35/i.test(combined)) {
    booking = 10; construction = 55; handoverPct = 10; postPct = 25
  } else if (/post[\s-]*handover\s*2y|2[\s-]*year\s+post[\s-]*handover/i.test(combined)) {
    booking = 10; construction = 50; handoverPct = 15; postPct = 25
  } else if (/80\/20/.test(combined)) {
    booking = 10; construction = 70; handoverPct = 20; postPct = 0
  } else if (/70\/30/.test(combined)) {
    booking = 10; construction = 60; handoverPct = 30; postPct = 0
  } else if (/50\/50/.test(combined)) {
    booking = 10; construction = 40; handoverPct = 50; postPct = 0
  } else if (/60\/40/.test(combined)) {
    booking = 10; construction = 50; handoverPct = 40; postPct = 0
  }

  const rows: PaymentMilestoneRow[] = []
  if (booking > 0) {
    rows.push({ stage: 'Booking / EOI Reservation', timing: 'Immediate', pct: booking, amountAed: Math.round(price * booking / 100) })
  }
  // Dynamically split construction share so total ALWAYS equals exactly 100%
  if (construction >= 30) {
    const first = 10
    const last = 10
    const mid = Number((construction - first - last).toFixed(2))
    rows.push({ stage: 'SPA Signing & First Construction Milestone', timing: 'Within 60 Days', pct: first, amountAed: Math.round(price * first / 100) })
    rows.push({ stage: 'Mid-Construction Progress Instalments', timing: 'Construction Phase', pct: mid, amountAed: Math.round(price * mid / 100) })
    rows.push({ stage: 'Structure Top-Out & Fit-Out Milestone', timing: 'Pre-Completion', pct: last, amountAed: Math.round(price * last / 100) })
  } else if (construction >= 10) {
    const first = Math.round(construction / 2)
    const rest = Number((construction - first).toFixed(2))
    rows.push({ stage: 'SPA Signing & Construction Milestone 1', timing: 'Within 60 Days', pct: first, amountAed: Math.round(price * first / 100) })
    rows.push({ stage: 'Construction Progress Milestone 2', timing: 'Pre-Completion', pct: rest, amountAed: Math.round(price * rest / 100) })
  } else if (construction > 0) {
    rows.push({ stage: 'Construction Progress Instalment', timing: 'Construction Phase', pct: construction, amountAed: Math.round(price * construction / 100) })
  }
  if (handoverPct > 0) {
    rows.push({ stage: 'On Completion & Key Handover', timing: handover, pct: handoverPct, amountAed: Math.round(price * handoverPct / 100) })
  }
  if (postPct > 0) {
    const postWindow = /2y|2[\s-]*year/i.test(combined) ? '24 Months Post-Handover' : '36 Months Post-Handover'
    rows.push({ stage: 'Post-Handover Monthly Instalments (0% Interest)', timing: postWindow, pct: postPct, amountAed: Math.round(price * postPct / 100) })
  }
  return { planLabel, rows }
}

function resolveEnrichedContext(entity: CatalogKitEntity, rec: Record<string, any>) {
  if (entity === 'properties') {
    const devRow = rec.developer_ref ? q.get<any>(`SELECT id, code, name, short_name, tier, rera_id, website FROM developers WHERE id = ?`, rec.developer_ref) : null
    const commRow = rec.community_ref ? q.get<any>(`SELECT id, code, name, emirate, segment, avg_price_sqft, gross_yield_pct, service_charge_sqft, metro_transit, key_landmarks, schools, hospitals FROM communities WHERE id = ?`, rec.community_ref) : null
    const spec = UAE_PROJECTS.find(p => p.title.toLowerCase() === String(rec.title || '').toLowerCase())
    const emirate = String(rec.emirate || commRow?.emirate || spec?.emirate || 'Dubai')
    const devName = devRow?.name || rec._labels?.developer_ref || (typeof rec.developer_id === 'string' ? rec.developer_id : '') || ''
    const commName = commRow?.name || rec._labels?.community_ref || rec.community_id || rec.sub_community || emirate
    const price = Number(rec.price || 0)
    const media = normalizeMediaList(rec.media)
    const images = media.filter(m => m.kind === 'photo').map(m => m.url)
    const amenities = splitLines(rec.amenities).length ? splitLines(rec.amenities) : (spec?.amenities || ['Swimming Pool', 'State-of-the-Art Gym', 'Landscaped Podium', '24/7 Concierge & Security'])
    const features = splitLines(rec.features).length ? splitLines(rec.features) : (spec?.features || [])
    const promoBenefits = splitLines(rec.promo_benefits).length ? splitLines(rec.promo_benefits) : (spec?.promoBenefits || [])
    const payment = buildPaymentMilestones(rec)
    const fees = computeEmirateFeeSummary(emirate, price)
    return {
      title: String(rec.title || 'UAE Project'),
      subtitle: `${commName}, ${emirate} · ${devName || 'Master Developer'}`,
      projectName: String(rec.project_name || rec.title || ''),
      developerName: devName,
      communityName: commName,
      emirate,
      price,
      priceLabel: aed(price),
      isOffPlan: Boolean(rec.is_off_plan),
      handover: String(rec.handover_quarter || (rec.completion_year ? String(rec.completion_year) : '')),
      yieldPct: Number(rec.roi_percent || commRow?.gross_yield_pct || spec?.expectedYieldPct || 6.8),
      unitMix: String(rec.unit_mix || `${rec.bedrooms ?? 1}BR ${rec.property_type || 'Residences'}`),
      areaSqft: Number(rec.area_sqft || spec?.areaSqftMin || 0),
      description: String(rec.description || spec?.description || ''),
      amenities,
      features,
      promoHeadline: String(rec.promo_headline || spec?.promoHeadline || ''),
      promoBadge: String(rec.promo_badge || spec?.promoBadge || ''),
      promoBenefits,
      images,
      media,
      payment,
      fees,
      commRow,
      devRow,
      relatedProjects: [] as any[],
      spec,
    }
  }

  if (entity === 'developers') {
    const spec = UAE_DEVELOPERS.find(d => d.code.toLowerCase() === String(rec.code || '').toLowerCase() || d.name.toLowerCase() === String(rec.name || '').toLowerCase())
    const emirate = String(rec.emirate || spec?.emirate || 'Dubai')
    const media = normalizeMediaList(rec.media)
    const images = media.filter(m => m.kind === 'photo').map(m => m.url)
    const amenities = splitLines(rec.amenities_standard).length ? splitLines(rec.amenities_standard) : (spec?.amenitiesStandard || [])
    const flagships = splitLines(rec.flagship_projects).length ? splitLines(rec.flagship_projects) : (spec?.flagshipProjects || [])
    const relatedProjects = q.all<any>(`SELECT id, title, community_id, emirate, price, handover_quarter, is_off_plan, payment_plan FROM properties WHERE developer_ref = ? AND deleted_at IS NULL ORDER BY is_off_plan DESC, id ASC LIMIT 12`, rec.id)
    return {
      title: String(rec.name || 'UAE Developer'),
      subtitle: `${rec.tier || spec?.tier || 'Master Developer'} · ${emirate}, UAE · ${rec.rera_id || spec?.reraId || ''}`,
      projectName: String(rec.short_name || rec.name || ''),
      developerName: String(rec.name || ''),
      communityName: emirate,
      emirate,
      price: 0,
      priceLabel: relatedProjects.length ? `${relatedProjects.length}+ Active UAE Projects` : 'Full UAE Portfolio',
      isOffPlan: true,
      handover: `Founded ${rec.founded_year || spec?.foundedYear || 2005}`,
      yieldPct: 7.0,
      unitMix: String(rec.specialties || spec?.specialties || 'Master Communities & Branded Residences'),
      areaSqft: 0,
      description: String(rec.description || spec?.description || ''),
      amenities,
      features: flagships.map(f => `Flagship: ${f}`),
      promoHeadline: `${rec.name} — Direct Developer Priority Allocation via SWK Properties (0% Buyer Commission)`,
      promoBadge: `${rec.tier || spec?.tier || 'Verified Developer'} · ${emirate}`,
      promoBenefits: [
        `Official RERA / DMT Developer ID: ${rec.rera_id || spec?.reraId || 'Registered'}`,
        `Headquarters: ${rec.headquarters || spec?.headquarters || emirate}`,
        `Direct EOI & Priority Launch Allocation via SWK Properties (RERA ORN ${SWK_RERA_ORN})`,
        `Dedicated Brochures, Payment Plans, 3D Tours & Investor Decks for Every Project`,
      ],
      images: images.length ? images : (spec?.logo ? [spec.logo] : []),
      media,
      payment: { planLabel: 'Developer Milestone Payment Plans (50/50 · 60/40 · 70/30 · 80/20)', rows: [] as PaymentMilestoneRow[] },
      fees: computeEmirateFeeSummary(emirate, 2_000_000),
      commRow: null,
      devRow: rec,
      relatedProjects,
      spec,
    }
  }

  // communities
  const spec = UAE_COMMUNITIES.find(c => c.code.toLowerCase() === String(rec.code || '').toLowerCase() || c.name.toLowerCase() === String(rec.name || '').toLowerCase())
  const emirate = String(rec.emirate || spec?.emirate || 'Dubai')
  const media = normalizeMediaList(rec.media)
  const images = media.filter(m => m.kind === 'photo').map(m => m.url)
  const amenities = splitLines(rec.amenities).length ? splitLines(rec.amenities) : (spec?.amenities || [])
  const landmarks = splitLines(rec.key_landmarks).length ? splitLines(rec.key_landmarks) : (spec?.nearby.landmarks || [])
  const schools = splitLines(rec.schools).length ? splitLines(rec.schools) : (spec?.nearby.schools || [])
  const hospitals = splitLines(rec.hospitals).length ? splitLines(rec.hospitals) : (spec?.nearby.hospitals || [])
  const relatedProjects = q.all<any>(`SELECT id, title, developer_id, emirate, price, handover_quarter, is_off_plan, payment_plan FROM properties WHERE (community_ref = ? OR lower(community_id) = lower(?)) AND deleted_at IS NULL ORDER BY is_off_plan DESC, id ASC LIMIT 12`, rec.id, rec.name || '')
  return {
    title: String(rec.name || 'UAE Community'),
    subtitle: `${rec.segment || spec?.segment || 'Prime'} Community · ${emirate}, UAE · Master Developer: ${rec.master_developer || spec?.masterDeveloper || 'Master Planned'}`,
    projectName: String(rec.name || ''),
    developerName: String(rec.master_developer || spec?.masterDeveloper || ''),
    communityName: String(rec.name || ''),
    emirate,
    price: Number(rec.avg_price_sqft || spec?.ppsf || 0),
    priceLabel: `Avg AED ${Number(rec.avg_price_sqft || spec?.ppsf || 1800).toLocaleString('en-US')}/sq ft`,
    isOffPlan: true,
    handover: `Avg Yield ${Number(rec.gross_yield_pct || spec?.yieldPct || 6.5)}% p.a.`,
    yieldPct: Number(rec.gross_yield_pct || spec?.yieldPct || 6.5),
    unitMix: `${rec.segment || spec?.segment || 'Prime'} · Service Charge ~AED ${rec.service_charge_sqft || spec?.serviceCharge || 15}/sq ft`,
    areaSqft: 0,
    description: String(rec.description || spec?.description || ''),
    amenities,
    features: [
      ...landmarks.slice(0, 3).map(l => `Landmark: ${l}`),
      rec.metro_transit || spec?.nearby.metro ? `Transit: ${rec.metro_transit || spec?.nearby.metro}` : '',
      ...schools.slice(0, 2).map(s => `School: ${s}`),
      ...hospitals.slice(0, 2).map(h => `Healthcare: ${h}`),
    ].filter(Boolean),
    promoHeadline: `${rec.name} (${emirate}) — ${Number(rec.gross_yield_pct || spec?.yieldPct || 6.5)}% Est. Yield · AED ${Number(rec.avg_price_sqft || spec?.ppsf || 1800).toLocaleString('en-US')}/sq ft`,
    promoBadge: `${rec.ticker || spec?.ticker || emirate} · ${rec.segment || spec?.segment || 'Prime'}`,
    promoBenefits: [
      `15-Year Outlook: ${rec.future_outlook || spec?.future15YearOutlook || 'Sustained UAE 2040 growth corridor.'}`,
      `Closing Keywords: ${rec.closing_keywords || spec?.closingKeywords.join(' · ') || 'High Liquidity · Tax-Free Yield'}`,
      `Avg Annual Rent: ${aed(Number(rec.avg_rent_annual || spec?.avgRentAnnual || 120_000))}`,
    ],
    images: images.length ? images : (spec?.image ? [spec.image] : []),
    media,
    payment: { planLabel: 'Off-Plan & Ready Opportunities Available Across Community', rows: [] as PaymentMilestoneRow[] },
    fees: computeEmirateFeeSummary(emirate, 2_000_000),
    commRow: rec,
    devRow: null,
    relatedProjects,
    spec,
  }
}

// ------------------------------------------------------------------ PDF drawing helpers
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const safe = toPdfSafeText(text)
  const words = safe.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      line = test
    } else {
      if (line) lines.push(line)
      line = w
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

function drawFooter(page: PDFPage, font: PDFFont, bold: PDFFont, pageNo: number, totalPages: number) {
  const { width } = page.getSize()
  page.drawRectangle({ x: 36, y: 44, width: width - 72, height: 1, color: rgb(0.78, 0.63, 0.32) })
  page.drawText(toPdfSafeText(`${SWK_COMPANY_NAME} | RERA ORN ${SWK_RERA_ORN} | DET Licence ${SWK_TRADE_LICENSE}`), { x: 36, y: 30, size: 8, font: bold, color: rgb(0.055, 0.227, 0.184) })
  page.drawText(toPdfSafeText(`${SWK_COMPANY_ADDRESS} | ${SWK_COMPANY_PHONE} | ${SWK_COMPANY_EMAIL}`), { x: 36, y: 18, size: 7.5, font, color: rgb(0.32, 0.38, 0.36) })
  const rightTxt = toPdfSafeText(`${SWK_OFFICIAL_WEBSITES_TEXT}   |   Page ${pageNo} of ${totalPages}`)
  const rw = font.widthOfTextAtSize(rightTxt, 7.5)
  page.drawText(rightTxt, { x: width - 36 - rw, y: 30, size: 7.5, font, color: rgb(0.32, 0.38, 0.36) })
}

export async function buildCatalogBrochurePdf(entity: CatalogKitEntity, rec: Record<string, any>): Promise<Buffer> {
  const ctx = resolveEnrichedContext(entity, rec)
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const forest = rgb(0.055, 0.227, 0.184)
  const gold = rgb(0.784, 0.635, 0.325)
  const ivory = rgb(0.973, 0.965, 0.945)
  const ink = rgb(0.11, 0.16, 0.15)
  const muted = rgb(0.35, 0.42, 0.40)

  // Page 1 — Luxury Executive Cover
  const p1 = pdf.addPage([595.28, 841.89])
  p1.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: forest })
  p1.drawRectangle({ x: 0, y: 822, width: 595.28, height: 20, color: gold })
  p1.drawRectangle({ x: 36, y: 748, width: 120, height: 2.5, color: gold })

  p1.drawText(toPdfSafeText(`SWK PROPERTIES OFFICIAL ${entity === 'developers' ? 'DEVELOPER' : entity === 'communities' ? 'COMMUNITY' : 'PROJECT'} BROCHURE`), { x: 36, y: 762, size: 10, font: bold, color: gold })
  let y = 695
  for (const l of wrapText(ctx.title, bold, 28, 520)) {
    p1.drawText(l, { x: 36, y, size: 28, font: bold, color: rgb(1, 1, 1) })
    y -= 36
  }
  for (const l of wrapText(ctx.subtitle, font, 13, 520)) {
    p1.drawText(l, { x: 36, y, size: 13, font, color: rgb(0.89, 0.84, 0.71) })
    y -= 20
  }

  // Highlight KPI band
  p1.drawRectangle({ x: 36, y: 465, width: 523, height: 118, color: rgb(0.086, 0.29, 0.24), borderColor: gold, borderWidth: 1 })
  const kpis = [
    ['PRICE / GUIDE', ctx.priceLabel],
    ['EMIRATE', ctx.emirate],
    ['YIELD / STAGE', ctx.handover || `~${ctx.yieldPct}% Yield`],
    ['REGISTRATION', `${ctx.fees.registrationFeePct}% ${ctx.emirate === 'Abu Dhabi' ? 'ADM' : 'DLD'}`],
  ]
  kpis.forEach(([lbl, val], i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const kx = 54 + col * 255
    const ky = 555 - row * 52
    p1.drawText(toPdfSafeText(lbl), { x: kx, y: ky, size: 8.5, font: bold, color: gold })
    p1.drawText(toPdfSafeText(val).slice(0, 32), { x: kx, y: ky - 18, size: 13, font: bold, color: rgb(1, 1, 1) })
  })

  // Promo Banner
  p1.drawRectangle({ x: 36, y: 340, width: 523, height: 96, color: ivory })
  p1.drawText(toPdfSafeText(ctx.promoBadge || 'SWK PROPERTIES EXCLUSIVE ALLOCATION'), { x: 52, y: 412, size: 9, font: bold, color: rgb(0.54, 0.38, 0.11) })
  let py = 392
  for (const l of wrapText(ctx.promoHeadline || ctx.description, bold, 11.5, 490).slice(0, 3)) {
    p1.drawText(l, { x: 52, y: py, size: 11.5, font: bold, color: forest })
    py -= 16
  }

  // Cover advisory box
  p1.drawText(toPdfSafeText(`Prepared exclusively by ${SWK_COMPANY_NAME}`), { x: 36, y: 135, size: 11, font: bold, color: gold })
  p1.drawText(toPdfSafeText(`RERA ORN ${SWK_RERA_ORN} | DET Licence ${SWK_TRADE_LICENSE} | ${SWK_COMPANY_PHONE}`), { x: 36, y: 116, size: 9.5, font, color: rgb(0.9, 0.9, 0.9) })
  p1.drawText(toPdfSafeText(`${SWK_COMPANY_ADDRESS}`), { x: 36, y: 100, size: 9, font, color: rgb(0.8, 0.85, 0.83) })
  p1.drawText(toPdfSafeText(SWK_OFFICIAL_WEBSITES_TEXT), { x: 36, y: 82, size: 9.5, font: bold, color: gold })

  // Page 2 — Overview, Amenities, Location & Highlights
  const p2 = pdf.addPage([595.28, 841.89])
  p2.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: ivory })
  p2.drawRectangle({ x: 0, y: 780, width: 595.28, height: 62, color: forest })
  p2.drawText(toPdfSafeText(ctx.title), { x: 36, y: 808, size: 16, font: bold, color: rgb(1, 1, 1) })
  p2.drawText(toPdfSafeText('EXECUTIVE OVERVIEW, AMENITIES & INVESTMENT HIGHLIGHTS'), { x: 36, y: 790, size: 8.5, font: bold, color: gold })

  let cy = 750
  p2.drawText('PROJECT & PORTFOLIO OVERVIEW', { x: 36, y: cy, size: 11, font: bold, color: forest })
  cy -= 18
  for (const l of wrapText(ctx.description, font, 10, 520).slice(0, 10)) {
    p2.drawText(l, { x: 36, y: cy, size: 10, font, color: ink })
    cy -= 14.5
  }

  cy -= 14
  p2.drawText('SIGNATURE AMENITIES & LIFESTYLE', { x: 36, y: cy, size: 11, font: bold, color: forest })
  cy -= 18
  ctx.amenities.slice(0, 10).forEach((am, idx) => {
    const col = idx % 2
    const row = Math.floor(idx / 2)
    p2.drawText(toPdfSafeText(`* ${am}`).slice(0, 44), { x: 36 + col * 265, y: cy - row * 16, size: 9.5, font, color: ink })
  })
  cy -= Math.ceil(Math.min(10, ctx.amenities.length) / 2) * 16 + 18

  p2.drawText('KEY SPECIFICATIONS & CONNECTIVITY', { x: 36, y: cy, size: 11, font: bold, color: forest })
  cy -= 18
  for (const feat of ctx.features.slice(0, 8)) {
    for (const l of wrapText(`- ${feat}`, font, 9.5, 520).slice(0, 2)) {
      if (cy < 200) break
      p2.drawText(l, { x: 36, y: cy, size: 9.5, font, color: muted })
      cy -= 14
    }
  }

  cy -= 10
  if (cy > 160) {
    p2.drawText('PROMOTION & INVESTOR ADVANTAGES', { x: 36, y: cy, size: 11, font: bold, color: forest })
    cy -= 18
    for (const b of ctx.promoBenefits.slice(0, 6)) {
      for (const l of wrapText(`+ ${b}`, font, 9.5, 520).slice(0, 2)) {
        if (cy < 80) break
        p2.drawText(l, { x: 36, y: cy, size: 9.5, font, color: ink })
        cy -= 14
      }
    }
  }
  drawFooter(p2, font, bold, 2, 3)

  // Page 3 — Payment Plan / Related Portfolio & UAE Fee Summary
  const p3 = pdf.addPage([595.28, 841.89])
  p3.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: ivory })
  p3.drawRectangle({ x: 0, y: 780, width: 595.28, height: 62, color: forest })
  p3.drawText(toPdfSafeText(`${ctx.title} — FINANCIAL & PORTFOLIO SUMMARY`), { x: 36, y: 808, size: 14, font: bold, color: rgb(1, 1, 1) })
  p3.drawText(toPdfSafeText(`${ctx.fees.authority} | ZERO TAX RENTAL INCOME & CAPITAL GAINS`), { x: 36, y: 790, size: 8.5, font: bold, color: gold })

  let y3 = 745
  if (ctx.payment.rows.length > 0) {
    p3.drawText(toPdfSafeText(`PAYMENT SCHEDULE: ${ctx.payment.planLabel}`), { x: 36, y: y3, size: 10.5, font: bold, color: forest })
    y3 -= 22
    p3.drawRectangle({ x: 36, y: y3 - 4, width: 523, height: 20, color: forest })
    p3.drawText('MILESTONE', { x: 44, y: y3 + 2, size: 8.5, font: bold, color: gold })
    p3.drawText('TIMING', { x: 270, y: y3 + 2, size: 8.5, font: bold, color: gold })
    p3.drawText('%', { x: 415, y: y3 + 2, size: 8.5, font: bold, color: gold })
    p3.drawText('AMOUNT (AED)', { x: 455, y: y3 + 2, size: 8.5, font: bold, color: gold })
    y3 -= 24
    for (const row of ctx.payment.rows) {
      p3.drawText(toPdfSafeText(row.stage).slice(0, 38), { x: 44, y: y3, size: 9, font, color: ink })
      p3.drawText(toPdfSafeText(row.timing).slice(0, 24), { x: 270, y: y3, size: 9, font, color: muted })
      p3.drawText(`${row.pct}%`, { x: 415, y: y3, size: 9, font: bold, color: forest })
      p3.drawText(toPdfSafeText(aed(row.amountAed)), { x: 455, y: y3, size: 9, font: bold, color: ink })
      y3 -= 20
    }
    y3 -= 16
  } else if (ctx.relatedProjects.length > 0) {
    p3.drawText(toPdfSafeText(`FEATURED PROJECTS (${ctx.relatedProjects.length} LINKED IN SWK OS)`), { x: 36, y: y3, size: 10.5, font: bold, color: forest })
    y3 -= 22
    for (const rp of ctx.relatedProjects.slice(0, 12)) {
      const rpPrice = fromCents(rp.price)
      p3.drawText(toPdfSafeText(`* ${rp.title} — ${aed(rpPrice)} (${rp.handover_quarter || (rp.is_off_plan ? 'Off-Plan' : 'Ready')})`).slice(0, 88), { x: 40, y: y3, size: 9.5, font, color: ink })
      y3 -= 17
    }
    y3 -= 16
  }

  // Government Registration & Visa Summary Box
  p3.drawRectangle({ x: 36, y: Math.max(180, y3 - 150), width: 523, height: 145, color: rgb(1, 1, 1), borderColor: gold, borderWidth: 1 })
  const boxTop = Math.max(180, y3 - 150) + 122
  p3.drawText(toPdfSafeText(`${ctx.emirate.toUpperCase()} GOVERNMENT REGISTRATION & GOLDEN VISA GUIDE`), { x: 48, y: boxTop, size: 10, font: bold, color: forest })
  p3.drawText(toPdfSafeText(`Authority: ${ctx.fees.authority}`), { x: 48, y: boxTop - 20, size: 9.5, font, color: ink })
  p3.drawText(toPdfSafeText(`Transfer / Oqood Registration Fee (${ctx.fees.registrationFeePct}%): ${aed(ctx.fees.registrationFeeAed)}`), { x: 48, y: boxTop - 38, size: 9.5, font: bold, color: ink })
  p3.drawText(toPdfSafeText(`Admin & Trustee Estimate: ${aed(ctx.fees.adminFeeAed + ctx.fees.trusteeFeeAed)}   |   Total Closing Fees: ${aed(ctx.fees.totalClosingFeesAed)}`), { x: 48, y: boxTop - 56, size: 9.5, font, color: muted })
  p3.drawText(toPdfSafeText(`10-Year UAE Golden Visa (AED 2M+): ${ctx.fees.goldenVisaEligible ? 'ELIGIBLE' : 'Combine with portfolio to reach AED 2M'}`), { x: 48, y: boxTop - 76, size: 9.5, font: bold, color: forest })
  p3.drawText(toPdfSafeText(`Advisory Desk: ${SWK_COMPANY_NAME} · ${SWK_COMPANY_PHONE} · ${SWK_COMPANY_EMAIL}`), { x: 48, y: boxTop - 98, size: 9, font, color: muted })

  drawFooter(p3, font, bold, 3, 3)

  return Buffer.from(await pdf.save())
}

export async function buildPaymentPlanPdf(rec: Record<string, any>): Promise<Buffer> {
  const ctx = resolveEnrichedContext('properties', rec)
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const forest = rgb(0.055, 0.227, 0.184)
  const gold = rgb(0.784, 0.635, 0.325)
  const ivory = rgb(0.973, 0.965, 0.945)
  const ink = rgb(0.11, 0.16, 0.15)
  const muted = rgb(0.35, 0.42, 0.40)

  const page = pdf.addPage([595.28, 841.89])
  page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: ivory })
  page.drawRectangle({ x: 0, y: 745, width: 595.28, height: 97, color: forest })
  page.drawRectangle({ x: 0, y: 740, width: 595.28, height: 5, color: gold })

  page.drawText('OFFICIAL PAYMENT PLAN & UAE CLOSING FEE SCHEDULE', { x: 36, y: 814, size: 9.5, font: bold, color: gold })
  page.drawText(toPdfSafeText(ctx.title).slice(0, 56), { x: 36, y: 785, size: 20, font: bold, color: rgb(1, 1, 1) })
  page.drawText(toPdfSafeText(`${ctx.subtitle}  |  ${ctx.unitMix}`), { x: 36, y: 762, size: 10, font, color: rgb(0.89, 0.84, 0.71) })

  // Summary KPIs
  let y = 708
  const boxes = [
    ['STARTING PRICE', ctx.priceLabel],
    ['PAYMENT PLAN', ctx.payment.planLabel.split('(')[0].trim()],
    ['HANDOVER', ctx.handover || 'Ready'],
    [`${ctx.emirate === 'Abu Dhabi' ? 'ADM' : 'DLD'} FEE (${ctx.fees.registrationFeePct}%)`, aed(ctx.fees.registrationFeeAed)],
  ]
  boxes.forEach(([k, v], i) => {
    const bx = 36 + i * 132
    page.drawRectangle({ x: bx, y: y - 34, width: 124, height: 52, color: rgb(1, 1, 1), borderColor: gold, borderWidth: 0.8 })
    page.drawText(toPdfSafeText(k), { x: bx + 8, y: y + 2, size: 7.5, font: bold, color: rgb(0.54, 0.38, 0.11) })
    page.drawText(toPdfSafeText(v).slice(0, 18), { x: bx + 8, y: y - 18, size: 10.5, font: bold, color: forest })
  })

  // Milestone Table
  y = 640
  page.drawText('INSTALLMENT & MILESTONE BREAKDOWN', { x: 36, y, size: 11, font: bold, color: forest })
  y -= 22
  page.drawRectangle({ x: 36, y: y - 6, width: 523, height: 22, color: forest })
  page.drawText('#', { x: 44, y: y + 1, size: 8.5, font: bold, color: gold })
  page.drawText('PAYMENT MILESTONE', { x: 64, y: y + 1, size: 8.5, font: bold, color: gold })
  page.drawText('TIMING', { x: 300, y: y + 1, size: 8.5, font: bold, color: gold })
  page.drawText('SHARE', { x: 425, y: y + 1, size: 8.5, font: bold, color: gold })
  page.drawText('AMOUNT (AED)', { x: 472, y: y + 1, size: 8.5, font: bold, color: gold })
  y -= 26

  ctx.payment.rows.forEach((row, idx) => {
    if (idx % 2 === 1) page.drawRectangle({ x: 36, y: y - 6, width: 523, height: 22, color: rgb(0.94, 0.92, 0.88) })
    page.drawText(String(idx + 1), { x: 44, y, size: 9, font: bold, color: forest })
    page.drawText(toPdfSafeText(row.stage).slice(0, 40), { x: 64, y, size: 9, font, color: ink })
    page.drawText(toPdfSafeText(row.timing).slice(0, 22), { x: 300, y, size: 9, font, color: muted })
    page.drawText(`${row.pct}%`, { x: 425, y, size: 9, font: bold, color: forest })
    page.drawText(toPdfSafeText(aed(row.amountAed)), { x: 472, y, size: 9, font: bold, color: ink })
    y -= 23
  })

  // Total row
  page.drawRectangle({ x: 36, y: y - 8, width: 523, height: 24, color: rgb(0.9, 0.86, 0.76) })
  page.drawText('TOTAL PURCHASE PRICE (100%)', { x: 64, y, size: 9.5, font: bold, color: forest })
  page.drawText(toPdfSafeText(aed(ctx.price)), { x: 472, y, size: 10, font: bold, color: forest })
  y -= 42

  // Government Closing Fees + Mortgage Guide
  page.drawText(toPdfSafeText(`${ctx.emirate.toUpperCase()} CLOSING COSTS (${ctx.fees.authority})`), { x: 36, y, size: 11, font: bold, color: forest })
  y -= 20
  const feeLines = [
    [`${ctx.emirate === 'Abu Dhabi' ? 'ADM' : 'DLD'} Registration Fee (${ctx.fees.registrationFeePct}%)`, aed(ctx.fees.registrationFeeAed)],
    ['Title Deed / Oqood Administration Fee', aed(ctx.fees.adminFeeAed)],
    ...(ctx.fees.trusteeFeeAed > 0 ? [['Registration Trustee Office Fee (incl. VAT)', aed(ctx.fees.trusteeFeeAed)]] : []),
    ['Total Estimated Government Closing Costs', aed(ctx.fees.totalClosingFeesAed)],
    ['Grand Total Acquisition Outlay (Price + Closing Fees)', aed(ctx.price + ctx.fees.totalClosingFeesAed)],
  ]
  for (const [label, val] of feeLines) {
    page.drawText(toPdfSafeText(label), { x: 44, y, size: 9.5, font, color: ink })
    page.drawText(toPdfSafeText(val), { x: 430, y, size: 9.5, font: bold, color: forest })
    y -= 18
  }

  y -= 18
  page.drawText('INDICATIVE UAE BANK MORTGAGE BENCHMARK (25-YEAR TENURE @ 3.99% FIXED)', { x: 36, y, size: 10, font: bold, color: forest })
  y -= 18
  const loan = Math.round(ctx.price * 0.8)
  const r = 0.0399 / 12
  const monthly = loan > 0 ? Math.round((loan * r * Math.pow(1 + r, 300)) / (Math.pow(1 + r, 300) - 1)) : 0
  page.drawText(toPdfSafeText(`80% LTV Financing: ${aed(loan)}   |   20% Equity: ${aed(Math.round(ctx.price * 0.2))}   |   Est. Monthly: ${aed(monthly)}/mo`), { x: 44, y, size: 9.5, font, color: ink })
  y -= 18
  page.drawText(toPdfSafeText(`Golden Visa Eligibility: ${ctx.fees.goldenVisaEligible ? 'YES — Qualifies for 10-Year UAE Golden Visa' : ctx.fees.investorVisaEligible ? 'Qualifies for 2-Year Investor Visa (AED 750K+)' : 'Standard Freehold Ownership'}`), { x: 44, y, size: 9.5, font: bold, color: forest })

  drawFooter(page, font, bold, 1, 1)
  return Buffer.from(await pdf.save())
}

export function buildCatalogDeckPptx(entity: CatalogKitEntity, rec: Record<string, any>): Buffer {
  const ctx = resolveEnrichedContext(entity, rec)
  const footer = `${SWK_COMPANY_NAME} · RERA ORN ${SWK_RERA_ORN} · ${SWK_COMPANY_PHONE} · ${SWK_OFFICIAL_WEBSITES_TEXT}`

  const slides: PptxSlideSpec[] = [
    {
      dark: true,
      eyebrow: `SWK PROPERTIES EXCLUSIVE · ${ctx.emirate.toUpperCase()} REAL ESTATE`,
      title: ctx.title,
      subtitle: ctx.subtitle,
      metrics: [
        { label: 'Starting / Guide', value: ctx.priceLabel },
        { label: 'Emirate', value: ctx.emirate },
        { label: 'Handover / Yield', value: ctx.handover || `~${ctx.yieldPct}% Yield` },
        { label: 'Registration', value: `${ctx.fees.registrationFeePct}% ${ctx.emirate === 'Abu Dhabi' ? 'ADM' : 'DLD'}` },
      ],
      footer,
    },
    {
      eyebrow: '01 · EXECUTIVE OVERVIEW',
      title: `Why ${ctx.title}`,
      subtitle: ctx.promoHeadline || ctx.subtitle,
      bullets: [
        ctx.description.slice(0, 260),
        `Unit Mix & Positioning: ${ctx.unitMix}`,
        ...ctx.features.slice(0, 5),
      ],
      footer,
    },
    {
      eyebrow: '02 · PAYMENT PLAN & FINANCIAL STRUCTURE',
      title: `${ctx.emirate} Investment & Fee Breakdown`,
      subtitle: ctx.payment.planLabel,
      metrics: [
        { label: 'Purchase Guide', value: ctx.priceLabel },
        { label: `${ctx.emirate === 'Abu Dhabi' ? 'ADM' : 'DLD'} Fee`, value: `${ctx.fees.registrationFeePct}% (${aed(ctx.fees.registrationFeeAed)})` },
        { label: 'Est. Gross Yield', value: `~${ctx.yieldPct}% p.a.` },
        { label: 'Golden Visa', value: ctx.fees.goldenVisaEligible ? '10-Yr Eligible' : 'AED 2M+ Rule' },
      ],
      bullets: ctx.payment.rows.length
        ? ctx.payment.rows.map(r => `${r.stage} (${r.timing}): ${r.pct}% — ${aed(r.amountAed)}`)
        : ctx.relatedProjects.slice(0, 6).map(rp => `${rp.title} — ${rp.handover_quarter || 'Ready'}`),
      footer,
    },
    {
      eyebrow: '03 · LIFESTYLE, AMENITIES & CONNECTIVITY',
      title: 'Curated Amenities & Community Advantage',
      columns: [
        { heading: 'Signature Amenities', items: ctx.amenities.slice(0, 8) },
        { heading: 'Key Highlights & Access', items: (ctx.features.length ? ctx.features : ctx.promoBenefits).slice(0, 8) },
      ],
      footer,
    },
    {
      eyebrow: '04 · OFF-PLAN LAUNCH & PROMOTION',
      title: ctx.promoBadge || 'Direct Developer Priority Allocation',
      subtitle: 'Zero Buyer Commission · DLD / ADM Escrow Protected · Full Documentation Pack',
      bullets: ctx.promoBenefits,
      footer,
    },
    {
      dark: true,
      eyebrow: '05 · PRIVATE CLIENT ADVISORY DESK',
      title: 'Reserve Your Priority Allocation Today',
      subtitle: `${SWK_COMPANY_NAME} — Your Trusted Dubai & Abu Dhabi Real Estate Partner`,
      bullets: [
        `Direct Advisory Line & WhatsApp: ${SWK_COMPANY_PHONE}`,
        `Official Email: ${SWK_COMPANY_EMAIL}`,
        `Head Office: ${SWK_COMPANY_ADDRESS}`,
        `RERA ORN: ${SWK_RERA_ORN} | DET Trade Licence: ${SWK_TRADE_LICENSE}`,
        `Websites: ${SWK_OFFICIAL_WEBSITES_TEXT}`,
      ],
      footer,
    },
  ]

  assertZeroShabibPublicPayload(slides, `PPTX Deck (${ctx.title})`)
  return buildPptxBuffer(slides)
}

export function buildCatalogSocialKit(entity: CatalogKitEntity, rec: Record<string, any>, shareUrl?: string): SocialKitBundle {
  const ctx = resolveEnrichedContext(entity, rec)
  return generateSocialMediaKit({
    entity,
    title: ctx.title,
    projectName: ctx.projectName,
    developerName: ctx.developerName,
    communityName: ctx.communityName,
    emirate: ctx.emirate,
    priceLabel: ctx.priceLabel,
    paymentPlan: ctx.payment.planLabel,
    handover: ctx.handover,
    yieldPct: ctx.yieldPct,
    unitMix: ctx.unitMix,
    promoBadge: ctx.promoBadge,
    promoHeadline: ctx.promoHeadline,
    amenities: ctx.amenities,
    highlights: ctx.promoBenefits,
    isOffPlan: ctx.isOffPlan,
    shareUrl,
  })
}

export function buildCatalogKitManifest(entity: CatalogKitEntity, rec: Record<string, any>) {
  const id = Number(rec.id)
  const ctx = resolveEnrichedContext(entity, rec)
  const social = buildCatalogSocialKit(entity, rec)
  const base = `/api/catalog-kit/${entity}/${id}`
  const isCustomUrl = (u: unknown) => typeof u === 'string' && u.trim().length > 0 && !u.trim().startsWith('/api/catalog-kit/')
  const uploadedBrochure = isCustomUrl(rec.brochure_url) ? String(rec.brochure_url).trim() : ctx.media.find(m => m.kind === 'brochure' && isCustomUrl(m.url))?.url
  const uploadedPayPlan = isCustomUrl(rec.payment_plan_pdf_url) ? String(rec.payment_plan_pdf_url).trim() : ctx.media.find(m => m.kind === 'payment_plan' && isCustomUrl(m.url))?.url
  const uploadedPpt = isCustomUrl(rec.ppt_url) ? String(rec.ppt_url).trim() : ctx.media.find(m => m.kind === 'ppt' && isCustomUrl(m.url))?.url
  const manifest = {
    entity,
    id,
    title: ctx.title,
    subtitle: ctx.subtitle,
    emirate: ctx.emirate,
    developerName: ctx.developerName,
    communityName: ctx.communityName,
    isOffPlan: ctx.isOffPlan,
    price: ctx.price,
    priceLabel: ctx.priceLabel,
    handover: ctx.handover,
    yieldPct: ctx.yieldPct,
    unitMix: ctx.unitMix,
    amenities: ctx.amenities,
    features: ctx.features,
    images: ctx.images,
    brochureUrl: uploadedBrochure || `${base}/brochure.pdf`,
    generatedBrochureUrl: `${base}/brochure.pdf`,
    paymentPlanUrl: entity === 'properties' ? (uploadedPayPlan || `${base}/payment-plan.pdf`) : null,
    generatedPaymentPlanUrl: entity === 'properties' ? `${base}/payment-plan.pdf` : null,
    pptUrl: uploadedPpt || `${base}/deck.pptx`,
    generatedPptUrl: `${base}/deck.pptx`,
    socialUrl: `${base}/social`,
    videoUrl: rec.video_url || null,
    virtualTourUrl: rec.virtual_tour_url || null,
    model3dUrl: rec.model_3d_url || null,
    floorPlanUrl: rec.floor_plan_url || null,
    promo: {
      badge: ctx.promoBadge,
      headline: ctx.promoHeadline,
      benefits: ctx.promoBenefits,
    },
    paymentBreakdown: ctx.payment,
    emirateFeeSummary: ctx.fees,
    social,
  }
  assertZeroShabibPublicPayload(manifest, `Catalog Kit Manifest (${ctx.title})`)
  return manifest
}
