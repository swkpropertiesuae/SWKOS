/**
 * Master All-Data Excel Workbook (.xlsx) Exporter & Automated Daily Backup Engine
 *
 * Exports every active business module of SWK Properties OS into a cleanly formatted
 * multi-sheet Microsoft Excel workbook (converting M() minor-unit columns to AED and
 * strictly excluding password hashes, TOTP secrets, API keys, and session tokens).
 *
 * Also drives the automated daily full backup job (DB snapshot + Master Excel .xlsx)
 * with 30-day rolling local retention and optional Cloudflare R2 cloud upload.
 */
import fs from 'node:fs'
import path from 'node:path'
import { db, inDemo, q, tableExists } from '../db'
import { BACKUP_EXT, dirs, isBackupFile } from '../config'
import { forbidden, fromCents, nowIso, safeJson, todayStr } from '../util'
import { r2Configured, r2Put } from '../integrations/storage'
import { logIntegration } from '../integrations/log'
import { SWK_COMPANY_NAME, SWK_RERA_ORN, SWK_TRADE_LICENSE } from '../../shared/corporate-footer'
import { buildXlsxBuffer, type XlsxSheetSpec } from './xlsx-builder'

const DAILY_BACKUP_SETTING_KEY = 'backup:last_daily_json'
const MAX_LOCAL_BACKUPS = 30

export interface DailyBackupStatus {
  last_run_at: string | null
  reason: string | null
  db_file: string | null
  db_bytes: number
  excel_file: string | null
  excel_bytes: number
  sheet_count: number
  total_rows: number
  r2_uploaded: boolean
  schedule: string
  retention_days: number
}

const aedVal = (cents: unknown): number => {
  const n = Number(cents ?? 0)
  return Number.isFinite(n) ? Number(fromCents(n).toFixed(2)) : 0
}

const numVal = (v: unknown): number | string => {
  if (v === null || v === undefined || v === '') return ''
  const n = Number(v)
  return Number.isFinite(n) ? n : String(v)
}

const safeQuery = (label: string, sql: string): any[] => {
  try {
    return q.all(sql)
  } catch (err) {
    console.error(`excel-backup query failed [${label}]:`, err)
    return []
  }
}

export function isExcelBackupFile(name: string): boolean {
  return /^SWK-OS-Master-Excel-[\dT-]+\.xlsx$/i.test(path.basename(name))
}

