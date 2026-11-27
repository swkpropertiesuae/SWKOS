/**
 * Canonical 12-Stage Dubai Real Estate & Mortgage Pipeline Playbook,
 * 13-Document Client Compliance Vault Checklist, and 20-Registry CORE Master Log Catalog.
 */

export interface PipelineStageDef {
  step: number
  code: string
  label: string
  shortLabel: string
  legacyStage: 'Inquiry' | 'Viewing' | 'Offer' | 'Negotiation' | 'Contract' | 'DLD Process' | 'Handover' | 'Closed'
  probability: number
  slaHours: number
  color: string
  playbookHint: string
  exitGate: string
}

export const PIPELINE_12_STAGES: readonly PipelineStageDef[] = [
  {
    step: 1,
    code: '01_inventory',
    label: '01. Inventory & Mandate',
    shortLabel: 'Inventory',
    legacyStage: 'Inquiry',
    probability: 0.05,
    slaHours: 24,
    color: '#64748b',
    playbookHint: 'Verify Title Deed / Oqood, Form A & Trakheesi permit or Direct Developer allocation.',
    exitGate: 'Unit verified + Seller / Developer mandate active',
  },
  {
    step: 2,
    code: '02_marketing',
    label: '02. Marketing & Portals',
    shortLabel: 'Marketing',
    legacyStage: 'Inquiry',
    probability: 0.1,
    slaHours: 24,
    color: '#0284c7',
    playbookHint: 'Publish on swkpropertiesuae.com, Bayut, Property Finder, Dubizzle & social spotlight.',
    exitGate: 'Live listing URL + Trakheesi permit active',
  },
  {
    step: 3,
    code: '03_lead',
    label: '03. Lead & Qualification',
    shortLabel: 'Lead Qualify',
    legacyStage: 'Inquiry',
    probability: 0.15,
    slaHours: 2,
    color: '#2563eb',
    playbookHint: '5-min SLA response · Qualify budget, community, timeline & Cash vs. Mortgage status.',
    exitGate: 'Budget + financing profile + Form B / KYC logged',
  },
  {
    step: 4,
    code: '04_viewing',
    label: '04. Viewing & Field GPS',
    shortLabel: 'Viewing GPS',
    legacyStage: 'Viewing',
    probability: 0.25,
    slaHours: 48,
    color: '#0891b2',
    playbookHint: 'Conduct live GPS-tracked property viewing with community yield & service-charge brief.',
    exitGate: 'Field GPS viewing checked-in + client feedback logged',
  },
  {
    step: 5,
    code: '05_offer',
    label: '05. Offer & Negotiation',
    shortLabel: 'Offer / A2A',
    legacyStage: 'Offer',
    probability: 0.4,
    slaHours: 24,
    color: '#4f46e5',
    playbookHint: 'Submit written offer, lock seller terms, or sign Form I (A2A) for co-broke stock.',
    exitGate: 'Price, deposit cheque & payment terms agreed in writing',
  },
  {
    step: 6,
    code: '06_form_f',
    label: '06. Form F / SPA & Deposit',
    shortLabel: 'Form F / SPA',
    legacyStage: 'Contract',
    probability: 0.6,
    slaHours: 48,
    color: '#9333ea',
    playbookHint: 'Sign RERA Form F (MOU) / Developer SPA & collect 10% security deposit via legal channel.',
    exitGate: 'Signed Form F/SPA + verified escrow/company deposit receipt',
  },
  {
    step: 7,
    code: '07_mortgage_val',
    label: '07. Mortgage & Valuation',
    shortLabel: 'Mortgage / Val',
    legacyStage: 'Negotiation',
    probability: 0.72,
    slaHours: 120,
    color: '#b45309',
    playbookHint: 'Complete bank pre-approval, book independent valuation, track Final Offer Letter (FOL).',
    exitGate: 'Bank FOL signed or Cash Manager Cheque proof confirmed',
  },
  {
    step: 8,
    code: '08_noc',
    label: '08. Developer NOC & Clearance',
    shortLabel: 'Dev NOC',
    legacyStage: 'DLD Process',
    probability: 0.82,
    slaHours: 72,
    color: '#d97706',
    playbookHint: 'Clear service charges (SOA), obtain seller mortgage liability letter & Developer NOC.',
    exitGate: 'Valid Developer NOC uploaded to Client Vault',
  },
  {
    step: 9,
    code: '09_dld_transfer',
    label: '09. DLD Transfer / Oqood',
    shortLabel: 'DLD Transfer',
    legacyStage: 'DLD Process',
    probability: 0.9,
    slaHours: 48,
    color: '#0f766e',
    playbookHint: 'Complete Trustee office transfer (4% DLD + Trustee fee), Oqood or Ejari registration.',
    exitGate: 'New Title Deed / Oqood / Ejari certificate issued',
  },
  {
    step: 10,
    code: '10_handover',
    label: '10. Handover & Keys',
    shortLabel: 'Handover',
    legacyStage: 'Handover',
    probability: 0.95,
    slaHours: 48,
    color: '#059669',
    playbookHint: 'DEWA activation, snagging checklist, access cards & formal key handover sheet.',
    exitGate: 'Signed handover & snagging protocol archived',
  },
  {
    step: 11,
    code: '11_commission',
    label: '11. Commission & 50/50 Split',
    shortLabel: 'Commission',
    legacyStage: 'Closed',
    probability: 0.98,
    slaHours: 72,
    color: '#15803d',
    playbookHint: 'Issue UAE 5% VAT Tax Invoice, confirm SWK corporate bank credit & process 50/50 split.',
    exitGate: 'Commission received in corporate bank + VAT recorded',
  },
  {
    step: 12,
    code: '12_client_care',
    label: '12. Client Care & Gold Rush',
    shortLabel: 'Client Care',
    legacyStage: 'Closed',
    probability: 1.0,
    slaHours: 168,
    color: '#047857',
    playbookHint: 'Golden Visa / leasing management upsell, portfolio review & referral harvest.',
    exitGate: 'Client review logged + referral / repeat mandate scheduled',
  },
] as const

