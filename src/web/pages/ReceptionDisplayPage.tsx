import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Download, QrCode, RefreshCw, ShieldCheck, Timer, Wifi } from 'lucide-react'
import { get, post } from '../lib/api'
import { useMeta } from '../lib/meta'
import { isAdminSwkUser } from '@shared/swk-staff-access'
import { PageHeader, ErrorBox } from '../ui/kit'
import { qrLink } from '@shared/qr-payload'

type Tok = {
  token: string
  expires_in: number
  step_s?: number
  max_ttl_s?: number
  mode: 'fixed' | 'rotating'
  require_live_camera?: boolean
}

type WifiStatus = {
  ssid: string
  bssid?: string
  gateway_ip?: string
  detected_client_ip: string
  ip_matches_office: boolean
  office_ip_locked: boolean
}

/**
 * Reception check-in monitor display.
 * Rotating mode (locked default): short-TTL AES-256-GCM encrypted code rotating every 20 seconds
 * (max ~40s validity), paired with live browser camera scanning and locked Office Wi-Fi (XAVIER BUSINESS).
 */
export function ReceptionDisplayPage() {
  const { me } = useMeta()
  const isAdmin = isAdminSwkUser(me)
  const [img, setImg] = useState('')
  const [tokInfo, setTokInfo] = useState<Tok | null>(null)
  const [wifi, setWifi] = useState<WifiStatus | null>(null)
  const [mode, setMode] = useState<Tok['mode']>('rotating')
  const [left, setLeft] = useState(0)
  const [err, setErr] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)

  const refreshWifi = useCallback(() => {
    void get<WifiStatus>('/api/public/reception-qr/wifi-config').then(setWifi).catch(() => {})
  }, [])

  const show = useCallback(async (t: Tok) => {
    const data = await QRCode.toDataURL(qrLink(window.location.origin, t.token), {
      width: 520,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f2a33', light: '#ffffff' },
    })
    setImg(data)
    setTokInfo(t)
    setMode(t.mode)
    setLeft(t.expires_in)
    setErr(null)
  }, [])

  useEffect(() => {
    let stop = false
    let timer: ReturnType<typeof setTimeout>
    refreshWifi()
    const load = async () => {
      try {
        const t = await get<Tok>('/api/swk-ops/reception-token')
        if (stop) return
        await show(t)
        const nextDelaySec = t.mode === 'rotating' ? Math.max(2, t.expires_in - 1) : Math.max(15, t.expires_in - 5)
        timer = setTimeout(() => void load(), nextDelaySec * 1000)
      } catch (e: any) {
        if (!stop) {
          setErr(e)
          timer = setTimeout(() => void load(), 10_000)
        }
      }
    }
    void load()
    const tick = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000)
    return () => {
      stop = true
      clearTimeout(timer)
      clearInterval(tick)
    }
  }, [show, refreshWifi])

  const act = async (path: string, body?: unknown, ask?: string) => {
    if (ask && !window.confirm(ask)) return
    setBusy(true)
    try {
      await show(await post<Tok>(path, body))
    } catch (e: any) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  const relockOfficeNetwork = async () => {
    setBusy(true)
    try {
      await post('/api/swk-ops/attendance-setup', {
        relock_current_ip: true,
        office_wifi_ssid: wifi?.ssid || 'XAVIER BUSINESS',
        office_wifi_bssid: wifi?.bssid || '72:d7:9a:db:56:f0',
        office_wifi_gateway_ip: wifi?.gateway_ip || '192.168.0.1',
        office_wifi_strict_ip: true,
      })
      refreshWifi()
      const fresh = await get<Tok>('/api/swk-ops/reception-token')
      await show(fresh)
    } catch (e: any) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  const downloadQr = () => {
    if (!img) return
    const a = document.createElement('a')
    a.href = img
    a.download = `SWK-Reception-QR-${mode}-${new Date().toISOString().slice(0, 10)}.png`
    a.click()
  }

  const stepS = tokInfo?.step_s || 20
  const maxTtlS = tokInfo?.max_ttl_s || stepS * 2
  const pct = mode === 'rotating' ? Math.max(0, Math.min(100, Math.round((left / stepS) * 100))) : 100

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<QrCode size={22} />}
        title="Reception check-in display"
        subtitle={
          mode === 'rotating'
            ? `Anti-spoof short-TTL rotating QR (${stepS}s cycle). Staff scan live with their browser camera on ${wifi?.ssid || 'XAVIER BUSINESS'}.`
            : 'Fixed wall QR mode is active. Switch back to rotating short-TTL mode for anti-screenshot protection.'
        }
      />
      {err && (
        <div className="space-y-2">
          <ErrorBox error={err} />
          {isAdmin && wifi && !wifi.ip_matches_office && (
            <div className="card p-4 flex flex-wrap items-center justify-between gap-3 border-amber-400/50 bg-amber-50/70 dark:bg-amber-950/25">
              <div className="text-sm">
                <b>Office router IP rotated ({wifi.ssid}):</b> Detected current IP <code className="font-mono font-bold">{wifi.detected_client_ip}</code>. Click to lock <b>{wifi.ssid}</b> to this IP and generate the QR immediately.
              </div>
              <button type="button" className="btn green sm" disabled={busy} onClick={() => void relockOfficeNetwork()}>
                <Wifi size={14} /> {busy ? 'Locking…' : `Lock ${wifi.ssid} (${wifi.detected_client_ip}) & Generate QR`}
              </button>
            </div>
          )}
        </div>
      )}
      <div className="swk-card p-6 flex flex-col items-center gap-4">
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-semibold border ${
              mode === 'rotating'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
            }`}
          >
            <ShieldCheck size={14} />
            {mode === 'rotating'
              ? `Rotating AES-256-GCM · ${stepS}s Refresh · Max ${maxTtlS}s TTL`
              : 'Static Wall QR Mode (Unrotated)'}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-semibold bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
            <Wifi size={14} />
            {wifi ? `${wifi.ssid} · ${wifi.detected_client_ip} · ${wifi.ip_matches_office ? 'Verified' : 'Needs Lock'}` : 'XAVIER BUSINESS · Live Camera Required'}
          </span>
        </div>

        <div className="relative p-3 rounded-2xl bg-white border border-slate-200 shadow-sm">
          {img ? (
            <img
              src={img}
              alt="Check-in QR code"
              style={{ width: 'min(62vh, 460px)', maxWidth: '100%', borderRadius: 12, background: '#fff', display: 'block' }}
            />
          ) : (
            <div className="w-[320px] h-[320px] grid place-items-center text-muted text-sm">Loading encrypted QR…</div>
          )}
        </div>

        {mode === 'rotating' && (
          <div className="w-full max-w-[460px] space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs font-semibold text-ink">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Timer size={14} className="text-[#047857] shrink-0" />
                Next code in <span className="font-mono font-bold">{left}s</span>
              </span>
              <span className="text-muted whitespace-nowrap">Max {maxTtlS}s TTL · Office Wi-Fi + Live Camera</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-linear"
                style={{
                  width: `${pct}%`,
                  background: left <= 5 ? '#d97706' : '#047857',
                }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-2 print:hidden pt-1">
          <button
            className="btn outline"
            disabled={busy}
            onClick={() => { refreshWifi(); void get<Tok>('/api/swk-ops/reception-token').then(show).catch(setErr) }}
          >
            <RefreshCw size={14} /> Refresh now
          </button>
          <button className="btn outline" disabled={!img} onClick={downloadQr}>
            <Download size={14} /> Download QR PNG
          </button>
          <button className="btn" onClick={() => window.print()}>
            Print this code
          </button>
          {mode === 'fixed' && (
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                void act(
                  '/api/swk-ops/reception-token/regenerate',
                  undefined,
                  'Make a NEW fixed code? Every printed copy of the old code stops working and you must print the new one.',
                )
              }
            >
              Regenerate fixed code
            </button>
          )}
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              void act(
                '/api/swk-ops/reception-token/mode',
                { mode: mode === 'fixed' ? 'rotating' : 'fixed' },
                mode === 'fixed'
                  ? `Switch to short-TTL rotating mode (${stepS}s cycle)? Printed static codes will stop working immediately.`
                  : 'Switch to static fixed wall code? Anti-screenshot short-TTL rotation will be paused.',
              )
            }
          >
            {mode === 'fixed' ? 'Enable rotating short-TTL mode' : 'Switch to fixed wall code'}
          </button>
        </div>
      </div>
    </div>
  )
}
