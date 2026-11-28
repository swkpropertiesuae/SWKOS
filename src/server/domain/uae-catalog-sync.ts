import { q, tx, qi, tableExists } from '../db'
import { audit, getDef, SYSTEM_CTX } from '../engine'
import { ENTITIES } from '../../shared/entities'
import { nowIso, toCents } from '../util'
import { backupBeforeReset } from './business-data'
import {
  UAE_CATALOG_VERSION,
  UAE_COMMUNITIES,
  UAE_COMMUNITIES_BY_CODE,
  UAE_DEVELOPERS,
  UAE_DEVELOPERS_BY_CODE,
  UAE_PROJECTS,
} from '../../shared/uae-catalog'
import { satelliteViewUrl, type ProjectMediaItem } from '../../shared/media'

export const CATALOG_RESET_KEY = 'catalog_reset:uae_projects_v5_2026_11_27'
export const CATALOG_DEVS_COMMS_SEED_KEY = `catalog_seed:devs_comms:${UAE_CATALOG_VERSION}`
export const CATALOG_PROJECTS_SEED_KEY = `catalog_seed:projects:${UAE_CATALOG_VERSION}`

export interface CatalogSyncResult {
  resetRan: boolean
  backup: string
  cleared: { properties: number; units: number; developers: number; communities: number }
  archived: { properties: number; units: number; developers: number; communities: number }
  seeded: { developers: number; communities: number; projects: number }
}

/** Collect all IDs of `targetEntity` referenced by any preserved operational table (excluding catalog tables being reset). */
function findReferencedIds(targetEntity: 'properties' | 'units' | 'developers' | 'communities', excludeTables: Set<string>): Set<number> {
  const ids = new Set<number>()
  for (const [key, def] of Object.entries(ENTITIES)) {
    if (excludeTables.has(key) || !tableExists(key)) continue
    for (const f of def.fields) {
      if (f.type === 'ref' && f.ref === targetEntity && !f.virtual) {
        const rows = q.all<{ v: number }>(`SELECT DISTINCT ${qi(f.name)} AS v FROM ${qi(key)} WHERE ${qi(f.name)} IS NOT NULL`)
        for (const r of rows) {
          const n = Number(r.v)
          if (Number.isInteger(n) && n > 0) ids.add(n)
        }
      }
    }
  }
  // Check polymorphic share_links (ref_ids is JSON array of numeric IDs)
  if (tableExists('share_links')) {
    const rows = q.all<{ ref_ids: string }>(`SELECT ref_ids FROM share_links WHERE entity = ? AND ref_ids IS NOT NULL`, targetEntity)
    for (const r of rows) {
      try {
        const parsed = JSON.parse(String(r.ref_ids))
        if (Array.isArray(parsed)) {
          for (const raw of parsed) {
            const n = Number(raw)
            if (Number.isInteger(n) && n > 0) ids.add(n)
          }
        }
      } catch { /* ignore malformed ref_ids */ }
    }
  }
  // Check legacy non-entity tables that might reference property_id
  if (targetEntity === 'properties') {
    for (const extra of ['property_key_logs', 'portal_syndication_logs']) {
      if (!tableExists(extra)) continue
      try {
        const rows = q.all<{ v: number }>(`SELECT DISTINCT property_id AS v FROM ${qi(extra)} WHERE property_id IS NOT NULL`)
        for (const r of rows) { const n = Number(r.v); if (Number.isInteger(n) && n > 0) ids.add(n) }
      } catch { /* column absent in this version */ }
    }
  }
  return ids
}

