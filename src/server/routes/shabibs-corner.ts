import type { FastifyInstance, FastifyRequest } from 'fastify'
import path from 'node:path'
import { z } from 'zod'
import readXlsxFile from 'read-excel-file/node'
import mammoth from 'mammoth'
import { q, tableExists, tx } from '../db'
import { audit, createRecord, getDef, type Ctx } from '../engine'
import { extractText } from '../ocr'
import { omniChat, omniConfigured } from '../ai/omni-router'
import { upsertVaultProperties, type RawVaultPropertyInput } from '../domain/crm-vault'
import { bad, forbidden, nowIso, parseCsv, safeJson, toCsv, todayStr } from '../util'
import {
  canAccessCrmVault,
  canAccessShabibsCorner,
  canUseConfidentialAiImporter,
  canUseEmergencyOverride,
} from '../../shared/swk-staff-access'

type ImportTarget = 'properties' | 'leads' | 'parties' | 'crm_vault' | 'jobs'

interface TargetFieldSpec {
  key: string
  label: string
  required?: boolean
  type: 'text' | 'number' | 'int' | 'phone' | 'email' | 'price' | 'bedrooms' | 'property_type' | 'date' | 'bool'
  aliases: string[]
}

const TARGET_SPECS: Record<ImportTarget, { label: string; description: string; fields: TargetFieldSpec[] }> = {
  properties: {
    label: 'Property Inventory',
    description: 'SWK OS active listing & property inventory (properties table)',
    fields: [
      { key: 'title', label: 'Property Title', required: true, type: 'text', aliases: ['title', 'property title', 'listing title', 'name', 'unit title', 'headline', 'property name', 'listing'] },
      { key: 'property_type', label: 'Property Type', required: true, type: 'property_type', aliases: ['property_type', 'property type', 'type', 'unit type', 'category', 'asset type', 'layout', 'kind'] },
      { key: 'department_division', label: 'Division', type: 'text', aliases: ['department_division', 'division', 'department', 'segment', 'purpose', 'sale/rent', 'listing type'] },
      { key: 'status', label: 'Status', type: 'text', aliases: ['status', 'availability', 'listing status', 'state'] },
      { key: 'community_ref', label: 'Community / Area', type: 'text', aliases: ['community_ref', 'community', 'area', 'location', 'district', 'master community', 'dubai area', 'neighbourhood', 'neighborhood', 'zone'] },
      { key: 'sub_community', label: 'Sub-Community', type: 'text', aliases: ['sub_community', 'sub community', 'subcommunity', 'cluster', 'phase', 'master project'] },
      { key: 'building_name', label: 'Building / Tower', type: 'text', aliases: ['building_name', 'building', 'tower', 'project', 'project name', 'development', 'residence'] },
      { key: 'developer_ref', label: 'Developer', type: 'text', aliases: ['developer_ref', 'developer', 'master developer', 'builder'] },
      { key: 'floor_no', label: 'Floor / Unit No', type: 'text', aliases: ['floor_no', 'floor', 'unit', 'unit no', 'unit number', 'door', 'apt', 'apartment no'] },
      { key: 'bedrooms', label: 'Bedrooms', type: 'bedrooms', aliases: ['bedrooms', 'beds', 'bed', 'br', 'bhk', 'rooms', 'bedroom'] },
      { key: 'bathrooms', label: 'Bathrooms', type: 'int', aliases: ['bathrooms', 'baths', 'bath', 'wc', 'washrooms'] },
      { key: 'area_sqft', label: 'Area (SqFt)', type: 'number', aliases: ['area_sqft', 'sqft', 'sq ft', 'size', 'size sqft', 'bua', 'built up area', 'area', 'area_sq_ft'] },
      { key: 'area_sqm', label: 'Area (SqM)', type: 'number', aliases: ['area_sqm', 'sqm', 'sq m', 'size sqm', 'area_sq_m'] },
      { key: 'price', label: 'Sale Price (AED)', type: 'price', aliases: ['price', 'sale price', 'asking price', 'selling price', 'price aed', 'amount', 'value', 'total price', 'aed'] },
      { key: 'rent_annual', label: 'Annual Rent (AED)', type: 'price', aliases: ['rent_annual', 'rent', 'annual rent', 'yearly rent', 'rental', 'lease price'] },
      { key: 'furnishing', label: 'Furnishing', type: 'text', aliases: ['furnishing', 'furnished', 'furniture'] },
      { key: 'rera_permit_no', label: 'RERA / Trakheesi Permit', type: 'text', aliases: ['rera_permit_no', 'rera', 'permit', 'trakheesi', 'permit no', 'permit number'] },
      { key: 'title_deed_no', label: 'Title Deed / Oqood', type: 'text', aliases: ['title_deed_no', 'title deed', 'deed', 'deed no', 'oqood', 'oqood no'] },
      { key: 'ejari_no', label: 'Ejari No', type: 'text', aliases: ['ejari_no', 'ejari', 'ejari number', 'contract no'] },
      { key: 'address', label: 'Address', type: 'text', aliases: ['address', 'full address', 'street'] },
      { key: 'description', label: 'Description', type: 'text', aliases: ['description', 'details', 'summary', 'overview', 'remarks'] },
      { key: 'notes', label: 'Internal Notes', type: 'text', aliases: ['notes', 'note', 'comments', 'comment', 'owner notes', 'seller notes'] },
    ],
  },
  leads: {
    label: 'CRM Leads',
    description: 'Buyer, tenant, seller & landlord enquiries (leads table)',
    fields: [
      { key: 'company', label: 'Client / Lead Name', required: true, type: 'text', aliases: ['company', 'lead name', 'client', 'client name', 'full name', 'name', 'customer', 'buyer', 'buyer name', 'tenant', 'lead'] },
      { key: 'contact_name', label: 'Contact Person', type: 'text', aliases: ['contact_name', 'contact', 'contact person', 'first name', 'person'] },
      { key: 'phone', label: 'Phone / Mobile', type: 'phone', aliases: ['phone', 'mobile', 'tel', 'telephone', 'whatsapp', 'cell', 'contact no', 'mobile no', 'phone number', 'direct mobile'] },
      { key: 'email', label: 'Email', type: 'email', aliases: ['email', 'email address', 'e-mail', 'mail'] },
      { key: 'department_division', label: 'Division', type: 'text', aliases: ['department_division', 'division', 'department', 'service', 'type'] },
      { key: 'status', label: 'Status', type: 'text', aliases: ['status', 'stage', 'lead status'] },
      { key: 'source', label: 'Lead Source', type: 'text', aliases: ['source', 'lead source', 'channel', 'portal', 'campaign', 'origin platform'] },
      { key: 'interest', label: 'Property Interest', type: 'text', aliases: ['interest', 'requirement', 'looking for', 'property interest', 'project', 'property', 'unit'] },
      { key: 'destination', label: 'Preferred Community / Area', type: 'text', aliases: ['destination', 'area', 'community', 'location', 'preferred area', 'preferred location'] },
      { key: 'est_value', label: 'Budget / Est. Value (AED)', type: 'price', aliases: ['est_value', 'budget', 'price', 'value', 'max budget', 'budget aed', 'amount'] },
      { key: 'bedrooms_wanted', label: 'Bedrooms Wanted', type: 'bedrooms', aliases: ['bedrooms_wanted', 'bedrooms', 'beds', 'br', 'bhk', 'rooms'] },
      { key: 'buyer_finance_type', label: 'Cash / Mortgage', type: 'text', aliases: ['buyer_finance_type', 'finance', 'payment mode', 'cash/mortgage', 'mortgage'] },
      { key: 'notes', label: 'Notes', type: 'text', aliases: ['notes', 'note', 'remarks', 'comments', 'message', 'enquiry'] },
    ],
  },
  parties: {
    label: 'Clients, Owners & Parties',
    description: 'Master directory of buyers, landlords, tenants & vendors (parties table)',
    fields: [
      { key: 'name', label: 'Full Name / Company', required: true, type: 'text', aliases: ['name', 'full name', 'owner', 'owner name', 'client', 'client name', 'party', 'customer', 'company', 'landlord', 'tenant'] },
      { key: 'contact_person', label: 'Contact Person', type: 'text', aliases: ['contact_person', 'contact', 'representative'] },
      { key: 'phone', label: 'Phone / Mobile', type: 'phone', aliases: ['phone', 'mobile', 'tel', 'whatsapp', 'direct mobile', 'phone number'] },
      { key: 'email', label: 'Email', type: 'email', aliases: ['email', 'email address', 'e-mail'] },
      { key: 'address1', label: 'Address', type: 'text', aliases: ['address1', 'address', 'street', 'unit', 'building'] },
      { key: 'city', label: 'City', type: 'text', aliases: ['city', 'emirate'] },
      { key: 'trn', label: 'VAT TRN', type: 'text', aliases: ['trn', 'vat', 'tax id'] },
      { key: 'trade_license', label: 'Trade License / ID', type: 'text', aliases: ['trade_license', 'license', 'emirates id', 'passport', 'id number'] },
      { key: 'source', label: 'Source', type: 'text', aliases: ['source', 'channel'] },
      { key: 'notes', label: 'Notes', type: 'text', aliases: ['notes', 'remarks', 'nationality', 'details'] },
    ],
  },
  crm_vault: {
    label: 'Master CRM Owner Vault (Encrypted)',
    description: 'AES-256-GCM encrypted owner property records (Owner / Admin / Haseeb only)',
    fields: [
      { key: 'external_deal_id', label: 'Deal / Ref ID', type: 'text', aliases: ['external_deal_id', 'deal id', 'ref', 'reference', 'id', 'code', 'serial'] },
      { key: 'deal_division', label: 'Division', type: 'text', aliases: ['deal_division', 'division', 'purpose', 'type'] },
      { key: 'dubai_area_community', label: 'Dubai Community', type: 'text', aliases: ['dubai_area_community', 'community', 'area', 'location', 'district'] },
      { key: 'master_project', label: 'Master Project', type: 'text', aliases: ['master_project', 'master project', 'sub community'] },
      { key: 'building_or_project', label: 'Building / Tower', required: true, type: 'text', aliases: ['building_or_project', 'building', 'tower', 'project', 'project name', 'development'] },
      { key: 'exact_unit_door_no', label: 'Unit / Door No', type: 'text', aliases: ['exact_unit_door_no', 'unit', 'unit no', 'unit number', 'door', 'apt', 'villa no'] },
      { key: 'floor_or_zone', label: 'Floor / Zone', type: 'text', aliases: ['floor_or_zone', 'floor', 'zone', 'level'] },
      { key: 'property_layout_type', label: 'Layout / Bedrooms', type: 'text', aliases: ['property_layout_type', 'layout', 'bedrooms', 'beds', 'br', 'bhk', 'unit type', 'rooms'] },
      { key: 'size_sqft', label: 'Size (SqFt)', type: 'number', aliases: ['size_sqft', 'sqft', 'size', 'area sqft', 'bua'] },
      { key: 'area_sqm', label: 'Size (SqM)', type: 'number', aliases: ['area_sqm', 'sqm', 'area sqm'] },
      { key: 'target_deal_value_aed', label: 'Target Value (AED)', type: 'price', aliases: ['target_deal_value_aed', 'price', 'value', 'asking price', 'deal value', 'amount', 'aed'] },
      { key: 'owner_name', label: 'Owner Name', type: 'text', aliases: ['owner_name', 'owner', 'landlord', 'seller', 'name', 'full name', 'client'] },
      { key: 'owner_nationality', label: 'Nationality', type: 'text', aliases: ['owner_nationality', 'nationality', 'country'] },
      { key: 'direct_mobile', label: 'Owner Mobile (Encrypted)', type: 'phone', aliases: ['direct_mobile', 'mobile', 'phone', 'owner phone', 'whatsapp', 'tel', 'cell', 'contact'] },
      { key: 'secondary_phone', label: 'Secondary Phone', type: 'phone', aliases: ['secondary_phone', 'phone 2', 'alt phone', 'mobile 2'] },
      { key: 'email_address', label: 'Owner Email (Encrypted)', type: 'email', aliases: ['email_address', 'email', 'owner email', 'e-mail'] },
      { key: 'event_or_expiry_date', label: 'Expiry / Handover Date', type: 'date', aliases: ['event_or_expiry_date', 'expiry', 'expiry date', 'handover', 'contract end'] },
      { key: 'closing_strategy_playbook', label: 'Notes / Playbook', type: 'text', aliases: ['closing_strategy_playbook', 'notes', 'playbook', 'remarks', 'strategy'] },
    ],
  },
  jobs: {
    label: 'Deals & Transactions',
    description: 'Sales, leasing & off-plan deal files (jobs table)',
    fields: [
      { key: 'deal_name', label: 'Deal Name', required: true, type: 'text', aliases: ['deal_name', 'deal', 'title', 'name', 'property', 'unit'] },
      { key: 'deal_type', label: 'Deal Type', required: true, type: 'text', aliases: ['deal_type', 'type', 'category', 'transaction type'] },
      { key: 'department_division', label: 'Division', type: 'text', aliases: ['department_division', 'division', 'department'] },
      { key: 'deal_date', label: 'Deal Date', required: true, type: 'date', aliases: ['deal_date', 'date', 'closing date', 'created'] },
      { key: 'deal_value', label: 'Deal Value (AED)', type: 'price', aliases: ['deal_value', 'value', 'price', 'amount', 'sale price'] },
      { key: 'commission_pct', label: 'Commission %', type: 'number', aliases: ['commission_pct', 'commission %', 'comm pct'] },
      { key: 'commission_amount', label: 'Commission (AED)', type: 'price', aliases: ['commission_amount', 'commission', 'fee', 'brokerage fee'] },
      { key: 'buyer_finance_type', label: 'Finance Type', type: 'text', aliases: ['buyer_finance_type', 'finance', 'cash/mortgage'] },
      { key: 'notes', label: 'Notes', type: 'text', aliases: ['notes', 'remarks', 'details'] },
    ],
  },
}

