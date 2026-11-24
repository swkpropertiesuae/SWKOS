import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { canPrintReceptionQr } from '@shared/swk-staff-access'
import { qrCodeFrom } from '@shared/qr-payload'
import jsQR from 'jsqr'
import {
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  MapPinned,
  ScanLine,
  ShieldAlert,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { get, post } from '../../lib/api'
import { useMeta } from '../../lib/meta'
import { signProof } from '../../lib/deviceKey'
import { ensureNativeCameraPermission } from '../../lib/mobileBridge'

async function ensureLiveCameraPermission(): Promise<boolean> {
  return ensureNativeCameraPermission()
}

type Net = {
  ssid: string
  detected_client_ip: string
  ip_matches_office: boolean
  office_ip_locked?: boolean
  qr_mode?: 'rotating' | 'fixed'
  qr_step_s?: number
  qr_require_live_camera?: boolean
}
type Step = 'scan' | 'signin' | 'done'

/**
 * Office check-in terminal.
 * Check-in works only on the locked office Wi-Fi, scanning the rotating short-TTL code
 * on the reception display with the live browser camera from this person's own registered device.
 */
export default function ReceptionQrPage() {
  const { me } = useMeta()
  const [net, setNet] = useState<Net | null>(null)
  const [step, setStep] = useState<Step>('scan')
  const [payload, setPayload] = useState('')
  const [captureSource, setCaptureSource] = useState<'live_camera' | 'link_hash'>('live_camera')
  const [capturedAt, setCapturedAt] = useState('')
  const [camErr, setCamErr] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [needTotp, setNeedTotp] = useState(false)
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const canSetup = canPrintReceptionQr(me)

  // Opened from a phone camera link (#c=…): extract code and strip hash from URL immediately
  useEffect(() => {
    const code = qrCodeFrom(window.location.hash)
    if (code) {
      setPayload(code)
      setCaptureSource('link_hash')
      setCapturedAt(new Date().toISOString())
      setStep('signin')
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  const loadNet = useCallback(() => {
    void get<Net>('/api/public/reception-qr/wifi-config').then(setNet).catch(() => {})
  }, [])
  useEffect(loadNet, [loadNet])

  // Signed in already on this phone: check in as soon as the live code is read and office Wi-Fi is confirmed
  const autoTried = useRef(false)
  useEffect(() => {
    const camOk = net?.qr_mode !== 'rotating' || !net?.qr_require_live_camera || captureSource === 'live_camera'
    if (step === 'signin' && me && !me.party_id && payload && net?.office_ip_locked && net.ip_matches_office && camOk && !autoTried.current) {
      autoTried.current = true
      void submit()
    }
  }, [step, me, payload, net, captureSource]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live camera only: frames go straight from the video element to jsQR, nothing is saved or uploaded
  useEffect(() => {
    if (step !== 'scan') return
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    const start = async () => {
      const permOk = await ensureLiveCameraPermission()
      if (stopped) return
      if (!permOk) {
        setCamErr('Camera permission is required in the SWK Mobile app. Enable Camera in device settings and retry.')
        return
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamErr('This browser has no camera access. Open this page in Chrome or Safari over https.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 960 } },
          audio: false,
        })
        if (stopped) return stream.getTracks().forEach((t) => t.stop())
        const v = video.current!
        v.srcObject = stream
        v.setAttribute('playsinline', 'true')
        await v.play()
        const c = canvas.current!
        const ctx = c.getContext('2d', { willReadFrequently: true })!
        const tick = () => {
          if (stopped) return
          if (v.readyState >= 2 && v.videoWidth) {
            const k = Math.min(1, 640 / v.videoWidth)
            c.width = Math.round(v.videoWidth * k)
            c.height = Math.round(v.videoHeight * k)
            ctx.drawImage(v, 0, 0, c.width, c.height)
            const img = ctx.getImageData(0, 0, c.width, c.height)
            const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
            const code = hit ? qrCodeFrom(hit.data) : ''
            if (code) {
              setPayload(code)
              setCaptureSource('live_camera')
              setCapturedAt(new Date().toISOString())
              setStep('signin')
              return
            }
          }
          raf = window.setTimeout(tick, 120)
        }
        tick()
      } catch {
        setCamErr('Allow the camera for this page. Check-in only works with the live browser camera.')
      }
    }
    void start()
    return () => {
      stopped = true
      clearTimeout(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [step])

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { challenge } = await get<{ challenge: string }>('/api/public/reception-qr/challenge')
      const proof = await signProof(`${challenge}.${payload}`)
      const r = await post<any>(
        me && !me.party_id ? '/api/attendance/qr-checkin' : '/api/public/reception-qr/scan-login-checkin',
        {
          email: me ? undefined : email.trim(),
          password: me ? undefined : password,
          totp: needTotp ? totp : undefined,
          qr_payload: payload,
          capture_source: captureSource,
          captured_at: capturedAt || new Date().toISOString(),
          challenge,
          device_pub: proof.pub,
          device_sig: proof.sig,
          device_name: navigator.platform || 'Phone',
        },
      )
      if (r.needsTotp) {
        setNeedTotp(true)
        return
      }
      setResult(r)
      setStep('done')
    } catch (err: any) {
      const msg = err?.message || 'Check-in failed.'
      setError(msg)
      if (/scan|expired|code|older|used|camera/i.test(msg)) {
        setPayload('')
        setStep('scan')
      }
    } finally {
      setBusy(false)
    }
  }

  const onOffice = Boolean(net?.office_ip_locked && net?.ip_matches_office)
  const linkBlockedInRotating = net?.qr_mode === 'rotating' && net?.qr_require_live_camera !== false && captureSource !== 'live_camera'
  const stepS = net?.qr_step_s ?? 20

  return (
    <div
      className="min-h-screen text-[#0f2a33] flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #fbf9f4 0%, #f3eee3 48%, #faf8f2 100%)' }}
    >
      <div className="w-full max-w-[420px] rounded-3xl bg-white border border-black/5 p-6 shadow-[0_24px_60px_rgba(15,42,51,0.12)]">
        <div className="flex flex-col items-center text-center mb-5">
          <img src="/brand/web/swk-logo-light.webp" alt="SWK Properties OS" className="h-14 w-auto" />
          <h1 className="font-display font-bold text-xl m-0 mt-2">{step === 'done' ? 'Attendance confirmed' : 'Office check-in'}</h1>
          <p className="text-[11.5px] text-[#55636a] m-0 mt-0.5">
            {net?.qr_mode === 'rotating' ? `Rotating ${stepS}s QR · Live Camera · Office Wi-Fi` : 'Office Wi-Fi · Live Camera Check-In'}
          </p>
        </div>

        <div
          className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border text-[12.5px] mb-4 ${
            onOffice ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
        >
          {onOffice ? <Wifi size={16} className="shrink-0" /> : <WifiOff size={16} className="shrink-0" />}
          <div className="leading-snug">
            {!net ? (
              'Checking your network…'
            ) : !net.office_ip_locked ? (
              'Check-in is not set up yet. The Admin must lock the office network.'
            ) : onOffice ? (
              <>
                Connected to the office network (<b>{net.ssid}</b>)
              </>
            ) : (
              <>
                Not on the office Wi-Fi. Connect to <b>{net.ssid}</b> to check in. Mobile data is not accepted.
              </>
            )}
          </div>
        </div>

        {error && (
          <div role="alert" className="mb-4 px-3.5 py-2.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            {error}
          </div>
        )}

        {step === 'scan' && (
          <div className="space-y-3">
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-square border border-white/10">
              <video ref={video} muted playsInline className="w-full h-full object-cover" />
              <canvas ref={canvas} className="hidden" />
              <div className="absolute inset-6 border-2 border-[#8a621c]/80 rounded-2xl pointer-events-none" />
              <ScanLine className="absolute left-1/2 top-3 -translate-x-1/2 text-[#8a621c]" size={20} />
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/70 text-[11px] font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap">
                <Camera size={12} className="text-emerald-400" /> Live Browser Camera Only
              </div>
            </div>
            <p className="text-xs text-[#3d4a51] m-0">
              {camErr ||
                `Point your live camera at the rotating ${stepS}s reception display. Screenshots, gallery uploads, and forwarded links are blocked.`}
            </p>
          </div>
        )}

        {step === 'signin' && linkBlockedInRotating && (
          <div className="mb-3 px-3.5 py-2.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-2">
            <div className="flex items-start gap-2">
              <ShieldAlert size={16} className="shrink-0 mt-0.5 text-amber-700" />
              <span>
                <b>Live camera required:</b> Rotating anti-spoof mode blocks forwarded links and screenshots. Scan the reception monitor directly using the camera below.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setPayload('')
                setCaptureSource('live_camera')
                setStep('scan')
              }}
              className="w-full h-9 rounded-xl bg-[#0f2a33] text-white font-semibold text-xs border-0 cursor-pointer inline-flex items-center justify-center gap-1.5"
            >
              <Camera size={14} /> Open Live Camera Scanner
            </button>
          </div>
        )}

        {step === 'signin' && me && !me.party_id && (
          <div className="space-y-3.5 text-center">
            <p className="m-0 text-sm text-[#3d4a51]">
              Signed in as <b className="text-[#0f2a33]">{me.name}</b>
            </p>
            <button
              type="button"
              disabled={busy || !onOffice || linkBlockedInRotating}
              onClick={() => void submit()}
              className="w-full h-12 rounded-full border-0 bg-[#0f2a33] text-white font-semibold uppercase tracking-[0.14em] text-[12px] cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {busy ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Checking you in…
                </>
              ) : (
                'Check in now'
              )}
            </button>
          </div>
        )}

        {step === 'signin' && !(me && !me.party_id) && (
          <form onSubmit={(e) => void submit(e)} className="space-y-3.5">
            <p className="text-xs text-[#8a621c] m-0">
              Code read ({captureSource === 'live_camera' ? 'live camera verified' : 'link capture'}). Sign in within {stepS * 2} seconds.
            </p>
            <div>
              <label htmlFor="qr-email" className="block text-xs font-semibold text-[#3d4a51] mb-1.5">
                Email
              </label>
              <div className="relative flex items-center">
                <Mail size={16} className="absolute left-3.5 text-[#6b767c]" />
                <input
                  id="qr-email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@swk.properties"
                  className="w-full h-11 pl-10 pr-3 rounded-xl bg-[#f8f5ef] border border-[#e6e0d4] text-[#0f2a33] text-sm outline-none focus:border-[#8a621c]"
                />
              </div>
            </div>
            <div>
              <label htmlFor="qr-pw" className="block text-xs font-semibold text-[#3d4a51] mb-1.5">
                Password
              </label>
              <div className="relative flex items-center">
                <Lock size={16} className="absolute left-3.5 text-[#6b767c]" />
                <input
                  id="qr-pw"
                  type={show ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 pl-10 pr-10 rounded-xl bg-[#f8f5ef] border border-[#e6e0d4] text-[#0f2a33] text-sm outline-none focus:border-[#8a621c]"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                  className="absolute right-3 bg-transparent border-0 text-[#6b767c] cursor-pointer"
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {needTotp && (
              <input
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                placeholder="Authenticator code"
                value={totp}
                onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
                className="w-full h-11 px-3 rounded-xl bg-[#f8f5ef] border border-[#e6e0d4] text-[#0f2a33] text-sm outline-none"
              />
            )}
            <button
              type="submit"
              disabled={busy || !onOffice || linkBlockedInRotating}
              className="w-full h-12 rounded-full border-0 bg-[#0f2a33] text-white font-semibold cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {busy ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Checking…
                </>
              ) : (
                'Check in'
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setPayload('')
                setCaptureSource('live_camera')
                setStep('scan')
              }}
              className="w-full bg-transparent border-0 text-xs text-[#3d4a51] underline cursor-pointer"
            >
              Scan again
            </button>
          </form>
        )}

        {step === 'done' && result && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-[#8a621c] font-semibold">
              <CheckCircle2 size={20} />
              {result.already_checked_in ? 'You were already checked in today.' : 'You are checked in.'}
            </div>
            <div className="rounded-2xl bg-[#f8f5ef] border border-[#e6e0d4] p-3.5 space-y-1.5 text-[13px]">
              <Row k="Name" v={result.employee?.name} />
              <Row k="Time" v={String(result.verification_summary?.timestamp_gst || '').slice(0, 16).replace('T', ' ')} />
              <Row
                k="Status"
                v={result.verification_summary?.is_late ? `Late (+${result.verification_summary.late_minutes} min)` : 'On time'}
              />
              <Row
                k="Network"
                v={`${result.verification_summary?.office_wifi_ssid} · ${result.verification_summary?.client_ip}`}
              />
            </div>
            <a
              href="/home"
              className="mt-2 flex h-12 w-full items-center justify-center rounded-full bg-[#0f2a33] text-[12px] font-semibold uppercase tracking-[0.14em] text-white no-underline hover:bg-[#d4a752] hover:text-[#0f2a33]"
            >
              Continue to SWK OS
            </a>
            <a
              href="/field-duty"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#8a621c]/30 bg-[#f8f5ef] text-[12px] font-semibold uppercase tracking-[0.1em] text-[#8a621c] no-underline hover:bg-[#efe6d2]"
            >
              <MapPinned size={15} /> Switch to Field Duty GPS
            </a>
          </div>
        )}

        {step !== 'done' && me && !me.party_id && (
          <div className="mt-4 pt-3 border-t border-[#e6e0d4] text-center">
            <Link to="/field-duty" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#8a621c] no-underline hover:underline">
              <MapPinned size={14} /> Out on a viewing? Switch to Field Duty GPS
            </Link>
          </div>
        )}

        {canSetup && <SetupPanel onChange={loadNet} />}
      </div>
    </div>
  )
}

const Row = ({ k, v }: { k: string; v: any }) => (
  <div className="flex justify-between gap-3">
    <span className="text-[#6b767c]">{k}</span>
    <span className="font-semibold text-right">{v}</span>
  </div>
)

function SetupPanel({ onChange }: { onChange: () => void }) {
  const [msg, setMsg] = useState('')
  const [control, setControl] = useState<{ devices: any[] } | null>(null)
  const load = () => {
    void get<any>('/api/swk-ops/attendance-control').then(setControl).catch(() => {})
  }
  useEffect(load, [])
  const decide = async (id: number, approve: boolean) => {
    try {
      setControl(await post<any>(`/api/swk-ops/attendance-control/device/${id}`, { approve }))
      onChange()
    } catch (e: any) {
      setMsg(e?.message || 'Could not save.')
    }
  }
  return (
    <div className="mt-5 rounded-2xl border border-[#e6e0d4] bg-[#f8f5ef] p-3 text-xs text-[#3d4a51] space-y-2">
      <div className="font-semibold text-[#0f2a33]">Attendance control (Owner / Manager)</div>
      <div>The office network is locked by the Admin in Settings, Attendance Wi-Fi.</div>
      {msg && <div>{msg}</div>}
      <a href="/reception-display" className="inline-block text-[#8a621c] underline">
        Open the reception code screen
      </a>
      {!!control?.devices.length && (
        <div className="space-y-1">
          <div className="font-semibold text-[#0f2a33]">Devices</div>
          {control.devices.map((d) => (
            <div key={d.id} className="flex items-center gap-2">
              <span className="flex-1">
                {d.name} · {String(d.label || 'phone').slice(0, 24)} · <b>{d.status}</b>
              </span>
              {d.status !== 'Approved' && (
                <button
                  type="button"
                  className="px-2 py-1 rounded-lg bg-emerald-600 text-white border-0 cursor-pointer"
                  onClick={() => void decide(d.id, true)}
                >
                  Approve
                </button>
              )}
              {d.status !== 'Blocked' && (
                <button
                  type="button"
                  className="px-2 py-1 rounded-lg bg-white text-[#0f2a33] border border-[#e6e0d4] cursor-pointer"
                  onClick={() => void decide(d.id, false)}
                >
                  Block
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
