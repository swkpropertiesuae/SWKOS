import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dataDir = process.env.DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'swk-offplan-launches-'))
process.env.DATA_DIR = dataDir
if (!process.env.DATABASE_URL) { process.env.DATABASE_URL = ''; process.env.REQUIRE_DATABASE_URL = 'false' }
process.env.DEMO_ENABLED = 'false'
process.env.STARTER_DATA = 'false'
process.env.NODE_ENV = 'test'

const { syncSchema } = await import('../src/server/schema')
const { seedReference } = await import('../src/server/seed')
const { ensureDirs } = await import('../src/server/config')
const { q } = await import('../src/server/db')
const { deleteRecord, findOne, getDef, SYSTEM_CTX } = await import('../src/server/engine')
const { classifyEmbedUrl, normalizeMediaList } = await import('../src/shared/media')
const { OFFPLAN_LAUNCHES } = await import('../src/shared/offplan-launches')
const { ensureOffPlanLaunches, planOption } = await import('../src/server/domain/offplan-launches')

ensureDirs(); syncSchema(); seedReference()

// catalogue: every launch has a cover that exists on disk
assert.ok(OFFPLAN_LAUNCHES.length >= 50)
for (const l of OFFPLAN_LAUNCHES) {
  for (const img of [l.cover, ...l.images]) assert.ok(fs.existsSync(path.join('public', img)), `missing ${img}`)
}
assert.equal(planOption('Plan 60/40'), '60/40')
assert.equal(planOption('Plan 58/42 post-handover'), 'Custom')
assert.equal(planOption(null), undefined)
assert.equal(classifyEmbedUrl('https://maps.google.com/maps?q=25.1,55.2&t=k&z=17&output=embed')?.mode, 'iframe')

// first run adds every launch as an off-plan property with photos and a location tour
const r1 = ensureOffPlanLaunches()
assert.equal(r1.added, OFFPLAN_LAUNCHES.length)
const rows = q.all<any>(`SELECT * FROM properties WHERE deleted_at IS NULL`)
assert.equal(rows.length, OFFPLAN_LAUNCHES.length)
const spectre = rows.find(r => r.title === 'Binghatti Spectre')
assert.ok(spectre)
assert.ok(spectre.is_off_plan)
assert.equal(spectre.status, 'Off-Plan')
const media = normalizeMediaList(spectre.media)
assert.ok(media.filter(m => m.kind === 'photo').length >= 5)
assert.ok(rows.every(r => !r.syndicate_bayut), 'launches stay off the portals until a permit is added')

// portal-only launches come in with their render and listing source
const vista = rows.find(r => r.title === 'Vista Hub')
assert.ok(vista, 'portal launch added')
assert.ok(normalizeMediaList(vista.media)[0].url.startsWith('/media/launches/'))
assert.match(String(vista.notes), /VILA/)

// enrichment fills only empty fields and replaces only the untouched area-photo placeholder
const oak = rows.find(r => r.title === 'Oakmont')
q.run(`UPDATE properties SET price = NULL, media = ?, title = 'Oakmont (staff renamed)' WHERE id = ?`, JSON.stringify([{ id: 'launch-oakmont-area', kind: 'photo', url: '/media/communities/jvc.webp', order: 0 }]), oak.id)
q.run(`DELETE FROM settings WHERE key LIKE 'offplan-launch-enrich:portal:oakmont:%'`)
assert.equal(ensureOffPlanLaunches().enriched, 1)
const oak2 = findOne('properties', 'id = ?', oak.id)!
assert.equal(Number(oak2.price), 1200000)
assert.equal(oak2.title, 'Oakmont (staff renamed)')
assert.ok(normalizeMediaList(oak2.media)[0].url.startsWith('/media/launches/oakmont'))

// second run adds nothing; a deleted launch is not added back
assert.equal(ensureOffPlanLaunches().added, 0)
deleteRecord(getDef('properties'), Number(spectre.id), SYSTEM_CTX)
assert.equal(ensureOffPlanLaunches().added, 0)

console.log(`offplan-launches: ok (${OFFPLAN_LAUNCHES.length} launches)`)
process.exit(0)
