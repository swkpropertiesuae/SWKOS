import type { FastifyInstance,FastifyRequest } from 'fastify'
import { z } from 'zod'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { q,tx,currentDb,runInDb } from '../db'
import { bad,forbidden,notFound,nowIso } from '../util'
import { liveBus,liveScope } from '../notify'
import { idOf } from './helpers'
import { dirs,config } from '../config'
import { openStored,persistUpload } from '../integrations/storage'
import { dispatchPushToUser, setActiveChatThread } from '../integrations/push'
import { loadUser } from '../auth'
import { canAccessSwkAdminLogic,isAdminSwkUser,isFullAccessSwkUser,isOwnerSwkUser } from '../../shared/swk-staff-access'

/**
 * Inside — SWK's internal messenger (WhatsApp-style). Clients are reached through WhatsApp and e-mail, which have their own threads.
 * Direct chats and groups, group admins, announcement-only groups, replies, reactions, edit / delete for everyone, files, images and
 * voice notes, forwarding, sent / delivered / read ticks, typing, online presence, search, and a live event stream that drives
 * WhatsApp-style alerts across the OS. Events go out on liveBus 'chat:<scope>:<userId>'.
 */

type Evt = { type: 'message' | 'update' | 'receipt' | 'typing' | 'thread' | 'presence'; thread_id?: number; [k: string]: unknown }
const online = new Map<number, number>() // userId -> open streams
const lastSeen = new Map<number, string>()
const emit = (uid: number, e: Evt) => liveBus.emit(`chat:${liveScope()}:${uid}`, e)
const memberIds = (tid: number) => q.all<{ user_id: number }>(`SELECT user_id FROM chat_members WHERE thread_id = ?`, tid).map(r => r.user_id)
const emitThread = (tid: number, e: Evt, except?: number) => { for (const u of memberIds(tid)) if (u !== except) emit(u, { thread_id: tid, ...e }) }
const lastId = (r: any, table: string) => Number(r?.lastInsertRowid) || q.val<number>(`SELECT MAX(id) FROM ${table}`)!

const ALLOWED_MIME = /^(image\/(png|jpe?g|gif|webp|heic|heif)|audio\/[\w.+-]+|video\/(mp4|webm|quicktime)|application\/(pdf|zip|msword|vnd\.openxmlformats-officedocument\.[\w.]+|vnd\.ms-excel|vnd\.ms-powerpoint)|text\/(plain|csv))$/i
const INLINE_MIME = /^(image\/(png|jpe?g|gif|webp)|audio\/|video\/)/i

/**
 * Clock time of a stored check-in/out. Attendance times are saved as Dubai wall-clock text without a zone
 * ('2026-11-24T10:11', see nowLocal); `new Date()` would read that as server time (UTC) and add 4 hours.
 * Only a value carrying its own zone ('Z' or '+04:00') is converted.
 */
export function attendanceClock(s: string): string {
  const v = String(s).trim()
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(v)) {
    const d = new Date(v)
    if (!Number.isNaN(d.getTime())) return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: true }).format(d).toUpperCase()
  }
  const m = /(\d{1,2}):(\d{2})/.exec(v.includes('T') ? v.split('T')[1]! : v.includes(' ') ? v.split(' ').pop()! : v)
  if (!m) return v
  const h = Number(m[1])
  return `${String(h % 12 || 12).padStart(2, '0')}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`
}

/** Today's office attendance as a message, Dubai date. Staff without a check-in are listed so the Owner sees gaps. */
export function attendanceReportText(day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(new Date())) {
  const staff = q.all<{ id: number; name: string }>(`SELECT id, name FROM employees WHERE deleted_at IS NULL AND (status IS NULL OR status = 'Active') ORDER BY name`)
  const att = q.all<{ employee_id: number; status: string; check_in: string | null; check_out: string | null }>(`SELECT employee_id, status, check_in, check_out FROM attendance WHERE deleted_at IS NULL AND att_date = ?`, day)
  const byEmp = new Map(att.map(a => [a.employee_id, a]))
  const t = (s: string | null) => (s ? attendanceClock(s) : '')
  const groups: Record<string, string[]> = { Present: [], Late: [], 'Field / remote': [], 'On leave': [], 'Not checked in': [] }
  for (const e of staff) {
    const a = byEmp.get(e.id)
    if (!a) { groups['Not checked in']!.push(e.name); continue }
    const line = `${e.name}${a.check_in ? ` · in ${t(a.check_in)}` : ''}${a.check_out ? ` · out ${t(a.check_out)}` : ''}`
    const k = a.status === 'Late' ? 'Late' : a.status === 'On leave' || a.status === 'Public holiday' ? 'On leave' : a.status === 'Field Site Visit' || a.status === 'Remote' ? 'Field / remote' : a.status === 'Absent' ? 'Not checked in' : 'Present'
    groups[k]!.push(line)
  }
  const pretty = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(day + 'T08:00:00Z'))
  const present = groups.Present!.length + groups.Late!.length + groups['Field / remote']!.length
  return [`*Attendance report · ${pretty}*`, `${present} of ${staff.length} staff in today`, '', ...Object.entries(groups).filter(([, v]) => v.length).flatMap(([k, v]) => [`*${k} (${v.length})*`, ...v.map(x => `• ${x}`), ''])].join('\n').trim()
}

