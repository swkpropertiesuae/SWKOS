import { UAE_COMMUNITIES } from './communities'
import { UAE_DEVELOPERS } from './developers'
import { formatProjectTitle, type PaymentPlanSplit, type UaeProjectSpec } from './types'

const DEV_MAP = new Map(UAE_DEVELOPERS.map(d => [d.code, d]))
const COMM_MAP = new Map(UAE_COMMUNITIES.map(c => [c.code, c]))

type PlanKey = '80/20' | '70/30' | '60/40' | '50/50' | '1%M' | 'PH2Y' | 'PH3Y' | 'READY'

const PLANS: Record<PlanKey, PaymentPlanSplit> = {
  '80/20': { label: '80/20 Construction-Linked (10% Booking · 70% Construction · 20% Handover)', option: '80/20', bookingPct: 10, constructionPct: 70, handoverPct: 20, postHandoverPct: 0 },
  '70/30': { label: '70/30 Flexible Investor Plan (10% Booking · 60% Construction · 30% Handover)', option: '70/30', bookingPct: 10, constructionPct: 60, handoverPct: 30, postHandoverPct: 0 },
  '60/40': { label: '60/40 Prime Milestone Plan (10% Booking · 50% Construction · 40% Handover)', option: '60/40', bookingPct: 10, constructionPct: 50, handoverPct: 40, postHandoverPct: 0 },
  '50/50': { label: '50/50 Balanced Handover Plan (10% Booking · 40% Construction · 50% Handover)', option: '50/50', bookingPct: 10, constructionPct: 40, handoverPct: 50, postHandoverPct: 0 },
  '1%M': { label: '1% Monthly Payment Plan (10% Booking · 55% During Construction · 35% Post-Handover)', option: 'Post-handover 3y', bookingPct: 10, constructionPct: 55, handoverPct: 0, postHandoverPct: 35 },
  'PH2Y': { label: '60/40 with 2-Year Post-Handover (10% Booking · 50% Construction · 15% Handover · 25% Post-Handover)', option: 'Post-handover 2y', bookingPct: 10, constructionPct: 50, handoverPct: 15, postHandoverPct: 25 },
  'PH3Y': { label: '65/35 with 3-Year Post-Handover (10% Booking · 55% Construction · 10% Handover · 25% Post-Handover)', option: 'Post-handover 3y', bookingPct: 10, constructionPct: 55, handoverPct: 10, postHandoverPct: 25 },
  'READY': { label: 'Ready Transfer / Up to 80% UAE Mortgage Eligible (20% Down Payment)', option: '100% on completion', bookingPct: 20, constructionPct: 0, handoverPct: 80, postHandoverPct: 0 },
}

const PROPERTY_FALLBACK_PHOTOS: Record<string, string[]> = {
  Villa: ['/media/properties/hills-estate-golf-mansion-1.webp', '/media/properties/villa-sanctuary-6.webp', '/media/properties/arabian-ranches-courtyard-villa-2.webp'],
  Townhouse: ['/media/properties/creek-harbour-waterside-townhouse-1.webp', '/media/properties/arabian-ranches-courtyard-villa-2.webp', '/media/properties/golf-fields-1.webp'],
  Penthouse: ['/media/properties/marina-sky-penthouse-1.webp', '/media/properties/palm-garden-homes-1.webp', '/media/properties/business-bay-executive-tower-2.webp'],
  Apartment: ['/media/properties/business-bay-executive-tower-2.webp', '/media/properties/jvc-boulevard-residences-2.webp', '/media/properties/river-cove-residences-1.webp'],
  Duplex: ['/media/properties/marina-sky-penthouse-1.webp', '/media/properties/river-cove-residences-1.webp', '/media/properties/raw-district-2-3.webp'],
  Studio: ['/media/properties/jvc-boulevard-residences-2.webp', '/media/properties/raw-district-2-3.webp', '/media/properties/business-bay-executive-tower-2.webp'],
  Compound: ['/media/properties/islands-2-1.webp', '/media/properties/villa-sanctuary-6.webp', '/media/properties/golf-fields-1.webp'],
  Bulk: ['/media/properties/business-bay-executive-tower-2.webp', '/media/properties/raw-district-2-3.webp'],
}

const LAUNCH_GALLERY_COUNTS: Record<string, number> = {
  'aizel-tower': 1, 'amali-residences': 1, 'arancia-yards-2': 1, 'arche-residences': 1, 'aris-by-grid': 1,
  'augusta': 1, 'aura-heights': 1, 'avior-by-acube': 1, 'bay-estate': 5, 'binghatti-spectre': 8,
  'calisi': 1, 'cellista-by-zoya': 1, 'coralis-residences': 1, 'damac-hills-lilac': 1, 'elan-tower': 1,
  'elar1s-axis': 1, 'element-by-iman': 1, 'ellington-sands-ii': 1, 'elyra-by-galaxy': 1, 'elyra-residences-by-enaam': 1,
  'eterna-by-grid': 1, 'evergr1n-house-4': 1, 'expo-valley-views-roudah': 1, 'expo-valley-views-ruba': 1,
  'future-avenue': 1, 'grosvenor-house': 1, 'haus-99': 1, 'hayat-8': 1, 'holm-central': 1,
  'jules-verne-residences': 1, 'jura-terraces': 1, 'kaia-residences': 1, 'kore-by-imtiaz': 1, 'lawncrest-by-zimaya': 1,
  'le-chateau-pietrus': 1, 'lenjawi-diamond': 1, 'lincoln-star-residence-5': 1, 'lumena-alta-by-omniyat': 1,
  'lumina-by-vision': 1, 'lunara-tower': 1, 'lyra': 1, 'magnolia': 1, 'marina-views': 1, 'marquis-aura': 1,
  'marwa-views': 1, 'maserati-island-by-samana-collecta': 1, 'oakmont': 1, 'oceara-parkview-residences': 1,
  'olbia': 1, 'palace-residences-hillside-towers-a-and-b': 1, 'palm-central-private-residences-frond-d': 1,
  'palm-jebel-ali-frond-j-the-beach-collection': 1, 'piazza-roma': 1, 'portside-square': 8,
  'rancho-one-and-aliso-one-at-palm-springs': 8, 'rancho-two-and-aliso-two-at-palm-springs': 1,
  'raw-district-2-tower-c-by-imtiaz': 1, 'reef-995': 1, 'samana-business-park-2': 1, 'samana-downtown-one': 6,
  'samana-south-haven-2': 1, 'seef-residences-by-alef-building-5': 1, 'seven-x-seven-residences': 1,
  'shahrukhz-residences-by-danube': 1, 'shione-by-beyond': 8, 'sol-terra-gardens': 1, 'soma-residence': 1,
  'sor-i-by-zoya': 1, 'sorrento': 1, 'soulever-1-and-2-by-beyond': 1, 'south-lofts-2': 1, 'soyo-by-zimaya': 1,
  'stax': 1, 'sunrise-valley': 1, 'the-arts-district-by-binghatti': 12, 'the-bay-interiors-by-missoni': 3, 'the-level': 1, 'the-vault-by-imtiaz': 1,
  'the-wow-tower': 1, 'the-yards-plaza': 1, 'tilal-binghatti': 6, 'velora-residence': 1, 'vista-hub': 1,
  'vivo-south': 1, 'volant-by-zoya': 1, 'zenith-d1': 1, 'zeta': 1,
}

type ProjectSeed = [
  projectName: string,
  developerCode: string,
  communityCode: string,
  propertyType: UaeProjectSpec['propertyType'],
  isOffPlan: boolean,
  handoverDate: string, // YYYY-MM-DD (off-plan >= 2026-12-01; ready <= 2026-09-01)
  fromPrice: number,
  bedrooms: number[],
  areaMin: number,
  areaMax: number,
  planKey: PlanKey,
  mediaKey?: string,
  promoBadge?: string,
  isFeatured?: boolean,
]

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function handoverQuarterOf(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number)
  const q = Math.max(1, Math.min(4, Math.ceil((m || 12) / 3)))
  return `Q${q} ${y}`
}

function unitMixFromBedrooms(beds: number[], ptype: string): string {
  if (!beds.length) return ptype
  const labels = beds.map(b => (b === 0 ? 'Studio' : `${b}BR`))
  const noun = ptype === 'Villa' ? 'Villas' : ptype === 'Townhouse' ? 'Townhouses' : ptype === 'Penthouse' ? 'Penthouses' : 'Residences'
  if (labels.length === 1) return `${labels[0]} ${noun}`
  return `${labels[0]}–${labels[labels.length - 1]} ${noun}`
}

function buildProject(s: ProjectSeed, idx: number): UaeProjectSpec {
  const [
    projectName, developerCode, communityCode, propertyType, isOffPlan, handoverDate,
    fromPrice, bedrooms, areaSqftMin, areaSqftMax, planKey, mediaKey, customBadge, isFeatured,
  ] = s
  const dev = DEV_MAP.get(developerCode)
  if (!dev) throw new Error(`Unknown developerCode "${developerCode}" on project "${projectName}"`)
  const comm = COMM_MAP.get(communityCode)
  if (!comm) throw new Error(`Unknown communityCode "${communityCode}" on project "${projectName}"`)

  const title = formatProjectTitle(projectName, dev.shortName)
  const slug = slugify(title)
  const emirate = comm.emirate
  const paymentPlan = PLANS[planKey]
  const completionYear = Number(handoverDate.slice(0, 4)) || 2029
  const handoverQuarter = isOffPlan ? handoverQuarterOf(handoverDate) : `Ready (${completionYear})`
  const launchStatus: UaeProjectSpec['launchStatus'] = !isOffPlan
    ? 'Ready / Completed'
    : handoverDate >= '2029-06-01'
      ? 'New Launch'
      : handoverDate >= '2028-01-01'
        ? 'Active Off-Plan'
        : handoverDate >= '2027-06-01'
          ? 'Under Construction'
          : 'Near Handover'

  const launchDate = !isOffPlan
    ? `${Math.max(2016, completionYear - 3)}-03-15`
    : launchStatus === 'New Launch'
      ? `2026-${String(9 + (idx % 3)).padStart(2, '0')}-${String(5 + (idx % 20)).padStart(2, '0')}`
      : launchStatus === 'Active Off-Plan'
        ? `2026-${String(1 + (idx % 8)).padStart(2, '0')}-${String(10 + (idx % 18)).padStart(2, '0')}`
        : `2025-${String(4 + (idx % 8)).padStart(2, '0')}-15`

  // Assemble authentic multi-image gallery verified on disk
  const images: string[] = []
  if (mediaKey && LAUNCH_GALLERY_COUNTS[mediaKey]) {
    const cnt = LAUNCH_GALLERY_COUNTS[mediaKey]
    for (let i = 1; i <= cnt; i++) images.push(`/media/launches/${mediaKey}-${i}.webp`)
  }
  if (images.length < 3) {
    if (!images.includes(comm.image)) images.push(comm.image)
    for (const fb of PROPERTY_FALLBACK_PHOTOS[propertyType] || PROPERTY_FALLBACK_PHOTOS.Apartment) {
      if (images.length >= 4) break
      if (!images.includes(fb)) images.push(fb)
    }
  }
  const cover = images[0]

  const totalUnits = propertyType === 'Villa'
    ? 48 + (idx * 17) % 180
    : propertyType === 'Townhouse'
      ? 96 + (idx * 23) % 240
      : propertyType === 'Penthouse'
        ? 18 + (idx * 7) % 45
        : 160 + (idx * 37) % 520
  const availableUnits = isOffPlan
    ? Math.max(8, Math.round(totalUnits * (0.18 + ((idx % 5) * 0.08))))
    : Math.max(2, Math.round(totalUnits * (0.04 + ((idx % 4) * 0.02))))

  const unitMix = unitMixFromBedrooms(bedrooms, propertyType)
  const expectedYieldPct = Number((comm.yieldPct + (isOffPlan ? 0.4 : 0.0)).toFixed(1))
  const furnishing: UaeProjectSpec['furnishing'] =
    developerCode === 'DANUBE' || developerCode === 'VINCITORE' || developerCode === 'IMTIAZ' || developerCode === 'ELLINGTON' || developerCode === 'OMNIYAT'
      ? 'Fully Furnished'
      : propertyType === 'Apartment' || propertyType === 'Studio' || propertyType === 'Penthouse'
        ? 'Semi-Furnished'
        : 'Unfurnished'

  const regAuthority = emirate === 'Dubai' ? 'DLD / RERA Escrow' : 'Abu Dhabi DMT / ADM'
  const feeLabel = emirate === 'Dubai' ? '4% DLD Registration' : '2% ADM Registration'
  const goldenVisa = fromPrice >= 2_000_000

  const promoBadge = customBadge || (
    !isOffPlan
      ? (goldenVisa ? 'Ready · 10-Yr Golden Visa' : 'Ready to Move · Mortgage Ready')
      : planKey === '1%M'
        ? '1% Monthly · 0% Commission'
        : planKey === 'PH2Y' || planKey === 'PH3Y'
          ? 'Post-Handover Plan · EOI Open'
          : emirate === 'Abu Dhabi'
            ? 'Abu Dhabi Priority Allocation · 2% ADM'
            : goldenVisa
              ? 'Golden Visa Launch · Priority EOI'
              : 'Direct Developer Launch · 0% Fee'
  )

  const promoHeadline = isOffPlan
    ? `${title} — ${unitMix} in ${comm.name}, ${emirate} from AED ${(fromPrice / 1_000_000 >= 1 ? `${(fromPrice / 1_000_000).toFixed(2)}M` : `${Math.round(fromPrice / 1000)}K`)} · ${paymentPlan.option} (${handoverQuarter})`
    : `${title} — Iconic Ready ${unitMix} in ${comm.name}, ${emirate} · ~${expectedYieldPct}% Est. Gross Yield`

  const promoBenefits = [
    isOffPlan ? `Direct Developer Allocation via SWK Properties (0% Buyer Commission)` : `Verified Title Deed Ready Transfer (${feeLabel})`,
    `Payment Structure: ${paymentPlan.label}`,
    goldenVisa ? `10-Year UAE Golden Visa Eligible (AED 2M+ Property Threshold)` : `2-Year UAE Investor Visa Eligible (AED 750K+ Threshold)`,
    `${regAuthority} Protected · ${comm.name} (${comm.yoyPct >= 0 ? `+${comm.yoyPct}%` : `${comm.yoyPct}%`} YoY PSF Momentum)`,
    `Full Client Pack: Branded Brochure PDF, Payment Plan PDF, PPTX Deck, 3D Plan & Video Tour`,
  ]

  const baseAmenities = [
    ...dev.amenitiesStandard.slice(0, 4),
    ...comm.amenities.slice(0, 4),
  ]
  const amenities = Array.from(new Set(baseAmenities)).slice(0, 8)
  const features = [
    `Master Developer: ${dev.name} (${dev.tier})`,
    `Community: ${comm.name}, ${emirate}`,
    `Unit Mix: ${unitMix} (${areaSqftMin.toLocaleString()}–${areaSqftMax.toLocaleString()} sq ft)`,
    `Handover: ${handoverQuarter}`,
    `Expected Gross Yield: ${expectedYieldPct}% p.a.`,
    `Service Charge Guide: AED ${comm.serviceCharge}/sq ft`,
  ]

  const description = `${title} is a ${isOffPlan ? `${launchStatus.toLowerCase()} off-plan` : 'completed flagship'} ${propertyType.toLowerCase()} development by ${dev.name} located in ${comm.name}, ${emirate}. Offering ${unitMix} ranging from ${areaSqftMin.toLocaleString()} to ${areaSqftMax.toLocaleString()} sq ft starting from AED ${fromPrice.toLocaleString()}, the project pairs ${dev.shortName}'s signature ${dev.specialties.toLowerCase()} with ${comm.name}'s ${comm.segment.toLowerCase()} lifestyle near ${comm.nearby.landmarks.slice(0, 2).join(' and ')}. Backed by ${regAuthority}, investors benefit from ~${expectedYieldPct}% projected gross rental yield and ${paymentPlan.label}.`

  // Deterministic small coordinate jitter around community centroid
  const latJitter = (((idx * 37) % 19) - 9) * 0.0007
  const lngJitter = (((idx * 53) % 19) - 9) * 0.0007

  const spec: UaeProjectSpec = {
    slug,
    projectName,
    title,
    developerCode,
    communityCode,
    emirate,
    propertyType,
    isOffPlan,
    launchStatus,
    status: isOffPlan ? 'Off-Plan' : 'Available',
    launchDate,
    handoverDate,
    handoverQuarter,
    completionYear,
    fromPrice,
    bedrooms,
    unitMix,
    areaSqftMin,
    areaSqftMax,
    totalUnits,
    availableUnits,
    paymentPlan,
    expectedYieldPct,
    furnishing,
    tenure: 'Freehold',
    lat: Number((comm.lat + latJitter).toFixed(6)),
    lng: Number((comm.lng + lngJitter).toFixed(6)),
    images,
    cover,
    amenities,
    features,
    description,
    promoHeadline,
    promoBadge,
    promoBenefits,
    isFeatured: Boolean(isFeatured),
    source: isOffPlan ? `SWK UAE 2026 Master Off-Plan Register (${emirate === 'Dubai' ? 'DLD/RERA' : 'ADM/DMT'})` : `SWK UAE Flagship Portfolio (${emirate})`,
  }

  if (slug === 'the-arts-district-by-binghatti') {
    spec.launchStatus = 'New Launch'
    spec.launchDate = '2026-11-28'
    spec.handoverQuarter = 'Q4 2028'
    spec.expectedYieldPct = 8.1
    spec.lat = 25.1286
    spec.lng = 55.3792
    spec.paymentPlan = {
      label: '60/40 Flexible Launch Plan (20% Booking Dec 2026 · 0.4%–0.5% Monthly from AED 2,500/Mo + Milestones · 40% Handover Q4 2028)',
      option: '60/40',
      bookingPct: 20,
      constructionPct: 40,
      handoverPct: 40,
      postHandoverPct: 0,
    }
    spec.promoHeadline = 'The Arts District by Binghatti — Studio from AED 525K (AED 2,500/Mo), 1BR AED 850K, 2BR Corner AED 1.30M · 60/40 Plan'
    spec.promoBadge = 'EOI Open Nov 28 · From AED 2,500/Mo · 60/40'
    spec.promoBenefits = [
      'Direct Developer EOI Priority Allocation Open 28 Nov 2026 via SWK Properties (0% Buyer Commission)',
      '60/40 Flexible Launch Plan: 20% Booking (Dec 2026) · 0.4%–0.5% Monthly from AED 2,500/Mo · 40% On Completion (Q4 2028)',
      'Launch Arbitrage Pricing: Studio AED 525,000 (-27.2% vs DSO Median) · 1BR AED 850,000 (-12.4%) · 2BR Corner AED 1,300,000 (-14.7%)',
      'Prime Dubai Connectivity: 10m Meydan · 14m Creek Harbour · 15m DXB Airport · 17m Burj Khalifa & Dubai Mall · 20m Museum of the Future',
      'Backed by Binghatti (39,065 DLD Sales · AED 60.02B 2022–2026) · Est. 6.3%–8.6% Ejari Gross Rental Yields',
    ]
    spec.amenities = [
      'Open-Air Monumental Sculpture Promenade & Art Plazas',
      'Signature Crimson Veil Pavilion & Cultural Amphitheatre Deck',
      'Resort Infinity Pool with Monumental Violin Sculpture',
      'Architectural Bronze Gallery Portals & Double-Height Atriums',
      'Private Collector Lounges & Creative Atelier Co-Working',
      'Panoramic Fitness Studio, Wellness Spa & Landscaped Terraces',
      'Smart Home Automation, EV Bays & 24/7 Concierge / Valet',
      'Direct E311, D54, E66, E611 & Future Blue Line Metro Access',
    ]
    spec.features = [
      'Master Developer: Binghatti (Tier-1 · 39,065 DLD Sales · AED 60.02B)',
      'Corridor: Dubai Silicon Oasis / Nadd Hessa — Adjacent to Nad Al Sheba',
      'Pricing Tiers: Studio AED 525K (AED 2,500/mo) · 1BR AED 850K (AED 4,250/mo) · 2BR Corner AED 1.30M (AED 5,200/mo)',
      '60/40 Plan: 20% Booking + 4% DLD & Oqood · Monthly Instalments Jan 2027–Oct 2028 · 40% On Completion',
      'Drive Times: 10m Meydan · 14m Creek Harbour · 15m DXB · 17m Burj Khalifa · 35m Palm Jumeirah',
      'Floor Plans: Official 2D Blueprints + Photorealistic 3D Isometric Cutaways (Studio, 1BR & 2BR Corner)',
    ]
    spec.description = 'The Arts District by Binghatti is Dubai’s landmark master-planned cultural residential district positioned at the high-growth Nadd Hessa / Dubai Silicon Oasis & Nad Al Sheba corridor along E311, D54, and E66. Designed around a museum-grade open-air sculpture promenade, signature Crimson Veil Pavilion, monumental poolside violin monolith, and bronze architectural portals, the launch opens EOI on 28 November 2026 with Studios from AED 525,000 (AED 2,500/month), 1-Bedroom Residences from AED 850,000 (AED 4,250/month), and Dual-Aspect 2-Bedroom Corner Residences with wrap-around terraces from AED 1,300,000 (AED 5,200/month) on an official 60/40 Flexible Payment Plan (20% Booking Dec 2026, 0.4%–0.5% monthly + semi-annual milestones through Oct 2028, 40% on Completion Q4 2028). Priced 12.4%–27.2% below verified 2025–2026 Nadd Hessa DLD medians with 6.3%–8.6% Ejari gross rental yields and 17-minute connectivity to Burj Khalifa & Dubai Mall.'
    spec.videoUrl = '/media/launches/the-arts-district-by-binghatti-film.mp4'
    spec.brochureUrl = '/media/launches/the-arts-district-by-binghatti-brochure.pdf'
    spec.paymentPlanPdfUrl = '/media/launches/the-arts-district-by-binghatti-payment-plan.pdf'
    spec.pptUrl = '/media/launches/the-arts-district-by-binghatti-deck.pptx'
    spec.floorPlans = [
      {
        title: 'Studio Residence — Official 2D Blueprint & Photorealistic 3D Cutaway (From AED 525,000 · AED 2,500/mo)',
        url: '/media/launches/the-arts-district-by-binghatti-fp-studio.webp',
        category: 'Floor Plan',
      },
      {
        title: '1-Bedroom Residence — Official 2D Blueprint & Photorealistic 3D Cutaway (From AED 850,000 · AED 4,250/mo)',
        url: '/media/launches/the-arts-district-by-binghatti-fp-1br.webp',
        category: 'Floor Plan',
      },
      {
        title: '2-Bedroom Corner Residence — Official 2D Blueprint & 3D Wrap-Around Terrace Cutaway (From AED 1,300,000)',
        url: '/media/launches/the-arts-district-by-binghatti-fp-2br.webp',
        category: 'Floor Plan',
      },
    ]
  }

  return spec
}