const MAX_ANALYZE_ROWS = 5000
const MAX_COMMIT_ROWS = 2000

function safeCount(table: string, where = 'deleted_at IS NULL'): number {
  if (!tableExists(table)) return 0
  try {
    return Number(q.val<number>(`SELECT COUNT(*) FROM "${table}" WHERE ${where}`) ?? 0)
  } catch {
    try {
      return Number(q.val<number>(`SELECT COUNT(*) FROM "${table}"`) ?? 0)
    } catch {
      return 0
    }
  }
}

function normHeaderKey(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, ' ')
    .trim()
}

function parsePriceAed(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw * 100) / 100
  const s = String(raw).trim().toLowerCase().replace(/aed|dhs|dh|usd|\$|,/g, '').trim()
  if (!s) return null
  const mMatch = /^([+-]?\d+(?:\.\d+)?)\s*m(?:il|illion)?$/.exec(s)
  if (mMatch) return Math.round(Number(mMatch[1]) * 1_000_000)
  const kMatch = /^([+-]?\d+(?:\.\d+)?)\s*k$/.exec(s)
  if (kMatch) return Math.round(Number(kMatch[1]) * 1_000)
  const n = Number(s.replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

function parseNumberVal(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  const cleaned = String(raw).replace(/,/g, '').match(/[+-]?\d+(?:\.\d+)?/)
  if (!cleaned) return null
  const n = Number(cleaned[0])
  return Number.isFinite(n) ? n : null
}

function parseBedrooms(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const s = String(raw).trim().toLowerCase()
  if (/\bstudio\b/.test(s)) return 0
  const m = /(\d+)/.exec(s)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n >= 0 && n <= 20 ? n : null
}

function normalizeUaePhone(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  let digits = s.replace(/[^\d+]/g, '')
  if (digits.startsWith('00')) digits = '+' + digits.slice(2)
  if (/^05\d{8}$/.test(digits)) return '+971' + digits.slice(1)
  if (/^5\d{8}$/.test(digits)) return '+971' + digits
  if (/^971\d{8,9}$/.test(digits)) return '+' + digits
  if (/^0[234679]\d{7}$/.test(digits)) return '+971' + digits.slice(1)
  return digits.startsWith('+') ? digits : s
}

function normalizePropertyType(raw: unknown): string {
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return 'Apartment'
  if (/villa|mansion/.test(s)) return 'Villa'
  if (/town\s*house|\bth\b/.test(s)) return 'Townhouse'
  if (/penthouse|\bph\b/.test(s)) return 'Penthouse'
  if (/duplex/.test(s)) return 'Duplex'
  if (/office/.test(s)) return 'Office'
  if (/retail|shop|showroom/.test(s)) return 'Retail'
  if (/warehouse|industrial/.test(s)) return 'Warehouse'
  if (/land|plot/.test(s)) return 'Land'
  if (/building|tower/.test(s)) return 'Building'
  if (/hotel/.test(s)) return 'Hotel Apartment'
  if (/studio|apt|apartment|flat|resid|br|bhk|bed/.test(s)) return 'Apartment'
  return String(raw).trim().slice(0, 40)
}

function normalizeDateIso(raw: unknown): string {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10)
  }
  const s = String(raw ?? '').trim()
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s)
  if (dmy) {
    const [, d, m, y] = dmy
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  const parsed = Date.parse(s)
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10)
  return ''
}

