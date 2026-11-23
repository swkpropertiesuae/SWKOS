import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  canAccessCrmVault,
  canViewEmployeeRecords,
  isFullAccessSwkUser,
  isRestrictedStaffUser,
} from '../../shared/swk-staff-access'
import { omniChat, omniConfigured } from '../ai/omni-router'
import { inDemo, q } from '../db'
import { listAgentAssignedProperties } from '../domain/crm-vault'
import { custodyFilter } from '../domain/handover'
import { type SessionUser } from '../engine'
import { searchWeb } from '../integrations/web-search'
import { htmlToText } from '../studio/sanitize'
import { forbidden, fromCents, HttpError, nowIso, safeJson, todayStr } from '../util'
import { DUBAI_AREAS_24 } from './swk-ops'

export type SearchScope = 'internal' | 'website' | 'market' | 'web'
export type RoleSearchTier = 'leadership' | 'hr' | 'office_admin' | 'restricted'

export interface UnifiedSearchHit {
  id: string
  scope: SearchScope
  entity: string
  title: string
  subtitle?: string
  snippet?: string
  url?: string
  link?: string
  meta?: Record<string, unknown>
}

const SCOPES = ['internal', 'website', 'market', 'web'] as const

function escapeLike(term: string): string {
  return `%${term.toLowerCase().replace(/[\\%_]/g, c => '\\' + c)}%`
}

function likeClause(cols: string[], pat: string): { sql: string; args: string[] } {
  return {
    sql: `(${cols.map(c => `lower(COALESCE(${c}, '')) LIKE ? ESCAPE '\\'`).join(' OR ')})`,
    args: cols.map(() => pat),
  }
}

function resolveRoleTier(user: SessionUser): RoleSearchTier {
  if (isRestrictedStaffUser(user)) return 'restricted'
  if (canAccessCrmVault(user) || (inDemo() && isFullAccessSwkUser(user))) return 'leadership'
  const roleLower = String(user.role_name || '').trim().toLowerCase()
  if (roleLower === 'hr' && canViewEmployeeRecords(user)) return 'hr'
  if (roleLower === 'office admin') return 'office_admin'
  return 'restricted'
}

function searchOwnWordDocs(userId: number, pat: string, limit: number): UnifiedSearchHit[] {
  const rows = q.all<any>(
    `SELECT id, title, html_content, rtl, updated_at
     FROM word_documents
     WHERE user_id = ? AND deleted_at IS NULL
       AND (lower(COALESCE(title, '')) LIKE ? ESCAPE '\\' OR lower(COALESCE(html_content, '')) LIKE ? ESCAPE '\\')
     ORDER BY updated_at DESC, id DESC
     LIMIT ?`,
    userId,
    pat,
    pat,
    limit,
  )
  return rows.map(r => ({
    id: `word_documents:${r.id}`,
    scope: 'internal',
    entity: 'word_documents',
    title: r.title,
    subtitle: `Word Document${r.rtl ? ' · RTL' : ''}`,
    snippet: htmlToText(r.html_content || '').slice(0, 180),
    link: `/utilities/word?id=${r.id}`,
    meta: { record_id: r.id, updated_at: r.updated_at },
  }))
}

function searchOwnChatMessages(userId: number, pat: string, limit: number): UnifiedSearchHit[] {
  const rows = q.all<any>(
    `SELECT m.id, m.thread_id, m.body, m.created_at, u.name AS sender_name, COALESCE(t.title, '') AS thread_title, t.kind
     FROM chat_messages m
     JOIN chat_members cm ON cm.thread_id = m.thread_id AND cm.user_id = ?
     JOIN chat_threads t ON t.id = m.thread_id
     JOIN users u ON u.id = m.user_id
     WHERE m.deleted_at IS NULL AND m.kind <> 'system'
       AND lower(COALESCE(m.body, '')) LIKE ? ESCAPE '\\'
     ORDER BY m.id DESC
     LIMIT ?`,
    userId,
    pat,
    limit,
  )
  return rows.map(r => ({
    id: `chat_messages:${r.id}`,
    scope: 'internal',
    entity: 'chat_messages',
    title: r.thread_title || `${r.sender_name} (${r.kind === 'group' ? 'Group' : 'Direct Message'})`,
    subtitle: `Inside Chat · ${r.sender_name}`,
    snippet: String(r.body || '').slice(0, 180),
    link: `/chat?t=${r.thread_id}`,
    meta: { thread_id: r.thread_id, message_id: r.id, created_at: r.created_at },
  }))
}

