export type EmirateName = 'Dubai' | 'Abu Dhabi'

export interface PaymentPlanSplit {
  label: string
  option: '100% on completion' | '50/50' | '60/40' | '70/30' | '80/20' | 'Post-handover 2y' | 'Post-handover 3y' | 'Custom'
  bookingPct: number
  constructionPct: number
  handoverPct: number
  postHandoverPct: number
}

export interface UaeDeveloperSpec {
  code: string
  slug: string
  name: string
  shortName: string
  emirate: EmirateName
  tier: 'Master Developer' | 'Tier-1 Developer' | 'Luxury Boutique'
  reraId: string
  foundedYear: number
  headquarters: string
  website: string
  logo: string
  description: string
  specialties: string
  amenitiesStandard: string[]
  flagshipProjects: string[]
  videoUrl?: string
  virtualTourUrl?: string
}

export interface UaeCommunityForecast {
  year: number
  projectedPpsf: number
  catalyst: string
}

export interface UaeCommunitySpec {
  code: string
  slug: string
  ticker: string
  name: string
  emirate: EmirateName
  area: string
  masterDeveloper: string
  reraCommunityId: string
  segment: 'Prime' | 'Upper-mid' | 'Mid' | 'Value'
  image: string
  ppsf: number
  ppsfLY: number
  yoyPct: number
  rentStudio: number
  rent1: number
  rent2: number
  rent3: number
  avgRentAnnual: number
  yieldPct: number
  serviceCharge: number
  transactionsQ: number
  offPlanShare: number
  lat: number
  lng: number
  trend: number[]
  description: string
  nearby: {
    metro: string
    landmarks: string[]
    schools: string[]
    hospitals: string[]
    beachOrParkMins: string
  }
  amenities: string[]
  ongoingProjects: string[]
  future15YearOutlook: string
  forecast15Y: UaeCommunityForecast[]
  closingKeywords: string[]
  fieldVisitPitchScript: string[]
}

export interface UaeProjectSpec {
  slug: string
  projectName: string
  title: string
  developerCode: string
  communityCode: string
  emirate: EmirateName
  propertyType: 'Apartment' | 'Villa' | 'Townhouse' | 'Penthouse' | 'Duplex' | 'Studio' | 'Compound' | 'Bulk'
  isOffPlan: boolean
  launchStatus: 'New Launch' | 'Active Off-Plan' | 'Under Construction' | 'Near Handover' | 'Ready / Completed'
  status: 'Off-Plan' | 'Available'
  launchDate: string
  handoverDate: string
  handoverQuarter: string
  completionYear: number
  fromPrice: number
  bedrooms: number[]
  unitMix: string
  areaSqftMin: number
  areaSqftMax: number
  totalUnits: number
  availableUnits: number
  paymentPlan: PaymentPlanSplit
  expectedYieldPct: number
  furnishing: 'Unfurnished' | 'Semi-Furnished' | 'Fully Furnished'
  tenure: 'Freehold' | 'Leasehold'
  lat: number
  lng: number
  images: string[]
  cover: string
  amenities: string[]
  features: string[]
  description: string
  promoHeadline: string
  promoBadge: string
  promoBenefits: string[]
  isFeatured?: boolean
  videoUrl?: string
  virtualTourUrl?: string
  source: string
}

export function formatProjectTitle(projectName: string, developerShortName: string): string {
  const cleanProj = projectName.trim()
  const cleanDev = developerShortName.trim()
  const re = new RegExp(`\\s+by\\s+${cleanDev.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
  if (re.test(cleanProj)) return cleanProj
  return `${cleanProj} by ${cleanDev}`
}
