import { useEffect,useState,type FormEvent } from 'react'
import { Link,useNavigate } from 'react-router-dom'
import { ArrowUpRight,Eye,EyeOff,Lock,Mail,MapPin,QrCode,ShieldCheck } from 'lucide-react'
import { SWK_TEAM_PROFILES } from '@shared/swk-team-profiles'
import { SWK_COMPANY_ADDRESS,SWK_COMPANY_EMAIL,SWK_COMPANY_HOURS,SWK_COMPANY_NAME,SWK_COMPANY_PHONE,SWK_RERA_ORN,SWK_TRADE_LICENSE } from '@shared/corporate-footer'
import { get,post } from '../lib/api'
import { useMeta } from '../lib/meta'

const WEBSITE_TEAM = SWK_TEAM_PROFILES.filter(m => m.onWebsite && m.photo)

function CornerBrackets() {
  const base = 'pointer-events-none absolute h-[8px] w-[8px] border-[#0b2640]/35 transition-all duration-300 ease-out group-hover/brk:border-[#d4a752]'
  return (
    <>
      <span aria-hidden className={`${base} -top-[4px] -left-[4px] border-t-2 border-l-2 group-hover/brk:-top-[6px] group-hover/brk:-left-[6px]`} />
      <span aria-hidden className={`${base} -top-[4px] -right-[4px] border-t-2 border-r-2 group-hover/brk:-top-[6px] group-hover/brk:-right-[6px]`} />
      <span aria-hidden className={`${base} -bottom-[4px] -left-[4px] border-b-2 border-l-2 group-hover/brk:-bottom-[6px] group-hover/brk:-left-[6px]`} />
      <span aria-hidden className={`${base} -bottom-[4px] -right-[4px] border-b-2 border-r-2 group-hover/brk:-bottom-[6px] group-hover/brk:-right-[6px]`} />
    </>
  )
}

function CrossDecor({ at }: { at: 'tl' | 'br' }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round"
      className={`pointer-events-none absolute z-10 size-3.5 text-[#5b676e] ${at === 'tl' ? 'left-0 top-0 -translate-x-1/2 -translate-y-1/2' : 'bottom-0 right-0 translate-x-1/2 translate-y-1/2'}`}>
      <path d="M5 12h14" /><path d="M12 5v14" />
    </svg>
  )
}

/**
 * SWK Properties OS sign-in — exact visual continuation of swkpropertiesuae.com:
 * sky-gradient canvas, architectural vertical hairline grid, frosted glass header,
 * Switzer typography, petrol & crest-gold palette, corner-bracketed primary CTA,
 * flagship Dubai skyline showcase, and RERA ORN 51517 / DET Licence 1511391 credentials.
 */
