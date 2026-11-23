import type { SessionUser } from '../engine'
import { inDemo } from '../db'
import { canAccessCrmVault, isAdminSwkUser, isOwnerSwkUser, isRestrictedStaffUser } from '../../shared/swk-staff-access'

/** Only reviewed tool capabilities may execute. New tools fail closed until reviewed here (tests/ai-controls.ts checks every tool is listed). */
const READ = new Set(['business_snapshot','search_deals','get_deal','search_parties','overdue_invoices','party_statement','bills_due','pipeline_summary','rent_roll','expiring_leases','mandate_health','list_leads','stale_opportunities','list_tasks','open_tickets','expiring_documents','lookup_listings','find_caller','market_pulse_lookup','my_assigned_deals_masked','my_attendance_status','my_daily_report_status'])
const INTERNAL = new Set(['create_task','add_note','create_lead','add_deal_event','alert_team','capture_lead','request_viewing','report_maintenance_issue','request_callback','transfer_call'])
const EXTERNAL = new Set(['send_email','send_whatsapp'])
const ALL_REVIEWED_TOOLS = new Set([...READ, ...INTERNAL, ...EXTERNAL])

export const ROLE_AI_TOOL_ALLOWLIST: Record<string, ReadonlySet<string>> = {
  Owner: ALL_REVIEWED_TOOLS,
  Admin: ALL_REVIEWED_TOOLS,
  Manager: ALL_REVIEWED_TOOLS,
  HR: new Set(['expiring_documents', 'list_tasks', 'lookup_listings', 'market_pulse_lookup', 'my_attendance_status', 'my_daily_report_status']),
  'Office Admin': new Set(['lookup_listings', 'list_tasks', 'open_tickets', 'create_lead', 'request_viewing', 'market_pulse_lookup', 'my_attendance_status', 'my_daily_report_status']),
  'Staff (Attendance & General)': new Set(['lookup_listings', 'market_pulse_lookup', 'my_assigned_deals_masked', 'my_attendance_status', 'my_daily_report_status']),
}

export function isToolAllowedForUser(user: SessionUser | null | undefined, toolName: string): boolean {
  if (!user || user.party_id) return false
  if (!ALL_REVIEWED_TOOLS.has(toolName)) return false
  if (isRestrictedStaffUser(user)) {
    return ROLE_AI_TOOL_ALLOWLIST['Staff (Attendance & General)'].has(toolName)
  }
  const email = String(user.email || '').trim().toLowerCase()
  const role = String(user.role_name || '').trim()
  if (canAccessCrmVault(user) || (inDemo() && email === 'demo@swkpropertiesuae.com')) {
    if (isOwnerSwkUser(user)) return ROLE_AI_TOOL_ALLOWLIST.Owner.has(toolName)
    if (isAdminSwkUser(user)) return ROLE_AI_TOOL_ALLOWLIST.Admin.has(toolName)
    return ROLE_AI_TOOL_ALLOWLIST.Manager.has(toolName)
  }
  if (role === 'HR') return ROLE_AI_TOOL_ALLOWLIST.HR.has(toolName)
  if (role === 'Office Admin') return ROLE_AI_TOOL_ALLOWLIST['Office Admin'].has(toolName)
  return ROLE_AI_TOOL_ALLOWLIST['Staff (Attendance & General)'].has(toolName)
}

export function toolPolicy(name: string, risk: string, autonomy: number): 'deny' | 'approve' | 'execute' {
  if (READ.has(name) && risk === 'read') return 'execute'
  if (INTERNAL.has(name) && risk === 'internal') return autonomy === 0 ? 'approve' : 'execute'
  if (EXTERNAL.has(name) && risk === 'external') return 'approve'
  return 'deny'
}
