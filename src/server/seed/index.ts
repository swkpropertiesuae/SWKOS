import { q } from '../db'
import { config } from '../config'
import { createRecord,getDef,SYSTEM_CTX } from '../engine'
import { nowIso } from '../util'
import * as D from './data'
import { seedCompanyDocuments } from './company-documents'
import { seedCompliance } from './compliance'
import { syncStudioLibrary } from '../studio/library'
import { hashPassword,verifyPassword } from '../auth'
import { SWK_STAFF_ACCOUNTS,SWK_OWNER_ACCOUNT,SWK_ADMIN_ACCOUNT,RESTRICTED_STAFF_PERMISSIONS,OFFICE_ADMIN_PERMISSIONS,HR_ROLE_PERMISSIONS,swkPatternPassword,hardcodedAccountFor,type SwkHardcodedStaffAccount } from '../../shared/swk-staff-access'
import crypto from 'node:crypto'

function resolveStaffAccountPassword(acc: SwkHardcodedStaffAccount): string {
  // Production: only low-privilege staff start on the name pattern, and must change it at first sign-in. Owner, Admin and Manager never do: the pattern is readable in the repo.
  if (config.isProd && !acc.fullAccess && acc.roleName !== 'Manager') return swkPatternPassword(acc.email)
  if (acc.roleName === 'Owner') return config.accounts.ownerPassword
  if (acc.roleName === 'Admin') return config.accounts.adminSwkPassword
  if (process.env.SWK_DEV_FIXTURE_PASSWORD) return process.env.SWK_DEV_FIXTURE_PASSWORD
  if (acc.roleName === 'Manager') return config.accounts.managerPassword
  return config.accounts.bdmPassword
}

const idOf = (table: string, col: string, val: string) => q.val<number>(`SELECT id FROM ${table} WHERE ${col} = ? AND deleted_at IS NULL`, val)