export const PIPELINE_STAGE_MAP = new Map<string, PipelineStageDef>(
  PIPELINE_12_STAGES.map(s => [s.code, s]),
)

export function resolveStage12Code(stage12?: string | null, legacyStatus?: string | null, jobStatus?: string | null): string {
  if (stage12 && PIPELINE_STAGE_MAP.has(stage12)) return stage12
  if (jobStatus === 'Completed' || jobStatus === 'Title Deed Issued') return '11_commission'
  switch (legacyStatus) {
    case 'Viewing': return '04_viewing'
    case 'Offer': return '05_offer'
    case 'Negotiation': return '07_mortgage_val'
    case 'Contract': return '06_form_f'
    case 'DLD Process': return '09_dld_transfer'
    case 'Handover': return '10_handover'
    case 'Closed': return '11_commission'
    default: return '03_lead'
  }
}

export function legacyStageFor12(stage12: string): PipelineStageDef['legacyStage'] {
  return PIPELINE_STAGE_MAP.get(stage12)?.legacyStage ?? 'Inquiry'
}

export interface ClientVaultDocSpec {
  key: string
  label: string
  category: 'Identity & Residency' | 'Income & Banking' | 'Property & DLD' | 'Bank & Compliance'
  requiredFor: ('Sale' | 'Mortgage' | 'Off-Plan' | 'Lease')[]
  expiryTracked: boolean
  hint: string
}