function searchOwnDailyReportsAndLeaves(userId: number, pat: string, limit: number): UnifiedSearchHit[] {
  const hits: UnifiedSearchHit[] = []
  const empId = q.val<number>(`SELECT id FROM employees WHERE user_id = ? AND deleted_at IS NULL`, userId) ?? null

  const drClause = likeClause(['report_no', 'outcomes_narrative', 'blockers_narrative', 'next_day_priorities'], pat)
  const reports = q.all<any>(
    `SELECT id, report_no, report_date, status, outcomes_narrative
     FROM daily_reports
     WHERE deleted_at IS NULL
       AND (user_id = ?${empId ? ' OR employee_id = ?' : ''})
       AND ${drClause.sql}
     ORDER BY report_date DESC, id DESC
     LIMIT ?`,
    ...(empId ? [userId, empId, ...drClause.args, limit] : [userId, ...drClause.args, limit]),
  )
  for (const r of reports) {
    hits.push({
      id: `daily_reports:${r.id}`,
      scope: 'internal',
      entity: 'daily_reports',
      title: `${r.report_no || `Report #${r.id}`} · ${r.report_date}`,
      subtitle: `Daily Report · ${r.status}`,
      snippet: String(r.outcomes_narrative || '').slice(0, 180),
      link: `/e/daily_reports/${r.id}`,
      meta: { record_id: r.id },
    })
  }

  if (empId) {
    const lrClause = likeClause(['type', 'reason', 'status'], pat)
    const leaves = q.all<any>(
      `SELECT id, type, from_date, to_date, status, reason
       FROM leave_requests
       WHERE deleted_at IS NULL AND employee_id = ? AND ${lrClause.sql}
       ORDER BY from_date DESC, id DESC
       LIMIT ?`,
      empId,
      ...lrClause.args,
      limit,
    )
    for (const l of leaves) {
      hits.push({
        id: `leave_requests:${l.id}`,
        scope: 'internal',
        entity: 'leave_requests',
        title: `${l.type} Leave (${l.from_date} → ${l.to_date})`,
        subtitle: `Leave Request · ${l.status}`,
        snippet: String(l.reason || '').slice(0, 180),
        link: `/e/leave_requests/${l.id}`,
        meta: { record_id: l.id },
      })
    }
  }
  return hits
}

function searchEmployees(pat: string, limit: number): UnifiedSearchHit[] {
  const c = likeClause(['emp_no', 'name', 'email', 'designation', 'status'], pat)
  const rows = q.all<any>(
    `SELECT id, emp_no, name, email, designation, status
     FROM employees
     WHERE deleted_at IS NULL AND ${c.sql}
     ORDER BY id DESC LIMIT ?`,
    ...c.args,
    limit,
  )
  return rows.map(r => ({
    id: `employees:${r.id}`,
    scope: 'internal',
    entity: 'employees',
    title: `${r.emp_no ? `${r.emp_no} – ` : ''}${r.name}`,
    subtitle: [r.designation, r.status].filter(Boolean).join(' · '),
    snippet: r.email || '',
    link: `/e/employees/${r.id}`,
    meta: { record_id: r.id },
  }))
}

function searchLeads(pat: string, limit: number): UnifiedSearchHit[] {
  const c = likeClause(['lead_no', 'company', 'contact_name', 'email', 'destination', 'notes'], pat)
  const rows = q.all<any>(
    `SELECT id, lead_no, company, contact_name, destination, status
     FROM leads
     WHERE deleted_at IS NULL AND ${c.sql}
     ORDER BY id DESC LIMIT ?`,
    ...c.args,
    limit,
  )
  return rows.map(r => ({
    id: `leads:${r.id}`,
    scope: 'internal',
    entity: 'leads',
    title: `${r.lead_no ? `${r.lead_no} – ` : ''}${r.company || r.contact_name}`,
    subtitle: ['Lead', r.status, r.destination].filter(Boolean).join(' · '),
    snippet: r.contact_name ? `Contact: ${r.contact_name}` : '',
    link: `/e/leads/${r.id}`,
    meta: { record_id: r.id },
  }))
}

