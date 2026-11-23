import { q, inDemo } from './db'
import { nowIso } from './util'
import { EventEmitter } from 'node:events'
import { loadUser } from './auth'
import { can } from './engine'
import { canAccessCrmVault } from '../shared/swk-staff-access'

/** Pushes each new notification to the signed-in person's open pages the moment it is saved. */
import { emitChange } from './changefeed'
export const liveBus = new EventEmitter()
liveBus.setMaxListeners(0)

export function notify(userId: number | null | undefined, title: string, body = '', link = '', kind = 'info', dedupe?: string) {
  if (!userId) return
  try {
    const r = q.run(`INSERT INTO notifications(user_id, kind, title, body, link, created_at, dedupe_key) VALUES (?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`, userId, kind, title, body, link, nowIso(), dedupe ?? null)
    if ((r as any)?.changes !== 0) {
      const row = q.get(`SELECT id, kind, title, body, link, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 1`, userId)
      if (row) { liveBus.emit('u:' + userId, row); emitChange('notifications', '', row.id, 'create', userId) }
    }
  } catch { /* never fail business logic for a notification */ }
}
export function notifyRole(permModule: string, title: string, body = '', link = '', kind = 'approval', dedupe?: string) {
  const users = q.all<{ id: number }>(`SELECT id FROM users WHERE deleted_at IS NULL AND active = 1 AND party_id IS NULL`)
  for (const u of users) {
    const loaded = loadUser(u.id)
    if (loaded && can(loaded, permModule, 'approve')) {
      notify(loaded.id, title, body, link, kind, dedupe ? `${dedupe}:${loaded.id}` : undefined)
    }
  }
}

/** Notify hardcoded leadership (Owner Shabib Siraj, Admin, and Operations Manager Mohammad Haseeb). */
export function notifyLeadership(title: string, body = '', link = '', kind = 'audit', dedupe?: string) {
  try {
    const users = q.all<{ id: number }>(
      `SELECT id FROM users WHERE deleted_at IS NULL AND active = 1 AND party_id IS NULL AND lower(email) IN ('shabib@swk.properties', 'admin@swk.properties', 'haseeb@swk.properties', 'demo@swkpropertiesuae.com')`,
    )
    for (const u of users) {
      const loaded = loadUser(u.id)
      if (!loaded) continue
      const ok = canAccessCrmVault(loaded) || (inDemo() && loaded.email.toLowerCase() === 'demo@swkpropertiesuae.com')
      if (ok) notify(loaded.id, title, body, link, kind, dedupe ? `${dedupe}:${loaded.id}` : undefined)
    }
  } catch { /* ignore */ }
}