export async function seedReference(opts: { users?: boolean; demo?: boolean } = {}) {
  const seededSet = new Set(q.all<{ key: string }>(`SELECT key FROM settings WHERE key LIKE 'seed:%'`).map(r => r.key))
  const done = (g: string) => seededSet.has(`seed:${g}`)
  const mark = (g: string) => {
    seededSet.add(`seed:${g}`)
    q.run(`INSERT INTO settings(key, value, updated_at) VALUES (?, '1', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, `seed:${g}`, nowIso())
  }
  const withUsers = opts.users !== false
  const mk = (key: string, payload: Record<string, any>) => createRecord(getDef(key), payload, SYSTEM_CTX)

  if (!done('branches')) {
    mk('branches', { code: 'DXB', name: 'Dubai – Head Office', city: 'Dubai', country: 'United Arab Emirates', is_head_office: true, active: true })
    mark('branches')
  }
  if (!done('legal_entity')) {
    const id = mk('legal_entities', { code: 'SWK', name: 'SWK Properties L.L.C.', base_currency: config.baseCurrency, is_default: true, active: true }).id
    q.run(`UPDATE branches SET legal_entity_id = ? WHERE legal_entity_id IS NULL`, id)
    mark('legal_entity')
  }
  if (!done('departments')) {
    for (const [code, name] of [
      ['OFFPLAN', 'Sales of Off-Plan Projects'],
      ['SECONDARY', 'Secondary Projects'],
      ['LEASING', 'Leasing Department'],
      ['OPS', 'Operations'],
      ['SAL', 'Sales & Business Development'],
      ['LEA', 'Leasing'],
      ['PM', 'Property Management'],
      ['ACC', 'Accounts & Finance'],
      ['DOC', 'Documentation & Conveyancing'],
      ['HR', 'Human Resources'],
      ['IT', 'BDM, Digital Marketing & IT'],
      ['MGT', 'Management'],
    ]) mk('departments', { code, name })
    mark('departments')
  }
  if (!done('departments_swk_v2')) {
    for (const [code, name] of [
      ['OFFPLAN', 'Sales of Off-Plan Projects'],
      ['SECONDARY', 'Secondary Projects'],
      ['LEASING', 'Leasing Department'],
      ['IT', 'BDM, Digital Marketing & IT'],
    ]) {
      if (!idOf('departments', 'code', code)) mk('departments', { code, name })
    }
    mark('departments_swk_v2')
  }
  if (!done('roles')) {
    const V = ['view'], VE = ['view', 'export'], CRUD = ['view', 'create', 'edit', 'delete', 'export'], CE = ['view', 'create', 'edit', 'export'], ALL_MOD = ['view', 'create', 'edit', 'delete', 'approve', 'export']
    const roles = [
      { name: 'Admin', description: 'Full-Access System & Operations Administrator (admin@swk.properties) – Complete operational, CRM, ERP, finance, HR, portal & system administration access across SWK Properties OS, operating under the direct supervisory control of Owner Shabib Siraj (shabib@swk.properties)', system: true, permissions: '*' },
      { name: 'Owner', description: 'Company Owner & Managing Director (shabib@swk.properties – Shabib Siraj) – Supreme authority over all company operations, approvals, deletions, and direct supervisory control over admin@swk.properties', system: true, permissions: '*' },
      {
        name: 'Manager',
        description: 'Manager (Mohammad Haseeb) – Majority operational access; administrative decisions and record deletions require Owner approval',
        system: true,
        permissions: {
          dashboard: ALL_MOD, crm: ALL_MOD, sales: ALL_MOD, properties: ALL_MOD, mandates: ALL_MOD,
          transactions: ALL_MOD, leases: ALL_MOD, finance: ALL_MOD, assets: ALL_MOD, hr: ALL_MOD,
          support: ALL_MOD, projects: ALL_MOD, documents: ALL_MOD, compliance: ALL_MOD, ai: ALL_MOD,
          reports: ALL_MOD, masters: ALL_MOD, admin: V,
        },
      },
      {
        name: 'BDM & IT Admin',
        description: 'BDM & IT Admin (Talha Shabbir) – CRM, ERP, Digital Marketing, Portal Syndication (Bayut/Dubizzle) & IT Administration',
        system: true,
        permissions: {
          dashboard: ALL_MOD, crm: ALL_MOD, sales: ALL_MOD, properties: ALL_MOD, mandates: ALL_MOD,
          transactions: CE, leases: ALL_MOD, finance: VE, assets: CE, hr: V,
          support: ALL_MOD, projects: ALL_MOD, documents: ALL_MOD, compliance: VE, ai: ALL_MOD,
          reports: ALL_MOD, masters: ALL_MOD, admin: ['view', 'create', 'edit', 'export'],
        },
      },
      {
        name: 'Sales Advisor',
        description: 'Sales Advisor (Company Visa, Zero Basic Salary, 50-50% Commission Split with SWK Properties)',
        system: true,
        permissions: { dashboard: V, crm: CRUD, sales: [...CRUD, 'approve', 'export'], properties: CE, mandates: CE, transactions: CE, leases: CE, hr: CE, documents: CE, support: CE, projects: CRUD, reports: VE, masters: V },
      },
      { name: 'Sales', description: 'CRM, quotations and customer follow-up (Sales Advisor 50/50 split)', permissions: { dashboard: V, crm: CRUD, sales: [...CRUD, 'approve', 'export'], properties: CE, mandates: CE, transactions: CE, leases: CE, hr: CE, documents: CE, support: CE, projects: CRUD, reports: VE, masters: V } },
      { name: 'Operations', description: 'Deals, leases, transactions and properties', permissions: { dashboard: V, crm: V, sales: CRUD, leases: CRUD, transactions: CRUD, properties: CRUD, mandates: CRUD, hr: CE, compliance: V, documents: CRUD, support: CE, projects: CRUD, reports: VE, masters: V } },
      { name: 'Accounts', description: 'Invoicing, bills, banking and financial reports', permissions: { dashboard: V, crm: V, sales: V, finance: [...CRUD, 'approve'], documents: CE, reports: VE, masters: CE, hr: V, leases: CRUD } },
      { name: 'Property Mgmt', description: 'Leases, maintenance and inspections', permissions: { dashboard: V, sales: V, leases: CRUD, documents: CE, projects: CE, masters: V } },
      { name: 'HR', description: 'Employees, leave, attendance and payroll', permissions: { dashboard: V, hr: [...CRUD, 'approve'], documents: CE, projects: CE, masters: V } },
      { name: 'Viewer', description: 'Read-only access to business modules', permissions: { dashboard: V, crm: V, sales: V, leases: V, transactions: V, properties: V, finance: V, support: V, projects: V, documents: V, reports: V } },
      { name: 'Customer Portal', description: 'External customers — own deals, invoices and documents only', permissions: { dashboard: V, crm: V, sales: V, finance: V, leases: V, mandates: V, transactions: V, documents: V, support: ['view', 'create'] } },
    ]
    for (const r of roles) mk('roles', { name: r.name, description: r.description, is_system: r.system || false, permissions: r.permissions })
    q.run(`UPDATE roles SET is_system = 1 WHERE name IN ('Admin','Owner','Manager','BDM & IT Admin','Sales Advisor')`)
    mark('roles')
  }
  if (!done('roles_swk_v2')) {
    const V = ['view'], VE = ['view', 'export'], CRUD = ['view', 'create', 'edit', 'delete', 'export'], CE = ['view', 'create', 'edit', 'export'], ALL_MOD = ['view', 'create', 'edit', 'delete', 'approve', 'export']
    if (!idOf('roles', 'name', 'Owner')) mk('roles', { name: 'Owner', description: 'Company Owner & Managing Director (shabib@swk.properties – Shabib Siraj) – Supreme authority over all company operations, approvals, deletions, and direct supervisory control over admin@swk.properties', is_system: true, permissions: '*' })
    if (!idOf('roles', 'name', 'BDM & IT Admin')) mk('roles', { name: 'BDM & IT Admin', description: 'BDM & IT Admin (Talha Shabbir) – CRM, ERP, Digital Marketing, Portal Syndication & IT Admin', is_system: true, permissions: { dashboard: ALL_MOD, crm: ALL_MOD, sales: ALL_MOD, properties: ALL_MOD, mandates: ALL_MOD, transactions: CE, leases: ALL_MOD, finance: VE, assets: CE, hr: V, support: ALL_MOD, projects: ALL_MOD, documents: ALL_MOD, compliance: VE, ai: ALL_MOD, reports: ALL_MOD, masters: ALL_MOD, admin: ['view', 'create', 'edit', 'export'] } })
    if (!idOf('roles', 'name', 'Sales Advisor')) mk('roles', { name: 'Sales Advisor', description: 'Sales Advisor (Company Visa, Zero Basic Salary, 50-50% Commission Split)', is_system: true, permissions: { dashboard: V, crm: CRUD, sales: [...CRUD, 'approve', 'export'], properties: CE, mandates: CE, transactions: CE, leases: CE, hr: CE, documents: CE, support: CE, projects: CRUD, reports: VE, masters: V } })
    mark('roles_swk_v2')
  }
  // Staff accounts come only from ensureHardcodedSwkStaffAccounts (owner, admin, manager and staff @swk.properties); no legacy @swkpropertiesuae.com users.
  if (!done('countries')) {
    const names = new Intl.DisplayNames(['en'], { type: 'region' })
    for (const code of D.ISO_COUNTRIES) {
      let name = code
      try { name = names.of(code) ?? code } catch { /* keep code */ }
      const region = D.REGIONS.find(([, s]) => s.has(code))?.[0] ?? 'Other'
      mk('countries', { code, name, region, currency: D.CURRENCY_BY_COUNTRY[code] ?? null, active: true })
    }
    mark('countries')
  }
  if (!done('currencies')) {
    for (const [code, name, symbol] of D.CURRENCIES) mk('currencies', { code, name, symbol, rate: code === 'AED' ? 1 : code === 'USD' ? 3.6725 : null, active: true })
    mark('currencies')
  }
  if (!done('vat')) { for (const [code, name, rate, category] of D.VAT_CODES) mk('vat_codes', { code, name, rate, category }); mark('vat') }
  if (!done('terms')) { for (const [name, days] of D.PAYMENT_TERMS) mk('payment_terms', { name, days }); mark('terms') }
  if (!done('accounts')) {
    for (const [code, name, type, subtype, role] of D.ACCOUNTS) mk('accounts', { code, name, type, subtype, role: role ?? '', active: true })
    mark('accounts')
  }
  // Added after first release: databases created earlier receive the rounding account without disturbing their existing chart.
  if (!done('accounts_rounding')) {
    if (!idOf('accounts', 'code', '7910') && !q.val(`SELECT 1 FROM accounts WHERE role = 'rounding' AND deleted_at IS NULL`)) mk('accounts', { code: '7910', name: 'Rounding differences', type: 'Expense', subtype: 'Operating expense', role: 'rounding', active: true })
    mark('accounts_rounding')
  }
  if (!done('charges')) {
    for (const [code, name, applies_to, group, vat, inc, cost] of D.CHARGE_CODES) {
      mk('charge_codes', { code, name, applies_to, group, vat_code_id: idOf('vat_codes', 'code', vat), income_account_id: idOf('accounts', 'code', inc), cost_account_id: idOf('accounts', 'code', cost), active: true })
    }
    mark('charges')
  }
  if (!done('banks')) {
    mk('bank_accounts', { name: 'Main operating account (AED)', type: 'Bank', currency: 'AED', gl_account_id: idOf('accounts', 'code', '1100'), active: true })
    mk('bank_accounts', { name: 'Cash in hand', type: 'Cash', currency: 'AED', gl_account_id: idOf('accounts', 'code', '1000'), active: true })
    mk('bank_accounts', { name: 'Petty cash', type: 'Petty cash', currency: 'AED', gl_account_id: idOf('accounts', 'code', '1010'), active: true })
    mark('banks')
  }
  if (!done('communities')) {
    for (const [code, name, emirate, area, master_developer, avg_price_sqft, avg_rent_annual] of [
      ['MARINA', 'Dubai Marina', 'Dubai', 'Dubai', 'Emaar Properties', 2290, 160000],
      ['DOWNTOWN', 'Downtown Dubai', 'Dubai', 'Dubai', 'Emaar Properties', 2980, 195000],
      ['PALM', 'Palm Jumeirah', 'Dubai', 'Dubai', 'Nakheel', 4380, 260000],
      ['BBAY', 'Business Bay', 'Dubai', 'Dubai', 'Dubai Properties', 2180, 150000],
      ['DHILLS', 'Dubai Hills Estate', 'Dubai', 'Dubai', 'Emaar Properties', 2390, 170000],
      ['CREEK', 'Dubai Creek Harbour', 'Dubai', 'Dubai', 'Emaar Properties', 2320, 150000],
      ['JVC', 'Jumeirah Village Circle', 'Dubai', 'Dubai', 'Nakheel', 1320, 105000],
      ['JLT', 'Jumeirah Lakes Towers (JLT)', 'Dubai', 'Dubai', 'DMCC', 1680, 125000],
      ['ARANCHES', 'Arabian Ranches', 'Dubai', 'Dubai', 'Emaar Properties', 1950, 240000],
      ['SZR', 'Sheikh Zayed Road', 'Dubai', 'Dubai', 'Meraas', 1920, 140000],
      ['DIFC', 'DIFC', 'Dubai', 'Dubai', 'DIFC Authority', 3100, 210000],
      ['MBR', 'MBR City & Sobha Hartland', 'Dubai', 'Dubai', 'Meydan / Sobha Realty', 2240, 155000],
      ['EBEACH', 'Emaar Beachfront', 'Dubai', 'Dubai', 'Emaar Properties', 3850, 240000],
      ['PJEBEL', 'Palm Jebel Ali', 'Dubai', 'Dubai', 'Nakheel', 3250, 290000],
      ['DSOUTH', 'Dubai South & Expo City', 'Dubai', 'Dubai', 'Dubai South', 1290, 88000],
      ['DAMACH', 'DAMAC Hills & DAMAC Lagoons', 'Dubai', 'Dubai', 'DAMAC Properties', 1540, 145000],
      ['FURJAN', 'Al Furjan', 'Dubai', 'Dubai', 'Nakheel', 1420, 118000],
      ['ARJAN', 'Arjan & Miracle Garden', 'Dubai', 'Dubai', 'Dubai Holding', 1350, 92000],
      ['BARARI', 'Al Barari', 'Dubai', 'Dubai', 'Al Barari', 2650, 420000],
      ['DISLANDS', 'Dubai Islands', 'Dubai', 'Dubai', 'Nakheel', 2480, 185000],
      ['CITYWALK', 'City Walk & Jumeirah', 'Dubai', 'Dubai', 'Meraas', 2890, 210000],
      ['BLUEW', 'Bluewaters Island', 'Dubai', 'Dubai', 'Meraas', 4650, 320000],
      ['JGE', 'Jumeirah Golf Estates', 'Dubai', 'Dubai', 'Wasl / JGE', 2120, 285000],
      ['MOTOR', 'Motor City & Sports City', 'Dubai', 'Dubai', 'Union Properties', 1260, 96000],
    ] as const) {
      if (!idOf('communities', 'code', code)) mk('communities', { code, name, emirate, area, master_developer, avg_price_sqft, avg_rent_annual, active: true })
    }
    mark('communities')
  }
  if (!done('communities_swk_v2')) {
    for (const [code, name, emirate, area, master_developer, avg_price_sqft, avg_rent_annual] of [
      ['JLT', 'Jumeirah Lakes Towers (JLT)', 'Dubai', 'Dubai', 'DMCC', 1680, 125000],
      ['MBR', 'MBR City & Sobha Hartland', 'Dubai', 'Dubai', 'Meydan / Sobha Realty', 2240, 155000],
      ['EBEACH', 'Emaar Beachfront', 'Dubai', 'Dubai', 'Emaar Properties', 3850, 240000],
      ['PJEBEL', 'Palm Jebel Ali', 'Dubai', 'Dubai', 'Nakheel', 3250, 290000],
      ['DSOUTH', 'Dubai South & Expo City', 'Dubai', 'Dubai', 'Dubai South', 1290, 88000],
      ['DAMACH', 'DAMAC Hills & DAMAC Lagoons', 'Dubai', 'Dubai', 'DAMAC Properties', 1540, 145000],
      ['FURJAN', 'Al Furjan', 'Dubai', 'Dubai', 'Nakheel', 1420, 118000],
      ['ARJAN', 'Arjan & Miracle Garden', 'Dubai', 'Dubai', 'Dubai Holding', 1350, 92000],
      ['BARARI', 'Al Barari', 'Dubai', 'Dubai', 'Al Barari', 2650, 420000],
      ['DISLANDS', 'Dubai Islands', 'Dubai', 'Dubai', 'Nakheel', 2480, 185000],
      ['CITYWALK', 'City Walk & Jumeirah', 'Dubai', 'Dubai', 'Meraas', 2890, 210000],
      ['BLUEW', 'Bluewaters Island', 'Dubai', 'Dubai', 'Meraas', 4650, 320000],
      ['JGE', 'Jumeirah Golf Estates', 'Dubai', 'Dubai', 'Wasl / JGE', 2120, 285000],
      ['MOTOR', 'Motor City & Sports City', 'Dubai', 'Dubai', 'Union Properties', 1260, 96000],
    ] as const) {
      if (!idOf('communities', 'code', code)) mk('communities', { code, name, emirate, area, master_developer, avg_price_sqft, avg_rent_annual, active: true })
    }
    mark('communities_swk_v2')
  }
  if (!done('developers')) {
    for (const [code, name, rera_id, website] of [
      ['EMAAR', 'Emaar Properties', 'DEV-001', 'https://www.emaar.com'],
      ['NAKHEEL', 'Nakheel', 'DEV-002', 'https://www.nakheel.com'],
      ['DAMAC', 'DAMAC Properties', 'DEV-003', 'https://www.damacproperties.com'],
      ['SOBHA', 'Sobha Realty', 'DEV-004', 'https://www.sobharealty.com'],
      ['MERAAS', 'Meraas', 'DEV-005', 'https://www.meraas.com'],
      ['ELLINGTON', 'Ellington Properties', 'DEV-006', 'https://www.ellingtonproperties.ae'],
      ['SELECT', 'Select Group', 'DEV-007', 'https://www.select-group.ae'],
      ['BINGHATTI', 'Binghatti', 'DEV-008', 'https://www.binghatti.com'],
      ['OMNIYAT', 'Omniyat', 'DEV-009', 'https://www.omniyat.com'],
      ['ALDAR', 'Aldar Properties', 'DEV-010', 'https://www.aldar.com'],
    ] as const) {
      mk('developers', { code, name, rera_id, website, active: true })
    }
    mark('developers')
  }
  if (!done('compliance')) { seedCompliance({ demo: opts.demo }); mark('compliance') }
  if (!opts.demo && !done('company_documents_20261123')) {
    seedCompanyDocuments()
    mark('company_documents_20261015')
    mark('document_presentation_20261015')
    mark('company_documents_20261123')
  }
  if (withUsers && !opts.demo && !done('swk_staff_accounts_v2')) {
    ensureHardcodedSwkStaffAccounts()
    mark('swk_staff_accounts_v2')
  }
  // syncStudioLibrary() hashes library.json and skips in one query when up to date,
  // so existing deployments automatically refresh all built-in Document Studio templates.
  syncStudioLibrary()
}

/**
 * Ensures:
 * 1. The former Shabib Siraj Admin account is converted into the dedicated Full-Access Admin account
 *    (admin@swk.properties / Password: Admin@swk.properties) under Owner control.
 * 2. A fresh Owner account with full access (shabib@swk.properties / Password: Shabib@swk.properties)
 *    exists for Shabib Siraj with direct supervisory control over admin@swk.properties.
 * 3. The 6 official @swk.property staff accounts (Haseeb, Talha, Fareed, Shahid, Umar, Saifullah)
 *    exist with their hardcoded credentials, roles, and employee profiles.
 */
function findStaffUserRow(email: string): { id: number; email: string; password_hash: string; must_change_password: number; active: number } | undefined {
  const clean = email.trim().toLowerCase()
  const acc = hardcodedAccountFor(clean)
  const candidates = acc ? [acc.email.toLowerCase(), ...acc.aliases.map(a => a.toLowerCase())] : [clean]
  for (const cand of candidates) {
    const row = q.get<{ id: number; email: string; password_hash: string; must_change_password: number; active: number }>(
      `SELECT id, email, password_hash, must_change_password, active FROM users WHERE lower(email) = ? AND party_id IS NULL AND deleted_at IS NULL LIMIT 1`,
      cand,
    )
    if (row) return row
  }
  return undefined
}

/** A NEW Owner, Admin, or Manager password set as an environment secret takes effect on the next container start. The same secret is applied only once, so a personal password set later in the app is not overwritten on every restart. */
export function applyConfiguredPasswords(opts?: { forceEmails?: Set<string> }) {
  // The Admin cannot change the Owner (by design), so each leadership account has its own environment secret.
  const targets: [string | undefined, string, string, string][] = [
    [process.env.ADMIN_SWK_PASSWORD?.trim() || process.env.ADMIN_PASSWORD?.trim(), 'admin@swk.properties', 'pwsecret:admin', 'admin-secret:'],
    [process.env.OWNER_PASSWORD?.trim(), 'shabib@swk.properties', 'pwsecret:owner', 'owner-secret:'],
    [process.env.MANAGER_PASSWORD?.trim(), 'haseeb@swk.properties', 'pwsecret:manager', 'manager-secret:'],
  ]
  for (const [pw, email, key, salt] of targets) {
    if (!pw) continue
    const row = findStaffUserRow(email)
    if (!row) continue
    const mark = crypto.createHash('sha256').update(salt + pw).digest('hex')
    const force = Boolean(opts?.forceEmails?.has(email))
    if (!force && q.val(`SELECT value FROM settings WHERE key = ?`, key) === mark) continue
    q.run(`INSERT INTO settings(key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, key, mark, nowIso())
    if (verifyPassword(pw, row.password_hash)) {
      q.run(`UPDATE users SET must_change_password = 0, failed_logins = 0, locked_until = NULL, active = 1, updated_at = ? WHERE id = ?`, nowIso(), row.id)
      continue
    }
    q.run(`UPDATE users SET password_hash = ?, must_change_password = 0, failed_logins = 0, locked_until = NULL, active = 1, updated_at = ? WHERE id = ?`, hashPassword(pw), nowIso(), row.id)
    q.run(`DELETE FROM sessions WHERE user_id = ?`, row.id)
    console.log(`Password for ${email} set from its environment secret.`)
  }
}

/**
 * Production, once: recover accounts whose passwords were overwritten with unreadable one-time random strings
 * by commit a28edb2's retireSwk2026PatternPasswords() (recorded under settings key 'pwreset:retire-swk2026-pattern').
 * - Personal passwords (must_change_password = 0) are NEVER touched.
 * - Any account that was clobbered into must_change_password = 1 is restored:
 *   * Owner / Admin / Manager: restored to their configured .env secret if present (must_change_password = 0),
 *     otherwise to their temporary Firstname@swk2026 pattern with must_change_password = 1 so they can sign in and set a personal password.
 *   * Staff: restored to their documented temporary Firstname@swk2026 pattern with must_change_password = 1.
 * - All temporary login lockouts on internal accounts are cleared so staff and Admin can sign in immediately.
 */
export function recoverFromRetiredPatternPasswords() {
  const retiredKey = 'pwreset:retire-swk2026-pattern'
  const recoveryKey = 'pwreset:recover-retired-2026-11-25'
  if (!config.isProd) return
  if (!q.val(`SELECT 1 FROM settings WHERE key = ?`, retiredKey)) return
  if (q.val(`SELECT 1 FROM settings WHERE key = ?`, recoveryKey)) return

  // Clear temporary lockouts accumulated while logins were broken.
  q.run(`UPDATE users SET failed_logins = 0, locked_until = NULL WHERE deleted_at IS NULL AND party_id IS NULL`)

  const envByEmail: Record<string, string | undefined> = {
    'admin@swk.properties': process.env.ADMIN_SWK_PASSWORD?.trim() || process.env.ADMIN_PASSWORD?.trim(),
    'shabib@swk.properties': process.env.OWNER_PASSWORD?.trim(),
    'haseeb@swk.properties': process.env.MANAGER_PASSWORD?.trim(),
  }
  const forceEnvEmails = new Set<string>()
  let recovered = 0

  for (const acc of SWK_STAFF_ACCOUNTS) {
    const email = acc.email.toLowerCase()
    const row = findStaffUserRow(email)
    if (!row || !row.must_change_password) continue
    if (envByEmail[email]) {
      forceEnvEmails.add(email)
      recovered++
      continue
    }
    q.run(
      `UPDATE users SET password_hash = ?, must_change_password = 1, failed_logins = 0, locked_until = NULL, active = 1, updated_at = ? WHERE id = ?`,
      hashPassword(swkPatternPassword(acc.email)),
      nowIso(),
      row.id,
    )
    q.run(`DELETE FROM sessions WHERE user_id = ?`, row.id)
    recovered++
  }

  if (forceEnvEmails.size > 0) {
    applyConfiguredPasswords({ forceEmails: forceEnvEmails })
  }

  q.run(
    `INSERT INTO settings(key, value, updated_at) VALUES (?, '1', ?) ON CONFLICT(key) DO UPDATE SET value = '1', updated_at = excluded.updated_at`,
    recoveryKey,
    nowIso(),
  )
  console.log(`Recovered ${recovered} account(s) affected by retired pattern-password reset; lockouts cleared.`)
}

/** Production, once: every non-leadership staff account gets the temporary name pattern password (Talha@swk2026 …) and must change it at first sign-in. Their open sessions end. */
export function applySwk2026Passwords() {
  const key = 'pwreset:swk2026-pattern'
  if (!config.isProd || q.val(`SELECT 1 FROM settings WHERE key = ?`, key)) return
  let n = 0
  for (const acc of SWK_STAFF_ACCOUNTS) {
    if (acc.roleName === 'Manager' || acc.fullAccess) continue
    const row = findStaffUserRow(acc.email)
    if (!row) continue
    q.run(`UPDATE users SET password_hash = ?, must_change_password = 1, failed_logins = 0, locked_until = NULL, active = 1, updated_at = ? WHERE id = ?`, hashPassword(swkPatternPassword(acc.email)), nowIso(), row.id)
    q.run(`DELETE FROM sessions WHERE user_id = ?`, row.id)
    n++
  }
  q.run(`INSERT INTO settings(key, value, updated_at) VALUES (?, '1', ?)`, key, nowIso())
  console.log(`Name-pattern passwords set for ${n} account(s) (Manager unchanged).`)
}

/** One-time reset of passwords. Set PASSWORD_RESET_ID (any new text) with OWNER_PASSWORD, ADMIN_SWK_PASSWORD, MANAGER_PASSWORD and/or BDM_PASSWORD (or PASSWORD_RESET_SUFFIX); each id runs once, so later restarts keep personal passwords. */
export function applyPasswordReset() {
  const id = process.env.PASSWORD_RESET_ID?.trim()
  if (!id) return
  const key = `pwreset:${id}`
  if (q.get(`SELECT 1 AS x FROM settings WHERE key = ?`, key)) return
  // PASSWORD_RESET_SUFFIX gives each person their own temporary password: first name + suffix (haseeb + 123). The repo never holds a password.
  const suffix = process.env.PASSWORD_RESET_SUFFIX?.trim()
  const set = (emails: string[], pw: string | undefined, mustChange = 1) => {
    const cleanPw = pw?.trim()
    if (!cleanPw && !suffix) return 0
    let n = 0
    for (const email of emails) {
      const own = suffix ? email.split('@')[0] + suffix : cleanPw!
      const row = findStaffUserRow(email)
      if (!row) continue
      q.run(`UPDATE users SET password_hash = ?, must_change_password = ?, failed_logins = 0, locked_until = NULL, active = 1, updated_at = ? WHERE id = ?`, hashPassword(own), mustChange, nowIso(), row.id)
      q.run(`DELETE FROM sessions WHERE user_id = ?`, row.id)
      n++
    }
    return n
  }
  const owner = process.env.OWNER_PASSWORD?.trim() ? set(['shabib@swk.properties'], process.env.OWNER_PASSWORD, 0) : 0
  const admin = (process.env.ADMIN_SWK_PASSWORD?.trim() || process.env.ADMIN_PASSWORD?.trim())
    ? set(['admin@swk.properties'], process.env.ADMIN_SWK_PASSWORD?.trim() || process.env.ADMIN_PASSWORD?.trim(), 0)
    : 0
  const mgr = set(['haseeb@swk.properties'], process.env.MANAGER_PASSWORD)
  const staff = set(SWK_STAFF_ACCOUNTS.filter(a => !a.fullAccess && a.roleName !== 'Manager').map(a => a.email), process.env.BDM_PASSWORD)
  q.run(`INSERT INTO settings(key, value, updated_at) VALUES (?, ?, ?)`, key, JSON.stringify(true), nowIso())
  console.log(`Password reset ${id}: owner ${owner}, admin ${admin}, manager ${mgr}, staff ${staff} account(s).`)
}

/**
 * Runs on every start. Moves a staff user whose official email changed (fareed@swk.properties -> fareed@swk.rent)
 * and creates any roster account that has no user yet (including Owner, Admin, Manager and staff). Never changes an existing user's password or role.
 */
export function syncSwkStaffRoster() {
  const staffRoleId = idOf('roles', 'name', 'Staff (Attendance & General)')
  const dxb = idOf('branches', 'code', 'DXB') ?? 1
  const dept = (code: string) => idOf('departments', 'code', code) ?? idOf('departments', 'code', 'MGT') ?? 1
  const userIdBy = (email: string) => q.val<number>(`SELECT id FROM users WHERE lower(email) = ? AND deleted_at IS NULL LIMIT 1`, email.toLowerCase())
  for (const acc of SWK_STAFF_ACCOUNTS) {
    let userId = userIdBy(acc.email)
    if (!userId) {
      const oldId = acc.aliases.map(userIdBy).find(Boolean)
      if (oldId) {
        q.run(`UPDATE users SET email = ?, updated_at = ? WHERE id = ?`, acc.displayEmail, nowIso(), oldId)
        q.run(`UPDATE employees SET email = ?, updated_at = ? WHERE user_id = ? AND deleted_at IS NULL`, acc.displayEmail, nowIso(), oldId)
        console.log(`Staff email moved to ${acc.displayEmail}.`)
        continue
      }
    }
    const roleId = idOf('roles', 'name', acc.roleName) ?? staffRoleId
    if (userId || !roleId) continue
    const pw = resolveStaffAccountPassword(acc)
    const isLeadership = acc.fullAccess || acc.roleName === 'Manager'
    userId = createRecord(getDef('users'), {
      name: acc.name, email: acc.displayEmail, password: pw, role_id: roleId, branch_id: dxb,
      department_id: dept(acc.departmentCode), designation: acc.designation, active: true, must_change_password: !isLeadership,
    }, SYSTEM_CTX).id
    const envKey = acc.roleName === 'Owner' ? 'OWNER_PASSWORD' : acc.roleName === 'Admin' ? 'ADMIN_SWK_PASSWORD' : acc.roleName === 'Manager' ? 'MANAGER_PASSWORD' : 'BDM_PASSWORD'
    if (isLeadership && config.isProd && !process.env[envKey]?.trim() && !(acc.roleName === 'Admin' && process.env.ADMIN_PASSWORD?.trim())) {
      console.warn(`[staff] ${acc.email} recreated with a generated password (${envKey} is not set): ${pw}`)
    }
    const empId = q.val<number>(`SELECT id FROM employees WHERE (emp_no = ? OR lower(email) = ?) AND deleted_at IS NULL LIMIT 1`, acc.empNo, acc.email.toLowerCase())
    if (empId) q.run(`UPDATE employees SET user_id = ?, email = ?, updated_at = ? WHERE id = ?`, userId, acc.displayEmail, nowIso(), empId)
    else createRecord(getDef('employees'), {
      emp_no: acc.empNo, name: acc.name, user_id: userId, department_id: dept(acc.departmentCode), designation: acc.designation,
      branch_id: dxb, status: 'Active', join_date: nowIso().slice(0, 10), contract_type: 'Unlimited', phone: acc.phone, email: acc.displayEmail,
      compensation_model: acc.fullAccess || acc.roleName === 'HR' || acc.roleName === 'Office Admin' ? 'Salaried Management / Operations' : 'Commission Only (50/50 Company Visa – 0 Basic)',
      company_visa_sponsored: true,
      commission_split_company_pct: 50, commission_split_agent_pct: 50, basic_salary: 0,
    }, SYSTEM_CTX)
    console.log(`[staff] ${acc.email} created.`)
  }
}

export function ensureHardcodedSwkStaffAccounts() {
  const mk = (key: string, payload: Record<string, any>) => createRecord(getDef(key), payload, SYSTEM_CTX)
  const dxb = idOf('branches', 'code', 'DXB') ?? 1
  const dept = (code: string) => idOf('departments', 'code', code) ?? idOf('departments', 'code', 'MGT') ?? 1

  // 1. Ensure Owner, Admin, and restricted 'Staff (Attendance & General)' roles exist with clear descriptions
  const ownerDesc = 'Company Owner & Managing Director (shabib@swk.properties – Shabib Siraj) – Supreme authority over all company operations, approvals, deletions, and direct supervisory control over admin@swk.properties'
  const adminDesc = 'Full-Access System & Operations Administrator (admin@swk.properties) – Complete operational, CRM, ERP, finance, HR, portal & system administration access across SWK Properties OS, operating under the direct supervisory control of Owner Shabib Siraj (shabib@swk.properties)'

  let ownerRoleId = idOf('roles', 'name', 'Owner')
  if (!ownerRoleId) {
    ownerRoleId = mk('roles', {
      name: 'Owner',
      description: ownerDesc,
      is_system: true,
      permissions: '*',
    }).id
  } else {
    q.run(`UPDATE roles SET description = ?, is_system = 1, permissions = '"*"', updated_at = ? WHERE id = ?`, ownerDesc, nowIso(), ownerRoleId)
  }

  let adminRoleId = idOf('roles', 'name', 'Admin')
  if (!adminRoleId) {
    adminRoleId = mk('roles', {
      name: 'Admin',
      description: adminDesc,
      is_system: true,
      permissions: '*',
    }).id
  } else {
    q.run(`UPDATE roles SET description = ?, is_system = 1, permissions = '"*"', updated_at = ? WHERE id = ?`, adminDesc, nowIso(), adminRoleId)
  }

  let staffRoleId = idOf('roles', 'name', 'Staff (Attendance & General)')
  if (!staffRoleId) {
    staffRoleId = mk('roles', {
      name: 'Staff (Attendance & General)',
      description: 'Restricted Staff Access – Attendance & QR Check-In, Company Manual, Market Pulse & General Only',
      is_system: true,
      permissions: RESTRICTED_STAFF_PERMISSIONS,
    }).id
  } else {
    q.run(
      `UPDATE roles SET permissions = ?, updated_at = ? WHERE id = ?`,
      JSON.stringify(RESTRICTED_STAFF_PERMISSIONS),
      nowIso(),
      staffRoleId,
    )
  }

  const managerRoleId = idOf('roles', 'name', 'Manager') ?? adminRoleId

  // HR (Rahaba Azeez) and Office Admin (Meenakshi) get their own roles; permissions are kept in sync on every start.
  const upsertRole = (name: string, description: string, permissions: Record<string, string[]>) => {
    const id = idOf('roles', 'name', name)
    if (!id) return mk('roles', { name, description, is_system: true, permissions }).id as number
    q.run(`UPDATE roles SET description = ?, permissions = ?, is_system = 1, updated_at = ? WHERE id = ?`, description, JSON.stringify(permissions), nowIso(), id)
    return id
  }
  const hrRoleId = upsertRole('HR', 'HR (Rahaba Azeez) – Employees, leave, attendance, payroll and HR documents with approvals', HR_ROLE_PERMISSIONS)
  const officeAdminRoleId = upsertRole('Office Admin', 'Office Admin (Meenakshi) – Reception, documents, calendar, support tickets and walk-in enquiries', OFFICE_ADMIN_PERMISSIONS)
  const officeRoleDone = Boolean(q.val(`SELECT 1 FROM settings WHERE key = 'seed:swk_hr_office_admin_roles_v1'`))

  // Convert legacy Shabib@swk.property Admin account into admin@swk.properties (if admin@swk.properties does not exist yet)
  const legacyShabibAdminId = q.val<number>(`SELECT id FROM users WHERE lower(email) = 'shabib@swk.property' AND deleted_at IS NULL LIMIT 1`)
  const existingAdminPropsId = q.val<number>(`SELECT id FROM users WHERE lower(email) = 'admin@swk.properties' AND deleted_at IS NULL LIMIT 1`)
  if (legacyShabibAdminId && !existingAdminPropsId) {
    q.run(
      `UPDATE users SET email = 'admin@swk.properties', name = 'SWK Admin', role_id = ?, designation = 'Full-Access System & Operations Administrator (Controlled by Owner Shabib Siraj)', password_hash = ?, must_change_password = 0, active = 1, updated_at = ? WHERE id = ?`,
      adminRoleId,
      hashPassword(resolveStaffAccountPassword(SWK_ADMIN_ACCOUNT)),
      nowIso(),
      legacyShabibAdminId,
    )
  } else if (legacyShabibAdminId && existingAdminPropsId && legacyShabibAdminId !== existingAdminPropsId) {
    q.run(`DELETE FROM users WHERE id = ?`, legacyShabibAdminId)
  }

  // Also ensure legacy admin@swkpropertiesuae.com reflects the converted Admin role (not Shabib Siraj)
  q.run(
    `UPDATE users SET name = 'SWK Admin', role_id = ?, designation = 'Full-Access System & Operations Administrator (Controlled by Owner Shabib Siraj)', updated_at = ? WHERE lower(email) = 'admin@swkpropertiesuae.com' AND deleted_at IS NULL`,
    adminRoleId,
    nowIso(),
  )
  // Ensure legacy shabib@swkpropertiesuae.com is assigned the Owner role
  q.run(
    `UPDATE users SET name = 'Shabib Siraj', role_id = ?, designation = 'Owner & Managing Director (Controls Admin & All Accounts)', password_hash = ?, must_change_password = 0, active = 1, updated_at = ? WHERE lower(email) = 'shabib@swkpropertiesuae.com' AND deleted_at IS NULL`,
    ownerRoleId,
    hashPassword(resolveStaffAccountPassword(SWK_OWNER_ACCOUNT)),
    nowIso(),
  )

  let shabibEmpId =
    q.val<number>(`SELECT id FROM employees WHERE lower(name) LIKE '%shabib%' AND deleted_at IS NULL ORDER BY id ASC LIMIT 1`) ?? null

  // 2. Sync Owner (shabib@swk.properties), Admin (admin@swk.properties), and the 6 @swk.property staff accounts
  for (const acc of SWK_STAFF_ACCOUNTS) {
    const targetRoleId =
      acc.roleName === 'Owner'
        ? ownerRoleId
        : acc.roleName === 'Admin'
          ? adminRoleId
          : acc.roleName === 'Manager'
            ? managerRoleId
            : acc.roleName === 'HR'
              ? hrRoleId
              : acc.roleName === 'Office Admin'
                ? officeAdminRoleId
                : staffRoleId

    const initialRoleSeedDone = Boolean(q.val(`SELECT 1 FROM settings WHERE key = 'seed:swk_staff_roles_v3'`))
    let userId = q.val<number>(`SELECT id FROM users WHERE lower(email) = ? AND deleted_at IS NULL LIMIT 1`, acc.email.toLowerCase())
    const resolvedPw = resolveStaffAccountPassword(acc)
    const pwHash = hashPassword(resolvedPw)

    if (!userId) {
      const created = mk('users', {
        name: acc.name,
        email: acc.displayEmail,
        password: resolvedPw,
        role_id: targetRoleId,
        branch_id: dxb,
        department_id: dept(acc.departmentCode),
        designation: acc.designation,
        active: true,
        must_change_password: false,
      })
      userId = created.id
      const envKey = acc.roleName === 'Owner' ? 'OWNER_PASSWORD' : acc.roleName === 'Admin' ? 'ADMIN_SWK_PASSWORD' : acc.roleName === 'Manager' ? 'MANAGER_PASSWORD' : 'BDM_PASSWORD'
      const wasGenerated =
        acc.roleName === 'Owner'
          ? config.accounts.ownerPasswordGenerated
          : acc.roleName === 'Admin'
            ? config.accounts.adminSwkPasswordGenerated
            : acc.roleName === 'Manager'
              ? config.accounts.managerPasswordGenerated
              : config.accounts.bdmPasswordGenerated
      if (wasGenerated && !process.env.SWK_DEV_FIXTURE_PASSWORD && !(config.isProd && !acc.fullAccess && acc.roleName !== 'Manager')) {
        console.warn(`[first start] ${acc.email} created with a generated password (${envKey} is not set): ${resolvedPw}`)
      }
      q.run(
        `UPDATE users SET password_hash = ?, must_change_password = 0, active = 1, role_id = ?, failed_logins = 0, locked_until = NULL WHERE id = ?`,
        pwHash,
        targetRoleId,
        userId,
      )
    } else if (!initialRoleSeedDone || acc.fullAccess) {
      q.run(
        `UPDATE users SET name = ?, email = ?, password_hash = ?, role_id = ?, department_id = ?, designation = ?, active = 1, must_change_password = 0, failed_logins = 0, locked_until = NULL, updated_at = ? WHERE id = ?`,
        acc.name,
        acc.displayEmail,
        pwHash,
        targetRoleId,
        dept(acc.departmentCode),
        acc.designation,
        nowIso(),
        userId,
      )
    } else {
      q.run(
        `UPDATE users SET name = ?, password_hash = ?, role_id = COALESCE(role_id, ?), department_id = ?, designation = ?, active = 1, must_change_password = 0, failed_logins = 0, locked_until = NULL, updated_at = ? WHERE id = ?`,
        acc.name,
        pwHash,
        targetRoleId,
        dept(acc.departmentCode),
        acc.designation,
        nowIso(),
        userId,
      )
    }

    // One-time move of HR / Office Admin accounts off the restricted staff role (they keep their password).
    if (!officeRoleDone && (acc.roleName === 'HR' || acc.roleName === 'Office Admin')) {
      q.run(`UPDATE users SET role_id = ?, department_id = ?, designation = ?, updated_at = ? WHERE id = ?`, targetRoleId, dept(acc.departmentCode), acc.designation, nowIso(), userId)
      for (const alias of acc.aliases) q.run(`UPDATE users SET role_id = ? WHERE lower(email) = ? AND deleted_at IS NULL`, targetRoleId, alias.toLowerCase())
    }

    // If this staff account is restricted (e.g., Talha), also restrict any legacy alias account (talha@swkpropertiesuae.com) on initial seed
    if (!acc.fullAccess && acc.roleName === 'Staff (Attendance & General)') {
      for (const alias of acc.aliases) {
        if (!initialRoleSeedDone) {
          q.run(
            `UPDATE users SET role_id = ?, password_hash = ?, must_change_password = 0, active = 1, failed_logins = 0, locked_until = NULL WHERE lower(email) = ? AND deleted_at IS NULL`,
            staffRoleId,
            pwHash,
            alias.toLowerCase(),
          )
        } else {
          q.run(
            `UPDATE users SET role_id = COALESCE(role_id, ?), password_hash = ?, must_change_password = 0, active = 1, failed_logins = 0, locked_until = NULL WHERE lower(email) = ? AND deleted_at IS NULL`,
            staffRoleId,
            pwHash,
            alias.toLowerCase(),
          )
        }
      }
    }

    // Ensure matching Employee profile exists and is linked to this userId (with Owner Shabib Siraj as manager of Admin & Staff)
    const managerForEmp = acc.roleName === 'Owner' ? null : shabibEmpId
    let emp = q.get(
      `SELECT * FROM employees WHERE (emp_no = ? OR user_id = ? OR lower(email) = ? OR lower(name) = ?) AND deleted_at IS NULL ORDER BY id ASC LIMIT 1`,
      acc.empNo,
      userId,
      acc.email.toLowerCase(),
      acc.name.toLowerCase(),
    )
    if (!emp) {
      emp = mk('employees', {
        emp_no: acc.empNo,
        name: acc.name,
        user_id: userId,
        department_id: dept(acc.departmentCode),
        designation: acc.designation,
        branch_id: dxb,
        manager_id: managerForEmp,
        status: 'Active',
        join_date: acc.roleName === 'Owner' ? '2020-01-01' : acc.roleName === 'Admin' ? '2020-01-15' : '2024-01-15',
        contract_type: 'Unlimited',
        phone: acc.phone,
        email: acc.displayEmail,
        compensation_model: acc.fullAccess || acc.roleName === 'HR' || acc.roleName === 'Office Admin' ? 'Salaried Management / Operations' : 'Commission Only (50/50 Company Visa – 0 Basic)',
        company_visa_sponsored: true,
        commission_split_company_pct: 50,
        commission_split_agent_pct: 50,
        basic_salary: 0,
      })
    } else {
      q.run(
        `UPDATE employees SET user_id = ?, email = ?, name = ?, status = 'Active', designation = ?, manager_id = ?, updated_at = ? WHERE id = ?`,
        userId,
        acc.displayEmail,
        acc.name,
        acc.designation,
        managerForEmp,
        nowIso(),
        emp.id,
      )
    }
    if (acc.roleName === 'Owner' && emp?.id) {
      shabibEmpId = emp.id
    }
  }

  // Ensure Admin (admin@swk.properties) employee record always has manager_id = shabibEmpId (Owner control)
  if (shabibEmpId) {
    q.run(
      `UPDATE employees SET manager_id = ? WHERE lower(email) = 'admin@swk.properties' AND id <> ?`,
      shabibEmpId,
      shabibEmpId,
    )
  }
  q.run(`INSERT INTO settings(key, value, updated_at) VALUES ('seed:swk_hr_office_admin_roles_v1', '1', ?) ON CONFLICT(key) DO UPDATE SET value = '1', updated_at = excluded.updated_at`, nowIso())
  q.run(
    `INSERT INTO settings(key, value, updated_at) VALUES ('seed:swk_staff_roles_v3', '1', ?) ON CONFLICT(key) DO UPDATE SET value = '1', updated_at = excluded.updated_at`,
    nowIso(),
  )
}
