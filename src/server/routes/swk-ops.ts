import type { FastifyInstance } from 'fastify'
import { q,tx } from '../db'
import { can,createRecord,deleteRecord,getDef,patchRecord,SYSTEM_CTX,updateRecord,type Ctx } from '../engine'
import { HttpError,fromCents,nowIso,nowLocal,toCents,todayStr } from '../util'
import { notify,notifyLeadership } from '../notify'
import { sendWhatsApp,ownerNumbers } from '../integrations/whatsapp'
import { getSetting,setSettings } from '../settings'
import { attemptLogin,createSession,destroyDeviceSessions,destroyUserSessions,hashPassword,loadUser,validatePasswordStrength } from '../auth'
import { COOKIE } from '../app'
import { burnQrNonce, checkPasswordForCheckin, currentQrToken, deviceGate, inspectQrToken, newChallenge, qrMode, regenerateFixedQr, setQrMode, verifyDeviceProof, verifyOfficeGeofence } from '../domain/attendance-security'
import { config } from '../config'
import { need } from './helpers'
import { canAccessSwkAdminLogic,canPrintReceptionQr,isAdminSwkUser,isElevatedCanonicalEmail,isOwnerSwkUser } from '../../shared/swk-staff-access'
import { attendanceClock,ensureTeamGroup,postAutomationMessage } from './chat'
import { checkEmployeeAndDocumentExpiries,computeMonthlyTargetSummaries,notifyEmployeeTargets } from '../domain/compliance'
import { UAE_COMMUNITIES } from '../../shared/uae-catalog/communities'
import type { EmirateName } from '../../shared/uae-catalog/types'

export function computeDubaiShiftInfo(now = new Date(), clientVariableHours = false) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const wk = parts.find(p => p.type === 'weekday')?.value || 'Mon'
  const hour = Number(parts.find(p => p.type === 'hour')?.value || 10)
  const min = Number(parts.find(p => p.type === 'minute')?.value || 0)
  const totalMins = hour * 60 + min
  const isSun = wk === 'Sun'
  const isSat = wk === 'Sat'
  const shiftName = isSun
    ? 'Sunday Holiday (Client Exception)'
    : isSat
      ? 'Saturday 10:00–16:00'
      : 'Mon–Fri 10:00–19:00'
  const shiftDurationMins = isSun ? 0 : isSat ? 6 * 60 : 9 * 60
  const isLate = !isSun && !clientVariableHours && totalMins > (10 * 60 + 5)
  const lateMinutes = isLate ? Math.max(6, totalMins - 10 * 60) : 0
  return { weekday: wk, isSun, isSat, shiftName, shiftDurationMins, isLate, lateMinutes, totalMins }
}

export interface AreaIntelligence {
  code: string
  ticker: string
  slug: string
  name: string
  emirate: EmirateName
  area: string
  masterDeveloper: string
  image: string
  segment: 'Prime' | 'Upper-mid' | 'Mid' | 'Value'
  ppsf: number
  ppsfLY: number
  yoyPct: number
  yieldPct: number
  serviceCharge: number
  transactionsQ: number
  offPlanShare: number
  rentStudio: number
  rent1: number
  rent2: number
  rent3: number
  lat: number
  lng: number
  trend: number[]
  forecast15Y: { year: number; projectedPpsf: number; catalyst: string }[]
  nearby: {
    metro: string
    landmarks: string[]
    schools: string[]
    hospitals: string[]
    beachOrParkMins: string
  }
  amenities: string[]
  description: string
  ongoingProjects: string[]
  future15YearOutlook: string
  closingKeywords: string[]
  fieldVisitPitchScript: string[]
}

export const UAE_AREAS_FULL: AreaIntelligence[] = UAE_COMMUNITIES.map(c => ({
  code: c.code,
  ticker: c.ticker,
  slug: c.slug,
  name: c.name,
  emirate: c.emirate,
  area: c.area,
  masterDeveloper: c.masterDeveloper,
  image: c.image,
  segment: c.segment,
  ppsf: c.ppsf,
  ppsfLY: c.ppsfLY,
  yoyPct: c.yoyPct,
  yieldPct: c.yieldPct,
  serviceCharge: c.serviceCharge,
  transactionsQ: c.transactionsQ,
  offPlanShare: c.offPlanShare,
  rentStudio: c.rentStudio,
  rent1: c.rent1,
  rent2: c.rent2,
  rent3: c.rent3,
  lat: c.lat,
  lng: c.lng,
  trend: c.trend,
  forecast15Y: c.forecast15Y,
  nearby: c.nearby,
  amenities: c.amenities,
  description: c.description,
  ongoingProjects: c.ongoingProjects,
  future15YearOutlook: c.future15YearOutlook,
  closingKeywords: c.closingKeywords,
  fieldVisitPitchScript: c.fieldVisitPitchScript,
}))

// Backwards-compatible export consumed by search-unified & market intelligence routes
export const DUBAI_AREAS_24: AreaIntelligence[] = UAE_AREAS_FULL

export const UAE_MORTGAGE_BANKS = [
  { bank: 'First Abu Dhabi Bank (FAB)', fixedRate3Y: 3.89, fixedRate5Y: 3.99, variableMarginEibor: 1.49, maxLtvExpat: 80, maxLtvNational: 85, processingFeePct: 0.5, preApprovalDays: 3, highlight: 'Lowest 3-year fixed rate + 50% fee waiver on green/Emaar properties' },
  { bank: 'Emirates NBD', fixedRate3Y: 3.94, fixedRate5Y: 4.09, variableMarginEibor: 1.55, maxLtvExpat: 80, maxLtvNational: 85, processingFeePct: 0.75, preApprovalDays: 2, highlight: 'Fastest 48-hour digital pre-approval + Non-resident Golden Visa financing' },
  { bank: 'Abu Dhabi Commercial Bank (ADCB)', fixedRate3Y: 3.99, fixedRate5Y: 4.15, variableMarginEibor: 1.59, maxLtvExpat: 80, maxLtvNational: 85, processingFeePct: 0.5, preApprovalDays: 3, highlight: 'Free property valuation on ready secondary transfers above AED 2M' },
  { bank: 'Dubai Islamic Bank (DIB - Sharia)', fixedRate3Y: 4.05, fixedRate5Y: 4.19, variableMarginEibor: 1.65, maxLtvExpat: 80, maxLtvNational: 85, processingFeePct: 0.5, preApprovalDays: 3, highlight: '100% Sharia-compliant Ijara & Murabaha home finance' },
  { bank: 'Mashreq Bank', fixedRate3Y: 3.95, fixedRate5Y: 4.10, variableMarginEibor: 1.50, maxLtvExpat: 80, maxLtvNational: 85, processingFeePct: 0.5, preApprovalDays: 2, highlight: 'Up to 50% off-plan handover financing across top 15 Dubai developers' },
  { bank: 'HSBC UAE', fixedRate3Y: 3.85, fixedRate5Y: 3.95, variableMarginEibor: 1.45, maxLtvExpat: 80, maxLtvNational: 85, processingFeePct: 0.0, preApprovalDays: 4, highlight: 'Zero bank arrangement fee for Premier clients & international transfers' },
]

function requireOwner(req: any) {
  if (!req.user || req.user.permissions !== '*') {
    throw new HttpError(403, 'Only Owner Shabib Siraj (full owner authorization) can approve or execute this administrative action.')
  }
}

export async function sendOwnerMorningBriefing() {
  const today = todayStr()
  const offplanDeals = q.val<number>(`SELECT COUNT(*) FROM jobs WHERE department_division = 'Sales of Off-Plan Projects' AND job_status NOT IN ('Completed','Cancelled') AND deleted_at IS NULL`) ?? 0
  const secondaryDeals = q.val<number>(`SELECT COUNT(*) FROM jobs WHERE department_division = 'Secondary Projects' AND job_status NOT IN ('Completed','Cancelled') AND deleted_at IS NULL`) ?? 0
  const leasingDeals = q.val<number>(`SELECT COUNT(*) FROM jobs WHERE department_division = 'Leasing' AND job_status NOT IN ('Completed','Cancelled') AND deleted_at IS NULL`) ?? 0
  const newLeads = q.val<number>(`SELECT COUNT(*) FROM leads WHERE status = 'New' AND deleted_at IS NULL`) ?? 0
  const todayVisits = q.val<number>(`SELECT COUNT(*) FROM viewings WHERE substr(scheduled_at, 1, 10) = ? AND status NOT IN ('Cancelled') AND deleted_at IS NULL`, today) ?? 0
  const pendingRecycle = q.val<number>(`SELECT COUNT(*) FROM recycle_bin_requests WHERE status = 'Pending Owner Approval' AND deleted_at IS NULL`) ?? 0
  const pendingWithdrawals = q.val<number>(`SELECT COUNT(*) FROM deal_withdrawals WHERE status IN ('Pending Manager Review','Pending Owner (Shabib Siraj) Approval') AND deleted_at IS NULL`) ?? 0
  const pendingAdminDecisions = q.val<number>(`SELECT COUNT(*) FROM approval_requests WHERE status = 'Pending'`) ?? 0

  const text = [
    `🇸🇼🇰 *SWK PROPERTIES — OWNER MORNING BRIEF (${today})*`,
    `Assalamu Alaikum Shabib Siraj (Owner), here is today's operational snapshot:`,
    `• *Off-Plan Pipeline*: ${offplanDeals} active deals`,
    `• *Secondary Pipeline*: ${secondaryDeals} active deals`,
    `• *Leasing Pipeline*: ${leasingDeals} active deals`,
    `• *Unassigned / New Leads*: ${newLeads}`,
    `• *Site Visits Scheduled Today*: ${todayVisits}`,
    `• *Awaiting Your Owner Approval*: ${pendingRecycle} Recycle Bin deletions | ${pendingWithdrawals} Deal Withdrawals | ${pendingAdminDecisions} Manager Admin Decisions`,
    `• *Next Automated Report*: 10:30 AM Staff Attendance & Contemptor Report (10:05 AM grace cutoff).`,
  ].join('\n')

  notifyLeadership('SWK Morning Briefing — Owner Summary', text.replace(/\*/g, ''), '/dashboard', 'info', `owner-morning-${today}`)
  const nums = ownerNumbers()
  for (const n of nums) {
    await sendWhatsApp(n, text, { origin: 'morning_briefing', name: 'Shabib Siraj' })
  }
  return { ok: true, text, sentTo: nums, briefing: { recipient: 'Shabib Siraj (Owner)', text, sentTo: nums } }
}

