import crypto from 'node:crypto'
import { q } from '../db'
import { config } from '../config'
import { getSetting, setSettings } from '../settings'
import { fromCents, todayStr } from '../util'

/**
 * Listing feeds for the UAE portals and the RERA advertising gate.
 *
 * A listing is sent to a portal only when it is active, available, flagged for that portal and carries a Trakheesi permit
 * that has not expired. Anything else is reported as blocked with the reason, so nothing is ever advertised without a permit.
 *
 * Tag names follow the commonly used Property Finder and Bayut/Dubizzle XML feed layouts. Both portals publish their exact
 * specification only to partner accounts: confirm the tags with your account manager before switching the feed on.
 */
export const PORTALS = {
  propertyfinder: { label: 'Property Finder', flag: 'syndicate_pf', leadSource: 'Property Finder' },
  bayut: { label: 'Bayut', flag: 'syndicate_bayut', leadSource: 'Bayut' },
  dubizzle: { label: 'Dubizzle', flag: 'syndicate_dubizzle', leadSource: 'Dubizzle' },
} as const
export type PortalKey = keyof typeof PORTALS
export const isPortal = (p: string): p is PortalKey => Object.prototype.hasOwnProperty.call(PORTALS, p)

const ADVERTISABLE_STATUS = new Set(['Available', 'Off-Plan'])

export interface FeedListing {
  id: number; ref: string; permit: string; permit_expiry: string; purpose: 'Sale' | 'Rent'; title: string; description: string
  property_type: string; bedrooms: number | null; bathrooms: number | null; size_sqft: number | null; price: number
  furnishing: string | null; city: string; community: string; sub_community: string; building: string
  off_plan: boolean; completion_year: number | null; latitude: string; longitude: string; images: string[]; updated_at: string
  agent: { name: string; email: string; phone: string; brn: string }
  quality: number; quality_missing: string[]
}
export interface BlockedListing { id: number; ref: string; title: string; reasons: string[]; quality: number }

