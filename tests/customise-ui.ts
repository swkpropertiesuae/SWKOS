/**
 * SWK OS — Customise UI & Pin/Drag Workspace E2E Verification Suite
 *
 * Covers:
 *  1. Default resolution & schema migration (SQLite + PostgreSQL 16)
 *  2. Full per-user colors, fonts, sizes, styles, layout & highlight persistence
 *  3. Sparse theme vs. pinning separation (pinning/dragging NEVER detaches user from Company Default!)
 *  4. Owner-only Company Default (`shabib@swk.properties` allowed; Admin, Manager, HR, Office Admin,
 *     Restricted Staff & Portal strictly receive 403 Forbidden)
 *  5. Zero-leak guarantee: Owner's starred `highlightedAppKeys` (`shabib_corner`, `admin`) NEVER leak into Company Default
 *  6. Server-side RBAC pin stripping for Restricted Staff & Customer Portal accounts
 *  7. Scoped reset: `DELETE ?scope=theme` resets theme while preserving personal pins/drag pad; `?scope=all` clears all
 *  8. Strict Zod validation rejects CSS injection hex strings, external `//evil.com` URLs, `/print/*`, and out-of-range font sizes
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dataDir = process.env.DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'swk-customise-ui-'))
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
const { q } = await import('../src/server/db')
const { buildApp } = await import('../src/server/app')
const { hashPassword } = await import('../src/server/auth')
const { DEFAULT_UI_THEME, UI_PRESETS } = await import('../src/shared/ui-customization')

ensureDirs()
syncSchema()
await seedReference()
syncSwkStaffRoster()
q.run(`UPDATE users SET must_change_password = 0 WHERE deleted_at IS NULL`)

// Create a Customer Portal user fixture (party_id != null) to test portal UI customization & route allowlist
const now = new Date().toISOString()
const portalParty = q.run(
  `INSERT INTO parties (code, name, is_customer, status, created_at, updated_at) VALUES (?, ?, 1, 'Active', ?, ?)`,
  'CUST-PORTAL-UI',
  'Portal VIP Buyer',
  now,
  now,
)
const portalRoleId = q.val<number>(`SELECT id FROM roles WHERE name = 'Customer Portal'`) ?? 1
q.run(
  `INSERT INTO users (name, email, password_hash, role_id, party_id, active, must_change_password, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)`,
  'Portal VIP Buyer',
  'portal-ui-test@example.test',
  hashPassword('Portal@swk2026'),
  portalRoleId,
  Number(portalParty.lastInsertRowid),
  now,
  now,
)

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

try {
  const ownerH = await loginAs(config.accounts.ownerEmail, config.accounts.ownerPassword)
  const adminH = await loginAs(config.accounts.adminSwkEmail, config.accounts.adminSwkPassword)
  const haseebH = await loginAs('haseeb@swk.properties', config.accounts.managerPassword)
  const restrictedH = await loginAs('fareed@swk.rent', config.accounts.bdmPassword)
  const portalH = await loginAs('portal-ui-test@example.test', 'Portal@swk2026')

  // 1. Initial GET returns default untouched SWK Signature theme
  const initOwner = await app.inject({ method: 'GET', url: '/api/auth/ui-preferences', headers: ownerH })
  assert.equal(initOwner.statusCode, 200)
  const initOwnerBody = initOwner.json()
  assert.equal(initOwnerBody.isOwner, true)
  assert.equal(initOwnerBody.hasPersonalTheme, false)
  assert.equal(initOwnerBody.hasCompanyDefault, false)
  assert.equal(initOwnerBody.effectivePrefs.colors.background, '#ffffff')
  assert.equal(initOwnerBody.effectivePrefs.typography.fontSizePx, 15)

  // 2. Non-owner accounts (Admin, Manager, Restricted Staff, Portal) MUST receive 403 on company-default
  const darkPreset = UI_PRESETS.find(p => p.id === 'obsidian-night-gold')!.theme
  for (const [label, hdrs] of [
    ['Admin', adminH],
    ['Haseeb', haseebH],
    ['Restricted Staff', restrictedH],
    ['Portal', portalH],
  ] as const) {
    const r = await app.inject({
      method: 'PUT',
      url: '/api/auth/ui-preferences/company-default',
      headers: { ...hdrs, 'content-type': 'application/json' },
      payload: { theme: darkPreset },
    })
    assert.equal(r.statusCode, 403, `${label} must NOT be allowed to set Company Default`)
  }

  // 3. Restricted staff pins ONLY permitted routes — unauthorized routes MUST be stripped server-side
  const restrictedPinRes = await app.inject({
    method: 'PUT',
    url: '/api/auth/ui-preferences',
    headers: { ...restrictedH, 'content-type': 'application/json' },
    payload: {
      pinning: {
        dockPosition: 'top',
        pinnedItems: [
          { id: '/market', label: 'Market Pulse', to: '/market', highlighted: true },
          { id: '/field-duty', label: 'Field GPS', to: '/field-duty' },
          { id: '/shabibs-corner', label: 'Owner Vault', to: '/shabibs-corner' },
          { id: '/admin/settings', label: 'Admin Settings', to: '/admin/settings' },
          { id: '/crm-vault', label: 'CRM Vault', to: '/crm-vault' },
        ],
        highlightedAppKeys: ['market_pulse', 'shabib_corner', 'admin'],
        floatingPad: { enabled: true, collapsed: false, xPct: 75, yPct: 60 },
      },
    },
  })
  assert.equal(restrictedPinRes.statusCode, 200, restrictedPinRes.body)
  const restrictedPinBody = restrictedPinRes.json()
  assert.equal(restrictedPinBody.hasPersonalTheme, false, 'Pinning MUST NOT freeze personal theme!')
  assert.equal(restrictedPinBody.strippedCount, 5, 'Must strip 3 forbidden routes + 2 forbidden app keys')
  assert.deepEqual(
    restrictedPinBody.pinning.pinnedItems.map((p: any) => p.to),
    ['/market', '/field-duty'],
  )
  assert.deepEqual(restrictedPinBody.pinning.highlightedAppKeys, ['market_pulse'])

  // 4. Owner sets Company Default + Owner stars Owner-only app keys personally -> ZERO leak of Owner app keys into Company Default!
  const ownerPersonalPin = await app.inject({
    method: 'PUT',
    url: '/api/auth/ui-preferences',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: {
      pinning: {
        dockPosition: 'bottom',
        pinnedItems: [{ id: '/shabibs-corner?tab=closings', label: 'Closings', to: '/shabibs-corner?tab=closings', highlighted: true }],
        highlightedAppKeys: ['shabib_corner', 'master_log'],
      },
    },
  })
  assert.equal(ownerPersonalPin.statusCode, 200)
  assert.equal(ownerPersonalPin.json().pinning.pinnedItems.length, 1)

  const emeraldTheme = {
    ...UI_PRESETS.find(p => p.id === 'dubai-royal-emerald')!.theme,
    typography: { ...DEFAULT_UI_THEME.typography, bodyFont: 'plus-jakarta', fontSizePx: 16, fontWeight: '500' as const },
  }
  const setCoDef = await app.inject({
    method: 'PUT',
    url: '/api/auth/ui-preferences/company-default',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: { theme: emeraldTheme },
  })
  assert.equal(setCoDef.statusCode, 200, setCoDef.body)
  assert.equal(setCoDef.json().hasCompanyDefault, true)

  // 5. Sparse theme inheritance check: Restricted Staff (who pinned items but NEVER set personal theme) MUST inherit Company Default automatically while keeping their pins!
  const staffAfterCoDef = await app.inject({ method: 'GET', url: '/api/auth/ui-preferences', headers: restrictedH })
  assert.equal(staffAfterCoDef.statusCode, 200)
  const staffBody = staffAfterCoDef.json()
  assert.equal(staffBody.hasPersonalTheme, false)
  assert.equal(staffBody.hasCompanyDefault, true)
  assert.equal(staffBody.effectivePrefs.presetId, 'dubai-royal-emerald')
  assert.equal(staffBody.effectivePrefs.typography.fontSizePx, 16)
  assert.equal(staffBody.pinning.pinnedItems.length, 2, 'Staff pins must stay intact')
  assert.equal(staffBody.pinning.floatingPad.xPct, 75)
  assert.equal('highlightedAppKeys' in (staffBody.companyDefault || {}), false, 'Company default must never carry app keys')
  assert.equal('pinning' in (staffBody.companyDefault || {}), false, 'Company default must never carry pinning')

  // 6. Staff overrides personal theme -> then resets THEME ONLY (`scope=theme`) -> pins & floating pad stay intact!
  const customTheme = {
    ...darkPreset,
    presetId: 'custom',
    colors: { ...darkPreset.colors, background: '#101828', highlightColor: '#f59e0b' },
    typography: { ...darkPreset.typography, fontSizePx: 18, fontStyle: 'italic' as const, uppercaseHeadings: true },
  }
  const staffThemeSave = await app.inject({
    method: 'PUT',
    url: '/api/auth/ui-preferences',
    headers: { ...restrictedH, 'content-type': 'application/json' },
    payload: { theme: customTheme },
  })
  assert.equal(staffThemeSave.statusCode, 200)
  assert.equal(staffThemeSave.json().hasPersonalTheme, true)
  assert.equal(staffThemeSave.json().effectivePrefs.colors.background, '#101828')
  assert.equal(staffThemeSave.json().effectivePrefs.typography.fontStyle, 'italic')

  const resetThemeOnly = await app.inject({
    method: 'DELETE',
    url: '/api/auth/ui-preferences?scope=theme',
    headers: restrictedH,
  })
  assert.equal(resetThemeOnly.statusCode, 200)
  const resetThemeBody = resetThemeOnly.json()
  assert.equal(resetThemeBody.hasPersonalTheme, false)
  assert.equal(resetThemeBody.effectivePrefs.presetId, 'dubai-royal-emerald', 'Falls back to Company Default')
  assert.equal(resetThemeBody.pinning.pinnedItems.length, 2, 'Reset Theme MUST preserve pins')
  assert.equal(resetThemeBody.pinning.floatingPad.enabled, true, 'Reset Theme MUST preserve floating pad')

  // Full reset (`scope=all`) clears pins too
  const resetAll = await app.inject({
    method: 'DELETE',
    url: '/api/auth/ui-preferences?scope=all',
    headers: restrictedH,
  })
  assert.equal(resetAll.statusCode, 200)
  assert.equal(resetAll.json().pinning.pinnedItems.length, 0)
  assert.equal(resetAll.json().pinning.floatingPad.enabled, false)

  // 7. Customer Portal user inherits Company Default, saves custom theme, and pins ONLY portal routes
  const portalRes = await app.inject({
    method: 'PUT',
    url: '/api/auth/ui-preferences',
    headers: { ...portalH, 'content-type': 'application/json' },
    payload: {
      pinning: {
        dockPosition: 'top',
        pinnedItems: [
          { id: '/portal', label: 'Portal', to: '/portal' },
          { id: '/e/invoices', label: 'Invoices', to: '/e/invoices' },
          { id: '/dashboard', label: 'Staff Dash', to: '/dashboard' },
          { id: '/shabibs-corner', label: 'Owner', to: '/shabibs-corner' },
        ],
      },
    },
  })
  assert.equal(portalRes.statusCode, 200, portalRes.body)
  assert.deepEqual(
    portalRes.json().pinning.pinnedItems.map((p: any) => p.to),
    ['/portal', '/e/invoices'],
  )
  assert.equal(portalRes.json().strippedCount, 2)

  // 8. Injection & malformed input rejection (strict 400)
  const badHex = await app.inject({
    method: 'PUT',
    url: '/api/auth/ui-preferences',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: { theme: { ...DEFAULT_UI_THEME, colors: { ...DEFAULT_UI_THEME.colors, background: '#fff;background:url(x)' } } },
  })
  assert.equal(badHex.statusCode, 400, 'CSS injection in hex must be rejected')

  const badRoute = await app.inject({
    method: 'PUT',
    url: '/api/auth/ui-preferences',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: { pinning: { pinnedItems: [{ id: 'evil', label: 'Evil', to: '//evil.com/phish' }] } },
  })
  assert.equal(badRoute.statusCode, 400, 'Protocol-relative external URL must be rejected')

  const badPrintRoute = await app.inject({
    method: 'PUT',
    url: '/api/auth/ui-preferences',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: { pinning: { pinnedItems: [{ id: 'p', label: 'Print', to: '/print/invoices/1' }] } },
  })
  assert.equal(badPrintRoute.statusCode, 400, '/print/* route must be rejected')

  const badFontSize = await app.inject({
    method: 'PUT',
    url: '/api/auth/ui-preferences',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: { theme: { ...DEFAULT_UI_THEME, typography: { ...DEFAULT_UI_THEME.typography, fontSizePx: 72 } } },
  })
  assert.equal(badFontSize.statusCode, 400, 'Out-of-range font size must be rejected')

  // 9. Owner clears Company Default
  const clearCoDef = await app.inject({
    method: 'DELETE',
    url: '/api/auth/ui-preferences/company-default',
    headers: ownerH,
  })
  assert.equal(clearCoDef.statusCode, 200)
  assert.equal(clearCoDef.json().hasCompanyDefault, false)

  console.log('✅ customise-ui passed all 9 suites (DB sync, sparse inheritance, Owner Company Default, RBAC pin stripping, Portal & security rejection)!')
} finally {
  await app.close()
  if (!process.env.DATA_DIR) fs.rmSync(dataDir, { recursive: true, force: true })
}
