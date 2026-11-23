import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Set isolated temp DATA_DIR BEFORE importing any server modules
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swk-rbac-'))
process.env.DATA_DIR = tmpDir
process.env.DATABASE_URL = ''
process.env.APP_SECRET = 'test-rbac-app-secret-0123456789abcdef'

async function run() {
  const { mainDb, q } = await import('../src/server/db')
  const { syncSchema } = await import('../src/server/schema')
  const { seedReference } = await import('../src/server/seed')
  const authMod = await import('../src/server/auth')
  const staffAccess = await import('../src/shared/swk-staff-access')
  const policyMod = await import('../src/server/ai/policy')
  const notifyMod = await import('../src/server/notify')
  const { createRecord, getDef, SYSTEM_CTX } = await import('../src/server/engine')
  const { buildApp } = await import('../src/server/app')

  let app: Awaited<ReturnType<typeof buildApp>> | null = null

  try {
    syncSchema()
    await seedReference()

    const {
      loadUser,
      hashPassword,
      signRoleGrant,
      verifyRoleGrant,
    } = authMod as typeof authMod & {
      signRoleGrant: (userId: number, email: string, roleName: 'HR' | 'Office Admin' | 'Staff (Attendance & General)') => string
      verifyRoleGrant: (userId: number, email: string, roleName: string, sig: string | null | undefined) => boolean
    }
    const {
      RESTRICTED_STAFF_PERMISSIONS,
      HR_ROLE_PERMISSIONS,
      canViewEmployeeRecords,
      canAccessCrmVault,
      canPrintReceptionQr,
      canAccessFieldLiveMap,
      isElevatedCanonicalEmail,
      isOwnerSwkUser,
      isAdminSwkUser,
      NON_ELEVATED_ASSIGNABLE_ROLES,
      CANONICAL_ELEVATED_EMAILS,
    } = staffAccess as typeof staffAccess & {
      canAccessFieldLiveMap: (u: any) => boolean
      isElevatedCanonicalEmail: (e: string | null | undefined) => boolean
      NON_ELEVATED_ASSIGNABLE_ROLES: readonly string[]
      CANONICAL_ELEVATED_EMAILS: ReadonlySet<string>
    }
    const { isToolAllowedForUser } = policyMod as typeof policyMod & {
      isToolAllowedForUser: (user: any, toolName: string) => boolean
    }

    assert.equal(typeof signRoleGrant, 'function', 'signRoleGrant must be exported from src/server/auth.ts')
    assert.equal(typeof verifyRoleGrant, 'function', 'verifyRoleGrant must be exported from src/server/auth.ts')
    assert.equal(typeof canAccessFieldLiveMap, 'function', 'canAccessFieldLiveMap must be exported from src/shared/swk-staff-access.ts')
    assert.equal(typeof isElevatedCanonicalEmail, 'function', 'isElevatedCanonicalEmail must be exported from src/shared/swk-staff-access.ts')
    assert.equal(typeof isToolAllowedForUser, 'function', 'isToolAllowedForUser must be exported from src/server/ai/policy.ts')
    assert.deepEqual([...NON_ELEVATED_ASSIGNABLE_ROLES], ['HR', 'Office Admin', 'Staff (Attendance & General)'])
    assert.deepEqual([...CANONICAL_ELEVATED_EMAILS].sort(), ['admin@swk.properties', 'haseeb@swk.properties', 'shabib@swk.properties'])

    const staffRoleId = q.val<number>(`SELECT id FROM roles WHERE name = 'Staff (Attendance & General)'`)!
    const adminRoleId = q.val<number>(`SELECT id FROM roles WHERE name = 'Admin'`)!
    const hrRoleId = q.val<number>(`SELECT id FROM roles WHERE name = 'HR'`)!
    const pmRoleId = q.val<number>(`SELECT id FROM roles WHERE name = 'Property Mgmt'`)!
    const dxbBranchId = q.val<number>(`SELECT id FROM branches WHERE code = 'DXB'`)!
    assert.ok(staffRoleId && adminRoleId && hrRoleId && pmRoleId && dxbBranchId)

    const now = new Date().toISOString()

    // -------------------------------------------------------------------------
    // 1. Direct SQL UPDATE role_id = Admin on newly inserted staff #15 -> clamped + security_tamper
    // -------------------------------------------------------------------------
    const staff15Id = q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      'New Agent 15',
      'newagent15@swk.rent',
      hashPassword('Agent15-Pass-2026!'),
      staffRoleId,
      dxbBranchId,
      1,
      0,
      now,
      now,
    )
    q.run(`UPDATE users SET role_id = ? WHERE id = ?`, adminRoleId, staff15Id)

    const loaded15 = loadUser(staff15Id)
    assert.ok(loaded15, 'staff #15 should load')
    assert.equal(loaded15.role_name, 'Staff (Attendance & General)', 'Tampered Admin SQL update must be clamped to Staff (Attendance & General)')
    assert.deepEqual(loaded15.permissions, RESTRICTED_STAFF_PERMISSIONS, 'Tampered Admin SQL update must resolve RESTRICTED_STAFF_PERMISSIONS')
    const tamperRows15 = q.all<any>(
      `SELECT * FROM audit_log WHERE action = 'security_tamper' AND entity = 'users' AND record_id = ?`,
      staff15Id,
    )
    assert.ok(tamperRows15.length >= 1, 'security_tamper audit_log row must be recorded when role_id is tampered to Admin')

    // -------------------------------------------------------------------------
    // 2. Direct SQL UPDATE role_id = HR without valid role_grant_sig -> downgraded
    // -------------------------------------------------------------------------
    q.run(`UPDATE users SET role_id = ?, role_grant_sig = NULL WHERE id = ?`, hrRoleId, staff15Id)
    const loaded15Hr = loadUser(staff15Id)
    assert.ok(loaded15Hr)
    assert.equal(loaded15Hr.role_name, 'Staff (Attendance & General)', 'Unsigned HR role_id update must be downgraded to Staff (Attendance & General)')
    assert.deepEqual(loaded15Hr.permissions, RESTRICTED_STAFF_PERMISSIONS)

    // Forged signature must also fail verification and downgrade
    q.run(`UPDATE users SET role_grant_sig = ? WHERE id = ?`, 'forged-signature-hex', staff15Id)
    const loaded15Forged = loadUser(staff15Id)
    assert.equal(loaded15Forged?.role_name, 'Staff (Attendance & General)')
    assert.equal(verifyRoleGrant(staff15Id, 'newagent15@swk.rent', 'Admin', signRoleGrant(staff15Id, 'newagent15@swk.rent', 'HR')), false)

    // Restore staff #15 cleanly back to Staff role
    q.run(`UPDATE users SET role_id = ?, role_grant_sig = NULL WHERE id = ?`, staffRoleId, staff15Id)

    // -------------------------------------------------------------------------
    // 3. Valid HMAC-signed HR grant for staff #16 -> resolves HR_ROLE_PERMISSIONS
    // -------------------------------------------------------------------------
    const staff16Id = q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      'HR Staff 16',
      'hr16@swk.properties',
      hashPassword('Hr16-Pass-2026!'),
      hrRoleId,
      dxbBranchId,
      1,
      0,
      now,
      now,
    )
    const hrSig = signRoleGrant(staff16Id, 'hr16@swk.properties', 'HR')
    assert.equal(verifyRoleGrant(staff16Id, 'hr16@swk.properties', 'HR', hrSig), true)
    q.run(`UPDATE users SET role_grant_sig = ?, role_granted_by = 1 WHERE id = ?`, hrSig, staff16Id)

    const loaded16 = loadUser(staff16Id)
    assert.ok(loaded16)
    assert.equal(loaded16.role_name, 'HR')
    assert.deepEqual(loaded16.permissions, HR_ROLE_PERMISSIONS)
    assert.equal(canViewEmployeeRecords(loaded16), true, 'HR can view employee records')
    assert.equal(canAccessCrmVault(loaded16), false, 'HR cannot access CRM Vault')
    assert.equal(canAccessFieldLiveMap(loaded16), false, 'HR cannot access Field Live Map')
    assert.equal(canPrintReceptionQr(loaded16), false, 'HR cannot print Reception QR')

    // Non-SWK fixture role (e.g. Property Mgmt) preserved, while non-SWK tampered to Admin is blocked
    const pmFixtureId = q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      'PM Fixture',
      'pm@a.example',
      hashPassword('Pm-Pass-2026!'),
      pmRoleId,
      dxbBranchId,
      1,
      0,
      now,
      now,
    )
    assert.equal(loadUser(pmFixtureId)?.role_name, 'Property Mgmt', 'Non-SWK non-elevated fixture roles remain preserved')
    q.run(`UPDATE users SET role_id = ? WHERE id = ?`, adminRoleId, pmFixtureId)
    assert.equal(loadUser(pmFixtureId)?.role_name, 'Staff (Attendance & General)', 'Non-SWK fixture tampered to Admin must be downgraded')

    // Canonical elevated emails keep full access and Field Live Map access
    const shabibRow = q.get<{ id: number }>(`SELECT id FROM users WHERE lower(email) = 'shabib@swk.properties'`)!
    const shabibUser = loadUser(shabibRow.id)!
    assert.equal(canAccessFieldLiveMap(shabibUser), true)
    assert.equal(canAccessCrmVault(shabibUser), true)

    // -------------------------------------------------------------------------
    // 4. Role-scoped AI tool allowlist assertions
    // -------------------------------------------------------------------------
    const fieldAgent = loadUser(staff15Id)!
    assert.equal(isToolAllowedForUser(fieldAgent, 'overdue_invoices'), false)
    assert.equal(isToolAllowedForUser(fieldAgent, 'business_snapshot'), false)
    assert.equal(isToolAllowedForUser(fieldAgent, 'expiring_documents'), false)
    assert.equal(isToolAllowedForUser(fieldAgent, 'lookup_listings'), true)
    assert.equal(isToolAllowedForUser(fieldAgent, 'my_assigned_deals_masked'), true)
    assert.equal(isToolAllowedForUser(fieldAgent, 'market_pulse_lookup'), true)
    assert.equal(isToolAllowedForUser(fieldAgent, 'my_attendance_status'), true)
    assert.equal(isToolAllowedForUser(fieldAgent, 'my_daily_report_status'), true)
    assert.equal(isToolAllowedForUser(shabibUser, 'business_snapshot'), true)
    assert.equal(isToolAllowedForUser(loaded16, 'overdue_invoices'), false)
    assert.equal(isToolAllowedForUser(loaded16, 'expiring_documents'), true)

    // -------------------------------------------------------------------------
    // 5. HTTP checks via buildApp().inject()
    // -------------------------------------------------------------------------
    createRecord(
      getDef('employees'),
      {
        emp_no: 'EMP-9015',
        name: 'Confidential Target Employee',
        email: 'target-emp@swk.properties',
        status: 'Active',
        join_date: '2026-01-01',
      },
      SYSTEM_CTX,
    )

    app = await buildApp()
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web' },
      payload: { email: 'newagent15@swk.rent', password: 'Agent15-Pass-2026!' },
    })
    assert.equal(loginRes.statusCode, 200, `Field agent login failed: ${loginRes.body}`)
    const agentCookie = 'swk_sid=' + loginRes.cookies.find((c: any) => c.name === 'swk_sid')!.value

    const briefRes = await app.inject({
      method: 'GET',
      url: '/api/ai/brief',
      headers: { cookie: agentCookie },
    })
    assert.equal(briefRes.statusCode, 403, `Expected 403 on GET /api/ai/brief for field agent, got ${briefRes.statusCode}`)

    const hireRes = await app.inject({
      method: 'POST',
      url: '/api/ai/agents/hire',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agentCookie },
      payload: { template: 'jarvis' },
    })
    assert.equal(hireRes.statusCode, 403, `Expected 403 on POST /api/ai/agents/hire for field agent, got ${hireRes.statusCode}`)

    const searchRes = await app.inject({
      method: 'GET',
      url: '/api/search/global?q=Confidential',
      headers: { cookie: agentCookie },
    })
    assert.equal(searchRes.statusCode, 200)
    const searchHits = searchRes.json() as any[]
    assert.equal(
      searchHits.filter(h => h.entity === 'employees').length,
      0,
      `Expected 0 employee hits in /api/search/global for field agent, got ${JSON.stringify(searchHits)}`,
    )

    // Also verify Admin HTTP user provisioning signs HR and rejects Admin assignment
    const adminRow = q.get<{ id: number }>(`SELECT id FROM users WHERE lower(email) = 'admin@swk.properties'`)!
    const adminSession = authMod.createSession(adminRow.id)
    const adminCookie = 'swk_sid=' + adminSession.token

    const promoteRes = await app.inject({
      method: 'POST',
      url: '/api/e/users',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: adminCookie },
      payload: {
        name: 'Sneaky Escalation',
        email: 'sneaky17@swk.rent',
        password: 'Sneaky-Pass-2026!',
        role_id: adminRoleId,
        branch_id: dxbBranchId,
        active: true,
      },
    })
    assert.equal(promoteRes.statusCode, 400, `Expected 400 when assigning Admin to non-canonical email, got ${promoteRes.statusCode}: ${promoteRes.body}`)

    const createHrRes = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: adminCookie },
      payload: {
        name: 'Signed HR 18',
        email: 'hr18@swk.properties',
        password: 'Hr18-Pass-2026!',
        role_name: 'HR',
        branch_id: dxbBranchId,
      },
    })
    assert.ok(createHrRes.statusCode === 200 || createHrRes.statusCode === 201, `Expected 200/201 from POST /api/admin/users for HR, got ${createHrRes.statusCode}: ${createHrRes.body}`)
    const hr18Row = q.get<{ id: number; role_grant_sig: string | null }>(`SELECT id, role_grant_sig FROM users WHERE lower(email) = 'hr18@swk.properties'`)!
    assert.ok(hr18Row?.role_grant_sig, 'POST /api/admin/users must write role_grant_sig for HR')
    assert.equal(loadUser(hr18Row.id)?.role_name, 'HR')

    // -------------------------------------------------------------------------
    // 6. notifyLeadership() never notifies a tampered non-hardcoded user row
    // -------------------------------------------------------------------------
    const tamperedLeaderId = q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      'Tampered Notify Target',
      'tampered-notify@swk.rent',
      hashPassword('Tamper-Pass-2026!'),
      adminRoleId,
      dxbBranchId,
      1,
      0,
      now,
      now,
    )

    notifyMod.notifyLeadership('Security Drill', 'Leadership-only audit notice', '/admin/audit', 'audit', `drill-${Date.now()}`)

    const tamperedNotifs = q.all(`SELECT * FROM notifications WHERE user_id = ?`, tamperedLeaderId)
    assert.equal(tamperedNotifs.length, 0, 'notifyLeadership() must NEVER notify a tampered non-hardcoded user row with role_id=Admin')

    const shabibNotifs = q.all(`SELECT * FROM notifications WHERE user_id = ? AND title = 'Security Drill'`, shabibRow.id)
    assert.equal(shabibNotifs.length, 1, 'notifyLeadership() must still notify canonical Owner Shabib')

    // -------------------------------------------------------------------------
    // 7. Fix Round 1 [Critical #1]: Downgraded alias accounts must fail isOwnerSwkUser/isAdminSwkUser and get 403
    // -------------------------------------------------------------------------
    assert.equal(isOwnerSwkUser({ email: 'shabib@swk.property', role_name: 'Owner' }), false, 'Raw owner alias email must fail isOwnerSwkUser')
    assert.equal(isOwnerSwkUser({ email: 'shabib@swk.property', role_name: 'Staff (Attendance & General)' }), false, 'Downgraded owner alias must fail isOwnerSwkUser')
    assert.equal(isOwnerSwkUser({ email: 'shabib@swkpropertiesuae.com', role_name: 'Owner' }), false, 'Legacy owner alias must fail isOwnerSwkUser')
    assert.equal(isAdminSwkUser({ email: 'admin@swk.property', role_name: 'Admin' }), false, 'Raw admin alias email must fail isAdminSwkUser')
    assert.equal(isAdminSwkUser({ email: 'admin@swk.property', role_name: 'Staff (Attendance & General)' }), false, 'Downgraded admin alias must fail isAdminSwkUser')
    assert.equal(isAdminSwkUser({ email: 'admin@swkpropertiesuae.com', role_name: 'Admin' }), false, 'Legacy admin alias must fail isAdminSwkUser')
    assert.equal(isOwnerSwkUser(shabibUser), true, 'Canonical Owner must pass isOwnerSwkUser')
    const canonicalAdminLoaded = loadUser(adminRow.id)!
    assert.equal(isAdminSwkUser(canonicalAdminLoaded), true, 'Canonical Admin must pass isAdminSwkUser')

    const ownerRoleId = q.val<number>(`SELECT id FROM roles WHERE name = 'Owner'`)!
    const shabibAliasId = q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      'Shabib Alias',
      'shabib@swk.property',
      hashPassword('AliasOwner-2026!'),
      ownerRoleId,
      dxbBranchId,
      1,
      0,
      now,
      now,
    )
    const adminAliasId = q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      'Admin Alias',
      'admin@swk.property',
      hashPassword('AliasAdmin-2026!'),
      adminRoleId,
      dxbBranchId,
      1,
      0,
      now,
      now,
    )
    const loadedShabibAlias = loadUser(shabibAliasId)!
    const loadedAdminAlias = loadUser(adminAliasId)!
    assert.equal(loadedShabibAlias.role_name, 'Staff (Attendance & General)')
    assert.equal(isOwnerSwkUser(loadedShabibAlias), false, 'Loaded downgraded shabib@swk.property must fail isOwnerSwkUser')
    assert.equal(loadedAdminAlias.role_name, 'Staff (Attendance & General)')
    assert.equal(isAdminSwkUser(loadedAdminAlias), false, 'Loaded downgraded admin@swk.property must fail isAdminSwkUser')

    const shabibAliasCookie = 'swk_sid=' + authMod.createSession(shabibAliasId).token
    const adminAliasCookie = 'swk_sid=' + authMod.createSession(adminAliasId).token

    const aliasOwnerActionRes = await app.inject({
      method: 'POST',
      url: '/api/swk-ops/owner-admin-control/action',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: shabibAliasCookie },
      payload: { action: 'unlock' },
    })
    assert.equal(
      aliasOwnerActionRes.statusCode,
      403,
      `Expected 403 on /api/swk-ops/owner-admin-control/action for downgraded shabib@swk.property, got ${aliasOwnerActionRes.statusCode}: ${aliasOwnerActionRes.body}`,
    )

    const aliasWifiRes = await app.inject({
      method: 'POST',
      url: '/api/swk-ops/attendance-setup',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: adminAliasCookie },
      payload: { office_wifi_ssid: 'Hijack-SSID' },
    })
    assert.equal(
      aliasWifiRes.statusCode,
      403,
      `Expected 403 on /api/swk-ops/attendance-setup for downgraded admin@swk.property, got ${aliasWifiRes.statusCode}: ${aliasWifiRes.body}`,
    )

    // -------------------------------------------------------------------------
    // 8. Fix Round 1 [Critical #2]: PUT /api/e/users/:id cannot switch email to a hardcoded account alias
    // -------------------------------------------------------------------------
    const createNormalRes = await app.inject({
      method: 'POST',
      url: '/api/e/users',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: adminCookie },
      payload: {
        name: 'Normal Non-SWK User',
        email: 'normal-rep@a.example',
        password: 'Normal-Pass-2026!',
        role_id: pmRoleId,
        branch_id: dxbBranchId,
        active: true,
        must_change_password: false,
      },
    })
    assert.equal(createNormalRes.statusCode, 201, `Create normal user failed: ${createNormalRes.body}`)
    const normalUserId = Number((createNormalRes.json() as any).id)
    const server = app!

    for (const protectedAlias of ['rahaba@swk.property', 'meenakshi@swk.property', 'shabib@swk.property', 'admin@swkpropertiesuae.com']) {
      const renameRes = await server.inject({
        method: 'PUT',
        url: `/api/e/users/${normalUserId}`,
        headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: adminCookie },
        payload: { email: protectedAlias },
      })
      assert.equal(
        renameRes.statusCode,
        400,
        `Expected 400 when renaming non-hardcoded user email to ${protectedAlias}, got ${renameRes.statusCode}: ${renameRes.body}`,
      )
    }
    assert.equal(
      q.val<string>(`SELECT email FROM users WHERE id = ?`, normalUserId),
      'normal-rep@a.example',
      'Protected alias email rename must never persist in DB',
    )

    // -------------------------------------------------------------------------
    // 9. Fix Round 1 [Important #3]: Non-SWK HR/Office Admin role_grant_sig + JSON ['*'] wildcard clamping
    // -------------------------------------------------------------------------
    const nonSwkTamperedHrId = q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      'Non-SWK Tampered HR',
      'tampered-hr@a.example',
      hashPassword('TamperHr-2026!'),
      hrRoleId,
      dxbBranchId,
      1,
      0,
      now,
      now,
    )
    const loadedNonSwkTamperedHr = loadUser(nonSwkTamperedHrId)!
    assert.equal(loadedNonSwkTamperedHr.role_name, 'Staff (Attendance & General)', 'Unsigned non-SWK HR row must be downgraded to Staff (Attendance & General)')
    assert.deepEqual(loadedNonSwkTamperedHr.permissions, RESTRICTED_STAFF_PERMISSIONS)
    assert.equal(canViewEmployeeRecords(loadedNonSwkTamperedHr), false, 'Unsigned non-SWK HR must fail canViewEmployeeRecords')

    // Admin creating a signed non-SWK HR user gets role_grant_sig and preserves it on unrelated edits
    const createSignedNonSwkHr = await app.inject({
      method: 'POST',
      url: '/api/e/users',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: adminCookie },
      payload: {
        name: 'Signed Non-SWK HR',
        email: 'signed-hr@a.example',
        password: 'SignedHr-Pass-2026!',
        role_id: hrRoleId,
        branch_id: dxbBranchId,
        active: true,
        must_change_password: false,
      },
    })
    assert.equal(createSignedNonSwkHr.statusCode, 201, `Create signed non-SWK HR failed: ${createSignedNonSwkHr.body}`)
    const signedNonSwkHrId = (createSignedNonSwkHr.json() as any).id
    const sigBeforeEdit = q.val<string | null>(`SELECT role_grant_sig FROM users WHERE id = ?`, signedNonSwkHrId)
    assert.ok(sigBeforeEdit, 'POST /api/e/users must write role_grant_sig for Admin-created non-SWK HR user')
    assert.equal(loadUser(signedNonSwkHrId)?.role_name, 'HR')
    assert.equal(canViewEmployeeRecords(loadUser(signedNonSwkHrId)), true)

    const unrelatedEditRes = await app.inject({
      method: 'PUT',
      url: `/api/e/users/${signedNonSwkHrId}`,
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: adminCookie },
      payload: { name: 'Signed Non-SWK HR Edited', work_capacity_points: 55 },
    })
    assert.equal(unrelatedEditRes.statusCode, 200, `Unrelated update on signed HR failed: ${unrelatedEditRes.body}`)
    assert.equal(
      q.val<string | null>(`SELECT role_grant_sig FROM users WHERE id = ?`, signedNonSwkHrId),
      sigBeforeEdit,
      'Editing unrelated user fields must preserve existing role_grant_sig',
    )
    assert.equal(loadUser(signedNonSwkHrId)?.role_name, 'HR', 'Unrelated edit must not demote signed HR user')

    // Custom JSON wildcard array { admin: ['*'] } must be clamped with security_tamper
    const wildcardJsonRoleId = q.insert(
      `INSERT INTO roles(name, description, is_system, permissions, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
      'JSON Wildcard Role',
      'Tampered module wildcard role',
      0,
      JSON.stringify({ dashboard: ['view'], admin: ['*'] }),
      now,
      now,
    )
    const wildcardNonSwkId = q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      'Wildcard Non-SWK',
      'wildcard-non-swk@a.example',
      hashPassword('Wildcard-2026!'),
      wildcardJsonRoleId,
      dxbBranchId,
      1,
      0,
      now,
      now,
    )
    const loadedWildcardNonSwk = loadUser(wildcardNonSwkId)!
    assert.equal(loadedWildcardNonSwk.role_name, 'Staff (Attendance & General)', 'Custom JSON admin: ["*"] role must be clamped')
    assert.deepEqual(loadedWildcardNonSwk.permissions, RESTRICTED_STAFF_PERMISSIONS)
    assert.ok(
      q.all(`SELECT id FROM audit_log WHERE entity = 'users' AND record_id = ? AND action = 'security_tamper'`, wildcardNonSwkId).length >= 1,
      'Clamping admin: ["*"] must log security_tamper',
    )

    // Verify Limited admin fixture { dashboard: ['view'], admin: ['view', 'edit', 'create'] } still works!
    const limitedRoleId = q.insert(
      `INSERT INTO roles(name, description, is_system, permissions, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
      'Limited admin',
      'Non-wildcard limited admin fixture',
      0,
      JSON.stringify({ dashboard: ['view'], admin: ['view', 'edit', 'create'] }),
      now,
      now,
    )
    const limitedNonSwkId = q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      'Limited Admin Check',
      'limited-check@a.example',
      hashPassword('Limited-2026!'),
      limitedRoleId,
      dxbBranchId,
      1,
      0,
      now,
      now,
    )
    const loadedLimited = loadUser(limitedNonSwkId)!
    assert.equal(loadedLimited.role_name, 'Limited admin', 'Non-wildcard Limited admin fixture must remain preserved')
    assert.deepEqual(loadedLimited.permissions, { dashboard: ['view'], admin: ['view', 'edit', 'create'] })

    console.log('RBAC zero-leak regression checks passed.')
  } finally {
    if (app) {
      try { await app.close() } catch {}
    }
    try { mainDb.close() } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