export function Login() {
  const { reload } = useMeta()
  const nav = useNavigate()
  const [email, setEmail] = useState(() => localStorage.getItem('swk.remember') || '')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(() => Boolean(localStorage.getItem('swk.remember')))
  const [needTotp, setNeedTotp] = useState(false)
  const [totp, setTotp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [demo, setDemo] = useState<{ enabled: boolean; email: string; password: string } | null>(null)
  const [demoBusy, setDemoBusy] = useState(false)

  useEffect(() => { void get<any>('/api/demo/status').then(setDemo).catch(() => {}) }, [])

  const signIn = async (loginEmail: string, loginPassword: string, code?: string) => {
    const r = await post<any>('/api/auth/login', { email: loginEmail, password: loginPassword, totp: code })
    if (r.needsTotp) {
      setNeedTotp(true)
      throw new Error('Enter the 6-digit code from your authenticator app to finish signing in.')
    }
    await reload()
    nav('/home', { replace: true })
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const trimmed = email.trim()
    if (!trimmed || !password) {
      setError('Enter your work email and password.')
      return
    }
    if (needTotp && !/^\d{6}$/.test(totp)) {
      setError('Enter the 6-digit code from your authenticator app.')
      return
    }
    setBusy(true)
    try {
      await signIn(trimmed, password, needTotp ? totp : undefined)
      if (remember) localStorage.setItem('swk.remember', trimmed)
      else localStorage.removeItem('swk.remember')
    } catch (err: any) {
      setError(err?.message || 'Sign-in failed. Check your email and password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="relative flex min-h-svh w-full flex-col overflow-x-clip text-[#0f2a33]"
      style={{ background: 'linear-gradient(135deg, #eef8fd 0%, #d4effc 48%, #f5fbff 100%)' }}
    >
      {/* Signature swkpropertiesuae.com architectural vertical hairline grid + editorial top veil */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-arch-grid opacity-60" />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[520px]"
        style={{ background: 'radial-gradient(ellipse at top, rgba(255,255,255,0.68) 0%, rgba(255,255,255,0.16) 58%, transparent 100%)' }}
      />

      {/* Frosted Glass Header — direct continuation of swkpropertiesuae.com SiteHeader */}
      <header className="sticky top-0 z-30 w-full border-b border-white/70 bg-white/80 shadow-[0_12px_36px_rgba(12,56,96,0.08)] backdrop-blur-2xl">
        <div className="mx-auto flex h-[76px] max-w-[1260px] items-center justify-between gap-4 px-4 sm:px-8">
          <div className="flex items-center gap-3">
            <a
              href="https://www.swkpropertiesuae.com"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex shrink-0 items-center gap-2.5 rounded-2xl px-1.5 py-1 no-underline transition-colors hover:bg-white/70"
              aria-label="SWK Properties Dubai"
            >
              <img
                src="/brand/web/swk-icon-192.webp"
                width={44}
                height={44}
                alt="SWK Properties Emblem"
                className="h-10 w-10 sm:h-11 sm:w-11 shrink-0 object-contain drop-shadow-[0_4px_14px_rgba(196,154,70,0.42)] transition-transform duration-300 group-hover:scale-[1.06]"
              />
              <img
                src="/brand/web/swk-logo-light.webp"
                width={132}
                height={58}
                alt="SWK Properties"
                className="h-9 sm:h-10 w-auto object-contain drop-shadow-[0_2px_10px_rgba(184,134,42,0.2)]"
              />
            </a>
            <span className="hidden h-6 w-px bg-black/10 sm:inline-block" aria-hidden />
            <span className="hidden rounded-full border border-black/10 bg-[#f8f5ef] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#0c233a] sm:inline-flex">
              OS Workspace
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/reception-qr"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[11.5px] font-medium uppercase tracking-[0.12em] text-[#0f2a33]/80 no-underline transition-all hover:-translate-y-0.5 hover:bg-[#0c233a]/[0.07] hover:text-[#0f2a33]"
            >
              <QrCode size={14} className="text-[#8a621c]" aria-hidden />
              <span>Reception QR</span>
            </Link>
            <a
              href="https://www.swkpropertiesuae.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-[11.5px] font-medium uppercase tracking-[0.12em] text-[#0f2a33]/80 no-underline transition-all hover:-translate-y-0.5 hover:bg-[#0c233a]/[0.07] hover:text-[#0f2a33] md:inline-flex"
            >
              <span className="text-[#8a621c]" aria-hidden>+</span>
              <span>Main Website</span>
              <ArrowUpRight size={13} aria-hidden />
            </a>
            <div className="hidden items-center gap-2 rounded-full border border-white/85 bg-white/85 px-3.5 py-1.5 shadow-[0_8px_24px_rgba(12,56,96,0.08)] lg:inline-flex">
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#8a621c] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#8a621c]" />
              </span>
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#0c233a]">
                RERA ORN {SWK_RERA_ORN} · LICENCE {SWK_TRADE_LICENSE}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Architectural Split Workspace */}
      <main className="relative z-10 mx-auto flex w-full max-w-[1260px] flex-1 items-center px-4 py-8 sm:px-8 lg:py-12">
        <div className="grid w-full grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-12">
          {/* Sign-In Card (shown first on mobile, right column on desktop) */}
          <div className="order-1 lg:order-2 lg:col-span-5">
            <div className="relative rounded-3xl border border-white/85 bg-white/88 p-6 shadow-[0_24px_64px_rgba(12,56,96,0.12)] backdrop-blur-2xl sm:p-9">
              <CrossDecor at="tl" />
              <CrossDecor at="br" />

              <div className="mb-6">
                <div className="inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.22em] text-[#8a621c]">
                  <span className="inline-block h-[5px] w-[5px] bg-[#8a621c]" aria-hidden />
                  <span>Staff Sign-In</span>
                </div>
                <h1 className="mt-2.5 text-[30px] font-medium leading-[1.08] tracking-[-0.035em] text-[#0a1624] sm:text-[34px]">
                  Welcome back
                </h1>
                <p className="mt-2 text-[14px] leading-relaxed text-[#3d4a51]">
                  Sign in to your SWK Properties OS workspace.
                </p>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-700"
                >
                  {error}
                </div>
              )}

              <form onSubmit={onSubmit} className="space-y-4" noValidate>
                <div>
                  <label htmlFor="login-email" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[#3d4a51]">
                    Work email
                  </label>
                  <div className="relative">
                    <Mail size={16} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5b676e]" />
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@swk.properties"
                      className="h-12 w-full rounded-xl border border-[#d9d2c4] bg-[#f8f5ef]/80 pl-10 pr-4 text-[14.5px] text-[#0f2a33] outline-none no-focus-outline transition-all placeholder:text-[#5b676e] focus:border-[#0f2a33] focus:bg-white focus:ring-4 focus:ring-[#d4a752]/35"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label htmlFor="login-password" className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-[#3d4a51]">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => nav('/accept-invite')}
                      className="cursor-pointer border-0 bg-transparent p-0 text-[12px] font-medium text-[#8a621c] hover:text-[#0a1624] hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock size={16} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5b676e]" />
                    <input
                      id="login-password"
                      name="password"
                      type={showPw ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="h-12 w-full rounded-xl border border-[#d9d2c4] bg-[#f8f5ef]/80 pl-10 pr-11 text-[14.5px] text-[#0f2a33] outline-none no-focus-outline transition-all placeholder:text-[#5b676e] focus:border-[#0f2a33] focus:bg-white focus:ring-4 focus:ring-[#d4a752]/35"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-[#5b676e] hover:bg-[#ece6da] hover:text-[#0f2a33]"
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {needTotp && (
                  <div>
                    <label htmlFor="login-totp" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[#3d4a51]">
                      Authenticator code
                    </label>
                    <input
                      id="login-totp"
                      name="totp"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      autoFocus
                      value={totp}
                      onChange={e => setTotp(e.target.value.replace(/\D/g, ''))}
                      placeholder="6-digit code"
                      className="h-12 w-full rounded-xl border border-[#d9d2c4] bg-white px-4 text-center font-mono text-[16px] tracking-[0.4em] text-[#0f2a33] outline-none no-focus-outline focus:border-[#0f2a33] focus:ring-4 focus:ring-[#d4a752]/35"
                    />
                    <p className="mt-1.5 text-[12px] text-[#5b676e]">
                      Open your authenticator app and enter the 6-digit code for SWK OS.
                    </p>
                  </div>
                )}

                <label className="flex cursor-pointer items-center gap-2.5 pt-0.5 text-[13px] text-[#3d4a51]">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={e => setRemember(e.target.checked)}
                    className="h-4 w-4 rounded accent-[#8a621c]"
                  />
                  <span>Remember my email on this device</span>
                </label>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="group/brk relative inline-flex h-[48px] w-full cursor-pointer items-center justify-center gap-2 rounded-full border-0 bg-[#0f2a33] px-6 text-[12px] font-semibold uppercase tracking-[0.16em] text-white shadow-[0_14px_34px_rgba(12,35,58,0.22)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:bg-[#d4a752] hover:text-[#0a1624] hover:shadow-[0_16px_38px_rgba(212,167,82,0.34)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <CornerBrackets />
                    <span>{busy ? 'Signing in…' : 'Sign in'}</span>
                  </button>
                </div>

                {demo?.enabled && (
                  <button
                    type="button"
                    disabled={demoBusy}
                    onClick={async () => {
                      setDemoBusy(true); setError('')
                      try { await signIn(demo.email, demo.password) } catch (err: any) { setError(err?.message || 'Demo sign-in unavailable.'); setDemoBusy(false) }
                    }}
                    className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-[#0f2a33]/15 bg-white/90 px-5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#0f2a33] transition-all hover:-translate-y-0.5 hover:border-[#0f2a33] hover:bg-[#0f2a33] hover:text-white disabled:opacity-55"
                  >
                    {demoBusy ? 'Opening demo…' : 'Explore the demo workspace'}
                  </button>
                )}
              </form>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-black/[0.07] pt-4 text-[11.5px] text-[#5b676e]">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck size={13} className="text-[#8a621c]" aria-hidden />
                  Encrypted session · Activity audited
                </span>
                <Link to="/reception-qr" className="font-medium text-[#0f2a33] no-underline hover:text-[#8a621c]">
                  Office QR check-in →
                </Link>
              </div>
            </div>
          </div>

          {/* Brand & Flagship Dubai Showcase (left column on desktop, below form on mobile) */}
          <div className="order-2 flex flex-col gap-5 lg:order-1 lg:col-span-7">
            <div>
              <div className="inline-flex items-center gap-2.5 rounded-full border border-white/80 bg-white/74 px-4 py-1.5 shadow-[0_8px_24px_rgba(12,56,96,0.08)] backdrop-blur-xl">
                <span className="relative flex h-2 w-2" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#8a621c] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#8a621c]" />
                </span>
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#0c233a]">
                  SWK PROPERTIES · SHEIKH ZAYED ROAD HQ
                </span>
              </div>

              <h2 className="mt-4 text-[38px] font-medium leading-[0.98] tracking-[-0.045em] text-[#0a1624] sm:text-[52px] xl:text-[62px]">
                Own the{' '}
                <span className="italic font-light text-[#0f3457]">workspace</span>
                <br />
                behind the skyline
              </h2>
              <p className="mt-3.5 max-w-[540px] text-[15px] leading-[1.6] text-[#273849]">
                Every enquiry, verified listing, RERA contract, Document Studio template, Inside team thread, and handover ledger in one brokerage desk.
              </p>
            </div>

            {/* Flagship Dubai Skyline Frame matching swkpropertiesuae.com hero reel */}
            <div className="relative overflow-hidden rounded-3xl border border-white/85 bg-[#0a1624] shadow-[0_24px_60px_rgba(12,56,96,0.16)]">
              <img
                src="/brand/web/uae-skyline-flagship.webp"
                alt="Dubai architectural skyline — SWK Properties LLC, Sheikh Zayed Road"
                className="h-[280px] w-full object-cover sm:h-[290px]"
              />
              <div
                aria-hidden
                className="absolute inset-0"
                style={{ background: 'linear-gradient(180deg, rgba(10,22,36,0.34) 0%, rgba(10,22,36,0.08) 42%, rgba(10,22,36,0.88) 100%)' }}
              />

              <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/25 bg-[#0f2a33]/72 px-3.5 py-1.5 text-[10.5px] font-medium uppercase tracking-[0.18em] text-white backdrop-blur-md">
                <MapPin size={12} className="text-[#d4a752]" aria-hidden />
                <span>25th Floor · Al Saqr Building · Sheikh Zayed Road</span>
              </div>

              <div className="absolute inset-x-4 bottom-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { v: '18+', l: 'Years UAE Advisory' },
                  { v: SWK_RERA_ORN, l: 'RERA Licensed ORN' },
                  { v: SWK_TRADE_LICENSE, l: 'DET Trade Licence' },
                  { v: '5', l: 'UAE Emirates' },
                ].map(s => (
                  <div key={s.l} className="rounded-2xl border border-white/15 bg-[#0f2a33]/70 px-3.5 py-2.5 text-white backdrop-blur-md">
                    <div className="text-[18px] font-semibold leading-none tracking-[-0.03em] text-[#d4a752] tabular-nums">{s.v}</div>
                    <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-white/75">{s.l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Advisory Team Strip matching swkpropertiesuae.com hero */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/85 bg-white/82 px-4 py-3 shadow-[0_14px_38px_rgba(12,56,96,0.09)] backdrop-blur-2xl">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center -space-x-2">
                  {WEBSITE_TEAM.slice(0, 8).map(member => (
                    <div
                      key={member.slug}
                      title={`${member.name} — ${member.title}`}
                      className="h-9 w-9 shrink-0 overflow-hidden rounded-full border-2 border-white bg-[#eaf3f9] shadow-xs sm:h-10 sm:w-10"
                    >
                      <img src={member.photo} alt={member.name} className="h-full w-full object-cover object-top" />
                    </div>
                  ))}
                </div>
                <div>
                  <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8a621c]">Our Dubai Team</p>
                  <p className="m-0 mt-0.5 text-[12.5px] font-medium text-[#0a1624]">
                    Leads · Listings · Leasing · Finance · Document Studio
                  </p>
                </div>
              </div>
              <span className="text-[11px] text-[#5b676e]">{SWK_COMPANY_HOURS}</span>
            </div>
          </div>
        </div>
      </main>

      {/* Compact Obsidian Footer Band — continuation of swkpropertiesuae.com SiteFooter */}
      <footer className="relative z-10 mt-auto border-t border-white/10 bg-[#0f2a33] text-white">
        <div className="mx-auto flex max-w-[1260px] flex-wrap items-center justify-between gap-4 px-4 py-4 text-[11.5px] text-white/75 sm:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <img src="/brand/web/swk-logo-dark.webp" alt={SWK_COMPANY_NAME} className="h-7 w-auto object-contain" />
            <span className="hidden text-white/25 sm:inline" aria-hidden>|</span>
            <span>
              © {new Date().getFullYear()} {SWK_COMPANY_NAME} · RERA ORN <strong className="text-[#d4a752]">{SWK_RERA_ORN}</strong> · DET Licence <strong className="text-white">{SWK_TRADE_LICENSE}</strong>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-white/70">
            <span>{SWK_COMPANY_ADDRESS}</span>
            <a href={`tel:${SWK_COMPANY_PHONE.replace(/\s+/g, '')}`} className="text-white/85 no-underline hover:text-[#d4a752]">{SWK_COMPANY_PHONE}</a>
            <a href={`mailto:${SWK_COMPANY_EMAIL}`} className="text-white/85 no-underline hover:text-[#d4a752]">{SWK_COMPANY_EMAIL}</a>
            <a href="https://www.swkpropertiesuae.com" target="_blank" rel="noopener noreferrer" className="font-medium text-[#d4a752] no-underline hover:underline">
              www.swkpropertiesuae.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
