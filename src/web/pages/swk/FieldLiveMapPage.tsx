import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  AlertTriangle,
  Battery,
  Clock,
  Eye,
  History,
  Loader2,
  MapPin,
  MapPinned,
  MessagesSquare,
  Navigation,
  PhoneCall,
  RefreshCw,
  Route,
  ShieldAlert,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import { canAccessFieldLiveMap } from '@shared/swk-staff-access'
import { get, post } from '../../lib/api'
import { buildStreamUrl } from '../../lib/chatLive'
import { useMeta } from '../../lib/meta'
import { useToast } from '../../lib/toast'
import { ModuleHeader, Pill } from '../../swk/ui'
import { ErrorBox, Loading, useDialogs } from '../../ui/kit'

const DUBAI_CENTER: [number, number] = [25.2048, 55.2708]

interface LiveAgentPin {
  user_id: number
  employee_id: number | null
  field_session_id: number | null
  lat: number
  lng: number
  accuracy_m: number | null
  speed_mps: number | null
  heading: number | null
  battery_pct: number | null
  purpose: string | null
  community: string | null
  is_flagged: number | boolean
  flag_reason: string | null
  updated_at: string
  user_name: string
  user_email: string
  designation: string | null
  emp_no: string | null
  phone: string | null
  session_no: string | null
  session_status: string | null
  assigned_location: string | null
  started_at: string | null
  duty_date: string | null
  sos_triggered: number | boolean | null
  sos_reason: string | null
}

interface ClosedSessionSummary {
  id: number
  session_no: string
  employee_id: number
  duty_date: string
  status: string
  assigned_location: string
  started_at: string | null
  ended_at: string | null
  sos_triggered: number | boolean | null
  employee_name: string | null
  emp_no: string | null
  user_id: number | null
}

interface TrailPoint {
  lat: number
  lng: number
  accuracy_m: number | null
  speed_mps: number | null
  heading: number | null
  battery_pct: number | null
  recorded_at: string
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'SW'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase()
}

function fmtDubaiTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const norm = iso.length === 16 ? `${iso}:00Z` : iso
  const d = new Date(norm)
  if (Number.isNaN(d.getTime())) return String(iso)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(d)
}

function makeAgentMarkerIcon(agent: LiveAgentPin, selected: boolean): L.DivIcon {
  const isSos = agent.session_status === 'SOS Emergency Active' || Boolean(agent.sos_triggered)
  const isFlagged = Boolean(agent.is_flagged)
  const bg = isSos ? '#dc2626' : isFlagged ? '#d97706' : '#0e9f6e'
  const border = selected ? '#121212' : '#ffffff'
  const initials = escapeHtml(initialsOf(agent.user_name || 'Agent'))
  const ring = isSos ? 'box-shadow: 0 0 0 6px rgba(220,38,38,0.28);' : selected ? 'box-shadow: 0 0 0 4px rgba(18,18,18,0.22);' : 'box-shadow: 0 4px 12px rgba(0,0,0,0.24);'

  return L.divIcon({
    className: 'swk-gps-marker',
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    html: `<div style="width:38px;height:38px;border-radius:9999px;background:${bg};color:#fff;border:3px solid ${border};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;font-family:system-ui,sans-serif;${ring}">${initials}</div>`,
  })
}

