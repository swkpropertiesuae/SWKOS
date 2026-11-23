import { currentDb, inDemo, q } from '../db'
import { type SessionUser } from '../engine'
import { logIntegration } from '../integrations/log'
import { notifyLeadership } from '../notify'
import { decryptSecret, getSetting } from '../settings'
import { HttpError, nowIso, safeJson, todayStr } from '../util'
import { canAccessCrmVault } from '../../shared/swk-staff-access'
import { getOmniPreset, normalizeLane, OMNI_PRESETS, type OmniLane, type OmniTier } from './omni-catalog'
import { findPendingPlaceholderStart, restoreScrubbedPii, restoreValueWithPii, scrubMessages } from './pii-shield'

export interface ToolDef {
  name: string
  description: string
  parameters: any
}

export interface OmniMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null | any[]
  tool_calls?: any[]
  tool_call_id?: string
  name?: string
}

export interface OmniRequest {
  messages: OmniMessage[]
  lane?: OmniLane | 'auto'
  tools?: ToolDef[]
  modelOverride?: string
  maxTokens?: number
  temperature?: number
  confidential?: boolean
  zeroRetentionOnly?: boolean
  preferTier?: OmniTier
  user?: SessionUser | null
  bypassQuota?: boolean
  includeLegacyFallback?: boolean
  routeIdOverride?: number
  hasVisionContent?: boolean
  isVaultContext?: boolean
  timeoutMs?: number
  signal?: AbortSignal
}

export interface OmniResult {
  content: string
  tool_calls: { id: string; name: string; args: any }[]
  tokens: number
  model: string
  provider: string
  routeId: number | null
  routeLabel: string
  zeroRetention: boolean
  piiRedacted: number
  attempts: number
  lane: OmniLane
}

export interface OmniRouteRow {
  id: number
  label: string
  provider_key: string
  base_url: string
  api_key_enc: string
  model_id: string
  lanes_json: string
  tier: string
  priority: number
  zero_retention: number
  rpm_limit: number
  rpd_limit: number
  enabled: number
  cooldown_until: string | null
  last_error: string | null
  last_ok_at: string | null
  req_today: number
  tokens_today: number
  stats_date: string | null
  created_at: string
  updated_at: string
}

export interface ResolvedRoute {
  id: number
  isLegacy: boolean
  stateKey: string
  label: string
  provider_key: string
  base_url: string
  api_key: string
  has_key: boolean
  model_id: string
  lanes: OmniLane[]
  tier: OmniTier
  priority: number
  zero_retention: boolean
  rpm_limit: number
  rpd_limit: number
  enabled: boolean
  cooldown_until: string | null
  last_error: string | null
  last_ok_at: string | null
  req_today: number
  tokens_today: number
  stats_date: string | null
}

const MAX_FAILOVER_HOPS = 6

// ---------------------------------------------------------------------------
// Per-database in-memory sliding-window health & quota tracker
// ---------------------------------------------------------------------------
interface RouteRuntimeState {
  rpmTimestamps: number[]
  ewmaLatencyMs: number | null
  cooldownUntilMs: number
  consecutiveCooldowns: number
  lastError: string | null
  lastOkAt: string | null
}

interface HealthStore {
  routes: Map<string, RouteRuntimeState>
  userRpm: Map<number, number[]>
}

const stores = new WeakMap<object, HealthStore>()

function getStore(): HealthStore {
  const key = currentDb()
  let s = stores.get(key)
  if (!s) {
    s = { routes: new Map(), userRpm: new Map() }
    stores.set(key, s)
  }
  return s
}

function getRouteRuntime(stateKey: string): RouteRuntimeState {
  const store = getStore()
  let rt = store.routes.get(stateKey)
  if (!rt) {
    rt = { rpmTimestamps: [], ewmaLatencyMs: null, cooldownUntilMs: 0, consecutiveCooldowns: 0, lastError: null, lastOkAt: null }
    store.routes.set(stateKey, rt)
  }
  return rt
}

function recentRpmCount(rt: RouteRuntimeState, now = Date.now()): number {
  const cutoff = now - 60_000
  while (rt.rpmTimestamps.length && rt.rpmTimestamps[0]! < cutoff) rt.rpmTimestamps.shift()
  return rt.rpmTimestamps.length
}

function recordRpmHit(stateKey: string, now = Date.now()): void {
  const rt = getRouteRuntime(stateKey)
  recentRpmCount(rt, now)
  rt.rpmTimestamps.push(now)
}

function recordLatency(stateKey: string, elapsedMs: number): void {
  const rt = getRouteRuntime(stateKey)
  rt.ewmaLatencyMs = rt.ewmaLatencyMs === null ? elapsedMs : Math.round(0.7 * rt.ewmaLatencyMs + 0.3 * elapsedMs)
}

export function clearRouteHealthState(routeId: number): void {
  const store = getStore()
  store.routes.delete(`db:${routeId}`)
}

export function resetRouteCooldown(routeId: number): boolean {
  const existing = q.get<{ id: number }>(`SELECT id FROM ai_provider_routes WHERE id = ?`, routeId)
  if (!existing) return false
  q.run(`UPDATE ai_provider_routes SET cooldown_until = NULL, last_error = NULL, updated_at = ? WHERE id = ?`, nowIso(), routeId)
  const rt = getRouteRuntime(`db:${routeId}`)
  rt.cooldownUntilMs = 0
  rt.consecutiveCooldowns = 0
  rt.lastError = null
  return true
}

