/**
 * SWK OS v4 Executive Restructure API:
 *  - Shabib's Corner + Privacy Fast Track (STRICT Owner-only zero-leak ledger, jobs, invoices, docs & Bulk AI Upload)
 *  - CORE Master Log (20 Registries + Office Admin → Owner Approval Gate)
 *  - 12-Stage Real Estate + Mortgage Pipeline Playbook & Gold-Rush Cash Velocity
 *  - Command Center Overview (Live Attendance, Field GPS Radar, Tasks Monitor, Assigned Clients, Critical Alerts)
 *  - Per-Client Document Vault (13 Core UAE Real Estate & Mortgage Compliance Documents)
 *  - Mortgage Exclusive Business Desk (Schedules, Deadlines, Valuations, Bank RM Follow-ups)
 *  - AI Case-Study Training Library (Pre-seeded + Continuous Learning for SWK AI)
 *  - Website & Social Media Campaigns Studio
 */
import type { FastifyInstance } from 'fastify'
import { q, qi, tableExists, tx } from '../db'
import { createRecord, getDef, SYSTEM_CTX, updateRecord } from '../engine'
import { notify } from '../notify'
import { getSetting } from '../settings'
import { bad, forbidden, fromCents, notFound, nowIso, todayStr } from '../util'
import {
  canAccessMasterLog,
  canAccessShabibsCorner,
  canAccessSwkAdminLogic,
  isAdminSwkUser,
  isOfficeAdminMeenakshi,
  isOwnerSwkUser,
  isRestrictedStaffUser,
} from '../../shared/swk-staff-access'
import {
  CLIENT_VAULT_REQUIRED_DOCS,
  CORE_MASTER_REGISTRIES,
  legacyStageFor12,
  OFFICE_ADMIN_GATED_MASTER_ENTITIES,
  OWNER_ONLY_MASTER_ENTITIES,
  PIPELINE_12_STAGES,
  PIPELINE_STAGE_MAP,
  resolveStage12Code,
} from '../../shared/swk-pipeline'
import { assertZeroShabibPublicPayload } from '../../shared/zero-shabib-guard'
import { body, idOf } from './helpers'

const SEEDED_CASE_STUDIES = [
  {
    code: 'CS-DXB-001',
    category: 'Secondary Resale',
    title: 'Mortgaged Seller Resale with Bank Liability Letter & DLD Trustee Block',
    client_profile: 'Resident Salaried Buyer (AED 45K/mo) purchasing AED 2.4M townhouse from mortgaged seller (ENBD liability AED 1.35M).',
    property_context: 'Dubai Hills Estate · Maple 2 · 3BR Townhouse · Form F signed with 45-day validity.',
    challenge: 'Seller bank took 18 days to issue Liability Letter; Form F expiry risked losing buyer pre-approval.',
    strategy_applied: 'Booked DLD Trustee blocking appointment 12 days prior, secured addendum extending Form F by 15 days, coordinated buyer bank manager cheques directly to ENBD settlement desk + seller net equity.',
    winning_outcome: 'Closed cleanly on Day 41; Title Deed issued at Trustee office; 2% commission + 5% VAT collected into SWK corporate bank.',
    lessons_learned: 'Always request Seller Liability Letter on Day 1 of Form F signing and schedule bank valuation in parallel within 72 hours.',
    tags: 'form-f,liability-letter,blocking,mortgage,dubai-hills,trustee',
  },
  {
    code: 'CS-DXB-002',
    category: 'Mortgage & Valuation',
    title: 'Valuation Shortfall Rescue (AED 180K Gap) Without Losing Buyer',
    client_profile: 'First-time Expat Buyer at 80% LTV buying AED 1.95M 2BR in Creek Harbour.',
    property_context: 'Dubai Creek Harbour · Creekside 18 · Independent bank valuation came back at AED 1.77M.',
    challenge: 'Buyer lacked extra AED 144K cash to bridge the 80% LTV gap on valuation.',
    strategy_applied: 'Compiled 6 verified DLD recent closed transactions within 90 days in the same stack (higher PSF), filed formal Valuation Reconsideration with bank RM, and negotiated AED 60K seller price concession.',
    winning_outcome: 'Bank revised valuation upward to AED 1.88M; seller accepted AED 1.89M; FOL signed in 5 working days.',
    lessons_learned: 'Never wait passively for bank valuation — hand the valuer a clean DLD comparable sheet before the site inspection.',
    tags: 'valuation,ltv,shortfall,creek-harbour,fol,bank-rm',
  },
  {
    code: 'CS-DXB-003',
    category: 'Off-Plan',
    title: 'Off-Plan Assignment (40% Paid) Before Handover Under Developer NOC Rules',
    client_profile: 'UK Overseas Investor exiting 1BR unit prior to Q4 handover to lock 24% capital gain.',
    property_context: 'Sobha Hartland / MBR City · Oqood registered · 40% paid threshold met.',
    challenge: 'New buyer required UAE mortgage on handover balance while unit was still under Oqood.',
    strategy_applied: 'Verified Statement of Account (SOA) + 40% paid NOC eligibility with developer, lined up cash assignment for seller equity + pre-approved handover mortgage for final 60% developer payment.',
    winning_outcome: 'Developer NOC issued in 6 days, Oqood transferred at Trustee office, full 50/50 split settled.',
    lessons_learned: 'Check developer minimum paid threshold (30%–50%) and exact assignment fee before marketing any off-plan resale.',
    tags: 'off-plan,oqood,soa,assignment,noc,uk-investor',
  },
  {
    code: 'CS-DXB-004',
    category: 'Distressed Exit',
    title: 'Immediate Cash Urgent Seller Exit (7-Day Closing Playbook)',
    client_profile: 'Corporate Owner needing liquidity within 10 days for business expansion.',
    property_context: 'Business Bay · Ready 1BR · Vacant on Transfer · Clear Title Deed.',
    challenge: 'Standard portal marketing takes 30–45 days; owner needed guaranteed cash buyer immediately.',
    strategy_applied: 'Activated Privacy Fast Track & matched top 5 pre-verified cash investors from SWK Owner Vault, structured 10% verified manager cheque at Form F and same-week developer e-NOC.',
    winning_outcome: 'Transferred in 6 days at 9% below peak market; owner secured liquidity on time.',
    lessons_learned: 'Maintain an active Cash-Ready VIP Buyer list segmented by community and AED 500K–5M ticket sizes for instant distressed matching.',
    tags: 'distress,cash-buyer,fast-track,urgent,business-bay,title-deed',
  },
  {
    code: 'CS-DXB-005',
    category: 'Mortgage & Valuation',
    title: 'Self-Employed SME Owner Low-Doc Mortgage Approval (DBR & Average Balance)',
    client_profile: 'Dubai Mainland LLC Shareholder (3 years trade licence, AED 1.8M annual company turnover).',
    property_context: 'JVC · 4BR Townhouse · Purchase price AED 3.1M.',
    challenge: 'Two tier-1 banks rejected due to audited financials showing low net profit despite strong bank inflows.',
    strategy_applied: 'Prepared 12-month company + personal Bank Statement Average Balance & Credit Turnover (CTO) worksheet, cleared two unused credit cards to bring DBR from 53% to 41%, and submitted to Islamic SME mortgage desk.',
    winning_outcome: 'Approved at 75% LTV (AED 2.325M) fixed 3 years at 4.19%; FOL issued in 9 days.',
    lessons_learned: 'Always audit AECB credit-card limits (5% of total limit counts toward 50% CBUAE DBR cap even if balance is AED 0).',
    tags: 'self-employed,dbr,aecb,credit-report,cto,average-balance,jvc',
  },
  {
    code: 'CS-DXB-006',
    category: 'Golden Visa',
    title: 'AED 2M+ Property Structuring for 10-Year UAE Golden Visa Eligibility',
    client_profile: 'Non-Resident Investor buying AED 2.15M off-plan / ready apartment for family residency.',
    property_context: 'Dubai Marina · 2BR Ready Unit · Mortgaged at 50% LTV.',
    challenge: 'Client feared mortgaged property would fail DLD Golden Visa equity rules.',
    strategy_applied: 'Confirmed DLD Golden Visa rule (property value >= AED 2M with bank NOC + DLD valuation certificate), organized bank NOC letter alongside Title Deed issuance.',
    winning_outcome: 'Title Deed + Golden Visa application filed within 48 hours of transfer.',
    lessons_learned: 'Position AED 2M+ threshold clearly during Stage 03 qualification — converts undecided AED 1.7M buyers into AED 2.05M closings.',
    tags: 'golden-visa,non-resident,marina,dld-valuation,noc',
  },
  {
    code: 'CS-DXB-007',
    category: 'A2A Co-Broke',
    title: 'Protected Agent-to-Agent (Form I) Closing on External Exclusive Stock',
    client_profile: 'Cash Buyer seeking Palm Jumeirah 3BR not in SWK direct stock.',
    property_context: 'Palm Jumeirah · Shoreline · Listed exclusively by external RERA brokerage.',
    challenge: 'Risk of client circumvention or commission dispute at transfer.',
    strategy_applied: 'Executed signed RERA Form B with buyer + RERA Form I (A2A) fixing 50/50 brokerage split before viewing, logged full viewing GPS trail and Form F commission addendum.',
    winning_outcome: 'AED 5.6M closing completed; SWK received full agreed 50% A2A split cleanly into corporate account.',
    lessons_learned: 'Zero viewing of 3rd-party stock without signed Form I + verified corporate bank details of counterparty brokerage.',
    tags: 'form-i,a2a,co-broke,palm-jumeirah,commission-protection',
  },
  {
    code: 'CS-DXB-008',
    category: 'Leasing & Ejari',
    title: 'Multi-Unit Landlord Portfolio Optimization & RERA Rent Index Renewal',
    client_profile: 'Landlord owning 6 apartments in Azizi Riviera & JVC facing 20% below-market legacy rents.',
    property_context: 'MBR City / Azizi Riviera · 6 leased units renewing in 100 days.',
    challenge: 'Missed 90-day statutory notice window loses legal right to RERA-permitted rent adjustment.',
    strategy_applied: 'Ran RERA Smart Rental Index check 105 days prior, issued formal written 90-day rent adjustment notices via registered email/notary, and re-let 1 vacant unit within 9 days at 8.1% gross yield.',
    winning_outcome: 'Portfolio annual rent increased by AED 94,000 cleanly under Law 33/2008 & Decree 43/2013.',
    lessons_learned: 'Track lease expiry 120 days ahead in OS Compliance/Leasing calendar so 90-day RERA notice deadlines are never missed.',
    tags: 'ejari,rera-index,90-day-notice,azizi-riviera,leasing,yield',
  },
  {
    code: 'CS-DXB-009',
    category: 'Compliance & RERA',
    title: 'Zero-Leak High-Value AML / Source-of-Funds & goAML Screening',
    client_profile: 'International HNW Buyer transferring AED 8.5M via licensed UAE exchange / international wire.',
    property_context: 'Downtown Dubai · Luxury 3BR Residence.',
    challenge: 'Complex cross-border funds required strict UAE Central Bank / MoE AML documentation.',
    strategy_applied: 'Completed UN/UAE EOCN sanctions screen, collected corporate UBO declaration + 6-month bank trail + audited dividend vouchers, blocked any third-party cash deposit, routed 100% through DLD-compliant manager cheque.',
    winning_outcome: 'Zero Trustee compliance hold; clean audit pack archived in Client Document Vault.',
    lessons_learned: 'Never accept cash or third-party personal transfers — verify Source of Funds before Form F signing.',
    tags: 'aml,goaml,kyc,ubo,source-of-funds,downtown,compliance',
  },
  {
    code: 'CS-DXB-010',
    category: 'Mortgage & Valuation',
    title: 'Non-Resident Investor 60% LTV UAE Mortgage Structuring',
    client_profile: 'UK-based Director earning GBP 220K/yr investing in Dubai Marina ready apartment.',
    property_context: 'Dubai Marina · AED 2.2M 1BR · 7.4% projected gross yield.',
    challenge: 'Non-resident bank rules require 6 months overseas bank statements, credit report, and strict minimum net income.',
    strategy_applied: 'Assembled full 13-doc vault (Passport, UK Payslips 6M, Bank Statements 6M, Experian Credit Report, Signed Bank App) prior to submission; secured 60% LTV non-resident pre-approval.',
    winning_outcome: 'Pre-approved in 8 days; closed remotely via Dubai Courts e-POA.',
    lessons_learned: 'Collect overseas credit report & apostilled POA early to prevent 3-week delays in non-resident transfers.',
    tags: 'non-resident,uk,mortgage,poa,credit-report,marina',
  },
] as const