function coerceFieldValue(spec: TargetFieldSpec, raw: unknown): any {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'string' && !raw.trim()) return null
  switch (spec.type) {
    case 'price': return parsePriceAed(raw)
    case 'number': return parseNumberVal(raw)
    case 'int': {
      const n = parseNumberVal(raw)
      return n === null ? null : Math.trunc(n)
    }
    case 'bedrooms': return parseBedrooms(raw)
    case 'phone': return normalizeUaePhone(raw) || null
    case 'email': {
      const e = String(raw).trim().toLowerCase()
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null
    }
    case 'property_type': return normalizePropertyType(raw)
    case 'date': return normalizeDateIso(raw) || null
    case 'bool': return /^(1|true|yes|y)$/i.test(String(raw).trim())
    default: return String(raw).trim()
  }
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find(l => l.trim().length > 0) || ''
  const counts = [
    { d: '\t', n: (firstLine.match(/\t/g) || []).length },
    { d: ',', n: (firstLine.match(/,/g) || []).length },
    { d: ';', n: (firstLine.match(/;/g) || []).length },
    { d: '|', n: (firstLine.match(/\|/g) || []).length },
  ].sort((a, b) => b.n - a.n)
  return counts[0]!.n > 0 ? counts[0]!.d : ','
}

function parseTabularText(text: string): { headers: string[]; rows: Record<string, any>[] } {
  const trimmed = text.trim()
  if (!trimmed) return { headers: [], rows: [] }

  // JSON array support
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.rows) ? parsed.rows : [parsed]
      if (arr.length && typeof arr[0] === 'object' && arr[0] !== null) {
        const headers: string[] = [...new Set<string>(arr.flatMap((o: any) => Object.keys(o || {})))]
        return { headers, rows: arr.slice(0, MAX_ANALYZE_ROWS) }
      }
    } catch { /* fall through to CSV/text */ }
  }

  const delim = detectDelimiter(trimmed)
  let matrix: string[][] = []
  if (delim === ',') {
    matrix = parseCsv(trimmed)
  } else {
    matrix = trimmed
      .split(/\r?\n/)
      .filter(l => l.trim().length > 0)
      .map(line => line.split(delim).map(c => c.trim().replace(/^"|"$/g, '')))
  }

  if (matrix.length >= 2 && matrix[0]!.length >= 2) {
    const rawHeaders = matrix[0]!.map((h, idx) => String(h || '').trim() || `Column_${idx + 1}`)
    const rows: Record<string, any>[] = []
    for (let i = 1; i < Math.min(matrix.length, MAX_ANALYZE_ROWS + 1); i++) {
      const r = matrix[i]!
      if (r.every(c => !String(c ?? '').trim())) continue
      const obj: Record<string, any> = {}
      rawHeaders.forEach((h, idx) => { obj[h] = r[idx] ?? '' })
      rows.push(obj)
    }
    return { headers: rawHeaders, rows }
  }

  // Unstructured lines fallback: treat each non-empty line as a raw record with smart regex extraction
  const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, MAX_ANALYZE_ROWS)
  const rows = lines.map((line, i) => {
    const phoneMatch = line.match(/(?:\+?971|00971|05)\s*[\d\s-]{7,12}/)
    const emailMatch = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
    const priceMatch = line.match(/(?:aed|dhs?)?\s*(\d[\d,.]*(?:\.\d+)?\s*[mk]?)/i)
    return {
      raw_line: line,
      line_no: i + 1,
      extracted_phone: phoneMatch ? phoneMatch[0].trim() : '',
      extracted_email: emailMatch ? emailMatch[0].trim() : '',
      extracted_amount: priceMatch ? priceMatch[1]!.trim() : '',
    }
  })
  return { headers: ['raw_line', 'extracted_phone', 'extracted_email', 'extracted_amount'], rows }
}