const utcToday = () => new Date().toISOString().slice(0, 10)

// ---------------------------------------------------------------------------
// Pool Loader (DB routes + implicit legacy primary/fallback settings)
// ---------------------------------------------------------------------------
const LEGACY_BASE_BY_KEY: Record<string, { base: string; model: string }> = {
  ...Object.fromEntries(OMNI_PRESETS.map(p => [p.key, { base: p.baseUrl, model: p.defaultModel }])),
  opencode: { base: 'https://opencode.ai/zen/v1', model: '' },
  gemini: { base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash' },
}

export function loadLegacyEndpoints(modelOverride?: string): { base: string; key: string; model: string; label: string; provider: string }[] {
  const out: { base: string; key: string; model: string; label: string; provider: string }[] = []
  const mk = (pre: string, label: string) => {
    const provider = String(getSetting(pre ? 'ai_fallback_provider' : 'ai_provider') || '').trim()
    if (!provider) return
    const p = LEGACY_BASE_BY_KEY[provider]
    const base = String(getSetting(pre ? 'ai_fallback_base_url' : 'ai_base_url') || p?.base || '')
      .trim()
      .replace(/\/+$/, '')
    const model = String((!pre && modelOverride) || getSetting(pre ? 'ai_fallback_model' : 'ai_model') || p?.model || '').trim()
    const key = String(getSetting(pre ? 'ai_fallback_api_key' : 'ai_api_key') || '').trim()
    if (base && model) out.push({ base, key, model, label, provider })
  }
  mk('', 'primary')
  mk('f', 'fallback')
  return out
}

function mapDbRowToResolved(r: OmniRouteRow): ResolvedRoute {
  const preset = getOmniPreset(r.provider_key)
  const lanesRaw = safeJson<string[]>(r.lanes_json, ['general'])
  const lanes = (Array.isArray(lanesRaw) && lanesRaw.length ? lanesRaw : ['general']).map(normalizeLane)
  const tier: OmniTier = r.tier === 'tier1' || r.tier === 'local' ? r.tier : 'free'
  const today = utcToday()
  const isSameDay = r.stats_date === today
  const decrypted = r.api_key_enc ? decryptSecret(r.api_key_enc).trim() : ''
  const rt = getRouteRuntime(`db:${r.id}`)
  const dbCooldownMs = r.cooldown_until ? Date.parse(r.cooldown_until) : 0
  const effCooldownMs = Math.max(Number.isFinite(dbCooldownMs) ? dbCooldownMs : 0, rt.cooldownUntilMs)

  return {
    id: r.id,
    isLegacy: false,
    stateKey: `db:${r.id}`,
    label: r.label,
    provider_key: r.provider_key,
    base_url: String(r.base_url || preset?.baseUrl || '').trim().replace(/\/+$/, ''),
    api_key: decrypted,
    has_key: Boolean(r.api_key_enc),
    model_id: String(r.model_id || preset?.defaultModel || '').trim(),
    lanes: [...new Set(lanes)],
    tier,
    priority: Number.isFinite(Number(r.priority)) ? Number(r.priority) : 100,
    zero_retention: Boolean(r.zero_retention),
    rpm_limit: Number(r.rpm_limit) || 30,
    rpd_limit: Number(r.rpd_limit) || 1000,
    enabled: Boolean(r.enabled),
    cooldown_until: effCooldownMs > Date.now() ? new Date(effCooldownMs).toISOString() : null,
    last_error: r.last_error ?? rt.lastError,
    last_ok_at: r.last_ok_at ?? rt.lastOkAt,
    req_today: isSameDay ? Number(r.req_today) || 0 : 0,
    tokens_today: isSameDay ? Number(r.tokens_today) || 0 : 0,
    stats_date: isSameDay ? r.stats_date : today,
  }
}

export function loadPoolRoutes(opts: { includeDisabled?: boolean; includeLegacy?: boolean; modelOverride?: string } = {}): ResolvedRoute[] {
  const sql = opts.includeDisabled
    ? `SELECT * FROM ai_provider_routes ORDER BY priority ASC, id ASC`
    : `SELECT * FROM ai_provider_routes WHERE enabled = 1 ORDER BY priority ASC, id ASC`
  const dbRoutes = q.all<OmniRouteRow>(sql).map(mapDbRowToResolved)

  const aiEnabled = Boolean(getSetting('ai_enabled'))
  const wantLegacy = opts.includeLegacy !== false && (aiEnabled || dbRoutes.length === 0)
  if (!wantLegacy) return dbRoutes

  const legacyEps = loadLegacyEndpoints(opts.modelOverride).filter(e => {
    if (aiEnabled) return true
    const preset = getOmniPreset(e.provider)
    return Boolean(e.key) || (preset ? !preset.keyRequired : false)
  })
  const legacyRoutes: ResolvedRoute[] = legacyEps.map((e, idx) => {
    const preset = getOmniPreset(e.provider)
    const id = idx === 0 ? -1 : -2
    const stateKey = `legacy:${id}:${e.base}:${e.model}`
    const rt = getRouteRuntime(stateKey)
    const lanes: OmniLane[] = preset?.lanes ? [...preset.lanes] : ['general', 'reasoning', 'fast', 'translate']
    return {
      id,
      isLegacy: true,
      stateKey,
      label: e.label,
      provider_key: e.provider,
      base_url: e.base,
      api_key: e.key,
      has_key: Boolean(e.key),
      model_id: e.model,
      lanes,
      tier: preset?.tier ?? 'tier1',
      priority: 1000 + idx,
      zero_retention: preset ? preset.zeroRetentionDefault : (e.provider === 'custom' || e.provider === 'ollama'),
      rpm_limit: preset?.rpmLimitDefault ?? 60,
      rpd_limit: preset?.rpdLimitDefault ?? 5000,
      enabled: true,
      cooldown_until: rt.cooldownUntilMs > Date.now() ? new Date(rt.cooldownUntilMs).toISOString() : null,
      last_error: rt.lastError,
      last_ok_at: rt.lastOkAt,
      req_today: 0,
      tokens_today: 0,
      stats_date: utcToday(),
    }
  })

  return [...dbRoutes, ...legacyRoutes]
}

export function omniConfigured(): boolean {
  if (inDemo()) return true
  const dbCount = q.val<number>(`SELECT COUNT(*) FROM ai_provider_routes WHERE enabled = 1`) ?? 0
  if (dbCount > 0) return true
  return Boolean(getSetting('ai_enabled')) && loadLegacyEndpoints().length > 0
}

// ---------------------------------------------------------------------------
// Per-User Fair-Share Quota
// ---------------------------------------------------------------------------
export function isQuotaExempt(user: SessionUser | null | undefined): boolean {
  if (!user) return true
  if (canAccessCrmVault(user)) return true
  return inDemo() && String(user.email || '').trim().toLowerCase() === 'demo@swkpropertiesuae.com'
}

export function getUserQuotaStatus(user: SessionUser | null | undefined) {
  const dailyLimit = Math.max(0, Number(getSetting('ai_staff_daily_req_limit') ?? 150))
  const rpmLimit = Math.max(0, Number(getSetting('ai_staff_rpm_limit') ?? 10))
  const unlimited = isQuotaExempt(user)
  const day = todayStr()
  const row = user?.id
    ? q.get<{ req_count: number; token_count: number }>(`SELECT req_count, token_count FROM ai_usage_daily WHERE user_id = ? AND usage_date = ?`, user.id, day)
    : undefined
  const usedToday = Number(row?.req_count ?? 0)
  const tokensToday = Number(row?.token_count ?? 0)
  const remainingToday = unlimited || dailyLimit === 0 ? null : Math.max(0, dailyLimit - usedToday)
  return {
    unlimited,
    daily_limit: unlimited ? null : dailyLimit,
    rpm_limit: unlimited ? null : rpmLimit,
    used_today: usedToday,
    tokens_today: tokensToday,
    remaining_today: remainingToday,
  }
}

function assertUserQuota(user: SessionUser | null | undefined): void {
  if (!user || isQuotaExempt(user)) return
  const dailyLimit = Math.max(0, Number(getSetting('ai_staff_daily_req_limit') ?? 150))
  const rpmLimit = Math.max(0, Number(getSetting('ai_staff_rpm_limit') ?? 10))
  const day = todayStr()
  if (dailyLimit > 0) {
    const used = q.val<number>(`SELECT req_count FROM ai_usage_daily WHERE user_id = ? AND usage_date = ?`, user.id, day) ?? 0
    if (used >= dailyLimit) {
      throw new HttpError(429, `Daily AI request limit (${dailyLimit}) reached. Your fair-share quota resets tomorrow.`)
    }
  }
  if (rpmLimit > 0) {
    const store = getStore()
    const now = Date.now()
    const cutoff = now - 60_000
    const arr = store.userRpm.get(user.id) ?? []
    while (arr.length && arr[0]! < cutoff) arr.shift()
    if (arr.length >= rpmLimit) {
      throw new HttpError(429, `Rate limit (${rpmLimit} requests/minute) reached. Please wait a moment and try again.`)
    }
    store.userRpm.set(user.id, arr)
  }
}

export function recordUserUsage(user: SessionUser | null | undefined, tokens: number): void {
  if (!user?.id) return
  const now = Date.now()
  const store = getStore()
  const arr = store.userRpm.get(user.id) ?? []
  const cutoff = now - 60_000
  while (arr.length && arr[0]! < cutoff) arr.shift()
  arr.push(now)
  store.userRpm.set(user.id, arr)

  const day = todayStr()
  q.run(
    `INSERT INTO ai_usage_daily(user_id, usage_date, req_count, token_count, updated_at)
     VALUES (?, ?, 1, ?, ?)
     ON CONFLICT(user_id, usage_date) DO UPDATE SET
       req_count = ai_usage_daily.req_count + 1,
       token_count = ai_usage_daily.token_count + excluded.token_count,
       updated_at = excluded.updated_at`,
    user.id,
    day,
    Math.max(0, Math.round(tokens || 0)),
    nowIso(),
  )
}

export function recordAdditionalUserTokens(user: SessionUser | null | undefined, tokens: number): void {
  const clean = Math.max(0, Math.round(tokens || 0))
  if (!user?.id || !clean) return
  const day = todayStr()
  q.run(
    `INSERT INTO ai_usage_daily(user_id, usage_date, req_count, token_count, updated_at)
     VALUES (?, ?, 0, ?, ?)
     ON CONFLICT(user_id, usage_date) DO UPDATE SET
       token_count = ai_usage_daily.token_count + excluded.token_count,
       updated_at = excluded.updated_at`,
    user.id,
    day,
    clean,
    nowIso(),
  )
}

// ---------------------------------------------------------------------------
// Candidate Filtering, Sorting & Circuit Breaker Cooldowns
// ---------------------------------------------------------------------------
function hasMultimodalImage(messages: OmniMessage[]): boolean {
  for (const m of messages) {
    if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (part && typeof part === 'object' && part.type === 'image_url') return true
      }
    }
  }
  return false
}

