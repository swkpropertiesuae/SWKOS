import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Edit3,
  KeyRound,
  Layers,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  XCircle,
  Zap,
} from 'lucide-react'
import { canOpenEmployeeRecords } from '@shared/swk-staff-access'
import { api, del, get, post } from '../../lib/api'
import { cls } from '../../lib/format'
import { useMeta } from '../../lib/meta'
import { useToast } from '../../lib/toast'
import { Badge, ErrorBox, Loading, Modal, useDialogs } from '../../ui/kit'

export type OmniLane = 'general' | 'reasoning' | 'fast' | 'vision' | 'translate' | 'search' | 'audio'
export type OmniTier = 'free' | 'tier1' | 'local'

export interface OmniPresetModel {
  id: string
  lanes: OmniLane[]
  notes?: string
}

export interface OmniPreset {
  key: string
  label: string
  baseUrl: string
  defaultModel: string
  models: OmniPresetModel[]
  lanes: OmniLane[]
  tier: OmniTier
  zeroRetentionDefault: boolean
  rpmLimitDefault: number
  rpdLimitDefault: number
  keyRequired: boolean
  quotaSummary: string
  notes: string
}

export interface OmniRouteItem {
  id: number
  label: string
  provider_key: string
  base_url: string
  has_key: boolean
  api_key_masked: string
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
  created_at: string
  updated_at: string
}

export interface OmniHealthRoute {
  id: number
  label: string
  provider_key: string
  base_url: string
  model_id: string
  lanes: OmniLane[]
  tier: OmniTier
  priority: number
  zero_retention: boolean
  has_key: boolean
  enabled: boolean
  status: 'healthy' | 'degraded' | 'cooldown' | 'disabled'
  rpm_recent: number
  rpm_limit: number
  req_today: number
  rpd_limit: number
  tokens_today: number
  ewma_latency_ms: number | null
  cooldown_until: string | null
  cooldown_remaining_s: number
  last_error: string | null
  last_ok_at: string | null
}

export interface OmniStaffUsageRow {
  user_id: number
  name: string
  email: string
  role_name: string
  req_count: number
  token_count: number
  daily_limit: number | null
  exempt: boolean
  updated_at: string
}

export interface OmniGovernanceSettings {
  ai_allow_nonvault_vision_free: boolean
  ai_staff_daily_req_limit: number
  ai_staff_rpm_limit: number
}

interface RoutesResponse {
  routes: OmniRouteItem[]
  presets: OmniPreset[]
  settings: OmniGovernanceSettings
}

interface HealthResponse {
  date: string
  routes: OmniHealthRoute[]
  staff_usage: OmniStaffUsageRow[]
  settings: OmniGovernanceSettings
}

interface TestResult {
  ok: boolean
  latency_ms: number
  model: string
  provider: string
  reply?: string
  error?: string
}