function buildDeterministicMapping(headers: string[], target: ImportTarget): Record<string, string> {
  const spec = TARGET_SPECS[target]
  const mapping: Record<string, string> = {}
  const usedTargets = new Set<string>()

  for (const h of headers) {
    const nh = normHeaderKey(h)
    if (!nh) continue
    let bestField: string | null = null
    let bestScore = 0
    for (const f of spec.fields) {
      if (usedTargets.has(f.key)) continue
      for (const alias of f.aliases) {
        const na = normHeaderKey(alias)
        if (nh === na) {
          bestField = f.key; bestScore = 100; break
        }
        if (nh.includes(na) || na.includes(nh)) {
          const score = Math.min(nh.length, na.length) / Math.max(nh.length, na.length) * 80
          if (score > bestScore && score >= 40) {
            bestField = f.key; bestScore = score
          }
        }
      }
      if (bestScore === 100) break
    }
    if (bestField) {
      mapping[h] = bestField
      usedTargets.add(bestField)
    }
  }
  return mapping
}

async function refineMappingWithAi(
  headers: string[],
  sampleRows: Record<string, any>[],
  target: ImportTarget,
  instructions: string,
  baseMapping: Record<string, string>,
  user: any,
): Promise<{ mapping: Record<string, string>; defaults: Record<string, any>; summary: string; aiUsed: boolean; modelUsed: string }> {
  const spec = TARGET_SPECS[target]
  const allowedKeys = new Set(spec.fields.map(f => f.key))
  let aiUsed = false
  let modelUsed = 'SWK Deterministic Schema Engine'
  let summary = `Mapped ${Object.keys(baseMapping).length} of ${headers.length} source columns into SWK OS ${spec.label} format.`
  let mapping = { ...baseMapping }
  const defaults: Record<string, any> = {}

  if (!omniConfigured()) {
    return { mapping, defaults, summary, aiUsed, modelUsed }
  }

  try {
    const schemaLines = spec.fields.map(f => `- ${f.key} (${f.label}${f.required ? ', REQUIRED' : ''}, ${f.type})`).join('\n')
    const prompt = [
      `You are SWK Properties OS Confidential AI Format Converter.`,
      `Convert an external spreadsheet/document into SWK OS target "${target}" (${spec.label}).`,
      `Target SWK OS schema fields:\n${schemaLines}`,
      `Source columns: ${JSON.stringify(headers)}`,
      `First 5 sample rows:\n${JSON.stringify(sampleRows.slice(0, 5), null, 2)}`,
      `Deterministic baseline mapping: ${JSON.stringify(baseMapping)}`,
      instructions ? `Executive instructions from user: ${instructions}` : 'No custom overrides provided; map accurately.',
      `Return ONLY valid JSON with shape: {"mapping": {"<source_header>": "<target_field_key_or_null>"}, "defaults": {"<target_field_key>": "<constant_value>"}, "summary": "<1-2 sentence explanation>"}`,
    ].join('\n\n')

    const res = await omniChat({
      messages: [
        { role: 'system', content: 'Return strict JSON only. No markdown fences. Never invent phone numbers or records.' },
        { role: 'user', content: prompt },
      ],
      lane: 'reasoning',
      confidential: true,
      maxTokens: 1200,
      temperature: 0.1,
      user,
    })

    const raw = res.content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      if (parsed.mapping && typeof parsed.mapping === 'object') {
        const nextMap: Record<string, string> = {}
        for (const [src, dst] of Object.entries(parsed.mapping)) {
          if (headers.includes(src) && typeof dst === 'string' && allowedKeys.has(dst)) {
            nextMap[src] = dst
          }
        }
        if (Object.keys(nextMap).length > 0) mapping = nextMap
      }
      if (parsed.defaults && typeof parsed.defaults === 'object') {
        for (const [k, v] of Object.entries(parsed.defaults)) {
          if (allowedKeys.has(k) && v !== null && v !== undefined && String(v).trim() !== '') {
            defaults[k] = v
          }
        }
      }
      if (typeof parsed.summary === 'string' && parsed.summary.trim()) {
        summary = parsed.summary.trim().slice(0, 400)
      }
      aiUsed = true
      modelUsed = `${res.provider}/${res.model}`
    }
  } catch {
    // Graceful fallback to deterministic engine if zero-retention AI route is not configured or returns non-JSON
  }

  return { mapping, defaults, summary, aiUsed, modelUsed }
}

