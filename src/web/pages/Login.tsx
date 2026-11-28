import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, Eye, EyeOff, Lock, Mail, MapPin, QrCode, ShieldCheck } from 'lucide-react'
import { SWK_TEAM_PROFILES } from '@shared/swk-team-profiles'
import {
  SWK_COMPANY_ADDRESS,
  SWK_COMPANY_EMAIL,
  SWK_COMPANY_HOURS,
  SWK_COMPANY_NAME,
  SWK_COMPANY_PHONE,
  SWK_RERA_ORN,
  SWK_TRADE_LICENSE,
} from '@shared/corporate-footer'
import { get, post } from '../lib/api'
import { useMeta } from '../lib/meta'
import { clearMobileSession, getMobileDeviceAuthPayload, isNativeMobile, setMobileSession } from '../lib/mobileBridge'
import { clearFastQueryCache } from '../lib/prefetch'
import { SwissAtmosphereBackdrop } from '../components/ui/ShaderBackground'
import { BracketButton, LiveStatusDot, SectionEyebrow } from '../components/ui/SwissPrimitives'

const WEBSITE_TEAM = SWK_TEAM_PROFILES.filter(m => m.onWebsite && m.photo)

/**
 * SWK Properties OS sign-in — exact visual continuation of swkpropertiesuae.com:
 * live WebGL sky-ice ShaderBackground, architectural vertical hairline grid, frosted glass header,
 * Switzer typography, obsidian #121212 & emerald/mint accents, corner-bracketed CTA,
 * flagship Dubai skyline showcase, and RERA ORN 51517 / DET Licence 1511391 credentials.
 */
