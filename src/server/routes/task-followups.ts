import type { FastifyInstance, FastifyRequest } from 'fastify'
import { q, tableExists } from '../db'
import { audit, can, getDef } from '../engine'
import { notify } from '../notify'
import { bad, forbidden, notFound, nowIso, safeJson } from '../util'
import { isAdminSwkUser, isOwnerSwkUser } from '../../shared/swk-staff-access'
import {
  mapFollowUpStageToTaskStatus,
  TASK_FOLLOWUP_CHANNELS,
  TASK_FOLLOWUP_OUTCOMES,
  TASK_FOLLOWUP_STAGES,
  type TaskAttachmentItem,
  type TaskFollowUpChannel,
  type TaskFollowUpEntry,
  type TaskFollowUpOutcome,
  type TaskFollowUpStage,
  type TaskFollowUpSummary,
} from '../../shared/task-followups'
import { body, idOf } from './helpers'

function canAccessTask(req: FastifyRequest, task: any, mode: 'view' | 'edit'): boolean {
  const user = req.user
  if (!user || user.party_id) return false
  if (isOwnerSwkUser(user) || isAdminSwkUser(user)) return true
  if (Number(task.assignee_id) === Number(user.id) || Number(task.created_by) === Number(user.id)) return true
  return can(user, 'projects', mode)
}

function shapeAttachment(row: any): TaskAttachmentItem {
  return {
    id: Number(row.id),
    file_name: String(row.file_name || 'file'),
    size: Number(row.size || 0),
    mime: row.mime ?? null,
    category: row.category ?? 'General',
    doc_version: Number(row.doc_version || 1),
    expiry_date: row.expiry_date ?? null,
    note: row.note ?? null,
    created_at: String(row.created_at || ''),
    uploader_name: row.uploader_name ?? null,
    download_url: `/api/files/${row.id}/download`,
  }
}

export function hydrateRecordAttachments<T extends Record<string, any>>(
  entity: string,
  rows: T[],
): Array<T & { _attachments: TaskAttachmentItem[]; _attachment_count: number }> {
  if (!rows.length || !tableExists('attachments')) {
    return rows.map(r => ({ ...r, _attachments: [], _attachment_count: 0 }))
  }
  const ids = [...new Set(rows.map(r => Number(r.id)).filter(n => Number.isInteger(n) && n > 0))]
  if (!ids.length) {
    return rows.map(r => ({ ...r, _attachments: [], _attachment_count: 0 }))
  }
  const placeholders = ids.map(() => '?').join(',')
  const attRows = q.all<any>(
    `SELECT a.id, a.link_id, a.file_name, a.size, a.mime, a.category, a.doc_version, a.expiry_date, a.note, a.created_at, u.name AS uploader_name
     FROM attachments a
     LEFT JOIN users u ON u.id = a.created_by
     WHERE a.link_entity = ? AND a.link_id IN (${placeholders}) AND a.deleted_at IS NULL
     ORDER BY a.id DESC`,
    entity,
    ...ids,
  )
  const byId = new Map<number, TaskAttachmentItem[]>()
  for (const a of attRows) {
    const lid = Number(a.link_id)
    const list = byId.get(lid) ?? []
    list.push(shapeAttachment(a))
    byId.set(lid, list)
  }
  return rows.map(r => {
    const atts = byId.get(Number(r.id)) ?? []
    return { ...r, _attachments: atts, _attachment_count: atts.length }
  })
}

export function hydrateTasksWithFollowUps<T extends Record<string, any>>(
  tasks: T[],
): Array<
  T & {
    _attachments: TaskAttachmentItem[]
    _attachment_count: number
    _followup_count: number
    _followup_stage: TaskFollowUpStage
    _next_followup_date: string | null
    _next_followup_time: string | null
    _next_action: string | null
    _last_followup: TaskFollowUpSummary['last_followup']
  }
