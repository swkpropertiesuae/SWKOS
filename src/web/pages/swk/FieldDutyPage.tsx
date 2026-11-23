import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  AlertTriangle,
  Battery,
  ClipboardCheck,
  Clock,
  Loader2,
  MapPin,
  MapPinned,
  Navigation,
  Play,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Square,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { get, post } from '../../lib/api'
import { useMeta } from '../../lib/meta'
import { useToast } from '../../lib/toast'
import { ModuleHeader, Pill } from '../../swk/ui'
import { ErrorBox, Loading, Modal } from '../../ui/kit'

const PURPOSES = ['Viewing', 'Snagging', 'Developer Visit', 'Key Handover', 'DLD Trustee'] as const

const DUBAI_COMMUNITIES = [
  'Dubai Marina',
  'Downtown Dubai',
  'Palm Jumeirah',
  'Business Bay',
  'Dubai Hills Estate',
  'Dubai Creek Harbour',
  'Jumeirah Village Circle',
  'Jumeirah Lakes Towers (JLT)',
  'Arabian Ranches',
  'DIFC',
  'MBR City & Sobha Hartland',
  'Emaar Beachfront',
  'Dubai South & Expo City',
  'DAMAC Hills & DAMAC Lagoons',
  'Al Furjan',
  'Arjan & Miracle Garden',
  'Bluewaters Island',
  'Other / Custom',
] as const

interface TrailPoint {
  lat: number
  lng: number
  accuracy_m: number | null
  speed_mps: number | null
  heading: number | null
  battery_pct: number | null
  recorded_at: string
}

interface QueuedPing {
  field_session_id: number
  lat: number
  lng: number
  accuracy_m: number
  speed_mps: number | null
  heading: number | null
  battery_pct: number | null
  is_mock: boolean
  recorded_at: string
  idempotency_key: string
  offline_replay?: boolean
}

interface MySessionResponse {
  session: any | null
  latest_today_session: any | null
  live_location: any | null
  points: TrailPoint[]
  batches_count: number
  config: {
    max_accuracy_m: number
    auto_stop_hour_dubai: number
    retention_days: number
  }
}

function fmtDubaiTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(d)
}

function makePingKey(userId: number): string {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 12)
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  return `fgps-${userId}-${Date.now()}-${rand}`
}

function readQueue(storageKey: string): QueuedPing[] {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeQueue(storageKey: string, items: QueuedPing[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(items.slice(-250)))
  } catch {
    /* ignore storage quota errors */
  }
}

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const R = 6371000
  const dLat = rad(bLat - aLat)
  const dLng = rad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function currentDevicePosition(timeoutMs = 8000): Promise<{
  lat: number
  lng: number
  accuracy_m: number
  speed_mps: number | null
  heading: number | null
  recorded_at: string
} | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : 25,
          speed_mps: pos.coords.speed !== null && Number.isFinite(pos.coords.speed) && pos.coords.speed >= 0 ? pos.coords.speed : null,
          heading: pos.coords.heading !== null && Number.isFinite(pos.coords.heading) && pos.coords.heading >= 0 ? pos.coords.heading : null,
          recorded_at: new Date(pos.timestamp || Date.now()).toISOString(),
        })
      },
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: timeoutMs },
    )
  })
}

