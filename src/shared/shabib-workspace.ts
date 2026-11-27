/**
 * Shared constants, track stage blueprints, payment modes & legal shelf definitions
 * for Shabib's Workspace Executive Command Suite.
 */

export const CLOSING_TRACKS = [
  'Off-Plan',
  'Secondary',
  'Handover',
  'Leasing',
  'Property Management',
] as const

export type ClosingTrack = (typeof CLOSING_TRACKS)[number]

export interface ClosingStageItem {
  code: string
  label: string
  status: 'Pending' | 'In Progress' | 'Completed' | 'Blocked' | 'N/A'
  completed_at?: string | null
  owner?: string
  reference?: string
  notes?: string
}

export const CLOSING_STAGE_TEMPLATES: Record<ClosingTrack, ReadonlyArray<{ code: string; label: string }>> = {
  'Off-Plan': [
    { code: 'eoi', label: '1. Expression of Interest (EOI) & Unit Allocation' },
    { code: 'kyc_aml', label: '2. Buyer KYC, Passport/EID & Source of Funds (AML)' },
    { code: 'booking_deposit', label: '3. Booking Deposit / 10% Down Payment to Escrow' },
    { code: 'spa_signed', label: '4. Sales & Purchase Agreement (SPA) Executed' },
    { code: 'oqood_reg', label: '5. DLD Oqood / ADM Interim Registration & 4%/2% Fee' },
    { code: 'instalments_soa', label: '6. Construction Instalments & Statement of Account (SOA)' },
    { code: 'pre_handover', label: '7. Completion Notice & Pre-Handover Snagging Inspection' },
    { code: 'final_payment', label: '8. Final Handover Payment / Mortgage Disbursement' },
    { code: 'title_deed', label: '9. Final Title Deed Issued' },
    { code: 'key_handover', label: '10. Keys, Access Cards, DEWA & Handover Pack Delivered' },
  ],
  Secondary: [
    { code: 'viewing_forensic', label: '1. Verified Site Viewing & Forensic Inspection Report' },
    { code: 'offer_loi', label: '2. Written Offer / Letter of Intent (LOI) Agreed' },
    { code: 'rera_forms', label: '3. RERA Form A, Form B & Form I (A2A) Signed' },
    { code: 'kyc_aml', label: '4. Buyer & Seller KYC / AML / UBO / POA Screening' },
    { code: 'form_f_mou', label: '5. Form F (MOU) Signed & 10% Security Cheque Held' },
    { code: 'mortgage_val', label: '6. Bank Valuation, Liability Letter & Final Offer Letter (FOL)' },
    { code: 'developer_noc', label: '7. Service Charge Clearance & Developer NOC Issued' },
    { code: 'trustee_block', label: '8. DLD Registration Trustee Blocking / Manager Cheques Prepared' },
    { code: 'dld_transfer', label: '9. DLD Transfer Completed & New Title Deed Issued' },
    { code: 'commission_handover', label: '10. Commission Collected, DEWA Transferred & Keys Handed Over' },
  ],
  Handover: [
    { code: 'notice_received', label: '1. Developer Completion & Handover Notice Verified' },
    { code: 'soa_clearance', label: '2. Final Statement of Account (SOA) & Service Charges Cleared' },
    { code: 'snagging_audit', label: '3. Technical Snagging Audit & Defect List Submitted' },
    { code: 'rectification', label: '4. Developer Defect Rectification & Re-Inspection Passed' },
    { code: 'dewa_chiller', label: '5. DEWA, District Cooling (Empower/Emicool) & Gas Activated' },
    { code: 'title_deed', label: '6. Title Deed Registration Completed' },
    { code: 'keys_access', label: '7. Keys, Parking Fobs, Access Cards & Warranties Collected' },
    { code: 'post_handover', label: '8. Ready for Move-In / Leasing / Property Management Onboarding' },
  ],
  Leasing: [
    { code: 'viewing_report', label: '1. Verified Viewing & Tenant Requirement Confirmed' },
    { code: 'offer_hold', label: '2. Rental Offer Agreed & Holding / Security Deposit Received' },
    { code: 'tenant_kyc', label: '3. Tenant Passport, Visa, Emirates ID & Cheque Verification' },
    { code: 'tenancy_signed', label: '4. Unified Tenancy Contract & Addendum Signed (Both Parties)' },
    { code: 'pdc_cheques', label: '5. Security Deposit + All Rent PDC Cheques Collected & Logged' },
    { code: 'ejari_reg', label: '6. Ejari / Tawtheeq Registered & Certificate Issued' },
    { code: 'dewa_movein', label: '7. DEWA Connected & Move-In Permit Approved' },
    { code: 'movein_keys', label: '8. Move-In Inspection Report, Meter Readings & Keys Handed Over' },
  ],
  'Property Management': [
    { code: 'owner_onboard', label: '1. Landlord Onboarding, Title Deed & KYC Verified' },
    { code: 'pma_signed', label: '2. Property Management Agreement (PMA) & POA Signed' },
    { code: 'snag_audit', label: '3. Baseline Unit Audit, Photos & Inventory Checklist' },
    { code: 'marketing_let', label: '4. Trakheesi Permit, Portal Listing & Tenant Placement' },
    { code: 'ejari_pdc', label: '5. Ejari Registered & PDC Cheque Vault Deposited' },
    { code: 'maintenance_sla', label: '6. Preventive Maintenance, AMC & Vendor Contracts Active' },
    { code: 'owner_statement', label: '7. Monthly/Quarterly Owner Statement & Net Rent Remittance' },
    { code: 'renewal_90d', label: '8. 90-Day RERA Index Renewal Notice & Audit Complete' },
  ],
}

