import type { FastifyInstance } from 'fastify'
import { need } from './helpers'
import {
  buildWebsiteExport,
  deployWebsite,
  getWebsiteSiteUpdates,
  lastWebsiteDeploy,
  saveWebsiteSiteUpdates,
  websiteDeployConfig,
} from '../website'
import { assertZeroShabibPublicPayload } from '../../shared/zero-shabib-guard'

/** Website inventory, promotions, live site updates and deploy. Module 'website' is held only by '*' roles: Owner and Admin. */
export default async function (app: FastifyInstance) {
  app.get('/api/website/status', async (req) => {
    need(req, 'website', 'view')
    const { listings, promotions, siteUpdates, problems } = buildWebsiteExport()
    return {
      config: websiteDeployConfig(),
      last: lastWebsiteDeploy(),
      published: listings.length,
      hot: promotions.filter(p => String(p.id).startsWith('hot-')).length,
      promotions: promotions.length,
      siteUpdates,
      zeroShabibGuard: true,
      problems,
    }
  })

  app.get('/api/website/site-updates', async (req) => {
    need(req, 'website', 'view')
    return getWebsiteSiteUpdates()
  })

  app.put('/api/website/site-updates', async (req) => {
    need(req, 'website', 'edit')
    return saveWebsiteSiteUpdates((req.body ?? {}) as Record<string, any>)
  })

  app.get('/api/website/export.json', async (req, reply) => {
    need(req, 'website', 'export')
    const { listings, promotions, siteUpdates, publicTeam } = buildWebsiteExport()
    assertZeroShabibPublicPayload({ listings, promotions, siteUpdates, publicTeam }, 'Website Export JSON')
    reply.header('Content-Disposition', 'attachment; filename="swk-website-data.json"')
    return { listings, promotions, siteUpdates, team: publicTeam }
  })

  app.post('/api/website/deploy', { config: { rateLimit: { max: 6, timeWindow: '10 minutes' } } }, async (req) => {
    need(req, 'website', 'edit')
    return deployWebsite(req.user ?? null)
  })

  /** Public read-only live CMS feed consumed by swkpropertiesuae.com (100% hard-locked zero-Shabib). */
  app.get('/api/public/website/cms', async (_req, reply) => {
    const { listings, promotions, siteUpdates, publicTeam } = buildWebsiteExport()
    const payload = {
      company: 'SWK Properties LLC',
      orn: '51517',
      updatedAt: siteUpdates.updated_at,
      siteUpdates,
      promotions,
      featuredListings: listings.slice(0, 24),
      teamCount: publicTeam.length,
    }
    assertZeroShabibPublicPayload(payload, 'Public Website CMS')
    reply.header('cache-control', 'public, max-age=60, s-maxage=120')
    return payload
  })
}