export const CLIENT_VAULT_REQUIRED_DOCS: readonly ClientVaultDocSpec[] = [
  { key: 'passport', label: 'Passport Copy', category: 'Identity & Residency', requiredFor: ['Sale', 'Mortgage', 'Off-Plan', 'Lease'], expiryTracked: true, hint: 'Valid minimum 6 months · Color scan' },
  { key: 'eid', label: 'Emirates ID (Front & Back)', category: 'Identity & Residency', requiredFor: ['Sale', 'Mortgage', 'Off-Plan', 'Lease'], expiryTracked: true, hint: 'Clear front and back scan for UAE residents' },
  { key: 'visa', label: 'UAE Residence Visa Page', category: 'Identity & Residency', requiredFor: ['Sale', 'Mortgage', 'Lease'], expiryTracked: true, hint: 'Stamped visa page or ICP digital residency PDF' },
  { key: 'salary_cert', label: 'Latest Salary Certificate', category: 'Income & Banking', requiredFor: ['Mortgage', 'Lease'], expiryTracked: true, hint: 'Addressed to bank / SWK · Dated within 30 days' },
  { key: 'payslips_6m', label: 'Last 6 Months Payslips', category: 'Income & Banking', requiredFor: ['Mortgage'], expiryTracked: false, hint: 'Consecutive 6 months stamped/official payslips' },
  { key: 'bank_statements_6m', label: 'Last 6 Months Bank Statements', category: 'Income & Banking', requiredFor: ['Mortgage', 'Sale'], expiryTracked: false, hint: 'Stamped salary-credit bank statements showing inflows & liabilities' },
  { key: 'credit_report', label: 'AECB Credit Report', category: 'Income & Banking', requiredFor: ['Mortgage'], expiryTracked: true, hint: 'Al Etihad Credit Bureau score & active facility report' },
  { key: 'signed_bank_application', label: 'Signed Bank Application', category: 'Bank & Compliance', requiredFor: ['Mortgage'], expiryTracked: false, hint: 'Wet-ink or e-signed partner bank mortgage application form' },
  { key: 'information_sheet', label: 'Client Information Sheet & KYC', category: 'Bank & Compliance', requiredFor: ['Sale', 'Mortgage', 'Off-Plan', 'Lease'], expiryTracked: false, hint: 'Signed SWK KYC, Source of Funds & PDPL consent form' },
  { key: 'form_f', label: 'Property Form F (MOU)', category: 'Property & DLD', requiredFor: ['Sale', 'Mortgage'], expiryTracked: true, hint: 'RERA Form F / Contract F signed via Dubai REST' },
  { key: 'oqood', label: 'Oqood Registration Certificate', category: 'Property & DLD', requiredFor: ['Off-Plan', 'Mortgage'], expiryTracked: false, hint: 'DLD Interim Property Registration (Off-Plan units)' },
  { key: 'title_deed', label: 'DLD Title Deed', category: 'Property & DLD', requiredFor: ['Sale', 'Mortgage', 'Lease'], expiryTracked: false, hint: 'Dubai Land Department Title Deed with QR verification' },
  { key: 'developer_noc', label: 'Developer SOA & NOC', category: 'Property & DLD', requiredFor: ['Sale', 'Mortgage', 'Off-Plan'], expiryTracked: true, hint: 'Developer Statement of Account, service-charge clearance & Transfer NOC' },
] as const

export interface CoreMasterCardSpec {
  key: string
  group: 'Core Masters' | 'Finance & Compliance' | 'People & Access' | 'Real Estate Operations' | 'Platform & Automation'
  title: string
  subtitle: string
  route: string
  table: string
  adminCanPropose: boolean
  ownerOnlyDirect: boolean
}

