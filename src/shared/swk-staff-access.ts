/**
 * SWK Properties Staff Accounts & Role-Based Access Policy
 *
 * Official Governance & Access Hierarchy:
 * - Tier 1 — Supreme Company Owner (Controls Admin & All Accounts):
 *   1. Shabib Siraj (Owner & Managing Director — shabib@swk.properties)
 *      - Role: Owner (Full System Access, Final Approver for Recycle Bin Deletions, Deal Withdrawals & Admin Decisions)
 *      - Holds direct supervisory control over admin@swk.properties (can inspect, unlock, reset password, force sign-out, suspend or re-activate admin@swk.properties).
 * - Tier 2 — Full-Access System & Operations Administrator (Controlled by Owner shabib@swk.properties):
 *   2. SWK Admin (Full-Access Administrator — admin@swk.properties)
 *      - Role: Admin (Dedicated Full-Access Admin account under Owner supervision)
 *      - Full access across all 18+ SWK OS modules (CRM, Sales, Off-Plan, Secondary, Leasing, Properties, Mandates, Finance, HR, Attendance, Studio, Compliance, AI, Reports & System Admin), operating under the direct authority and audit oversight of Owner shabib@swk.properties.
 * - Tier 3 — Operations Manager (Full Operational Access):
 *   3. Mohammad Haseeb (Operations Manager — Haseeb@swk.property)
 * - Tier 4 — Restricted Staff Access (Attendance, Company Manual, Market Pulse & General Only):
 *   - Talha@swk.property
 *   - Fareed@swk.property
 *   - Shahid@swk.property
 *   - Umar@swk.property
 *   - Saifullah@swk.property
 * - Role-based office staff (own roles, not the restricted staff role):
 *   - Rahaba Azeez (HR — rahaba@swk.properties): HR & Payroll module, employee records, leave and attendance approvals.
 *   - Meenakshi (Office Admin — meenakshi@swk.properties): reception, documents, calendar, support tickets, walk-in enquiries.
 *   - Fareed, Shahid, Umar, Sanketh sign in with @swk.rent (their @swk.properties address stays as an alias).
 *   - Any other staff account assigned the 'Staff (Attendance & General)' role.
 */

export interface SwkHardcodedStaffAccount {
  email: string
  displayEmail: string
  aliases: string[]
  name: string
  empNo: string
  roleName: 'Owner' | 'Admin' | 'Manager' | 'HR' | 'Office Admin' | 'Staff (Attendance & General)'
  departmentCode: string
  designation: string
  phone: string
  fullAccess: boolean
  controlledBy?: string
}

export const SWK_OWNER_ACCOUNT: SwkHardcodedStaffAccount = {
  email: 'shabib@swk.properties',
  displayEmail: 'shabib@swk.properties',
  aliases: ['shabib@swk.property', 'shabib@swkpropertiesuae.com'],
  name: 'Shabib Siraj',
  empNo: 'EMP-OWNER',
  roleName: 'Owner',
  departmentCode: 'MGT',
  designation: 'Owner & Managing Director (Controls Admin & All Accounts)',
  phone: '+971 50 100 0001',
  fullAccess: true,
}

export const SWK_ADMIN_ACCOUNT: SwkHardcodedStaffAccount = {
  email: 'admin@swk.properties',
  displayEmail: 'admin@swk.properties',
  aliases: ['admin@swk.property'],
  name: 'SWK Admin',
  empNo: 'EMP-ADMIN',
  roleName: 'Admin',
  departmentCode: 'MGT',
  designation: 'Full-Access System & Operations Administrator (Controlled by Owner Shabib Siraj)',
  phone: '+971 50 100 0000',
  fullAccess: true,
  controlledBy: 'shabib@swk.properties',
}

