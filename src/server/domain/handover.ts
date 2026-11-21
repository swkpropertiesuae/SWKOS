import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { q, tx } from '../db'
import { bad, forbidden, notFound, nowIso } from '../util'
import { notify } from '../notify'
import { canAccessCrmVault, canOpenEmployeeRecords } from '../../shared/swk-staff-access'
import { upsertVaultProperties, type RawVaultPropertyInput } from './crm-vault'
import type { SessionUser } from '../engine'

/**
 * Controlled handover of lead data and staff documents (chain of custody):
 *   1. Admin Custody   – loaded into the Admin account; only Owner and Admin see it.
 *   2. With Manager    – Owner/Admin release a desk (or everything) to the Operations Manager.
 *   3. Staff           – the Manager dispatches leads with a masking policy (CRM Vault assign) and
 *                        releases each personal document to its named staff member.
 * Documents that carry client phone numbers (calling booklets, dialer workbooks) never leave management:
 * staff receive those leads only through the masked CRM Vault queue.
 */
export interface HandoverDocMeta {
  name: string
  title: string
  kind: 'Personal Playbook' | 'Field Guide' | 'Calling Booklet' | 'Dialer Workbook' | 'Roster Index'
  staff_email: string | null
  contains_contacts: boolean
  mime: string
  offset: number
  length: number
  sha256: string
}

export const HANDOVER_DATASET = 'ejari_dialer_2026'
const BUNDLE = path.resolve(process.cwd(), 'data-seed', 'swk-handover.enc.bin')

export const isTopCustodian = (u: SessionUser | null | undefined) => canOpenEmployeeRecords(u as any)
/** Rows in Admin Custody are hidden from everyone except Owner and Admin. */
export const custodyFilter = (u: SessionUser, alias = 'p') => (isTopCustodian(u) ? '' : ` AND (${alias}.custody IS NULL OR ${alias}.custody <> 'admin')`)

let cache: { sha: string; body: Buffer; header: { leads: RawVaultPropertyInput[]; docs: HandoverDocMeta[] } } | null = null

function bundleKey(): Buffer | null {
  const k = String(process.env.SWK_HANDOVER_KEY || '').trim()
  return /^[0-9a-f]{64}$/i.test(k) ? Buffer.from(k, 'hex') : null
}

function readBundle() {
  const key = bundleKey()
  if (!key || !fs.existsSync(BUNDLE)) return null
  const raw = fs.readFileSync(BUNDLE)
  const sha = crypto.createHash('sha256').update(raw).digest('hex')
  if (cache?.sha === sha) return cache
  const d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12))
  d.setAuthTag(raw.subarray(12, 28))
  const plain = zlib.gunzipSync(Buffer.concat([d.update(raw.subarray(28)), d.final()]))
  const len = plain.readUInt32BE(0)
  cache = { sha, header: JSON.parse(plain.subarray(4, 4 + len).toString('utf8')), body: plain.subarray(4 + len) }
  return cache
}