function buildDeveloperMedia(devId: number, d: (typeof UAE_DEVELOPERS)[number], ts: string): ProjectMediaItem[] {
  const items: ProjectMediaItem[] = [
    {
      id: `dev-${d.slug}-logo`,
      kind: 'photo',
      url: d.logo,
      order: 0,
      is_cover: true,
      title: `${d.name} — Official Brand Emblem`,
      category: 'Exterior',
      mime: d.logo.endsWith('.svg') ? 'image/svg+xml' : 'image/png',
      created_at: ts,
    },
    {
      id: `dev-${d.slug}-brochure`,
      kind: 'brochure',
      url: `/api/catalog-kit/developers/${devId}/brochure.pdf`,
      order: 1,
      title: `${d.name} — Master Developer Portfolio Brochure (PDF)`,
      category: 'Official Brochure',
      mime: 'application/pdf',
      created_at: ts,
    },
    {
      id: `dev-${d.slug}-ppt`,
      kind: 'ppt',
      url: `/api/catalog-kit/developers/${devId}/deck.pptx`,
      order: 2,
      title: `${d.name} — Executive Investor Pitch Deck (PPTX)`,
      category: 'Sales Deck (PPT)',
      mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      created_at: ts,
    },
  ]
  return items
}

function buildCommunityMedia(commId: number, c: (typeof UAE_COMMUNITIES)[number], ts: string): ProjectMediaItem[] {
  return [
    {
      id: `comm-${c.slug}-hero`,
      kind: 'photo',
      url: c.image,
      order: 0,
      is_cover: true,
      title: `${c.name} (${c.emirate}) — Master Community Hero`,
      category: 'Exterior',
      mime: c.image.endsWith('.svg') ? 'image/svg+xml' : 'image/webp',
      created_at: ts,
    },
    {
      id: `comm-${c.slug}-3d`,
      kind: 'tour3d',
      url: satelliteViewUrl(c.lat, c.lng),
      order: 1,
      title: `${c.name} — 3D Aerial & Satellite Masterplan`,
      category: 'Masterplan 3D',
      created_at: ts,
    },
    {
      id: `comm-${c.slug}-brochure`,
      kind: 'brochure',
      url: `/api/catalog-kit/communities/${commId}/brochure.pdf`,
      order: 2,
      title: `${c.name} — Community Investment Guide & Brochure (PDF)`,
      category: 'Official Brochure',
      mime: 'application/pdf',
      created_at: ts,
    },
    {
      id: `comm-${c.slug}-ppt`,
      kind: 'ppt',
      url: `/api/catalog-kit/communities/${commId}/deck.pptx`,
      order: 3,
      title: `${c.name} — Market Intelligence Presentation (PPTX)`,
      category: 'Sales Deck (PPT)',
      mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      created_at: ts,
    },
  ]
}

function buildProjectMedia(propId: number, p: (typeof UAE_PROJECTS)[number], ts: string): ProjectMediaItem[] {
  const items: ProjectMediaItem[] = p.images.map((url, idx) => ({
    id: `prj-${p.slug}-img-${idx + 1}`,
    kind: 'photo',
    url,
    order: idx,
    is_cover: idx === 0,
    title: `${p.title} — ${idx === 0 ? 'Architectural Hero' : `Render & Gallery ${idx + 1}`}`,
    category: idx === 0 ? 'Exterior' : '3D Render',
    mime: url.endsWith('.svg') ? 'image/svg+xml' : 'image/webp',
    created_at: ts,
  }))
  items.push({
    id: `prj-${p.slug}-3d`,
    kind: 'tour3d',
    url: satelliteViewUrl(p.lat, p.lng),
    order: items.length,
    title: `${p.title} — 3D Satellite & Masterplan View`,
    category: 'Masterplan 3D',
    created_at: ts,
  })
  if (p.floorPlans?.length) {
    p.floorPlans.forEach((fp, fpIdx) => {
      items.push({
        id: `prj-${p.slug}-fp-${fpIdx + 1}`,
        kind: 'floorplan',
        url: fp.url,
        order: items.length,
        title: fp.title,
        category: fp.category || 'Floor Plan',
        mime: fp.url.endsWith('.png') ? 'image/png' : 'image/webp',
        created_at: ts,
      })
    })
  }
  items.push({
    id: `prj-${p.slug}-brochure`,
    kind: 'brochure',
    url: `/api/catalog-kit/properties/${propId}/brochure.pdf`,
    order: items.length,
    title: `${p.title} — Official Branded Brochure (PDF)`,
    category: 'Official Brochure',
    mime: 'application/pdf',
    created_at: ts,
  })
  items.push({
    id: `prj-${p.slug}-payplan`,
    kind: 'payment_plan',
    url: `/api/catalog-kit/properties/${propId}/payment-plan.pdf`,
    order: items.length,
    title: `${p.title} — Payment Plan & ${p.emirate === 'Dubai' ? 'DLD' : 'ADM'} Fee Schedule (PDF)`,
    category: 'Payment Plan PDF',
    mime: 'application/pdf',
    created_at: ts,
  })
  items.push({
    id: `prj-${p.slug}-ppt`,
    kind: 'ppt',
    url: `/api/catalog-kit/properties/${propId}/deck.pptx`,
    order: items.length,
    title: `${p.title} — Client Pitch Deck (PPTX)`,
    category: 'Sales Deck (PPT)',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    created_at: ts,
  })
  return items
}

