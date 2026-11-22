/**
 * Website (swkpropertiesuae.com) inventory, promotions and deploy.
 *
 * - seedWebsiteContent(): first start only, imports the live website inventory (57 listings) and the
 *   "Trending" spotlight deals that were copied from the website repo into ./seed/website/*.json.
 * - buildWebsiteExport(): turns the OS rows back into the website's own JSON shapes.
 * - deployWebsite(): one Git commit to the website repo (src/data/listings-expanded.json + src/data/promotions.json).
 *   Merging into main is what deploys the website (Cloudflare Workers Builds + Vercel), so a commit = a deploy.
 *   Optional WEBSITE_DEPLOY_HOOK_URL is called afterwards for hosts that deploy from a hook instead.
 *
 * Secrets come from the environment only (never the database): WEBSITE_GITHUB_TOKEN (fine-grained token with
 * Contents: read & write on the website repo), WEBSITE_GITHUB_REPO (default swkpropertiesuae/swkproperty.com),
 * WEBSITE_GITHUB_BRANCH (default main), WEBSITE_DEPLOY_HOOK_URL (optional).
 */
import { q } from './db'
import { createRecord,getDef,SYSTEM_CTX } from './engine'
import { HttpError,fromCents,nowIso } from './util'
import { WEBSITE_REPO_DEFAULT } from '../shared/entities/website'
import { SWK_TEAM_PROFILES } from '../shared/swk-team-profiles'
import seedListings from './seed/website/listings.json'
import seedPromotions from './seed/website/promotions.json'

const SEED_KEY = 'seed:website_content_v1'
const LAST_DEPLOY_KEY = 'website:last_deploy'
const COMPANY_PHONE = '+971564330448'
const OFFICE_GEO = { lat: 25.213925, lng: 55.277978 }