/** Start-up: loads a new bundle once into Admin Custody. Leads already released or dispatched keep their custody. */
export function loadHandoverBundle(): { loaded: boolean; leads?: number; docs?: number; reason?: string } {
  if (!bundleKey()) return { loaded: false, reason: 'SWK_HANDOVER_KEY not set' }
  if (!fs.existsSync(BUNDLE)) return { loaded: false, reason: 'bundle not present' }
  const sha = crypto.createHash('sha256').update(fs.readFileSync(BUNDLE)).digest('hex')
  if (q.val(`SELECT value FROM settings WHERE key = 'handover:bundle'`) === sha) return { loaded: false, reason: 'already loaded' }
  const b = readBundle()!
  const known = new Set(q.all<{ external_deal_id: string }>(`SELECT external_deal_id FROM crm_vault_properties WHERE source_dataset = ?`, HANDOVER_DATASET).map(r => r.external_deal_id))
  upsertVaultProperties(b.header.leads)
  const now = nowIso()
  tx(() => {
    for (const l of b.header.leads) if (!known.has(l.external_deal_id)) q.run(`UPDATE crm_vault_properties SET custody = 'admin' WHERE external_deal_id = ?`, l.external_deal_id)
    for (const d of b.header.docs) {
      const ex = q.get<{ id: number }>(`SELECT id FROM custody_documents WHERE name = ?`, d.name)
      if (ex) q.run(`UPDATE custody_documents SET title = ?, kind = ?, staff_email = ?, contains_contacts = ?, mime = ?, size = ?, sha256 = ?, bundle_offset = ?, updated_at = ? WHERE id = ?`, d.title, d.kind, d.staff_email, d.contains_contacts ? 1 : 0, d.mime, d.length, d.sha256, d.offset, now, ex.id)
      else q.run(`INSERT INTO custody_documents(name, title, kind, staff_email, contains_contacts, mime, size, sha256, bundle_offset, stage, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,'Admin Custody',?,?)`, d.name, d.title, d.kind, d.staff_email, d.contains_contacts ? 1 : 0, d.mime, d.length, d.sha256, d.offset, now, now)
    }
    q.run(`INSERT INTO settings(key, value, updated_at) VALUES ('handover:bundle', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, sha, now)
  })
  const admin = q.val<number>(`SELECT id FROM users WHERE lower(email) = 'admin@swk.properties' AND deleted_at IS NULL`)
  notify(admin, 'New handover received into Admin Custody', `${b.header.leads.length} Ejari leads and ${b.header.docs.length} documents are waiting for review and release to the Operations Manager.`, '/crm-vault?tab=custody', 'approval')
  return { loaded: true, leads: b.header.leads.length, docs: b.header.docs.length }
}

const audit = (u: SessionUser, action: string, label: string, changes: unknown) =>
  q.run(`INSERT INTO audit_log(at, user_id, user_name, entity, record_id, record_label, action, changes) VALUES (?,?,?,?,?,?,?,?)`, nowIso(), u.id, u.name, 'custody_handover', null, label, action, JSON.stringify(changes))

const managerUserId = () => q.val<number>(`SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'Manager' AND u.active = 1 AND u.deleted_at IS NULL AND u.party_id IS NULL ORDER BY u.id LIMIT 1`)

export function handoverOverview(u: SessionUser) {
  if (!canAccessCrmVault(u)) throw forbidden('Restricted to Owner, Admin and the Operations Manager.')
  const desks = q.all<any>(
    `SELECT COALESCE(p.suggested_agent, 'Unassigned') AS desk,
       SUM(CASE WHEN p.custody = 'admin' THEN 1 ELSE 0 END) AS admin_custody,
       SUM(CASE WHEN COALESCE(p.custody, 'manager') <> 'admin' AND p.assigned_user_id IS NULL THEN 1 ELSE 0 END) AS with_manager,
       SUM(CASE WHEN p.assigned_user_id IS NOT NULL THEN 1 ELSE 0 END) AS dispatched,
       COUNT(*) AS total
     FROM crm_vault_properties p WHERE p.source_dataset = ?${custodyFilter(u)}
     GROUP BY COALESCE(p.suggested_agent, 'Unassigned') ORDER BY desk`, HANDOVER_DATASET)
  const docs = q.all<any>(
    `SELECT d.id, d.title, d.kind, d.staff_email, d.contains_contacts, d.size, d.stage, d.manager_released_at, d.staff_released_at, u.name AS recipient_name
     FROM custody_documents d LEFT JOIN users u ON u.id = d.recipient_user_id
     ${isTopCustodian(u) ? '' : `WHERE d.stage <> 'Admin Custody'`} ORDER BY d.staff_email, d.kind`)
  return { can_release_to_manager: isTopCustodian(u), desks, docs }
}

/** Owner/Admin: hand a desk (staff_email) or the whole handover to the Operations Manager. */
export function releaseToManager(u: SessionUser, staffEmail?: string | null) {
  if (!isTopCustodian(u)) throw forbidden('Only the Owner or the Admin can release a handover to the Operations Manager.')
  const local = staffEmail ? staffEmail.split('@')[0].toLowerCase() : null
  const now = nowIso()
  let leads = 0, docs = 0
  tx(() => {
    leads = q.run(`UPDATE crm_vault_properties SET custody = 'manager', updated_at = ? WHERE source_dataset = ? AND custody = 'admin'${local ? ` AND lower(suggested_agent) = ?` : ''}`, now, HANDOVER_DATASET, ...(local ? [local] : [])).changes
    docs = q.run(`UPDATE custody_documents SET stage = 'With Manager', manager_released_at = ?, manager_released_by = ?, updated_at = ? WHERE stage = 'Admin Custody'${staffEmail ? ` AND lower(staff_email) = ?` : ''}`, now, u.id, now, ...(staffEmail ? [staffEmail.toLowerCase()] : [])).changes
  })
  if (!leads && !docs) throw bad('Nothing left in Admin Custody for this selection.')
  audit(u, 'release-to-manager', `Released ${leads} leads and ${docs} documents to the Operations Manager${staffEmail ? ` (desk ${staffEmail})` : ''}`, { staffEmail, leads, docs })
  notify(managerUserId(), 'Handover released to you', `${u.name} released ${leads} leads and ${docs} documents${staffEmail ? ` for ${staffEmail}` : ''}. Set the masking policy and dispatch them to staff.`, '/crm-vault?tab=custody', 'approval')
  return { ok: true, leads, docs }
}

/** Manager (or Owner/Admin): give a personal document to its staff member. Contact-bearing files stay with management. */
export function releaseDocToStaff(u: SessionUser, docId: number) {
  if (!canAccessCrmVault(u)) throw forbidden('Restricted to Owner, Admin and the Operations Manager.')
  const d = q.get<any>(`SELECT * FROM custody_documents WHERE id = ?`, docId)
  if (!d) throw notFound('Document not found')
  if (d.contains_contacts) throw bad('This file contains client phone numbers and cannot be given to staff. Dispatch its leads through the CRM Vault, where numbers stay masked.')
  if (d.stage !== 'With Manager') throw bad(d.stage === 'Admin Custody' ? 'The Admin has not released this document to the Operations Manager yet.' : 'This document is already with the staff member.')
  const target = q.get<{ id: number; name: string }>(`SELECT id, name FROM users WHERE lower(email) = ? AND active = 1 AND deleted_at IS NULL`, String(d.staff_email || '').toLowerCase())
  if (!target) throw bad('This document has no active staff recipient.')
  const now = nowIso()
  q.run(`UPDATE custody_documents SET stage = 'Released to Staff', recipient_user_id = ?, staff_released_at = ?, staff_released_by = ?, updated_at = ? WHERE id = ?`, target.id, now, u.id, now, docId)
  audit(u, 'release-to-staff', `${d.title} released to ${target.name}`, { docId, to: target.id })
  notify(target.id, 'New document from management', `${d.title} is now available under My Assigned Deals → My documents.`, '/my-deals', 'info')
  return { ok: true }
}

/** Owner/Admin: pull a document back into Admin Custody from any stage. */
export function recallDoc(u: SessionUser, docId: number) {
  if (!isTopCustodian(u)) throw forbidden('Only the Owner or the Admin can recall a document.')
  const r = q.run(`UPDATE custody_documents SET stage = 'Admin Custody', recipient_user_id = NULL, manager_released_at = NULL, manager_released_by = NULL, staff_released_at = NULL, staff_released_by = NULL, updated_at = ? WHERE id = ?`, nowIso(), docId)
  if (!r.changes) throw notFound('Document not found')
  audit(u, 'recall', `Document ${docId} recalled to Admin Custody`, { docId })
  return { ok: true }
}

export function myDocs(u: SessionUser) {
  return q.all(`SELECT id, title, kind, size, staff_released_at FROM custody_documents WHERE recipient_user_id = ? AND stage = 'Released to Staff' AND contains_contacts = 0 ORDER BY kind, title`, u.id)
}

/** Returns the file only to someone entitled to it at its current custody stage. */
export function openDoc(u: SessionUser, docId: number): { name: string; mime: string; body: Buffer } {
  const d = q.get<any>(`SELECT * FROM custody_documents WHERE id = ?`, docId)
  if (!d) throw notFound('Document not found')
  const ok = isTopCustodian(u)
    || (canAccessCrmVault(u) && d.stage !== 'Admin Custody')
    || (d.stage === 'Released to Staff' && d.recipient_user_id === u.id && !d.contains_contacts)
  if (!ok) throw forbidden('This document has not been released to you.')
  const b = readBundle()
  if (!b) throw bad('The handover file is not available on this server (SWK_HANDOVER_KEY missing).')
  const body = b.body.subarray(d.bundle_offset, d.bundle_offset + d.size)
  if (crypto.createHash('sha256').update(body).digest('hex') !== d.sha256) throw bad('The stored document does not match its checksum.')
  audit(u, 'download', d.title, { docId })
  return { name: d.name, mime: d.mime, body }
}
