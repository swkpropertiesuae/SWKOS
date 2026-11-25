import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { q } from '../db'
import { ENTITY_LIST, ENTITIES } from '../../shared/entities'
import { canUseOsCustomizer } from '../../shared/swk-staff-access'
import { audit, getDef, insertRow, invalidateCustomFields } from '../engine'
import { loadSettings, setSettings } from '../settings'
import { cleanStudioHtml } from '../studio/sanitize'
import { bad, forbidden, notFound, nowIso } from '../util'
import { idOf } from './helpers'

function assertOwnerOrAdmin(req: any) {
  if (!canUseOsCustomizer(req.user)) {
    throw forbidden('No-Code OS Customizer is hardcoded exclusively to Owner (Shabib Siraj) and Admin accounts.')
  }
}

const DEFAULT_OPTION_GROUPS: Record<string, string[]> = {
  document_categories: [
    'Emirates ID',
    'Residence Visa',
    'Passport',
    'Labour Card / Work Permit',
    'RERA BRN Card',
    'Title Deed / Oqood',
    'Ejari',
    'Form A / B / F / I',
  ],
  lead_sources: [
    'Property Finder',
    'Bayut',
    'Dubizzle',
    'Instagram / Meta Ads',
    'WhatsApp Direct',
    'Owner Referral',
    'Walk-In Al Saqr Office',
    'Developer Launch Event',
  ],
  social_pillars: [
    'Luxury Listing Showcase',
    'Dubai Market Insight & DLD Data',
    'Off-Plan Launch Spotlight',
    'Investor ROI & Rental Yield',
    'Client Handover & Testimonial',
    'Dubai Community Guide',
    'SWK Behind the Scenes & Culture',
  ],
  property_tags: [
    'Exclusive SWK Mandate',
    'Distressed / Below Market',
    'High Yield > 7.5%',
    'Golden Visa Eligible (AED 2M+)',
    'Ready & Vacant on Transfer',
    'Waterfront / Lagoon View',
  ],
}

const FieldSchema = z.object({
  entity: z.string().trim().min(2).max(60),
  name: z.string().trim().regex(/^[a-z][a-z0-9_]{1,48}$/, 'Field key must start with a lowercase letter and use only lowercase letters, numbers, and underscores'),
  label: z.string().trim().min(1).max(80),
  type: z.enum(['text', 'textarea', 'number', 'date', 'select', 'bool']),
  options: z.string().max(1000).optional().default(''),
  required: z.boolean().optional().default(false),
  sort: z.number().int().min(0).max(9999).optional().default(100),
})

const TemplateSchema = z.object({
  code: z.string().trim().max(40).optional(),
  title: z.string().trim().min(2).max(160),
  category: z.string().trim().min(2).max(80).default('General'),
  kind: z.string().trim().min(2).max(60).default('Template'),
  description: z.string().max(400).optional().default(''),
  orientation: z.enum(['Portrait', 'Landscape']).optional().default('Portrait'),
  letterhead: z.boolean().optional().default(true),
  active: z.boolean().optional().default(true),
  content: z.string().min(1).max(200_000),
})