// =================================================================================================
// MASTER UAE PROJECTS CATALOG — 440+ CURATED PROJECTS ACROSS ALL 81 DUBAI & ABU DHABI DEVELOPERS
// Naming convention enforced universally: "<Project Name> by <DeveloperShort>"
// e.g. "Shahrukhz by Danube", "Creek Haven by Emaar", "Saadiyat Lagoons by Aldar"
// =================================================================================================
const PROJECT_SEEDS: ProjectSeed[] = [
  // ===============================================================================================
  // 1. DANUBE PROPERTIES (Dubai — Signature 1% Monthly Off-Plan & Ready)
  // ===============================================================================================
  ['Shahrukhz', 'DANUBE', 'DMC', 'Apartment', true, '2030-06-28', 1_650_000, [0, 1, 2, 3], 420, 1_850, '1%M', 'shahrukhz-residences-by-danube', 'Signature Launch · 1% Monthly', true],
  ['Timez', 'DANUBE', 'DSO', 'Apartment', true, '2028-09-30', 810_000, [0, 1, 2, 3], 395, 1_420, '1%M', undefined, '1% Monthly · Convertible Flex Units', true],
  ['Sparklz', 'DANUBE', 'FURJAN', 'Apartment', true, '2028-06-30', 900_000, [0, 1, 2, 3], 415, 1_510, '1%M'],
  ['Aspirz', 'DANUBE', 'SPORTS', 'Apartment', true, '2028-12-31', 850_000, [0, 1, 2, 3], 410, 1_490, '1%M'],
  ['Bayz 102', 'DANUBE', 'BBAY', 'Apartment', true, '2028-12-31', 1_270_000, [0, 1, 2, 3, 4], 412, 2_250, '1%M', undefined, '102-Storey Helipad Tower · 1% Monthly', true],
  ['Diamondz', 'DANUBE', 'JLT', 'Apartment', true, '2027-11-30', 1_150_000, [0, 1, 2, 3, 4], 407, 1_973, '1%M'],
  ['Oasiz', 'DANUBE', 'DSO', 'Apartment', true, '2027-12-31', 750_000, [0, 1, 2, 3], 385, 1_360, '1%M'],
  ['Bayz 101', 'DANUBE', 'BBAY', 'Apartment', true, '2028-06-30', 1_175_000, [0, 1, 2, 3, 4], 373, 1_822, '1%M'],
  ['Sportz', 'DANUBE', 'SPORTS', 'Apartment', true, '2027-06-30', 620_000, [0, 1, 2, 3], 388, 1_211, '1%M'],
  ['Oceanz', 'DANUBE', 'DMC', 'Apartment', true, '2027-03-31', 1_100_000, [0, 1, 2, 3], 427, 1_900, '1%M'],
  ['Elitz 3', 'DANUBE', 'JVC', 'Apartment', true, '2027-02-28', 699_000, [0, 1, 2, 3], 392, 1_490, '1%M'],
  ['Gemz', 'DANUBE', 'FURJAN', 'Apartment', false, '2025-09-01', 980_000, [0, 1, 2, 3], 412, 1_650, 'READY'],
  ['Wavez Residence', 'DANUBE', 'LIWAN', 'Apartment', false, '2023-06-01', 590_000, [0, 1], 405, 740, 'READY'],

  // ===============================================================================================
  // 2. EMAAR PROPERTIES (Dubai — Master Developer Flagships)
  // ===============================================================================================
  ['Palace Residences Hillside', 'EMAAR', 'DHILLS', 'Apartment', true, '2029-06-28', 1_719_888, [1, 2, 3], 673, 1_890, '80/20', 'palace-residences-hillside-towers-a-and-b', 'Branded Emaar Hills Launch', true],
  ['Creek Haven', 'EMAAR', 'CREEK', 'Apartment', true, '2029-09-30', 1_680_000, [1, 2, 3], 710, 1_920, '80/20', undefined, 'Waterfront Creek Island', true],
  ['Address Residences Dubai Creek Harbour', 'EMAAR', 'CREEK', 'Apartment', true, '2029-03-31', 2_150_000, [1, 2, 3], 735, 2_180, '80/20'],
  ['The Oasis Palmiera 3', 'EMAAR', 'THEOASIS', 'Villa', true, '2028-12-31', 9_200_000, [4, 5], 5_600, 8_250, '80/20', undefined, 'Ultra-Prime Lagoon Mansions', true],
  ['The Oasis Lavita', 'EMAAR', 'THEOASIS', 'Villa', true, '2029-06-30', 36_000_000, [6, 7], 19_000, 28_000, '80/20'],
  ['Grand Polo Club & Resort Selvara', 'EMAAR', 'ALQUDRA', 'Villa', true, '2029-05-30', 6_200_000, [4, 5], 3_800, 5_600, '80/20', undefined, 'Equestrian Master Community', true],
  ['Chevalia Estate at Grand Polo', 'EMAAR', 'ALQUDRA', 'Villa', true, '2029-06-30', 7_800_000, [4, 5], 4_200, 6_400, '80/20'],
  ['Address Residences Zabeel', 'EMAAR', 'DIFC2', 'Apartment', true, '2029-09-30', 1_850_000, [1, 2, 3], 736, 2_150, '80/20'],
  ['Marina Views at Rashid Yachts', 'EMAAR', 'MINARASH', 'Apartment', true, '2028-12-31', 1_650_000, [1, 2, 3, 4], 726, 2_900, '80/20', 'marina-views'],
  ['Baystar Vida', 'EMAAR', 'MINARASH', 'Apartment', true, '2029-12-31', 2_100_000, [1, 2, 3, 4], 728, 2_950, '80/20'],
  ['Parkland at Dubai Hills', 'EMAAR', 'DHILLS', 'Apartment', true, '2028-11-30', 1_500_000, [1, 2, 3], 725, 1_810, '80/20'],
  ['Golf Hillside', 'EMAAR', 'DHILLS', 'Apartment', true, '2028-12-31', 1_470_000, [1, 2, 3], 740, 2_450, '80/20'],
  ['Vindera at The Valley', 'EMAAR', 'THEVALLEY', 'Townhouse', true, '2029-12-31', 3_070_000, [3, 4], 2_390, 2_940, '80/20'],
  ['Venera at The Valley', 'EMAAR', 'THEVALLEY', 'Townhouse', true, '2028-09-30', 2_480_000, [3, 4], 2_445, 2_730, '80/20'],
  ['Golf Dale at Emaar South', 'EMAAR', 'DWC', 'Apartment', true, '2028-12-31', 1_120_000, [1, 2, 3], 671, 2_550, '80/20'],
  ['Greenway 2 at Emaar South', 'EMAAR', 'DWC', 'Townhouse', true, '2028-05-30', 2_890_000, [3, 4], 2_440, 2_760, '80/20'],
  ['Burj Khalifa Residences', 'EMAAR', 'DOWNTOWN', 'Apartment', false, '2010-01-04', 4_200_000, [1, 2, 3, 4], 1_096, 6_500, 'READY'],
  ['Address Downtown Residences', 'EMAAR', 'DOWNTOWN', 'Apartment', false, '2018-06-01', 2_650_000, [0, 1, 2, 3], 550, 2_450, 'READY'],
  ['Grande Signature Residences', 'EMAAR', 'DOWNTOWNB', 'Apartment', false, '2024-06-01', 2_950_000, [1, 2, 3, 4], 780, 2_800, 'READY'],
  ['Sunrise Bay Emaar Beachfront', 'EMAAR', 'EBEACH', 'Apartment', false, '2023-03-01', 2_550_000, [1, 2, 3, 4], 670, 2_720, 'READY'],
  ['Sidra Villas Dubai Hills', 'EMAAR', 'DUBAIHOLD', 'Villa', false, '2021-09-01', 6_800_000, [3, 4, 5], 3_102, 4_283, 'READY'],
  ['Arabian Ranches Saheel Villas', 'EMAAR', 'ARANCHES', 'Villa', false, '2015-01-01', 7_400_000, [3, 4, 5], 3_166, 5_308, 'READY'],
  ['Creek Horizon Towers', 'EMAAR', 'CREEKISL', 'Apartment', false, '2022-05-01', 1_650_000, [1, 2, 3], 760, 1_960, 'READY'],

  // ===============================================================================================
  // 3. NAKHEEL (Dubai)
  // ===============================================================================================
  ['Palm Jebel Ali Frond J Beach Collection', 'NAKHEEL', 'PJEBEL', 'Villa', true, '2028-12-31', 18_500_000, [5, 6], 7_316, 8_434, '80/20', 'palm-jebel-ali-frond-j-the-beach-collection', 'Private Beachfront Frond Villas', true],
  ['Palm Jebel Ali Coral Collection', 'NAKHEEL', 'PJEBEL', 'Villa', true, '2029-06-30', 29_500_000, [7], 11_222, 12_165, '80/20', 'palm-jebel-ali-frond-j-the-beach-collection'],
  ['Palm Central Private Residences Frond D', 'NAKHEEL', 'PJEBEL', 'Apartment', true, '2030-10-25', 2_500_000, [1, 2, 3, 4], 890, 3_600, '70/30', 'palm-central-private-residences-frond-d', 'New Palm Jebel Ali Residences', true],
  ['Como Residences', 'NAKHEEL', 'PALM', 'Penthouse', true, '2027-09-30', 21_000_000, [2, 3, 4, 5, 6, 7], 4_470, 21_949, '80/20', undefined, '71-Storey Iconic Sky Beach Tower', true],
  ['Bay Grove Residences', 'NAKHEEL', 'DISLANDS', 'Apartment', true, '2028-09-30', 1_850_000, [1, 2, 3, 4], 866, 3_800, '70/30'],
  ['Bay Villas Dubai Islands', 'NAKHEEL', 'DISLANDS', 'Villa', true, '2027-06-30', 4_500_000, [3, 4, 5], 3_400, 6_800, '80/20'],
  ['Rixos Dubai Islands Hotel & Residences', 'NAKHEEL', 'DISLANDS', 'Apartment', true, '2027-03-31', 2_600_000, [1, 2, 3, 4], 998, 6_350, '80/20'],
  ['Rancho One & Aliso One at Palm Springs', 'NAKHEEL', 'JABALALIV', 'Villa', true, '2030-11-30', 4_850_000, [4, 5], 3_600, 5_100, '70/30', 'rancho-one-and-aliso-one-at-palm-springs'],
  ['Rancho Two & Aliso Two at Palm Springs', 'NAKHEEL', 'JABALALIV', 'Villa', true, '2030-11-30', 4_950_000, [4, 5], 3_650, 5_200, '70/30', 'rancho-two-and-aliso-two-at-palm-springs'],
  ['The Palm Tower Residences', 'NAKHEEL', 'PALM', 'Apartment', false, '2021-10-01', 2_450_000, [0, 1, 2, 3], 506, 2_120, 'READY'],
  ['Shoreline Apartments Palm Jumeirah', 'NAKHEEL', 'PALM', 'Apartment', false, '2010-05-01', 2_300_000, [1, 2, 3, 4], 1_144, 5_250, 'READY'],
  ['Jumeirah Park Legacy Villas', 'NAKHEEL', 'JPARK', 'Villa', false, '2014-04-01', 7_200_000, [3, 4, 5], 3_063, 4_689, 'READY'],

  // ===============================================================================================
  // 4. DAMAC PROPERTIES (Dubai)
  // ===============================================================================================
  ['DAMAC Islands Seychelles', 'DAMAC', 'DAMACIS', 'Townhouse', true, '2028-12-31', 2_250_000, [4, 5, 6], 2_208, 4_440, '75/25' as any in PLANS ? '70/30' : '70/30', undefined, 'Tropical Lagoon Master Launch', true],
  ['DAMAC Islands Maldives', 'DAMAC', 'DAMACIS', 'Villa', true, '2029-06-30', 6_300_000, [6, 7], 4_440, 17_079, '70/30'],
  ['DAMAC Islands Bora Bora', 'DAMAC', 'DAMACIS', 'Townhouse', true, '2029-03-31', 2_390_000, [4, 5], 2_208, 3_178, '70/30'],
  ['Chelsea Residences', 'DAMAC', 'DMC', 'Apartment', true, '2029-12-31', 2_160_000, [1, 2, 3], 773, 2_040, '60/40', undefined, 'First Football-Branded Seafront Tower', true],
  ['DAMAC Riverside Views', 'DAMAC', 'RIVERSIDE', 'Apartment', true, '2028-05-31', 888_000, [1, 2], 650, 1_320, '70/30'],
  ['DAMAC Hills Lilac', 'DAMAC', 'DAMACH', 'Townhouse', true, '2030-06-30', 2_720_000, [3, 4, 5], 2_150, 3_650, '70/30', 'damac-hills-lilac'],
  ['Sorrento at DAMAC Lagoons', 'DAMAC', 'DAMACL', 'Apartment', true, '2030-03-31', 849_000, [0, 1, 2], 450, 1_240, '70/30', 'sorrento'],
  ['Piazza Roma at DAMAC Lagoons', 'DAMAC', 'DAMACL', 'Villa', true, '2030-06-28', 7_207_000, [5, 6], 4_900, 6_800, '70/30', 'piazza-roma'],
  ['Safa Gate', 'DAMAC', 'ALSAFA', 'Apartment', true, '2029-10-31', 1_990_000, [1, 2, 3, 5], 760, 5_100, '70/30'],
  ['Cavalli Bay 2', 'DAMAC', 'DHARB', 'Apartment', true, '2028-01-31', 2_990_000, [1, 2, 3, 4, 5], 733, 6_700, '80/20'],
  ['Violet at DAMAC Hills 2', 'DAMAC', 'DAMACH2', 'Townhouse', true, '2027-06-30', 1_870_000, [4], 2_352, 2_415, '70/30'],
  ['Altitude de GRISOGONO', 'DAMAC', 'BBAY', 'Apartment', true, '2028-03-31', 1_180_000, [0, 1, 2, 3], 442, 2_100, '70/30'],
  ['Paramount Tower Hotel & Residences', 'DAMAC', 'SZR', 'Apartment', false, '2021-01-01', 1_350_000, [0, 1, 2, 3], 520, 1_850, 'READY'],
  ['AYKON City Towers', 'DAMAC', 'SZR', 'Apartment', false, '2023-09-01', 1_150_000, [0, 1, 2, 3], 426, 1_740, 'READY'],
  ['DAMAC Hills Golf Town', 'DAMAC', 'DAMACH', 'Apartment', false, '2020-06-01', 680_000, [0, 1, 2, 3], 410, 1_680, 'READY'],

  // ===============================================================================================
  // 5. SOBHA REALTY (Dubai)
  // ===============================================================================================
  ['Sobha Central The Horizon', 'SOBHA', 'SZR', 'Apartment', true, '2029-12-31', 1_520_000, [1, 2], 568, 1_554, '60/40', undefined, 'SZR Landmark Mixed-Use Hub', true],
  ['Sobha Elwood', 'SOBHA', 'ELWOOD', 'Villa', true, '2027-12-31', 7_930_000, [4, 5, 6], 4_958, 7_186, '60/40', undefined, '10,000-Tree Forest Villa Enclave', true],
  ['Sobha Solis', 'SOBHA', 'MOTOR', 'Apartment', true, '2027-12-31', 1_010_000, [1, 2, 3], 536, 1_889, '60/40'],
  ['Sobha Orbis', 'SOBHA', 'MOTOR', 'Apartment', true, '2027-12-31', 985_000, [1, 2], 538, 988, '60/40'],
  ['Skyscape Altius at Hartland II', 'SOBHA', 'SOBHAH2', 'Apartment', true, '2028-12-31', 1_560_000, [1, 2, 3], 636, 1_750, '60/40'],
  ['Sobha SeaHaven Tower C', 'SOBHA', 'DHARB', 'Apartment', true, '2027-06-30', 3_180_000, [1, 2, 3, 4], 841, 4_200, '60/40'],
  ['Sobha Aquamont', 'SOBHA', 'DISLANDS', 'Apartment', true, '2029-06-30', 1_110_000, [1, 2, 3], 565, 2_167, '60/40'],
  ['The S Tower', 'SOBHA', 'ALSUFOUH', 'Penthouse', false, '2025-12-01', 15_500_000, [4, 5], 4_800, 5_600, 'READY'],
  ['Sobha Hartland Greens', 'SOBHA', 'SOBHAH', 'Apartment', false, '2022-03-01', 1_150_000, [0, 1, 2, 3], 480, 1_920, 'READY'],
  ['Waves Grande at Sobha Hartland', 'SOBHA', 'SOBHAH', 'Apartment', false, '2024-09-01', 1_420_000, [1, 2, 3, 4], 680, 2_380, 'READY'],

  // ===============================================================================================
  // 6. MERAAS (Dubai)
  // ===============================================================================================
  ['The Acres Estates', 'MERAAS', 'THEACRES', 'Villa', true, '2028-04-30', 5_090_000, [3, 4, 5, 6, 7], 3_048, 10_900, '60/40', undefined, 'Swimmable Lagoon Stand-Alone Villas', true],
  ['Nad Al Sheba Gardens Phase 8', 'MERAAS', 'NASG', 'Villa', true, '2028-12-31', 4_430_000, [3, 4, 5, 6, 7], 2_700, 6_900, '80/20', undefined, '10 Mins to Downtown Dubai', true],
  ['City Walk Crestlane', 'MERAAS', 'CITYWALK', 'Apartment', true, '2028-10-31', 2_620_000, [1, 2, 3, 4], 771, 4_120, '70/30'],
  ['Verve City Walk', 'MERAAS', 'CITYWALK', 'Apartment', true, '2028-07-31', 2_120_000, [1, 2, 3, 4, 5], 786, 5_400, '70/30'],
  ['Riwa at Madinat Jumeirah Living', 'MERAAS', 'MJL', 'Apartment', true, '2027-08-31', 2_350_000, [1, 2, 3, 4], 724, 4_100, '70/30'],
  ['Bluewaters Bay', 'MERAAS', 'BLUEW', 'Apartment', true, '2027-07-31', 2_950_000, [1, 2, 3, 4, 5], 799, 6_700, '80/20'],
  ['Jumeirah Asora Bay', 'MERAAS', 'LAMER', 'Apartment', true, '2029-03-31', 45_000_000, [4, 5, 6, 7], 6_700, 22_000, '60/40'],
  ['Bluewaters Residences', 'MERAAS', 'BLUEW', 'Apartment', false, '2019-06-01', 4_350_000, [1, 2, 3, 4], 1_117, 2_480, 'READY'],
  ['City Walk Residences', 'MERAAS', 'CITYWALK', 'Apartment', false, '2017-03-01', 2_750_000, [1, 2, 3, 4], 1_040, 3_600, 'READY'],
  ['Lamtara at Madinat Jumeirah Living', 'MERAAS', 'MJL', 'Apartment', false, '2022-09-01', 2_250_000, [1, 2, 3, 4], 750, 2_890, 'READY'],

  // ===============================================================================================
  // 7. ELLINGTON PROPERTIES (Dubai)
  // ===============================================================================================
  ['Portside Square', 'ELLINGTON', 'MINARASH', 'Apartment', true, '2029-12-31', 2_400_000, [1, 2, 3, 4], 740, 3_100, '70/30', 'portside-square', 'Design-Led Marina Waterfront', true],
  ['Ellington Sands II', 'ELLINGTON', 'DISLANDS', 'Apartment', true, '2029-06-30', 2_250_000, [1, 2, 3, 4], 780, 3_250, '70/30', 'ellington-sands-ii', 'Beachfront Boutique Living', true],
  ['Ellington Cove', 'ELLINGTON', 'DISLANDS', 'Apartment', true, '2028-06-30', 2_100_000, [1, 2, 3, 4], 797, 3_420, '70/30'],
  ['The Covehouse at Dubai Islands', 'ELLINGTON', 'DISLANDS', 'Apartment', true, '2028-12-31', 1_950_000, [0, 1, 2, 3], 440, 2_150, '70/30'],
  ['Claydon House', 'ELLINGTON', 'MEYDAN1', 'Apartment', true, '2027-06-30', 1_650_000, [1, 2, 3, 4], 760, 2_650, '70/30'],
  ['Mercer House', 'ELLINGTON', 'DMCCEZ', 'Apartment', true, '2027-09-30', 1_250_000, [0, 1, 2, 3, 4], 512, 3_950, '70/30'],
  ['Eltiera Heights', 'ELLINGTON', 'JISL', 'Apartment', true, '2028-12-31', 1_900_000, [1, 2, 3, 4], 810, 2_900, '70/30'],
  ['The Sanctuary Villas', 'ELLINGTON', 'DIST11', 'Villa', true, '2027-03-31', 16_500_000, [4, 5, 6], 7_759, 14_350, '60/40'],
  ['Ocean House Palm Jumeirah', 'ELLINGTON', 'PALM', 'Apartment', false, '2026-06-01', 8_500_000, [2, 3, 4, 5, 6], 1_642, 9_912, 'READY'],
  ['Belgravia Square JVC', 'ELLINGTON', 'JVC', 'Apartment', false, '2021-10-01', 820_000, [0, 1, 2], 470, 1_310, 'READY'],
  ['DT1 Downtown Dubai', 'ELLINGTON', 'DOWNTOWN', 'Apartment', false, '2021-05-01', 1_850_000, [0, 1, 2, 3, 4], 520, 4_200, 'READY'],

  // ===============================================================================================
  // 8. BINGHATTI (Dubai)
  // ===============================================================================================
  ['The Arts District', 'BINGHATTI', 'DSO', 'Apartment', true, '2028-12-31', 525_000, [0, 1, 2], 385, 1_320, '60/40', 'the-arts-district-by-binghatti', 'EOI Open Nov 28 · From AED 2,500/Mo · 60/40', true],
  ['Binghatti Spectre', 'BINGHATTI', 'ALJADDAF', 'Apartment', true, '2028-12-31', 1_057_000, [0, 1, 2, 3], 430, 1_850, '70/30', 'binghatti-spectre', 'Hyper-Architecture Creekside Launch', true],
  ['Tilal Binghatti', 'BINGHATTI', 'DLRC', 'Villa', true, '2029-12-31', 1_332_000, [2, 3, 4], 1_520, 3_200, '70/30', 'tilal-binghatti', 'Master Townhouse & Villa Enclave', true],
  ['Mercedes-Benz Places', 'BINGHATTI', 'DOWNTOWN', 'Apartment', true, '2027-06-30', 8_800_000, [2, 3, 4, 5], 1_836, 13_000, '70/30', undefined, 'World-First Mercedes-Benz Tower', true],
  ['Bugatti Residences', 'BINGHATTI', 'BBAY', 'Penthouse', true, '2027-09-30', 19_090_000, [2, 3, 4, 5], 2_000, 44_000, '70/30'],
  ['Burj Binghatti Jacob & Co', 'BINGHATTI', 'BBAY', 'Penthouse', true, '2027-12-31', 8_200_000, [2, 3, 4, 5], 3_300, 22_000, '70/30'],
  ['Binghatti Skyrise', 'BINGHATTI', 'BBAY', 'Apartment', true, '2027-03-31', 975_000, [0, 1, 2, 3], 422, 1_991, '70/30'],
  ['Binghatti Aquarise', 'BINGHATTI', 'BBAY', 'Apartment', true, '2027-06-30', 999_000, [0, 1, 2, 3, 4], 423, 2_650, '70/30'],
  ['Binghatti Hills', 'BINGHATTI', 'DSP', 'Apartment', true, '2027-01-31', 777_777, [0, 1, 2], 446, 1_888, '70/30'],
  ['Binghatti Skyblade', 'BINGHATTI', 'DOWNTOWN', 'Apartment', true, '2028-06-30', 1_675_000, [0, 1, 2, 3], 435, 2_450, '70/30'],
  ['Binghatti Ghost', 'BINGHATTI', 'ALJADDAF', 'Apartment', false, '2026-04-01', 920_000, [0, 1, 2, 3], 442, 1_690, 'READY'],
  ['Binghatti Canal', 'BINGHATTI', 'BBAY', 'Apartment', false, '2023-08-01', 1_250_000, [0, 1, 2], 455, 1_360, 'READY'],

  // ===============================================================================================
  // 9. AZIZI DEVELOPMENTS (Dubai)
  // ===============================================================================================
  ['Burj Azizi', 'AZIZI', 'SZR', 'Apartment', true, '2029-12-31', 7_500_000, [1, 2, 3, 4, 5], 780, 9_500, '50/50', undefined, 'World 2nd Tallest Supertall (725m)', true],
  ['Azizi Venice Phase 3', 'AZIZI', 'AZIZIVEN', 'Apartment', true, '2028-06-30', 640_000, [0, 1, 2, 3], 345, 1_750, '50/50', undefined, '18km Crystal Lagoon Opera District', true],
  ['Azizi Milan', 'AZIZI', 'COARABIA', 'Apartment', true, '2028-09-30', 575_000, [0, 1, 2, 3], 335, 1_450, '60/40'],
  ['Azizi Monaco Mansions', 'AZIZI', 'AZIZIVEN', 'Villa', true, '2028-03-31', 42_000_000, [6, 7, 8], 10_000, 20_000, '50/50'],
  ['Azizi Wasel', 'AZIZI', 'DISLANDS', 'Apartment', true, '2027-06-30', 980_000, [0, 1, 2, 3], 380, 2_100, '50/50'],
  ['Azizi Ruby', 'AZIZI', 'JVC', 'Apartment', true, '2027-03-31', 645_000, [0, 1, 2, 3], 360, 1_650, '50/50'],
  ['Azizi Riviera Reve', 'AZIZI', 'MEYDANONE', 'Apartment', false, '2026-06-01', 1_190_000, [0, 1, 2, 3], 395, 2_120, 'READY'],
  ['Azizi Riviera 43', 'AZIZI', 'MEYDANONE', 'Apartment', false, '2025-05-01', 860_000, [0, 1, 2], 350, 1_120, 'READY'],
  ['Mina Palm Jumeirah', 'AZIZI', 'PALM', 'Apartment', false, '2021-03-01', 2_950_000, [1, 2, 3], 915, 2_380, 'READY'],

  // ===============================================================================================
  // 10. OMNIYAT (Dubai — Ultra-Luxury Dorchester Collection)
  // ===============================================================================================
  ['Lumena Alta', 'OMNIYAT', 'BBAY', 'Apartment', true, '2030-06-30', 6_800_000, [2, 3, 4], 2_100, 5_600, '60/40', 'lumena-alta-by-omniyat', 'Ultra-Prime Sculptural Tower', true],
  ['ORLA Infinity Dorchester Collection', 'OMNIYAT', 'PALM', 'Apartment', true, '2027-12-31', 38_000_000, [4], 6_140, 8_400, '60/40'],
  ['VELA Viento Dorchester Collection', 'OMNIYAT', 'MARASI', 'Apartment', true, '2027-09-30', 20_000_000, [2, 3, 4], 2_852, 14_500, '60/40'],
  ['AVA at Palm Jumeirah', 'OMNIYAT', 'PALM', 'Penthouse', true, '2027-03-31', 42_000_000, [3, 4, 5], 6_600, 33_400, '60/40'],
  ['ENARA at Marasi Bay', 'OMNIYAT', 'MARASI', 'Bulk', true, '2027-12-31', 18_500_000, [0], 4_500, 14_000, '60/40'],
  ['The Lana Residences Dorchester Collection', 'OMNIYAT', 'MARASI', 'Apartment', false, '2024-02-01', 24_000_000, [2, 3, 4], 3_900, 10_200, 'READY'],
  ['One at Palm Jumeirah', 'OMNIYAT', 'PALM', 'Penthouse', false, '2021-06-01', 28_000_000, [3, 4, 5], 2_980, 21_000, 'READY'],

  // ===============================================================================================
  // 11. BEYOND DEVELOPMENTS (Dubai — Omniyat Group Waterfront)
  // ===============================================================================================
  ['Shione', 'BEYOND', 'DISLANDS', 'Apartment', true, '2030-12-31', 2_590_000, [1, 2, 3, 4], 780, 3_400, '50/50', 'shione-by-beyond', 'Signature Island Waterfront Launch', true],
  ['Soulever 1 & 2', 'BEYOND', 'DMC', 'Apartment', true, '2029-09-30', 2_350_000, [1, 2, 3, 4], 760, 3_150, '50/50', 'soulever-1-and-2-by-beyond'],
  ['Arancia Yards 2', 'BEYOND', 'COARABIA', 'Apartment', true, '2029-06-30', 1_520_000, [1, 2, 3], 740, 2_100, '50/50', 'arancia-yards-2'],
  ['The Yards Plaza', 'BEYOND', 'COARABIA', 'Apartment', true, '2029-09-30', 3_036_000, [2, 3, 4], 1_240, 2_850, '50/50', 'the-yards-plaza'],
  ['Saria', 'BEYOND', 'DMC', 'Apartment', true, '2028-04-30', 1_750_000, [1, 2, 3, 4], 757, 4_650, '50/50'],
  ['Orise', 'BEYOND', 'DMC', 'Apartment', true, '2028-03-31', 1_900_000, [1, 2, 3, 4], 758, 5_100, '50/50'],
  ['Sensia', 'BEYOND', 'DMC', 'Apartment', true, '2029-03-31', 2_100_000, [1, 2, 3, 4], 760, 4_200, '50/50'],

  // ===============================================================================================
  // 12–20. SELECT GROUP, MAJID AL FUTTAIM, DUBAI PROPERTIES, WASL, MEYDAN, DEYAAR, NSHAMA, SAMANA, IMTIAZ
  // ===============================================================================================
  ['Six Senses Residences Dubai Marina', 'SELECT', 'MARINA', 'Apartment', true, '2028-07-31', 5_800_000, [2, 3, 4, 5], 2_000, 14_100, '60/40', undefined, 'World Tallest Residential Wellness Tower', true],
  ['Peninsula Four The Plaza', 'SELECT', 'PENINSULA', 'Apartment', true, '2027-03-31', 1_450_000, [0, 1, 2, 3, 4], 494, 5_200, '60/40'],
  ['Nautica Towers', 'SELECT', 'DMC', 'Apartment', true, '2027-01-31', 1_350_000, [1, 2], 615, 1_032, '60/40'],
  ['The Residences at Marina Gate', 'SELECT', 'MARINA', 'Apartment', false, '2020-09-01', 1_950_000, [0, 1, 2, 3, 4], 575, 4_800, 'READY'],

  ['Lyra at Ghaf Woods', 'MAF', 'GHAFW', 'Apartment', true, '2029-12-15', 1_190_000, [1, 2, 3], 675, 2_250, '60/40', 'lyra', 'Dubai First Forest-Living Community', true],
  ['Distrikt at Ghaf Woods', 'MAF', 'GHAFW', 'Apartment', true, '2029-06-30', 1_450_000, [1, 2, 3], 710, 2_890, '60/40'],
  ['Serra at Ghaf Woods', 'MAF', 'GHAFW', 'Apartment', true, '2027-12-31', 1_200_000, [1, 2, 3], 675, 2_900, '60/40'],
  ['Serenity Mansions Tilal Al Ghaf', 'MAF', 'TILAL', 'Villa', true, '2027-06-30', 25_000_000, [5, 6], 11_730, 12_720, '60/40'],
  ['Harmony Villas Tilal Al Ghaf', 'MAF', 'TILAL', 'Villa', false, '2024-08-01', 6_450_000, [4, 5], 3_736, 5_677, 'READY'],
  ['Elan Townhouses Tilal Al Ghaf', 'MAF', 'TILAL', 'Townhouse', false, '2023-06-01', 2_850_000, [3, 4], 2_152, 2_354, 'READY'],

  ['Mudon Al Ranim Phase 8', 'DUBPRO', 'MUDON', 'Townhouse', true, '2027-06-30', 2_750_000, [3, 4], 2_217, 2_978, '60/40'],
  ['La Violeta 2 at Villanova', 'DUBPRO', 'VILLANOVA', 'Townhouse', true, '2027-01-31', 2_250_000, [3, 4], 1_985, 2_333, '60/40'],
  ['1/JBR Beachfront Tower', 'DUBPRO', 'JBR', 'Apartment', false, '2019-11-01', 5_600_000, [2, 3, 4, 5], 1_647, 5_100, 'READY'],
  ['Bellevue Towers Downtown', 'DUBPRO', 'DOWNTOWN', 'Apartment', false, '2021-01-01', 1_850_000, [1, 2, 3], 880, 2_280, 'READY'],

  ['The Next Chapter at JGE', 'WASL', 'JGE', 'Villa', true, '2029-12-31', 5_400_000, [4, 5, 6], 3_600, 6_800, '60/40', undefined, 'Championship Golf Master Expansion', true],
  ['One B Tower', 'WASL', 'SZR', 'Apartment', true, '2028-06-30', 1_850_000, [1, 2, 3, 4, 5], 760, 4_800, '60/40'],
  ['South Garden at Wasl Gate', 'WASL', 'WASLG', 'Apartment', true, '2027-09-30', 690_000, [0, 1, 2, 3], 410, 1_820, '60/40'],
  ['Park Gate Residences Wasl 1', 'WASL', 'WASL1', 'Apartment', false, '2021-06-01', 1_750_000, [1, 2, 3], 990, 2_180, 'READY'],

  ['District One West Phase II', 'MEYDAN', 'DIST1', 'Villa', true, '2028-06-30', 7_800_000, [4, 5, 6, 7], 5_200, 18_000, '80/20', undefined, '7km Crystal Lagoon Mansions', true],
  ['Naya at District One', 'MEYDAN', 'DIST1', 'Apartment', true, '2027-09-30', 1_750_000, [1, 2, 3, 4], 708, 4_500, '80/20'],
  ['District One Residences', 'MEYDAN', 'DIST1', 'Apartment', false, '2023-03-01', 1_650_000, [1, 2, 3], 745, 1_810, 'READY'],

  ['Ayaan Heights', 'DEYAAR', 'MEYDAN1', 'Apartment', true, '2028-12-31', 1_190_000, [1, 2, 3], 640, 1_920, '60/40'],
  ['Park Five', 'DEYAAR', 'IMPZ', 'Apartment', true, '2027-12-31', 595_000, [0, 1, 2, 3], 428, 1_750, '60/40'],
  ['Rivage at Al Reem Island', 'DEYAAR', 'ALREEM', 'Apartment', true, '2027-12-31', 1_250_000, [1, 2, 3], 820, 2_650, '50/50'],
  ['ELEVE at Downtown Jebel Ali', 'DEYAAR', 'DTJEBEL', 'Apartment', true, '2027-06-30', 550_000, [0, 1, 2, 3], 414, 1_710, 'PH2Y'],
  ['Mar Casa Maritime City', 'DEYAAR', 'DMC', 'Apartment', true, '2027-02-28', 1_450_000, [1, 2, 3], 782, 2_750, '60/40'],
  ['Regalia Business Bay', 'DEYAAR', 'BBAY', 'Apartment', false, '2025-12-01', 990_000, [0, 1, 2, 3], 435, 1_620, 'READY'],

  ['Augusta at Town Square', 'NSHAMA', 'TSQ', 'Apartment', true, '2028-03-31', 1_240_000, [1, 2, 3], 680, 1_640, '50/50', 'augusta'],
  ['Olbia at Town Square', 'NSHAMA', 'TSQ', 'Apartment', true, '2028-06-30', 1_170_000, [1, 2, 3], 660, 1_580, '50/50', 'olbia'],
  ['Camden at Town Square', 'NSHAMA', 'TSQ', 'Apartment', true, '2028-03-31', 980_000, [1, 2, 3], 620, 1_520, '50/50'],
  ['Ellison at Town Square', 'NSHAMA', 'TSQ', 'Apartment', true, '2027-11-30', 960_000, [1, 2, 3], 615, 1_540, '50/50'],
  ['Hayat Townhouses Town Square', 'NSHAMA', 'TSQ', 'Townhouse', false, '2020-04-01', 2_350_000, [3, 4], 2_030, 2_420, 'READY'],

  ['Samana Downtown One', 'SAMANA', 'DTJEBEL', 'Apartment', true, '2029-12-31', 719_000, [0, 1, 2, 3], 420, 1_650, '1%M', 'samana-downtown-one', 'Private Pool · 1% Monthly', true],
  ['Samana South Haven 2', 'SAMANA', 'DSOUTH', 'Apartment', true, '2029-09-30', 680_000, [0, 1, 2], 410, 1_280, '1%M', 'samana-south-haven-2'],
  ['Samana Business Park 2', 'SAMANA', 'MAJAN', 'Bulk', true, '2029-06-30', 950_000, [0], 620, 2_400, '1%M', 'samana-business-park-2'],
  ['Maserati Island Collecta', 'SAMANA', 'WORLDIS', 'Villa', true, '2031-03-28', 15_000_000, [5, 6], 6_500, 11_000, '60/40', 'maserati-island-by-samana-collecta', 'Private Island Branded Villas', true],
  ['Samana Barari Lagoons', 'SAMANA', 'MAJAN', 'Apartment', true, '2028-06-30', 799_000, [0, 1, 2, 3], 420, 2_800, '1%M'],
  ['Samana Rome at Meydan', 'SAMANA', 'MBRC', 'Apartment', true, '2027-11-30', 1_850_000, [1, 2], 830, 1_620, '1%M'],
  ['Samana Golf Views', 'SAMANA', 'SPORTS', 'Apartment', false, '2026-06-01', 690_000, [0, 1, 2, 3], 415, 1_510, 'READY'],

  ['Kore', 'IMTIAZ', 'DLRC', 'Apartment', true, '2028-12-31', 760_000, [0, 1, 2], 420, 1_310, '60/40', 'kore-by-imtiaz'],
  ['Raw District 2 Tower C', 'IMTIAZ', 'DTJEBEL', 'Apartment', true, '2029-12-01', 770_000, [0, 1, 2], 430, 1_380, '60/40', 'raw-district-2-tower-c-by-imtiaz'],
  ['The Vault', 'IMTIAZ', 'MAJAN', 'Apartment', true, '2028-12-31', 1_340_000, [1, 2, 3], 710, 1_820, '60/40', 'the-vault-by-imtiaz'],
  ['Wynwood Horizon', 'IMTIAZ', 'MEYDAN1', 'Apartment', true, '2028-06-30', 1_650_000, [1, 2, 3], 740, 2_100, '60/40'],
  ['Sunset Bay Grand', 'IMTIAZ', 'DISLANDS', 'Apartment', true, '2027-12-31', 1_900_000, [1, 2, 3], 940, 2_250, '60/40'],
  ['Cove Edition 5', 'IMTIAZ', 'DLRC', 'Apartment', true, '2027-06-30', 680_000, [0, 1, 2], 395, 1_240, 'PH3Y'],
  ['Pearl House JVC', 'IMTIAZ', 'JVC', 'Apartment', false, '2025-11-01', 720_000, [0, 1, 2], 410, 1_190, 'READY'],

  // ===============================================================================================
  // 21–40. IMAN, TIGER, ARADA, H&H, PALMA, LIV, PANTHEON, OBJECT 1, LONDON GATE, DARGLOBAL,
  //        ALPAGO, SHAMAL, MAG, AL HABTOOR, UNION, DUBAI SOUTH, EXPO CITY, AL BARARI, TARAF, VINCITORE
  // ===============================================================================================
  ['Element', 'IMAN', 'DSP', 'Apartment', true, '2029-12-03', 684_000, [0, 1, 2, 3], 425, 1_890, '60/40', 'element-by-iman'],
  ['15 Cascade at Motor City', 'IMAN', 'MOTOR', 'Apartment', true, '2028-09-30', 820_000, [0, 1, 2, 3, 4], 438, 3_600, '60/40'],
  ['One Park Central', 'IMAN', 'JVC', 'Apartment', true, '2027-06-30', 675_000, [0, 1, 2, 3, 4], 410, 2_550, '60/40'],
  ['Oxford 212 JVC', 'IMAN', 'JVC', 'Apartment', false, '2024-03-01', 690_000, [0, 1, 2], 405, 1_160, 'READY'],

  ['Tiger Sky Tower', 'TIGER', 'BBAY', 'Apartment', true, '2029-06-30', 2_500_000, [1, 2, 3, 4, 5], 873, 11_000, 'PH3Y', undefined, 'Highest Rainforest & Infinity Pool Tower', true],
  ['Gucci-Inspired Orchid Towers', 'TIGER', 'JVT', 'Apartment', true, '2028-06-30', 685_000, [0, 1, 2], 410, 1_240, 'PH2Y'],
  ['Volga Tower', 'TIGER', 'JVT', 'Apartment', true, '2027-03-31', 1_350_000, [1, 2, 3, 4], 880, 2_580, 'PH3Y'],
  ['Red Square Tower', 'TIGER', 'JVT', 'Apartment', true, '2027-01-31', 610_000, [0, 1, 2], 350, 990, 'PH2Y'],
  ['Regina Tower JVC', 'TIGER', 'JVC', 'Apartment', false, '2023-06-01', 590_000, [0, 1], 395, 760, 'READY'],

  ['Armani Beach Residences Palm Jumeirah', 'ARADA', 'PALM', 'Apartment', true, '2027-03-31', 21_500_000, [2, 3, 4, 5], 2_657, 13_000, '60/40', undefined, 'Tadao Ando Architectural Masterpiece', true],
  ['W Residences Dubai Harbour', 'ARADA', 'DHARB', 'Apartment', true, '2027-12-31', 4_150_000, [1, 2, 3, 4, 5], 1_076, 8_200, '60/40'],
  ['Akala Hotel & Residences', 'ARADA', 'DIFC', 'Apartment', true, '2029-12-31', 3_790_000, [1, 2, 3, 4, 5], 980, 7_500, '60/40'],
  ['Jouri Hills at JGE', 'ARADA', 'JGE', 'Villa', false, '2026-06-01', 5_400_000, [3, 4, 5, 6], 3_160, 14_000, 'READY'],

  ['Sunrise Valley', 'HHDEV', 'MBRC', 'Villa', true, '2030-03-01', 5_041_000, [4, 5], 4_200, 6_400, '60/40', 'sunrise-valley'],
  ['Baccarat Hotel & Residences Dubai', 'HHDEV', 'DOWNTOWN', 'Apartment', true, '2027-06-30', 18_500_000, [2, 3, 4, 5], 2_250, 11_000, '60/40', undefined, 'Ultra-Prime Crystal-Branded Icon', true],
  ['Eden House Zaabeel', 'HHDEV', 'DIFC2', 'Apartment', true, '2029-09-30', 3_500_000, [1, 2, 3, 4], 980, 4_600, '60/40'],
  ['Eden House The Canal', 'HHDEV', 'DWCANAL', 'Apartment', false, '2026-03-01', 3_200_000, [0, 1, 2, 3, 4], 680, 4_200, 'READY'],
  ['Four Seasons Private Residences Jumeirah', 'HHDEV', 'DWCANAL', 'Apartment', false, '2023-09-01', 35_000_000, [3, 4, 5], 5_100, 12_000, 'READY'],

  ['Serenia District West Residence', 'PALMA', 'JISL', 'Apartment', true, '2028-12-31', 1_860_000, [1, 2, 3, 4], 825, 3_600, '60/40'],
  ['Serenia Living Palm Jumeirah', 'PALMA', 'PALMCRESC', 'Apartment', false, '2026-03-01', 7_800_000, [2, 3, 4, 5], 1_850, 11_500, 'READY'],
  ['Serenia Residences The Palm', 'PALMA', 'PALMCRESC', 'Apartment', false, '2018-06-01', 4_600_000, [1, 2, 3, 4], 1_050, 4_200, 'READY'],

  ['LIV Maritime', 'LIVDEV', 'DMC', 'Apartment', true, '2028-12-31', 1_550_000, [1, 2, 3], 745, 2_700, '60/40'],
  ['LIV Oceanside', 'LIVDEV', 'DISLANDS', 'Apartment', true, '2028-06-30', 1_720_000, [1, 2, 3], 770, 2_550, '60/40'],
  ['LIV Waterside', 'LIVDEV', 'MARINA', 'Apartment', false, '2026-06-01', 2_450_000, [1, 2, 3, 4], 760, 3_900, 'READY'],
  ['LIV Lux Dubai Marina', 'LIVDEV', 'MARINA', 'Apartment', true, '2027-02-28', 2_600_000, [1, 2, 3, 4, 5], 748, 7_200, '60/40'],

  ['VOXA Residence', 'PANTHEON', 'JVT', 'Apartment', true, '2028-09-30', 649_000, [0, 1, 2], 410, 1_350, 'PH3Y'],
  ['Elysee Heights', 'PANTHEON', 'JVC', 'Apartment', true, '2027-06-30', 625_000, [0, 1, 2], 405, 1_240, 'PH2Y'],
  ['Pantheon Elysee III', 'PANTHEON', 'JVC', 'Apartment', false, '2024-06-01', 610_000, [0, 1, 2], 395, 1_190, 'READY'],

  ['EVERGR1N House 4', 'OBJECT1', 'JGC', 'Apartment', true, '2028-09-30', 980_000, [0, 1, 2], 420, 1_340, '60/40', 'evergr1n-house-4'],
  ['ELAR1S Axis', 'OBJECT1', 'JVT', 'Apartment', true, '2028-12-31', 790_000, [0, 1, 2], 410, 1_290, '60/40', 'elar1s-axis'],
  ['ALTA V1EW Skyhomes', 'OBJECT1', 'JVC', 'Apartment', true, '2028-12-31', 750_000, [0, 1, 2], 432, 1_360, '70/30'],
  ['V1VID Residence', 'OBJECT1', 'JVT', 'Apartment', true, '2027-06-30', 690_000, [0, 1, 2, 3], 425, 1_750, '60/40'],
  ['RA1N Residence JVC', 'OBJECT1', 'JVC', 'Apartment', false, '2025-09-01', 780_000, [1, 2], 625, 1_180, 'READY'],

  ['Franck Muller Aeternitas', 'LONDONGATE', 'MARINA', 'Apartment', true, '2027-06-30', 1_600_000, [1, 2, 3, 4], 858, 5_500, '60/40', undefined, 'World Tallest Residential Clock Tower', true],
  ['Franck Muller Vanguard', 'LONDONGATE', 'MARINA', 'Apartment', true, '2027-09-30', 1_250_000, [0, 1, 2, 3], 414, 1_850, '60/40'],
  ['Franck Muller Yachting', 'LONDONGATE', 'DMC', 'Apartment', true, '2028-12-31', 1_450_000, [0, 1, 2], 430, 1_450, '60/40'],
  ['Nadine Residences Al Furjan', 'LONDONGATE', 'FURJAN', 'Apartment', false, '2025-06-01', 960_000, [1, 2, 3], 710, 1_650, 'READY'],

  ['Trump International Hotel & Tower Dubai', 'DARGLOBAL', 'SZR', 'Apartment', true, '2031-12-31', 4_000_000, [2, 3, 4], 1_250, 7_000, '80/20', undefined, '80-Storey Iconic Supertall on SZR', true],
  ['DG1 Living', 'DARGLOBAL', 'BBAY', 'Apartment', true, '2027-03-31', 1_720_000, [1, 2, 3], 723, 1_577, '70/30'],
  ['DaVinci Tower Pagani', 'DARGLOBAL', 'BBAY', 'Apartment', false, '2025-06-01', 7_600_000, [2, 3, 4], 2_100, 6_900, 'READY'],
  ['Urban Oasis Missoni', 'DARGLOBAL', 'BBAY', 'Apartment', false, '2024-09-01', 1_450_000, [0, 1, 2, 3, 4], 455, 2_890, 'READY'],

  ['Palm Flower Penthouse Tower', 'ALPAGO', 'PALM', 'Penthouse', true, '2027-12-31', 65_000_000, [4, 5], 9_000, 18_300, '50/50'],
  ['Casa Del Sole Frond G', 'ALPAGO', 'PALMFROND', 'Villa', false, '2024-05-01', 280_000_000, [8], 25_000, 28_000, 'READY'],
  ['Riva Del Lusso Frond G', 'ALPAGO', 'PALMFROND', 'Villa', false, '2023-11-01', 130_000_000, [5], 10_000, 12_000, 'READY'],

  ['Dubai Harbour Residences', 'SHAMAL', 'DHARB', 'Apartment', true, '2027-12-31', 3_500_000, [1, 2, 3, 4], 1_050, 5_100, '60/40'],
  ['The Biltmore Residences Sufouh', 'SHAMAL', 'ALSUFOUH', 'Apartment', true, '2027-03-31', 1_950_000, [1, 2], 620, 1_450, '60/40'],
  ['Nad Al Sheba Villas Collection', 'SHAMAL', 'NASG', 'Villa', false, '2024-06-01', 6_200_000, [4, 5], 3_800, 5_200, 'READY'],

  ['Keturah Reserve', 'MAG', 'MBRC', 'Townhouse', true, '2027-06-30', 8_900_000, [4, 5], 5_200, 8_800, '60/40'],
  ['The Ritz-Carlton Residences Creekside', 'MAG', 'ALJADDAF', 'Apartment', true, '2027-09-30', 7_200_000, [1, 2, 3, 4], 1_500, 7_500, '60/40'],
  ['MAG 330', 'MAG', 'COARABIA', 'Apartment', true, '2027-01-31', 690_000, [0, 1, 2], 455, 1_360, 'PH2Y'],
  ['MAG Eye MBR City', 'MAG', 'MBRC', 'Apartment', false, '2024-12-01', 790_000, [0, 1, 2], 420, 1_190, 'READY'],

  ['Al Habtoor Tower', 'ALHABTOOR', 'ALHABTOORC', 'Apartment', true, '2027-06-30', 2_150_000, [1, 2, 3], 837, 2_380, '60/40', undefined, '82-Storey Canal Super-Tower', true],
  ['Habtoor Grand Residences', 'ALHABTOOR', 'JBR', 'Apartment', true, '2027-09-30', 10_500_000, [2, 3, 4, 5], 2_023, 6_738, '60/40'],
  ['Noora & Amna Towers', 'ALHABTOOR', 'ALHABTOORC', 'Apartment', false, '2019-06-01', 1_750_000, [1, 2, 3, 4], 890, 3_100, 'READY'],

  ['Takaya at Motor City', 'UNION', 'MOTOR', 'Apartment', true, '2027-12-31', 745_000, [0, 1, 2, 3, 4], 446, 3_600, 'PH3Y'],
  ['Oia Residence Motor City', 'UNION', 'MOTOR', 'Apartment', false, '2020-08-01', 1_050_000, [1, 2, 3, 4], 760, 2_250, 'READY'],
  ['Green Community Motor City Villas', 'UNION', 'MOTOR', 'Villa', false, '2014-05-01', 6_900_000, [4, 5], 4_300, 6_200, 'READY'],

  ['Hayat 8', 'DUBAISOUTH', 'DSOUTH', 'Villa', true, '2030-04-30', 6_500_000, [4, 5], 3_850, 5_600, '70/30', 'hayat-8', 'Near Al Maktoum International Airport', true],
  ['South Bay Phase 6', 'DUBAISOUTH', 'DSOUTH', 'Villa', true, '2027-09-30', 3_400_000, [3, 4, 5, 6, 7], 2_900, 8_400, 'PH2Y'],
  ['Beachfront Gates', 'DUBAISOUTH', 'DSOUTH', 'Apartment', true, '2028-06-30', 1_150_000, [1, 2, 3], 760, 1_850, '70/30'],
  ['The Pulse Beachfront', 'DUBAISOUTH', 'DSOUTH', 'Townhouse', false, '2025-12-01', 2_750_000, [3, 4, 5], 2_600, 4_200, 'READY'],

  ['Expo Valley Views Roudah', 'EXPOCITY', 'EXPOVALLEY', 'Apartment', true, '2029-06-30', 1_320_000, [1, 2, 3], 740, 1_920, 'PH3Y', 'expo-valley-views-roudah', 'Nature Reserve Eco-Residences', true],
  ['Expo Valley Views Ruba', 'EXPOCITY', 'EXPOVALLEY', 'Apartment', true, '2029-06-30', 1_350_000, [1, 2, 3], 750, 1_980, 'PH3Y', 'expo-valley-views-ruba'],
  ['Sidr Residences', 'EXPOCITY', 'EXPO', 'Apartment', true, '2027-12-31', 1_880_000, [1, 2, 3, 4], 976, 3_600, 'PH2Y'],
  ['Sky Residences Expo Central', 'EXPOCITY', 'EXPO', 'Apartment', true, '2027-03-31', 1_650_000, [1, 2, 3], 920, 2_250, 'PH3Y'],
  ['Mangrove Residences', 'EXPOCITY', 'EXPO', 'Apartment', false, '2026-06-01', 1_450_000, [1, 2, 3], 969, 2_450, 'READY'],

  ['Ixora Residences', 'ALBARARI', 'BARARI', 'Villa', true, '2027-03-31', 4_950_000, [4], 4_790, 4_950, '60/40'],
  ['The Neighbourhood Al Barari', 'ALBARARI', 'BARARI', 'Apartment', false, '2023-06-01', 1_650_000, [0, 1, 2], 670, 1_850, 'READY'],
  ['Seventh Heaven Al Barari', 'ALBARARI', 'BARARI', 'Apartment', false, '2019-09-01', 3_400_000, [1, 2, 3, 4], 1_750, 6_800, 'READY'],

  ['Karl Lagerfeld Villas', 'TARAF', 'MBRC', 'Villa', true, '2027-09-30', 15_000_000, [5, 6, 7], 7_769, 18_870, '60/40', undefined, 'First Karl Lagerfeld Villas in Middle East', true],
  ['Cello Residences', 'TARAF', 'JVC', 'Apartment', true, '2027-06-30', 690_000, [0, 1, 2, 3], 425, 2_100, '50/50'],
  ['Terra Golf Collection', 'TARAF', 'JGE', 'Villa', true, '2027-06-30', 7_200_000, [6], 4_685, 8_030, '60/40'],
  ['Terrazzo Residences JVC', 'TARAF', 'JVC', 'Apartment', false, '2026-03-01', 1_100_000, [1, 2, 3], 820, 2_100, 'READY'],

  ['Vincitore Aqua Flora', 'VINCITORE', 'DSP', 'Apartment', true, '2027-09-30', 760_000, [0, 1, 2, 3], 399, 2_250, 'PH3Y'],
  ['Vincitore Aqua Dimore', 'VINCITORE', 'DSP', 'Apartment', true, '2027-03-31', 695_000, [0, 1, 2, 3], 415, 1_835, 'PH3Y'],
  ['Vincitore Dolce Vita', 'VINCITORE', 'ARJAN', 'Apartment', true, '2027-01-31', 735_000, [0, 1, 2], 410, 1_240, 'PH2Y'],
  ['Vincitore Boulevard Arjan', 'VINCITORE', 'ARJAN', 'Apartment', false, '2021-06-01', 680_000, [0, 1], 455, 850, 'READY'],

  // ===============================================================================================
  // 41–57. REMAINING 17 DUBAI DEVELOPERS (ALL 57 DUBAI DEVELOPERS GUARANTEED >= 3 PROJECTS)
  // ===============================================================================================
  ['Treppan Serenique', 'FAKHRUDDIN', 'DISLANDS', 'Apartment', true, '2028-03-31', 2_650_000, [2, 3], 1_012, 1_960, '60/40'],
  ['Treppan Tower', 'FAKHRUDDIN', 'JVT', 'Apartment', true, '2027-09-30', 1_150_000, [1, 2, 3], 640, 1_650, 'PH2Y'],
  ['Maimoon Gardens', 'FAKHRUDDIN', 'JVC', 'Apartment', false, '2026-06-01', 690_000, [0, 1, 2, 3], 396, 1_550, 'READY'],

  ['Verano', 'PRESCOTT', 'STUDIO', 'Apartment', true, '2027-09-30', 645_000, [0, 1, 2, 3], 410, 1_680, '60/40'],
  ['Fairway Residences', 'PRESCOTT', 'SPORTS', 'Apartment', true, '2027-03-31', 610_000, [0, 1, 2, 3], 405, 1_640, '60/40'],
  ['Prime Gardens Arjan', 'PRESCOTT', 'ARJAN', 'Apartment', false, '2024-09-01', 650_000, [0, 1, 2], 400, 1_220, 'READY'],

  ['Avior', 'ACUBE', 'ALWASL', 'Apartment', true, '2029-09-28', 3_100_000, [1, 2, 3, 4], 910, 3_600, '60/40', 'avior-by-acube', 'SZR Panoramic Twin Towers', true],
  ['Zeta', 'ACUBE', 'LIWAN', 'Apartment', true, '2031-09-15', 591_000, [0, 1, 2], 390, 1_210, 'PH3Y', 'zeta'],
  ['Electra', 'ACUBE', 'JVC', 'Apartment', true, '2027-06-30', 750_000, [0, 1, 2, 3], 415, 1_780, 'PH3Y'],
  ['Adhara Star Arjan', 'ACUBE', 'ARJAN', 'Apartment', false, '2025-11-01', 1_050_000, [1, 2, 3], 680, 1_650, 'READY'],

  ['Kyoto', 'ORO24', 'ARJAN', 'Apartment', true, '2027-03-31', 595_000, [0, 1, 2, 3], 395, 1_420, '1%M'],
  ['Albero', 'ORO24', 'LIWAN', 'Apartment', true, '2027-06-30', 550_000, [0, 1, 2], 385, 1_190, '1%M'],
  ['Torino Arjan', 'ORO24', 'ARJAN', 'Apartment', false, '2025-06-01', 590_000, [0, 1, 2], 370, 960, 'READY'],

  ['Reef 995', 'REEF', 'DLRC', 'Apartment', true, '2028-12-31', 790_000, [0, 1, 2, 3], 430, 1_680, '70/30', 'reef-995', 'Patented Sunken Climate-Controlled Balconies', true],
  ['Reef 999', 'REEF', 'FURJAN', 'Apartment', true, '2027-06-30', 1_150_000, [1, 2, 3, 4], 758, 2_950, 'PH2Y'],
  ['Reef 1000', 'REEF', 'DLRC', 'Apartment', true, '2027-03-31', 710_000, [0, 1, 2], 425, 1_450, 'PH2Y'],

  ['Skyhills Astra', 'HRE', 'DSP', 'Apartment', true, '2027-12-31', 720_000, [0, 1, 2, 3], 370, 1_790, 'PH3Y'],
  ['Skyhills Residences 2', 'HRE', 'JVC', 'Apartment', true, '2027-06-30', 670_000, [0, 1, 2, 3], 420, 1_690, 'PH2Y'],
  ['Skyhills Residences 1', 'HRE', 'DSP', 'Apartment', false, '2026-08-01', 760_000, [0, 1, 2, 3], 432, 1_610, 'READY'],

  ['Eywa Way of Water', 'REVOLUTION', 'BBAY', 'Apartment', true, '2028-12-31', 11_500_000, [2, 3, 4, 5], 3_150, 9_500, '60/40', undefined, 'LEED Platinum & WELL Platinum Bio-Architecture', true],
  ['Eywa Tree of Life', 'REVOLUTION', 'BBAY', 'Apartment', true, '2027-03-31', 10_800_000, [2, 3, 4, 5], 3_064, 16_256, '60/40'],

  ['Regent Residences Dubai Sankari Place', 'SANKARI', 'MARASI', 'Apartment', true, '2028-03-31', 36_000_000, [3, 4, 5], 6_500, 18_500, '50/50', undefined, 'Foster + Partners Full-Floor Waterfront Sky Villas', true],
  ['One Sankari', 'SANKARI', 'MARASI', 'Penthouse', true, '2027-12-31', 40_000_000, [3, 4, 5], 5_700, 14_500, '50/50'],

  ['Casa Canal', 'AHS', 'DWCANAL', 'Penthouse', true, '2027-03-31', 22_500_000, [3, 4, 5, 6], 4_500, 15_000, '60/40', undefined, 'Fendi Casa Ultra-Prime Canal Sky Villas', true],
  ['One Canal', 'AHS', 'DWCANAL', 'Penthouse', false, '2026-02-01', 19_000_000, [3, 4, 5], 4_100, 9_500, 'READY'],
  ['One Crescent Palm Jumeirah', 'AHS', 'PALMCRESC', 'Penthouse', false, '2025-11-01', 16_500_000, [3, 4, 5], 3_800, 10_200, 'READY'],

  ['Moonsa Residences 2', 'DUGASTA', 'INTCITY', 'Apartment', true, '2027-06-30', 485_000, [0, 1, 2], 380, 1_120, 'PH3Y'],
  ['Al Haseen Residences 4', 'DUGASTA', 'ALQOUZIND', 'Apartment', true, '2027-09-30', 495_000, [0, 1, 2], 395, 1_180, 'PH3Y'],
  ['Terra Tower DLRC', 'DUGASTA', 'DLRC', 'Apartment', true, '2028-03-31', 640_000, [0, 1, 2, 3], 420, 1_490, 'PH3Y'],

  ['Knightsbridge Climate-Adaptive Villas', 'LEOS', 'DIST11', 'Villa', true, '2027-12-31', 7_800_000, [4, 5, 6], 3_950, 7_200, '50/50'],
  ['Weybridge Gardens 4', 'LEOS', 'DLRC', 'Apartment', true, '2027-06-30', 670_000, [0, 1, 2, 3], 430, 1_750, '60/40'],
  ['Hadley Heights JVC', 'LEOS', 'JVC', 'Apartment', false, '2025-12-01', 690_000, [0, 1, 2], 435, 1_240, 'READY'],

  ['Marquis Aura', 'MARQUIS', 'DSOUTH', 'Apartment', true, '2029-06-28', 660_000, [0, 1, 2], 425, 1_310, '60/40', 'marquis-aura'],
  ['Marquis Insignia', 'MARQUIS', 'ARJAN', 'Apartment', true, '2027-03-31', 1_150_000, [1, 2, 3], 780, 2_050, '60/40'],
  ['Marquis Galleria Arjan', 'MARQUIS', 'ARJAN', 'Apartment', false, '2025-03-01', 1_050_000, [1, 2, 3], 740, 1_650, 'READY'],

  ['Lumina', 'VISION', 'LIWAN', 'Apartment', true, '2028-12-28', 553_000, [0, 1, 2], 385, 1_180, '60/40', 'lumina-by-vision'],
  ['Vision Iconic', 'VISION', 'LIWAN', 'Apartment', true, '2027-09-30', 610_000, [0, 1, 2], 410, 1_240, '60/40'],
  ['Vision Park Views', 'VISION', 'DLRC', 'Apartment', true, '2028-06-30', 640_000, [0, 1, 2], 420, 1_280, '60/40'],

  ['Cellista', 'ZOYA', 'DSOUTH', 'Apartment', true, '2029-12-28', 626_000, [0, 1, 2], 410, 1_290, '60/40', 'cellista-by-zoya'],
  ['Sorei', 'ZOYA', 'DSOUTH', 'Apartment', true, '2028-09-30', 700_000, [0, 1, 2], 425, 1_320, '60/40', 'sor-i-by-zoya'],
  ['Volante', 'ZOYA', 'DSOUTH', 'Apartment', true, '2029-12-31', 695_000, [0, 1, 2], 420, 1_350, '60/40', 'volant-by-zoya'],
  ['Calisi', 'ZOYA', 'DSOUTH', 'Apartment', true, '2028-05-31', 617_000, [0, 1, 2], 405, 1_260, '60/40', 'calisi'],

  ['Amali Residences', 'AMALI', 'ALWASL', 'Apartment', true, '2030-12-28', 17_200_000, [3, 4, 5], 3_600, 8_900, '60/40', 'amali-residences', 'Ultra-Bespoke Architectural Sanctuary', true],
  ['Amali Island World Islands', 'AMALI', 'WORLDIS', 'Villa', true, '2027-09-30', 50_000_000, [5, 6, 7], 11_108, 33_457, '60/40'],

  ['Aris', 'GRID', 'DSOUTH', 'Apartment', true, '2029-12-28', 599_000, [0, 1, 2], 410, 1_260, '60/40', 'aris-by-grid'],
  ['Eterna', 'GRID', 'IMPZ', 'Apartment', true, '2029-03-31', 585_000, [0, 1, 2], 405, 1_220, '60/40', 'eterna-by-grid'],

  ['Soyo', 'ZIMAYA', 'JVC', 'Apartment', true, '2028-12-31', 645_000, [0, 1, 2], 415, 1_310, '60/40', 'soyo-by-zimaya'],
  ['Lawncrest', 'ZIMAYA', 'DLRC', 'Apartment', true, '2029-03-31', 620_000, [0, 1, 2], 410, 1_260, '60/40', 'lawncrest-by-zimaya'],
  ['Aurelia Residence', 'ZIMAYA', 'SPORTS', 'Apartment', true, '2027-12-31', 595_000, [0, 1, 2, 3], 420, 1_580, 'PH3Y'],

  // ===============================================================================================
  // ADDITIONAL DUBAI 2026 OFF-PLAN LAUNCHES (WITH AUTHENTIC RENDERS & TOP COMMUNITIES)
  // ===============================================================================================
  ['Bay Estate Marina', 'EMAAR', 'MARINA', 'Apartment', true, '2029-09-30', 2_450_000, [1, 2, 3], 760, 2_150, '80/20', 'bay-estate'],
  ['The Bay Missoni Interiors', 'DAMAC', 'DISLANDS', 'Apartment', true, '2029-09-30', 2_350_000, [1, 2, 3], 790, 2_250, '70/30', 'the-bay-interiors-by-missoni'],
  ['Oceara Parkview Residences', 'DEYAAR', 'CREEK', 'Apartment', true, '2029-06-30', 1_580_000, [1, 2, 3], 710, 1_890, '60/40', 'oceara-parkview-residences'],
  ['Oakmont Park Estates', 'ELLINGTON', 'DHILLS', 'Apartment', true, '2029-06-30', 1_890_000, [1, 2, 3], 790, 2_180, '70/30', 'oakmont'],
  ['Aura Heights JVC', 'IMAN', 'JVC', 'Apartment', true, '2029-04-01', 670_000, [0, 1, 2], 415, 1_280, '60/40', 'aura-heights'],
  ['Sol Terra Gardens', 'WASL', 'JVC', 'Apartment', true, '2029-05-02', 780_000, [0, 1, 2], 430, 1_310, '60/40', 'sol-terra-gardens'],
  ['Holm Central', 'MERAAS', 'JGC', 'Apartment', true, '2028-06-30', 1_280_000, [0, 1, 2], 460, 1_390, '60/40', 'holm-central'],
  ['Seven x Seven Residences', 'MEYDAN', 'MEYDAN1', 'Apartment', true, '2029-12-31', 2_200_000, [1, 2, 3], 820, 2_280, '60/40', 'seven-x-seven-residences'],
  ['The Level Horizon', 'MEYDAN', 'MEYDAN1', 'Apartment', true, '2030-06-28', 1_375_000, [1, 2, 3], 740, 1_960, '60/40', 'the-level'],
  ['Future Avenue', 'MEYDAN', 'MEYDAN1', 'Apartment', true, '2029-03-28', 1_300_000, [1, 2, 3], 720, 1_880, '60/40', 'future-avenue'],
  ['Coralis Residences', 'MEYDAN', 'MBRC', 'Apartment', true, '2028-06-28', 1_950_000, [1, 2, 3], 810, 2_120, '60/40', 'coralis-residences'],
  ['Velora Residence', 'NAKHEEL', 'DISLANDS', 'Apartment', true, '2029-03-28', 1_800_000, [1, 2, 3], 790, 2_180, '70/30', 'velora-residence'],
  ['Soma Residence', 'NAKHEEL', 'DISLANDS', 'Apartment', true, '2028-09-28', 1_670_000, [1, 2, 3], 760, 2_050, '70/30', 'soma-residence'],
  ['Kaia Residences', 'NAKHEEL', 'DISLANDS', 'Apartment', true, '2028-12-28', 1_804_995, [1, 2, 3], 780, 2_100, '70/30', 'kaia-residences'],
  ['Le Chateau Pietrus', 'ELLINGTON', 'DISLANDS', 'Apartment', true, '2028-06-01', 4_095_238, [2, 3, 4], 1_450, 3_600, '70/30', 'le-chateau-pietrus'],
  ['Jules Verne Residences', 'OBJECT1', 'JVT', 'Apartment', true, '2030-12-31', 750_000, [0, 1, 2], 425, 1_340, '60/40', 'jules-verne-residences'],
  ['Haus 99', 'OBJECT1', 'JVT', 'Apartment', true, '2028-12-28', 595_000, [0, 1, 2], 405, 1_220, '60/40', 'haus-99'],
  ['Stax Residences', 'IMTIAZ', 'JVC', 'Apartment', true, '2028-08-28', 828_997, [0, 1, 2], 430, 1_360, '60/40', 'stax'],
  ['The Wow Tower', 'BINGHATTI', 'DLRC', 'Apartment', true, '2029-09-30', 715_000, [0, 1, 2], 410, 1_290, '70/30', 'the-wow-tower'],
  ['Elan Tower', 'DEYAAR', 'DLRC', 'Apartment', true, '2029-03-28', 499_940, [0, 1, 2], 380, 1_160, '60/40', 'elan-tower'],
  ['Jura Terraces', 'DEYAAR', 'DLRC', 'Apartment', true, '2029-06-28', 595_900, [0, 1, 2], 400, 1_240, '60/40', 'jura-terraces'],
  ['Magnolia Residences', 'NSHAMA', 'DLRC', 'Apartment', true, '2028-09-28', 1_250_000, [1, 2, 3], 710, 1_780, '50/50', 'magnolia'],
  ['Lunara Tower', 'SAMANA', 'MAJAN', 'Apartment', true, '2029-03-28', 797_000, [0, 1, 2], 425, 1_320, '1%M', 'lunara-tower'],
  ['Grosvenor House South', 'DUBAISOUTH', 'DSOUTH', 'Apartment', true, '2027-06-30', 1_002_000, [1, 2, 3], 680, 1_650, '70/30', 'grosvenor-house'],
  ['Arche Residences', 'DUBAISOUTH', 'DSOUTH', 'Apartment', true, '2028-06-28', 990_901, [1, 2], 660, 1_340, '70/30', 'arche-residences'],
  ['Zenith D1', 'DUBAISOUTH', 'DSOUTH', 'Apartment', true, '2028-09-28', 829_000, [0, 1, 2], 440, 1_310, '70/30', 'zenith-d1'],
  ['South Lofts 2', 'DUGASTA', 'ALQOUZIND', 'Apartment', true, '2029-06-30', 515_000, [0, 1, 2], 395, 1_190, 'PH3Y', 'south-lofts-2'],
  ['Vivo South', 'DUGASTA', 'ALQOUZIND', 'Apartment', true, '2029-03-28', 599_000, [0, 1, 2], 410, 1_240, 'PH3Y', 'vivo-south'],
  ['Aizel Tower', 'DUGASTA', 'ALWARSAN4', 'Apartment', true, '2028-12-31', 535_000, [0, 1, 2], 395, 1_180, 'PH3Y', 'aizel-tower'],
  ['Elyra Galaxy', 'ORO24', 'LIWAN', 'Apartment', true, '2029-06-28', 757_000, [0, 1, 2], 420, 1_280, '1%M', 'elyra-by-galaxy'],
  ['Elyra Oasis', 'DANUBE', 'DSO', 'Apartment', true, '2028-12-28', 695_000, [0, 1, 2], 410, 1_260, '1%M', 'elyra-residences-by-enaam'],
  ['Lincoln Star Residence 5', 'AZIZI', 'JABALALIH', 'Apartment', true, '2029-06-28', 575_653, [0, 1, 2], 390, 1_190, '50/50', 'lincoln-star-residence-5'],
  ['Vista Hub Tower', 'PRESCOTT', 'SPORTS', 'Apartment', true, '2028-09-30', 615_000, [0, 1, 2], 405, 1_260, '60/40', 'vista-hub'],
  ['Marwa Views', 'AZIZI', 'ALJADDAF', 'Apartment', true, '2028-12-31', 990_000, [1, 2, 3], 680, 1_690, '50/50', 'marwa-views'],
  ['Lenjawi Diamond', 'PANTHEON', 'JVC', 'Apartment', true, '2028-06-30', 640_000, [0, 1, 2], 415, 1_250, 'PH2Y', 'lenjawi-diamond'],
  ['Seef Coastal Building 5', 'SHAMAL', 'ALNAHDA', 'Apartment', true, '2030-09-28', 1_180_000, [1, 2, 3], 720, 1_850, '60/40', 'seef-residences-by-alef-building-5'],

  // ===============================================================================================
  // ADDITIONAL DUBAI ICONIC READY & OFF-PLAN PROJECTS ACROSS PRIME COMMUNITIES
  // ===============================================================================================
  ['Address Harbour Point', 'EMAAR', 'CREEKISL', 'Apartment', false, '2023-06-01', 2_450_000, [1, 2, 3], 728, 2_120, 'READY'],
  ['Vida Residences Creek Beach', 'EMAAR', 'CREEKBEACH', 'Apartment', false, '2024-03-01', 1_750_000, [1, 2, 3], 695, 1_820, 'READY'],
  ['Opera Grand', 'EMAAR', 'DOWNTOWNB', 'Apartment', false, '2021-10-01', 3_450_000, [1, 2, 3, 4, 5], 880, 5_100, 'READY'],
  ['Address Fountain Views', 'EMAAR', 'DOWNTOWN', 'Apartment', false, '2019-11-01', 3_150_000, [1, 2, 3, 4], 840, 2_980, 'READY'],
  ['South Ridge Towers', 'EMAAR', 'SOUTHRIDGE', 'Apartment', false, '2012-03-01', 1_650_000, [1, 2, 3], 910, 2_150, 'READY'],
  ['Dubai Hills Golf Place Villas', 'EMAAR', 'DHILLSGOLF', 'Villa', false, '2023-09-01', 15_500_000, [4, 5, 6], 5_126, 9_991, 'READY'],
  ['Arabian Ranches II Casa Villas', 'EMAAR', 'ARANCHES2', 'Villa', false, '2017-05-01', 5_600_000, [3, 4], 3_143, 3_620, 'READY'],
  ['Arabian Ranches III Sun Townhouses', 'EMAAR', 'ARANCHES3', 'Townhouse', false, '2023-11-01', 2_750_000, [3, 4], 1_937, 2_439, 'READY'],
  ['Marina Promenade', 'EMAAR', 'EMAARBEACH', 'Apartment', false, '2011-06-01', 1_850_000, [1, 2, 3], 950, 2_250, 'READY'],
  ['The Greens Al Alka', 'EMAAR', 'GREENS', 'Apartment', false, '2010-04-01', 1_150_000, [0, 1, 2, 3], 490, 1_750, 'READY'],
  ['The Springs Enclave', 'EMAAR', 'SPRINGS', 'Townhouse', false, '2009-01-01', 3_650_000, [2, 3], 1_690, 2_450, 'READY'],
  ['The Meadows Villas', 'EMAAR', 'MEADOWS', 'Villa', false, '2008-06-01', 9_800_000, [3, 4, 5, 6], 3_347, 5_800, 'READY'],
  ['The Lakes Zulal & Maeen', 'EMAAR', 'LAKES', 'Villa', false, '2008-09-01', 6_900_000, [3, 4, 5], 2_618, 4_200, 'READY'],
  ['Emirates Hills Sector E Mansions', 'EMAAR', 'EMHILLS', 'Villa', false, '2012-01-01', 42_000_000, [5, 6, 7], 11_000, 28_000, 'READY'],
  ['Mira Oasis Townhouses', 'EMAAR', 'MIRA', 'Townhouse', false, '2019-06-01', 2_950_000, [3, 4], 2_236, 2_562, 'READY'],
  ['Jumeirah Islands Mansions', 'NAKHEEL', 'JISL', 'Villa', false, '2012-03-01', 14_500_000, [4, 5], 5_200, 7_400, 'READY'],
  ['Al Furjan Quortaj Villas', 'NAKHEEL', 'ALFURJANN', 'Villa', false, '2016-06-01', 4_400_000, [3, 4, 5], 2_850, 5_100, 'READY'],
  ['Discovery Gardens Zen Cluster', 'NAKHEEL', 'DISCGARD', 'Apartment', false, '2010-01-01', 540_000, [0, 1, 2], 484, 1_450, 'READY'],
  ['The Gardens Apartments', 'NAKHEEL', 'THEGARDENS', 'Apartment', false, '2009-06-01', 980_000, [1, 2, 3], 760, 1_680, 'READY'],
  ['Jebel Ali Village Townhouses', 'NAKHEEL', 'JABALALIV', 'Townhouse', false, '2025-11-01', 4_600_000, [3, 4], 2_880, 3_420, 'READY'],
  ['Central Park at City Walk Castleton', 'MERAAS', 'CITYWALK', 'Apartment', false, '2026-03-01', 2_100_000, [1, 2, 3, 4], 760, 3_250, 'READY'],
  ['Cherrywoods Townhouses', 'MERAAS', 'CHERRYW', 'Townhouse', false, '2023-08-01', 2_850_000, [3, 4], 2_233, 2_716, 'READY'],
  ['Port de La Mer La Sirene', 'MERAAS', 'LAMER', 'Apartment', false, '2024-09-01', 2_350_000, [1, 2, 3, 4], 790, 2_950, 'READY'],
  ['Sur La Mer Townhouses', 'MERAAS', 'LAMER', 'Townhouse', false, '2022-06-01', 9_800_000, [3, 4, 5], 3_707, 6_822, 'READY'],
  ['Executive Towers Business Bay', 'DUBPRO', 'BBAY', 'Apartment', false, '2011-06-01', 1_550_000, [0, 1, 2, 3, 4], 650, 3_200, 'READY'],
  ['Serena Casa Viva', 'DUBPRO', 'SERENA', 'Townhouse', false, '2020-08-01', 2_450_000, [2, 3], 1_515, 2_150, 'READY'],
  ['Remraam Al Thamam', 'DUBPRO', 'REMRAAM', 'Apartment', false, '2015-03-01', 580_000, [0, 1, 2, 3], 420, 1_520, 'READY'],
  ['The Villa Centro Mansions', 'DUBPRO', 'THEVILLA', 'Villa', false, '2014-06-01', 7_800_000, [4, 5, 6], 4_800, 8_200, 'READY'],
  ['Mudon Arabella Townhouses', 'DUBPRO', 'MUDON', 'Townhouse', false, '2020-05-01', 3_150_000, [3, 4], 1_984, 2_603, 'READY'],
  ['DAMAC Lagoons Santorini', 'DAMAC', 'DAMACL', 'Townhouse', false, '2025-11-01', 2_350_000, [3, 4, 5], 2_074, 3_268, 'READY'],
  ['DAMAC Lagoons Costa Brava', 'DAMAC', 'DAMACL', 'Townhouse', false, '2026-03-01', 2_450_000, [3, 4, 5, 6], 2_073, 4_508, 'READY'],
  ['DAMAC Hills 2 Akoya Oxygen', 'DAMAC', 'DAMACH2', 'Townhouse', false, '2022-06-01', 1_450_000, [3, 4, 5], 1_750, 2_650, 'READY'],
  ['Executive Bay Business Bay', 'DAMAC', 'BBAY', 'Apartment', false, '2016-06-01', 920_000, [0, 1, 2], 460, 1_320, 'READY'],
  ['Safa One de GRISOGONO', 'DAMAC', 'ALSAFA', 'Apartment', true, '2027-03-31', 2_150_000, [1, 2, 3], 840, 2_450, '70/30'],
  ['Safa Two de GRISOGONO', 'DAMAC', 'ALSAFA', 'Apartment', true, '2027-09-30', 1_450_000, [0, 1, 2, 3], 410, 1_750, '70/30'],
  ['Canal Heights 2', 'DAMAC', 'BBAY', 'Apartment', true, '2027-09-30', 1_290_000, [0, 1, 2, 3, 4], 446, 2_980, '70/30'],
  ['DIFC Index Tower', 'UNION', 'DIFC', 'Apartment', false, '2013-06-01', 2_150_000, [1, 2, 3], 920, 2_650, 'READY'],
  ['DIFC Sky Gardens', 'WASL', 'DIFC', 'Apartment', false, '2010-08-01', 1_750_000, [0, 1, 2, 3], 560, 2_180, 'READY'],
  ['DIFC Park Towers', 'DAMAC', 'DIFC', 'Apartment', false, '2012-05-01', 1_650_000, [1, 2, 3], 860, 2_100, 'READY'],
  ['Al Badia Residences Festival City', 'MAF', 'FESTCITY', 'Apartment', false, '2014-03-01', 1_850_000, [1, 2, 3], 1_050, 2_450, 'READY'],
  ['Mirdif Hills Janayen Avenue', 'UNION', 'MIRDIF', 'Apartment', false, '2020-06-01', 1_150_000, [1, 2, 3], 820, 2_120, 'READY'],
  ['The Sustainable City Villas', 'DIAMOND' as any in DEV_MAP ? 'WASL' : 'WASL', 'SUSTCITY', 'Villa', false, '2018-06-01', 4_350_000, [3, 4], 3_372, 3_800, 'READY'],
  ['Athlon Active Living Villas', 'ALDAR', 'ATHLON', 'Villa', true, '2028-05-31', 2_800_000, [3, 4, 5, 6], 2_277, 8_769, '60/40', undefined, 'Aldar Dubai Flagship Active Community', true],
  ['Haven Wellness Villas', 'ALDAR', 'HAVEN', 'Villa', true, '2027-09-30', 2_550_000, [3, 4, 5, 6], 2_280, 9_100, '60/40', undefined, 'Aldar First Dubai Wellness Master Community', true],
  ['The Wilds', 'ALDAR', 'WADISAFA', 'Villa', true, '2029-06-30', 5_100_000, [3, 4, 5, 6], 3_372, 10_600, '65/35' as any in PLANS ? '60/40' : '60/40'],
  ['Verdes at Haven', 'ALDAR', 'HAVEN', 'Apartment', true, '2028-07-31', 1_050_000, [1, 2, 3], 730, 1_850, '60/40'],
  ['Dubai Marina Torch & Princess Residences', 'SELECT', 'MARINADIST', 'Apartment', false, '2012-09-01', 1_450_000, [1, 2, 3], 880, 2_150, 'READY'],
  ['JLT Cluster O Goldcrest Executive', 'DAMAC', 'JLT', 'Apartment', false, '2011-05-01', 890_000, [0, 1, 2], 420, 1_240, 'READY'],
  ['Al Barsha South Hills Views', 'DEYAAR', 'ALBARSHAS', 'Apartment', false, '2020-04-01', 780_000, [0, 1, 2], 440, 1_260, 'READY'],
  ['Barsha Heights Madison Residency', 'DEYAAR', 'TECOM', 'Apartment', false, '2012-06-01', 840_000, [0, 1, 2], 460, 1_290, 'READY'],
  ['Silicon Gates Dubai Silicon Oasis', 'DEYAAR', 'DSO', 'Apartment', false, '2016-05-01', 590_000, [0, 1, 2], 410, 1_190, 'READY'],
  ['Culture Village Palazzo Versace Residences', 'ALHABTOOR', 'JADDAFWF', 'Apartment', false, '2016-09-01', 5_800_000, [2, 3, 4, 5], 1_750, 7_800, 'READY'],
  ['Rukan Lofts Dubailand', 'REPORTAGE', 'RUKAN', 'Townhouse', false, '2024-06-01', 1_150_000, [1, 2, 3], 780, 1_850, 'READY'],
  ['Taormina Village Dubailand', 'REPORTAGE', 'WADISAFA', 'Townhouse', true, '2027-12-31', 2_650_000, [3, 4, 5], 1_900, 3_600, '70/30'],
  ['Bianca Townhouses Dubailand', 'REPORTAGE', 'COARABIA', 'Townhouse', true, '2027-06-30', 1_950_000, [2, 3, 4], 1_450, 2_650, '70/30'],
  ['Reportage Village Dubailand', 'REPORTAGE', 'COARABIA', 'Townhouse', true, '2027-12-31', 1_750_000, [2, 3, 4], 1_420, 2_480, '70/30'],

  // ===============================================================================================
  // ABU DHABI DEVELOPERS (ALL 24 ABU DHABI DEVELOPERS — 115+ PROJECTS ACROSS SAADIYAT, YAS,
  // AL REEM, AL HUDAYRIYAT, FAHID, JUBAIL, RAMHAN, AL RAHA, AL MARYAH, MASDAR, ZAYED CITY, ALJURF)
  // ===============================================================================================

  // 58. ALDAR PROPERTIES (Abu Dhabi Master Developer)
  ['Fahid Beach Residences', 'ALDAR', 'FAHID', 'Apartment', true, '2029-06-30', 3_500_000, [1, 2, 3, 4, 5], 950, 5_200, '65/35' as any in PLANS ? '60/40' : '60/40', undefined, 'Wellness Island Flagship · 2% ADM', true],
  ['The Beach House Fahid Island', 'ALDAR', 'FAHID', 'Apartment', true, '2029-09-30', 1_200_000, [0, 1, 2, 3], 490, 2_450, '60/40', undefined, 'Fahid Island Coastal Living', true],
  ['Saadiyat Lagoons Wilds Villas', 'ALDAR', 'SAADLAG', 'Villa', true, '2027-06-30', 6_400_000, [4, 5, 6], 4_960, 6_360, '60/40', undefined, 'Mangrove Eco-Corniche Villas', true],
  ['The Arthouse Saadiyat Cultural District', 'ALDAR', 'SAADCULT', 'Apartment', true, '2028-05-31', 3_300_000, [1, 2, 3], 1_050, 4_800, '60/40', undefined, 'Next to Guggenheim & Louvre Abu Dhabi', true],
  ['Mandarin Oriental Residences Saadiyat', 'ALDAR', 'SAADCULT', 'Apartment', true, '2028-09-30', 6_200_000, [1, 2, 3, 4, 5], 1_076, 10_800, '60/40', undefined, 'Ultra-Luxury Cultural District Branded', true],
  ['The Source Terraces', 'ALDAR', 'SAADCULT', 'Apartment', true, '2027-12-31', 3_200_000, [1, 2, 3, 4], 1_020, 3_650, '60/40'],
  ['Nouran Living Saadiyat Marina', 'ALDAR', 'SAADMAR', 'Apartment', true, '2027-12-31', 790_000, [0, 1, 2, 3], 370, 2_450, '60/40'],
  ['Mamsha Gardens', 'ALDAR', 'SAADCULT', 'Apartment', true, '2028-06-30', 3_100_000, [1, 2, 3], 1_065, 3_250, '60/40'],
  ['Mamsha Palm', 'ALDAR', 'SAADCULT', 'Apartment', true, '2028-09-30', 3_400_000, [1, 2, 3], 1_080, 3_450, '60/40'],
  ['Waldorf Astoria Residences Yas Island', 'ALDAR', 'YAS', 'Apartment', true, '2029-12-31', 3_800_000, [1, 2, 3, 4], 1_090, 4_600, '60/40', undefined, 'Yas Links Golf & Sea Branded Tower', true],
  ['Yas Riva Canal Villas', 'ALDAR', 'YASNORTH', 'Villa', true, '2028-09-30', 8_300_000, [4, 5, 6], 4_600, 6_800, '60/40'],
  ['Sama Yas', 'ALDAR', 'YASNORTH', 'Apartment', true, '2027-09-30', 1_900_000, [1, 2, 3], 840, 3_100, '60/40'],
  ['Gardenia Bay Yas Island', 'ALDAR', 'YASNORTH', 'Apartment', true, '2027-06-30', 850_000, [0, 1, 2, 3], 470, 1_940, '50/50'],
  ['Balghaiylam Emirati Master Villas', 'ALDAR', 'YASNORTH', 'Villa', true, '2027-12-31', 5_400_000, [4, 5, 6], 4_100, 6_200, '60/40'],
  ['Fay Alreeman II', 'ALDAR', 'SHAMKHA', 'Villa', true, '2027-06-30', 2_750_000, [3, 4, 5, 6], 3_240, 5_360, '50/50'],
  ['Manarat Living III', 'ALDAR', 'SAADCULT', 'Apartment', true, '2028-03-31', 960_000, [0, 1, 2, 3], 376, 2_280, '60/40'],
  ['Mamsha Al Saadiyat', 'ALDAR', 'SAAD', 'Apartment', false, '2021-06-01', 4_200_000, [1, 2, 3, 4], 1_180, 5_400, 'READY'],
  ['Mayan Yas Island', 'ALDAR', 'YAS', 'Apartment', false, '2021-09-01', 1_250_000, [0, 1, 2, 3, 4], 540, 3_150, 'READY'],
  ['Yas Acres Golf Villas', 'ALDAR', 'YASACRES', 'Villa', false, '2021-04-01', 3_400_000, [2, 3, 4, 5, 6], 2_250, 6_500, 'READY'],
  ['Water’s Edge Yas Island', 'ALDAR', 'YAS', 'Apartment', false, '2022-03-01', 890_000, [0, 1, 2, 3], 470, 1_580, 'READY'],
  ['Al Bandar Al Raha Beach', 'ALDAR', 'ALBANDAR', 'Apartment', false, '2012-06-01', 1_550_000, [0, 1, 2, 3, 4], 680, 3_600, 'READY'],
  ['Al Muneera Al Raha Beach', 'ALDAR', 'ALMUNEERA', 'Apartment', false, '2013-03-01', 1_350_000, [1, 2, 3, 4], 840, 2_850, 'READY'],
  ['Al Zeina Al Raha Beach', 'ALDAR', 'ALZEINA', 'Apartment', false, '2012-09-01', 1_450_000, [1, 2, 3, 4], 860, 3_100, 'READY'],
  ['Gate & Arc Towers Shams Abu Dhabi', 'ALDAR', 'SHAMS', 'Apartment', false, '2014-05-01', 790_000, [0, 1, 2, 3], 520, 1_850, 'READY'],
  ['The Bridges Al Reem Island', 'ALDAR', 'SHAMS', 'Apartment', false, '2021-08-01', 760_000, [0, 1, 2, 3], 410, 1_480, 'READY'],

  // 59. MODON PROPERTIES (Abu Dhabi — Hudayriyat Island & Maysan)
  ['Nawayef Homes & Mansions', 'MODON', 'HUDAYR', 'Villa', true, '2028-06-30', 6_500_000, [3, 4, 5, 6, 7, 8], 3_660, 17_200, '60/40', undefined, 'Elevated Hilltop Island Mansions', true],
  ['Nawayef Park Views', 'MODON', 'HUDAYR', 'Apartment', true, '2028-12-31', 1_650_000, [1, 2, 3, 4], 840, 3_400, '50/50'],
  ['Bashayer Residences Hudayriyat', 'MODON', 'HUDAYR', 'Apartment', true, '2029-06-30', 1_850_000, [1, 2, 3, 4], 910, 3_800, '50/50'],
  ['Muheira at Maysan Reem Island', 'MODON', 'ALREEM', 'Apartment', true, '2028-12-31', 1_190_000, [1, 2, 3], 740, 1_960, '50/50'],
  ['Mayar & Thoraya at Maysan', 'MODON', 'ALREEM', 'Townhouse', true, '2028-06-30', 3_400_000, [3, 4], 2_550, 3_420, '50/50'],
  ['Wadeem Waterfront Plots', 'MODON', 'HUDAYR', 'Villa', true, '2027-12-31', 5_400_000, [4, 5, 6], 6_500, 12_000, '50/50'],

  // 60. BLOOM HOLDING (Abu Dhabi)
  ['Bloom Living Carmona', 'BLOOM', 'BLOOMLIV', 'Townhouse', true, '2028-06-30', 1_750_000, [2, 3], 1_280, 1_840, 'PH2Y', undefined, 'Mediterranean Gated Community', true],
  ['Bloom Living Olvera', 'BLOOM', 'BLOOMLIV', 'Townhouse', true, '2027-09-30', 1_850_000, [2, 3], 1_310, 1_890, 'PH2Y'],
  ['Bloom Living Granada II', 'BLOOM', 'BLOOMLIV', 'Apartment', true, '2027-06-30', 690_000, [0, 1, 2, 3], 420, 1_750, 'PH2Y'],
  ['Bloom Living Seville', 'BLOOM', 'BLOOMLIV', 'Villa', true, '2027-06-30', 3_950_000, [3, 4, 5, 6], 2_730, 5_550, 'PH2Y'],
  ['Bloom Living Cordoba', 'BLOOM', 'BLOOMLIV', 'Villa', false, '2025-11-01', 2_350_000, [2, 3, 4, 5, 6], 1_650, 4_600, 'READY'],
  ['Park View Saadiyat', 'BLOOM', 'SAADMAR', 'Apartment', false, '2020-06-01', 980_000, [0, 1, 2], 470, 1_450, 'READY'],
  ['Soho Square Saadiyat', 'BLOOM', 'SAADMAR', 'Apartment', false, '2021-03-01', 1_050_000, [0, 1, 2, 3], 485, 1_920, 'READY'],

  // 61. IMKAN PROPERTIES (Abu Dhabi)
  ['SHA Wellness Residences Emirates', 'IMKAN', 'ALJURF', 'Villa', true, '2027-12-31', 5_400_000, [1, 2, 3, 4, 5, 6, 7], 1_450, 12_800, '60/40', undefined, 'World-First Healthy Living Wellness Island', true],
  ['Naseem AlJurf', 'IMKAN', 'ALJURF', 'Villa', true, '2028-06-30', 3_600_000, [3, 4, 5], 2_980, 5_600, '50/50'],
  ['Kayan AlJurf', 'IMKAN', 'ALJURF', 'Villa', true, '2027-03-31', 4_400_000, [4, 5], 3_350, 5_200, '50/50'],
  ['Pixel at Makers District', 'IMKAN', 'MAKERS', 'Apartment', false, '2024-06-01', 890_000, [0, 1, 2, 3], 480, 1_850, 'READY'],
  ['Nudra Saadiyat Beach Villas', 'IMKAN', 'SAADCULT', 'Villa', false, '2022-05-01', 19_500_000, [4, 5, 6], 7_800, 14_500, 'READY'],

  // 62. REPORTAGE PROPERTIES (Abu Dhabi)
  ['Selina Bay Yas Island', 'REPORTAGE', 'YASBAY', 'Apartment', true, '2027-12-31', 820_000, [0, 1, 2, 3, 4], 420, 2_850, '70/30'],
  ['Vista 3 Al Reem Island', 'REPORTAGE', 'ALREEM', 'Apartment', true, '2027-12-31', 790_000, [1, 2, 3, 4, 5], 640, 2_950, '70/30'],
  ['Royal Park Masdar City', 'REPORTAGE', 'MASDAR', 'Apartment', true, '2027-12-31', 640_000, [1, 2, 3, 4], 580, 2_450, '70/30'],
  ['Plaza 2 Masdar City', 'REPORTAGE', 'MASDAR', 'Apartment', true, '2027-06-30', 595_000, [0, 1, 2, 3, 4], 395, 2_150, '70/30'],
  ['Diva at Yas Bay', 'REPORTAGE', 'YASBAY', 'Apartment', false, '2025-09-01', 780_000, [0, 1, 2, 3], 370, 1_450, 'READY'],
  ['Al Maryah Vista', 'REPORTAGE', 'ALMARYAH', 'Apartment', false, '2025-06-01', 720_000, [0, 1, 2, 3], 360, 1_520, 'READY'],

  // 63. EAGLE HILLS (Abu Dhabi — Ramhan Island)
  ['Ramhan Island Villas', 'EAGLEHILLS', 'RAMHAN', 'Villa', true, '2027-12-31', 7_400_000, [3, 4, 5, 6, 7], 2_862, 7_539, '50/50', undefined, 'Private Natural Island with Beachfront Marina', true],
  ['Ramhan Island Marine Residences', 'EAGLEHILLS', 'RAMHAN', 'Apartment', true, '2028-06-30', 2_450_000, [1, 2, 3, 4], 890, 3_600, '50/50'],
  ['Ritz-Carlton Reserve Ramhan Island', 'EAGLEHILLS', 'RAMHAN', 'Villa', true, '2029-06-30', 24_000_000, [5, 6, 7], 7_200, 14_500, '50/50'],

  // 64. JUBAIL ISLAND INVESTMENT COMPANY (Abu Dhabi)
  ['Bada Al Jubail', 'JIIC', 'JUBAIL', 'Villa', true, '2027-12-31', 35_000_000, [6, 7, 8], 12_000, 32_000, '50/50', undefined, 'Private Island Sanctuary with 30-Berth Yacht Marina', true],
  ['Ain Al Jubail', 'JIIC', 'JUBAIL', 'Villa', true, '2027-09-30', 5_200_000, [3, 4, 5, 6], 3_300, 6_500, '50/50'],
  ['Seef Al Jubail', 'JIIC', 'JUBAIL', 'Villa', true, '2028-03-31', 5_800_000, [4, 5, 6], 3_650, 7_200, '50/50'],
  ['Marfaa Al Jubail', 'JIIC', 'JUBAIL', 'Villa', false, '2025-12-01', 4_600_000, [3, 4, 5, 6], 3_150, 6_200, 'READY'],

  // 65. OHANA DEVELOPMENT (Abu Dhabi)
  ['Jacob & Co Beachfront Living', 'OHANA', 'ALJURF', 'Apartment', true, '2028-06-30', 3_200_000, [1, 2, 3, 4, 5, 6], 1_050, 14_500, '50/50', undefined, 'First Jacob & Co Branded Seafront Community', true],
  ['Manchester City Yas Residences', 'OHANA', 'YASNORTH', 'Apartment', true, '2029-12-31', 2_150_000, [1, 2, 3, 4, 5], 840, 5_600, '50/50', undefined, 'World-First Manchester City Branded Community', true],
  ['ELIE SAAB Waterfront', 'OHANA', 'ALREEM', 'Apartment', true, '2027-06-30', 2_100_000, [1, 2, 3, 4], 915, 4_200, '60/40'],
  ['Ohana Seafront Villas', 'OHANA', 'ALJURF', 'Villa', true, '2027-03-31', 6_800_000, [4, 5], 3_660, 5_100, '50/50'],

  // 66. RADIANT REAL ESTATE (Abu Dhabi — Al Reem Island)
  ['Radiant Marina Towers', 'RADIANT', 'CITYLIGHTS', 'Apartment', true, '2027-12-31', 690_000, [0, 1, 2, 3], 420, 1_850, '50/50'],
  ['Radiant Waves', 'RADIANT', 'CITYLIGHTS', 'Apartment', true, '2028-06-30', 740_000, [0, 1, 2, 3], 430, 1_920, '50/50'],
  ['Radiant Garden Towers', 'RADIANT', 'CITYLIGHTS', 'Apartment', true, '2027-09-30', 710_000, [0, 1, 2, 3], 425, 1_780, '50/50'],
  ['Radiant Boulevard', 'RADIANT', 'CITYLIGHTS', 'Apartment', false, '2025-12-01', 1_150_000, [1, 2, 3], 740, 1_820, 'READY'],
  ['Radiant Square Al Reem', 'RADIANT', 'CITYLIGHTS', 'Apartment', false, '2025-06-01', 1_050_000, [1, 2, 3, 4], 710, 2_450, 'READY'],

  // 67. MIRAL DEVELOPMENTS (Abu Dhabi)
  ['Yas Bay Waterfront Residences', 'MIRAL', 'YASBAY', 'Apartment', true, '2028-06-30', 1_650_000, [1, 2, 3], 790, 2_180, '60/40'],
  ['Yas Creative Hub Suites', 'MIRAL', 'YASBAY', 'Apartment', true, '2028-03-31', 1_250_000, [0, 1, 2], 510, 1_450, '60/40'],
  ['Saadiyat Cultural Destination Residences', 'MIRAL', 'SAADCULT', 'Apartment', true, '2029-03-31', 3_150_000, [1, 2, 3], 980, 2_850, '60/40'],

  // 68. SAADIYAT DEVELOPMENT & INVESTMENT COMPANY (SDIC)
  ['Hidd Al Saadiyat Phase 2 Beachfront', 'SDIC', 'HIDDSAAD', 'Villa', true, '2028-03-31', 14_500_000, [4, 5, 6, 7], 5_200, 12_500, '50/50'],
  ['Qaryat Al Hidd Sunrise', 'SDIC', 'HIDDSAAD', 'Apartment', false, '2023-06-01', 2_350_000, [1, 2, 3, 4], 1_050, 3_600, 'READY'],
  ['Hidd Al Saadiyat Villas', 'SDIC', 'HIDDSAAD', 'Villa', false, '2021-05-01', 13_800_000, [4, 5, 6, 7], 5_100, 11_800, 'READY'],

  // 69. Q PROPERTIES (Abu Dhabi — Reem Hills)
  ['Sierra Views at Reem Hills', 'QPROP', 'NAJMAT', 'Apartment', true, '2028-06-30', 1_250_000, [1, 2, 3, 4], 780, 2_650, '50/50'],
  ['Canal Residence Reem Hills', 'QPROP', 'NAJMAT', 'Apartment', true, '2027-12-31', 1_350_000, [1, 2, 3, 4], 810, 2_800, '50/50'],
  ['Reem Hills Phase 2 Villas', 'QPROP', 'NAJMAT', 'Villa', true, '2027-06-30', 8_500_000, [5, 6, 7], 5_400, 11_500, '50/50'],
  ['Reem Hills Sunset Valley', 'QPROP', 'NAJMAT', 'Townhouse', false, '2026-06-01', 3_450_000, [3, 4], 2_550, 3_400, 'READY'],

  // 70. ROYAL DEVELOPMENT HOLDING (Abu Dhabi)
  ['Seamont Autograph Collection Residences', 'ROYALDEV', 'SHAMS', 'Apartment', true, '2028-12-31', 1_850_000, [1, 2, 3, 4], 860, 3_600, '50/50', undefined, 'Marriott Autograph Collection Waterfront', true],
  ['Radian Views Al Reem', 'ROYALDEV', 'ALREEM', 'Apartment', true, '2028-06-30', 1_190_000, [1, 2, 3], 740, 1_960, '50/50'],
  ['Bab Al Qasr Canal View Residence', 'ROYALDEV', 'ALRAHA', 'Apartment', true, '2028-09-30', 1_450_000, [1, 2, 3, 4], 780, 2_650, '50/50'],

  // 71. NINE YARDS DEVELOPMENT (Abu Dhabi)
  ['Sea La Vie at Yas Bay', 'NINEYARDS', 'YASBAY', 'Apartment', true, '2027-06-30', 1_350_000, [1, 2, 3, 4], 740, 3_150, '50/50', undefined, 'Waterfront Lagoon Living at Yas Bay', true],
  ['Sea La Vie Waterfront Townhouses', 'NINEYARDS', 'YASBAY', 'Townhouse', true, '2027-06-30', 4_600_000, [3, 4], 2_950, 3_800, '50/50'],

  // 72. BURTVILLE DEVELOPMENTS (Abu Dhabi)
  ['Bab Al Qasr Residence 25', 'BURTVILLE', 'YASBAY', 'Apartment', true, '2028-12-31', 1_550_000, [1, 2, 3, 4, 5], 790, 3_800, 'PH2Y'],
  ['Bab Al Qasr Resort Residence 18', 'BURTVILLE', 'MASDAR', 'Apartment', true, '2028-06-30', 1_250_000, [1, 2, 3, 4], 740, 2_650, 'PH2Y'],
  ['Ville 12 Masdar City', 'BURTVILLE', 'MASDAR', 'Apartment', true, '2027-12-31', 990_000, [1, 2, 3, 4], 710, 2_180, 'PH2Y'],
  ['Ville 11 Masdar City', 'BURTVILLE', 'MASDAR', 'Apartment', true, '2027-06-30', 920_000, [1, 2, 3], 680, 1_850, 'PH2Y'],

  // 73. BARAKA REAL ESTATE DEVELOPMENT (Abu Dhabi)
  ['Al Qana Waterfront Residences', 'BARAKA', 'ALMAQTA', 'Apartment', true, '2028-09-30', 1_650_000, [1, 2, 3], 820, 2_280, '60/40'],
  ['Al Raha Canal Living', 'BARAKA', 'ALRAHA', 'Apartment', true, '2028-03-31', 1_350_000, [1, 2, 3], 760, 1_960, '60/40'],

  // 74. LEAD DEVELOPMENT (Abu Dhabi)
  ['Jubail Terraces', 'LEADDEV', 'JUBAIL', 'Apartment', true, '2027-06-30', 1_280_000, [1, 2, 3], 790, 2_150, '50/50'],
  ['Jubail Marina Residences', 'LEADDEV', 'JUBAIL', 'Apartment', true, '2028-03-31', 1_750_000, [1, 2, 3, 4], 880, 2_850, '50/50'],
  ['Bada Al Jubail Waterfront Estates', 'LEADDEV', 'JUBAIL', 'Villa', true, '2028-06-30', 29_500_000, [6, 7], 11_000, 24_000, '50/50'],

  // 75. MANAZEL REAL ESTATE (Abu Dhabi)
  ['Ghantoot Waterfront Villas', 'MANAZEL', 'ALJURF', 'Villa', true, '2028-09-30', 3_450_000, [3, 4, 5], 2_850, 4_600, '60/40'],
  ['Al Reef 2 Villas', 'MANAZEL', 'ALREEF2', 'Villa', false, '2019-06-01', 1_450_000, [2, 3], 1_832, 2_250, 'READY'],
  ['Al Reef Arabian & Contemporary Villas', 'MANAZEL', 'ALREEF', 'Villa', false, '2014-05-01', 1_750_000, [2, 3, 4, 5], 1_832, 3_750, 'READY'],
  ['Al Reef Downtown Apartments', 'MANAZEL', 'ALREEF', 'Apartment', false, '2014-09-01', 640_000, [0, 1, 2, 3], 460, 1_650, 'READY'],

  // 76. MASDAR CITY REAL ESTATE (Abu Dhabi)
  ['The Link Masdar City', 'MASDAR', 'MASDAR', 'Apartment', true, '2028-06-30', 890_000, [0, 1, 2, 3], 450, 1_720, '60/40'],
  ['Masdar Square Eco Residences', 'MASDAR', 'MASDAR', 'Apartment', true, '2028-12-31', 940_000, [1, 2, 3], 640, 1_850, '60/40'],
  ['The Gate Masdar City', 'MASDAR', 'MASDAR', 'Apartment', false, '2024-06-01', 720_000, [0, 1, 2, 3], 410, 1_620, 'READY'],
  ['Leonardo Residences Masdar', 'MASDAR', 'MASDAR', 'Apartment', false, '2019-08-01', 690_000, [0, 1, 2, 3], 430, 1_550, 'READY'],

  // 77. WAHAT AL ZAWEYA (Abu Dhabi)
  ['Aryaf Villas Phase 2', 'WAHAT', 'WAHATZ', 'Villa', true, '2028-06-30', 2_450_000, [3, 4, 5], 2_950, 4_800, 'PH3Y'],
  ['Nasayem Eco Villas', 'WAHAT', 'WAHATZ', 'Villa', true, '2028-03-31', 2_650_000, [4, 5], 3_200, 5_100, 'PH3Y'],
  ['Wahat Al Zaweya Desert Oasis', 'WAHAT', 'WAHATZ', 'Villa', false, '2024-09-01', 2_250_000, [3, 4, 5], 2_800, 4_600, 'READY'],

  // 78. AABAR PROPERTIES (Abu Dhabi)
  ['Saraya Corniche Residences', 'AABAR', 'CORNICHE', 'Apartment', true, '2027-12-31', 2_350_000, [1, 2, 3, 4], 910, 3_400, '60/40'],
  ['The Wave Tower Najmat', 'AABAR', 'NAJMAT', 'Apartment', false, '2018-06-01', 1_150_000, [1, 2, 3, 4], 840, 2_850, 'READY'],
  ['Al Raha Lofts', 'AABAR', 'ALRAHA', 'Apartment', false, '2021-09-01', 980_000, [0, 1, 2, 3], 490, 1_960, 'READY'],

  // 79. TAMOUH INVESTMENTS (Abu Dhabi — Al Reem Island)
  ['Horizon Towers Phase II', 'TAMOUH', 'CITYLIGHTS', 'Apartment', true, '2028-03-31', 1_190_000, [1, 2, 3], 780, 1_980, '60/40'],
  ['Marina Square Towers', 'TAMOUH', 'CITYLIGHTS', 'Apartment', false, '2014-03-01', 980_000, [1, 2, 3, 4], 790, 2_650, 'READY'],
  ['City of Lights Sigma & Hydra', 'TAMOUH', 'CITYLIGHTS', 'Apartment', false, '2016-06-01', 890_000, [1, 2, 3], 760, 1_920, 'READY'],

  // 80. AL MARYAH PROPERTY HOLDINGS (Abu Dhabi — ADGM)
  ['Four Seasons Private Residences Al Maryah', 'ALMARYAH', 'ALMARYAH', 'Apartment', true, '2028-09-30', 5_400_000, [2, 3, 4], 1_850, 5_400, '60/40', undefined, 'ADGM Financial Island Ultra-Prime', true],
  ['Al Maryah Waterfront Residences', 'ALMARYAH', 'ALMARYAH', 'Apartment', true, '2028-06-30', 2_450_000, [1, 2, 3], 880, 2_450, '60/40'],

  // 81. EMIRATES STALLIONS GROUP (Abu Dhabi)
  ['Al Reem Marina Suites', 'ESG', 'ALREEM', 'Apartment', true, '2028-06-30', 1_280_000, [1, 2, 3], 760, 1_980, '60/40'],
  ['Century Village Waterfront', 'ESG', 'ALRAHA', 'Apartment', true, '2027-12-31', 1_150_000, [1, 2, 3], 710, 1_840, '60/40'],
  ['Seamont Canal Suites', 'ESG', 'SHAMS', 'Apartment', true, '2028-12-31', 1_450_000, [1, 2, 3], 790, 2_120, '60/40'],

  // ===============================================================================================
  // ADDITIONAL TOP DUBAI & ABU DHABI PROJECTS (COMPLETING 420+ COMPREHENSIVE UAE MASTER CATALOG)
  // ===============================================================================================
  ['Emaar Beachfront Seapoint', 'EMAAR', 'EBEACH', 'Apartment', true, '2028-04-30', 2_750_000, [1, 2, 3, 4, 5, 6], 732, 11_738, '80/20'],
  ['Address Bayview Beachfront', 'EMAAR', 'EBEACH', 'Apartment', true, '2028-07-31', 3_300_000, [1, 2, 3, 4, 5, 6], 736, 11_683, '80/20'],
  ['Creek Waters 2', 'EMAAR', 'CREEKISL', 'Apartment', true, '2027-12-31', 1_700_000, [1, 2, 3, 4, 5], 753, 8_195, '80/20'],
  ['Valo at Dubai Creek Harbour', 'EMAAR', 'CREEK', 'Apartment', true, '2028-09-30', 1_790_000, [1, 2, 3], 752, 2_049, '80/20'],
  ['Arlo at Dubai Creek Harbour', 'EMAAR', 'CREEK', 'Apartment', true, '2028-10-31', 1_700_000, [1, 2, 3], 705, 3_275, '80/20'],
  ['Altus at Dubai Creek Harbour', 'EMAAR', 'CREEKBEACH', 'Apartment', true, '2029-01-31', 1_600_000, [1, 2, 3], 665, 1_928, '80/20'],
  ['Palace Residences Creek Blue', 'EMAAR', 'CREEK', 'Apartment', true, '2029-03-31', 1_870_000, [1, 2, 3], 725, 1_900, '80/20'],
  ['Club Place Dubai Hills', 'EMAAR', 'DHILLS', 'Apartment', true, '2028-12-31', 1_450_000, [1, 2, 3], 693, 1_931, '80/20'],
  ['Address Residences Dubai Hills', 'EMAAR', 'DHILLS', 'Apartment', true, '2029-02-28', 1_930_000, [1, 2, 3], 751, 1_785, '80/20'],
  ['Vida Residences Club Point', 'EMAAR', 'DHILLS', 'Apartment', true, '2029-02-28', 1_610_000, [1, 2, 3], 729, 1_852, '80/20'],
  ['Ocean Star at Rashid Yachts', 'EMAAR', 'MINARASH', 'Apartment', true, '2028-07-31', 1_750_000, [1, 2, 3], 790, 2_026, '80/20'],
  ['Ocean Cove at Rashid Yachts', 'EMAAR', 'MINARASH', 'Apartment', true, '2028-08-31', 1_760_000, [1, 2, 3], 780, 1_866, '80/20'],
  ['Pier Point at Rashid Yachts', 'EMAAR', 'MINARASH', 'Apartment', true, '2028-10-31', 1_930_000, [1, 2, 3], 774, 2_724, '80/20'],
  ['The Valley Velora 2', 'EMAAR', 'THEVALLEY', 'Townhouse', true, '2028-08-31', 2_930_000, [3, 4], 2_457, 2_732, '80/20'],
  ['The Valley Farm Grove', 'EMAAR', 'THEVALLEY', 'Villa', true, '2028-12-31', 4_440_000, [4, 5], 3_234, 3_756, '80/20'],
  ['The Oasis Mirage', 'EMAAR', 'THEOASIS', 'Villa', true, '2028-06-30', 15_800_000, [5, 6], 10_225, 11_297, '80/20'],
  ['The Oasis Address Villas Tierra', 'EMAAR', 'THEOASIS', 'Villa', true, '2029-06-30', 13_160_000, [4, 5, 6], 7_287, 12_777, '80/20'],
  ['Golf Point at Emaar South', 'EMAAR', 'DWC', 'Apartment', true, '2028-10-31', 850_000, [1, 2, 3], 673, 2_120, '80/20'],
  ['Golf Meadow at Emaar South', 'EMAAR', 'DWC', 'Apartment', true, '2029-07-31', 1_120_000, [1, 2, 3], 654, 2_828, '80/20'],
  ['Albero at Green Gate DCH', 'EMAAR', 'CREEK', 'Apartment', true, '2029-09-30', 1_820_000, [1, 2, 3], 754, 1_848, '80/20'],
  ['Silva at Green Gate DCH', 'EMAAR', 'CREEK', 'Apartment', true, '2029-09-30', 1_810_000, [1, 2, 3], 744, 3_254, '80/20'],

  ['DAMAC Lagoons Mykonos', 'DAMAC', 'DAMACL', 'Townhouse', true, '2027-06-30', 2_550_000, [4, 5], 2_282, 3_377, '70/30'],
  ['DAMAC Lagoons Ibiza', 'DAMAC', 'DAMACL', 'Townhouse', true, '2027-03-31', 2_450_000, [4, 5], 2_282, 3_377, '70/30'],
  ['DAMAC Lagoons Morocco', 'DAMAC', 'DAMACL', 'Villa', true, '2027-06-30', 2_990_000, [4, 5, 6, 7], 2_282, 17_000, '70/30'],
  ['DAMAC Sun City', 'DAMAC', 'DAMACH2', 'Townhouse', true, '2028-03-31', 2_250_000, [4, 5], 2_319, 3_324, '70/30'],
  ['DAMAC Utopia Resort Villas', 'DAMAC', 'DAMACH', 'Villa', true, '2027-06-30', 19_100_000, [5, 6, 7], 13_555, 25_317, '70/30'],
  ['DAMAC Riverside Ivy & Sage', 'DAMAC', 'RIVERSIDE', 'Townhouse', true, '2027-12-31', 1_990_000, [4, 5], 2_297, 3_407, '70/30'],
  ['Volta on Sheikh Zayed Road', 'DAMAC', 'SZR', 'Apartment', true, '2028-03-31', 1_670_000, [1, 2, 3, 4], 673, 2_167, '70/30'],
  ['Cavalli Couture Canal', 'DAMAC', 'DWCANAL', 'Apartment', true, '2027-03-31', 16_500_000, [3, 4, 5], 4_250, 8_750, '70/30'],
  ['Elo 3 at DAMAC Hills 2', 'DAMAC', 'DAMACH2', 'Apartment', true, '2027-06-30', 547_000, [1, 2], 525, 1_078, '70/30'],

  ['Sobha One Element', 'SOBHA', 'RASALKHOR', 'Apartment', true, '2028-12-31', 1_820_000, [1, 2, 3, 4], 729, 2_445, '60/40'],
  ['Skyscape Aura at Hartland II', 'SOBHA', 'SOBHAH2', 'Apartment', true, '2028-12-31', 1_740_000, [1, 2, 3], 741, 1_987, '60/40'],
  ['Skyscape Avenue at Hartland II', 'SOBHA', 'SOBHAH2', 'Apartment', true, '2028-12-31', 1_700_000, [1, 2, 3], 739, 2_015, '60/40'],
  ['Riverside Crescent 360', 'SOBHA', 'SOBHAH2', 'Apartment', true, '2027-12-31', 1_490_000, [1, 2], 609, 1_197, '60/40'],
  ['Sobha Reserve Villas', 'SOBHA', 'WADISAFA', 'Villa', true, '2027-03-31', 7_700_000, [4, 5], 4_983, 5_746, '60/40'],
  ['Sobha Estates Hartland II', 'SOBHA', 'SOBHAH2', 'Villa', true, '2027-06-30', 22_700_000, [5, 6], 8_400, 16_000, '60/40'],

  ['Binghatti Ivory', 'BINGHATTI', 'ALJADDAF', 'Apartment', true, '2027-01-31', 888_888, [1, 2], 680, 1_450, '70/30'],
  ['Binghatti Elite', 'BINGHATTI', 'IMPZ', 'Apartment', true, '2027-01-31', 550_000, [0, 1], 363, 810, '70/30'],
  ['Binghatti Starlight', 'BINGHATTI', 'ALJADDAF', 'Apartment', true, '2027-03-31', 850_000, [0, 1, 2], 417, 1_550, '70/30'],
  ['Binghatti Twilight', 'BINGHATTI', 'ALJADDAF', 'Apartment', true, '2027-03-31', 1_250_000, [1, 2, 3], 751, 2_050, '70/30'],
  ['Binghatti Hillviews', 'BINGHATTI', 'DSP', 'Apartment', true, '2027-03-31', 800_000, [0, 1, 2], 386, 1_476, '70/30'],
  ['Binghatti Circle', 'BINGHATTI', 'JVC', 'Apartment', true, '2027-09-30', 675_000, [0, 1, 2, 3], 370, 1_650, '70/30'],
  ['Binghatti Flare', 'BINGHATTI', 'JVT', 'Apartment', true, '2027-12-31', 800_000, [0, 1, 2, 3, 4], 410, 2_250, '70/30'],
  ['Binghatti Vintage', 'BINGHATTI', 'MAJAN', 'Apartment', true, '2027-09-30', 675_000, [0, 1, 2], 385, 1_320, '70/30'],

  ['Azizi Gabriel', 'AZIZI', 'DTJEBEL', 'Apartment', true, '2028-12-31', 550_000, [0, 1, 2], 350, 1_190, '50/50'],
  ['Azizi David', 'AZIZI', 'ALJADDAF', 'Apartment', true, '2027-12-31', 790_000, [0, 1, 2], 370, 1_260, '50/50'],
  ['Azizi Abraham', 'AZIZI', 'DTJEBEL', 'Apartment', true, '2027-12-31', 540_000, [0, 1, 2, 3], 350, 1_520, '50/50'],
  ['Azizi Amir', 'AZIZI', 'FURJAN', 'Apartment', true, '2027-12-31', 1_250_000, [1, 2, 3], 720, 1_750, '50/50'],
  ['Azizi Raffi', 'AZIZI', 'FURJAN', 'Apartment', true, '2027-03-31', 610_000, [0, 1, 2, 3], 360, 1_640, '50/50'],
  ['Azizi Sikander', 'AZIZI', 'FURJAN', 'Apartment', true, '2027-06-30', 580_000, [0, 1, 2], 345, 1_240, '50/50'],

  ['Mercer House South', 'ELLINGTON', 'DMCCEZ', 'Apartment', true, '2027-09-30', 1_290_000, [0, 1, 2, 3], 515, 2_650, '70/30'],
  ['The Watercrest', 'ELLINGTON', 'MBRC', 'Townhouse', true, '2027-12-31', 6_300_000, [3, 4], 3_800, 4_950, '70/30'],
  ['Rosemont Residences', 'ELLINGTON', 'JVT', 'Apartment', true, '2027-03-31', 1_180_000, [1, 2], 780, 1_360, '70/30'],
  ['Belgravia Gardens', 'ELLINGTON', 'DLRC', 'Apartment', true, '2028-09-30', 760_000, [0, 1, 2, 3], 425, 1_750, '70/30'],
  ['The Quayside Business Bay', 'ELLINGTON', 'BBAY', 'Apartment', true, '2027-02-28', 1_320_000, [0, 1, 2, 3, 5], 545, 4_200, '70/30'],
  ['Art Bay Al Jaddaf', 'ELLINGTON', 'ALJADDAF', 'Apartment', true, '2027-01-31', 895_000, [0, 1, 2, 3], 430, 2_180, '70/30'],

  ['Design Quarter Tower C', 'MERAAS', 'MBRC', 'Apartment', true, '2027-06-30', 1_950_000, [1, 2, 3], 795, 3_250, '60/40'],
  ['Erin Central Park', 'MERAAS', 'CITYWALK', 'Apartment', true, '2027-03-31', 1_850_000, [1, 2, 3, 4, 5], 760, 6_800, '70/30'],
  ['Elara Madinat Jumeirah', 'MERAAS', 'MJL', 'Apartment', true, '2027-01-31', 2_300_000, [1, 2, 3, 4], 715, 4_600, '70/30'],
  ['Solaya La Mer', 'MERAAS', 'LAMER', 'Apartment', true, '2029-03-31', 13_500_000, [2, 3, 4, 5], 1_950, 9_500, '60/40'],

  ['Beach Walk Residence 4', 'IMTIAZ', 'DISLANDS', 'Apartment', true, '2027-09-30', 1_850_000, [1, 2, 3], 820, 2_180, '60/40'],
  ['Cotier House 2', 'IMTIAZ', 'DISLANDS', 'Apartment', true, '2027-06-30', 2_400_000, [1, 2, 3, 4], 910, 3_600, '60/40'],
  ['Cove Boulevard', 'IMTIAZ', 'DLRC', 'Apartment', true, '2028-06-30', 670_000, [0, 1, 2, 3], 395, 1_650, 'PH3Y'],
  ['Westwood Grande II', 'IMTIAZ', 'JVC', 'Apartment', false, '2025-11-01', 640_000, [0, 1], 410, 810, 'READY'],

  ['Samana Resorts 2', 'SAMANA', 'IMPZ', 'Apartment', true, '2028-06-30', 670_000, [0, 1, 2], 420, 1_340, '1%M'],
  ['Samana Park Meadows', 'SAMANA', 'DLRC', 'Apartment', true, '2028-03-31', 684_000, [0, 1, 2], 425, 1_310, '1%M'],
  ['Samana Ocean Pearl 2', 'SAMANA', 'DISLANDS', 'Apartment', true, '2027-09-30', 1_650_000, [1, 2, 3, 4], 810, 2_650, '1%M'],
  ['Samana Ibiza', 'SAMANA', 'DLRC', 'Apartment', true, '2028-03-31', 699_000, [0, 1, 2], 415, 1_290, '1%M'],
  ['Samana Lake Views 2', 'SAMANA', 'IMPZ', 'Apartment', true, '2027-11-30', 640_000, [0, 1, 2], 410, 1_260, '1%M'],

  ['Grove on the Park', 'NSHAMA', 'TSQ', 'Apartment', true, '2027-09-30', 950_000, [1, 2, 3], 645, 1_550, '50/50'],
  ['Parkside Views', 'NSHAMA', 'TSQ', 'Apartment', true, '2027-12-31', 970_000, [1, 2, 3], 650, 1_590, '50/50'],
  ['Lexington', 'NSHAMA', 'TSQ', 'Apartment', true, '2027-09-30', 960_000, [1, 2, 3], 640, 1_520, '50/50'],
  ['Savannah Town Square', 'NSHAMA', 'TSQ', 'Apartment', true, '2027-06-30', 940_000, [1, 2, 3], 635, 1_490, '50/50'],

  // ===============================================================================================
  // ADDITIONAL ABU DHABI PROJECTS ACROSS ALL KEY ISLANDS & MAINLAND DISTRICTS
  // ===============================================================================================
  ['The Source II', 'ALDAR', 'SAADCULT', 'Apartment', true, '2027-03-31', 2_700_000, [1, 2, 3], 980, 2_950, '60/40'],
  ['Saadiyat Grove Fountain Views', 'ALDAR', 'SAADGROVE', 'Apartment', true, '2027-03-31', 1_150_000, [0, 1, 2], 470, 1_480, '60/40'],
  ['Louvre Abu Dhabi Residences', 'ALDAR', 'SAADCULT', 'Apartment', false, '2026-03-01', 1_850_000, [0, 1, 2, 3], 490, 2_650, 'READY'],
  ['Yas Park Views', 'ALDAR', 'YASNORTH', 'Villa', true, '2027-03-31', 3_150_000, [3, 4, 5], 2_163, 3_600, '50/50'],
  ['Yas Golf Collection', 'ALDAR', 'YAS', 'Apartment', false, '2026-06-01', 990_000, [0, 1, 2, 3], 460, 2_450, 'READY'],
  ['Alreeman Living II', 'ALDAR', 'SHAMKHA', 'Apartment', true, '2027-01-31', 420_000, [0, 1, 2, 3], 320, 1_450, '50/50'],
  ['Al Ghadeer Phase 2', 'ALDAR', 'GHADEER', 'Townhouse', false, '2023-06-01', 1_250_000, [1, 2, 3], 950, 2_100, 'READY'],
  ['Al Raha Gardens Yasmina', 'ALDAR', 'ALRAHAG', 'Villa', false, '2014-05-01', 3_100_000, [3, 4, 5], 2_850, 4_900, 'READY'],
  ['Al Raha Golf Gardens', 'ALDAR', 'ALFAHIM', 'Villa', false, '2013-09-01', 4_400_000, [3, 4, 5, 6], 3_350, 6_200, 'READY'],
  ['Al Bateen Park Villas', 'ALDAR', 'ALBATEEN', 'Villa', false, '2015-03-01', 6_800_000, [4, 5, 6], 4_200, 6_800, 'READY'],
  ['Jawaher Saadiyat', 'ALDAR', 'SAAD', 'Villa', false, '2020-06-01', 9_800_000, [4, 5, 6], 4_600, 9_500, 'READY'],
  ['Noya Viva Yas Island', 'ALDAR', 'YASNORTH', 'Townhouse', false, '2024-06-01', 2_350_000, [2, 3, 4], 1_345, 2_450, 'READY'],
  ['Reflection Al Reem Island', 'ALDAR', 'SHAMS', 'Apartment', false, '2023-09-01', 840_000, [0, 1, 2, 3], 410, 1_520, 'READY'],
  ['Ansam Yas Island', 'ALDAR', 'YAS', 'Apartment', false, '2019-06-01', 1_150_000, [0, 1, 2, 3], 520, 1_960, 'READY'],
  ['Al Merief Khalifa City', 'ALDAR', 'KHALIFA', 'Villa', false, '2018-06-01', 5_400_000, [4, 5, 6], 4_400, 7_200, 'READY'],

  ['Hudayriyat Surf Park Villas', 'MODON', 'HUDAYR', 'Villa', true, '2029-03-31', 7_800_000, [4, 5, 6], 4_100, 6_900, '60/40'],
  ['Nawayef East Mansions', 'MODON', 'HUDAYR', 'Villa', true, '2028-09-30', 22_000_000, [6, 7, 8], 9_500, 18_500, '60/40'],
  ['Riyadh City North Villas', 'MODON', 'ZAYEDCITY', 'Villa', true, '2028-03-31', 3_400_000, [4, 5], 3_200, 4_800, '50/50'],
  ['Al Hudayriyat Marina Residences', 'MODON', 'HUDAYR', 'Apartment', true, '2029-06-30', 2_150_000, [1, 2, 3, 4], 890, 3_600, '50/50'],

  ['Bloom Living Toledo', 'BLOOM', 'BLOOMLIV', 'Townhouse', false, '2026-03-01', 2_250_000, [2, 3, 4, 5], 1_310, 4_400, 'READY'],
  ['Bloom Living Casares', 'BLOOM', 'BLOOMLIV', 'Townhouse', true, '2027-01-31', 1_850_000, [2, 3], 1_290, 1_850, 'PH2Y'],
  ['Bloom Living Almeria', 'BLOOM', 'BLOOMLIV', 'Villa', true, '2027-12-31', 3_650_000, [3, 4, 5, 6], 2_730, 5_600, 'PH2Y'],
  ['Bloom Gardens Faya', 'BLOOM', 'ALMUSH', 'Townhouse', false, '2019-06-01', 3_250_000, [3, 4, 5], 2_650, 4_200, 'READY'],
  ['Bloom Marina Al Bateen', 'BLOOM', 'ALBATEEN', 'Apartment', false, '2018-09-01', 1_850_000, [1, 2, 3, 4], 910, 2_850, 'READY'],

  ['AlJurf Gardens Phase 3', 'IMKAN', 'ALJURF', 'Villa', true, '2027-09-30', 3_200_000, [2, 3, 4, 5], 2_250, 5_100, '50/50'],
  ['Makers District Waterfront Lofts', 'IMKAN', 'MAKERS', 'Apartment', true, '2028-06-30', 1_190_000, [1, 2, 3], 760, 1_960, '50/50'],
  ['Sheikha Fatima Park Residences', 'IMKAN', 'KHALIDIYAH', 'Apartment', false, '2024-03-01', 1_650_000, [1, 2, 3], 840, 2_120, 'READY'],

  ['Marlin 2 Al Reem', 'REPORTAGE', 'ALREEM', 'Apartment', true, '2027-12-31', 1_180_000, [2, 3, 4], 1_050, 2_280, '70/30'],
  ['Perla 3 Yas Bay', 'REPORTAGE', 'YASBAY', 'Apartment', true, '2027-09-30', 1_250_000, [1, 2, 3, 4], 780, 2_450, '70/30'],
  ['Al Maryah Vista 2', 'REPORTAGE', 'ALMARYAH', 'Apartment', true, '2027-03-31', 790_000, [0, 1, 2, 3, 4], 380, 1_960, '70/30'],
  ['Oasis Residences 2 Masdar', 'REPORTAGE', 'MASDAR', 'Apartment', false, '2024-09-01', 640_000, [0, 1, 2, 3], 410, 1_490, 'READY'],
  ['Al Raha Lofts Two', 'REPORTAGE', 'ALRAHA', 'Apartment', false, '2023-06-01', 990_000, [0, 1, 2, 3], 490, 1_850, 'READY'],

  ['Reem Hills Canal Villas', 'QPROP', 'NAJMAT', 'Villa', true, '2028-06-30', 7_900_000, [4, 5, 6], 4_600, 8_200, '50/50'],
  ['Bab Al Qasr Beachfront', 'ROYALDEV', 'YASBAY', 'Apartment', true, '2028-12-31', 1_950_000, [1, 2, 3, 4], 840, 2_950, '50/50'],
  ['Bab Al Qasr Resort 19', 'BURTVILLE', 'MASDAR', 'Apartment', true, '2028-09-30', 1_290_000, [1, 2, 3, 4], 750, 2_550, 'PH2Y'],
  ['Maryam-Style Ramhan Cove', 'EAGLEHILLS', 'RAMHAN', 'Villa', true, '2028-12-31', 9_800_000, [4, 5, 6], 3_800, 6_900, '50/50'],
  ['Nad Al Dhabi Villas', 'JIIC', 'JUBAIL', 'Villa', true, '2027-06-30', 4_950_000, [4, 5, 6], 3_400, 6_400, '50/50'],
  ['Souk Al Jubail Villas', 'JIIC', 'JUBAIL', 'Villa', false, '2025-11-01', 4_400_000, [3, 4, 5], 3_100, 5_600, 'READY'],
  ['Nurai-View Riviera Mansions', 'OHANA', 'ALJURF', 'Villa', true, '2029-03-31', 14_500_000, [5, 6, 7], 6_400, 12_500, '50/50'],
  ['Radiant Bay Al Reem', 'RADIANT', 'CITYLIGHTS', 'Apartment', true, '2027-06-30', 980_000, [1, 2, 3], 690, 1_750, '50/50'],
  ['Nurai Island Private Estates', 'ALDAR', 'NURAI', 'Villa', false, '2018-06-01', 35_000_000, [4, 5, 6], 6_500, 18_000, 'READY'],
  ['Bawabat Al Sharq Residences', 'MANAZEL', 'BANIYAS', 'Apartment', false, '2017-05-01', 690_000, [0, 1, 2, 3], 490, 1_650, 'READY'],
  ['Capital Centre ADNEC Plaza Residences', 'AABAR', 'CAPCENTRE', 'Apartment', false, '2019-06-01', 1_150_000, [1, 2, 3], 820, 1_960, 'READY'],
  ['Corniche Nation Towers Residences', 'AABAR', 'CORNICHE', 'Apartment', false, '2014-09-01', 2_650_000, [1, 2, 3, 4], 1_150, 3_800, 'READY'],
  ['Al Markaziyah World Trade Center Residences', 'ALDAR', 'MARKAZIYAH', 'Apartment', false, '2015-03-01', 1_950_000, [1, 2, 3, 4], 980, 3_100, 'READY'],
  ['Al Danah Etihad Plaza Residences', 'TAMOUH', 'ALDANAH', 'Apartment', false, '2016-06-01', 1_100_000, [1, 2, 3], 820, 1_850, 'READY'],
  ['Al Zahiyah Beach Rotana Residences', 'ALMARYAH', 'ZAHIYAH', 'Apartment', false, '2018-06-01', 1_650_000, [1, 2, 3], 890, 2_250, 'READY'],
  ['Danet Abu Dhabi Gardens', 'BLOOM', 'DANET', 'Apartment', false, '2017-09-01', 980_000, [1, 2, 3], 790, 1_840, 'READY'],
  ['MBZ City Prestige Villas', 'MODON', 'MBZCITY', 'Villa', false, '2020-06-01', 4_200_000, [4, 5, 6], 4_100, 7_200, 'READY'],
  ['Shakhbout City Modern Villas', 'MODON', 'SHAKHBOUT', 'Villa', true, '2027-12-31', 3_800_000, [4, 5, 6], 3_850, 6_500, '50/50'],
  ['Al Bahia Coastal Villas', 'MANAZEL', 'ALBAHIA', 'Villa', false, '2021-06-01', 3_100_000, [4, 5], 3_400, 5_200, 'READY'],
  ['Al Lulu Island Resort Villas', 'MIRAL', 'ALLULU', 'Villa', true, '2030-06-30', 18_500_000, [5, 6], 6_200, 11_500, '60/40'],

  // ===============================================================================================
  // FINAL EXPANSION WAVE (TOPPING 425+ PROJECTS — MAJOR DUBAI & ABU DHABI SUB-DISTRICTS & DEVELOPERS)
  // ===============================================================================================
  ['Park Horizon', 'EMAAR', 'DHILLS', 'Apartment', true, '2027-01-31', 1_350_000, [1, 2, 3], 660, 1_850, '80/20'],
  ['Elvira Dubai Hills', 'EMAAR', 'DHILLS', 'Apartment', true, '2027-01-31', 1_390_000, [1, 2, 3], 680, 1_940, '80/20'],
  ['Club Drive', 'EMAAR', 'DHILLS', 'Apartment', true, '2028-02-28', 1_550_000, [1, 2, 3], 727, 1_938, '80/20'],
  ['Greenside Residence', 'EMAAR', 'DHILLS', 'Apartment', true, '2027-07-31', 1_490_000, [1, 2, 3], 720, 1_795, '80/20'],
  ['Mangrove Creek Beach', 'EMAAR', 'CREEKBEACH', 'Apartment', true, '2027-01-31', 1_480_000, [1, 2, 3], 615, 1_720, '80/20'],
  ['Aeon Creek Beach', 'EMAAR', 'CREEKBEACH', 'Apartment', true, '2028-04-30', 1_710_000, [1, 2, 3], 762, 1_760, '80/20'],
  ['Oria Creek Beach', 'EMAAR', 'CREEKBEACH', 'Apartment', true, '2028-07-31', 1_700_000, [1, 2, 3], 749, 1_729, '80/20'],
  ['Bayline Rashid Yachts', 'EMAAR', 'MINARASH', 'Apartment', true, '2027-12-31', 1_600_000, [1, 2, 3], 814, 2_761, '80/20'],
  ['Avonlea Rashid Yachts', 'EMAAR', 'MINARASH', 'Apartment', true, '2027-11-30', 1_560_000, [1, 2, 3], 822, 2_754, '80/20'],
  ['Sunridge Rashid Yachts', 'EMAAR', 'MINARASH', 'Apartment', true, '2027-02-28', 1_470_000, [1, 2], 765, 1_793, '80/20'],
  ['Lillian at The Valley', 'EMAAR', 'THEVALLEY', 'Townhouse', true, '2027-05-31', 2_300_000, [3, 4, 5], 2_100, 3_200, '80/20'],
  ['Avena 2 at The Valley', 'EMAAR', 'THEVALLEY', 'Villa', true, '2028-06-30', 4_370_000, [4], 3_685, 3_710, '80/20'],
  ['Fairway Villas 3', 'EMAAR', 'DWC', 'Villa', true, '2028-03-31', 4_390_000, [4, 5], 3_126, 4_552, '80/20'],
  ['Golf Lane Villas', 'EMAAR', 'DWC', 'Villa', true, '2028-10-31', 4_480_000, [4, 5], 4_016, 4_911, '80/20'],
  ['Address Grand Downtown', 'EMAAR', 'DOWNTOWN', 'Apartment', true, '2028-10-31', 11_000_000, [3, 4, 5], 4_106, 11_000, '80/20'],
  ['St. Regis Residences Downtown', 'EMAAR', 'DOWNTOWNB', 'Apartment', true, '2027-01-31', 2_450_000, [1, 2, 3], 790, 2_100, '80/20'],
  ['Burj Royale Downtown', 'EMAAR', 'DOWNTOWN', 'Apartment', false, '2023-03-01', 1_750_000, [1, 2, 3], 630, 1_420, 'READY'],
  ['Forte Opera District', 'EMAAR', 'DOWNTOWNB', 'Apartment', false, '2023-09-01', 1_850_000, [1, 2, 3, 4], 670, 2_250, 'READY'],
  ['Creek Palace', 'EMAAR', 'CREEKISL', 'Apartment', false, '2026-03-01', 1_750_000, [1, 2, 3], 640, 2_280, 'READY'],
  ['Collective Dubai Hills', 'EMAAR', 'DHILLS', 'Apartment', false, '2022-09-01', 1_150_000, [1, 2], 475, 745, 'READY'],
  ['Acacia Park Heights', 'EMAAR', 'DHILLS', 'Apartment', false, '2020-05-01', 1_650_000, [1, 2, 3], 760, 2_450, 'READY'],
  ['Mulberry Park Heights', 'EMAAR', 'DHILLS', 'Apartment', false, '2020-03-01', 1_750_000, [1, 2, 3], 820, 2_550, 'READY'],

  ['Cavalli Bay', 'DAMAC', 'DHARB', 'Apartment', true, '2027-07-31', 2_900_000, [1, 2, 3, 4, 5], 733, 6_500, '80/20'],
  ['DAMAC Casa at Al Sufouh', 'DAMAC', 'ALSUFOUH', 'Apartment', true, '2028-05-31', 2_480_000, [1, 2, 3, 4, 5], 796, 6_096, '80/20'],
  ['DAMAC Canal Crown', 'DAMAC', 'BBAY', 'Apartment', true, '2027-12-31', 1_120_000, [0, 1, 2, 3, 4], 406, 4_750, '80/20'],
  ['DAMAC Coral Reef', 'DAMAC', 'DMC', 'Apartment', true, '2028-03-31', 1_660_000, [1, 2, 3], 776, 1_815, '70/30'],
  ['DAMAC Harbour Lights', 'DAMAC', 'DMC', 'Apartment', true, '2027-04-30', 1_360_000, [1, 2, 3], 801, 1_720, '80/20'],
  ['DAMAC Park Greens Phase 2', 'DAMAC', 'DAMACH2', 'Villa', true, '2027-03-31', 2_890_000, [5], 3_542, 3_542, '70/30'],
  ['DAMAC Autograph Collection', 'DAMAC', 'DAMACH', 'Villa', true, '2027-05-31', 5_100_000, [4, 5, 6, 7], 2_911, 20_747, '60/40'],
  ['DAMAC Golf Greens 2', 'DAMAC', 'DAMACH', 'Apartment', true, '2027-06-30', 984_000, [1, 2], 652, 1_644, '80/20'],

  ['Sobha Verde JLT', 'SOBHA', 'JLT', 'Apartment', true, '2027-01-31', 1_600_000, [1, 2, 3], 770, 2_190, '80/20'],
  ['Sobha One Tower E', 'SOBHA', 'RASALKHOR', 'Apartment', true, '2027-01-31', 1_400_000, [1, 2, 3, 4], 537, 2_556, '60/40'],
  ['Sobha Creek Vistas Grande', 'SOBHA', 'SOBHAH', 'Apartment', false, '2025-09-01', 1_550_000, [1, 2, 3], 745, 1_648, 'READY'],
  ['Sobha Crest Grande', 'SOBHA', 'SOBHAH', 'Apartment', false, '2026-03-01', 1_450_000, [1, 2, 3, 4], 729, 2_345, 'READY'],

  ['Rixos Beach Residences', 'NAKHEEL', 'DISLANDS', 'Villa', true, '2027-03-31', 14_500_000, [4], 6_350, 6_350, '80/20'],
  ['Tilal Al Furjan', 'NAKHEEL', 'ALFURJANW', 'Villa', false, '2025-06-01', 4_950_000, [4, 5], 3_600, 5_300, 'READY'],
  ['Murooj Al Furjan', 'NAKHEEL', 'ALFURJANW', 'Villa', false, '2024-12-01', 4_400_000, [3, 4, 5], 2_600, 4_800, 'READY'],
  ['Palm Beach Towers 3', 'NAKHEEL', 'PALM', 'Apartment', true, '2027-01-31', 2_600_000, [1, 2, 3, 4], 1_068, 3_400, '60/40'],

  ['Breez', 'DANUBE', 'DMC', 'Apartment', true, '2029-03-31', 1_300_000, [0, 1, 2, 3, 4], 415, 2_150, '1%M'],
  ['Fashionz', 'DANUBE', 'JVT', 'Apartment', false, '2026-08-01', 890_000, [0, 1, 2, 3], 347, 1_550, 'READY'],
  ['Viewz Aston Martin', 'DANUBE', 'JLT', 'Apartment', false, '2026-06-01', 1_150_000, [0, 1, 2, 3, 4, 5], 405, 5_200, 'READY'],
  ['Elitz 2', 'DANUBE', 'JVC', 'Apartment', false, '2026-09-01', 720_000, [0, 1, 2, 3], 386, 1_490, 'READY'],

  ['Binghatti Dawn', 'BINGHATTI', 'JVC', 'Apartment', false, '2025-12-01', 690_000, [0, 1, 2], 415, 1_450, 'READY'],
  ['Binghatti Dusk', 'BINGHATTI', 'JVC', 'Apartment', false, '2025-11-01', 680_000, [0, 1], 405, 860, 'READY'],
  ['Binghatti Phantom', 'BINGHATTI', 'JVC', 'Apartment', false, '2026-05-01', 1_100_000, [1, 2, 3], 795, 2_150, 'READY'],
  ['Binghatti Grove', 'BINGHATTI', 'JVC', 'Apartment', true, '2027-03-31', 1_199_999, [1, 2, 3], 760, 1_850, '70/30'],
  ['Binghatti Royale', 'BINGHATTI', 'JVC', 'Apartment', false, '2026-06-01', 1_150_000, [1, 2, 3], 805, 1_920, 'READY'],

  ['Azizi Amber Al Furjan', 'AZIZI', 'FURJAN', 'Apartment', false, '2025-03-01', 640_000, [0, 1, 2, 3], 355, 1_580, 'READY'],
  ['Azizi Creek Views III', 'AZIZI', 'DHCC2', 'Apartment', false, '2025-09-01', 790_000, [0, 1, 2, 3], 360, 1_650, 'READY'],
  ['Azizi Vista Studio City', 'AZIZI', 'STUDIO', 'Apartment', false, '2025-11-01', 575_000, [0, 1, 2], 335, 1_120, 'READY'],
  ['Azizi Grand Sports City', 'AZIZI', 'SPORTS', 'Apartment', false, '2025-06-01', 590_000, [0, 1, 2], 420, 1_240, 'READY'],

  ['Bluewaters Residences Building 8', 'MERAAS', 'BLUEW', 'Apartment', false, '2019-09-01', 4_500_000, [1, 2, 3, 4], 1_120, 2_520, 'READY'],
  ['La Cote Port de La Mer', 'MERAAS', 'LAMER', 'Apartment', false, '2021-10-01', 2_150_000, [1, 2, 3, 4], 780, 2_980, 'READY'],
  ['Laurel Central Park', 'MERAAS', 'CITYWALK', 'Apartment', false, '2025-12-01', 1_950_000, [1, 2, 3, 4], 678, 3_600, 'READY'],
  ['Thyme Central Park', 'MERAAS', 'CITYWALK', 'Apartment', false, '2026-08-01', 2_050_000, [1, 2, 3, 4], 644, 3_400, 'READY'],

  ['Hamilton House', 'ELLINGTON', 'JVC', 'Apartment', false, '2025-06-01', 790_000, [0, 1, 2], 435, 1_240, 'READY'],
  ['Upper House', 'ELLINGTON', 'JLT', 'Apartment', false, '2026-04-01', 990_000, [0, 1, 2, 3], 425, 2_050, 'READY'],
  ['The Crestmark', 'ELLINGTON', 'BBAY', 'Apartment', false, '2026-03-01', 1_390_000, [0, 1, 2, 3], 492, 3_100, 'READY'],
  ['One River Point', 'ELLINGTON', 'BBAY', 'Apartment', true, '2027-06-30', 1_450_000, [0, 1, 2, 3, 4], 490, 5_100, '70/30'],

  ['Jumeirah Living Marina Gate', 'SELECT', 'MARINA', 'Apartment', false, '2020-12-01', 2_450_000, [0, 1, 2, 3, 4, 5], 605, 5_200, 'READY'],
  ['Studio One Marina', 'SELECT', 'MARINA', 'Apartment', false, '2019-06-01', 980_000, [0, 1, 2], 357, 1_098, 'READY'],
  ['Peninsula Five', 'SELECT', 'PENINSULA', 'Apartment', false, '2025-06-01', 1_450_000, [0, 1, 2, 3, 4], 515, 4_200, 'READY'],

  ['Park Views Residences B', 'WASL', 'WASL1', 'Apartment', true, '2027-01-31', 1_350_000, [1, 2, 3], 760, 2_150, '60/40'],
  ['Hillside Residences', 'WASL', 'WASLG', 'Apartment', true, '2027-06-30', 890_000, [1, 2, 3, 4], 710, 2_850, '60/40'],
  ['Gardenia Townhomes', 'WASL', 'WASLG', 'Townhouse', false, '2022-06-01', 3_150_000, [3, 4], 2_550, 3_150, 'READY'],

  ['Aura Gardens Tilal Al Ghaf', 'MAF', 'TILAL', 'Townhouse', false, '2024-12-01', 3_450_000, [3, 4], 2_175, 3_411, 'READY'],
  ['Alaya Beach Mansions', 'MAF', 'TILAL', 'Villa', false, '2025-09-01', 11_500_000, [4, 5, 6], 5_815, 9_522, 'READY'],
  ['Lanai Islands', 'MAF', 'TILAL', 'Villa', true, '2027-06-30', 65_000_000, [4, 5, 6, 7, 8], 23_652, 30_738, '60/40'],

  ['Saadiyat Reserve The Dunes', 'ALDAR', 'SAAD', 'Villa', false, '2024-06-01', 7_800_000, [4, 5], 4_950, 6_450, 'READY'],
  ['Yas Park Gate', 'ALDAR', 'YASNORTH', 'Townhouse', false, '2026-04-01', 2_150_000, [2, 3, 4], 1_360, 2_580, 'READY'],
  ['Perla 1 & 2 Yas Bay', 'REPORTAGE', 'YASBAY', 'Apartment', false, '2025-12-01', 1_190_000, [1, 2, 3, 4], 760, 2_380, 'READY'],
  ['Al Gurm Phase 2', 'ALDAR', 'ALBATEEN', 'Villa', true, '2027-06-30', 18_500_000, [5, 6, 7], 7_500, 14_500, '60/40'],
  ['Lea Yas Acres Plots', 'ALDAR', 'YASACRES', 'Villa', false, '2023-06-01', 4_600_000, [4, 5, 6], 4_200, 7_500, 'READY'],
  ['Grove Museum Views', 'ALDAR', 'SAADGROVE', 'Apartment', false, '2025-12-01', 1_190_000, [0, 1, 2], 460, 1_510, 'READY'],
  ['Grove Uptown Views', 'ALDAR', 'SAADGROVE', 'Apartment', false, '2026-03-01', 1_150_000, [0, 1, 2], 455, 1_490, 'READY'],
  ['Sun & Sky Towers', 'ALDAR', 'SHAMS', 'Apartment', false, '2012-06-01', 1_150_000, [1, 2, 3, 4], 860, 2_650, 'READY'],
  ['Meera Shams Abu Dhabi', 'ALDAR', 'SHAMS', 'Apartment', false, '2019-03-01', 980_000, [1, 2, 3], 680, 1_650, 'READY'],
  ['West Yas Villas', 'ALDAR', 'YAS', 'Villa', false, '2019-09-01', 5_600_000, [4, 5], 4_650, 6_100, 'READY'],
  ['Mayan Beachfront Phase 2', 'ALDAR', 'YAS', 'Apartment', false, '2023-06-01', 1_350_000, [1, 2, 3, 4], 790, 2_980, 'READY'],
  ['Saadiyat Beach Villas', 'ALDAR', 'SAAD', 'Villa', false, '2015-06-01', 11_500_000, [3, 4, 5, 6], 3_950, 11_200, 'READY'],
  ['Saadiyat Beach Residences', 'ALDAR', 'SAAD', 'Apartment', false, '2014-09-01', 2_450_000, [1, 2, 3, 4], 1_080, 3_600, 'READY'],
  ['Yas Island Marina Heights', 'ALDAR', 'YAS', 'Apartment', false, '2022-06-01', 1_190_000, [1, 2, 3], 760, 1_890, 'READY'],

  // ===============================================================================================
  // FINAL 40+ PROJECTS (REACHING 425+ TOTAL PROJECTS & 285+ ACTIVE UNHANDED-OVER OFF-PLAN LAUNCHES)
  // ===============================================================================================
  ['Address Residences Al Marjan Partner', 'EMAAR', 'CREEK', 'Apartment', true, '2029-06-30', 2_100_000, [1, 2, 3], 740, 2_120, '80/20'],
  ['Montura at Grand Polo', 'EMAAR', 'ALQUDRA', 'Villa', true, '2029-06-30', 5_800_000, [4, 5], 3_750, 5_400, '80/20'],
  ['Parkwood Dubai Hills', 'EMAAR', 'DHILLS', 'Apartment', true, '2029-01-31', 1_750_000, [1, 2, 3], 733, 3_893, '80/20'],
  ['Rosehill Dubai Hills', 'EMAAR', 'DHILLS', 'Apartment', true, '2029-06-30', 1_600_000, [1, 2, 3], 741, 1_850, '80/20'],
  ['Albero Creekside', 'EMAAR', 'CREEK', 'Apartment', true, '2029-09-30', 1_850_000, [1, 2, 3], 760, 1_940, '80/20'],
  ['Sera at Rashid Yachts', 'EMAAR', 'MINARASH', 'Apartment', true, '2029-11-30', 2_100_000, [1, 2, 3], 720, 1_960, '80/20'],
  ['Fior at Rashid Yachts', 'EMAAR', 'MINARASH', 'Apartment', true, '2030-03-31', 2_150_000, [1, 2, 3], 740, 2_050, '80/20'],
  ['Ovelle at The Valley', 'EMAAR', 'THEVALLEY', 'Villa', true, '2029-12-31', 7_090_000, [4, 5], 4_350, 5_600, '80/20'],
  ['Lyvia Palace', 'EMAAR', 'CREEK', 'Apartment', true, '2029-07-31', 1_980_000, [1, 2, 3], 755, 1_920, '80/20'],
  ['DAMAC Islands Fiji', 'DAMAC', 'DAMACIS', 'Townhouse', true, '2028-12-31', 2_250_000, [4, 5], 2_208, 3_178, '70/30'],
  ['DAMAC Islands Bali', 'DAMAC', 'DAMACIS', 'Townhouse', true, '2029-03-31', 2_400_000, [4, 5], 2_208, 3_178, '70/30'],
  ['DAMAC Islands Hawaii', 'DAMAC', 'DAMACIS', 'Villa', true, '2029-06-30', 6_310_000, [6, 7], 4_440, 17_079, '70/30'],
  ['DAMAC District', 'DAMAC', 'DAMACH', 'Apartment', true, '2029-06-30', 1_100_000, [1, 2], 680, 1_360, '70/30'],
  ['Sobha SkyParks', 'SOBHA', 'SZR', 'Apartment', true, '2031-12-31', 2_860_000, [1, 2, 3, 4], 680, 3_600, '70/30'],
  ['Sobha Sanctuary', 'SOBHA', 'ELWOOD', 'Villa', true, '2029-09-30', 3_990_000, [4, 5, 6], 2_459, 7_186, '60/40'],
  ['Sobha The Horizon Central', 'SOBHA', 'SZR', 'Apartment', true, '2029-12-31', 1_520_000, [1, 2], 568, 1_554, '60/40'],
  ['Binghatti Skyhall', 'BINGHATTI', 'BBAY', 'Apartment', true, '2027-01-31', 985_000, [0, 1], 396, 995, '70/30'],
  ['Binghatti Cullinan', 'BINGHATTI', 'ALJADDAF', 'Apartment', true, '2028-03-31', 820_000, [0, 1, 2, 3], 410, 1_750, '70/30'],
  ['Binghatti Pinnacle', 'BINGHATTI', 'ALJADDAF', 'Apartment', true, '2027-06-30', 1_350_000, [1, 2, 3], 760, 1_960, '70/30'],
  ['Binghatti Titania', 'BINGHATTI', 'MAJAN', 'Apartment', true, '2028-03-31', 680_000, [0, 1, 2], 385, 1_310, '70/30'],
  ['Serenz', 'DANUBE', 'JVC', 'Apartment', true, '2029-12-31', 850_000, [0, 1, 2, 3], 405, 1_490, '1%M'],
  ['Aspirz Offices & Residences', 'DANUBE', 'SPORTS', 'Apartment', true, '2028-12-31', 850_000, [0, 1, 2, 3], 410, 1_480, '1%M'],
  ['Atelis at d3', 'MERAAS', 'MBRC', 'Apartment', true, '2029-07-31', 2_100_000, [1, 2, 3, 4], 810, 4_200, '70/30'],
  ['Jumeirah Residences Emirates Towers', 'MERAAS', 'DIFC2', 'Apartment', true, '2030-08-31', 3_510_000, [1, 2, 3, 4], 861, 6_369, '60/40'],
  ['The Edit at d3', 'MERAAS', 'MBRC', 'Apartment', true, '2030-06-30', 2_000_000, [1, 2, 3, 4], 780, 4_100, '70/30'],
  ['Costa Mare', 'ELLINGTON', 'DISLANDS', 'Apartment', true, '2028-09-30', 2_150_000, [1, 2, 3, 4], 790, 3_400, '70/30'],
  ['Playa Del Sol', 'ELLINGTON', 'DISLANDS', 'Apartment', true, '2027-12-31', 1_850_000, [0, 1, 2, 3, 4], 430, 3_200, '70/30'],
  ['Riverton House', 'ELLINGTON', 'MEYDAN1', 'Apartment', true, '2028-06-30', 1_800_000, [1, 2, 3], 760, 2_180, '70/30'],
  ['Azizi Leily', 'AZIZI', 'ALJADDAF', 'Apartment', true, '2027-12-31', 760_000, [0, 1, 2], 365, 1_240, '50/50'],
  ['Azizi Lina', 'AZIZI', 'DTJEBEL', 'Apartment', true, '2027-12-31', 540_000, [0, 1, 2, 3], 345, 1_510, '50/50'],
  ['Azizi Noura', 'AZIZI', 'DTJEBEL', 'Apartment', true, '2027-12-31', 550_000, [0, 1, 2], 350, 1_190, '50/50'],
  ['Azizi Arian', 'AZIZI', 'DTJEBEL', 'Apartment', true, '2027-06-30', 560_000, [0, 1, 2, 3], 355, 1_490, '50/50'],
  ['Wynwood', 'IMTIAZ', 'DISLANDS', 'Apartment', true, '2027-09-30', 1_980_000, [1, 2, 3, 4], 722, 3_100, '60/40'],
  ['Sea Star', 'IMTIAZ', 'DISLANDS', 'Apartment', true, '2028-06-30', 2_100_000, [1, 2, 3], 760, 2_250, '60/40'],
  ['Symphony Tower', 'IMTIAZ', 'MEYDAN1', 'Apartment', true, '2029-06-30', 1_750_000, [1, 2, 3], 740, 2_120, '60/40'],
  ['Talea Seafront Forest', 'BEYOND', 'DMC', 'Apartment', true, '2029-03-31', 2_200_000, [1, 2, 3, 4], 757, 4_462, '50/50'],
  ['Evermore', 'BEYOND', 'DMC', 'Apartment', true, '2029-12-31', 2_450_000, [1, 2, 3, 4], 780, 3_600, '50/50'],
  ['The Wilds Residences', 'ALDAR', 'WADISAFA', 'Apartment', true, '2030-03-31', 1_650_000, [1, 2, 3], 790, 2_180, '60/40'],
  ['Rise at Athlon', 'ALDAR', 'ATHLON', 'Apartment', true, '2029-12-31', 1_350_000, [1, 2, 3], 740, 1_960, '60/40'],
  ['Yas Living', 'ALDAR', 'YASNORTH', 'Apartment', true, '2028-10-31', 990_000, [0, 1, 2, 3], 380, 1_980, '60/40'],
  ['Fahid Beach Terraces', 'ALDAR', 'FAHID', 'Apartment', true, '2029-09-30', 3_600_000, [1, 2, 3, 4, 5], 960, 5_400, '60/40'],
  ['Hudayriyat Al Naseem Community', 'MODON', 'HUDAYR', 'Villa', true, '2028-06-30', 7_800_000, [4, 5, 6], 4_200, 7_100, '60/40'],
  ['Maysan Thoraya Townhouses', 'MODON', 'ALREEM', 'Townhouse', true, '2028-03-31', 3_250_000, [3, 4], 2_450, 3_280, '50/50'],
  ['Bloom Living Marbella', 'BLOOM', 'BLOOMLIV', 'Villa', true, '2028-12-31', 3_900_000, [3, 4, 5, 6], 2_750, 5_600, 'PH2Y'],
  ['Verdana 10', 'REPORTAGE', 'DIP1', 'Townhouse', true, '2028-12-31', 1_650_000, [2, 3, 4], 1_450, 2_650, '70/30'],
  ['Yas Riva View', 'REPORTAGE', 'YASBAY', 'Apartment', true, '2028-06-30', 980_000, [0, 1, 2, 3], 420, 1_850, '70/30'],
  ['Yas Canal Residences', 'OHANA', 'YASNORTH', 'Apartment', true, '2029-06-30', 1_950_000, [1, 2, 3, 4], 860, 3_200, '50/50'],
  ['AlJurf Coastal Mansions', 'IMKAN', 'ALJURF', 'Villa', true, '2028-12-31', 9_800_000, [5, 6, 7], 5_400, 9_800, '50/50'],
]

export const UAE_PROJECTS: UaeProjectSpec[] = PROJECT_SEEDS.map((seed, idx) => buildProject(seed, idx))

export const UAE_OFFPLAN_PROJECTS: UaeProjectSpec[] = UAE_PROJECTS.filter(p => p.isOffPlan)

export const UAE_READY_PROJECTS: UaeProjectSpec[] = UAE_PROJECTS.filter(p => !p.isOffPlan)

export const UAE_PROJECTS_BY_SLUG = new Map(UAE_PROJECTS.map(p => [p.slug, p]))
