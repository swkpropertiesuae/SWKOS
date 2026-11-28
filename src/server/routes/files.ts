import type { FastifyInstance, FastifyRequest } from 'fastify'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { q } from '../db'
import { dirs, config } from '../config'
import { ENTITIES } from '../../shared/entities'
import {
  RESTRICTED_HR_PII_ENTITIES,
  canAccessShabibsCorner,
  canViewEmployeeRecords,
  isAdminSwkUser,
  isOwnerSwkUser,
} from '../../shared/swk-staff-access'
import { assertCan, getDef, getRecord, insertRow, labelsFor, can, audit } from '../engine'
import { bad, forbidden, notFound, nowIso, todayStr } from '../util'
import { idOf } from './helpers'
import { isR2Name, openStored, persistUpload, removeStored } from '../integrations/storage'

export const BLOCKED_UPLOAD_EXTS = new Set(['exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'js', 'mjs', 'vbs', 'sh', 'ps1', 'jar', 'dll', 'html', 'htm', 'svg', 'php', 'apk', 'app', 'iso', 'lnk'])
const BLOCKED = BLOCKED_UPLOAD_EXTS

/** Non-entity operational workspace scopes that accept universal file attachments. */
const WORKSPACE_SCOPES = new Set([
  'mortgage_desk_events',
  'forensic_field_reports',
  'closing_forensic_dossiers',
  'shabib_commission_expenses',
  'privacy_fast_track_jobs',
  'privacy_fast_track_invoices',
  'privacy_fast_track_docs',
  'work_items',
  'shift_handovers',
])

const OWNER_ONLY_WORKSPACE_SCOPES = new Set([
  'closing_forensic_dossiers',
  'shabib_commission_expenses',
  'privacy_fast_track_jobs',
  'privacy_fast_track_invoices',
  'privacy_fast_track_docs',
])

export const INLINE_MEDIA_MIMES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  ogg: 'video/ogg',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  txt: 'text/plain; charset=utf-8',
}
const INLINE = INLINE_MEDIA_MIMES

export function verifyFileMagicBytes(fullPath: string, ext: string) {
  const fd = fs.openSync(fullPath, 'r')
  const buf = Buffer.alloc(16)
  let bytesRead = 0
  try { bytesRead = fs.readSync(fd, buf, 0, 16, 0) } finally { fs.closeSync(fd) }
  if (bytesRead >= 2 && buf[0] === 0x4d && buf[1] === 0x5a) throw bad('Executable binary files (PE/MZ) are not allowed')
  if (bytesRead >= 4 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) throw bad('Executable binary files (ELF) are not allowed')
  if (bytesRead >= 4 && ext === 'png' && !(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)) throw bad('Invalid PNG file header')
  if (bytesRead >= 3 && (ext === 'jpg' || ext === 'jpeg') && !(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) throw bad('Invalid JPEG file header')
  if (bytesRead >= 4 && ext === 'gif' && !(buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38)) throw bad('Invalid GIF file header')
  if (bytesRead >= 4 && ext === 'pptx' && !(buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05))) throw bad('Invalid PPTX file header')
}

function assertLinkedRecordAccess(
  req: FastifyRequest,
  entity: string,
  linkId: number,
  mode: 'view' | 'edit',
): { entity: string; id: number; label: string | null; isEntity: boolean } {
  const id = idOf(linkId)
  if (entity === 'tasks') {
    const t = q.get<any>(`SELECT id, title, assignee_id, created_by FROM tasks WHERE id = ? AND deleted_at IS NULL`, id)
    if (!t) throw notFound('Task not found')
    const user = req.user
    const allowed =
      Boolean(user && !user.party_id) &&
      (isOwnerSwkUser(user) ||
        isAdminSwkUser(user) ||
        Number(t.assignee_id) === Number(user!.id) ||
        Number(t.created_by) === Number(user!.id) ||
        can(user, 'projects', mode))
    if (!allowed) throw forbidden('You do not have permission to access attachments on this task')
    return { entity, id, label: String(t.title || `Task #${id}`), isEntity: true }
  }

  if (ENTITIES[entity]) {
    if (RESTRICTED_HR_PII_ENTITIES.has(entity) && !canViewEmployeeRecords(req.user)) {
      throw forbidden('Access restricted: HR, payroll, salary, and staff visa records are only accessible to Owner, Admin, Operations Manager, and HR.')
    }
    const def = getDef(entity)
    if (mode === 'edit') assertCan(req.ctx, def.module, 'edit')
    const r = getRecord(def, id, req.ctx, { children: false })
    return { entity, id, label: r._title ?? `${def.label} #${id}`, isEntity: true }
  }

  if (WORKSPACE_SCOPES.has(entity)) {
    if (!req.user || req.user.party_id) throw forbidden('Company staff access required')
    if (OWNER_ONLY_WORKSPACE_SCOPES.has(entity) && !canAccessShabibsCorner(req.user)) {
      throw forbidden("This workspace section is restricted to Owner Shabib Siraj.")
    }
    return { entity, id, label: `${entity}#${id}`, isEntity: false }
  }

  throw bad(`Unsupported attachment target: ${entity}`)
}

export async function sendStoredAttachment(f: Record<string, any>, req: any, reply: any, opts?: { forceDownload?: boolean; cachePublic?: boolean }) {
  const fileName = String(f.file_name || 'file')
  const storedName = String(f.stored_name || '')
  const ext = path.extname(fileName).slice(1).toLowerCase()
  const contentType = INLINE[ext] ?? (f.mime && !/html|script|svg/i.test(String(f.mime)) ? String(f.mime) : 'application/octet-stream')
  const inline = Boolean(INLINE[ext]) && !opts?.forceDownload

  reply
    .header('content-type', contentType)
    .header('x-content-type-options', 'nosniff')
    .header('content-security-policy', "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'")
    .header('content-disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fileName)}`)
  if (opts?.cachePublic) {
    reply.header('cache-control', 'public, max-age=3600')
  }

  // Support HTTP Range requests for local video/media streaming (smooth scrubbing on Web + Android WebView)
  if (!isR2Name(storedName)) {
    const full = path.join(dirs.uploads, storedName)
    if (!full.startsWith(dirs.uploads) || !fs.existsSync(full)) throw notFound('The stored file is missing')
    const stat = fs.statSync(full)
    const rangeHeader = typeof req.headers?.range === 'string' ? req.headers.range : ''
    reply.header('accept-ranges', 'bytes')
    if (rangeHeader.startsWith('bytes=')) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
      if (m) {
        const start = m[1] ? Number(m[1]) : Math.max(0, stat.size - Number(m[2] || 0))
        const end = m[2] ? Math.min(stat.size - 1, Number(m[2])) : stat.size - 1
        if (start >= 0 && end >= start && start < stat.size) {
          reply
            .code(206)
            .header('content-range', `bytes ${start}-${end}/${stat.size}`)
            .header('content-length', String(end - start + 1))
          return reply.send(fs.createReadStream(full, { start, end }))
        }
      }
    }
    reply.header('content-length', String(stat.size))
    return reply.send(fs.createReadStream(full))
  }

  const stream = await openStored(storedName)
  if (!stream) throw notFound('The stored file is missing')
  return reply.send(stream)
}

export default async function (app: FastifyInstance) {
  app.get('/api/files', async (req) => {
    const qs = (req.query ?? {}) as Record<string, string>
    const entity = String(qs.link_entity || '').trim()
    const linkId = Number(qs.link_id)
    if (!entity || !Number.isInteger(linkId) || linkId <= 0) {
      throw bad('Provide link_entity and link_id to list attachments')
    }
    assertLinkedRecordAccess(req, entity, linkId, 'view')
    const rows = q.all<any>(
      `SELECT a.id, a.file_name, a.size, a.mime, a.category, a.doc_version, a.expiry_date, a.note, a.created_at, a.created_by, u.name AS uploader_name
       FROM attachments a
       LEFT JOIN users u ON u.id = a.created_by
       WHERE a.link_entity = ? AND a.link_id = ? AND a.deleted_at IS NULL
       ORDER BY a.id DESC
       LIMIT 100`,
      entity,
      linkId,
    )
    return {
      rows: rows.map(r => ({
        id: Number(r.id),
        file_name: String(r.file_name || 'file'),
        size: Number(r.size || 0),
        mime: r.mime ?? null,
        category: r.category ?? 'General',
        doc_version: Number(r.doc_version || 1),
        expiry_date: r.expiry_date ?? null,
        note: r.note ?? null,
        created_at: String(r.created_at || ''),
        uploader_name: r.uploader_name ?? null,
        download_url: `/api/files/${r.id}/download`,
      })),
    }
  })

  app.post('/api/files', async (req) => {
    if (!req.isMultipart()) throw bad('Expected a multipart upload')
    // Cheap gate before any byte is written: company staff may attach to records they can access (enforced below).
    const mayUpload =
      Boolean(req.user && !req.user.party_id) ||
      can(req.user, 'documents', 'create') ||
      Object.values(ENTITIES).some(e => can(req.user, e.module, 'edit'))
    if (!mayUpload) throw forbidden('You do not have permission to upload files')
    const out: any[] = []
    const fields: Record<string, string> = {}
    const saved: { name: string; stored: string; size: number; mime: string }[] = []
    const pending: string[] = [] // files on disk that no record points to yet
    const dayDir = path.join(dirs.uploads, todayStr().slice(0, 7))
    fs.mkdirSync(dayDir, { recursive: true })
    let link: { entity: string; id: number; label: string | null; isEntity: boolean } | null = null
    try {
      for await (const part of req.parts()) {
        if (part.type === 'field') { fields[part.fieldname] = String(part.value); continue }
        const orig = path.basename(part.filename || 'file').replace(/[^\w.\- ()]+/g, '_').slice(0, 150)
        const ext = path.extname(orig).slice(1).toLowerCase()
        if (BLOCKED.has(ext)) { part.file.resume(); throw bad(`Files of type .${ext} are not allowed`) }
        const stored = path.join(todayStr().slice(0, 7), crypto.randomBytes(16).toString('hex') + (ext ? '.' + ext : ''))
        const full = path.join(dirs.uploads, stored)
        pending.push(stored)
        await pipeline(part.file, fs.createWriteStream(full))
        if ((part.file as any).truncated) throw bad(`File exceeds the ${config.maxUploadMb} MB limit`)
        verifyFileMagicBytes(full, ext)
        const size = fs.statSync(full).size
        const kept = await persistUpload(stored, part.mimetype)
        pending[pending.indexOf(stored)] = kept
        saved.push({ name: orig, stored: kept, size, mime: part.mimetype })
      }
      if (!saved.length) throw bad('No file received')
      const entity = fields.link_entity, linkId = Number(fields.link_id)
      if (entity) {
        link = assertLinkedRecordAccess(req, entity, linkId, 'edit')
      } else assertCan(req.ctx, 'documents', 'create')
    } catch (e) {
      await Promise.all(pending.map(n => removeStored(n)))
      throw e
    }
    const entity = link?.entity, linkId = link?.id ?? 0, label = link?.label ?? null
    const now = nowIso()
    for (const f of saved) {
      const prev = q.get(`SELECT MAX(doc_version) v FROM attachments WHERE file_name = ? AND link_entity IS ? AND link_id IS ? AND deleted_at IS NULL`, f.name, entity ?? null, entity ? linkId : null)
      const docVersion = (prev?.v ?? 0) + 1
      const category = fields.category || 'General'
      const id = insertRow(
        getDef('attachments'),
        {
          file_name: f.name,
          stored_name: f.stored,
          size: f.size,
          mime: f.mime,
          category,
          link_entity: entity ?? null,
          link_id: entity ? linkId : null,
          link_label: label,
          expiry_date: fields.expiry_date || null,
          note: fields.note || null,
          doc_version: docVersion,
        },
        req.ctx,
      )
      audit(req.ctx, getDef('attachments'), id, 'upload', { file: [null, f.name] }, f.name)
      if (entity && link?.isEntity) audit(req.ctx, getDef(entity), linkId, 'attachment', { file: [null, f.name] }, label ?? '')
      out.push({
        id,
        file_name: f.name,
        size: f.size,
        mime: f.mime,
        category,
        doc_version: docVersion,
        created_at: now,
        uploader_name: req.user?.name ?? null,
        download_url: `/api/files/${id}/download`,
      })
    }
    return out
  })

  app.get('/api/files/:id/download', async (req, reply) => {
    const id = idOf((req.params as any).id)
    const f = q.get(`SELECT * FROM attachments WHERE id = ? AND deleted_at IS NULL`, id)
    if (!f) throw notFound('File not found')
    if (f.link_entity && f.link_id) {
      assertLinkedRecordAccess(req, String(f.link_entity), Number(f.link_id), 'view')
    } else assertCan(req.ctx, 'documents', 'view')
    return sendStoredAttachment(f, req, reply, { forceDownload: (req.query as any).inline === '0' })
  })

  app.delete('/api/files/:id', async (req) => {
    const id = idOf((req.params as any).id)
    const f = q.get(`SELECT * FROM attachments WHERE id = ? AND deleted_at IS NULL`, id)
    if (!f) throw notFound('File not found')
    if (f.link_entity && f.link_id) {
      if (Number(f.created_by) !== Number(req.user?.id)) {
        assertLinkedRecordAccess(req, String(f.link_entity), Number(f.link_id), 'edit')
      }
    } else assertCan(req.ctx, 'documents', 'delete')
    q.run(`UPDATE attachments SET deleted_at = ? WHERE id = ?`, nowIso(), id)
    audit(req.ctx, getDef('attachments'), id, 'delete', { file: [f.file_name, null] }, f.file_name)
    if (f.link_entity && ENTITIES[f.link_entity]) {
      audit(req.ctx, getDef(f.link_entity), f.link_id, 'attachment-removed', { file: [f.file_name, null] }, f.link_label ?? '')
    }
    return { ok: true }
  })
  void forbidden; void labelsFor; void can
}
