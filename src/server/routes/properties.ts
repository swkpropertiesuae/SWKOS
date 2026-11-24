import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { q, tx } from '../db'
import { assertCan, createRecord, getDef, getRecord, listRecords, patchRecord } from '../engine'
import { bad, parseCsv, toCsv, todayStr } from '../util'
import { idOf, need } from './helpers'

const PROPERTY_TYPES = ['Apartment', 'Villa', 'Townhouse', 'Studio', 'Penthouse', 'Duplex', 'Loft', 'Bungalow', 'Compound', 'Bulk'] as const
const PROPERTY_STATUS = ['Available', 'Under Offer', 'Sold', 'Off-Plan', 'Rented', 'Reserved', 'Withdrawn'] as const
const DEPARTMENTS = ['Sales of Off-Plan Projects', 'Secondary Projects', 'Leasing'] as const
const SOURCES = ['Direct Developer', 'Direct Seller / Owner', 'Direct Landlord', '3rd-Party Agent (A2A)'] as const
const FURNISHING = ['Unfurnished', 'Semi-Furnished', 'Fully Furnished'] as const
const TENURE = ['Freehold', 'Leasehold', 'Usufruct', 'Musataha'] as const
const PAYMENT_PLANS = ['100% on completion', '50/50', '60/40', '70/30', '80/20', 'Post-handover 2y', 'Post-handover 3y', 'Custom'] as const

const HEADER_ALIAS: Record<string, string> = {
  'title': 'title', 'property title': 'title', 'listing title': 'title', 'name': 'title', 'property name': 'title', 'unit title': 'title',
  'department': 'department_division', 'core department': 'department_division', 'division': 'department_division', 'purpose': 'department_division', 'category': 'department_division', 'listing type': 'department_division',
  'source': 'inventory_source_type', 'inventory source': 'inventory_source_type', 'sourced from': 'inventory_source_type',
  'type': 'property_type', 'property type': 'property_type', 'unit type': 'property_type', 'asset type': 'property_type',
  'status': 'status', 'availability': 'status', 'listing status': 'status',
  'community': 'community', 'area': 'community', 'area name': 'community', 'district': 'community', 'location': 'community', 'master community': 'community',
  'sub-community': 'sub_community', 'sub community': 'sub_community', 'subcommunity': 'sub_community', 'project': 'sub_community', 'project name': 'sub_community',
  'building': 'building_name', 'building / tower': 'building_name', 'building name': 'building_name', 'tower': 'building_name', 'tower name': 'building_name',
  'unit': 'unit_no', 'unit no': 'unit_no', 'unit no.': 'unit_no', 'unit number': 'unit_no', 'apt': 'unit_no', 'villa no': 'unit_no',
  'developer': 'developer', 'master developer': 'developer', 'developer name': 'developer',
  'floor': 'floor_no', 'floor no': 'floor_no', 'level': 'floor_no',
  'bedrooms': 'bedrooms', 'beds': 'bedrooms', 'bed': 'bedrooms', 'br': 'bedrooms', 'bhk': 'bedrooms', 'rooms': 'bedrooms',
  'bathrooms': 'bathrooms', 'baths': 'bathrooms', 'bath': 'bathrooms', 'ba': 'bathrooms',
  'area (sq ft)': 'area_sqft', 'area sqft': 'area_sqft', 'sqft': 'area_sqft', 'size': 'area_sqft', 'size sqft': 'area_sqft', 'size (sqft)': 'area_sqft', 'bua': 'area_sqft', 'bua sqft': 'area_sqft', 'built up area': 'area_sqft',
  'area (sq m)': 'area_sqm', 'area sqm': 'area_sqm', 'sqm': 'area_sqm', 'size sqm': 'area_sqm',
  'plot area': 'plot_area_sqft', 'plot area (sq ft)': 'plot_area_sqft', 'plot sqft': 'plot_area_sqft',
  'sale price': 'price', 'sale price (aed)': 'price', 'price': 'price', 'price (aed)': 'price', 'asking price': 'price', 'asking price aed': 'price', 'selling price': 'price', 'aed': 'price',
  'annual rent': 'rent_annual', 'annual rent (aed)': 'rent_annual', 'rent': 'rent_annual', 'rent aed': 'rent_annual', 'yearly rent': 'rent_annual', 'rental price': 'rent_annual',
  'roi': 'roi_percent', 'roi %': 'roi_percent', 'yield': 'roi_percent', 'yield %': 'roi_percent',
  'furnishing': 'furnishing', 'furnished': 'furnishing',
  'tenure': 'tenure', 'ownership': 'tenure',
  'year built': 'year_built', 'built year': 'year_built',
  'completion': 'completion_year', 'completion year': 'completion_year', 'handover': 'completion_year', 'handover year': 'completion_year',
  'payment plan': 'payment_plan', 'plan': 'payment_plan',
  'off-plan': 'is_off_plan', 'off plan': 'is_off_plan', 'offplan': 'is_off_plan',
  'exclusive': 'is_exclusive', 'exclusive mandate': 'is_exclusive',
  'trakheesi': 'rera_permit_no', 'trakheesi permit': 'rera_permit_no', 'trakheesi permit no': 'rera_permit_no', 'trakheesi permit no.': 'rera_permit_no', 'permit': 'rera_permit_no', 'permit no': 'rera_permit_no', 'rera permit': 'rera_permit_no',
  'permit expiry': 'permit_expiry',
  'ejari': 'ejari_no', 'ejari no': 'ejari_no', 'ejari no.': 'ejari_no',
  'title deed': 'title_deed_no', 'title deed no': 'title_deed_no', 'title deed no.': 'title_deed_no', 'oqood': 'title_deed_no', 'deed no': 'title_deed_no',
  'makani': 'makani', 'makani number': 'makani',
  'address': 'address', 'full address': 'address',
  'description': 'description', 'remarks': 'description',
  'features': 'features', 'key features': 'features', 'highlights': 'features',
  'amenities': 'amenities',
  'notes': 'notes', 'internal notes': 'notes',
}

