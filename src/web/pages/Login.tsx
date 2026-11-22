import { useEffect,useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import AppSignIn,{ type AppSignInPayload } from '@/components/ui/app-sign-in'
import { BlockButton,BlockField } from '@/components/ui/app-sign-in-utils/app-block-kit'
import { get,post } from '../lib/api'
import { useMeta } from '../lib/meta'

/**
 * SWK OS sign-in, built on the 21st.dev "App Sign In" block. Accounts are created by invitation, so sign-up, SSO and
 * magic links are switched off; the authenticator code appears inside the form when the server asks for it.
 */
export function Login() {
  const { reload } = useMeta()
  const nav = useNavigate()
  const [needTotp, setNeedTotp] = useState(false)
  const [totp, setTotp] = useState('')
  const [demo, setDemo] = useState<{ enabled: boolean; email: string; password: string } | null>(null)
  const [demoBusy, setDemoBusy] = useState(false)

  useEffect(() => { void get<any>('/api/demo/status').then(setDemo).catch(() => {}) }, [])

  const signIn = async (email: string, password: string, code?: string) => {
    const r = await post<any>('/api/auth/login', { email, password, totp: code })
    if (r.needsTotp) {
      setNeedTotp(true)
      throw new Error('Enter the 6-digit code from your authenticator app to finish signing in.')
    }
    await reload()
    nav('/home', { replace: true })
  }

  const onSubmit = async ({ email, password, remember }: AppSignInPayload) => {
    if (needTotp && !/^\d{6}$/.test(totp)) throw new Error('Enter the 6-digit code from your authenticator app.')
    await signIn(email, password, needTotp ? totp : undefined)
    if (remember) localStorage.setItem('swk.remember', email)
    else localStorage.removeItem('swk.remember')
  }

  return (
    <div className="swk-signin h-svh w-full">
      <AppSignIn
        theme="auto"
        allowSignUp={false}
        showMagicLink={false}
        providers={[]}
        brand={{ name: 'SWK Properties OS', tagline: 'Sign in to your SWK Properties OS workspace.' }}
        defaultEmail={localStorage.getItem('swk.remember') || ''}
        emailPlaceholder="you@swk.properties"
        rememberLabel="Remember my email on this device"
        logo={<img src="/brand/os/swk-mark.png" alt="" className="h-8 w-auto" />}
        onForgotPassword={() => nav('/accept-invite')}
        onSubmit={onSubmit}
        formExtras={needTotp && (
          <BlockField label="Authenticator code" name="totp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
            placeholder="6-digit code" value={totp} onChange={e => setTotp(e.target.value.replace(/\D/g, ''))}
            hint="Open your authenticator app and enter the code for SWK OS." className="[&_input]:tracking-[.4em]" />
        )}
        panel={<SwkPanel />}
        footer={
          <footer className="flex flex-col gap-3 px-5 pb-5 text-[11.5px] text-[color:var(--bjork-text-soft)] @md:px-8 @md:pb-7">
            {demo?.enabled && (
              <BlockButton variant="secondary" size="md" className="w-full max-w-[384px] self-center" disabled={demoBusy}
                onClick={async () => { setDemoBusy(true); try { await signIn(demo.email, demo.password) } catch { setDemoBusy(false) } }}>
                Explore the demo workspace
              </BlockButton>
            )}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <span>© {new Date().getFullYear()} SWK Properties LLC · Dubai</span>
              <span className="flex items-center gap-1.5"><ShieldCheck size={12} aria-hidden />Encrypted session · activity is audited</span>
            </div>
          </footer>
        }
      />
    </div>
  )
}

function SwkPanel() {
  return (
    <div className="relative flex w-full flex-col justify-between overflow-hidden rounded-[22px] border border-[color:var(--bjork-border)] bg-[#0d0a08] p-9 text-white shadow-[var(--bjork-shadow-panel)] @6xl:p-11">
      <img src="/media/hero/dubai-skyline-hero.webp" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-80" />
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(13,10,8,.55)_0%,rgba(13,10,8,.1)_40%,rgba(13,10,8,.88)_100%)]" />
      <div className="relative flex items-center gap-3">
        <img src="/brand/os/swk-mark.png" alt="" className="h-14 w-auto drop-shadow-[0_6px_14px_rgba(0,0,0,.5)]" />
        <div>
          <p className="text-[15px] font-semibold tracking-[-0.01em]">SWK Properties LLC</p>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#e0bb73]">Dubai · RERA ORN 51517</p>
        </div>
      </div>
      <figure className="relative max-w-[480px]">
        <blockquote className="font-['Instrument_Serif',Georgia,serif] text-[clamp(28px,3vw,40px)] leading-[1.12] tracking-[-0.01em]">
          Every enquiry, listing and deal in one place, <em className="text-[#e0bb73]">from first call to handover</em>.
        </blockquote>
        <figcaption className="mt-4 text-[12.5px] text-white/70">Leads · Listings · Leasing · Accounting · Compliance · Team</figcaption>
      </figure>
    </div>
  )
}
