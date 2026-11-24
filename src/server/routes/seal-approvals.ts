import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { inDemo, q } from '../db'
import { audit, getDef, type SessionUser } from '../engine'
import { notify } from '../notify'
import { bad, forbidden, notFound, nowIso } from '../util'
import { idOf } from './helpers'
import {
  canRequestCompanySeal,
  canUseCompanySealDirectly,
  isOwnerSwkUser,
} from '../../shared/swk-staff-access'

export type SealSourceType = 'studio' | 'word' | 'print'

export interface SealApprovalRecord {
  id: number
  requester_user_id: number
  requester_name: string
  requester_email: string
  requester_role: string
  source_type: SealSourceType
  source_id: number | null
  document_title: string
  recipient_name: string | null
  reason: string
  include_seal: boolean
  include_signature: boolean
  status: 'Pending' | 'Approved' | 'Rejected'
  decided_by_user_id: number | null
  decided_by_name: string | null
  decision_note: string | null
  decided_at: string | null
  expires_at: string | null
  created_at: string
}

function shapeRow(r: any): SealApprovalRecord {
  return {
    id: Number(r.id),
    requester_user_id: Number(r.requester_user_id),
    requester_name: String(r.requester_name ?? ''),
    requester_email: String(r.requester_email ?? ''),
    requester_role: String(r.requester_role ?? ''),
    source_type: (r.source_type || 'studio') as SealSourceType,
    source_id: r.source_id != null ? Number(r.source_id) : null,
    document_title: String(r.document_title ?? ''),
    recipient_name: r.recipient_name ? String(r.recipient_name) : null,
    reason: String(r.reason ?? ''),
    include_seal: Boolean(r.include_seal),
    include_signature: Boolean(r.include_signature),
    status: (r.status || 'Pending') as 'Pending' | 'Approved' | 'Rejected',
    decided_by_user_id: r.decided_by_user_id != null ? Number(r.decided_by_user_id) : null,
    decided_by_name: r.decided_by_name ? String(r.decided_by_name) : null,
    decision_note: r.decision_note ? String(r.decision_note) : null,
    decided_at: r.decided_at ? String(r.decided_at) : null,
    expires_at: r.expires_at ? String(r.expires_at) : null,
    created_at: String(r.created_at ?? ''),
  }
}

export function findActiveSealApprovals(
  userId: number,
  sourceType: SealSourceType,
  sourceId?: number | null,
): SealApprovalRecord[] {
  const now = nowIso()
  const rows =
    sourceId != null
      ? q.all<any>(
          `SELECT * FROM document_seal_approvals
           WHERE requester_user_id = ?
             AND source_type = ?
             AND (source_id = ? OR source_id IS NULL)
             AND status = 'Approved'
             AND (expires_at IS NULL OR expires_at > ?)
           ORDER BY id DESC`,
          userId,
          sourceType,
          sourceId,
          now,
        )
      : q.all<any>(
          `SELECT * FROM document_seal_approvals
           WHERE requester_user_id = ?
             AND source_type = ?
             AND status = 'Approved'
             AND (expires_at IS NULL OR expires_at > ?)
           ORDER BY id DESC`,
          userId,
          sourceType,
          now,
        )
  return rows.map(shapeRow)
}

export function hasApprovedSealUsage(
  userId: number,
  sourceType: SealSourceType,
  sourceId: number | null,
  needSeal: boolean,
  needSignature: boolean,
): boolean {
  if (!needSeal && !needSignature) return true
  const active = findActiveSealApprovals(userId, sourceType, sourceId)
  const hasSeal = !needSeal || active.some(a => a.include_seal)
  const hasSig = !needSignature || active.some(a => a.include_signature)
  return hasSeal && hasSig
}

export function assertSealOrSignatureAuthorized(
  user: SessionUser | null | undefined,
  opts: {
    sourceType: SealSourceType
    sourceId?: number | null
    needSeal: boolean
    needSignature: boolean
    allowDemoBypass?: boolean
  },
): void {
  if (!opts.needSeal && !opts.needSignature) return
  if (!user || user.party_id) {
    throw forbidden('Only authorized company staff can attach the company seal or owner signature.')
  }
  if (canUseCompanySealDirectly(user)) return
  if (opts.allowDemoBypass && inDemo() && String(user.email || '').trim().toLowerCase() === 'demo@swkpropertiesuae.com') {
    return
  }
  if (!canRequestCompanySeal(user)) {
    throw forbidden('Only Owner, Admin, HR, and Office Admin can request or use the company seal and signature.')
  }
  if (hasApprovedSealUsage(user.id, opts.sourceType, opts.sourceId ?? null, opts.needSeal, opts.needSignature)) {
    return
  }
  const items = [opts.needSeal && 'Company Seal', opts.needSignature && 'Owner Signature'].filter(Boolean).join(' & ')
  throw forbidden(
    `Owner approval required: ${user.role_name || 'Staff'} must obtain approval from Owner Shabib Siraj before applying the ${items}.`,
  )
}