export function ensureSeededAiCaseStudies() {
  if (!tableExists('ai_case_studies')) return
  const count = q.val<number>(`SELECT COUNT(*) FROM ai_case_studies`) ?? 0
  if (count > 0) return
  const ts = nowIso()
  for (const cs of SEEDED_CASE_STUDIES) {
    q.run(
      `INSERT INTO ai_case_studies (code, category, title, client_profile, property_context, challenge, strategy_applied, winning_outcome, lessons_learned, tags, trained_by_name, is_active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(code) DO NOTHING`,
      cs.code, cs.category, cs.title, cs.client_profile, cs.property_context, cs.challenge, cs.strategy_applied, cs.winning_outcome, cs.lessons_learned, cs.tags, 'SWK Knowledge Base', 1, ts, ts,
    )
  }
}

export function searchRelevantCaseStudies(queryText: string, limit = 4) {
  ensureSeededAiCaseStudies()
  const rows = q.all<any>(`SELECT * FROM ai_case_studies WHERE is_active = 1 ORDER BY id DESC LIMIT 200`)
  const terms = String(queryText || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3)
  if (!terms.length) return rows.slice(0, limit)
  return rows
    .map(r => {
      const hay = `${r.category} ${r.title} ${r.client_profile} ${r.property_context} ${r.challenge} ${r.strategy_applied} ${r.lessons_learned} ${r.tags || ''}`.toLowerCase()
      let score = 0
      for (const t of terms) if (hay.includes(t)) score += t.length >= 5 ? 3 : 1
      return { ...r, _score: score }
    })
    .filter(r => r._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
}

function requireOwnerOnly(req: any) {
  if (!canAccessShabibsCorner(req.user)) {
    throw forbidden("Shabib's Corner and Privacy Fast Track are locked exclusively to Owner Shabib Siraj.")
  }
}

function nextFastTrackCode(prefix: 'FT' | 'FT-INV'): string {
  const yr = new Date().getFullYear()
  const tbl = prefix === 'FT' ? 'privacy_fast_track_jobs' : 'privacy_fast_track_invoices'
  const c = (q.val<number>(`SELECT COUNT(*) FROM ${tbl}`) ?? 0) + 1
  return `${prefix}-${yr}-${String(c).padStart(4, '0')}`
}

function build12StageSnapshot() {
  const jobs = q.all<any>(
    `SELECT j.id, j.job_no, j.deal_name, j.deal_type, j.department_division, j.job_status, j.operational_status, j.stage_12,
            j.deal_value, j.commission_pct, j.target_close, j.deal_date, j.updated_at, j.buyer_finance_type,
            p.name AS client_name, pr.title AS property_title, a.name AS agent_name
     FROM jobs j
     LEFT JOIN parties p ON p.id = j.client_id
     LEFT JOIN properties pr ON pr.id = j.property_id
     LEFT JOIN agents a ON a.id = j.agent_id
     WHERE j.deleted_at IS NULL AND COALESCE(j.job_status, '') <> 'Cancelled'
     ORDER BY j.id DESC LIMIT 400`,
  )
  const leadsOpen = q.val<number>(`SELECT COUNT(*) FROM leads WHERE deleted_at IS NULL AND status IN ('New', 'Contacted', 'Qualified')`) ?? 0
  const propsListed = q.val<number>(`SELECT COUNT(*) FROM properties WHERE deleted_at IS NULL AND status IN ('Available', 'Off-Plan')`) ?? 0
  const mortActive = q.val<number>(`SELECT COUNT(*) FROM mortgage_cases WHERE deleted_at IS NULL AND status NOT IN ('Disbursed', 'Declined', 'Cancelled')`) ?? 0

  const buckets = PIPELINE_12_STAGES.map(s => ({
    ...s,
    count: 0,
    deal_value_aed: 0,
    expected_commission_aed: 0,
    weighted_cash_aed: 0,
    deals: [] as any[],
  }))
  const byCode = new Map(buckets.map(b => [b.code, b]))

  for (const j of jobs) {
    const code = resolveStage12Code(j.stage_12, j.operational_status, j.job_status)
    const bucket = byCode.get(code) ?? buckets[2]!
    const val = Number(fromCents(j.deal_value)) || 0
    const pct = Number(j.commission_pct) || (j.deal_type === 'Lease' ? 5 : 2)
    const comm = Math.round(val * (pct / 100))
    bucket.count++
    bucket.deal_value_aed += val
    bucket.expected_commission_aed += comm
    bucket.weighted_cash_aed += Math.round(comm * bucket.probability)
    bucket.deals.push({
      id: j.id,
      job_no: j.job_no,
      deal_name: j.deal_name,
      deal_type: j.deal_type,
      department_division: j.department_division,
      client_name: j.client_name || 'Unlinked Client',
      property_title: j.property_title || 'General Inventory',
      agent_name: j.agent_name || 'Unassigned',
      deal_value_aed: val,
      commission_aed: comm,
      stage_12: code,
      operational_status: j.operational_status,
      target_close: j.target_close,
      buyer_finance_type: j.buyer_finance_type || 'Cash',
      updated_at: j.updated_at,
    })
  }

  const totalPipelineAed = buckets.reduce((s, b) => s + b.deal_value_aed, 0)
  const totalCommissionAed = buckets.reduce((s, b) => s + b.expected_commission_aed, 0)
  const weightedGoldRushAed = buckets.reduce((s, b) => s + b.weighted_cash_aed, 0)

  return {
    stages: buckets,
    totals: {
      total_deals: jobs.length,
      open_leads: leadsOpen,
      active_inventory: propsListed,
      active_mortgages: mortActive,
      pipeline_value_aed: totalPipelineAed,
      expected_commission_aed: totalCommissionAed,
      weighted_gold_rush_aed: weightedGoldRushAed,
    },
  }
}

export default async function (app: FastifyInstance) {
  // =========================================================================
  // 1. MASTER LOG (CORE) — 20 REGISTRIES + OFFICE ADMIN APPROVAL GATE
  // =========================================================================
  app.get('/api/core-masters/summary', async (req) => {
    if (!canAccessMasterLog(req.user)) {
      throw forbidden('Master Log (CORE) is restricted to Owner Shabib, System Admin, and Office Admin.')
    }
    const items = CORE_MASTER_REGISTRIES.map(spec => {
      let count = 0
      try {
        if (tableExists(spec.table)) {
          count = q.val<number>(`SELECT COUNT(*) FROM ${qi(spec.table)} WHERE deleted_at IS NULL`) ?? 0
        }
      } catch {
        count = 0
      }
      return { ...spec, count }
    })
    const pendingRequests = q.val<number>(`SELECT COUNT(*) FROM master_change_requests WHERE status = 'Pending'`) ?? 0
    const dxbBranch = q.get<any>(`SELECT * FROM branches WHERE code = 'DXB' AND deleted_at IS NULL LIMIT 1`)
    return {
      items,
      pending_change_requests: pendingRequests,
      can_direct_write: isOwnerSwkUser(req.user) || isAdminSwkUser(req.user),
      requires_owner_approval: isOfficeAdminMeenakshi(req.user),
      head_office: {
        name: dxbBranch?.name || 'Dubai – Head Office (Al Saqr Building, SZR)',
        address: dxbBranch?.address || '25th Floor, Al Saqr Building, Sheikh Zayed Road, Dubai, UAE',
        wifi_ssid: String(getSetting('office_wifi_ssid') || dxbBranch?.wifi_ssid || 'SWK-Office-SZR'),
        wifi_locked: Boolean(String(getSetting('office_wifi_public_ips') || '').trim()),
        gps_lat: String(getSetting('office_gps_lat') || dxbBranch?.gps_lat || '25.213925'),
        gps_lng: String(getSetting('office_gps_lng') || dxbBranch?.gps_lng || '55.277978'),
        geofence_radius_m: Number(getSetting('office_gps_radius_m') || dxbBranch?.geofence_radius_m || 100),
      },
    }
  })

  app.get('/api/core-masters/change-requests', async (req) => {
    if (!canAccessMasterLog(req.user)) throw forbidden('Master Log access required.')
    const statusFilter = String((req.query as any)?.status || '').trim()
    const isMeenakshi = isOfficeAdminMeenakshi(req.user)
    const where: string[] = []
    const params: any[] = []
    if (statusFilter) { where.push('status = ?'); params.push(statusFilter) }
    if (isMeenakshi) { where.push('requested_by = ?'); params.push(req.user!.id) }
    const rows = q.all<any>(
      `SELECT * FROM master_change_requests ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY CASE WHEN status = 'Pending' THEN 0 ELSE 1 END, id DESC LIMIT 100`,
      ...params,
    )
    return {
      rows: rows.map(r => ({ ...r, payload: (() => { try { return JSON.parse(r.payload_json) } catch { return {} } })() })),
      can_approve: isOwnerSwkUser(req.user),
    }
  })

  app.post('/api/core-masters/change-requests', async (req, reply) => {
    if (!canAccessMasterLog(req.user)) throw forbidden('Master Log access required.')
    const b = body<{ entity?: string; action?: 'create' | 'update'; record_id?: number; record_label?: string; payload?: Record<string, any>; reason?: string }>(req)
    const entity = String(b.entity || '').trim()
    const action = b.action === 'update' ? 'update' : 'create'
    if (!OFFICE_ADMIN_GATED_MASTER_ENTITIES.has(entity)) {
      if (OWNER_ONLY_MASTER_ENTITIES.has(entity)) {
        throw forbidden(`'${entity}' is security-critical and strictly Owner-only.`)
      }
      throw bad(`Unsupported CORE Master entity '${entity}'.`)
    }
    if (!b.payload || typeof b.payload !== 'object' || !Object.keys(b.payload).length) {
      throw bad('Provide at least one field in payload.')
    }
    const reason = String(b.reason || '').trim()
    if (reason.length < 3) throw bad('Provide a short business reason for Owner approval.')
    if (action === 'update' && !b.record_id) throw bad('record_id is required when requesting an edit.')

    const id = q.insert(
      `INSERT INTO master_change_requests (entity, action, record_id, record_label, payload_json, reason, requested_by, requested_by_name, requested_by_email, requested_at, status)
       VALUES (?,?,?,?,?,?,?,?,?,?, 'Pending')`,
      entity, action, b.record_id ?? null, b.record_label ?? (b.payload.name || b.payload.title || b.payload.code || entity),
      JSON.stringify(b.payload), reason, req.user!.id, req.user!.name, req.user!.email, nowIso(),
    )

    const owner = q.get<{ id: number }>(`SELECT id FROM users WHERE lower(email) = 'shabib@swk.properties' AND deleted_at IS NULL LIMIT 1`)
    if (owner) {
      notify(
        owner.id,
        `Master Log approval needed: ${entity}`,
        `${req.user!.name} requested to ${action} in ${entity}: ${reason}`,
        '/shabibs-corner?tab=approvals',
        'approval',
        `mcr-${id}`,
      )
    }
    reply.status(201)
    return q.get(`SELECT * FROM master_change_requests WHERE id = ?`, id)
  })

  app.post('/api/core-masters/change-requests/:id/decide', async (req) => {
    requireOwnerOnly(req)
    const id = idOf((req.params as any).id)
    const b = body<{ decision?: 'approve' | 'reject'; note?: string }>(req)
    if (b.decision !== 'approve' && b.decision !== 'reject') throw bad('decision must be approve or reject')
    const row = q.get<any>(`SELECT * FROM master_change_requests WHERE id = ?`, id)
    if (!row) throw notFound('Master Log change request not found')
    if (row.status !== 'Pending') throw bad(`Request is already ${row.status}`)

    const payload = JSON.parse(row.payload_json || '{}')
    let committedRecord: any = null

    tx(() => {
      if (b.decision === 'approve') {
        const def = getDef(row.entity)
        if (row.action === 'update' && row.record_id) {
          committedRecord = updateRecord(def, Number(row.record_id), payload, SYSTEM_CTX)
        } else {
          committedRecord = createRecord(def, payload, SYSTEM_CTX)
        }
      }
      q.run(
        `UPDATE master_change_requests SET status = ?, decided_by = ?, decided_by_name = ?, decided_at = ?, decision_note = ? WHERE id = ?`,
        b.decision === 'approve' ? 'Approved' : 'Rejected',
        req.user!.id,
        req.user!.name,
        nowIso(),
        String(b.note || '').trim() || null,
        id,
      )
      q.run(
        `INSERT INTO audit_log(at, user_id, user_name, entity, record_id, record_label, action, changes, ip) VALUES (?,?,?,?,?,?,?,?,?)`,
        nowIso(), req.user!.id, req.user!.name, 'master_change_requests', id,
        `${row.entity} (${row.action})`, b.decision === 'approve' ? 'approve' : 'reject',
        JSON.stringify({ entity: row.entity, action: row.action, note: b.note || null, committed_id: committedRecord?.id ?? null }),
        req.ip,
      )
    })

    notify(
      row.requested_by,
      `Master Log request ${b.decision === 'approve' ? 'approved' : 'rejected'}: ${row.entity}`,
      `${req.user!.name} ${b.decision === 'approve' ? 'approved and applied' : 'rejected'} your request.${b.note ? ` Note: ${b.note}` : ''}`,
      '/master-log',
      b.decision === 'approve' ? 'success' : 'warning',
    )

    return { ok: true, status: b.decision === 'approve' ? 'Approved' : 'Rejected', committed: committedRecord }
  })

  // =========================================================================
  // 2. SHABIB'S CORNER & PRIVACY FAST TRACK (100% OWNER-ONLY ZERO-LEAK)
  // =========================================================================
  app.get('/api/owner-corner/overview', async (req) => {
    requireOwnerOnly(req)
    const pipeline = build12StageSnapshot()
    const fastJobs = q.all<any>(`SELECT * FROM privacy_fast_track_jobs WHERE deleted_at IS NULL ORDER BY CASE WHEN urgency = 'CASH_IMMEDIATE' THEN 0 ELSE 1 END, id DESC LIMIT 100`)
    const fastInvoices = q.all<any>(`SELECT * FROM privacy_fast_track_invoices ORDER BY id DESC LIMIT 100`)
    const fastDocs = q.all<any>(`SELECT * FROM privacy_fast_track_docs ORDER BY id DESC LIMIT 50`)

    const pendingMasterReqs = q.all<any>(`SELECT * FROM master_change_requests WHERE status = 'Pending' ORDER BY id DESC LIMIT 50`)
    const pendingSealReqs = tableExists('document_seal_approvals')
      ? q.all<any>(`SELECT * FROM document_seal_approvals WHERE status = 'Pending' ORDER BY id DESC LIMIT 50`)
      : []
    const pendingUniversal = tableExists('universal_approvals')
      ? q.all<any>(`SELECT * FROM universal_approvals WHERE deleted_at IS NULL AND status = 'Pending' ORDER BY id DESC LIMIT 50`)
      : []
    const pendingRecycle = tableExists('approval_requests')
      ? q.all<any>(`SELECT * FROM approval_requests WHERE status = 'Pending' ORDER BY id DESC LIMIT 50`)
      : []

    // Consolidated P&L / VAT snapshot (Standard + Privacy Fast Track — visible strictly to Shabib!)
    const stdInv = q.get<any>(`SELECT COALESCE(SUM(subtotal),0) AS sub, COALESCE(SUM(vat_total),0) AS vat, COALESCE(SUM(total),0) AS tot FROM invoices WHERE deleted_at IS NULL AND status IN ('Posted','Partially paid','Paid')`) ?? { sub: 0, vat: 0, tot: 0 }
    const ftSub = fastInvoices.reduce((s, r) => s + Number(r.subtotal_aed || 0), 0)
    const ftVat = fastInvoices.reduce((s, r) => s + Number(r.vat_aed || 0), 0)
    const ftTot = fastInvoices.reduce((s, r) => s + Number(r.total_aed || 0), 0)

    const immediateCashJobs = fastJobs.filter(j => j.urgency === 'CASH_IMMEDIATE' && j.status !== 'Closed' && j.status !== 'Cash Collected')
    const immediateCashAed = immediateCashJobs.reduce((s, j) => s + Number(j.expected_cash_aed || 0), 0)

    return {
      pipeline,
      fast_track: {
        jobs: fastJobs,
        invoices: fastInvoices,
        docs: fastDocs,
        immediate_cash_count: immediateCashJobs.length,
        immediate_cash_aed: immediateCashAed,
        total_fast_track_value_aed: fastJobs.reduce((s, j) => s + Number(j.deal_value_aed || 0), 0),
      },
      approvals: {
        master_requests: pendingMasterReqs.map(r => ({ ...r, payload: (() => { try { return JSON.parse(r.payload_json) } catch { return {} } })() })),
        seal_requests: pendingSealReqs,
        universal_approvals: pendingUniversal,
        delete_requests: pendingRecycle,
        total_pending: pendingMasterReqs.length + pendingSealReqs.length + pendingUniversal.length + pendingRecycle.length,
      },
      consolidated_ledger: {
        standard_subtotal_aed: Number(fromCents(stdInv.sub)) || 0,
        standard_vat_aed: Number(fromCents(stdInv.vat)) || 0,
        standard_total_aed: Number(fromCents(stdInv.tot)) || 0,
        fast_track_subtotal_aed: Math.round(ftSub * 100) / 100,
        fast_track_vat_aed: Math.round(ftVat * 100) / 100,
        fast_track_total_aed: Math.round(ftTot * 100) / 100,
        combined_total_aed: Math.round(((Number(fromCents(stdInv.tot)) || 0) + ftTot) * 100) / 100,
        combined_vat_aed: Math.round(((Number(fromCents(stdInv.vat)) || 0) + ftVat) * 100) / 100,
      },
    }
  })

  app.get('/api/privacy-fast-track/jobs', async (req) => {
    requireOwnerOnly(req)
    return { rows: q.all(`SELECT * FROM privacy_fast_track_jobs WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 200`) }
  })

  app.post('/api/privacy-fast-track/jobs', async (req, reply) => {
    requireOwnerOnly(req)
    const b = body<Record<string, any>>(req)
    const clientName = String(b.client_name || '').trim()
    const propertyLabel = String(b.property_label || '').trim()
    if (!clientName || !propertyLabel) throw bad('client_name and property_label are required')
    const stage12 = String(b.stage_12 || '').trim().slice(0, 60) || '05_offer'
    const urgency = String(b.urgency || '').trim().slice(0, 60) || 'CASH_IMMEDIATE'
    const refCode = nextFastTrackCode('FT')
    const ts = nowIso()
    const id = q.insert(
      `INSERT INTO privacy_fast_track_jobs (ref_code, client_name, client_phone, client_email, property_label, community, deal_type, deal_value_aed, expected_cash_aed, urgency, stage_12, target_cash_date, status, notes, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      refCode, clientName, b.client_phone || null, b.client_email || null, propertyLabel, b.community || null,
      b.deal_type || 'Secondary Sale', Number(b.deal_value_aed) || 0, Number(b.expected_cash_aed) || 0,
      urgency, stage12, b.target_cash_date || null, b.status || 'Active', b.notes || null, req.user!.id, ts, ts,
    )
    reply.status(201)
    return q.get(`SELECT * FROM privacy_fast_track_jobs WHERE id = ?`, id)
  })

  app.put('/api/privacy-fast-track/jobs/:id', async (req) => {
    requireOwnerOnly(req)
    const id = idOf((req.params as any).id)
    const cur = q.get<any>(`SELECT * FROM privacy_fast_track_jobs WHERE id = ? AND deleted_at IS NULL`, id)
    if (!cur) throw notFound('Fast-track job not found')
    const b = body<Record<string, any>>(req)
    const stage12 = b.stage_12 !== undefined ? (String(b.stage_12).trim().slice(0, 60) || cur.stage_12) : cur.stage_12
    q.run(
      `UPDATE privacy_fast_track_jobs SET
        client_name = ?, client_phone = ?, client_email = ?, property_label = ?, community = ?,
        deal_type = ?, deal_value_aed = ?, expected_cash_aed = ?, urgency = ?, stage_12 = ?,
        target_cash_date = ?, status = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
      b.client_name ?? cur.client_name, b.client_phone ?? cur.client_phone, b.client_email ?? cur.client_email,
      b.property_label ?? cur.property_label, b.community ?? cur.community, b.deal_type ?? cur.deal_type,
      b.deal_value_aed !== undefined ? Number(b.deal_value_aed) : cur.deal_value_aed,
      b.expected_cash_aed !== undefined ? Number(b.expected_cash_aed) : cur.expected_cash_aed,
      b.urgency ?? cur.urgency, stage12, b.target_cash_date ?? cur.target_cash_date,
      b.status ?? cur.status, b.notes ?? cur.notes, nowIso(), id,
    )
    return q.get(`SELECT * FROM privacy_fast_track_jobs WHERE id = ?`, id)
  })

  app.delete('/api/privacy-fast-track/jobs/:id', async (req) => {
    requireOwnerOnly(req)
    const id = idOf((req.params as any).id)
    q.run(`UPDATE privacy_fast_track_jobs SET deleted_at = ?, updated_at = ? WHERE id = ?`, nowIso(), nowIso(), id)
    return { ok: true }
  })

  app.post('/api/privacy-fast-track/invoices', async (req, reply) => {
    requireOwnerOnly(req)
    const b = body<Record<string, any>>(req)
    const clientName = String(b.client_name || '').trim()
    const desc = String(b.description || '').trim()
    const sub = Number(b.subtotal_aed) || 0
    if (!clientName || !desc || sub <= 0) throw bad('client_name, description, and positive subtotal_aed are required')
    const vatRate = b.vat_rate !== undefined ? Number(b.vat_rate) : 5
    const vatAed = Math.round(sub * (vatRate / 100) * 100) / 100
    const totalAed = Math.round((sub + vatAed) * 100) / 100
    const invNo = nextFastTrackCode('FT-INV')
    const id = q.insert(
      `INSERT INTO privacy_fast_track_invoices (job_id, invoice_no, client_name, client_trn, description, subtotal_aed, vat_rate, vat_aed, total_aed, due_date, status, notes, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      b.job_id ? Number(b.job_id) : null, invNo, clientName, b.client_trn || null, desc, sub, vatRate, vatAed, totalAed,
      b.due_date || todayStr(), b.status || 'Issued', b.notes || null, req.user!.id, nowIso(),
    )
    reply.status(201)
    return q.get(`SELECT * FROM privacy_fast_track_invoices WHERE id = ?`, id)
  })

  app.put('/api/privacy-fast-track/invoices/:id', async (req) => {
    requireOwnerOnly(req)
    const id = idOf((req.params as any).id)
    const cur = q.get<any>(`SELECT * FROM privacy_fast_track_invoices WHERE id = ?`, id)
    if (!cur) throw notFound('Fast-track invoice not found')
    const b = body<{ status?: string; notes?: string }>(req)
    const status = b.status || cur.status
    const paidAt = status === 'Paid' ? (cur.paid_at || nowIso()) : cur.paid_at
    q.run(`UPDATE privacy_fast_track_invoices SET status = ?, paid_at = ?, notes = ? WHERE id = ?`, status, paidAt, b.notes ?? cur.notes, id)
    return q.get(`SELECT * FROM privacy_fast_track_invoices WHERE id = ?`, id)
  })

  app.post('/api/privacy-fast-track/docs', async (req, reply) => {
    requireOwnerOnly(req)
    const b = body<{ job_id?: number; title?: string; doc_type?: string; content_text?: string }>(req)
    if (!b.title?.trim() || !b.content_text?.trim()) throw bad('title and content_text are required')
    const id = q.insert(
      `INSERT INTO privacy_fast_track_docs (job_id, title, doc_type, content_text, created_by, created_at) VALUES (?,?,?,?,?,?)`,
      b.job_id ? Number(b.job_id) : null, b.title.trim(), b.doc_type || 'Private Memo', b.content_text.trim(), req.user!.id, nowIso(),
    )
    reply.status(201)
    return q.get(`SELECT * FROM privacy_fast_track_docs WHERE id = ?`, id)
  })

  // Bulk AI Uploader (Owner-only fast ingestion from pasted text / CSV / WhatsApp lists)
  app.post('/api/owner-corner/bulk-ai-upload', async (req) => {
    requireOwnerOnly(req)
    const b = body<{ target?: 'leads' | 'fast_track' | 'properties'; raw_text?: string; dry_run?: boolean }>(req)
    const target = b.target || 'leads'
    const raw = String(b.raw_text || '').trim()
    if (!raw) throw bad('Paste CSV, WhatsApp lines, or structured rows to parse.')

    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const parsed: Record<string, any>[] = []

    for (const line of lines) {
      if (/^(name|client|title)\s*[,|;\t]/i.test(line)) continue
      const cols = line.split(/[|,\t;]+/).map(c => c.trim()).filter(Boolean)
      const phoneMatch = line.match(/(?:\+?971|05)\d[\d\s-]{6,12}/)
      const emailMatch = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
      const aedMatch = line.match(/(?:AED\s*)?(\d[\d,.]*)\s*([MK])?/i)
      let estAed = 0
      if (aedMatch) {
        const base = Number(aedMatch[1].replace(/,/g, ''))
        if (Number.isFinite(base)) {
          const mult = aedMatch[2]?.toUpperCase() === 'M' ? 1_000_000 : aedMatch[2]?.toUpperCase() === 'K' ? 1_000 : 1
          estAed = base * mult
        }
      }
      parsed.push({
        name: cols[0] || 'VIP Client',
        phone: phoneMatch ? phoneMatch[0].replace(/\s+/g, '') : cols[1] || '',
        email: emailMatch ? emailMatch[0] : '',
        community_or_property: cols[2] || cols[1] || 'Dubai',
        value_aed: estAed >= 10_000 ? estAed : 0,
        raw: line,
      })
    }

    if (b.dry_run) {
      return { dry_run: true, target, count: parsed.length, preview: parsed.slice(0, 50) }
    }

    let created = 0
    const errors: string[] = []
    for (const item of parsed.slice(0, 250)) {
      try {
        if (target === 'fast_track') {
          const ref = nextFastTrackCode('FT')
          const ts = nowIso()
          q.insert(
            `INSERT INTO privacy_fast_track_jobs (ref_code, client_name, client_phone, client_email, property_label, community, deal_type, deal_value_aed, expected_cash_aed, urgency, stage_12, status, notes, created_by, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            ref, item.name, item.phone || null, item.email || null, item.community_or_property, item.community_or_property,
            'Secondary Sale', item.value_aed, Math.round(item.value_aed * 0.02), 'CASH_IMMEDIATE', '03_lead', 'Active',
            `Bulk AI Import: ${item.raw}`, req.user!.id, ts, ts,
          )
          created++
        } else if (target === 'properties') {
          createRecord(getDef('properties'), {
            title: `${item.name} — ${item.community_or_property}`.slice(0, 140),
            property_type: 'Apartment',
            status: 'Available',
            price: item.value_aed || undefined,
            address: item.community_or_property,
            notes: `Bulk AI Upload: ${item.raw}`,
          }, req.ctx)
          created++
        } else {
          createRecord(getDef('leads'), {
            company: item.name,
            contact_name: item.name,
            phone: item.phone || undefined,
            email: item.email || undefined,
            destination: item.community_or_property,
            est_value: item.value_aed || undefined,
            source: 'Referral',
            notes: `Bulk AI Upload: ${item.raw}`,
          }, req.ctx)
          created++
        }
      } catch (e: any) {
        errors.push(`${item.name}: ${e?.message || String(e)}`)
      }
    }
    return { dry_run: false, target, parsed: parsed.length, created, errors: errors.slice(0, 20) }
  })

  // =========================================================================
  // 3. 12-STAGE PIPELINE PLAYBOOK & COMMAND CENTER
  // =========================================================================
  app.get('/api/pipeline/12-stage', async (req) => {
    if (req.user?.party_id || isRestrictedStaffUser(req.user)) {
      throw forbidden('12-Stage Pipeline Playbook requires brokerage advisory or management access.')
    }
    return build12StageSnapshot()
  })

  app.post('/api/pipeline/12-stage/:jobId/move', async (req) => {
    if (req.user?.party_id || isRestrictedStaffUser(req.user)) throw forbidden('Access denied')
    const jobId = idOf((req.params as any).jobId)
    const b = body<{ stage_12?: string; note?: string }>(req)
    const stage12 = String(b.stage_12 || '').trim()
    if (!PIPELINE_STAGE_MAP.has(stage12)) throw bad('Invalid 12-stage code')
    const legacy = legacyStageFor12(stage12)
    const updated = updateRecord(
      getDef('jobs'),
      jobId,
      { stage_12: stage12, operational_status: legacy, __reason: b.note || `Moved to ${PIPELINE_STAGE_MAP.get(stage12)!.label}` },
      req.ctx,
    )
    return { ok: true, job: updated, stage_12: stage12, operational_status: legacy }
  })

  app.get('/api/command-center/overview', async (req) => {
    if (!canAccessSwkAdminLogic(req.user) && !isOfficeAdminMeenakshi(req.user)) {
      throw forbidden('Command Center is restricted to Leadership & Operations.')
    }
    const today = todayStr()
    const pipeline = build12StageSnapshot()

    // Live Office Attendance Today
    const employees = q.all<any>(`SELECT id, name, designation, email FROM employees WHERE deleted_at IS NULL AND COALESCE(status, 'Active') = 'Active' ORDER BY name`)
    const attToday = q.all<any>(`SELECT employee_id, status, check_in, check_out, checkin_mode FROM attendance WHERE deleted_at IS NULL AND att_date = ?`, today)
    const attMap = new Map(attToday.map(a => [a.employee_id, a]))
    const attendanceBoard = employees.map(e => {
      const a = attMap.get(e.id)
      return {
        employee_id: e.id,
        name: e.name,
        designation: e.designation,
        checked_in: Boolean(a?.check_in),
        status: a?.status || 'Not Checked In',
        check_in: a?.check_in || null,
        check_out: a?.check_out || null,
        mode: a?.checkin_mode || null,
      }
    })

    // Live Field GPS Active Sessions
    const fieldActive = tableExists('field_sessions')
      ? q.all<any>(
          `SELECT fs.id, fs.session_no, fs.assigned_location AS location_name, fs.status, fs.started_at AS start_at, fs.last_lat AS start_lat, fs.last_lng AS start_lng, e.name AS staff_name
           FROM field_sessions fs LEFT JOIN employees e ON e.id = fs.employee_id
           WHERE fs.deleted_at IS NULL AND fs.status IN ('Active (On Duty)', 'SOS Emergency Active', 'Active', 'Scheduled')
           ORDER BY fs.id DESC LIMIT 30`,
        )
      : []

    // Tasks Today + Team & Individual Monitor
    const allOpenTasks = tableExists('tasks')
      ? q.all<any>(
          `SELECT t.id, t.title, t.status, t.priority, t.due_date, t.assignee_id, u.name AS assignee_name
           FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
           WHERE t.deleted_at IS NULL AND COALESCE(t.status, '') NOT IN ('Done', 'Completed', 'Cancelled')
           ORDER BY COALESCE(t.due_date, '9999-12-31') ASC, t.id DESC LIMIT 120`,
        )
      : []
    const myTasksToday = allOpenTasks.filter(t => t.assignee_id === req.user!.id)
    const byAssignee = new Map<string, { name: string; total: number; overdue: number; high: number }>()
    for (const t of allOpenTasks) {
      const name = t.assignee_name || 'Unassigned'
      const cur = byAssignee.get(name) ?? { name, total: 0, overdue: 0, high: 0 }
      cur.total++
      if (t.due_date && String(t.due_date).slice(0, 10) < today) cur.overdue++
      if (/high|urgent|critical/i.test(String(t.priority || ''))) cur.high++
      byAssignee.set(name, cur)
    }

    // Assigned Clients (from referrals & staff)
    const assignedClients = q.all<any>(
      `SELECT l.id, l.lead_no, l.company AS client_name, l.contact_name, l.source, l.status, l.destination, l.est_value, l.created_at, u.name AS owner_name
       FROM leads l LEFT JOIN users u ON u.id = l.owner_id
       WHERE l.deleted_at IS NULL AND l.status NOT IN ('Unqualified')
       ORDER BY l.id DESC LIMIT 30`,
    )

    // Mortgage Desk Upcoming / Overdue Deadlines
    const mortgageDeadlines = q.all<any>(
      `SELECT * FROM mortgage_desk_events WHERE status NOT IN ('Completed') ORDER BY due_date ASC LIMIT 15`,
    )

    // Critical Alerts
    const alerts: { severity: 'critical' | 'warning' | 'info'; title: string; detail: string; to: string }[] = []
    const overdueTasksCount = allOpenTasks.filter(t => t.due_date && String(t.due_date).slice(0, 10) < today).length
    if (overdueTasksCount > 0) alerts.push({ severity: 'critical', title: `${overdueTasksCount} overdue team tasks`, detail: 'Review overdue actions in Team Tasks.', to: '/e/tasks' })
    const pendingMcr = q.val<number>(`SELECT COUNT(*) FROM master_change_requests WHERE status = 'Pending'`) ?? 0
    if (pendingMcr > 0 && isOwnerSwkUser(req.user)) {
      alerts.push({ severity: 'warning', title: `${pendingMcr} Master Log approval(s) waiting`, detail: 'Office Admin submitted CORE Master edits for Owner sign-off.', to: '/shabibs-corner?tab=approvals' })
    }
    const overdueMort = mortgageDeadlines.filter(m => String(m.due_date).slice(0, 10) < today).length
    if (overdueMort > 0) alerts.push({ severity: 'critical', title: `${overdueMort} overdue Mortgage / Valuation deadline(s)`, detail: 'Action immediately in Mortgage Exclusive Desk.', to: '/mortgage-desk' })
    const checkedInCount = attendanceBoard.filter(a => a.checked_in).length
    if (employees.length > 0 && checkedInCount < employees.length) {
      alerts.push({ severity: 'info', title: `${checkedInCount}/${employees.length} staff checked in today`, detail: 'Live office reception QR status at Al Saqr Building SZR.', to: '/reception-qr' })
    }

    return {
      today,
      pipeline,
      attendance: {
        checked_in: checkedInCount,
        total: employees.length,
        board: attendanceBoard,
      },
      field_gps: {
        active_count: fieldActive.length,
        sessions: fieldActive,
      },
      tasks: {
        my_tasks: myTasksToday.slice(0, 20),
        team_tasks: allOpenTasks.slice(0, 40),
        individual_summary: [...byAssignee.values()].sort((a, b) => b.total - a.total),
      },
      assigned_clients: assignedClients.map(c => ({ ...c, est_value_aed: Number(fromCents(c.est_value)) || 0 })),
      mortgage_deadlines: mortgageDeadlines,
      critical_alerts: alerts,
    }
  })

  // =========================================================================
  // 4. PER-CLIENT DOCUMENT VAULT (13+ CORE DOCS CHECKLIST)
  // =========================================================================
  app.get('/api/client-vault', async (req) => {
    if (req.user?.party_id || isRestrictedStaffUser(req.user)) throw forbidden('Client Document Vault access denied.')
    const clients = q.all<any>(
      `SELECT id, code, name, contact_person, phone, email, kyc_status, status, created_at
       FROM parties WHERE deleted_at IS NULL AND (is_customer = 1 OR is_landlord = 1 OR is_tenant = 1)
       ORDER BY id DESC LIMIT 150`,
    )
    const checks = q.all<any>(`SELECT party_id, doc_key, status, expiry_date FROM client_vault_checklists`)
    const byParty = new Map<number, any[]>()
    for (const c of checks) {
      const arr = byParty.get(c.party_id) ?? []
      arr.push(c)
      byParty.set(c.party_id, arr)
    }
    const today = todayStr()
    const totalReq = CLIENT_VAULT_REQUIRED_DOCS.length
    return {
      required_docs: CLIENT_VAULT_REQUIRED_DOCS,
      clients: clients.map(cl => {
        const list = byParty.get(cl.id) ?? []
        const uploaded = list.filter(x => x.status === 'Uploaded' || x.status === 'Verified').length
        const verified = list.filter(x => x.status === 'Verified').length
        const expired = list.filter(x => x.status === 'Expired' || (x.expiry_date && String(x.expiry_date).slice(0, 10) < today)).length
        return {
          ...cl,
          uploaded_count: uploaded,
          verified_count: verified,
          missing_count: Math.max(0, totalReq - uploaded),
          expired_count: expired,
          completion_pct: Math.round((uploaded / totalReq) * 100),
        }
      }),
    }
  })

  app.get('/api/client-vault/:partyId', async (req) => {
    if (req.user?.party_id || isRestrictedStaffUser(req.user)) throw forbidden('Client Document Vault access denied.')
    const partyId = idOf((req.params as any).partyId)
    const client = q.get<any>(`SELECT id, code, name, contact_person, phone, email, kyc_status, status FROM parties WHERE id = ? AND deleted_at IS NULL`, partyId)
    if (!client) throw notFound('Client not found')
    const saved = q.all<any>(`SELECT * FROM client_vault_checklists WHERE party_id = ?`, partyId)
    const savedMap = new Map(saved.map(s => [s.doc_key, s]))
    const attachments = q.all<any>(`SELECT id, file_name, category, expiry_date, created_at FROM attachments WHERE deleted_at IS NULL AND link_entity = 'parties' AND link_id = ? ORDER BY id DESC`, partyId)
    const checklist = CLIENT_VAULT_REQUIRED_DOCS.map(spec => {
      const cur = savedMap.get(spec.key)
      return {
        ...spec,
        status: cur?.status || 'Missing',
        attachment_id: cur?.attachment_id ?? null,
        file_name: cur?.file_name ?? null,
        expiry_date: cur?.expiry_date ?? null,
        verified_by_name: cur?.verified_by_name ?? null,
        verified_at: cur?.verified_at ?? null,
        notes: cur?.notes ?? '',
        updated_at: cur?.updated_at ?? null,
      }
    })
    return { client, checklist, attachments }
  })

  app.post('/api/client-vault/:partyId/item', async (req) => {
    if (req.user?.party_id || isRestrictedStaffUser(req.user)) throw forbidden('Client Document Vault access denied.')
    const partyId = idOf((req.params as any).partyId)
    const b = body<{ doc_key?: string; status?: string; attachment_id?: number | null; file_name?: string | null; expiry_date?: string | null; notes?: string }>(req)
    const spec = CLIENT_VAULT_REQUIRED_DOCS.find(d => d.key === b.doc_key)
    if (!spec) throw bad('Invalid document checklist key')
    const status = String(b.status || '').trim().slice(0, 60) || 'Uploaded'
    const ts = nowIso()
    const verifiedBy = status === 'Verified' ? req.user!.id : null
    const verifiedByName = status === 'Verified' ? req.user!.name : null
    const verifiedAt = status === 'Verified' ? ts : null
    q.run(
      `INSERT INTO client_vault_checklists (party_id, doc_key, doc_label, status, attachment_id, file_name, expiry_date, verified_by, verified_by_name, verified_at, notes, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(party_id, doc_key) DO UPDATE SET
         status = excluded.status,
         attachment_id = COALESCE(excluded.attachment_id, client_vault_checklists.attachment_id),
         file_name = COALESCE(excluded.file_name, client_vault_checklists.file_name),
         expiry_date = excluded.expiry_date,
         verified_by = COALESCE(excluded.verified_by, client_vault_checklists.verified_by),
         verified_by_name = COALESCE(excluded.verified_by_name, client_vault_checklists.verified_by_name),
         verified_at = COALESCE(excluded.verified_at, client_vault_checklists.verified_at),
         notes = excluded.notes,
         updated_at = excluded.updated_at`,
      partyId, spec.key, spec.label, status, b.attachment_id ?? null, b.file_name ?? null,
      b.expiry_date || null, verifiedBy, verifiedByName, verifiedAt, b.notes || null, ts,
    )
    return q.get(`SELECT * FROM client_vault_checklists WHERE party_id = ? AND doc_key = ?`, partyId, spec.key)
  })

  // =========================================================================
  // 5. MORTGAGE EXCLUSIVE BUSINESS DESK
  // =========================================================================
  app.get('/api/mortgage-desk/overview', async (req) => {
    if (req.user?.party_id || isRestrictedStaffUser(req.user)) throw forbidden('Mortgage Desk requires advisory or leadership access.')
    const cases = q.all<any>(
      `SELECT m.*, u.name AS advisor_name FROM mortgage_cases m LEFT JOIN users u ON u.id = m.owner_id WHERE m.deleted_at IS NULL ORDER BY m.id DESC LIMIT 100`,
    )
    const events = q.all<any>(`SELECT * FROM mortgage_desk_events ORDER BY CASE WHEN status = 'Overdue' THEN 0 WHEN status = 'Urgent' THEN 1 WHEN status = 'Scheduled' THEN 2 ELSE 3 END, due_date ASC LIMIT 100`)
    const today = todayStr()
    const totalLoanAed = cases.reduce((s, c) => s + (Number(fromCents(c.loan_amount)) || 0), 0)
    const totalRefCommAed = cases.reduce((s, c) => s + (Number(fromCents(c.referral_commission)) || 0), 0)
    return {
      summary: {
        total_cases: cases.length,
        active_cases: cases.filter(c => !['Disbursed', 'Declined', 'Cancelled'].includes(c.status)).length,
        total_loan_book_aed: totalLoanAed,
        expected_referral_commission_aed: totalRefCommAed,
        upcoming_valuations: events.filter(e => e.event_type === 'Valuation Booking' && e.status !== 'Completed').length,
        overdue_deadlines: events.filter(e => e.status !== 'Completed' && String(e.due_date).slice(0, 10) < today).length,
      },
      cases: cases.map(c => ({
        ...c,
        property_value_aed: Number(fromCents(c.property_value)) || 0,
        loan_amount_aed: Number(fromCents(c.loan_amount)) || 0,
        referral_commission_aed: Number(fromCents(c.referral_commission)) || 0,
      })),
      events,
      uae_banks: [
        { bank: 'Emirates NBD', type: 'Conventional / Islamic', fixed_3y: '3.99%', max_ltv_res: '80%', max_ltv_nonres: '60%', valuation_fee: 'AED 2,625 + VAT', sla_days: 7 },
        { bank: 'First Abu Dhabi Bank (FAB)', type: 'Conventional / Islamic', fixed_3y: '3.95%', max_ltv_res: '80%', max_ltv_nonres: '60%', valuation_fee: 'AED 3,150', sla_days: 7 },
        { bank: 'Abu Dhabi Commercial Bank (ADCB)', type: 'Conventional / Islamic', fixed_3y: '4.09%', max_ltv_res: '80%', max_ltv_nonres: '50%', valuation_fee: 'AED 2,625', sla_days: 6 },
        { bank: 'Mashreq Bank', type: 'Conventional / Al Islami', fixed_3y: '4.05%', max_ltv_res: '80%', max_ltv_nonres: '60%', valuation_fee: 'AED 2,999', sla_days: 5 },
        { bank: 'Dubai Islamic Bank (DIB)', type: 'Islamic', fixed_3y: '4.15%', max_ltv_res: '80%', max_ltv_nonres: '50%', valuation_fee: 'AED 3,150', sla_days: 8 },
        { bank: 'Commercial Bank of Dubai (CBD)', type: 'Conventional / Islamic', fixed_3y: '3.99%', max_ltv_res: '80%', max_ltv_nonres: '60%', valuation_fee: 'AED 2,625', sla_days: 6 },
        { bank: 'HSBC UAE', type: 'Conventional', fixed_3y: '4.19%', max_ltv_res: '80%', max_ltv_nonres: '60%', valuation_fee: 'AED 2,625', sla_days: 9 },
        { bank: 'RAKBANK', type: 'Conventional / Amal', fixed_3y: '4.24%', max_ltv_res: '80%', max_ltv_nonres: '50%', valuation_fee: 'AED 3,150', sla_days: 6 },
      ],
    }
  })

  app.post('/api/mortgage-desk/events', async (req, reply) => {
    if (req.user?.party_id || isRestrictedStaffUser(req.user)) throw forbidden('Access denied')
    const b = body<Record<string, any>>(req)
    if (!String(b.client_name || '').trim() || !String(b.due_date || '').trim()) {
      throw bad('client_name and due_date are required')
    }
    const ts = nowIso()
    const id = q.insert(
      `INSERT INTO mortgage_desk_events (mortgage_case_id, client_name, bank_name, event_type, due_date, status, rm_name, rm_phone, valuation_company, valuation_fee_aed, loan_amount_aed, notes, owner_id, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      b.mortgage_case_id ? Number(b.mortgage_case_id) : null, String(b.client_name).trim(),
      b.bank_name || 'Emirates NBD', b.event_type || 'Valuation Booking', String(b.due_date).trim(),
      b.status || 'Scheduled', b.rm_name || null, b.rm_phone || null, b.valuation_company || null,
      Number(b.valuation_fee_aed) || 0, Number(b.loan_amount_aed) || 0, b.notes || null,
      req.user!.id, req.user!.id, ts, ts,
    )
    reply.status(201)
    return q.get(`SELECT * FROM mortgage_desk_events WHERE id = ?`, id)
  })

  app.put('/api/mortgage-desk/events/:id', async (req) => {
    if (req.user?.party_id || isRestrictedStaffUser(req.user)) throw forbidden('Access denied')
    const id = idOf((req.params as any).id)
    const cur = q.get<any>(`SELECT * FROM mortgage_desk_events WHERE id = ?`, id)
    if (!cur) throw notFound('Event not found')
    const b = body<Record<string, any>>(req)
    q.run(
      `UPDATE mortgage_desk_events SET status = ?, due_date = ?, bank_name = ?, event_type = ?, rm_name = ?, rm_phone = ?, valuation_company = ?, notes = ?, updated_at = ? WHERE id = ?`,
      b.status ?? cur.status, b.due_date ?? cur.due_date, b.bank_name ?? cur.bank_name, b.event_type ?? cur.event_type,
      b.rm_name ?? cur.rm_name, b.rm_phone ?? cur.rm_phone, b.valuation_company ?? cur.valuation_company, b.notes ?? cur.notes, nowIso(), id,
    )
    return q.get(`SELECT * FROM mortgage_desk_events WHERE id = ?`, id)
  })

  // =========================================================================
  // 6. AI CASE-STUDY TRAINING LIBRARY
  // =========================================================================
  app.get('/api/ai-case-studies', async (req) => {
    if (req.user?.party_id) throw forbidden('Staff only')
    ensureSeededAiCaseStudies()
    const category = String((req.query as any)?.category || '').trim()
    const term = String((req.query as any)?.q || '').trim()
    const where = ['is_active = 1']
    const params: any[] = []
    if (category && category !== 'All') { where.push('category = ?'); params.push(category) }
    if (term) {
      where.push('(lower(title) LIKE ? OR lower(challenge) LIKE ? OR lower(strategy_applied) LIKE ? OR lower(COALESCE(tags, \'\')) LIKE ?)')
      const like = `%${term.toLowerCase()}%`
      params.push(like, like, like, like)
    }
    const rows = q.all<any>(`SELECT * FROM ai_case_studies WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 200`, ...params)
    return { rows, total: rows.length }
  })

  app.post('/api/ai-case-studies', async (req, reply) => {
    if (req.user?.party_id || isRestrictedStaffUser(req.user)) throw forbidden('Only Leadership & Advisory staff can train new AI case studies.')
    ensureSeededAiCaseStudies()
    const b = body<Record<string, any>>(req)
    if (!b.title?.trim() || !b.challenge?.trim() || !b.strategy_applied?.trim()) {
      throw bad('title, challenge, and strategy_applied are required to train the AI knowledge base.')
    }
    const count = (q.val<number>(`SELECT COUNT(*) FROM ai_case_studies`) ?? 0) + 1
    const code = `CS-SWK-${String(count).padStart(3, '0')}`
    const ts = nowIso()
    const id = q.insert(
      `INSERT INTO ai_case_studies (code, category, title, client_profile, property_context, challenge, strategy_applied, winning_outcome, lessons_learned, tags, trained_by, trained_by_name, is_active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
      code, b.category || 'Secondary Resale', b.title.trim(), b.client_profile?.trim() || 'UAE Buyer / Investor',
      b.property_context?.trim() || 'Dubai Property', b.challenge.trim(), b.strategy_applied.trim(),
      b.winning_outcome?.trim() || 'Closed successfully', b.lessons_learned?.trim() || b.strategy_applied.trim(),
      b.tags?.trim() || '', req.user!.id, req.user!.name, ts, ts,
    )
    reply.status(201)
    return q.get(`SELECT * FROM ai_case_studies WHERE id = ?`, id)
  })

  app.post('/api/ai-case-studies/query', async (req) => {
    if (req.user?.party_id) throw forbidden('Staff only')
    const b = body<{ scenario?: string }>(req)
    const matches = searchRelevantCaseStudies(String(b.scenario || ''), 5)
    return { query: b.scenario || '', matches }
  })

  // =========================================================================
  // 7. WEBSITE & SOCIAL MEDIA CAMPAIGNS (ZERO-SHABIB HARD-LOCKED)
  // =========================================================================
  app.get('/api/website/social-campaigns', async (req) => {
    if (!canAccessSwkAdminLogic(req.user)) throw forbidden('Website & Social Studio is restricted to Owner, Admin, and Manager.')
    return { rows: q.all(`SELECT * FROM website_social_campaigns ORDER BY id DESC LIMIT 100`) }
  })

  app.post('/api/website/social-campaigns', async (req, reply) => {
    if (!canAccessSwkAdminLogic(req.user)) throw forbidden('Website & Social Studio access required.')
    const b = body<Record<string, any>>(req)
    try { assertZeroShabibPublicPayload(b, 'Social Campaign') } catch (e: any) { throw bad(e?.message || 'Blocked by public website privacy lock.') }
    if (!b.title?.trim() || !b.caption?.trim()) throw bad('title and caption are required')
    const ts = nowIso()
    const id = q.insert(
      `INSERT INTO website_social_campaigns (title, channel, status, publish_date, target_url, caption, offer_highlight, budget_aed, leads_count, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      b.title.trim(), b.channel || 'Instagram', b.status || 'Scheduled', b.publish_date || todayStr(),
      b.target_url || 'https://www.swkpropertiesuae.com', b.caption.trim(), b.offer_highlight || null,
      Number(b.budget_aed) || 0, Number(b.leads_count) || 0, req.user!.id, ts, ts,
    )
    reply.status(201)
    return q.get(`SELECT * FROM website_social_campaigns WHERE id = ?`, id)
  })
}