export function defaultStagesForTrack(track: ClosingTrack): ClosingStageItem[] {
  return (CLOSING_STAGE_TEMPLATES[track] || CLOSING_STAGE_TEMPLATES.Secondary).map(s => ({
    code: s.code,
    label: s.label,
    status: 'Pending',
    completed_at: null,
    owner: '',
    reference: '',
    notes: '',
  }))
}

export const SHABIB_PAYMENT_MODES = [
  'Cash',
  'Bank Transfer (BT)',
  'Botim',
  'Cheque / PDC',
  'Manager Cheque',
  'Escrow',
  'Other',
] as const

export const SHABIB_SETTLEMENT_STATUSES = [
  'Pending',
  'Received',
  'Paid',
] as const

export const SHABIB_LEGAL_QUICK_SHELF = [
  { code: 'SL-A2A-PACK', short: 'Agent-to-Agent (A2A / Form I)', badge: 'Co-Broke', category: 'Sales (Secondary)' },
  { code: 'SL-LOI-RES', short: 'Letter of Intent (LOI)', badge: 'Purchase / Lease', category: 'Sales (Secondary)' },
  { code: 'LS-TENANCY-FULL', short: 'Tenancy Contract (Unified UAE)', badge: 'Leasing', category: 'Leasing' },
  { code: 'LS-EJARI-CHK', short: 'Ejari Registration Pack', badge: 'DLD / Ejari', category: 'Leasing' },
  { code: 'SL-NOC-PACK', short: 'NOC (Developer / Bank / Owner)', badge: 'Clearance', category: 'Sales (Secondary)' },
  { code: 'SL-FORM-F', short: 'Sale MOU (Form F Agreement)', badge: 'RERA Form F', category: 'Sales (Secondary)' },
  { code: 'LC-01', short: 'Seller Listing Agreement (Form A)', badge: 'RERA Form A', category: 'Sales (Secondary)' },
  { code: 'LC-03', short: 'Buyer Agreement (Form B)', badge: 'RERA Form B', category: 'Sales (Secondary)' },
  { code: 'LC-04', short: 'Property Management Agreement', badge: 'Prop Mgmt', category: 'Property Management' },
  { code: 'OP-ASSIGN', short: 'Off-Plan Assignment Agreement', badge: 'Off-Plan', category: 'Off-Plan' },
  { code: 'SC-05', short: 'Key Handover Certificate', badge: 'Handover', category: 'Sales (Secondary)' },
  { code: 'FN-COMM-EXP-TPL', short: 'Commission & Expense Statement', badge: 'Finance', category: 'Finance & Procurement' },
] as const