export const SWK_STAFF_ACCOUNTS: readonly SwkHardcodedStaffAccount[] = [
  SWK_OWNER_ACCOUNT,
  SWK_ADMIN_ACCOUNT,
  {
    email: 'haseeb@swk.properties',
    displayEmail: 'haseeb@swk.properties',
    aliases: ['haseeb@swk.property', 'haseeb@swkpropertiesuae.com', 'manager@swkpropertiesuae.com'],
    name: 'Mohammad Haseeb',
    empNo: 'EMP-HASEEB',
    roleName: 'Manager',
    departmentCode: 'OPS',
    designation: 'Operations Manager',
    phone: '+971 50 100 0002',
    fullAccess: true,
    controlledBy: 'shabib@swk.properties',
  },
  {
    email: 'talha@swk.properties',
    displayEmail: 'talha@swk.properties',
    aliases: ['talha@swk.property', 'talha@swkpropertiesuae.com'],
    name: 'Talha Shabbir',
    empNo: 'EMP-TALHA',
    roleName: 'Staff (Attendance & General)',
    departmentCode: 'IT',
    designation: 'BDM & Digital Operations',
    phone: '+971 50 100 0003',
    fullAccess: false,
    controlledBy: 'shabib@swk.properties',
  },
  {
    email: 'fareed@swk.rent',
    displayEmail: 'fareed@swk.rent',
    aliases: ['fareed@swk.properties', 'fareed@swk.property', 'fareed@swkpropertiesuae.com'],
    name: 'Fareed',
    empNo: 'EMP-FAREED',
    roleName: 'Staff (Attendance & General)',
    departmentCode: 'SAL',
    designation: 'Property Consultant',
    phone: '+971 50 100 0004',
    fullAccess: false,
    controlledBy: 'shabib@swk.properties',
  },
  {
    email: 'shahid@swk.rent',
    displayEmail: 'shahid@swk.rent',
    aliases: ['shahid@swk.properties', 'shahid@swk.property', 'shahid@swkpropertiesuae.com'],
    name: 'Shahid',
    empNo: 'EMP-SHAHID',
    roleName: 'Staff (Attendance & General)',
    departmentCode: 'SAL',
    designation: 'Property Consultant',
    phone: '+971 50 100 0005',
    fullAccess: false,
    controlledBy: 'shabib@swk.properties',
  },
  {
    email: 'umar@swk.rent',
    displayEmail: 'umar@swk.rent',
    aliases: ['umar@swk.properties', 'umar@swk.property', 'umar@swkpropertiesuae.com'],
    name: 'Umar',
    empNo: 'EMP-UMAR',
    roleName: 'Staff (Attendance & General)',
    departmentCode: 'SAL',
    designation: 'Property Consultant',
    phone: '+971 50 100 0006',
    fullAccess: false,
    controlledBy: 'shabib@swk.properties',
  },
  {
    email: 'saifullah@swk.properties',
    displayEmail: 'saifullah@swk.properties',
    aliases: ['saifullah@swk.property', 'saifullah@swkpropertiesuae.com'],
    name: 'Saifullah',
    empNo: 'EMP-SAIFULLAH',
    roleName: 'Staff (Attendance & General)',
    departmentCode: 'SAL',
    designation: 'Property Consultant',
    phone: '+971 50 100 0007',
    fullAccess: false,
    controlledBy: 'shabib@swk.properties',
  },
  {
    email: 'samarth@swk.properties',
    displayEmail: 'samarth@swk.properties',
    aliases: ['samarth@swk.property', 'samarth@swkpropertiesuae.com'],
    name: 'Samarth',
    empNo: 'EMP-SAMARTH',
    roleName: 'Staff (Attendance & General)',
    departmentCode: 'SAL',
    designation: 'Property Consultant',
    phone: '+971 50 100 0008',
    fullAccess: false,
    controlledBy: 'shabib@swk.properties',
  },
  {
    email: 'sanketh@swk.rent',
    displayEmail: 'sanketh@swk.rent',
    aliases: ['sanketh@swk.properties', 'sanketh@swk.property', 'sanketh@swkpropertiesuae.com'],
    name: 'Sanketh',
    empNo: 'EMP-SANKETH',
    roleName: 'Staff (Attendance & General)',
    departmentCode: 'SAL',
    designation: 'Property Consultant',
    phone: '+971 50 100 0009',
    fullAccess: false,
    controlledBy: 'shabib@swk.properties',
  },
  {
    email: 'meenakshi@swk.properties',
    displayEmail: 'meenakshi@swk.properties',
    aliases: ['meenakshi@swk.property', 'meenakshi@swkpropertiesuae.com'],
    name: 'Meenakshi',
    empNo: 'EMP-MEENAKSHI',
    roleName: 'Office Admin',
    departmentCode: 'OPS',
    designation: 'Office Admin',
    phone: '+971 50 100 0010',
    fullAccess: false,
    controlledBy: 'shabib@swk.properties',
  },
  {
    email: 'rahaba@swk.properties',
    displayEmail: 'rahaba@swk.properties',
    aliases: ['rahaba@swk.property', 'rahaba@swkpropertiesuae.com'],
    name: 'Rahaba Azeez',
    empNo: 'EMP-RAHABA',
    roleName: 'HR',
    departmentCode: 'HR',
    designation: 'HR Executive',
    phone: '+971 50 100 0011',
    fullAccess: false,
    controlledBy: 'shabib@swk.properties',
  },
] as const

