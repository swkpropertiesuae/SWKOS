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
const spectre = rows.find(r => r.title === 'Binghatti Spectre by Binghatti')
assert.ok(spectre)
assert.ok(spectre.is_off_plan)
assert.equal(spectre.status, 'Off-Plan')
const media = normalizeMediaList(spectre.media)
assert.ok(media.filter(m => m.kind === 'photo').length >= 5)
assert.ok(rows.every(r => !r.syndicate_bayut), 'launches stay off the portals until a permit is added')

// flagship UAE launches include Shahrukhz by Danube and Abu Dhabi off-plan launches
const shahrukhz = rows.find(r => r.title === 'Shahrukhz by Danube')
assert.ok(shahrukhz, 'Shahrukhz by Danube launch added')
assert.equal(shahrukhz.project_name, 'Shahrukhz')
assert.ok(normalizeMediaList(shahrukhz.media)[0].url.startsWith('/media/launches/shahrukhz'))
const auhLaunch = rows.find(r => r.emirate === 'Abu Dhabi')
assert.ok(auhLaunch, 'Abu Dhabi off-plan launches included')

// enrichment fills only empty fields and replaces only the untouched area-photo placeholder
const oak = rows.find(r => String(r.title).startsWith('Oakmont Park Estates'))
assert.ok(oak)
const oakLaunch = OFFPLAN_LAUNCHES.find(l => l.name === oak.title)!
q.run(`UPDATE properties SET price = NULL, media = ?, title = 'Oakmont (staff renamed)' WHERE id = ?`, JSON.stringify([{ id: `launch-${oakLaunch.slug}-area`, kind: 'photo', url: '/media/communities/jvc.webp', order: 0 }]), oak.id)
q.run(`DELETE FROM settings WHERE key LIKE ?`, `offplan-launch-enrich:${oakLaunch.key}:%`)
assert.equal(ensureOffPlanLaunches().enriched, 1)
const oak2 = findOne('properties', 'id = ?', oak.id)!
assert.equal(Number(oak2.price), oakLaunch.fromPrice)
assert.equal(oak2.title, 'Oakmont (staff renamed)')
assert.ok(normalizeMediaList(oak2.media)[0].url.startsWith('/media/launches/oakmont'))

// second run adds nothing; a deleted launch is not added back
assert.equal(ensureOffPlanLaunches().added, 0)
deleteRecord(getDef('properties'), Number(spectre.id), SYSTEM_CTX)
assert.equal(ensureOffPlanLaunches().added, 0)

console.log(`offplan-launches: ok (${OFFPLAN_LAUNCHES.length} launches)`)
process.exit(0)
