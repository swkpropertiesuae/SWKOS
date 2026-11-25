import crypto from 'node:crypto'
import { loadUser } from '../auth'
import { liveBus, liveScope } from '../notify'
import { calendarEvents } from '../calendar'
import { config } from '../config'
import type { FastifyInstance } from 'fastify'
import { q } from '../db'
import { ENTITIES } from '../../shared/entities'
import { can,getDef,listRecords,labelsFor } from '../engine'
import { addDays,bad,daysBetween,fromCents,monthStart,r2,todayStr,toCsv,nowIso } from '../util'
import { idOf,need } from './helpers'
import { reportCatalog,runReport,REPORTS } from '../reports'
import { getSetting } from '../settings'
import {
  canAccessCrmVault,
  canRequestCompanySeal,
  canViewEmployeeRecords,
  isAdminSwkUser,
  isOwnerSwkUser,
  isRestrictedStaffUser,
  RESTRICTED_HR_PII_ENTITIES,
  RESTRICTED_STAFF_ALLOWED_ENTITIES,
} from '../../shared/swk-staff-access'
import { z } from 'zod'

const SIGN = `CASE WHEN i.doc_type = 'Credit Note' THEN -1 ELSE 1 END`
const SALES = `i.status IN ('Posted','Partially paid','Paid') AND i.doc_type IN ('Tax Invoice','Debit Note','Credit Note') AND i.deleted_at IS NULL`
const m = fromCents