export const OWNER_EMAILS = new Set<string>([
  'shabib@swk.properties',
  'shabib@swk.property',
  'shabib@swkpropertiesuae.com',
])

export const ADMIN_EMAILS = new Set<string>([
  'admin@swk.properties',
  'admin@swk.property',
  'admin@swkpropertiesuae.com',
])

const QR_PRINT_ALLOWED_EMAILS = new Set<string>([
  ...OWNER_EMAILS,
  ...ADMIN_EMAILS,
  'haseeb@swk.properties',
  'haseeb@swk.property',
  'haseeb@swkpropertiesuae.com',
  'manager@swkpropertiesuae.com',
])

const FULL_ACCESS_EMAILS = new Set<string>([
  ...QR_PRINT_ALLOWED_EMAILS,
  'demo@swkpropertiesuae.com',
])

export const NON_ELEVATED_ASSIGNABLE_ROLES = [
  'HR',
  'Office Admin',
  'Staff (Attendance & General)',
] as const

export type NonElevatedAssignableRole = (typeof NON_ELEVATED_ASSIGNABLE_ROLES)[number]

/** The ONLY three canonical accounts that may hold Owner/Admin/Manager privileges, print/view reception QR, open CRM Vault, or view live Field GPS. */
export const CANONICAL_ELEVATED_EMAILS: ReadonlySet<string> = new Set([
  'shabib@swk.properties',
  'admin@swk.properties',
  'haseeb@swk.properties',
])

export function isElevatedCanonicalEmail(email: string | null | undefined): boolean {
  return CANONICAL_ELEVATED_EMAILS.has(String(email || '').trim().toLowerCase())
}

/** True when a permission set grants global '*' or any module-level '*' action wildcard. */
export function hasWildcardPermission(perms: unknown): boolean {
  if (perms === '*') return true
  if (!perms || typeof perms !== 'object' || Array.isArray(perms)) return false
  return Object.values(perms as Record<string, unknown>).some(acts => Array.isArray(acts) && acts.includes('*'))
}

const QR_VIEWER_EMAILS: ReadonlySet<string> = CANONICAL_ELEVATED_EMAILS

/**
 * HARD RULE: ONLY Owner Shabib, Admin and Manager Haseeb can view, print or change the Office Attendance QR code.
 * Everyone else only scans it with the camera inside the check-in page.
 */
export function canPrintReceptionQr(
  user: { email?: string | null; role?: string | null; role_name?: string | null; name?: string | null; party_id?: number | null } | null | undefined,
): boolean {
  if (!user || user.party_id) return false
  return isElevatedCanonicalEmail(user.email)
}

/**
 * HARD RULE: ONLY Owner Shabib (shabib@swk.properties), Admin (admin@swk.properties),
 * and Operations Manager Haseeb (haseeb@swk.properties) can access the Master CRM Vault,
 * view unmasked owner phone numbers, or assign/revoke deals to field agents.
 */