function searchTasks(pat: string, limit: number): UnifiedSearchHit[] {
  const c = likeClause(['title', 'description', 'link_label', 'status'], pat)
  const rows = q.all<any>(
    `SELECT id, title, status, priority, due_date, link_label
     FROM tasks
     WHERE deleted_at IS NULL AND ${c.sql}
     ORDER BY id DESC LIMIT ?`,
    ...c.args,
    limit,
  )
  return rows.map(r => ({
    id: `tasks:${r.id}`,
    scope: 'internal',
    entity: 'tasks',
    title: r.title,
    subtitle: ['Task', r.status, r.priority, r.due_date].filter(Boolean).join(' · '),
    snippet: r.link_label || '',
    link: `/e/tasks/${r.id}`,
    meta: { record_id: r.id },
  }))
}

function searchAttachments(pat: string, limit: number): UnifiedSearchHit[] {
  const c = likeClause(['file_name', 'category', 'note', 'link_label'], pat)
  const rows = q.all<any>(
    `SELECT id, file_name, category, link_label, note
     FROM attachments
     WHERE deleted_at IS NULL AND ${c.sql}
     ORDER BY id DESC LIMIT ?`,
    ...c.args,
    limit,
  )
  return rows.map(r => ({
    id: `attachments:${r.id}`,
    scope: 'internal',
    entity: 'attachments',
    title: r.file_name,
    subtitle: [r.category, r.link_label].filter(Boolean).join(' · '),
    snippet: String(r.note || '').slice(0, 180),
    link: `/api/files/${r.id}/download`,
    meta: { record_id: r.id },
  }))
}

function interleaveHits(buckets: UnifiedSearchHit[][], limit: number): UnifiedSearchHit[] {
  const out: UnifiedSearchHit[] = []
  let idx = 0
  while (out.length < limit) {
    let added = false
    for (const bucket of buckets) {
      if (idx < bucket.length) {
        out.push(bucket[idx]!)
        added = true
        if (out.length >= limit) break
      }
    }
    if (!added) break
    idx++
  }
  return out
}