const ALL_LANES: { key: OmniLane; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'reasoning', label: 'Reasoning' },
  { key: 'fast', label: 'Fast' },
  { key: 'vision', label: 'Vision' },
  { key: 'translate', label: 'Translate' },
  { key: 'search', label: 'Search' },
  { key: 'audio', label: 'Audio' },
]

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '0s'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`
}

function tierBadgeTone(tier: OmniTier): 'green' | 'amber' | 'violet' {
  if (tier === 'free') return 'green'
  if (tier === 'local') return 'violet'
  return 'amber'
}

export function OmniRouteAdminPanel({ compact = false }: { compact?: boolean }) {
  const { me } = useMeta()
  const toast = useToast()
  const dlg = useDialogs()
  const qc = useQueryClient()
  const isAllowed = canOpenEmployeeRecords(me)

  const routesQ = useQuery({
    queryKey: ['omni-ai-routes'],
    queryFn: () => get<RoutesResponse>('/api/omni-ai/routes'),
    enabled: isAllowed,
  })

  const healthQ = useQuery({
    queryKey: ['omni-ai-health'],
    queryFn: () => get<HealthResponse>('/api/omni-ai/health'),
    enabled: isAllowed,
    refetchInterval: 10000,
  })

  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const [settingsForm, setSettingsForm] = useState<OmniGovernanceSettings>({
    ai_allow_nonvault_vision_free: false,
    ai_staff_daily_req_limit: 150,
    ai_staff_rpm_limit: 10,
  })
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)

  useEffect(() => {
    const s = routesQ.data?.settings
    if (s && !settingsDirty) setSettingsForm(s)
  }, [routesQ.data?.settings, settingsDirty])

  const [modalOpen, setModalOpen] = useState(false)
  const [editingRoute, setEditingRoute] = useState<OmniRouteItem | null>(null)
  const [initialPresetKey, setInitialPresetKey] = useState<string>('gemini')

  const [testingId, setTestingId] = useState<number | null>(null)
  const [testResults, setTestResults] = useState<Record<number, TestResult>>({})
  const [busyId, setBusyId] = useState<number | null>(null)

  const presets = routesQ.data?.presets ?? []
  const routes = routesQ.data?.routes ?? []
  const healthRoutes = healthQ.data?.routes ?? []
  const staffUsage = healthQ.data?.staff_usage ?? []

  const healthMap = useMemo(() => {
    const m = new Map<number, OmniHealthRoute>()
    for (const r of healthRoutes) m.set(r.id, r)
    return m
  }, [healthRoutes])

  const routeCountByPreset = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of routes) {
      counts.set(r.provider_key, (counts.get(r.provider_key) ?? 0) + 1)
    }
    return counts
  }, [routes])

  const summary = useMemo(() => {
    let healthy = 0
    let degraded = 0
    let cooldown = 0
    let disabled = 0
    let reqToday = 0
    let tokensToday = 0
    for (const r of routes) {
      const h = healthMap.get(r.id)
      const cdMs = (h?.cooldown_until ?? r.cooldown_until) ? Date.parse((h?.cooldown_until ?? r.cooldown_until)!) - nowTick : 0
      const st = !r.enabled ? 'disabled' : cdMs > 0 ? 'cooldown' : (h?.last_error ?? r.last_error) ? 'degraded' : 'healthy'
      if (st === 'healthy') healthy++
      else if (st === 'degraded') degraded++
      else if (st === 'cooldown') cooldown++
      else disabled++
      reqToday += h?.req_today ?? r.req_today ?? 0
      tokensToday += h?.tokens_today ?? r.tokens_today ?? 0
    }
    return { total: routes.length, healthy, degraded, cooldown, disabled, reqToday, tokensToday }
  }, [routes, healthMap, nowTick])

  if (!isAllowed) {
    return (
      <ErrorBox
        error={new Error('Omni-Route Pool & Health Console is restricted exclusively to Owner and Admin.')}
      />
    )
  }

  if (routesQ.error) return <ErrorBox error={routesQ.error} onRetry={() => void routesQ.refetch()} />
  if (!routesQ.data) return <Loading label="Loading Omni-Route pool & health…" />

  const refreshAll = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['omni-ai-routes'] }),
      qc.invalidateQueries({ queryKey: ['omni-ai-health'] }),
      qc.invalidateQueries({ queryKey: ['omni-ai-status'] }),
    ])
  }

  const openAddPreset = (presetKey: string) => {
    setEditingRoute(null)
    setInitialPresetKey(presetKey)
    setModalOpen(true)
  }

  const openEditRoute = (route: OmniRouteItem) => {
    setEditingRoute(route)
    setInitialPresetKey(route.provider_key)
    setModalOpen(true)
  }

  const saveGovernanceSettings = async () => {
    setSavingSettings(true)
    try {
      const saved = await api<OmniGovernanceSettings>('PATCH', '/api/omni-ai/settings', settingsForm)
      setSettingsForm(saved)
      setSettingsDirty(false)
      toast.ok('Omni-Route governance & fair-share limits saved')
      await refreshAll()
    } catch (e: any) {
      toast.error(e.message || 'Failed to save governance settings')
    } finally {
      setSavingSettings(false)
    }
  }

  const handleTestRoute = async (route: OmniRouteItem) => {
    setTestingId(route.id)
    try {
      const res = await post<TestResult>(`/api/omni-ai/routes/${route.id}/test`, {})
      setTestResults(prev => ({ ...prev, [route.id]: res }))
      if (res.ok) toast.ok(`${route.label}: OK in ${res.latency_ms}ms`)
      else toast.error(`${route.label}: ${res.error || 'Test failed'}`)
      await refreshAll()
    } catch (e: any) {
      toast.error(e.message || 'Route test failed')
    } finally {
      setTestingId(null)
    }
  }

  const handleResetCooldown = async (route: OmniRouteItem) => {
    setBusyId(route.id)
    try {
      await post(`/api/omni-ai/routes/${route.id}/reset-cooldown`, {})
      toast.ok(`Cooldown & error cleared for ${route.label}`)
      await refreshAll()
    } catch (e: any) {
      toast.error(e.message || 'Could not reset cooldown')
    } finally {
      setBusyId(null)
    }
  }

  const handleToggleEnabled = async (route: OmniRouteItem) => {
    setBusyId(route.id)
    try {
      await api('PATCH', `/api/omni-ai/routes/${route.id}`, { enabled: !route.enabled })
      toast.ok(`${route.label} ${route.enabled ? 'disabled' : 'enabled'}`)
      await refreshAll()
    } catch (e: any) {
      toast.error(e.message || 'Failed to update route')
    } finally {
      setBusyId(null)
    }
  }

  const handleDeleteRoute = async (route: OmniRouteItem) => {
    const ok = await dlg.confirm({
      title: `Delete "${route.label}"?`,
      message: 'This removes the route and its encrypted API key from the Omni-Route failover pool.',
      danger: true,
      ok: 'Delete route',
    })
    if (!ok) return
    setBusyId(route.id)
    try {
      await del(`/api/omni-ai/routes/${route.id}`)
      toast.ok(`Deleted ${route.label}`)
      await refreshAll()
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete route')
    } finally {
      setBusyId(null)
    }
  }

  const freePresets = presets.filter(p => p.tier === 'free')
  const reservePresets = presets.filter(p => p.tier !== 'free')

  return (
    <div className="grid gap-5">
      {/* Header & Refresh */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-[#121212] text-[#51fec0] border border-[#0e9f6e]/40">
              <Layers size={16} />
            </span>
            <h2 className="m-0 text-[18px] font-display font-extrabold text-ink">
              Omni-Route Pool &amp; Live Health Console
            </h2>
            <Badge value="Owner & Admin Only" tone="green" />
          </div>
          <p className="text-[13px] text-muted mt-1 mb-0">
            Configure multiple keys across 9 free providers and 6 Tier-1 / local Ollama presets with automatic circuit-breaker failover and PII Shield redaction.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn outline sm"
            onClick={() => void refreshAll()}
            disabled={healthQ.isFetching || routesQ.isFetching}
          >
            <RefreshCw size={14} className={healthQ.isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button type="button" className="swk-btn swk-btn-primary" onClick={() => openAddPreset('gemini')}>
            <Plus size={15} /> Add Route / Key
          </button>
        </div>
      </div>

      {/* Live Summary Strip */}
      <div className={cls('grid gap-3', compact ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6')}>
        <div className="swk-card px-4 py-3 border border-line">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Pool Routes</div>
          <div className="text-[22px] font-display font-extrabold text-ink mt-1">{summary.total}</div>
        </div>
        <div className="swk-card px-4 py-3 border border-[#0e9f6e]/30">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#0e9f6e] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#0e9f6e]" /> Healthy
          </div>
          <div className="text-[22px] font-display font-extrabold text-ink mt-1">{summary.healthy}</div>
        </div>
        <div className="swk-card px-4 py-3 border border-amber-400/40">
          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" /> Degraded
          </div>
          <div className="text-[22px] font-display font-extrabold text-ink mt-1">{summary.degraded}</div>
        </div>
        <div className="swk-card px-4 py-3 border border-red-400/40">
          <div className="text-[11px] font-bold uppercase tracking-wider text-red-700 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-600" /> Cooldown / Off
          </div>
          <div className="text-[22px] font-display font-extrabold text-ink mt-1">
            {summary.cooldown} <span className="text-xs font-normal text-muted">/ {summary.disabled} off</span>
          </div>
        </div>
        <div className="swk-card px-4 py-3 border border-line">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Pool Req Today</div>
          <div className="text-[22px] font-display font-extrabold text-ink mt-1">{summary.reqToday.toLocaleString()}</div>
        </div>
        <div className="swk-card px-4 py-3 border border-line">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Tokens Today</div>
          <div className="text-[22px] font-display font-extrabold text-ink mt-1">{summary.tokensToday.toLocaleString()}</div>
        </div>
      </div>

      {/* Governance & Fair-Share Controls */}
      <div className="swk-card p-4 border border-line bg-card grid gap-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <ShieldCheck size={17} className="text-[#0e9f6e]" />
            <h3 className="m-0 text-[14.5px] font-display font-bold text-ink">
              Privacy, Vision &amp; Staff Fair-Share Controls
            </h3>
          </div>
          <button
            type="button"
            className="btn green sm"
            disabled={savingSettings}
            onClick={() => void saveGovernanceSettings()}
          >
            {savingSettings ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Governance Settings
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-3 items-start">
          <label className="flex items-start gap-2.5 p-3 rounded-xl border border-line bg-soft cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={settingsForm.ai_allow_nonvault_vision_free}
              onChange={e => {
                setSettingsDirty(true)
                setSettingsForm(s => ({ ...s, ai_allow_nonvault_vision_free: e.target.checked }))
              }}
            />
            <span className="text-[13px]">
              <b className="text-ink block">Allow non-vault Vision on Free providers</b>
              <span className="text-muted text-[12px]">
                When ON, non-confidential image uploads may route to free vision endpoints if no zero-retention vision route is active.
              </span>
            </span>
          </label>

          <div className="p-3 rounded-xl border border-line bg-soft">
            <label className="label">Staff Daily Request Limit (0 = Unlimited)</label>
            <input
              type="number"
              min={0}
              max={100000}
              className="input"
              value={settingsForm.ai_staff_daily_req_limit}
              onChange={e => {
                setSettingsDirty(true)
                setSettingsForm(s => ({
                  ...s,
                  ai_staff_daily_req_limit: Math.max(0, Number(e.target.value) || 0),
                }))
              }}
            />
            <div className="text-[11.5px] text-muted mt-1">Leadership (Owner, Admin, Manager) is always exempt.</div>
          </div>

          <div className="p-3 rounded-xl border border-line bg-soft">
            <label className="label">Staff Requests / Minute (RPM)</label>
            <input
              type="number"
              min={0}
              max={10000}
              className="input"
              value={settingsForm.ai_staff_rpm_limit}
              onChange={e => {
                setSettingsDirty(true)
                setSettingsForm(s => ({
                  ...s,
                  ai_staff_rpm_limit: Math.max(0, Number(e.target.value) || 0),
                }))
              }}
            />
            <div className="text-[11.5px] text-muted mt-1">Sliding 60-second fair-share throttle per non-exempt user.</div>
          </div>
        </div>
      </div>

      {/* 15 Presets Quick-Add Catalog */}
      <div className="swk-card p-4 border border-line bg-card grid gap-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[#0e9f6e]" />
            <h3 className="m-0 text-[14.5px] font-display font-bold text-ink">
              15 Provider Presets (Multi-Key Pool Ready)
            </h3>
          </div>
          <span className="text-[12px] text-muted">
            Click any preset to add another API key or custom model slot.
          </span>
        </div>

        <div className="grid gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#0e9f6e] mb-2">
              Free-Tier Providers ({freePresets.length})
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {freePresets.map(p => {
                const count = routeCountByPreset.get(p.key) ?? 0
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => openAddPreset(p.key)}
                    className="text-start rounded-xl border border-line bg-soft hover:bg-hover p-3 transition-colors cursor-pointer flex items-start gap-2.5"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-[13px] text-ink truncate">{p.label}</span>
                        {count > 0 && <Badge value={`${count} key${count > 1 ? 's' : ''}`} tone="green" />}
                      </div>
                      <div className="text-[11.5px] text-muted mt-0.5 truncate">{p.defaultModel || 'Editable model'}</div>
                      <div className="text-[11px] text-muted mt-1">{p.quotaSummary}</div>
                    </div>
                    <span className="w-7 h-7 rounded-lg bg-card border border-line grid place-items-center text-ink shrink-0">
                      <Plus size={14} />
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">
              Tier-1 Paid &amp; Local Ollama Reserves ({reservePresets.length})
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {reservePresets.map(p => {
                const count = routeCountByPreset.get(p.key) ?? 0
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => openAddPreset(p.key)}
                    className="text-start rounded-xl border border-line bg-soft hover:bg-hover p-3 transition-colors cursor-pointer flex items-start gap-2.5"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-[13px] text-ink truncate">{p.label}</span>
                        {count > 0 && <Badge value={`${count} active`} tone={p.tier === 'local' ? 'violet' : 'amber'} />}
                        {p.zeroRetentionDefault && <Badge value="Zero-Ret" tone="green" />}
                      </div>
                      <div className="text-[11.5px] text-muted mt-0.5 truncate">
                        {p.defaultModel || 'Custom OpenAI-compatible'}
                      </div>
                      <div className="text-[11px] text-muted mt-1">{p.quotaSummary}</div>
                    </div>
                    <span className="w-7 h-7 rounded-lg bg-card border border-line grid place-items-center text-ink shrink-0">
                      <Plus size={14} />
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Configured Routes & Live Health Matrix */}
      <div className="swk-card border border-line bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-[#0e9f6e]" />
            <h3 className="m-0 text-[14.5px] font-display font-bold text-ink">
              Configured Omni-Routes ({routes.length})
            </h3>
          </div>
          <span className="text-[12px] text-muted">
            Lower priority number runs first. Auto-cooldown triggers on HTTP 429 / 5xx / timeout.
          </span>
        </div>

        {routes.length === 0 ? (
          <div className="p-6 text-center text-[13.5px] text-muted">
            No Omni-Route endpoints added yet. Pick any preset above to add your first API key or local Ollama endpoint.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {routes.map(route => {
              const h = healthMap.get(route.id)
              const cdUntil = h?.cooldown_until ?? route.cooldown_until
              const cdRemaining = cdUntil ? Math.max(0, Math.ceil((Date.parse(cdUntil) - nowTick) / 1000)) : 0
              const lastErr = h?.last_error ?? route.last_error
              const status: 'healthy' | 'degraded' | 'cooldown' | 'disabled' = !route.enabled
                ? 'disabled'
                : cdRemaining > 0
                  ? 'cooldown'
                  : lastErr
                    ? 'degraded'
                    : 'healthy'
              const tr = testResults[route.id]

              return (
                <div key={route.id} className="p-4 grid gap-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-[240px] flex-1 grid gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Live Green / Amber / Red Dot */}
                        <span
                          className={cls(
                            'w-2.5 h-2.5 rounded-full shrink-0',
                            status === 'healthy'
                              ? 'bg-[#0e9f6e] shadow-[0_0_0_3px_rgba(14,159,110,0.2)]'
                              : status === 'degraded'
                                ? 'bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.2)]'
                                : status === 'cooldown'
                                  ? 'bg-red-600 shadow-[0_0_0_3px_rgba(220,38,38,0.2)]'
                                  : 'bg-neutral-400',
                          )}
                          title={`Status: ${status}`}
                        />
                        <b className="text-[14.5px] text-ink">{route.label}</b>
                        <Badge value={route.provider_key} tone="grey" />
                        <Badge value={route.tier} tone={tierBadgeTone(route.tier)} />
                        {route.zero_retention ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#121212] text-[#51fec0] border border-[#0e9f6e]/40">
                            <ShieldCheck size={11} /> Zero-Retention
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-soft text-muted border border-line">
                            <Shield size={11} /> PII-Shielded
                          </span>
                        )}
                        <span className="text-[11.5px] font-mono text-muted">P{route.priority}</span>
                        {status === 'cooldown' && (
                          <Badge value={`Cooldown ${formatCountdown(cdRemaining)}`} tone="red" />
                        )}
                        {status === 'degraded' && <Badge value="Degraded" tone="amber" />}
                        {status === 'disabled' && <Badge value="Disabled" tone="grey" />}
                        {status === 'healthy' && <Badge value="Healthy" tone="green" />}
                      </div>

                      <div className="text-[12.5px] text-muted flex items-center gap-3 flex-wrap">
                        <span>
                          Model: <code className="text-ink font-semibold">{route.model_id}</code>
                        </span>
                        <span>
                          Key:{' '}
                          {route.has_key ? (
                            <span className="text-[#0e9f6e] font-semibold">Encrypted</span>
                          ) : (
                            <span className="text-muted">None</span>
                          )}
                        </span>
                        <span className="truncate max-w-[340px]" title={route.base_url}>
                          {route.base_url}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        {route.lanes.map(l => (
                          <span
                            key={l}
                            className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-soft border border-line text-body"
                          >
                            {l}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Telemetry & Actions */}
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-3 text-[12px] text-muted flex-wrap justify-end">
                        <span>
                          RPM: <b className="text-ink">{h?.rpm_recent ?? 0}</b> / {route.rpm_limit}
                        </span>
                        <span>
                          Today: <b className="text-ink">{h?.req_today ?? route.req_today}</b> / {route.rpd_limit}
                        </span>
                        <span>
                          Tokens: <b className="text-ink">{(h?.tokens_today ?? route.tokens_today).toLocaleString()}</b>
                        </span>
                        {h?.ewma_latency_ms != null && (
                          <span className="inline-flex items-center gap-1">
                            <Zap size={12} className="text-[#0e9f6e]" />
                            <b className="text-ink">{h.ewma_latency_ms}ms</b>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          className="btn outline sm"
                          disabled={testingId === route.id || busyId === route.id}
                          onClick={() => void handleTestRoute(route)}
                        >
                          {testingId === route.id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Play size={13} />
                          )}
                          Test
                        </button>

                        {(status === 'cooldown' || status === 'degraded') && (
                          <button
                            type="button"
                            className="btn outline sm"
                            disabled={busyId === route.id}
                            onClick={() => void handleResetCooldown(route)}
                          >
                            <RotateCcw size={13} /> Reset Cooldown
                          </button>
                        )}

                        <button
                          type="button"
                          className="btn outline sm"
                          disabled={busyId === route.id}
                          onClick={() => void handleToggleEnabled(route)}
                        >
                          {route.enabled ? 'Disable' : 'Enable'}
                        </button>

                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() => openEditRoute(route)}
                        >
                          <Edit3 size={13} /> Edit
                        </button>

                        <button
                          type="button"
                          className="btn ghost sm text-red-600"
                          disabled={busyId === route.id}
                          onClick={() => void handleDeleteRoute(route)}
                          title="Delete route"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {lastErr && (
                    <div className="text-[12px] rounded-lg px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-900 flex items-center gap-2">
                      <AlertTriangle size={14} className="shrink-0" />
                      <span className="truncate" title={lastErr}>
                        Last error: {lastErr}
                      </span>
                    </div>
                  )}

                  {tr && (
                    <div
                      className={cls(
                        'text-[12px] rounded-lg px-3 py-1.5 border flex items-center gap-2',
                        tr.ok
                          ? 'bg-[#e8fff6] border-[#0e9f6e]/30 text-[#121212]'
                          : 'bg-red-50 border-red-200 text-red-900',
                      )}
                    >
                      {tr.ok ? <CheckCircle2 size={14} className="text-[#0e9f6e]" /> : <XCircle size={14} />}
                      <span>
                        {tr.ok
                          ? `Test passed in ${tr.latency_ms}ms · ${tr.model} replied: "${tr.reply}"`
                          : `Test failed (${tr.latency_ms}ms): ${tr.error}`}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Per-Staff Fair-Share Usage Table */}
      <div className="swk-card border border-line bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-[#0e9f6e]" />
            <h3 className="m-0 text-[14.5px] font-display font-bold text-ink">
              Per-Staff Daily AI Usage ({healthQ.data?.date ?? 'Today'})
            </h3>
          </div>
          <span className="text-[12px] text-muted">
            Tracks all 20+ staff accounts against fair-share daily request limits.
          </span>
        </div>

        {staffUsage.length === 0 ? (
          <div className="p-5 text-center text-[13px] text-muted">
            No Omni AI Brain requests recorded yet today.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>Staff Member</th>
                  <th>Role</th>
                  <th className="num">Requests Today</th>
                  <th className="num">Daily Limit</th>
                  <th className="num">Tokens Today</th>
                  <th>Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {staffUsage.map(u => {
                  const pct = u.daily_limit && u.daily_limit > 0 ? Math.min(100, Math.round((u.req_count / u.daily_limit) * 100)) : 0
                  return (
                    <tr key={u.user_id}>
                      <td>
                        <div className="font-semibold text-ink">{u.name}</div>
                        <div className="text-[11.5px] text-muted">{u.email}</div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span>{u.role_name}</span>
                          {u.exempt && <Badge value="Exempt" tone="green" />}
                        </div>
                      </td>
                      <td className="num font-semibold">{u.req_count.toLocaleString()}</td>
                      <td className="num">
                        {u.exempt || u.daily_limit === null || u.daily_limit === 0 ? (
                          <span className="text-muted">Unlimited</span>
                        ) : (
                          <div className="inline-flex items-center gap-2">
                            <span className="w-16 h-1.5 rounded-full bg-soft overflow-hidden inline-block">
                              <span
                                className={cls(
                                  'block h-full rounded-full',
                                  pct >= 90 ? 'bg-red-600' : pct >= 70 ? 'bg-amber-500' : 'bg-[#0e9f6e]',
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </span>
                            <span>{u.daily_limit.toLocaleString()}</span>
                          </div>
                        )}
                      </td>
                      <td className="num">{u.token_count.toLocaleString()}</td>
                      <td className="text-[12px] text-muted">{u.updated_at?.replace('T', ' ').slice(0, 19)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Route Modal */}
      {modalOpen && (
        <RouteEditorModal
          presets={presets}
          initialPresetKey={initialPresetKey}
          editing={editingRoute}
          onClose={() => setModalOpen(false)}
          onSaved={async () => {
            setModalOpen(false)
            await refreshAll()
          }}
        />
      )}
    </div>
  )
}

function RouteEditorModal({
  presets,
  initialPresetKey,
  editing,
  onClose,
  onSaved,
}: {
  presets: OmniPreset[]
  initialPresetKey: string
  editing: OmniRouteItem | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const toast = useToast()
  const findPreset = (k: string) => presets.find(p => p.key === k) ?? presets[0]
  const startPreset = findPreset(editing?.provider_key ?? initialPresetKey)

  const [providerKey, setProviderKey] = useState(editing?.provider_key ?? startPreset?.key ?? 'gemini')
  const [label, setLabel] = useState(editing?.label ?? (startPreset ? `${startPreset.label}` : 'New AI Route'))
  const [baseUrl, setBaseUrl] = useState(editing?.base_url ?? startPreset?.baseUrl ?? '')
  const [modelId, setModelId] = useState(editing?.model_id ?? startPreset?.defaultModel ?? '')
  const [apiKey, setApiKey] = useState('')
  const [clearKey, setClearKey] = useState(false)
  const [lanes, setLanes] = useState<OmniLane[]>(editing?.lanes ?? startPreset?.lanes ?? ['general'])
  const [tier, setTier] = useState<OmniTier>(editing?.tier ?? startPreset?.tier ?? 'free')
  const [priority, setPriority] = useState<number>(editing?.priority ?? 100)
  const [zeroRetention, setZeroRetention] = useState<boolean>(
    editing?.zero_retention ?? startPreset?.zeroRetentionDefault ?? false,
  )
  const [rpmLimit, setRpmLimit] = useState<number>(editing?.rpm_limit ?? startPreset?.rpmLimitDefault ?? 30)
  const [rpdLimit, setRpdLimit] = useState<number>(editing?.rpd_limit ?? startPreset?.rpdLimitDefault ?? 1000)
  const [enabled, setEnabled] = useState<boolean>(editing?.enabled ?? true)
  const [busy, setBusy] = useState(false)

  const currentPreset = presets.find(p => p.key === providerKey)

  const applyPreset = (key: string) => {
    setProviderKey(key)
    const p = presets.find(x => x.key === key)
    if (!p) return
    if (!editing) {
      setLabel(p.label)
      setBaseUrl(p.baseUrl)
      setModelId(p.defaultModel)
      setLanes([...p.lanes])
      setTier(p.tier)
      setZeroRetention(p.zeroRetentionDefault)
      setRpmLimit(p.rpmLimitDefault)
      setRpdLimit(p.rpdLimitDefault)
    }
  }

  const toggleLane = (lane: OmniLane) => {
    setLanes(prev => (prev.includes(lane) ? prev.filter(x => x !== lane) : [...prev, lane]))
  }

  const submit = async () => {
    if (!label.trim()) return toast.error('Route label is required')
    if (!baseUrl.trim()) return toast.error('Base URL is required')
    if (!modelId.trim()) return toast.error('Model ID is required')
    if (!lanes.length) return toast.error('Select at least one lane')

    setBusy(true)
    try {
      if (editing) {
        const body: Record<string, any> = {
          label: label.trim(),
          provider_key: providerKey,
          base_url: baseUrl.trim(),
          model_id: modelId.trim(),
          lanes,
          tier,
          priority: Math.max(1, Number(priority) || 100),
          zero_retention: zeroRetention,
          rpm_limit: Math.max(1, Number(rpmLimit) || 30),
          rpd_limit: Math.max(1, Number(rpdLimit) || 1000),
          enabled,
        }
        if (clearKey) body.clear_api_key = true
        else if (apiKey.trim()) body.api_key = apiKey.trim()
        await api('PATCH', `/api/omni-ai/routes/${editing.id}`, body)
        toast.ok(`Updated ${label.trim()}`)
      } else {
        await post('/api/omni-ai/routes', {
          label: label.trim(),
          provider_key: providerKey,
          base_url: baseUrl.trim(),
          api_key: apiKey.trim(),
          model_id: modelId.trim(),
          lanes,
          tier,
          priority: Math.max(1, Number(priority) || 100),
          zero_retention: zeroRetention,
          rpm_limit: Math.max(1, Number(rpmLimit) || 30),
          rpd_limit: Math.max(1, Number(rpdLimit) || 1000),
          enabled,
        })
        toast.ok(`Added ${label.trim()} to Omni-Route pool`)
      }
      await onSaved()
    } catch (e: any) {
      toast.error(e.message || 'Could not save Omni-Route')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? `Edit Omni-Route: ${editing.label}` : 'Add Omni-Route Provider / Key'}
      width={720}
      footer={
        <>
          <button type="button" className="btn outline" onClick={onClose}>
            Cancel
          </button>
          <div className="flex-1" />
          <button type="button" className="btn green" disabled={busy} onClick={() => void submit()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {editing ? 'Save Changes' : 'Create Route'}
          </button>
        </>
      }
    >
      <div className="grid gap-4">
        {currentPreset && (
          <div className="rounded-xl border border-line bg-soft p-3 text-[12.5px] text-body">
            <div className="font-semibold text-ink">
              {currentPreset.label} · {currentPreset.quotaSummary}
            </div>
            <div className="text-muted mt-0.5">{currentPreset.notes}</div>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">Provider Preset</label>
            <select
              className="select"
              value={providerKey}
              onChange={e => applyPreset(e.target.value)}
            >
              {presets.map(p => (
                <option key={p.key} value={p.key}>
                  {p.label} ({p.tier})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Route Label (e.g. Gemini Key #2)</label>
            <input className="input" value={label} onChange={e => setLabel(e.target.value)} />
          </div>

          <div className="md:col-span-2">
            <label className="label">OpenAI-Compatible Base URL</label>
            <input
              className="input font-mono text-[13px]"
              value={baseUrl}
              placeholder="https://api.example.com/v1"
              onChange={e => setBaseUrl(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Model ID (Editable anytime)</label>
            <input
              className="input font-mono text-[13px]"
              value={modelId}
              placeholder="e.g. gemini-2.5-flash"
              onChange={e => setModelId(e.target.value)}
            />
            {currentPreset && currentPreset.models.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {currentPreset.models.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setModelId(m.id)
                      setLanes([...m.lanes])
                    }}
                    className={cls(
                      'px-2 py-0.5 rounded-md text-[11px] border cursor-pointer',
                      modelId === m.id
                        ? 'bg-[#121212] text-[#51fec0] border-[#0e9f6e]'
                        : 'bg-soft text-body border-line hover:bg-hover',
                    )}
                    title={m.notes}
                  >
                    {m.id}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="label flex items-center gap-1.5">
              <KeyRound size={12} /> API Key{' '}
              {editing?.has_key && <span className="text-[#0e9f6e]">(already stored — leave blank to keep)</span>}
            </label>
            <input
              type="password"
              autoComplete="new-password"
              className="input"
              disabled={clearKey}
              placeholder={
                editing?.has_key
                  ? '•••••••• (enter new key to replace)'
                  : currentPreset && !currentPreset.keyRequired
                    ? 'Optional for local / custom endpoint'
                    : 'Paste provider API key'
              }
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
            />
            {editing?.has_key && (
              <label className="flex items-center gap-2 text-[12px] text-muted mt-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clearKey}
                  onChange={e => {
                    setClearKey(e.target.checked)
                    if (e.target.checked) setApiKey('')
                  }}
                />
                Clear stored API key
              </label>
            )}
          </div>

          <div>
            <label className="label">Tier</label>
            <select className="select" value={tier} onChange={e => setTier(e.target.value as OmniTier)}>
              <option value="free">Free Tier (PII Shield ON unless Zero-Retention)</option>
              <option value="tier1">Tier-1 Paid Reserve</option>
              <option value="local">Local On-Premise (Ollama)</option>
            </select>
          </div>

          <div>
            <label className="label">Priority (1 = highest priority)</label>
            <input
              type="number"
              min={1}
              max={10000}
              className="input"
              value={priority}
              onChange={e => setPriority(Number(e.target.value) || 100)}
            />
          </div>

          <div>
            <label className="label">RPM Limit</label>
            <input
              type="number"
              min={1}
              max={100000}
              className="input"
              value={rpmLimit}
              onChange={e => setRpmLimit(Number(e.target.value) || 30)}
            />
          </div>

          <div>
            <label className="label">RPD Limit</label>
            <input
              type="number"
              min={1}
              max={10000000}
              className="input"
              value={rpdLimit}
              onChange={e => setRpdLimit(Number(e.target.value) || 1000)}
            />
          </div>
        </div>

        <div>
          <label className="label">Routing Lanes</label>
          <div className="flex flex-wrap gap-2">
            {ALL_LANES.map(l => {
              const active = lanes.includes(l.key)
              return (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => toggleLane(l.key)}
                  className={cls(
                    'px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border cursor-pointer transition-colors',
                    active
                      ? 'bg-[#121212] text-[#51fec0] border-[#0e9f6e]'
                      : 'bg-soft text-body border-line hover:bg-hover',
                  )}
                >
                  {l.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-start gap-2.5 p-3 rounded-xl border border-line bg-soft cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={zeroRetention}
              onChange={e => setZeroRetention(e.target.checked)}
            />
            <span className="text-[12.5px]">
              <b className="text-ink flex items-center gap-1">
                <ShieldAlert size={13} className="text-[#0e9f6e]" /> Zero-Retention Provider
              </b>
              <span className="text-muted">Eligible for Leadership Confidential Mode without PII redaction.</span>
            </span>
          </label>

          <label className="flex items-start gap-2.5 p-3 rounded-xl border border-line bg-soft cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={enabled}
              onChange={e => setEnabled(e.target.checked)}
            />
            <span className="text-[12.5px]">
              <b className="text-ink flex items-center gap-1">
                <Cpu size={13} className="text-[#0e9f6e]" /> Route Enabled
              </b>
              <span className="text-muted">Include this endpoint in active Omni-Route load balancing &amp; failover.</span>
            </span>
          </label>
        </div>
      </div>
    </Modal>
  )
}