export function canAccessCrmVault(
  user: { email?: string | null; role?: string | null; role_name?: string | null; name?: string | null; party_id?: number | null } | null | undefined,
): boolean {
  if (!user || user.party_id) return false
  return isElevatedCanonicalEmail(user.email)
}

/**
 * HARD RULE: ONLY the 3 canonical elevated accounts (shabib@swk.properties, admin@swk.properties,
 * haseeb@swk.properties) can access the Live Field GPS Map of all staff.
 */
export function canAccessFieldLiveMap(
  user: { email?: string | null; role?: string | null; role_name?: string | null; name?: string | null; party_id?: number | null } | null | undefined,
): boolean {
  if (!user || user.party_id) return false
  return isElevatedCanonicalEmail(user.email)
}

/**
 * Hard check for Administration & Governance logic (Recycle Bin, Withdrawals, Universal Approvals,
 * Owner Morning Briefing, 10:30 AM Contemptor Report, System Settings, Roles & Users).
 * Visible ONLY to Owner, Admin, Haseeb, or explicitly scoped non-restricted admin fixtures.
 */
export function canAccessSwkAdminLogic(
  user: {
    email?: string | null
    role?: string | null
    role_name?: string | null
    name?: string | null
    party_id?: number | null
    permissions?: '*' | Record<string, string[]> | null
  } | null | undefined,
): boolean {
  if (!user || user.party_id) return false
  if (canPrintReceptionQr(user)) return true
  if (isRestrictedStaffUser(user)) return false
  if (isOwnerSwkUser(user) || isAdminSwkUser(user)) return true
  const perms = user.permissions
  if (perms && typeof perms === 'object' && Array.isArray(perms.admin) && perms.admin.includes('view')) {
    return true
  }
  return false
}

const RESTRICTED_STAFF_EMAILS = new Set<string>([
  'talha@swk.property',
  'talha@swk.properties',
  'talha@swkpropertiesuae.com',
  'fareed@swk.property',
  'fareed@swk.properties',
  'fareed@swkpropertiesuae.com',
  'fareed@swk.rent',
  'shahid@swk.property',
  'shahid@swk.properties',
  'shahid@swkpropertiesuae.com',
  'shahid@swk.rent',
  'umar@swk.property',
  'umar@swk.properties',
  'umar@swkpropertiesuae.com',
  'umar@swk.rent',
  'saifullah@swk.property',
  'saifullah@swk.properties',
  'saifullah@swkpropertiesuae.com',
  'samarth@swk.property',
  'samarth@swk.properties',
  'samarth@swkpropertiesuae.com',
  'sanketh@swk.property',
  'sanketh@swk.properties',
  'sanketh@swkpropertiesuae.com',
  'sanketh@swk.rent',
])

export const RESTRICTED_STAFF_PERMISSIONS: Record<string, string[]> = {
  dashboard: ['view'],
  hr: ['view', 'create'],
  masters: ['view'],
  ai: ['view', 'create'],
}

export const RESTRICTED_STAFF_ALLOWED_ENTITIES = new Set<string>([
  'attendance',
  'attendance_events',
  'leave_requests',
  'daily_reports',
  'knowledge_articles',
  'staff_qualifications',
  'activity_skill_rules',
  'communities',
  'developers',
  'dld_market_transactions',
  'real_estate_news',
  'branches',
  'departments',
])

export const RESTRICTED_STAFF_SELF_SCOPED_ENTITIES = new Set<string>([
  'attendance',
  'attendance_events',
  'leave_requests',
  'daily_reports',
])

/** Sensitive HR, payroll, WPS, immigration/visa, and lifecycle entities gated strictly behind canViewEmployeeRecords(). */
export const RESTRICTED_HR_PII_ENTITIES = new Set<string>([
  'employees',
  'payslips',
  'wps_batches',
  'immigration_cases',
  'hr_lifecycle_cases',
])

export function isSwkCompanyEmail(email: string | null | undefined): boolean {
  const e = String(email || '').trim().toLowerCase()
  return e.endsWith('@swk.properties') || e.endsWith('@swk.property') || e.endsWith('@swkpropertiesuae.com') || e.endsWith('@swk.rent')
}

