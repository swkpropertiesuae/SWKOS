import type { FastifyInstance } from 'fastify'
import { q } from '../db'
import { ENTITIES } from '../../shared/entities'
import { canAccessMasterDataHub, canViewMasterSecurityLog } from '../../shared/swk-staff-access'
import { getSecurityPostureSnapshot } from '../security/hardening'
import { loadSettings } from '../settings'
import { forbidden, safeJson } from '../util'

interface MasterRegistryItem {
  key: string
  label: string
  category: 'Core Masters' | 'People & Access' | 'Real Estate Operations' | 'Finance & Compliance' | 'Platform & Automation'
  to: string
  count: number
  description: string
}

const MASTER_CATALOG: Array<Omit<MasterRegistryItem, 'count'>> = [
  { key: 'communities', label: 'Dubai Communities & Districts', category: 'Core Masters', to: '/e/communities', description: 'Master Dubai areas, districts & yield benchmarks' },
  { key: 'developers', label: 'Master Developers', category: 'Core Masters', to: '/e/developers', description: 'Emaar, Sobha, DAMAC, Nakheel & RERA developers' },
  { key: 'branches', label: 'Office Branches & Geofence', category: 'Core Masters', to: '/e/branches', description: 'Registered Dubai offices & operational locations' },
  { key: 'departments', label: 'Company Departments', category: 'Core Masters', to: '/e/departments', description: 'Management, Sales, Leasing, Operations, HR & IT' },
  { key: 'currencies', label: 'Currencies & FX Rates', category: 'Finance & Compliance', to: '/e/currencies', description: 'AED base currency & international settlement rates' },
  { key: 'taxes', label: 'UAE VAT & Tax Codes', category: 'Finance & Compliance', to: '/e/taxes', description: 'FTA 5% standard, 0% zero-rated & exempt tax codes' },
  { key: 'accounts', label: 'Chart of Accounts', category: 'Finance & Compliance', to: '/e/accounts', description: 'General ledger accounts for IFRS / UAE audit' },
  { key: 'payment_terms', label: 'Payment Terms', category: 'Finance & Compliance', to: '/e/payment_terms', description: 'Standard invoice & commission due schedules' },
  { key: 'employees', label: 'Staff & HR Directory', category: 'People & Access', to: '/e/employees', description: 'Employees, Emirates IDs, visas, passports & PDF vault' },
  { key: 'agents', label: 'RERA Brokers (BRN)', category: 'People & Access', to: '/e/agents', description: 'Licensed brokers, BRN cards & commission tiers' },
  { key: 'roles', label: 'Roles & Permissions', category: 'People & Access', to: '/admin/roles', description: 'Hardcoded RBAC & custom role definitions' },
  { key: 'properties', label: 'Master Properties & Buildings', category: 'Real Estate Operations', to: '/e/properties', description: 'Verified towers, villas & commercial inventory' },
  { key: 'units', label: 'Property Units', category: 'Real Estate Operations', to: '/e/units', description: 'Individual apartments, townhouses & offices' },
  { key: 'parties', label: 'Contacts, Buyers & Landlords', category: 'Real Estate Operations', to: '/e/parties', description: 'CRM master registry of clients & owners' },
  { key: 'inspection_templates', label: 'Inspection Checklists', category: 'Real Estate Operations', to: '/e/inspection_templates', description: 'Move-in / move-out handover templates' },
  { key: 'payment_plan_templates', label: 'Off-Plan Payment Plans', category: 'Real Estate Operations', to: '/e/payment_plan_templates', description: 'Developer instalment plan structures' },
  { key: 'lead_routing_rules', label: 'Lead Routing Rules', category: 'Platform & Automation', to: '/e/lead_routing_rules', description: 'Automated enquiry distribution logic' },
  { key: 'custom_fields', label: 'No-Code Custom Fields', category: 'Platform & Automation', to: '/admin/customizer', description: 'Owner/Admin custom fields added across OS records' },
  { key: 'doc_templates', label: 'Confidential Document Templates', category: 'Platform & Automation', to: '/studio', description: 'RERA forms, contracts & executive letters' },
  { key: 'attachments', label: 'Uploaded Files & PDF Vault', category: 'Platform & Automation', to: '/documents', description: 'All uploaded EID, Visa, Title Deed & contract PDFs' },
]