export default async function (app: FastifyInstance) {
  // ------------------------------------------------------------------ dashboard
  // Seven-day activity counts and the latest changes the person is allowed to see, for the live dashboard panels.
  app.get('/api/dashboard/pulse', async (req) => {
    need(req, 'dashboard', 'view')
    const days = Array.from({ length: 7 }, (_, i) => addDays(todayStr(), i - 6))
    const series = (sql: string) => { const m = new Map(q.all<{ d: string; n: number }>(sql, days[0], addDays(days[6], 1)).map(r => [String(r.d), Number(r.n)])); return days.map(d => ({ day: d, n: m.get(d) ?? 0 })) }
    const mods = (k: string) => { try { return can(req.user, ENTITIES[k]?.module ?? 'admin', 'view') } catch { return false } }
    const feed = q.all(`SELECT at, user_name, entity, record_id, record_label, action FROM audit_log WHERE entity NOT IN ('users','roles','audit_events','api_keys','sessions') ORDER BY id DESC LIMIT 60`)
      .filter(r => mods(r.entity)).slice(0, 12).map(r => ({ at: r.at, who: r.user_name || 'System', action: r.action, entity: ENTITIES[r.entity]?.label ?? r.entity, label: r.record_label || '', link: `/e/${r.entity}/${r.record_id}` }))
    return {
      leads: mods('leads') ? series(`SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS n FROM leads WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ? GROUP BY 1`) : null,
      viewings: mods('viewings') ? series(`SELECT substr(scheduled_at, 1, 10) AS d, COUNT(*) AS n FROM viewings WHERE deleted_at IS NULL AND scheduled_at >= ? AND scheduled_at < ? GROUP BY 1`) : null,
      calls: mods('activities') ? series(`SELECT substr(start_at, 1, 10) AS d, COUNT(*) AS n FROM activities WHERE deleted_at IS NULL AND type = 'Call' AND start_at >= ? AND start_at < ? GROUP BY 1`) : null,
      feed,
    }
  })
  app.get('/api/dashboard', async (req) => {
    const user = req.user!
    const today = todayStr(), mStart = monthStart(), n = (sql: string, ...a: any[]) => q.val<number>(sql, ...a) ?? 0

    if (user.party_id) {
      const pid = user.party_id
      return {
        portal: true,
        kpis: {
          open_jobs: n(`SELECT COUNT(*) FROM jobs WHERE client_id = ? AND job_status NOT IN ('Completed','Cancelled') AND deleted_at IS NULL`, pid),
          delivered: n(`SELECT COUNT(*) FROM jobs WHERE client_id = ? AND job_status = 'Completed' AND deleted_at IS NULL`, pid),
          outstanding: m(n(`SELECT COALESCE(SUM(balance * ex_rate),0) FROM invoices WHERE party_id = ? AND status IN ('Posted','Partially paid') AND doc_type IN ('Tax Invoice','Debit Note') AND deleted_at IS NULL`, pid)),
        },
        recent_jobs: q.all(`SELECT j.id, j.job_no, j.deal_name, j.deal_type, j.job_status, j.operational_status, j.deal_date, p.title property FROM jobs j LEFT JOIN properties p ON p.id = j.property_id WHERE j.client_id = ? AND j.deleted_at IS NULL ORDER BY j.id DESC LIMIT 10`, pid),
      }
    }

    const can_ = (mod: string) => can(user, mod, 'view')
    const roleLower = String(user.role_name || '').trim().toLowerCase()
    const roleProfile: 'owner' | 'admin' | 'manager' | 'hr' | 'office_admin' | 'agent' =
      isOwnerSwkUser(user)
        ? 'owner'
        : isAdminSwkUser(user)
          ? 'admin'
          : roleLower === 'manager'
            ? 'manager'
            : roleLower === 'hr'
              ? 'hr'
              : roleLower === 'office admin'
                ? 'office_admin'
                : 'agent'
    const data: any = {
      portal: false,
      role_profile: roleProfile,
      role_label: user.role_name || 'Staff',
      kpis: {},
      charts: {},
      lists: {},
      alerts: [],
      role_data: {},
    }
    const k = data.kpis

    if (can_('sales')) {
      k.open_jobs = n(`SELECT COUNT(*) FROM jobs WHERE job_status NOT IN ('Completed','Cancelled') AND deleted_at IS NULL`)
      k.in_transit = n(`SELECT COUNT(*) FROM jobs WHERE operational_status IN ('Viewing','Offer','Negotiation','Contract','DLD Process','Handover') AND job_status NOT IN ('Completed','Cancelled') AND deleted_at IS NULL`)
      k.jobs_month = n(`SELECT COUNT(*) FROM jobs WHERE deal_date BETWEEN ? AND ? AND deleted_at IS NULL AND job_status <> 'Cancelled'`, mStart, today)
      if (can_('finance')) {
        k.profit_month = m(n(`SELECT COALESCE(SUM(profit),0) FROM jobs WHERE deal_date BETWEEN ? AND ? AND deleted_at IS NULL AND job_status <> 'Cancelled'`, mStart, today))
        k.unbilled = m(n(`SELECT COALESCE(SUM(c.base_amount),0) FROM job_charges c JOIN jobs j ON j.id = c.job_id WHERE c.kind='Revenue' AND c.status='Unbilled' AND c.deleted_at IS NULL AND j.deleted_at IS NULL AND j.job_status <> 'Cancelled'`))
      }
      data.lists.recent_jobs = q.all(`SELECT j.id, j.job_no, j.deal_name, j.deal_type, pr.name client, p.title property, j.job_status, j.operational_status, j.deal_date FROM jobs j LEFT JOIN parties pr ON pr.id = j.client_id LEFT JOIN properties p ON p.id = j.property_id WHERE j.deleted_at IS NULL ORDER BY j.id DESC LIMIT 12`)
      data.lists.target_closes = q.all(`SELECT j.id, j.job_no, pr.name client, p.title property, j.deal_type, j.target_close FROM jobs j LEFT JOIN parties pr ON pr.id = j.client_id LEFT JOIN properties p ON p.id = j.property_id WHERE j.deleted_at IS NULL AND j.actual_close IS NULL AND j.job_status NOT IN ('Completed','Cancelled') AND j.target_close IS NOT NULL AND j.target_close BETWEEN ? AND ? ORDER BY j.target_close LIMIT 10`, today, addDays(today, 10))
      data.charts.jobs_by_mode = q.all(`SELECT COALESCE(deal_type,'Other') name, COUNT(*) value FROM jobs WHERE deleted_at IS NULL AND job_status NOT IN ('Completed','Cancelled') GROUP BY deal_type`)
      data.charts.jobs_by_status = q.all(`SELECT job_status name, COUNT(*) value FROM jobs WHERE deleted_at IS NULL GROUP BY job_status`)
      if (can_('finance')) {
        data.charts.top_customers = q.all(`SELECT pr.name, SUM(j.total_revenue) v FROM jobs j JOIN parties pr ON pr.id = j.client_id WHERE j.deleted_at IS NULL AND j.job_status <> 'Cancelled' AND j.deal_date BETWEEN ? AND ? GROUP BY j.client_id, pr.name ORDER BY v DESC LIMIT 6`, addDays(today, -90), today).map(r => ({ name: r.name, value: m(r.v) }))
        data.charts.revenue_trend = (() => {
          const rows = q.all(`SELECT substr(deal_date,1,7) AS month, SUM(total_revenue) rev, SUM(total_cost) cost, SUM(profit) profit FROM jobs WHERE deleted_at IS NULL AND job_status <> 'Cancelled' AND deal_date BETWEEN ? AND ? GROUP BY month ORDER BY month`, addDays(monthStart(), -150), today)
          return rows.map(r => ({ month: r.month, revenue: m(r.rev), cost: m(r.cost), profit: m(r.profit) }))
        })()
        // "Sales (Branch)": invoiced vs unbilled work per branch for the current month
        const inv = q.all(`SELECT COALESCE(b.name,'Unassigned') branch, SUM(${SIGN} * i.subtotal * i.ex_rate) v FROM invoices i LEFT JOIN branches b ON b.id = i.branch_id WHERE ${SALES} AND i.invoice_date BETWEEN ? AND ? GROUP BY i.branch_id, b.name`, mStart, today)
        const unb = q.all(`SELECT COALESCE(b.name,'Unassigned') branch, SUM(c.base_amount) v FROM job_charges c JOIN jobs j ON j.id = c.job_id LEFT JOIN branches b ON b.id = j.branch_id WHERE c.kind='Revenue' AND c.status='Unbilled' AND c.deleted_at IS NULL AND j.deleted_at IS NULL AND j.job_status <> 'CANCELLED' GROUP BY j.branch_id, b.name`)
        const names = [...new Set([...inv.map(x => x.branch), ...unb.map(x => x.branch)])]
        data.charts.sales_branch = names.map(name => ({ branch: name, invoiced: m(Math.round(inv.find(x => x.branch === name)?.v ?? 0)), unbilled: m(Math.round(unb.find(x => x.branch === name)?.v ?? 0)) }))
      }
    }
    if (can_('finance')) {
      k.revenue_month = m(Math.round(n(`SELECT COALESCE(SUM(${SIGN} * i.subtotal * i.ex_rate),0) FROM invoices i WHERE ${SALES} AND i.invoice_date BETWEEN ? AND ?`, mStart, today)))
      k.ar_outstanding = m(Math.round(n(`SELECT COALESCE(SUM(CASE WHEN doc_type='Credit Note' THEN -(total - paid_amount) ELSE balance END * ex_rate),0) FROM invoices WHERE status IN ('Posted','Partially paid','Paid') AND doc_type IN ('Tax Invoice','Debit Note','Credit Note') AND deleted_at IS NULL AND ((doc_type <> 'Credit Note' AND balance > 0) OR (doc_type = 'Credit Note' AND total > paid_amount))`)))
      k.ar_overdue = m(Math.round(n(`SELECT COALESCE(SUM(balance * ex_rate),0) FROM invoices WHERE status IN ('Posted','Partially paid') AND doc_type IN ('Tax Invoice','Debit Note') AND balance > 0 AND due_date < ? AND deleted_at IS NULL`, today)))
      k.ap_outstanding = m(Math.round(n(`SELECT COALESCE(SUM(balance * ex_rate),0) FROM bills WHERE status IN ('Posted','Partially paid') AND balance > 0 AND deleted_at IS NULL`)))
      k.cash = m(n(`SELECT COALESCE(SUM(l.debit - l.credit),0) FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id WHERE l.deleted_at IS NULL AND e.deleted_at IS NULL AND l.account_id IN (SELECT gl_account_id FROM bank_accounts WHERE deleted_at IS NULL AND active = 1)`))
      const ar = runReport('ar_aging', {})
      data.charts.ar_aging = [{ name: 'Not due', value: ar.totals?.current ?? 0 }, { name: '1–30', value: ar.totals?.d30 ?? 0 }, { name: '31–60', value: ar.totals?.d60 ?? 0 }, { name: '61–90', value: ar.totals?.d90 ?? 0 }, { name: '90+', value: ar.totals?.d90p ?? 0 }]
    }
    if (can_('crm')) {
      k.leads_new = n(`SELECT COUNT(*) FROM leads WHERE status = 'New' AND deleted_at IS NULL`)
      k.pipeline = m(n(`SELECT COALESCE(SUM(value),0) FROM opportunities WHERE stage NOT IN ('Won','Lost') AND deleted_at IS NULL`))
      data.lists.recent_calls = q.all(`SELECT a.id, a.subject, a.start_at, a.direction, a.outcome, a.contact_name, a.phone, pr.name company, u.name owner FROM activities a LEFT JOIN parties pr ON pr.id = a.party_id LEFT JOIN users u ON u.id = a.owner_id WHERE a.type = 'Call' AND a.deleted_at IS NULL ORDER BY a.start_at DESC LIMIT 12`)
    }
    if (can_('sales')) k.quotes_open = n(`SELECT COUNT(*) FROM quotations WHERE status IN ('Draft','Pending approval','Approved','Sent') AND deleted_at IS NULL`)

    // -------- §11 CEO desk: leads, viewings, offers, pipeline --------
    if (can_('crm')) {
      k.leads_today = n(`SELECT COUNT(*) FROM leads WHERE date(created_at) = ? AND deleted_at IS NULL`, today)
      k.leads_qualified = n(`SELECT COUNT(*) FROM leads WHERE status = 'Qualified' AND deleted_at IS NULL`)
      data.lists.lead_queue = q.all(`SELECT id, company, contact_name, source, status, est_value, phone FROM leads WHERE deleted_at IS NULL AND status NOT IN ('Converted', 'Lost') ORDER BY id DESC LIMIT 8`)
    }
    if (can_('mandates')) {
      k.viewings_week = n(`SELECT COUNT(*) FROM viewings WHERE status IN ('Scheduled','Confirmed') AND date(scheduled_at) BETWEEN ? AND ? AND deleted_at IS NULL`, today, addDays(today, 7))
      k.viewings_missed = n(`SELECT COUNT(*) FROM viewings WHERE status = 'No-Show' AND date(scheduled_at) BETWEEN ? AND ? AND deleted_at IS NULL`, addDays(today, -30), today)
      k.viewings_completed = n(`SELECT COUNT(*) FROM viewings WHERE status = 'Completed' AND date(scheduled_at) >= ? AND deleted_at IS NULL`, mStart)
      k.offers_pending = n(`SELECT COUNT(*) FROM offers WHERE status IN ('Submitted','Under Review','Negotiating','Countered') AND deleted_at IS NULL`)
      data.lists.upcoming_viewings = q.all(`SELECT v.id, v.viewing_no, v.scheduled_at, v.status, COALESCE(v.property_title, p.title) property_title, v.follow_up_required, lm.company contact, ag.name agent FROM viewings v LEFT JOIN leads lm ON lm.id = v.lead_id LEFT JOIN agents ag ON ag.id = v.agent_id LEFT JOIN properties p ON p.id = v.property_id WHERE v.deleted_at IS NULL AND v.status IN ('Scheduled','Confirmed') AND date(v.scheduled_at) BETWEEN ? AND ? ORDER BY v.scheduled_at LIMIT 8`, today, addDays(today, 7))
      data.lists.offers_pipeline = q.all(`SELECT o.id, o.offer_no, COALESCE(o.property_title, p.title) property_title, o.offer_type, o.status, o.offer_price, o.offer_date, pr.name buyer, ag.name agent FROM offers o LEFT JOIN parties pr ON pr.id = o.buyer_id LEFT JOIN agents ag ON ag.id = o.listing_agent_id LEFT JOIN properties p ON p.id = o.property_id WHERE o.deleted_at IS NULL AND o.status IN ('Submitted','Under Review','Negotiating','Countered') ORDER BY o.offer_date LIMIT 8`)
      data.charts.viewings_outcome = q.all(`SELECT status name, COUNT(*) value FROM viewings WHERE deleted_at IS NULL AND date(scheduled_at) BETWEEN ? AND ? GROUP BY status`, addDays(today, -30), addDays(today, 7))
      k.mandates_active = n(`SELECT COUNT(*) FROM mandates WHERE status = 'Active' AND deleted_at IS NULL`)
      k.mandates_expiring = n(`SELECT COUNT(*) FROM mandates WHERE status = 'Active' AND end_date BETWEEN ? AND ? AND deleted_at IS NULL`, today, addDays(today, 14))
      k.stale_listings = n(`SELECT COUNT(*) FROM mandates WHERE status = 'Active' AND deleted_at IS NULL AND (CASE WHEN last_activity IS NULL THEN start_date ELSE last_activity END) < ?`, addDays(today, -21))
    }
    if (can_('properties')) {
      k.properties_available = n(`SELECT COUNT(*) FROM properties WHERE status = 'Available' AND deleted_at IS NULL`)
      k.properties_reserved = n(`SELECT COUNT(*) FROM properties WHERE status IN ('Reserved','Under Offer') AND deleted_at IS NULL`)
      data.charts.properties_status = q.all(`SELECT status name, COUNT(*) value FROM properties WHERE deleted_at IS NULL GROUP BY status`)
    }
    if (can_('sales')) {
      // Deal pipeline funnel by operational stage, in blueprint order
      const stageRows = q.all(`SELECT operational_status stage, COUNT(*) count, COALESCE(SUM(deal_value),0) value FROM jobs WHERE deleted_at IS NULL AND job_status NOT IN ('Cancelled') AND operational_status IS NOT NULL AND operational_status <> '' GROUP BY operational_status`)
      data.charts.pipeline_funnel = ['Inquiry', 'Viewing', 'Offer', 'Negotiation', 'Contract', 'DLD Process', 'Handover', 'Closed'].map(s => {
        const r: any = stageRows.find(x => (x.stage ?? '') === s) ?? {}
        return { stage: s, count: r.count ?? 0, value: m(r.value ?? 0) }
      })
      k.pipeline_value = m(data.charts.pipeline_funnel.filter((s: any) => s.stage !== 'Closed').reduce((n: number, s: any) => n + s.value, 0))
    }
    if (can_('leases')) {
      k.renewals_due = n(`SELECT COUNT(*) FROM leases WHERE deleted_at IS NULL AND status IN ('Active','Ejari Registered','Notice Served','Expiring') AND end_date BETWEEN ? AND ?`, today, addDays(today, 90))
      k.vacant_units = n(`SELECT COUNT(*) FROM units u WHERE u.deleted_at IS NULL AND u.active = 1 AND NOT EXISTS (SELECT 1 FROM leases l WHERE l.unit_id = u.id AND l.deleted_at IS NULL AND l.status IN ('Active','Ejari Registered'))`)
      k.arrears_aed = m(n(`SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount,0)),0) FROM rent_schedules WHERE deleted_at IS NULL AND status = 'Overdue'`))
      k.arrears_count = n(`SELECT COUNT(*) FROM rent_schedules WHERE deleted_at IS NULL AND status = 'Overdue'`)
      k.maintenance_open = n(`SELECT COUNT(*) FROM maintenance WHERE deleted_at IS NULL AND status NOT IN ('Completed','Cancelled')`)
      k.maintenance_exceptions = n(`SELECT COUNT(*) FROM maintenance WHERE deleted_at IS NULL AND status NOT IN ('Completed','Cancelled') AND priority IN ('Urgent','Emergency')`)
      data.lists.renewals = q.all(`SELECT l.id, l.lease_no, l.unit_title, pr.name tenant, l.annual_rent, l.end_date, l.status FROM leases l LEFT JOIN parties pr ON pr.id = l.tenant_id WHERE l.deleted_at IS NULL AND l.status IN ('Active','Ejari Registered','Notice Served','Expiring') AND l.end_date BETWEEN ? AND ? ORDER BY l.end_date LIMIT 8`, today, addDays(today, 90))
    }
    if (can_('finance')) {
      k.received_month = m(n(`SELECT COALESCE(SUM(amount * ex_rate),0) FROM receipts WHERE status = 'Posted' AND receipt_date BETWEEN ? AND ? AND deleted_at IS NULL`, mStart, today))
      k.commission_expected = m(n(`SELECT COALESCE(SUM(c.base_amount),0) FROM job_charges c JOIN jobs j ON j.id = c.job_id WHERE c.kind='Revenue' AND c.status='Unbilled' AND c.deleted_at IS NULL AND j.deleted_at IS NULL AND j.job_status NOT IN ('Completed','Cancelled')`))
    }
    if (can_('support')) k.tickets_open = n(`SELECT COUNT(*) FROM tickets WHERE status NOT IN ('Resolved','Closed') AND deleted_at IS NULL`)
    if (can_('projects')) {
      k.my_tasks = n(`SELECT COUNT(*) FROM tasks WHERE assignee_id = ? AND status <> 'Done' AND deleted_at IS NULL`, user.id)
      data.lists.my_tasks = q.all(`SELECT id, title, due_date, priority, status, link_label, link_entity, link_id FROM tasks WHERE assignee_id = ? AND status <> 'Done' AND deleted_at IS NULL ORDER BY due_date IS NULL, due_date LIMIT 8`, user.id)
    }

    // alerts
    const a = data.alerts as { level: 'danger' | 'warn' | 'info'; text: string; link: string }[]
    if (can_('projects')) { const o = n(`SELECT COUNT(*) FROM tasks WHERE assignee_id = ? AND status <> 'Done' AND due_date < ? AND deleted_at IS NULL`, user.id, today); if (o) a.push({ level: 'danger', text: `${o} of your tasks are overdue`, link: '/e/tasks' }) }
    if (can_('finance') && can_('reports') && k.ar_overdue > 0) a.push({ level: 'warn', text: `Overdue receivables: AED ${k.ar_overdue.toLocaleString()}`, link: '/reports?r=ar_aging' })
    if (can_('finance')) { const bills = n(`SELECT COUNT(*) FROM bills WHERE status IN ('Posted','Partially paid') AND balance > 0 AND due_date <= ? AND deleted_at IS NULL`, addDays(today, 7)); if (bills) a.push({ level: 'warn', text: `${bills} vendor bills due within 7 days`, link: '/e/bills' }) }
    if (can_('sales')) {
      const u = n(`SELECT COUNT(DISTINCT c.job_id) FROM job_charges c JOIN jobs j ON j.id = c.job_id WHERE c.kind='Revenue' AND c.status='Unbilled' AND j.job_status IN ('Title Deed Issued','Completed') AND c.deleted_at IS NULL AND j.deleted_at IS NULL`); if (u && can_('finance') && can_('reports')) a.push({ level: 'warn', text: `${u} completed deals still have unbilled revenue`, link: '/reports?r=unbilled_charges' })
      const oc = n(`SELECT COUNT(*) FROM jobs WHERE job_status <> 'Cancelled' AND deleted_at IS NULL AND target_close IS NOT NULL AND actual_close IS NULL AND target_close < ?`, today); if (oc && can_('reports')) a.push({ level: 'danger', text: `${oc} deals are past their target close date and not yet completed`, link: '/e/jobs' })
    }
    if (can_('sales')) { const x = n(`SELECT COUNT(*) FROM quotations WHERE status = 'Sent' AND valid_until BETWEEN ? AND ? AND deleted_at IS NULL`, today, addDays(today, 3)); if (x) a.push({ level: 'info', text: `${x} sent quotations expire within 3 days`, link: '/e/quotations' }); const pa = n(`SELECT COUNT(*) FROM quotations WHERE approval_status = 'Pending' AND deleted_at IS NULL`); if (pa) a.push({ level: 'warn', text: `${pa} quotations awaiting margin approval`, link: '/e/quotations' }) }
    if (can_('reports')) { k.compliance_issues = runReport('document_expiries', { days: 30 }).rows.length; if (k.compliance_issues) a.push({ level: 'warn', text: `${k.compliance_issues} documents and permits expire within 30 days`, link: '/reports?r=document_expiries' }) }
    if (can_('support')) { const t = n(`SELECT COUNT(*) FROM tickets WHERE status NOT IN ('Resolved','Closed') AND due_at < ? AND deleted_at IS NULL`, nowIso().slice(0, 16)); if (t) a.push({ level: 'danger', text: `${t} tickets are past their SLA`, link: '/e/tickets' }) }
    if (Number(k.mandates_expiring ?? 0) > 0) a.push({ level: 'warn', text: `${k.mandates_expiring} mandates expire within 14 days – renew or release the listing`, link: '/e/mandates' })
    if (Number(k.stale_listings ?? 0) > 0) a.push({ level: 'info', text: `${k.stale_listings} active mandates have had no activity for 21+ days`, link: '/e/mandates' })
    if (Number(k.viewings_missed ?? 0) > 0) a.push({ level: 'info', text: `${k.viewings_missed} viewings ended as no-shows in the last 30 days`, link: '/e/viewings' })
    if (Number(k.arrears_aed ?? 0) > 0) a.push({ level: 'danger', text: `Rent arrears: AED ${k.arrears_aed.toLocaleString()} across ${k.arrears_count} schedule${k.arrears_count === 1 ? '' : 's'}`, link: '/e/rent_schedules' })
    if (Number(k.maintenance_exceptions ?? 0) > 0) a.push({ level: 'danger', text: `${k.maintenance_exceptions} urgent / emergency maintenance request${k.maintenance_exceptions === 1 ? '' : 's'} still open`, link: '/e/maintenance' })
    if (Number(k.renewals_due ?? 0) > 0) a.push({ level: 'info', text: `${k.renewals_due} leases end within 90 days – open the renewal conversation`, link: '/e/leases' })
    if (Number(k.offers_pending ?? 0) > 0) a.push({ level: 'info', text: `${k.offers_pending} offer${k.offers_pending === 1 ? '' : 's'} waiting for a decision`, link: '/e/offers' })

    // -------- Pinpoint Role-Based Dashboard Payloads (Zero-Leak Scoped) --------
    const safeVal = (sql: string, ...args: any[]) => { try { return q.val<number>(sql, ...args) ?? 0 } catch { return 0 } }
    const safeAll = (sql: string, ...args: any[]) => { try { return q.all<any>(sql, ...args) } catch { return [] } }
    const safeGet = (sql: string, ...args: any[]) => { try { return q.get<any>(sql, ...args) } catch { return null } }

    if (canRequestCompanySeal(user)) {
      const isOwner = roleProfile === 'owner'
      const sealRows = isOwner
        ? safeAll(`SELECT id, requester_name, requester_role, source_type, source_id, document_title, recipient_name, reason, include_seal, include_signature, status, created_at FROM document_seal_approvals WHERE status = 'Pending' ORDER BY id DESC LIMIT 12`)
        : safeAll(`SELECT id, requester_name, requester_role, source_type, source_id, document_title, recipient_name, reason, include_seal, include_signature, status, decision_note, decided_by_name, expires_at, created_at FROM document_seal_approvals WHERE requester_user_id = ? ORDER BY id DESC LIMIT 10`, user.id)
      const sealPending = isOwner
        ? safeVal(`SELECT COUNT(*) FROM document_seal_approvals WHERE status = 'Pending'`)
        : safeVal(`SELECT COUNT(*) FROM document_seal_approvals WHERE requester_user_id = ? AND status = 'Pending'`, user.id)
      data.role_data.seal_approvals = sealRows.map((r: any) => ({ ...r, include_seal: Boolean(r.include_seal), include_signature: Boolean(r.include_signature) }))
      data.role_data.seal_approvals_pending = sealPending
      if (isOwner && sealPending > 0) {
        a.unshift({ level: 'warn', text: `${sealPending} Company Seal & Signature approval request${sealPending === 1 ? '' : 's'} awaiting your Owner sign-off`, link: '#seal-approvals' })
      }
    }

    if (roleProfile === 'owner' || roleProfile === 'admin' || roleProfile === 'manager') {
      data.role_data.agent_leaderboard = safeAll(
        `SELECT a.id, a.name, a.brn,
                (SELECT COUNT(*) FROM jobs j WHERE (j.agent_id = a.id OR j.buyer_agent_id = a.id) AND j.deleted_at IS NULL AND j.job_status <> 'Cancelled') AS deals_count,
                (SELECT COALESCE(SUM(j.deal_value),0) FROM jobs j WHERE (j.agent_id = a.id OR j.buyer_agent_id = a.id) AND j.deleted_at IS NULL AND j.job_status <> 'Cancelled') AS deals_volume,
                (SELECT COUNT(*) FROM viewings v WHERE v.agent_id = a.id AND v.deleted_at IS NULL AND substr(v.scheduled_at, 1, 10) >= ?) AS viewings_month
         FROM agents a
         WHERE a.deleted_at IS NULL AND COALESCE(a.active, 1) = 1
         ORDER BY deals_volume DESC, deals_count DESC, viewings_month DESC
         LIMIT 8`,
        mStart,
      ).map((r: any) => ({ ...r, deals_volume: m(r.deals_volume ?? 0) }))

      data.role_data.governance = {
        seal_pending: data.role_data.seal_approvals_pending ?? 0,
        recycle_pending: safeVal(`SELECT COUNT(*) FROM delete_requests WHERE status = 'Pending'`),
        withdrawals_pending: safeVal(`SELECT COUNT(*) FROM deal_withdrawals WHERE status = 'Pending'`),
        active_field_staff: safeVal(`SELECT COUNT(*) FROM staff_live_locations WHERE updated_at >= ?`, new Date(Date.now() - 4 * 3600_000).toISOString()),
        present_today: safeVal(`SELECT COUNT(DISTINCT employee_id) FROM attendance WHERE date = ? AND deleted_at IS NULL`, today),
      }
      if (canAccessCrmVault(user)) {
        data.role_data.vault = {
          total: safeVal(`SELECT COUNT(*) FROM crm_vault_properties WHERE deleted_at IS NULL`),
          dispatched: safeVal(`SELECT COUNT(*) FROM crm_vault_properties WHERE deleted_at IS NULL AND assigned_agent_user_id IS NOT NULL`),
          unassigned: safeVal(`SELECT COUNT(*) FROM crm_vault_properties WHERE deleted_at IS NULL AND assigned_agent_user_id IS NULL`),
        }
      }
    }

    if (roleProfile === 'hr' || roleProfile === 'owner' || roleProfile === 'admin') {
      if (canViewEmployeeRecords(user)) {
        data.role_data.hr = {
          total_employees: safeVal(`SELECT COUNT(*) FROM employees WHERE deleted_at IS NULL AND COALESCE(status, 'Active') <> 'Terminated'`),
          present_today: safeVal(`SELECT COUNT(DISTINCT employee_id) FROM attendance WHERE date = ? AND deleted_at IS NULL`, today),
          late_today: safeVal(`SELECT COUNT(*) FROM attendance WHERE date = ? AND status = 'Late' AND deleted_at IS NULL`, today),
          pending_leaves: safeVal(`SELECT COUNT(*) FROM leave_requests WHERE status = 'Pending' AND deleted_at IS NULL`),
          expiring_visas_30d: safeVal(`SELECT COUNT(*) FROM immigration_cases WHERE deleted_at IS NULL AND expiry_date BETWEEN ? AND ?`, today, addDays(today, 30)),
          open_lifecycle: safeVal(`SELECT COUNT(*) FROM hr_lifecycle_cases WHERE deleted_at IS NULL AND status NOT IN ('Completed','Closed')`),
        }
        data.lists.pending_leaves = safeAll(
          `SELECT lr.id, e.name AS employee_name, lr.leave_type, lr.start_date, lr.end_date, lr.days, lr.status
           FROM leave_requests lr
           LEFT JOIN employees e ON e.id = lr.employee_id
           WHERE lr.status = 'Pending' AND lr.deleted_at IS NULL
           ORDER BY lr.start_date ASC LIMIT 8`,
        )
        data.lists.expiring_visas = safeAll(
          `SELECT ic.id, e.name AS employee_name, ic.document_type, ic.expiry_date, ic.status
           FROM immigration_cases ic
           LEFT JOIN employees e ON e.id = ic.employee_id
           WHERE ic.deleted_at IS NULL AND ic.expiry_date IS NOT NULL AND ic.expiry_date <= ?
           ORDER BY ic.expiry_date ASC LIMIT 8`,
          addDays(today, 45),
        )
      }
    }

    if (roleProfile === 'office_admin') {
      data.role_data.office = {
        open_tickets: safeVal(`SELECT COUNT(*) FROM tickets WHERE status NOT IN ('Resolved','Closed') AND deleted_at IS NULL`),
        sla_breached: safeVal(`SELECT COUNT(*) FROM tickets WHERE status NOT IN ('Resolved','Closed') AND due_at < ? AND deleted_at IS NULL`, nowIso().slice(0, 16)),
        walkin_leads_today: safeVal(`SELECT COUNT(*) FROM leads WHERE substr(created_at, 1, 10) = ? AND deleted_at IS NULL`, today),
        total_leads_new: safeVal(`SELECT COUNT(*) FROM leads WHERE status = 'New' AND deleted_at IS NULL`),
        studio_docs_month: safeVal(`SELECT COUNT(*) FROM studio_documents WHERE substr(created_at, 1, 10) >= ? AND deleted_at IS NULL`, mStart),
      }
      data.lists.open_tickets = safeAll(
        `SELECT id, ticket_no, subject, priority, status, due_at FROM tickets WHERE status NOT IN ('Resolved','Closed') AND deleted_at IS NULL ORDER BY id DESC LIMIT 8`,
      )
      data.lists.recent_studio_docs = safeAll(
        `SELECT id, doc_no, title, category, status, updated_at FROM studio_documents WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 8`,
      )
    }

    if (roleProfile === 'agent') {
      const empId = safeGet(`SELECT id FROM employees WHERE (user_id = ? OR lower(email) = ?) AND deleted_at IS NULL LIMIT 1`, user.id, String(user.email || '').toLowerCase())?.id ?? null
      const todayAtt = empId
        ? safeGet(`SELECT id, date, check_in, check_out, status FROM attendance WHERE employee_id = ? AND date = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1`, empId, today)
        : null
      const assignedDeals = safeAll(
        `SELECT id, community, building_name, unit_number, unit_type, bedrooms, asking_price_aed, lead_status, updated_at
         FROM crm_vault_properties
         WHERE assigned_agent_user_id = ? AND deleted_at IS NULL
         ORDER BY updated_at DESC LIMIT 8`,
        user.id,
      )
      const myReports = safeAll(
        `SELECT id, report_date, status, summary FROM daily_reports WHERE created_by = ? AND deleted_at IS NULL ORDER BY report_date DESC, id DESC LIMIT 6`,
        user.id,
      )
      const myAttRecent = empId
        ? safeAll(`SELECT id, date, check_in, check_out, status FROM attendance WHERE employee_id = ? AND deleted_at IS NULL ORDER BY date DESC LIMIT 6`, empId)
        : []
      data.role_data.agent_desk = {
        assigned_vault_deals: safeVal(`SELECT COUNT(*) FROM crm_vault_properties WHERE assigned_agent_user_id = ? AND deleted_at IS NULL`, user.id),
        checked_in_today: Boolean(todayAtt?.check_in),
        check_in_time: todayAtt?.check_in ?? null,
        attendance_status: todayAtt?.status ?? 'Not checked in',
        reports_month: safeVal(`SELECT COUNT(*) FROM daily_reports WHERE created_by = ? AND report_date >= ? AND deleted_at IS NULL`, user.id, mStart),
        unread_inside: safeVal(`SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL`, user.id),
        open_tasks: safeVal(`SELECT COUNT(*) FROM tasks WHERE assignee_id = ? AND status <> 'Done' AND deleted_at IS NULL`, user.id),
      }
      data.lists.my_assigned_deals = assignedDeals
      data.lists.my_daily_reports = myReports
      data.lists.my_attendance = myAttRecent
    }

    return data
  })

  // ------------------------------------------------------------------ global search
  app.get('/api/search/global', async (req) => {
    const term = String((req.query as any).q ?? '').trim()
    if (term.length < 2) return []
    const user = req.user!
    if (user.party_id) return []
    const pat = `%${term.replace(/[\\%_]/g, c => '\\' + c)}%`
    const specs: { entity: string; cols: string[]; module: string; group: string }[] = [
      { entity: 'jobs', cols: ['job_no', 'deal_name'], module: 'sales', group: 'Deals' },
      { entity: 'parties', cols: ['name', 'code', 'trn', 'email'], module: 'crm', group: 'Customers & parties' },
      { entity: 'contacts', cols: ['name', 'email', 'phone', 'mobile'], module: 'crm', group: 'Contacts' },
      { entity: 'leads', cols: ['company', 'lead_no', 'contact_name', 'email'], module: 'crm', group: 'Leads' },
      { entity: 'opportunities', cols: ['title', 'opp_no'], module: 'crm', group: 'Opportunities' },
      { entity: 'quotations', cols: ['quote_no'], module: 'sales', group: 'Quotations' },
      { entity: 'invoices', cols: ['invoice_no', 'reference'], module: 'finance', group: 'Invoices' },
      { entity: 'bills', cols: ['bill_no', 'vendor_invoice_no'], module: 'finance', group: 'Vendor bills' },
      { entity: 'properties', cols: ['title', 'property_no'], module: 'properties', group: 'Properties' },
      { entity: 'mandates', cols: ['mandate_no'], module: 'sales', group: 'Mandates' },
      { entity: 'tickets', cols: ['ticket_no', 'subject'], module: 'support', group: 'Tickets' },
      { entity: 'employees', cols: ['name', 'emp_no'], module: 'hr', group: 'Employees' },
      { entity: 'announcements', cols: ['title'], module: 'documents', group: 'Blog' },
    ]
    const restricted = isRestrictedStaffUser(user)
    const out: any[] = []
    for (const s of specs) {
      if (RESTRICTED_HR_PII_ENTITIES.has(s.entity) && !canViewEmployeeRecords(user)) continue
      if (restricted && !RESTRICTED_STAFF_ALLOWED_ENTITIES.has(s.entity)) continue
      if (!can(user, s.module, 'view')) continue
      const def = ENTITIES[s.entity]
      const rows = q.all(`SELECT id FROM "${s.entity}" WHERE deleted_at IS NULL AND (${s.cols.map(c => `"${c}" LIKE ? ESCAPE '\\'`).join(' OR ')}) ORDER BY id DESC LIMIT 5`, ...s.cols.map(() => pat))
      if (!rows.length) continue
      const labels = labelsFor(s.entity, rows.map(r => r.id))
      for (const r of rows) out.push({ group: s.group, id: r.id, entity: s.entity, label: labels.get(r.id) ?? `#${r.id}`, link: `/e/${s.entity}/${r.id}`, icon: def.icon })
    }
    return out
  })

  // ------------------------------------------------------------------ calendar
  app.get('/api/calendar/context', async (req) => {
    need(req, 'dashboard', 'view', { portal: true })
    return { today: todayStr(), timezone: config.timezone }
  })
  app.get('/api/calendar', async (req) => {
    need(req, 'dashboard', 'view', { portal: true })
    const range = z.object({ from: z.string().date().optional(), to: z.string().date().optional() }).parse(req.query)
    const from = range.from ?? monthStart(), to = range.to ?? addDays(from, 41)
    if (to < from || daysBetween(from, to) > 93) throw bad('Choose a calendar range of up to 94 days.')
    return calendarEvents(from, to, req.ctx)
  })

  // Personal calendar feed (ICS) for Google, Outlook and phone calendars. The link is a secret; making a new one cancels the old.
  const sha = (t: string) => crypto.createHash('sha256').update(t).digest('hex')
  app.post('/api/calendar/feed-link', async (req) => {
    need(req, 'dashboard', 'view')
    const token = crypto.randomBytes(24).toString('hex')
    q.run(`DELETE FROM user_invites WHERE user_id = ? AND kind = 'calendar'`, req.user!.id)
    q.run(`INSERT INTO user_invites (user_id, token_hash, kind, expires_at, created_at) VALUES (?,?,?,?,?)`, req.user!.id, sha(token), 'calendar', '2099-12-31T00:00:00.000Z', nowIso())
    return { url: `${String(config.baseUrl || `${req.protocol}://${req.headers.host}`).replace(/\/+$/, '')}/api/public/calendar/${token}.ics` }
  })
  app.get('/api/public/calendar/:file', async (req, reply) => {
    const token = String((req.params as any).file).replace(/\.ics$/, '')
    const row = /^[0-9a-f]{48}$/.test(token) ? q.get(`SELECT user_id FROM user_invites WHERE token_hash = ? AND kind = 'calendar'`, sha(token)) : null
    const user = row ? loadUser(row.user_id) : null
    if (!user) return reply.status(404).send({ error: 'Not found' })
    const today = todayStr(), esc = (v: string) => String(v ?? '').replace(/([\\;,])/g, '\\$1').replace(/\r?\n/g, '\\n')
    const stamp = (v: string) => v.replace(/[-:]/g, '').replace(/\.\d+Z?$/, '').slice(0, 15)
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SWK Properties OS//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:SWK OS']
    for (const e of calendarEvents(addDays(today, -30), addDays(today, 90), { user, system: false } as any)) {
      lines.push('BEGIN:VEVENT', `UID:${e.uid}@swk-os`, `DTSTAMP:${stamp(new Date().toISOString())}Z`, e.allDay ? `DTSTART;VALUE=DATE:${e.start.slice(0, 10).replace(/-/g, '')}` : `DTSTART:${stamp(e.start)}`)
      if (e.end && !e.allDay) lines.push(`DTEND:${stamp(e.end)}`)
      lines.push(`SUMMARY:${esc(e.title)}`, ...(e.location ? [`LOCATION:${esc(e.location)}`] : []), 'END:VEVENT')
    }
    lines.push('END:VCALENDAR')
    return reply.header('content-type', 'text/calendar; charset=utf-8').send(lines.join('\r\n'))
  })

  // ------------------------------------------------------------------ notifications
  // Server-sent events: one open connection per page (cookie or mobile stream ticket), a message for every new notification, a ping every 20 s so proxies keep it open.
  app.get('/api/notifications/stream', async (req, reply) => {
    const uid = req.user!.id
    reply.hijack()
    const res = reply.raw
    const baseHeaders = reply.getHeaders() as Record<string, string | string[] | number | undefined>
    res.writeHead(200, {
      ...baseHeaders,
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    res.write('retry: 4000\n\n')
    const send = (n: any) => { try { res.write(`event: notification\ndata: ${JSON.stringify(n)}\n\n`) } catch { /* closed */ } }
    const channel = `u:${liveScope()}:${uid}`
    liveBus.on(channel, send)
    const ping = setInterval(() => { try { res.write(': ping\n\n') } catch { /* closed */ } }, 20_000)
    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      clearInterval(ping)
      liveBus.off(channel, send)
    }
    req.raw.on('close', cleanup)
    res.on('close', cleanup)
  })
  app.get('/api/notifications', async (req) => {
    const rows = q.all(`SELECT id, kind, title, body, link, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 60`, req.user!.id)
    return { unread: q.val<number>(`SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL`, req.user!.id) ?? 0, rows }
  })
  app.post('/api/notifications/read', async (req) => {
    const b = z.object({ ids: z.array(z.number().int()).optional(), all: z.boolean().optional() }).parse(req.body ?? {})
    if (b.all) q.run(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL`, nowIso(), req.user!.id)
    else if (b.ids?.length) q.run(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND id IN (${b.ids.map(() => '?').join(',')})`, nowIso(), req.user!.id, ...b.ids)
    return { ok: true }
  })

  // ------------------------------------------------------------------ reports
  app.get('/api/reports', async (req) => {
    need(req, 'dashboard', 'view')
    return reportCatalog(mod => can(req.user, mod, 'view') && !req.user!.party_id)
  })
  app.get('/api/reports/:key', async (req, reply) => {
    const key = String((req.params as any).key)
    const def = REPORTS.find(r => r.key === key)
    if (!def) throw bad('Unknown report')
    if (req.user!.party_id) throw bad('Reports are not available for portal users')
    need(req, def.module, 'view')
    const { format, ...params } = req.query as Record<string, any>
    const res = runReport(key, params)
    if (format === 'csv') {
      need(req, def.module, 'export')
      reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="${key}-${todayStr()}.csv"`)
      return toCsv(res.columns.map(c => c.label), res.rows.map(r => res.columns.map(c => r[c.key])).concat(res.totals ? [res.columns.map((c, i) => (i === 0 ? 'Total' : res.totals![c.key] ?? ''))] : []))
    }
    return res
  })

  // ------------------------------------------------------------------ KPI board
  app.get('/api/kpi', async (req) => {
    need(req, 'reports', 'view')
    const today = todayStr(), d90 = addDays(today, -90), mStart = monthStart()
    const n = (sql: string, ...a: any[]) => q.val<number>(sql, ...a) ?? 0
    const pct = (a: number, b: number) => (b ? r2((a / b) * 100) : null)
    const sales90 = m(Math.round(n(`SELECT COALESCE(SUM(${SIGN} * i.subtotal * i.ex_rate),0) FROM invoices i WHERE ${SALES} AND i.invoice_date BETWEEN ? AND ?`, d90, today)))
    const ar = m(Math.round(n(`SELECT COALESCE(SUM(balance * ex_rate),0) FROM invoices WHERE status IN ('Posted','Partially paid') AND doc_type IN ('Tax Invoice','Debit Note') AND balance > 0 AND deleted_at IS NULL`)))
    const deals = q.all(`SELECT deal_date, target_close, actual_close, job_status, created_at, total_revenue, profit FROM jobs WHERE deleted_at IS NULL AND job_status <> 'Cancelled' AND deal_date >= ?`, d90)
    const closed = deals.filter(j => j.job_status === 'Completed' && j.target_close && j.actual_close)
    const onTime = closed.filter(j => Date.parse(j.actual_close) <= Date.parse(j.target_close)).length
    const cycle = deals.filter(j => j.actual_close).map(j => daysBetween(j.deal_date, j.actual_close))
    const rev = deals.reduce((s, j) => s + j.total_revenue, 0), prof = deals.reduce((s, j) => s + j.profit, 0)
    const quotes = n(`SELECT COUNT(*) FROM quotations WHERE deleted_at IS NULL AND quote_date >= ? AND status <> 'Draft'`, d90), won = n(`SELECT COUNT(*) FROM quotations WHERE deleted_at IS NULL AND quote_date >= ? AND status IN ('Accepted','Converted to job')`, d90)
    const leads = n(`SELECT COUNT(*) FROM leads WHERE deleted_at IS NULL AND substr(created_at,1,10) >= ?`, d90), conv = n(`SELECT COUNT(*) FROM leads WHERE deleted_at IS NULL AND status = 'Converted' AND substr(created_at,1,10) >= ?`, d90)
    const tix = n(`SELECT COUNT(*) FROM tickets WHERE deleted_at IS NULL AND status IN ('Resolved','Closed') AND substr(created_at,1,10) >= ?`, d90), tixOk = n(`SELECT COUNT(*) FROM tickets WHERE deleted_at IS NULL AND status IN ('Resolved','Closed') AND resolved_at <= due_at AND substr(created_at,1,10) >= ?`, d90)
    const avg = (a: number[]) => (a.length ? r2(a.reduce((s, x) => s + x, 0) / a.length) : null)
    const minMargin = Number(getSetting('min_margin_pct')) || 0
    const mk = (key: string, label: string, value: number | null, unit: string, target: number | null, higherBetter = true, hint = '') => ({ key, label, value, unit, target, hint, status: value === null || target === null ? 'n/a' : (higherBetter ? value >= target : value <= target) ? 'good' : 'bad' })
    return {
      period: `Last 90 days (to ${today})`,
      kpis: [
        mk('ontime_dep', 'Deals closed on time', pct(onTime, closed.length), '%', 90, true, `${closed.length} completed deals tracked`),
        mk('cycle', 'Average deal cycle (opened → closed)', avg(cycle), 'days', 90, false),
        mk('margin', 'Gross margin on deals', pct(prof, rev), '%', minMargin || null, true),
        mk('dso', 'Days sales outstanding', sales90 > 0 ? r2(ar / (sales90 / 90)) : null, 'days', 45, false, `AR ${ar.toLocaleString()} / daily sales`),
        mk('unbilled', 'Unbilled revenue charges', m(Math.round(n(`SELECT COALESCE(SUM(c.base_amount),0) FROM job_charges c JOIN jobs j ON j.id = c.job_id WHERE c.kind='Revenue' AND c.status='Unbilled' AND c.deleted_at IS NULL AND j.deleted_at IS NULL AND j.job_status <> 'Cancelled'`))), 'AED', 0, false),
        mk('quote_conv', 'Quotation conversion', pct(won, quotes), '%', 30, true, `${won} of ${quotes} quotes`),
        mk('lead_conv', 'Lead conversion', pct(conv, leads), '%', 15, true, `${conv} of ${leads} leads`),
        mk('ticket_sla', 'Tickets resolved within SLA', pct(tixOk, tix), '%', 90, true, `${tix} resolved`),
        mk('revenue_mtd', 'Revenue this month (ex-VAT)', m(Math.round(n(`SELECT COALESCE(SUM(${SIGN} * i.subtotal * i.ex_rate),0) FROM invoices i WHERE ${SALES} AND i.invoice_date BETWEEN ? AND ?`, mStart, today))), 'AED', null, true),
        mk('collections_mtd', 'Collections this month', m(Math.round(n(`SELECT COALESCE(SUM(amount * ex_rate),0) FROM receipts WHERE status = 'Posted' AND receipt_date BETWEEN ? AND ? AND deleted_at IS NULL`, mStart, today))), 'AED', null, true),
      ],
    }
  })
  void idOf; void getDef; void listRecords
}