export function isOwnerSwkUser(
  user: { email?: string | null; role?: string | null; role_name?: string | null; name?: string | null; party_id?: number | null } | null | undefined,
): boolean {
  if (!user || user.party_id || isRestrictedStaffUser(user)) return false
  const email = String(user.email || '').trim().toLowerCase()
  const role = String(user.role_name || user.role || '').trim().toLowerCase()
  if (role && role !== 'owner') return false
  return email === 'shabib@swk.properties'
}

export function isAdminSwkUser(
  user: { email?: string | null; role?: string | null; role_name?: string | null; name?: string | null; party_id?: number | null } | null | undefined,
): boolean {
  if (!user || user.party_id || isRestrictedStaffUser(user)) return false
  const email = String(user.email || '').trim().toLowerCase()
  const role = String(user.role_name || user.role || '').trim().toLowerCase()
  if (role && role !== 'admin') return false
  if (email === 'admin@swk.properties') return true
  return email === 'demo@swkpropertiesuae.com' && role === 'admin'
}

/**
 * Checks whether the user has full operational access (Owner, Admin, Operations Manager Haseeb, or demo admin).
 */
export function isFullAccessSwkUser(
  user: { email?: string | null; role?: string | null; role_name?: string | null; name?: string | null; party_id?: number | null } | null | undefined,
): boolean {
  if (!user || user.party_id || isRestrictedStaffUser(user)) return false
  const email = String(user.email || '').trim().toLowerCase()
  const role = String(user.role_name || user.role || '').trim().toLowerCase()
  if (email === 'demo@swkpropertiesuae.com') return role === 'admin'
  return isElevatedCanonicalEmail(email)
}

export function isRestrictedStaffUser(
  user: { email?: string | null; role?: string | null; role_name?: string | null; name?: string | null; party_id?: number | null } | null | undefined,
): boolean {
  if (!user || user.party_id) return false
  const email = String(user.email || '').trim().toLowerCase()
  const role = String(user.role_name || user.role || '').trim().toLowerCase()
  if (role === 'staff (attendance & general)') return true
  if (canPrintReceptionQr(user)) return false
  if (email === 'demo@swkpropertiesuae.com' && role === 'admin') return false
  if (isSwkCompanyEmail(email)) {
    const fixed = hardcodedAccountFor(email)
    if (fixed) {
      const fixedIsElevated = fixed.roleName === 'Owner' || fixed.roleName === 'Admin' || fixed.roleName === 'Manager'
      if (fixedIsElevated && !isElevatedCanonicalEmail(email) && !(email === 'manager@swkpropertiesuae.com' && role === 'manager')) {
        return true
      }
      return fixed.roleName === 'Staff (Attendance & General)'
    }
    if (role === 'hr' || role === 'office admin') return false
    return true
  }
  if (role && role !== 'staff (attendance & general)') return false
  if (RESTRICTED_STAFF_EMAILS.has(email)) return true
  if (email.endsWith('@swk.property') && !FULL_ACCESS_EMAILS.has(email)) return true
  return false
}

export function isAllowedPathForRestrictedStaff(pathname: string): boolean {
  const clean = String(pathname || '/').split('?')[0] || '/'
  const exactAllowed = new Set([
    '/',
    '/home',
    '/login',
    '/qr-checkin',
    '/reception-qr',
    '/swk/reception-qr',
    '/qr-reception',
    '/market',
    '/competency',
    '/toolkit',
    '/tools',
    '/calendar',
    '/profile',
    '/team',
    '/chat',
    '/my-deals',
    '/workspace-tools',
    '/handover',
    '/handover-portal',
    '/utilities',
    '/phone',
    '/field-duty',
  ])
  if (exactAllowed.has(clean)) return true
  if (
    clean.startsWith('/reception-qr/') ||
    clean.startsWith('/swk/reception-qr/') ||
    clean.startsWith('/qr-reception/') ||
    clean.startsWith('/handover/') ||
    clean.startsWith('/team/') ||
    clean.startsWith('/print/') ||
    clean.startsWith('/utilities/') ||
    clean.startsWith('/phone/') ||
    clean.startsWith('/field-duty/')
  ) {
    return true
  }
  if (clean.startsWith('/e/')) {
    const entity = clean.split('/')[2] || ''
    return RESTRICTED_STAFF_ALLOWED_ENTITIES.has(entity)
  }
  return false
}