function normalizeRowsForTarget(
  rawRows: Record<string, any>[],
  mapping: Record<string, string>,
  defaults: Record<string, any>,
  target: ImportTarget,
): { normalized: Record<string, any>[]; warnings: string[] } {
  const spec = TARGET_SPECS[target]
  const fieldByKey = new Map(spec.fields.map(f => [f.key, f]))
  const warnings: string[] = []
  const normalized: Record<string, any>[] = []

  rawRows.forEach((raw, idx) => {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(defaults)) {
      const f = fieldByKey.get(k)
      if (f) out[k] = coerceFieldValue(f, v)
    }
    for (const [srcHeader, dstKey] of Object.entries(mapping)) {
      const f = fieldByKey.get(dstKey)
      if (!f) continue
      const val = coerceFieldValue(f, raw[srcHeader])
      if (val !== null && val !== undefined && val !== '') {
        out[dstKey] = val
      }
    }

    // Target-specific intelligent defaults so SWK OS imports succeed cleanly
    if (target === 'properties') {
      if (!out.property_type) out.property_type = 'Apartment'
      if (!out.status) out.status = 'Available'
      if (!out.title) {
        const parts = [
          out.bedrooms === 0 ? 'Studio' : out.bedrooms ? `${out.bedrooms}BR` : '',
          out.property_type || 'Property',
          out.building_name || out.sub_community || out.community_ref || '',
          out.floor_no ? `Unit ${out.floor_no}` : '',
        ].filter(Boolean)
        out.title = parts.join(' · ') || String(raw.raw_line || `Imported Property #${idx + 1}`).slice(0, 140)
      }
      if (!out.listed_date) out.listed_date = todayStr()
    } else if (target === 'leads') {
      if (!out.status) out.status = 'New'
      if (!out.source) out.source = 'AI Bulk Import'
      if (!out.company) {
        out.company = out.contact_name || out.phone || out.email || String(raw.raw_line || `Imported Lead #${idx + 1}`).slice(0, 120)
      }
      if (!out.contact_name && out.company) out.contact_name = out.company
    } else if (target === 'parties') {
      if (!out.status) out.status = 'Active'
      if (!out.name) {
        out.name = out.contact_person || out.phone || out.email || String(raw.raw_line || `Imported Contact #${idx + 1}`).slice(0, 120)
      }
    } else if (target === 'crm_vault') {
      if (!out.external_deal_id) out.external_deal_id = `AI-${todayStr().replace(/-/g, '')}-${String(idx + 1).padStart(4, '0')}`
      if (!out.building_or_project) out.building_or_project = out.master_project || out.dubai_area_community || `Property #${idx + 1}`
    } else if (target === 'jobs') {
      if (!out.deal_name) out.deal_name = String(raw.raw_line || `Imported Deal #${idx + 1}`).slice(0, 140)
      if (!out.deal_type) out.deal_type = 'Secondary Sale'
      if (!out.deal_date) out.deal_date = todayStr()
    }

    normalized.push(out)
  })

  if (normalized.length === 0) warnings.push('No data rows detected in the uploaded file or pasted content.')
  return { normalized, warnings }
}