/** Seed all 81 UAE developers and 276 Dubai & Abu Dhabi communities in a single fast transaction. */
export function seedUaeDevelopersAndCommunities(): { developers: number; communities: number } {
  const ts = nowIso()
  let devsAdded = 0
  let commsAdded = 0

  tx(() => {
    const existingDevCodes = new Set(
      q.all<{ code: string }>(`SELECT code FROM developers`).map(r => String(r.code || '').toUpperCase()),
    )
    for (const d of UAE_DEVELOPERS) {
      if (existingDevCodes.has(d.code.toUpperCase())) continue
      const row = q.get<{ id: number }>(
        `INSERT INTO developers (
          code, name, short_name, emirate, tier, founded_year, headquarters, rera_id, website,
          description, specialties, amenities_standard, flagship_projects, active,
          created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1) RETURNING id`,
        d.code,
        d.name,
        d.shortName,
        d.emirate,
        d.tier,
        d.foundedYear,
        d.headquarters,
        d.reraId,
        d.website,
        d.description,
        d.specialties,
        d.amenitiesStandard.join('\n'),
        d.flagshipProjects.join('\n'),
        ts,
        ts,
      )
      if (row?.id) {
        const id = Number(row.id)
        const media = buildDeveloperMedia(id, d, ts)
        q.run(
          `UPDATE developers SET brochure_url = ?, ppt_url = ?, media = ? WHERE id = ?`,
          `/api/catalog-kit/developers/${id}/brochure.pdf`,
          `/api/catalog-kit/developers/${id}/deck.pptx`,
          JSON.stringify(media),
          id,
        )
        existingDevCodes.add(d.code.toUpperCase())
        devsAdded++
      }
    }

    const existingCommCodes = new Set(
      q.all<{ code: string }>(`SELECT code FROM communities`).map(r => String(r.code || '').toUpperCase()),
    )
    for (const c of UAE_COMMUNITIES) {
      if (existingCommCodes.has(c.code.toUpperCase())) continue
      const row = q.get<{ id: number }>(
        `INSERT INTO communities (
          code, name, ticker, emirate, area, segment, master_developer, rera_community_id,
          avg_price_sqft, avg_rent_annual, gross_yield_pct, service_charge_sqft,
          latitude, longitude, description, key_landmarks, amenities, metro_transit,
          schools, hospitals, future_outlook, closing_keywords, virtual_tour_url, active,
          created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1) RETURNING id`,
        c.code,
        c.name,
        c.ticker,
        c.emirate,
        c.area,
        c.segment,
        c.masterDeveloper,
        c.reraCommunityId,
        c.ppsf,
        c.avgRentAnnual,
        c.yieldPct,
        c.serviceCharge,
        String(c.lat),
        String(c.lng),
        c.description,
        c.nearby.landmarks.join('\n'),
        c.amenities.join('\n'),
        c.nearby.metro,
        c.nearby.schools.join('\n'),
        c.nearby.hospitals.join('\n'),
        c.future15YearOutlook,
        c.closingKeywords.join(' · '),
        satelliteViewUrl(c.lat, c.lng),
        ts,
        ts,
      )
      if (row?.id) {
        const id = Number(row.id)
        const media = buildCommunityMedia(id, c, ts)
        q.run(
          `UPDATE communities SET brochure_url = ?, ppt_url = ?, media = ? WHERE id = ?`,
          `/api/catalog-kit/communities/${id}/brochure.pdf`,
          `/api/catalog-kit/communities/${id}/deck.pptx`,
          JSON.stringify(media),
          id,
        )
        existingCommCodes.add(c.code.toUpperCase())
        commsAdded++
      }
    }
  })

  return { developers: devsAdded, communities: commsAdded }
}