/** Employee records (and the Access & usage view) open only for the Owner and the Admin. */
export function canOpenEmployeeRecords(
  user: { email?: string | null; role?: string | null; role_name?: string | null; party_id?: number | null } | null | undefined,
): boolean {
  if (!user || user.party_id || isRestrictedStaffUser(user)) return false
  return isOwnerSwkUser(user) || isAdminSwkUser(user)
}

/** Employee records open for the Owner, the Admin, the Operations Manager (Haseeb) and HR-role staff (Rahaba). Handover custody and Access & usage stay Owner/Admin only (canOpenEmployeeRecords). */
export function canViewEmployeeRecords(
  user: { email?: string | null; role?: string | null; role_name?: string | null; party_id?: number | null } | null | undefined,
): boolean {
  if (!user || user.party_id || isRestrictedStaffUser(user)) return false
  const e = String(user.email ?? '').trim().toLowerCase()
  if (String(user.role_name || user.role || '').trim().toLowerCase() === 'hr') return true
  return canOpenEmployeeRecords(user) || ['haseeb@swk.properties', 'haseeb@swk.property', 'haseeb@swkpropertiesuae.com', 'manager@swkpropertiesuae.com'].includes(e)
}

/**
 * Exact 5-person confidential leadership & admin whitelist for BOTH:
 *  - 158+ Document Templates & Letter Studio (100% invisible to everyone else)
 *  - Confidential AI Brain Universal Format Converter & Bulk Importer
 * Authorized: Owner (Shabib), Admin, Operations Manager (Haseeb), Office Admin (Meenakshi), HR (Rahaba).
 */
export const CONFIDENTIAL_FIVE_EMAILS: ReadonlySet<string> = new Set([
  'shabib@swk.properties',
  'shabib@swk.property',
  'shabib@swkpropertiesuae.com',
  'admin@swk.properties',
  'admin@swk.property',
  'admin@swkpropertiesuae.com',
  'haseeb@swk.properties',
  'haseeb@swk.property',
  'haseeb@swkpropertiesuae.com',
  'manager@swkpropertiesuae.com',
  'meenakshi@swk.properties',
  'meenakshi@swk.property',
  'meenakshi@swkpropertiesuae.com',
  'rahaba@swk.properties',
  'rahaba@swk.property',
  'rahaba@swkpropertiesuae.com',
])

/**
 * HARD RULE: Document Templates (158+ library, Letter Studio & doc_templates) are COMPLETELY HIDDEN
 * and locked for everyone EXCEPT the exact 5-person whitelist:
 * Owner (Shabib), Admin, Operations Manager (Haseeb), Office Admin (Meenakshi), and HR (Rahaba).
 * Every other account (sales/leasing agents, callers, viewers, portal) must never see any trace.
 */
export function canAccessDocumentTemplates(
  user: { email?: string | null; role?: string | null; role_name?: string | null; name?: string | null; party_id?: number | null } | null | undefined,
): boolean {
  if (!user || user.party_id || isRestrictedStaffUser(user)) return false
  if (isOwnerSwkUser(user) || isAdminSwkUser(user)) return true
  const email = String(user.email || '').trim().toLowerCase()
  if (CONFIDENTIAL_FIVE_EMAILS.has(email)) return true
  const role = String(user.role_name || user.role || '').trim().toLowerCase()
  if (role === 'hr' || role === 'office admin' || role === 'manager') {
    const fixed = hardcodedAccountFor(email)
    if (!fixed || ['Owner', 'Admin', 'Manager', 'HR', 'Office Admin'].includes(fixed.roleName)) return true
  }
  return false
}

