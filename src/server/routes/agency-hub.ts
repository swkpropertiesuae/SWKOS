/**
 * Dubai Competitor Real Estate Agency OS Hub API
 *
 * Brings best-in-class Dubai brokerage OS capabilities (PropSpace, Pixxi, Behomes,
 * Goyzer, Reelly, Property Finder Expert) directly into SWK Properties OS:
 *   1. Listing Quality Score (0–100%) + Property Finder & Bayut/Dubizzle XML Syndication Feeds
 *   2. 5-Minute Lead SLA Monitor + 1-Click Smart Buyer-to-Property Matcher
 *   3. 3-Project Side-by-Side Dubai/Abu Dhabi Investor ROI, DLD/ADM & Golden Visa Comparator (+ PDF/DOCX/JPEG Export)
 *   4. Live Broker Leaderboard & Monthly Target Tracker
 *   5. Unified Dubai Compliance & Expiry Radar (Trakheesi, RERA BRN, Form A, Ejari, Visas/EIDs)
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { q, tableExists } from '../db'
import { can } from '../engine'
import { bad, forbidden, fromCents, notFound, nowIso, todayStr } from '../util'
import { isRestrictedStaffUser } from '../../shared/swk-staff-access'
import { assertZeroShabibPublicPayload } from '../../shared/zero-shabib-guard'
import {
  SWK_COMPANY_EMAIL,
  SWK_COMPANY_NAME,
  SWK_COMPANY_PHONE,
  SWK_RERA_ORN,
} from '../../shared/corporate-footer'
import { exportStructuredDossier, type ForensicExportFormat, type StructuredForensicDoc } from '../domain/forensic-exports'
import { idOf } from './helpers'

function requireAgencyHubAccess(req: FastifyRequest) {
  if (!req.user || req.user.party_id) {
    throw forbidden('Dubai Agency Hub is restricted to company staff.')
  }
  if (isRestrictedStaffUser(req.user)) {
    throw forbidden('Dubai Agency Hub requires brokerage operations access.')
  }
  if (!can(req.user, 'properties', 'view') && !can(req.user, 'crm', 'view') && !can(req.user, 'sales', 'view')) {
    throw forbidden('You do not have permission to open Dubai Agency Hub.')
  }
  return req.user
}

const xmlEsc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')

function daysUntil(dateStr: string | null | undefined, today: string): number | null {
  if (!dateStr) return null
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`)
  const t = new Date(`${today}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || Number.isNaN(t.getTime())) return null
  return Math.round((d.getTime() - t.getTime()) / 86_400_000)
}

function scoreListingQuality(p: any, today: string) {
  let score = 0
  const missing: string[] = []
  const permitDays = daysUntil(p.permit_expiry, today)
  if (p.rera_permit_no && (permitDays === null || permitDays >= 0)) {
    score += 20
  } else {
    missing.push('Valid Trakheesi / ADM Permit')
  }
  const price = fromCents(Number(p.price ?? 0))
  const rent = fromCents(Number(p.rent_annual ?? 0))
  if ((price > 0 || rent > 0) && Number(p.area_sqft ?? 0) > 0) {
    score += 15
  } else {
    missing.push('Price & Area (sq ft)')
  }
  if (p.property_type && p.bedrooms !== null && p.bedrooms !== undefined) {
    score += 10
  } else {
    missing.push('Property Type & Bedrooms')
  }
  if (String(p.description || '').trim().length >= 40) {
    score += 15
  } else {
    missing.push('Detailed Description (40+ chars)')
  }
  if (String(p.amenities || p.features || '').trim().length >= 10) {
    score += 15
  } else {
    missing.push('Amenities & Key Features')
  }
  if (p.video_url || p.virtual_tour_url || p.floor_plan_url || p.brochure_url || (p.media && String(p.media).length > 10)) {
    score += 15
  } else {
    missing.push('Photos / 3D Tour / Floor Plan')
  }
  if (p.syndicate_pf || p.syndicate_bayut || p.syndicate_dubizzle) {
    score += 10
  } else {
    missing.push('Enable Portal Syndication')
  }
  return {
    id: p.id,
    property_no: p.property_no,
    title: p.title,
    emirate: p.emirate || 'Dubai',
    community: p.community_name || p.sub_community || 'Dubai',
    developer: p.developer_name || 'Direct',
    property_type: p.property_type,
    status: p.status,
    price_aed: price,
    rent_annual_aed: rent,
    area_sqft: Number(p.area_sqft ?? 0),
    bedrooms: Number(p.bedrooms ?? 0),
    rera_permit_no: p.rera_permit_no || '',
    permit_expiry: p.permit_expiry || '',
    syndicate_pf: Boolean(p.syndicate_pf),
    syndicate_bayut: Boolean(p.syndicate_bayut),
    syndicate_dubizzle: Boolean(p.syndicate_dubizzle),
    quality_score: score,
    grade: score >= 85 ? 'SuperAgent Ready' : score >= 65 ? 'Good' : 'Needs Polish',
    missing,
  }
}

export default async function (app: FastifyInstance) {
  /** 1. Unified Agency Hub Overview: Listing Quality, 5-Min Lead SLA, Leaderboard, Expiry Radar */
  app.get('/api/agency-hub/overview', async (req) => {
    requireAgencyHubAccess(req)
    const today = todayStr()
    const nowMs = Date.now()

    // --- A. Listing Quality & Portal Syndication Readiness ---
    const propRows = q.all(`
      SELECT p.*, d.name AS developer_name, c.name AS community_name
      FROM properties p
      LEFT JOIN developers d ON d.id = p.developer_ref
      LEFT JOIN communities c ON c.id = p.community_ref
      WHERE p.deleted_at IS NULL AND COALESCE(p.active, 1) = 1
      ORDER BY p.id DESC
      LIMIT 120
    `)
    const scoredListings = propRows.map(p => scoreListingQuality(p, today))
    const avgQuality = scoredListings.length
      ? Math.round(scoredListings.reduce((a, b) => a + b.quality_score, 0) / scoredListings.length)
      : 0

    // --- B. 5-Minute Lead SLA Monitor ---
    const leadRows = q.all(`
      SELECT l.id, l.lead_no, l.company, l.contact_name, l.phone, l.source, l.status,
             l.destination, l.bedrooms_wanted, l.est_value, l.interest, l.department_division,
             l.buyer_finance_type, l.first_response_at, l.sla_due_at, l.created_at,
             u.name AS advisor_name
      FROM leads l
      LEFT JOIN users u ON u.id = l.owner_id
      WHERE l.deleted_at IS NULL AND l.status NOT IN ('Converted', 'Unqualified')
      ORDER BY l.id DESC
      LIMIT 60
    `)
    const slaLeads = leadRows.map(l => {
      const createdMs = new Date(l.created_at || nowIso()).getTime()
      const respMs = l.first_response_at ? new Date(l.first_response_at).getTime() : null
      const waitMin = Number.isFinite(createdMs)
        ? Math.max(0, Math.round(((respMs ?? nowMs) - createdMs) / 60_000))
        : 0
      const slaStatus = respMs
        ? waitMin <= 5
          ? 'MET_5MIN'
          : 'LATE_RESPONSE'
        : waitMin > 5
          ? 'BREACHED'
          : 'WAITING_LIVE'
      return {
        id: l.id,
        lead_no: l.lead_no,
        client_name: l.contact_name || l.company || `Lead #${l.id}`,
        company: l.company,
        phone: l.phone || '',
        source: l.source || 'Direct',
        status: l.status,
        target_area: l.destination || '',
        bedrooms_wanted: Number(l.bedrooms_wanted ?? 0),
        budget_aed: fromCents(Number(l.est_value ?? 0)),
        interest: l.interest || l.department_division || 'Property',
        finance_type: l.buyer_finance_type || 'Cash Buyer',
        advisor_name: l.advisor_name || 'Unassigned',
        wait_minutes: waitMin,
        responded: Boolean(respMs),
        sla_status: slaStatus,
        created_at: l.created_at,
      }
    })
    const breachedCount = slaLeads.filter(l => l.sla_status === 'BREACHED').length
    const metCount = slaLeads.filter(l => l.sla_status === 'MET_5MIN').length

    // --- C. Live Broker Leaderboard & Monthly Target Tracker ---
    const agents = q.all(`
      SELECT a.id, a.agent_no, a.name, a.department_division, a.dld_broker_id, a.dld_expiry,
             a.monthly_target, a.status, e.user_id
      FROM agents a
      LEFT JOIN employees e ON e.id = a.employee_id
      WHERE a.deleted_at IS NULL AND COALESCE(a.status, 'Active') = 'Active'
      ORDER BY a.name ASC
    `)
    const dealAgg = q.all(`
      SELECT agent_id, COUNT(*) AS deal_count,
             COALESCE(SUM(deal_value), 0) AS volume_cents,
             COALESCE(SUM(commission_amount), 0) AS gci_cents
      FROM jobs
      WHERE deleted_at IS NULL AND job_status NOT IN ('Cancelled')
      GROUP BY agent_id
    `)
    const viewAgg = q.all(`
      SELECT agent_id, COUNT(*) AS viewings_count
      FROM viewings
      WHERE deleted_at IS NULL AND status <> 'Cancelled'
      GROUP BY agent_id
    `)
    const forensicAgg = tableExists('shabib_forensic_reports')
      ? q.all(`
          SELECT staff_user_id, COUNT(*) AS visits_count
          FROM shabib_forensic_reports
          WHERE deleted_at IS NULL AND staff_user_id IS NOT NULL
          GROUP BY staff_user_id
        `)
      : []
    const taskAgg = q.all(`
      SELECT assignee_id,
             SUM(CASE WHEN status = 'Done' THEN 1 ELSE 0 END) AS done_tasks,
             SUM(CASE WHEN status <> 'Done' THEN 1 ELSE 0 END) AS open_tasks
      FROM tasks
      WHERE deleted_at IS NULL AND assignee_id IS NOT NULL
      GROUP BY assignee_id
    `)

    const dealMap = new Map(dealAgg.map(r => [Number(r.agent_id), r]))
    const viewMap = new Map(viewAgg.map(r => [Number(r.agent_id), Number(r.viewings_count || 0)]))
    const forensicMap = new Map(forensicAgg.map(r => [Number(r.staff_user_id), Number(r.visits_count || 0)]))
    const taskMap = new Map(taskAgg.map(r => [Number(r.assignee_id), r]))

    const leaderboard = agents
      .map(ag => {
        const d = dealMap.get(Number(ag.id))
        const targetAed = Math.max(1, fromCents(Number(ag.monthly_target ?? 6_000_000)))
        const gciAed = fromCents(Number(d?.gci_cents ?? 0))
        const volumeAed = fromCents(Number(d?.volume_cents ?? 0))
        const dealsCount = Number(d?.deal_count ?? 0)
        const viewings = (viewMap.get(Number(ag.id)) ?? 0) + (ag.user_id ? forensicMap.get(Number(ag.user_id)) ?? 0 : 0)
        const t = ag.user_id ? taskMap.get(Number(ag.user_id)) : null
        const targetPct = Math.min(200, Math.round((gciAed / targetAed) * 100))
        return {
          id: ag.id,
          agent_no: ag.agent_no,
          name: ag.name,
          division: ag.department_division || 'Sales',
          dld_broker_id: ag.dld_broker_id,
          deals_count: dealsCount,
          volume_aed: volumeAed,
          gci_aed: gciAed,
          monthly_target_aed: targetAed,
          target_pct: targetPct,
          viewings_and_visits: viewings,
          tasks_done: Number(t?.done_tasks ?? 0),
          tasks_open: Number(t?.open_tasks ?? 0),
        }
      })
      .sort((a, b) => b.gci_aed - a.gci_aed || b.volume_aed - a.volume_aed || b.viewings_and_visits - a.viewings_and_visits)

    // --- D. Unified Dubai Compliance & Expiry Radar ---
    const expiries: Array<{
      category: string
      title: string
      ref_no: string
      expiry_date: string
      days_left: number
      severity: 'EXPIRED' | 'CRITICAL' | 'WARNING' | 'UPCOMING'
      link: string
    }> = []

    const pushExpiry = (category: string, title: string, refNo: string, expiryDate: string | null | undefined, windowDays: number, link: string) => {
      const d = daysUntil(expiryDate, today)
      if (d === null || d > windowDays) return
      const severity = d < 0 ? 'EXPIRED' : d <= 15 ? 'CRITICAL' : d <= 45 ? 'WARNING' : 'UPCOMING'
      expiries.push({
        category,
        title,
        ref_no: refNo || '—',
        expiry_date: String(expiryDate).slice(0, 10),
        days_left: d,
        severity,
        link,
      })
    }

    for (const p of propRows) {
      if (p.permit_expiry) {
        pushExpiry('Trakheesi / ADM Permit', p.title, p.rera_permit_no || p.property_no, p.permit_expiry, 45, `/e/properties/${p.id}`)
      }
    }
    for (const ag of agents) {
      if (ag.dld_expiry) {
        pushExpiry('RERA Broker Card (BRN)', ag.name, ag.dld_broker_id || ag.agent_no, ag.dld_expiry, 60, `/e/agents/${ag.id}`)
      }
    }
    for (const m of q.all(`SELECT id, mandate_no, property_title, end_date FROM mandates WHERE deleted_at IS NULL AND status = 'Active' AND end_date IS NOT NULL`)) {
      pushExpiry('Form A Mandate', m.property_title || m.mandate_no, m.mandate_no, m.end_date, 45, `/e/mandates/${m.id}`)
    }
    for (const l of q.all(`SELECT id, lease_no, unit_title, end_date, ejari_no FROM leases WHERE deleted_at IS NULL AND status IN ('Active','Ejari Registered','Notice Served') AND end_date IS NOT NULL`)) {
      pushExpiry('Ejari Tenancy Lease', l.unit_title || l.lease_no, l.ejari_no || l.lease_no, l.end_date, 90, `/e/leases/${l.id}`)
    }
    for (const e of q.all(`SELECT id, emp_no, name, visa_expiry, eid_expiry FROM employees WHERE deleted_at IS NULL AND status = 'Active'`)) {
      if (e.visa_expiry) pushExpiry('Staff UAE Visa', e.name, e.emp_no, e.visa_expiry, 60, `/e/employees/${e.id}`)
      if (e.eid_expiry) pushExpiry('Staff Emirates ID', e.name, e.emp_no, e.eid_expiry, 60, `/e/employees/${e.id}`)
    }

    expiries.sort((a, b) => a.days_left - b.days_left)

    return {
      generated_at: nowIso(),
      summary: {
        active_listings: scoredListings.length,
        avg_quality_score: avgQuality,
        pf_enabled: scoredListings.filter(l => l.syndicate_pf).length,
        bayut_enabled: scoredListings.filter(l => l.syndicate_bayut).length,
        open_leads: slaLeads.length,
        sla_breached_count: breachedCount,
        sla_met_count: metCount,
        expiries_critical: expiries.filter(e => e.severity === 'EXPIRED' || e.severity === 'CRITICAL').length,
        expiries_total: expiries.length,
      },
      listings: scoredListings,
      sla_leads: slaLeads,
      leaderboard,
      expiries: expiries.slice(0, 60),
    }
  })

  /** 2. 1-Click Smart Buyer-to-Property Matcher */
  app.get('/api/agency-hub/match/:leadId', async (req) => {
    requireAgencyHubAccess(req)
    const leadId = idOf((req.params as any).leadId)
    const lead = q.get(`SELECT * FROM leads WHERE id = ? AND deleted_at IS NULL`, leadId)
    if (!lead) throw notFound('Lead not found')

    const budgetAed = fromCents(Number(lead.est_value ?? 0))
    const bedsWanted = Number(lead.bedrooms_wanted ?? 0)
    const targetArea = String(lead.destination || '').trim().toLowerCase()
    const isLease = /lease|rent/i.test(String(lead.interest || '') + ' ' + String(lead.department_division || ''))
    const isOffPlan = /off-plan|off plan/i.test(String(lead.interest || '') + ' ' + String(lead.department_division || ''))

    const props = q.all(`
      SELECT p.*, d.name AS developer_name, c.name AS community_name
      FROM properties p
      LEFT JOIN developers d ON d.id = p.developer_ref
      LEFT JOIN communities c ON c.id = p.community_ref
      WHERE p.deleted_at IS NULL AND COALESCE(p.active, 1) = 1
        AND p.status IN ('Available', 'Off-Plan', 'Under Offer')
      ORDER BY p.id DESC
      LIMIT 200
    `)

    const matches = props
      .map(p => {
        let score = 20
        const reasons: string[] = []
        const priceAed = isLease ? fromCents(Number(p.rent_annual ?? 0)) : fromCents(Number(p.price ?? 0))
        if (budgetAed > 0 && priceAed > 0) {
          const ratio = priceAed / budgetAed
          if (ratio >= 0.8 && ratio <= 1.15) {
            score += 35
            reasons.push('Inside target budget')
          } else if (ratio >= 0.65 && ratio <= 1.35) {
            score += 20
            reasons.push('Close to budget (±35%)')
          }
        } else if (priceAed > 0) {
          score += 12
        }
        const beds = Number(p.bedrooms ?? 0)
        if (bedsWanted > 0) {
          if (beds === bedsWanted) {
            score += 20
            reasons.push(`Exact ${beds} BR match`)
          } else if (Math.abs(beds - bedsWanted) === 1) {
            score += 10
            reasons.push(`Near ${beds} BR option`)
          }
        }
        const hay = `${p.title || ''} ${p.community_name || ''} ${p.sub_community || ''} ${p.address || ''}`.toLowerCase()
        if (targetArea && hay.includes(targetArea)) {
          score += 20
          reasons.push(`Located in ${p.community_name || lead.destination}`)
        }
        if (isOffPlan && p.is_off_plan) {
          score += 10
          reasons.push('Off-plan payment plan')
        }
        if (p.rera_permit_no) {
          score += 5
          reasons.push('Verified Trakheesi permit')
        }
        const finalScore = Math.min(100, score)
        const priceLabel = priceAed > 0 ? `AED ${Math.round(priceAed).toLocaleString('en-US')}${isLease ? '/yr' : ''}` : 'Price on request'
        const whatsappPitch = `Hello ${lead.contact_name || lead.company || 'Client'},\n\nI handpicked *${p.title}* (${p.community_name || p.emirate || 'Dubai'}) matching your requirement:\n• Price: ${priceLabel}\n• Size: ${Number(p.area_sqft || 0).toLocaleString('en-US')} sq ft · ${beds ? `${beds} BR` : 'Studio'}\n• ${p.is_off_plan ? `Handover: ${p.handover_quarter || p.completion_year || 'Scheduled'} · Plan: ${p.payment_plan || 'Flexible'}` : 'Status: Ready to move / view'}\n\nWould you like me to share the floor plan & arrange a private viewing today?\n— ${SWK_COMPANY_NAME} (RERA ORN ${SWK_RERA_ORN})`
        return {
          property_id: p.id,
          property_no: p.property_no,
          title: p.title,
          community: p.community_name || p.sub_community || p.emirate || 'Dubai',
          developer: p.developer_name || 'Direct',
          bedrooms: beds,
          area_sqft: Number(p.area_sqft ?? 0),
          price_aed: priceAed,
          is_off_plan: Boolean(p.is_off_plan),
          payment_plan: p.payment_plan || '',
          match_score: finalScore,
          reasons,
          whatsapp_pitch: whatsappPitch,
        }
      })
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, 8)

    assertZeroShabibPublicPayload(matches.map(m => m.whatsapp_pitch), 'Smart Matcher WhatsApp Pitch')
    return {
      lead: {
        id: lead.id,
        lead_no: lead.lead_no,
        client_name: lead.contact_name || lead.company,
        budget_aed: budgetAed,
        bedrooms_wanted: bedsWanted,
        target_area: lead.destination || '',
        interest: lead.interest || lead.department_division || '',
      },
      matches,
    }
  })

  /** Helper for 3-project comparison computation */
  const computeComparison = (input: {
    property_ids: number[]
    down_payment_pct: number
    interest_rate_pct: number
    loan_years: number
    service_charge_psf: number
  }) => {
    const ids = [...new Set(input.property_ids)].slice(0, 3)
    if (!ids.length) throw bad('Select at least one project to compare')
    const placeholders = ids.map(() => '?').join(',')
    const rows = q.all(
      `SELECT p.*, d.name AS developer_name, c.name AS community_name, c.gross_yield_pct
       FROM properties p
       LEFT JOIN developers d ON d.id = p.developer_ref
       LEFT JOIN communities c ON c.id = p.community_ref
       WHERE p.deleted_at IS NULL AND p.id IN (${placeholders})`,
      ...ids,
    )
    if (!rows.length) throw notFound('Selected projects not found')

    return rows.map(p => {
      const priceAed = fromCents(Number(p.price ?? 0))
      const areaSqft = Math.max(1, Number(p.area_sqft ?? 0))
      const psfAed = priceAed > 0 && Number(p.area_sqft ?? 0) > 0 ? Math.round(priceAed / areaSqft) : 0
      const emirate = String(p.emirate || 'Dubai')
      const isAbuDhabi = /abu dhabi/i.test(emirate)
      const govTransferPct = isAbuDhabi ? 2 : 4
      const trusteeFeeAed = isAbuDhabi ? 1000 : priceAed >= 500_000 ? 4200 : 2100
      const govFeeAed = Math.round((priceAed * govTransferPct) / 100 + trusteeFeeAed)

      const estYieldPct = Number(p.roi_percent || p.gross_yield_pct || 7.2)
      const storedRent = fromCents(Number(p.rent_annual ?? 0))
      const estAnnualRentAed = storedRent > 0 ? storedRent : Math.round((priceAed * estYieldPct) / 100)
      const annualServiceChargeAed = Math.round(areaSqft * input.service_charge_psf)
      const netAnnualIncomeAed = Math.max(0, estAnnualRentAed - annualServiceChargeAed)
      const grossRoiPct = priceAed > 0 ? Number(((estAnnualRentAed / priceAed) * 100).toFixed(2)) : 0
      const netRoiPct = priceAed > 0 ? Number(((netAnnualIncomeAed / priceAed) * 100).toFixed(2)) : 0

      // Monthly Mortgage Payment (Standard UAE Amortization)
      const downPaymentAed = Math.round((priceAed * input.down_payment_pct) / 100)
      const loanAed = Math.max(0, priceAed - downPaymentAed)
      const r = input.interest_rate_pct / 100 / 12
      const n = input.loan_years * 12
      const monthlyMortgageAed =
        loanAed > 0 && r > 0 && n > 0
          ? Math.round((loanAed * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1))
          : 0

      const goldenVisaEligible = priceAed >= 2_000_000

      return {
        id: p.id,
        property_no: p.property_no,
        title: p.title,
        developer: p.developer_name || 'Direct Developer',
        community: p.community_name || p.sub_community || emirate,
        emirate,
        property_type: p.property_type || 'Apartment',
        bedrooms: Number(p.bedrooms ?? 0),
        area_sqft: Number(p.area_sqft ?? 0),
        is_off_plan: Boolean(p.is_off_plan),
        handover: p.handover_quarter || (p.completion_year ? String(p.completion_year) : 'Ready'),
        payment_plan: p.payment_plan_summary || p.payment_plan || 'Cash / Mortgage',
        price_aed: priceAed,
        psf_aed: psfAed,
        gov_fee_label: isAbuDhabi ? '2% ADM + Fee' : '4% DLD + Trustee',
        gov_fee_aed: govFeeAed,
        total_cash_required_aed: downPaymentAed + govFeeAed,
        est_annual_rent_aed: estAnnualRentAed,
        annual_service_charge_aed: annualServiceChargeAed,
        net_annual_income_aed: netAnnualIncomeAed,
        gross_roi_pct: grossRoiPct,
        net_roi_pct: netRoiPct,
        monthly_mortgage_aed: monthlyMortgageAed,
        five_year_net_yield_aed: Math.round(netAnnualIncomeAed * 5),
        golden_visa_eligible: goldenVisaEligible,
        rera_permit_no: p.rera_permit_no || 'Pending',
      }
    })
  }

  const compareSchema = z.object({
    property_ids: z.array(z.number().int().positive()).min(1).max(3),
    down_payment_pct: z.number().min(10).max(100).default(20),
    interest_rate_pct: z.number().min(0).max(15).default(4.25),
    loan_years: z.number().int().min(5).max(25).default(25),
    service_charge_psf: z.number().min(0).max(100).default(16),
    format: z.enum(['pdf', 'docx', 'jpeg']).optional(),
  })

  /** 3. 3-Project Investor ROI / DLD / Golden Visa Comparison */
  app.post('/api/agency-hub/compare', async (req) => {
    requireAgencyHubAccess(req)
    const parsed = compareSchema.parse(req.body ?? {})
    const items = computeComparison(parsed)
    return {
      assumptions: {
        down_payment_pct: parsed.down_payment_pct,
        interest_rate_pct: parsed.interest_rate_pct,
        loan_years: parsed.loan_years,
        service_charge_psf: parsed.service_charge_psf,
      },
      items,
    }
  })

  /** 3b. Export Investor Comparison Sheet as Branded PDF, Word .docx, or JPEG (Zero-Shabib Locked) */
  app.post('/api/agency-hub/compare/export', async (req, reply) => {
    requireAgencyHubAccess(req)
    const parsed = compareSchema.parse(req.body ?? {})
    const fmt: ForensicExportFormat = parsed.format ?? 'pdf'
    const items = computeComparison(parsed)

    const aed = (n: number) => `AED ${Math.round(n).toLocaleString('en-US')}`
    const doc: StructuredForensicDoc = {
      eyebrow: 'SWK PROPERTIES · UAE INVESTOR COMPARISON BRIEF',
      refNo: `CMP-${todayStr().replace(/-/g, '')}`,
      title: `Side-by-Side UAE Property ROI & Golden Visa Comparison`,
      subtitle: `${items.map(i => i.title).join(' vs ')}`,
      badges: [
        `${items.length} Projects Compared`,
        `${parsed.down_payment_pct}% Down · ${parsed.interest_rate_pct}% Rate · ${parsed.loan_years}Y`,
        `RERA ORN ${SWK_RERA_ORN}`,
      ],
      sections: [
        {
          title: '1. Core Property & Financial Matrix',
          table: {
            headers: ['Metric', ...items.map(i => i.title)],
            rows: [
              ['Developer', ...items.map(i => i.developer)],
              ['Community & Emirate', ...items.map(i => `${i.community} (${i.emirate})`)],
              ['Type & Bedrooms', ...items.map(i => `${i.property_type} · ${i.bedrooms || 'Studio'} BR`)],
              ['Area (sq ft)', ...items.map(i => i.area_sqft ? `${i.area_sqft.toLocaleString('en-US')} sq ft` : '—')],
              ['Purchase Price', ...items.map(i => aed(i.price_aed))],
              ['Price / sq ft', ...items.map(i => i.psf_aed ? `AED ${i.psf_aed.toLocaleString('en-US')}/sf` : '—')],
              ['Gov Transfer Fee', ...items.map(i => `${aed(i.gov_fee_aed)} (${i.gov_fee_label})`)],
              ['Est. Upfront Cash (Down + Fee)', ...items.map(i => aed(i.total_cash_required_aed))],
              ['Handover & Plan', ...items.map(i => `${i.handover} · ${i.payment_plan}`)],
            ],
          },
        },
        {
          title: '2. Rental Yield, Mortgage & 10-Year UAE Golden Visa Assessment',
          table: {
            headers: ['Investor KPI', ...items.map(i => i.title)],
            rows: [
              ['Estimated Annual Rent', ...items.map(i => aed(i.est_annual_rent_aed))],
              ['Est. Annual Service Charge', ...items.map(i => aed(i.annual_service_charge_aed))],
              ['Net Annual Rental Income', ...items.map(i => aed(i.net_annual_income_aed))],
              ['Gross / Net ROI %', ...items.map(i => `${i.gross_roi_pct}% Gross / ${i.net_roi_pct}% Net`)],
              ['Est. Monthly Mortgage', ...items.map(i => aed(i.monthly_mortgage_aed))],
              ['5-Year Net Rental Yield', ...items.map(i => aed(i.five_year_net_yield_aed))],
              ['10-Year UAE Golden Visa (≥2M)', ...items.map(i => (i.golden_visa_eligible ? 'ELIGIBLE (AED 2M+)' : 'Below AED 2M Threshold'))],
            ],
          },
        },
        {
          title: '3. Advisory Disclaimer',
          note: `Prepared by ${SWK_COMPANY_NAME} (RERA ORN ${SWK_RERA_ORN}, ${SWK_COMPANY_PHONE}, ${SWK_COMPANY_EMAIL}). Projections are indicative market estimates based on current Dubai Land Department / Abu Dhabi DMT fee schedules and prevailing UAE mortgage rates.`,
        },
      ],
    }

    assertZeroShabibPublicPayload(doc, 'Investor Comparison Export')
    const out = await exportStructuredDossier(doc, fmt)
    reply
      .header('content-type', out.mime)
      .header('content-disposition', `attachment; filename="SWK-Investor-Comparison-${todayStr()}.${out.ext}"`)
    return reply.send(out.buffer)
  })

  /** 4. Property Finder XML Syndication Feed (Zero-Shabib Guarded) */
  app.get('/api/agency-hub/feeds/propertyfinder.xml', async (req, reply) => {
    requireAgencyHubAccess(req)
    const rows = q.all(`
      SELECT p.*, d.name AS developer_name, c.name AS community_name
      FROM properties p
      LEFT JOIN developers d ON d.id = p.developer_ref
      LEFT JOIN communities c ON c.id = p.community_ref
      WHERE p.deleted_at IS NULL AND COALESCE(p.active, 1) = 1
        AND COALESCE(p.syndicate_pf, 1) = 1
        AND p.status IN ('Available', 'Off-Plan')
      ORDER BY p.id DESC
      LIMIT 250
    `)
    const items = rows.map(p => {
      const isLease = /leasing|rent/i.test(String(p.department_division || '')) && !fromCents(Number(p.price ?? 0))
      const priceAed = Math.round(isLease ? fromCents(Number(p.rent_annual ?? 0)) : fromCents(Number(p.price ?? 0)))
      const offeringType = isLease ? 'RR' : 'RS'
      return `  <property last_update="${xmlEsc(p.updated_at || nowIso())}">
    <reference_number>${xmlEsc(p.property_no || `SWK-${p.id}`)}</reference_number>
    <permit_number>${xmlEsc(p.rera_permit_no || '')}</permit_number>
    <offering_type>${offeringType}</offering_type>
    <property_type>${xmlEsc(p.property_type || 'AP')}</property_type>
    <price_on_application>${priceAed > 0 ? 'No' : 'Yes'}</price_on_application>
    <price>${priceAed}</price>
    <city>${xmlEsc(p.emirate || 'Dubai')}</city>
    <community>${xmlEsc(p.community_name || p.sub_community || 'Dubai')}</community>
    <sub_community>${xmlEsc(p.sub_community || '')}</sub_community>
    <property_name>${xmlEsc(p.building_name || p.project_name || p.title)}</property_name>
    <title_en>${xmlEsc(p.title)}</title_en>
    <description_en>${xmlEsc(p.description || `${p.title} presented by ${SWK_COMPANY_NAME}.`)}</description_en>
    <size>${Math.round(Number(p.area_sqft ?? 0))}</size>
    <bedroom>${Math.round(Number(p.bedrooms ?? 0))}</bedroom>
    <bathroom>${Math.round(Number(p.bathrooms ?? 0))}</bathroom>
    <completion_status>${p.is_off_plan ? 'off_plan' : 'completed'}</completion_status>
    <agent>
      <name>${xmlEsc(SWK_COMPANY_NAME)} Advisory Desk</name>
      <email>${xmlEsc(SWK_COMPANY_EMAIL)}</email>
      <phone>${xmlEsc(SWK_COMPANY_PHONE)}</phone>
    </agent>
  </property>`
    })

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<list last_update="${xmlEsc(nowIso())}" listing_count="${items.length}">\n${items.join('\n')}\n</list>\n`
    assertZeroShabibPublicPayload(xml, 'Property Finder XML Feed')
    reply
      .header('content-type', 'application/xml; charset=utf-8')
      .header('content-disposition', 'inline; filename="swk-propertyfinder-feed.xml"')
    return reply.send(xml)
  })

  /** 5. Bayut / Dubizzle XML Syndication Feed (Zero-Shabib Guarded) */
  app.get('/api/agency-hub/feeds/bayut.xml', async (req, reply) => {
    requireAgencyHubAccess(req)
    const rows = q.all(`
      SELECT p.*, d.name AS developer_name, c.name AS community_name
      FROM properties p
      LEFT JOIN developers d ON d.id = p.developer_ref
      LEFT JOIN communities c ON c.id = p.community_ref
      WHERE p.deleted_at IS NULL AND COALESCE(p.active, 1) = 1
        AND (COALESCE(p.syndicate_bayut, 1) = 1 OR COALESCE(p.syndicate_dubizzle, 1) = 1)
        AND p.status IN ('Available', 'Off-Plan')
      ORDER BY p.id DESC
      LIMIT 250
    `)
    const items = rows.map(p => {
      const isLease = /leasing|rent/i.test(String(p.department_division || '')) && !fromCents(Number(p.price ?? 0))
      const priceAed = Math.round(isLease ? fromCents(Number(p.rent_annual ?? 0)) : fromCents(Number(p.price ?? 0)))
      return `  <Property>
    <Property_Ref_No>${xmlEsc(p.property_no || `SWK-${p.id}`)}</Property_Ref_No>
    <Permit_Number>${xmlEsc(p.rera_permit_no || '')}</Permit_Number>
    <Property_Status>live</Property_Status>
    <Property_purpose>${isLease ? 'Rent' : 'Buy'}</Property_purpose>
    <Property_Type>${xmlEsc(p.property_type || 'Apartment')}</Property_Type>
    <Property_Size>${Math.round(Number(p.area_sqft ?? 0))}</Property_Size>
    <Property_Size_Unit>SQFT</Property_Size_Unit>
    <Bedrooms>${Math.round(Number(p.bedrooms ?? 0))}</Bedrooms>
    <Bathrooms>${Math.round(Number(p.bathrooms ?? 0))}</Bathrooms>
    <Price>${priceAed}</Price>
    <City>${xmlEsc(p.emirate || 'Dubai')}</City>
    <Locality>${xmlEsc(p.community_name || p.sub_community || 'Dubai')}</Locality>
    <Sub_Locality>${xmlEsc(p.sub_community || p.building_name || '')}</Sub_Locality>
    <Property_Title>${xmlEsc(p.title)}</Property_Title>
    <Property_Description>${xmlEsc(p.description || `${p.title} presented by ${SWK_COMPANY_NAME}.`)}</Property_Description>
    <Off_plan>${p.is_off_plan ? 'Yes' : 'No'}</Off_plan>
    <Listing_Agent>${xmlEsc(SWK_COMPANY_NAME)} Advisory Desk</Listing_Agent>
    <Listing_Agent_Phone>${xmlEsc(SWK_COMPANY_PHONE)}</Listing_Agent_Phone>
    <Listing_Agent_Email>${xmlEsc(SWK_COMPANY_EMAIL)}</Listing_Agent_Email>
    <Portals>
      ${p.syndicate_bayut ? '<Portal>Bayut</Portal>' : ''}
      ${p.syndicate_dubizzle ? '<Portal>Dubizzle</Portal>' : ''}
    </Portals>
  </Property>`
    })

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Properties>\n${items.join('\n')}\n</Properties>\n`
    assertZeroShabibPublicPayload(xml, 'Bayut / Dubizzle XML Feed')
    reply
      .header('content-type', 'application/xml; charset=utf-8')
      .header('content-disposition', 'inline; filename="swk-bayut-dubizzle-feed.xml"')
    return reply.send(xml)
  })
}