/** Exact 20-Registry CORE Headquarters Master Log matching the SWK OS blueprint. */
export const CORE_MASTER_REGISTRIES: readonly CoreMasterCardSpec[] = [
  // Core Masters
  { key: 'communities', group: 'Core Masters', title: 'Dubai Communities & Districts', subtitle: 'Master Dubai areas, districts, RERA codes & avg sq.ft / yield benchmarks', route: '/e/communities', table: 'communities', adminCanPropose: true, ownerOnlyDirect: false },
  { key: 'developers', group: 'Core Masters', title: 'Master Developers', subtitle: 'Emaar, Sobha, DAMAC, Nakheel, Binghatti, Azizi & RERA developers', route: '/e/developers', table: 'developers', adminCanPropose: true, ownerOnlyDirect: false },
  { key: 'branches', group: 'Core Masters', title: 'Office Branches & Geofence', subtitle: '25th Floor Al Saqr Building SZR, office Wi-Fi lock & GPS geofence', route: '/e/branches', table: 'branches', adminCanPropose: false, ownerOnlyDirect: true },
  { key: 'departments', group: 'Core Masters', title: 'Company Departments', subtitle: 'Management, BDM, Digital Marketing, HR, Documentation, Accounts, Finance, Property Mgmt, Sales & Ops', route: '/e/departments', table: 'departments', adminCanPropose: true, ownerOnlyDirect: false },
  // Finance & Compliance
  { key: 'currencies', group: 'Finance & Compliance', title: 'Currencies & FX Rates', subtitle: 'AED base currency & international settlement rates', route: '/e/currencies', table: 'currencies', adminCanPropose: true, ownerOnlyDirect: false },
  { key: 'vat_codes', group: 'Finance & Compliance', title: 'UAE VAT & Tax Codes', subtitle: 'FTA 5% standard, 0% zero-rated & exempt tax codes', route: '/e/vat_codes', table: 'vat_codes', adminCanPropose: true, ownerOnlyDirect: false },
  { key: 'accounts', group: 'Finance & Compliance', title: 'Chart of Accounts', subtitle: 'General ledger accounts for IFRS / UAE audit', route: '/e/accounts', table: 'accounts', adminCanPropose: true, ownerOnlyDirect: false },
  { key: 'payment_terms', group: 'Finance & Compliance', title: 'Payment Terms', subtitle: 'Standard invoice & commission due schedules', route: '/e/payment_terms', table: 'payment_terms', adminCanPropose: true, ownerOnlyDirect: false },
  // People & Access
  { key: 'employees', group: 'People & Access', title: 'Staff & HR Directory', subtitle: 'Employees, Emirates IDs, visas, passports & PDF vault', route: '/e/employees', table: 'employees', adminCanPropose: false, ownerOnlyDirect: true },
  { key: 'agents', group: 'People & Access', title: 'RERA Brokers (BRN)', subtitle: 'Licensed brokers, BRN cards & 50/50 commission tiers', route: '/e/agents', table: 'agents', adminCanPropose: true, ownerOnlyDirect: false },
  { key: 'roles', group: 'People & Access', title: 'Roles & Permissions', subtitle: 'Hardcoded RBAC & custom role definitions', route: '/admin/roles', table: 'roles', adminCanPropose: false, ownerOnlyDirect: true },
  // Real Estate Operations
  { key: 'properties', group: 'Real Estate Operations', title: 'Master Projects (Dubai & Abu Dhabi)', subtitle: 'Verified UAE projects formatted as <Project> by <Developer>', route: '/e/properties', table: 'properties', adminCanPropose: true, ownerOnlyDirect: false },
  { key: 'units', group: 'Real Estate Operations', title: 'Project Units', subtitle: 'Individual apartments, villas, townhouses & offices', route: '/e/units', table: 'units', adminCanPropose: true, ownerOnlyDirect: false },
  { key: 'parties', group: 'Real Estate Operations', title: 'Contacts, Buyers & Landlords', subtitle: 'CRM master registry of clients & owners', route: '/e/parties', table: 'parties', adminCanPropose: true, ownerOnlyDirect: false },
  { key: 'inspection_templates', group: 'Real Estate Operations', title: 'Inspection Checklists', subtitle: 'Move-in / move-out handover templates', route: '/e/inspection_templates', table: 'inspection_templates', adminCanPropose: true, ownerOnlyDirect: false },
  { key: 'payment_plan_templates', group: 'Real Estate Operations', title: 'Off-Plan Payment Plans', subtitle: 'Developer instalment plan structures', route: '/e/payment_plan_templates', table: 'payment_plan_templates', adminCanPropose: true, ownerOnlyDirect: false },
  // Platform & Automation
  { key: 'lead_routing_rules', group: 'Platform & Automation', title: 'Lead Routing Rules', subtitle: 'Automated enquiry distribution logic', route: '/e/lead_routing_rules', table: 'lead_routing_rules', adminCanPropose: true, ownerOnlyDirect: false },
  { key: 'custom_fields', group: 'Platform & Automation', title: 'No-Code Custom Fields', subtitle: 'Owner/Admin custom fields added across OS records', route: '/admin/settings', table: 'custom_fields', adminCanPropose: false, ownerOnlyDirect: true },
  { key: 'doc_templates', group: 'Platform & Automation', title: 'Confidential Document Templates', subtitle: 'RERA forms, contracts & executive letters', route: '/studio', table: 'doc_templates', adminCanPropose: true, ownerOnlyDirect: false },
  { key: 'attachments', group: 'Platform & Automation', title: 'Uploaded Files & PDF Vault', subtitle: 'All uploaded EID, Visa, Title Deed & contract PDFs', route: '/documents', table: 'attachments', adminCanPropose: false, ownerOnlyDirect: false },
] as const

export const OFFICE_ADMIN_GATED_MASTER_ENTITIES = new Set<string>(
  CORE_MASTER_REGISTRIES.filter(m => m.adminCanPropose).map(m => m.key),
)

export const OWNER_ONLY_MASTER_ENTITIES = new Set<string>(
  CORE_MASTER_REGISTRIES.filter(m => m.ownerOnlyDirect).map(m => m.key),
)
