import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

const dataDir = process.env.DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'swk-premium-suite-'))
process.env.DATA_DIR = dataDir
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = ''
  process.env.REQUIRE_DATABASE_URL = 'false'
}
process.env.DEMO_ENABLED = 'false'
process.env.STARTER_DATA = 'false'
process.env.OFFPLAN_LAUNCHES = 'false'
process.env.NODE_ENV = 'test'

const { ensureDirs, config } = await import('../src/server/config')
const { syncSchema } = await import('../src/server/schema')
const { seedReference, syncSwkStaffRoster } = await import('../src/server/seed')
const { q, db } = await import('../src/server/db')
const { buildApp } = await import('../src/server/app')
const { watermarkPropertyImage } = await import('../src/server/domain/watermark')

ensureDirs()
syncSchema()
await seedReference()
syncSwkStaffRoster()
q.run(`UPDATE users SET must_change_password = 0 WHERE deleted_at IS NULL`)

const app = await buildApp()

async function loginAs(email: string, password: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'content-type': 'application/json', 'x-swk-client': 'web' },
    payload: { email, password },
  })
  assert.equal(res.statusCode, 200, `Login failed for ${email}: ${res.body}`)
  const cookie = String(res.headers['set-cookie'] || '').split(';')[0]
  return { cookie, 'x-swk-client': 'web' }
}

/** Extract uncompressed entry text from a standard ZIP buffer (PK\x03\x04). */
function readZipEntries(buf: Buffer): Record<string, string> {
  const out: Record<string, string> = {}
  let pos = 0
  while (pos + 30 <= buf.length && buf.readUInt32LE(pos) === 0x04034b50) {
    const method = buf.readUInt16LE(pos + 8)
    const compSize = buf.readUInt32LE(pos + 18)
    const nameLen = buf.readUInt16LE(pos + 26)
    const extraLen = buf.readUInt16LE(pos + 28)
    const name = buf.subarray(pos + 30, pos + 30 + nameLen).toString('utf8')
    const dataStart = pos + 30 + nameLen + extraLen
    const raw = buf.subarray(dataStart, dataStart + compSize)
    const content = method === 8 ? zlib.inflateRawSync(raw) : raw
    out[name] = content.toString('utf8')
    pos = dataStart + compSize
  }
  return out
}