export default async function (app: FastifyInstance) {
  app.get('/api/customizer/state', async (req) => {
    assertOwnerOrAdmin(req)
    const s = loadSettings()
    const storedOpts = (s.os_custom_options && typeof s.os_custom_options === 'object') ? s.os_custom_options : {}
    const customOptions: Record<string, string[]> = { ...DEFAULT_OPTION_GROUPS, ...storedOpts }

    const fields = q.all<any>(`SELECT * FROM custom_fields WHERE deleted_at IS NULL ORDER BY entity, sort, id`)
    const templates = q.all<any>(
      `SELECT id, code, title, category, kind, description, orientation, letterhead, is_system, active, updated_at
       FROM doc_templates WHERE deleted_at IS NULL ORDER BY is_system ASC, code ASC`,
    )
    const entities = ENTITY_LIST
      .filter(e => !e.child && !e.readonlyApi && e.key !== 'custom_fields')
      .map(e => ({ key: e.key, label: e.label, plural: e.plural, module: e.module }))
      .sort((a, b) => a.plural.localeCompare(b.plural))

    return {
      ownerAdminHardcoded: true,
      fields,
      customOptions,
      templates,
      entities,
      branding: {
        company_name: s.company_name,
        company_phone: s.company_phone,
        company_email: s.company_email,
        company_address: s.company_address,
        invoice_footer: s.invoice_footer,
        document_watermark_enabled: s.document_watermark_enabled !== false,
        document_watermark_opacity: Number(s.document_watermark_opacity ?? 0.045),
      },
    }
  })

  // ---- Custom Fields No-Code CRUD
  app.post('/api/customizer/fields', async (req) => {
    assertOwnerOrAdmin(req)
    const b = FieldSchema.parse(req.body)
    if (!ENTITIES[b.entity]) throw bad(`Unknown record type "${b.entity}"`)
    const dup = q.get(
      `SELECT id FROM custom_fields WHERE entity = ? AND name = ? AND deleted_at IS NULL`,
      b.entity,
      b.name,
    )
    if (dup) throw bad(`Custom field "${b.name}" already exists on ${b.entity}`)
    const id = insertRow(
      getDef('custom_fields'),
      {
        entity: b.entity,
        name: b.name,
        label: b.label,
        type: b.type,
        options: b.type === 'select' ? b.options : '',
        required: b.required ? 1 : 0,
        sort: b.sort,
      },
      req.ctx,
    )
    invalidateCustomFields()
    audit(req.ctx, getDef('custom_fields'), id, 'customizer_add_field', { entity: [null, b.entity], name: [null, b.name], type: [null, b.type] }, `${b.entity}.${b.name}`)
    return q.get(`SELECT * FROM custom_fields WHERE id = ?`, id)
  })

  app.put('/api/customizer/fields/:id', async (req) => {
    assertOwnerOrAdmin(req)
    const id = idOf((req.params as any).id)
    const cur = q.get<any>(`SELECT * FROM custom_fields WHERE id = ? AND deleted_at IS NULL`, id)
    if (!cur) throw notFound('Custom field not found')
    const b = FieldSchema.partial().parse(req.body)
    const label = b.label ?? cur.label
    const type = b.type ?? cur.type
    const options = type === 'select' ? (b.options ?? cur.options ?? '') : ''
    const required = b.required !== undefined ? (b.required ? 1 : 0) : cur.required
    const sort = b.sort ?? cur.sort
    q.run(
      `UPDATE custom_fields SET label = ?, type = ?, options = ?, required = ?, sort = ?, updated_at = ?, updated_by = ? WHERE id = ?`,
      label, type, options, required, sort, nowIso(), req.user?.id ?? null, id,
    )
    invalidateCustomFields()
    audit(req.ctx, getDef('custom_fields'), id, 'customizer_edit_field', { label: [cur.label, label], type: [cur.type, type] }, `${cur.entity}.${cur.name}`)
    return q.get(`SELECT * FROM custom_fields WHERE id = ?`, id)
  })

  app.delete('/api/customizer/fields/:id', async (req) => {
    assertOwnerOrAdmin(req)
    const id = idOf((req.params as any).id)
    const cur = q.get<any>(`SELECT * FROM custom_fields WHERE id = ? AND deleted_at IS NULL`, id)
    if (!cur) throw notFound('Custom field not found')
    q.run(`UPDATE custom_fields SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?`, nowIso(), nowIso(), req.user?.id ?? null, id)
    invalidateCustomFields()
    audit(req.ctx, getDef('custom_fields'), id, 'customizer_delete_field', { field: [`${cur.entity}.${cur.name}`, null] }, `${cur.entity}.${cur.name}`)
    return { ok: true }
  })

  // ---- Custom Dropdown Option Lists No-Code Editor
  app.put('/api/customizer/options', async (req) => {
    assertOwnerOrAdmin(req)
    const b = z.object({
      groupKey: z.string().trim().regex(/^[a-z][a-z0-9_]{1,48}$/, 'Group key must be lowercase letters, numbers & underscores'),
      options: z.array(z.string().trim().min(1).max(120)).max(200),
    }).parse(req.body)
    const s = loadSettings()
    const current = (s.os_custom_options && typeof s.os_custom_options === 'object') ? { ...s.os_custom_options } : {}
    const cleaned = [...new Set(b.options.map(x => x.trim()).filter(Boolean))]
    current[b.groupKey] = cleaned
    setSettings({ os_custom_options: current })
    audit(req.ctx, getDef('branches'), 0, 'customizer_options', { [b.groupKey]: [null, `${cleaned.length} option(s)`] }, `Option list: ${b.groupKey}`)
    return { ok: true, groupKey: b.groupKey, options: cleaned, customOptions: { ...DEFAULT_OPTION_GROUPS, ...current } }
  })

  app.delete('/api/customizer/options/:groupKey', async (req) => {
    assertOwnerOrAdmin(req)
    const groupKey = String((req.params as any).groupKey || '').trim()
    const s = loadSettings()
    const current = (s.os_custom_options && typeof s.os_custom_options === 'object') ? { ...s.os_custom_options } : {}
    delete current[groupKey]
    setSettings({ os_custom_options: current })
    audit(req.ctx, getDef('branches'), 0, 'customizer_delete_option_group', { [groupKey]: ['removed', null] }, `Option list: ${groupKey}`)
    return { ok: true }
  })

  // ---- Own Document Templates No-Code Builder
  app.post('/api/customizer/templates', async (req) => {
    assertOwnerOrAdmin(req)
    const b = TemplateSchema.parse(req.body)
    const count = (q.val<number>(`SELECT COUNT(*) FROM doc_templates WHERE code LIKE 'OWN-%'`) ?? 0) + 1
    const code = (b.code && b.code.trim()) ? b.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32) : `OWN-${String(count).padStart(3, '0')}`
    const exists = q.get(`SELECT id FROM doc_templates WHERE code = ? AND deleted_at IS NULL`, code)
    if (exists) throw bad(`Template code "${code}" already exists`)
    const html = cleanStudioHtml(b.content)
    const id = insertRow(
      getDef('doc_templates'),
      {
        code,
        title: b.title,
        category: b.category,
        kind: b.kind,
        description: b.description || null,
        orientation: b.orientation,
        letterhead: b.letterhead ? 1 : 0,
        is_system: 0,
        active: b.active ? 1 : 0,
        content: html,
      },
      req.ctx,
    )
    audit(req.ctx, getDef('doc_templates'), id, 'customizer_create_template', { code: [null, code], title: [null, b.title] }, `${code} · ${b.title}`)
    return q.get(`SELECT * FROM doc_templates WHERE id = ?`, id)
  })

  app.put('/api/customizer/templates/:id', async (req) => {
    assertOwnerOrAdmin(req)
    const id = idOf((req.params as any).id)
    const cur = q.get<any>(`SELECT * FROM doc_templates WHERE id = ? AND deleted_at IS NULL`, id)
    if (!cur) throw notFound('Template not found')
    const b = TemplateSchema.partial().parse(req.body)
    const title = b.title ?? cur.title
    const category = b.category ?? cur.category
    const kind = b.kind ?? cur.kind
    const description = b.description !== undefined ? b.description : cur.description
    const orientation = b.orientation ?? cur.orientation
    const letterhead = b.letterhead !== undefined ? (b.letterhead ? 1 : 0) : cur.letterhead
    const active = b.active !== undefined ? (b.active ? 1 : 0) : cur.active
    const content = b.content !== undefined ? cleanStudioHtml(b.content) : cur.content
    q.run(
      `UPDATE doc_templates SET title = ?, category = ?, kind = ?, description = ?, orientation = ?, letterhead = ?, active = ?, content = ?, updated_at = ?, updated_by = ? WHERE id = ?`,
      title, category, kind, description, orientation, letterhead, active, content, nowIso(), req.user?.id ?? null, id,
    )
    audit(req.ctx, getDef('doc_templates'), id, 'customizer_edit_template', { title: [cur.title, title], active: [cur.active, active] }, `${cur.code} · ${title}`)
    return q.get(`SELECT * FROM doc_templates WHERE id = ?`, id)
  })

  app.delete('/api/customizer/templates/:id', async (req) => {
    assertOwnerOrAdmin(req)
    const id = idOf((req.params as any).id)
    const cur = q.get<any>(`SELECT * FROM doc_templates WHERE id = ? AND deleted_at IS NULL`, id)
    if (!cur) throw notFound('Template not found')
    q.run(`UPDATE doc_templates SET deleted_at = ?, active = 0, updated_at = ?, updated_by = ? WHERE id = ?`, nowIso(), nowIso(), req.user?.id ?? null, id)
    audit(req.ctx, getDef('doc_templates'), id, 'customizer_delete_template', { template: [`${cur.code} · ${cur.title}`, null] }, `${cur.code} · ${cur.title}`)
    return { ok: true }
  })

  // ---- Corporate Header, Footer & Watermark Settings
  app.put('/api/customizer/branding', async (req) => {
    assertOwnerOrAdmin(req)
    const b = z.object({
      company_name: z.string().trim().min(2).max(120).optional(),
      company_phone: z.string().trim().max(60).optional(),
      company_email: z.string().trim().max(120).optional(),
      company_address: z.string().trim().max(240).optional(),
      invoice_footer: z.string().trim().max(400).optional(),
      document_watermark_enabled: z.boolean().optional(),
      document_watermark_opacity: z.number().min(0.015).max(0.12).optional(),
    }).parse(req.body)
    setSettings(b)
    audit(req.ctx, getDef('branches'), 0, 'customizer_branding', b as any, 'Corporate header/footer & watermark')
    return { ok: true, branding: b }
  })
}