export function buildMasterExcelWorkbook(): {
  buffer: Buffer
  filename: string
  sheetCount: number
  totalRows: number
  counts: Array<{ sheet: string; rows: number }>
} {
  const generatedAt = nowIso()
  const sheets: XlsxSheetSpec[] = []
  const counts: Array<{ sheet: string; rows: number }> = []

  const addSheet = (name: string, headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>) => {
    sheets.push({ name, headers, rows })
    counts.push({ sheet: name, rows: rows.length })
  }

  // 01 Projects
  if (tableExists('properties')) {
    const rows = safeQuery('01_Projects', `
      SELECT p.property_no, p.title, p.emirate, p.department_division, p.property_type, p.status,
             p.launch_status, d.name AS developer_name, c.name AS community_name, p.building_name,
             p.bedrooms, p.bathrooms, p.area_sqft, p.price, p.rent_annual, p.roi_percent,
             p.handover_quarter, p.payment_plan, p.rera_permit_no, p.permit_expiry, p.title_deed_no,
             p.is_off_plan, p.is_exclusive, p.syndicate_pf, p.syndicate_bayut, p.syndicate_dubizzle,
             p.listed_date, p.address
      FROM properties p
      LEFT JOIN developers d ON d.id = p.developer_ref
      LEFT JOIN communities c ON c.id = p.community_ref
      WHERE p.deleted_at IS NULL
      ORDER BY p.id DESC
    `)
    addSheet(
      '01_Projects',
      [
        'Project No', 'Title', 'Emirate', 'Division', 'Type', 'Status', 'Launch Stage',
        'Developer', 'Community', 'Building', 'Bedrooms', 'Bathrooms', 'Area (sqft)',
        'Price (AED)', 'Annual Rent (AED)', 'ROI %', 'Handover', 'Payment Plan',
        'Trakheesi / ADM Permit', 'Permit Expiry', 'Title Deed / Oqood', 'Off-Plan',
        'Exclusive', 'Property Finder', 'Bayut', 'Dubizzle', 'Listed Date', 'Address',
      ],
      rows.map(r => [
        r.property_no, r.title, r.emirate, r.department_division, r.property_type, r.status,
        r.launch_status, r.developer_name, r.community_name, r.building_name,
        numVal(r.bedrooms), numVal(r.bathrooms), numVal(r.area_sqft),
        aedVal(r.price), aedVal(r.rent_annual), numVal(r.roi_percent),
        r.handover_quarter, r.payment_plan, r.rera_permit_no, r.permit_expiry, r.title_deed_no,
        Boolean(r.is_off_plan), Boolean(r.is_exclusive), Boolean(r.syndicate_pf),
        Boolean(r.syndicate_bayut), Boolean(r.syndicate_dubizzle), r.listed_date, r.address,
      ]),
    )
  }

  // 02 Units
  if (tableExists('units')) {
    const rows = safeQuery('02_Units', `
      SELECT u.unit_no, p.title AS project_title, u.unit_type, u.status, u.bedrooms, u.bathrooms,
             u.area_sqft, u.sale_price, u.rent_annual, u.service_charge_annual, u.furnishing,
             u.floor_no, u.view, u.parking_slots
      FROM units u
      LEFT JOIN properties p ON p.id = u.property_id
      WHERE u.deleted_at IS NULL
      ORDER BY u.id DESC
    `)
    addSheet(
      '02_Units',
      [
        'Unit No', 'Project', 'Unit Type', 'Status', 'Bedrooms', 'Bathrooms', 'Area (sqft)',
        'Sale Price (AED)', 'Annual Rent (AED)', 'Service Charge (AED/yr)', 'Furnishing',
        'Floor', 'View', 'Parking',
      ],
      rows.map(r => [
        r.unit_no, r.project_title, r.unit_type, r.status, numVal(r.bedrooms), numVal(r.bathrooms),
        numVal(r.area_sqft), aedVal(r.sale_price), aedVal(r.rent_annual), aedVal(r.service_charge_annual),
        r.furnishing, numVal(r.floor_no), r.view, r.parking_slots,
      ]),
    )
  }

  // 03 Developers
  if (tableExists('developers')) {
    const rows = safeQuery('03_Developers', `SELECT code, name, emirate, rera_id, website, phone, email, active FROM developers WHERE deleted_at IS NULL ORDER BY name ASC`)
    addSheet(
      '03_Developers',
      ['Code', 'Developer Name', 'Emirate', 'RERA / DMT ID', 'Website', 'Phone', 'Email', 'Active'],
      rows.map(r => [r.code, r.name, r.emirate, r.rera_id, r.website, r.phone, r.email, Boolean(r.active)]),
    )
  }

  // 04 Communities
  if (tableExists('communities')) {
    const rows = safeQuery('04_Communities', `SELECT code, name, emirate, area, segment, master_developer, avg_price_sqft, gross_yield_pct, service_charge_sqft, active FROM communities WHERE deleted_at IS NULL ORDER BY name ASC`)
    addSheet(
      '04_Communities',
      ['Code', 'Community', 'Emirate', 'District', 'Segment', 'Master Developer', 'Avg PSF (AED)', 'Avg Gross Yield %', 'Service Charge/sqft', 'Active'],
      rows.map(r => [r.code, r.name, r.emirate, r.area, r.segment, r.master_developer, numVal(r.avg_price_sqft), numVal(r.gross_yield_pct), numVal(r.service_charge_sqft), Boolean(r.active)]),
    )
  }

  // 05 Leads
  if (tableExists('leads')) {
    const rows = safeQuery('05_Leads', `
      SELECT l.lead_no, l.company, l.contact_name, l.phone, l.email, l.department_division, l.status,
             l.source, l.interest, l.buyer_finance_type, l.destination, l.bedrooms_wanted,
             l.est_value, l.lead_score, l.score_band, u.name AS owner_name,
             l.first_response_at, l.sla_due_at, l.created_at
      FROM leads l
      LEFT JOIN users u ON u.id = l.owner_id
      WHERE l.deleted_at IS NULL
      ORDER BY l.id DESC
    `)
    addSheet(
      '05_Leads',
      [
        'Lead No', 'Client / Company', 'Contact Person', 'Phone', 'Email', 'Division', 'Status',
        'Source', 'Interest', 'Finance Type', 'Target Area', 'Bedrooms', 'Budget (AED)',
        'Score', 'Heat', 'Assigned Advisor', 'First Response At', 'SLA Due At', 'Created At',
      ],
      rows.map(r => [
        r.lead_no, r.company, r.contact_name, r.phone, r.email, r.department_division, r.status,
        r.source, r.interest, r.buyer_finance_type, r.destination, numVal(r.bedrooms_wanted),
        aedVal(r.est_value), numVal(r.lead_score), r.score_band, r.owner_name,
        r.first_response_at, r.sla_due_at, r.created_at,
      ]),
    )
  }

  // 06 Contacts & Clients (parties)
  if (tableExists('parties')) {
    const rows = safeQuery('06_Contacts_Clients', `
      SELECT code, name, status, is_customer, is_landlord, is_tenant, is_vendor, is_broker,
             phone, email, city, trn, kyc_status, kyc_expiry, sanctions_status, risk_rating, source
      FROM parties WHERE deleted_at IS NULL ORDER BY id DESC
    `)
    addSheet(
      '06_Contacts_Clients',
      [
        'Code', 'Name', 'Status', 'Customer', 'Landlord', 'Tenant', 'Vendor', 'Broker',
        'Phone', 'Email', 'City', 'TRN', 'KYC Status', 'KYC Expiry', 'Sanctions', 'Risk', 'Source',
      ],
      rows.map(r => [
        r.code, r.name, r.status, Boolean(r.is_customer), Boolean(r.is_landlord), Boolean(r.is_tenant),
        Boolean(r.is_vendor), Boolean(r.is_broker), r.phone, r.email, r.city, r.trn,
        r.kyc_status, r.kyc_expiry, r.sanctions_status, r.risk_rating, r.source,
      ]),
    )
  }

  // 07 Deal Files (jobs)
  if (tableExists('jobs')) {
    const rows = safeQuery('07_Deal_Files', `
      SELECT j.job_no, j.deal_name, j.department_division, j.deal_type, j.job_status,
             j.operational_status, j.stage_12, p.title AS property_title, c.name AS client_name,
             a.name AS agent_name, j.buyer_finance_type, j.legal_payment_mode,
             j.deal_date, j.target_close, j.actual_close, j.deal_value, j.commission_pct,
             j.commission_amount, j.a2a_commission_amount, j.company_50_share, j.advisor_50_share,
             j.total_revenue, j.profit
      FROM jobs j
      LEFT JOIN properties p ON p.id = j.property_id
      LEFT JOIN parties c ON c.id = j.client_id
      LEFT JOIN agents a ON a.id = j.agent_id
      WHERE j.deleted_at IS NULL
      ORDER BY j.id DESC
    `)
    addSheet(
      '07_Deal_Files',
      [
        'Deal No', 'Deal Name', 'Division', 'Type', 'Status', 'Stage', '12-Stage Code',
        'Property', 'Client', 'Agent', 'Finance', 'Payment Channel', 'Deal Date',
        'Target Close', 'Actual Close', 'Deal Value (AED)', 'Comm %', 'Commission (AED)',
        '3rd-Party A2A (AED)', 'SWK 50% (AED)', 'Advisor 50% (AED)', 'Revenue (AED)', 'Profit (AED)',
      ],
      rows.map(r => [
        r.job_no, r.deal_name, r.department_division, r.deal_type, r.job_status,
        r.operational_status, r.stage_12, r.property_title, r.client_name, r.agent_name,
        r.buyer_finance_type, r.legal_payment_mode, r.deal_date, r.target_close, r.actual_close,
        aedVal(r.deal_value), numVal(r.commission_pct), aedVal(r.commission_amount),
        aedVal(r.a2a_commission_amount), aedVal(r.company_50_share), aedVal(r.advisor_50_share),
        aedVal(r.total_revenue), aedVal(r.profit),
      ]),
    )
  }

  // 08 Leases & Ejari
  if (tableExists('leases')) {
    const rows = safeQuery('08_Leases_Ejari', `
      SELECT l.lease_no, l.unit_title, l.lease_type, l.status, l.start_date, l.end_date,
             ll.name AS landlord_name, tn.name AS tenant_name, ag.name AS agent_name,
             l.annual_rent, l.monthly_rent, l.cheque_count, l.security_deposit, l.agency_fee,
             l.ejari_no, l.ejari_date, l.portal_source
      FROM leases l
      LEFT JOIN parties ll ON ll.id = l.landlord_id
      LEFT JOIN parties tn ON tn.id = l.tenant_id
      LEFT JOIN agents ag ON ag.id = l.agent_id
      WHERE l.deleted_at IS NULL
      ORDER BY l.id DESC
    `)
    addSheet(
      '08_Leases_Ejari',
      [
        'Lease No', 'Unit', 'Type', 'Status', 'Start Date', 'End Date', 'Landlord', 'Tenant',
        'Agent', 'Annual Rent (AED)', 'Monthly Rent (AED)', 'Cheques', 'Security Deposit (AED)',
        'Agency Fee (AED)', 'Ejari No', 'Ejari Date', 'Portal',
      ],
      rows.map(r => [
        r.lease_no, r.unit_title, r.lease_type, r.status, r.start_date, r.end_date,
        r.landlord_name, r.tenant_name, r.agent_name, aedVal(r.annual_rent), aedVal(r.monthly_rent),
        numVal(r.cheque_count), aedVal(r.security_deposit), aedVal(r.agency_fee),
        r.ejari_no, r.ejari_date, r.portal_source,
      ]),
    )
  }

  // 09 Rent Schedules & PDC
  if (tableExists('rent_schedules')) {
    const rows = safeQuery('09_Rent_PDC', `
      SELECT lease_no, due_date, amount, paid_amount, status, paid_date, payment_method, cheque_no, cheque_date, is_pdc
      FROM rent_schedules WHERE deleted_at IS NULL ORDER BY due_date ASC
    `)
    addSheet(
      '09_Rent_PDC',
      ['Lease No', 'Due Date', 'Amount Due (AED)', 'Paid Amount (AED)', 'Status', 'Paid Date', 'Method', 'Cheque No', 'Cheque Date', 'Is PDC'],
      rows.map(r => [
        r.lease_no, r.due_date, aedVal(r.amount), aedVal(r.paid_amount), r.status,
        r.paid_date, r.payment_method, r.cheque_no, r.cheque_date, Boolean(r.is_pdc),
      ]),
    )
  }

  // 10 Mandates (Form A)
  if (tableExists('mandates')) {
    const rows = safeQuery('10_Mandates_FormA', `
      SELECT m.mandate_no, m.property_title, m.mandate_type, m.status, o.name AS owner_name,
             a.name AS agent_name, m.asking_price, m.asking_rent, m.start_date, m.end_date, m.exclusive
      FROM mandates m
      LEFT JOIN parties o ON o.id = m.owner_id
      LEFT JOIN agents a ON a.id = m.agent_id
      WHERE m.deleted_at IS NULL
      ORDER BY m.id DESC
    `)
    addSheet(
      '10_Mandates_FormA',
      ['Mandate No', 'Property', 'Type', 'Status', 'Owner', 'Agent', 'Asking Price (AED)', 'Asking Rent (AED)', 'Start Date', 'Expiry Date', 'Exclusive'],
      rows.map(r => [
        r.mandate_no, r.property_title, r.mandate_type, r.status, r.owner_name, r.agent_name,
        aedVal(r.asking_price), aedVal(r.asking_rent), r.start_date, r.end_date, Boolean(r.exclusive),
      ]),
    )
  }

  // 11 Viewings
  if (tableExists('viewings')) {
    const rows = safeQuery('11_Viewings', `
      SELECT v.viewing_no, v.property_title, l.company AS lead_name, a.name AS agent_name,
             v.scheduled_at, v.status, v.interest_level, v.checked_in_at, v.feedback
      FROM viewings v
      LEFT JOIN leads l ON l.id = v.lead_id
      LEFT JOIN agents a ON a.id = v.agent_id
      WHERE v.deleted_at IS NULL
      ORDER BY v.scheduled_at DESC
    `)
    addSheet(
      '11_Viewings',
      ['Viewing No', 'Property', 'Lead / Buyer', 'Agent', 'Scheduled At', 'Status', 'Interest (1-10)', 'GPS Check-In', 'Feedback'],
      rows.map(r => [
        r.viewing_no, r.property_title, r.lead_name, r.agent_name, r.scheduled_at,
        r.status, numVal(r.interest_level), r.checked_in_at, r.feedback,
      ]),
    )
  }

  // 12 Forensic Site Visits & Viewings (forensic_field_reports)
  if (tableExists('forensic_field_reports')) {
    const rows = safeQuery('12_Forensic_Visits', `
      SELECT report_no, report_type, submitted_by_name, visit_date, community, building_or_project,
             unit_no, gps_lat, gps_lng, gps_address_label, met_person_name, met_person_role,
             met_person_phone, owner_or_agent_name, owner_or_agent_phone, third_party_agency,
             deal_category, asking_price_aed, final_price_aed, yearly_rent_aed, cheques_count,
             outcome, verification_status, verified_by_name
      FROM forensic_field_reports
      WHERE deleted_at IS NULL
      ORDER BY id DESC
    `)
    addSheet(
      '12_Forensic_Visits',
      [
        'Report No', 'Type', 'Staff', 'Date', 'Community', 'Building / Project', 'Unit',
        'GPS Lat', 'GPS Lng', 'GPS Address', 'Person Met', 'Role', 'Phone',
        'Owner / Agent', 'Owner / Agent Phone', '3rd-Party Agency', 'Deal Category', 'Asking (AED)',
        'Final Price (AED)', 'Yearly Rent (AED)', 'Cheques', 'Outcome',
        'Verification', 'Verified By',
      ],
      rows.map(r => [
        r.report_no, r.report_type, r.submitted_by_name, r.visit_date, r.community, r.building_or_project,
        r.unit_no, numVal(r.gps_lat), numVal(r.gps_lng), r.gps_address_label, r.met_person_name, r.met_person_role,
        r.met_person_phone, r.owner_or_agent_name, r.owner_or_agent_phone, r.third_party_agency,
        r.deal_category, numVal(r.asking_price_aed), numVal(r.final_price_aed), numVal(r.yearly_rent_aed),
        numVal(r.cheques_count), r.outcome, r.verification_status, r.verified_by_name,
      ]),
    )
  }

  // 13 Pin-to-Pin Closing Dossiers (closing_forensic_dossiers)
  if (tableExists('closing_forensic_dossiers')) {
    const rows = safeQuery('13_Closing_Dossiers', `
      SELECT dossier_no, track, title, community, building_or_project, unit_no, client_name,
             client_phone, counterparty_name, agent_name, third_party_agency,
             asking_price_aed, agreed_price_aed, yearly_rent_aed, total_cheques_count,
             agency_commission_aed, payment_mode, ejari_or_oqood_or_deed_ref, status, handover_date
      FROM closing_forensic_dossiers
      WHERE deleted_at IS NULL
      ORDER BY id DESC
    `)
    addSheet(
      '13_Closing_Dossiers',
      [
        'Dossier No', 'Track', 'Deal Title', 'Community', 'Building / Project', 'Unit', 'Client', 'Client Phone',
        'Seller / Landlord', 'Agent', '3rd-Party Agency', 'Asking (AED)', 'Agreed Price (AED)',
        'Yearly Rent (AED)', 'Cheques', 'Commission (AED)', 'Payment Mode', 'Ejari / Oqood / Deed Ref', 'Status', 'Handover Date',
      ],
      rows.map(r => [
        r.dossier_no, r.track, r.title, r.community, r.building_or_project, r.unit_no, r.client_name,
        r.client_phone, r.counterparty_name, r.agent_name, r.third_party_agency,
        numVal(r.asking_price_aed), numVal(r.agreed_price_aed), numVal(r.yearly_rent_aed),
        numVal(r.total_cheques_count), numVal(r.agency_commission_aed), r.payment_mode,
        r.ejari_or_oqood_or_deed_ref, r.status, r.handover_date,
      ]),
    )
  }

  // 14 Closing Cheque Ledger (closing_cheque_ledger)
  if (tableExists('closing_cheque_ledger')) {
    const rows = safeQuery('14_Cheque_Ledger', `
      SELECT c.cheque_no, d.dossier_no, c.bank_name, c.payee_name, c.purpose,
             c.amount_aed, c.payment_method, c.cheque_date, c.status, c.notes
      FROM closing_cheque_ledger c
      LEFT JOIN closing_forensic_dossiers d ON d.id = c.dossier_id
      ORDER BY c.cheque_date ASC
    `)
    addSheet(
      '14_Cheque_Ledger',
      ['Cheque No', 'Dossier No', 'Bank', 'Payee', 'Purpose', 'Amount (AED)', 'Method', 'Cheque Date', 'Status', 'Notes'],
      rows.map(r => [
        r.cheque_no, r.dossier_no, r.bank_name, r.payee_name, r.purpose,
        numVal(r.amount_aed), r.payment_method, r.cheque_date, r.status, r.notes,
      ]),
    )
  }

  // 15 Agent Commissions & Expenses Ledger (shabib_commission_expenses)
  if (tableExists('shabib_commission_expenses')) {
    const rows = safeQuery('15_Commissions_Expenses', `
      SELECT entry_no, entry_type, agent_name, deal_ref, expense_category, property_label,
             gross_amount_aed, net_amount_aed, status, payment_mode, payment_reference, entry_date,
             is_third_party, third_party_agency, third_party_agent_name, third_party_phone, third_party_brn, notes
      FROM shabib_commission_expenses
      WHERE deleted_at IS NULL
      ORDER BY id DESC
    `)
    addSheet(
      '15_Commissions_Expenses',
      [
        'Entry No', 'Type', 'Agent', 'Deal Ref', 'Category', 'Property / Label', 'Gross (AED)', 'Net (AED)',
        'Status', 'Payment Mode', 'Reference', 'Date', '3rd Party', '3rd-Party Agency',
        '3rd-Party Agent', '3rd-Party Phone', '3rd-Party BRN', 'Notes',
      ],
      rows.map(r => [
        r.entry_no, r.entry_type, r.agent_name, r.deal_ref, r.expense_category, r.property_label,
        numVal(r.gross_amount_aed), numVal(r.net_amount_aed), r.status, r.payment_mode, r.payment_reference, r.entry_date,
        Boolean(r.is_third_party), r.third_party_agency, r.third_party_agent_name,
        r.third_party_phone, r.third_party_brn, r.notes,
      ]),
    )
  }

  // 16 Staff & Employees (strictly ZERO password hashes / secrets!)
  if (tableExists('employees')) {
    const rows = safeQuery('16_Staff_Employees', `
      SELECT e.emp_no, e.name, e.designation, e.status, e.email, e.phone, e.join_date,
             e.nationality, e.compensation_model, e.basic_salary, e.housing_allowance,
             e.transport_allowance, e.passport_expiry, e.eid_expiry, e.visa_expiry
      FROM employees e
      WHERE e.deleted_at IS NULL
      ORDER BY e.name ASC
    `)
    addSheet(
      '16_Staff_Employees',
      [
        'Emp No', 'Full Name', 'Job Role / Designation', 'Status', 'Work Email', 'Phone',
        'Join Date', 'Nationality', 'Compensation Model', 'Basic (AED)', 'Housing (AED)',
        'Transport (AED)', 'Passport Expiry', 'EID Expiry', 'Visa Expiry',
      ],
      rows.map(r => [
        r.emp_no, r.name, r.designation, r.status, r.email, r.phone, r.join_date,
        r.nationality, r.compensation_model, aedVal(r.basic_salary), aedVal(r.housing_allowance),
        aedVal(r.transport_allowance), r.passport_expiry, r.eid_expiry, r.visa_expiry,
      ]),
    )
  }

  // 17 Attendance
  if (tableExists('attendance')) {
    const rows = safeQuery('17_Attendance', `
      SELECT a.att_date, e.name AS employee_name, a.status, a.checkin_mode, a.check_in, a.check_out, a.hours, a.note
      FROM attendance a
      LEFT JOIN employees e ON e.id = a.employee_id
      WHERE a.deleted_at IS NULL
      ORDER BY a.att_date DESC, a.id DESC
      LIMIT 2000
    `)
    addSheet(
      '17_Attendance',
      ['Date', 'Staff Member', 'Status', 'Check-In Mode', 'Check-In', 'Check-Out', 'Hours', 'Note'],
      rows.map(r => [r.att_date, r.employee_name, r.status, r.checkin_mode, r.check_in, r.check_out, numVal(r.hours), r.note]),
    )
  }

  // 18 Tasks
  if (tableExists('tasks')) {
    const rows = safeQuery('18_Tasks', `
      SELECT t.id, t.title, t.status, t.priority, u.name AS assignee_name, t.due_date, t.created_at
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assignee_id
      WHERE t.deleted_at IS NULL
      ORDER BY t.id DESC
      LIMIT 2000
    `)
    addSheet(
      '18_Tasks',
      ['Task ID', 'Title', 'Status', 'Priority', 'Assigned To', 'Due Date', 'Created At'],
      rows.map(r => [numVal(r.id), r.title, r.status, r.priority, r.assignee_name, r.due_date, r.created_at]),
    )
  }

  // 19 Invoices
  if (tableExists('invoices')) {
    const rows = safeQuery('19_Invoices', `
      SELECT i.invoice_no, i.doc_type, p.name AS customer_name, i.invoice_date, i.due_date,
             i.currency, i.status, i.subtotal, i.vat_total, i.total, i.base_total, i.paid_amount, i.balance
      FROM invoices i
      LEFT JOIN parties p ON p.id = i.party_id
      WHERE i.deleted_at IS NULL
      ORDER BY i.id DESC
    `)
    addSheet(
      '19_Invoices',
      ['Invoice No', 'Type', 'Customer', 'Invoice Date', 'Due Date', 'Currency', 'Status', 'Subtotal', 'VAT', 'Total (Doc Ccy)', 'Total (AED)', 'Paid', 'Balance'],
      rows.map(r => [
        r.invoice_no, r.doc_type, r.customer_name, r.invoice_date, r.due_date, r.currency,
        r.status, aedVal(r.subtotal), aedVal(r.vat_total), aedVal(r.total), aedVal(r.base_total), aedVal(r.paid_amount), aedVal(r.balance),
      ]),
    )
  }

  // 20 Receipts
  if (tableExists('receipts')) {
    const rows = safeQuery('20_Receipts', `
      SELECT r.receipt_no, p.name AS customer_name, r.receipt_date, r.method, r.currency,
             r.amount, r.reference, r.status
      FROM receipts r
      LEFT JOIN parties p ON p.id = r.party_id
      WHERE r.deleted_at IS NULL
      ORDER BY r.id DESC
    `)
    addSheet(
      '20_Receipts',
      ['Receipt No', 'Customer', 'Date', 'Method', 'Currency', 'Amount (Doc Ccy)', 'Reference', 'Status'],
      rows.map(r => [r.receipt_no, r.customer_name, r.receipt_date, r.method, r.currency, aedVal(r.amount), r.reference, r.status]),
    )
  }

  // 00 Executive Summary (inserted first)
  const totalRows = counts.reduce((acc, c) => acc + c.rows, 0)
  const summarySheet: XlsxSheetSpec = {
    name: '00_Summary',
    headers: ['Section / Sheet', 'Record Count', 'Details'],
    rows: [
      ['Company', SWK_COMPANY_NAME, `RERA ORN ${SWK_RERA_ORN} · DET Licence ${SWK_TRADE_LICENSE}`],
      ['Generated At (UTC)', generatedAt, 'Automated SWK Properties OS Master Data Workbook'],
      ['Total Exported Sheets', sheets.length + 1, 'Includes all active OS modules (zero passwords or secret keys)'],
      ['Total Exported Records', totalRows, 'All monetary values converted to AED'],
      ['', '', ''],
      ...counts.map(c => [c.sheet, c.rows, 'Live table export']),
    ],
  }

  const finalSheets = [summarySheet, ...sheets]
  const buffer = buildXlsxBuffer(finalSheets)
  const stamp = generatedAt.replace(/[:.]/g, '-').slice(0, 19)
  const filename = `SWK-OS-Master-Excel-${stamp}.xlsx`

  return {
    buffer,
    filename,
    sheetCount: finalSheets.length,
    totalRows,
    counts,
  }
}