function searchInternalScoped(user: SessionUser, tier: RoleSearchTier, rawQ: string, pat: string, limit: number): UnifiedSearchHit[] {
  const buckets: UnifiedSearchHit[][] = []
  const perEntity = Math.min(8, Math.max(3, limit))

  // All tiers search ONLY their own Word docs and Inside messages they belong to
  buckets.push(searchOwnWordDocs(user.id, pat, perEntity))
  buckets.push(searchOwnChatMessages(user.id, pat, perEntity))

  if (tier === 'restricted') {
    // Field Agent / Restricted Staff: ONLY masked assigned Vault deals + own daily_reports/leave_requests
    const assigned = listAgentAssignedProperties(user, { q: rawQ, page: 1, pageSize: perEntity })
    buckets.push(
      assigned.rows.map(deal => ({
        id: `crm_vault_assigned:${deal.id}`,
        scope: 'internal',
        entity: 'crm_vault_assigned',
        title: `${deal.external_deal_id} · ${deal.building_or_project || deal.dubai_area_community || 'Assigned Deal'}`,
        subtitle: [deal.deal_division, deal.dubai_area_community, deal.vault_status, deal.phone_masked].filter(Boolean).join(' · '),
        snippet: deal.exact_unit_door_no ? `Unit: ${deal.exact_unit_door_no}` : '',
        link: '/my-deals',
        meta: {
          deal_id: deal.id,
          external_deal_id: deal.external_deal_id,
          phone_masked: deal.phone_masked,
        },
      })),
    )
    buckets.push(searchOwnDailyReportsAndLeaves(user.id, pat, perEntity))
    return interleaveHits(buckets, limit)
  }

  if (tier === 'hr') {
    buckets.push(searchEmployees(pat, perEntity))
    const lrC = likeClause(['l.type', 'l.reason', 'l.status', 'e.name'], pat)
    const leaves = q.all<any>(
      `SELECT l.id, l.type, l.from_date, l.to_date, l.status, l.reason, e.name AS emp_name
       FROM leave_requests l
       LEFT JOIN employees e ON e.id = l.employee_id
       WHERE l.deleted_at IS NULL AND ${lrC.sql}
       ORDER BY l.from_date DESC, l.id DESC LIMIT ?`,
      ...lrC.args,
      perEntity,
    )
    buckets.push(
      leaves.map(l => ({
        id: `leave_requests:${l.id}`,
        scope: 'internal',
        entity: 'leave_requests',
        title: `${l.emp_name || 'Staff'} · ${l.type} (${l.from_date} → ${l.to_date})`,
        subtitle: `Leave Request · ${l.status}`,
        snippet: String(l.reason || '').slice(0, 180),
        link: `/e/leave_requests/${l.id}`,
      })),
    )
    const attC = likeClause(['a.att_date', 'a.status', 'a.note', 'e.name'], pat)
    const attRows = q.all<any>(
      `SELECT a.id, a.att_date, a.status, a.note, e.name AS emp_name
       FROM attendance a
       LEFT JOIN employees e ON e.id = a.employee_id
       WHERE a.deleted_at IS NULL AND ${attC.sql}
       ORDER BY a.att_date DESC, a.id DESC LIMIT ?`,
      ...attC.args,
      perEntity,
    )
    buckets.push(
      attRows.map(a => ({
        id: `attendance:${a.id}`,
        scope: 'internal',
        entity: 'attendance',
        title: `${a.emp_name || 'Staff'} · ${a.att_date}`,
        subtitle: `Attendance · ${a.status}`,
        snippet: String(a.note || '').slice(0, 180),
        link: `/e/attendance/${a.id}`,
      })),
    )
    buckets.push(searchTasks(pat, perEntity))
    return interleaveHits(buckets, limit)
  }

  if (tier === 'office_admin') {
    buckets.push(searchLeads(pat, perEntity))
    const tC = likeClause(['ticket_no', 'subject', 'description', 'status'], pat)
    const tickets = q.all<any>(
      `SELECT id, ticket_no, subject, priority, status, description
       FROM tickets
       WHERE deleted_at IS NULL AND ${tC.sql}
       ORDER BY id DESC LIMIT ?`,
      ...tC.args,
      perEntity,
    )
    buckets.push(
      tickets.map(t => ({
        id: `tickets:${t.id}`,
        scope: 'internal',
        entity: 'tickets',
        title: `${t.ticket_no ? `${t.ticket_no} – ` : ''}${t.subject}`,
        subtitle: `Ticket · ${t.status} · ${t.priority}`,
        snippet: String(t.description || '').slice(0, 180),
        link: `/e/tickets/${t.id}`,
      })),
    )
    buckets.push(searchAttachments(pat, perEntity))
    buckets.push(searchTasks(pat, perEntity))
    return interleaveHits(buckets, limit)
  }

  // Leadership (Owner, Admin, Manager)
  buckets.push(searchEmployees(pat, perEntity))
  buckets.push(searchLeads(pat, perEntity))
  buckets.push(searchTasks(pat, perEntity))
  buckets.push(searchAttachments(pat, perEntity))

  const propC = likeClause(['property_no', 'title', 'building_name', 'sub_community', 'address', 'rera_permit_no'], pat)
  buckets.push(
    q
      .all<any>(
        `SELECT id, property_no, title, building_name, sub_community, status FROM properties WHERE deleted_at IS NULL AND ${propC.sql} ORDER BY id DESC LIMIT ?`,
        ...propC.args,
        perEntity,
      )
      .map(r => ({
        id: `properties:${r.id}`,
        scope: 'internal' as const,
        entity: 'properties',
        title: `${r.property_no ? `${r.property_no} – ` : ''}${r.title}`,
        subtitle: ['Property', r.status, r.building_name, r.sub_community].filter(Boolean).join(' · '),
        link: `/e/properties/${r.id}`,
      })),
  )

  const unitC = likeClause(['unit_no', 'property_title', 'unit_type', 'view'], pat)
  buckets.push(
    q
      .all<any>(
        `SELECT id, unit_no, property_title, unit_type, status FROM units WHERE deleted_at IS NULL AND ${unitC.sql} ORDER BY id DESC LIMIT ?`,
        ...unitC.args,
        perEntity,
      )
      .map(r => ({
        id: `units:${r.id}`,
        scope: 'internal' as const,
        entity: 'units',
        title: `${r.unit_no}${r.property_title ? ` · ${r.property_title}` : ''}`,
        subtitle: ['Unit', r.unit_type, r.status].filter(Boolean).join(' · '),
        link: `/e/units/${r.id}`,
      })),
  )

  const jobC = likeClause(['job_no', 'deal_name', 'deal_type', 'job_status'], pat)
  buckets.push(
    q
      .all<any>(
        `SELECT id, job_no, deal_name, deal_type, job_status FROM jobs WHERE deleted_at IS NULL AND ${jobC.sql} ORDER BY id DESC LIMIT ?`,
        ...jobC.args,
        perEntity,
      )
      .map(r => ({
        id: `jobs:${r.id}`,
        scope: 'internal' as const,
        entity: 'jobs',
        title: `${r.job_no ? `${r.job_no} – ` : ''}${r.deal_name}`,
        subtitle: ['Deal File', r.deal_type, r.job_status].filter(Boolean).join(' · '),
        link: `/e/jobs/${r.id}`,
      })),
  )

  const partyC = likeClause(['code', 'name', 'legal_name', 'trn', 'email'], pat)
  buckets.push(
    q
      .all<any>(
        `SELECT id, code, name, email, status FROM parties WHERE deleted_at IS NULL AND ${partyC.sql} ORDER BY id DESC LIMIT ?`,
        ...partyC.args,
        perEntity,
      )
      .map(r => ({
        id: `parties:${r.id}`,
        scope: 'internal' as const,
        entity: 'parties',
        title: `${r.code ? `${r.code} – ` : ''}${r.name}`,
        subtitle: ['Party', r.status, r.email].filter(Boolean).join(' · '),
        link: `/e/parties/${r.id}`,
      })),
  )

  const leaseC = likeClause(['lease_no', 'unit_title', 'ejari_no', 'status'], pat)
  buckets.push(
    q
      .all<any>(
        `SELECT id, lease_no, unit_title, ejari_no, status FROM leases WHERE deleted_at IS NULL AND ${leaseC.sql} ORDER BY id DESC LIMIT ?`,
        ...leaseC.args,
        perEntity,
      )
      .map(r => ({
        id: `leases:${r.id}`,
        scope: 'internal' as const,
        entity: 'leases',
        title: `${r.lease_no}${r.unit_title ? ` – ${r.unit_title}` : ''}`,
        subtitle: ['Lease', r.status, r.ejari_no].filter(Boolean).join(' · '),
        link: `/e/leases/${r.id}`,
      })),
  )

  const invC = likeClause(['invoice_no', 'reference', 'doc_type', 'status'], pat)
  buckets.push(
    q
      .all<any>(
        `SELECT id, invoice_no, doc_type, reference, status, currency FROM invoices WHERE deleted_at IS NULL AND ${invC.sql} ORDER BY id DESC LIMIT ?`,
        ...invC.args,
        perEntity,
      )
      .map(r => ({
        id: `invoices:${r.id}`,
        scope: 'internal' as const,
        entity: 'invoices',
        title: `${r.invoice_no}${r.reference ? ` · ${r.reference}` : ''}`,
        subtitle: [r.doc_type, r.status, r.currency].filter(Boolean).join(' · '),
        link: `/e/invoices/${r.id}`,
      })),
  )

  const mndC = likeClause(['mandate_no', 'property_title', 'mandate_type', 'status'], pat)
  buckets.push(
    q
      .all<any>(
        `SELECT id, mandate_no, property_title, mandate_type, status FROM mandates WHERE deleted_at IS NULL AND ${mndC.sql} ORDER BY id DESC LIMIT ?`,
        ...mndC.args,
        perEntity,
      )
      .map(r => ({
        id: `mandates:${r.id}`,
        scope: 'internal' as const,
        entity: 'mandates',
        title: `${r.mandate_no}${r.property_title ? ` – ${r.property_title}` : ''}`,
        subtitle: [r.mandate_type, r.status].filter(Boolean).join(' · '),
        link: `/e/mandates/${r.id}`,
      })),
  )

  const vaultC = likeClause([
    'p.external_deal_id',
    'p.dubai_area_community',
    'p.building_or_project',
    'p.exact_unit_door_no',
    'p.owner_name',
  ], pat)
  buckets.push(
    q
      .all<any>(
        `SELECT p.id, p.external_deal_id, p.deal_division, p.dubai_area_community, p.building_or_project,
                p.exact_unit_door_no, p.owner_name, p.direct_mobile_masked, p.vault_status
         FROM crm_vault_properties p
         WHERE ${vaultC.sql}${custodyFilter(user, 'p')}
         ORDER BY p.id DESC LIMIT ?`,
        ...vaultC.args,
        perEntity,
      )
      .map(r => ({
        id: `crm_vault_properties:${r.id}`,
        scope: 'internal' as const,
        entity: 'crm_vault_properties',
        title: `${r.external_deal_id} · ${r.building_or_project || r.dubai_area_community || 'CRM Vault'}`,
        subtitle: [r.deal_division, r.dubai_area_community, r.vault_status, r.direct_mobile_masked].filter(Boolean).join(' · '),
        snippet: [r.owner_name, r.exact_unit_door_no].filter(Boolean).join(' · '),
        link: '/crm-vault',
        meta: { record_id: r.id, external_deal_id: r.external_deal_id },
      })),
  )

  return interleaveHits(buckets, limit)
}

