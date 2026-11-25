import { ensureTeamGroup } from './routes/chat'
import { seedWebsiteContent } from './website'
import fs from 'node:fs'
import path from 'node:path'
import { config,dirs } from './config'
import { isPg,PgDatabase,q } from './db'
import { SYSTEM_CTX } from './engine'
import { nowIso } from './util'
import { businessDataSummary,clearStarterDeclined,loadSwkStarterData,resetBusinessData,starterDeclined,starterLoaded } from './domain/business-data'
import { ensureHardcodedSwkStaffAccounts,applyConfiguredPasswords,applyPasswordReset,syncSwkStaffRoster,retireSwk2026PatternPasswords } from './seed'
import { setSettings } from './settings'
import { SWK_STAFF_ACCOUNTS } from '../shared/swk-staff-access'

const FRESH_OWNER_ADMIN_RESET_KEY = 'reset:fresh-staff-2026-11-17'
const XAVIER_BUSINESS_WIFI_SYNC_KEY = 'wifi:xavier-business-2026-11-25'

/** Removes every internal login that is not one of the official staff accounts (old @swkpropertiesuae.com and @swk.property users). Customer-portal users are kept. */
function removeUnlistedStaffUsers() {
  const keep = SWK_STAFF_ACCOUNTS.map(a => a.email.toLowerCase())
  const where = `party_id IS NULL AND lower(email) NOT IN (${keep.map(() => '?').join(',')})`
  q.run(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE ${where})`, ...keep)
  q.run(`DELETE FROM users WHERE ${where}`, ...keep)
}

/** Fictional demo databases left from an earlier start are deleted when the demo workspace is switched off. */
function removeDisabledDemo() {
  if (config.demo.enabled) return
  try {
    if (isPg) { for (const s of [`${config.pgSchema}_demo`, `${config.pgSchema}_demo_next`]) new PgDatabase(s).dropSchema() }
    else if (fs.existsSync(dirs.demo)) for (const f of fs.readdirSync(dirs.demo)) if (/^(demo|template)\.db(\.next)?(-wal|-shm)?$/.test(f)) fs.rmSync(path.join(dirs.demo, f), { force: true })
  } catch (e) { console.error('Could not remove the old demo workspace:', e) }
}

/**
 * Start-up data tasks for the production workspace:
 *  1. RESET_BUSINESS_DATA_ON_START=<token> clears all business data once per token, after taking a backup.
 *  2. An empty production database receives the SWK OS starter data (STARTER_DATA=false switches this off).
 */
export async function runStartupDataTasks() {
  removeDisabledDemo()
  if (!q.val(`SELECT 1 FROM settings WHERE key = ?`, FRESH_OWNER_ADMIN_RESET_KEY)) {
    const r = await resetBusinessData({ user: null, system: true })
    removeUnlistedStaffUsers()
    ensureHardcodedSwkStaffAccounts()
    q.run(
      `INSERT INTO settings(key, value, updated_at) VALUES (?, '1', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      FRESH_OWNER_ADMIN_RESET_KEY,
      nowIso(),
    )
    clearStarterDeclined()
    console.log(`Fresh staff workspace reset completed (${r.total} rows cleared). Backup: ${r.backup}`)
  }
  const key = `reset:${config.resetToken}`
  if (config.resetToken && !q.val(`SELECT 1 FROM settings WHERE key = ?`, key)) {
    const r = await resetBusinessData({ user: null, system: true })
    ensureHardcodedSwkStaffAccounts()
    q.run(`INSERT INTO settings(key, value, updated_at) VALUES (?, '1', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, key, nowIso())
    // a start-up reset is a deliberate fresh start: the starter data may be loaded again afterwards (set STARTER_DATA=false to keep it empty)
    clearStarterDeclined()
    console.log(`Business data cleared (${r.total} rows). Backup: ${r.backup}`)
  }
  syncSwkStaffRoster()
  try { ensureTeamGroup() } catch (e) { console.warn('[inside] team group skipped:', (e as Error).message) }
  try { seedWebsiteContent() } catch (e) { console.warn('[website] seed skipped:', (e as Error).message) }
  applyConfiguredPasswords()
  retireSwk2026PatternPasswords()
  applyPasswordReset()
  // One-time production office network sync for XAVIER BUSINESS (AP BSSID 72:d7:9a:db:56:f0, Gateway 192.168.0.1, Public IP 2.50.42.191)
  if (config.isProd && !q.val(`SELECT 1 FROM settings WHERE key = ?`, XAVIER_BUSINESS_WIFI_SYNC_KEY)) {
    setSettings({
      office_wifi_ssid: 'XAVIER BUSINESS',
      office_wifi_bssid: '72:d7:9a:db:56:f0',
      office_wifi_gateway_ip: '192.168.0.1',
      office_wifi_public_ips: '2.50.42.191',
      office_wifi_strict_ip: true,
      office_gps_enforce: false,
      qr_mode: 'rotating',
    })
    q.run(
      `INSERT INTO settings(key, value, updated_at) VALUES (?, '1', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      XAVIER_BUSINESS_WIFI_SYNC_KEY,
      nowIso(),
    )
    console.log('[wifi] Synced production office network XAVIER BUSINESS (2.50.42.191 / 72:d7:9a:db:56:f0)')
  }
  if (config.starterData && !starterLoaded() && !starterDeclined() && businessDataSummary().total === 0) {
    const r = loadSwkStarterData(SYSTEM_CTX) as any
    if (r.loaded) console.log(`SWK OS starter data loaded (${r.invoices?.length} invoices, ${r.jobs?.length} jobs).`)
  }
}