/**
 * HARD RULE: Confidential AI Brain Universal Format Converter & Bulk Importer is exclusively
 * available to Owner, Admin, Haseeb, Meenakshi, and Rahaba (confidential).
 */
export function canUseConfidentialAiImporter(
  user: { email?: string | null; role?: string | null; role_name?: string | null; name?: string | null; party_id?: number | null } | null | undefined,
): boolean {
  return canAccessDocumentTemplates(user)
}

/**
 * HARD RULE: "Shabib's Corner" Executive Command Workspace is exclusively in Owner's account.
 */
export function canAccessShabibsCorner(
  user: { email?: string | null; role?: string | null; role_name?: string | null; name?: string | null; party_id?: number | null } | null | undefined,
): boolean {
  return isOwnerSwkUser(user)
}

/**
 * HARD RULE: Emergency Mandatory-Field Override (submitting forms/documents with * mandatory fields
 * blank by recording an emergency detail) is HARDCODED strictly to Owner and Admin ONLY.
 * Manager (Haseeb), HR (Rahaba), Office Admin (Meenakshi), Agents, and Portal users are ALWAYS blocked.
 */
export function canUseEmergencyOverride(
  user: { email?: string | null; role?: string | null; role_name?: string | null; name?: string | null; party_id?: number | null } | null | undefined,
): boolean {
  if (!user || user.party_id || isRestrictedStaffUser(user)) return false
  return isOwnerSwkUser(user) || isAdminSwkUser(user)
}

/**
 * HARD RULE: No-Code OS Customizer (adding/editing/removing custom fields, dropdown option lists,
 * own document templates, and letterhead/watermark controls without developer or IT intervention)
 * is HARDCODED strictly to Owner and Admin ONLY.
 */
export function canUseOsCustomizer(
  user: { email?: string | null; role?: string | null; role_name?: string | null; name?: string | null; party_id?: number | null } | null | undefined,
): boolean {
  if (!user || user.party_id || isRestrictedStaffUser(user)) return false
  return isOwnerSwkUser(user) || isAdminSwkUser(user)
}

/**
 * HARD RULE: Complete Social Media Management Suite (brand profiles, 30-day content scheduler,
 * and Owner -> Meenakshi submission handover) is accessible to Owner, Admin, Operations Manager
 * (Haseeb), and Office Admin (Meenakshi) ONLY. Restricted field agents & portal users are blocked.
 */
export function canAccessSocialMediaSuite(
  user: { email?: string | null; role?: string | null; role_name?: string | null; name?: string | null; party_id?: number | null } | null | undefined,
): boolean {
  if (!user || user.party_id || isRestrictedStaffUser(user)) return false
  if (isOwnerSwkUser(user) || isAdminSwkUser(user) || isFullAccessSwkUser(user)) return true
  const email = String(user.email || '').trim().toLowerCase()
  const fixed = hardcodedAccountFor(email)
  if (fixed && ['Owner', 'Admin', 'Manager', 'Office Admin'].includes(fixed.roleName)) return true
  const role = String(user.role_name || user.role || '').trim().toLowerCase()
  return role === 'office admin' || role === 'manager'
}

/**
 * Master Data Registry & Operational Gap Hub: leadership + office/HR coordinators can view
 * reference data; full 360° Security & Master Log is restricted to Owner, Admin, and Haseeb.
 */
export function canAccessMasterDataHub(
  user: { email?: string | null; role?: string | null; role_name?: string | null; name?: string | null; party_id?: number | null } | null | undefined,
): boolean {
  if (!user || user.party_id || isRestrictedStaffUser(user)) return false
  if (isFullAccessSwkUser(user)) return true
  return canAccessDocumentTemplates(user)
}

export function canViewMasterSecurityLog(
  user: { email?: string | null; role?: string | null; role_name?: string | null; name?: string | null; party_id?: number | null } | null | undefined,
): boolean {
  if (!user || user.party_id || isRestrictedStaffUser(user)) return false
  return isFullAccessSwkUser(user)
}