export default function FieldDutyPage() {
  const { me } = useMeta()
  const toast = useToast()

  const storageKey = me?.id ? `swk.field_gps.queue.${me.id}` : 'swk.field_gps.queue.anon'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<MySessionResponse | null>(null)

  const [purpose, setPurpose] = useState<(typeof PURPOSES)[number]>('Viewing')
  const [communityChoice, setCommunityChoice] = useState<string>('Dubai Marina')
  const [customCommunity, setCustomCommunity] = useState('')
  const [appointmentRef, setAppointmentRef] = useState('')

  const [busy, setBusy] = useState(false)
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [batteryPct, setBatteryPct] = useState<number | null>(null)
  const batteryPctRef = useRef<number | null>(null)
  batteryPctRef.current = batteryPct
  const [queuedCount, setQueuedCount] = useState(0)
  const [latestFix, setLatestFix] = useState<{
    lat: number
    lng: number
    accuracy_m: number
    speed_mps: number | null
    recorded_at: string
  } | null>(null)
  const [gpsError, setGpsError] = useState('')
  const [spoofWarning, setSpoofWarning] = useState('')
  const [syncing, setSyncing] = useState(false)

  const [sosModalOpen, setSosModalOpen] = useState(false)
  const [sosReason, setSosReason] = useState('')
  const [sosBusy, setSosBusy] = useState(false)

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const polylineRef = useRef<L.Polyline | null>(null)
  const markerRef = useRef<L.CircleMarker | null>(null)
  const flushingRef = useRef(false)
  const sessionIdRef = useRef<number | null>(null)
  const lastFixTimestampRef = useRef<number>(0)
  const lastQueuedRef = useRef<{ lat: number; lng: number; queuedAtMs: number } | null>(null)

  const activeSession = data?.session ?? null
  sessionIdRef.current = activeSession?.id ?? null

  const loadSession = useCallback(async () => {
    try {
      const res = await get<MySessionResponse>('/api/field-gps/my-session')
      setData(res)
      setError('')
      if (res.live_location) {
        setLatestFix({
          lat: Number(res.live_location.lat),
          lng: Number(res.live_location.lng),
          accuracy_m: Number(res.live_location.accuracy_m ?? 0),
          speed_mps: res.live_location.speed_mps ?? null,
          recorded_at: res.live_location.updated_at,
        })
        if (res.live_location.is_flagged && res.live_location.flag_reason) {
          setSpoofWarning(String(res.live_location.flag_reason))
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Unable to load field duty state')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSession()
  }, [loadSession])

  // Battery & online status listeners
  useEffect(() => {
    setQueuedCount(readQueue(storageKey).length)
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    let cancelled = false
    const navAny = navigator as any
    if (typeof navAny?.getBattery === 'function') {
      navAny
        .getBattery()
        .then((bat: any) => {
          if (!cancelled && bat && Number.isFinite(bat.level)) {
            setBatteryPct(Math.round(bat.level * 100))
          }
        })
        .catch(() => {})
    }

    return () => {
      cancelled = true
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [storageKey])

  const flushQueue = useCallback(
    async (isReplay = false) => {
      if (flushingRef.current) return
      if (typeof navigator !== 'undefined' && !navigator.onLine) return
      const queue = readQueue(storageKey)
      if (!queue.length) return

      const sid = sessionIdRef.current
      const batch = (sid ? queue.filter(p => p.field_session_id === sid) : queue).slice(0, 50)
      if (!batch.length) return

      flushingRef.current = true
      setSyncing(true)
      try {
        const netAny = navigator as any
        const networkType = String(netAny?.connection?.effectiveType || (navigator.onLine ? 'online' : 'offline'))
        const res = await post<{ ok: boolean; accepted: number; flags?: string[] }>('/api/field-gps/pings', {
          field_session_id: batch[0]!.field_session_id,
          network_type: networkType,
          points: batch.map(p => ({
            ...p,
            offline_replay: isReplay || Boolean(p.offline_replay),
          })),
        })
        const syncedKeys = new Set(batch.map(p => p.idempotency_key))
        const remaining = readQueue(storageKey).filter(p => !syncedKeys.has(p.idempotency_key))
        writeQueue(storageKey, remaining)
        setQueuedCount(remaining.length)
        if (res.flags?.length) {
          setSpoofWarning(res.flags.join('; '))
        }
        await loadSession()
      } catch (err: any) {
        const status = Number(err?.status ?? 0)
        if (status === 422) {
          setSpoofWarning(err?.message || 'Mock GPS detected — telemetry rejected')
          toast.error(err?.message || 'Mock GPS detected')
          const failedKeys = new Set(batch.map(p => p.idempotency_key))
          const remaining = readQueue(storageKey).filter(p => !failedKeys.has(p.idempotency_key))
          writeQueue(storageKey, remaining)
          setQueuedCount(remaining.length)
        } else if (status === 400) {
          // Bad accuracy (>150m), stale live fix, or session already stopped: drop rejected batch
          const failedKeys = new Set(batch.map(p => p.idempotency_key))
          const remaining = readQueue(storageKey).filter(p => !failedKeys.has(p.idempotency_key))
          writeQueue(storageKey, remaining)
          setQueuedCount(remaining.length)
          if (err?.message) setGpsError(err.message)
        } else {
          // Network or server error: mark as offline_replay so next flush succeeds cleanly
          const updated = readQueue(storageKey).map(p => ({ ...p, offline_replay: true }))
          writeQueue(storageKey, updated)
          setQueuedCount(updated.length)
        }
      } finally {
        flushingRef.current = false
        setSyncing(false)
      }
    },
    [loadSession, storageKey, toast],
  )

  // Geolocation watchPosition + 20s ping batcher when on active duty
  useEffect(() => {
    if (!activeSession || !me?.id) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError('Geolocation API is not supported on this device/browser.')
      return
    }

    setGpsError('')
    lastFixTimestampRef.current = 0
    lastQueuedRef.current = null
    let watchId: number | null = null

    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setGpsError('')
          const nowMs = Date.now()
          const fixTs = Number.isFinite(pos.timestamp) && pos.timestamp > 0 ? pos.timestamp : nowMs
          if (fixTs <= lastFixTimestampRef.current) return
          lastFixTimestampRef.current = fixTs

          const acc = Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : 25
          const fix = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy_m: acc,
            speed_mps: pos.coords.speed !== null && Number.isFinite(pos.coords.speed) && pos.coords.speed >= 0 ? pos.coords.speed : null,
            heading: pos.coords.heading !== null && Number.isFinite(pos.coords.heading) && pos.coords.heading >= 0 ? pos.coords.heading : null,
            recorded_at: new Date(fixTs).toISOString(),
          }
          setLatestFix(fix)

          const maxAcc = data?.config?.max_accuracy_m || 150
          if (acc > maxAcc) {
            setGpsError(`Waiting for stronger GPS signal (±${acc}m > ${maxAcc}m max).`)
            return
          }

          const prevQ = lastQueuedRef.current
          const movedMeters = prevQ ? haversineM(prevQ.lat, prevQ.lng, fix.lat, fix.lng) : Infinity
          const elapsedSinceQueued = prevQ ? nowMs - prevQ.queuedAtMs : Infinity
          if (prevQ && movedMeters < 5 && elapsedSinceQueued < 30_000) return
          lastQueuedRef.current = { lat: fix.lat, lng: fix.lng, queuedAtMs: nowMs }

          const item: QueuedPing = {
            field_session_id: activeSession.id,
            ...fix,
            battery_pct: batteryPctRef.current,
            is_mock: false,
            idempotency_key: makePingKey(me.id),
            offline_replay: !navigator.onLine,
          }
          const nextQ = [...readQueue(storageKey), item]
          writeQueue(storageKey, nextQ)
          setQueuedCount(nextQ.length)
        },
        (err) => {
          setGpsError(err.message || 'Location permission denied or GPS unavailable.')
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
      )
    } catch (e: any) {
      setGpsError(e?.message || 'Unable to start GPS watch')
    }

    const batchTimer = window.setInterval(() => {
      void flushQueue(false)
    }, 20_000)

    const replayOnline = () => {
      void flushQueue(true)
    }
    window.addEventListener('online', replayOnline)

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
      window.clearInterval(batchTimer)
      window.removeEventListener('online', replayOnline)
    }
  }, [activeSession?.id, data?.config?.max_accuracy_m, flushQueue, me?.id, storageKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Own breadcrumb mini Leaflet map
  const trailPoints = useMemo(() => data?.points ?? [], [data?.points])

  useEffect(() => {
    if (loading || error || !me || me.party_id) return
    const el = mapContainerRef.current
    if (!el) return
    if (!mapRef.current) {
      const map = L.map(el, {
        center: [25.2048, 55.2708],
        zoom: 12,
        zoomControl: true,
      })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)
      mapRef.current = map
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        polylineRef.current = null
        markerRef.current = null
      }
    }
  }, [loading, error, me?.id, me?.party_id])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (polylineRef.current) {
      polylineRef.current.remove()
      polylineRef.current = null
    }
    if (markerRef.current) {
      markerRef.current.remove()
      markerRef.current = null
    }

    const coords: L.LatLngExpression[] = trailPoints.map(p => [p.lat, p.lng])
    if (latestFix && Number.isFinite(latestFix.lat) && Number.isFinite(latestFix.lng)) {
      const last = coords[coords.length - 1] as [number, number] | undefined
      if (!last || last[0] !== latestFix.lat || last[1] !== latestFix.lng) {
        coords.push([latestFix.lat, latestFix.lng])
      }
    }

    if (coords.length > 0) {
      polylineRef.current = L.polyline(coords, { color: '#0e9f6e', weight: 4, opacity: 0.85 }).addTo(map)
      const head = coords[coords.length - 1]!
      markerRef.current = L.circleMarker(head, {
        radius: 8,
        color: activeSession?.status === 'SOS Emergency Active' ? '#dc2626' : '#121212',
        weight: 2,
        fillColor: activeSession?.status === 'SOS Emergency Active' ? '#ef4444' : '#0e9f6e',
        fillOpacity: 0.95,
      }).addTo(map)
      if (coords.length > 1) {
        map.fitBounds(polylineRef.current.getBounds(), { padding: [28, 28], maxZoom: 16 })
      } else {
        map.setView(head, 15)
      }
    }
  }, [trailPoints, latestFix, activeSession?.status])

  const handleStartDuty = async () => {
    const community = communityChoice === 'Other / Custom' ? customCommunity.trim() : communityChoice
    if (!community) {
      toast.error('Select or enter your field destination community')
      return
    }
    setBusy(true)
    setSpoofWarning('')
    setGpsError('')
    try {
      const initialFix = await currentDevicePosition(6000)
      const maxAcc = data?.config?.max_accuracy_m || 150
      const includeCoords = initialFix && initialFix.accuracy_m <= maxAcc
      await post('/api/field-gps/sessions/start', {
        purpose,
        community,
        appointment_ref: appointmentRef.trim() || undefined,
        ...(includeCoords
          ? {
              lat: initialFix.lat,
              lng: initialFix.lng,
              accuracy_m: initialFix.accuracy_m,
              speed_mps: initialFix.speed_mps,
              heading: initialFix.heading,
              battery_pct: batteryPct,
              is_mock: false,
              recorded_at: initialFix.recorded_at,
            }
          : {}),
      })
      toast.ok(`Field duty started (${purpose} · ${community})`)
      await loadSession()
    } catch (e: any) {
      toast.error(e?.message || 'Could not start field duty')
    } finally {
      setBusy(false)
    }
  }

  const handleStopDuty = async () => {
    setBusy(true)
    try {
      await flushQueue(true)
      await post('/api/field-gps/sessions/stop', {})
      const remaining = readQueue(storageKey).filter(p => p.field_session_id !== activeSession?.id)
      writeQueue(storageKey, remaining)
      setQueuedCount(remaining.length)
      toast.ok('Field duty stopped. GPS tracking is now off.')
      await loadSession()
    } catch (e: any) {
      toast.error(e?.message || 'Could not stop field duty')
    } finally {
      setBusy(false)
    }
  }

  const handleSendSos = async () => {
    setSosBusy(true)
    try {
      const fix = (await currentDevicePosition(5000)) ?? latestFix
      await post('/api/field-gps/sos', {
        lat: fix?.lat,
        lng: fix?.lng,
        accuracy_m: fix?.accuracy_m,
        reason: sosReason.trim() || 'Emergency assistance requested from Field Duty screen',
        community: communityChoice === 'Other / Custom' ? customCommunity.trim() : communityChoice,
      })
      setSosModalOpen(false)
      setSosReason('')
      toast.ok('SOS emergency alert sent to Owner, Admin, and Operations Manager')
      await loadSession()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to transmit SOS alert')
    } finally {
      setSosBusy(false)
    }
  }

  if (loading) return <Loading label="Loading Field Duty GPS console…" />
  if (error) return <ErrorBox error={new Error(error)} onRetry={() => void loadSession()} />
  if (!me || me.party_id) {
    return <ErrorBox error={new Error('Field Duty GPS is strictly for company staff.')} />
  }

  const isSos = activeSession?.status === 'SOS Emergency Active'
  const isOnDuty = Boolean(activeSession)

  return (
    <div className="space-y-6 pb-10">
      <ModuleHeader
        eyebrow="Control 3.10 · Work-Hours Field Presence"
        title="Field Duty GPS"
        subtitle="Voluntary work-hours tracking for viewings, snagging & developer visits. Auto-stops at 21:00 Dubai time."
        icon={<MapPinned size={22} />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/reception-qr" className="btn outline text-xs">
              <QrCode size={14} /> Camera QR Check-In
            </Link>
            <Link to="/e/daily_reports?new=1" className="btn outline text-xs">
              <ClipboardCheck size={14} /> Daily Report
            </Link>
          </div>
        }
      />

      {isSos && (
        <div role="alert" className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-rose-900 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm font-semibold">
            <ShieldAlert size={18} className="text-rose-600 shrink-0" />
            SOS Emergency Active — Leadership has been notified with your live GPS coordinates.
          </div>
          <Pill tone="dune">SOS ACTIVE</Pill>
        </div>
      )}

      {spoofWarning && (
        <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 text-xs font-medium flex items-center gap-2.5">
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <span>Anti-spoof notice: {spoofWarning}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left column: Start / Stop / Live Status + SOS */}
        <div className="lg:col-span-5 space-y-4">
          <section className="swk-card p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Duty Status</div>
                <div className="text-lg font-bold text-ink mt-0.5">
                  {isSos ? 'SOS Emergency Active' : isOnDuty ? `Active · ${activeSession.session_no}` : 'Off Duty (GPS Off)'}
                </div>
              </div>
              <Pill tone={isSos ? 'dune' : isOnDuty ? 'oasis' : 'grey'}>
                {isSos ? 'SOS' : isOnDuty ? 'ON DUTY' : 'STANDBY'}
              </Pill>
            </div>

            {/* Live telemetry badges */}
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="rounded-xl border border-[#e5e5e5] bg-[#f7f7f7] p-3">
                <div className="text-muted flex items-center gap-1.5"><Navigation size={13} /> Accuracy</div>
                <div className="font-bold text-ink mt-1">
                  {latestFix ? `±${Math.round(latestFix.accuracy_m)}m` : 'No fix yet'}
                </div>
              </div>
              <div className="rounded-xl border border-[#e5e5e5] bg-[#f7f7f7] p-3">
                <div className="text-muted flex items-center gap-1.5"><Battery size={13} /> Device Battery</div>
                <div className="font-bold text-ink mt-1">{batteryPct !== null ? `${batteryPct}%` : 'Unavailable'}</div>
              </div>
              <div className="rounded-xl border border-[#e5e5e5] bg-[#f7f7f7] p-3">
                <div className="text-muted flex items-center gap-1.5"><MapPin size={13} /> Logged Pings</div>
                <div className="font-bold text-ink mt-1">{trailPoints.length} points</div>
              </div>
              <div className="rounded-xl border border-[#e5e5e5] bg-[#f7f7f7] p-3">
                <div className="text-muted flex items-center gap-1.5">
                  {online ? <Wifi size={13} className="text-emerald-600" /> : <WifiOff size={13} className="text-amber-600" />}
                  Offline Queue
                </div>
                <div className="font-bold text-ink mt-1 flex items-center justify-between">
                  <span>{queuedCount} queued</span>
                  {queuedCount > 0 && (
                    <button
                      type="button"
                      disabled={syncing || !online}
                      onClick={() => void flushQueue(true)}
                      className="text-[11px] underline text-[#0e9f6e] bg-transparent border-0 cursor-pointer disabled:opacity-40"
                    >
                      {syncing ? 'Syncing…' : 'Sync'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {latestFix && (
              <div className="rounded-xl bg-[#f5fbf8] border border-[#0e9f6e]/20 px-3.5 py-2.5 text-xs text-[#121212] flex items-center justify-between gap-2">
                <span className="font-mono">
                  {latestFix.lat.toFixed(5)}, {latestFix.lng.toFixed(5)}
                </span>
                <span className="text-muted flex items-center gap-1">
                  <Clock size={12} /> {fmtDubaiTime(latestFix.recorded_at)}
                </span>
              </div>
            )}

            {gpsError && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {gpsError}
              </div>
            )}

            {!isOnDuty ? (
              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1" htmlFor="fd-purpose">Visit Purpose</label>
                  <select
                    id="fd-purpose"
                    className="select w-full"
                    value={purpose}
                    onChange={e => setPurpose(e.target.value as (typeof PURPOSES)[number])}
                  >
                    {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted mb-1" htmlFor="fd-community">Dubai Community / Site</label>
                  <select
                    id="fd-community"
                    className="select w-full"
                    value={communityChoice}
                    onChange={e => setCommunityChoice(e.target.value)}
                  >
                    {DUBAI_COMMUNITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {communityChoice === 'Other / Custom' && (
                  <div>
                    <label className="block text-xs font-semibold text-muted mb-1" htmlFor="fd-custom-comm">Custom Site / Building Name</label>
                    <input
                      id="fd-custom-comm"
                      className="input w-full"
                      placeholder="e.g. Marina Gate Tower 2, Unit 2404"
                      value={customCommunity}
                      onChange={e => setCustomCommunity(e.target.value)}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-muted mb-1" htmlFor="fd-appt">Viewing / Appointment Ref (Optional)</label>
                  <input
                    id="fd-appt"
                    className="input w-full"
                    placeholder="e.g. VW-2026-104"
                    value={appointmentRef}
                    onChange={e => setAppointmentRef(e.target.value)}
                  />
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleStartDuty()}
                  className="btn green w-full h-11 justify-center gap-2"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                  Start Field Duty
                </button>
              </div>
            ) : (
              <div className="space-y-2.5 pt-1">
                <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] px-3.5 py-2.5 text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-muted">Assignment</span><b className="text-ink">{activeSession.assigned_location}</b></div>
                  <div className="flex justify-between"><span className="text-muted">Started</span><b className="text-ink">{String(activeSession.started_at || '').replace('T', ' ')} UTC</b></div>
                  <div className="flex justify-between"><span className="text-muted">Auto-Stop Cutoff</span><b className="text-ink">{data?.config?.auto_stop_hour_dubai ?? 21}:00 Asia/Dubai</b></div>
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleStopDuty()}
                  className="btn w-full h-11 justify-center gap-2"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Square size={15} />}
                  Stop Field Duty
                </button>
              </div>
            )}

            {/* SOS Emergency Trigger */}
            <div className="pt-2 border-t border-[#e5e5e5] space-y-2">
              <button
                type="button"
                onClick={() => setSosModalOpen(true)}
                className="btn red w-full h-11 justify-center gap-2 font-bold tracking-wide"
              >
                <ShieldAlert size={17} /> SOS Emergency Alert
              </button>
              <p className="text-[11px] text-muted m-0 flex items-center gap-1.5">
                <ShieldCheck size={13} className="text-[#0e9f6e] shrink-0" />
                PDPL notice: Only your own trail is visible here. Raw GPS pings purge after {data?.config?.retention_days ?? 90} days.
              </p>
            </div>
          </section>
        </div>

        {/* Right column: Own Breadcrumb Map & List */}
        <div className="lg:col-span-7 space-y-4">
          <section className="swk-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#e5e5e5] flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-ink m-0">My Own Trail Preview</h2>
                <p className="text-xs text-muted m-0">Personal breadcrumb path for your active or latest session today</p>
              </div>
              <button type="button" className="btn sm outline gap-1.5" onClick={() => void loadSession()}>
                <RefreshCw size={13} /> Refresh
              </button>
            </div>
            <div ref={mapContainerRef} className="w-full h-[320px] bg-[#eef4f2]" />
          </section>

          <section className="swk-card p-5">
            <h3 className="text-sm font-bold text-ink m-0 mb-3">Own Breadcrumbs ({trailPoints.length})</h3>
            {trailPoints.length === 0 ? (
              <div className="text-xs text-muted py-6 text-center">
                No GPS breadcrumbs recorded yet for this session. Start Field Duty to begin 20-second batched tracking.
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto divide-y divide-[#f0f0f0] text-xs">
                {[...trailPoints].reverse().slice(0, 40).map((pt, idx) => (
                  <div key={`${pt.recorded_at}-${idx}`} className="py-2 flex items-center justify-between gap-3">
                    <div>
                      <span className="font-mono font-semibold text-ink">
                        {pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}
                      </span>
                      <span className="ml-2 text-muted">±{Math.round(pt.accuracy_m ?? 0)}m</span>
                      {pt.speed_mps !== null && pt.speed_mps !== undefined && (
                        <span className="ml-2 text-muted">{(pt.speed_mps * 3.6).toFixed(1)} km/h</span>
                      )}
                    </div>
                    <div className="text-muted tabular-nums">{fmtDubaiTime(pt.recorded_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <Modal
        open={sosModalOpen}
        onClose={() => !sosBusy && setSosModalOpen(false)}
        title="Confirm SOS Emergency Alert"
        width={440}
        footer={
          <>
            <button type="button" className="btn outline" disabled={sosBusy} onClick={() => setSosModalOpen(false)}>
              Cancel
            </button>
            <div className="flex-1" />
            <button type="button" className="btn red gap-2" disabled={sosBusy} onClick={() => void handleSendSos()}>
              {sosBusy ? <Loader2 size={15} className="animate-spin" /> : <ShieldAlert size={15} />}
              Send SOS Now
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="m-0 text-[#4a4a4a]">
            This immediately dispatches a high-priority SOS push alert (`swk_calls_sos`) and your exact GPS coordinates to Owner Shabib, Admin, and Operations Manager Haseeb.
          </p>
          <div>
            <label htmlFor="sos-note" className="block text-xs font-semibold text-muted mb-1">Emergency Details (Optional)</label>
            <textarea
              id="sos-note"
              rows={3}
              className="textarea w-full"
              placeholder="Briefly describe the emergency or building/unit location…"
              value={sosReason}
              onChange={e => setSosReason(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