function matchesLane(route: ResolvedRoute, lane: OmniLane): boolean {
  if (lane === 'vision') return route.lanes.includes('vision')
  if (lane === 'audio') return route.lanes.includes('audio')
  if (lane === 'general') {
    return route.lanes.includes('general') || route.lanes.includes('fast') || route.lanes.includes('reasoning')
  }
  return route.lanes.includes(lane) || route.lanes.includes('general')
}

function tierRank(tier: OmniTier, preferTier: OmniTier | undefined, user: SessionUser | null | undefined): number {
  if (preferTier === 'tier1' && canAccessCrmVault(user)) {
    return tier === 'tier1' ? 0 : tier === 'local' ? 1 : 2
  }
  if (preferTier === 'local') {
    return tier === 'local' ? 0 : tier === 'free' ? 1 : 2
  }
  return tier === 'free' ? 0 : tier === 'local' ? 1 : 2
}

function selectCandidates(req: OmniRequest, lane: OmniLane): ResolvedRoute[] {
  if (req.routeIdOverride !== undefined) {
    const all = loadPoolRoutes({ includeDisabled: true, includeLegacy: false })
    const hit = all.find(r => r.id === req.routeIdOverride)
    if (!hit) throw new HttpError(404, 'AI route not found')
    return [hit]
  }

  const allRoutes = loadPoolRoutes({ includeDisabled: false, includeLegacy: req.includeLegacyFallback !== false, modelOverride: req.modelOverride })
  if (!allRoutes.length) {
    throw new HttpError(503, 'AI is not configured. Choose a provider under Integrations → AI.')
  }

  const requireZeroRetention = Boolean(req.confidential || req.zeroRetentionOnly)
  const hasVision = Boolean(req.hasVisionContent || lane === 'vision' || hasMultimodalImage(req.messages))
  const allowNonVaultVisionFree = Boolean(getSetting('ai_allow_nonvault_vision_free'))

  let pool = allRoutes.filter(r => Boolean(r.base_url && r.model_id))

  if (requireZeroRetention) {
    pool = pool.filter(r => r.zero_retention)
    if (!pool.length) {
      notifyLeadership(
        'Omni-Route Zero-Retention Policy Block',
        'A Confidential Mode or executive AI call failed closed because no zero-retention route is enabled.',
        '/ai',
        'audit',
        `omni-zr-${todayStr()}`,
      )
      throw new HttpError(
        503,
        'Zero-retention policy error: Confidential Mode and executive runs require an enabled zero-retention route (Cloudflare Workers AI, Tier-1, or local Ollama).',
      )
    }
  }

  if (hasVision) {
    pool = pool.filter(r => r.lanes.includes('vision'))
    if (req.isVaultContext || req.confidential) {
      pool = pool.filter(r => r.zero_retention)
      if (!pool.length) {
        throw new HttpError(
          403,
          'Vision on non-zero-retention routes is forbidden for CRM Vault or Confidential Mode records. Use OCR extraction or a zero-retention vision route.',
        )
      }
    } else if (!allowNonVaultVisionFree) {
      pool = pool.filter(r => r.zero_retention)
      if (!pool.length) {
        throw new HttpError(
          403,
          'External non-zero-retention vision is disabled (ai_allow_nonvault_vision_free is off). Enable the toggle for non-Vault visuals, use a zero-retention vision route, or rely on OCR-first extraction.',
        )
      }
    }
  }

  pool = pool.filter(r => matchesLane(r, lane))
  if (!pool.length) {
    throw new HttpError(503, `No AI routes are configured for the "${lane}" lane.`)
  }

  const now = Date.now()
  const active = pool.filter(r => {
    const rt = getRouteRuntime(r.stateKey)
    const cdMs = Math.max(r.cooldown_until ? Date.parse(r.cooldown_until) : 0, rt.cooldownUntilMs)
    if (cdMs > now) return false
    if (r.rpd_limit > 0 && r.req_today >= r.rpd_limit) return false
    return true
  })

  if (!active.length) {
    throw new HttpError(429, 'All eligible AI routes are currently in cooldown or at daily capacity. Please retry shortly.')
  }

  active.sort((a, b) => {
    const exactA = a.lanes.includes(lane) ? 0 : 1
    const exactB = b.lanes.includes(lane) ? 0 : 1
    if (exactA !== exactB) return exactA - exactB

    if (req.modelOverride) {
      const mA = a.model_id === req.modelOverride ? 0 : 1
      const mB = b.model_id === req.modelOverride ? 0 : 1
      if (mA !== mB) return mA - mB
    }

    const tA = tierRank(a.tier, req.preferTier, req.user)
    const tB = tierRank(b.tier, req.preferTier, req.user)
    if (tA !== tB) return tA - tB

    if (a.priority !== b.priority) return a.priority - b.priority

    const rpmA = recentRpmCount(getRouteRuntime(a.stateKey), now)
    const rpmB = recentRpmCount(getRouteRuntime(b.stateKey), now)
    const satA = a.rpm_limit > 0 && rpmA >= a.rpm_limit ? 1 : 0
    const satB = b.rpm_limit > 0 && rpmB >= b.rpm_limit ? 1 : 0
    if (satA !== satB) return satA - satB
    if (rpmA !== rpmB) return rpmA - rpmB

    const latA = getRouteRuntime(a.stateKey).ewmaLatencyMs ?? Number.MAX_SAFE_INTEGER
    const latB = getRouteRuntime(b.stateKey).ewmaLatencyMs ?? Number.MAX_SAFE_INTEGER
    if (latA !== latB) return latA - latB

    if (a.isLegacy !== b.isLegacy) return a.isLegacy ? 1 : -1
    return a.id - b.id
  })

  return active.slice(0, MAX_FAILOVER_HOPS)
}

