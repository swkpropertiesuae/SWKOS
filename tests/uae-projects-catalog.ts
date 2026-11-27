import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dataDir = process.env.DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'swk-uae-catalog-'))
process.env.DATA_DIR = dataDir
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = ''
  process.env.REQUIRE_DATABASE_URL = 'false'
}
process.env.DEMO_ENABLED = 'false'
process.env.STARTER_DATA = 'false'
process.env.NODE_ENV = 'test'

const { ensureDirs, config } = await import('../src/server/config')
const { syncSchema } = await import('../src/server/schema')
const { seedReference } = await import('../src/server/seed')
const { q, db } = await import('../src/server/db')
const { createRecord, updateRecord, getDef, SYSTEM_CTX } = await import('../src/server/engine')
const { buildApp } = await import('../src/server/app')
const { inferMediaKindFromFile, normalizeMediaList, MEDIA_CATEGORIES } = await import('../src/shared/media')

ensureDirs()
syncSchema()
await seedReference()

// --- Task 1: Entity Rename, Extended Media Kinds & Archived Ref Safety ---
const propDef = getDef('properties')
assert.equal(propDef.label, 'Project', 'properties entity label must be renamed to Project')
assert.equal(propDef.plural, 'Projects', 'properties entity plural must be renamed to Projects')
for (const fname of ['project_name', 'emirate', 'handover_quarter', 'payment_plan_summary', 'unit_mix', 'launch_status', 'promo_headline', 'promo_badge', 'promo_benefits', 'ppt_url', 'payment_plan_pdf_url']) {
  assert.ok(propDef.fields.some(f => f.name === fname), `properties missing field ${fname}`)
}
for (const fname of ['short_name', 'tier', 'headquarters', 'amenities_standard', 'flagship_projects', 'video_url', 'virtual_tour_url', 'brochure_url', 'ppt_url']) {
  assert.ok(getDef('developers').fields.some(f => f.name === fname), `developers missing field ${fname}`)
}
for (const fname of ['ticker', 'segment', 'service_charge_sqft', 'amenities', 'schools', 'hospitals', 'metro_transit', 'future_outlook', 'closing_keywords', 'video_url', 'virtual_tour_url', 'brochure_url', 'ppt_url']) {
  assert.ok(getDef('communities').fields.some(f => f.name === fname), `communities missing field ${fname}`)
}

// Media kinds include ppt & payment_plan
assert.equal(inferMediaKindFromFile('Shahrukhz-Presentation.pptx'), 'ppt')
assert.equal(inferMediaKindFromFile('Payment-Plan-Schedule.pdf', 'application/pdf'), 'payment_plan')
assert.ok((MEDIA_CATEGORIES as any).ppt?.length > 0, 'MEDIA_CATEGORIES.ppt must exist')
assert.ok((MEDIA_CATEGORIES as any).payment_plan?.length > 0, 'MEDIA_CATEGORIES.payment_plan must exist')
const normPpt = normalizeMediaList([{ id: 'p1', kind: 'ppt' as any, url: '/api/files/1/download', order: 0 }])
assert.equal(normPpt[0]?.kind, 'ppt')

// Archived ref safety: existing job pointing to a soft-archived property remains editable
const branchId = q.val<number>(`SELECT id FROM branches WHERE deleted_at IS NULL LIMIT 1`)!
const party = createRecord(getDef('parties'), { name: 'Archived Ref Test Buyer', is_customer: true, status: 'Active' }, SYSTEM_CTX)
const legacyProp = createRecord(propDef, { title: 'Legacy Tower 101', property_type: 'Apartment', status: 'Available' }, SYSTEM_CTX)
const liveJob = createRecord(getDef('jobs'), { deal_name: 'Legacy Deal #1', deal_type: 'Sale', client_id: party.id, branch_id: branchId, property_id: legacyProp.id, deal_date: '2026-11-20' }, SYSTEM_CTX)

// Soft-archive the legacy property
q.run(`UPDATE properties SET deleted_at = '2026-11-27T00:00:00.000Z', active = 0 WHERE id = ?`, legacyProp.id)