export function Login() {
  const { reload } = useMeta()
  const qc = useQueryClient()
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
    if (!isNativeMobile()) await clearMobileSession()
    const mobilePayload = isNativeMobile() ? await getMobileDeviceAuthPayload() : {}
    const r = await post<any>('/api/auth/login', { email: loginEmail, password: loginPassword, totp: code, ...mobilePayload })
    if (r.needsTotp) {
      setNeedTotp(true)
      throw new Error('Enter the 6-digit code from your authenticator app to finish signing in.')
    }
    if (r.session_token) {
      await setMobileSession(r.session_token, r.device_id ?? (mobilePayload as any).device_id ?? null)
    }
    clearFastQueryCache(qc)
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
    <div className="relative flex min-h-svh w-full flex-col overflow-x-clip text-[#121212]">
      <SwissAtmosphereBackdrop />

      {/* Pure White Header with SWK Logo Tricolor Accent */}
      <header className="sticky top-0 z-30 w-full border-b border-black/[0.08] bg-white/95 shadow-[0_8px_28px_-14px_rgba(10,11,14,0.1)] backdrop-blur-2xl">
        <div
          aria-hidden="true"
          className="h-[3px] w-full"
          style={{ background: 'linear-gradient(90deg, #96202f 0%, #d4a955 50%, #1e6b43 100%)' }}
        />
        <div className="mx-auto flex h-[72px] max-w-[1260px] items-center justify-between gap-4 px-4 sm:px-8">
          <div className="flex items-center gap-3">
            <a
              href="https://www.swkpropertiesuae.com"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex shrink-0 items-center gap-2.5 rounded-2xl px-1.5 py-1 no-underline transition-colors hover:bg-black/[0.03]"
              aria-label="SWK Properties Dubai"
            >
              <img
                src="/brand/web/swk-icon-192.webp?v=swk-8k-v2"
                width={42}
                height={42}
                alt="SWK Properties Emblem"
                className="h-10 w-10 sm:h-11 sm:w-11 shrink-0 object-contain drop-shadow-[0_4px_12px_rgba(212,169,85,0.28)] transition-transform duration-300 group-hover:scale-[1.06]"
              />
              <img
                src="/brand/web/swk-logo-light.webp?v=swk-8k-v2"
                width={132}
                height={58}
                alt="SWK Properties"
                className="h-9 sm:h-10 w-auto object-contain"
              />
            </a>
            <span className="hidden h-6 w-px bg-black/10 sm:inline-block" aria-hidden />
            <span className="hidden rounded-full border border-[#d4a955]/35 bg-[#0a0b0e] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#ebc97c] sm:inline-flex">
              OS Workspace
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/reception-qr"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[#121212]/80 no-underline transition-all hover:-translate-y-0.5 hover:bg-black/[0.05] hover:text-[#121212]"
            >
              <QrCode size={14} className="text-[#0e9f6e]" aria-hidden />
              <span>Reception QR</span>
            </Link>
            <a
              href="https://www.swkpropertiesuae.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[#121212]/80 no-underline transition-all hover:-translate-y-0.5 hover:bg-black/[0.05] hover:text-[#121212] md:inline-flex"
            >
              <span className="text-[#0e9f6e]" aria-hidden>+</span>
              <span>Main Website</span>
              <ArrowUpRight size={13} aria-hidden />
            </a>
            <div className="hidden items-center gap-2 rounded-full border border-white/88 bg-white/88 px-3.5 py-1.5 shadow-[0_8px_24px_rgba(12,56,96,0.08)] lg:inline-flex">
              <LiveStatusDot />
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#121212]">
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
            <div className="relative rounded-[28px] border border-white/90 bg-white/90 p-6 shadow-[0_28px_72px_rgba(12,56,96,0.14)] backdrop-blur-2xl sm:p-9">
              <div className="mb-6">
                <SectionEyebrow>Staff Sign-In</SectionEyebrow>
                <h1 className="mt-2.5 m-0 text-[30px] font-medium leading-[1.06] tracking-[-0.04em] text-[#121212] sm:text-[36px]">
                  Welcome back<span className="text-[#64748b]">.</span>
                </h1>
                <p className="mt-2 mb-0 text-[14px] leading-relaxed text-[#475569]">
                  Sign in to your SWK Properties OS corporate workspace.
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
                  <label htmlFor="login-email" className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#475569]">
                    Work email
                  </label>
                  <div className="relative">
                    <Mail size={16} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748b]" />
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@swk.properties"
                      className="h-12 w-full rounded-xl border border-black/[0.12] bg-white pl-10 pr-4 text-[14.5px] text-[#121212] outline-none no-focus-outline transition-all placeholder:text-[#64748b] focus:border-[#121212] focus:ring-4 focus:ring-[#121212]/10"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label htmlFor="login-password" className="block text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#475569]">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => nav('/accept-invite')}
                      className="cursor-pointer border-0 bg-transparent p-0 text-[12px] font-medium text-[#0e9f6e] hover:text-[#121212] hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock size={16} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748b]" />
                    <input
                      id="login-password"
                      name="password"
                      type={showPw ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="h-12 w-full rounded-xl border border-black/[0.12] bg-white pl-10 pr-11 text-[14.5px] text-[#121212] outline-none no-focus-outline transition-all placeholder:text-[#64748b] focus:border-[#121212] focus:ring-4 focus:ring-[#121212]/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-[#64748b] hover:bg-[#f4f7fa] hover:text-[#121212]"
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {needTotp && (
                  <div>
                    <label htmlFor="login-totp" className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#475569]">
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
                      className="h-12 w-full rounded-xl border border-black/[0.12] bg-white px-4 text-center font-mono text-[16px] tracking-[0.4em] text-[#121212] outline-none no-focus-outline focus:border-[#121212] focus:ring-4 focus:ring-[#121212]/10"
                    />
                    <p className="mt-1.5 text-[12px] text-[#64748b]">
                      Open your authenticator app and enter the 6-digit code for SWK OS.
                    </p>
                  </div>
                )}

                <label className="flex cursor-pointer items-center gap-2.5 pt-0.5 text-[13px] text-[#475569]">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={e => setRemember(e.target.checked)}
                    className="h-4 w-4 rounded accent-[#121212]"
                  />
                  <span>Remember my email on this device</span>
                </label>

                <div className="pt-2">
                  <BracketButton type="submit" disabled={busy} variant="dark" size="lg" className="w-full">
                    {busy ? 'Signing in…' : 'Sign in'}
                  </BracketButton>
                </div>

                {demo?.enabled && (
                  <button
                    type="button"
                    disabled={demoBusy}
                    onClick={async () => {
                      setDemoBusy(true); setError('')
                      try { await signIn(demo.email, demo.password) } catch (err: any) { setError(err?.message || 'Demo sign-in unavailable.'); setDemoBusy(false) }
                    }}
                    className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-black/[0.12] bg-white px-5 text-[11px] font-medium uppercase tracking-[0.16em] text-[#121212] transition-all hover:-translate-y-0.5 hover:border-[#121212] hover:bg-[#121212] hover:text-white disabled:opacity-55"
                  >
                    {demoBusy ? 'Opening demo…' : 'Explore the demo workspace'}
                  </button>
                )}
              </form>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-black/[0.07] pt-4 text-[11.5px] text-[#5b6778]">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck size={13} className="text-[#0e9f6e]" aria-hidden />
                  Encrypted session · Activity audited
                </span>
                <Link to="/reception-qr" className="font-medium text-[#121212] no-underline hover:text-[#0e9f6e]">
                  Office QR check-in →
                </Link>
              </div>
            </div>
          </div>

          {/* Brand & Flagship Dubai Showcase (left column on desktop, below form on mobile) */}
          <div className="order-2 flex flex-col gap-5 lg:order-1 lg:col-span-7">
            <div>
              <div className="inline-flex items-center gap-2.5 rounded-full border border-white/88 bg-white/82 px-4 py-1.5 shadow-[0_8px_24px_rgba(12,56,96,0.08)] backdrop-blur-xl">
                <LiveStatusDot />
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#121212]">
                  SWK PROPERTIES · SHEIKH ZAYED ROAD HQ
                </span>
              </div>

              <h2 className="mt-4 m-0 text-[38px] font-medium leading-[0.98] tracking-[-0.045em] text-[#121212] sm:text-[52px] xl:text-[62px]">
                Own the{' '}
                <span className="italic font-light text-[#475569]">workspace</span>
                <br />
                behind the skyline
              </h2>
              <p className="mt-3.5 mb-0 max-w-[540px] text-[15px] leading-[1.6] text-[#334155]">
                Every enquiry, verified listing, RERA contract, Mortgage Desk workflow, Document Studio template, and handover ledger in one brokerage desk.
              </p>
            </div>

            {/* Flagship Dubai Skyline Frame matching swkpropertiesuae.com hero reel */}
            <div className="relative overflow-hidden rounded-[26px] border border-white/90 bg-[#121212] shadow-[0_24px_60px_rgba(12,56,96,0.16)]">
              <img
                src="/brand/web/uae-skyline-flagship.webp"
                alt="Dubai architectural skyline — SWK Properties LLC, Sheikh Zayed Road"
                className="h-[270px] w-full object-cover sm:h-[290px]"
              />
              <div
                aria-hidden
                className="absolute inset-0"
                style={{ background: 'linear-gradient(180deg, rgba(12,18,28,0.28) 0%, rgba(12,18,28,0.08) 45%, rgba(12,18,28,0.88) 100%)' }}
              />

              <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-[#d4a955]/45 bg-[#0a0b0e]/85 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-md">
                <MapPin size={12} className="text-[#ebc97c]" aria-hidden />
                <span>25th Floor · Al Saqr Building · Sheikh Zayed Road</span>
              </div>

              <div className="absolute inset-x-4 bottom-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { v: '18+', l: 'Years UAE Advisory' },
                  { v: SWK_RERA_ORN, l: 'RERA Licensed ORN' },
                  { v: SWK_TRADE_LICENSE, l: 'DET Trade Licence' },
                  { v: '5', l: 'UAE Emirates' },
                ].map(s => (
                  <div key={s.l} className="rounded-2xl border border-[#d4a955]/30 bg-[linear-gradient(155deg,rgba(28,30,39,0.92)_0%,rgba(10,11,14,0.94)_100%)] px-3.5 py-2.5 text-white shadow-[0_12px_24px_rgba(0,0,0,0.4)] backdrop-blur-md">
                    <div className="font-mono text-[18px] font-bold leading-none tracking-[-0.03em] text-[#ebc97c] tabular-nums">{s.v}</div>
                    <div className="mt-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/75">{s.l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Advisory Team Strip */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-black/[0.08] bg-white px-4 py-3 shadow-[0_14px_34px_-16px_rgba(10,11,14,0.1)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center -space-x-2">
                  {WEBSITE_TEAM.slice(0, 8).map(member => (
                    <div
                      key={member.slug}
                      title={`${member.name} — ${member.title}`}
                      className="h-9 w-9 shrink-0 overflow-hidden rounded-full border-2 border-white bg-[#f7f7f9] shadow-xs sm:h-10 sm:w-10"
                    >
                      <img src={member.photo} alt={member.name} className="h-full w-full object-cover object-top" />
                    </div>
                  ))}
                </div>
                <div>
                  <SectionEyebrow accent="emerald">Our Dubai Team</SectionEyebrow>
                  <p className="m-0 mt-0.5 text-[12.5px] font-semibold text-[#0a0b0e]">
                    Leads · Listings · Leasing · Mortgage · Document Studio
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-mono text-[#5b6778]">{SWK_COMPANY_HOURS}</span>
            </div>
          </div>
        </div>
      </main>

      {/* Compact Glossy Obsidian Footer Band */}
      <footer className="relative z-10 mt-auto border-t border-[#d4a955]/30 bg-[linear-gradient(155deg,#181a22_0%,#0a0b0e_60%,#050507_100%)] text-white">
        <div className="mx-auto flex max-w-[1260px] flex-wrap items-center justify-between gap-4 px-4 py-4 text-[11.5px] text-white/75 sm:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2">
              <img src="/brand/web/swk-icon-192.webp?v=swk-8k-v2" alt="" className="h-7 w-7 object-contain" />
              <img src="/brand/web/swk-logo-dark.webp?v=swk-8k-v2" alt={SWK_COMPANY_NAME} className="h-7 w-auto object-contain" />
            </span>
            <span className="hidden text-white/25 sm:inline" aria-hidden>|</span>
            <span>
              © {new Date().getFullYear()} {SWK_COMPANY_NAME} · RERA ORN <strong className="text-[#ebc97c]">{SWK_RERA_ORN}</strong> · DET Licence <strong className="text-white">{SWK_TRADE_LICENSE}</strong>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-white/70">
            <span>{SWK_COMPANY_ADDRESS}</span>
            <a href={`tel:${SWK_COMPANY_PHONE.replace(/\s+/g, '')}`} className="text-white/85 no-underline hover:text-[#ebc97c]">{SWK_COMPANY_PHONE}</a>
            <a href={`mailto:${SWK_COMPANY_EMAIL}`} className="text-white/85 no-underline hover:text-[#ebc97c]">{SWK_COMPANY_EMAIL}</a>
            <a href="https://www.swkpropertiesuae.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#ebc97c] no-underline hover:underline">
              www.swkpropertiesuae.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
