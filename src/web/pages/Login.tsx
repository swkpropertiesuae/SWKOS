import { useEffect,useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence,motion,useReducedMotion } from 'motion/react'
import { ArrowRight,Check,Eye,EyeOff,KeyRound,Loader2,Lock,Mail,ShieldCheck } from 'lucide-react'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import { get,post } from '../lib/api'
import { useMeta } from '../lib/meta'

/**
 * SWK OS sign-in. Scene adapted from 21st.dev "X Modern & Stunning sign in" (floodesign): spotlit emblem key, orbit rings, film grain.
 */
export function Login() {
  const { reload } = useMeta()
  const nav = useNavigate()
  const reduce = useReducedMotion()
  const [email, setEmail] = useState(() => localStorage.getItem('swk.remember') || '')
  const [pw, setPw] = useState('')
  const [totp, setTotp] = useState('')
  const [needTotp, setNeedTotp] = useState(false)
  const [remember, setRemember] = useState(() => !!localStorage.getItem('swk.remember'))
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [caps, setCaps] = useState(false)
  const [demo, setDemo] = useState<{ enabled: boolean; email: string; password: string } | null>(null)

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce) return
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--lx', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3))
    e.currentTarget.style.setProperty('--ly', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3))
  }

  useEffect(() => { void get<any>('/api/demo/status').then(setDemo).catch(() => {}) }, [])

  const signIn = async (em: string, pass: string) => {
    setErr(''); setBusy(true)
    try {
      const r = await post<any>('/api/auth/login', { email: em, password: pass, totp: needTotp ? totp : undefined })
      if (r.needsTotp) { setNeedTotp(true); return }
      if (remember && em === email) localStorage.setItem('swk.remember', em)
      else if (!remember) localStorage.removeItem('swk.remember')
      setDone(true)
      await new Promise(res => setTimeout(res, reduce ? 0 : 550))
      await reload()
      nav('/home', { replace: true })
    } catch (e: any) {
      setErr(e.message || 'Sign-in failed. Check your details and try again.')
    } finally { setBusy(false) }
  }
  const submit = (e: React.FormEvent) => { e.preventDefault(); void signIn(email, pw) }
  const rise = (i: number) => ({ className: 'rise', style: { animationDelay: `${0.55 + i * 0.08}s` } })

  return (
    <div className="swk-login3" onPointerMove={onMove}>
      <div className="fx floor" aria-hidden />
      <div className="fx beam" aria-hidden><i /></div>
      <div className="fx rings" aria-hidden><i /><i /><i /></div>
      <div className="fx vig" aria-hidden />
      <svg className="fx grain" aria-hidden><filter id="swk-grain"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves={2} stitchTiles="stitch" /></filter><rect width="100%" height="100%" filter="url(#swk-grain)" /></svg>

      <div className="swk-login3-key">
        <img src="/brand/os/swk-mark.png" alt="SWK Properties" />
        <span className="live" aria-hidden />
        <span className="sheen" aria-hidden />
      </div>

      <main className="swk-login3-stage">
        <h1 {...rise(0)}>Welcome <em>back.</em></h1>
        <p {...rise(1)} className="swk-login3-sub rise">Sign in to your SWK Properties OS workspace.</p>

        <AnimatePresence>
          {err && <motion.div role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden"><div className="swk-login3-err">{err}</div></motion.div>}
        </AnimatePresence>

        <form onSubmit={submit} className="swk-login3-form" aria-label="Sign in">
          <div {...rise(2)}>
            <label className="lbl" htmlFor="email">Email address</label>
            <div className="swk-login3-field"><Mail size={17} /><input id="email" type="email" autoComplete="username" required autoFocus={!email} value={email} onChange={e => setEmail(e.target.value)} placeholder="you@swk.properties" /></div>
          </div>
          <div {...rise(3)}>
            <label className="lbl" htmlFor="pw">Password<a href="/accept-invite" className="swk-login3-link">Forgot password?</a></label>
            <div className="swk-login3-field">
              <Lock size={17} />
              <input id="pw" type={show ? 'text' : 'password'} autoComplete="current-password" required autoFocus={!!email} value={pw} onChange={e => setPw(e.target.value)} onKeyUp={e => setCaps(e.getModifierState?.('CapsLock'))} placeholder="••••••••••" />
              <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </div>
            {caps && <div className="swk-login3-hint">Caps Lock is on</div>}
          </div>

          <AnimatePresence>
            {needTotp && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <label className="lbl" htmlFor="totp">Authenticator code</label>
                <div className="swk-login3-field"><KeyRound size={17} /><input id="totp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus required value={totp} onChange={e => setTotp(e.target.value.replace(/\D/g, ''))} placeholder="6-digit code" style={{ letterSpacing: '.4em' }} /></div>
                <p className="swk-login3-hint">Open your authenticator app and enter the code for SWK OS.</p>
              </motion.div>
            )}
          </AnimatePresence>

          <label {...rise(4)} className="swk-login3-check rise"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />Keep me signed in on this device</label>

          <div {...rise(5)}>
            <button type="submit" className="swk-login3-btn" disabled={busy || done}>
              {done ? <><Check size={18} />Welcome</> : busy ? <><Loader2 size={17} className="animate-spin" />Signing in…</> : <>{needTotp ? 'Verify and sign in' : 'Sign in'}<ArrowRight size={17} /></>}
            </button>
          </div>

          {demo?.enabled && <button type="button" className="swk-login3-btn ghost" disabled={busy} onClick={() => void signIn(demo.email, demo.password)}>Explore the demo workspace</button>}
        </form>
        <p {...rise(6)} className="swk-login3-tag rise">From first call to handover</p>
      </main>

      <p className="swk-login3-foot"><ShieldCheck size={14} />Encrypted session · activity is audited · © {new Date().getFullYear()} SWK Properties LLC</p>
    </div>
  )
}