> {
  if (!tasks.length) return []
  const ids = [...new Set(tasks.map(t => Number(t.id)).filter(n => Number.isInteger(n) && n > 0))]
  const attByTask = new Map<number, TaskAttachmentItem[]>()
  const fuByTask = new Map<number, any[]>()

  if (ids.length) {
    const ph = ids.map(() => '?').join(',')
    if (tableExists('attachments')) {
      const attRows = q.all<any>(
        `SELECT a.id, a.link_id, a.file_name, a.size, a.mime, a.category, a.doc_version, a.expiry_date, a.note, a.created_at, u.name AS uploader_name
         FROM attachments a
         LEFT JOIN users u ON u.id = a.created_by
         WHERE a.link_entity = 'tasks' AND a.link_id IN (${ph}) AND a.deleted_at IS NULL
         ORDER BY a.id DESC`,
        ...ids,
      )
      for (const a of attRows) {
        const lid = Number(a.link_id)
        const list = attByTask.get(lid) ?? []
        list.push(shapeAttachment(a))
        attByTask.set(lid, list)
      }
    }
    if (tableExists('task_followups')) {
      const fuRows = q.all<any>(
        `SELECT id, task_id, author_id, author_name, channel, outcome, stage, note, next_action, next_followup_date, next_followup_time, created_at
         FROM task_followups
         WHERE task_id IN (${ph})
         ORDER BY id DESC`,
        ...ids,
      )
      for (const f of fuRows) {
        const tid = Number(f.task_id)
        const list = fuByTask.get(tid) ?? []
        list.push(f)
        fuByTask.set(tid, list)
      }
    }
  }

  return tasks.map(t => {
    const tid = Number(t.id)
    const atts = attByTask.get(tid) ?? []
    const fus = fuByTask.get(tid) ?? []
    const latest = fus[0] ?? null
    const stage: TaskFollowUpStage =
      t.status === 'Done'
        ? 'Done'
        : latest?.stage && (TASK_FOLLOWUP_STAGES as readonly string[]).includes(String(latest.stage)) && latest.stage !== 'Done'
          ? (latest.stage as TaskFollowUpStage)
          : t.status === 'Blocked'
            ? 'Blocked'
            : t.status === 'In progress'
              ? 'In progress'
              : 'To do'

    return {
      ...t,
      _attachments: atts,
      _attachment_count: atts.length,
      _followup_count: fus.length,
      _followup_stage: stage,
      _next_followup_date: stage === 'Done' ? null : (latest?.next_followup_date ?? null),
      _next_followup_time: stage === 'Done' ? null : (latest?.next_followup_time ?? null),
      _next_action: stage === 'Done' ? null : (latest?.next_action ?? null),
      _last_followup: latest
        ? {
            id: Number(latest.id),
            channel: String(latest.channel),
            outcome: String(latest.outcome),
            stage: String(latest.stage),
            note: String(latest.note),
            author_name: String(latest.author_name),
            created_at: String(latest.created_at),
          }
        : null,
    }
  })
}

function loadTaskFollowUpBundle(taskId: number, taskRow: any) {
  const attRows = tableExists('attachments')
    ? q.all<any>(
        `SELECT a.id, a.file_name, a.size, a.mime, a.category, a.doc_version, a.expiry_date, a.note, a.created_at, u.name AS uploader_name
         FROM attachments a
         LEFT JOIN users u ON u.id = a.created_by
         WHERE a.link_entity = 'tasks' AND a.link_id = ? AND a.deleted_at IS NULL
         ORDER BY a.id DESC`,
        taskId,
      )
    : []
  const attachments = attRows.map(shapeAttachment)
  const attById = new Map<number, TaskAttachmentItem>(attachments.map(a => [a.id, a]))

  const fuRows = tableExists('task_followups')
    ? q.all<any>(`SELECT * FROM task_followups WHERE task_id = ? ORDER BY id DESC LIMIT 100`, taskId)
    : []

  const followups: TaskFollowUpEntry[] = fuRows.map(r => {
    const ids = safeJson<number[]>(r.attachment_ids_json, [])
    const validIds = Array.isArray(ids) ? ids.map(Number).filter(n => Number.isInteger(n) && n > 0) : []
    return {
      id: Number(r.id),
      task_id: Number(r.task_id),
      author_id: Number(r.author_id),
      author_name: String(r.author_name || 'Staff'),
      channel: ((TASK_FOLLOWUP_CHANNELS as readonly string[]).includes(r.channel) ? r.channel : 'Call') as TaskFollowUpChannel,
      outcome: ((TASK_FOLLOWUP_OUTCOMES as readonly string[]).includes(r.outcome)
        ? r.outcome
        : 'Reached — Moving Forward') as TaskFollowUpOutcome,
      stage: ((TASK_FOLLOWUP_STAGES as readonly string[]).includes(r.stage) ? r.stage : 'In progress') as TaskFollowUpStage,
      note: String(r.note || ''),
      next_action: r.next_action ?? null,
      next_followup_date: r.next_followup_date ?? null,
      next_followup_time: r.next_followup_time ?? null,
      contact_name: r.contact_name ?? null,
      contact_phone: r.contact_phone ?? null,
      attachment_ids: validIds,
      attachments: validIds.map(id => attById.get(id)).filter((x): x is TaskAttachmentItem => Boolean(x)),
      escalated: Boolean(r.escalated),
      reassigned_to_id: r.reassigned_to_id ? Number(r.reassigned_to_id) : null,
      created_at: String(r.created_at || ''),
    }
  })

  const latest = followups[0] ?? null
  const stage: TaskFollowUpStage =
    taskRow.status === 'Done'
      ? 'Done'
      : latest?.stage && latest.stage !== 'Done'
        ? latest.stage
        : taskRow.status === 'Blocked'
          ? 'Blocked'
          : taskRow.status === 'In progress'
            ? 'In progress'
            : 'To do'

  const summary: TaskFollowUpSummary = {
    stage,
    followup_count: followups.length,
    attachment_count: attachments.length,
    next_followup_date: stage === 'Done' ? null : (latest?.next_followup_date ?? null),
    next_followup_time: stage === 'Done' ? null : (latest?.next_followup_time ?? null),
    next_action: stage === 'Done' ? null : (latest?.next_action ?? null),
    last_followup: latest
      ? {
          id: latest.id,
          channel: latest.channel,
          outcome: latest.outcome,
          stage: latest.stage,
          note: latest.note,
          author_name: latest.author_name,
          created_at: latest.created_at,
        }
      : null,
  }

  return { followups, attachments, summary }
}

