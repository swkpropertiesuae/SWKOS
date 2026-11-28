/**
 * Shabib's Workspace Executive Command Suite & Forensic Field Reports API
 *
 * Strictly partitioned RBAC:
 *  - /api/shabib-workspace/*  -> STRICTLY Owner-only (canAccessShabibsCorner)
 *  - /api/field-reports/*     -> Authenticated staff (submit own GPS-pinned forensic visits/viewings & see own assigned tasks;
 *                                Owner OR any Owner-assigned Verification Authority sees & verifies all reports)
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { dirs } from '../config'
import { q, tableExists, tx } from '../db'
import { createRecord, getDef, nextSeq, SYSTEM_CTX } from '../engine'
import { openStored, persistUpload } from '../integrations/storage'
import { notify } from '../notify'
import { bad, forbidden, fromCents, notFound, nowIso, safeJson, todayStr } from '../util'
import {
  CLOSING_TRACKS,
  defaultStagesForTrack,
  SHABIB_LEGAL_QUICK_SHELF,
  SHABIB_PAYMENT_MODES,
  type ClosingStageItem,
  type ClosingTrack,
} from '../../shared/shabib-workspace'
import { canAccessShabibsCorner, isOwnerSwkUser } from '../../shared/swk-staff-access'
import { exportStructuredDossier, type ForensicExportFormat, type StructuredForensicDoc } from '../domain/forensic-exports'
import { hydrateTasksWithFollowUps } from './task-followups'
import { body, idOf } from './helpers'

const VERIFIERS_SETTING_KEY = 'shabib:field_verifiers_json'

export interface FieldVerifierEntry {
  user_id: number
  name: string
  email: string
  designation?: string
  assigned_by?: number
  assigned_at: string
}

export function getFieldVerifiers(): FieldVerifierEntry[] {
  try {
    const raw = q.val<string>(`SELECT value FROM settings WHERE key = ?`, VERIFIERS_SETTING_KEY)
    const arr = safeJson<FieldVerifierEntry[]>(raw, [])
    return Array.isArray(arr) ? arr.filter(x => Number.isInteger(Number(x?.user_id))) : []
  } catch {
    return []
  }
}

export function saveFieldVerifiers(list: FieldVerifierEntry[]): FieldVerifierEntry[] {
  q.run(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    VERIFIERS_SETTING_KEY,
    JSON.stringify(list),
  )
  return list
}

export function isFieldVerificationAuthority(user: any): boolean {
  if (!user || user.party_id) return false
  if (isOwnerSwkUser(user)) return true
  const uid = Number(user.id)
  if (!Number.isInteger(uid) || uid <= 0) return false
  return getFieldVerifiers().some(v => Number(v.user_id) === uid)
}

function requireOwnerOnly(req: FastifyRequest) {
  if (!canAccessShabibsCorner(req.user)) {
    throw forbidden("Shabib's Workspace is locked exclusively to Owner Shabib Siraj.")
  }
  return req.user!
}

function requireStaff(req: FastifyRequest) {
  if (!req.user || req.user.party_id) {
    throw forbidden('Company staff access required')
  }
  return req.user
}

function nextCode(table: string, col: string, prefix: string): string {
  const yr = String(new Date().getFullYear()).slice(-2)
  return tx(() => {
    for (let i = 0; i < 20; i++) {
      const seq = nextSeq(`shabib:${table}:${prefix}:${yr}`)
      const cand = `${prefix}-${yr}${String(seq).padStart(5, '0')}`
      const exists = q.val<number>(`SELECT 1 FROM "${table}" WHERE "${col}" = ?`, cand)
      if (!exists) return cand
    }
    return `${prefix}-${yr}${Date.now().toString().slice(-6)}`
  })
}

const VALID_REPORT_TYPES = new Set(['Site Visit', 'Viewing'])
const VALID_REPORT_OUTCOMES = new Set(['Closed', 'Not Closed', 'Follow-Up Pending'])
const VALID_COMM_TYPES = new Set(['Commission', 'Expense', 'Advance', '3rd-Party Split'])
const VALID_COMM_STATUSES = new Set(['Pending', 'Received', 'Paid'])

function numOrKeep(incoming: unknown, fallback: number, label: string, positiveOnly = false): number {
  if (incoming === undefined || incoming === null || incoming === '') return fallback
  const n = Number(incoming)
  if (!Number.isFinite(n) || (positiveOnly && n <= 0) || (!positiveOnly && n < 0)) {
    throw bad(`Invalid numeric value for ${label}`)
  }
  return n
}

function pickStr(incoming: unknown, prefill: unknown): string | null {
  const s = typeof incoming === 'string' ? incoming.trim() : incoming !== undefined && incoming !== null ? String(incoming).trim() : ''
  if (s) return s
  const p = typeof prefill === 'string' ? prefill.trim() : prefill !== undefined && prefill !== null ? String(prefill).trim() : ''
  return p || null
}

function pickPosNum(incoming: unknown, prefill: unknown): number {
  const n = Number(incoming)
  if (Number.isFinite(n) && n > 0) return n
  const p = Number(prefill)
  return Number.isFinite(p) && p > 0 ? p : 0
}

const aed = (n: unknown) => {
  const v = Number(n || 0)
  return v > 0 ? `AED ${Math.round(v).toLocaleString('en-US')}` : '—'
}

function detectImageType(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: '.jpg', mime: 'image/jpeg' }
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { ext: '.png', mime: 'image/png' }
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { ext: '.webp', mime: 'image/webp' }
  }
  if (buf.subarray(0, 4).toString('ascii') === 'GIF8') return { ext: '.gif', mime: 'image/gif' }
  return null
}

function shapeFieldReport(r: any) {
  const photos = safeJson<any[]>(r.photos_json, []) ?? []
  return {
    ...r,
    is_third_party: Boolean(r.is_third_party),
    payment_summary: safeJson<any[]>(r.payment_summary_json, []) ?? [],
    stage_log: safeJson<any[]>(r.stage_log_json, []) ?? [],
    photos: photos.map((p, idx) => ({
      idx,
      caption: p.caption || p.original_name || `Photo ${idx + 1}`,
      mime: p.mime || 'image/jpeg',
      uploaded_at: p.uploaded_at || r.created_at,
      url: p.url || `/api/field-reports/${r.id}/photos/${idx}`,
    })),
  }
}

function buildFieldReportDoc(raw: any): StructuredForensicDoc {
  const r = shapeFieldReport(raw)
  const payRows = (r.payment_summary || []).map((p: any) => [
    String(p.stage || 'Payment'),
    String(p.payment_mode || '—'),
    String(p.cheque_no || '—'),
    String(p.bank_name || '—'),
    String(p.cheque_date || '—'),
    aed(p.amount_aed),
    String(p.status || 'Pending'),
  ])
  const stageRows = (r.stage_log || []).map((s: any, idx: number) => [
    String(idx + 1),
    String(s.stage || s.label || 'Stage'),
    String(s.status || 'Logged'),
    String(s.timestamp || s.date || r.visit_date || '—'),
    String(s.notes || '—'),
  ])
  return {
    eyebrow: `SWK FORENSIC ${String(r.report_type || 'SITE VISIT').toUpperCase()} DOSSIER`,
    refNo: String(r.report_no || `FSR-${r.id}`),
    title: `${r.building_or_project || r.community || 'UAE Property'} ${r.unit_no ? `— Unit ${r.unit_no}` : ''}`.trim(),
    subtitle: `${r.report_type} · ${r.deal_category || 'Sale'} · Visit Date ${r.visit_date} · Submitted by ${r.submitted_by_name || 'Staff'}`,
    badges: [
      `Verification: ${r.verification_status}`,
      `Outcome: ${r.outcome}`,
      r.gps_lat && r.gps_lng ? `GPS: ${r.gps_lat}, ${r.gps_lng}` : 'GPS: Not Pinned',
      `${r.photos.length} Photo(s)`,
    ],
    sections: [
      {
        title: '1. Location Pin & Authority Verification',
        pairs: [
          ['Community / Area', String(r.community || '—')],
          ['Project / Building / Unit', `${r.building_or_project || '—'}${r.unit_no ? ` · Unit ${r.unit_no}` : ''}`],
          ['GPS Coordinates', r.gps_lat && r.gps_lng ? `${r.gps_lat}, ${r.gps_lng} (±${Math.round(Number(r.gps_accuracy_m || 0))}m)` : 'Not recorded'],
          ['Pinned Address / Label', String(r.gps_address_label || '—')],
          ['Verification Status', String(r.verification_status || 'Pending Verification')],
          ['Verified By Authority', r.verified_by_name ? `${r.verified_by_name} (${String(r.verified_at || '').slice(0, 16)})` : 'Awaiting Verification'],
          ['Verification Notes', String(r.verification_notes || '—')],
          ['Submitted By Staff', String(r.submitted_by_name || '—')],
        ],
      },
      {
        title: '2. Person Met, Owner / Agent & 3rd-Party Complete Details',
        pairs: [
          ['Whom Staff Met', `${r.met_person_name || '—'} (${r.met_person_role || 'Contact'})`],
          ['Met Person Phone / Email', `${r.met_person_phone || '—'}  |  ${r.met_person_email || '—'}`],
          ['Owner / Direct Agent', String(r.owner_or_agent_name || '—')],
          ['Owner / Agent Contact', `${r.owner_or_agent_phone || '—'}  |  ${r.owner_or_agent_email || '—'}`],
          ['3rd-Party Involved?', r.is_third_party ? 'YES — External Agency / Broker' : 'Direct (No 3rd Party)'],
          ['3rd-Party Agency & BRN', r.is_third_party ? `${r.third_party_agency || '—'} (BRN: ${r.third_party_brn || '—'})` : 'N/A'],
          ['3rd-Party Agent Name', r.is_third_party ? String(r.third_party_agent_name || '—') : 'N/A'],
          ['3rd-Party Phone & Email', r.is_third_party ? `${r.third_party_phone || '—'}  |  ${r.third_party_email || '—'}` : 'N/A'],
        ],
      },
      {
        title: '3. Commercial Terms, Pricing & Outcome',
        pairs: [
          ['Category', String(r.deal_category || 'Sale')],
          ['Outcome', String(r.outcome || 'Follow-Up Pending')],
          ['Asking Price', aed(r.asking_price_aed)],
          ['Final Negotiated Price', aed(r.final_price_aed)],
          ['Yearly Rent', aed(r.yearly_rent_aed)],
          ['Cheques Count', r.cheques_count ? `${r.cheques_count} Cheque(s)` : '—'],
          ['Not Closed Reason / Blockers', String(r.not_closed_reason || (r.outcome === 'Closed' ? 'Closed Successfully' : '—'))],
          ['Next Follow-Up Date', String(r.next_action_date || '—')],
        ],
      },
      ...(payRows.length
        ? [{
            title: '4. Payment & Cheque Breakdown (Stage-Wise)',
            table: {
              headers: ['Stage', 'Mode', 'Cheque No.', 'Bank', 'Date', 'Amount', 'Status'],
              rows: payRows,
            },
          }]
        : []),
      ...(stageRows.length
        ? [{
            title: '5. Stage-Wise Forensic Timeline',
            table: {
              headers: ['#', 'Stage', 'Status', 'Date/Time', 'Notes'],
              rows: stageRows,
            },
          }]
        : []),
      {
        title: '6. Forensic Field Notes & Evidence Summary',
        note: String(r.forensic_notes || 'No additional forensic notes recorded.'),
        bullets: r.photos.length
          ? r.photos.map((p: any, i: number) => `Unit Photo #${i + 1}: ${p.caption} (${p.mime})`)
          : ['No unit photographs uploaded yet.'],
      },
    ],
  }
}

function buildClosingDossierDoc(d: any, cheques: any[]): StructuredForensicDoc {
  const stages = safeJson<ClosingStageItem[]>(d.stages_json, []) ?? []
  const completed = stages.filter(s => s.status === 'Completed').length
  return {
    eyebrow: `SWK PIN-TO-PIN CLOSING FORENSIC REPORT · ${String(d.track || 'SECONDARY').toUpperCase()}`,
    refNo: String(d.dossier_no || `CLS-${d.id}`),
    title: String(d.title || 'Closing Dossier'),
    subtitle: `${d.track} Track · ${d.community || 'UAE'} ${d.building_or_project ? `· ${d.building_or_project}` : ''} ${d.unit_no ? `· Unit ${d.unit_no}` : ''}`,
    badges: [
      `Track: ${d.track}`,
      `Status: ${d.status}`,
      `Stages: ${completed}/${stages.length}`,
      `Cheques Logged: ${cheques.length}`,
    ],
    sections: [
      {
        title: '1. Client, Counterparty & 3rd-Party Details',
        pairs: [
          ['Client Full Name', String(d.client_name || '—')],
          ['Client Phone / Email', `${d.client_phone || '—'}  |  ${d.client_email || '—'}`],
          ['Client Passport / EID', String(d.client_passport_eid || '—')],
          ['SWK Responsible Agent', String(d.agent_name || '—')],
          ['Seller / Landlord / Developer', String(d.counterparty_name || '—')],
          ['Counterparty Contact', `${d.counterparty_phone || '—'}  |  ${d.counterparty_email || '—'}`],
          ['3rd-Party Agency & Agent', d.is_third_party ? `${d.third_party_agency || '—'} · ${d.third_party_agent || '—'} (BRN ${d.third_party_brn || '—'})` : 'Direct (No 3rd Party)'],
          ['3rd-Party Phone / Email', d.is_third_party ? `${d.third_party_phone || '—'}  |  ${d.third_party_email || '—'}` : 'N/A'],
        ],
      },
      {
        title: '2. Financial Summary, Registrations & Handover',
        pairs: [
          ['Asking Price', aed(d.asking_price_aed)],
          ['Agreed Price', aed(d.agreed_price_aed)],
          ['Yearly Rent (if Leasing/PM)', aed(d.yearly_rent_aed)],
          ['Deposit Held', aed(d.deposit_aed)],
          ['DLD / ADM Fee', aed(d.dld_or_adm_fee_aed)],
          ['Agency Commission + VAT', `${aed(d.agency_commission_aed)} (VAT: ${aed(d.vat_aed)})`],
          ['Payment Mode & Cheques', `${d.payment_mode || '—'} · ${d.total_cheques_count || cheques.length} Cheque(s)`],
          ['Escrow / Bank Ref', String(d.escrow_or_bank_ref || '—')],
          ['Title Deed / Oqood / Ejari Ref', String(d.ejari_or_oqood_or_deed_ref || '—')],
          ['NOC Reference', String(d.noc_ref || '—')],
          ['Handover Date', String(d.handover_date || '—')],
          ['Keys & DEWA/Meter Readings', String(d.keys_and_meters_summary || '—')],
        ],
      },
      {
        title: '3. Pin-to-Pin Stage Checklist (Scratch → Handover)',
        table: {
          headers: ['Stage', 'Status', 'Completed Date', 'Owner', 'Reference / Notes'],
          rows: stages.map(s => [
            s.label,
            s.status,
            s.completed_at ? String(s.completed_at).slice(0, 10) : '—',
            s.owner || '—',
            [s.reference, s.notes].filter(Boolean).join(' · ') || '—',
          ]),
        },
      },
      {
        title: '4. Complete Cheque & Payment Ledger',
        table: {
          headers: ['Cheque / Ref', 'Bank', 'Purpose', 'Method', 'Date', 'Amount', 'Status'],
          rows: cheques.length
            ? cheques.map(c => [
                String(c.cheque_no || '—'),
                String(c.bank_name || '—'),
                String(c.purpose || '—'),
                String(c.payment_method || '—'),
                String(c.cheque_date || '—'),
                aed(c.amount_aed),
                String(c.status || 'Pending'),
              ])
            : [['—', '—', 'No cheques logged yet', '—', '—', '—', '—']],
        },
      },
      ...(d.notes ? [{ title: '5. Closing & Handover Forensic Notes', note: String(d.notes) }] : []),
    ],
  }
}

export default async function (app: FastifyInstance) {
  // =========================================================================
  // 1. TEAM, JOB ROLES, DAILY TO-DO & DYNAMIC VERIFICATION AUTHORITY (OWNER ONLY)
  // =========================================================================
  app.get('/api/shabib-workspace/team-daily', async (req) => {
    requireOwnerOnly(req)
    const date = String((req.query as any)?.date || todayStr()).slice(0, 10)
    const verifiers = getFieldVerifiers()
    const verifierSet = new Set(verifiers.map(v => Number(v.user_id)))

    const rawUsers = q.all<any>(
      `SELECT u.id, u.name, u.email, u.active, r.name AS role_name,
              e.id AS employee_id, e.emp_no, e.designation, e.phone, e.status AS emp_status,
              d.name AS department_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       LEFT JOIN employees e ON (e.user_id = u.id OR lower(e.email) = lower(u.email)) AND e.deleted_at IS NULL
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE u.deleted_at IS NULL AND u.party_id IS NULL AND COALESCE(u.active, 1) = 1
       ORDER BY u.id ASC, CASE WHEN e.user_id = u.id THEN 0 ELSE 1 END, e.id ASC`,
    )
    const seenUserIds = new Set<number>()
    const users = rawUsers.filter(u => {
      const uid = Number(u.id)
      if (seenUserIds.has(uid)) return false
      seenUserIds.add(uid)
      return true
    })

    const rawTasks = tableExists('tasks')
      ? q.all<any>(
          `SELECT id, title, status, priority, due_date, completed_at, assignee_id, assignee_id AS assigned_to_id, link_entity, link_id, description, updated_at
           FROM tasks
           WHERE deleted_at IS NULL
           ORDER BY CASE WHEN status = 'Done' THEN 1 ELSE 0 END, COALESCE(due_date, '9999-12-31') ASC, id DESC
           LIMIT 500`,
        )
      : []
    const allTasks = hydrateTasksWithFollowUps(rawTasks)

    const attendanceToday = tableExists('attendance')
      ? q.all<any>(
          `SELECT employee_id, status AS duty_status, check_in AS check_in_at, check_out AS check_out_at, checkin_mode AS terminal_type
           FROM attendance
           WHERE deleted_at IS NULL AND att_date = ?`,
          date,
        )
      : []

    const reportsToday = q.all<any>(
      `SELECT id, report_no, report_type, submitted_by_user_id, community, building_or_project, outcome, verification_status
       FROM forensic_field_reports
       WHERE deleted_at IS NULL AND visit_date = ?`,
      date,
    )

    const staff = users.map(u => {
      const uid = Number(u.id)
      const myTasks = allTasks.filter(t => Number(t.assignee_id) === uid)
      const todoToday = myTasks.filter(t => t.status !== 'Done' && t.status !== 'Cancelled')
      const doneToday = myTasks.filter(
        t =>
          t.status === 'Done' &&
          (String(t.completed_at || t.updated_at || '').startsWith(date) || String(t.due_date || '') === date),
      )
      const doneAll = myTasks.filter(t => t.status === 'Done')
      const overdue = todoToday.filter(t => t.due_date && String(t.due_date) < date)
      const att = u.employee_id ? attendanceToday.find(a => Number(a.employee_id) === Number(u.employee_id)) : undefined
      const visits = reportsToday.filter(r => Number(r.submitted_by_user_id) === uid)

      return {
        user_id: uid,
        employee_id: u.employee_id ? Number(u.employee_id) : null,
        emp_no: u.emp_no || null,
        name: u.name,
        email: u.email,
        phone: u.phone || '',
        job_role: u.designation || u.role_name || 'Staff',
        role_name: u.role_name || 'Staff',
        department: u.department_name || 'Operations',
        is_verifier: isOwnerSwkUser(u) || verifierSet.has(uid),
        is_owner: isOwnerSwkUser(u),
        checked_in: Boolean(att?.check_in_at),
        attendance_status: att?.duty_status || 'Not Checked In',
        check_in_at: att?.check_in_at || null,
        tasks_todo: todoToday,
        tasks_done_today: doneToday,
        tasks_done_total: doneAll.length,
        overdue_count: overdue.length,
        field_reports_today: visits,
      }
    })

    const teamTodo = allTasks.filter(t => t.status !== 'Done' && t.status !== 'Cancelled').slice(0, 120)
    const teamDoneToday = allTasks.filter(
      t => t.status === 'Done' && String(t.completed_at || t.updated_at || '').startsWith(date),
    )

    return {
      date,
      verifiers,
      staff,
      team_todo: teamTodo,
      team_done_today: teamDoneToday,
      totals: {
        staff_count: staff.length,
        checked_in_count: staff.filter(s => s.checked_in).length,
        verifiers_count: staff.filter(s => s.is_verifier).length,
        open_tasks: allTasks.filter(t => t.status !== 'Done' && t.status !== 'Cancelled').length,
        done_today: teamDoneToday.length,
        visits_today: reportsToday.length,
      },
    }
  })

  app.post('/api/shabib-workspace/tasks', async (req, reply) => {
    const owner = requireOwnerOnly(req)
    const b = body<{
      title?: string
      assigned_to_id?: number | null
      assignee_id?: number | null
      due_date?: string
      priority?: string
      description?: string
    }>(req)
    const title = String(b.title || '').trim()
    if (!title) throw bad('Task title is required')
    const assignedRaw = b.assigned_to_id ?? b.assignee_id
    const assignedId = assignedRaw ? Number(assignedRaw) : null
    const rec = createRecord(
      getDef('tasks'),
      {
        title,
        assignee_id: assignedId,
        due_date: b.due_date || todayStr(),
        priority: b.priority || 'High',
        status: 'To do',
        description: b.description || 'Assigned from Shabib Workspace',
      },
      req.ctx,
    )
    if (assignedId && assignedId !== owner.id) {
      notify(assignedId, `New Daily Task from Owner: ${title}`, `Due ${b.due_date || todayStr()}`, '/field-duty', 'info')
    }
    reply.status(201)
    return { ...rec, assigned_to_id: rec.assignee_id ?? assignedId }
  })

  app.patch('/api/shabib-workspace/tasks/:id/toggle', async (req) => {
    requireOwnerOnly(req)
    const id = idOf((req.params as any).id)
    const cur = q.get<any>(`SELECT id, status FROM tasks WHERE id = ? AND deleted_at IS NULL`, id)
    if (!cur) throw notFound('Task not found')
    const nextStatus = cur.status === 'Done' ? 'To do' : 'Done'
    const ts = nowIso()
    q.run(
      `UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
      nextStatus,
      nextStatus === 'Done' ? ts : null,
      ts,
      id,
    )
    const updated = q.get<any>(`SELECT * FROM tasks WHERE id = ?`, id)
    return { ...updated, assigned_to_id: updated?.assignee_id ?? null }
  })

  app.put('/api/shabib-workspace/verifiers', async (req) => {
    const owner = requireOwnerOnly(req)
    const b = body<{ user_id?: number; enabled?: boolean; user_ids?: number[] }>(req)
    let targetIds: number[] = []
    if (Array.isArray(b.user_ids)) {
      targetIds = [...new Set(b.user_ids.map(Number).filter(n => Number.isInteger(n) && n > 0))]
    } else if (b.user_id) {
      const uid = Number(b.user_id)
      const current = new Set(getFieldVerifiers().map(v => Number(v.user_id)))
      if (b.enabled === false) current.delete(uid)
      else current.add(uid)
      targetIds = [...current]
    } else {
      throw bad('Provide user_id + enabled or user_ids[]')
    }

    const ts = nowIso()
    const entries: FieldVerifierEntry[] = []
    for (const uid of targetIds) {
      const u = q.get<any>(
        `SELECT u.id, u.name, u.email, e.designation
         FROM users u
         LEFT JOIN employees e ON (e.user_id = u.id OR lower(e.email) = lower(u.email)) AND e.deleted_at IS NULL
         WHERE u.id = ? AND u.deleted_at IS NULL AND u.party_id IS NULL`,
        uid,
      )
      if (!u) continue
      entries.push({
        user_id: Number(u.id),
        name: String(u.name || u.email),
        email: String(u.email || ''),
        designation: u.designation || undefined,
        assigned_by: owner.id,
        assigned_at: ts,
      })
    }
    saveFieldVerifiers(entries)
    if (b.user_id && b.enabled !== false && Number(b.user_id) !== owner.id) {
      notify(
        Number(b.user_id),
        'Assigned Site-Visit Verification Authority',
        'Owner Shabib designated you as a Verification Authority for GPS-pinned Site Visits & Viewings.',
        '/field-duty',
        'success',
      )
    }
    return { ok: true, verifiers: entries }
  })

  // =========================================================================
  // 2. FORENSIC SITE VISITS & VIEWINGS (STAFF SUBMIT + SCOPED PHOTOS + AUTHORITY VERIFY)
  // =========================================================================
  app.get('/api/field-reports/my-context', async (req) => {
    const user = requireStaff(req)
    const isVerifier = isFieldVerificationAuthority(user)
    const rawMyTasks = tableExists('tasks')
      ? q.all<any>(
          `SELECT id, title, status, priority, due_date, completed_at, description, assignee_id
           FROM tasks
           WHERE deleted_at IS NULL AND assignee_id = ?
           ORDER BY CASE WHEN status = 'Done' THEN 1 ELSE 0 END, COALESCE(due_date, '9999-12-31') ASC, id DESC
           LIMIT 50`,
          user.id,
        )
      : []
    const myTasks = hydrateTasksWithFollowUps(rawMyTasks)
    return {
      user_id: user.id,
      is_verifier: isVerifier,
      is_owner: isOwnerSwkUser(user),
      my_tasks: myTasks,
    }
  })

  app.patch('/api/field-reports/my-tasks/:id/toggle', async (req) => {
    const user = requireStaff(req)
    const id = idOf((req.params as any).id)
    const cur = q.get<any>(
      `SELECT id, status, assignee_id FROM tasks WHERE id = ? AND deleted_at IS NULL`,
      id,
    )
    if (!cur) throw notFound('Task not found')
    if (Number(cur.assignee_id) !== Number(user.id) && !isOwnerSwkUser(user)) {
      throw forbidden('You can only update your own assigned tasks')
    }
    const nextStatus = cur.status === 'Done' ? 'To do' : 'Done'
    const ts = nowIso()
    q.run(
      `UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
      nextStatus,
      nextStatus === 'Done' ? ts : null,
      ts,
      id,
    )
    return q.get(`SELECT id, title, status, priority, due_date, completed_at, description FROM tasks WHERE id = ?`, id)
  })

  app.get('/api/field-reports', async (req) => {
    const user = requireStaff(req)
    const isAuth = isFieldVerificationAuthority(user)
    const qry = (req.query ?? {}) as Record<string, string>
    const where: string[] = ['deleted_at IS NULL']
    const params: any[] = []
    if (!isAuth) {
      where.push('submitted_by_user_id = ?')
      params.push(user.id)
    }
    if (qry.report_type && qry.report_type !== 'all') {
      where.push('report_type = ?')
      params.push(qry.report_type)
    }
    if (qry.verification_status && qry.verification_status !== 'all') {
      where.push('verification_status = ?')
      params.push(qry.verification_status)
    }
    if (qry.outcome && qry.outcome !== 'all') {
      where.push('outcome = ?')
      params.push(qry.outcome)
    }
    const rows = q.all<any>(
      `SELECT * FROM forensic_field_reports WHERE ${where.join(' AND ')} ORDER BY visit_date DESC, id DESC LIMIT 250`,
      ...params,
    )
    return {
      rows: rows.map(shapeFieldReport),
      can_verify: isAuth,
      verifiers: isOwnerSwkUser(user) ? getFieldVerifiers() : undefined,
    }
  })

  app.post('/api/field-reports', async (req, reply) => {
    const user = requireStaff(req)
    const b = body<Record<string, any>>(req)
    const reportType = b.report_type === 'Viewing' ? 'Viewing' : 'Site Visit'
    const emp = q.get<{ id: number }>(
      `SELECT id FROM employees WHERE (user_id = ? OR lower(email) = lower(?)) AND deleted_at IS NULL LIMIT 1`,
      user.id,
      user.email,
    )
    const ag = q.get<{ id: number }>(
      `SELECT id FROM agents WHERE lower(email) = lower(?) AND deleted_at IS NULL LIMIT 1`,
      user.email,
    )
    const ts = nowIso()
    const reportNo = nextCode('forensic_field_reports', 'report_no', reportType === 'Viewing' ? 'VWR' : 'FSR')
    const payArr = Array.isArray(b.payment_summary) ? b.payment_summary : []
    const stageArr = Array.isArray(b.stage_log) && b.stage_log.length
      ? b.stage_log
      : [{ stage: `${reportType} Logged & GPS Pinned`, status: 'Completed', timestamp: ts, notes: b.gps_address_label || b.community || '' }]

    const inserted = q.get<{ id: number }>(
      `INSERT INTO forensic_field_reports (
        report_no, report_type, submitted_by_user_id, submitted_by_name, employee_id, agent_id,
        field_session_id, viewing_id, property_id, unit_id, job_id,
        visit_date, community, building_or_project, unit_no,
        gps_lat, gps_lng, gps_accuracy_m, gps_address_label,
        verification_status, met_person_name, met_person_role, met_person_phone, met_person_email,
        owner_or_agent_name, owner_or_agent_phone, owner_or_agent_email,
        is_third_party, third_party_agency, third_party_agent_name, third_party_brn, third_party_phone, third_party_email,
        deal_category, asking_price_aed, final_price_aed, yearly_rent_aed, cheques_count,
        outcome, not_closed_reason, next_action_date,
        payment_summary_json, stage_log_json, photos_json, forensic_notes, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
      reportNo,
      reportType,
      user.id,
      user.name || user.email,
      emp?.id ?? null,
      ag?.id ?? null,
      b.field_session_id ? Number(b.field_session_id) : null,
      b.viewing_id ? Number(b.viewing_id) : null,
      b.property_id ? Number(b.property_id) : null,
      b.unit_id ? Number(b.unit_id) : null,
      b.job_id ? Number(b.job_id) : null,
      String(b.visit_date || todayStr()).slice(0, 10),
      b.community || null,
      b.building_or_project || null,
      b.unit_no || null,
      b.gps_lat !== undefined && b.gps_lat !== null && b.gps_lat !== '' ? String(b.gps_lat) : null,
      b.gps_lng !== undefined && b.gps_lng !== null && b.gps_lng !== '' ? String(b.gps_lng) : null,
      b.gps_accuracy_m ? Number(b.gps_accuracy_m) : null,
      b.gps_address_label || null,
      'Pending Verification',
      b.met_person_name || null,
      b.met_person_role || 'Owner',
      b.met_person_phone || null,
      b.met_person_email || null,
      b.owner_or_agent_name || null,
      b.owner_or_agent_phone || null,
      b.owner_or_agent_email || null,
      b.is_third_party ? 1 : 0,
      b.third_party_agency || null,
      b.third_party_agent_name || null,
      b.third_party_brn || null,
      b.third_party_phone || null,
      b.third_party_email || null,
      b.deal_category || 'Sale',
      Number(b.asking_price_aed) || 0,
      Number(b.final_price_aed) || 0,
      Number(b.yearly_rent_aed) || 0,
      Number(b.cheques_count) || 0,
      ['Closed', 'Not Closed', 'Follow-Up Pending'].includes(String(b.outcome)) ? String(b.outcome) : 'Follow-Up Pending',
      b.not_closed_reason || null,
      b.next_action_date || null,
      JSON.stringify(payArr),
      JSON.stringify(stageArr),
      JSON.stringify([]),
      b.forensic_notes || null,
      ts,
      ts,
    )
    const created = q.get<any>(`SELECT * FROM forensic_field_reports WHERE id = ?`, inserted!.id)
    // Notify designated verifiers
    for (const v of getFieldVerifiers()) {
      if (Number(v.user_id) !== Number(user.id)) {
        notify(
          Number(v.user_id),
          `New Forensic ${reportType} Needs Verification`,
          `${user.name} logged ${reportNo} (${b.building_or_project || b.community || 'Site Visit'}).`,
          '/field-duty',
          'info',
        )
      }
    }
    reply.status(201)
    return shapeFieldReport(created)
  })

  app.put('/api/field-reports/:id', async (req) => {
    const user = requireStaff(req)
    const id = idOf((req.params as any).id)
    const cur = q.get<any>(`SELECT * FROM forensic_field_reports WHERE id = ? AND deleted_at IS NULL`, id)
    if (!cur) throw notFound('Forensic field report not found')
    const isAuth = isFieldVerificationAuthority(user)
    if (!isAuth && (Number(cur.submitted_by_user_id) !== Number(user.id) || cur.verification_status === 'Verified')) {
      throw forbidden('Only Owner, Verification Authority, or submitter (while pending) may edit this report')
    }
    const b = body<Record<string, any>>(req)
    const nextReportType = b.report_type !== undefined ? String(b.report_type) : cur.report_type
    if (!VALID_REPORT_TYPES.has(nextReportType)) throw bad('report_type must be Site Visit or Viewing')
    const nextOutcome = b.outcome !== undefined ? String(b.outcome) : cur.outcome
    if (!VALID_REPORT_OUTCOMES.has(nextOutcome)) throw bad('outcome must be Closed, Not Closed, or Follow-Up Pending')
    const ts = nowIso()
    q.run(
      `UPDATE forensic_field_reports SET
        report_type = ?, visit_date = ?, community = ?, building_or_project = ?, unit_no = ?,
        gps_lat = ?, gps_lng = ?, gps_accuracy_m = ?, gps_address_label = ?,
        met_person_name = ?, met_person_role = ?, met_person_phone = ?, met_person_email = ?,
        owner_or_agent_name = ?, owner_or_agent_phone = ?, owner_or_agent_email = ?,
        is_third_party = ?, third_party_agency = ?, third_party_agent_name = ?, third_party_brn = ?, third_party_phone = ?, third_party_email = ?,
        deal_category = ?, asking_price_aed = ?, final_price_aed = ?, yearly_rent_aed = ?, cheques_count = ?,
        outcome = ?, not_closed_reason = ?, next_action_date = ?,
        payment_summary_json = ?, stage_log_json = ?, forensic_notes = ?, updated_at = ?
       WHERE id = ?`,
      nextReportType,
      b.visit_date ?? cur.visit_date,
      b.community ?? cur.community,
      b.building_or_project ?? cur.building_or_project,
      b.unit_no ?? cur.unit_no,
      b.gps_lat !== undefined ? (b.gps_lat === '' ? null : String(b.gps_lat)) : cur.gps_lat,
      b.gps_lng !== undefined ? (b.gps_lng === '' ? null : String(b.gps_lng)) : cur.gps_lng,
      b.gps_accuracy_m !== undefined ? numOrKeep(b.gps_accuracy_m, Number(cur.gps_accuracy_m || 0), 'gps_accuracy_m') : cur.gps_accuracy_m,
      b.gps_address_label ?? cur.gps_address_label,
      b.met_person_name ?? cur.met_person_name,
      b.met_person_role ?? cur.met_person_role,
      b.met_person_phone ?? cur.met_person_phone,
      b.met_person_email ?? cur.met_person_email,
      b.owner_or_agent_name ?? cur.owner_or_agent_name,
      b.owner_or_agent_phone ?? cur.owner_or_agent_phone,
      b.owner_or_agent_email ?? cur.owner_or_agent_email,
      b.is_third_party !== undefined ? (b.is_third_party ? 1 : 0) : cur.is_third_party,
      b.third_party_agency ?? cur.third_party_agency,
      b.third_party_agent_name ?? cur.third_party_agent_name,
      b.third_party_brn ?? cur.third_party_brn,
      b.third_party_phone ?? cur.third_party_phone,
      b.third_party_email ?? cur.third_party_email,
      b.deal_category ?? cur.deal_category,
      numOrKeep(b.asking_price_aed, Number(cur.asking_price_aed || 0), 'asking_price_aed'),
      numOrKeep(b.final_price_aed, Number(cur.final_price_aed || 0), 'final_price_aed'),
      numOrKeep(b.yearly_rent_aed, Number(cur.yearly_rent_aed || 0), 'yearly_rent_aed'),
      Math.trunc(numOrKeep(b.cheques_count, Number(cur.cheques_count || 0), 'cheques_count')),
      nextOutcome,
      b.not_closed_reason ?? cur.not_closed_reason,
      b.next_action_date ?? cur.next_action_date,
      b.payment_summary !== undefined ? JSON.stringify(b.payment_summary) : cur.payment_summary_json,
      b.stage_log !== undefined ? JSON.stringify(b.stage_log) : cur.stage_log_json,
      b.forensic_notes ?? cur.forensic_notes,
      ts,
      id,
    )
    return shapeFieldReport(q.get(`SELECT * FROM forensic_field_reports WHERE id = ?`, id))
  })

  // Dedicated Scoped Unit Photo Upload (safe for restricted staff without opening /api/files)
  app.post('/api/field-reports/:id/photos', async (req, reply) => {
    const user = requireStaff(req)
    const id = idOf((req.params as any).id)
    const cur = q.get<any>(`SELECT * FROM forensic_field_reports WHERE id = ? AND deleted_at IS NULL`, id)
    if (!cur) throw notFound('Forensic field report not found')
    const isAuth = isFieldVerificationAuthority(user)
    if (!isAuth && (Number(cur.submitted_by_user_id) !== Number(user.id) || cur.verification_status === 'Verified')) {
      throw forbidden('Only Owner, Verification Authority, or submitter (while pending) may upload unit photos')
    }

    const photos = safeJson<any[]>(cur.photos_json, []) ?? []
    const added: any[] = []
    let caption = ''
    for await (const part of req.parts()) {
      if (part.type === 'field') {
        if (part.fieldname === 'caption') caption = String(part.value || '').trim().slice(0, 140)
        continue
      }
      const chunks: Buffer[] = []
      let total = 0
      for await (const chunk of part.file) {
        total += chunk.length
        if (total > 12 * 1024 * 1024) throw bad('Photo exceeds 12 MB limit')
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      const buf = Buffer.concat(chunks)
      const imgType = detectImageType(buf)
      if (!imgType) throw bad('Only valid JPG, PNG, WebP, or GIF unit photographs are accepted')
      const relDir = 'forensic-field'
      fs.mkdirSync(path.join(dirs.uploads, relDir), { recursive: true })
      const localRel = path.join(relDir, `${id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${imgType.ext}`)
      fs.writeFileSync(path.join(dirs.uploads, localRel), buf)
      const storedName = await persistUpload(localRel, imgType.mime)
      const entry = {
        stored_name: storedName,
        original_name: String(part.filename || `unit-photo${imgType.ext}`).slice(0, 120),
        mime: imgType.mime,
        caption: caption || String(part.filename || 'Unit Photo').slice(0, 120),
        uploaded_at: nowIso(),
      }
      photos.push(entry)
      added.push(entry)
    }
    if (!added.length) throw bad('Attach at least one photo file')
    q.run(`UPDATE forensic_field_reports SET photos_json = ?, updated_at = ? WHERE id = ?`, JSON.stringify(photos), nowIso(), id)
    reply.status(201)
    return shapeFieldReport(q.get(`SELECT * FROM forensic_field_reports WHERE id = ?`, id))
  })

  app.get('/api/field-reports/:id/photos/:idx', async (req, reply) => {
    const user = requireStaff(req)
    const id = idOf((req.params as any).id)
    const idx = Number((req.params as any).idx)
    if (!Number.isInteger(idx) || idx < 0) throw notFound('Photo not found')
    const cur = q.get<any>(`SELECT * FROM forensic_field_reports WHERE id = ? AND deleted_at IS NULL`, id)
    if (!cur) throw notFound('Report not found')
    if (!isFieldVerificationAuthority(user) && Number(cur.submitted_by_user_id) !== Number(user.id)) {
      throw forbidden('Not authorized to view this photo')
    }
    const photos = safeJson<any[]>(cur.photos_json, [])
    const item = Array.isArray(photos) ? photos[idx] : undefined
    if (!item?.stored_name) throw notFound('Photo not found')
    const stream = await openStored(String(item.stored_name))
    if (!stream) throw notFound('Photo binary not found')
    reply.header('content-type', item.mime || 'image/jpeg').header('cache-control', 'private, max-age=300')
    return reply.send(stream)
  })

  app.post('/api/field-reports/:id/verify', async (req) => {
    const user = requireStaff(req)
    if (!isFieldVerificationAuthority(user)) {
      throw forbidden('Only Owner Shabib or an Owner-assigned Verification Authority can verify field visits & viewings.')
    }
    const id = idOf((req.params as any).id)
    const cur = q.get<any>(`SELECT * FROM forensic_field_reports WHERE id = ? AND deleted_at IS NULL`, id)
    if (!cur) throw notFound('Forensic field report not found')
    const b = body<{ status?: string; notes?: string }>(req)
    const status = ['Verified', 'Flagged', 'Rejected'].includes(String(b.status)) ? String(b.status) : 'Verified'
    const ts = nowIso()
    const stages = safeJson<any[]>(cur.stage_log_json, []) ?? []
    stages.push({
      stage: `Authority Review: ${status}`,
      status,
      timestamp: ts,
      notes: `${user.name}: ${b.notes || 'Location & forensic details checked.'}`,
    })
    q.run(
      `UPDATE forensic_field_reports SET verification_status = ?, verified_by_user_id = ?, verified_by_name = ?, verified_at = ?, verification_notes = ?, stage_log_json = ?, updated_at = ? WHERE id = ?`,
      status,
      user.id,
      user.name || user.email,
      ts,
      b.notes || null,
      JSON.stringify(stages),
      ts,
      id,
    )
    if (Number(cur.submitted_by_user_id) !== Number(user.id)) {
      notify(
        Number(cur.submitted_by_user_id),
        `Forensic Report ${cur.report_no} ${status}`,
        `${user.name} marked your ${cur.report_type} as ${status}.${b.notes ? ` Note: ${b.notes}` : ''}`,
        '/field-duty',
        status === 'Verified' ? 'success' : 'warning',
      )
    }
    return shapeFieldReport(q.get(`SELECT * FROM forensic_field_reports WHERE id = ?`, id))
  })

  app.get('/api/field-reports/:id/export', async (req, reply) => {
    const user = requireStaff(req)
    const id = idOf((req.params as any).id)
    const cur = q.get<any>(`SELECT * FROM forensic_field_reports WHERE id = ? AND deleted_at IS NULL`, id)
    if (!cur) throw notFound('Forensic field report not found')
    if (!isFieldVerificationAuthority(user) && Number(cur.submitted_by_user_id) !== Number(user.id)) {
      throw forbidden('Not authorized to export this report')
    }
    const fmt = (['pdf', 'docx', 'jpeg'].includes(String((req.query as any)?.format))
      ? String((req.query as any).format)
      : 'pdf') as ForensicExportFormat
    const doc = buildFieldReportDoc(cur)
    const { buffer, mime, ext } = await exportStructuredDossier(doc, fmt)
    reply
      .header('content-type', mime)
      .header('content-disposition', `attachment; filename="${cur.report_no}-forensic.${ext}"`)
    return buffer
  })

  // =========================================================================
  // 3. PIN-TO-PIN CLOSING FORENSIC DOSSIERS & CHEQUE LEDGER (5 TRACKS — OWNER ONLY)
  // =========================================================================
  app.get('/api/shabib-workspace/closings', async (req) => {
    requireOwnerOnly(req)
    const track = String((req.query as any)?.track || '').trim()
    const where = ['deleted_at IS NULL']
    const params: any[] = []
    if (track && track !== 'all') {
      where.push('track = ?')
      params.push(track)
    }
    const dossiers = q.all<any>(
      `SELECT * FROM closing_forensic_dossiers WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 200`,
      ...params,
    )
    const allCheques = q.all<any>(`SELECT * FROM closing_cheque_ledger ORDER BY COALESCE(cheque_date, '9999-12-31') ASC, id ASC`)
    const chequesByDossier = new Map<number, any[]>()
    for (const c of allCheques) {
      const did = Number(c.dossier_id)
      const list = chequesByDossier.get(did) ?? []
      list.push(c)
      chequesByDossier.set(did, list)
    }
    // Live deals & leases available for 1-click bootstrap
    const liveJobs = tableExists('jobs')
      ? q.all<any>(
          `SELECT j.id, j.job_no, j.deal_name, j.deal_type, j.deal_value, p.name AS client_name
           FROM jobs j LEFT JOIN parties p ON p.id = j.client_id
           WHERE j.deleted_at IS NULL ORDER BY j.id DESC LIMIT 40`,
        ).map(j => ({ ...j, deal_value_aed: fromCents(j.deal_value) }))
      : []
    const liveLeases = tableExists('leases')
      ? q.all<any>(
          `SELECT l.id, l.lease_no, l.annual_rent, l.cheque_count, p.name AS tenant_name
           FROM leases l LEFT JOIN parties p ON p.id = l.tenant_id
           WHERE l.deleted_at IS NULL ORDER BY l.id DESC LIMIT 40`,
        ).map(l => ({ ...l, annual_rent_aed: fromCents(l.annual_rent) }))
      : []

    return {
      tracks: CLOSING_TRACKS,
      dossiers: dossiers.map(d => ({
        ...d,
        is_third_party: Boolean(d.is_third_party),
        stages: safeJson<ClosingStageItem[]>(d.stages_json, []) ?? defaultStagesForTrack((d.track || 'Secondary') as ClosingTrack),
        cheques: chequesByDossier.get(Number(d.id)) ?? [],
      })),
      live_jobs: liveJobs,
      live_leases: liveLeases,
    }
  })

  app.post('/api/shabib-workspace/closings', async (req, reply) => {
    const owner = requireOwnerOnly(req)
    const b = body<Record<string, any>>(req)
    const track = (CLOSING_TRACKS.includes(b.track) ? b.track : 'Secondary') as ClosingTrack

    // Optional 1-click bootstrap from existing Job or Lease
    let pre: Record<string, any> = {}
    if (b.job_id) {
      const j = q.get<any>(
        `SELECT j.*, p.name AS client_name, p.phone AS client_phone, p.email AS client_email,
                pr.title AS prop_title, COALESCE(c.name, pr.community_id) AS comm, a.name AS agent_name
         FROM jobs j
         LEFT JOIN parties p ON p.id = j.client_id
         LEFT JOIN properties pr ON pr.id = j.property_id
         LEFT JOIN communities c ON c.id = pr.community_ref
         LEFT JOIN agents a ON a.id = j.agent_id
         WHERE j.id = ? AND j.deleted_at IS NULL`,
        Number(b.job_id),
      )
      if (j) {
        pre = {
          title: `${j.job_no} · ${j.deal_name || j.prop_title || 'Deal Closing'}`,
          client_name: j.client_name || 'Client',
          client_phone: j.client_phone,
          client_email: j.client_email,
          community: j.comm,
          building_or_project: j.prop_title,
          agent_name: j.agent_name,
          agreed_price_aed: fromCents(j.deal_value),
          agency_commission_aed: fromCents(j.commission_amount),
          property_id: j.property_id,
          unit_id: j.unit_id,
          agent_id: j.agent_id,
        }
      }
    } else if (b.lease_id) {
      const l = q.get<any>(
        `SELECT l.*, t.name AS tenant_name, t.phone AS tenant_phone, t.email AS tenant_email,
                ll.name AS landlord_name, ll.phone AS landlord_phone, ll.email AS landlord_email,
                a.name AS agent_name
         FROM leases l
         LEFT JOIN parties t ON t.id = l.tenant_id
         LEFT JOIN parties ll ON ll.id = l.landlord_id
         LEFT JOIN agents a ON a.id = l.agent_id
         WHERE l.id = ? AND l.deleted_at IS NULL`,
        Number(b.lease_id),
      )
      if (l) {
        pre = {
          title: `${l.lease_no} · ${l.unit_title || 'Lease Closing'}`,
          client_name: l.tenant_name || 'Tenant',
          client_phone: l.tenant_phone,
          client_email: l.tenant_email,
          counterparty_name: l.landlord_name,
          counterparty_phone: l.landlord_phone,
          counterparty_email: l.landlord_email,
          agent_name: l.agent_name,
          yearly_rent_aed: fromCents(l.annual_rent),
          deposit_aed: fromCents(l.security_deposit),
          agency_commission_aed: fromCents(l.agency_fee),
          total_cheques_count: Number(l.cheque_count) || 1,
          ejari_or_oqood_or_deed_ref: l.ejari_no,
          property_id: l.property_id,
          unit_id: l.unit_id,
          agent_id: l.agent_id,
        }
      }
    }

    const title = String(b.title || pre.title || '').trim()
    const clientName = String(b.client_name || pre.client_name || '').trim()
    if (!title || !clientName) throw bad('title and client_name are required')
    const dossierNo = nextCode('closing_forensic_dossiers', 'dossier_no', 'CLS')
    const stages = Array.isArray(b.stages) && b.stages.length ? b.stages : defaultStagesForTrack(track)
    const ts = nowIso()

    const ins = q.get<{ id: number }>(
      `INSERT INTO closing_forensic_dossiers (
        dossier_no, track, title, status, job_id, property_id, unit_id, lease_id, handover_id, agent_id, agent_name,
        community, building_or_project, unit_no,
        client_name, client_phone, client_email, client_passport_eid,
        counterparty_name, counterparty_phone, counterparty_email,
        is_third_party, third_party_agency, third_party_agent, third_party_brn, third_party_phone, third_party_email,
        asking_price_aed, agreed_price_aed, yearly_rent_aed, deposit_aed, dld_or_adm_fee_aed, agency_commission_aed, vat_aed,
        total_cheques_count, payment_mode, escrow_or_bank_ref, ejari_or_oqood_or_deed_ref, noc_ref,
        handover_date, keys_and_meters_summary, stages_json, notes, created_by, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
      dossierNo, track, title, b.status || 'In Progress',
      b.job_id ? Number(b.job_id) : null,
      b.property_id ? Number(b.property_id) : (pre.property_id ?? null),
      b.unit_id ? Number(b.unit_id) : (pre.unit_id ?? null),
      b.lease_id ? Number(b.lease_id) : null,
      b.handover_id ? Number(b.handover_id) : null,
      b.agent_id ? Number(b.agent_id) : (pre.agent_id ?? null),
      pickStr(b.agent_name, pre.agent_name),
      pickStr(b.community, pre.community),
      pickStr(b.building_or_project, pre.building_or_project),
      pickStr(b.unit_no, null),
      clientName, pickStr(b.client_phone, pre.client_phone), pickStr(b.client_email, pre.client_email), pickStr(b.client_passport_eid, null),
      pickStr(b.counterparty_name, pre.counterparty_name), pickStr(b.counterparty_phone, pre.counterparty_phone), pickStr(b.counterparty_email, pre.counterparty_email),
      b.is_third_party ? 1 : 0, pickStr(b.third_party_agency, null), pickStr(b.third_party_agent, null), pickStr(b.third_party_brn, null), pickStr(b.third_party_phone, null), pickStr(b.third_party_email, null),
      pickPosNum(b.asking_price_aed, 0),
      pickPosNum(b.agreed_price_aed, pre.agreed_price_aed),
      pickPosNum(b.yearly_rent_aed, pre.yearly_rent_aed),
      pickPosNum(b.deposit_aed, pre.deposit_aed),
      pickPosNum(b.dld_or_adm_fee_aed, 0),
      pickPosNum(b.agency_commission_aed, pre.agency_commission_aed),
      pickPosNum(b.vat_aed, 0),
      Math.trunc(pickPosNum(b.total_cheques_count, pre.total_cheques_count)),
      b.payment_mode || 'Bank Transfer (BT)',
      pickStr(b.escrow_or_bank_ref, null),
      pickStr(b.ejari_or_oqood_or_deed_ref, pre.ejari_or_oqood_or_deed_ref),
      pickStr(b.noc_ref, null),
      pickStr(b.handover_date, null),
      pickStr(b.keys_and_meters_summary, null),
      JSON.stringify(stages),
      b.notes ?? null,
      owner.id,
      ts,
      ts,
    )
    const row = q.get<any>(`SELECT * FROM closing_forensic_dossiers WHERE id = ?`, ins!.id)
    reply.status(201)
    return { ...row, is_third_party: Boolean(row.is_third_party), stages, cheques: [] }
  })

  app.put('/api/shabib-workspace/closings/:id', async (req) => {
    requireOwnerOnly(req)
    const id = idOf((req.params as any).id)
    const cur = q.get<any>(`SELECT * FROM closing_forensic_dossiers WHERE id = ? AND deleted_at IS NULL`, id)
    if (!cur) throw notFound('Closing dossier not found')
    const b = body<Record<string, any>>(req)
    const nextTrack = b.track !== undefined ? String(b.track) : cur.track
    if (!CLOSING_TRACKS.includes(nextTrack as ClosingTrack)) throw bad('Invalid closing track')
    const ts = nowIso()
    q.run(
      `UPDATE closing_forensic_dossiers SET
        track = ?, title = ?, status = ?, agent_name = ?, community = ?, building_or_project = ?, unit_no = ?,
        client_name = ?, client_phone = ?, client_email = ?, client_passport_eid = ?,
        counterparty_name = ?, counterparty_phone = ?, counterparty_email = ?,
        is_third_party = ?, third_party_agency = ?, third_party_agent = ?, third_party_brn = ?, third_party_phone = ?, third_party_email = ?,
        asking_price_aed = ?, agreed_price_aed = ?, yearly_rent_aed = ?, deposit_aed = ?, dld_or_adm_fee_aed = ?, agency_commission_aed = ?, vat_aed = ?,
        total_cheques_count = ?, payment_mode = ?, escrow_or_bank_ref = ?, ejari_or_oqood_or_deed_ref = ?, noc_ref = ?,
        handover_date = ?, keys_and_meters_summary = ?, stages_json = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
      nextTrack, b.title ?? cur.title, b.status ?? cur.status, b.agent_name ?? cur.agent_name,
      b.community ?? cur.community, b.building_or_project ?? cur.building_or_project, b.unit_no ?? cur.unit_no,
      b.client_name ?? cur.client_name, b.client_phone ?? cur.client_phone, b.client_email ?? cur.client_email, b.client_passport_eid ?? cur.client_passport_eid,
      b.counterparty_name ?? cur.counterparty_name, b.counterparty_phone ?? cur.counterparty_phone, b.counterparty_email ?? cur.counterparty_email,
      b.is_third_party !== undefined ? (b.is_third_party ? 1 : 0) : cur.is_third_party,
      b.third_party_agency ?? cur.third_party_agency, b.third_party_agent ?? cur.third_party_agent, b.third_party_brn ?? cur.third_party_brn, b.third_party_phone ?? cur.third_party_phone, b.third_party_email ?? cur.third_party_email,
      numOrKeep(b.asking_price_aed, Number(cur.asking_price_aed || 0), 'asking_price_aed'),
      numOrKeep(b.agreed_price_aed, Number(cur.agreed_price_aed || 0), 'agreed_price_aed'),
      numOrKeep(b.yearly_rent_aed, Number(cur.yearly_rent_aed || 0), 'yearly_rent_aed'),
      numOrKeep(b.deposit_aed, Number(cur.deposit_aed || 0), 'deposit_aed'),
      numOrKeep(b.dld_or_adm_fee_aed, Number(cur.dld_or_adm_fee_aed || 0), 'dld_or_adm_fee_aed'),
      numOrKeep(b.agency_commission_aed, Number(cur.agency_commission_aed || 0), 'agency_commission_aed'),
      numOrKeep(b.vat_aed, Number(cur.vat_aed || 0), 'vat_aed'),
      Math.trunc(numOrKeep(b.total_cheques_count, Number(cur.total_cheques_count || 0), 'total_cheques_count')),
      b.payment_mode ?? cur.payment_mode, b.escrow_or_bank_ref ?? cur.escrow_or_bank_ref, b.ejari_or_oqood_or_deed_ref ?? cur.ejari_or_oqood_or_deed_ref, b.noc_ref ?? cur.noc_ref,
      b.handover_date ?? cur.handover_date, b.keys_and_meters_summary ?? cur.keys_and_meters_summary,
      b.stages !== undefined ? JSON.stringify(b.stages) : cur.stages_json,
      b.notes ?? cur.notes, ts, id,
    )
    const row = q.get<any>(`SELECT * FROM closing_forensic_dossiers WHERE id = ?`, id)
    const cheques = q.all<any>(`SELECT * FROM closing_cheque_ledger WHERE dossier_id = ? ORDER BY COALESCE(cheque_date, '9999-12-31') ASC, id ASC`, id)
    return { ...row, is_third_party: Boolean(row.is_third_party), stages: safeJson(row.stages_json, []), cheques }
  })

  app.post('/api/shabib-workspace/closings/:id/cheques', async (req, reply) => {
    requireOwnerOnly(req)
    const dossierId = idOf((req.params as any).id)
    const exists = q.val<number>(`SELECT 1 FROM closing_forensic_dossiers WHERE id = ? AND deleted_at IS NULL`, dossierId)
    if (!exists) throw notFound('Closing dossier not found')
    const b = body<Record<string, any>>(req)
    const ins = q.get<{ id: number }>(
      `INSERT INTO closing_cheque_ledger (
        dossier_id, cheque_no, bank_name, payee_name, payer_name, purpose, payment_method, amount_aed, cheque_date, status, cleared_date, notes, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
      dossierId, b.cheque_no || null, b.bank_name || null, b.payee_name || null, b.payer_name || null,
      b.purpose || 'Rent Instalment', b.payment_method || 'Cheque / PDC', Number(b.amount_aed) || 0,
      b.cheque_date || todayStr(), b.status || 'Pending', b.cleared_date || null, b.notes || null, nowIso(),
    )
    reply.status(201)
    return q.get(`SELECT * FROM closing_cheque_ledger WHERE id = ?`, ins!.id)
  })

  app.put('/api/shabib-workspace/closings/:id/cheques/:chequeId', async (req) => {
    requireOwnerOnly(req)
    const dossierId = idOf((req.params as any).id)
    const chequeId = idOf((req.params as any).chequeId)
    const cur = q.get<any>(`SELECT * FROM closing_cheque_ledger WHERE id = ? AND dossier_id = ?`, chequeId, dossierId)
    if (!cur) throw notFound('Cheque entry not found')
    const b = body<Record<string, any>>(req)
    q.run(
      `UPDATE closing_cheque_ledger SET cheque_no = ?, bank_name = ?, payee_name = ?, payer_name = ?, purpose = ?, payment_method = ?, amount_aed = ?, cheque_date = ?, status = ?, cleared_date = ?, notes = ? WHERE id = ?`,
      b.cheque_no ?? cur.cheque_no, b.bank_name ?? cur.bank_name, b.payee_name ?? cur.payee_name, b.payer_name ?? cur.payer_name,
      b.purpose ?? cur.purpose, b.payment_method ?? cur.payment_method,
      b.amount_aed !== undefined ? Number(b.amount_aed) : cur.amount_aed,
      b.cheque_date ?? cur.cheque_date, b.status ?? cur.status,
      b.status === 'Cleared' ? (b.cleared_date || cur.cleared_date || todayStr()) : (b.cleared_date ?? cur.cleared_date),
      b.notes ?? cur.notes, chequeId,
    )
    return q.get(`SELECT * FROM closing_cheque_ledger WHERE id = ?`, chequeId)
  })

  app.delete('/api/shabib-workspace/closings/:id/cheques/:chequeId', async (req) => {
    requireOwnerOnly(req)
    const dossierId = idOf((req.params as any).id)
    const chequeId = idOf((req.params as any).chequeId)
    q.run(`DELETE FROM closing_cheque_ledger WHERE id = ? AND dossier_id = ?`, chequeId, dossierId)
    return { ok: true }
  })

  app.get('/api/shabib-workspace/closings/:id/export', async (req, reply) => {
    requireOwnerOnly(req)
    const id = idOf((req.params as any).id)
    const d = q.get<any>(`SELECT * FROM closing_forensic_dossiers WHERE id = ? AND deleted_at IS NULL`, id)
    if (!d) throw notFound('Closing dossier not found')
    const cheques = q.all<any>(`SELECT * FROM closing_cheque_ledger WHERE dossier_id = ? ORDER BY COALESCE(cheque_date, '9999-12-31') ASC, id ASC`, id)
    const fmt = (['pdf', 'docx', 'jpeg'].includes(String((req.query as any)?.format))
      ? String((req.query as any).format)
      : 'pdf') as ForensicExportFormat
    const { buffer, mime, ext } = await exportStructuredDossier(buildClosingDossierDoc(d, cheques), fmt)
    reply
      .header('content-type', mime)
      .header('content-disposition', `attachment; filename="${d.dossier_no}-${String(d.track).toLowerCase().replace(/\s+/g, '-')}.${ext}"`)
    return buffer
  })

  // =========================================================================
  // 4. AGENT COMMISSIONS & AGENT EXPENSES LEDGER (PAID / RECEIVED / PENDING · CASH / BT / BOTIM · 3RD PARTY)
  // =========================================================================
  app.get('/api/shabib-workspace/commissions-expenses', async (req) => {
    requireOwnerOnly(req)
    const entries = q.all<any>(
      `SELECT * FROM shabib_commission_expenses WHERE deleted_at IS NULL ORDER BY entry_date DESC, id DESC LIMIT 400`,
    ).map(e => ({ ...e, is_third_party: Boolean(e.is_third_party) }))

    // Live OS reference totals (using fromCents for M() money columns)
    const osCommRows = tableExists('agent_commissions')
      ? q.all<any>(`SELECT status, COALESCE(SUM(agent_share), 0) AS agent_share_c, COALESCE(SUM(gross_commission), 0) AS gross_c FROM agent_commissions WHERE deleted_at IS NULL GROUP BY status`)
      : []
    const osExpRows = tableExists('expenses')
      ? q.all<any>(`SELECT status, COALESCE(SUM(amount), 0) AS amt_c FROM expenses WHERE deleted_at IS NULL GROUP BY status`)
      : []

    // Per-agent rollup
    const byAgent = new Map<string, {
      agent_name: string
      commission_received: number
      commission_paid: number
      commission_pending: number
      expenses_total: number
      third_party_total: number
      net_due_aed: number
      entries_count: number
    }>()
    let totalReceived = 0
    let totalPaid = 0
    let totalPending = 0
    let totalExpenses = 0
    let totalThirdParty = 0
    let totalThirdPartyPending = 0
    let totalThirdPartyPaid = 0

    for (const e of entries) {
      const amt = Number(e.net_amount_aed || 0)
      const key = String(e.agent_name || 'Unassigned')
      const cur = byAgent.get(key) ?? {
        agent_name: key,
        commission_received: 0,
        commission_paid: 0,
        commission_pending: 0,
        expenses_total: 0,
        third_party_total: 0,
        net_due_aed: 0,
        entries_count: 0,
      }
      cur.entries_count++
      if (e.entry_type === 'Expense' || e.entry_type === 'Advance') {
        cur.expenses_total += amt
        totalExpenses += amt
      } else if (e.entry_type === '3rd-Party Split') {
        cur.third_party_total += amt
        totalThirdParty += amt
        if (e.status === 'Paid') totalThirdPartyPaid += amt
        else totalThirdPartyPending += amt
      } else {
        if (e.status === 'Received') { cur.commission_received += amt; totalReceived += amt }
        else if (e.status === 'Paid') { cur.commission_paid += amt; totalPaid += amt }
        else { cur.commission_pending += amt; totalPending += amt }
      }
      // Paid rows are already settled to the agent; unpaid earned balance = (received + pending) - expenses/advances
      cur.net_due_aed = Math.round((cur.commission_received + cur.commission_pending - cur.expenses_total) * 100) / 100
      byAgent.set(key, cur)
    }

    return {
      entries,
      agent_summary: [...byAgent.values()].sort((a, b) => b.net_due_aed - a.net_due_aed),
      payment_modes: SHABIB_PAYMENT_MODES,
      totals: {
        received_aed: Math.round(totalReceived * 100) / 100,
        paid_aed: Math.round(totalPaid * 100) / 100,
        pending_aed: Math.round(totalPending * 100) / 100,
        expenses_aed: Math.round(totalExpenses * 100) / 100,
        third_party_aed: Math.round(totalThirdParty * 100) / 100,
        third_party_pending_aed: Math.round(totalThirdPartyPending * 100) / 100,
        third_party_paid_aed: Math.round(totalThirdPartyPaid * 100) / 100,
        net_payable_aed: Math.round((totalReceived + totalPending - totalExpenses) * 100) / 100,
      },
      os_sync_reference: {
        agent_commissions: osCommRows.map(r => ({ status: r.status, agent_share_aed: fromCents(r.agent_share_c), gross_aed: fromCents(r.gross_c) })),
        employee_expenses: osExpRows.map(r => ({ status: r.status, amount_aed: fromCents(r.amt_c) })),
      },
    }
  })

  app.post('/api/shabib-workspace/commissions-expenses', async (req, reply) => {
    const owner = requireOwnerOnly(req)
    const b = body<Record<string, any>>(req)
    const agentName = String(b.agent_name || '').trim()
    const netAmt = Number(b.net_amount_aed)
    if (!agentName || !Number.isFinite(netAmt) || netAmt <= 0) {
      throw bad('agent_name and positive net_amount_aed are required')
    }
    const entryType = ['Commission', 'Expense', 'Advance', '3rd-Party Split'].includes(String(b.entry_type))
      ? String(b.entry_type)
      : 'Commission'
    const status = ['Pending', 'Received', 'Paid'].includes(String(b.status)) ? String(b.status) : 'Pending'
    const entryNo = nextCode('shabib_commission_expenses', 'entry_no', entryType === 'Expense' ? 'AEX' : 'CEX')
    const ts = nowIso()

    const ins = q.get<{ id: number }>(
      `INSERT INTO shabib_commission_expenses (
        entry_no, entry_type, agent_id, employee_id, agent_name, deal_ref, property_label, track,
        gross_amount_aed, split_pct, net_amount_aed, status, payment_mode, payment_reference,
        entry_date, settled_date, expense_category,
        is_third_party, third_party_agency, third_party_agent_name, third_party_brn, third_party_phone, third_party_email, third_party_payment_details,
        notes, created_by, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
      entryNo, entryType,
      b.agent_id ? Number(b.agent_id) : null,
      b.employee_id ? Number(b.employee_id) : null,
      agentName, b.deal_ref || null, b.property_label || null, b.track || 'Secondary',
      Number(b.gross_amount_aed) || netAmt,
      b.split_pct !== undefined ? Number(b.split_pct) : 50,
      netAmt, status, b.payment_mode || 'Bank Transfer (BT)', b.payment_reference || null,
      String(b.entry_date || todayStr()).slice(0, 10),
      status === 'Paid' || status === 'Received' ? (b.settled_date || todayStr()) : null,
      b.expense_category || null,
      b.is_third_party ? 1 : 0,
      b.third_party_agency || null, b.third_party_agent_name || null, b.third_party_brn || null,
      b.third_party_phone || null, b.third_party_email || null, b.third_party_payment_details || null,
      b.notes || null, owner.id, ts, ts,
    )
    const row = q.get<any>(`SELECT * FROM shabib_commission_expenses WHERE id = ?`, ins!.id)
    reply.status(201)
    return { ...row, is_third_party: Boolean(row.is_third_party) }
  })

  app.put('/api/shabib-workspace/commissions-expenses/:id', async (req) => {
    requireOwnerOnly(req)
    const id = idOf((req.params as any).id)
    const cur = q.get<any>(`SELECT * FROM shabib_commission_expenses WHERE id = ? AND deleted_at IS NULL`, id)
    if (!cur) throw notFound('Entry not found')
    const b = body<Record<string, any>>(req)
    const entryType = b.entry_type !== undefined ? String(b.entry_type) : cur.entry_type
    if (!VALID_COMM_TYPES.has(entryType)) throw bad('entry_type must be Commission, Expense, Advance, or 3rd-Party Split')
    const status = b.status !== undefined ? String(b.status) : cur.status
    if (!VALID_COMM_STATUSES.has(status)) throw bad('status must be Pending, Received, or Paid')
    const netAmt = numOrKeep(b.net_amount_aed, Number(cur.net_amount_aed), 'net_amount_aed', true)
    const grossAmt = numOrKeep(b.gross_amount_aed, Number(cur.gross_amount_aed || netAmt), 'gross_amount_aed')
    const splitPct = numOrKeep(b.split_pct, Number(cur.split_pct ?? 50), 'split_pct')
    const settled = (status === 'Paid' || status === 'Received') ? (b.settled_date || cur.settled_date || todayStr()) : null
    q.run(
      `UPDATE shabib_commission_expenses SET
        entry_type = ?, agent_name = ?, deal_ref = ?, property_label = ?, track = ?,
        gross_amount_aed = ?, split_pct = ?, net_amount_aed = ?, status = ?, payment_mode = ?, payment_reference = ?,
        entry_date = ?, settled_date = ?, expense_category = ?,
        is_third_party = ?, third_party_agency = ?, third_party_agent_name = ?, third_party_brn = ?, third_party_phone = ?, third_party_email = ?, third_party_payment_details = ?,
        notes = ?, updated_at = ?
       WHERE id = ?`,
      entryType, b.agent_name ?? cur.agent_name, b.deal_ref ?? cur.deal_ref, b.property_label ?? cur.property_label, b.track ?? cur.track,
      grossAmt,
      splitPct,
      netAmt,
      status, b.payment_mode ?? cur.payment_mode, b.payment_reference ?? cur.payment_reference,
      b.entry_date ?? cur.entry_date, settled, b.expense_category ?? cur.expense_category,
      b.is_third_party !== undefined ? (b.is_third_party ? 1 : 0) : cur.is_third_party,
      b.third_party_agency ?? cur.third_party_agency, b.third_party_agent_name ?? cur.third_party_agent_name, b.third_party_brn ?? cur.third_party_brn,
      b.third_party_phone ?? cur.third_party_phone, b.third_party_email ?? cur.third_party_email, b.third_party_payment_details ?? cur.third_party_payment_details,
      b.notes ?? cur.notes, nowIso(), id,
    )
    const row = q.get<any>(`SELECT * FROM shabib_commission_expenses WHERE id = ?`, id)
    return { ...row, is_third_party: Boolean(row.is_third_party) }
  })

  app.delete('/api/shabib-workspace/commissions-expenses/:id', async (req) => {
    requireOwnerOnly(req)
    const id = idOf((req.params as any).id)
    q.run(`UPDATE shabib_commission_expenses SET deleted_at = ?, updated_at = ? WHERE id = ?`, nowIso(), nowIso(), id)
    return { ok: true }
  })

  app.get('/api/shabib-workspace/commissions-expenses/export', async (req, reply) => {
    requireOwnerOnly(req)
    const qry = (req.query ?? {}) as Record<string, string>
    const fmt = (['pdf', 'docx', 'jpeg'].includes(String(qry.format)) ? String(qry.format) : 'pdf') as ForensicExportFormat
    const agentFilter = String(qry.agent_name || '').trim()
    const rows = agentFilter
      ? q.all<any>(`SELECT * FROM shabib_commission_expenses WHERE deleted_at IS NULL AND lower(agent_name) = lower(?) ORDER BY entry_date DESC, id DESC`, agentFilter)
      : q.all<any>(`SELECT * FROM shabib_commission_expenses WHERE deleted_at IS NULL ORDER BY entry_date DESC, id DESC LIMIT 200`)

    const received = rows.filter(r => r.entry_type !== 'Expense' && r.entry_type !== 'Advance' && r.status === 'Received').reduce((s, r) => s + Number(r.net_amount_aed || 0), 0)
    const paid = rows.filter(r => r.entry_type !== 'Expense' && r.entry_type !== 'Advance' && r.status === 'Paid').reduce((s, r) => s + Number(r.net_amount_aed || 0), 0)
    const pending = rows.filter(r => r.entry_type !== 'Expense' && r.entry_type !== 'Advance' && r.status === 'Pending').reduce((s, r) => s + Number(r.net_amount_aed || 0), 0)
    const expenses = rows.filter(r => r.entry_type === 'Expense' || r.entry_type === 'Advance').reduce((s, r) => s + Number(r.net_amount_aed || 0), 0)

    const doc: StructuredForensicDoc = {
      eyebrow: 'SWK OWNER COMMISSION & AGENT EXPENSE STATEMENT',
      refNo: `CEX-STMT-${todayStr()}`,
      title: agentFilter ? `Commission & Expense Ledger — ${agentFilter}` : 'Consolidated Agent Commissions & Expenses Ledger',
      subtitle: `Paid / Received / Pending · Cash / Bank Transfer (BT) / Botim / Cheque · 3rd-Party Splits`,
      badges: [
        `Received: ${aed(received)}`,
        `Paid: ${aed(paid)}`,
        `Pending: ${aed(pending)}`,
        `Expenses: ${aed(expenses)}`,
      ],
      sections: [
        {
          title: '1. Settlement Totals',
          pairs: [
            ['Commissions Received', aed(received)],
            ['Commissions Paid Out', aed(paid)],
            ['Commissions Pending', aed(pending)],
            ['Agent Expenses / Advances', aed(expenses)],
          ],
        },
        {
          title: '2. Itemised Ledger (Commissions, Expenses & 3rd-Party Splits)',
          table: {
            headers: ['Ref', 'Date', 'Type', 'Agent', 'Status', 'Mode', 'Amount', '3rd Party / Notes'],
            rows: rows.length
              ? rows.map(r => [
                  String(r.entry_no),
                  String(r.entry_date),
                  String(r.entry_type),
                  String(r.agent_name),
                  String(r.status),
                  String(r.payment_mode),
                  aed(r.net_amount_aed),
                  r.is_third_party
                    ? `${r.third_party_agency || ''} ${r.third_party_agent_name || ''} (${r.third_party_phone || ''})`.trim()
                    : String(r.deal_ref || r.expense_category || r.notes || '—'),
                ])
              : [['—', '—', 'No entries yet', '—', '—', '—', '—', '—']],
          },
        },
      ],
    }
    const { buffer, mime, ext } = await exportStructuredDossier(doc, fmt)
    reply
      .header('content-type', mime)
      .header('content-disposition', `attachment; filename="swk-commissions-expenses-${todayStr()}.${ext}"`)
    return buffer
  })

  // =========================================================================
  // 5. LEGAL QUICK-LAUNCH SHELF METADATA (OWNER ONLY)
  // =========================================================================
  app.get('/api/shabib-workspace/legal-shelf', async (req) => {
    requireOwnerOnly(req)
    const templates = q.all<any>(
      `SELECT id, code, title, category, kind, description, content
       FROM doc_templates
       WHERE deleted_at IS NULL AND COALESCE(active, 1) = 1
       ORDER BY code ASC`,
    )
    const byCode = new Map(templates.map(t => [String(t.code), t]))
    const featured = SHABIB_LEGAL_QUICK_SHELF.map(s => {
      const tpl = byCode.get(s.code)
      return {
        ...s,
        template_id: tpl?.id ?? null,
        title: tpl?.title ?? s.short,
        description: tpl?.description ?? '',
        content: tpl?.content ?? '',
      }
    })
    return {
      featured,
      all_templates: templates.map(t => ({
        id: t.id,
        code: t.code,
        title: t.title,
        category: t.category,
        kind: t.kind,
        description: t.description,
      })),
    }
  })
}
