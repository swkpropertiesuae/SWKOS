import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { q } from '../db'
import { canAccessSocialMediaSuite } from '../../shared/swk-staff-access'
import { audit, getDef } from '../engine'
import { notify } from '../notify'
import { loadSettings } from '../settings'
import { bad, forbidden, notFound, nowIso, todayStr } from '../util'
import { idOf } from './helpers'

function assertSocialAccess(req: any) {
  if (!canAccessSocialMediaSuite(req.user)) {
    throw forbidden('Social Media Management Suite is restricted to Owner, Admin, Operations Manager (Haseeb), and Office Admin (Meenakshi).')
  }
}

function findUserByEmails(emails: string[]): { id: number; name: string; email: string } | null {
  for (const em of emails) {
    const row = q.get<{ id: number; name: string; email: string }>(
      `SELECT id, name, email FROM users WHERE lower(email) = ? AND deleted_at IS NULL LIMIT 1`,
      em.toLowerCase(),
    )
    if (row) return row
  }
  return null
}

function findMeenakshi() {
  return (
    findUserByEmails(['meenakshi@swk.properties', 'meenakshi@swk.property', 'meenakshi@swkpropertiesuae.com']) ??
    q.get<{ id: number; name: string; email: string }>(
      `SELECT id, name, email FROM users WHERE lower(name) LIKE '%meenakshi%' AND deleted_at IS NULL LIMIT 1`,
    ) ??
    null
  )
}

function findOwner() {
  return findUserByEmails(['shabib@swk.properties', 'shabib@swk.property', 'shabib@swkpropertiesuae.com'])
}

function ensureDefaultProfiles(creatorId: number | null) {
  const existing = q.val<number>(`SELECT COUNT(*) FROM social_profiles WHERE deleted_at IS NULL`) ?? 0
  if (existing > 0) return
  const meenakshi = findMeenakshi()
  const now = nowIso()
  const defaults = [
    { platform: 'Instagram', account_name: 'SWK Properties Dubai', handle: '@swkpropertiesuae', profile_url: 'https://instagram.com/swkpropertiesuae', bio: 'Premier Dubai Real Estate Brokerage · RERA ORN 51517 · Luxury Sales, Off-Plan & Leasing', posting_cadence: 'Daily Reels & Carousels (30/mo)', target_audience: 'HNWIs, GCC & International Investors, Dubai End-Users' },
    { platform: 'Facebook', account_name: 'SWK Properties LLC', handle: 'swkpropertiesuae', profile_url: 'https://facebook.com/swkpropertiesuae', bio: 'Dubai Land Department Licensed Brokerage · Off-Plan, Secondary Sales & Portfolio Management', posting_cadence: 'Daily Listings & Market Pulse', target_audience: 'UAE Families, Expats & Overseas Investors' },
    { platform: 'LinkedIn', account_name: 'SWK Properties L.L.C.', handle: 'company/swk-properties-dubai', profile_url: 'https://linkedin.com/company/swk-properties-dubai', bio: 'Institutional Dubai Real Estate Advisory · Al Saqr Business Tower, Sheikh Zayed Road', posting_cadence: '4x Weekly Market Intelligence', target_audience: 'C-Suite Executives, Family Offices & Institutional Buyers' },
    { platform: 'TikTok', account_name: 'SWK Dubai Homes', handle: '@swkproperties', profile_url: 'https://tiktok.com/@swkproperties', bio: 'Walkthroughs of Dubai Creek Harbour, Downtown, Marina & JVC residences', posting_cadence: '5x Weekly Short Walkthroughs', target_audience: 'First-Time Buyers, Young Investors & Relocators' },
    { platform: 'YouTube Shorts', account_name: 'SWK Properties UAE', handle: '@swkpropertiesuae', profile_url: 'https://youtube.com/@swkpropertiesuae', bio: 'Dubai Community Tours, DLD Yield Briefings & New Launch Reviews', posting_cadence: '3x Weekly Property Tours', target_audience: 'Global Real Estate Investors Researching Dubai' },
  ]
  for (const p of defaults) {
    q.run(
      `INSERT INTO social_profiles(platform, account_name, handle, profile_url, bio, posting_cadence, target_audience, followers_count, status, assigned_to_user_id, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'Active', ?, ?, ?, ?)`,
      p.platform, p.account_name, p.handle, p.profile_url, p.bio, p.posting_cadence, p.target_audience, meenakshi?.id ?? null, creatorId, now, now,
    )
  }
}