/**
 * HARD RULE: ONLY the Supreme Owner (shabib@swk.properties) can apply the Company Seal
 * and Authorized Owner Signature directly without prior approval.
 * Admin, Haseeb, HR, and Office Admin MUST obtain explicit Owner approval before applying them.
 */
export function canUseCompanySealDirectly(
  user: { email?: string | null; role?: string | null; role_name?: string | null; name?: string | null; party_id?: number | null } | null | undefined,
): boolean {
  return isOwnerSwkUser(user)
}

/** Roles eligible to request Owner approval to attach the Company Seal & Signature. */
export function canRequestCompanySeal(
  user: { email?: string | null; role?: string | null; role_name?: string | null; name?: string | null; party_id?: number | null } | null | undefined,
): boolean {
  return canAccessDocumentTemplates(user)
}

/** The retired name pattern (first part of the email, capitalised, + '@swk2026'). Only used to detect and replace accounts that still accept it; never assign it. */
export function swkPatternPassword(email: string): string {
  const local = String(email).split('@')[0]
  return local.charAt(0).toUpperCase() + local.slice(1).toLowerCase() + '@swk2026'
}

/** Office Admin role permissions (Meenakshi): front office, documents, calendar, support and walk-in enquiries. No finance, deals or settings. */
export const OFFICE_ADMIN_PERMISSIONS: Record<string, string[]> = {
  dashboard: ['view'],
  crm: ['view', 'create'],
  documents: ['view', 'create', 'edit', 'export'],
  projects: ['view', 'create', 'edit'],
  support: ['view', 'create', 'edit'],
  hr: ['view', 'create'],
  masters: ['view'],
  ai: ['view', 'create'],
}

/** HR role permissions (Rahaba Azeez): full HR & payroll with approvals, HR documents, no deals or finance. */
export const HR_ROLE_PERMISSIONS: Record<string, string[]> = {
  dashboard: ['view'],
  hr: ['view', 'create', 'edit', 'delete', 'approve', 'export'],
  documents: ['view', 'create', 'edit', 'export'],
  projects: ['view', 'create', 'edit', 'export'],
  masters: ['view'],
  reports: ['view', 'export'],
  ai: ['view', 'create'],
}

const ALL_MOD = ['view', 'create', 'edit', 'delete', 'approve', 'export']
/** Operations Manager (Haseeb): majority operational access; administration is view-only. */
export const MANAGER_PERMISSIONS: Record<string, string[]> = {
  dashboard: ALL_MOD, crm: ALL_MOD, sales: ALL_MOD, properties: ALL_MOD, mandates: ALL_MOD,
  transactions: ALL_MOD, leases: ALL_MOD, finance: ALL_MOD, assets: ALL_MOD, hr: ALL_MOD,
  support: ALL_MOD, projects: ALL_MOD, documents: ALL_MOD, compliance: ALL_MOD, ai: ALL_MOD,
  reports: ALL_MOD, masters: ALL_MOD, admin: ['view'],
}

/**
 * HARD RULE: the access of every SWK staff account is fixed here in code, by email.
 * The database role and its permission set are ignored for these accounts, so no screen, API call,
 * role edit or user edit can give a person more (or less) than this table. Change access only here.
 */
export const HARDCODED_ROLE_PERMISSIONS: Record<SwkHardcodedStaffAccount['roleName'], '*' | Record<string, string[]>> = {
  Owner: '*',
  Admin: '*',
  Manager: MANAGER_PERMISSIONS,
  HR: HR_ROLE_PERMISSIONS,
  'Office Admin': OFFICE_ADMIN_PERMISSIONS,
  'Staff (Attendance & General)': RESTRICTED_STAFF_PERMISSIONS,
}

/** The fixed account (and so the fixed role) behind an email or one of its aliases. */
export function hardcodedAccountFor(email: string | null | undefined): SwkHardcodedStaffAccount | undefined {
  const e = String(email || '').trim().toLowerCase()
  if (!e) return undefined
  return SWK_STAFF_ACCOUNTS.find(a => a.email.toLowerCase() === e || a.aliases.some(x => x.toLowerCase() === e))
}