export default async function (app: FastifyInstance) {
  app.get('/api/tasks/:id/followups', async req => {
    const taskId = idOf((req.params as any).id)
    const task = q.get<any>(
      `SELECT t.*, u.name AS assignee_name
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assignee_id
       WHERE t.id = ? AND t.deleted_at IS NULL`,
      taskId,
    )
    if (!task) throw notFound('Task not found')
    if (!canAccessTask(req, task, 'view')) {
      throw forbidden('You do not have permission to view follow-ups on this task')
    }

    const staff = q.all<any>(
      `SELECT u.id, u.name, u.email, COALESCE(e.designation, r.name, 'Staff') AS designation
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       LEFT JOIN employees e ON (e.user_id = u.id OR lower(e.email) = lower(u.email)) AND e.deleted_at IS NULL
       WHERE u.deleted_at IS NULL AND u.party_id IS NULL AND COALESCE(u.active, 1) = 1
       ORDER BY u.name ASC`,
    )
    const seen = new Set<number>()
    const dedupStaff = staff.filter(s => {
      const sid = Number(s.id)
      if (seen.has(sid)) return false
      seen.add(sid)
      return true
    })

    const { followups, attachments, summary } = loadTaskFollowUpBundle(taskId, task)
    return { task, summary, followups, attachments, staff: dedupStaff }
  })

  app.post('/api/tasks/:id/followups', async (req, reply) => {
    const taskId = idOf((req.params as any).id)
    const task = q.get<any>(`SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL`, taskId)
    if (!task) throw notFound('Task not found')
    if (!canAccessTask(req, task, 'edit')) {
      throw forbidden('Only the assignee, task creator, or leadership can log follow-ups on this task')
    }

    const b = body<{
      channel?: string
      outcome?: string
      stage?: string
      note?: string
      next_action?: string | null
      next_followup_date?: string | null
      next_followup_time?: string | null
      contact_name?: string | null
      contact_phone?: string | null
      attachment_ids?: number[]
      sync_due_date?: boolean
      escalate?: boolean
      reassign_to_id?: number | null
    }>(req)

    const note = String(b.note || '').trim()
    if (!note) throw bad('Please enter a short follow-up note describing what happened')

    const channel: TaskFollowUpChannel = (TASK_FOLLOWUP_CHANNELS as readonly string[]).includes(String(b.channel))
      ? (b.channel as TaskFollowUpChannel)
      : 'Call'
    const outcome: TaskFollowUpOutcome = (TASK_FOLLOWUP_OUTCOMES as readonly string[]).includes(String(b.outcome))
      ? (b.outcome as TaskFollowUpOutcome)
      : 'Reached — Moving Forward'
    const stage: TaskFollowUpStage = (TASK_FOLLOWUP_STAGES as readonly string[]).includes(String(b.stage))
      ? (b.stage as TaskFollowUpStage)
      : 'In progress'

    const nextAction = String(b.next_action || '').trim() || null
    const nextDate =
      stage === 'Done'
        ? null
        : b.next_followup_date && /^\d{4}-\d{2}-\d{2}$/.test(String(b.next_followup_date).trim())
          ? String(b.next_followup_date).trim()
          : null
    const nextTime = stage === 'Done' ? null : String(b.next_followup_time || '').trim().slice(0, 10) || null
    const contactName = String(b.contact_name || '').trim().slice(0, 140) || null
    const contactPhone = String(b.contact_phone || '').trim().slice(0, 40) || null
    const attachmentIds = Array.isArray(b.attachment_ids)
      ? [...new Set(b.attachment_ids.map(Number).filter(n => Number.isInteger(n) && n > 0))]
      : []
    const escalate = Boolean(b.escalate) || stage === 'Blocked' || outcome === 'Escalated to Leadership'
    const reassignId =
      b.reassign_to_id && Number.isInteger(Number(b.reassign_to_id)) && Number(b.reassign_to_id) !== Number(task.assignee_id)
        ? Number(b.reassign_to_id)
        : null

    const ts = nowIso()
    const entryId = q.insert(
      `INSERT INTO task_followups (
        task_id, author_id, author_name, channel, outcome, stage, note,
        next_action, next_followup_date, next_followup_time,
        contact_name, contact_phone, attachment_ids_json, escalated, reassigned_to_id, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      taskId,
      req.user!.id,
      req.user!.name || req.user!.email,
      channel,
      outcome,
      stage,
      note,
      nextAction,
      nextDate,
      nextTime,
      contactName,
      contactPhone,
      JSON.stringify(attachmentIds),
      escalate ? 1 : 0,
      reassignId,
      ts,
    )

    const nextStatus = mapFollowUpStageToTaskStatus(stage)
    const nextDue = b.sync_due_date && nextDate ? nextDate : task.due_date
    const nextAssignee = reassignId ?? task.assignee_id

    q.run(
      `UPDATE tasks
       SET status = ?, due_date = ?, assignee_id = ?, completed_at = ?, updated_at = ?, updated_by = ?, version = COALESCE(version, 1) + 1
       WHERE id = ?`,
      nextStatus,
      nextDue,
      nextAssignee,
      nextStatus === 'Done' ? ts : null,
      ts,
      req.user!.id,
      taskId,
    )

    // Ensure any newly attached files are bound to this task
    if (attachmentIds.length > 0 && tableExists('attachments')) {
      const ph = attachmentIds.map(() => '?').join(',')
      q.run(
        `UPDATE attachments SET link_entity = 'tasks', link_id = ?, link_label = ? WHERE id IN (${ph}) AND deleted_at IS NULL`,
        taskId,
        String(task.title || `Task #${taskId}`),
        ...attachmentIds,
      )
    }

    audit(
      req.ctx,
      getDef('tasks'),
      taskId,
      'followup',
      {
        channel: [null, channel],
        stage: [task.status, stage],
        outcome: [null, outcome],
        ...(nextDate ? { next_followup_date: [null, nextDate] } : {}),
        ...(reassignId ? { assignee_id: [task.assignee_id, reassignId] } : {}),
      },
      String(task.title || `Task #${taskId}`),
    )

    if (reassignId && reassignId !== req.user!.id) {
      notify(
        reassignId,
        `Task Reassigned: ${task.title}`,
        `${req.user!.name} logged a ${channel} follow-up and reassigned this task to you. ${nextAction || note}`.slice(0, 180),
        `/e/tasks/${taskId}`,
        'info',
      )
    }
    if (escalate) {
      const leaders = q.all<{ id: number }>(
        `SELECT u.id FROM users u LEFT JOIN roles r ON r.id = u.role_id
         WHERE u.deleted_at IS NULL AND COALESCE(u.active, 1) = 1 AND u.party_id IS NULL
           AND (lower(u.email) IN ('shabib@swk.properties', 'haseeb@swkproperties.com') OR lower(COALESCE(r.name, '')) IN ('owner', 'admin'))`,
      )
      for (const l of leaders) {
        if (Number(l.id) === Number(req.user!.id)) continue
        notify(
          Number(l.id),
          `Task Escalated: ${task.title}`,
          `${req.user!.name} (${channel} · ${stage}): ${note}`.slice(0, 180),
          `/e/tasks/${taskId}`,
          'warning',
        )
      }
    }

    const updatedTask = q.get<any>(
      `SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id WHERE t.id = ?`,
      taskId,
    )
    const { followups, attachments, summary } = loadTaskFollowUpBundle(taskId, updatedTask)
    const entry = followups.find(f => f.id === entryId) ?? followups[0] ?? null

    reply.status(201)
    return { ok: true, task: updatedTask, entry, followups, attachments, summary }
  })

  app.delete('/api/tasks/:id/followups/:fid', async req => {
    const taskId = idOf((req.params as any).id)
    const fid = idOf((req.params as any).fid)
    const row = q.get<any>(`SELECT * FROM task_followups WHERE id = ? AND task_id = ?`, fid, taskId)
    if (!row) throw notFound('Follow-up entry not found')
    const canDelete =
      Number(row.author_id) === Number(req.user!.id) ||
      isOwnerSwkUser(req.user) ||
      isAdminSwkUser(req.user)
    if (!canDelete) throw forbidden('Only the author, Owner, or Admin can delete this follow-up entry')
    q.run(`DELETE FROM task_followups WHERE id = ? AND task_id = ?`, fid, taskId)
    return { ok: true, id: fid }
  })
}