const DEFAULT_PILLARS = [
  'Luxury Listing Showcase',
  'Dubai Market Insight & DLD Data',
  'Off-Plan Launch Spotlight',
  'Investor ROI & Rental Yield',
  'Client Handover & Testimonial',
  'Dubai Community Guide',
  'SWK Advisory & Behind the Scenes',
]

const THIRTY_DAY_BLUEPRINT: Array<{ pillar: string; angle: string; cta: string; tags: string }> = [
  { pillar: 'Luxury Listing Showcase', angle: 'Flagship Residence Walkthrough & Investment Highlights', cta: 'DM "VIP" or call +971 56 433 0448 for private viewing', tags: '#DubaiRealEstate #SWKProperties #LuxuryDubai #DubaiHomes' },
  { pillar: 'Dubai Market Insight & DLD Data', angle: 'Weekly DLD Transaction Velocity & Price-Per-SqFt Briefing', cta: 'Request the full SWK Dubai Market Brief via WhatsApp', tags: '#DLDData #DubaiPropertyMarket #InvestInDubai #SWKAdvisory' },
  { pillar: 'Off-Plan Launch Spotlight', angle: 'New Master Developer Release — 1% Monthly Payment Plan', cta: 'Book EOI priority allocation with SWK Off-Plan Desk', tags: '#DubaiOffPlan #NewLaunchDubai #Emaar #Sobha #SWKProperties' },
  { pillar: 'Investor ROI & Rental Yield', angle: 'High-Yield Communities Delivering 7.5%–9% Net Rental Returns', cta: 'Message us for a custom AED ROI & mortgage sheet', tags: '#DubaiROI #PassiveIncomeDubai #PropertyInvestment #SWK' },
  { pillar: 'Dubai Community Guide', angle: 'Why Global Buyers Choose Dubai Creek Harbour, Marina & JVC', cta: 'Save this guide & ask our area specialist for available units', tags: '#DubaiCreekHarbour #DubaiMarina #JVC #LivingInDubai' },
  { pillar: 'Client Handover & Testimonial', angle: 'Keys Handed Over — Seamless DLD Transfer & Ejari Registration', cta: 'Thinking of buying or selling? Start with a free valuation', tags: '#TitleDeed #DubaiHandover #RERABroker #SWKProperties' },
  { pillar: 'SWK Advisory & Behind the Scenes', angle: 'Golden Visa AED 2M Property Pathway Explained in 60 Seconds', cta: 'Speak with our RERA-certified advisor today (ORN 51517)', tags: '#UAEGoldenVisa #DubaiRelocation #SWKProperties #RERA' },
]

function addDaysIso(startIso: string, addDays: number): string {
  const base = new Date(`${startIso}T12:00:00Z`)
  if (Number.isNaN(base.getTime())) return todayStr()
  base.setUTCDate(base.getUTCDate() + addDays)
  return base.toISOString().slice(0, 10)
}

const ProfileSchema = z.object({
  platform: z.enum(['Instagram', 'Facebook', 'LinkedIn', 'TikTok', 'YouTube Shorts', 'X (Twitter)', 'WhatsApp Channel']),
  account_name: z.string().trim().min(2).max(120),
  handle: z.string().trim().min(1).max(120),
  profile_url: z.string().trim().max(300).optional().default(''),
  bio: z.string().max(600).optional().default(''),
  posting_cadence: z.string().max(120).optional().default('Daily (30/month)'),
  target_audience: z.string().max(240).optional().default(''),
  followers_count: z.number().int().min(0).optional().default(0),
  status: z.enum(['Active', 'Paused', 'Setup Pending']).optional().default('Active'),
  assigned_to_user_id: z.number().int().positive().nullable().optional(),
  notes: z.string().max(1000).optional().default(''),
})