export default function FieldLiveMapPage() {
  const { me, loading: metaLoading } = useMeta()
  const toast = useToast()
  const dlg = useDialogs()
  const navigate = useNavigate()

  const allowed = canAccessFieldLiveMap(me)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [agents, setAgents] = useState<LiveAgentPin[]>([])
  const agentsRef = useRef<LiveAgentPin[]>([])
  agentsRef.current = agents
  const [recentClosed, setRecentClosed] = useState<ClosedSessionSummary[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [streamStatus, setStreamStatus] = useState<'connecting' | 'live' | 'reconnecting'>('connecting')

  const [trailLoading, setTrailLoading] = useState(false)
  const [activeTrail, setActiveTrail] = useState<{
    sessionId: number
    sessionNo: string
    agentName: string
    points: TrailPoint[]
    totalDistanceM: number
  } | null>(null)
  const [openingChatUserId, setOpeningChatUserId] = useState<number | null>(null)

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<number, L.Marker>>(new Map())
  const polylineRef = useRef<L.Polyline | null>(null)

  const selectedAgent = useMemo(
    () => agents.find(a => a.user_id === selectedUserId) ?? null,
    [agents, selectedUserId],
  )

  const loadLiveAgents = useCallback(async (silent = false) => {
    if (!allowed) return
    if (!silent) setLoading(true)
    try {
      const res = await get<{ rows: LiveAgentPin[]; recent_closed_sessions?: ClosedSessionSummary[] }>('/api/field-gps/live')
      setAgents(res.rows || [])
      if (Array.isArray(res.recent_closed_sessions)) {
        setRecentClosed(res.recent_closed_sessions)
      }
      setError('')
    } catch (e: any) {
      if (!silent) setError(e?.message || 'Unable to load Live Field GPS Map')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [allowed])

  const loadSessionTrail = useCallback(
    async (sessionId: number, labelName: string, sessionNo: string, reason?: string) => {
      setTrailLoading(true)
      try {
        const res = await get<{
          session: any
          points: TrailPoint[]
          total_distance_m?: number
        }>(`/api/field-gps/sessions/${sessionId}/trail`, reason ? { reason } : undefined)
        const pts = res.points || []
        setActiveTrail({
          sessionId,
          sessionNo: res.session?.session_no || sessionNo,
          agentName: labelName,
          points: pts,
          totalDistanceM: Number(res.total_distance_m ?? 0),
        })
        if (pts.length === 0) {
          toast.ok(`Loaded ${sessionNo}: no trail points recorded yet`)
        }
      } catch (err: any) {
        if (Number(err?.status) === 400 && !reason) {
          const entered = await dlg.prompt({
            title: 'Control 3.10 / 7.03 · Historical Trail Access Reason',
            label: 'Documented reason (minimum 8 characters)',
            message: 'Accessing closed historical or off-hours employee GPS telemetry requires an auditable business or emergency reason.',
            required: true,
            multiline: true,
            ok: 'Log Reason & Load Trail',
          })
          if (entered && entered.trim().length >= 8) {
            await loadSessionTrail(sessionId, labelName, sessionNo, entered.trim())
            return
          }
          if (entered !== null) {
            toast.error('Reason must be at least 8 characters')
          }
        } else {
          toast.error(err?.message || 'Could not load session trail')
        }
      } finally {
        setTrailLoading(false)
      }
    },
    [dlg, toast],
  )

  useEffect(() => {
    if (!allowed) {
      setLoading(false)
      return
    }
    void loadLiveAgents(false)
  }, [allowed, loadLiveAgents])

  // Real-time SSE connection via /api/field-gps/stream
  useEffect(() => {
    if (!allowed || typeof EventSource === 'undefined') return
    let stopped = false
    let es: EventSource | null = null
    let reconnectTimer: number | null = null

    const connect = async () => {
      if (stopped) return
      setStreamStatus('connecting')
      const url = await buildStreamUrl('/api/field-gps/stream')
      if (stopped) return
      const next = new EventSource(url)
      es = next

      next.onopen = () => {
        setStreamStatus('live')
      }

      next.addEventListener('field_gps', (ev) => {
        try {
          const payload = JSON.parse((ev as MessageEvent).data) as any
          if (payload.type === 'session_stopped' || payload.type === 'session_expired') {
            setAgents(prev => prev.filter(a => a.user_id !== payload.user_id && a.field_session_id !== payload.field_session_id))
            return
          }
          if (payload.type === 'sos') {
            toast.error(`SOS EMERGENCY: ${payload.name || 'Field Agent'} (${Number(payload.lat).toFixed(4)}, ${Number(payload.lng).toFixed(4)})`)
          } else if (payload.type === 'spoof') {
            toast.error(`Mock GPS blocked: ${payload.name || 'Field Agent'}`)
          }

          if (payload.user_id && Number.isFinite(Number(payload.lat)) && Number.isFinite(Number(payload.lng))) {
            if (!agentsRef.current.some(a => a.user_id === payload.user_id)) {
              void loadLiveAgents(true)
              return
            }
            setAgents(prev => {
              const idx = prev.findIndex(a => a.user_id === payload.user_id)
              if (idx === -1) return prev
              const updated = [...prev]
              updated[idx] = {
                ...updated[idx]!,
                lat: Number(payload.lat),
                lng: Number(payload.lng),
                accuracy_m: payload.accuracy_m ?? updated[idx]!.accuracy_m,
                speed_mps: payload.speed_mps ?? updated[idx]!.speed_mps,
                heading: payload.heading ?? updated[idx]!.heading,
                battery_pct: payload.battery_pct ?? updated[idx]!.battery_pct,
                purpose: payload.purpose ?? updated[idx]!.purpose,
                community: payload.community ?? updated[idx]!.community,
                is_flagged: payload.is_flagged !== undefined ? (payload.is_flagged ? 1 : 0) : updated[idx]!.is_flagged,
                flag_reason: payload.flag_reason !== undefined ? payload.flag_reason : updated[idx]!.flag_reason,
                session_status: payload.session_status ?? (payload.type === 'sos' ? 'SOS Emergency Active' : updated[idx]!.session_status),
                sos_triggered: payload.type === 'sos' ? 1 : updated[idx]!.sos_triggered,
                updated_at: payload.updated_at || new Date().toISOString(),
              }
              return updated
            })
          } else {
            void loadLiveAgents(true)
          }
        } catch {
          /* ignore malformed SSE payload */
        }
      })

      next.onerror = () => {
        if (es === next) {
          next.close()
          es = null
        }
        if (stopped) return
        setStreamStatus('reconnecting')
        if (reconnectTimer === null) {
          reconnectTimer = window.setTimeout(() => {
            reconnectTimer = null
            void connect()
          }, 3000)
        }
      }
    }

    void connect()
    return () => {
      stopped = true
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      if (es) es.close()
    }
  }, [allowed, loadLiveAgents, toast])

  // Initialize Leaflet Map once and destroy cleanly on unmount
  useEffect(() => {
    if (!allowed || metaLoading || loading || error) return
    const el = mapContainerRef.current
    if (!el || mapRef.current) return

    const map = L.map(el, {
      center: DUBAI_CENTER,
      zoom: 11,
      zoomControl: true,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
    mapRef.current = map

    return () => {
      markersRef.current.forEach(m => m.remove())
      markersRef.current.clear()
      if (polylineRef.current) {
        polylineRef.current.remove()
        polylineRef.current = null
      }
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [allowed, metaLoading, loading, error])

  // Sync live markers on Leaflet map
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const activeIds = new Set(agents.map(a => a.user_id))
    markersRef.current.forEach((marker, uid) => {
      if (!activeIds.has(uid)) {
        marker.remove()
        markersRef.current.delete(uid)
      }
    })

    for (const agent of agents) {
      if (!Number.isFinite(agent.lat) || !Number.isFinite(agent.lng)) continue
      const icon = makeAgentMarkerIcon(agent, agent.user_id === selectedUserId)
      const existing = markersRef.current.get(agent.user_id)
      const label = `${escapeHtml(agent.user_name)} · ${escapeHtml(agent.community || agent.assigned_location || 'Dubai')}`
      if (existing) {
        existing.setLatLng([agent.lat, agent.lng])
        existing.setIcon(icon)
        existing.bindTooltip(label)
      } else {
        const marker = L.marker([agent.lat, agent.lng], { icon })
          .bindTooltip(label)
          .on('click', () => {
            setSelectedUserId(agent.user_id)
            if (agent.field_session_id) {
              void loadSessionTrail(agent.field_session_id, agent.user_name, agent.session_no || `Session #${agent.field_session_id}`)
            }
          })
          .addTo(map)
        markersRef.current.set(agent.user_id, marker)
      }
    }
  }, [agents, selectedUserId, loadSessionTrail])

  // Draw selected route polyline
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (polylineRef.current) {
      polylineRef.current.remove()
      polylineRef.current = null
    }
    if (!activeTrail || activeTrail.points.length === 0) return
    const latLngs: L.LatLngExpression[] = activeTrail.points.map(p => [p.lat, p.lng])
    polylineRef.current = L.polyline(latLngs, { color: '#0e9f6e', weight: 4, opacity: 0.9 }).addTo(map)
    if (latLngs.length > 1) {
      map.fitBounds(polylineRef.current.getBounds(), { padding: [36, 36], maxZoom: 16 })
    } else {
      map.setView(latLngs[0]!, 15)
    }
  }, [activeTrail])

  const openAgentChat = async (userId: number) => {
    setOpeningChatUserId(userId)
    try {
      const res = await post<{ id: number }>('/api/chat/threads', { user_ids: [userId] })
      navigate(res?.id ? `/chat?t=${res.id}` : '/chat')
    } catch {
      navigate('/chat')
    } finally {
      setOpeningChatUserId(null)
    }
  }

  const selectAgent = (agent: LiveAgentPin) => {
    setSelectedUserId(agent.user_id)
    if (mapRef.current && Number.isFinite(agent.lat) && Number.isFinite(agent.lng)) {
      mapRef.current.setView([agent.lat, agent.lng], Math.max(mapRef.current.getZoom(), 14))
    }
    if (agent.field_session_id) {
      void loadSessionTrail(agent.field_session_id, agent.user_name, agent.session_no || `Session #${agent.field_session_id}`)
    }
  }

  if (metaLoading || loading) return <Loading label="Loading Leadership Field Live Map…" />
  if (!allowed) {
    return (
      <ErrorBox
        error={new Error('Live Field GPS Map is restricted exclusively to Owner Shabib (shabib@swk.properties), Admin (admin@swk.properties), and Operations Manager Haseeb (haseeb@swk.properties).')}
      />
    )
  }
  if (error) return <ErrorBox error={new Error(error)} onRetry={() => void loadLiveAgents(false)} />

  const sosCount = agents.filter(a => a.session_status === 'SOS Emergency Active' || a.sos_triggered).length
  const flaggedCount = agents.filter(a => Boolean(a.is_flagged)).length

  return (
    <div className="space-y-6 pb-10">
      <ModuleHeader
        eyebrow="Control 3.10 / 7.03 · Leadership Field Presence"
        title="Live Field GPS Map"
        subtitle="Real-time Dubai field team pins, route trails, and SOS/anti-spoof alerts. Every map access is logged to Location Privacy Logs."
        icon={<MapPinned size={22} />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={streamStatus === 'live' ? 'oasis' : 'champ'}>
              {streamStatus === 'live' ? 'SSE LIVE' : streamStatus === 'connecting' ? 'CONNECTING' : 'RECONNECTING'}
            </Pill>
            <button type="button" className="btn outline text-xs gap-1.5" onClick={() => void loadLiveAgents(false)}>
              <RefreshCw size={13} /> Refresh Pins
            </button>
            <Link to="/e/location_access_logs" className="btn outline text-xs gap-1.5">
              <Eye size={13} /> Privacy Audit Logs
            </Link>
          </div>
        }
      />

      {sosCount > 0 && (
        <div role="alert" className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-rose-900 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm font-semibold">
            <ShieldAlert size={18} className="text-rose-600 shrink-0" />
            {sosCount} SOS Emergency Alert{sosCount > 1 ? 's' : ''} Active — Click the pulsing red marker to view exact coordinates and contact the agent immediately.
          </div>
          <Pill tone="dune">URGENT SOS</Pill>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Map + Selected Agent Drawer */}
        <div className="lg:col-span-8 space-y-4">
          <section className="swk-card overflow-hidden relative">
            <div className="px-5 py-3 border-b border-[#e5e5e5] flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-ink flex items-center gap-1.5">
                  <Users size={14} /> {agents.length} Active on Field Duty
                </span>
                {flaggedCount > 0 && (
                  <span className="text-amber-700 font-semibold flex items-center gap-1">
                    <AlertTriangle size={13} /> {flaggedCount} Flagged
                  </span>
                )}
              </div>
              {activeTrail && (
                <div className="flex items-center gap-2 text-[#0e9f6e] font-semibold">
                  <Route size={13} />
                  <span>
                    {activeTrail.agentName} ({activeTrail.sessionNo}) · {activeTrail.points.length} pts · {(activeTrail.totalDistanceM / 1000).toFixed(2)} km
                  </span>
                  <button
                    type="button"
                    className="text-muted hover:text-ink bg-transparent border-0 cursor-pointer p-0.5"
                    aria-label="Clear trail"
                    onClick={() => setActiveTrail(null)}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
            <div ref={mapContainerRef} className="w-full h-[460px] bg-[#eef4f2]" />
          </section>

          {/* Selected Agent Drawer */}
          {selectedAgent && (
            <section className="swk-card p-5 space-y-4 border-l-4 border-l-[#0e9f6e]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-ink m-0">{selectedAgent.user_name}</h2>
                    <Pill tone={selectedAgent.session_status === 'SOS Emergency Active' || selectedAgent.sos_triggered ? 'dune' : selectedAgent.is_flagged ? 'champ' : 'oasis'}>
                      {selectedAgent.session_status || 'Active (On Duty)'}
                    </Pill>
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {selectedAgent.emp_no || 'Staff'} · {selectedAgent.designation || selectedAgent.user_email} · {selectedAgent.session_no || 'Field Session'}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={openingChatUserId === selectedAgent.user_id}
                    onClick={() => void openAgentChat(selectedAgent.user_id)}
                    className="btn green text-xs gap-1.5"
                  >
                    {openingChatUserId === selectedAgent.user_id ? <Loader2 size={13} className="animate-spin" /> : <MessagesSquare size={14} />}
                    Message on Inside
                  </button>
                  <Link to="/phone" className="btn outline text-xs gap-1.5">
                    <PhoneCall size={14} /> Call via SIP
                  </Link>
                  <button
                    type="button"
                    aria-label="Close agent drawer"
                    className="btn ghost sm"
                    onClick={() => setSelectedUserId(null)}
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              {Boolean(selectedAgent.is_flagged) && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-900 flex items-center gap-2 font-medium">
                  <AlertTriangle size={15} className="text-rose-600 shrink-0" />
                  <span>Warning: {selectedAgent.flag_reason || 'Anomaly flagged for review'}</span>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="rounded-xl bg-[#f7f7f7] p-3">
                  <div className="text-muted flex items-center gap-1"><MapPin size={12} /> Purpose / Site</div>
                  <div className="font-semibold text-ink mt-1 truncate">
                    {[selectedAgent.purpose, selectedAgent.community || selectedAgent.assigned_location].filter(Boolean).join(' · ') || 'Field Duty'}
                  </div>
                </div>
                <div className="rounded-xl bg-[#f7f7f7] p-3">
                  <div className="text-muted flex items-center gap-1"><Battery size={12} /> Battery</div>
                  <div className="font-semibold text-ink mt-1">
                    {selectedAgent.battery_pct !== null && selectedAgent.battery_pct !== undefined ? `${selectedAgent.battery_pct}%` : '—'}
                  </div>
                </div>
                <div className="rounded-xl bg-[#f7f7f7] p-3">
                  <div className="text-muted flex items-center gap-1"><Navigation size={12} /> Speed &amp; Accuracy</div>
                  <div className="font-semibold text-ink mt-1">
                    {selectedAgent.speed_mps !== null && selectedAgent.speed_mps !== undefined
                      ? `${(selectedAgent.speed_mps * 3.6).toFixed(1)} km/h`
                      : '0.0 km/h'} · ±{Math.round(selectedAgent.accuracy_m ?? 0)}m
                  </div>
                </div>
                <div className="rounded-xl bg-[#f7f7f7] p-3">
                  <div className="text-muted flex items-center gap-1"><Clock size={12} /> Last Ping</div>
                  <div className="font-semibold text-ink mt-1">{fmtDubaiTime(selectedAgent.updated_at)}</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
                <span className="font-mono text-muted">
                  Coordinates: {Number(selectedAgent.lat).toFixed(5)}, {Number(selectedAgent.lng).toFixed(5)}
                </span>
                {selectedAgent.field_session_id && (
                  <button
                    type="button"
                    disabled={trailLoading}
                    onClick={() =>
                      void loadSessionTrail(
                        selectedAgent.field_session_id!,
                        selectedAgent.user_name,
                        selectedAgent.session_no || `Session #${selectedAgent.field_session_id}`,
                      )
                    }
                    className="btn sm outline gap-1.5"
                  >
                    {trailLoading ? <Loader2 size={13} className="animate-spin" /> : <Route size={13} />}
                    Reload Route Polyline
                  </button>
                )}
              </div>
            </section>
          )}
        </div>

        {/* Right column: Active Field Agents & Historical Session Audit */}
        <div className="lg:col-span-4 space-y-4">
          <section className="swk-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink m-0">Active Field Staff ({agents.length})</h2>
              <ShieldCheck size={15} className="text-[#0e9f6e]" />
            </div>

            {agents.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted">
                No field staff are currently on active GPS duty.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                {agents.map(agent => {
                  const isSos = agent.session_status === 'SOS Emergency Active' || Boolean(agent.sos_triggered)
                  const isSel = agent.user_id === selectedUserId
                  return (
                    <div
                      key={agent.user_id}
                      onClick={() => selectAgent(agent)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') selectAgent(agent) }}
                      className={`rounded-xl border p-3 cursor-pointer transition ${
                        isSel
                          ? 'border-[#0e9f6e] bg-[#f4fbf8]'
                          : isSos
                            ? 'border-rose-300 bg-rose-50/70'
                            : 'border-[#e5e5e5] bg-white hover:border-[#0e9f6e]/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-ink truncate">{agent.user_name}</span>
                        <Pill tone={isSos ? 'dune' : agent.is_flagged ? 'champ' : 'oasis'}>
                          {isSos ? 'SOS' : agent.is_flagged ? 'FLAGGED' : 'ON DUTY'}
                        </Pill>
                      </div>
                      <div className="text-xs text-muted mt-1 truncate">
                        {[agent.purpose, agent.community || agent.assigned_location].filter(Boolean).join(' · ') || 'Dubai Field Duty'}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
                        <span>±{Math.round(agent.accuracy_m ?? 0)}m · {agent.battery_pct !== null && agent.battery_pct !== undefined ? `${agent.battery_pct}% bat` : 'bat n/a'}</span>
                        <span>{fmtDubaiTime(agent.updated_at)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="swk-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink m-0 flex items-center gap-1.5">
                <History size={15} /> Recent Closed Visits
              </h2>
              <span className="text-[11px] text-muted">Audit reason gated</span>
            </div>
            {recentClosed.length === 0 ? (
              <div className="text-xs text-muted py-4 text-center">No closed field visits recorded yet.</div>
            ) : (
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1 text-xs">
                {recentClosed.map(s => (
                  <div key={s.id} className="rounded-xl border border-[#ececec] p-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-ink truncate">{s.employee_name || `Emp #${s.employee_id}`} · {s.session_no}</div>
                      <div className="text-[11px] text-muted truncate">{s.duty_date} · {s.status} · {s.assigned_location}</div>
                    </div>
                    <button
                      type="button"
                      className="btn sm outline shrink-0"
                      onClick={() => void loadSessionTrail(s.id, s.employee_name || `Session ${s.session_no}`, s.session_no)}
                    >
                      Trail
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