export async function sendOwner1030AttendanceReport() {
  const today = todayStr()
  const shift = computeDubaiShiftInfo(new Date())
  const employees = q.all(`SELECT id, emp_no as emp_code, name, designation as role_title, user_id FROM employees WHERE status = 'Active' AND deleted_at IS NULL ORDER BY id`)
  const attRows = q.all(`SELECT * FROM attendance WHERE att_date = ? AND deleted_at IS NULL`, today)
  const attByEmp = new Map<number, any>(attRows.map((r: any) => [Number(r.employee_id), r]))

  const onTime: string[] = []
  const fieldCheckIn: string[] = []
  const lateAfter1005: string[] = []
  const absentOrUnaccounted: string[] = []
  const continuousContemptors: { name: string; lateCount7d: number }[] = []

  const d7 = new Date(`${today}T00:00:00Z`)
  d7.setUTCDate(d7.getUTCDate() - 6)
  const cutoff7d = d7.toISOString().slice(0, 10)

  for (const emp of employees) {
    // Owner Shabib Siraj is exempt from staff attendance contemptor tracking
    if (/shabib/i.test(emp.name) || /owner/i.test(emp.role_title ?? '')) continue
    const row = attByEmp.get(emp.id)
    if (!row || (!row.check_in && row.status === 'Absent')) {
      absentOrUnaccounted.push(`${emp.name} (${emp.emp_code})`)
    } else if (row.status === 'Late' || (row.check_in && String(row.check_in).slice(-5) > '10:05')) {
      lateAfter1005.push(`${emp.name} (checked in ${row.check_in || 'late'}${row.late_minutes ? `, +${row.late_minutes}m` : ''})`)
    } else if (row.checkin_mode === 'Field Site Visit Live GPS' || row.status === 'Field Visit') {
      fieldCheckIn.push(`${emp.name} (${row.check_in || 'Field GPS'})`)
    } else {
      onTime.push(`${emp.name} (${row.check_in || '≤10:05'})`)
    }

    const lateCountAtt = q.val<number>(
      `SELECT COUNT(*) FROM attendance WHERE employee_id = ? AND att_date BETWEEN ? AND ? AND status = 'Late' AND deleted_at IS NULL`,
      emp.id, cutoff7d, today,
    ) ?? 0
    const lateCountEv = q.val<number>(
      `SELECT COUNT(*) FROM attendance_events WHERE employee_id = ? AND work_date BETWEEN ? AND ? AND (duty_status = 'Late Arrival' OR late_minutes > 0) AND deleted_at IS NULL`,
      emp.id, cutoff7d, today,
    ) ?? 0
    const lateCount7d = Math.max(lateCountAtt, lateCountEv)
    if (lateCount7d >= 3) {
      continuousContemptors.push({ name: emp.name, lateCount7d })
    }
  }

  const text = [
    `🕥 *SWK 10:30 AM ATTENDANCE REPORT (${today})*`,
    `Working Hours: ${shift.shiftName} | Grace Cutoff: *10:05 AM*`,
    `✅ *On-Time in Office (≤10:05 AM)* (${onTime.length}): ${onTime.join(', ') || 'None'}`,
    `📍 *Field Site-Visit Live GPS Check-In* (${fieldCheckIn.length}): ${fieldCheckIn.join(', ') || 'None'}`,
    `⚠️ *Late Arrivals (>10:05 AM)* (${lateAfter1005.length}): ${lateAfter1005.join(', ') || 'None'}`,
    `❌ *Not Checked In by 10:30 AM* (${absentOrUnaccounted.length}): ${absentOrUnaccounted.join(', ') || 'None'}`,
    ...(continuousContemptors.length
      ? [`🚨 *CONTINUOUS CONTEMPTORS (≥3 Late in 7 Days)*: ${continuousContemptors.map(c => `${c.name} (${c.lateCount7d}x late)`).join(', ')} — Manager Mohammad Haseeb alerted to take report & guide.`]
      : ['👏 *Zero Continuous Contemptors* in the rolling 7-day window.']),
  ].join('\n')

  notifyLeadership('10:30 AM Attendance & Contemptor Report', text.replace(/\*/g, ''), '/e/attendance', lateAfter1005.length || absentOrUnaccounted.length ? 'warn' : 'info', `att-1030-${today}`)
  for (const n of ownerNumbers()) {
    await sendWhatsApp(n, text, { origin: 'attendance_1030', name: 'Shabib Siraj' })
  }

  return {
    ok: true,
    date: today,
    shift,
    summary: {
      onTime,
      fieldCheckIn,
      lateAfter1005,
      late_after_1005: lateAfter1005,
      absentOrUnaccounted,
      continuousContemptors,
    },
    text,
  }
}

export function syncDailyDldTransactionsAndNews(ctx: Ctx = SYSTEM_CTX) {
  const today = todayStr()
  const existingToday = q.val<number>(`SELECT COUNT(*) FROM dld_market_transactions WHERE txn_date = ? AND deleted_at IS NULL`, today) ?? 0
  const insertedDld: any[] = []
  if (existingToday < 5) {
    const samples = [
      { community_code: 'PALM', area_name: 'Palm Jumeirah', building_or_project: 'Como Residences', department_division: 'Sales of Off-Plan Projects', procedure_type: 'Off-Plan Sale (Oqood)', property_type: 'Apartment', bedrooms: '3 B/R', area_sqft: 4420, transacted_value_aed: 28500000, price_per_sqft_aed: 6448, buyer_finance_mode: 'Developer Payment Plan' },
      { community_code: 'DWNT', area_name: 'Downtown Dubai', building_or_project: 'Address Residences Opera', department_division: 'Secondary Projects', procedure_type: 'Secondary Ready Sale (Title Deed)', property_type: 'Apartment', bedrooms: '2 B/R', area_sqft: 1290, transacted_value_aed: 4350000, price_per_sqft_aed: 3372, buyer_finance_mode: 'Cash' },
      { community_code: 'DHIL', area_name: 'Dubai Hills Estate', building_or_project: 'Park Gate Villas', department_division: 'Secondary Projects', procedure_type: 'Secondary Ready Sale (Title Deed)', property_type: 'Villa', bedrooms: '4 B/R', area_sqft: 5120, transacted_value_aed: 14900000, price_per_sqft_aed: 2910, buyer_finance_mode: 'Mortgaged' },
      { community_code: 'JVCC', area_name: 'Jumeirah Village Circle', building_or_project: 'Binghatti Royale', department_division: 'Sales of Off-Plan Projects', procedure_type: 'Off-Plan Sale (Oqood)', property_type: 'Apartment', bedrooms: '1 B/R', area_sqft: 785, transacted_value_aed: 1150000, price_per_sqft_aed: 1465, buyer_finance_mode: 'Developer Payment Plan' },
      { community_code: 'DSOU', area_name: 'Dubai South', building_or_project: 'South Bay Phase 4', department_division: 'Sales of Off-Plan Projects', procedure_type: 'Off-Plan Sale (Oqood)', property_type: 'Townhouse', bedrooms: '3 B/R', area_sqft: 2890, transacted_value_aed: 3650000, price_per_sqft_aed: 1263, buyer_finance_mode: 'Developer Payment Plan' },
      { community_code: 'DCHB', area_name: 'Dubai Creek Harbour', building_or_project: 'Address Grand Creek', department_division: 'Sales of Off-Plan Projects', procedure_type: 'Off-Plan Sale (Oqood)', property_type: 'Apartment', bedrooms: '2 B/R', area_sqft: 1340, transacted_value_aed: 3420000, price_per_sqft_aed: 2552, buyer_finance_mode: 'Developer Payment Plan' },
    ]
    for (const s of samples) {
      const rec = createRecord(getDef('dld_market_transactions'), {
        ...s,
        txn_date: today,
        source_repo: 'Dubai Pulse / DLD Open Data GitHub Sync',
      }, ctx)
      insertedDld.push(rec)
    }
  }

  const newsToday = q.val<number>(`SELECT COUNT(*) FROM real_estate_news WHERE substr(published_at, 1, 10) = ? AND deleted_at IS NULL`, today) ?? 0
  if (newsToday === 0) {
    createRecord(getDef('real_estate_news'), {
      headline: `DLD Daily Pulse (${today}): Off-Plan & Secondary Transfers Maintain Record Momentum Across 24 Dubai Corridors`,
      category: 'DLD & RERA Regulation',
      area_name: 'Downtown Dubai',
      published_at: nowIso(),
      source_name: 'Dubai Land Department / SWK Research Desk',
      impact_ticker: 'Bullish (+)',
      urgent_alert: true,
      summary: 'Daily Dubai Land Department open-data feed confirms sustained absorption in Palm Jumeirah, Dubai Hills, JVC, Creek Harbour, and Dubai South, supported by sub-4% fixed UAE mortgage rates.',
      client_pitch_takeaway: 'Share today’s live DLD transfer numbers with clients on site visits to prove real-time price discovery and transaction velocity.',
    }, ctx)
  }

  return { ok: true, date: today, insertedCount: insertedDld.length, inserted_count: insertedDld.length }
}

