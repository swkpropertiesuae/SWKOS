// Master UAE Off-Plan Launches feed — derived directly from src/shared/uae-catalog/projects.ts
// Covers every active unhanded-over off-plan launch across Dubai and Abu Dhabi through 2026-11-27.
// Naming convention enforced universally: "<Project Name> by <DeveloperShort>" (e.g. "Shahrukhz by Danube").

import { UAE_COMMUNITIES_BY_CODE, UAE_DEVELOPERS_BY_CODE, UAE_OFFPLAN_PROJECTS } from './uae-catalog'
import type { EmirateName } from './uae-catalog/types'

export interface OffPlanLaunch {
  key: string
  slug: string
  name: string
  projectName: string
  developer: string
  developerCode: string
  community: string
  communityCode: string
  emirate: EmirateName
  area: string
  launchDate: string
  handover: string | null
  handoverQuarter: string
  fromPrice: number | null
  bedrooms: number[]
  propertyTypes: string[]
  units: number | null
  sizeMin: number | null
  sizeMax: number | null
  paymentPlan: string | null
  downPct: number | null
  onHandoverPct: number | null
  postHandoverPct: number | null
  expectedYieldPct: number | null
  lat: number | null
  lng: number | null
  images: string[]
  imageIsFallback: boolean
  cover: string
  promoHeadline: string
  promoBadge: string
  promoBenefits: string[]
  source: string
}

export const OFFPLAN_LAUNCHES_AS_OF = '2026-11-27'

export const OFFPLAN_LAUNCHES: OffPlanLaunch[] = UAE_OFFPLAN_PROJECTS.map(p => {
  const dev = UAE_DEVELOPERS_BY_CODE.get(p.developerCode)
  const comm = UAE_COMMUNITIES_BY_CODE.get(p.communityCode)
  return {
    key: `${p.emirate.toUpperCase()}_${p.communityCode}_${p.slug.toUpperCase()}`,
    slug: p.slug,
    name: p.title,
    projectName: p.projectName,
    developer: dev?.name || p.developerCode,
    developerCode: p.developerCode,
    community: comm?.name || p.communityCode,
    communityCode: p.communityCode,
    emirate: p.emirate,
    area: comm?.area || p.emirate,
    launchDate: p.launchDate,
    handover: p.handoverDate,
    handoverQuarter: p.handoverQuarter,
    fromPrice: p.fromPrice,
    bedrooms: p.bedrooms,
    propertyTypes: [p.propertyType],
    units: p.totalUnits,
    sizeMin: p.areaSqftMin,
    sizeMax: p.areaSqftMax,
    paymentPlan: p.paymentPlan.label,
    downPct: p.paymentPlan.bookingPct,
    onHandoverPct: p.paymentPlan.handoverPct,
    postHandoverPct: p.paymentPlan.postHandoverPct,
    expectedYieldPct: p.expectedYieldPct,
    lat: p.lat,
    lng: p.lng,
    images: p.images,
    imageIsFallback: !p.cover.startsWith('/media/launches/'),
    cover: p.cover,
    promoHeadline: p.promoHeadline,
    promoBadge: p.promoBadge,
    promoBenefits: p.promoBenefits,
    source: p.source,
  }
})
