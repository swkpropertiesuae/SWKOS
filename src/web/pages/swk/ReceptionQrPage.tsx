import { useEffect,useRef,useState } from 'react'
import jsQR from 'jsqr'
import { CheckCircle2,Eye,EyeOff,Loader2,Lock,Mail,ScanLine,Wifi,WifiOff } from 'lucide-react'
import { get,post } from '../../lib/api'
import { useMeta } from '../../lib/meta'
import { signProof } from '../../lib/deviceKey'

type Net = { ssid: string; detected_client_ip: string; ip_matches_office: boolean; office_ip_locked?: boolean }
type Step = 'scan' | 'signin' | 'done'

/**
 * Office check-in terminal. Check-in works only on the office Wi-Fi, only by scanning the code on the reception screen with the live camera
 * in this page (there is no upload or gallery option, and the code is not a link), and only from this person's own registered phone.
 */
export default function ReceptionQrPage() {
  const { me } = useMeta()
  const [net, setNet] = useState<Net | null>(null)
  const [step, setStep] = useState<Step>('scan')
  const [payload, setPayload] = useState('')
  const [camErr, setCamErr] = useState('')
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [totp, setTotp] = useState(''), [needTotp, setNeedTotp] = useState(false), [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<any>(null)
  const video = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null)
  const canSetup = Boolean(me && ['shabib@swk.properties', 'haseeb@swk.properties'].includes(String(me.email).toLowerCase()))

  const loadNet = () => { void get<Net>('/api/public/reception-qr/wifi-config').then(setNet).catch(() => {}) }
  useEffect(loadNet, [])

  // live camera only: frames go straight from the video element to the decoder, nothing is saved or uploaded
  useEffect(() => {
    if (step !== 'scan') return
    let stream: MediaStream | null = null, raf = 0, stopped = false
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setCamErr('This browser has no camera access. Open this page in Chrome or Safari over https.'); return }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 960 } }, audio: false })
        if (stopped) return stream.getTracks().forEach(t => t.stop())
        const v = video.current!; v.srcObject = stream; v.setAttribute('playsinline', 'true'); await v.play()
        const c = canvas.current!, ctx = c.getContext('2d', { willReadFrequently: true })!
        const tick = () => {
          if (stopped) return
          if (v.readyState >= 2 && v.videoWidth) {
            const k = Math.min(1, 640 / v.videoWidth); c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k)
            ctx.drawImage(v, 0, 0, c.width, c.height)
            const img = ctx.getImageData(0, 0, c.width, c.height), hit = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
            if (hit && /^SWK1\.[A-Za-z0-9_-]{40,200}$/.test(hit.data)) { setPayload(hit.data); setStep('signin'); return }
          }
          raf = window.setTimeout(tick, 120)
        }
        tick()
      } catch { setCamErr('Allow the camera for this page. Check-in only works with the live camera.') }
    }
    void start()
    return () => { stopped = true; clearTimeout(raf); stream?.getTracks().forEach(t => t.stop()) }
  }, [step])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setBusy(true)
    try {
      const { challenge } = await get<{ challenge: string }>('/api/public/reception-qr/challenge')
      const proof = await signProof(`${challenge}.${payload}`)
      const r = await post<any>('/api/public/reception-qr/scan-login-checkin', { email: email.trim(), password, totp: needTotp ? totp : undefined, qr_payload: payload, challenge, device_pub: proof.pub, device_sig: proof.sig, device_name: navigator.platform || 'Phone' })
      if (r.needsTotp) { setNeedTotp(true); return }
      setResult(r); setStep('done')
    } catch (err: any) {
      const msg = err?.message || 'Check-in failed.'
      setError(msg)
      if (/scan|expired|code|older/i.test(msg)) { setPayload(''); setStep('scan') }
    } finally { setBusy(false) }
  }

  const onOffice = Boolean(net?.office_ip_locked && net?.ip_matches_office)
  return (
    <div className="min-h-screen bg-[#0a1322] text-white flex items-center justify-center p-4">
      <div className="w-full max-w-[420px] rounded-3xl bg-[#0e1a30] border border-white/10 p-6 shadow-2xl">
        <div className="flex flex-col items-center text-center mb-5">
          <img src="/brand/os/logo-horizontal.png" alt="SWK Properties OS" className="h-14 w-auto" />
          <h1 className="font-display font-bold text-xl m-0 mt-2" style={{ color: '#fff' }}>{step === 'done' ? 'Attendance confirmed' : 'Office check-in'}</h1>
        </div>

        <div className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border text-[12.5px] mb-4 ${onOffice ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200' : 'bg-rose-500/10 border-rose-500/40 text-rose-200'}`}>
          {onOffice ? <Wifi size={16} /> : <WifiOff size={16} />}
          <div className="leading-snug">{!net ? 'Checking your network…' : !net.office_ip_locked ? 'Check-in is not set up yet. The Owner or Manager must lock the office network.' : onOffice ? <>Connected to the office network (<b>{net.ssid}</b>)</> : <>Not on the office Wi-Fi. Connect to <b>{net.ssid}</b> to check in. Mobile data is not accepted.</>}</div>
        </div>

        {error && <div role="alert" className="mb-4 px-3.5 py-2.5 rounded-2xl bg-rose-950/70 border border-rose-500/50 text-rose-200 text-xs font-medium">{error}</div>}

        {step === 'scan' && (
          <div className="space-y-3">
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-square border border-white/10">
              <video ref={video} muted playsInline className="w-full h-full object-cover" />
              <canvas ref={canvas} className="hidden" />
<<<<<<< HEAD
              <div className="absolute inset-6 border-2 border-[#2d58dc]/80 rounded-2xl pointer-events-none" />
              <ScanLine className="absolute left-1/2 top-3 -translate-x-1/2 text-[#2d58dc]" size={20} />
=======
              <div className="absolute inset-6 border-2 border-[#3461e8]/80 rounded-2xl pointer-events-none" />
              <ScanLine className="absolute left-1/2 top-3 -translate-x-1/2 text-[#3461e8]" size={20} />
>>>>>>> origin/main
            </div>
            <p className="text-xs text-[#c3cde0] m-0">{camErr || 'Point the camera at the code on the reception screen. It scans by itself. There is no photo or file option.'}</p>
          </div>
        )}

        {step === 'signin' && (
          <form onSubmit={e => void submit(e)} className="space-y-3.5">
            <p className="text-xs text-emerald-300 m-0">Code read. Sign in within 90 seconds.</p>
            <div>
              <label htmlFor="qr-email" className="block text-xs font-semibold text-[#c3cde0] mb-1.5">Email</label>
              <div className="relative flex items-center"><Mail size={16} className="absolute left-3.5 text-[#8a9ab5]" />
<<<<<<< HEAD
                <input id="qr-email" type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@swk.properties" className="w-full h-11 pl-10 pr-3 rounded-xl bg-white/[.06] border border-white/15 text-white text-sm outline-none focus:border-[#2d58dc]" /></div>
=======
                <input id="qr-email" type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@swk.properties" className="w-full h-11 pl-10 pr-3 rounded-xl bg-white/[.06] border border-white/15 text-white text-sm outline-none focus:border-[#3461e8]" /></div>
>>>>>>> origin/main
            </div>
            <div>
              <label htmlFor="qr-pw" className="block text-xs font-semibold text-[#c3cde0] mb-1.5">Password</label>
              <div className="relative flex items-center"><Lock size={16} className="absolute left-3.5 text-[#8a9ab5]" />
<<<<<<< HEAD
                <input id="qr-pw" type={show ? 'text' : 'password'} required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="w-full h-11 pl-10 pr-10 rounded-xl bg-white/[.06] border border-white/15 text-white text-sm outline-none focus:border-[#2d58dc]" />
                <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-3 bg-transparent border-0 text-[#8a9ab5] cursor-pointer">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
            </div>
            {needTotp && <input inputMode="numeric" maxLength={6} autoComplete="one-time-code" placeholder="Authenticator code" value={totp} onChange={e => setTotp(e.target.value.replace(/\D/g, ''))} className="w-full h-11 px-3 rounded-xl bg-white/[.06] border border-white/15 text-white text-sm outline-none" />}
            <button type="submit" disabled={busy || !onOffice} className="w-full h-12 rounded-xl border-0 bg-[#2d58dc] text-white font-bold cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-2">{busy ? <><Loader2 size={16} className="animate-spin" />Checking…</> : 'Check in'}</button>
=======
                <input id="qr-pw" type={show ? 'text' : 'password'} required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="w-full h-11 pl-10 pr-10 rounded-xl bg-white/[.06] border border-white/15 text-white text-sm outline-none focus:border-[#3461e8]" />
                <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-3 bg-transparent border-0 text-[#8a9ab5] cursor-pointer">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
            </div>
            {needTotp && <input inputMode="numeric" maxLength={6} autoComplete="one-time-code" placeholder="Authenticator code" value={totp} onChange={e => setTotp(e.target.value.replace(/\D/g, ''))} className="w-full h-11 px-3 rounded-xl bg-white/[.06] border border-white/15 text-white text-sm outline-none" />}
            <button type="submit" disabled={busy || !onOffice} className="w-full h-12 rounded-xl border-0 bg-[#3461e8] text-white font-bold cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-2">{busy ? <><Loader2 size={16} className="animate-spin" />Checking…</> : 'Check in'}</button>
>>>>>>> origin/main
            <button type="button" onClick={() => { setPayload(''); setStep('scan') }} className="w-full bg-transparent border-0 text-xs text-[#c3cde0] underline cursor-pointer">Scan again</button>
          </form>
        )}

        {step === 'done' && result && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-emerald-300 font-semibold"><CheckCircle2 size={20} />{result.already_checked_in ? 'You were already checked in today.' : 'You are checked in.'}</div>
            <div className="rounded-2xl bg-white/[.05] border border-white/10 p-3.5 space-y-1.5 text-[13px]">
              <Row k="Name" v={result.employee?.name} />
              <Row k="Time" v={String(result.verification_summary?.timestamp_gst || '').slice(0, 16).replace('T', ' ')} />
              <Row k="Status" v={result.verification_summary?.is_late ? `Late (+${result.verification_summary.late_minutes} min)` : 'On time'} />
              <Row k="Network" v={`${result.verification_summary?.office_wifi_ssid} · ${result.verification_summary?.client_ip}`} />
            </div>
          </div>
        )}

        {canSetup && <SetupPanel onChange={loadNet} />}
      </div>
    </div>
  )
}

const Row = ({ k, v }: { k: string; v: any }) => <div className="flex justify-between gap-3"><span className="text-[#8a9ab5]">{k}</span><span className="font-semibold text-right">{v}</span></div>

function SetupPanel({ onChange }: { onChange: () => void }) {
  const [msg, setMsg] = useState(''), [control, setControl] = useState<{ devices: any[] } | null>(null)
  const load = () => { void get<any>('/api/swk-ops/attendance-control').then(setControl).catch(() => {}) }
  useEffect(load, [])
  const act = async (body: any) => { setMsg('Working…'); try { const r = await post<any>('/api/swk-ops/attendance-setup', body); setMsg(r.office_ip_locked ? `Office network locked: ${r.public_ips}` : 'Office network cleared. Check-in is off until you lock it again.'); onChange() } catch (e: any) { setMsg(e?.message || 'Could not save.') } }
  const decide = async (id: number, approve: boolean) => { try { setControl(await post<any>(`/api/swk-ops/attendance-control/device/${id}`, { approve })) } catch (e: any) { setMsg(e?.message || 'Could not save.') } }
  return (
    <div className="mt-5 rounded-2xl border border-white/15 bg-white/[.04] p-3 text-xs text-[#c3cde0] space-y-2">
      <div className="font-semibold text-white">Attendance control (Owner / Manager)</div>
      <div className="flex gap-2 flex-wrap">
<<<<<<< HEAD
        <button type="button" className="px-3 py-1.5 rounded-xl bg-[#2d58dc] text-white font-semibold border-0 cursor-pointer" onClick={() => void act({ lock_current_ip: true })}>Lock this network as the office</button>
=======
        <button type="button" className="px-3 py-1.5 rounded-xl bg-[#3461e8] text-white font-semibold border-0 cursor-pointer" onClick={() => void act({ lock_current_ip: true })}>Lock this network as the office</button>
>>>>>>> origin/main
        <button type="button" className="px-3 py-1.5 rounded-xl bg-white/10 text-white font-semibold border border-white/20 cursor-pointer" onClick={() => void act({ clear_ips: true })}>Clear locked networks</button>
      </div>
      {msg && <div>{msg}</div>}
      <a href="/reception-display" className="inline-block text-[#a9bbff] underline">Open the reception code screen</a>
      {!!control?.devices.length && (
        <div className="space-y-1">
          <div className="font-semibold text-white">Devices</div>
          {control.devices.map(d => (
            <div key={d.id} className="flex items-center gap-2"><span className="flex-1">{d.name} · {String(d.label || 'phone').slice(0, 24)} · <b>{d.status}</b></span>
              {d.status !== 'Approved' && <button type="button" className="px-2 py-1 rounded-lg bg-emerald-600 text-white border-0 cursor-pointer" onClick={() => void decide(d.id, true)}>Approve</button>}
              {d.status !== 'Blocked' && <button type="button" className="px-2 py-1 rounded-lg bg-white/10 text-white border border-white/20 cursor-pointer" onClick={() => void decide(d.id, false)}>Block</button>}</div>
          ))}
        </div>
      )}
    </div>
  )
}