const lines = (v: unknown): string[] => String(v ?? '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
const asJson = (v: unknown): Record<string, any> => {
  if (v && typeof v === 'object') return v as Record<string, any>
  try { return v ? JSON.parse(String(v)) : {} } catch { return {} }
}
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function seedWebsiteContent() {
  if (q.val(`SELECT 1 FROM settings WHERE key = ?`, SEED_KEY)) return
  if (!q.val(`SELECT 1 FROM website_listings WHERE deleted_at IS NULL LIMIT 1`)) {
    ;(seedListings as Record<string, any>[]).forEach((l, i) => {
      createRecord(getDef('website_listings'), {
        reference: l.reference, slug: l.slug, title: l.title, subtitle: l.subtitle, purpose: l.purpose, status: l.status,
        property_type: l.propertyType, published: true, hot_offer: false, badge: l.badge ?? null, sort_order: (i + 1) * 10,
        community: l.community, community_slug: l.communitySlug, building: l.building, developer: l.developer, developer_slug: l.developerSlug,
        price_aed: l.priceAed, bedrooms: l.bedrooms, bathrooms: l.bathrooms, area_sqft: l.areaSqFt, furnished: l.furnished, completion: l.completion,
        handover: l.handover, payment_plan: l.paymentPlan ?? null, down_payment_pct: l.downPaymentPct ?? null, service_charge_per_sqft: l.serviceChargePerSqFt,
        agent_slug: l.agentSlug, image_url: l.images?.[0] ?? '', description: (l.description ?? []).join('\n'), features: (l.features ?? []).join('\n'),
        listed_at: l.listedAt, payload: l,
      }, SYSTEM_CTX)
    })
  }
  if (!q.val(`SELECT 1 FROM website_promotions WHERE deleted_at IS NULL LIMIT 1`)) {
    ;(seedPromotions as Record<string, any>[]).forEach((p, i) => {
      createRecord(getDef('website_promotions'), {
        title: p.title, eyebrow: p.eyebrow, tab: p.tab, active: true, sort_order: (i + 1) * 10, developer: p.developer, community: p.community,
        price_guide: p.priceGuide, plan_highlight: p.planHighlight, image: p.image, href: p.href, benefits: (p.benefits ?? []).join('\n'),
      }, SYSTEM_CTX)
    })
  }
  // One-time import: keep the activity feed readable (one line instead of 60 "System created …" entries).
  q.run(`DELETE FROM audit_log WHERE user_id IS NULL AND action = 'create' AND entity IN ('website_listings','website_promotions')`)
  q.run(`INSERT INTO audit_log(at, user_id, user_name, entity, record_id, record_label, action, changes, ip) VALUES (?,?,?,?,?,?,?,?,?)`, nowIso(), null, 'System', 'website_listings', 0, 'Imported live website inventory & spotlight', 'import', null, null)
  q.run(`INSERT INTO settings(key, value, updated_at) VALUES (?, '1', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, SEED_KEY, nowIso())
}

const fmtAed = (n: number) => (n >= 1_000_000 ? `AED ${(n / 1_000_000).toFixed(n % 1_000_000 ? 2 : 0).replace(/\.?0+$/, '')}M` : `AED ${Math.round(n).toLocaleString('en-US')}`)

/** Rows -> the website's PropertyListing[] and TrendingDeal[] (see the website's src/lib/listings.ts and trending-project-popups.tsx). */
export function buildWebsiteExport() {
  const today = nowIso().slice(0, 10)
  const rows = q.all<Record<string, any>>(`SELECT * FROM website_listings WHERE deleted_at IS NULL AND published = 1`)
  rows.sort((a, b) => Number(!!b.hot_offer) - Number(!!a.hot_offer) || (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9) || String(b.listed_at ?? '').localeCompare(String(a.listed_at ?? '')))
  const problems: string[] = []
  const listings = rows.map(r => {
    const base = asJson(r.payload)
    const agent = SWK_TEAM_PROFILES.find(p => p.slug === r.agent_slug) ?? SWK_TEAM_PROFILES.find(p => p.slug === 'mohammad-haseeb')!
    const area = Number(r.area_sqft) || 0
    const image = String(r.image_url || base.images?.[0] || '')
    if (!image) problems.push(`${r.reference}: add a main image`)
    if (!r.slug) problems.push(`${r.reference}: add a URL slug`)
    const images = image ? [image, ...((base.images ?? []) as string[]).filter(i => i !== image)] : []
    const out: Record<string, any> = {
      // defaults for listings created in the OS (an imported listing keeps its own values from `base`)
      views: [], amenities: [], accessibility: [], petPolicy: 'Subject to landlord approval', nearMetro: false, isRender: false,
      agentLanguages: agent.languages, lat: OFFICE_GEO.lat, lng: OFFICE_GEO.lng, mapZone: 'central', parkingSpaces: 1,
      floorPlan: { label: `${r.property_type} Floor Plate · ${area.toLocaleString('en-US')} sq ft`, totalAreaSqFt: area, internalSqFt: area, balconySqFt: 0, rooms: [] },
      dld: { permitNumber: '', permitIssued: '', permitExpiry: '', orn: '51517', brn: '', madmounQrId: '', verificationUrl: '', permitVerified: false },
      ...base,
      slug: r.slug, reference: r.reference, title: r.title, subtitle: r.subtitle ?? '', purpose: r.purpose, status: r.status, propertyType: r.property_type,
      communitySlug: r.community_slug || slugify(String(r.community ?? '')), community: r.community, building: r.building ?? '',
      developerSlug: r.developer_slug || slugify(String(r.developer ?? '')), developer: r.developer ?? '',
      priceAed: Number(fromCents(r.price_aed)) || 0, bedrooms: Number(r.bedrooms) || 0, bathrooms: Number(r.bathrooms) || 0, areaSqFt: area,
      furnished: r.furnished || 'Unfurnished', completion: r.completion || 'Ready', handover: r.handover ?? '',
      serviceChargePerSqFt: Number(r.service_charge_per_sqft) || 0,
      ...(base.agentSlug && base.agentSlug === r.agent_slug
        ? { agentSlug: base.agentSlug, agentName: base.agentName, agentRole: base.agentRole }
        : { agentSlug: agent.slug, agentName: agent.name, agentRole: agent.title, agentLanguages: agent.languages }),
      agentPhone: base.agentPhone ?? COMPANY_PHONE,
      lastChecked: today, listedAt: r.listed_at || today, images, description: lines(r.description), features: lines(r.features),
    }
    if (r.badge) out.badge = r.badge; else delete out.badge
    if (r.payment_plan) out.paymentPlan = r.payment_plan; else delete out.paymentPlan
    if (r.down_payment_pct != null && r.down_payment_pct !== '') out.downPaymentPct = Number(r.down_payment_pct); else delete out.downPaymentPct
    return { out, hot: !!r.hot_offer, row: r }
  })

  const hotDeals = listings.filter(l => l.hot).map(({ out, row }) => ({
    id: `hot-${out.slug}`,
    tab: out.purpose === 'off-plan' ? 'off-plan' : out.propertyType === 'Office' ? 'commercial' : 'secondary',
    eyebrow: `HOT OFFER · ${String(out.developer || out.community).toUpperCase()}`,
    title: out.title, developer: out.developer, community: out.community,
    priceGuide: out.purpose === 'rent' ? `${fmtAed(out.priceAed)} / year` : `From ${fmtAed(out.priceAed)}`,
    planHighlight: row.payment_plan || out.handover || out.completion,
    image: out.images[0] ?? '', href: `/properties/${out.slug}`,
    benefits: (out.features as string[]).slice(0, 4),
  }))
  const promos = q.all<Record<string, any>>(`SELECT * FROM website_promotions WHERE deleted_at IS NULL AND active = 1 ORDER BY sort_order, id`)
    .filter(p => (!p.starts_on || p.starts_on <= today) && (!p.ends_on || p.ends_on >= today))
    .map(p => ({ id: slugify(p.title), tab: p.tab, eyebrow: p.eyebrow ?? '', title: p.title, developer: p.developer ?? '', community: p.community ?? '', priceGuide: p.price_guide ?? '', planHighlight: p.plan_highlight ?? '', image: p.image ?? '', href: p.href ?? '/off-plan', benefits: lines(p.benefits) }))
  return { listings: listings.map(l => l.out), promotions: [...hotDeals, ...promos], problems }
}

export function websiteDeployConfig() {
  return {
    repo: process.env.WEBSITE_GITHUB_REPO?.trim() || WEBSITE_REPO_DEFAULT,
    branch: process.env.WEBSITE_GITHUB_BRANCH?.trim() || 'main',
    tokenSet: Boolean(process.env.WEBSITE_GITHUB_TOKEN?.trim()),
    hookSet: Boolean(process.env.WEBSITE_DEPLOY_HOOK_URL?.trim()),
  }
}

export function lastWebsiteDeploy(): Record<string, any> | null {
  const v = q.val<string>(`SELECT value FROM settings WHERE key = ?`, LAST_DEPLOY_KEY)
  return v ? asJson(v) : null
}

async function gh(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.WEBSITE_GITHUB_TOKEN!.trim()}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'swk-os', 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  const data = await res.json().catch(() => ({})) as any
  if (!res.ok) throw new HttpError(502, `GitHub ${res.status}: ${data?.message ?? 'request failed'}`)
  return data
}

/** One commit with both data files on the website branch. Returns the commit URL. */
export async function deployWebsite(by: { name?: string | null; email?: string | null } | null) {
  const cfg = websiteDeployConfig()
  if (!cfg.tokenSet) throw new HttpError(400, 'Website deploy is not connected yet. Set WEBSITE_GITHUB_TOKEN on the server (a GitHub token with Contents read & write on ' + cfg.repo + ').')
  const { listings, promotions, problems } = buildWebsiteExport()
  if (problems.length) throw new HttpError(400, `Fix before deploying: ${problems.slice(0, 5).join('; ')}${problems.length > 5 ? ` (+${problems.length - 5} more)` : ''}`)
  if (!listings.length) throw new HttpError(400, 'No published listings: the website would be empty.')
  const ref = await gh(`/repos/${cfg.repo}/git/ref/heads/${encodeURIComponent(cfg.branch)}`)
  const parent = await gh(`/repos/${cfg.repo}/git/commits/${ref.object.sha}`)
  const files = [
    { path: 'src/data/listings-expanded.json', content: JSON.stringify(listings, null, 2) + '\n' },
    { path: 'src/data/promotions.json', content: JSON.stringify(promotions, null, 2) + '\n' },
  ]
  const tree = await gh(`/repos/${cfg.repo}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: parent.tree.sha, tree: files.map(f => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })) }) })
  if (tree.sha === parent.tree.sha) return record({ status: 'unchanged', listings: listings.length, promotions: promotions.length, by: by?.name ?? null, at: nowIso() })
  const who = by?.name ? ` by ${by.name}` : ''
  const commit = await gh(`/repos/${cfg.repo}/git/commits`, { method: 'POST', body: JSON.stringify({ message: `Website inventory update from SWK OS${who}\n\n${listings.length} listings, ${promotions.length} promotions.`, tree: tree.sha, parents: [parent.sha] }) })
  await gh(`/repos/${cfg.repo}/git/refs/heads/${encodeURIComponent(cfg.branch)}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) })
  let hook: string | null = null
  if (cfg.hookSet) {
    const r = await fetch(process.env.WEBSITE_DEPLOY_HOOK_URL!.trim(), { method: 'POST' }).catch(() => null)
    hook = r?.ok ? 'triggered' : 'failed'
  }
  return record({ status: 'deployed', commit: commit.sha, url: commit.html_url ?? `https://github.com/${cfg.repo}/commit/${commit.sha}`, listings: listings.length, promotions: promotions.length, hook, by: by?.name ?? null, at: nowIso() })
}

function record(r: Record<string, any>) {
  q.run(`INSERT INTO settings(key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, LAST_DEPLOY_KEY, JSON.stringify(r), nowIso())
  return r
}
