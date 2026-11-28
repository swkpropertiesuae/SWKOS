/**
 * SWK OS — Customise UI Preferences API (Per-User Sync + Owner Company Default)
 *
 * Mounted under `/api/auth/ui-preferences*` so both internal staff (all roles) and
 * Customer Portal users can read/save their own visual & pin preferences cleanly.
 *
 * Security invariants:
 *  - Strict Zod validation rejects malformed colors, out-of-range numbers, or unsafe paths.
 *  - Server-side RBAC strips any pinned route or highlighted app key the caller cannot access.
 *  - Company Default (`ui:company_default_json` in `settings`) is restricted exclusively to
 *    Owner Shabib Siraj (and Demo Admin inside isolated demo mode) and stores ONLY visual
 *    theme settings (`UiThemeConfig`) — NEVER personal pins or Owner-only app keys.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { inDemo, q } from '../db'
import { can } from '../engine'
import { forbidden, nowIso, safeJson } from '../util'
import { ENTITIES } from '../../shared/entities'
import { isOwnerSwkUser } from '../../shared/swk-staff-access'
import {
  DEFAULT_UI_PINNING,
  DEFAULT_UI_THEME,
  UI_FONT_CATALOG,
  filterPinningForUser,
  resolveUiCustomization,
  sanitizeUiPinning,
  sanitizeUiTheme,
  type StoredUserUiPrefs,
  type UiPinningPrefs,
  type UiThemeConfig,
} from '../../shared/ui-customization'

const COMPANY_DEFAULT_KEY = 'ui:company_default_json'

const hex6 = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a 6-digit hex value like #d4a955')
const fontKeys = UI_FONT_CATALOG.map(f => f.key) as [string, ...string[]]

const themeSchema = z
  .object({
    presetId: z.string().trim().regex(/^[a-z0-9_-]{1,40}$/i).default('custom'),
    mode: z.enum(['light', 'dark', 'custom']).default('light'),
    colors: z
      .object({
        background: hex6,
        backgroundAlt: hex6,
        bgStyle: z.enum(['solid', 'gradient', 'mesh']),
        cardBg: hex6,
        glossCardBg: hex6,
        headerBg: hex6,
        sidebarBg: hex6,
        textPrimary: hex6,
        textBody: hex6,
        textMuted: hex6,
        buttonBg: hex6,
        buttonText: hex6,
        borderColor: hex6,
        accentColor: hex6,
        highlightColor: hex6,
        highlightBg: hex6,
      })
      .strict(),
    typography: z
      .object({
        bodyFont: z.enum(fontKeys),
        headingFont: z.enum(fontKeys),
        monoFont: z.enum(fontKeys),
        fontSizePx: z.number().int().min(12).max(20),
        headingScale: z.number().min(0.85).max(1.3),
        fontWeight: z.enum(['400', '500', '600', '700']),
        fontStyle: z.enum(['normal', 'italic']),
        letterSpacing: z.enum(['tight', 'normal', 'wide']),
        uppercaseHeadings: z.boolean(),
      })
      .strict(),
    layout: z
      .object({
        density: z.enum(['compact', 'comfortable', 'spacious']),
        cardRadiusPx: z.number().int().min(8).max(32),
        shadowStrength: z.enum(['none', 'soft', 'elevated']),
        showWatermark: z.boolean(),
      })
      .strict(),
    highlight: z
      .object({
        enabled: z.boolean(),
        intensity: z.enum(['off', 'subtle', 'vivid']),
        buttonShimmer: z.boolean(),
        focusRingGlow: z.boolean(),
      })
      .strict(),
  })
  .strict()

const pinnedItemSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(48),
    to: z
      .string()
      .trim()
      .regex(/^\/[a-zA-Z0-9/_?=&%-]{0,180}$/, 'Route must be an internal path starting with /')
      .refine(p => !p.startsWith('//') && !p.startsWith('/print') && p !== '/login', 'Disallowed route'),
    icon: z.string().trim().regex(/^[a-zA-Z0-9_-]{1,36}$/).optional(),
    highlighted: z.boolean().optional(),
    accentColor: hex6.optional(),
  })
  .strict()

const pinningPartialSchema = z
  .object({
    dockPosition: z.enum(['top', 'bottom', 'left', 'right', 'hidden']).optional(),
    pinnedItems: z.array(pinnedItemSchema).max(24).optional(),
    appOrder: z.array(z.string().trim().regex(/^[a-z0-9_-]{1,32}$/)).max(40).optional(),
    highlightedAppKeys: z.array(z.string().trim().regex(/^[a-z0-9_-]{1,32}$/)).max(20).optional(),
    floatingPad: z
      .object({
        enabled: z.boolean().optional(),
        collapsed: z.boolean().optional(),
        xPct: z.number().min(1).max(95).optional(),
        yPct: z.number().min(8).max(90).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

const putUserPrefsSchema = z
  .object({
    theme: themeSchema.nullable().optional(),
    pinning: pinningPartialSchema.optional(),
  })
  .strict()

function canManageCompanyDefault(user: any): boolean {
  if (!user || user.party_id) return false
  if (isOwnerSwkUser(user)) return true
  return inDemo() && String(user.email || '').trim().toLowerCase() === 'demo@swkpropertiesuae.com'
}

function readCompanyDefault(): UiThemeConfig | null {
  try {
    const raw = q.val<string>(`SELECT value FROM settings WHERE key = ?`, COMPANY_DEFAULT_KEY)
    if (!raw) return null
    const parsed = safeJson<unknown>(raw, null)
    if (!parsed || typeof parsed !== 'object') return null
    return sanitizeUiTheme(parsed, DEFAULT_UI_THEME)
  } catch {
    return null
  }
}

function readUserRow(userId: number): StoredUserUiPrefs {
  try {
    const raw = q.val<string>(`SELECT prefs_json FROM user_ui_preferences WHERE user_id = ?`, userId)
    if (!raw) return { version: 1, theme: null, pinning: structuredClone(DEFAULT_UI_PINNING) }
    const parsed = safeJson<any>(raw, null)
    if (!parsed || typeof parsed !== 'object') {
      return { version: 1, theme: null, pinning: structuredClone(DEFAULT_UI_PINNING) }
    }
    return {
      version: 1,
      theme: parsed.theme ? sanitizeUiTheme(parsed.theme, DEFAULT_UI_THEME) : null,
      pinning: sanitizeUiPinning(parsed.pinning, DEFAULT_UI_PINNING),
    }
  } catch {
    return { version: 1, theme: null, pinning: structuredClone(DEFAULT_UI_PINNING) }
  }
}

function writeUserRow(userId: number, data: StoredUserUiPrefs) {
  const now = nowIso()
  q.run(
    `INSERT INTO user_ui_preferences (user_id, prefs_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET prefs_json = excluded.prefs_json, updated_at = excluded.updated_at`,
    userId,
    JSON.stringify(data),
    now,
  )
}

const lookupEntityModule = (key: string) => ENTITIES[key]?.module

function buildPayload(user: any, strippedCount = 0) {
  const companyDefault = readCompanyDefault()
  const stored = readUserRow(user.id)
  const canFn = (mod: string, act: 'view' = 'view') => can(user, mod, act)
  const filtered = filterPinningForUser(stored.pinning, user, canFn, lookupEntityModule)
  const effectivePrefs = resolveUiCustomization(companyDefault, stored.theme, filtered.pinning)
  return {
    ok: true,
    isOwner: canManageCompanyDefault(user),
    hasPersonalTheme: stored.theme !== null,
    hasCompanyDefault: companyDefault !== null,
    companyDefault,
    personalTheme: stored.theme,
    pinning: filtered.pinning,
    effectivePrefs,
    strippedCount: strippedCount + filtered.strippedCount,
  }
}

export default async function uiPreferencesRoutes(app: FastifyInstance) {
  app.get('/api/auth/ui-preferences', async req => {
    const u = req.user!
    return buildPayload(u)
  })

  app.put('/api/auth/ui-preferences', async req => {
    const u = req.user!
    const parsed = putUserPrefsSchema.parse(req.body ?? {})
    const existing = readUserRow(u.id)
    const canFn = (mod: string, act: 'view' = 'view') => can(u, mod, act)

    let nextTheme = existing.theme
    if (parsed.theme === null) {
      nextTheme = null
    } else if (parsed.theme !== undefined) {
      nextTheme = sanitizeUiTheme(parsed.theme, DEFAULT_UI_THEME)
    }

    let nextPinning: UiPinningPrefs = existing.pinning
    let strippedCount = 0
    if (parsed.pinning !== undefined) {
      const mergedRaw: UiPinningPrefs = {
        dockPosition: parsed.pinning.dockPosition ?? existing.pinning.dockPosition,
        pinnedItems: (parsed.pinning.pinnedItems ?? existing.pinning.pinnedItems) as UiPinningPrefs['pinnedItems'],
        appOrder: parsed.pinning.appOrder ?? existing.pinning.appOrder,
        highlightedAppKeys: parsed.pinning.highlightedAppKeys ?? existing.pinning.highlightedAppKeys,
        floatingPad: {
          enabled: parsed.pinning.floatingPad?.enabled ?? existing.pinning.floatingPad.enabled,
          collapsed: parsed.pinning.floatingPad?.collapsed ?? existing.pinning.floatingPad.collapsed,
          xPct: parsed.pinning.floatingPad?.xPct ?? existing.pinning.floatingPad.xPct,
          yPct: parsed.pinning.floatingPad?.yPct ?? existing.pinning.floatingPad.yPct,
        },
      }
      const sanitized = sanitizeUiPinning(mergedRaw, existing.pinning)
      const filtered = filterPinningForUser(sanitized, u, canFn, lookupEntityModule)
      nextPinning = filtered.pinning
      strippedCount = filtered.strippedCount
    }

    writeUserRow(u.id, { version: 1, theme: nextTheme, pinning: nextPinning })
    return buildPayload(u, strippedCount)
  })

  app.delete('/api/auth/ui-preferences', async req => {
    const u = req.user!
    const qs = (req.query as Record<string, any>) ?? {}
    const scope = String(qs.scope || 'theme').toLowerCase()
    if (scope === 'all') {
      q.run(`DELETE FROM user_ui_preferences WHERE user_id = ?`, u.id)
    } else {
      const existing = readUserRow(u.id)
      writeUserRow(u.id, { version: 1, theme: null, pinning: existing.pinning })
    }
    return buildPayload(u)
  })

  app.put('/api/auth/ui-preferences/company-default', async req => {
    const u = req.user!
    if (!canManageCompanyDefault(u)) {
      throw forbidden('Only Owner Shabib Siraj can update the Company Default UI theme')
    }
    const raw = (req.body as any)?.theme ?? req.body ?? {}
    const validated = themeSchema.parse(raw)
    const clean = sanitizeUiTheme(validated, DEFAULT_UI_THEME)
    const now = nowIso()
    q.run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      COMPANY_DEFAULT_KEY,
      JSON.stringify(clean),
      now,
    )
    return buildPayload(u)
  })

  app.delete('/api/auth/ui-preferences/company-default', async req => {
    const u = req.user!
    if (!canManageCompanyDefault(u)) {
      throw forbidden('Only Owner Shabib Siraj can clear the Company Default UI theme')
    }
    q.run(`DELETE FROM settings WHERE key = ?`, COMPANY_DEFAULT_KEY)
    return buildPayload(u)
  })
}
