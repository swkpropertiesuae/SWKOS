export * from './types'
export * from './developers'
export * from './communities'
export * from './projects'

import { UAE_COMMUNITIES } from './communities'
import { UAE_DEVELOPERS } from './developers'
import { UAE_OFFPLAN_PROJECTS, UAE_PROJECTS, UAE_READY_PROJECTS } from './projects'

export const UAE_CATALOG_VERSION = '2026-11-27.v5'

export const UAE_DEVELOPERS_BY_CODE = new Map(UAE_DEVELOPERS.map(d => [d.code, d]))
export const UAE_COMMUNITIES_BY_CODE = new Map(UAE_COMMUNITIES.map(c => [c.code, c]))

export const UAE_CATALOG_STATS = {
  version: UAE_CATALOG_VERSION,
  totalDevelopers: UAE_DEVELOPERS.length,
  dubaiDevelopers: UAE_DEVELOPERS.filter(d => d.emirate === 'Dubai').length,
  abuDhabiDevelopers: UAE_DEVELOPERS.filter(d => d.emirate === 'Abu Dhabi').length,
  totalCommunities: UAE_COMMUNITIES.length,
  dubaiCommunities: UAE_COMMUNITIES.filter(c => c.emirate === 'Dubai').length,
  abuDhabiCommunities: UAE_COMMUNITIES.filter(c => c.emirate === 'Abu Dhabi').length,
  totalProjects: UAE_PROJECTS.length,
  offPlanProjects: UAE_OFFPLAN_PROJECTS.length,
  dubaiOffPlanProjects: UAE_OFFPLAN_PROJECTS.filter(p => p.emirate === 'Dubai').length,
  abuDhabiOffPlanProjects: UAE_OFFPLAN_PROJECTS.filter(p => p.emirate === 'Abu Dhabi').length,
  readyProjects: UAE_READY_PROJECTS.length,
}