function pushBodyForChat(kind: string | undefined, body: string, sender: string, isGroup: boolean, fileName?: string | null): string {
  let text = ''
  if (kind === 'location') {
    try {
      const loc = JSON.parse(body) as { label?: string }
      text = `📍 ${loc?.label ? String(loc.label) : 'Shared a live location'}`
    } catch {
      text = '📍 Shared a live location'
    }
  } else if (kind === 'image') text = `📷 ${body || 'Photo'}`
  else if (kind === 'voice') text = '🎤 Voice message'
  else if (kind === 'video') text = `🎬 ${body || 'Video'}`
  else if (kind === 'file') text = `📄 ${fileName || 'Document'}`
  else if (kind === 'report') text = '📋 Attendance report'
  else if (kind === 'automation') text = `⚙️ ${body.split('\n')[0]?.replace(/\*/g, '') || 'Automation alert'}`
  else text = body.replace(/\*/g, '')
  const trimmed = text.slice(0, 240)
  return isGroup && kind !== 'automation' ? `${sender}: ${trimmed}` : trimmed
}

/** Automation recipes post into a group as the rule's author (or the group's creator). Members get the normal live alert. */
export function postAutomationMessage(tid: number, authorId: number | null, body: string) {
  const t = q.get<{ kind: string; created_by: number; title: string | null }>(`SELECT kind, created_by, title FROM chat_threads WHERE id = ?`, tid)
  if (!t || t.kind !== 'group') throw bad('Inside group not found')
  const uid = authorId && q.get(`SELECT 1 AS x FROM users WHERE id = ? AND active = 1 AND deleted_at IS NULL`, authorId) ? authorId : t.created_by
  const id = lastId(q.run(`INSERT INTO chat_messages (thread_id, user_id, body, kind, created_at) VALUES (?,?,?,?,?)`, tid, uid, body.slice(0, 4000), 'automation', nowIso()), 'chat_messages')
  const name = q.val<string>(`SELECT name FROM users WHERE id = ?`, uid) ?? 'SWK OS'
  const createdAt = nowIso()
  for (const m of q.all<{ user_id: number; muted: number }>(`SELECT user_id, muted FROM chat_members WHERE thread_id = ?`, tid)) {
    emit(m.user_id, { type: 'message', thread_id: tid, thread_title: t.title, group: true, muted: !!m.muted, message: { id, user_id: uid, name, kind: 'automation', body, created_at: createdAt, edited: false, forwarded: false, file: null, reply: null, reactions: [], status: null } })
    if (m.user_id !== uid && !m.muted) {
      void dispatchPushToUser(m.user_id, {
        title: t.title || 'SWK Inside',
        body: pushBodyForChat('automation', body, name, true),
        url: `/chat?t=${tid}`,
        tag: `swk-chat-${tid}`,
        channel: 'swk_messages',
        threadId: tid,
        silent: !!m.muted,
      })
    }
  }
  return { id }
}

/** First start: one company-wide group with every active staff member; Owner and Admin are its admins. */
export function ensureTeamGroup() {
  if (q.val(`SELECT 1 FROM chat_threads WHERE system_key = 'team'`)) return
  const staffIds = q.all<{ id: number }>(
    `SELECT id FROM users WHERE active = 1 AND deleted_at IS NULL AND party_id IS NULL ORDER BY id`,
  )
  const staff = staffIds
    .map(r => loadUser(r.id))
    .filter((u): u is NonNullable<ReturnType<typeof loadUser>> => !!u && !u.party_id)
  if (!staff.length) return
  const owner =
    staff.find(s => isOwnerSwkUser(s)) ??
    staff.find(s => isAdminSwkUser(s)) ??
    staff.find(s => isFullAccessSwkUser(s)) ??
    staff[0]!
  tx(() => {
    const r = q.run(`INSERT INTO chat_threads (title, kind, created_by, created_at, description, announce, system_key) VALUES (?,?,?,?,?,?,?)`,
      'SWK Properties Team', 'group', owner.id, nowIso(), 'Company-wide group: announcements, daily attendance reports and team updates.', 0, 'team')
    const tid = lastId(r, 'chat_threads')
    for (const s of staff) {
      const role = isOwnerSwkUser(s) || isAdminSwkUser(s) ? 'admin' : 'member'
      q.run(`INSERT INTO chat_members (thread_id, user_id, role, joined_at) VALUES (?,?,?,?)`, tid, s.id, role, nowIso())
    }
    q.run(`INSERT INTO chat_messages (thread_id, user_id, body, kind, created_at) VALUES (?,?,?,?,?)`, tid, owner.id, 'Group created: SWK Properties Team', 'system', nowIso())
  })
}