function searchWebsiteScope(userId: number, pat: string, limit: number): UnifiedSearchHit[] {
  const hits: UnifiedSearchHit[] = []
  const now = nowIso()
  const shareLinks = q.all<{ token: string; ref_ids: string }>(
    `SELECT token, ref_ids FROM share_links
     WHERE entity = 'website_listings' AND created_by = ? AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY id DESC LIMIT 100`,
    userId,
    now,
  )

  const lC = likeClause(['title', 'subtitle', 'community', 'building', 'developer', 'reference', 'slug', 'description'], pat)
  const listings = q.all<any>(
    `SELECT id, reference, slug, title, subtitle, purpose, status, property_type, community, building, developer,
            price_aed, bedrooms, area_sqft, description
     FROM website_listings
     WHERE deleted_at IS NULL AND published = 1 AND ${lC.sql}
     ORDER BY hot_offer DESC, sort_order ASC, id DESC
     LIMIT ?`,
    ...lC.args,
    limit,
  )
  for (const r of listings) {
    const price = Number(fromCents(r.price_aed)) || 0
    const publicUrl = `https://swkpropertiesuae.com/properties/${r.slug}`
    const shareMatch = shareLinks.find(s => safeJson<number[]>(s.ref_ids, []).includes(r.id))
    const shareUrl = shareMatch ? `/l/${shareMatch.token}` : null
    const priceLabel = price ? `AED ${Math.round(price).toLocaleString('en-US')}${r.purpose === 'rent' ? '/yr' : ''}` : ''
    hits.push({
      id: `website_listings:${r.id}`,
      scope: 'website',
      entity: 'website_listings',
      title: r.title,
      subtitle: [r.community, r.bedrooms != null ? `${r.bedrooms} BR` : null, priceLabel, r.purpose].filter(Boolean).join(' · '),
      snippet: String(r.subtitle || r.description || '').slice(0, 180),
      url: shareUrl ?? publicUrl,
      link: shareUrl ?? publicUrl,
      meta: {
        record_id: r.id,
        reference: r.reference,
        slug: r.slug,
        community: r.community,
        bedrooms: r.bedrooms,
        price_aed: price,
        purpose: r.purpose,
        public_url: publicUrl,
        share_url: shareUrl,
      },
    })
  }

  const pC = likeClause(['title', 'eyebrow', 'community', 'developer', 'benefits'], pat)
  const promos = q.all<any>(
    `SELECT id, title, eyebrow, tab, developer, community, price_guide, plan_highlight, href, benefits
     FROM website_promotions
     WHERE deleted_at IS NULL AND active = 1 AND ${pC.sql}
     ORDER BY sort_order ASC, id DESC
     LIMIT ?`,
    ...pC.args,
    limit,
  )
  for (const p of promos) {
    const href = String(p.href || '/off-plan')
    const publicUrl = /^https?:\/\//i.test(href) ? href : `https://swkpropertiesuae.com${href.startsWith('/') ? href : '/' + href}`
    hits.push({
      id: `website_promotions:${p.id}`,
      scope: 'website',
      entity: 'website_promotions',
      title: p.title,
      subtitle: [p.eyebrow, p.community, p.price_guide].filter(Boolean).join(' · '),
      snippet: String(p.plan_highlight || p.benefits || '').slice(0, 180),
      url: publicUrl,
      link: publicUrl,
      meta: { record_id: p.id, tab: p.tab, developer: p.developer, community: p.community },
    })
  }

  return hits.slice(0, limit)
}