function safeCount(sql: string, ...args: any[]): number {
  try {
    return Number(q.val<number>(sql, ...args) ?? 0)
  } catch {
    return 0
  }
}

function csvCell(v: unknown): string {
  const s = String(v ?? '')
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return `"${safe.replace(/"/g, '""')}"`
}

export default async function (app: FastifyInstance) {
  app.get('/api/master-hub/overview', async (req) => {
    if (!canAccessMasterDataHub(req.user)) {
      throw forbidden('Master Data Hub is restricted to SWK leadership and authorized coordinators.')
    }
    const canSeeSecurity = canViewMasterSecurityLog(req.user)
    const s = loadSettings()

    // 1. Live Master Data Registry counts
    const registry: MasterRegistryItem[] = MASTER_CATALOG.map(item => {
      const hasSoftDelete = !!ENTITIES[item.key]
      const count = hasSoftDelete
        ? safeCount(`SELECT COUNT(*) FROM ${item.key} WHERE deleted_at IS NULL`)
        : safeCount(`SELECT COUNT(*) FROM ${item.key}`)
      return { ...item, count }
    })

    // 2. Deep Operational Gap & Readiness Analyzer across the entire OS
    const totalEmployees = safeCount(`SELECT COUNT(*) FROM employees WHERE deleted_at IS NULL`)
    const employeesWithPdf = safeCount(
      `SELECT COUNT(DISTINCT link_id) FROM attachments WHERE link_entity = 'employees' AND deleted_at IS NULL`,
    )
    const employeesMissingDocs = Math.max(0, totalEmployees - employeesWithPdf)

    const totalProperties = safeCount(`SELECT COUNT(*) FROM properties WHERE deleted_at IS NULL`)
    const propertiesMissingDocs = Math.max(
      0,
      totalProperties - safeCount(`SELECT COUNT(DISTINCT link_id) FROM attachments WHERE link_entity = 'properties' AND deleted_at IS NULL`),
    )

    const agentsMissingBrn = safeCount(
      `SELECT COUNT(*) FROM agents WHERE deleted_at IS NULL AND (brn IS NULL OR trim(brn) = '')`,
    )
    const pendingSealApprovals = safeCount(
      `SELECT COUNT(*) FROM document_seal_approvals WHERE status = 'Pending'`,
    )
    const pendingUniversalApprovals = safeCount(
      `SELECT COUNT(*) FROM universal_approvals WHERE deleted_at IS NULL AND status = 'Pending'`,
    )
    const socialDraftCount = safeCount(
      `SELECT COUNT(*) FROM social_posts WHERE deleted_at IS NULL AND status = 'Draft'`,
    )
    const socialHandedOverCount = safeCount(
      `SELECT COUNT(*) FROM social_posts WHERE deleted_at IS NULL AND status = 'Handed Over to Meenakshi'`,
    )
    const customFieldsCount = safeCount(`SELECT COUNT(*) FROM custom_fields WHERE deleted_at IS NULL`)
    const a2aReady = safeCount(`SELECT COUNT(*) FROM doc_templates WHERE code = 'A2A-01' AND deleted_at IS NULL`) > 0

    const gaps: Array<{
      id: string
      severity: 'high' | 'medium' | 'low' | 'ok'
      area: string
      title: string
      detail: string
      actionLabel: string
      actionTo: string
    }> = []

    if (employeesMissingDocs > 0) {
      gaps.push({
        id: 'emp-missing-pdfs',
        severity: 'high',
        area: 'HR & Staff Compliance',
        title: `${employeesMissingDocs} of ${totalEmployees} employees have no uploaded EID / Visa / Passport PDFs`,
        detail: 'Open any employee profile → EID / Visa & PDFs tab to attach Emirates ID, Residence Visa, Passport, Labour Card, and RERA BRN scans.',
        actionLabel: 'Open Employees',
        actionTo: '/e/employees',
      })
    } else {
      gaps.push({
        id: 'emp-pdfs-ok',
        severity: 'ok',
        area: 'HR & Staff Compliance',
        title: 'All staff records have attached PDFs in HR Vault',
        detail: `${employeesWithPdf} employee dossier(s) have verified documents stored.`,
        actionLabel: 'Review Employees',
        actionTo: '/e/employees',
      })
    }

    if (propertiesMissingDocs > 0) {
      gaps.push({
        id: 'prop-missing-docs',
        severity: 'medium',
        area: 'Properties & DLD Readiness',
        title: `${propertiesMissingDocs} properties have no Title Deed / Trakheesi Permit PDF attached`,
        detail: 'Upload Title Deeds, Oqoods, Form A, and Trakheesi permits directly from any Property record → Documents & PDFs tab.',
        actionLabel: 'Review Properties',
        actionTo: '/e/properties',
      })
    }

    if (agentsMissingBrn > 0) {
      gaps.push({
        id: 'agents-missing-brn',
        severity: 'high',
        area: 'RERA Broker Licensing',
        title: `${agentsMissingBrn} broker record(s) missing RERA BRN number`,
        detail: 'Every Dubai broker conducting viewings or signing Form A/B/F/I must maintain a valid BRN on file.',
        actionLabel: 'Update Brokers',
        actionTo: '/e/agents',
      })
    }

    if (!s.smtp_host && !s.resend_api_key) {
      gaps.push({
        id: 'email-not-configured',
        severity: 'medium',
        area: 'Communications & Integrations',
        title: 'Outgoing Email (SMTP / Resend) not yet connected',
        detail: 'Configure SMTP or Resend under Connections so invoices, statements, and Owner notifications deliver externally.',
        actionLabel: 'Configure Connections',
        actionTo: '/admin/integrations',
      })
    }

    if (!s.wa_enabled || !s.wa_access_token) {
      gaps.push({
        id: 'whatsapp-not-configured',
        severity: 'low',
        area: 'Omnichannel Messaging',
        title: 'WhatsApp Cloud / Meta Bridge credentials pending',
        detail: 'Add Meta Graph credentials to unlock live external WhatsApp, Facebook & Instagram messaging from SWK Inside.',
        actionLabel: 'Connect Meta / WhatsApp',
        actionTo: '/admin/integrations',
      })
    }

    if (pendingSealApprovals > 0 || pendingUniversalApprovals > 0) {
      gaps.push({
        id: 'pending-owner-approvals',
        severity: 'medium',
        area: 'Governance & Approvals',
        title: `${pendingSealApprovals + pendingUniversalApprovals} approval item(s) awaiting executive sign-off`,
        detail: `${pendingSealApprovals} Company Seal/Signature request(s) and ${pendingUniversalApprovals} operational approval(s) queued.`,
        actionLabel: 'Review Approvals',
        actionTo: '/e/universal_approvals',
      })
    }

    if (socialDraftCount > 0 || socialHandedOverCount > 0) {
      gaps.push({
        id: 'social-pipeline',
        severity: 'low',
        area: 'Social Media Operations',
        title: `Social Media 30-Day Queue: ${socialDraftCount} draft(s), ${socialHandedOverCount} handed over to Meenakshi`,
        detail: 'Review or batch-schedule 30 days of Dubai property content and hand over to Meenakshi for publishing.',
        actionLabel: 'Open Social Suite',
        actionTo: '/social-media',
      })
    }

    gaps.push({
      id: 'a2a-template-ready',
      severity: a2aReady ? 'ok' : 'medium',
      area: 'RERA Statutory Forms',
      title: a2aReady ? 'Brand-Free RERA Form I (A2A-01) installed & ready' : 'RERA Form I (A2A-01) not found',
      detail: 'Exact RERA Agent-to-Agent Form I without SWK brand assets is ready in Document Studio for co-broker deals.',
      actionLabel: 'Open Studio',
      actionTo: '/studio',
    })

    const operationalHealthScore = Math.max(
      40,
      100 -
        gaps.filter(g => g.severity === 'high').length * 12 -
        gaps.filter(g => g.severity === 'medium').length * 6 -
        gaps.filter(g => g.severity === 'low').length * 2,
    )

    return {
      canSeeSecurity,
      registry,
      totals: {
        masterTables: registry.length,
        totalMasterRecords: registry.reduce((acc, r) => acc + r.count, 0),
        customFieldsCount,
        totalAttachments: safeCount(`SELECT COUNT(*) FROM attachments WHERE deleted_at IS NULL`),
        totalAuditEntries: canSeeSecurity ? safeCount(`SELECT COUNT(*) FROM audit_log`) : 0,
        operationalHealthScore,
      },
      gaps,
      security: canSeeSecurity ? getSecurityPostureSnapshot() : null,
    }
  })

  app.get('/api/master-hub/log', async (req) => {
    if (!canViewMasterSecurityLog(req.user)) {
      throw forbidden('360° Master Log is restricted to Owner, Admin, and Operations Manager.')
    }
    const qs = (req.query as Record<string, any>) ?? {}
    const source = String(qs.source || 'all').toLowerCase()
    const needle = String(qs.q || '').trim().toLowerCase()
    const entityFilter = String(qs.entity || '').trim().toLowerCase()
    const limit = Math.min(Math.max(Number(qs.limit) || 120, 10), 400)

    const items: Array<{
      uid: string
      source: 'audit' | 'login' | 'attachment' | 'attendance' | 'integration'
      at: string
      actor: string
      action: string
      entity: string
      target: string
      detail: string
      ip: string
      severity: 'info' | 'warn' | 'critical'
    }> = []

    if (source === 'all' || source === 'audit') {
      const rows = q.all<any>(`SELECT id, at, user_name, entity, record_id, record_label, action, changes, ip FROM audit_log ORDER BY id DESC LIMIT ?`, limit)
      for (const r of rows) {
        const ch = safeJson(r.changes, r.changes)
        const summary = typeof ch === 'object' && ch ? JSON.stringify(ch).slice(0, 220) : String(ch ?? '')
        const act = String(r.action || '')
        items.push({
          uid: `audit-${r.id}`,
          source: 'audit',
          at: String(r.at || ''),
          actor: String(r.user_name || 'System'),
          action: act,
          entity: String(r.entity || ''),
          target: String(r.record_label || `#${r.record_id ?? ''}`),
          detail: summary,
          ip: String(r.ip || ''),
          severity: act === 'security_block' || act === 'delete' ? 'critical' : act.includes('override') || act.includes('seal') ? 'warn' : 'info',
        })
      }
    }

    if (source === 'all' || source === 'login') {
      const rows = q.all<any>(`SELECT id, at, email, success, reason, ip, user_agent FROM login_events ORDER BY id DESC LIMIT ?`, Math.min(limit, 150))
      for (const r of rows) {
        items.push({
          uid: `login-${r.id}`,
          source: 'login',
          at: String(r.at || ''),
          actor: String(r.email || 'Unknown'),
          action: r.success ? 'login_success' : 'login_failed',
          entity: 'auth',
          target: String(r.email || ''),
          detail: String(r.reason || (r.success ? 'Authenticated session started' : 'Rejected credentials')),
          ip: String(r.ip || ''),
          severity: r.success ? 'info' : 'warn',
        })
      }
    }

    if (source === 'all' || source === 'attachment') {
      const rows = q.all<any>(`SELECT id, created_at, file_name, category, link_entity, link_label, size, expiry_date FROM attachments WHERE deleted_at IS NULL ORDER BY id DESC LIMIT ?`, Math.min(limit, 120))
      for (const r of rows) {
        items.push({
          uid: `att-${r.id}`,
          source: 'attachment',
          at: String(r.created_at || ''),
          actor: 'Document Vault',
          action: 'file_upload',
          entity: String(r.link_entity || 'documents'),
          target: String(r.file_name || ''),
          detail: `${r.category || 'General'}${r.link_label ? ` · ${r.link_label}` : ''}${r.expiry_date ? ` · Exp ${r.expiry_date}` : ''} (${Math.round((Number(r.size) || 0) / 1024)} KB)`,
          ip: '',
          severity: 'info',
        })
      }
    }

    if (source === 'all' || source === 'attendance') {
      try {
        const rows = q.all<any>(`SELECT id, created_at, employee_name, event_type, status, note FROM attendance_events WHERE deleted_at IS NULL ORDER BY id DESC LIMIT ?`, Math.min(limit, 100))
        for (const r of rows) {
          items.push({
            uid: `attnd-${r.id}`,
            source: 'attendance',
            at: String(r.created_at || ''),
            actor: String(r.employee_name || 'Staff'),
            action: String(r.event_type || 'check_in'),
            entity: 'attendance_events',
            target: String(r.status || ''),
            detail: String(r.note || 'Office reception / field check-in event'),
            ip: '',
            severity: 'info',
          })
        }
      } catch { /* optional table columns */ }
    }

    if (source === 'all' || source === 'integration') {
      try {
        const rows = q.all<any>(`SELECT id, at, provider, event, status, detail FROM integration_logs ORDER BY id DESC LIMIT ?`, Math.min(limit, 80))
        for (const r of rows) {
          items.push({
            uid: `int-${r.id}`,
            source: 'integration',
            at: String(r.at || ''),
            actor: String(r.provider || 'Connector'),
            action: String(r.event || 'sync'),
            entity: 'integrations',
            target: String(r.status || ''),
            detail: String(r.detail || ''),
            ip: '',
            severity: String(r.status || '').toLowerCase().includes('fail') ? 'warn' : 'info',
          })
        }
      } catch { /* optional */ }
    }

    const filtered = items
      .filter(it => {
        if (entityFilter && !it.entity.toLowerCase().includes(entityFilter)) return false
        if (!needle) return true
        return `${it.actor} ${it.action} ${it.entity} ${it.target} ${it.detail} ${it.ip}`.toLowerCase().includes(needle)
      })
      .sort((a, b) => (b.at || '').localeCompare(a.at || ''))
      .slice(0, limit)

    return { total: filtered.length, rows: filtered }
  })

  app.get('/api/master-hub/log/export.csv', async (req, reply) => {
    if (!canViewMasterSecurityLog(req.user)) {
      throw forbidden('Only Owner, Admin, and Operations Manager can export the Master Log.')
    }
    const rows = q.all<any>(`SELECT id, at, user_name, entity, record_id, record_label, action, changes, ip FROM audit_log ORDER BY id DESC LIMIT 1000`)
    const header = ['ID', 'Timestamp (UTC)', 'Actor', 'Entity', 'Record ID', 'Record Label', 'Action', 'IP Address', 'Details']
    const lines = [
      header.map(csvCell).join(','),
      ...rows.map(r => [r.id, r.at, r.user_name, r.entity, r.record_id, r.record_label, r.action, r.ip, r.changes].map(csvCell).join(',')),
    ]
    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="swk-master-log-${new Date().toISOString().slice(0, 10)}.csv"`)
    return reply.send('\uFEFF' + lines.join('\r\n'))
  })
}