function parseRetryAfterMs(headerVal: string | null): number | null {
  if (!headerVal) return null
  const s = headerVal.trim()
  if (/^\d+(?:\.\d+)?$/.test(s)) {
    return Math.max(1000, Math.ceil(Number(s) * 1000))
  }
  const ts = Date.parse(s)
  if (Number.isFinite(ts)) {
    return Math.max(1000, ts - Date.now())
  }
  return null
}

function nextUtcMidnightResetMs(): number {
  const d = new Date()
  const target = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 5, 0, 0)
  const next = target > Date.now() ? target : target + 86_400_000
  return Math.max(60_000, next - Date.now())
}

function applyRouteFailure(route: ResolvedRoute, status: number | null, retryAfterHeader: string | null, errorMsg: string): void {
  const rt = getRouteRuntime(route.stateKey)
  rt.lastError = errorMsg.slice(0, 500)

  const shouldCooldown =
    status === 429 ||
    status === 402 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status === 408 ||
    status === null // network / timeout error

  let cooldownUntilIso: string | null = null
  if (shouldCooldown) {
    rt.consecutiveCooldowns += 1
    let cdMs = parseRetryAfterMs(retryAfterHeader)
    if (cdMs === null) {
      if ((status === 429 || status === 402) && /daily|rpd|day\s*limit|quota.*exhaust|exceeded\s+your\s+current\s+quota|insufficient_quota|neurons/i.test(errorMsg)) {
        cdMs = nextUtcMidnightResetMs()
      } else {
        cdMs = rt.consecutiveCooldowns === 1 ? 60_000 : rt.consecutiveCooldowns === 2 ? 180_000 : 600_000
      }
    }
    rt.cooldownUntilMs = Date.now() + cdMs
    cooldownUntilIso = new Date(rt.cooldownUntilMs).toISOString()
  }

  if (!route.isLegacy && route.id > 0) {
    if (cooldownUntilIso) {
      q.run(
        `UPDATE ai_provider_routes SET cooldown_until = ?, last_error = ?, updated_at = ? WHERE id = ?`,
        cooldownUntilIso,
        rt.lastError,
        nowIso(),
        route.id,
      )
    } else {
      q.run(
        `UPDATE ai_provider_routes SET last_error = ?, updated_at = ? WHERE id = ?`,
        rt.lastError,
        nowIso(),
        route.id,
      )
    }
  }
}

