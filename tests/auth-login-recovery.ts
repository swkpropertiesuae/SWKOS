import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Isolated production-mode fixture: set env BEFORE importing any server module.
const ownTmpDir = !process.env.DATABASE_URL ? fs.mkdtempSync(path.join(os.tmpdir(), 'swk-auth-recovery-')) : null
if (ownTmpDir) process.env.DATA_DIR = ownTmpDir
process.env.NODE_ENV = 'production'
// Deliberately include CRLF / whitespace as often happens when .env is edited on Windows.
process.env.OWNER_PASSWORD = 'Owner#Prod2026x\r\n'
process.env.ADMIN_SWK_PASSWORD = ''
process.env.ADMIN_PASSWORD = 'Admin#Prod2026x  '
process.env.MANAGER_PASSWORD = 'Manager#Prod2026x\r'

async function run() {
  const { q, db } = await import('../src/server/db')
  const { syncSchema } = await import('../src/server/schema')
  const { seedReference, applyConfiguredPasswords, syncSwkStaffRoster } = await import('../src/server/seed')
  const { runStartupDataTasks } = await import('../src/server/startup-data')
  const { attemptLogin, hashPassword } = await import('../src/server/auth')
  const { checkPasswordForCheckin } = await import('../src/server/domain/attendance-security')
  const { buildApp } = await import('../src/server/app')
  const { SWK_STAFF_ACCOUNTS, swkPatternPassword } = await import('../src/shared/swk-staff-access')
  const crypto = await import('node:crypto')

  let checks = 0
  const check = (label: string, cond: unknown) => {
    assert.ok(cond, label)
    checks++
    console.log('  ✓', label)
  }

  syncSchema()
  await seedReference()
  await runStartupDataTasks()

  const canLogin = (email: string, pw: string) => {
    try {
      const r = attemptLogin(email, pw, undefined, '127.0.0.1', 'test')
      return 'user' in r
    } catch {
      return false
    }
  }

  // 1. Trimmed env passwords & ADMIN_PASSWORD fallback + MANAGER_PASSWORD applied cleanly.
  check('Owner signs in with trimmed OWNER_PASSWORD', canLogin('shabib@swk.properties', 'Owner#Prod2026x'))
  check('Admin signs in with trimmed ADMIN_PASSWORD fallback', canLogin('admin@swk.properties', 'Admin#Prod2026x'))
  check('Manager signs in with trimmed MANAGER_PASSWORD', canLogin('haseeb@swk.properties', 'Manager#Prod2026x'))
  check('Staff signs in with initial pattern password', canLogin('talha@swk.properties', swkPatternPassword('talha@swk.properties')))
  check('Staff alias signs in (fareed@swk.properties -> fareed@swk.rent)', canLogin('fareed@swk.properties', swkPatternPassword('fareed@swk.rent')))
  check('Admin alias signs in (admin@swk.property -> admin@swk.properties)', canLogin('admin@swk.property', 'Admin#Prod2026x'))

  // 2. Simulate production damage from a28edb2's retireSwk2026PatternPasswords():
  //    - pwreset:retire-swk2026-pattern = '1' and pwreset:swk2026-pattern = '1' already set
  //    - pwsecret:admin / pwsecret:owner ALREADY match the current .env hash
  //    - Admin, Owner, and un-changed Staff were overwritten with random unknown passwords + must_change_password = 1
  //    - One staff member (samarth) already chose a personal password (must_change_password = 0)
  //    - Several accounts also hit lockout from failed retries
  const randomClobber = () => hashPassword(crypto.randomBytes(12).toString('base64url') + 'aA1')
  const now = new Date().toISOString()
  const futureLock = new Date(Date.now() + 15 * 60_000).toISOString().slice(0, 16)
  q.run(`INSERT INTO settings(key, value, updated_at) VALUES ('pwreset:retire-swk2026-pattern', '1', ?) ON CONFLICT(key) DO UPDATE SET value = '1'`, now)
  q.run(`UPDATE users SET password_hash = ?, must_change_password = 1, failed_logins = 5, locked_until = ? WHERE lower(email) = 'admin@swk.properties'`, randomClobber(), futureLock)
  q.run(`UPDATE users SET password_hash = ?, must_change_password = 1, failed_logins = 5, locked_until = ? WHERE lower(email) = 'shabib@swk.properties'`, randomClobber(), futureLock)
  q.run(`UPDATE users SET password_hash = ?, must_change_password = 1, failed_logins = 5, locked_until = ? WHERE lower(email) = 'talha@swk.properties'`, randomClobber(), futureLock)
  q.run(`UPDATE users SET password_hash = ?, must_change_password = 1, failed_logins = 5, locked_until = ? WHERE lower(email) = 'fareed@swk.rent'`, randomClobber(), futureLock)
  q.run(`UPDATE users SET password_hash = ?, must_change_password = 0, failed_logins = 0, locked_until = NULL WHERE lower(email) = 'samarth@swk.properties'`, hashPassword('Samarth-Personal#99'))

  // Before recovery, Admin / Owner / Talha / Fareed are all broken.
  check('clobbered Admin cannot sign in before recovery', !canLogin('admin@swk.properties', 'Admin#Prod2026x'))
  check('clobbered Talha cannot sign in before recovery', !canLogin('talha@swk.properties', swkPatternPassword('talha@swk.properties')))

  // Run startup recovery (simulating container restart on the fixed build).
  await runStartupDataTasks()

  check('recovery restores Admin to configured env password & unlocks', canLogin('admin@swk.properties', 'Admin#Prod2026x'))
  check('recovery clears Admin must_change_password when env secret applied', q.val<number>(`SELECT must_change_password FROM users WHERE lower(email) = 'admin@swk.properties'`) === 0)
  check('recovery restores Owner to configured env password & unlocks', canLogin('shabib@swk.properties', 'Owner#Prod2026x'))
  check('recovery restores clobbered Talha to temporary pattern password', canLogin('talha@swk.properties', swkPatternPassword('talha@swk.properties')))
  check('recovery keeps Talha must_change_password = 1', q.val<number>(`SELECT must_change_password FROM users WHERE lower(email) = 'talha@swk.properties'`) === 1)
  check('recovery restores clobbered Fareed to temporary pattern password', canLogin('fareed@swk.rent', swkPatternPassword('fareed@swk.rent')))
  check('recovery preserves Samarth personal password (must_change_password = 0)', canLogin('samarth@swk.properties', 'Samarth-Personal#99'))

  // 2b. Verify recovery is idempotent (a subsequent personal password change is NOT overwritten on next restart).
  q.run(`UPDATE users SET password_hash = ?, must_change_password = 0 WHERE lower(email) = 'admin@swk.properties'`, hashPassword('Admin-NewPersonal#2026'))
  await runStartupDataTasks()
  check('second restart preserves Admin personal password after recovery', canLogin('admin@swk.properties', 'Admin-NewPersonal#2026'))

  // 2c. Verify recovery fallback when ADMIN_SWK_PASSWORD/ADMIN_PASSWORD is NOT set in env and Admin was clobbered (must_change_password = 1).
  const prevAdminEnv = process.env.ADMIN_PASSWORD
  delete process.env.ADMIN_PASSWORD
  delete process.env.ADMIN_SWK_PASSWORD
  q.run(`DELETE FROM settings WHERE key = 'pwreset:recover-retired-2026-11-25'`)
  q.run(`UPDATE users SET password_hash = ?, must_change_password = 1, failed_logins = 5, locked_until = ? WHERE lower(email) = 'admin@swk.properties'`, randomClobber(), futureLock)
  await runStartupDataTasks()
  check('recovery restores Admin to Admin@swk2026 (must change) when no env password is set', canLogin('admin@swk.properties', swkPatternPassword('admin@swk.properties')))
  check('recovered Admin without env secret must change password on sign-in', q.val<number>(`SELECT must_change_password FROM users WHERE lower(email) = 'admin@swk.properties'`) === 1)
  // Restore env password and verify applyConfiguredPasswords unlocks and applies a new env secret.
  process.env.ADMIN_SWK_PASSWORD = 'Admin#Fresh2026!'
  applyConfiguredPasswords()
  check('new ADMIN_SWK_PASSWORD applies immediately and clears must_change_password', canLogin('admin@swk.properties', 'Admin#Fresh2026!') && q.val<number>(`SELECT must_change_password FROM users WHERE lower(email) = 'admin@swk.properties'`) === 0)
  process.env.ADMIN_PASSWORD = prevAdminEnv

  // 3. Expired lockout resets failed_logins so 1 typo does not immediately re-lock for another 15 minutes.
  const expiredLock = new Date(Date.now() - 5 * 60_000).toISOString().slice(0, 16)
  q.run(`UPDATE users SET failed_logins = 5, locked_until = ? WHERE lower(email) = 'samarth@swk.properties'`, expiredLock)
  check('wrong password after expired lockout still fails', !canLogin('samarth@swk.properties', 'WrongPass123!'))
  const afterExpiredFail = q.get<{ failed_logins: number; locked_until: string | null }>(`SELECT failed_logins, locked_until FROM users WHERE lower(email) = 'samarth@swk.properties'`)!
  check('expired lockout resets failed_logins to 1 instead of instant re-lock', afterExpiredFail.failed_logins === 1 && afterExpiredFail.locked_until === null)
  check('Samarth can still sign in right after 1 typo post-lockout', canLogin('samarth@swk.properties', 'Samarth-Personal#99'))

  // 4. checkPasswordForCheckin resolves aliases and isolates failures per account on shared office IP.
  q.run(`UPDATE users SET password_hash = ?, must_change_password = 0 WHERE lower(email) = 'fareed@swk.rent'`, hashPassword('Fareed-Office#2026'))
  const officeIp = '2.50.42.191'
  for (let i = 0; i < 8; i++) {
    try { checkPasswordForCheckin('talha@swk.properties', 'Wrong-Pass!', officeIp) } catch { /* expected */ }
  }
  const fareedId = checkPasswordForCheckin('fareed@swk.properties', 'Fareed-Office#2026', officeIp)
  check('QR check-in resolves fareed@swk.properties alias and is not blocked by Talha failures on shared office IP', fareedId > 0)

  // 5. HTTP app tests: shared office IP login rate limit, Admin password reset unlocks locked user, and Owner reset_password validation.
  const app = await buildApp()
  try {
    // 12 failed attempts for one user on shared office IP must NOT rate-limit Admin on the same office IP.
    for (let i = 0; i < 12; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { 'x-swk-client': 'web', 'cf-connecting-ip': officeIp },
        payload: { email: 'nonexistent-office-user@swk.properties', password: 'WrongPassword1!' },
      })
    }
    const adminLoginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-swk-client': 'web', 'cf-connecting-ip': officeIp },
      payload: { email: 'admin@swk.properties', password: 'Admin#Fresh2026!' },
    })
    check('Admin login on shared office IP is not 429 rate-limited by another user failing', adminLoginRes.statusCode === 200)
    const adminCookie = 'swk_sid=' + adminLoginRes.cookies.find((c: any) => c.name === 'swk_sid')!.value

    // Admin resetting a locked staff user's password via PUT /api/e/users/:id unlocks their account.
    const talhaRow = q.get<{ id: number; version: number; role_id: number }>(`SELECT id, version, role_id FROM users WHERE lower(email) = 'talha@swk.properties'`)!
    q.run(`UPDATE users SET failed_logins = 5, locked_until = ? WHERE id = ?`, futureLock, talhaRow.id)
    const resetRes = await app.inject({
      method: 'PUT',
      url: `/api/e/users/${talhaRow.id}`,
      headers: { 'x-swk-client': 'web', cookie: adminCookie, 'x-swk-audit-reason': 'Password reset for Talha' },
      payload: {
        name: 'Talha Shabbir',
        email: 'talha@swk.properties',
        role_id: talhaRow.role_id,
        password: 'Talha-Reset#2026!',
        active: true,
        must_change_password: false,
        version: talhaRow.version,
      },
    })
    check('Admin PUT /api/e/users/:id password reset succeeds', resetRes.statusCode === 200)
    check('User whose password was reset by Admin is unlocked and can sign in immediately', canLogin('talha@swk.properties', 'Talha-Reset#2026!'))

    // Alias password-reset request (/api/public/invite/forgot) resolves fareed@swk.properties -> fareed@swk.rent.
    const forgotRes = await app.inject({
      method: 'POST',
      url: '/api/public/invite/forgot',
      headers: { 'x-swk-client': 'web' },
      payload: { email: 'fareed@swk.properties' },
    })
    check('/api/public/invite/forgot returns 200 for alias', forgotRes.statusCode === 200)
    const fareedUserId = q.val<number>(`SELECT id FROM users WHERE lower(email) = 'fareed@swk.rent' AND deleted_at IS NULL`)!
    const inviteCount = q.val<number>(`SELECT COUNT(*) FROM user_invites WHERE user_id = ? AND kind = 'reset' AND used_at IS NULL`, fareedUserId) ?? 0
    check('/api/public/invite/forgot created reset invite for canonical fareed@swk.rent account', inviteCount >= 1)

    // Owner reset_password validates explicit password strength and applies cleanly.
    const ownerLoginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-swk-client': 'web' },
      payload: { email: 'shabib@swk.properties', password: 'Owner#Prod2026x' },
    })
    check('Owner HTTP login succeeds', ownerLoginRes.statusCode === 200)
    const ownerCookie = 'swk_sid=' + ownerLoginRes.cookies.find((c: any) => c.name === 'swk_sid')!.value
    const weakResetRes = await app.inject({
      method: 'POST',
      url: '/api/swk-ops/owner-admin-control/action',
      headers: { 'x-swk-client': 'web', cookie: ownerCookie },
      payload: { action: 'reset_password', new_password: 'weak' },
    })
    check('Owner reset_password rejects weak password', weakResetRes.statusCode === 400)
    const goodResetRes = await app.inject({
      method: 'POST',
      url: '/api/swk-ops/owner-admin-control/action',
      headers: { 'x-swk-client': 'web', cookie: ownerCookie },
      payload: { action: 'reset_password', new_password: 'Admin-OwnerSet#2026!' },
    })
    check('Owner reset_password applies strong password', goodResetRes.statusCode === 200)
    check('Admin signs in immediately with Owner-set password', canLogin('admin@swk.properties', 'Admin-OwnerSet#2026!'))

    // Missing leadership account self-heals via syncSwkStaffRoster().
    const adminRec = q.get<{ id: number }>(`SELECT id FROM users WHERE lower(email) = 'admin@swk.properties'`)!
    q.run(`DELETE FROM sessions WHERE user_id = ?`, adminRec.id)
    q.run(`UPDATE users SET deleted_at = ? WHERE id = ?`, now, adminRec.id)
    syncSwkStaffRoster()
    const healedAdmin = q.get<{ id: number }>(`SELECT id FROM users WHERE lower(email) = 'admin@swk.properties' AND deleted_at IS NULL`)
    check('syncSwkStaffRoster recreates missing Admin account', !!healedAdmin)
  } finally {
    await app.close()
    db.close()
    if (ownTmpDir) fs.rmSync(ownTmpDir, { recursive: true, force: true })
  }

  void SWK_STAFF_ACCOUNTS
  console.log(`\nAll ${checks} auth login & recovery regression checks passed!`)
}

run().catch(e => {
  console.error(e)
  process.exit(1)
})