function searchMarketScope(rawQ: string, pat: string, limit: number): UnifiedSearchHit[] {
  const hits: UnifiedSearchHit[] = []
  const ql = rawQ.toLowerCase()

  for (const area of DUBAI_AREAS_24) {
    const haystack = [
      area.name,
      area.code,
      area.ticker,
      area.segment,
      area.future15YearOutlook,
      area.nearby.metro,
      ...area.nearby.landmarks,
      ...area.ongoingProjects,
      ...area.closingKeywords,
    ]
      .join(' ')
      .toLowerCase()
    if (!haystack.includes(ql)) continue
    hits.push({
      id: `market_area:${area.code}`,
      scope: 'market',
      entity: 'market_area',
      title: `${area.name} (${area.ticker})`,
      subtitle: `${area.segment} · AED ${area.ppsf.toLocaleString('en-US')}/sqft · ${area.yieldPct}% yield · ${area.yoyPct}% YoY`,
      snippet: area.future15YearOutlook.slice(0, 200),
      link: `/market?area=${area.code}`,
      meta: {
        code: area.code,
        ticker: area.ticker,
        ppsf: area.ppsf,
        yieldPct: area.yieldPct,
        yoyPct: area.yoyPct,
        serviceCharge: area.serviceCharge,
        rent1: area.rent1,
        rent2: area.rent2,
      },
    })
    if (hits.length >= limit) break
  }

  const cC = likeClause(['code', 'name', 'emirate', 'master_developer', 'description', 'key_landmarks'], pat)
  for (const r of q.all<any>(
    `SELECT id, code, name, emirate, avg_price_sqft, avg_rent_annual, description
     FROM communities
     WHERE deleted_at IS NULL AND active = 1 AND ${cC.sql}
     ORDER BY name ASC LIMIT ?`,
    ...cC.args,
    limit,
  )) {
    hits.push({
      id: `communities:${r.id}`,
      scope: 'market',
      entity: 'communities',
      title: r.name,
      subtitle: [r.code, r.emirate, r.avg_price_sqft ? `AED ${r.avg_price_sqft}/sqft` : null].filter(Boolean).join(' · '),
      snippet: String(r.description || '').slice(0, 180),
      link: `/e/communities/${r.id}`,
      meta: { record_id: r.id, code: r.code },
    })
  }

  const dC = likeClause(['code', 'name', 'rera_id', 'description'], pat)
  for (const r of q.all<any>(
    `SELECT id, code, name, rera_id, website, description
     FROM developers
     WHERE deleted_at IS NULL AND active = 1 AND ${dC.sql}
     ORDER BY name ASC LIMIT ?`,
    ...dC.args,
    limit,
  )) {
    hits.push({
      id: `developers:${r.id}`,
      scope: 'market',
      entity: 'developers',
      title: r.name,
      subtitle: [r.code, r.rera_id ? `RERA ${r.rera_id}` : null].filter(Boolean).join(' · '),
      snippet: String(r.description || '').slice(0, 180),
      link: `/e/developers/${r.id}`,
      url: r.website || undefined,
      meta: { record_id: r.id, code: r.code },
    })
  }

  return hits.slice(0, limit)
}

