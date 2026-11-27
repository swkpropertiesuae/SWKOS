import type { FastifyInstance } from 'fastify'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { z } from 'zod'
import { q, tx } from '../db'
import { dirs, config } from '../config'
import { assertCan, audit, can, createRecord, getDef, getRecord, insertRow, listRecords, patchRecord } from '../engine'
import { bad, nowIso, parseCsv, toCsv, todayStr } from '../util'
import { idOf, need } from './helpers'
import { BLOCKED_UPLOAD_EXTS, verifyFileMagicBytes } from './files'
import { persistUpload, removeStored } from '../integrations/storage'
import { assertZeroShabibPublicPayload } from '../../shared/zero-shabib-guard'
import {
  coverPhotoUrl,
  inferMediaKindFromFile,
  isSafeMediaUrl,
  normalizeMediaList,
  type ProjectMediaItem,
  type ProjectMediaKind,
} from '../../shared/media'

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

  const MEDIA_ENTITIES = new Set(['properties', 'units', 'website_listings', 'developers', 'communities'])
  const MEDIA_KIND_ENUM = z.enum(['photo', 'video', 'tour3d', 'floorplan', 'brochure', 'ppt', 'payment_plan'])

  const loadMediaTarget = (req: any, edit = false) => {
    const entity = String((req.params as any).entity || '')
    if (!MEDIA_ENTITIES.has(entity)) throw bad('Media Studio supports properties, units, website_listings, developers, and communities only')
    const def = getDef(entity)
    const id = idOf((req.params as any).id)
    if (edit) assertCan(req.ctx, def.module, 'edit')
    const rec = getRecord(def, id, req.ctx, { children: false })
    return { entity, def, id, rec }
  }

  const isModel3dMedia = (i: ProjectMediaItem) =>
    i.kind === 'tour3d' &&
    (/\.(glb|gltf|usdz)(\?|#|$)/i.test(i.url) || Boolean(i.mime && /gltf|model\//i.test(i.mime)) || Boolean(i.attachment_id))

  const syncPrimaryMediaFields = (entity: string, rec: Record<string, any>, list: ProjectMediaItem[]): Record<string, any> => {
    const patch: Record<string, any> = { media: list }
    const cover = coverPhotoUrl(list)
    const firstVideo = list.find(i => i.kind === 'video')?.url
    const firstTour = list.find(i => i.kind === 'tour3d' && !isModel3dMedia(i))?.url
    const firstModel3d = list.find(isModel3dMedia)?.url
    const firstFloor = list.find(i => i.kind === 'floorplan')?.url
    const firstBrochure = list.find(i => i.kind === 'brochure')?.url
    const firstPpt = list.find(i => i.kind === 'ppt')?.url
    const firstPayPlan = list.find(i => i.kind === 'payment_plan')?.url

    const canReplaceKitDefault = (cur: unknown) => !cur || String(cur).startsWith('/api/catalog-kit/')
    if (entity === 'website_listings') {
      if (cover && (!rec.image_url || String(rec.image_url).startsWith('/api/files/') || list.some(i => i.url === rec.image_url))) {
        patch.image_url = cover
      }
      if (firstVideo && !rec.video_url) patch.video_url = firstVideo
      if (firstTour && !rec.virtual_tour_url) patch.virtual_tour_url = firstTour
      if (firstModel3d && !rec.model_3d_url) patch.model_3d_url = firstModel3d
      if (firstFloor && !rec.floor_plan_url) patch.floor_plan_url = firstFloor
      if (firstBrochure && canReplaceKitDefault(rec.brochure_url)) patch.brochure_url = firstBrochure
    } else if (entity === 'properties') {
      if (firstVideo && !rec.video_url) patch.video_url = firstVideo
      if (firstTour && !rec.virtual_tour_url) patch.virtual_tour_url = firstTour
      if (firstModel3d && !rec.model_3d_url) patch.model_3d_url = firstModel3d
      if (firstFloor && !rec.floor_plan_url) patch.floor_plan_url = firstFloor
      const uploadedBrochure = list.find(i => i.kind === 'brochure' && !i.url.startsWith('/api/catalog-kit/'))?.url
      const uploadedPpt = list.find(i => i.kind === 'ppt' && !i.url.startsWith('/api/catalog-kit/'))?.url
      const uploadedPayPlan = list.find(i => i.kind === 'payment_plan' && !i.url.startsWith('/api/catalog-kit/'))?.url
      if (uploadedBrochure && canReplaceKitDefault(rec.brochure_url)) patch.brochure_url = uploadedBrochure
      else if (firstBrochure && !rec.brochure_url) patch.brochure_url = firstBrochure
      if (uploadedPpt && canReplaceKitDefault(rec.ppt_url)) patch.ppt_url = uploadedPpt
      else if (firstPpt && !rec.ppt_url) patch.ppt_url = firstPpt
      if (uploadedPayPlan && canReplaceKitDefault(rec.payment_plan_pdf_url)) patch.payment_plan_pdf_url = uploadedPayPlan
      else if (firstPayPlan && !rec.payment_plan_pdf_url) patch.payment_plan_pdf_url = firstPayPlan
    } else if (entity === 'developers' || entity === 'communities') {
      if (firstVideo && !rec.video_url) patch.video_url = firstVideo
      if (firstTour && !rec.virtual_tour_url) patch.virtual_tour_url = firstTour
      const uploadedBrochure = list.find(i => i.kind === 'brochure' && !i.url.startsWith('/api/catalog-kit/'))?.url
      const uploadedPpt = list.find(i => i.kind === 'ppt' && !i.url.startsWith('/api/catalog-kit/'))?.url
      if (uploadedBrochure && canReplaceKitDefault(rec.brochure_url)) patch.brochure_url = uploadedBrochure
      else if (firstBrochure && !rec.brochure_url) patch.brochure_url = firstBrochure
      if (uploadedPpt && canReplaceKitDefault(rec.ppt_url)) patch.ppt_url = uploadedPpt
      else if (firstPpt && !rec.ppt_url) patch.ppt_url = firstPpt
    } else if (entity === 'units') {
      if (firstVideo && !rec.video_url) patch.video_url = firstVideo
      if (firstTour && !rec.virtual_tour_url) patch.virtual_tour_url = firstTour
      if (firstFloor && !rec.floor_plan_url) patch.floor_plan_url = firstFloor
    }
    return patch
  }

  // Unified Project Media Studio API (properties, units, website_listings, developers, communities)
  app.get('/api/media/:entity/:id', async (req) => {
    const { entity, rec } = loadMediaTarget(req, false)
    const items = normalizeMediaList(rec.media)
    return {
      entity,
      id: rec.id,
      title: rec._title ?? rec.title ?? rec.name ?? rec.unit_no ?? '',
      items,
      video_url: rec.video_url ?? null,
      virtual_tour_url: rec.virtual_tour_url ?? null,
      model_3d_url: rec.model_3d_url ?? null,
      floor_plan_url: rec.floor_plan_url ?? null,
      brochure_url: rec.brochure_url ?? null,
      ppt_url: rec.ppt_url ?? null,
      payment_plan_pdf_url: rec.payment_plan_pdf_url ?? null,
      image_url: rec.image_url ?? coverPhotoUrl(items),
    }
  })

  app.post('/api/media/:entity/:id/upload', async (req) => {
    if (!req.isMultipart()) throw bad('Expected a multipart upload')
    const { entity, def, id, rec } = loadMediaTarget(req, true)
    const fields: Record<string, string> = {}
    const saved: { name: string; stored: string; size: number; mime: string }[] = []
    const pending: string[] = []
    const monthDir = todayStr().slice(0, 7)
    fs.mkdirSync(path.join(dirs.uploads, monthDir), { recursive: true })

    try {
      for await (const part of req.parts()) {
        if (part.type === 'field') {
          fields[part.fieldname] = String(part.value)
          continue
        }
        const orig = path.basename(part.filename || 'media').replace(/[^\w.\- ()]+/g, '_').slice(0, 150)
        const ext = path.extname(orig).slice(1).toLowerCase()
        if (BLOCKED_UPLOAD_EXTS.has(ext)) {
          part.file.resume()
          throw bad(`Files of type .${ext} are not allowed`)
        }
        const stored = path.join(monthDir, crypto.randomBytes(16).toString('hex') + (ext ? '.' + ext : ''))
        const full = path.join(dirs.uploads, stored)
        pending.push(stored)
        await pipeline(part.file, fs.createWriteStream(full))
        if ((part.file as any).truncated) throw bad(`File exceeds the ${Math.max(config.maxUploadMb, 50)} MB upload limit`)
        verifyFileMagicBytes(full, ext)
        const size = fs.statSync(full).size
        const kept = await persistUpload(stored, part.mimetype)
        pending[pending.indexOf(stored)] = kept
        saved.push({ name: orig, stored: kept, size, mime: part.mimetype })
      }
      if (!saved.length) throw bad('Select at least one image, video, 3D model, or PDF to upload')
    } catch (e) {
      await Promise.all(pending.map(n => removeStored(n)))
      throw e
    }

    const prefKind = fields.kind as ProjectMediaKind | undefined
    const category = (fields.category || '').trim().slice(0, 60) || undefined
    const caption = (fields.caption || '').trim().slice(0, 240) || undefined
    const current = normalizeMediaList(rec.media)
    const added: ProjectMediaItem[] = []
    const attCategoryMap: Record<ProjectMediaKind, string> = {
      photo: 'Project Photo',
      video: 'Project Video',
      tour3d: '3D Model / Tour',
      floorplan: 'Floor Plan',
      brochure: 'Project Brochure',
      ppt: 'Presentation Deck',
      payment_plan: 'Payment Plan PDF',
    }

    for (const f of saved) {
      const kind = inferMediaKindFromFile(f.name, f.mime, prefKind)
      const prev = q.get(`SELECT MAX(doc_version) v FROM attachments WHERE file_name = ? AND link_entity = ? AND link_id = ? AND deleted_at IS NULL`, f.name, entity, id)
      const attId = insertRow(
        getDef('attachments'),
        {
          file_name: f.name,
          stored_name: f.stored,
          size: f.size,
          mime: f.mime,
          category: attCategoryMap[kind] || 'General',
          link_entity: entity,
          link_id: id,
          link_label: rec._title ?? null,
          note: caption ?? null,
          doc_version: (prev?.v ?? 0) + 1,
        },
        req.ctx,
      )
      audit(req.ctx, getDef('attachments'), attId, 'upload', { file: [null, f.name] }, f.name)
      const item: ProjectMediaItem = {
        id: `att-${attId}`,
        kind,
        url: `/api/files/${attId}/download`,
        attachment_id: attId,
        title: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 140),
        caption,
        category: category || (kind === 'photo' ? 'Exterior' : kind === 'video' ? 'Project Launch Film' : kind === 'floorplan' ? 'Typical Floor Plate' : kind === 'tour3d' ? 'Interactive 3D Model' : kind === 'ppt' ? 'Developer Pitch Deck' : kind === 'payment_plan' ? 'Official Payment Plan PDF' : 'Official Brochure'),
        is_cover: kind === 'photo' && !current.some(x => x.kind === 'photo') && !added.some(x => x.kind === 'photo'),
        order: current.length + added.length,
        mime: f.mime,
        size: f.size,
        created_at: nowIso(),
      }
      added.push(item)
    }

    const next = normalizeMediaList([...current, ...added])
    const updated = patchRecord(def, id, syncPrimaryMediaFields(entity, rec, next), req.ctx)
    return { items: normalizeMediaList(updated.media), added, record: updated }
  })

  app.post('/api/media/:entity/:id/link', async (req) => {
    const { entity, def, id, rec } = loadMediaTarget(req, true)
    const b = z
      .object({
        kind: MEDIA_KIND_ENUM,
        url: z.string().trim().min(4).max(2000),
        title: z.string().trim().max(160).optional(),
        caption: z.string().trim().max(240).optional(),
        category: z.string().trim().max(60).optional(),
        set_primary: z.boolean().optional(),
      })
      .parse(req.body ?? {})
    if (!isSafeMediaUrl(b.url)) throw bad('Enter a valid https:// media, YouTube, Vimeo, Matterport, or 3D tour URL')
    const current = normalizeMediaList(rec.media)
    const item: ProjectMediaItem = {
      id: `lnk-${crypto.randomBytes(6).toString('hex')}`,
      kind: b.kind,
      url: b.url,
      title: b.title || undefined,
      caption: b.caption || undefined,
      category: b.category || undefined,
      is_cover: b.kind === 'photo' && (Boolean(b.set_primary) || !current.some(x => x.kind === 'photo')),
      order: current.length,
      created_at: nowIso(),
    }
    const next = normalizeMediaList(
      b.kind === 'photo' && b.set_primary
        ? [item, ...current.map((x, idx) => ({ ...x, is_cover: false, order: idx + 1 }))]
        : [...current, item],
    )
    const patch = syncPrimaryMediaFields(entity, rec, next)
    if (b.set_primary || !rec.video_url) {
      if (b.kind === 'video') patch.video_url = b.url
    }
    if (b.kind === 'tour3d') {
      if (/\.(glb|gltf|usdz)(\?|#|$)/i.test(b.url)) {
        if ((entity === 'properties' || entity === 'website_listings') && (b.set_primary || !rec.model_3d_url)) patch.model_3d_url = b.url
      } else if (b.set_primary || !rec.virtual_tour_url) {
        patch.virtual_tour_url = b.url
      }
    }
    if (b.kind === 'floorplan' && (entity === 'properties' || entity === 'units' || entity === 'website_listings') && (b.set_primary || !rec.floor_plan_url)) patch.floor_plan_url = b.url
    if (b.kind === 'brochure' && entity !== 'units' && (b.set_primary || !rec.brochure_url)) patch.brochure_url = b.url
    if (b.kind === 'ppt' && (entity === 'properties' || entity === 'developers' || entity === 'communities') && (b.set_primary || !rec.ppt_url)) patch.ppt_url = b.url
    if (b.kind === 'payment_plan' && entity === 'properties' && (b.set_primary || !rec.payment_plan_pdf_url)) patch.payment_plan_pdf_url = b.url
    const updated = patchRecord(def, id, patch, req.ctx)
    return { items: normalizeMediaList(updated.media), added: item, record: updated }
  })

  app.put('/api/media/:entity/:id/reorder', async (req) => {
    const { entity, def, id, rec } = loadMediaTarget(req, true)
    const b = z
      .object({
        items: z.array(
          z.object({
            id: z.string().min(1).max(80),
            kind: MEDIA_KIND_ENUM,
            url: z.string().min(1).max(2000),
            attachment_id: z.number().int().positive().optional(),
            title: z.string().max(160).optional(),
            caption: z.string().max(240).optional(),
            category: z.string().max(60).optional(),
            is_cover: z.boolean().optional(),
            order: z.number().int().min(0).optional(),
            mime: z.string().max(120).optional(),
            size: z.number().int().min(0).optional(),
            created_at: z.string().max(60).optional(),
          }),
        ).max(200),
        video_url: z.string().trim().max(2000).nullable().optional(),
        virtual_tour_url: z.string().trim().max(2000).nullable().optional(),
        model_3d_url: z.string().trim().max(2000).nullable().optional(),
        floor_plan_url: z.string().trim().max(2000).nullable().optional(),
        brochure_url: z.string().trim().max(2000).nullable().optional(),
        ppt_url: z.string().trim().max(2000).nullable().optional(),
        payment_plan_pdf_url: z.string().trim().max(2000).nullable().optional(),
      })
      .parse(req.body ?? {})

    const next = normalizeMediaList(b.items.map((it, idx) => ({ ...it, order: idx })))
    const patch = syncPrimaryMediaFields(entity, rec, next)
    if (b.video_url !== undefined) patch.video_url = b.video_url || null
    if (b.virtual_tour_url !== undefined) patch.virtual_tour_url = b.virtual_tour_url || null
    if (b.floor_plan_url !== undefined && (entity === 'properties' || entity === 'units' || entity === 'website_listings')) patch.floor_plan_url = b.floor_plan_url || null
    if (entity !== 'units') {
      if (b.model_3d_url !== undefined && (entity === 'properties' || entity === 'website_listings')) patch.model_3d_url = b.model_3d_url || null
      if (b.brochure_url !== undefined) patch.brochure_url = b.brochure_url || null
    }
    if (b.ppt_url !== undefined && (entity === 'properties' || entity === 'developers' || entity === 'communities')) patch.ppt_url = b.ppt_url || null
    if (b.payment_plan_pdf_url !== undefined && entity === 'properties') patch.payment_plan_pdf_url = b.payment_plan_pdf_url || null
    const updated = patchRecord(def, id, patch, req.ctx)
    return { items: normalizeMediaList(updated.media), record: updated }
  })

  // One-Step Developer Project Launch Wizard API (e.g., Shahrukhz by Danube + Unit Mix + Media + Optional Website Publish)
  app.post('/api/projects/launch', async (req) => {
    need(req, 'properties', 'create')
    const b = z
      .object({
        title: z.string().trim().min(2).max(180),
        subtitle: z.string().trim().max(240).optional(),
        developer_id: z.number().int().positive().nullable().optional(),
        developer_name: z.string().trim().max(140).optional(),
        community_id: z.number().int().positive().nullable().optional(),
        community_name: z.string().trim().max(140).optional(),
        sub_community: z.string().trim().max(140).optional(),
        building_name: z.string().trim().max(140).optional(),
        property_type: z.string().trim().max(60).default('Apartment'),
        starting_price: z.number().min(0).optional(),
        bedrooms: z.number().min(0).max(20).optional(),
        bathrooms: z.number().min(0).max(20).optional(),
        area_sqft: z.number().min(0).optional(),
        completion_year: z.number().int().min(2024).max(2035).optional(),
        handover_label: z.string().trim().max(80).optional(),
        payment_plan: z.string().trim().max(160).optional(),
        down_payment_pct: z.number().min(0).max(100).optional(),
        roi_percent: z.number().min(0).max(100).optional(),
        furnishing: z.string().trim().max(60).optional(),
        tenure: z.string().trim().max(60).default('Freehold'),
        rera_permit_no: z.string().trim().max(100).optional(),
        permit_expiry: z.string().trim().max(20).optional(),
        is_exclusive: z.boolean().default(true),
        description: z.string().trim().max(10000).optional(),
        features: z.string().trim().max(4000).optional(),
        amenities: z.string().trim().max(4000).optional(),
        video_url: z.string().trim().max(2000).optional(),
        virtual_tour_url: z.string().trim().max(2000).optional(),
        model_3d_url: z.string().trim().max(2000).optional(),
        floor_plan_url: z.string().trim().max(2000).optional(),
        brochure_url: z.string().trim().max(2000).optional(),
        ppt_url: z.string().trim().max(2000).optional(),
        payment_plan_pdf_url: z.string().trim().max(2000).optional(),
        project_name: z.string().trim().max(160).optional(),
        emirate: z.string().trim().max(60).optional(),
        media_links: z
          .array(
            z.object({
              kind: MEDIA_KIND_ENUM,
              url: z.string().trim().min(4).max(2000),
              title: z.string().trim().max(160).optional(),
              caption: z.string().trim().max(240).optional(),
              category: z.string().trim().max(60).optional(),
            }),
          )
          .max(60)
          .optional(),
        units: z
          .array(
            z.object({
              unit_no: z.string().trim().min(1).max(80),
              unit_type: z.string().trim().max(60).default('Residential'),
              bedrooms: z.number().min(0).max(20).optional(),
              bathrooms: z.number().min(0).max(20).optional(),
              area_sqft: z.number().min(0).optional(),
              sale_price: z.number().min(0).optional(),
              floor_no: z.number().int().optional(),
              view: z.string().trim().max(120).optional(),
              furnishing: z.string().trim().max(60).optional(),
              floor_plan_url: z.string().trim().max(2000).optional(),
              virtual_tour_url: z.string().trim().max(2000).optional(),
              video_url: z.string().trim().max(2000).optional(),
            }),
          )
          .max(50)
          .optional(),
        publish_to_website: z.boolean().default(false),
        hot_offer: z.boolean().default(false),
        create_spotlight: z.boolean().default(false),
      })
      .parse(req.body ?? {})

    if (b.publish_to_website || b.create_spotlight) {
      need(req, 'website', 'edit')
    }

    const mediaList: ProjectMediaItem[] = normalizeMediaList([
      ...(b.media_links ?? []).map((m, idx) => ({
        id: `lnk-${idx}-${crypto.randomBytes(4).toString('hex')}`,
        kind: m.kind,
        url: m.url,
        title: m.title,
        caption: m.caption,
        category: m.category,
        order: idx,
        created_at: nowIso(),
      })),
      ...(b.video_url && isSafeMediaUrl(b.video_url) ? [{ id: 'lnk-video-main', kind: 'video' as const, url: b.video_url, title: `${b.title} — Official Video`, category: 'Project Launch Film', order: 100, created_at: nowIso() }] : []),
      ...(b.virtual_tour_url && isSafeMediaUrl(b.virtual_tour_url) ? [{ id: 'lnk-tour-main', kind: 'tour3d' as const, url: b.virtual_tour_url, title: `${b.title} — 360° / 3D Virtual Tour`, category: '360° Virtual Tour', order: 101, created_at: nowIso() }] : []),
      ...(b.model_3d_url && isSafeMediaUrl(b.model_3d_url) ? [{ id: 'lnk-model3d-main', kind: 'tour3d' as const, url: b.model_3d_url, title: `${b.title} — Interactive 3D Model`, category: 'Interactive 3D Model', order: 102, created_at: nowIso() }] : []),
      ...(b.floor_plan_url && isSafeMediaUrl(b.floor_plan_url) ? [{ id: 'lnk-fp-main', kind: 'floorplan' as const, url: b.floor_plan_url, title: `${b.title} — Floor Plan`, category: 'Typical Floor Plate', order: 103, created_at: nowIso() }] : []),
      ...(b.brochure_url && isSafeMediaUrl(b.brochure_url) ? [{ id: 'lnk-brochure-main', kind: 'brochure' as const, url: b.brochure_url, title: `${b.title} — Official Brochure`, category: 'Official Brochure', order: 104, created_at: nowIso() }] : []),
    ])

    const result = tx(() => {
      // 1. Resolve or create Developer
      let devRef: number | null = b.developer_id ?? null
      let devName = (b.developer_name || '').trim()
      if (devRef) {
        const existingDev = q.get<{ id: number; name: string }>(`SELECT id, name FROM developers WHERE id = ? AND deleted_at IS NULL`, devRef)
        if (existingDev) devName = existingDev.name
        else devRef = null
      }
      if (!devRef && devName) {
        const match = q.get<{ id: number; name: string }>(`SELECT id, name FROM developers WHERE lower(name) = lower(?) AND deleted_at IS NULL LIMIT 1`, devName)
        if (match) {
          devRef = match.id
          devName = match.name
        } else if (can(req.user, 'masters', 'create')) {
          const baseCode = devName.replace(/[^A-Za-z0-9]+/g, '').toUpperCase().slice(0, 10) || 'DEV'
          let code = baseCode
          let n = 1
          while (q.val(`SELECT 1 FROM developers WHERE lower(code) = lower(?) AND deleted_at IS NULL`, code)) code = `${baseCode.slice(0, 8)}${++n}`
          const createdDev = createRecord(developerDef(), { code, name: devName, emirate: b.emirate || 'Dubai', active: true }, req.ctx)
          devRef = createdDev.id
        }
      }

      // 2. Resolve or create Community
      let commRef: number | null = b.community_id ?? null
      let commName = (b.community_name || '').trim()
      if (commRef) {
        const existingComm = q.get<{ id: number; name: string }>(`SELECT id, name FROM communities WHERE id = ? AND deleted_at IS NULL`, commRef)
        if (existingComm) commName = existingComm.name
        else commRef = null
      }
      if (!commRef && commName) {
        const match = q.get<{ id: number; name: string }>(`SELECT id, name FROM communities WHERE lower(name) = lower(?) AND deleted_at IS NULL LIMIT 1`, commName)
        if (match) {
          commRef = match.id
          commName = match.name
        } else if (can(req.user, 'masters', 'create')) {
          const baseCode = commName.replace(/[^A-Za-z0-9]+/g, '').toUpperCase().slice(0, 10) || 'COMM'
          let code = baseCode
          let n = 1
          while (q.val(`SELECT 1 FROM communities WHERE lower(code) = lower(?) AND deleted_at IS NULL`, code)) code = `${baseCode.slice(0, 8)}${++n}`
          const createdComm = createRecord(communityDef(), { code, name: commName, emirate: b.emirate || 'Dubai', area: b.emirate || 'Dubai', active: true }, req.ctx)
          commRef = createdComm.id
        }
      }

      const unitMinPrice = (b.units ?? []).map(u => u.sale_price ?? 0).filter(n => n > 0)
      const startingPrice = b.starting_price || (unitMinPrice.length ? Math.min(...unitMinPrice) : null)

      // 3. Create Off-Plan Project record
      const prop = createRecord(
        propertyDef(),
        {
          title: b.title,
          project_name: b.project_name || b.title.replace(/\s+by\s+.+$/i, '').trim() || b.title,
          emirate: b.emirate || 'Dubai',
          department_division: 'Sales of Off-Plan Projects',
          inventory_source_type: 'Direct Developer',
          property_type: normalizePropertyType(b.property_type),
          status: 'Off-Plan',
          launch_status: 'New Launch',
          seller_finance_status: 'Off-Plan Payment Plan (Oqood)',
          developer_ref: devRef,
          developer_id: devName || null,
          community_ref: commRef,
          community_id: commName || null,
          sub_community: b.sub_community || (!commRef && commName ? commName : null),
          building_name: b.building_name || b.title,
          furnishing: b.furnishing || 'Fully Furnished',
          tenure: b.tenure || 'Freehold',
          bedrooms: b.bedrooms ?? b.units?.[0]?.bedrooms ?? null,
          bathrooms: b.bathrooms ?? b.units?.[0]?.bathrooms ?? null,
          area_sqft: b.area_sqft ?? b.units?.[0]?.area_sqft ?? null,
          price: startingPrice,
          roi_percent: b.roi_percent ?? 5,
          completion_year: b.completion_year ?? new Date().getFullYear() + 3,
          handover_quarter: b.handover_label || (b.completion_year ? `Q4 ${b.completion_year}` : null),
          payment_plan: b.payment_plan || '60/40',
          payment_plan_summary: b.payment_plan || '60/40 Construction-Linked',
          is_off_plan: true,
          is_exclusive: b.is_exclusive,
          rera_permit_no: b.rera_permit_no || null,
          permit_expiry: b.permit_expiry || null,
          address: [b.building_name || b.title, b.sub_community, commName || (b.emirate || 'Dubai'), 'UAE'].filter(Boolean).join(', '),
          description: b.description || `${b.title}${devName ? ` by ${devName}` : ''} — new ${b.emirate || 'Dubai'} off-plan launch${commName ? ` in ${commName}` : ''}.`,
          features: b.features || null,
          amenities: b.amenities || null,
          video_url: b.video_url || null,
          virtual_tour_url: b.virtual_tour_url || null,
          model_3d_url: b.model_3d_url || null,
          floor_plan_url: b.floor_plan_url || null,
          brochure_url: b.brochure_url || null,
          ppt_url: b.ppt_url || null,
          payment_plan_pdf_url: b.payment_plan_pdf_url || null,
          media: mediaList,
          listed_date: todayStr(),
          active: true,
        },
        req.ctx,
      )

      // 4. Create Unit Typologies / Units
      const createdUnits: any[] = []
      for (const u of b.units ?? []) {
        const unit = createRecord(
          unitDef(),
          {
            unit_no: u.unit_no,
            property_id: prop.id,
            unit_type: u.unit_type || 'Residential',
            status: 'Available',
            bedrooms: u.bedrooms ?? null,
            bathrooms: u.bathrooms ?? null,
            area_sqft: u.area_sqft ?? null,
            sale_price: u.sale_price ?? startingPrice ?? null,
            floor_no: u.floor_no ?? null,
            view: u.view || null,
            furnishing: u.furnishing || b.furnishing || 'Fully Furnished',
            floor_plan_url: u.floor_plan_url || b.floor_plan_url || null,
            virtual_tour_url: u.virtual_tour_url || b.virtual_tour_url || null,
            video_url: u.video_url || b.video_url || null,
            active: true,
          },
          req.ctx,
        )
        createdUnits.push(unit)
      }

      // 5. Optional: Publish to Website Studio (`website_listings` + `website_promotions`)
      let websiteListing: any = null
      let websitePromotion: any = null
      if (b.publish_to_website) {
        const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        const baseSlug = slugify(`${b.title}-${devName || commName || 'dubai'}`).slice(0, 80) || `launch-${prop.id}`
        let slug = baseSlug
        let n = 1
        while (q.val(`SELECT 1 FROM website_listings WHERE slug = ? AND deleted_at IS NULL`, slug)) slug = `${baseSlug}-${++n}`
        const baseRef = `SWK-OP-${new Date().getFullYear()}-${prop.id}`
        let reference = baseRef
        let rn = 1
        while (q.val(`SELECT 1 FROM website_listings WHERE reference = ? AND deleted_at IS NULL`, reference)) reference = `${baseRef}-${++rn}`
        const cover = coverPhotoUrl(mediaList) || '/media/properties/business-bay-executive-tower-2.webp'
        const webType = ['Apartment', 'Villa', 'Townhouse', 'Penthouse', 'Duplex', 'Office'].includes(b.property_type)
          ? b.property_type
          : 'Apartment'

        const wlPayload = {
          reference,
          slug,
          title: b.title,
          subtitle: b.subtitle || `${devName ? `${devName} · ` : ''}${commName || 'Dubai'} · ${b.payment_plan || 'Flexible Developer Payment Plan'}`,
          purpose: 'off-plan',
          status: 'available',
          property_type: webType,
          published: true,
          hot_offer: b.hot_offer,
          badge: 'New Launch',
          sort_order: b.hot_offer ? 1 : 20,
          community: commName || 'Dubai',
          community_slug: slugify(commName || 'dubai'),
          building: b.building_name || b.title,
          developer: devName || 'Master Developer',
          developer_slug: slugify(devName || 'developer'),
          price_aed: startingPrice || 0,
          bedrooms: b.bedrooms ?? b.units?.[0]?.bedrooms ?? 1,
          bathrooms: b.bathrooms ?? b.units?.[0]?.bathrooms ?? 2,
          area_sqft: b.area_sqft ?? b.units?.[0]?.area_sqft ?? 0,
          furnished: b.furnishing === 'Unfurnished' ? 'Unfurnished' : b.furnishing === 'Semi-Furnished' ? 'Partly furnished' : 'Furnished',
          completion: 'Off-Plan',
          handover: b.handover_label || (b.completion_year ? `Q4 ${b.completion_year}` : '2029'),
          payment_plan: b.payment_plan || null,
          down_payment_pct: b.down_payment_pct ?? 10,
          agent_slug: 'mohammad-haseeb',
          image_url: cover,
          video_url: b.video_url || null,
          virtual_tour_url: b.virtual_tour_url || null,
          model_3d_url: b.model_3d_url || null,
          floor_plan_url: b.floor_plan_url || null,
          brochure_url: b.brochure_url || null,
          description: b.description || `${b.title}${devName ? ` by ${devName}` : ''}`,
          features: [b.features, b.amenities].filter(Boolean).join('\n'),
          listed_at: todayStr(),
          media: mediaList,
        }
        assertZeroShabibPublicPayload(wlPayload, 'Developer Project Launch Website Listing')
        websiteListing = createRecord(getDef('website_listings'), wlPayload, req.ctx)

        if (b.create_spotlight) {
          const promoPayload = {
            title: b.title,
            short_title: b.title.split(/\s+/).slice(0, 3).join(' '),
            eyebrow: `NEW LAUNCH · ${(devName || commName || 'DUBAI').toUpperCase()}`,
            tab: 'off-plan',
            active: true,
            sort_order: 1,
            developer: devName || '',
            community: commName || 'Dubai',
            price_guide: startingPrice ? `From AED ${Math.round(startingPrice).toLocaleString('en-US')}` : 'Prices On Request',
            plan_highlight: `${b.payment_plan || 'Direct Developer Plan'} · 0% Buyer Fee`,
            image: cover,
            href: `/properties/${slug}`,
            benefits: [b.features, b.amenities].filter(Boolean).join('\n').split(/\r?\n|,/).map(s => s.trim()).filter(Boolean).slice(0, 5).join('\n'),
          }
          assertZeroShabibPublicPayload(promoPayload, 'Developer Project Launch Promotion')
          websitePromotion = createRecord(getDef('website_promotions'), promoPayload, req.ctx)
        }
      }

      return { property: prop, units: createdUnits, websiteListing, websitePromotion, developerId: devRef, communityId: commRef }
    })

    return result
  })

  // Legacy property/unit media upload/delete endpoints (preserved for backwards compatibility)
  app.post('/api/properties/:id/media', async (req) => {
    const { id } = loadProperty(req, true)
    const b = z.object({ url: z.string().min(4), caption: z.string().max(200).optional(), order: z.number().int().min(0).optional(), kind: z.enum(['photo', 'video', 'tour3d', 'floorplan', 'brochure']).optional() }).parse(req.body)
    if (!isSafeMediaUrl(b.url)) throw bad('Invalid media URL')
    const prop = getRecord(propertyDef(), id, req.ctx)
    const media = normalizeMediaList(prop.media)
    media.push({ id: `m-${crypto.randomBytes(4).toString('hex')}`, kind: b.kind ?? 'photo', url: b.url, caption: b.caption, order: b.order ?? media.length, created_at: nowIso() })
    return patchRecord(propertyDef(), id, { media: normalizeMediaList(media) }, req.ctx)
  })

  app.delete('/api/properties/:id/media/:mediaId', async (req) => {
    const { id } = loadProperty(req, true)
    const mediaId = idOf((req.params as any).mediaId)
    const prop = getRecord(propertyDef(), id, req.ctx)
    const media = normalizeMediaList(prop.media)
    const filtered = media.filter((_, i) => i !== mediaId)
    return patchRecord(propertyDef(), id, { media: filtered }, req.ctx)
  })

  app.post('/api/units/:id/media', async (req) => {
    const { id } = loadUnit(req, true)
    const b = z.object({ url: z.string().min(4), caption: z.string().max(200).optional(), order: z.number().int().min(0).optional(), kind: z.enum(['photo', 'video', 'tour3d', 'floorplan', 'brochure']).optional() }).parse(req.body)
    if (!isSafeMediaUrl(b.url)) throw bad('Invalid media URL')
    const unit = getRecord(unitDef(), id, req.ctx)
    const media = normalizeMediaList(unit.media)
    media.push({ id: `m-${crypto.randomBytes(4).toString('hex')}`, kind: b.kind ?? 'photo', url: b.url, caption: b.caption, order: b.order ?? media.length, created_at: nowIso() })
    return patchRecord(unitDef(), id, { media: normalizeMediaList(media) }, req.ctx)
  })

  app.delete('/api/units/:id/media/:mediaId', async (req) => {
    const { id } = loadUnit(req, true)
    const mediaId = idOf((req.params as any).mediaId)
    const unit = getRecord(unitDef(), id, req.ctx)
    const media = normalizeMediaList(unit.media)
    const filtered = media.filter((_, i) => i !== mediaId)
    return patchRecord(unitDef(), id, { media: filtered }, req.ctx)
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