// Updating liveJob without changing property_id MUST succeed
const updatedJob = updateRecord(getDef('jobs'), liveJob.id, { notes: 'Moved to Form F stage', stage_12: '06_form_f' }, SYSTEM_CTX)
assert.equal(updatedJob.property_id, legacyProp.id)
assert.equal(updatedJob.stage_12, '06_form_f')

// Creating a brand-new job referencing the soft-archived property MUST still fail
let failedNewRef = false
try {
  createRecord(getDef('jobs'), { deal_name: 'Invalid New Deal', deal_type: 'Sale', client_id: party.id, branch_id: branchId, property_id: legacyProp.id, deal_date: '2026-11-27' }, SYSTEM_CTX)
} catch {
  failedNewRef = true
}
assert.ok(failedNewRef, 'New records must still reject soft-archived ref targets')

// Media Studio API must support developers and communities + ppt uploads
const app = await buildApp()
try {
  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'content-type': 'application/json', 'x-swk-client': 'web' },
    payload: { email: config.accounts.adminSwkEmail, password: config.accounts.adminSwkPassword },
  })
  assert.equal(loginRes.statusCode, 200)
  const sidCookie = String(loginRes.headers['set-cookie'] || '').split(';')[0]
  const authHeaders = { cookie: sidCookie, 'x-swk-client': 'web' }

  const devId = q.val<number>(`SELECT id FROM developers WHERE deleted_at IS NULL LIMIT 1`)!
  const commId = q.val<number>(`SELECT id FROM communities WHERE deleted_at IS NULL LIMIT 1`)!
  const devMedia = await app.inject({ method: 'GET', url: `/api/media/developers/${devId}`, headers: authHeaders })
  assert.equal(devMedia.statusCode, 200, `Expected 200 for /api/media/developers/${devId}, got ${devMedia.statusCode}: ${devMedia.body}`)
  const commMedia = await app.inject({ method: 'GET', url: `/api/media/communities/${commId}`, headers: authHeaders })
  assert.equal(commMedia.statusCode, 200, `Expected 200 for /api/media/communities/${commId}, got ${commMedia.statusCode}: ${commMedia.body}`)

  // Add a PPT link on Developer via /api/media/developers/:id/link
  const pptLink = await app.inject({
    method: 'POST',
    url: `/api/media/developers/${devId}/link`,
    headers: { ...authHeaders, 'content-type': 'application/json' },
    payload: { kind: 'ppt', url: 'https://example.com/developer-deck.pptx', title: 'Corporate Deck', set_primary: true },
  })
  assert.equal(pptLink.statusCode, 200, `PPT link failed: ${pptLink.body}`)
  assert.equal(pptLink.json().record.ppt_url, 'https://example.com/developer-deck.pptx')

  console.log('uae-projects-catalog Task 1 checks: OK')

  // --- Task 2: UAE Developers (55+ Dubai, 22+ Abu Dhabi) & Communities (110+ Dubai, 45+ Abu Dhabi) ---
  const { UAE_DEVELOPERS } = await import('../src/shared/uae-catalog/developers')
  const { UAE_COMMUNITIES } = await import('../src/shared/uae-catalog/communities')
  const { COMMUNITIES, DEVELOPERS } = await import('../src/web/swk/uae')

  const dubaiDevs = UAE_DEVELOPERS.filter((d: any) => d.emirate === 'Dubai')
  const adDevs = UAE_DEVELOPERS.filter((d: any) => d.emirate === 'Abu Dhabi')
  assert.ok(dubaiDevs.length >= 55, `Expected >= 55 Dubai developers, got ${dubaiDevs.length}`)
  assert.ok(adDevs.length >= 22, `Expected >= 22 Abu Dhabi developers, got ${adDevs.length}`)
  assert.equal(new Set(UAE_DEVELOPERS.map((d: any) => d.code)).size, UAE_DEVELOPERS.length, 'Duplicate developer codes')
  assert.equal(new Set(UAE_DEVELOPERS.map((d: any) => d.name.toLowerCase())).size, UAE_DEVELOPERS.length, 'Duplicate developer names')
  for (const d of UAE_DEVELOPERS) {
    assert.ok(d.shortName && d.description && d.amenitiesStandard.length >= 3, `Developer ${d.name} missing rich details`)
    assert.ok(fs.existsSync(path.join('public', d.logo)), `Missing developer logo on disk: ${d.logo}`)
  }

  const dubaiComms = UAE_COMMUNITIES.filter((c: any) => c.emirate === 'Dubai')
  const adComms = UAE_COMMUNITIES.filter((c: any) => c.emirate === 'Abu Dhabi')
  assert.ok(dubaiComms.length >= 110, `Expected >= 110 Dubai communities, got ${dubaiComms.length}`)
  assert.ok(adComms.length >= 45, `Expected >= 45 Abu Dhabi communities, got ${adComms.length}`)
  assert.equal(new Set(UAE_COMMUNITIES.map((c: any) => c.code)).size, UAE_COMMUNITIES.length, 'Duplicate community codes')
  assert.equal(new Set(UAE_COMMUNITIES.map((c: any) => c.slug)).size, UAE_COMMUNITIES.length, 'Duplicate community slugs')
  for (const c of UAE_COMMUNITIES) {
    assert.ok(c.nearby.landmarks.length >= 2 && c.nearby.schools.length >= 1 && c.nearby.hospitals.length >= 1, `Community ${c.name} missing nearby details`)
    assert.ok(c.amenities.length >= 4 && c.closingKeywords.length >= 3 && c.fieldVisitPitchScript.length >= 2, `Community ${c.name} missing amenities/pitch`)
    assert.equal(c.forecast15Y.length, 5, `Community ${c.name} must have 5-point 15-year forecast`)
    assert.ok(fs.existsSync(path.join('public', c.image)), `Missing community image on disk: ${c.image}`)
  }
  assert.ok(COMMUNITIES.length >= 155, 'src/web/swk/uae.ts COMMUNITIES must reflect full UAE catalog')
  assert.ok(DEVELOPERS.length >= 77, 'src/web/swk/uae.ts DEVELOPERS must reflect full UAE catalog')

  // Market pulse endpoint returns both Dubai and Abu Dhabi areas
  const pulseRes = await app.inject({ method: 'GET', url: '/api/swk-ops/market-pulse', headers: authHeaders })
  assert.equal(pulseRes.statusCode, 200)
  const pulseAreas = pulseRes.json().areas as any[]
  assert.ok(pulseAreas.some(a => a.emirate === 'Abu Dhabi'), 'Market pulse must include Abu Dhabi communities')
  assert.ok(pulseAreas.length >= 155, `Market pulse expected >= 155 areas, got ${pulseAreas.length}`)
  console.log(`uae-projects-catalog Task 2 checks: OK (${dubaiDevs.length} Dubai + ${adDevs.length} Abu Dhabi devs, ${dubaiComms.length} Dubai + ${adComms.length} Abu Dhabi communities)`)

  // --- Task 3: 400+ UAE Projects & 250+ Active Off-Plan Launches (<Project> by <Developer>) ---
  const { UAE_PROJECTS, UAE_OFFPLAN_PROJECTS, UAE_READY_PROJECTS, UAE_CATALOG_STATS } = await import('../src/shared/uae-catalog/index')
  const { OFFPLAN_LAUNCHES } = await import('../src/shared/offplan-launches')

  assert.ok(UAE_PROJECTS.length >= 400, `Expected >= 400 UAE projects, got ${UAE_PROJECTS.length}`)
  assert.ok(UAE_OFFPLAN_PROJECTS.length >= 250, `Expected >= 250 active unhanded-over off-plan projects, got ${UAE_OFFPLAN_PROJECTS.length}`)
  const dxbOff = UAE_OFFPLAN_PROJECTS.filter((p: any) => p.emirate === 'Dubai')
  const auhOff = UAE_OFFPLAN_PROJECTS.filter((p: any) => p.emirate === 'Abu Dhabi')
  assert.ok(dxbOff.length >= 180, `Expected >= 180 Dubai active off-plan projects, got ${dxbOff.length}`)
  assert.ok(auhOff.length >= 60, `Expected >= 60 Abu Dhabi active off-plan projects, got ${auhOff.length}`)
  assert.ok(UAE_READY_PROJECTS.length >= 100, `Expected >= 100 flagship ready projects, got ${UAE_READY_PROJECTS.length}`)

  // Every developer in UAE_DEVELOPERS must have >= 2 projects
  const devCodeMap = new Map(UAE_DEVELOPERS.map((d: any) => [d.code, d]))
  const commCodeMap = new Map(UAE_COMMUNITIES.map((c: any) => [c.code, c]))
  const countByDev = new Map<string, number>()
  const seenSlugs = new Set<string>()
  for (const p of UAE_PROJECTS) {
    assert.ok(!seenSlugs.has(p.slug), `Duplicate project slug: ${p.slug}`)
    seenSlugs.add(p.slug)
    const dev = devCodeMap.get(p.developerCode)
    const comm = commCodeMap.get(p.communityCode)
    assert.ok(dev, `Project ${p.title} references unknown developerCode ${p.developerCode}`)
    assert.ok(comm, `Project ${p.title} references unknown communityCode ${p.communityCode}`)
    assert.ok(p.title.toLowerCase().includes(` by ${dev.shortName.toLowerCase()}`), `Project title "${p.title}" must follow "<Project Name> by ${dev.shortName}"`)
    assert.ok(p.projectName && !p.projectName.toLowerCase().endsWith(` by ${dev.shortName.toLowerCase()}`), `Project ${p.title} projectName should be pure project name without trailing "by ${dev.shortName}"`)
    assert.ok(p.fromPrice > 0 && p.amenities.length >= 4 && p.promoHeadline && p.promoBadge, `Project ${p.title} missing price/amenities/promo`)
    assert.ok(p.images.length >= 1 && fs.existsSync(path.join('public', p.cover)), `Project ${p.title} cover missing on disk: ${p.cover}`)
    if (p.isOffPlan) {
      assert.ok(p.handoverDate >= '2026-12-01', `Off-plan project ${p.title} has already-handed-over date ${p.handoverDate}`)
    }
    countByDev.set(p.developerCode, (countByDev.get(p.developerCode) || 0) + 1)
  }
  for (const d of UAE_DEVELOPERS) {
    const n = countByDev.get(d.code) || 0
    assert.ok(n >= 2, `Developer ${d.name} (${d.code}) has only ${n} projects (expected >= 2)`)
  }

  // Flagship example required by user: "Shahrukhz by Danube"
  const shahrukhz = UAE_PROJECTS.find((p: any) => p.title === 'Shahrukhz by Danube')
  assert.ok(shahrukhz, 'Must include exact flagship project "Shahrukhz by Danube"')
  assert.equal(shahrukhz.projectName, 'Shahrukhz')
  assert.equal(shahrukhz.developerCode, 'DANUBE')
  assert.equal(shahrukhz.isOffPlan, true)
  assert.ok(shahrukhz.cover.includes('shahrukhz'), `Expected Shahrukhz render, got ${shahrukhz.cover}`)

  // Legacy OFFPLAN_LAUNCHES module derives directly from UAE_OFFPLAN_PROJECTS
  assert.equal(OFFPLAN_LAUNCHES.length, UAE_OFFPLAN_PROJECTS.length, 'OFFPLAN_LAUNCHES must match UAE_OFFPLAN_PROJECTS')
  assert.ok(UAE_CATALOG_STATS.totalProjects === UAE_PROJECTS.length)
  console.log(`uae-projects-catalog Task 3 checks: OK (${UAE_PROJECTS.length} total projects, ${UAE_OFFPLAN_PROJECTS.length} off-plan [${dxbOff.length} DXB / ${auhOff.length} AUH], ${UAE_READY_PROJECTS.length} ready)`)
} finally {
  await app.close()
  db.close()
  fs.rmSync(dataDir, { recursive: true, force: true })
}
process.exit(0)