function markRouteSuccess(route: ResolvedRoute, tokens: number, elapsedMs: number): void {
  const rt = getRouteRuntime(route.stateKey)
  rt.cooldownUntilMs = 0
  rt.consecutiveCooldowns = 0
  rt.lastError = null
  rt.lastOkAt = nowIso()
  recordLatency(route.stateKey, elapsedMs)

  if (!route.isLegacy && route.id > 0) {
    const today = utcToday()
    const row = q.get<{ stats_date: string | null; req_today: number; tokens_today: number }>(
      `SELECT stats_date, req_today, tokens_today FROM ai_provider_routes WHERE id = ?`,
      route.id,
    )
    const sameDay = row?.stats_date === today
    const nextReq = (sameDay ? Number(row?.req_today ?? 0) : 0) + 1
    const nextTok = (sameDay ? Number(row?.tokens_today ?? 0) : 0) + Math.max(0, Math.round(tokens || 0))
    q.run(
      `UPDATE ai_provider_routes SET cooldown_until = NULL, last_error = NULL, last_ok_at = ?, req_today = ?, tokens_today = ?, stats_date = ?, updated_at = ? WHERE id = ?`,
      rt.lastOkAt,
      nextReq,
      nextTok,
      today,
      rt.lastOkAt,
      route.id,
    )
  }
}

// ---------------------------------------------------------------------------
// Upstream HTTP Calling (JSON & Streaming SSE)
// ---------------------------------------------------------------------------
function extractToolJson(text: string): { json: any; raw: string } | null {
  const at = text.search(/\{\s*"tool"\s*:/)
  if (at < 0) return null
  let depth = 0
  for (let i = at; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}' && --depth === 0) {
      const raw = text.slice(at, i + 1)
      try {
        return { json: JSON.parse(raw), raw }
      } catch {
        return null
      }
    }
  }
  return null
}

function formatHttpErrorHint(route: ResolvedRoute, status: number, detail: string): string {
  const hint =
    status === 404
      ? 'Check the model ID and base URL in Integrations → AI. The provider may have retired this model. For OpenRouter, use model openrouter/free and base URL https://openrouter.ai/api/v1.'
      : status === 401 || status === 403
        ? 'Check that the API key belongs to the selected provider and has permission to use this model.'
        : status === 429
          ? 'The provider has reached its usage limit. Wait for the allowance to reset or configure a separate free fallback provider.'
          : ''
  return `${route.label} model ${route.model_id}: HTTP ${status} ${detail} ${hint}`.trim()
}