export default async function shabibsCornerRoutes(app: FastifyInstance) {
  // =========================================================================
  // 1. SHABIB'S CORNER — EXCLUSIVE OWNER EXECUTIVE COMMAND OVERVIEW
  // =========================================================================
  app.get('/api/shabibs-corner/overview', async (req) => {
    if (!canAccessShabibsCorner(req.user)) {
      throw forbidden("Shabib's Corner is exclusively restricted to Owner Shabib Siraj.")
    }

    const propertiesCount = safeCount('properties')
    const unitsCount = safeCount('units')
    const vaultCount = safeCount('crm_vault_properties', '1=1')
    const mandatesCount = safeCount('mandates')
    const leadsCount = safeCount('leads')
    const partiesCount = safeCount('parties')
    const opportunitiesCount = safeCount('opportunities')
    const viewingsCount = safeCount('viewings')
    const offersCount = safeCount('offers')
    const jobsCount = safeCount('jobs')
    const invoicesCount = safeCount('invoices')
    const leasesCount = safeCount('leases')
    const inspectionsCount = safeCount('inspections')
    const employeesCount = safeCount('employees')
    const attendanceCount = safeCount('attendance')
    const templatesCount = safeCount('doc_templates')

    const pendingSeal = safeCount('seal_approval_requests', "status = 'Pending'")
    const pendingDeleteBin = safeCount('pending_deletions', "status = 'Pending'")
    const pendingWithdrawals = safeCount('withdrawal_requests', "status = 'Pending'")
    const pendingApprovals = safeCount('approval_requests', "status = 'Pending'")
    const pendingDevices = safeCount('mobile_devices', "status = 'Pending'")

    const recentOverrides = q.all<any>(
      `SELECT id, at, user_name, entity, record_id, record_label, changes
       FROM audit_log
       WHERE action = 'emergency_override'
       ORDER BY id DESC LIMIT 20`,
    ).map(r => ({
      id: r.id,
      at: r.at,
      user_name: r.user_name,
      entity: r.entity,
      record_id: r.record_id,
      record_label: r.record_label,
      details: safeJson(r.changes, {}),
    }))

    const stages = [
      {
        step: 1,
        key: 'inventory',
        title: 'Inventory Intake & RERA Listing Verification',
        subtitle: 'Source owner stock, verify Title Deed / Trakheesi permit & publish with watermarked 3D brochure',
        entity: 'properties',
        counts: [
          { label: 'Active Properties', value: propertiesCount },
          { label: 'Units', value: unitsCount },
          { label: 'Master Vault', value: vaultCount },
          { label: 'Form A Mandates', value: mandatesCount },
        ],
        how_to_fill: [
          'Title* (e.g. "2BR Marina Gate Tower 1 · Full Sea View") and Property Type* (Apartment / Villa / Townhouse / Penthouse).',
          'Set Division (Secondary / Off-Plan / Leasing), Community, Building, Bedrooms, SqFt, and Asking Price (AED).',
          'Attach Title Deed / Oqood No, RERA Trakheesi Permit No & owner mandate so brochure sharing watermarks every photo automatically.',
          'Have thousands of unformatted units? Use the Confidential AI Format Converter tab to transform any Excel/CSV/PDF into SWK OS format in seconds.',
        ],
        links: [
          { label: 'Add Property', to: '/e/properties?new=1' },
          { label: 'Listings Studio', to: '/listings' },
          { label: 'CRM Owner Vault', to: '/crm-vault' },
          { label: 'Form A Mandates', to: '/e/mandates' },
        ],
      },
      {
        step: 2,
        key: 'leads',
        title: 'Lead Capture, Buyer Qualification & SLA Routing',
        subtitle: 'Capture portal, WhatsApp & referral buyers, qualify Cash vs Mortgage & assign within 15-min SLA',
        entity: 'leads',
        counts: [
          { label: 'Total Leads', value: leadsCount },
          { label: 'Opportunities', value: opportunitiesCount },
          { label: 'Clients & Owners', value: partiesCount },
        ],
        how_to_fill: [
          'Client / Lead Name* (company/full name), Contact Name, UAE Mobile (+971…), and Email.',
          'Capture Preferred Community, Budget (AED), Bedrooms Wanted, and Cash vs Mortgage qualification.',
          'Enable Marketing Consent (UAE PDPL compliance) and assign Owner / Sales Advisor to start SLA tracking.',
        ],
        links: [
          { label: 'New Lead', to: '/e/leads?new=1' },
          { label: 'Sales Pipeline', to: '/pipeline' },
          { label: 'Clients Directory', to: '/e/parties' },
        ],
      },
      {
        step: 3,
        key: 'viewings',
        title: 'Property Matching, Viewings & Client Brochure Share',
        subtitle: 'Schedule site visits with GPS verification & send branded SWK watermarked 3D brochures',
        entity: 'viewings',
        counts: [
          { label: 'Scheduled Viewings', value: viewingsCount },
          { label: 'Active Inventory', value: propertiesCount },
        ],
        how_to_fill: [
          'Link Mandate*, Property*, Lead*, Assigned Agent*, and Scheduled Date/Time* (or use Emergency Override for urgent walk-in viewings).',
          'Share property brochure directly from Listings Studio — SWK logo watermark, 3D visual walkthrough & narration are added automatically.',
          'Log client interest level, feedback, and next follow-up date immediately after viewing.',
        ],
        links: [
          { label: 'Book Viewing', to: '/e/viewings?new=1' },
          { label: 'Share Brochure', to: '/listings' },
          { label: 'Field GPS Live', to: '/field-live' },
        ],
      },
      {
        step: 4,
        key: 'offers',
        title: 'Offer Negotiation & RERA Form F (MOU)',
        subtitle: 'Record formal offers, security deposit cheques (10%) & lock RERA Form F bilateral terms',
        entity: 'offers',
        counts: [
          { label: 'Formal Offers', value: offersCount },
        ],
        how_to_fill: [
          'Select Property*, Buyer*, Offer Type* (Purchase / Lease), Offer Price (AED)*, and Offer Date*.',
          'Document 10% deposit cheque terms, Buyer Finance Type (Cash / Mortgage Pre-Approved), and special conditions.',
          'Draft official Form F / MOU letter in Letter Studio (restricted to your 5-person authorized leadership circle).',
        ],
        links: [
          { label: 'Record Offer', to: '/e/offers?new=1' },
          { label: 'RERA Centre', to: '/rera' },
          { label: 'Letter Studio (158+)', to: '/studio' },
        ],
      },
      {
        step: 5,
        key: 'conveyancing',
        title: 'Conveyancing, Developer NOC, AML KYC & DLD Transfer',
        subtitle: 'Track deal file from signed MOU through AML screening, Developer NOC, Trustee appointment & Title Deed',
        entity: 'jobs',
        counts: [
          { label: 'Active Deal Files', value: jobsCount },
        ],
        how_to_fill: [
          'Enter Deal Name*, Deal Type* (Secondary Sale / Off-Plan / Lease), Branch*, Deal Date*, and Deal Value (AED).',
          'Verify 50/50 agency/advisor split, A2A external agency split (if co-broke), and UAE Ministry of Economy AML/UBO checks.',
          'Upload Emirates ID, Passport, signed Form F, NOC receipt, and final DLD Title Deed into the Deal File.',
        ],
        links: [
          { label: 'Open Deal File', to: '/e/jobs?new=1' },
          { label: 'AML & Compliance', to: '/compliance' },
          { label: 'Deal Withdrawals', to: '/withdrawals' },
        ],
      },
      {
        step: 6,
        key: 'finance',
        title: 'Commission Invoicing, VAT & Agency Settlement',
        subtitle: 'Issue 5% UAE VAT commission tax invoices, track trustee cheques & settle advisor splits',
        entity: 'invoices',
        counts: [
          { label: 'Invoices Issued', value: invoicesCount },
        ],
        how_to_fill: [
          'Select Deal / Client, set 2% standard sales commission or 5% leasing fee + 5% UAE VAT (TRN automatically applied).',
          'Record Manager Cheque / Bank Transfer receipt and reconcile against corporate bank statement.',
        ],
        links: [
          { label: 'New Tax Invoice', to: '/finance/new-invoice' },
          { label: 'Invoices Ledger', to: '/e/invoices' },
          { label: 'Financial Statements', to: '/finance/statements' },
        ],
      },
      {
        step: 7,
        key: 'delivery',
        title: 'Key Handover, Ejari Registration & PDC Vault',
        subtitle: 'Execute snagging inspection, register Ejari, custody post-dated cheques & deliver keys to client',
        entity: 'leases',
        counts: [
          { label: 'Active Leases / Ejari', value: leasesCount },
          { label: 'Handover Inspections', value: inspectionsCount },
        ],
        how_to_fill: [
          'Link Unit*, Landlord*, Tenant*, Lease Type*, Start/End Dates*, Annual Rent (AED)*, and Cheque Count.',
          'Record Ejari certificate number, deposit escrow, PDC cheque schedule, and move-in snagging photos.',
        ],
        links: [
          { label: 'New Lease / Ejari', to: '/e/leases?new=1' },
          { label: 'PDC Cheque Vault', to: '/pdc' },
          { label: 'Snagging & Inspections', to: '/inspect' },
        ],
      },
      {
        step: 8,
        key: 'governance',
        title: 'Executive Governance, Seal Approvals & Staff Oversight',
        subtitle: 'Final Owner authority over Company Seal, Delete Bin, Office QR Attendance & Live Field Map',
        entity: 'parties',
        counts: [
          { label: 'Staff Roster', value: employeesCount },
          { label: 'Attendance Logs', value: attendanceCount },
          { label: 'Protected Templates', value: templatesCount },
        ],
        how_to_fill: [
          'Only Owner can apply Company Seal & Signature directly; Admin, Haseeb, Meenakshi & Rahaba must submit a Seal Approval request.',
          'Only Owner & Admin can activate Emergency Mandatory-Field Override on any SWK OS form with a logged reason.',
          'Monitor Office Wi-Fi QR Check-In display, Live Field Duty GPS map, and pending Delete Bin items in real time.',
        ],
        links: [
          { label: 'Seal & Approvals', to: '/approvals' },
          { label: 'Delete Recycle Bin', to: '/recycle-bin' },
          { label: 'Reception QR Display', to: '/reception-display' },
          { label: 'Live Field GPS', to: '/field-live' },
        ],
      },
    ]

    return {
      owner: { name: req.user!.name, email: req.user!.email },
      generated_at: nowIso(),
      stages,
      pending_approvals: {
        seal_requests: pendingSeal,
        delete_bin: pendingDeleteBin,
        withdrawals: pendingWithdrawals,
        general_approvals: pendingApprovals,
        mobile_devices: pendingDevices,
        total: pendingSeal + pendingDeleteBin + pendingWithdrawals + pendingApprovals + pendingDevices,
      },
      recent_overrides: recentOverrides,
      capabilities: {
        emergency_override: canUseEmergencyOverride(req.user),
        confidential_ai_importer: canUseConfidentialAiImporter(req.user),
        ai_configured: omniConfigured(),
      },
    }
  })

  // =========================================================================
  // 2. CONFIDENTIAL AI BRAIN UNIVERSAL FORMAT CONVERTER & BULK IMPORTER
  //    EXACT 5-PERSON WHITELIST: Owner, Admin, Haseeb, Meenakshi, Rahaba ONLY
  // =========================================================================
  app.get('/api/ai-importer/targets', async (req) => {
    if (!canUseConfidentialAiImporter(req.user)) {
      throw forbidden('Confidential AI Format Converter is restricted exclusively to Owner, Admin, Haseeb, Meenakshi, and Rahaba.')
    }
    const allowVault = canAccessCrmVault(req.user)
    const targets = (Object.entries(TARGET_SPECS) as [ImportTarget, (typeof TARGET_SPECS)[ImportTarget]][])
      .filter(([k]) => k !== 'crm_vault' || allowVault)
      .map(([key, spec]) => ({
        key,
        label: spec.label,
        description: spec.description,
        fields: spec.fields.map(f => ({ key: f.key, label: f.label, required: Boolean(f.required), type: f.type })),
      }))
    return {
      targets,
      ai_configured: omniConfigured(),
      can_emergency_override: canUseEmergencyOverride(req.user),
    }
  })

  app.post('/api/ai-importer/analyze', async (req: FastifyRequest) => {
    if (!canUseConfidentialAiImporter(req.user)) {
      throw forbidden('Confidential AI Format Converter is restricted exclusively to Owner, Admin, Haseeb, Meenakshi, and Rahaba.')
    }

    let targetRaw = 'properties'
    let instructions = ''
    let rawText = ''
    let fileBuf: Buffer | null = null
    let fileName = ''

    if (req.isMultipart()) {
      for await (const part of req.parts()) {
        if (part.type === 'field') {
          const val = String(part.value ?? '')
          if (part.fieldname === 'target_entity') targetRaw = val
          else if (part.fieldname === 'instructions') instructions = val
          else if (part.fieldname === 'raw_text') rawText = val
        } else {
          fileBuf = await part.toBuffer()
          fileName = part.filename || 'upload.csv'
          if (fileBuf.length > 25 * 1024 * 1024) throw bad('Uploaded file exceeds 25 MB limit.')
        }
      }
    } else {
      const schema = z.object({
        target_entity: z.string().default('properties'),
        instructions: z.string().max(4000).optional(),
        raw_text: z.string().max(5_000_000).optional(),
      })
      const b = schema.parse(req.body ?? {})
      targetRaw = b.target_entity
      instructions = b.instructions ?? ''
      rawText = b.raw_text ?? ''
    }

    const target = (targetRaw in TARGET_SPECS ? targetRaw : 'properties') as ImportTarget
    if (target === 'crm_vault' && !canAccessCrmVault(req.user)) {
      throw forbidden('CRM Owner Vault import is restricted to Owner, Admin, and Operations Manager Haseeb.')
    }

    let headers: string[] = []
    let rawRows: Record<string, any>[] = []

    if (fileBuf && fileBuf.length > 0) {
      const ext = path.extname(fileName).toLowerCase()
      if (ext === '.xlsx') {
        const sheets = await readXlsxFile(fileBuf)
        const sheetRows: unknown[][] = (sheets[0]?.data ?? []) as unknown[][]
        if (!sheetRows.length) throw bad('The Excel sheet is empty.')
        // Find first header-like non-empty row
        let headerIdx = 0
        for (let i = 0; i < Math.min(sheetRows.length, 10); i++) {
          const nonEmpty = sheetRows[i]!.filter((c: unknown) => c !== null && c !== undefined && String(c).trim() !== '').length
          if (nonEmpty >= 2) { headerIdx = i; break }
        }
        headers = sheetRows[headerIdx]!.map((c: unknown, idx: number) => String(c ?? '').trim() || `Column_${idx + 1}`)
        for (let i = headerIdx + 1; i < Math.min(sheetRows.length, headerIdx + 1 + MAX_ANALYZE_ROWS); i++) {
          const r = sheetRows[i]!
          if (r.every((c: unknown) => c === null || c === undefined || String(c).trim() === '')) continue
          const obj: Record<string, any> = {}
          headers.forEach((h, idx) => { obj[h] = r[idx] ?? '' })
          rawRows.push(obj)
        }
      } else if (ext === '.docx') {
        const doc = await mammoth.extractRawText({ buffer: fileBuf })
        const parsed = parseTabularText(doc.value || '')
        headers = parsed.headers
        rawRows = parsed.rows
      } else if (ext === '.pdf') {
        const ocr = await extractText(fileBuf, 'application/pdf', fileName)
        const parsed = parseTabularText(ocr.text || '')
        headers = parsed.headers
        rawRows = parsed.rows
      } else {
        const text = fileBuf.toString('utf8')
        const parsed = parseTabularText(text)
        headers = parsed.headers
        rawRows = parsed.rows
      }
    } else if (rawText.trim()) {
      const parsed = parseTabularText(rawText)
      headers = parsed.headers
      rawRows = parsed.rows
    } else {
      throw bad('Upload an Excel/CSV/PDF/DOCX file or paste raw data to convert.')
    }

    const baseMapping = buildDeterministicMapping(headers, target)
    const refined = await refineMappingWithAi(headers, rawRows, target, instructions, baseMapping, req.user)
    const { normalized, warnings } = normalizeRowsForTarget(rawRows, refined.mapping, refined.defaults, target)

    const spec = TARGET_SPECS[target]
    const csvCols = spec.fields.map(f => f.key)
    const normalizedCsv = toCsv(
      csvCols,
      normalized.map(r => csvCols.map(c => (r[c] === null || r[c] === undefined ? '' : String(r[c])))),
    )

    const unmappedHeaders = headers.filter(h => !(h in refined.mapping))
    return {
      target_entity: target,
      target_label: spec.label,
      source_name: fileName || 'Pasted Data',
      detected_headers: headers,
      column_mapping: refined.mapping,
      applied_defaults: refined.defaults,
      unmapped_headers: unmappedHeaders,
      ai_used: refined.aiUsed,
      model_used: refined.modelUsed,
      ai_summary: refined.summary,
      total_rows: normalized.length,
      valid_rows: normalized.length,
      warnings,
      preview_rows: normalized.slice(0, 50),
      normalized_rows: normalized.slice(0, MAX_COMMIT_ROWS),
      normalized_csv: normalizedCsv,
    }
  })

  app.post('/api/ai-importer/commit', async (req) => {
    if (!canUseConfidentialAiImporter(req.user)) {
      throw forbidden('Confidential AI Format Converter is restricted exclusively to Owner, Admin, Haseeb, Meenakshi, and Rahaba.')
    }

    const schema = z.object({
      target_entity: z.enum(['properties', 'leads', 'parties', 'crm_vault', 'jobs']),
      rows: z.array(z.record(z.string(), z.any())).min(1).max(MAX_COMMIT_ROWS),
      emergency_override: z.boolean().optional(),
      emergency_override_reason: z.string().max(500).optional(),
    })
    const b = schema.parse(req.body ?? {})

    if (b.target_entity === 'crm_vault' && !canAccessCrmVault(req.user)) {
      throw forbidden('CRM Owner Vault import is restricted exclusively to Owner, Admin, and Operations Manager Haseeb.')
    }

    let ctx: Ctx = req.ctx
    if (b.emergency_override) {
      if (!canUseEmergencyOverride(req.user)) {
        throw forbidden('Emergency mandatory-field override is hardcoded exclusively to Owner and Admin accounts.')
      }
      const reason = String(b.emergency_override_reason || '').trim()
      if (reason.length < 3) throw bad('Emergency override requires a reason (minimum 3 characters).')
      ctx = { ...req.ctx, auditReason: reason, emergencyOverride: { enabled: true, reason, bypassedFields: [] } }
    }

    if (b.target_entity === 'crm_vault') {
      const vaultInputs: RawVaultPropertyInput[] = b.rows.map((r, i) => ({
        external_deal_id: String(r.external_deal_id || `AI-${Date.now()}-${i + 1}`),
        source_dataset: 'custom_import',
        source_sheet: 'AI_Imported',
        deal_division: r.deal_division ? String(r.deal_division) : 'Secondary Sales',
        dubai_area_community: r.dubai_area_community ? String(r.dubai_area_community) : '',
        master_project: r.master_project ? String(r.master_project) : '',
        building_or_project: String(r.building_or_project || r.dubai_area_community || `Unit #${i + 1}`),
        exact_unit_door_no: r.exact_unit_door_no ? String(r.exact_unit_door_no) : '',
        floor_or_zone: r.floor_or_zone ? String(r.floor_or_zone) : '',
        property_layout_type: r.property_layout_type ? String(r.property_layout_type) : '',
        size_sqft: r.size_sqft !== null && r.size_sqft !== undefined ? Number(r.size_sqft) : null,
        area_sqm: r.area_sqm !== null && r.area_sqm !== undefined ? Number(r.area_sqm) : null,
        target_deal_value_aed: r.target_deal_value_aed !== null && r.target_deal_value_aed !== undefined ? Number(r.target_deal_value_aed) : null,
        owner_name: r.owner_name ? String(r.owner_name) : '',
        owner_nationality: r.owner_nationality ? String(r.owner_nationality) : '',
        direct_mobile: r.direct_mobile ? String(r.direct_mobile) : '',
        secondary_phone: r.secondary_phone ? String(r.secondary_phone) : '',
        email_address: r.email_address ? String(r.email_address) : '',
        event_or_expiry_date: r.event_or_expiry_date ? String(r.event_or_expiry_date) : '',
        closing_strategy_playbook: r.closing_strategy_playbook ? String(r.closing_strategy_playbook) : '',
      }))
      const stats = upsertVaultProperties(vaultInputs)
      q.run(
        `INSERT INTO audit_log (at, user_id, user_name, entity, record_id, record_label, action, changes, ip)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        nowIso(),
        req.user?.id ?? null,
        req.user?.name ?? 'Staff',
        'crm_vault_properties',
        null,
        `Confidential AI Import (${stats.total} vault rows)`,
        'ai_bulk_import',
        JSON.stringify(stats),
        req.ip ?? null,
      )
      return { created: stats.inserted, updated: stats.updated, failed: 0, errors: [], imported_ids: [] }
    }

    const def = getDef(b.target_entity)
    const defaultBranchId = b.target_entity === 'jobs'
      ? (req.user?.branch_id ?? q.val<number>(`SELECT id FROM branches WHERE deleted_at IS NULL ORDER BY id LIMIT 1`) ?? 1)
      : undefined

    let created = 0
    const errors: { row: number; error: string }[] = []
    const importedIds: number[] = []

    tx(() => {
      b.rows.forEach((r, idx) => {
        try {
          const payload = { ...r }
          if (b.target_entity === 'properties') {
            if (typeof payload.community_ref === 'string' && payload.community_ref.trim()) {
              const name = payload.community_ref.trim()
              const cid = q.val<number>(`SELECT id FROM communities WHERE deleted_at IS NULL AND lower(name) LIKE ? LIMIT 1`, `%${name.toLowerCase()}%`)
              if (cid) {
                payload.community_ref = cid
              } else {
                payload.sub_community = payload.sub_community || name
                delete payload.community_ref
              }
            }
            if (typeof payload.developer_ref === 'string' && payload.developer_ref.trim()) {
              const name = payload.developer_ref.trim()
              const did = q.val<number>(`SELECT id FROM developers WHERE deleted_at IS NULL AND lower(name) LIKE ? LIMIT 1`, `%${name.toLowerCase()}%`)
              if (did) {
                payload.developer_ref = did
              } else {
                payload.notes = [payload.notes, `Developer: ${name}`].filter(Boolean).join(' · ')
                delete payload.developer_ref
              }
            }
          }
          if (b.target_entity === 'jobs' && !payload.branch_id && defaultBranchId) {
            payload.branch_id = defaultBranchId
          }
          const rec = createRecord(def, payload, ctx)
          created++
          importedIds.push(Number(rec.id))
        } catch (e: any) {
          errors.push({ row: idx + 1, error: e?.message || String(e) })
        }
      })
    })

    audit(ctx, def, importedIds[0] ?? 0, 'ai_bulk_import', { created, failed: errors.length }, `Confidential AI Bulk Import (${created} ${def.label})`)
    return { created, updated: 0, failed: errors.length, errors: errors.slice(0, 100), imported_ids: importedIds.slice(0, 200) }
  })
}