export default async function (app: FastifyInstance) {
  const me = (req: FastifyRequest) => { if (!req.user || req.user.party_id) throw forbidden('Staff only'); return req.user.id as number }
  const membership = (tid: number, uid: number) => {
    const m = q.get<{ role: string }>(`SELECT role FROM chat_members WHERE thread_id = ? AND user_id = ?`, tid, uid)
    if (!m) throw bad('Conversation not found')
    return m
  }
  const thread = (tid: number) => q.get<{ id: number; title: string | null; kind: string; announce: number; system_key: string | null; description: string | null; created_by: number; created_at: string }>(`SELECT * FROM chat_threads WHERE id = ?`, tid)!
  const requireAdmin = (tid: number, uid: number) => { if (thread(tid).kind !== 'group' || membership(tid, uid).role !== 'admin') throw forbidden('Only group admins can do this') }
  const systemMsg = (tid: number, uid: number, body: string) => {
    const id = lastId(q.run(`INSERT INTO chat_messages (thread_id, user_id, body, kind, created_at) VALUES (?,?,?,?,?)`, tid, uid, body, 'system', nowIso()), 'chat_messages')
    emitThread(tid, { type: 'thread' }); return id
  }
  const nameOf = (uid: number) => q.val<string>(`SELECT name FROM users WHERE id = ?`, uid) ?? 'Someone'
  /** Mark everything up to the newest message delivered for this user, and tell senders so their ticks turn double. */
  const deliverAll = (uid: number) => {
    const rows = q.all<{ thread_id: number; top: number }>(`SELECT m.thread_id, (SELECT MAX(id) FROM chat_messages WHERE thread_id = m.thread_id) AS top FROM chat_members m WHERE m.user_id = ? AND m.last_delivered_id < COALESCE((SELECT MAX(id) FROM chat_messages WHERE thread_id = m.thread_id), 0)`, uid)
    for (const r of rows) { q.run(`UPDATE chat_members SET last_delivered_id = ? WHERE thread_id = ? AND user_id = ?`, r.top, r.thread_id, uid); emitThread(r.thread_id, { type: 'receipt' }, uid) }
  }

  const shapeMessages = (tid: number, uid: number, rows: any[]) => {
    if (!rows.length) return []
    const others = q.get<{ r: number | null; d: number | null; n: number }>(`SELECT MIN(last_read_id) AS r, MIN(last_delivered_id) AS d, COUNT(*) AS n FROM chat_members WHERE thread_id = ? AND user_id <> ?`, tid, uid)!
    const ids = rows.map(r => r.id)
    const ph = ids.map(() => '?').join(',')
    const reacts = q.all<{ message_id: number; user_id: number; emoji: string; name: string }>(`SELECT r.message_id, r.user_id, r.emoji, u.name FROM chat_reactions r JOIN users u ON u.id = r.user_id WHERE r.message_id IN (${ph})`, ...ids)
    const replyIds = [...new Set(rows.map(r => r.reply_to_id).filter(Boolean))]
    const replies = new Map(replyIds.length ? q.all<any>(`SELECT m.id, m.body, m.kind, m.file_name, m.deleted_at, u.name FROM chat_messages m JOIN users u ON u.id = m.user_id WHERE m.id IN (${replyIds.map(() => '?').join(',')})`, ...replyIds).map(r => [r.id, r]) : [])
    return rows.map(r => {
      const rx = reacts.filter(x => x.message_id === r.id)
      const emojis = [...new Set(rx.map(x => x.emoji))].map(e => ({ emoji: e, count: rx.filter(x => x.emoji === e).length, mine: rx.some(x => x.emoji === e && x.user_id === uid), names: rx.filter(x => x.emoji === e).map(x => x.name) }))
      const rp = r.reply_to_id ? replies.get(r.reply_to_id) : null
      const deleted = !!r.deleted_at
      return {
        id: r.id, user_id: r.user_id, name: r.name, kind: deleted ? 'deleted' : r.kind, body: deleted ? '' : r.body, created_at: r.created_at, edited: !!r.edited_at && !deleted, forwarded: !!r.forwarded,
        file: !deleted && r.file_stored ? { name: r.file_name, mime: r.file_mime, size: r.file_size, url: `/api/chat/files/${r.id}` } : null,
        reply: rp ? { id: rp.id, name: rp.name, body: rp.deleted_at ? 'This message was deleted' : rp.body || rp.file_name || '', kind: rp.kind } : null,
        reactions: emojis,
        status: r.user_id !== uid ? null : !others.n || (others.r ?? 0) >= r.id ? 'read' : (others.d ?? 0) >= r.id ? 'delivered' : 'sent',
      }
    })
  }
  const MSG_COLS = `m.id, m.user_id, u.name, m.body, m.kind, m.reply_to_id, m.forwarded, m.file_stored, m.file_name, m.file_mime, m.file_size, m.edited_at, m.deleted_at, m.created_at`

  const insertMessage = (tid: number, uid: number, v: { body: string; kind?: string; reply_to_id?: number | null; forwarded?: boolean; file?: { stored: string; name: string; mime: string; size: number } | null }) => {
    const t = thread(tid)
    const mem = membership(tid, uid)
    if (t.announce && mem.role !== 'admin') throw forbidden('Only admins can send messages in this group')
    if (v.reply_to_id && !q.get(`SELECT 1 AS x FROM chat_messages WHERE id = ? AND thread_id = ?`, v.reply_to_id, tid)) throw bad('Reply target not found')
    const id = lastId(q.run(`INSERT INTO chat_messages (thread_id, user_id, body, kind, reply_to_id, forwarded, file_stored, file_name, file_mime, file_size, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      tid, uid, v.body, v.kind ?? 'text', v.reply_to_id ?? null, v.forwarded ? 1 : 0, v.file?.stored ?? null, v.file?.name ?? null, v.file?.mime ?? null, v.file?.size ?? null, nowIso()), 'chat_messages')
    q.run(`UPDATE chat_members SET last_read_id = ?, last_delivered_id = ?, archived = 0 WHERE thread_id = ? AND user_id = ?`, id, id, tid, uid)
    // unarchive for everyone (WhatsApp brings archived chats back on a new message unless muted) and deliver to online members
    q.run(`UPDATE chat_members SET archived = 0 WHERE thread_id = ? AND muted = 0`, tid)
    for (const u of memberIds(tid)) if (u !== uid && online.get(u)) q.run(`UPDATE chat_members SET last_delivered_id = ? WHERE thread_id = ? AND user_id = ? AND last_delivered_id < ?`, id, tid, u, id)
    const row = q.get(`SELECT ${MSG_COLS} FROM chat_messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?`, id)
    const sender = nameOf(uid)
    const isGroup = t.kind === 'group'
    const pushTitle = isGroup ? (t.title || 'SWK Inside') : sender
    const pushBody = pushBodyForChat(v.kind, v.body, sender, isGroup, v.file?.name)
    for (const u of memberIds(tid)) {
      const prefs = q.get<{ muted: number }>(`SELECT muted FROM chat_members WHERE thread_id = ? AND user_id = ?`, tid, u)
      emit(u, { type: 'message', thread_id: tid, thread_title: isGroup ? t.title : sender, group: isGroup, muted: !!prefs?.muted, message: shapeMessages(tid, u, [row])[0] })
      if (u !== uid && !prefs?.muted) {
        void dispatchPushToUser(u, {
          title: pushTitle,
          body: pushBody,
          url: `/chat?t=${tid}`,
          tag: `swk-chat-${tid}`,
          channel: 'swk_messages',
          threadId: tid,
          silent: !!prefs?.muted,
        })
      }
    }
    return { id }
  }

  // ------------------------------------------------------------------ live stream
  app.get('/api/chat/stream', async (req, reply) => {
    const uid = me(req)
    const streamDb = currentDb()
    const rawSince = (req.query as any)?.since_id ?? req.headers['last-event-id']
    const sinceId = rawSince !== undefined && rawSince !== '' ? Number(rawSince) : 0
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
    res.write('retry: 3000\n\n')
    const send = (e: Evt) => {
      try {
        const msgId = (e as any)?.message?.id
        res.write(`${msgId ? `id: ${msgId}\n` : ''}event: chat\ndata: ${JSON.stringify(e)}\n\n`)
      } catch { /* closed */ }
    }
    if (Number.isInteger(sinceId) && sinceId > 0) {
      const missed = q.all<any>(
        `SELECT ${MSG_COLS}, m.thread_id, t.kind AS thread_kind, t.title AS thread_title, cm.muted AS member_muted
         FROM chat_messages m
         JOIN chat_members cm ON cm.thread_id = m.thread_id AND cm.user_id = ?
         JOIN chat_threads t ON t.id = m.thread_id
         JOIN users u ON u.id = m.user_id
         WHERE m.id > ?
         ORDER BY m.id ASC
         LIMIT 200`,
        uid,
        sinceId,
      )
      const dmTitles = new Map<number, string>()
      for (const r of missed) {
        let threadTitle = r.thread_title as string | null
        if (r.thread_kind !== 'group') {
          if (!dmTitles.has(r.thread_id)) {
            const peerName = q.val<string>(
              `SELECT u2.name FROM chat_members c2 JOIN users u2 ON u2.id = c2.user_id WHERE c2.thread_id = ? AND c2.user_id <> ? LIMIT 1`,
              r.thread_id,
              uid,
            )
            dmTitles.set(r.thread_id, peerName ?? r.name)
          }
          threadTitle = dmTitles.get(r.thread_id) ?? r.name
        }
        send({
          type: 'message',
          thread_id: r.thread_id,
          thread_title: threadTitle ?? 'Inside',
          group: r.thread_kind === 'group',
          muted: !!r.member_muted,
          replay: true,
          message: shapeMessages(r.thread_id, uid, [r])[0],
        })
      }
    }
    const chatChannel = `chat:${liveScope()}:${uid}`
    liveBus.on(chatChannel, send)
    const wasOnline = !!online.get(uid)
    online.set(uid, (online.get(uid) ?? 0) + 1)
    if (!wasOnline) for (const u of q.all<{ user_id: number }>(`SELECT DISTINCT b.user_id FROM chat_members a JOIN chat_members b ON b.thread_id = a.thread_id WHERE a.user_id = ? AND b.user_id <> ?`, uid, uid)) emit(u.user_id, { type: 'presence', user_id: uid, online: true })
    deliverAll(uid)
    const ping = setInterval(() => { try { res.write(': ping\n\n') } catch { /* closed */ } }, 20_000)
    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      clearInterval(ping); liveBus.off(chatChannel, send)
      const n = (online.get(uid) ?? 1) - 1
      if (n > 0) { online.set(uid, n); return }
      online.delete(uid); lastSeen.set(uid, nowIso())
      try {
        runInDb(streamDb, () => {
          for (const u of q.all<{ user_id: number }>(`SELECT DISTINCT b.user_id FROM chat_members a JOIN chat_members b ON b.thread_id = a.thread_id WHERE a.user_id = ? AND b.user_id <> ?`, uid, uid)) {
            emit(u.user_id, { type: 'presence', user_id: uid, online: false, last_seen: lastSeen.get(uid) })
          }
        })
      } catch {
        /* ignore if database is already closed during shutdown */
      }
    }
    req.raw.on('close', cleanup)
    res.on('close', cleanup)
  })

  // ------------------------------------------------------------------ people, threads
  app.get('/api/chat/people', async (req) => {
    const uid = me(req)
    return q.all<any>(`SELECT u.id, u.name, u.email, u.designation FROM users u WHERE u.active = 1 AND u.deleted_at IS NULL AND u.party_id IS NULL AND u.id <> ? ORDER BY u.name`, uid)
      .map(p => ({ ...p, online: !!online.get(p.id), last_seen: lastSeen.get(p.id) ?? null }))
  })
  app.get('/api/chat/unread', async (req) => {
    const uid = me(req)
    return { unread: q.val<number>(`SELECT COUNT(*) FROM chat_messages c JOIN chat_members m ON m.thread_id = c.thread_id AND m.user_id = ? WHERE c.id > m.last_read_id AND c.user_id <> ? AND c.kind <> 'system' AND m.archived = 0`, uid, uid) ?? 0 }
  })

  app.get('/api/chat/threads', async (req) => {
    const uid = me(req)
    deliverAll(uid)
    const rows = q.all<any>(`SELECT t.id, t.title, t.kind, t.announce, t.system_key, m.role, m.pinned, m.muted, m.archived, m.last_read_id, (SELECT MAX(id) FROM chat_messages WHERE thread_id = t.id) AS last_id FROM chat_threads t JOIN chat_members m ON m.thread_id = t.id AND m.user_id = ? ORDER BY m.pinned DESC, last_id DESC NULLS LAST, t.id DESC`, uid)
    return rows.map(r => {
      const members = q.all<{ name: string; id: number; email: string }>(`SELECT u.id, u.name, u.email FROM chat_members c JOIN users u ON u.id = c.user_id WHERE c.thread_id = ?`, r.id)
      const lastRow = r.last_id ? q.get(`SELECT ${MSG_COLS} FROM chat_messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?`, r.last_id) : null
      const last = lastRow ? shapeMessages(r.id, uid, [lastRow])[0] : null
      const unread = q.val<number>(`SELECT COUNT(*) FROM chat_messages WHERE thread_id = ? AND id > ? AND user_id <> ? AND kind <> 'system'`, r.id, r.last_read_id ?? 0, uid) ?? 0
      const peer = r.kind === 'dm' ? members.find(x => x.id !== uid) : null
      return {
        id: r.id, kind: r.kind, title: r.kind === 'group' ? r.title || members.filter(x => x.id !== uid).map(x => x.name).join(', ') : peer?.name ?? 'Just me',
        peer: peer ? { id: peer.id, email: peer.email, online: !!online.get(peer.id), last_seen: lastSeen.get(peer.id) ?? null } : null,
        members: members.length, role: r.role, pinned: !!r.pinned, muted: !!r.muted, archived: !!r.archived, announce: !!r.announce, system: !!r.system_key, last, unread,
      }
    })
  })

  app.post('/api/chat/threads', async (req) => {
    const uid = me(req)
    const b = z.object({ title: z.string().trim().max(80).optional(), description: z.string().trim().max(500).optional(), user_ids: z.array(z.number().int()).min(1).max(100), group: z.boolean().optional() }).parse(req.body ?? {})
    const ids = [...new Set([uid, ...b.user_ids])]
    const valid = q.all<{ id: number }>(`SELECT id FROM users WHERE active = 1 AND deleted_at IS NULL AND party_id IS NULL AND id IN (${ids.map(() => '?').join(',')})`, ...ids).map(r => r.id)
    if (valid.length !== ids.length) throw bad('Unknown person selected')
    const isGroup = b.group || ids.length > 2
    if (isGroup && !b.title) throw bad('Give the group a name')
    if (!isGroup) { // reuse the existing one-to-one conversation
      const dm = q.get(`SELECT t.id FROM chat_threads t WHERE t.kind = 'dm' AND (SELECT COUNT(*) FROM chat_members c WHERE c.thread_id = t.id) = 2 AND EXISTS (SELECT 1 FROM chat_members c WHERE c.thread_id = t.id AND c.user_id = ?) AND EXISTS (SELECT 1 FROM chat_members c WHERE c.thread_id = t.id AND c.user_id = ?)`, ids[0], ids[1])
      if (dm) return { id: dm.id }
    }
    const id = tx(() => {
      const tid = lastId(q.run(`INSERT INTO chat_threads (title, kind, created_by, created_at, description) VALUES (?,?,?,?,?)`, isGroup ? b.title : null, isGroup ? 'group' : 'dm', uid, nowIso(), b.description || null), 'chat_threads')
      for (const u of ids) q.run(`INSERT INTO chat_members (thread_id, user_id, role, joined_at) VALUES (?,?,?,?)`, tid, u, isGroup && u === uid ? 'admin' : 'member', nowIso())
      return tid
    })
    if (isGroup) systemMsg(id, uid, `${nameOf(uid)} created group "${b.title}"`)
    for (const u of ids) emit(u, { type: 'thread', thread_id: id })
    return { id }
  })

  app.get('/api/chat/threads/:id', async (req) => {
    const uid = me(req), tid = idOf((req.params as any).id)
    membership(tid, uid)
    const t = thread(tid)
    const members = q.all<any>(`SELECT u.id, u.name, u.email, u.designation, c.role FROM chat_members c JOIN users u ON u.id = c.user_id WHERE c.thread_id = ? ORDER BY CASE c.role WHEN 'admin' THEN 0 ELSE 1 END, u.name`, tid)
      .map(m => ({ ...m, online: !!online.get(m.id), last_seen: lastSeen.get(m.id) ?? null }))
    const media = q.all(`SELECT id, file_name AS name, file_mime AS mime, file_size AS size, created_at FROM chat_messages WHERE thread_id = ? AND file_stored IS NOT NULL AND deleted_at IS NULL ORDER BY id DESC LIMIT 60`, tid)
      .map((f: any) => ({ ...f, url: `/api/chat/files/${f.id}` }))
    return { id: t.id, kind: t.kind, title: t.title, description: t.description, announce: !!t.announce, system: !!t.system_key, created_at: t.created_at, created_by: nameOf(t.created_by), members, media, can_report: canSendReport(req) }
  })

  app.patch('/api/chat/threads/:id', async (req) => {
    const uid = me(req), tid = idOf((req.params as any).id)
    requireAdmin(tid, uid)
    const b = z.object({ title: z.string().trim().min(1).max(80).optional(), description: z.string().trim().max(500).optional(), announce: z.boolean().optional() }).parse(req.body ?? {})
    const t = thread(tid)
    if (b.title !== undefined && b.title !== t.title) { q.run(`UPDATE chat_threads SET title = ? WHERE id = ?`, b.title, tid); systemMsg(tid, uid, `${nameOf(uid)} changed the group name to "${b.title}"`) }
    if (b.description !== undefined && b.description !== (t.description ?? '')) { q.run(`UPDATE chat_threads SET description = ? WHERE id = ?`, b.description || null, tid); systemMsg(tid, uid, `${nameOf(uid)} changed the group description`) }
    if (b.announce !== undefined && b.announce !== !!t.announce) { q.run(`UPDATE chat_threads SET announce = ? WHERE id = ?`, b.announce ? 1 : 0, tid); systemMsg(tid, uid, b.announce ? `${nameOf(uid)} changed settings so only admins can send messages` : `${nameOf(uid)} changed settings so all members can send messages`) }
    return { ok: true }
  })

  app.post('/api/chat/threads/:id/members', async (req) => {
    const uid = me(req), tid = idOf((req.params as any).id)
    requireAdmin(tid, uid)
    const b = z.object({ user_ids: z.array(z.number().int()).min(1).max(100) }).parse(req.body ?? {})
    const have = new Set(memberIds(tid))
    const add = q.all<{ id: number; name: string }>(`SELECT id, name FROM users WHERE active = 1 AND deleted_at IS NULL AND party_id IS NULL AND id IN (${b.user_ids.map(() => '?').join(',')})`, ...b.user_ids).filter(u => !have.has(u.id))
    for (const u of add) q.run(`INSERT INTO chat_members (thread_id, user_id, role, joined_at) VALUES (?,?,?,?)`, tid, u.id, 'member', nowIso())
    if (add.length) systemMsg(tid, uid, `${nameOf(uid)} added ${add.map(a => a.name).join(', ')}`)
    for (const u of add) emit(u.id, { type: 'thread', thread_id: tid })
    return { added: add.length }
  })

  app.delete('/api/chat/threads/:id/members/:uid', async (req) => {
    const uid = me(req), p = req.params as any, tid = idOf(p.id), target = idOf(p.uid)
    const t = thread(tid)
    if (t.kind !== 'group') throw bad('Only groups have members to remove')
    if (target !== uid) requireAdmin(tid, uid); else membership(tid, uid)
    if (t.system_key === 'team' && target === uid && membership(tid, uid).role === 'admin' && q.val<number>(`SELECT COUNT(*) FROM chat_members WHERE thread_id = ? AND role = 'admin'`, tid)! <= 1) throw bad('Make someone else an admin before leaving the company group')
    systemMsg(tid, uid, target === uid ? `${nameOf(uid)} left` : `${nameOf(uid)} removed ${nameOf(target)}`)
    q.run(`DELETE FROM chat_members WHERE thread_id = ? AND user_id = ?`, tid, target)
    // a group never loses its last admin: the longest-standing member takes over
    if (!q.val(`SELECT 1 FROM chat_members WHERE thread_id = ? AND role = 'admin'`, tid)) q.run(`UPDATE chat_members SET role = 'admin' WHERE thread_id = ? AND user_id = (SELECT user_id FROM chat_members WHERE thread_id = ? ORDER BY joined_at LIMIT 1)`, tid, tid)
    emit(target, { type: 'thread', thread_id: tid })
    return { ok: true }
  })

  app.post('/api/chat/threads/:id/members/:uid/role', async (req) => {
    const uid = me(req), p = req.params as any, tid = idOf(p.id), target = idOf(p.uid)
    requireAdmin(tid, uid)
    membership(tid, target)
    const { admin } = z.object({ admin: z.boolean() }).parse(req.body ?? {})
    if (!admin && target === uid && q.val<number>(`SELECT COUNT(*) FROM chat_members WHERE thread_id = ? AND role = 'admin'`, tid)! <= 1) throw bad('A group needs at least one admin')
    q.run(`UPDATE chat_members SET role = ? WHERE thread_id = ? AND user_id = ?`, admin ? 'admin' : 'member', tid, target)
    emitThread(tid, { type: 'thread' })
    return { ok: true }
  })

  app.post('/api/chat/threads/:id/prefs', async (req) => {
    const uid = me(req), tid = idOf((req.params as any).id)
    membership(tid, uid)
    const b = z.object({ pinned: z.boolean().optional(), muted: z.boolean().optional(), archived: z.boolean().optional() }).parse(req.body ?? {})
    for (const k of ['pinned', 'muted', 'archived'] as const) if (b[k] !== undefined) q.run(`UPDATE chat_members SET ${k} = ? WHERE thread_id = ? AND user_id = ?`, b[k] ? 1 : 0, tid, uid)
    emit(uid, { type: 'thread', thread_id: tid })
    return { ok: true }
  })

  // ------------------------------------------------------------------ messages
  app.get('/api/chat/threads/:id/messages', async (req) => {
    const uid = me(req), tid = idOf((req.params as any).id), qs = req.query as any
    membership(tid, uid)
    const before = Number(qs.before) || 0
    const rows = q.all(`SELECT ${MSG_COLS} FROM chat_messages m JOIN users u ON u.id = m.user_id WHERE m.thread_id = ? ${before ? 'AND m.id < ?' : ''} ORDER BY m.id DESC LIMIT 120`, ...(before ? [tid, before] : [tid])).reverse()
    return { messages: shapeMessages(tid, uid, rows), more: rows.length === 120 }
  })

  app.post('/api/chat/threads/:id/read', async (req) => {
    const uid = me(req), tid = idOf((req.params as any).id)
    membership(tid, uid)
    const top = q.val<number>(`SELECT MAX(id) FROM chat_messages WHERE thread_id = ?`, tid) ?? 0
    const changed = q.run(`UPDATE chat_members SET last_read_id = ?, last_delivered_id = ? WHERE thread_id = ? AND user_id = ? AND last_read_id < ?`, top, top, tid, uid, top)
    if ((changed as any)?.changes !== 0) emitThread(tid, { type: 'receipt' }, uid)
    return { ok: true }
  })

  app.post('/api/chat/threads/:id/typing', { config: { rateLimit: { max: 40, timeWindow: '1 minute' } } }, async (req) => {
    const uid = me(req), tid = idOf((req.params as any).id)
    membership(tid, uid)
    emitThread(tid, { type: 'typing', user_id: uid, name: nameOf(uid), recording: !!(req.body as any)?.recording }, uid)
    return { ok: true }
  })

  const locationSchema = z.object({
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
    label: z.string().trim().max(160).optional(),
  })

  app.post('/api/chat/active-thread', async (req) => {
    const uid = me(req)
    const b = z.object({ thread_id: z.number().int().positive().nullable() }).parse(req.body ?? {})
    if (b.thread_id !== null) membership(b.thread_id, uid)
    setActiveChatThread(uid, b.thread_id)
    return { ok: true, thread_id: b.thread_id }
  })

  app.post('/api/chat/threads/:id/messages', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => {
    const uid = me(req), tid = idOf((req.params as any).id)
    const raw = (req.body ?? {}) as Record<string, unknown>
    if (raw.kind === 'location') {
      const b = z.object({
        kind: z.literal('location'),
        location: locationSchema.optional(),
        body: z.string().trim().max(1000).optional(),
        reply_to_id: z.number().int().positive().optional(),
      }).parse(raw)
      let loc = b.location
      if (!loc && b.body) {
        try {
          loc = locationSchema.parse(JSON.parse(b.body))
        } catch {
          throw bad('Invalid location coordinates')
        }
      }
      if (!loc) throw bad('Location coordinates are required')
      const canonical = JSON.stringify({
        lat: Number(loc.lat),
        lng: Number(loc.lng),
        ...(loc.label ? { label: loc.label } : {}),
      })
      return insertMessage(tid, uid, { body: canonical, kind: 'location', reply_to_id: b.reply_to_id ?? null })
    }
    const b = z.object({ body: z.string().trim().min(1).max(4000), reply_to_id: z.number().int().positive().optional() }).parse(raw)
    return insertMessage(tid, uid, { body: b.body, reply_to_id: b.reply_to_id ?? null })
  })

  // Files, photos and voice notes. Stored like other uploads (local disk or R2) and only served to members of the conversation.
  app.post('/api/chat/threads/:id/upload', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const uid = me(req), tid = idOf((req.params as any).id)
    membership(tid, uid)
    if (!req.isMultipart()) throw bad('Expected a file upload')
    let caption = '', replyTo: number | null = null, saved: { stored: string; name: string; mime: string; size: number } | null = null
    for await (const part of req.parts()) {
      if (part.type === 'field') { if (part.fieldname === 'caption') caption = String(part.value ?? '').slice(0, 4000); if (part.fieldname === 'reply_to_id') replyTo = Number(part.value) || null; continue }
      if (saved) { part.file.resume(); continue }
      const mime = (part.mimetype || '').split(';')[0]!.trim()
      if (!ALLOWED_MIME.test(mime)) { part.file.resume(); throw bad('This file type cannot be shared') }
      const ext = (path.extname(part.filename || '').toLowerCase().replace(/[^.a-z0-9]/g, '') || (mime.startsWith('audio/') ? '.webm' : '')).slice(0, 10)
      const rel = path.join('chat', nowIso().slice(0, 7), crypto.randomBytes(12).toString('hex') + ext)
      const full = path.join(dirs.uploads, rel)
      fs.mkdirSync(path.dirname(full), { recursive: true })
      await pipeline(part.file, fs.createWriteStream(full))
      if ((part.file as any).truncated) { fs.rmSync(full, { force: true }); throw bad(`Files can be up to ${config.maxUploadMb} MB`) }
      const size = fs.statSync(full).size
      saved = { stored: await persistUpload(rel, mime), name: (part.filename || 'file').slice(0, 160), mime, size }
    }
    if (!saved) throw bad('No file received')
    const kind = saved.mime.startsWith('image/') ? 'image' : saved.mime.startsWith('audio/') ? 'voice' : saved.mime.startsWith('video/') ? 'video' : 'file'
    return insertMessage(tid, uid, { body: caption, kind, reply_to_id: replyTo, file: saved })
  })

  app.get('/api/chat/files/:mid', async (req, reply) => {
    const uid = me(req), mid = idOf((req.params as any).mid)
    const m = q.get<any>(`SELECT thread_id, file_stored, file_name, file_mime FROM chat_messages WHERE id = ? AND deleted_at IS NULL`, mid)
    if (!m?.file_stored) throw notFound('File not found')
    const mem = q.get<{ role: string }>(`SELECT role FROM chat_members WHERE thread_id = ? AND user_id = ?`, m.thread_id, uid)
    if (!mem) throw forbidden('Access denied')
    const stream = await openStored(m.file_stored)
    if (!stream) throw notFound('File not found')
    const inline = INLINE_MIME.test(m.file_mime || '') && (req.query as any).download !== '1'
    reply.header('content-type', m.file_mime || 'application/octet-stream')
    reply.header('content-disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(m.file_name || 'file')}`)
    reply.header('cache-control', 'private, max-age=86400')
    return reply.send(stream)
  })

  const ownMessage = (mid: number, uid: number) => {
    const m = q.get<{ thread_id: number; user_id: number; created_at: string; kind: string; deleted_at: string | null }>(`SELECT thread_id, user_id, created_at, kind, deleted_at FROM chat_messages WHERE id = ?`, mid)
    if (!m) throw bad('Message not found')
    membership(m.thread_id, uid)
    return m
  }

  app.patch('/api/chat/messages/:id', async (req) => {
    const uid = me(req), mid = idOf((req.params as any).id)
    const m = ownMessage(mid, uid)
    if (m.user_id !== uid || m.deleted_at || m.kind !== 'text') throw forbidden('You can only edit your own text messages')
    if (Date.now() - Date.parse(m.created_at) > 15 * 60_000) throw bad('Messages can be edited for 15 minutes')
    const { body } = z.object({ body: z.string().trim().min(1).max(4000) }).parse(req.body ?? {})
    q.run(`UPDATE chat_messages SET body = ?, edited_at = ? WHERE id = ?`, body, nowIso(), mid)
    emitThread(m.thread_id, { type: 'update', message_id: mid })
    return { ok: true }
  })

  app.delete('/api/chat/messages/:id', async (req) => {
    const uid = me(req), mid = idOf((req.params as any).id)
    const m = ownMessage(mid, uid)
    const admin = q.get<{ role: string }>(`SELECT role FROM chat_members WHERE thread_id = ? AND user_id = ?`, m.thread_id, uid)?.role === 'admin'
    if (m.user_id !== uid && !admin) throw forbidden('You can only delete your own messages')
    if (m.kind === 'system') throw bad('System messages cannot be deleted')
    q.run(`UPDATE chat_messages SET deleted_at = ?, body = '' WHERE id = ?`, nowIso(), mid)
    q.run(`DELETE FROM chat_reactions WHERE message_id = ?`, mid)
    emitThread(m.thread_id, { type: 'update', message_id: mid })
    return { ok: true }
  })

  app.post('/api/chat/messages/:id/react', async (req) => {
    const uid = me(req), mid = idOf((req.params as any).id)
    const m = ownMessage(mid, uid)
    if (m.deleted_at || m.kind === 'system') throw bad('Cannot react to this message')
    const { emoji } = z.object({ emoji: z.string().max(16).nullable() }).parse(req.body ?? {})
    q.run(`DELETE FROM chat_reactions WHERE message_id = ? AND user_id = ?`, mid, uid)
    if (emoji) q.run(`INSERT INTO chat_reactions (message_id, user_id, emoji, created_at) VALUES (?,?,?,?)`, mid, uid, emoji, nowIso())
    emitThread(m.thread_id, { type: 'update', message_id: mid })
    return { ok: true }
  })

  app.post('/api/chat/messages/:id/forward', async (req) => {
    const uid = me(req), mid = idOf((req.params as any).id)
    const src = q.get<any>(`SELECT * FROM chat_messages WHERE id = ? AND deleted_at IS NULL`, mid)
    if (!src || src.kind === 'system') throw bad('Message not found')
    membership(src.thread_id, uid)
    const { thread_ids } = z.object({ thread_ids: z.array(z.number().int()).min(1).max(10) }).parse(req.body ?? {})
    for (const t of thread_ids) insertMessage(t, uid, { body: src.body, kind: src.kind === 'report' ? 'text' : src.kind, forwarded: true, file: src.file_stored ? { stored: src.file_stored, name: src.file_name, mime: src.file_mime, size: src.file_size } : null })
    return { ok: true }
  })

  app.get('/api/chat/messages/:id/info', async (req) => {
    const uid = me(req), mid = idOf((req.params as any).id)
    const m = ownMessage(mid, uid)
    if (m.user_id !== uid) throw forbidden('Message info is only for your own messages')
    return q.all<any>(`SELECT u.name, c.last_read_id, c.last_delivered_id FROM chat_members c JOIN users u ON u.id = c.user_id WHERE c.thread_id = ? AND c.user_id <> ? ORDER BY u.name`, m.thread_id, uid)
      .map(r => ({ name: r.name, status: r.last_read_id >= mid ? 'read' : r.last_delivered_id >= mid ? 'delivered' : 'sent' }))
  })

  app.get('/api/chat/search', async (req) => {
    const uid = me(req), term = String((req.query as any).q ?? '').trim()
    if (term.length < 2) return []
    return q.all(`SELECT m.id, m.thread_id, m.body, m.created_at, u.name, COALESCE(t.title, '') AS title, t.kind FROM chat_messages m JOIN chat_members c ON c.thread_id = m.thread_id AND c.user_id = ? JOIN users u ON u.id = m.user_id JOIN chat_threads t ON t.id = m.thread_id WHERE m.deleted_at IS NULL AND m.kind <> 'system' AND lower(m.body) LIKE ? ORDER BY m.id DESC LIMIT 50`, uid, `%${term.toLowerCase().replace(/[%_]/g, '')}%`)
  })

  // ------------------------------------------------------------------ attendance report (Owner, Admin, Manager, HR)
  const canSendReport = (req: FastifyRequest) => canAccessSwkAdminLogic(req.user as any) || String(req.user?.role_name ?? '').toLowerCase() === 'hr'
  app.post('/api/chat/threads/:id/attendance-report', async (req) => {
    const uid = me(req), tid = idOf((req.params as any).id)
    if (!canSendReport(req)) throw forbidden('Only the Owner, Admin, Manager or HR can send attendance reports')
    return insertMessage(tid, uid, { body: attendanceReportText(), kind: 'report' })
  })
}