function parseMoneyValue(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim().toUpperCase()
  if (!s || s === '-' || s === 'N/A' || s === 'POA') return null
  const clean = s.replace(/AED|DHS|USD|,|\s|\/YR|\/YEAR|PER YEAR/g, '')
  const mult = clean.endsWith('M') ? 1_000_000 : clean.endsWith('K') ? 1_000 : 1
  const numPart = clean.replace(/[MK]+$/, '').replace(/[^0-9.]/g, '')
  const n = Number(numPart)
  return Number.isFinite(n) && n > 0 ? Math.round(n * mult) : null
}

function parseNumValue(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim()
  if (!s) return null
  if (/^studio$/i.test(s)) return 0
  const m = /-?\d+(?:[.,]\d+)?/.exec(s.replace(/,/g, ''))
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

function parseBoolValue(raw: unknown): boolean {
  return /^(1|true|yes|y|off-?plan|exclusive)$/i.test(String(raw ?? '').trim())
}

function matchEnum<T extends readonly string[]>(raw: unknown, allowed: T, fallback?: T[number]): T[number] | undefined {
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return fallback
  const exact = allowed.find(o => o.toLowerCase() === s)
  if (exact) return exact
  const partial = allowed.find(o => o.toLowerCase().includes(s) || s.includes(o.toLowerCase()))
  return partial ?? fallback
}

function normalizePropertyType(raw: unknown): (typeof PROPERTY_TYPES)[number] {
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return 'Apartment'
  if (/studio/.test(s)) return 'Studio'
  if (/pent/.test(s)) return 'Penthouse'
  if (/town/.test(s)) return 'Townhouse'
  if (/villa|mansion/.test(s)) return 'Villa'
  if (/duplex/.test(s)) return 'Duplex'
  if (/loft/.test(s)) return 'Loft'
  if (/bungalow/.test(s)) return 'Bungalow'
  if (/compound/.test(s)) return 'Compound'
  if (/bulk|building|plot/.test(s)) return 'Bulk'
  return matchEnum(raw, PROPERTY_TYPES, 'Apartment') ?? 'Apartment'
}

function normalizeDepartment(raw: unknown, isOffPlan: boolean, hasPrice: boolean, hasRent: boolean): (typeof DEPARTMENTS)[number] {
  const s = String(raw ?? '').trim().toLowerCase()
  if (/off[\s-]*plan|primary|launch/.test(s) || isOffPlan) return 'Sales of Off-Plan Projects'
  if (/rent|leas/.test(s) || (!hasPrice && hasRent)) return 'Leasing'
  if (/secondary|ready|resale|sale/.test(s)) return 'Secondary Projects'
  return 'Secondary Projects'
}

function normalizeFurnishing(raw: unknown): (typeof FURNISHING)[number] | undefined {
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return undefined
  if (/semi|part/.test(s)) return 'Semi-Furnished'
  if (/unfurnish|^no$/.test(s)) return 'Unfurnished'
  if (/furnish|^yes$/.test(s)) return 'Fully Furnished'
  return matchEnum(raw, FURNISHING)
}

export default async function (app: FastifyInstance) {
  const propertyDef = () => getDef('properties')
  const unitDef = () => getDef('units')
  const communityDef = () => getDef('communities')
  const developerDef = () => getDef('developers')

  const loadProperty = (req: any, edit = false) => {
    const id = idOf(req.params.id)
    if (edit) assertCan(req.ctx, 'properties', 'edit')
    return { id, property: getRecord(propertyDef(), id, req.ctx, { children: { units: true, media: true } }) }
  }

  const loadUnit = (req: any, edit = false) => {
    const id = idOf(req.params.id)
    if (edit) assertCan(req.ctx, 'properties', 'edit')
    return { id, unit: getRecord(unitDef(), id, req.ctx, { children: { media: true } }) }
  }

  // Property media upload/delete
  app.post('/api/properties/:id/media', async (req) => {
    const { id } = loadProperty(req, true)
    const b = z.object({ url: z.string().url(), caption: z.string().max(200).optional(), order: z.number().int().min(0).optional() }).parse(req.body)
    const prop = getRecord(propertyDef(), id, req.ctx)
    const media = prop.media ? JSON.parse(prop.media) : []
    media.push({ url: b.url, caption: b.caption, order: b.order ?? media.length, created_at: new Date().toISOString() })
    return patchRecord(propertyDef(), id, { media: JSON.stringify(media) }, req.ctx)
  })

  app.delete('/api/properties/:id/media/:mediaId', async (req) => {
    const { id } = loadProperty(req, true)
    const mediaId = idOf((req.params as any).mediaId)
    const prop = getRecord(propertyDef(), id, req.ctx)
    const media = prop.media ? JSON.parse(prop.media) : []
    const filtered = media.filter((m: any, i: number) => i !== mediaId)
    return patchRecord(propertyDef(), id, { media: JSON.stringify(filtered) }, req.ctx)
  })

  // Unit media upload/delete
  app.post('/api/units/:id/media', async (req) => {
    const { id } = loadUnit(req, true)
    const b = z.object({ url: z.string().url(), caption: z.string().max(200).optional(), order: z.number().int().min(0).optional() }).parse(req.body)
    const unit = getRecord(unitDef(), id, req.ctx)
    const media = unit.media ? JSON.parse(unit.media) : []
    media.push({ url: b.url, caption: b.caption, order: b.order ?? media.length, created_at: new Date().toISOString() })
    return patchRecord(unitDef(), id, { media: JSON.stringify(media) }, req.ctx)
  })

  app.delete('/api/units/:id/media/:mediaId', async (req) => {
    const { id } = loadUnit(req, true)
    const mediaId = idOf((req.params as any).mediaId)
    const unit = getRecord(unitDef(), id, req.ctx)
    const media = unit.media ? JSON.parse(unit.media) : []
    const filtered = media.filter((m: any, i: number) => i !== mediaId)
    return patchRecord(unitDef(), id, { media: JSON.stringify(filtered) }, req.ctx)
  })

  // Bulk status updates
  app.post('/api/properties/bulk-status', async (req) => {
    need(req, 'properties', 'edit')
    const b = z.object({ ids: z.array(z.number().int()).min(1).max(100), status: z.enum(['Available', 'Under Offer', 'Sold', 'Off-Plan', 'Rented', 'Reserved', 'Withdrawn']) }).parse(req.body)
    for (const id of b.ids) {
      const prop = getRecord(propertyDef(), id, req.ctx, { children: false })
      patchRecord(propertyDef(), id, { status: b.status }, req.ctx)
    }
    return { updated: b.ids.length }
  })

  app.post('/api/units/bulk-status', async (req) => {
    need(req, 'properties', 'edit')
    const b = z.object({ ids: z.array(z.number().int()).min(1).max(100), status: z.enum(['Available', 'Reserved', 'Under Offer', 'Sold', 'Rented', 'Under Maintenance', 'Blocked']) }).parse(req.body)
    for (const id of b.ids) {
      const unit = getRecord(unitDef(), id, req.ctx, { children: false })
      patchRecord(unitDef(), id, { status: b.status }, req.ctx)
    }
    return { updated: b.ids.length }
  })

  // Property search with filters
  app.get('/api/search/properties', async (req) => {
    need(req, 'properties', 'view')
    const qs = req.query as any
    const type = String(qs.type ?? 'title'), op = String(qs.op ?? 'contains'), value = String(qs.value ?? '').trim()
    if (!value) throw bad('Enter a value to search for')
    const map: Record<string, { entity: string; field: string }> = {
      title: { entity: 'properties', field: 'title' },
      property_type: { entity: 'properties', field: 'property_type' },
      status: { entity: 'properties', field: 'status' },
      community: { entity: 'properties', field: 'community_id' },
      developer: { entity: 'properties', field: 'developer_id' },
      rera_permit_no: { entity: 'properties', field: 'rera_permit_no' },
      ejari_no: { entity: 'properties', field: 'ejari_no' },
      title_deed_no: { entity: 'properties', field: 'title_deed_no' }
    }
    const m = map[type]
    if (!m) throw bad('Unknown search type')
    const opSql = op === 'equals' ? 'eq' : op === 'starts with' ? 'starts' : op === 'ends with' ? 'ends' : op
    let filters: any[] = [{ field: m.field, op: opSql, value }]
    const res = listRecords(propertyDef(), { filters, pageSize: 200, sort: 'listed_date', dir: 'desc' }, req.ctx)
    return { total: res.total, rows: res.rows.map(r => ({ id: r.id, title: r.title, property_type: r.property_type, status: r.status, price: r.price, rent_annual: r.rent_annual, community: r._labels.community_id ?? '', developer: r._labels.developer_id ?? '', listed_date: r.listed_date })) }
  })

  // Unit search
  app.get('/api/search/units', async (req) => {
    need(req, 'properties', 'view')
    const qs = req.query as any
    const type = String(qs.type ?? 'unit_no'), op = String(qs.op ?? 'contains'), value = String(qs.value ?? '').trim()
    if (!value) throw bad('Enter a value to search for')
    const map: Record<string, { entity: string; field: string }> = {
      unit_no: { entity: 'units', field: 'unit_no' },
      property: { entity: 'units', field: 'property_id' },
      status: { entity: 'units', field: 'status' }
    }
    const m = map[type]
    if (!m) throw bad('Unknown search type')
    const opSql = op === 'equals' ? 'eq' : op === 'starts with' ? 'starts' : op === 'ends with' ? 'ends' : op
    let filters: any[] = [{ field: m.field, op: opSql, value }]
    const res = listRecords(unitDef(), { filters, pageSize: 200, sort: 'unit_no', dir: 'asc' }, req.ctx)
    return { total: res.total, rows: res.rows.map(r => ({ id: r.id, unit_no: r.unit_no, property: r._labels.property_id ?? '', status: r.status, bedrooms: r.bedrooms, sale_price: r.sale_price, rent_annual: r.rent_annual })) }
  })

  // Communities search
  app.get('/api/search/communities', async (req) => {
    need(req, 'masters', 'view')
    const qs = req.query as any
    const value = String(qs.value ?? '').trim()
    if (!value) throw bad('Enter a value to search for')
    const rows = q.all(`SELECT id, code, name, emirate, master_developer, active FROM communities WHERE deleted_at IS NULL AND (name LIKE ? OR code LIKE ? OR emirate LIKE ?) ORDER BY name LIMIT 100`, `%${value}%`, `%${value}%`, `%${value}%`)
    return rows
  })

  // Developers search
  app.get('/api/search/developers', async (req) => {
    need(req, 'masters', 'view')
    const qs = req.query as any
    const value = String(qs.value ?? '').trim()
    if (!value) throw bad('Enter a value to search for')
    const rows = q.all(`SELECT id, code, name, rera_id, active FROM developers WHERE deleted_at IS NULL AND (name LIKE ? OR code LIKE ? OR rera_id LIKE ?) ORDER BY name LIMIT 100`, `%${value}%`, `%${value}%`, `%${value}%`)
    return rows
  })

  // =========================================================================
  // Sorted & Aligned Bulk Inventory Template + Importer (Matches Current Schema)
  // =========================================================================
  app.get('/api/properties/bulk-template.csv', async (req, reply) => {
    need(req, 'properties', 'create')
    const headers = [
      'Title',
      'Core Department',
      'Property Type',
      'Status',
      'Community',
      'Sub-Community',
      'Building / Tower',
      'Unit No',
      'Developer',
      'Bedrooms',
      'Bathrooms',
      'Area (sq ft)',
      'Sale Price (AED)',
      'Annual Rent (AED)',
      'Furnishing',
      'Tenure',
      'Floor',
      'Completion Year',
      'Payment Plan',
      'Off-Plan',
      'Trakheesi Permit No',
      'Title Deed No',
      'Inventory Source',
      'Features',
      'Description',
    ]
    const examples = [
      [
        '2BR Full Marina View · Marina Gate Tower 2',
        'Secondary Projects',
        'Apartment',
        'Available',
        'Dubai Marina',
        'Marina Gate',
        'Marina Gate Tower 2',
        '2405',
        'Select Group',
        '2',
        '3',
        '1385',
        '3450000',
        '',
        'Fully Furnished',
        'Freehold',
        '24',
        '',
        '',
        'No',
        '7128491024',
        'TD-2026-44102',
        'Direct Seller / Owner',
        'Full Marina View, Infinity Pool, Chiller Free, Vacant on Transfer',
        'High-floor upgraded 2-bedroom residence in Marina Gate 2 with panoramic water views.',
      ],
      [
        '3BR Lagoon Facing Townhouse · Creek Waters',
        'Sales of Off-Plan Projects',
        'Townhouse',
        'Off-Plan',
        'Dubai Creek Harbour',
        'Creek Island',
        'Creek Waters 2',
        'TH-14',
        'Emaar Properties',
        '3',
        '4',
        '2480',
        '5150000',
        '',
        'Unfurnished',
        'Freehold',
        '',
        '2027',
        '80/20',
        'Yes',
        '7190023114',
        '',
        'Direct Developer',
        'Waterfront Promenade, Private Garden, Maid Room, Golden Visa Eligible',
        'Exclusive Emaar waterfront townhouse with flexible 80/20 construction-linked plan.',
      ],
    ]
    reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="swk-bulk-inventory-template-${todayStr()}.csv"`)
    return toCsv(headers, examples)
  })

  app.post('/api/properties/bulk-import', async (req) => {
    need(req, 'properties', 'create')
    const b = z
      .object({
        csv: z.string().max(10_000_000).optional(),
        rows: z.array(z.record(z.string(), z.any())).max(2500).optional(),
        dryRun: z.boolean().default(true),
        sortBy: z.enum(['community_building_price', 'department_community', 'price_desc', 'price_asc', 'original']).default('community_building_price'),
        dedupeMode: z.enum(['skip', 'update', 'create']).default('skip'),
        defaultDepartment: z.string().optional(),
        defaultStatus: z.string().optional(),
      })
      .parse(req.body ?? {})

    let rawRecords: Record<string, any>[] = []
    let rawHeaders: string[] = []
    if (Array.isArray(b.rows) && b.rows.length) {
      rawRecords = b.rows
      rawHeaders = [...new Set(b.rows.flatMap(r => Object.keys(r ?? {})))]
    } else if (b.csv) {
      const parsed = parseCsv(b.csv)
      if (parsed.length < 2) throw bad('Uploaded spreadsheet has no data rows.')
      if (parsed.length > 2501) throw bad('Bulk inventory upload supports up to 2,500 properties per batch.')
      rawHeaders = parsed[0]!.map(h => String(h ?? '').trim())
      for (let i = 1; i < parsed.length; i++) {
        const rowArr = parsed[i]!
        if (!rowArr.some(c => String(c ?? '').trim() !== '')) continue
        const obj: Record<string, any> = {}
        rawHeaders.forEach((h, idx) => {
          if (h) obj[h] = rowArr[idx] ?? ''
        })
        rawRecords.push(obj)
      }
    } else {
      throw bad('Upload a CSV or Excel file with property rows.')
    }

    if (!rawRecords.length) throw bad('No non-empty rows found in the uploaded file.')

    // Build header mapping
    const detectedColumns: Record<string, string> = {}
    for (const h of rawHeaders) {
      const norm = h.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
      const mapped = HEADER_ALIAS[norm]
      if (mapped) detectedColumns[h] = mapped
    }
    if (!Object.keys(detectedColumns).length) {
      throw bad('Could not recognize any property columns. Download the SWK Bulk Inventory Template or include columns like Title, Community, Building, Bedrooms, Area (sq ft), Sale Price.')
    }

    // Lookup maps for communities & developers
    const commRows = q.all<{ id: number; name: string; code: string }>(`SELECT id, name, code FROM communities WHERE deleted_at IS NULL`)
    const devRows = q.all<{ id: number; name: string; code: string }>(`SELECT id, name, code FROM developers WHERE deleted_at IS NULL`)
    const resolveComm = (name: string) => {
      const low = name.trim().toLowerCase()
      if (!low) return null
      return (
        commRows.find(c => c.name.toLowerCase() === low || c.code.toLowerCase() === low) ??
        commRows.find(c => c.name.toLowerCase().includes(low) || low.includes(c.name.toLowerCase())) ??
        null
      )
    }
    const resolveDev = (name: string) => {
      const low = name.trim().toLowerCase()
      if (!low) return null
      return (
        devRows.find(d => d.name.toLowerCase() === low || d.code.toLowerCase() === low) ??
        devRows.find(d => d.name.toLowerCase().includes(low) || low.includes(d.name.toLowerCase())) ??
        null
      )
    }

    // Load existing property signatures for fast duplicate detection
    const existingProps = q.all<{ id: number; title: string; building_name: string | null; rera_permit_no: string | null; title_deed_no: string | null }>(
      `SELECT id, title, building_name, rera_permit_no, title_deed_no FROM properties WHERE deleted_at IS NULL`,
    )
    const byPermit = new Map<string, number>()
    const byDeed = new Map<string, number>()
    const byTitleBldg = new Map<string, number>()
    for (const ep of existingProps) {
      if (ep.rera_permit_no) byPermit.set(ep.rera_permit_no.trim().toLowerCase(), ep.id)
      if (ep.title_deed_no) byDeed.set(ep.title_deed_no.trim().toLowerCase(), ep.id)
      byTitleBldg.set(`${String(ep.title || '').trim().toLowerCase()}|${String(ep.building_name || '').trim().toLowerCase()}`, ep.id)
    }

    interface PreparedRow {
      sourceRow: number
      sortCommunity: string
      sortBuilding: string
      sortPrice: number
      sortDept: string
      payload: Record<string, any>
      existingId: number | null
      duplicateReason: string | null
      warnings: string[]
    }

    const prepared: PreparedRow[] = []
    const errors: { row: number; error: string }[] = []

    rawRecords.forEach((raw, idx) => {
      const rowNum = idx + 2
      const mapped: Record<string, any> = {}
      for (const [origKey, targetKey] of Object.entries(detectedColumns)) {
        const val = raw[origKey]
        if (val !== undefined && val !== null && String(val).trim() !== '' && mapped[targetKey] === undefined) {
          mapped[targetKey] = val
        }
      }

      const warnings: string[] = []
      const propType = normalizePropertyType(mapped.property_type)
      const beds = parseNumValue(mapped.bedrooms)
      const baths = parseNumValue(mapped.bathrooms)
      let areaSqft = parseNumValue(mapped.area_sqft)
      let areaSqm = parseNumValue(mapped.area_sqm)
      if (!areaSqft && areaSqm) areaSqft = Math.round(areaSqm * 10.7639)
      if (!areaSqm && areaSqft) areaSqm = Math.round((areaSqft / 10.7639) * 10) / 10
      const plotArea = parseNumValue(mapped.plot_area_sqft)
      const price = parseMoneyValue(mapped.price)
      const rentAnnual = parseMoneyValue(mapped.rent_annual)
      const floorNo = parseNumValue(mapped.floor_no)
      const yearBuilt = parseNumValue(mapped.year_built)
      const completionYear = parseNumValue(mapped.completion_year)
      const roi = parseNumValue(mapped.roi_percent)
      const isOffPlan =
        mapped.is_off_plan !== undefined
          ? parseBoolValue(mapped.is_off_plan)
          : String(mapped.status || '').toLowerCase().includes('off-plan') ||
            String(mapped.department_division || '').toLowerCase().includes('off-plan') ||
            (completionYear !== null && completionYear > new Date().getFullYear())

      const dept = normalizeDepartment(mapped.department_division || b.defaultDepartment, isOffPlan, Boolean(price), Boolean(rentAnnual))
      const status =
        matchEnum(mapped.status, PROPERTY_STATUS) ??
        (isOffPlan ? 'Off-Plan' : matchEnum(b.defaultStatus, PROPERTY_STATUS, 'Available') ?? 'Available')
      const furnishing = normalizeFurnishing(mapped.furnishing)
      const tenure = matchEnum(mapped.tenure, TENURE, 'Freehold')
      const paymentPlan = matchEnum(mapped.payment_plan, PAYMENT_PLANS)
      const invSource = matchEnum(mapped.inventory_source_type, SOURCES, isOffPlan ? 'Direct Developer' : dept === 'Leasing' ? 'Direct Landlord' : 'Direct Seller / Owner')

      const communityText = String(mapped.community ?? '').trim()
      const subCommunityText = String(mapped.sub_community ?? '').trim()
      const buildingText = String(mapped.building_name ?? '').trim()
      const unitNoText = String(mapped.unit_no ?? '').trim()
      const developerText = String(mapped.developer ?? '').trim()

      const commMatch = resolveComm(communityText || subCommunityText)
      const devMatch = resolveDev(developerText)
      if (communityText && !commMatch) warnings.push(`Community "${communityText}" saved in sub-community/address`)

      let title = String(mapped.title ?? '').trim()
      if (!title) {
        const bedPart = propType === 'Studio' || beds === 0 ? 'Studio' : beds ? `${beds}BR` : ''
        const parts = [
          [bedPart, propType].filter(Boolean).join(' '),
          [buildingText, unitNoText ? `Unit ${unitNoText}` : ''].filter(Boolean).join(' '),
          commMatch?.name || communityText || subCommunityText,
        ].filter(Boolean)
        title = parts.join(' · ').slice(0, 180)
      }
      if (!title) {
        errors.push({ row: rowNum, error: 'Missing Title (and insufficient Building / Community details to auto-generate one).' })
        return
      }

      const permitNo = String(mapped.rera_permit_no ?? '').trim() || undefined
      const deedNo = String(mapped.title_deed_no ?? '').trim() || undefined
      let existingId: number | null = null
      let duplicateReason: string | null = null
      if (permitNo && byPermit.has(permitNo.toLowerCase())) {
        existingId = byPermit.get(permitNo.toLowerCase())!
        duplicateReason = `Matches Trakheesi ${permitNo}`
      } else if (deedNo && byDeed.has(deedNo.toLowerCase())) {
        existingId = byDeed.get(deedNo.toLowerCase())!
        duplicateReason = `Matches Title Deed ${deedNo}`
      } else {
        const sig = `${title.toLowerCase()}|${buildingText.toLowerCase()}`
        if (byTitleBldg.has(sig)) {
          existingId = byTitleBldg.get(sig)!
          duplicateReason = 'Matches existing Title + Building'
        }
      }

      const payload: Record<string, any> = {
        title,
        department_division: dept,
        inventory_source_type: invSource,
        property_type: propType,
        status,
        community_ref: commMatch?.id ?? null,
        community_id: commMatch?.name || communityText || null,
        developer_ref: devMatch?.id ?? null,
        developer_id: devMatch?.name || developerText || null,
        sub_community: subCommunityText || (!commMatch && communityText ? communityText : null),
        building_name: buildingText || null,
        floor_no: floorNo !== null ? Math.round(floorNo) : null,
        furnishing: furnishing ?? null,
        tenure: tenure ?? 'Freehold',
        bedrooms: beds !== null ? Math.max(0, Math.min(20, beds)) : null,
        bathrooms: baths !== null ? Math.max(0, Math.min(20, baths)) : null,
        area_sqft: areaSqft !== null ? Math.max(0, areaSqft) : null,
        area_sqm: areaSqm !== null ? Math.max(0, areaSqm) : null,
        plot_area_sqft: plotArea !== null ? Math.max(0, plotArea) : null,
        price: price ?? null,
        rent_annual: rentAnnual ?? null,
        roi_percent: roi !== null ? Math.max(0, Math.min(100, roi)) : null,
        year_built: yearBuilt !== null && yearBuilt >= 1970 && yearBuilt <= 2030 ? Math.round(yearBuilt) : null,
        completion_year: completionYear !== null && completionYear >= 2020 && completionYear <= 2035 ? Math.round(completionYear) : null,
        payment_plan: paymentPlan ?? null,
        is_off_plan: isOffPlan,
        is_exclusive: mapped.is_exclusive !== undefined ? parseBoolValue(mapped.is_exclusive) : false,
        rera_permit_no: permitNo ?? null,
        permit_expiry: mapped.permit_expiry ? String(mapped.permit_expiry).trim().slice(0, 10) : null,
        ejari_no: String(mapped.ejari_no ?? '').trim() || null,
        title_deed_no: deedNo ?? null,
        makani: String(mapped.makani ?? '').trim() || null,
        address: String(mapped.address ?? '').trim() || [buildingText, subCommunityText, commMatch?.name || communityText, 'Dubai, UAE'].filter(Boolean).join(', '),
        description: String(mapped.description ?? '').trim() || null,
        features: String(mapped.features ?? '').trim() || null,
        amenities: String(mapped.amenities ?? '').trim() || null,
        notes: [mapped.notes, unitNoText ? `Unit: ${unitNoText}` : ''].filter(Boolean).join(' · ') || null,
        listed_date: todayStr(),
        active: true,
      }

      prepared.push({
        sourceRow: rowNum,
        sortCommunity: (commMatch?.name || communityText || subCommunityText || 'ZZZ').toLowerCase(),
        sortBuilding: (buildingText || title).toLowerCase(),
        sortPrice: price ?? rentAnnual ?? 0,
        sortDept: dept.toLowerCase(),
        payload,
        existingId,
        duplicateReason,
        warnings,
      })
    })

    // Sort cleanly according to selected strategy BEFORE upload
    const cmpStr = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    if (b.sortBy === 'community_building_price') {
      prepared.sort((a, c) => cmpStr(a.sortCommunity, c.sortCommunity) || cmpStr(a.sortBuilding, c.sortBuilding) || c.sortPrice - a.sortPrice)
    } else if (b.sortBy === 'department_community') {
      prepared.sort((a, c) => cmpStr(a.sortDept, c.sortDept) || cmpStr(a.sortCommunity, c.sortCommunity) || cmpStr(a.sortBuilding, c.sortBuilding) || c.sortPrice - a.sortPrice)
    } else if (b.sortBy === 'price_desc') {
      prepared.sort((a, c) => c.sortPrice - a.sortPrice || cmpStr(a.sortCommunity, c.sortCommunity))
    } else if (b.sortBy === 'price_asc') {
      prepared.sort((a, c) => a.sortPrice - c.sortPrice || cmpStr(a.sortCommunity, c.sortCommunity))
    }

    // Intra-batch deduplication & execution
    const seenBatch = new Set<string>()
    let created = 0
    let updated = 0
    let skipped = 0
    let duplicates = 0
    const preview: any[] = []

    const def = propertyDef()
    const runBatch = () => {
      for (const item of prepared) {
        const batchSig = `${item.payload.title.toLowerCase()}|${String(item.payload.building_name || '').toLowerCase()}|${item.payload.price ?? item.payload.rent_annual ?? 0}`
        const isIntraDup = seenBatch.has(batchSig)
        seenBatch.add(batchSig)
        const isDup = Boolean(item.existingId) || isIntraDup
        if (isDup) duplicates++

        let action: 'create' | 'update' | 'skip' = 'create'
        if (isDup) {
          if (b.dedupeMode === 'skip') action = 'skip'
          else if (b.dedupeMode === 'update' && item.existingId) action = 'update'
          else if (b.dedupeMode === 'update' && isIntraDup) action = 'skip'
        }

        if (!b.dryRun) {
          try {
            if (action === 'skip') {
              skipped++
            } else if (action === 'update' && item.existingId) {
              patchRecord(def, item.existingId, item.payload, req.ctx)
              updated++
            } else {
              createRecord(def, item.payload, req.ctx)
              created++
            }
          } catch (e: any) {
            errors.push({ row: item.sourceRow, error: e?.message ?? String(e) })
            continue
          }
        } else {
          if (action === 'skip') skipped++
          else if (action === 'update') updated++
          else created++
        }

        if (preview.length < 120) {
          preview.push({
            sourceRow: item.sourceRow,
            action,
            duplicateReason: item.duplicateReason || (isIntraDup ? 'Duplicate row inside file' : null),
            warnings: item.warnings,
            title: item.payload.title,
            department_division: item.payload.department_division,
            property_type: item.payload.property_type,
            status: item.payload.status,
            community: item.payload.community_id || item.payload.sub_community || 'Dubai',
            building_name: item.payload.building_name || '—',
            bedrooms: item.payload.bedrooms,
            area_sqft: item.payload.area_sqft,
            price: item.payload.price,
            rent_annual: item.payload.rent_annual,
            rera_permit_no: item.payload.rera_permit_no,
          })
        }
      }
    }

    if (b.dryRun) runBatch()
    else tx(runBatch)

    return {
      dryRun: b.dryRun,
      sortBy: b.sortBy,
      dedupeMode: b.dedupeMode,
      detectedColumns,
      summary: {
        total: rawRecords.length,
        valid: prepared.length,
        created,
        updated,
        skipped,
        duplicates,
        errors: errors.length,
      },
      preview,
      errors: errors.slice(0, 100),
    }
  })
}