export default async function searchUnifiedRoutes(app: FastifyInstance) {
  const searchSchema = z.object({
    q: z.string().trim().min(1).max(400),
    scopes: z.array(z.enum(SCOPES)).min(1).max(4).optional(),
    synthesize: z.boolean().optional(),
    confidential: z.boolean().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })

  app.post('/api/search/unified', { config: { rateLimit: { max: 40, timeWindow: '1 minute' } } }, async (req) => {
    if (!req.user || req.user.party_id) {
      throw forbidden('This area is for company staff')
    }
    const user = req.user
    const b = searchSchema.parse(req.body ?? {})
    const requestedScopes = [...new Set(b.scopes ?? ['internal', 'website', 'market'])]
    const limit = b.limit ?? 20
    const roleTier = resolveRoleTier(user)
    const isLeadership = roleTier === 'leadership'

    if (b.confidential && !canAccessCrmVault(user)) {
      throw forbidden('Confidential Mode search synthesis is restricted to Leadership (Owner, Admin, Operations Manager).')
    }
    const isConfidential = isLeadership && Boolean(b.confidential)

    const pat = escapeLike(b.q)
    const byScope: Record<SearchScope, UnifiedSearchHit[]> = {
      internal: [],
      website: [],
      market: [],
      web: [],
    }
    const warnings: string[] = []

    if (requestedScopes.includes('internal')) {
      byScope.internal = searchInternalScoped(user, roleTier, b.q, pat, limit)
    }
    if (requestedScopes.includes('website')) {
      byScope.website = searchWebsiteScope(user.id, pat, limit)
    }
    if (requestedScopes.includes('market')) {
      byScope.market = searchMarketScope(b.q, pat, limit)
    }
    if (requestedScopes.includes('web')) {
      try {
        const webRes = await searchWeb(b.q, { limit: Math.min(limit, 10) })
        byScope.web = webRes.results.map((r, idx) => ({
          id: `web:${idx}:${r.url}`,
          scope: 'web',
          entity: 'web_result',
          title: r.title,
          subtitle: r.source,
          snippet: r.snippet,
          url: r.url,
          link: r.url,
          meta: { provider: webRes.provider },
        }))
      } catch (e: any) {
        warnings.push(`Web search unavailable: ${String(e?.message ?? e)}`)
      }
    }

    const results = [
      ...byScope.internal,
      ...byScope.website,
      ...byScope.market,
      ...byScope.web,
    ]

    let synthesis: {
      answer: string
      citations: { index: number; scope: SearchScope; title: string; url?: string; snippet?: string }[]
      provider: string
      model: string
      zero_retention: boolean
      pii_redacted: number
    } | null = null

    if (b.synthesize) {
      // STRICT ISOLATION: Unless Leadership explicitly enabled confidential: true (which enforces zero-retention),
      // ONLY public website/market/web snippets leave to the search synthesis LLM!
      const synthesisPool = isConfidential
        ? [...byScope.internal, ...byScope.website, ...byScope.market, ...byScope.web]
        : [...byScope.website, ...byScope.market, ...byScope.web]

      const citationHits = synthesisPool.slice(0, 12)
      const citations = citationHits.map((h, i) => ({
        index: i + 1,
        scope: h.scope,
        title: h.title,
        url: h.url || h.link,
        snippet: h.snippet || h.subtitle,
      }))

      if (inDemo()) {
        const preview = citations.slice(0, 3).map(c => `[${c.index}] ${c.title}`).join('; ')
        synthesis = {
          answer: citations.length
            ? `(Demo Synthesis for "${b.q}") Top sources: ${preview}.`
            : `(Demo Synthesis) No matching public snippets found for "${b.q}".`,
          citations,
          provider: 'demo',
          model: 'demo-search',
          zero_retention: true,
          pii_redacted: 0,
        }
      } else {
        if (!omniConfigured()) {
          throw new HttpError(503, 'AI search synthesis is not configured. Ask an Owner or Admin to configure an Omni-Route provider.')
        }
        const contextText = citations.length
          ? citations
              .map(c => `[${c.index}] (${c.scope}) ${c.title}${c.snippet ? ` — ${c.snippet}` : ''}${c.url ? ` (${c.url})` : ''}`)
              .join('\n')
          : 'No matching snippets were found.'
        const aiRes = await omniChat({
          lane: 'search',
          user,
          confidential: isConfidential,
          zeroRetentionOnly: isConfidential,
          temperature: 0.2,
          maxTokens: 1200,
          messages: [
            {
              role: 'system',
              content: [
                `You are SWK Omni Search Analyst assisting ${user.name} at SWK Properties LLC (Dubai, UAE). Today is ${todayStr()}.`,
                'Synthesize a concise, factual Dubai real estate briefing grounded strictly in the numbered source snippets below. Cite sources inline as [1], [2], etc. Never invent prices, yields, or private client details.',
              ].join('\n\n'),
            },
            {
              role: 'user',
              content: `Query: ${b.q}\n\nSources:\n${contextText}`,
            },
          ],
        })
        synthesis = {
          answer: aiRes.content.trim(),
          citations,
          provider: aiRes.provider,
          model: aiRes.model,
          zero_retention: aiRes.zeroRetention,
          pii_redacted: aiRes.piiRedacted,
        }
      }
    }

    return {
      q: b.q,
      scopes: requestedScopes,
      role_tier: roleTier,
      total: results.length,
      counts: {
        internal: byScope.internal.length,
        website: byScope.website.length,
        market: byScope.market.length,
        web: byScope.web.length,
      },
      results,
      by_scope: byScope,
      ...(warnings.length ? { warnings } : {}),
      ...(synthesis ? { synthesis } : {}),
    }
  })
}