export default async function sealApprovalsRoutes(app: FastifyInstance) {
  app.get('/api/seal-approvals', async (req) => {
    const user = req.user
    if (!user || user.party_id || !canRequestCompanySeal(user)) {
      throw forbidden('Only Owner, Admin, HR, and Office Admin can view company seal and signature approvals.')
    }
    const qs = (req.query ?? {}) as Record<string, any>
    const statusFilter = typeof qs.status === 'string' && ['Pending', 'Approved', 'Rejected'].includes(qs.status) ? qs.status : ''
    const isOwner = isOwnerSwkUser(user)
    const where: string[] = []
    const params: any[] = []
    if (!isOwner) {
      where.push('requester_user_id = ?')
      params.push(user.id)
    }
    if (statusFilter) {
      where.push('status = ?')
      params.push(statusFilter)
    }
    const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const rows = q
      .all<any>(`SELECT * FROM document_seal_approvals ${sqlWhere} ORDER BY CASE WHEN status = 'Pending' THEN 0 ELSE 1 END, id DESC LIMIT 150`, ...params)
      .map(shapeRow)
    const pendingCount = isOwner
      ? (q.val<number>(`SELECT COUNT(*) FROM document_seal_approvals WHERE status = 'Pending'`) ?? 0)
      : (q.val<number>(`SELECT COUNT(*) FROM document_seal_approvals WHERE requester_user_id = ? AND status = 'Pending'`, user.id) ?? 0)
    return {
      rows,
      pending_count: pendingCount,
      can_approve: isOwner,
      can_use_direct: canUseCompanySealDirectly(user),
    }
  })

  app.get('/api/seal-approvals/check', async (req) => {
    const user = req.user
    if (!user || user.party_id) {
      return { canDirect: false, canRequest: false, approvedSeal: false, approvedSignature: false, pending: null, latest: null }
    }
    const qs = z
      .object({
        source_type: z.enum(['studio', 'word', 'print']).default('studio'),
        source_id: z.coerce.number().int().positive().optional(),
      })
      .parse(req.query ?? {})
    const canDirect = canUseCompanySealDirectly(user)
    const canRequest = canRequestCompanySeal(user)
    if (canDirect) {
      return { canDirect: true, canRequest: true, approvedSeal: true, approvedSignature: true, pending: null, latest: null }
    }
    if (!canRequest) {
      return { canDirect: false, canRequest: false, approvedSeal: false, approvedSignature: false, pending: null, latest: null }
    }
    const active = findActiveSealApprovals(user.id, qs.source_type, qs.source_id ?? null)
    const pendingRow =
      qs.source_id != null
        ? q.get<any>(
            `SELECT * FROM document_seal_approvals
             WHERE requester_user_id = ? AND source_type = ? AND (source_id = ? OR source_id IS NULL) AND status = 'Pending'
             ORDER BY id DESC LIMIT 1`,
            user.id,
            qs.source_type,
            qs.source_id,
          )
        : q.get<any>(
            `SELECT * FROM document_seal_approvals
             WHERE requester_user_id = ? AND source_type = ? AND status = 'Pending'
             ORDER BY id DESC LIMIT 1`,
            user.id,
            qs.source_type,
          )
    const latestRow =
      qs.source_id != null
        ? q.get<any>(
            `SELECT * FROM document_seal_approvals
             WHERE requester_user_id = ? AND source_type = ? AND (source_id = ? OR source_id IS NULL)
             ORDER BY id DESC LIMIT 1`,
            user.id,
            qs.source_type,
            qs.source_id,
          )
        : q.get<any>(
            `SELECT * FROM document_seal_approvals
             WHERE requester_user_id = ? AND source_type = ?
             ORDER BY id DESC LIMIT 1`,
            user.id,
            qs.source_type,
          )
    return {
      canDirect: false,
      canRequest: true,
      approvedSeal: active.some(a => a.include_seal),
      approvedSignature: active.some(a => a.include_signature),
      pending: pendingRow ? shapeRow(pendingRow) : null,
      latest: latestRow ? shapeRow(latestRow) : null,
    }
  })

  app.post('/api/seal-approvals', async (req, reply) => {
    const user = req.user
    if (!user || user.party_id || !canRequestCompanySeal(user)) {
      throw forbidden('Only Owner, Admin, HR, and Office Admin can request company seal or signature authorization.')
    }
    const b = z
      .object({
        source_type: z.enum(['studio', 'word', 'print']).default('studio'),
        source_id: z.number().int().positive().nullable().optional(),
        document_title: z.string().trim().min(2).max(200),
        recipient_name: z.string().trim().max(160).optional(),
        reason: z.string().trim().min(5).max(1000),
        include_seal: z.boolean().default(true),
        include_signature: z.boolean().default(true),
      })
      .parse(req.body ?? {})
    if (!b.include_seal && !b.include_signature) {
      throw bad('Select at least one of Company Seal or Owner Signature.')
    }
    const now = nowIso()
    const id = q.insert(
      `INSERT INTO document_seal_approvals (
        requester_user_id, requester_name, requester_email, requester_role,
        source_type, source_id, document_title, recipient_name, reason,
        include_seal, include_signature, status, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      user.id,
      user.name || user.email,
      user.email,
      user.role_name || 'Staff',
      b.source_type,
      b.source_id ?? null,
      b.document_title,
      b.recipient_name || null,
      b.reason,
      b.include_seal ? 1 : 0,
      b.include_signature ? 1 : 0,
      'Pending',
      now,
    )
    const row = shapeRow(q.get<any>(`SELECT * FROM document_seal_approvals WHERE id = ?`, id)!)
    const owner = q.get<{ id: number }>(
      `SELECT id FROM users WHERE lower(email) = 'shabib@swk.properties' AND deleted_at IS NULL AND active = 1 LIMIT 1`,
    )
    const items = [b.include_seal && 'Company Seal', b.include_signature && 'Owner Signature'].filter(Boolean).join(' + ')
    if (owner) {
      notify(
        owner.id,
        `Seal Approval Requested: ${b.document_title}`,
        `${user.name} (${user.role_name}) requested ${items} for "${b.document_title}". Reason: ${b.reason}`,
        '/dashboard',
        'approval',
        `seal-req:${id}`,
      )
    }
    audit(req.ctx, getDef('studio_documents'), b.source_id ?? id, 'seal_approval_requested', { items: [null, items], document_title: [null, b.document_title] }, b.document_title)
    reply.code(201)
    return row
  })

  app.post('/api/seal-approvals/:id/decide', async (req) => {
    const user = req.user
    if (!user || !isOwnerSwkUser(user)) {
      throw forbidden('Only Owner Shabib Siraj (shabib@swk.properties) can approve or reject company seal & signature requests.')
    }
    const id = idOf((req.params as any).id)
    const existing = q.get<any>(`SELECT * FROM document_seal_approvals WHERE id = ?`, id)
    if (!existing) throw notFound('Seal approval request not found')
    if (existing.status !== 'Pending') throw bad(`This request is already ${existing.status}.`)
    const b = z
      .object({
        decision: z.enum(['Approved', 'Rejected']),
        note: z.string().trim().max(500).optional(),
        valid_days: z.number().int().min(1).max(30).default(7),
      })
      .parse(req.body ?? {})
    const now = nowIso()
    const expiresAt = b.decision === 'Approved' ? new Date(Date.now() + b.valid_days * 86400_000).toISOString() : null
    q.run(
      `UPDATE document_seal_approvals
       SET status = ?, decided_by_user_id = ?, decided_by_name = ?, decision_note = ?, decided_at = ?, expires_at = ?
       WHERE id = ?`,
      b.decision,
      user.id,
      user.name || 'Shabib Siraj',
      b.note || null,
      now,
      expiresAt,
      id,
    )
    const updated = shapeRow(q.get<any>(`SELECT * FROM document_seal_approvals WHERE id = ?`, id)!)
    const targetLink =
      updated.source_type === 'studio' && updated.source_id
        ? `/studio/${updated.source_id}`
        : updated.source_type === 'word'
          ? '/utilities'
          : '/dashboard'
    notify(
      updated.requester_user_id,
      `Seal & Signature ${b.decision}: ${updated.document_title}`,
      b.decision === 'Approved'
        ? `Owner Shabib Siraj approved your seal/signature request for "${updated.document_title}" (valid ${b.valid_days} days).${b.note ? ` Note: ${b.note}` : ''}`
        : `Owner Shabib Siraj declined your seal/signature request for "${updated.document_title}".${b.note ? ` Reason: ${b.note}` : ''}`,
      targetLink,
      b.decision === 'Approved' ? 'info' : 'warning',
      `seal-dec:${id}:${b.decision}`,
    )
    audit(req.ctx, getDef('studio_documents'), updated.source_id ?? id, `seal_approval_${b.decision.toLowerCase()}`, { status: ['Pending', b.decision], note: [null, b.note || ''] }, updated.document_title)
    return updated
  })
}