function combineSignals(timeoutMs: number, externalSignal?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs)
  const onAbort = () => ctl.abort(externalSignal?.reason)
  if (externalSignal) {
    if (externalSignal.aborted) ctl.abort(externalSignal.reason)
    else externalSignal.addEventListener('abort', onAbort, { once: true })
  }
  return {
    signal: ctl.signal,
    cleanup: () => {
      clearTimeout(timer)
      externalSignal?.removeEventListener('abort', onAbort)
    },
  }
}

async function callRouteOnce(
  route: ResolvedRoute,
  messages: OmniMessage[],
  tools: ToolDef[] | undefined,
  opts: { maxTokens?: number; temperature?: number; timeoutMs?: number; signal?: AbortSignal; stream?: boolean },
  onRawDelta?: (delta: string) => void,
): Promise<{ content: string; tool_calls: { id: string; name: string; args: any }[]; tokens: number; model: string }> {
  if (inDemo()) throw new Error('External connections are disabled in the demo workspace')
  recordRpmHit(route.stateKey)
  const started = Date.now()
  const timeoutMs = opts.timeoutMs ?? 90_000
  const { signal, cleanup } = combineSignals(timeoutMs, opts.signal)
  let failureRecorded = false
  const recordFailureOnce = (status: number | null, retryAfter: string | null, message: string) => {
    if (failureRecorded) return
    failureRecorded = true
    applyRouteFailure(route, status, retryAfter, message)
  }

  try {
    // Native Ollama /api/chat path (when no tools & not streaming)
    if (!opts.stream && route.base_url.includes('11434') && !tools?.length) {
      const nativeBase = route.base_url.replace(/\/v1\/?$/, '').replace(/\/+$/, '')
      const nr = await fetch(`${nativeBase}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: route.model_id,
          messages: messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : '' })),
          think: false,
          stream: false,
        }),
        signal,
      })
      if (nr.ok) {
        const ndata: any = await nr.json().catch(() => null)
        if (ndata?.message) {
          const text = String(ndata.message.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
          const tokens = Number(ndata?.eval_count ?? 0)
          markRouteSuccess(route, tokens, Date.now() - started)
          return { content: text, tool_calls: [], tokens, model: route.model_id }
        }
      }
    }

    const body: any = {
      model: route.model_id,
      messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 1500,
    }
    if (tools?.length) {
      body.tools = tools.map(t => ({ type: 'function', function: t }))
      body.tool_choice = 'auto'
    }
    if (opts.stream) {
      body.stream = true
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (route.api_key) headers.Authorization = `Bearer ${route.api_key}`

    const res = await fetch(`${route.base_url}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      let data: any = null
      try { data = text ? JSON.parse(text) : null } catch { data = null }
      const detail = String(data?.error?.message ?? data?.message ?? text.slice(0, 160))
      const msg = formatHttpErrorHint(route, res.status, detail)
      recordFailureOnce(res.status, res.headers.get('retry-after'), msg)
      throw new Error(msg)
    }

    const ctype = String(res.headers.get('content-type') || '').toLowerCase()
    if (opts.stream && ctype.includes('text/event-stream') && res.body) {
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let rawContent = ''
      let tokens = 0
      const toolCallsMap = new Map<number, { id: string; name: string; argsRaw: string }>()
      const retryAfter = res.headers.get('retry-after')

      const processSseLine = (line: string) => {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) return
        const dataStr = trimmed.slice(5).trim()
        if (!dataStr || dataStr === '[DONE]') return
        let parsed: any
        try { parsed = JSON.parse(dataStr) } catch { return }
        if (parsed?.error) {
          const errStatus = Number(parsed.error.code ?? parsed.error.status ?? 502) || 502
          const detail = String(parsed.error.message ?? JSON.stringify(parsed.error)).slice(0, 200)
          const msg = formatHttpErrorHint(route, errStatus, detail)
          recordFailureOnce(errStatus, retryAfter, msg)
          throw new Error(msg)
        }
        if (parsed?.usage?.total_tokens) tokens = Number(parsed.usage.total_tokens) || tokens
        const delta = parsed?.choices?.[0]?.delta
        const msgFallback = parsed?.choices?.[0]?.message
        const textDelta = typeof delta?.content === 'string'
          ? delta.content
          : (typeof msgFallback?.content === 'string' && !rawContent ? msgFallback.content : '')
        if (textDelta) {
          rawContent += textDelta
          onRawDelta?.(textDelta)
        }
        const tcs = delta?.tool_calls ?? msgFallback?.tool_calls
        if (Array.isArray(tcs)) {
          for (const tc of tcs) {
            const idx = Number(tc.index ?? 0)
            const cur = toolCallsMap.get(idx) ?? { id: tc.id || `tc_${idx}`, name: '', argsRaw: '' }
            if (tc.id) cur.id = tc.id
            if (tc.function?.name) cur.name += tc.function.name
            if (tc.function?.arguments) cur.argsRaw += tc.function.arguments
            toolCallsMap.set(idx, cur)
          }
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split(/\r?\n/)
        buf = lines.pop() ?? ''
        for (const line of lines) processSseLine(line)
      }
      if (buf.trim()) processSseLine(buf)

      let content = rawContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      let calls = [...toolCallsMap.values()].map(c => {
        let args: any = {}
        try { args = JSON.parse(c.argsRaw || '{}') } catch {}
        return { id: c.id, name: c.name, args }
      })
      if (!calls.length && tools?.length) {
        const found = extractToolJson(content)
        if (found && tools.some(t => t.name === found.json.tool)) {
          calls = [{ id: 't' + Date.now(), name: found.json.tool, args: found.json.args ?? {} }]
          content = content.replace(found.raw, '').replace(/```(json)?/g, '').trim()
        }
      }
      if (!content && !calls.length) {
        const errMsg = `${route.label} model ${route.model_id}: HTTP 502 empty stream response`
        recordFailureOnce(502, retryAfter, errMsg)
        throw new Error(errMsg)
      }
      markRouteSuccess(route, tokens, Date.now() - started)
      return { content, tool_calls: calls, tokens, model: route.model_id }
    }

    // Standard non-streaming JSON response (also used as fallback if server responded JSON to stream=true)
    const text = await res.text()
    let data: any = null
    try { data = text ? JSON.parse(text) : null } catch { data = null }
    const msg = data?.choices?.[0]?.message
    if (!msg) {
      const errMsg = `${route.label}: empty response`
      recordFailureOnce(502, null, errMsg)
      throw new Error(errMsg)
    }
    let content: string = typeof msg.content === 'string' ? msg.content : ''
    let calls = (msg.tool_calls ?? []).map((c: any) => {
      let a: any = {}
      try { a = JSON.parse(c.function?.arguments || '{}') } catch {}
      return { id: c.id ?? Math.random().toString(36).slice(2), name: c.function?.name, args: a }
    })
    if (!calls.length && tools?.length) {
      const found = extractToolJson(content)
      if (found && tools.some(t => t.name === found.json.tool)) {
        calls = [{ id: 't' + Date.now(), name: found.json.tool, args: found.json.args ?? {} }]
        content = content.replace(found.raw, '').replace(/```(json)?/g, '').trim()
      }
    }
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
    if (opts.stream && content) onRawDelta?.(content)
    const tokens = Number(data?.usage?.total_tokens ?? 0)
    markRouteSuccess(route, tokens, Date.now() - started)
    return { content, tool_calls: calls, tokens, model: route.model_id }
  } catch (err: any) {
    const msg = String(err?.message ?? err)
    recordFailureOnce(null, null, msg)
    throw err
  } finally {
    cleanup()
  }
}

export function preflightOmniRequest(req: OmniRequest): { lane: OmniLane; candidates: ResolvedRoute[] } {
  const lane = normalizeLane(req.lane)
  if (!req.bypassQuota) assertUserQuota(req.user)
  const candidates = selectCandidates(req, lane)
  return { lane, candidates }
}

// ---------------------------------------------------------------------------
// Public Router API: omniChat() & omniChatStream()
// ---------------------------------------------------------------------------
export async function omniChat(req: OmniRequest): Promise<OmniResult> {
  const { lane, candidates } = preflightOmniRequest(req)
  const errors: string[] = []
  let attempts = 0

  for (const route of candidates) {
    attempts++
    const pii = route.zero_retention
      ? { messages: req.messages, map: new Map<string, string>(), redactedCount: 0 }
      : scrubMessages(req.messages)

    try {
      const res = await callRouteOnce(route, pii.messages, req.tools, {
        maxTokens: req.maxTokens,
        temperature: req.temperature,
        timeoutMs: req.timeoutMs,
        signal: req.signal,
        stream: false,
      })
      const restored = pii.map.size ? restoreScrubbedPii(res.content, pii.map) : res.content
      const restoredCalls = pii.map.size
        ? res.tool_calls.map(c => ({ ...c, args: restoreValueWithPii(c.args, pii.map) }))
        : res.tool_calls
      if (!req.bypassQuota) recordUserUsage(req.user, res.tokens)
      return {
        content: restored,
        tool_calls: restoredCalls,
        tokens: res.tokens,
        model: res.model,
        provider: route.provider_key,
        routeId: route.isLegacy ? null : route.id,
        routeLabel: route.label,
        zeroRetention: route.zero_retention,
        piiRedacted: pii.redactedCount,
        attempts,
        lane,
      }
    } catch (err: any) {
      errors.push(String(err?.message ?? err))
      if (req.signal?.aborted) break
    }
  }

  throw new Error(errors.join('\n'))
}

export async function omniChatStream(req: OmniRequest, onToken: (delta: string) => void): Promise<OmniResult> {
  const { lane, candidates } = preflightOmniRequest(req)
  const errors: string[] = []
  let attempts = 0

  for (const route of candidates) {
    attempts++
    const pii = route.zero_retention
      ? { messages: req.messages, map: new Map<string, string>(), redactedCount: 0 }
      : scrubMessages(req.messages)

    let emittedAny = false
    let pending = ''

    const flushSafe = (forceAll: boolean) => {
      if (!pending) return
      if (!pii.map.size) {
        onToken(pending)
        emittedAny = true
        pending = ''
        return
      }
      if (forceAll) {
        const out = restoreScrubbedPii(pending, pii.map)
        if (out) {
          onToken(out)
          emittedAny = true
        }
        pending = ''
        return
      }
      const holdFrom = findPendingPlaceholderStart(pending)
      if (holdFrom === -1) {
        const out = restoreScrubbedPii(pending, pii.map)
        if (out) {
          onToken(out)
          emittedAny = true
        }
        pending = ''
      } else if (holdFrom > 0) {
        const ready = pending.slice(0, holdFrom)
        pending = pending.slice(holdFrom)
        const out = restoreScrubbedPii(ready, pii.map)
        if (out) {
          onToken(out)
          emittedAny = true
        }
      }
    }

    try {
      const res = await callRouteOnce(
        route,
        pii.messages,
        req.tools,
        {
          maxTokens: req.maxTokens,
          temperature: req.temperature,
          timeoutMs: req.timeoutMs,
          signal: req.signal,
          stream: true,
        },
        delta => {
          pending += delta
          flushSafe(false)
        },
      )
      flushSafe(true)
      const restored = pii.map.size ? restoreScrubbedPii(res.content, pii.map) : res.content
      const restoredCalls = pii.map.size
        ? res.tool_calls.map(c => ({ ...c, args: restoreValueWithPii(c.args, pii.map) }))
        : res.tool_calls
      if (!req.bypassQuota) recordUserUsage(req.user, res.tokens)
      return {
        content: restored,
        tool_calls: restoredCalls,
        tokens: res.tokens,
        model: res.model,
        provider: route.provider_key,
        routeId: route.isLegacy ? null : route.id,
        routeLabel: route.label,
        zeroRetention: route.zero_retention,
        piiRedacted: pii.redactedCount,
        attempts,
        lane,
      }
    } catch (err: any) {
      errors.push(String(err?.message ?? err))
      if (emittedAny || req.signal?.aborted) break
    }
  }

  throw new Error(errors.join('\n'))
}

// ---------------------------------------------------------------------------
// Admin Route Testing & Live Health Snapshot
// ---------------------------------------------------------------------------
export async function testOmniRoute(routeId: number): Promise<{
  ok: boolean
  latency_ms: number
  model: string
  provider: string
  reply?: string
  error?: string
}> {
  const start = Date.now()
  try {
    const r = await omniChat({
      messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
      routeIdOverride: routeId,
      bypassQuota: true,
      maxTokens: 20,
      timeoutMs: 25_000,
    })
    const latency_ms = Date.now() - start
    logIntegration('ai', 'route-test', true, `${r.routeLabel} (${r.model}) OK in ${latency_ms}ms`)
    return { ok: true, latency_ms, model: r.model, provider: r.provider, reply: r.content.slice(0, 60) }
  } catch (err: any) {
    const latency_ms = Date.now() - start
    const msg = String(err?.message ?? err)
    logIntegration('ai', 'route-test', false, `Route #${routeId} failed: ${msg}`)
    return { ok: false, latency_ms, model: '', provider: '', error: msg }
  }
}

export function getOmniHealthSnapshot() {
  const routes = loadPoolRoutes({ includeDisabled: true, includeLegacy: false })
  const now = Date.now()
  const day = todayStr()

  const routeMetrics = routes.map(r => {
    const rt = getRouteRuntime(r.stateKey)
    const rpm = recentRpmCount(rt, now)
    const cooldownRemainingSec = r.cooldown_until ? Math.max(0, Math.ceil((Date.parse(r.cooldown_until) - now) / 1000)) : 0
    const status = !r.enabled
      ? 'disabled'
      : cooldownRemainingSec > 0
        ? 'cooldown'
        : r.last_error
          ? 'degraded'
          : 'healthy'
    return {
      id: r.id,
      label: r.label,
      provider_key: r.provider_key,
      base_url: r.base_url,
      model_id: r.model_id,
      lanes: r.lanes,
      tier: r.tier,
      priority: r.priority,
      zero_retention: r.zero_retention,
      has_key: r.has_key,
      enabled: r.enabled,
      status,
      rpm_recent: rpm,
      rpm_limit: r.rpm_limit,
      req_today: r.req_today,
      rpd_limit: r.rpd_limit,
      tokens_today: r.tokens_today,
      ewma_latency_ms: rt.ewmaLatencyMs,
      cooldown_until: r.cooldown_until,
      cooldown_remaining_s: cooldownRemainingSec,
      last_error: r.last_error,
      last_ok_at: r.last_ok_at,
    }
  })

  const dailyLimit = Math.max(0, Number(getSetting('ai_staff_daily_req_limit') ?? 150))
  const staffRows = q.all<{
    user_id: number
    name: string
    email: string
    role_name: string | null
    req_count: number
    token_count: number
    updated_at: string
  }>(
    `SELECT d.user_id, u.name, u.email, r.name AS role_name, d.req_count, d.token_count, d.updated_at
     FROM ai_usage_daily d
     JOIN users u ON u.id = d.user_id
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE d.usage_date = ?
     ORDER BY d.req_count DESC, u.name ASC`,
    day,
  )

  const staff_usage = staffRows.map(s => {
    const exempt = canAccessCrmVault({ email: s.email, role_name: s.role_name })
    return {
      user_id: s.user_id,
      name: s.name,
      email: s.email,
      role_name: s.role_name || 'Staff',
      req_count: s.req_count,
      token_count: s.token_count,
      daily_limit: exempt ? null : dailyLimit,
      exempt,
      updated_at: s.updated_at,
    }
  })

  return {
    date: day,
    routes: routeMetrics,
    staff_usage,
    settings: {
      ai_allow_nonvault_vision_free: Boolean(getSetting('ai_allow_nonvault_vision_free')),
      ai_staff_daily_req_limit: dailyLimit,
      ai_staff_rpm_limit: Math.max(0, Number(getSetting('ai_staff_rpm_limit') ?? 10)),
    },
  }
}