export function getDailyBackupStatus(): DailyBackupStatus {
  const fallback: DailyBackupStatus = {
    last_run_at: null,
    reason: null,
    db_file: null,
    db_bytes: 0,
    excel_file: null,
    excel_bytes: 0,
    sheet_count: 0,
    total_rows: 0,
    r2_uploaded: false,
    schedule: 'Automatic daily at 02:30 AM GST (DB Snapshot + Master Excel .xlsx)',
    retention_days: MAX_LOCAL_BACKUPS,
  }
  try {
    const raw = q.val<string>(`SELECT value FROM settings WHERE key = ?`, DAILY_BACKUP_SETTING_KEY)
    const parsed = safeJson<Partial<DailyBackupStatus>>(raw, {})
    return { ...fallback, ...parsed }
  } catch {
    return fallback
  }
}

function sortedByMtimeAsc(files: string[]): string[] {
  return files
    .map(f => ({ f, mtimeMs: fs.statSync(path.join(dirs.backups, f)).mtimeMs }))
    .sort((a, b) => a.mtimeMs - b.mtimeMs)
    .map(x => x.f)
}

export async function runDailyFullBackup(reason: 'daily-auto' | 'manual' = 'manual'): Promise<DailyBackupStatus> {
  if (inDemo()) throw forbidden('Production backups cannot be created from the demo workspace')
  if (reason === 'daily-auto') {
    const prev = getDailyBackupStatus()
    if (prev.reason === 'daily-auto' && prev.last_run_at && todayStr(new Date(prev.last_run_at)) === todayStr()) {
      return prev
    }
  }
  fs.mkdirSync(dirs.backups, { recursive: true })
  const stamp = nowIso().replace(/[:.]/g, '-').slice(0, 19)
  const dbFile = `swk-daily-${stamp}${BACKUP_EXT}`
  const dbPath = path.join(dirs.backups, dbFile)
  await db.backup(dbPath)
  const dbBytes = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0

  const excel = buildMasterExcelWorkbook()
  const excelFile = `SWK-OS-Master-Excel-${stamp}.xlsx`
  const excelPath = path.join(dirs.backups, excelFile)
  fs.writeFileSync(excelPath, excel.buffer)
  const excelBytes = excel.buffer.length

  let r2Uploaded = false
  if (r2Configured()) {
    try {
      await r2Put(`backups/${dbFile}`, fs.readFileSync(dbPath), 'application/octet-stream')
      await r2Put(
        `backups/excel/${excelFile}`,
        excel.buffer,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      r2Uploaded = true
    } catch (err) {
      console.error('R2 daily full backup upload failed:', err)
    }
  }

  // Rolling 30-file local retention sorted by actual file mtime (never lexicographically!)
  const allFiles = fs.readdirSync(dirs.backups)
  for (const f of sortedByMtimeAsc(allFiles.filter(isBackupFile)).slice(0, -MAX_LOCAL_BACKUPS)) {
    fs.rmSync(path.join(dirs.backups, f), { force: true })
  }
  for (const f of sortedByMtimeAsc(allFiles.filter(isExcelBackupFile)).slice(0, -MAX_LOCAL_BACKUPS)) {
    fs.rmSync(path.join(dirs.backups, f), { force: true })
  }

  const now = nowIso()
  const status: DailyBackupStatus = {
    last_run_at: now,
    reason,
    db_file: dbFile,
    db_bytes: dbBytes,
    excel_file: excelFile,
    excel_bytes: excelBytes,
    sheet_count: excel.sheetCount,
    total_rows: excel.totalRows,
    r2_uploaded: r2Uploaded,
    schedule: 'Automatic daily at 02:30 AM GST (DB Snapshot + Master Excel .xlsx)',
    retention_days: MAX_LOCAL_BACKUPS,
  }

  q.run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    DAILY_BACKUP_SETTING_KEY,
    JSON.stringify(status),
    now,
  )
  logIntegration(
    'backup',
    reason,
    true,
    `Daily Full Backup complete: ${dbFile} + ${excelFile} (${excel.sheetCount} sheets, ${excel.totalRows} rows${r2Uploaded ? ', synced to R2' : ''})`,
  )
  return status
}

export function listFullBackups() {
  if (inDemo()) throw forbidden('Production backups cannot be accessed from the demo workspace')
  fs.mkdirSync(dirs.backups, { recursive: true })
  const all = fs.readdirSync(dirs.backups)
  const toInfo = (f: string) => {
    const st = fs.statSync(path.join(dirs.backups, f))
    return { name: f, bytes: st.size, at: st.mtime.toISOString(), _m: st.mtimeMs }
  }
  const sortNewest = (list: string[]) =>
    list
      .map(toInfo)
      .sort((a, b) => b._m - a._m)
      .map(({ name, bytes, at }) => ({ name, bytes, at }))
  return {
    status: getDailyBackupStatus(),
    db_backups: sortNewest(all.filter(isBackupFile)),
    excel_backups: sortNewest(all.filter(isExcelBackupFile)),
  }
}