/** Seed all UAE projects once each (tracked via settings so staff-deleted projects are never re-added). */
export function seedUaeProjectsCatalog(): number {
  const ts = nowIso()
  let added = 0

  tx(() => {
    const devIdByCode = new Map<string, number>()
    for (const r of q.all<{ id: number; code: string }>(`SELECT id, code FROM developers WHERE deleted_at IS NULL`)) {
      devIdByCode.set(String(r.code || '').toUpperCase(), Number(r.id))
    }
    const commIdByCode = new Map<string, number>()
    for (const r of q.all<{ id: number; code: string }>(`SELECT id, code FROM communities WHERE deleted_at IS NULL`)) {
      commIdByCode.set(String(r.code || '').toUpperCase(), Number(r.id))
    }
    const seededKeys = new Set(
      q.all<{ key: string }>(`SELECT key FROM settings WHERE key LIKE 'uae-project:%'`).map(r => r.key),
    )
    const existingTitles = new Set(
      q.all<{ title: string }>(`SELECT title FROM properties WHERE deleted_at IS NULL`).map(r => String(r.title || '').toLowerCase()),
    )

    const yy = ts.slice(2, 4)
    const seqKey = `properties|PRJ-${yy}`
    let seq = Number(q.val<number>(`SELECT value FROM sequences WHERE key = ?`, seqKey) ?? 0)
    const newSettingRows: [string, string][] = []

    for (const p of UAE_PROJECTS) {
      const sKey = `uae-project:${p.slug}`
      if (seededKeys.has(sKey)) continue
      if (existingTitles.has(p.title.toLowerCase())) {
        newSettingRows.push([sKey, 'existing'])
        seededKeys.add(sKey)
        continue
      }

      const devId = devIdByCode.get(p.developerCode.toUpperCase()) ?? null
      const commId = commIdByCode.get(p.communityCode.toUpperCase()) ?? null
      const dev = UAE_DEVELOPERS_BY_CODE.get(p.developerCode)
      const comm = UAE_COMMUNITIES_BY_CODE.get(p.communityCode)

      seq += 1
      const propNo = `PRJ-${yy}${String(seq).padStart(5, '0')}`
      const priceCents = toCents(p.fromPrice)
      const ppsfCents = p.areaSqftMin > 0 ? toCents(Math.round(p.fromPrice / p.areaSqftMin)) : null
      const rentEst = Math.round(p.fromPrice * (p.expectedYieldPct / 100))
      const rentCents = toCents(rentEst)

      const row = q.get<{ id: number }>(
        `INSERT INTO properties (
          property_no, title, project_name, emirate, department_division, inventory_source_type,
          property_type, status, launch_status, seller_finance_status,
          developer_id, developer_ref, community_id, community_ref, sub_community, building_name,
          furnishing, tenure, bedrooms, bathrooms, area_sqft, area_sqm,
          price, price_per_sqft, rent_annual, roi_percent, year_built, completion_year,
          handover_quarter, payment_plan, payment_plan_summary, unit_mix, total_units, available_units,
          is_off_plan, is_exclusive, promo_headline, promo_badge, promo_benefits,
          address, latitude, longitude, description, features, amenities,
          listed_date, available_date, syndicate_bayut, syndicate_dubizzle, syndicate_pf,
          active, virtual_tour_url, notes, created_at, updated_at, version
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, 0, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, 0, 0, 0,
          1, ?, ?, ?, ?, 1
        ) RETURNING id`,
        propNo,
        p.title,
        p.projectName,
        p.emirate,
        p.isOffPlan ? 'Sales of Off-Plan Projects' : 'Secondary Projects',
        p.isOffPlan ? 'Direct Developer' : 'Direct Seller / Owner',
        p.propertyType,
        p.status,
        p.launchStatus,
        p.isOffPlan ? 'Off-Plan Payment Plan (Oqood)' : 'Cash (Title Deed Clear)',
        dev?.name || p.developerCode,
        devId,
        comm?.name || p.communityCode,
        commId,
        comm?.area || p.emirate,
        p.projectName,
        p.furnishing,
        p.tenure,
        p.bedrooms[0] ?? 1,
        Math.max(1, (p.bedrooms[0] ?? 1) + 1),
        p.areaSqftMin,
        Math.round(p.areaSqftMin * 0.092903),
        priceCents,
        ppsfCents,
        rentCents,
        p.expectedYieldPct,
        p.isOffPlan ? null : p.completionYear,
        p.completionYear,
        p.handoverQuarter,
        p.paymentPlan.option,
        p.paymentPlan.label,
        p.unitMix,
        p.totalUnits,
        p.availableUnits,
        p.isOffPlan ? 1 : 0,
        p.promoHeadline,
        p.promoBadge,
        p.promoBenefits.join('\n'),
        `${comm?.name || p.communityCode}, ${p.emirate}, UAE`,
        String(p.lat),
        String(p.lng),
        p.description,
        p.features.join('\n'),
        p.amenities.join('\n'),
        p.launchDate,
        p.handoverDate,
        satelliteViewUrl(p.lat, p.lng),
        `SWK Master UAE Catalog (${UAE_CATALOG_VERSION}). Source: ${p.source}. Slug: ${p.slug}.`,
        ts,
        ts,
      )

      if (row?.id) {
        const id = Number(row.id)
        const media = buildProjectMedia(id, p, ts)
        const primaryFloorPlan = p.floorPlans?.[0]?.url || null
        q.run(
          `UPDATE properties SET brochure_url = ?, payment_plan_pdf_url = ?, ppt_url = ?, floor_plan_url = COALESCE(?, floor_plan_url), media = ? WHERE id = ?`,
          `/api/catalog-kit/properties/${id}/brochure.pdf`,
          `/api/catalog-kit/properties/${id}/payment-plan.pdf`,
          `/api/catalog-kit/properties/${id}/deck.pptx`,
          primaryFloorPlan,
          JSON.stringify(media),
          id,
        )
        newSettingRows.push([sKey, String(id)])
        seededKeys.add(sKey)
        existingTitles.add(p.title.toLowerCase())
        added++
      }
    }

    if (added > 0) {
      q.run(
        `INSERT INTO sequences(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        seqKey,
        seq,
      )
    }
    // Batch-insert per-project settings guards in chunks of 80 for speed across Postgres
    for (let i = 0; i < newSettingRows.length; i += 80) {
      const chunk = newSettingRows.slice(i, i + 80)
      const placeholders = chunk.map(() => '(?, ?, ?)').join(', ')
      const params: any[] = []
      for (const [k, v] of chunk) params.push(k, v, ts)
      q.run(
        `INSERT INTO settings(key, value, updated_at) VALUES ${placeholders} ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        ...params,
      )
    }
  })

  return added
}

