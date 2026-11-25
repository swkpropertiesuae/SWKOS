import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Isolated production-mode fixture: set the environment BEFORE importing any server module.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swk-security-fixes-'))
process.env.DATA_DIR = tmpDir
process.env.DATABASE_URL = ''
process.env.NODE_ENV = 'production'
process.env.OWNER_PASSWORD = 'OwnerEnv#2026x'
process.env.ADMIN_SWK_PASSWORD = 'AdminEnv#2026x'
process.env.MANAGER_PASSWORD = 'ManagerEnv#2026x'

async function run() {
  const { q } = await import('../src/server/db')
  const { syncSchema } = await import('../src/server/schema')
  const { seedReference, retireSwk2026PatternPasswords } = await import('../src/server/seed')
  const { runStartupDataTasks } = await import('../src/server/startup-data')
  const { attemptLogin, hashPassword, loadUser } = await import('../src/server/auth')
  const { createRecord, getDef, listRecords, SYSTEM_CTX } = await import('../src/server/engine')
  const { appealComplianceCase, challengeQaReview, scanMissingDailyReports } = await import('../src/server/domain/enterprise')
  const { allowedLocalOrigin, rateLimitKey } = await import('../src/server/app')
  const { setSettings } = await import('../src/server/settings')
  const { SWK_STAFF_ACCOUNTS, swkPatternPassword } = await import('../src/shared/swk-staff-access')

  const warn = console.warn
  const announced = new Map<string, string>()
  console.warn = (...a: any[]) => { const m = /^\[one-time password\] (\S+): (\S+)/.exec(String(a[0])); if (m) announced.set(m[1].toLowerCase(), m[2]); else warn(...a) }
  syncSchema()
  await seedReference()
  await runStartupDataTasks()
  console.warn = warn

  const login = (email: string, pw: string) => { try { attemptLogin(email, pw, undefined); return true } catch { return false } }
  const staff = SWK_STAFF_ACCOUNTS.filter(a => !a.fullAccess && a.roleName !== 'Manager')
  assert.ok(staff.length >= 5, 'fixture has low-privilege staff accounts')

  // 1. No account accepts the name pattern; each gets a random one-time password, announced once, that must be changed.
  for (const a of staff) {
    assert.equal(login(a.email, swkPatternPassword(a.email)), false, `${a.email} must not accept the name-pattern password`)
    const pw = announced.get(a.email.toLowerCase()) ?? announced.get(a.displayEmail.toLowerCase())
    assert.ok(pw && pw.length >= 16, `${a.email} gets an announced one-time password`)
    assert.equal(login(a.email, pw!), true, `${a.email} signs in with its one-time password`)
    assert.equal(q.val(`SELECT must_change_password FROM users WHERE lower(email) = ?`, a.displayEmail.toLowerCase()), 1, `${a.email} must change the one-time password`)
  }
  console.log('  ✓ staff start on random one-time passwords, never the name pattern')

  // 2. An existing database that still holds pattern passwords is cleaned up once; personal passwords are kept.
  const [legacy, personal] = staff
  q.run(`UPDATE users SET password_hash = ? WHERE lower(email) = ?`, hashPassword(swkPatternPassword(legacy.displayEmail)), legacy.displayEmail.toLowerCase())
  q.run(`UPDATE users SET password_hash = ? WHERE lower(email) = ?`, hashPassword('My-Own#Pass2026'), personal.displayEmail.toLowerCase())
  q.run(`DELETE FROM settings WHERE key = 'pwreset:retire-swk2026-pattern'`)
  console.warn = () => {}
  retireSwk2026PatternPasswords()
  console.warn = warn
  assert.equal(login(legacy.displayEmail, swkPatternPassword(legacy.displayEmail)), false, 'a leftover pattern password is retired')
  assert.equal(login(personal.displayEmail, 'My-Own#Pass2026'), true, 'a personal password is kept')
  console.log('  ✓ leftover pattern passwords are retired once, personal passwords kept')

  // Fixture users.
  const staffRole = q.val<number>(`SELECT id FROM roles WHERE name = 'Staff (Attendance & General)'`)
  const mkUser = (name: string, email: string) => {
    const id = q.insert(`INSERT INTO users(name, email, password_hash, role_id, active, created_at, updated_at) VALUES (?,?,?,?,1,?,?)`, name, email, hashPassword('Fixture#Pass2026'), staffRole, new Date().toISOString(), new Date().toISOString())
    return { user: loadUser(id)! }
  }
  const subject = mkUser('Case Subject', 'subject@example.com')
  const outsider = mkUser('Unrelated Staff', 'outsider@example.com')

  // 3. Only the subject (or implicated person) may appeal a compliance case, and the reply does not carry the investigation file.
  const c = createRecord(getDef('compliance_cases'), {
    title: 'Confidential review', case_category: 'Client Complaint (4.09)', source_type: 'Client Complaint', severity: 'High',
    subject_user_id: subject.user.id, evidence_summary: 'SECRET evidence',
  }, SYSTEM_CTX)
  assert.throws(() => appealComplianceCase(c.id, 'I want to see and change this case', outsider), /not found/i)
  assert.equal(q.val(`SELECT status FROM compliance_cases WHERE id = ?`, c.id) === 'Appealed by Subject', false, 'an outsider cannot change the case')
  const appealed: any = appealComplianceCase(c.id, 'Attached my counter-evidence for review.', subject)
  assert.equal(appealed.status, 'Appealed by Subject')
  assert.equal(appealed.evidence_summary, undefined, 'the appeal reply does not return the evidence')
  console.log('  ✓ compliance appeal limited to the subject, no evidence in the reply')

  // 4. Only the reviewed broker can challenge a QA review.
  const agentId = q.insert(`INSERT INTO agents(name, status, created_at, updated_at) VALUES (?, 'Active', ?, ?)`, 'Fixture Agent', new Date().toISOString(), new Date().toISOString())
  const qa = createRecord(getDef('qa_reviews'), { agent_id: agentId, user_id: subject.user.id, channel: 'WhatsApp Business Sample', overall_score: 70, findings: 'Late reply.' }, SYSTEM_CTX)
  const qaCtx = (u: any) => ({ user: { ...u.user, permissions: { support: ['view'] } as any, role_name: 'QA Fixture' } })
  assert.throws(() => challengeQaReview(qa.id, 'This is not my review but I object.', qaCtx(outsider)), /Only the reviewed broker/)
  console.log('  ✓ QA challenge limited to the reviewed broker')

  // 5. Scanning for missing daily reports (lists every employee) is for leadership and HR only.
  assert.throws(() => scanMissingDailyReports('2026-11-25', outsider), /Only the Owner, Admin, Operations Manager and HR/)
  assert.ok(scanMissingDailyReports('2026-11-25', SYSTEM_CTX))
  console.log('  ✓ missing-report scan restricted to leadership and HR')

  // 6. Masked fields cannot be filtered or searched by users who see them masked.
  setSettings({ masked_fields: 'leads.phone' })
  createRecord(getDef('leads'), { company: 'Masked Co', contact_name: 'Masked Lead', phone: '+971500000001', source: 'Referral', status: 'New' }, SYSTEM_CTX)
  const viewer = { user: { ...outsider.user, permissions: { crm: ['view'] } as any, role_name: 'Viewer Fixture' } }
  const all = listRecords(getDef('leads'), {}, viewer).total
  const filtered = listRecords(getDef('leads'), { filters: [{ field: 'phone', op: 'eq', value: '+971599999999' }] }, viewer).total
  assert.equal(filtered, all, 'a filter on a masked field is ignored')
  console.log('  ✓ masked fields are not filterable')

  // 7. Rate limits key on the real client, not a typed X-Forwarded-For; production CORS accepts only the app WebViews from localhost.
  const req = (h: Record<string, string>) => ({ headers: h, ip: h['x-forwarded-for']?.split(',')[0] ?? '203.0.113.9', raw: { socket: { remoteAddress: '172.18.0.3' } } }) as any
  assert.equal(rateLimitKey(req({ 'x-forwarded-for': '9.9.9.9', 'cf-connecting-ip': '198.51.100.7' })), '198.51.100.7')
  assert.equal(rateLimitKey(req({ 'x-forwarded-for': '9.9.9.9' })), '172.18.0.3', 'X-Forwarded-For is never the key')
  assert.equal(allowedLocalOrigin('https://localhost'), true)
  assert.equal(allowedLocalOrigin('capacitor://localhost'), true)
  assert.equal(allowedLocalOrigin('http://localhost:3000'), false)
  assert.equal(allowedLocalOrigin('https://localhost:8443'), false)
  console.log('  ✓ rate-limit key and production CORS')

  console.log('Security fix regression checks passed.')
}

run().catch(e => { console.error(e); process.exit(1) })
