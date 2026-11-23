import type { FastifyInstance } from 'fastify'
import { need } from './helpers'
import { buildWebsiteExport,deployWebsite,lastWebsiteDeploy,websiteDeployConfig } from '../website'

/** Website inventory, promotions and deploy. Module 'website' is held only by '*' roles: Owner and Admin. */
export default async function (app: FastifyInstance) {
  app.get('/api/website/status', async (req) => {
    need(req, 'website', 'view')
    const { listings, promotions, problems } = buildWebsiteExport()
    return { config: websiteDeployConfig(), last: lastWebsiteDeploy(), published: listings.length, hot: promotions.filter(p => String(p.id).startsWith('hot-')).length, promotions: promotions.length, problems }
  })
  app.get('/api/website/export.json', async (req, reply) => {
    need(req, 'website', 'export')
    const { listings, promotions } = buildWebsiteExport()
    reply.header('Content-Disposition', 'attachment; filename="swk-website-data.json"')
    return { listings, promotions }
  })
  app.post('/api/website/deploy', { config: { rateLimit: { max: 6, timeWindow: '10 minutes' } } }, async (req) => {
    need(req, 'website', 'edit')
    return deployWebsite(req.user ?? null)
  })
}
