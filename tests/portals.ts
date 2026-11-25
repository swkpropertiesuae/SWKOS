import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swk-portals-'))
process.env.DATA_DIR = tmpDir
process.env.DATABASE_URL = ''
process.env.PUBLIC_URL = 'https://os.example.test'

async function run() {
  const { q } = await import('../src/server/db')
  const { syncSchema } = await import('../src/server/schema')
  const { seedReference } = await import('../src/server/seed')
  const { createRecord, getDef, SYSTEM_CTX } = await import('../src/server/engine')
  const { addDays, todayStr } = await import('../src/server/util')
  const P = await import('../src/server/domain/portals')
  const { ingestLead } = await import('../src/server/routes/integrations')
  syncSchema()
  await seedReference()
  const today = todayStr()

  const agentId = q.insert(`INSERT INTO agents(name, email, phone, dld_broker_id, dld_expiry, status, created_at, updated_at) VALUES (?,?,?,?,?, 'Active', ?, ?)`,
    'Sara Broker', 'sara@example.test', '+971500000009', 'BRN-12345', addDays(today, 200), new Date().toISOString(), new Date().toISOString())
  const base = {
    property_type: 'Apartment', status: 'Available', department_division: 'Secondary Projects', price: 1850000, bedrooms: 2, bathrooms: 2, area_sqft: 1240,
    description: 'Bright 2-bed with marina view', agent_id: agentId, syndicate_pf: true, syndicate_bayut: true, syndicate_dubizzle: false,
    media: [{ url: '/uploads/a.jpg' }, { url: 'https://cdn.example.test/b.jpg' }],
  }
  const good = createRecord(getDef('properties'), { ...base, title: 'Marina 2BR & "View" <Tower>', rera_permit_no: '7110000001', permit_expiry: addDays(today, 60) }, SYSTEM_CTX)
  const noPermit = createRecord(getDef('properties'), { ...base, title: 'No permit unit' }, SYSTEM_CTX)
  const expired = createRecord(getDef('properties'), { ...base, title: 'Expired permit unit', rera_permit_no: '7110000002', permit_expiry: addDays(today, -1) }, SYSTEM_CTX)
  const sold = createRecord(getDef('properties'), { ...base, title: 'Sold unit', status: 'Sold', rera_permit_no: '7110000003', permit_expiry: addDays(today, 60) }, SYSTEM_CTX)
  const rent = createRecord(getDef('properties'), { ...base, title: 'JLT studio for rent', property_type: 'Studio', department_division: 'Leasing', price: null, rent_annual: 65000, rera_permit_no: '7110000004', permit_expiry: addDays(today, 30) }, SYSTEM_CTX)

  // 1. Permit gate: only listings with a valid permit (and price, agent BRN, description, advertisable status) are sent.
  const pf = P.portalListings('propertyfinder')
  assert.deepEqual(pf.eligible.map(l => l.id).sort(), [good.id, rent.id].sort())
  const why = (id: number) => pf.blocked.find(b => b.id === id)?.reasons.join('; ') ?? ''
  assert.match(why(noPermit.id), /No Trakheesi permit/)
  assert.match(why(expired.id), /Permit expired/)
  assert.match(why(sold.id), /Status is Sold/)
  assert.equal(P.portalListings('dubizzle').eligible.length, 0, 'listings not flagged for Dubizzle are not sent there')
  console.log('  ✓ Trakheesi permit gate blocks missing, expired and non-advertisable listings')

  // 2. Property Finder XML: escaped, permit and agent BRN included, rent mapped, relative images made absolute.
  const pfXml = P.portalXml('propertyfinder')
  assert.match(pfXml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<list last_update="[^"]+" listing_count="2">/)
  assert.match(pfXml, /<permit_number>7110000001<\/permit_number>/)
  assert.match(pfXml, /<title_en><!\[CDATA\[Marina 2BR & "View" <Tower>\]\]><\/title_en>/)
  assert.match(pfXml, /<offering_type>RR<\/offering_type>.*<rental_period>Y<\/rental_period>/s)
  assert.match(pfXml, /<price>1850000<\/price>/)
  assert.match(pfXml, /<license_no>BRN-12345<\/license_no>/)
  assert.match(pfXml, /https:\/\/os\.example\.test\/uploads\/a\.jpg/)
  assert.doesNotMatch(pfXml, /7110000002|No permit unit|Sold unit/)
  console.log('  ✓ Property Finder feed')

  // 3. Bayut XML.
  const bayut = P.portalXml('bayut')
  assert.match(bayut, /<Permit_Number><!\[CDATA\[7110000001\]\]><\/Permit_Number>/)
  assert.match(bayut, /<Property_purpose><!\[CDATA\[Rent\]\]><\/Property_purpose>/)
  assert.match(bayut, /<Listing_Agent_BRN><!\[CDATA\[BRN-12345\]\]><\/Listing_Agent_BRN>/)
  console.log('  ✓ Bayut feed')

  // 4. Feed token: created once, constant-time match, rotation stops the old URL.
  const t1 = P.portalFeedToken()
  assert.equal(P.portalFeedToken(), t1)
  assert.equal(P.feedTokenMatches(t1), true)
  assert.equal(P.feedTokenMatches(t1 + 'x'), false)
  const t2 = P.portalFeedToken(true)
  assert.notEqual(t2, t1)
  assert.equal(P.feedTokenMatches(t1), false)
  console.log('  ✓ feed token')

  // 5. Portal enquiry: any common field spelling, linked to our listing, department set for routing, retries deduplicated.
  const ref = q.val<string>(`SELECT property_no FROM properties WHERE id = ?`, rent.id)!
  const enquiry = P.portalEnquiry('bayut', { lead_id: 'BY-778', client_name: 'Omar Test', client_phone: '+971 50 111 2233', property_reference: ref, message: 'Is it still available?' })
  assert.equal(enquiry.source, 'Bayut')
  assert.equal(enquiry.department_division, 'Leasing')
  const r1: any = ingestLead(enquiry)
  assert.equal(r1.created, true)
  const lead = q.get(`SELECT * FROM leads WHERE id = ?`, r1.lead_id)!
  assert.equal(lead.source, 'Bayut')
  assert.equal(lead.department_division, 'Leasing')
  assert.match(lead.notes, /JLT studio for rent/)
  assert.equal((ingestLead(enquiry) as any).duplicate, true, 'a retried delivery returns the same lead')
  const pfLead = P.portalEnquiry('propertyfinder', { id: 'PF-1', name: 'Lina', email: 'lina@example.test', listing_reference: 'unknown-ref' })
  assert.match(pfLead.message, /not found in SWK OS/)
  assert.equal(pfLead.department_division, undefined)
  console.log('  ✓ portal enquiries')

  // 6. Listing quality score: a thin listing scores low and lists what to add.
  const thin = P.portalListings('propertyfinder').eligible.find(l => l.title.startsWith('Marina'))!
  assert.ok(thin.quality < 70, `thin listing scores low (${thin.quality})`)
  assert.ok(thin.quality_missing.some((m: string) => /photos/.test(m)), 'asks for more photos')
  const rich = P.listingQuality({ media: Array.from({ length: 12 }, (_, i) => ({ url: `https://cdn.example.test/${i}.jpg` })), description: 'x'.repeat(800), title: 'Spacious 2 Bedroom Apartment with Full Marina View',
    area_sqft: 1200, bedrooms: 2, bathrooms: 2, community_ref: 1, latitude: '25.08', longitude: '55.14', furnishing: 'Unfurnished', amenities: 'Pool, gym', rera_permit_no: '1' })
  assert.deepEqual(rich, { score: 100, missing: [] })
  console.log('  ✓ listing quality score')

  // 7. A portal enquiry goes to the agent who owns the listing.
  const now = new Date().toISOString()
  const agentUser = q.insert(`INSERT INTO users(name, email, active, created_at, updated_at) VALUES ('Listing Agent', 'listing.agent@example.test', 1, ?, ?)`, now, now)
  const emp = q.insert(`INSERT INTO employees(emp_no, name, user_id, status, created_at, updated_at) VALUES ('E-LA1', 'Listing Agent', ?, 'Active', ?, ?)`, agentUser, now, now)
  const agent2 = q.insert(`INSERT INTO agents(name, employee_id, dld_broker_id, status, created_at, updated_at) VALUES ('Listing Agent', ?, 'BRN-777', 'Active', ?, ?)`, emp, now, now)
  q.run(`UPDATE properties SET agent_id = ? WHERE id = ?`, agent2, rent.id)
  const r2: any = ingestLead(P.portalEnquiry('propertyfinder', { id: 'PF-2', name: 'Huda', phone: '+971 55 444 1122', listing_reference: ref }))
  const lead2 = q.get(`SELECT owner_id, routed_by FROM leads WHERE id = ?`, r2.lead_id)!
  assert.equal(lead2.owner_id, agentUser)
  assert.equal(lead2.routed_by, 'Listing agent')
  console.log('  ✓ portal enquiry assigned to the listing agent')

  console.log('Portal feed, permit gate and portal lead checks passed.')
}

run().catch(e => { console.error(e); process.exit(1) })