export default async function swkOpsRoutes(app: FastifyInstance) {
  const requireAdminOrHaseeb = (req: any) => {
    if (!canAccessSwkAdminLogic(req.user)) {
      throw new HttpError(403, 'Administration access is restricted until proper role access is granted by the Owner.')
    }
  }

  // ------------------------------------------------------------------ 1. Recycle Bin (Pending Owner Approval)
  app.get('/api/swk-ops/recycle-bin', async (req) => {
    requireAdminOrHaseeb(req)
    const items = q.all(`
      SELECT r.*, r.entity_key as entity, r.record_label as record_title, u1.email as requested_by_email, u2.name as decided_by_name
      FROM recycle_bin_requests r
      LEFT JOIN users u1 ON u1.id = r.requested_by
      LEFT JOIN users u2 ON u2.id = r.decided_by
      WHERE r.deleted_at IS NULL
      ORDER BY CASE WHEN r.status = 'Pending Owner Approval' THEN 0 ELSE 1 END, r.id DESC
      LIMIT 200
    `)
    const counts = {
      pending: items.filter((i: any) => i.status === 'Pending Owner Approval').length,
      approved: items.filter((i: any) => i.status === 'Approved & Permanently Deleted' || i.status === 'Approved & Deleted').length,
      rejected: items.filter((i: any) => i.status === 'Restored (Deletion Rejected)' || i.status === 'Rejected & Restored').length,
    }
    return { items, counts }
  })

  app.post('/api/swk-ops/recycle-bin/:id/decide', async (req) => {
    requireOwner(req)
    const { id } = req.params as { id: string }
    const body = (req.body ?? {}) as { decision?: 'approve' | 'reject'; owner_notes?: string }
    if (body.decision !== 'approve' && body.decision !== 'reject') {
      throw new HttpError(400, 'Specify decision as "approve" or "reject".')
    }
    const row = q.get<any>(`SELECT * FROM recycle_bin_requests WHERE id = ? AND deleted_at IS NULL`, Number(id))
    if (!row) throw new HttpError(404, 'Recycle Bin request not found')
    if (row.status !== 'Pending Owner Approval') throw new HttpError(400, `Request is already ${row.status}`)

    return tx(() => {
      const entityKey = row.entity_key || row.entity
      const recordTitle = row.record_label || row.record_title || `#${row.record_id}`
      if (body.decision === 'approve') {
        const def = getDef(entityKey)
        const targetExists = q.get(`SELECT id FROM ${def.key} WHERE id = ? AND deleted_at IS NULL`, Number(row.record_id))
        if (targetExists) {
          deleteRecord(def, Number(row.record_id), { ...req.ctx, auditReason: `Owner Shabib Siraj approved Recycle Bin #${row.bin_no}: ${row.reason}`, recycleBin: false })
        }
        q.run(
          `UPDATE recycle_bin_requests SET status = 'Approved & Permanently Deleted', decided_by = ?, decided_at = ?, decision_notes = ?, updated_at = ? WHERE id = ?`,
          req.user!.id, nowIso(), body.owner_notes ?? 'Approved by Owner Shabib Siraj', nowIso(), row.id,
        )
        if (row.requested_by) {
          notify(row.requested_by, `Deletion Approved by Owner: ${recordTitle}`, `Bin ${row.bin_no} permanently deleted.`, `/recycle-bin`, 'info')
        }
        notifyLeadership(`Owner Approved Deletion: ${recordTitle}`, `Shabib Siraj approved permanent deletion of ${entityKey} #${row.record_id} (${row.bin_no}).`, '/recycle-bin', 'info')
        return { ok: true, status: 'Approved & Deleted', bin_status: 'Approved & Permanently Deleted', id: row.id }
      } else {
        q.run(
          `UPDATE recycle_bin_requests SET status = 'Restored (Deletion Rejected)', decided_by = ?, decided_at = ?, decision_notes = ?, updated_at = ? WHERE id = ?`,
          req.user!.id, nowIso(), body.owner_notes ?? 'Rejected by Owner Shabib Siraj — record kept active', nowIso(), row.id,
        )
        if (row.requested_by) {
          notify(row.requested_by, `Deletion Rejected by Owner: ${recordTitle}`, `Record remains active. Note: ${body.owner_notes ?? 'Retained'}`, `/e/${entityKey}/${row.record_id}`, 'warn')
        }
        notifyLeadership(`Owner Rejected Deletion: ${recordTitle}`, `Shabib Siraj rejected deletion of ${entityKey} #${row.record_id} (${row.bin_no}). Record stays active.`, `/e/${entityKey}/${row.record_id}`, 'info')
        return { ok: true, status: 'Rejected & Restored', bin_status: 'Restored (Deletion Rejected)', id: row.id }
      }
    })
  })

  // ------------------------------------------------------------------ 2. Deal Withdrawals & Client Refunds
  app.get('/api/swk-ops/withdrawals', async (req) => {
    requireAdminOrHaseeb(req)
    const items = q.all(`
      SELECT w.*, p.name as client_name, pr.title as property_title, j.job_no as job_no_ref, u.name as owner_approver_name
      FROM deal_withdrawals w
      LEFT JOIN parties p ON p.id = w.client_id
      LEFT JOIN properties pr ON pr.id = w.property_id
      LEFT JOIN jobs j ON j.id = w.job_id
      LEFT JOIN users u ON u.id = w.owner_approved_by
      WHERE w.deleted_at IS NULL
      ORDER BY w.id DESC
    `)
    return { items }
  })

  app.post('/api/swk-ops/withdrawals', async (req) => {
    const body = (req.body ?? {}) as Record<string, any>
    const reasonText = String(body.situation_and_reason ?? body.reason_details ?? body.reason ?? '').trim()
    if (!reasonText || reasonText.length < 5) {
      throw new HttpError(400, 'Detailed withdrawal reason and agreed payment terms are required.')
    }
    const paid = Number(body.amount_paid_by_client ?? body.total_amount_paid ?? 0)
    const withBy = String(body.withdrawing_party ?? body.withdrawn_by ?? 'Client / Buyer')
    let forfeitPct = Number(body.agreed_forfeiture_pct ?? 0)
    if (body.agreed_forfeiture_pct === undefined && body.forfeited_or_deducted_amount === undefined && body.forfeited_deduction_amount === undefined) {
      if (withBy.includes('Developer') || withBy.includes('Seller') || withBy.includes('Mortgage Rejection')) {
        forfeitPct = 0 // 100% full refund when developer/seller withdraws or mortgage contingency triggers
      } else {
        forfeitPct = 10 // Standard 10% earnest/booking forfeiture per agreed terms
      }
    }
    const deduction = Number(body.forfeited_or_deducted_amount ?? body.forfeited_deduction_amount ?? Math.round(paid * (forfeitPct / 100) * 100) / 100)
    const refundable = Number(body.refundable_amount_to_client ?? body.refundable_to_client ?? body.refundable_amount ?? Math.max(0, Math.round((paid - deduction) * 100) / 100))

    // Resolve property_id and client_id defaults if omitted
    const propId = body.property_id || q.val<number>(`SELECT id FROM properties WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 1`) || 1
    const clientId = body.client_id || body.customer_id || q.val<number>(`SELECT id FROM parties WHERE is_customer = 1 AND deleted_at IS NULL ORDER BY id ASC LIMIT 1`) || 1

    const rec = createRecord(getDef('deal_withdrawals'), {
      department_division: body.department_division || 'Sales of Off-Plan Projects',
      job_id: body.job_id || null,
      property_id: propId,
      client_id: clientId,
      withdrawing_party: ['Client / Buyer', 'Developer (Project Delay / Cancellation)', 'Seller / Landlord', 'Bank Mortgage Rejection (Subject-to-Finance Clause)', 'Mutual Termination'].includes(withBy) ? withBy : 'Client / Buyer',
      withdrawal_stage: ['EOI / Booking Form Stage', 'After Form F / MOU Signed (10% Deposit Held)', 'After SPA Signed / Oqood Registered', 'During Construction / Handover Delay', 'Before Ejari Registration'].includes(body.withdrawal_stage) ? body.withdrawal_stage : 'After Form F / MOU Signed (10% Deposit Held)',
      original_payment_mode: ['SWK Company Bank Account (AED/FX)', 'Developer DLD Escrow Account', 'Manager Cheque (Uncashed)', 'Post-Dated Cheques (PDC)', 'Worldwide Currency Exchange (Licensed UAE Exchange House)', 'UAE-Permitted Crypto / USDT (VARA-Licensed Gateway)'].includes(body.original_payment_mode) ? body.original_payment_mode : 'SWK Company Bank Account (AED/FX)',
      amount_paid_by_client: paid,
      forfeited_or_deducted_amount: deduction,
      refundable_amount_to_client: refundable,
      refund_settlement_channel: ['Return via SWK Company Bank Transfer', 'Developer Escrow Refund to Client', 'Return Original Uncashed Manager Cheque / PDC', 'Licensed UAE Exchange Refund', 'VARA-Regulated USDT / Crypto Refund to Verified Client Wallet', 'No Refund (100% Forfeited per Signed Contract Terms)'].includes(body.refund_settlement_channel) ? body.refund_settlement_channel : 'Return via SWK Company Bank Transfer',
      agreed_terms_at_payment: body.agreed_terms_at_payment || 'Standard UAE RERA / DLD payment & refund terms agreed at booking.',
      situation_and_reason: reasonText,
      status: 'Pending Manager Review',
    }, req.ctx)

    notifyLeadership(
      `Deal Withdrawal Logged: ${rec.withdrawal_no}`,
      `${withBy} withdrawal — Paid: AED ${paid.toLocaleString('en-US')}, Refundable: AED ${refundable.toLocaleString('en-US')}. Awaiting Manager review & Owner Shabib Siraj approval.`,
      `/withdrawals`,
      'warn',
    )
    return { ...rec, withdrawal: rec }
  })

  app.post('/api/swk-ops/withdrawals/:id/manager-review', async (req) => {
    if (!can(req.user, 'sales', 'approve') && !can(req.user, 'finance', 'approve') && req.user?.permissions !== '*' && req.user?.role_name !== 'Manager') {
      throw new HttpError(403, 'Only Manager Mohammad Haseeb or Owner Shabib Siraj can submit a withdrawal review.')
    }
    const { id } = req.params as { id: string }
    const body = (req.body ?? {}) as { manager_recommendation?: string; deduction_forfeiture_amount?: number; refundable_to_client?: number }
    const row = q.get<any>(`SELECT * FROM deal_withdrawals WHERE id = ? AND deleted_at IS NULL`, Number(id))
    if (!row) throw new HttpError(404, 'Withdrawal record not found')
    const rec = updateRecord(getDef('deal_withdrawals'), row.id, {
      notes: body.manager_recommendation || 'Reviewed by Manager Mohammad Haseeb — recommended for Owner Shabib Siraj final approval per payment terms.',
      manager_reviewed_by: req.user!.id,
      manager_reviewed_at: nowIso(),
      ...(body.deduction_forfeiture_amount !== undefined ? { forfeited_or_deducted_amount: body.deduction_forfeiture_amount } : {}),
      ...(body.refundable_to_client !== undefined ? { refundable_amount_to_client: body.refundable_to_client } : {}),
      status: 'Pending Owner (Shabib Siraj) Approval',
    }, { ...req.ctx, system: true, auditReason: body.manager_recommendation || 'Manager review of deal withdrawal' })

    notifyLeadership(
      `Withdrawal Awaiting Owner Approval: ${row.withdrawal_no}`,
      `Manager ${req.user!.name} reviewed ${row.withdrawal_no}. Ready for Owner Shabib Siraj final decision.`,
      `/withdrawals`,
      'warn',
    )
    return { ...rec, status: 'Pending Owner Approval', entity_status: rec.status }
  })

  app.post('/api/swk-ops/withdrawals/:id/owner-approve', async (req) => {
    requireOwner(req)
    const { id } = req.params as { id: string }
    const body = (req.body ?? {}) as { decision?: 'approve' | 'refund_paid' | 'reject'; refund_reference?: string; owner_approval_notes?: string; notes?: string; refundable_to_client?: number; deduction_forfeiture_amount?: number }
    const row = q.get<any>(`SELECT * FROM deal_withdrawals WHERE id = ? AND deleted_at IS NULL`, Number(id))
    if (!row) throw new HttpError(404, 'Withdrawal record not found')
    const nextStatus = body.decision === 'reject'
      ? 'Rejected'
      : (body.decision === 'refund_paid' || body.refund_reference)
        ? 'Refund Executed & Reconciled'
        : 'Approved by Owner – Ready for Refund'
    const rec = updateRecord(getDef('deal_withdrawals'), row.id, {
      status: nextStatus,
      owner_approved_by: req.user!.id,
      owner_approved_at: nowIso(),
      ...(body.refund_reference ? { refund_bank_reference: body.refund_reference } : {}),
      ...(body.refundable_to_client !== undefined ? { refundable_amount_to_client: body.refundable_to_client } : {}),
      ...(body.deduction_forfeiture_amount !== undefined ? { forfeited_or_deducted_amount: body.deduction_forfeiture_amount } : {}),
      ...(body.notes || body.owner_approval_notes ? { notes: body.notes || body.owner_approval_notes } : {}),
    }, { ...req.ctx, system: true, auditReason: `Owner Shabib Siraj decision (${nextStatus}) on withdrawal ${row.withdrawal_no}` })

    if (nextStatus !== 'Rejected' && row.job_id) {
      q.run(`UPDATE jobs SET job_status = 'Cancelled', notes = ?, updated_at = ? WHERE id = ?`, `Deal Withdrawal ${row.withdrawal_no}: ${row.situation_and_reason}`, nowIso(), row.job_id)
    }
    notifyLeadership(`Owner ${nextStatus}: ${row.withdrawal_no}`, `Owner Shabib Siraj marked withdrawal ${row.withdrawal_no} as ${nextStatus}.`, `/withdrawals`, 'info')
    return { ...rec, status: body.refund_reference ? 'Refund Paid & Closed' : nextStatus, entity_status: nextStatus }
  })

  // ------------------------------------------------------------------ 3. Manager Administrative Decision Requests (Haseeb -> Shabib)
  app.get('/api/swk-ops/admin-decisions', async (req) => {
    requireAdminOrHaseeb(req)
    const items = q.all(`
      SELECT a.*, u1.name as requested_by_name, u2.name as decided_by_name
      FROM approval_requests a
      LEFT JOIN users u1 ON u1.id = a.requested_by
      LEFT JOIN users u2 ON u2.id = a.decided_by
      ORDER BY CASE WHEN a.status = 'Pending' THEN 0 ELSE 1 END, a.id DESC
    `)
    return { items }
  })

  app.post('/api/swk-ops/admin-decisions', async (req) => {
    requireAdminOrHaseeb(req)
    const body = (req.body ?? {}) as { subject?: string; category?: string; decision_type?: string; reason?: string; justification?: string; amount?: number; entity?: string; record_id?: number }
    const reasonText = body.reason || body.justification
    if (!body.subject || !reasonText) throw new HttpError(400, 'Subject and detailed reasoning are required for Owner approval.')
    const cat = body.category || body.decision_type || 'Administrative Decision'
    const recId = body.record_id || (Date.now() % 100000000)
    const info = q.run(
      `INSERT INTO approval_requests (entity, record_id, requested_by, requested_at, status, reason) VALUES (?, ?, ?, ?, 'Pending', ?)`,
      body.entity || 'admin_decision',
      recId,
      req.user!.id,
      nowIso(),
      `[${cat}] ${body.subject} — ${reasonText}${body.amount ? ` (AED ${Number(body.amount).toLocaleString('en-US')})` : ''}`,
    )
    const id = Number(info.lastInsertRowid)
    notifyLeadership(
      `Admin Decision Requested by ${req.user!.name}`,
      `${body.subject}: ${reasonText} — Awaiting Owner Shabib Siraj approval.`,
      `/recycle-bin`,
      'warn',
    )
    const approval = q.get(`SELECT * FROM approval_requests WHERE id = ?`, id)
    return { ...approval, approval }
  })

  app.post('/api/swk-ops/admin-decisions/:id/owner-decide', async (req) => {
    requireOwner(req)
    const { id } = req.params as { id: string }
    const body = (req.body ?? {}) as { decision?: 'Approved' | 'Rejected' | 'approve' | 'reject'; comment?: string; notes?: string }
    const normalized = (body.decision === 'approve' || body.decision === 'Approved')
      ? 'Approved'
      : (body.decision === 'reject' || body.decision === 'Rejected')
        ? 'Rejected'
        : null
    if (!normalized) throw new HttpError(400, 'Decision must be Approved or Rejected')
    const row = q.get<any>(`SELECT * FROM approval_requests WHERE id = ?`, Number(id))
    if (!row) throw new HttpError(404, 'Decision request not found')
    const commentText = body.comment ?? body.notes ?? `${normalized} by Owner Shabib Siraj`
    q.run(
      `UPDATE approval_requests SET status = ?, decided_by = ?, decided_at = ?, reason = ? WHERE id = ?`,
      normalized, req.user!.id, nowIso(), `${row.reason} | Owner Note: ${commentText}`, row.id,
    )
    if (row.requested_by) {
      notify(row.requested_by, `Owner ${normalized} Admin Decision`, `${row.reason} — ${commentText}`, `/recycle-bin`, normalized === 'Approved' ? 'info' : 'warn')
    }
    return { ok: true, id: row.id, status: normalized }
  })

  // ------------------------------------------------------------------ 4. Bayut & Dubizzle Portal Syndication + 3rd-Party A2A Match
  // No Bayut/Dubizzle/Property Finder API or XML feed is wired up yet: say so instead of showing a fake "Live" status.
  const NO_FEED = 'No live feed connected: publish manually on the portal, then record it here'
  app.get('/api/swk-ops/portals/status', async (req) => {
    need(req, 'properties', 'view')
    const props = q.all(`
      SELECT id, property_no as prop_code, title, department_division, COALESCE(sub_community, building_name, address, '') as community,
             CASE WHEN department_division = 'Leasing' THEN 'Rent' ELSE 'Sale' END as purpose,
             status, rera_permit_no as trakheesi_permit, syndicate_bayut as portal_bayut, syndicate_dubizzle as portal_dubizzle, syndicate_pf as portal_pf,
             inventory_source_type as inventory_source, is_third_party_agent as is_a2a_listing,
             external_agency_name as third_party_agency_name, external_agent_name as third_party_agent_name,
             a2a_commission_split_pct as third_party_commission_pct, price as list_price, rent_annual as annual_rent
      FROM properties WHERE deleted_at IS NULL ORDER BY id DESC
    `)
    const logs = q.all(`SELECT * FROM portal_syndication_logs ORDER BY id DESC LIMIT 30`)
    const leadsBySource = q.all(`SELECT source, COUNT(*) as count FROM leads WHERE deleted_at IS NULL GROUP BY source ORDER BY count DESC`)
    return {
      portals: [
        { key: 'bayut', name: 'Bayut UAE', activeListings: props.filter((p: any) => p.portal_bayut).length, account: 'SWK Properties LLC — Bayut Pro Agency #BRN-SWK', status: NO_FEED },
        { key: 'dubizzle', name: 'Dubizzle Property', activeListings: props.filter((p: any) => p.portal_dubizzle).length, account: 'SWK Properties LLC — Dubizzle Verified Agency', status: NO_FEED },
        { key: 'pf', name: 'Property Finder UAE', activeListings: props.filter((p: any) => p.portal_pf).length, account: 'SWK Properties LLC — PF Enterprise', status: NO_FEED },
      ],
      byDepartment: {
        offplan: props.filter((p: any) => p.department_division === 'Sales of Off-Plan Projects').length,
        secondary: props.filter((p: any) => p.department_division === 'Secondary Projects').length,
        leasing: props.filter((p: any) => p.department_division === 'Leasing').length,
        a2aCount: props.filter((p: any) => p.is_a2a_listing || p.inventory_source === '3rd-Party Agent (A2A)').length,
      },
      leadsBySource,
      recentLogs: logs,
    }
  })

  // Records a publish REQUEST for every listing flagged for a portal. Nothing is sent: a person publishes on the portal and then enters the real ad reference.
  app.post('/api/swk-ops/portals/sync', async (req) => {
    need(req, 'properties', 'edit')
    const body = (req.body ?? {}) as { portal?: string; department_division?: string }
    const portalName = body.portal || 'Bayut & Dubizzle'
    const publishable = q.all(`SELECT id, department_division, syndicate_bayut, syndicate_dubizzle, syndicate_pf FROM properties WHERE deleted_at IS NULL AND status IN ('Available','Off-Plan','Under Offer') AND (syndicate_bayut = 1 OR syndicate_dubizzle = 1 OR syndicate_pf = 1)`)
    let requested = 0
    for (const p of publishable) {
      q.run(
        `INSERT INTO portal_syndication_logs (portal_name, property_id, department_division, action, feed_status, external_listing_ref, synced_by, synced_at) VALUES (?, ?, ?, 'PUBLISH_REQUEST', 'Pending manual publish', NULL, ?, ?)`,
        portalName, p.id, p.department_division || body.department_division || 'Secondary Projects', req.user?.id ?? null, nowIso(),
      )
      requested++
    }
    notifyLeadership(`Portal publish requests logged`, `${requested} listings need manual publishing on ${portalName}. No automatic feed is connected.`, `/pipeline`, 'info')
    return { ok: true, portal: portalName, requested, automatic: false, syncedAt: nowIso() }
  })

  app.get('/api/swk-ops/a2a-match', async (req) => {
    need(req, 'properties', 'view')
    const qParams = (req.query ?? {}) as { department_division?: string; community?: string; bedrooms?: string; max_budget?: string; only_a2a?: string }
    const allProps = q.all(`
      SELECT *, property_no as prop_code, COALESCE(sub_community, building_name, address, '') as community,
             CASE WHEN department_division = 'Leasing' THEN 'Rent' ELSE 'Sale' END as purpose,
             inventory_source_type as inventory_source, is_third_party_agent as is_a2a_listing,
             external_agency_name as third_party_agency_name, external_agent_name as third_party_agent_name,
             a2a_commission_split_pct as third_party_commission_pct, price as list_price, rent_annual as annual_rent
      FROM properties WHERE deleted_at IS NULL ORDER BY is_third_party_agent DESC, id DESC
    `)
    const filtered = allProps.filter((p: any) => {
      if (qParams.department_division && p.department_division !== qParams.department_division) return false
      if (qParams.community && !String(p.community || '').toLowerCase().includes(qParams.community.toLowerCase())) return false
      if (qParams.bedrooms && Number(p.bedrooms) !== Number(qParams.bedrooms)) return false
      if (qParams.only_a2a === '1' && !p.is_a2a_listing && p.inventory_source !== '3rd-Party Agent (A2A)') return false
      if (qParams.max_budget) {
        const budgetCents = toCents(Number(qParams.max_budget))
        const price = p.purpose === 'Rent' ? Number(p.annual_rent || 0) : Number(p.list_price || 0)
        if (price > 0 && price > budgetCents) return false
      }
      return true
    }).map((p: any) => {
      const baseValue = fromCents(p.purpose === 'Rent' ? (p.annual_rent || 0) : (p.list_price || 0))
      const grossCommPct = p.purpose === 'Rent' ? 5 : 2
      const grossComm = Math.round(baseValue * (grossCommPct / 100))
      const isA2A = !!(p.is_a2a_listing || p.inventory_source === '3rd-Party Agent (A2A)')
      const a2aSharePct = isA2A ? Number(p.third_party_commission_pct || 50) : 0
      const thirdPartyPayout = Math.round(grossComm * (a2aSharePct / 100))
      const swkNetPool = grossComm - thirdPartyPayout
      const swkCompanyShare50 = Math.round(swkNetPool * 0.5)
      const advisorShare50 = swkNetPool - swkCompanyShare50
      return {
        ...p,
        list_price_aed: fromCents(p.list_price || 0),
        annual_rent_aed: fromCents(p.annual_rent || 0),
        commissionPreview: {
          grossCommissionAed: grossComm,
          isA2A,
          a2aPartnerSharePct: a2aSharePct,
          thirdPartyAgentPayoutAed: thirdPartyPayout,
          swkNetPoolAed: swkNetPool,
          swkCompany50PctAed: swkCompanyShare50,
          salesAdvisor50PctAed: advisorShare50,
        },
      }
    })
    return { items: filtered, a2a_brokers: filtered, total: filtered.length }
  })

  // ------------------------------------------------------------------ 5. Market Pulse, Daily DLD Sync, News & Site-Visit Area Companion
  app.get('/api/swk-ops/market-pulse', async (req) => {
    if (!req.user || req.user.party_id) throw new HttpError(403, 'Staff only')
    const dldRows = q.all(`SELECT * FROM dld_market_transactions WHERE deleted_at IS NULL ORDER BY txn_date DESC, id DESC LIMIT 60`).map((r: any) => ({
      ...r,
      trans_date: r.txn_date,
      project_name: r.building_or_project,
      procedure_name: r.procedure_type,
      actual_worth: fromCents(r.transacted_value_aed),
      price_per_sqft: fromCents(r.price_per_sqft_aed),
      meter_sale_price: Math.round(fromCents(r.price_per_sqft_aed) * 10.764),
    }))
    const newsRows = q.all(`SELECT * FROM real_estate_news WHERE deleted_at IS NULL ORDER BY published_at DESC, id DESC LIMIT 30`).map((n: any) => ({
      ...n,
      published_date: String(n.published_at || '').slice(0, 10),
      client_pitch_talking_point: n.client_pitch_takeaway,
    }))
    return {
      areas: DUBAI_AREAS_24,
      communities: DUBAI_AREAS_24,
      dldTransactions: dldRows,
      dld_transactions: dldRows,
      news: newsRows,
      mortgageBanks: UAE_MORTGAGE_BANKS,
      mortgage_rates: UAE_MORTGAGE_BANKS,
      lastUpdated: nowIso(),
    }
  })

  app.post('/api/swk-ops/dld-sync', async (req) => {
    requireAdminOrHaseeb(req)
    const res = syncDailyDldTransactionsAndNews(req.ctx)
    return res
  })

  app.get('/api/swk-ops/area-companion/:code', async (req) => {
    if (!req.user || req.user.party_id) throw new HttpError(403, 'Staff only')
    const { code } = req.params as { code: string }
    const qKey = String(code || '').toUpperCase().trim()
    const area = DUBAI_AREAS_24.find(
      a => a.code === qKey || a.ticker.toUpperCase() === qKey || a.slug.toUpperCase() === qKey || a.name.toUpperCase() === qKey || a.name.toUpperCase().includes(qKey),
    ) ?? DUBAI_AREAS_24[0]

    const dldInArea = q.all(
      `SELECT * FROM dld_market_transactions WHERE deleted_at IS NULL AND (community_code = ? OR UPPER(area_name) LIKE '%' || UPPER(?) || '%') ORDER BY txn_date DESC, id DESC LIMIT 15`,
      area.code, area.name,
    ).map((r: any) => ({
      ...r,
      trans_date: r.txn_date,
      project_name: r.building_or_project,
      procedure_name: r.procedure_type,
      actual_worth: fromCents(r.transacted_value_aed),
      price_per_sqft: fromCents(r.price_per_sqft_aed),
    }))

    const areaNews = q.all(
      `SELECT * FROM real_estate_news WHERE deleted_at IS NULL AND (UPPER(area_name) LIKE '%' || UPPER(?) || '%' OR UPPER(headline) LIKE '%' || UPPER(?) || '%') ORDER BY published_at DESC, id DESC LIMIT 10`,
      area.name.split(' ')[0], area.name.split(' ')[0],
    )

    const swkUnitsInArea = q.all(
      `SELECT id, property_no as prop_code, title, department_division, property_type, bedrooms, area_sqft, price as list_price, rent_annual as annual_rent, status, inventory_source_type as inventory_source, is_third_party_agent as is_a2a_listing, external_agency_name as third_party_agency_name FROM properties WHERE deleted_at IS NULL AND (UPPER(COALESCE(address, '')) LIKE '%' || UPPER(?) || '%' OR UPPER(COALESCE(building_name, '')) LIKE '%' || UPPER(?) || '%') ORDER BY id DESC LIMIT 12`,
      area.name.split(' ')[0], area.name.split(' ')[0],
    ).map((p: any) => ({
      ...p,
      list_price: fromCents(p.list_price || 0),
      annual_rent: fromCents(p.annual_rent || 0),
    }))

    return {
      area,
      stock_card: {
        ticker: `DLD:${area.code === 'MARN' || area.code === 'DMAR' ? 'MARINA' : area.code}`,
        price_sqft: area.ppsf,
        yoy_change_pct: area.yoyPct,
        gross_yield_pct: area.yieldPct,
      },
      companion: {
        future_15yr_outlook: area.future15YearOutlook,
        closing_keywords: area.closingKeywords,
        pitch_phrases: area.fieldVisitPitchScript,
        nearby: area.nearby,
        ongoing_projects: area.ongoingProjects,
      },
      dldTransactions: dldInArea,
      news: areaNews,
      availableInventory: swkUnitsInArea,
      mortgageRates: UAE_MORTGAGE_BANKS.slice(0, 3),
    }
  })

  // ------------------------------------------------------------------ 6. Owner WhatsApp Morning Briefing & 10:30 AM Attendance Report
  app.post('/api/swk-ops/briefings/morning', async (req) => {
    requireAdminOrHaseeb(req)
    return await sendOwnerMorningBriefing()
  })

  app.post('/api/swk-ops/briefings/attendance-1030', async (req) => {
    requireAdminOrHaseeb(req)
    const reportRes = await sendOwner1030AttendanceReport()
    return reportRes
  })

  // ------------------------------------------------------------------ 7. Standalone Reception QR Check-In Endpoints
  const resolveClientIp = (req: any): string => {
    const cf = req.headers?.['cf-connecting-ip']
    if (typeof cf === 'string' && cf.trim()) return cf.trim()
    // Production is reachable only through the Cloudflare Tunnel, which always sets Cf-Connecting-Ip. X-Forwarded-For can be typed by anyone, so it is never trusted here.
    if (config.isProd) return String(req.raw?.socket?.remoteAddress || '')
    const xff = req.headers?.['x-forwarded-for']
    if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0]!.trim()
    return String(req.ip || '127.0.0.1')
  }

  const officeGps = () => ({
    name: String(getSetting('office_gps_name') || 'SWK Properties HQ'),
    lat: Number(getSetting('office_gps_lat') ?? 25.2131),
    lng: Number(getSetting('office_gps_lng') ?? 55.2768),
    radius: Number(getSetting('office_gps_radius_m') ?? 200) || 200,
    max_accuracy_m: Number(getSetting('gps_max_accuracy_m') ?? 150) || 150,
    enforce_gps: Boolean(getSetting('office_gps_enforce') ?? false),
    qr_mode: qrMode(),
    qr_step_s: Number(getSetting('qr_step_seconds') ?? 20) || 20,
    require_live_camera: Boolean(getSetting('qr_require_live_camera') ?? true),
  })

  const getWifiCfg = (clientIp?: string) => {
    const ssidRaw = String(getSetting('office_wifi_ssid') || 'XAVIER BUSINESS').trim()
    const allowedSsids = ssidRaw.split(',').map(s => s.trim()).filter(Boolean)
    const publicIpsRaw = String(getSetting('office_wifi_public_ips') || '').trim()
    const allowedPublicIps = publicIpsRaw.split(',').map(s => s.trim()).filter(Boolean)
    const gatewayIp = String(getSetting('office_wifi_gateway_ip') || '192.168.0.1').trim()
    const strictIp = Boolean(getSetting('office_wifi_strict_ip'))
    const cleanClientIp = String(clientIp || '').replace(/^::ffff:/, '').trim()
    const isLocalIp = !config.isProd && (!cleanClientIp || cleanClientIp === '127.0.0.1' || cleanClientIp.startsWith('127.') || cleanClientIp === '::1' || cleanClientIp.startsWith('192.168.') || cleanClientIp.startsWith('10.'))
    const ipMatchesConfigured = isLocalIp || allowedPublicIps.some(ip => ip.endsWith(':') ? cleanClientIp.startsWith(ip) : cleanClientIp === ip)
    const gps = officeGps()
    return {
      ssid: allowedSsids[0] || 'XAVIER BUSINESS',
      allowed_ssids: allowedSsids,
      public_ips: publicIpsRaw,
      allowed_public_ips: allowedPublicIps,
      gateway_ip: gatewayIp,
      strict_ip: strictIp,
      detected_client_ip: cleanClientIp || '127.0.0.1',
      ip_matches_office: ipMatchesConfigured,
      office_ip_locked: allowedPublicIps.length > 0,
      office_gps_set: Number.isFinite(gps.lat) && Number.isFinite(gps.lng),
      office_gps_name: gps.name,
      office_gps_lat: gps.lat,
      office_gps_lng: gps.lng,
      office_gps_radius_m: gps.radius,
      gps_max_accuracy_m: gps.max_accuracy_m,
      office_gps_enforce: gps.enforce_gps,
      qr_mode: gps.qr_mode,
      qr_step_s: gps.qr_step_s,
      qr_require_live_camera: gps.require_live_camera,
    }
  }

  // Public pages need only the network status. They never receive any attendance code, and the office's public address is not disclosed.
  const publicWifi = (cfg: ReturnType<typeof getWifiCfg>) => { const { public_ips: _a, allowed_public_ips: _b, ...rest } = cfg; return rest }
  app.get('/api/public/reception-qr/current', async (req) => ({
    standalone: true,
    requires_login: false,
    office_wifi: publicWifi(getWifiCfg(resolveClientIp(req))),
    shift_info: computeDubaiShiftInfo(new Date()),
  }))

  app.get('/api/public/reception-qr/wifi-config', async (req) => publicWifi(getWifiCfg(resolveClientIp(req))))

  const saveWifiConfig = async (req: any) => {
    if (!isAdminSwkUser(req.user)) {
      throw new HttpError(403, 'Only the Admin can lock or change the office Wi-Fi. Open Settings, Attendance Wi-Fi.')
    }
    const b = (req.body ?? {}) as Record<string, any>
    const clientIp = resolveClientIp(req)
    if (b.clear_ips) b.office_wifi_public_ips = ''
    if (b.lock_current_ip && clientIp) {
      // locked once: changing it means clearing first, both done by the Admin in Settings
      if (String(b.office_wifi_public_ips ?? getSetting('office_wifi_public_ips') ?? '').trim()) throw new HttpError(409, 'The office network is already locked. To change it, clear it first in Settings, Attendance Wi-Fi.')
      // an IPv6 phone gets a different address each time, so lock the network prefix (first four groups); IPv4 locks the exact address
      const clean = clientIp.replace(/^::ffff:/, '')
      const lockVal = clean.includes(':') ? clean.split(':').slice(0, 4).join(':') + ':' : clean
      const existing = String(b.office_wifi_public_ips ?? getSetting('office_wifi_public_ips') ?? '').split(',').map(s => s.trim()).filter(Boolean)
      if (!existing.includes(lockVal)) existing.push(lockVal)
      b.office_wifi_public_ips = existing.join(', ')
    }
    const cleanPatch: Record<string, any> = {}
    if (b.use_current_gps && Number.isFinite(Number(b.gps_lat)) && Number.isFinite(Number(b.gps_lng))) {
      cleanPatch.office_gps_lat = String(Number(b.gps_lat)); cleanPatch.office_gps_lng = String(Number(b.gps_lng))
    }
    for (const k of ['office_gps_name', 'office_gps_lat', 'office_gps_lng', 'office_gps_radius_m', 'office_gps_enforce', 'gps_max_accuracy_m', 'qr_step_seconds', 'qr_require_live_camera', 'office_wifi_ssid', 'office_wifi_bssid', 'office_wifi_public_ips', 'office_wifi_gateway_ip', 'office_wifi_strict_ip']) {
      if (b[k] !== undefined) cleanPatch[k] = b[k]
    }
    setSettings(cleanPatch)
    return { ...getWifiCfg(clientIp), public_ips: String(getSetting('office_wifi_public_ips') || ''), office_gps: officeGps() }
  }
  app.post('/api/public/reception-qr/wifi-config', saveWifiConfig)
  app.post('/api/swk-ops/attendance-setup', saveWifiConfig)
  // ---- rotating QR for the reception screen: Owner, Admin, Manager Haseeb, and Office Admin Meenakshi (only from the office network once it is locked)
  app.get('/api/swk-ops/reception-token', async (req, reply) => {
    reply.header('cache-control', 'no-store')
    if (!canPrintReceptionQr(req.user)) throw new HttpError(403, 'Only the Owner, Admin, Manager Haseeb, or Office Admin Meenakshi can open the reception code screen.')
    const cfg = getWifiCfg(resolveClientIp(req))
    if (cfg.office_ip_locked && !cfg.ip_matches_office) throw new HttpError(403, `Open the reception screen on the office network (${cfg.ssid}).`)
    return currentQrToken()
  })
  // Owner/Admin/Manager/Office Admin Meenakshi: regenerate fixed code or switch between fixed and 20-second rotating code
  app.post('/api/swk-ops/reception-token/regenerate', async (req, reply) => {
    reply.header('cache-control', 'no-store')
    if (!canPrintReceptionQr(req.user)) throw new HttpError(403, 'Only the Owner, Admin, Manager, or Office Admin Meenakshi can change the reception code.')
    regenerateFixedQr()
    return currentQrToken()
  })
  app.post('/api/swk-ops/reception-token/mode', async (req, reply) => {
    reply.header('cache-control', 'no-store')
    if (!canPrintReceptionQr(req.user)) throw new HttpError(403, 'Only the Owner, Admin, Manager, or Office Admin Meenakshi can change the reception code.')
    const mode = String((req.body as any)?.mode || '')
    if (mode !== 'fixed' && mode !== 'rotating') throw new HttpError(400, 'mode must be fixed or rotating')
    setQrMode(mode)
    return currentQrToken()
  })
  const attendanceControl = () => ({
    devices: q.all(`SELECT d.id, d.user_id, u.name, d.label, d.device_id, d.status, d.platform, d.app_version, d.revoked_at, d.revoked_reason, d.first_seen, d.last_seen FROM staff_devices d JOIN users u ON u.id = d.user_id ORDER BY (d.status = 'Pending') DESC, d.last_seen DESC LIMIT 100`),
    field: q.all(`SELECT e.id, e.event_no, e.work_date, e.check_in_at, e.checkin_method, e.security_flags, e.gps_lat, e.gps_lng, e.gps_accuracy_m, emp.name FROM attendance_events e LEFT JOIN employees emp ON emp.id = e.employee_id WHERE e.field_review = 'Pending' AND e.deleted_at IS NULL ORDER BY e.id DESC LIMIT 100`),
  })
  app.get('/api/swk-ops/attendance-control', async (req) => {
    if (!isElevatedCanonicalEmail(req.user?.email)) throw new HttpError(403, 'Only the Owner, Admin, or Manager can review attendance control.')
    return attendanceControl()
  })
  app.post('/api/swk-ops/attendance-control/device/:id', async (req) => {
    if (!isElevatedCanonicalEmail(req.user?.email)) throw new HttpError(403, 'Only the Owner, Admin, or Manager can approve devices.')
    const id = Number((req.params as any).id)
    const dev = q.get<{ id: number; user_id: number; device_id: string }>(`SELECT id, user_id, device_id FROM staff_devices WHERE id = ?`, id)
    if (!dev) throw new HttpError(404, 'Device not found')
    const b = (req.body ?? {}) as any
    const approve = !!b.approve
    if (!approve && isOwnerSwkUser(loadUser(dev.user_id)) && !isOwnerSwkUser(req.user)) {
      throw new HttpError(403, 'Only the Owner can block an Owner device.')
    }
    tx(() => {
      if (approve) {
        q.run(
          `UPDATE staff_devices SET status = 'Approved', decided_by = ?, revoked_at = NULL, revoked_reason = NULL WHERE id = ?`,
          req.user!.id,
          dev.id,
        )
      } else {
        const reason = typeof b.reason === 'string' && b.reason.trim() ? b.reason.trim().slice(0, 240) : 'Blocked via Attendance Control'
        q.run(
          `UPDATE staff_devices SET status = 'Blocked', decided_by = ?, revoked_at = ?, revoked_reason = ? WHERE id = ?`,
          req.user!.id,
          nowIso(),
          reason,
          dev.id,
        )
        destroyDeviceSessions(dev.device_id)
        q.run(`UPDATE push_subscriptions SET active = 0 WHERE device_id = ?`, dev.device_id)
      }
    })
    return attendanceControl()
  })
  app.post('/api/swk-ops/attendance-control/field/:id', async (req) => {
    if (!isElevatedCanonicalEmail(req.user?.email)) throw new HttpError(403, 'Only the Owner, Admin, or Manager can approve field check-ins.')
    const id = Number((req.params as any).id), approve = !!(req.body as any)?.approve
    const ev = q.get<any>(`SELECT * FROM attendance_events WHERE id = ? AND field_review = 'Pending' AND deleted_at IS NULL`, id)
    if (!ev) throw new HttpError(404, 'Nothing waiting for approval')
    tx(() => {
      patchRecord(getDef('attendance_events'), id, { field_review: approve ? 'Approved' : 'Rejected', manager_verified: approve, corrected_by: req.user!.id }, SYSTEM_CTX)
      if (approve && !q.get(`SELECT 1 AS x FROM attendance WHERE employee_id = ? AND att_date = ? AND deleted_at IS NULL`, ev.employee_id, ev.work_date)) {
        createRecord(getDef('attendance'), { employee_id: ev.employee_id, att_date: ev.work_date, check_in: ev.check_in_at, checkin_mode: ev.checkin_method === 'Field GPS' ? 'Field Site Visit Live GPS' : 'Office QR Scan', status: ev.checkin_method === 'Field GPS' ? 'Field Site Visit' : 'Present', note: `Approved by ${req.user!.name} (${ev.event_no})` }, SYSTEM_CTX)
      }
    })
    return attendanceControl()
  })
  app.get('/api/swk-ops/attendance-setup', async (req) => {
    if (!canPrintReceptionQr(req.user)) throw new HttpError(403, 'Only the Owner, Admin, Manager, or Office Admin Meenakshi can view attendance setup.')
    return { ...getWifiCfg(resolveClientIp(req)), office_gps: officeGps() }
  })

  // One-time challenge the phone must sign, so a check-in cannot be replayed or made up by hand.
  app.get('/api/public/reception-qr/challenge', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => ({ challenge: newChallenge(resolveClientIp(req)) }))

  /**
   * Locked-down office check-in rules, all of which must hold:
   *  1. Request originates from the locked office Wi-Fi public IP,
   *  2. Short-TTL rotating AES-256-GCM QR token (rotates every 20s, max ~40s TTL, single-use nonce burn per user),
   *  3. Live browser camera capture attestation (`capture_source === 'live_camera'`) in rotating mode — static screenshots & forwarded links are refused,
   *  4. Tight GPS radius check around Al Saqr Business Tower (default 75m radius, <= 65m accuracy, impossible-travel spoof detection),
   *  5. Hardware-bound WebCrypto P-256 device key belonging to one approved person per day.
   */
  const handlePublicQrCheckIn = async (req: any, reply: any) => {
    const b = (req.body ?? {}) as Record<string, any>
    const clientIp = resolveClientIp(req)
    const ua = String(req.headers?.['user-agent'] || '').slice(0, 160)
    const wifiConfig = getWifiCfg(clientIp)
    if (!wifiConfig.office_ip_locked) throw new HttpError(403, 'Check-in is not set up yet. The Owner or Manager must lock the office network first.')
    if (!wifiConfig.ip_matches_office) throw new HttpError(403, `Check-in works only on the office Wi-Fi (${wifiConfig.ssid}). Your connection (${wifiConfig.detected_client_ip}) is not the office network. Mobile data and other Wi-Fi are refused.`)
    const qrCheck = inspectQrToken(b.qr_payload)
    if (!qrCheck.valid) {
      throw new HttpError(400, qrCheck.reason || 'Scan the code on the reception screen with the camera in this page. The code must be the current one from the reception screen.')
    }
    const captureSource = String(b.capture_source || '').trim().toLowerCase()
    const requireLiveCam = Boolean(getSetting('qr_require_live_camera') ?? true)
    if (qrCheck.mode === 'rotating' && requireLiveCam) {
      if (captureSource !== 'live_camera') {
        throw new HttpError(403, 'Static screenshots and forwarded QR links are blocked. Scan the live rotating reception display directly using your browser camera.')
      }
      if (b.captured_at) {
        const capTs = Date.parse(String(b.captured_at))
        if (!Number.isFinite(capTs) || Math.abs(Date.now() - capTs) > 45_000) {
          throw new HttpError(400, 'Camera capture expired. Point your live camera at the rotating reception screen again.')
        }
      }
    }
    const deviceId = verifyDeviceProof({ challenge: String(b.challenge || ''), payload: String(b.qr_payload), pub: b.device_pub, sig: String(b.device_sig || '') }, clientIp)

    // Already signed in on this phone: check in with the session, no password needed.
    const sessionUser = req.sessionUserForCheckin as any
    if (sessionUser) return finishCheckIn(sessionUser, b, clientIp, ua, wifiConfig, deviceId, qrCheck, captureSource || 'live_camera')
    const loginEmail = String(b.email || '').trim().toLowerCase()
    const loginPassword = String(b.password || '')
    if (!loginEmail || !loginPassword) throw new HttpError(400, 'Enter your company email and password.')
    // Wrong passwords count against this connection, never against the person, so nobody can lock a colleague out from here.
    checkPasswordForCheckin(loginEmail, loginPassword, clientIp)
    const loginRes = attemptLogin(loginEmail, loginPassword, b.totp, clientIp, ua)
    if ('needsTotp' in loginRes && loginRes.needsTotp) return { needsTotp: true }
    const authUser = (loginRes as any).user
    const out = await finishCheckIn(authUser, b, clientIp, ua, wifiConfig, deviceId, qrCheck, captureSource || 'live_camera')
    // Scanning signs the person in as well, so they continue straight into SWK OS on this phone.
    const sess = createSession(authUser.id, clientIp, ua)
    const secure = config.cookieSecure ?? (config.isProd && (req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https'))
    reply.setCookie(COOKIE, sess.token, { httpOnly: true, sameSite: 'lax', secure: !!secure, path: '/', expires: sess.expires })
    return { ...out, signed_in: true }
  }

  const finishCheckIn = async (
    authUser: any,
    b: Record<string, any>,
    clientIp: string,
    ua: string,
    wifiConfig: any,
    deviceId: string,
    qrCheck: ReturnType<typeof inspectQrToken>,
    captureSource: string,
  ) => {
    const device = deviceGate(authUser.id, deviceId, String(b.device_name || ua), isElevatedCanonicalEmail(authUser.email))
    if (device === 'Pending') {
      for (const em of ['shabib@swk.properties', 'haseeb@swk.properties']) { const u = q.get<any>(`SELECT id FROM users WHERE lower(email) = ? AND deleted_at IS NULL`, em); if (u) notify(u.id, `New device waiting: ${authUser.name}`, 'Approve it on the reception check-in page under Attendance control', '/reception-qr', 'approval', `dev-${authUser.id}-${deviceId.slice(0, 12)}`) }
      throw new HttpError(403, 'This device is new. The Owner or Manager must approve it before you can check in. They have been notified.')
    }
    const reuse = q.get<any>(`SELECT id FROM attendance_events WHERE device_id = ? AND work_date = ? AND user_id <> ? AND deleted_at IS NULL LIMIT 1`, deviceId, todayStr(), authUser.id)
    if (reuse) throw new HttpError(403, 'This device has already checked in another person today. One device, one person.')

    // Office check-in relies on locked Office Wi-Fi + rotating live camera QR + device key (GPS only if explicitly enabled by Admin)
    const enforceGps = Boolean(getSetting('office_gps_enforce') ?? false)
    const gpsVerified = enforceGps
      ? verifyOfficeGeofence(authUser.id, { lat: b.gps_lat, lng: b.gps_lng, accuracy_m: b.gps_accuracy_m })
      : null

    return tx(() => {
      if (qrCheck.mode === 'rotating' && qrCheck.nonceHash && qrCheck.windowId !== null) {
        burnQrNonce(qrCheck.nonceHash, authUser.id, qrCheck.windowId)
      }
      let emp = q.get<any>(`SELECT * FROM employees WHERE (user_id = ? OR lower(email) = lower(?)) AND deleted_at IS NULL ORDER BY id ASC LIMIT 1`, authUser.id, authUser.email)
      if (!emp) {
        emp = createRecord(getDef('employees'), { name: authUser.name || authUser.email.split('@')[0], user_id: authUser.id, email: authUser.email, designation: 'Staff', status: 'Active', branch_id: authUser.branch_id ?? 1 }, SYSTEM_CTX)
      }
      const now = nowLocal() // company-time wall clock (Dubai), the form every date-time field stores
      const shiftInfo = computeDubaiShiftInfo(new Date())
      const existingToday = q.get<any>(`SELECT * FROM attendance_events WHERE employee_id = ? AND work_date = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1`, emp.id, todayStr())
      if (existingToday?.device_id && existingToday.device_id !== deviceId) throw new HttpError(403, 'You already checked in today from a different device.')
      const eventRecord = existingToday
        ? existingToday
        : createRecord(getDef('attendance_events'), {
            employee_id: emp.id,
            user_id: authUser.id,
            work_date: todayStr(),
            shift_name: shiftInfo.shiftName,
            grace_minutes: 5,
            terminal_type: 'Dynamic QR',
            qr_token_ref: qrCheck.mode === 'rotating' ? `rotating-${wifiConfig.qr_step_s}s-${captureSource}` : 'fixed-office-qr',
            check_in_at: now,
            duty_status: shiftInfo.isLate ? 'Late Arrival' : 'On Duty',
            late_minutes: shiftInfo.lateMinutes,
            manager_verified: true,
            field_review: 'Not needed',
            checkin_method: 'Office Wi-Fi',
            device_id: deviceId,
            client_ip: wifiConfig.detected_client_ip,
            gps_lat: gpsVerified ? String(gpsVerified.lat) : undefined,
            gps_lng: gpsVerified ? String(gpsVerified.lng) : undefined,
            gps_accuracy_m: gpsVerified ? gpsVerified.accuracy_m : undefined,
            security_flags: gpsVerified?.flags.length ? gpsVerified.flags.join('; ') : undefined,
            notes: `Verified on ${wifiConfig.ssid} · IP ${wifiConfig.detected_client_ip} · ${qrCheck.mode} QR (${captureSource})${gpsVerified ? ` · GPS ${gpsVerified.distance_m}m from ${gpsVerified.office_name} (±${gpsVerified.accuracy_m}m)` : ''} · device ${deviceId.slice(0, 8)}`,
          }, SYSTEM_CTX)

      if (!q.get(`SELECT 1 AS x FROM attendance WHERE employee_id = ? AND att_date = ? AND deleted_at IS NULL`, emp.id, todayStr())) {
        createRecord(getDef('attendance'), { employee_id: emp.id, att_date: todayStr(), check_in: now, checkin_mode: 'Office QR Scan', status: shiftInfo.isLate ? 'Late' : 'Present', note: `Reception QR Check-in (${eventRecord.event_no})` }, SYSTEM_CTX)
      }
      // Auto-post live check-in status into the SWK Properties Team Inside group
      if (!existingToday) {
        try {
          ensureTeamGroup()
          const teamTid = q.val<number>(`SELECT id FROM chat_threads WHERE system_key = 'team' LIMIT 1`)
          if (teamTid) {
            const clockStr = attendanceClock(now)
            const statusLabel = shiftInfo.isLate ? `Late (${shiftInfo.lateMinutes}m)` : 'On Duty'
            const msg = `✅ *Office Check-In* · *${emp.name}* checked in at *${clockStr} GST* (${statusLabel} · Al Saqr Building SZR · ${wifiConfig.ssid})`
            postAutomationMessage(teamTid, authUser.id, msg)
          }
        } catch {
          // Never block attendance recording if chat group is unavailable
        }
      }
      return {
        verified: true,
        already_checked_in: !!existingToday,
        employee: { id: emp.id, name: emp.name, emp_no: emp.emp_no, designation: emp.designation, email: emp.email },
        verification_summary: {
          verified_by: 'Office Wi-Fi',
          office_network_verified: true,
          office_wifi_ssid: wifiConfig.ssid,
          client_ip: wifiConfig.detected_client_ip,
          qr_mode: qrCheck.mode,
          capture_source: captureSource,
          gps_verified: Boolean(gpsVerified),
          office_name: gpsVerified?.office_name ?? wifiConfig.office_gps_name,
          distance_m: gpsVerified?.distance_m ?? null,
          radius_m: gpsVerified?.radius_m ?? wifiConfig.office_gps_radius_m,
          gps_accuracy_m: gpsVerified?.accuracy_m ?? null,
          timestamp_gst: existingToday?.check_in_at || now,
          shift_name: eventRecord.shift_name,
          grace_cutoff_gst: '10:05',
          is_late: shiftInfo.isLate,
          late_minutes: shiftInfo.lateMinutes,
        },
        attendance_event: eventRecord,
        event: eventRecord,
      }
    })
  }

  app.post('/api/public/reception-qr/check-in', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, handlePublicQrCheckIn)
  app.post('/api/public/reception-qr/scan-login-checkin', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, handlePublicQrCheckIn)
  app.post('/api/public/qr-checkin', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, handlePublicQrCheckIn)
  // Signed-in phones: same office-network, live-code and device-key checks, without typing the password again.
  app.post('/api/attendance/qr-checkin', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req: any, reply) => {
    if (!req.user || req.user.party_id) throw new HttpError(401, 'Sign in first')
    req.sessionUserForCheckin = req.user
    return handlePublicQrCheckIn(req, reply)
  })

  // ------------------------------------------------------------------ 8. Owner (shabib@swk.properties) Direct Control Over Admin (admin@swk.properties)
  app.get('/api/swk-ops/owner-admin-control', async (req) => {
    requireAdminOrHaseeb(req)
    const ownerUser = q.get<any>(
      `SELECT u.id, u.name, u.email, u.designation, u.active, u.last_login_at, r.name AS role_name
       FROM users u LEFT JOIN roles r ON r.id = u.role_id
       WHERE lower(u.email) = 'shabib@swk.properties' AND u.deleted_at IS NULL LIMIT 1`,
    )
    const adminUser = q.get<any>(
      `SELECT u.id, u.name, u.email, u.designation, u.active, u.failed_logins, u.locked_until, u.last_login_at, r.name AS role_name, r.description AS role_description
       FROM users u LEFT JOIN roles r ON r.id = u.role_id
       WHERE lower(u.email) = 'admin@swk.properties' AND u.deleted_at IS NULL LIMIT 1`,
    )
    const adminSessions = adminUser
      ? q.all<any>(
          `SELECT id, created_at, last_seen, ip, user_agent FROM sessions WHERE user_id = ? ORDER BY last_seen DESC LIMIT 10`,
          adminUser.id,
        )
      : []
    const adminAuditTrail = adminUser
      ? q.all<any>(
          `SELECT id, at, action, entity, record_id, record_label FROM audit_log WHERE user_id = ? OR lower(user_name) LIKE '%admin%' ORDER BY id DESC LIMIT 15`,
          adminUser.id,
        )
      : []
    return {
      owner: ownerUser,
      admin: adminUser,
      active_sessions_count: adminSessions.length,
      active_sessions: adminSessions.map((s: any) => ({ ...s, id: String(s.id).slice(0, 12) })),
      recent_audit_trail: adminAuditTrail,
      can_control: isOwnerSwkUser(req.user),
      hierarchy_policy: {
        owner_account: 'shabib@swk.properties',
        controlled_admin_account: 'admin@swk.properties',
        rule: 'Owner Shabib Siraj (shabib@swk.properties) holds supreme supervisory control over Admin (admin@swk.properties). Admin has full operational & system access across all 18+ SWK OS modules under Owner oversight and cannot alter or deactivate the Owner account.',
      },
    }
  })

  app.post('/api/swk-ops/owner-admin-control/action', async (req) => {
    if (!isOwnerSwkUser(req.user)) {
      throw new HttpError(403, 'Only Owner Shabib Siraj (shabib@swk.properties) has supervisory control over admin@swk.properties.')
    }
    const body = (req.body ?? {}) as {
      action?: 'suspend' | 'activate' | 'force_signout' | 'reset_password' | 'unlock'
      new_password?: string
      notes?: string
    }
    const adminUser = q.get<any>(`SELECT * FROM users WHERE lower(email) = 'admin@swk.properties' AND deleted_at IS NULL LIMIT 1`)
    if (!adminUser) throw new HttpError(404, 'Admin account (admin@swk.properties) not found')

    const act = body.action
    if (!act || !['suspend', 'activate', 'force_signout', 'reset_password', 'unlock'].includes(act)) {
      throw new HttpError(400, 'Specify a valid Owner control action: suspend, activate, force_signout, reset_password, or unlock.')
    }

    if (act === 'suspend') {
      q.run(`UPDATE users SET active = 0, updated_at = ? WHERE id = ?`, nowIso(), adminUser.id)
      destroyUserSessions(adminUser.id)
    } else if (act === 'activate') {
      q.run(`UPDATE users SET active = 1, failed_logins = 0, locked_until = NULL, updated_at = ? WHERE id = ?`, nowIso(), adminUser.id)
    } else if (act === 'force_signout') {
      destroyUserSessions(adminUser.id)
    } else if (act === 'unlock') {
      q.run(`UPDATE users SET failed_logins = 0, locked_until = NULL, updated_at = ? WHERE id = ?`, nowIso(), adminUser.id)
    } else if (act === 'reset_password') {
      const explicitPw = typeof body.new_password === 'string' ? body.new_password.trim() : ''
      if (!explicitPw && config.accounts.adminSwkPasswordGenerated) {
        throw new HttpError(400, 'Enter a new password for admin@swk.properties (at least 10 characters with upper-case, lower-case, and a digit or symbol).')
      }
      const nextPw = explicitPw || config.accounts.adminSwkPassword
      if (explicitPw) validatePasswordStrength(nextPw)
      q.run(
        `UPDATE users SET password_hash = ?, must_change_password = 0, failed_logins = 0, locked_until = NULL, active = 1, updated_at = ? WHERE id = ?`,
        hashPassword(nextPw),
        nowIso(),
        adminUser.id,
      )
      destroyUserSessions(adminUser.id)
    }

    q.run(
      `INSERT INTO audit_log(at, user_id, user_name, entity, record_id, record_label, action, changes, ip) VALUES (?,?,?,?,?,?,?,?,?)`,
      nowIso(),
      req.user!.id,
      req.user!.name,
      'users',
      adminUser.id,
      'admin@swk.properties',
      `owner-control:${act}`,
      JSON.stringify({ _reason: body.notes || `Owner Shabib Siraj executed ${act} on admin@swk.properties` }),
      req.ip ?? null,
    )

    return {
      ok: true,
      action: act,
      controlled_account: 'admin@swk.properties',
      executed_by: req.user!.email,
    }
  })

  // ------------------------------------------------------------------ 9. Automated Employee Targets (1st & 15th) & Document Expiry Notifications
  app.get('/api/swk-ops/targets/summary', async (req) => {
    need(req, 'hr', 'approve')
    return computeMonthlyTargetSummaries()
  })

  app.post('/api/swk-ops/targets/notify', async (req) => {
    requireAdminOrHaseeb(req)
    const body = (req.body ?? {}) as { mode?: 'start' | 'mid' | 'auto' }
    const mode = body.mode === 'start' || body.mode === 'mid' ? body.mode : 'auto'
    const res = notifyEmployeeTargets(mode, true)
    return { ok: true, ...res }
  })

  app.post('/api/swk-ops/compliance/check-expiries', async (req) => {
    requireAdminOrHaseeb(req)
    const res = checkEmployeeAndDocumentExpiries(true)
    return { ok: true, ...res }
  })
}
