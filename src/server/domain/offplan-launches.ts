import { q } from '../db'
import { createRecord,findOne,getDef,SYSTEM_CTX } from '../engine'
import { nowIso } from '../util'
import { OFFPLAN_LAUNCHES,type OffPlanLaunch } from '../../shared/offplan-launches'
import { satelliteViewUrl,type ProjectMediaItem } from '../../shared/media'

const PROPERTY_TYPES = new Set(['Apartment', 'Villa', 'Townhouse', 'Penthouse', 'Duplex'])
const PLANS = new Set(['50/50', '60/40', '70/30', '80/20'])

/** "Plan 60/40" -> "60/40"; post-handover and odd splits -> "Custom" (the exact split stays in the description). */
export function planOption(tag: string | null): string | undefined {
  if (!tag) return undefined
  const m = tag.match(/(\d+)\/(\d+)/)
  if (/post/i.test(tag)) return 'Custom'
  return m && PLANS.has(`${m[1]}/${m[2]}`) ? `${m[1]}/${m[2]}` : 'Custom'
}

const bedsLabel = (b: number[]) => b.map(n => (n === 0 ? 'Studio' : `${n} BR`)).join(', ')

export function launchMedia(l: OffPlanLaunch): ProjectMediaItem[] {
  const at = `${l.launchDate}T00:00:00.000Z`
  const items: ProjectMediaItem[] = l.images.map((url, i) => ({
    id: `launch-${l.slug}-${i + 1}`, kind: 'photo', url, order: i, is_cover: i === 0,
    title: `${l.name} — render ${i + 1}`, category: i === 0 ? 'Exterior' : '3D Render', mime: 'image/webp', created_at: at,
  }))
  if (!items.length) items.push({ id: `launch-${l.slug}-area`, kind: 'photo', url: l.cover, order: 0, is_cover: true, title: `${l.community} — area photo`, caption: 'Area photo until the developer renders are added', category: 'Lobby & Views', mime: 'image/webp', created_at: at })
  if (l.lat != null && l.lng != null) items.push({ id: `launch-${l.slug}-sat`, kind: 'tour3d', url: satelliteViewUrl(l.lat, l.lng), order: items.length, title: `${l.name} — satellite location view`, category: 'Masterplan 3D', created_at: at })
  return items
}

function launchDescription(l: OffPlanLaunch): string {
  const parts = [`New off-plan launch by ${l.developer} in ${l.area === l.community ? l.community : `${l.community} (${l.area})`}, Dubai — launched ${l.launchDate}.`]
  if (l.handover) parts.push(`DLD planned handover: ${l.handover}.`)
  if (l.bedrooms.length) parts.push(`Unit mix: ${bedsLabel(l.bedrooms)}${l.units ? ` across ${l.units} units` : ''}.`)
  if (l.paymentPlan) parts.push(`Payment plan: ${l.paymentPlan}${l.downPct != null ? ` (${l.downPct}% down${l.onHandoverPct != null ? `, ${l.onHandoverPct}% on handover` : ''}${l.postHandoverPct ? `, ${l.postHandoverPct}% post-handover` : ''})` : ''}.`)
  if (l.fromPrice) parts.push(`Prices from AED ${l.fromPrice.toLocaleString('en-US')}.`)
  return parts.join(' ')
}

function developerId(name: string): number {
  const found = findOne('developers', 'lower(name) = lower(?)', name)
  if (found) return Number(found.id)
  const code = `DEV-${name.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 16) || 'NEW'}`
  const clash = findOne('developers', 'code = ?', code)
  return Number(createRecord(getDef('developers'), { code: clash ? `${code}-${Date.now() % 10000}` : code, name, emirate: 'Dubai' }, SYSTEM_CTX).id)
}

export function launchPayload(l: OffPlanLaunch, devId: number): Record<string, unknown> {
  const year = l.handover ? Number(l.handover.slice(0, 4)) : null
  const type = l.propertyTypes.find(t => PROPERTY_TYPES.has(t)) ?? 'Apartment'
  return {
    title: l.name,
    department_division: 'Sales of Off-Plan Projects',
    inventory_source_type: 'Direct Developer',
    property_type: type,
    status: 'Off-Plan',
    seller_finance_status: 'Off-Plan Payment Plan (Oqood)',
    developer_ref: devId,
    community_id: l.community,
    sub_community: l.area,
    tenure: 'Freehold',
    bedrooms: l.bedrooms.length ? l.bedrooms[0] : undefined,
    area_sqft: l.sizeMin ?? undefined,
    price: l.fromPrice ?? undefined,
    completion_year: year && year >= 2020 && year <= 2035 ? year : undefined,
    payment_plan: planOption(l.paymentPlan),
    is_off_plan: true,
    address: `${l.area}, ${l.community}, Dubai`,
    latitude: l.lat != null ? String(l.lat) : undefined,
    longitude: l.lng != null ? String(l.lng) : undefined,
    description: launchDescription(l),
    features: [l.bedrooms.length ? `Unit mix: ${bedsLabel(l.bedrooms)}` : '', l.units ? `${l.units} units` : '', l.expectedYieldPct ? `Expected gross yield ~${l.expectedYieldPct}% (area peers)` : ''].filter(Boolean).join('\n') || undefined,
    // no Trakheesi permit yet: keep off the portals until staff add one
    syndicate_bayut: false, syndicate_dubizzle: false, syndicate_pf: false,
    listed_date: l.launchDate,
    available_date: l.handover ?? undefined,
    virtual_tour_url: l.lat != null && l.lng != null ? satelliteViewUrl(l.lat, l.lng) : undefined,
    media: launchMedia(l),
    notes: `Added from the Dubai new-launch feed (DLD-registered, data as of 2026-11-26). Source key: ${l.key}. Check prices, payment plan and permit with the developer before advertising.`,
  }
}

/**
 * Adds each catalogued launch once as an off-plan property. A per-launch settings key records it, so a launch
 * staff later delete is not added back, and edits made in the app are never overwritten.
 */
export function ensureOffPlanLaunches(): { added: number } {
  let added = 0
  for (const l of OFFPLAN_LAUNCHES) {
    const key = `offplan-launch:${l.key}`
    if (q.val(`SELECT 1 FROM settings WHERE key = ?`, key)) continue
    try {
      const match = findOne('properties', 'lower(title) = lower(?)', l.name)
      const existing = match?.is_off_plan ? match : null
      const id = existing ? Number(existing.id) : Number(createRecord(getDef('properties'), launchPayload(l, developerId(l.developer)), SYSTEM_CTX).id)
      if (!existing) added++
      q.run(`INSERT INTO settings(key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, key, String(id), nowIso())
    } catch (e) { console.warn(`[launches] ${l.name} skipped:`, (e as Error).message) }
  }
  return { added }
}