try {
  // 1. Verify 8K transparent icon, 100%-visible favicons, watermark & mobile native icons
  const png8kPath = path.resolve('public/brand/swk-emblem-8k-transparent.png')
  assert.ok(fs.existsSync(png8kPath), '8K transparent SWK emblem must exist')
  const pngHdr = Buffer.alloc(32)
  const fd = fs.openSync(png8kPath, 'r')
  fs.readSync(fd, pngHdr, 0, 32, 0)
  fs.closeSync(fd)
  assert.equal(pngHdr.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', '8K emblem must be a valid PNG')
  assert.equal(pngHdr.readUInt32BE(16), 7680, '8K emblem width must be 7680')
  assert.equal(pngHdr.readUInt32BE(20), 7680, '8K emblem height must be 7680')
  assert.equal(pngHdr[25], 6, '8K emblem must have RGBA alpha transparency (color type 6)')

  for (const rel of [
    'public/favicon/favicon-16.png',
    'public/favicon/favicon-32.png',
    'public/favicon/favicon-192.png',
    'public/favicon/favicon.svg',
    'public/favicon/favicon.ico',
    'public/favicon.ico',
    'public/apple-touch-icon.png',
    'public/brand/swk-watermark.png',
    'public/brand/os/SWK_Emblem_Transparent_1024.png',
    'mobile/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png',
    'mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',
  ]) {
    const full = path.resolve(rel)
    assert.ok(fs.existsSync(full), `Required brand/mobile asset missing: ${rel}`)
    assert.ok(fs.statSync(full).size > 100, `Brand/mobile asset empty: ${rel}`)
  }

  const icoBuf = fs.readFileSync(path.resolve('public/favicon.ico'))
  assert.equal(icoBuf.readUInt16LE(0), 0, 'favicon.ico header reserved must be 0')
  assert.equal(icoBuf.readUInt16LE(2), 1, 'favicon.ico header type must be 1 (ICO)')

  const wmBuf = await watermarkPropertyImage('/brand/web/swk-icon.png', { title: 'Test Watermark Suite', propertyRef: 'PRJ-TEST' })
  assert.equal(wmBuf[0], 0xff)
  assert.equal(wmBuf[1], 0xd8)
  assert.ok(wmBuf.length > 5000, 'Watermarked JPEG output must be non-empty')

  // 2. Authenticate test users
  const ownerH = await loginAs(config.accounts.ownerEmail, config.accounts.ownerPassword)
  const adminH = await loginAs(config.accounts.adminSwkEmail, config.accounts.adminSwkPassword)
  const managerH = await loginAs('haseeb@swk.properties', config.accounts.managerPassword)
  const officeAdminH = await loginAs('meenakshi@swk.properties', config.accounts.bdmPassword)
  const restrictedH = await loginAs('umar@swk.rent', config.accounts.bdmPassword)

  // 3. Seed realistic Dubai + Abu Dhabi projects & a buyer lead
  const pDubaiRes = await app.inject({
    method: 'POST',
    url: '/api/e/properties',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: {
      title: 'Marina Crown Waterfront Residences',
      emirate: 'Dubai',
      department_division: 'Sales of Off-Plan Projects',
      property_type: 'Apartment',
      status: 'Available',
      bedrooms: 2,
      bathrooms: 3,
      area_sqft: 1450,
      price: 2500000,
      rent_annual: 195000,
      roi_percent: 7.8,
      handover_quarter: 'Q4 2027',
      payment_plan: '60/40',
      is_off_plan: true,
      rera_permit_no: '7145891200',
      permit_expiry: '2026-12-10',
      description: 'Luxury 2-bedroom waterfront residence in Dubai Marina with full skyline and yacht views.',
      amenities: 'Infinity pool, Private gym, Concierge, Marina promenade',
      video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      syndicate_pf: true,
      syndicate_bayut: true,
      syndicate_dubizzle: true,
    },
  })
  assert.equal(pDubaiRes.statusCode, 201, `Failed creating Dubai property: ${pDubaiRes.body}`)
  const pDubai = pDubaiRes.json()

  const pAdRes = await app.inject({
    method: 'POST',
    url: '/api/e/properties',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: {
      title: 'Saadiyat Grove Boulevard Suite',
      emirate: 'Abu Dhabi',
      department_division: 'Secondary Projects',
      property_type: 'Apartment',
      status: 'Available',
      bedrooms: 1,
      bathrooms: 2,
      area_sqft: 920,
      price: 1600000,
      rent_annual: 120000,
      rera_permit_no: 'ADM-2026-9910',
      syndicate_pf: true,
      syndicate_bayut: true,
    },
  })
  assert.equal(pAdRes.statusCode, 201, `Failed creating Abu Dhabi property: ${pAdRes.body}`)
  const pAd = pAdRes.json()

  const leadRes = await app.inject({
    method: 'POST',
    url: '/api/e/leads',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: {
      company: 'Elena Rostova Family Office',
      contact_name: 'Elena Rostova',
      phone: '+971501234567',
      source: 'Property Finder',
      status: 'New',
      department_division: 'Sales of Off-Plan Projects',
      interest: 'Off-Plan Sale',
      destination: 'Marina',
      bedrooms_wanted: 2,
      est_value: 2450000,
    },
  })
  assert.equal(leadRes.statusCode, 201, `Failed creating lead: ${leadRes.body}`)
  const lead = leadRes.json()

  // 4. Dubai Agency Hub API & RBAC (restricted staff AND Office Admin without properties:view must be 403)
  const hubDenied = await app.inject({ method: 'GET', url: '/api/agency-hub/overview', headers: restrictedH })
  assert.equal(hubDenied.statusCode, 403, 'Restricted staff must be blocked from Dubai Agency Hub')
  const hubDeniedOffice = await app.inject({ method: 'GET', url: '/api/agency-hub/overview', headers: officeAdminH })
  assert.equal(hubDeniedOffice.statusCode, 403, 'Office Admin without properties:view must be blocked from Dubai Agency Hub')

  const hubRes = await app.inject({ method: 'GET', url: '/api/agency-hub/overview', headers: managerH })
  assert.equal(hubRes.statusCode, 200, `Manager Agency Hub failed: ${hubRes.body}`)
  const hub = hubRes.json()
  assert.ok(hub.summary.active_listings >= 2)
  assert.ok(hub.summary.avg_quality_score > 50)
  const marinaScored = hub.listings.find((l: any) => l.id === pDubai.id)
  assert.ok(marinaScored && marinaScored.quality_score >= 85, `Expected high quality score, got ${JSON.stringify(marinaScored)}`)
  assert.ok(hub.sla_leads.some((l: any) => l.id === lead.id), 'New lead must appear in 5-min SLA monitor')

  // 5. Smart Matcher
  const matchRes = await app.inject({ method: 'GET', url: `/api/agency-hub/match/${lead.id}`, headers: ownerH })
  assert.equal(matchRes.statusCode, 200)
  const matchData = matchRes.json()
  assert.ok(matchData.matches.length >= 1)
  assert.equal(matchData.matches[0].property_id, pDubai.id, 'Best matched home must be Marina Crown')
  assert.ok(matchData.matches[0].match_score >= 70)
  assert.ok(!/shabib/i.test(matchData.matches[0].whatsapp_pitch), 'WhatsApp pitch must stay Zero-Shabib clean')

  // 6. 3-Project Investor ROI, DLD/ADM & Golden Visa Comparator + PDF/DOCX/JPEG Export
  const cmpRes = await app.inject({
    method: 'POST',
    url: '/api/agency-hub/compare',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: { property_ids: [pDubai.id, pAd.id], down_payment_pct: 20, interest_rate_pct: 4.25, loan_years: 25, service_charge_psf: 16 },
  })
  assert.equal(cmpRes.statusCode, 200)
  const cmp = cmpRes.json()
  const dubaiItem = cmp.items.find((i: any) => i.id === pDubai.id)
  const adItem = cmp.items.find((i: any) => i.id === pAd.id)
  assert.equal(dubaiItem.golden_visa_eligible, true, 'AED 2.5M property must be Golden Visa eligible')
  assert.equal(adItem.golden_visa_eligible, false, 'AED 1.6M property must NOT be Golden Visa eligible')
  assert.ok(/4% DLD/.test(dubaiItem.gov_fee_label))
  assert.ok(/2% ADM/.test(adItem.gov_fee_label))
  assert.ok(dubaiItem.monthly_mortgage_aed > 5000 && dubaiItem.net_roi_pct > 4)

  for (const [fmt, magic] of [
    ['pdf', '%PDF'],
    ['docx', 'PK'],
    ['jpeg', 'ffd8ff'],
  ] as const) {
    const expRes = await app.inject({
      method: 'POST',
      url: '/api/agency-hub/compare/export',
      headers: { ...ownerH, 'content-type': 'application/json' },
      payload: { property_ids: [pDubai.id, pAd.id], format: fmt },
    })
    assert.equal(expRes.statusCode, 200, `Compare export ${fmt} failed: ${expRes.body}`)
    const b = expRes.rawPayload
    if (fmt === 'jpeg') assert.equal(b.subarray(0, 3).toString('hex'), magic)
    else assert.equal(b.subarray(0, magic.length).toString('utf8'), magic)
  }

  // 7. Property Finder & Bayut XML Syndication Feeds (Valid XML + Correct AED + Zero-Shabib)
  const pfRes = await app.inject({ method: 'GET', url: '/api/agency-hub/feeds/propertyfinder.xml', headers: ownerH })
  assert.equal(pfRes.statusCode, 200)
  assert.ok(pfRes.body.includes('<list '))
  assert.ok(pfRes.body.includes('Marina Crown Waterfront Residences'))
  assert.ok(pfRes.body.includes('<price>2500000</price>'), 'PF feed must emit AED 2500000, not cents')
  assert.ok(!/shabib/i.test(pfRes.body), 'PF XML feed must not leak Shabib')

  const bayutRes = await app.inject({ method: 'GET', url: '/api/agency-hub/feeds/bayut.xml', headers: ownerH })
  assert.equal(bayutRes.statusCode, 200)
  assert.ok(bayutRes.body.includes('<Properties>'))
  assert.ok(bayutRes.body.includes('<Price>2500000</Price>'))
  assert.ok(!/shabib/i.test(bayutRes.body), 'Bayut XML feed must not leak Shabib')

  // Verify 0% interest financing calculation works cleanly
  const cmpZeroRes = await app.inject({
    method: 'POST',
    url: '/api/agency-hub/compare',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: { property_ids: [pDubai.id], down_payment_pct: 20, interest_rate_pct: 0, loan_years: 20, service_charge_psf: 0 },
  })
  assert.equal(cmpZeroRes.statusCode, 200)
  const zItem = cmpZeroRes.json().items[0]
  assert.equal(zItem.monthly_mortgage_aed, Math.round(2_000_000 / 240), '0% interest must divide loan evenly across months')
  assert.equal(zItem.annual_service_charge_aed, 0, '0 service charge psf must yield 0')

  // Seed Shabib Workspace records (forensic visit, closing dossier + cheque, commission entry) to verify all 21 Master Excel sheets!
  const fVisitRes = await app.inject({
    method: 'POST',
    url: '/api/field-reports',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: {
      report_type: 'Viewing',
      visit_date: '2026-11-27',
      community: 'Dubai Marina',
      building_or_project: 'Marina Crown',
      unit_no: '2204',
      gps_lat: '25.0805',
      gps_lng: '55.1403',
      met_person_name: 'Elena Rostova',
      asking_price_aed: 2500000,
    },
  })
  assert.equal(fVisitRes.statusCode, 201, `Seed forensic visit failed: ${fVisitRes.body}`)

  const cDossierRes = await app.inject({
    method: 'POST',
    url: '/api/shabib-workspace/closings',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: {
      track: 'Secondary',
      title: 'Marina Crown 2204 Closing',
      community: 'Dubai Marina',
      building_or_project: 'Marina Crown',
      unit_no: '2204',
      client_name: 'Elena Rostova',
      agreed_price_aed: 2450000,
      agency_commission_aed: 49000,
    },
  })
  assert.equal(cDossierRes.statusCode, 201, `Seed closing dossier failed: ${cDossierRes.body}`)
  const cDossier = cDossierRes.json()

  const cChqRes = await app.inject({
    method: 'POST',
    url: `/api/shabib-workspace/closings/${cDossier.id}/cheques`,
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: {
      cheque_no: 'CHQ-998877',
      bank_name: 'Emirates NBD',
      payee_name: 'SWK Properties LLC',
      purpose: 'Booking Deposit',
      payment_method: 'Cheque / PDC',
      amount_aed: 245000,
      cheque_date: '2026-12-01',
      status: 'Received',
    },
  })
  assert.equal(cChqRes.statusCode, 201, `Seed cheque failed: ${cChqRes.body}`)

  const commRes = await app.inject({
    method: 'POST',
    url: '/api/shabib-workspace/commissions-expenses',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: {
      entry_type: 'Commission',
      agent_name: 'Fareed',
      property_label: 'Marina Crown 2204',
      gross_amount_aed: 49000,
      split_pct: 50,
      net_amount_aed: 24500,
      status: 'Pending',
      payment_mode: 'Bank Transfer (BT)',
      entry_date: '2026-11-27',
    },
  })
  assert.equal(commRes.statusCode, 201, `Seed commission failed: ${commRes.body}`)

  // 8. Master All-Data Excel Workbook (.xlsx) & Automated Daily Full Backups
  const xlDeniedStaff = await app.inject({ method: 'GET', url: '/api/admin/excel/master.xlsx', headers: restrictedH })
  assert.equal(xlDeniedStaff.statusCode, 403, 'Restricted staff must not download Master Excel')
  const xlDeniedMgr = await app.inject({ method: 'GET', url: '/api/admin/excel/master.xlsx', headers: managerH })
  assert.equal(xlDeniedMgr.statusCode, 403, 'Manager must not download Owner/Admin Master Excel')

  const xlRes = await app.inject({ method: 'GET', url: '/api/admin/excel/master.xlsx', headers: ownerH })
  assert.equal(xlRes.statusCode, 200, `Master Excel failed: ${xlRes.body}`)
  assert.ok(String(xlRes.headers['content-type']).includes('spreadsheetml.sheet'))
  const xlEntries = readZipEntries(xlRes.rawPayload)
  assert.ok(xlEntries['xl/workbook.xml'], 'XLSX must contain xl/workbook.xml')
  assert.ok(xlEntries['xl/styles.xml'], 'XLSX must contain xl/styles.xml')
  for (const sheetName of [
    '00_Summary',
    '01_Projects',
    '05_Leads',
    '12_Forensic_Visits',
    '13_Closing_Dossiers',
    '14_Cheque_Ledger',
    '15_Commissions_Expenses',
  ]) {
    assert.ok(xlEntries['xl/workbook.xml'].includes(sheetName), `Master Excel missing required sheet: ${sheetName}`)
  }
  const allXml = Object.values(xlEntries).join('\n')
  assert.ok(allXml.includes('Marina Crown Waterfront Residences'), 'Master Excel must include live project')
  assert.ok(allXml.includes('2500000'), 'Master Excel must convert price from cents to AED')
  assert.ok(allXml.includes('Elena Rostova'), 'Master Excel must include live lead')
  assert.ok(allXml.includes('Marina Crown 2204 Closing'), 'Master Excel must include seeded closing dossier')
  assert.ok(allXml.includes('CHQ-998877'), 'Master Excel must include seeded cheque ledger row')
  assert.ok(allXml.includes('24500'), 'Master Excel must include seeded commission row')
  assert.ok(!allXml.includes('password_hash') && !allXml.includes('totp_secret'), 'Master Excel must NEVER export password hashes or TOTP secrets')

  // 9. Automated Daily Full Backup (DB Snapshot + Master Excel .xlsx)
  const fullRunRes = await app.inject({ method: 'POST', url: '/api/admin/backups/full', headers: adminH })
  assert.equal(fullRunRes.statusCode, 200, `Full backup failed: ${fullRunRes.body}`)
  const fullStatus = fullRunRes.json()
  assert.ok(fullStatus.db_file && fullStatus.db_bytes > 0)
  assert.ok(fullStatus.excel_file && fullStatus.excel_bytes > 1000)
  assert.equal(fullStatus.sheet_count, 21, `Expected all 21 Excel sheets, got ${fullStatus.sheet_count}`)

  const listRes = await app.inject({ method: 'GET', url: '/api/admin/backups/full', headers: ownerH })
  assert.equal(listRes.statusCode, 200)
  const listed = listRes.json()
  assert.ok(listed.excel_backups.some((x: any) => x.name === fullStatus.excel_file))
  assert.ok(listed.db_backups.some((x: any) => x.name === fullStatus.db_file))

  const dlArchRes = await app.inject({ method: 'GET', url: `/api/admin/backups/excel/${fullStatus.excel_file}`, headers: ownerH })
  assert.equal(dlArchRes.statusCode, 200)
  assert.equal(dlArchRes.rawPayload.subarray(0, 2).toString('utf8'), 'PK')

  const travRes = await app.inject({ method: 'GET', url: `/api/admin/backups/excel/..%2F${fullStatus.excel_file}`, headers: ownerH })
  assert.equal(travRes.statusCode, 404, 'Path traversal with valid filename suffix must still return 404')

  console.log('✅ premium-suite passed all assertions (8K brand + Agency Hub + XML feeds + Master Excel + Daily Backups)!')
} finally {
  await app.close()
  try {
    db.close()
  } catch { /* ignore */ }
}