const PostSchema = z.object({
  profile_id: z.number().int().positive().nullable().optional(),
  batch_label: z.string().trim().min(1).max(120).optional().default('Monthly Batch'),
  day_number: z.number().int().min(1).max(60).optional().default(1),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduled_time: z.string().regex(/^\d{2}:\d{2}$/).optional().default('11:00'),
  platform: z.string().trim().min(2).max(60),
  content_pillar: z.string().trim().min(2).max(120).optional().default('Luxury Listing Showcase'),
  title: z.string().trim().min(2).max(180),
  caption: z.string().max(5000).optional().default(''),
  hashtags: z.string().max(1000).optional().default(''),
  cta: z.string().max(400).optional().default(''),
  media_attachment_id: z.number().int().positive().nullable().optional(),
  media_url: z.string().max(500).optional().default(''),
  status: z.enum(['Draft', 'Ready for Handover', 'Handed Over to Meenakshi', 'Scheduled', 'Published', 'Paused']).optional().default('Draft'),
})

export default async function (app: FastifyInstance) {
  app.get('/api/social/overview', async (req) => {
    assertSocialAccess(req)
    ensureDefaultProfiles(req.user?.id ?? null)
    const qs = (req.query as Record<string, any>) ?? {}
    const statusFilter = String(qs.status || '').trim()
    const platformFilter = String(qs.platform || '').trim()
    const batchFilter = String(qs.batch || '').trim()

    const profiles = q.all<any>(
      `SELECT p.*, u.name AS assigned_name
       FROM social_profiles p
       LEFT JOIN users u ON u.id = p.assigned_to_user_id
       WHERE p.deleted_at IS NULL
       ORDER BY p.id ASC`,
    )

    const clauses = ['s.deleted_at IS NULL']
    const args: any[] = []
    if (statusFilter && statusFilter !== 'All') { clauses.push('s.status = ?'); args.push(statusFilter) }
    if (platformFilter && platformFilter !== 'All') { clauses.push('s.platform = ?'); args.push(platformFilter) }
    if (batchFilter && batchFilter !== 'All') { clauses.push('s.batch_label = ?'); args.push(batchFilter) }

    const posts = q.all<any>(
      `SELECT s.*,
              au.name AS assigned_name,
              hu.name AS handed_over_by_name,
              su.name AS submitted_by_name
       FROM social_posts s
       LEFT JOIN users au ON au.id = s.assigned_to_user_id
       LEFT JOIN users hu ON hu.id = s.handed_over_by
       LEFT JOIN users su ON su.id = s.submitted_by
       WHERE ${clauses.join(' AND ')}
       ORDER BY s.scheduled_date ASC, s.day_number ASC, s.id ASC
       LIMIT 360`,
      ...args,
    )

    const allCounts = q.all<{ status: string; n: number }>(
      `SELECT status, COUNT(*) AS n FROM social_posts WHERE deleted_at IS NULL GROUP BY status`,
    )
    const byStatus: Record<string, number> = {}
    for (const c of allCounts) byStatus[c.status] = Number(c.n)
    const batches = q
      .all<{ batch_label: string; n: number; min_date: string; max_date: string }>(
        `SELECT batch_label, COUNT(*) AS n, MIN(scheduled_date) AS min_date, MAX(scheduled_date) AS max_date
         FROM social_posts WHERE deleted_at IS NULL
         GROUP BY batch_label ORDER BY MAX(id) DESC`,
      )

    const s = loadSettings()
    const customPillars = Array.isArray(s.os_custom_options?.social_pillars) ? s.os_custom_options.social_pillars : []
    const pillars = [...new Set([...DEFAULT_PILLARS, ...customPillars])]

    return {
      profiles,
      posts,
      batches,
      pillars,
      meenakshi: findMeenakshi(),
      stats: {
        total: Object.values(byStatus).reduce((a, b) => a + b, 0),
        draft: (byStatus['Draft'] ?? 0) + (byStatus['Ready for Handover'] ?? 0),
        handedOver: byStatus['Handed Over to Meenakshi'] ?? 0,
        scheduled: byStatus['Scheduled'] ?? 0,
        published: byStatus['Published'] ?? 0,
      },
    }
  })

  // ---- Brand Profiles CRUD
  app.post('/api/social/profiles', async (req) => {
    assertSocialAccess(req)
    const b = ProfileSchema.parse(req.body)
    const meenakshi = findMeenakshi()
    const now = nowIso()
    const id = q.insert(
      `INSERT INTO social_profiles(platform, account_name, handle, profile_url, bio, posting_cadence, target_audience, followers_count, status, assigned_to_user_id, notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      b.platform, b.account_name, b.handle, b.profile_url || null, b.bio || null, b.posting_cadence || null, b.target_audience || null, b.followers_count, b.status, b.assigned_to_user_id ?? meenakshi?.id ?? null, b.notes || null, req.user?.id ?? null, now, now,
    )
    audit(req.ctx, getDef('branches'), id, 'social_profile_create', { platform: [null, b.platform], handle: [null, b.handle] }, `${b.platform} ${b.handle}`)
    return q.get(`SELECT * FROM social_profiles WHERE id = ?`, id)
  })

  app.put('/api/social/profiles/:id', async (req) => {
    assertSocialAccess(req)
    const id = idOf((req.params as any).id)
    const cur = q.get<any>(`SELECT * FROM social_profiles WHERE id = ? AND deleted_at IS NULL`, id)
    if (!cur) throw notFound('Social profile not found')
    const b = ProfileSchema.partial().parse(req.body)
    q.run(
      `UPDATE social_profiles
       SET platform = ?, account_name = ?, handle = ?, profile_url = ?, bio = ?, posting_cadence = ?, target_audience = ?, followers_count = ?, status = ?, assigned_to_user_id = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
      b.platform ?? cur.platform,
      b.account_name ?? cur.account_name,
      b.handle ?? cur.handle,
      b.profile_url !== undefined ? b.profile_url : cur.profile_url,
      b.bio !== undefined ? b.bio : cur.bio,
      b.posting_cadence !== undefined ? b.posting_cadence : cur.posting_cadence,
      b.target_audience !== undefined ? b.target_audience : cur.target_audience,
      b.followers_count !== undefined ? b.followers_count : cur.followers_count,
      b.status ?? cur.status,
      b.assigned_to_user_id !== undefined ? b.assigned_to_user_id : cur.assigned_to_user_id,
      b.notes !== undefined ? b.notes : cur.notes,
      nowIso(),
      id,
    )
    return q.get(`SELECT * FROM social_profiles WHERE id = ?`, id)
  })

  app.delete('/api/social/profiles/:id', async (req) => {
    assertSocialAccess(req)
    const id = idOf((req.params as any).id)
    q.run(`UPDATE social_profiles SET deleted_at = ?, updated_at = ? WHERE id = ?`, nowIso(), nowIso(), id)
    return { ok: true }
  })

  // ---- Posts CRUD
  app.post('/api/social/posts', async (req) => {
    assertSocialAccess(req)
    const b = PostSchema.parse(req.body)
    const meenakshi = findMeenakshi()
    const now = nowIso()
    const id = q.insert(
      `INSERT INTO social_posts(profile_id, batch_label, day_number, scheduled_date, scheduled_time, platform, content_pillar, title, caption, hashtags, cta, media_attachment_id, media_url, status, assigned_to_user_id, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      b.profile_id ?? null, b.batch_label, b.day_number, b.scheduled_date, b.scheduled_time, b.platform, b.content_pillar, b.title, b.caption, b.hashtags, b.cta, b.media_attachment_id ?? null, b.media_url || null, b.status, meenakshi?.id ?? null, req.user?.id ?? null, now, now,
    )
    audit(req.ctx, getDef('branches'), id, 'social_post_create', { platform: [null, b.platform], date: [null, b.scheduled_date] }, b.title)
    return q.get(`SELECT * FROM social_posts WHERE id = ?`, id)
  })

  app.put('/api/social/posts/:id', async (req) => {
    assertSocialAccess(req)
    const id = idOf((req.params as any).id)
    const cur = q.get<any>(`SELECT * FROM social_posts WHERE id = ? AND deleted_at IS NULL`, id)
    if (!cur) throw notFound('Social post not found')
    const b = PostSchema.partial().parse(req.body)
    q.run(
      `UPDATE social_posts
       SET profile_id = ?, batch_label = ?, day_number = ?, scheduled_date = ?, scheduled_time = ?, platform = ?, content_pillar = ?, title = ?, caption = ?, hashtags = ?, cta = ?, media_attachment_id = ?, media_url = ?, status = ?, updated_at = ?
       WHERE id = ?`,
      b.profile_id !== undefined ? b.profile_id : cur.profile_id,
      b.batch_label ?? cur.batch_label,
      b.day_number ?? cur.day_number,
      b.scheduled_date ?? cur.scheduled_date,
      b.scheduled_time ?? cur.scheduled_time,
      b.platform ?? cur.platform,
      b.content_pillar ?? cur.content_pillar,
      b.title ?? cur.title,
      b.caption !== undefined ? b.caption : cur.caption,
      b.hashtags !== undefined ? b.hashtags : cur.hashtags,
      b.cta !== undefined ? b.cta : cur.cta,
      b.media_attachment_id !== undefined ? b.media_attachment_id : cur.media_attachment_id,
      b.media_url !== undefined ? b.media_url : cur.media_url,
      b.status ?? cur.status,
      nowIso(),
      id,
    )
    return q.get(`SELECT * FROM social_posts WHERE id = ?`, id)
  })

  app.delete('/api/social/posts/:id', async (req) => {
    assertSocialAccess(req)
    const id = idOf((req.params as any).id)
    q.run(`UPDATE social_posts SET deleted_at = ?, updated_at = ? WHERE id = ?`, nowIso(), nowIso(), id)
    return { ok: true }
  })

  // ---- 1-Click 30-Day Batch Content Calendar Generator (Create whole month in 1 sitting!)
  app.post('/api/social/generate-30-days', async (req) => {
    assertSocialAccess(req)
    ensureDefaultProfiles(req.user?.id ?? null)
    const b = z.object({
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(todayStr()),
      batch_label: z.string().trim().min(2).max(120).optional(),
      platforms: z.array(z.string().trim().min(2).max(60)).min(1).max(7).default(['Instagram', 'Facebook', 'LinkedIn', 'TikTok']),
      posting_time: z.string().regex(/^\d{2}:\d{2}$/).default('11:00'),
      focus_communities: z.string().trim().max(240).optional().default('Dubai Creek Harbour, Business Bay, Downtown Dubai, Dubai Marina & JVC'),
      days: z.number().int().min(7).max(31).default(30),
    }).parse(req.body ?? {})

    const batchLabel = b.batch_label || `${b.start_date.slice(0, 7)} · 30-Day Campaign`
    const meenakshi = findMeenakshi()
    const profiles = q.all<{ id: number; platform: string }>(`SELECT id, platform FROM social_profiles WHERE deleted_at IS NULL`)
    const profileByPlat = new Map<string, number>()
    for (const p of profiles) if (!profileByPlat.has(p.platform)) profileByPlat.set(p.platform, p.id)

    const communities = b.focus_communities.split(',').map(x => x.trim()).filter(Boolean)
    const now = nowIso()
    const createdIds: number[] = []

    for (let day = 1; day <= b.days; day++) {
      const schedDate = addDaysIso(b.start_date, day - 1)
      const platform = b.platforms[(day - 1) % b.platforms.length]!
      const bp = THIRTY_DAY_BLUEPRINT[(day - 1) % THIRTY_DAY_BLUEPRINT.length]!
      const community = communities.length ? communities[(day - 1) % communities.length]! : 'Dubai'
      const title = `Day ${String(day).padStart(2, '0')} · ${community} — ${bp.pillar}`
      const caption = `${bp.angle} in ${community}.\n\nExplore verified RERA-listed residences and off-plan investment opportunities curated by SWK Properties L.L.C. (RERA ORN 51517 · Al Saqr Business Tower, Sheikh Zayed Road).\n\n${bp.cta}`

      const id = q.insert(
        `INSERT INTO social_posts(profile_id, batch_label, day_number, scheduled_date, scheduled_time, platform, content_pillar, title, caption, hashtags, cta, status, assigned_to_user_id, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?, ?)`,
        profileByPlat.get(platform) ?? null,
        batchLabel,
        day,
        schedDate,
        b.posting_time,
        platform,
        bp.pillar,
        title,
        caption,
        bp.tags,
        bp.cta,
        meenakshi?.id ?? null,
        req.user?.id ?? null,
        now,
        now,
      )
      createdIds.push(id)
    }

    audit(
      req.ctx,
      getDef('branches'),
      createdIds[0] ?? 0,
      'social_batch_generate',
      { batch: [null, batchLabel], days: [0, createdIds.length] },
      `Generated ${createdIds.length}-day social batch: ${batchLabel}`,
    )

    return { ok: true, batch_label: batchLabel, created_count: createdIds.length, ids: createdIds }
  })

  // ---- 1-Click Handover to Meenakshi for Submission & Publishing
  app.post('/api/social/handover', async (req) => {
    assertSocialAccess(req)
    const b = z.object({
      batch_label: z.string().trim().optional(),
      post_ids: z.array(z.number().int().positive()).optional(),
      handover_note: z.string().max(600).optional().default(''),
    }).parse(req.body ?? {})

    const meenakshi = findMeenakshi()
    const now = nowIso()

    let targets: Array<{ id: number; batch_label: string }> = []
    if (b.post_ids?.length) {
      const ph = b.post_ids.map(() => '?').join(',')
      targets = q.all(`SELECT id, batch_label FROM social_posts WHERE id IN (${ph}) AND deleted_at IS NULL`, ...b.post_ids)
    } else if (b.batch_label) {
      targets = q.all(
        `SELECT id, batch_label FROM social_posts WHERE batch_label = ? AND status IN ('Draft', 'Ready for Handover') AND deleted_at IS NULL`,
        b.batch_label,
      )
    } else {
      targets = q.all(
        `SELECT id, batch_label FROM social_posts WHERE status IN ('Draft', 'Ready for Handover') AND deleted_at IS NULL`,
      )
    }

    if (!targets.length) throw bad('No draft posts found to hand over to Meenakshi.')

    for (const t of targets) {
      q.run(
        `UPDATE social_posts
         SET status = 'Handed Over to Meenakshi',
             assigned_to_user_id = ?,
             handed_over_by = ?,
             handed_over_at = ?,
             submission_notes = CASE WHEN ? <> '' THEN ? ELSE submission_notes END,
             updated_at = ?
         WHERE id = ?`,
        meenakshi?.id ?? null,
        req.user?.id ?? null,
        now,
        b.handover_note,
        b.handover_note,
        now,
        t.id,
      )
    }

    const batchName = b.batch_label || targets[0]!.batch_label
    if (meenakshi) {
      notify(
        meenakshi.id,
        `Social Media Handover: ${targets.length} scheduled posts ready`,
        `${req.user?.name || 'Owner'} handed over "${batchName}" (${targets.length} posts) to you for scheduling & publishing.${b.handover_note ? ` Note: ${b.handover_note}` : ''}`,
        '/social-media',
      )
    }

    audit(
      req.ctx,
      getDef('branches'),
      targets[0]!.id,
      'social_handover_meenakshi',
      { count: [0, targets.length], assignee: [null, meenakshi?.email ?? 'meenakshi@swk.properties'] },
      `Handed over ${targets.length} social posts (${batchName}) to Meenakshi`,
    )

    return {
      ok: true,
      handed_over_count: targets.length,
      assigned_to: meenakshi ?? { name: 'Meenakshi', email: 'meenakshi@swk.properties' },
      batch_label: batchName,
    }
  })

  // ---- Meenakshi Submission / Publishing Action
  app.post('/api/social/posts/:id/submit', async (req) => {
    assertSocialAccess(req)
    const id = idOf((req.params as any).id)
    const cur = q.get<any>(`SELECT * FROM social_posts WHERE id = ? AND deleted_at IS NULL`, id)
    if (!cur) throw notFound('Social post not found')
    const b = z.object({
      status: z.enum(['Scheduled', 'Published']),
      published_url: z.string().trim().max(500).optional().default(''),
      submission_notes: z.string().trim().max(800).optional().default(''),
    }).parse(req.body ?? {})

    const now = nowIso()
    q.run(
      `UPDATE social_posts
       SET status = ?, published_url = ?, submission_notes = ?, submitted_by = ?, submitted_at = ?, updated_at = ?
       WHERE id = ?`,
      b.status,
      b.published_url || cur.published_url || null,
      b.submission_notes || cur.submission_notes || null,
      req.user?.id ?? null,
      now,
      now,
      id,
    )

    const owner = findOwner()
    if (owner && owner.id !== req.user?.id) {
      notify(
        owner.id,
        `Social Post ${b.status}: ${cur.title}`,
        `${req.user?.name || 'Meenakshi'} marked Day ${cur.day_number} (${cur.platform} · ${cur.scheduled_date}) as ${b.status}.${b.published_url ? ` Live URL: ${b.published_url}` : ''}`,
        '/social-media',
      )
    }

    audit(
      req.ctx,
      getDef('branches'),
      id,
      'social_post_submit',
      { status: [cur.status, b.status], url: [cur.published_url, b.published_url || null] },
      cur.title,
    )

    return q.get(`SELECT * FROM social_posts WHERE id = ?`, id)
  })
}