function images(media: unknown): string[] {
  // media is stored as JSON (older rows as a JSON string inside JSON); accept both
  let m: any = media
  for (let i = 0; i < 2 && typeof m === 'string'; i++) { try { m = JSON.parse(m) } catch { return [] } }
  if (!Array.isArray(m)) return []
  const base = String(config.baseUrl || '').replace(/\/+$/, '')
  return m
    .map((x: any) => String(typeof x === 'string' ? x : x?.url ?? ''))
    .filter(Boolean)
    .map(u => (/^https?:\/\//i.test(u) ? u : base ? base + (u.startsWith('/') ? u : '/' + u) : ''))
    .filter(u => /^https:\/\//i.test(u))
}

/** Every listing flagged for the portal, split into what may be advertised and what is blocked (with reasons). */
/**
 * Listing quality, 0-100, in the spirit of the portals' own scores (Bayut Listing Quality Score, Property Finder quality score):
 * better-scored listings rank higher on the portals. Each missing item says what to add.
 */
export function listingQuality(r: Record<string, any>): { score: number; missing: string[] } {
  const imgs = images(r.media).length
  const desc = String(r.description ?? '').trim().length
  const checks: [boolean, number, string][] = [
    [imgs >= 10, 25, imgs ? `Add ${10 - imgs} more photos (10+ recommended)` : 'Add photos (10+ recommended)'],
    [desc >= 750, 15, desc ? 'Longer description (750+ characters)' : 'Add a description'],
    [!!String(r.title ?? '').trim() && String(r.title).length >= 30 && String(r.title).length <= 70, 10, 'Title of 30-70 characters'],
    [!!r.area_sqft, 10, 'Built-up area (sq ft)'],
    [r.bedrooms != null || r.property_type === 'Studio', 5, 'Bedrooms'],
    [r.bathrooms != null, 5, 'Bathrooms'],
    [!!(r.community_ref || r.community_name), 10, 'Community'],
    [!!(r.latitude && r.longitude), 5, 'Map location'],
    [!!r.furnishing, 5, 'Furnishing'],
    [!!String(r.amenities ?? r.features ?? '').trim(), 5, 'Amenities / key features'],
    [!!String(r.rera_permit_no ?? '').trim(), 5, 'Trakheesi permit'],
  ]
  let score = 0
  const missing: string[] = []
  for (const [ok, pts, label] of checks) { if (ok) score += pts; else missing.push(label) }
  return { score, missing }
}

export function portalListings(portal: PortalKey): { eligible: FeedListing[]; blocked: BlockedListing[] } {
  const flag = PORTALS[portal].flag
  const today = todayStr()
  const rows = q.all(`
    SELECT p.*, c.name AS community_name, c.emirate AS community_emirate,
           a.name AS agent_name, a.email AS agent_email, a.phone AS agent_phone, a.dld_broker_id AS agent_brn, a.status AS agent_status, a.dld_expiry AS agent_dld_expiry
    FROM properties p
    LEFT JOIN communities c ON c.id = p.community_ref
    LEFT JOIN agents a ON a.id = p.agent_id AND a.deleted_at IS NULL
    WHERE p.deleted_at IS NULL AND p.${flag} = 1 AND COALESCE(p.active, 1) = 1
    ORDER BY p.id`)
  const eligible: FeedListing[] = [], blocked: BlockedListing[] = []
  for (const r of rows) {
    const purpose: 'Sale' | 'Rent' = r.department_division === 'Leasing' ? 'Rent' : 'Sale'
    const price = fromCents(purpose === 'Rent' ? r.rent_annual : r.price)
    const reasons: string[] = []
    if (!ADVERTISABLE_STATUS.has(String(r.status))) reasons.push(`Status is ${r.status || 'not set'}`)
    if (!String(r.rera_permit_no ?? '').trim()) reasons.push('No Trakheesi permit number')
    if (!r.permit_expiry) reasons.push('No permit expiry date')
    else if (String(r.permit_expiry).slice(0, 10) < today) reasons.push(`Permit expired on ${String(r.permit_expiry).slice(0, 10)}`)
    if (!(price > 0)) reasons.push(purpose === 'Rent' ? 'No annual rent' : 'No sale price')
    if (!r.agent_name) reasons.push('No listing agent')
    else if (!String(r.agent_brn ?? '').trim()) reasons.push('Listing agent has no RERA BRN')
    else if (r.agent_dld_expiry && String(r.agent_dld_expiry).slice(0, 10) < today) reasons.push('Listing agent BRN card expired')
    if (!String(r.description ?? '').trim()) reasons.push('No description')
    const ref = String(r.property_no || `PRP-${r.id}`)
    const quality = listingQuality(r)
    if (reasons.length) { blocked.push({ id: r.id, ref, title: r.title, reasons, quality: quality.score }); continue }
    eligible.push({
      id: r.id, ref, permit: String(r.rera_permit_no).trim(), permit_expiry: String(r.permit_expiry).slice(0, 10), purpose,
      title: r.title, description: r.description, property_type: r.property_type || 'Apartment',
      bedrooms: r.bedrooms ?? null, bathrooms: r.bathrooms ?? null, size_sqft: r.area_sqft ?? null, price,
      furnishing: r.furnishing ?? null, city: r.community_emirate || 'Dubai', community: r.community_name || '', sub_community: r.sub_community || '',
      building: r.building_name || '', off_plan: !!r.is_off_plan, completion_year: r.completion_year ?? null,
      latitude: r.latitude || '', longitude: r.longitude || '', images: images(r.media), updated_at: String(r.updated_at || r.created_at || ''),
      agent: { name: r.agent_name, email: r.agent_email || '', phone: r.agent_phone || '', brn: String(r.agent_brn).trim() },
      quality: quality.score, quality_missing: quality.missing,
    })
  }
  return { eligible, blocked }
}

// ------------------------------------------------------------------ XML
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!))
  // characters XML 1.0 does not allow at all
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
const cdata = (v: unknown) => `<![CDATA[${String(v ?? '').replace(/]]>/g, ']]]]><![CDATA[>').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')}]]>`
const tag = (name: string, v: unknown) => (v === null || v === undefined || v === '' ? '' : `<${name}>${esc(v)}</${name}>`)

const PF_TYPE: Record<string, string> = { Apartment: 'AP', Villa: 'VH', Townhouse: 'TH', Studio: 'AP', Penthouse: 'PH', Duplex: 'DX', Loft: 'LP', Bungalow: 'BU', Compound: 'CD', Bulk: 'BU' }
const FURNISHED: Record<string, string> = { Unfurnished: 'No', 'Semi-Furnished': 'Partly', 'Fully Furnished': 'Yes' }

export function propertyFinderXml(list: FeedListing[]): string {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const items = list.map(l => [
    `<property last_update="${esc(l.updated_at.replace('T', ' ').slice(0, 19))}">`,
    tag('reference_number', l.ref), tag('permit_number', l.permit),
    tag('offering_type', l.purpose === 'Rent' ? 'RR' : 'RS'), tag('property_type', PF_TYPE[l.property_type] ?? 'AP'),
    tag('price_on_application', 'No'), tag('price', Math.round(l.price)), l.purpose === 'Rent' ? tag('rental_period', 'Y') : '',
    tag('city', l.city), tag('community', l.community), tag('sub_community', l.sub_community), tag('property_name', l.building),
    `<title_en>${cdata(l.title)}</title_en>`, `<description_en>${cdata(l.description)}</description_en>`,
    tag('size', l.size_sqft), tag('bedroom', l.property_type === 'Studio' ? 'studio' : l.bedrooms), tag('bathroom', l.bathrooms),
    tag('furnished', l.furnishing ? FURNISHED[l.furnishing] : ''), tag('completion_status', l.off_plan ? 'off_plan' : 'completed'),
    l.latitude && l.longitude ? tag('geopoints', `${l.longitude},${l.latitude}`) : '',
    `<agent>${tag('name', l.agent.name)}${tag('email', l.agent.email)}${tag('phone', l.agent.phone)}${tag('license_no', l.agent.brn)}</agent>`,
    l.images.length ? `<photo>${l.images.map(u => `<url last_update="${esc(now)}">${esc(u)}</url>`).join('')}</photo>` : '',
    '</property>',
  ].join('')).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<list last_update="${now}" listing_count="${list.length}">\n${items}\n</list>\n`
}

export function bayutXml(list: FeedListing[], portal: 'bayut' | 'dubizzle'): string {
  const items = list.map(l => [
    '<Listing>',
    `<Portals>${cdata(portal === 'dubizzle' ? 'Dubizzle' : 'Bayut')}</Portals>`,
    `<Property_Ref_No>${cdata(l.ref)}</Property_Ref_No>`, `<Permit_Number>${cdata(l.permit)}</Permit_Number>`,
    `<Property_Status>${cdata('live')}</Property_Status>`, `<Property_purpose>${cdata(l.purpose === 'Rent' ? 'Rent' : 'Buy')}</Property_purpose>`,
    `<Property_Type>${cdata(l.property_type)}</Property_Type>`, `<Property_Size>${cdata(l.size_sqft ?? '')}</Property_Size>`, `<Property_Size_Unit>${cdata('SQFT')}</Property_Size_Unit>`,
    `<Bedrooms>${cdata(l.property_type === 'Studio' ? 0 : l.bedrooms ?? '')}</Bedrooms>`, `<Bathrooms>${cdata(l.bathrooms ?? '')}</Bathrooms>`,
    `<Property_Title>${cdata(l.title)}</Property_Title>`, `<Property_Description>${cdata(l.description)}</Property_Description>`,
    `<Price>${cdata(Math.round(l.price))}</Price>`, l.purpose === 'Rent' ? `<Rent_Frequency>${cdata('Yearly')}</Rent_Frequency>` : '',
    `<Furnished>${cdata(l.furnishing ? FURNISHED[l.furnishing] : '')}</Furnished>`, `<Off_plan>${cdata(l.off_plan ? 'Yes' : 'No')}</Off_plan>`,
    `<City>${cdata(l.city)}</City>`, `<Locality>${cdata(l.community)}</Locality>`, `<Sub_Locality>${cdata(l.sub_community)}</Sub_Locality>`, `<Tower_Name>${cdata(l.building)}</Tower_Name>`,
    `<Listing_Agent>${cdata(l.agent.name)}</Listing_Agent>`, `<Listing_Agent_Phone>${cdata(l.agent.phone)}</Listing_Agent_Phone>`, `<Listing_Agent_Email>${cdata(l.agent.email)}</Listing_Agent_Email>`,
    `<Listing_Agent_BRN>${cdata(l.agent.brn)}</Listing_Agent_BRN>`,
    l.images.length ? `<Images>${l.images.map(u => `<Image>${cdata(u)}</Image>`).join('')}</Images>` : '',
    `<Last_Updated>${cdata(l.updated_at.replace('T', ' ').slice(0, 19))}</Last_Updated>`,
    '</Listing>',
  ].join('')).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Listings>\n${items}\n</Listings>\n`
}

export function portalXml(portal: PortalKey): string {
  const { eligible } = portalListings(portal)
  return portal === 'propertyfinder' ? propertyFinderXml(eligible) : bayutXml(eligible, portal)
}

// ------------------------------------------------------------------ feed token
/** The secret that makes the feed URLs unguessable. Created on first use; rotating it stops every old URL. */
export function portalFeedToken(rotate = false): string {
  let t = String(getSetting('portal_feed_token') || '')
  if (!t || rotate) { t = crypto.randomBytes(24).toString('base64url'); setSettings({ portal_feed_token: t }) }
  return t
}
export function feedTokenMatches(given: string): boolean {
  const t = String(getSetting('portal_feed_token') || '')
  if (!t) return false
  const a = Buffer.from(t), b = Buffer.from(String(given))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// ------------------------------------------------------------------ portal enquiries
const pick = (b: any, ...keys: string[]) => {
  for (const k of keys) {
    const v = k.split('.').reduce((o: any, p) => (o == null ? undefined : o[p]), b)
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
  }
  return undefined
}

/**
 * Flattens a portal enquiry (Property Finder, Bayut, Dubizzle, or a forwarder such as Zapier) into the lead-intake shape. Field names differ
 * between portals and API versions, so the common spellings are all accepted. The listing reference ties the enquiry to our property, which
 * gives the lead its department so the routing rules can assign it.
 */
export function portalEnquiry(portal: PortalKey, body: any) {
  const ref = pick(body, 'listing_reference', 'listingReference', 'property_reference', 'propertyReference', 'reference', 'reference_number', 'listing.reference', 'property.reference', 'Property_Ref_No')
  const prop = ref ? q.get(`SELECT id, title, property_no, department_division, agent_id FROM properties WHERE deleted_at IS NULL AND (lower(property_no) = ? OR lower(rera_permit_no) = ?) LIMIT 1`, ref.toLowerCase(), ref.toLowerCase()) : undefined
  // The enquiry goes to the agent who owns the listing (their user account), when that agent is active; otherwise the routing rules decide.
  const listingAgentUser = prop?.agent_id ? q.val<number>(`SELECT u.id FROM agents a JOIN employees e ON e.id = a.employee_id AND e.deleted_at IS NULL JOIN users u ON u.id = e.user_id AND u.active = 1 AND u.deleted_at IS NULL
    WHERE a.id = ? AND a.deleted_at IS NULL AND COALESCE(a.status, 'Active') = 'Active'`, prop.agent_id) : undefined
  const msg = pick(body, 'message', 'enquiry', 'inquiry', 'comments', 'client_message', 'lead.message')
  const lines = [
    msg,
    prop ? `Listing: ${prop.title} (${prop.property_no})` : ref ? `Listing reference: ${ref} (not found in SWK OS)` : '',
    `Portal: ${PORTALS[portal].label}`,
  ].filter(Boolean)
  return {
    external_id: pick(body, 'id', 'lead_id', 'leadId', 'enquiry_id', 'lead.id'),
    name: pick(body, 'name', 'client_name', 'clientName', 'full_name', 'contact.name', 'lead.name', 'sender.name')?.slice(0, 120),
    email: pick(body, 'email', 'client_email', 'clientEmail', 'contact.email', 'lead.email', 'sender.email')?.slice(0, 160),
    phone: pick(body, 'phone', 'mobile', 'client_phone', 'clientPhone', 'contact.phone', 'lead.phone', 'sender.phone')?.slice(0, 40),
    message: lines.join('\n').slice(0, 2000),
    source: PORTALS[portal].leadSource,
    department_division: prop?.department_division ?? undefined,
    owner_id: listingAgentUser ?? undefined,
  }
}
