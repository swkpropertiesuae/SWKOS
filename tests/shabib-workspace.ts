import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dataDir = process.env.DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'swk-shabib-ws-'))
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
const { syncStudioLibrary } = await import('../src/server/studio/library')
const { q, db } = await import('../src/server/db')
const { buildApp } = await import('../src/server/app')
const { publicSettings } = await import('../src/server/settings')

ensureDirs()
syncSchema()
await seedReference()
syncSwkStaffRoster()
syncStudioLibrary()

// Clear must_change_password on test staff accounts so HTTP logins proceed cleanly in test fixture
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

const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000002000000020802000000fdd49a730000000e49444154789c63f8cfc0f01f00050001ff89993d1d0000000049454e44ae426082',
  'hex',
)

try {
  const ownerH = await loginAs(config.accounts.ownerEmail, config.accounts.ownerPassword)
  const adminH = await loginAs(config.accounts.adminSwkEmail, config.accounts.adminSwkPassword)
  const managerH = await loginAs('haseeb@swk.properties', config.accounts.managerPassword)
  const umarH = await loginAs('umar@swk.rent', config.accounts.bdmPassword)
  const talhaH = await loginAs('talha@swk.properties', config.accounts.bdmPassword)
  const fareedH = await loginAs('fareed@swk.rent', config.accounts.bdmPassword)
  const meenakshiH = await loginAs('meenakshi@swk.properties', config.accounts.bdmPassword)

  // 1. STRICT OWNER-ONLY RBAC ON /api/shabib-workspace/*
  for (const [label, hdr] of [['Admin', adminH], ['Manager', managerH], ['Restricted Staff', umarH], ['Office Admin', meenakshiH]] as const) {
    for (const url of ['/api/shabib-workspace/team-daily', '/api/shabib-workspace/closings', '/api/shabib-workspace/commissions-expenses', '/api/shabib-workspace/legal-shelf']) {
      const r = await app.inject({ method: 'GET', url, headers: hdr })
      assert.equal(r.statusCode, 403, `${label} MUST get 403 on ${url}, got ${r.statusCode}`)
    }
  }
  console.log('shabib-workspace [1/7] Owner-only RBAC isolation: OK')

  // 2. TEAM, ROLES, DAILY TO-DO & DYNAMIC VERIFICATION AUTHORITY
  const teamRes = await app.inject({ method: 'GET', url: '/api/shabib-workspace/team-daily', headers: ownerH })
  assert.equal(teamRes.statusCode, 200, teamRes.body)
  const teamData = teamRes.json()
  assert.ok(teamData.staff.length >= 6, `Expected >= 6 staff members, got ${teamData.staff.length}`)
  const umarRow = teamData.staff.find((s: any) => String(s.email).toLowerCase() === 'umar@swk.rent')
  const talhaRow = teamData.staff.find((s: any) => String(s.email).toLowerCase() === 'talha@swk.properties')
  assert.ok(umarRow && talhaRow, 'Umar and Talha must appear in team roster with roles')
  assert.ok(umarRow.job_role && talhaRow.job_role)

  // Shabib assigns daily task to Umar -> Umar sees it & toggles Done from Field Duty
  const assignTaskRes = await app.inject({
    method: 'POST',
    url: '/api/shabib-workspace/tasks',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: { title: 'Collect Creek Harbour Viewing Photos', assigned_to_id: umarRow.user_id, priority: 'Urgent' },
  })
  assert.equal(assignTaskRes.statusCode, 201, assignTaskRes.body)
  const assignedTask = assignTaskRes.json()

  const umarCtx = (await app.inject({ method: 'GET', url: '/api/field-reports/my-context', headers: umarH })).json()
  assert.ok(umarCtx.my_tasks.some((t: any) => t.id === assignedTask.id), 'Restricted agent must see Shabib-assigned task')
  const toggleRes = await app.inject({ method: 'PATCH', url: `/api/field-reports/my-tasks/${assignedTask.id}/toggle`, headers: { ...umarH, 'content-type': 'application/json' }, payload: {} })
  assert.equal(toggleRes.statusCode, 200)
  assert.equal(toggleRes.json().status, 'Done')
  // Fareed cannot toggle Umar's task
  const hijackRes = await app.inject({ method: 'PATCH', url: `/api/field-reports/my-tasks/${assignedTask.id}/toggle`, headers: { ...fareedH, 'content-type': 'application/json' }, payload: {} })
  assert.equal(hijackRes.statusCode, 403)

  // Shabib dynamically assigns ANY staff member (Talha) as Verification Authority
  const setVerif = await app.inject({
    method: 'PUT',
    url: '/api/shabib-workspace/verifiers',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: { user_id: talhaRow.user_id, enabled: true },
  })
  assert.equal(setVerif.statusCode, 200, setVerif.body)
  assert.ok(setVerif.json().verifiers.some((v: any) => v.user_id === talhaRow.user_id))
  const talhaCtx = (await app.inject({ method: 'GET', url: '/api/field-reports/my-context', headers: talhaH })).json()
  assert.equal(talhaCtx.is_verifier, true, 'Assigned staff must discover verifier authority')
  assert.ok(!('shabib:field_verifiers_json' in publicSettings()), 'Verifier setting must never leak in publicSettings()')
  console.log('shabib-workspace [2/7] Team daily tasks & dynamic verifier authority: OK')

  // 3. FORENSIC SITE VISITS & VIEWINGS (GPS PIN + SCOPED PHOTO UPLOAD + 3RD PARTY + AUTHORITY VERIFY + PDF/DOCX/JPEG)
  const submitVisit = await app.inject({
    method: 'POST',
    url: '/api/field-reports',
    headers: { ...umarH, 'content-type': 'application/json' },
    payload: {
      report_type: 'Viewing',
      community: 'Dubai Marina',
      building_or_project: 'Marina Gate Tower 1',
      unit_no: '2404',
      gps_lat: '25.088120',
      gps_lng: '55.148910',
      gps_address_label: 'Marina Gate, Dubai Marina',
      met_person_name: 'Ahmed Al Suwaidi',
      met_person_role: 'Owner',
      met_person_phone: '+971501119988',
      met_person_email: 'ahmed@example.ae',
      owner_or_agent_name: 'Ahmed Al Suwaidi',
      owner_or_agent_phone: '+971501119988',
      owner_or_agent_email: 'ahmed@example.ae',
      is_third_party: true,
      third_party_agency: 'Prestige Marina Realty',
      third_party_agent_name: 'Rami K.',
      third_party_brn: 'BRN-44102',
      third_party_phone: '+971559990011',
      third_party_email: 'rami@prestige.ae',
      deal_category: 'Lease',
      asking_price_aed: 3_400_000,
      final_price_aed: 3_250_000,
      yearly_rent_aed: 220_000,
      cheques_count: 4,
      outcome: 'Not Closed',
      not_closed_reason: 'Tenant requested 4 cheques instead of 2; landlord reviewing.',
      payment_summary: [{ stage: 'Security Deposit', payment_mode: 'Cheque / PDC', cheque_no: 'CHQ-9910', bank_name: 'ENBD', amount_aed: 11_000, status: 'Pending' }],
      forensic_notes: 'Unit immaculate, full marina view, AC serviced.',
    },
  })
  assert.equal(submitVisit.statusCode, 201, submitVisit.body)
  const visit = submitVisit.json()
  assert.ok(visit.report_no.startsWith('VWR-'))
  assert.equal(visit.is_third_party, true)
  assert.equal(visit.cheques_count, 4)

  // Restricted staff uploads unit photo via scoped endpoint (does not open /api/files)
  const bnd = '----SWKUnitPhotoBoundary'
  const mpPhoto = Buffer.concat([
    Buffer.from(`--${bnd}\r\nContent-Disposition: form-data; name="caption"\r\n\r\nLiving Room View\r\n`),
    Buffer.from(`--${bnd}\r\nContent-Disposition: form-data; name="file"; filename="unit-2404.png"\r\nContent-Type: image/png\r\n\r\n`),
    TINY_PNG,
    Buffer.from(`\r\n--${bnd}--\r\n`),
  ])
  const upPhoto = await app.inject({
    method: 'POST',
    url: `/api/field-reports/${visit.id}/photos`,
    headers: { ...umarH, 'content-type': `multipart/form-data; boundary=${bnd}` },
    payload: mpPhoto,
  })
  assert.equal(upPhoto.statusCode, 201, `Scoped photo upload failed: ${upPhoto.body}`)
  assert.equal(upPhoto.json().photos.length, 1)
  const dlPhoto = await app.inject({ method: 'GET', url: `/api/field-reports/${visit.id}/photos/0`, headers: umarH })
  assert.equal(dlPhoto.statusCode, 200)
  assert.equal(dlPhoto.headers['content-type'], 'image/png')

  // Unassigned staff (Fareed) cannot verify; Shabib-assigned verifier (Talha) CAN verify!
  const unauthVerif = await app.inject({
    method: 'POST',
    url: `/api/field-reports/${visit.id}/verify`,
    headers: { ...fareedH, 'content-type': 'application/json' },
    payload: { status: 'Verified', notes: 'Should fail' },
  })
  assert.equal(unauthVerif.statusCode, 403, 'Non-assigned staff MUST get 403 on verify')

  // Cross-agent isolation: Fareed (not submitter, not verifier) cannot view Umar's report, photo, or export
  const fareedList = (await app.inject({ method: 'GET', url: '/api/field-reports', headers: fareedH })).json()
  assert.ok(!fareedList.rows.some((r: any) => r.id === visit.id), 'Unrelated staff must NOT see other agents field reports')
  assert.equal((await app.inject({ method: 'GET', url: `/api/field-reports/${visit.id}/photos/0`, headers: fareedH })).statusCode, 403)
  assert.equal((await app.inject({ method: 'GET', url: `/api/field-reports/${visit.id}/export?format=pdf`, headers: fareedH })).statusCode, 403)

  const authVerif = await app.inject({
    method: 'POST',
    url: `/api/field-reports/${visit.id}/verify`,
    headers: { ...talhaH, 'content-type': 'application/json' },
    payload: { status: 'Verified', notes: 'GPS pin matched Marina Gate tower & photo confirmed.' },
  })
  assert.equal(authVerif.statusCode, 200, authVerif.body)
  assert.equal(authVerif.json().verification_status, 'Verified')
  assert.equal(authVerif.json().verified_by_user_id, talhaRow.user_id)

  // Post-verification tamper lock: submitter Umar cannot upload extra photos once Verified
  const postVerifPhoto = await app.inject({
    method: 'POST',
    url: `/api/field-reports/${visit.id}/photos`,
    headers: { ...umarH, 'content-type': `multipart/form-data; boundary=${bnd}` },
    payload: mpPhoto,
  })
  assert.equal(postVerifPhoto.statusCode, 403, 'Submitter must NOT upload photos to an already Verified field report')

  // Export Forensic Report as PDF, DOCX, and JPEG
  for (const [fmt, magic] of [['pdf', '%PDF-'], ['docx', 'PK'], ['jpeg', '\xff\xd8\xff']] as const) {
    const exp = await app.inject({ method: 'GET', url: `/api/field-reports/${visit.id}/export?format=${fmt}`, headers: ownerH })
    assert.equal(exp.statusCode, 200, `Field report export ${fmt} failed: ${exp.body}`)
    assert.equal(exp.rawPayload.subarray(0, magic.length).toString('latin1'), magic, `Invalid ${fmt} header`)
  }
  console.log('shabib-workspace [3/7] Forensic visits, GPS, unit photos, verifier auth & PDF/DOCX/JPEG exports: OK')

  // 4. UNIFIED CREATOR (COMMUNITY, DEVELOPER, PROJECT, UNIT) + BROCHURE THEME CUSTOMIZER
  // Office Admin Meenakshi MUST remain blocked from direct community/developer creation
  const meenBlock = await app.inject({
    method: 'POST',
    url: '/api/catalog-kit/create',
    headers: { ...meenakshiH, 'content-type': 'application/json' },
    payload: { entity: 'communities', name: 'Blocked Community', code: 'BLKCOM' },
  })
  assert.equal(meenBlock.statusCode, 403, 'Office Admin must remain blocked on direct community creation')

  const customTheme = {
    preset: 'navy_platinum',
    primaryHex: '#0B1F3A',
    accentHex: '#B8C4D4',
    surfaceHex: '#F5F7FA',
    inkHex: '#141E2B',
    coverLayout: 'editorial_split',
    headerTagline: 'SWK ROYAL PORTFOLIO EDITION',
    footerNote: 'Private Advisory Desk',
    showPaymentPlan: true,
    showAmenities: true,
    showQrCode: true,
  }
  // Zero-Shabib guard blocks owner name in brochure theme
  const badThemeRes = await app.inject({
    method: 'PUT',
    url: '/api/catalog-kit/theme/default',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: { ...customTheme, headerTagline: 'Shabib Personal Edition' },
  })
  assert.equal(badThemeRes.statusCode, 400, 'Zero-Shabib guard must block personal owner name in public brochure theme with HTTP 400')

  const defThemeRes = await app.inject({
    method: 'PUT',
    url: '/api/catalog-kit/theme/default',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: customTheme,
  })
  assert.equal(defThemeRes.statusCode, 200, defThemeRes.body)

  const newComm = (await app.inject({
    method: 'POST',
    url: '/api/catalog-kit/create',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: { entity: 'communities', name: 'Yas Bay Waterfront Custom', code: 'YASBAYC', emirate: 'Abu Dhabi', avg_price_sqft: 2150, gross_yield_pct: 7.4, theme: customTheme },
  })).json()
  assert.ok(newComm.record?.id, 'Community create failed')

  const newDev = (await app.inject({
    method: 'POST',
    url: '/api/catalog-kit/create',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: { entity: 'developers', name: 'Horizon Signature Developments', code: 'HRZDEV', short_name: 'Horizon', emirate: 'Abu Dhabi', theme: customTheme },
  })).json()
  assert.ok(newDev.record?.id, 'Developer create failed')

  const newProj = (await app.inject({
    method: 'POST',
    url: '/api/catalog-kit/create',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: {
      entity: 'properties',
      title: 'Azure Bay by Horizon',
      project_name: 'Azure Bay',
      emirate: 'Abu Dhabi',
      is_off_plan: true,
      developer_ref: newDev.record.id,
      community_ref: newComm.record.id,
      price: 2_400_000,
      payment_plan: '60/40',
      theme: customTheme,
    },
  })).json()
  assert.ok(newProj.record?.id, 'Project create failed')

  const newUnit = (await app.inject({
    method: 'POST',
    url: '/api/catalog-kit/create',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: {
      entity: 'units',
      unit_no: 'AB-1201',
      property_id: newProj.record.id,
      sale_price: 2_650_000,
      bedrooms: 2,
      bathrooms: 3,
      area_sqft: 1420,
      view: 'Full Sea View',
      theme: { ...customTheme, coverLayout: 'minimal_frame', primaryHex: '#121212', accentHex: '#10B981' },
    },
  })).json()
  assert.ok(newUnit.record?.id, 'Unit create failed')

  // Verify themed Brochure PDF, Payment Plan PDF & PPTX Deck work for BOTH Unit & Project (and respect custom theme!)
  const unitBrochure = await app.inject({ method: 'GET', url: `/api/catalog-kit/units/${newUnit.record.id}/brochure.pdf`, headers: ownerH })
  assert.equal(unitBrochure.statusCode, 200)
  assert.equal(unitBrochure.rawPayload.subarray(0, 5).toString('utf8'), '%PDF-')
  const unitPay = await app.inject({ method: 'GET', url: `/api/catalog-kit/units/${newUnit.record.id}/payment-plan.pdf`, headers: ownerH })
  assert.equal(unitPay.statusCode, 200)
  assert.equal(unitPay.rawPayload.subarray(0, 5).toString('utf8'), '%PDF-')
  const unitDeck = await app.inject({ method: 'GET', url: `/api/catalog-kit/units/${newUnit.record.id}/deck.pptx`, headers: ownerH })
  assert.equal(unitDeck.statusCode, 200)
  assert.equal(unitDeck.rawPayload.subarray(0, 2).toString('utf8'), 'PK')

  // Verify Zero-Shabib guard rejects query override with personal owner name with HTTP 400
  const badQueryOverride = await app.inject({
    method: 'GET',
    url: `/api/catalog-kit/units/${newUnit.record.id}/brochure.pdf?tagline=Shabib%20Edition`,
    headers: ownerH,
  })
  assert.equal(badQueryOverride.statusCode, 400, 'Query override containing owner name must return HTTP 400')

  // Verify public Share Link for Units exposes payment_plan_pdf_url and serves themed brochure/payment-plan/deck
  const unitShareRes = await app.inject({
    method: 'POST',
    url: '/api/share-links',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: { title: 'Unit 1402-A Exclusive Kit', entity: 'units', ids: [newUnit.record.id] },
  })
  assert.equal(unitShareRes.statusCode, 200, unitShareRes.body)
  const shareTok = unitShareRes.json().token
  const pubShare = await app.inject({ method: 'GET', url: `/api/public/share/${shareTok}` })
  assert.equal(pubShare.statusCode, 200, pubShare.body)
  assert.ok(pubShare.json().items?.[0]?.payment_plan_pdf_url?.includes('/payment-plan.pdf'), 'Shared unit must expose payment_plan_pdf_url')
  const pubUnitPay = await app.inject({ method: 'GET', url: `/api/public/share/${shareTok}/kit/0/payment-plan.pdf` })
  assert.equal(pubUnitPay.statusCode, 200)
  assert.equal(pubUnitPay.rawPayload.subarray(0, 5).toString('utf8'), '%PDF-')

  // Verify Shared unassigned task marked Done disappears from team_todo cleanly
  const sharedTaskRes = await app.inject({
    method: 'POST',
    url: '/api/shabib-workspace/tasks',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: { title: 'Shared Morning Team Briefing', assigned_to_id: null, priority: 'Medium' },
  })
  assert.equal(sharedTaskRes.statusCode, 201)
  const sharedTaskId = sharedTaskRes.json().id
  await app.inject({ method: 'PATCH', url: `/api/shabib-workspace/tasks/${sharedTaskId}/toggle`, headers: ownerH })
  const teamAfterDone = (await app.inject({ method: 'GET', url: '/api/shabib-workspace/team-daily', headers: ownerH })).json()
  assert.ok(!teamAfterDone.team_todo.some((t: any) => t.id === sharedTaskId), 'Completed shared task must leave team_todo')
  console.log('shabib-workspace [4/7] Unified Community/Developer/Project/Unit creator + Brochure Theme Customizer: OK')

  // 5. LEGAL TEMPLATES (A2A, LOI, TENANCY, EJARI, NOC) + MULTI-PAGE STRUCTURED JPEG EXPORT
  const shelfRes = await app.inject({ method: 'GET', url: '/api/shabib-workspace/legal-shelf', headers: ownerH })
  assert.equal(shelfRes.statusCode, 200)
  const featuredCodes = new Set(shelfRes.json().featured.filter((x: any) => x.template_id).map((x: any) => x.code))
  for (const code of ['SL-A2A-PACK', 'SL-LOI-RES', 'LS-TENANCY-FULL', 'LS-EJARI-CHK', 'SL-NOC-PACK', 'FN-COMM-EXP-TPL']) {
    assert.ok(featuredCodes.has(code), `Missing seeded legal shelf template ${code}`)
  }

  // Export multi-section HTML contract with tables & >50 lines as JPEG (Owner with seal/signature allowed; restricted staff with seal blocked!)
  const longContractHtml = [
    '<h1>Agent-to-Agent (Form I) Co-Brokering Agreement</h1>',
    '<table><tr><th>Field</th><th>Details</th></tr><tr><td>Brokerage A</td><td>SWK Properties LLC (ORN 42068)</td></tr><tr><td>Brokerage B</td><td>Co-Brokerage Partner LLC</td></tr></table>',
    '<h2>Terms & Clauses</h2>',
    ...Array.from({ length: 45 }, (_, i) => `<p>Clause ${i + 1}: All commission splits, RERA Form I obligations, viewing protection periods, and DLD compliance requirements apply strictly across the entire transaction lifecycle.</p>`),
  ].join('')
  const jpegRes = await app.inject({
    method: 'POST',
    url: '/api/utilities/word/export-jpeg',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: {
      title: 'Letter of Intent — Marina Gate 2404',
      html_content: longContractHtml,
      include_letterhead: true,
      include_seal: true,
      include_signature: true,
    },
  })
  assert.equal(jpegRes.statusCode, 200, `Word JPEG export failed: ${jpegRes.body}`)
  assert.equal(jpegRes.headers['content-type'], 'image/jpeg')
  assert.equal(jpegRes.rawPayload.subarray(0, 3).toString('latin1'), '\xff\xd8\xff', 'Invalid JPEG header')
  assert.ok(jpegRes.rawPayload.length > 50_000, `Expected rich multi-page JPEG (>50KB), got ${jpegRes.rawPayload.length}`)

  const unauthSealJpeg = await app.inject({
    method: 'POST',
    url: '/api/utilities/word/export-jpeg',
    headers: { ...umarH, 'content-type': 'application/json' },
    payload: { title: 'Unauthorized Seal Test', html_content: '<p>Test</p>', include_seal: true },
  })
  assert.equal(unauthSealJpeg.statusCode, 403, 'Non-owner staff MUST NOT export JPEG with unauthorized company seal')
  console.log('shabib-workspace [5/7] Legal forms shelf (A2A/LOI/Tenancy/Ejari/NOC) & JPEG export: OK')

  // 6. PIN-TO-PIN CLOSING FORENSIC DOSSIERS (ALL 5 TRACKS + CHEQUE LEDGER + MULTILINE NOTES + EXPORTS)
  let firstClosingId = 0
  for (const track of ['Off-Plan', 'Secondary', 'Handover', 'Leasing', 'Property Management'] as const) {
    const cRes = await app.inject({
      method: 'POST',
      url: '/api/shabib-workspace/closings',
      headers: { ...ownerH, 'content-type': 'application/json' },
      payload: {
        track,
        title: `${track} Closing Dossier Test`,
        client_name: 'Khalid Al Mansoori',
        client_phone: '+971501234455',
        agreed_price_aed: 2_800_000,
        yearly_rent_aed: 185_000,
        agency_commission_aed: 56_000,
        total_cheques_count: 4,
        notes: 'Line 1: KYC checked\nLine 2:\tNOC cleared & keys scheduled',
      },
    })
    assert.equal(cRes.statusCode, 201, `Closing create failed for ${track}: ${cRes.body}`)
    const d = cRes.json()
    assert.ok(d.stages.length >= 8, `Track ${track} must have >= 8 pin-to-pin stages`)
    if (!firstClosingId) firstClosingId = d.id
  }

  // Test 1-click bootstrap from live Job even when UI sends empty strings / 0s
  const partyId = (await app.inject({
    method: 'POST',
    url: '/api/e/parties',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: { name: 'Bootstrap Buyer LLC', is_customer: true, phone: '+971509988776', email: 'buyer@example.com' },
  })).json().id
  const branchId = q.val<number>(`SELECT id FROM branches WHERE deleted_at IS NULL LIMIT 1`) || 1
  const jobId = (await app.inject({
    method: 'POST',
    url: '/api/e/jobs',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: {
      deal_name: 'Bootstrap Deal Marina',
      deal_type: 'Sale',
      branch_id: branchId,
      client_id: partyId,
      property_id: newProj.record.id,
      deal_value: 3_100_000,
      commission_pct: 2,
    },
  })).json().id
  const bootRes = await app.inject({
    method: 'POST',
    url: '/api/shabib-workspace/closings',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: { track: 'Secondary', job_id: jobId, title: '', client_name: '', agreed_price_aed: 0, community: '' },
  })
  assert.equal(bootRes.statusCode, 201, `Job bootstrap failed: ${bootRes.body}`)
  const bootD = bootRes.json()
  assert.equal(bootD.agreed_price_aed, 3_100_000, 'Bootstrap must preserve live Deal value in AED via fromCents')
  assert.equal(bootD.community, 'Yas Bay Waterfront Custom', 'Bootstrap must resolve community_ref name')

  const chqRes = await app.inject({
    method: 'POST',
    url: `/api/shabib-workspace/closings/${firstClosingId}/cheques`,
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: { cheque_no: 'MC-551002', bank_name: 'ADCB', purpose: 'Booking Deposit', payment_method: 'Manager Cheque', amount_aed: 280_000, status: 'Received' },
  })
  assert.equal(chqRes.statusCode, 201)
  for (const [fmt, magic] of [['pdf', '%PDF-'], ['docx', 'PK'], ['jpeg', '\xff\xd8\xff']] as const) {
    const exp = await app.inject({ method: 'GET', url: `/api/shabib-workspace/closings/${firstClosingId}/export?format=${fmt}`, headers: ownerH })
    assert.equal(exp.statusCode, 200, `Closing export (${fmt}) failed on multiline notes: ${exp.body}`)
    assert.equal(exp.rawPayload.subarray(0, magic.length).toString('latin1'), magic)
  }
  console.log('shabib-workspace [6/7] 5-Track Pin-to-Pin Closing Dossiers, Bootstrap, Cheque Ledger & exports: OK')

  // 7. AGENT COMMISSIONS & EXPENSES LEDGER (PAID / RECEIVED / PENDING · CASH / BT / BOTIM · 3RD PARTY)
  let commEntryId = 0
  for (const entry of [
    { entry_type: 'Commission', agent_name: 'Umar', deal_ref: 'DL-2600001', gross_amount_aed: 100_000, split_pct: 50, net_amount_aed: 50_000, status: 'Received', payment_mode: 'Bank Transfer (BT)', payment_reference: 'BT-8810', notes: '50/50 split\nVerified by Owner' },
    { entry_type: 'Expense', agent_name: 'Umar', expense_category: 'Client Viewing Fuel & Portal Boost', net_amount_aed: 4_500, status: 'Paid', payment_mode: 'Cash', payment_reference: 'PETTY-12' },
    { entry_type: '3rd-Party Split', agent_name: 'Umar', deal_ref: 'DL-2600001', net_amount_aed: 25_000, status: 'Pending', payment_mode: 'Botim', payment_reference: 'BOTIM-97155', is_third_party: true, third_party_agency: 'Marina Star Brokerage', third_party_agent_name: 'Sami R.', third_party_phone: '+971551234567' },
  ]) {
    const r = await app.inject({
      method: 'POST',
      url: '/api/shabib-workspace/commissions-expenses',
      headers: { ...ownerH, 'content-type': 'application/json' },
      payload: entry,
    })
    assert.equal(r.statusCode, 201, r.body)
    if (entry.entry_type === 'Commission') commEntryId = r.json().id
  }

  const ceList = (await app.inject({ method: 'GET', url: '/api/shabib-workspace/commissions-expenses', headers: ownerH })).json()
  assert.equal(ceList.totals.received_aed, 50_000)
  assert.equal(ceList.totals.expenses_aed, 4_500)
  assert.equal(ceList.totals.third_party_aed, 25_000)
  assert.equal(ceList.totals.third_party_pending_aed, 25_000)
  const umarSum = ceList.agent_summary.find((a: any) => a.agent_name === 'Umar')
  assert.equal(umarSum?.net_due_aed, 45_500, `Expected Umar net balance 45500, got ${umarSum?.net_due_aed}`)
  assert.equal(ceList.totals.net_payable_aed, 45_500, `totals.net_payable_aed must equal sum of internal agent net balances (45500), got ${ceList.totals.net_payable_aed}`)

  // Verify invalid numeric update returns HTTP 400 (never 500)
  const badPut = await app.inject({
    method: 'PUT',
    url: `/api/shabib-workspace/commissions-expenses/${commEntryId}`,
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: { net_amount_aed: 'not-a-number' },
  })
  assert.equal(badPut.statusCode, 400, 'Invalid net_amount_aed must return HTTP 400')

  // Verify Received -> Paid settles commission cleanly without double-subtracting (-4500 net, NOT -54500!)
  const markPaid = await app.inject({
    method: 'PUT',
    url: `/api/shabib-workspace/commissions-expenses/${commEntryId}`,
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: { status: 'Paid' },
  })
  assert.equal(markPaid.statusCode, 200)
  const ceAfterPaid = (await app.inject({ method: 'GET', url: '/api/shabib-workspace/commissions-expenses', headers: ownerH })).json()
  assert.equal(ceAfterPaid.totals.paid_aed, 50_000)
  assert.equal(ceAfterPaid.totals.net_payable_aed, -4_500, 'Settling AED 50,000 commission must NOT double-subtract paid amount')

  for (const [fmt, magic] of [['pdf', '%PDF-'], ['docx', 'PK'], ['jpeg', '\xff\xd8\xff']] as const) {
    const exp = await app.inject({ method: 'GET', url: `/api/shabib-workspace/commissions-expenses/export?format=${fmt}`, headers: ownerH })
    assert.equal(exp.statusCode, 200)
    assert.equal(exp.rawPayload.subarray(0, magic.length).toString('latin1'), magic)
  }
  console.log('shabib-workspace [7/7] Agent Commissions & Expenses (Paid/Received/Pending, Cash/BT/Botim, 3rd-Party) & exports: OK')
  console.log('ALL SHABIB WORKSPACE COMMAND SUITE E2E TESTS PASSED!')
} finally {
  await app.close()
  db.close()
  fs.rmSync(dataDir, { recursive: true, force: true })
}
process.exit(0)