/**
 * One-time safe catalog-only reset + idempotent UAE Master Catalog seeder.
 *
 * STRICT PRESERVATION GUARANTEE:
 * Never modifies website_listings, website_promotions, website_social_campaigns, users, roles,
 * employees, attendance, leave_requests, payslips, leads, parties, contacts, crm_vault_*, jobs,
 * mandates, leases, invoices, bills, payments, receipts, or journal_entries.
 *
 * Only clears unreferenced legacy catalog rows (properties, units, developers, communities) and
 * soft-archives any legacy catalog row actively referenced by a preserved operational record so
 * historical deals/leases/invoices stay 100% intact and editable.
 */
export async function runUaeCatalogMigrationAndSeed(opts: { seedProjects?: boolean; skipBackup?: boolean } = {}): Promise<CatalogSyncResult> {
  const result: CatalogSyncResult = {
    resetRan: false,
    backup: '',
    cleared: { properties: 0, units: 0, developers: 0, communities: 0 },
    archived: { properties: 0, units: 0, developers: 0, communities: 0 },
    seeded: { developers: 0, communities: 0, projects: 0 },
  }

  const resetDone = Boolean(q.val(`SELECT 1 FROM settings WHERE key = ?`, CATALOG_RESET_KEY))
  if (!resetDone) {
    if (!opts.skipBackup) {
      try { result.backup = await backupBeforeReset('before-uae-catalog-reset') } catch (e) { console.warn('[uae-catalog] pre-reset backup skipped:', (e as Error).message) }
    }

    const ts = nowIso()
    tx(() => {
      const catalogTables = new Set(['properties', 'units', 'developers', 'communities'])
      const refUnits = findReferencedIds('units', catalogTables)
      const refProps = findReferencedIds('properties', catalogTables)
      // Also keep any property referenced by a kept unit
      if (refUnits.size > 0 && tableExists('units')) {
        const unitList = [...refUnits]
        for (let i = 0; i < unitList.length; i += 200) {
          const ch = unitList.slice(i, i + 200)
          const rows = q.all<{ property_id: number }>(`SELECT DISTINCT property_id FROM units WHERE id IN (${ch.map(() => '?').join(',')}) AND property_id IS NOT NULL`, ...ch)
          for (const r of rows) if (r.property_id) refProps.add(Number(r.property_id))
        }
      }

      // 1. Units: soft-archive referenced, hard-delete unreferenced
      if (tableExists('units')) {
        if (refUnits.size > 0) {
          const arr = [...refUnits]
          for (let i = 0; i < arr.length; i += 200) {
            const ch = arr.slice(i, i + 200)
            result.archived.units += q.run(`UPDATE units SET deleted_at = COALESCE(deleted_at, ?), active = 0, updated_at = ? WHERE id IN (${ch.map(() => '?').join(',')})`, ts, ts, ...ch).changes
          }
          // Delete unreferenced units in batches
          const delIds = q.all<{ id: number }>(`SELECT id FROM units`).map(r => Number(r.id)).filter(id => !refUnits.has(id))
          for (let i = 0; i < delIds.length; i += 400) {
            const ch = delIds.slice(i, i + 400)
            result.cleared.units += q.run(`DELETE FROM units WHERE id IN (${ch.map(() => '?').join(',')})`, ...ch).changes
          }
        } else {
          result.cleared.units = q.run(`DELETE FROM units`).changes
        }
      }

      // 2. Properties: soft-archive referenced, hard-delete unreferenced (wipes all 5,000+ unreferenced legacy rows to zero)
      if (tableExists('properties')) {
        if (refProps.size > 0) {
          const arr = [...refProps]
          for (let i = 0; i < arr.length; i += 200) {
            const ch = arr.slice(i, i + 200)
            result.archived.properties += q.run(`UPDATE properties SET deleted_at = COALESCE(deleted_at, ?), active = 0, updated_at = ? WHERE id IN (${ch.map(() => '?').join(',')})`, ts, ts, ...ch).changes
          }
          const delIds = q.all<{ id: number }>(`SELECT id FROM properties`).map(r => Number(r.id)).filter(id => !refProps.has(id))
          for (let i = 0; i < delIds.length; i += 400) {
            const ch = delIds.slice(i, i + 400)
            result.cleared.properties += q.run(`DELETE FROM properties WHERE id IN (${ch.map(() => '?').join(',')})`, ...ch).changes
          }
        } else {
          result.cleared.properties = q.run(`DELETE FROM properties`).changes
        }
      }

      // 3. Developers: soft-archive referenced (plus those referenced by soft-archived properties), hard-delete unreferenced
      const refDevs = findReferencedIds('developers', new Set(['developers', 'communities', 'payment_plan_templates']))
      if (tableExists('payment_plan_templates')) {
        q.run(`DELETE FROM payment_plan_templates`)
      }
      if (tableExists('developers')) {
        if (refDevs.size > 0) {
          const arr = [...refDevs]
          for (let i = 0; i < arr.length; i += 200) {
            const ch = arr.slice(i, i + 200)
            result.archived.developers += q.run(
              `UPDATE developers SET deleted_at = COALESCE(deleted_at, ?), active = 0, code = CASE WHEN code LIKE '%-ARCH-%' THEN code ELSE COALESCE(code, 'DEV') || '-ARCH-' || CAST(id AS TEXT) END, updated_at = ? WHERE id IN (${ch.map(() => '?').join(',')})`,
              ts, ts, ...ch,
            ).changes
          }
          const delIds = q.all<{ id: number }>(`SELECT id FROM developers`).map(r => Number(r.id)).filter(id => !refDevs.has(id))
          for (let i = 0; i < delIds.length; i += 400) {
            const ch = delIds.slice(i, i + 400)
            result.cleared.developers += q.run(`DELETE FROM developers WHERE id IN (${ch.map(() => '?').join(',')})`, ...ch).changes
          }
        } else {
          result.cleared.developers = q.run(`DELETE FROM developers`).changes
        }
      }

      // 4. Communities: soft-archive referenced, hard-delete unreferenced
      const refComms = findReferencedIds('communities', new Set(['communities']))
      if (tableExists('communities')) {
        if (refComms.size > 0) {
          const arr = [...refComms]
          for (let i = 0; i < arr.length; i += 200) {
            const ch = arr.slice(i, i + 200)
            result.archived.communities += q.run(
              `UPDATE communities SET deleted_at = COALESCE(deleted_at, ?), active = 0, code = CASE WHEN code LIKE '%-ARCH-%' THEN code ELSE COALESCE(code, 'COM') || '-ARCH-' || CAST(id AS TEXT) END, updated_at = ? WHERE id IN (${ch.map(() => '?').join(',')})`,
              ts, ts, ...ch,
            ).changes
          }
          const delIds = q.all<{ id: number }>(`SELECT id FROM communities`).map(r => Number(r.id)).filter(id => !refComms.has(id))
          for (let i = 0; i < delIds.length; i += 400) {
            const ch = delIds.slice(i, i + 400)
            result.cleared.communities += q.run(`DELETE FROM communities WHERE id IN (${ch.map(() => '?').join(',')})`, ...ch).changes
          }
        } else {
          result.cleared.communities = q.run(`DELETE FROM communities`).changes
        }
      }

      // 5. Clean orphaned polymorphic links for hard-deleted catalog records (keeps preserved archived refs intact)
      const polyPairs: [string, string][] = [
        ['properties', 'properties'],
        ['units', 'units'],
        ['developers', 'developers'],
        ['communities', 'communities'],
      ]
      for (const [ent, tbl] of polyPairs) {
        if (!tableExists(tbl)) continue
        for (const polyTbl of ['comments', 'record_refs', 'record_tags', 'record_links', 'record_likes']) {
          if (!tableExists(polyTbl)) continue
          try { q.run(`DELETE FROM ${qi(polyTbl)} WHERE entity = ? AND record_id NOT IN (SELECT id FROM ${qi(tbl)})`, ent) } catch { /* ignore schema variance */ }
        }
        if (tableExists('attachments')) {
          try { q.run(`DELETE FROM attachments WHERE link_entity = ? AND link_id NOT IN (SELECT id FROM ${qi(tbl)})`, ent) } catch { /* ignore */ }
        }
      }

      // Clear legacy off-plan launch markers and project sequences
      q.run(`DELETE FROM settings WHERE key LIKE 'offplan-launch:%' OR key LIKE 'offplan-launch-enrich:%' OR key LIKE 'uae-project:%'`)
      q.run(`DELETE FROM sequences WHERE key LIKE 'properties|%'`)
      q.run(
        `INSERT INTO settings(key, value, updated_at) VALUES (?, '1', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        CATALOG_RESET_KEY,
        ts,
      )
      try {
        audit(
          SYSTEM_CTX,
          getDef('properties'),
          0,
          'uae-catalog-reset',
          { cleared: [null, result.cleared], archived: [null, result.archived], backup: [null, result.backup || 'none'] },
          'Safe catalog-only reset completed (website, accounts, HR, CRM, deals & accounting preserved)',
        )
      } catch { /* audit optional during minimal test bootstrap */ }
    })

    result.resetRan = true
  }

  // Always ensure all 81 UAE developers, 276 communities & 8 standard UAE payment plan templates exist once
  if (!q.val(`SELECT 1 FROM settings WHERE key = ?`, CATALOG_DEVS_COMMS_SEED_KEY)) {
    const dc = seedUaeDevelopersAndCommunities()
    result.seeded.developers = dc.developers
    result.seeded.communities = dc.communities
    if (tableExists('payment_plan_templates')) {
      const ts = nowIso()
      const existingPlans = new Set(q.all<{ name: string }>(`SELECT name FROM payment_plan_templates WHERE deleted_at IS NULL`).map(r => r.name.toLowerCase()))
      const devId = (code: string) => q.val<number>(`SELECT id FROM developers WHERE code = ? AND deleted_at IS NULL`, code) ?? null
      const standardPlans: [string, string | null, number, number, number, number, number, number, number, string][] = [
        ['1% Monthly Post-Handover (Danube / Samana Style)', 'DANUBE', 10, 55, 55, 0, 35, 35, 1, '10% booking, 1% monthly during construction (55%) and 35% post-handover at 0% interest.'],
        ['80/20 Construction-Linked (Emaar / Nakheel Standard)', 'EMAAR', 10, 70, 7, 20, 0, 0, 4, '10% on booking, 70% construction milestones, 20% on completion & handover.'],
        ['70/30 Investor Plan (DAMAC / Binghatti Standard)', 'DAMAC', 10, 60, 6, 30, 0, 0, 4, '10% booking, 60% construction instalments, 30% on key handover.'],
        ['60/40 Prime Milestone Plan (Sobha / Aldar / Ellington)', 'ALDAR', 10, 50, 5, 40, 0, 0, 4, '10% booking, 50% construction-linked, 40% on handover (Dubai 4% DLD / Abu Dhabi 2% ADM).'],
        ['50/50 Balanced Handover Plan (Meraas / Abu Dhabi Islands)', 'MERAAS', 10, 40, 4, 50, 0, 0, 5, '10% booking, 40% construction, 50% upon handover — ideal for mortgage-backed end users.'],
        ['60/40 with 2-Year Post-Handover (10/50/15/25)', 'BLOOM', 10, 50, 5, 15, 25, 24, 4, '10% booking, 50% construction, 15% on handover, 25% over 24 months post-handover.'],
        ['65/35 with 3-Year Post-Handover (10/55/10/25)', 'EXPOCITY', 10, 55, 6, 10, 25, 36, 4, '10% booking, 55% construction, 10% on handover, 25% over 36 months post-handover.'],
        ['Ready Transfer / Up to 80% UAE Bank Mortgage', null, 20, 0, 0, 80, 0, 0, 1, '20% down payment + 80% UAE bank financing (up to 25-year tenure).'],
      ]
      tx(() => {
        for (const [name, devCode, bPct, cPct, cInst, hPct, pPct, pMon, gap, notes] of standardPlans) {
          if (existingPlans.has(name.toLowerCase())) continue
          q.run(
            `INSERT INTO payment_plan_templates (name, developer_id, active, booking_pct, construction_pct, construction_instalments, handover_pct, post_handover_pct, post_handover_months, instalment_gap_months, notes, created_at, updated_at, version)
             VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            name, devCode ? devId(devCode) : null, bPct, cPct, cInst, hPct, pPct, pMon, gap, notes, ts, ts,
          )
        }
      })
    }
    q.run(
      `INSERT INTO settings(key, value, updated_at) VALUES (?, '1', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      CATALOG_DEVS_COMMS_SEED_KEY,
      nowIso(),
    )
  }

  // Seed all UAE projects (both active off-plan launches & flagship ready projects) when enabled
  if (opts.seedProjects !== false) {
    result.seeded.projects = seedUaeProjectsCatalog()
    if (!q.val(`SELECT 1 FROM settings WHERE key = ?`, CATALOG_PROJECTS_SEED_KEY)) {
      q.run(
        `INSERT INTO settings(key, value, updated_at) VALUES (?, '1', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        CATALOG_PROJECTS_SEED_KEY,
        nowIso(),
      )
    }
  }

  return result
}
