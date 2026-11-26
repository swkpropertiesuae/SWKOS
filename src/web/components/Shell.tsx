import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Languages,
  LayoutGrid,
  LifeBuoy,
  Lock,
  LogOut,
  MapPin,
  MapPinned,
  Menu,
  MessagesSquare,
  Mic,
  MicOff,
  Navigation,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  PhoneCall,
  PhoneOff,
  Plus,
  QrCode,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wrench,
  X,
} from 'lucide-react'
import { useMeta } from '../lib/meta'
import { get, post } from '../lib/api'
import { cls, fmtIsoStamp } from '../lib/format'
import { Modal, useClickOutside } from '../ui/kit'
import { CommandPalette } from './CommandPalette'
import { LiveNotifications } from './LiveNotifications'
import { ChatNotifier } from './ChatNotifier'
import { SipSoftphoneDock } from './SipSoftphoneDock'
import { BiometricLockOverlay } from './BiometricLockOverlay'
import { ChatDock } from './ChatDock'
import { StaffPhoto } from './ui/staff-photo'
import { SwissAtmosphereBackdrop } from './ui/ShaderBackground'
import { clearMobileSession, lockScreenNow, openManageLockPin, registerNativePush, stopNativeFieldDuty, unregisterNativePush } from '../lib/mobileBridge'
import { sipClient, useSipClient } from '../lib/sipClient'
import { APP_META, QUICK_CREATE, findNav, isNavItemVisible, launcherApps, rememberVisit } from '../swk/nav'
import { canAccessFieldLiveMap, canPrintReceptionQr, isAllowedPathForRestrictedStaff, isRestrictedStaffUser } from '@shared/swk-staff-access'

/** Live Dubai time (Gulf Standard Time). */
function DubaiClock() {
  const [t, setT] = useState(new Date())
  useEffect(() => {
    const i = setInterval(() => setT(new Date()), 20000)
    return () => clearInterval(i)
  }, [])
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: true }).format(t).toUpperCase()
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', weekday: 'short', day: '2-digit', month: 'short' }).format(t)
  return (
    <span className="swk-chip swk-hide-md" title="Gulf Standard Time (GST, UTC+4)">
      <span className="dot" />
      Dubai <b>{time}</b>
      <span className="text-muted">· {day}</span>
    </span>
  )
}

function NotificationBell() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false))
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => get<{ unread: number; rows: any[] }>('/api/notifications'), refetchInterval: 60000 })
  const unread = q.data?.unread ?? 0
  const read = async (ids?: number[]) => {
    await post('/api/notifications/read', ids ? { ids } : { all: true })
    void qc.invalidateQueries({ queryKey: ['notifications'] })
  }
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="swk-tbtn" onClick={() => setOpen(o => !o)} aria-label={`Notifications, ${unread} unread`}>
        <Bell size={17} />
        {unread > 0 && <span className="count">{unread > 99 ? '99+' : unread}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="swk-menu"
            style={{ width: 372, padding: 0, overflow: 'hidden' }}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
          >
            <div className="flex items-center px-4 py-3 border-b border-line bg-soft">
              <b className="font-display text-[14.5px] text-ink">Notifications</b>
              <div className="flex-1" />
              {unread > 0 && (
                <button type="button" className="btn ghost sm" onClick={() => void read()}>
                  <Check size={14} /> Mark all read
                </button>
              )}
            </div>
            <div className="max-h-[60vh] overflow-auto">
              {!q.data?.rows.length ? (
                <div className="p-8 text-center text-muted text-sm">You&apos;re all caught up.</div>
              ) : (
                q.data.rows.map(n => (
                  <button
                    type="button"
                    key={n.id}
                    className={cls('w-full text-start px-4 py-3 border-0 border-b border-line bg-transparent cursor-pointer hover:bg-soft transition-colors', !n.read_at && 'bg-[#eff6ff]/60')}
                    onClick={() => {
                      void read([n.id])
                      setOpen(false)
                      if (n.link) nav(n.link)
                    }}
                  >
                    <div className="flex gap-2.5 items-start">
                      {!n.read_at && <span className="w-2 h-2 rounded-full bg-[#2563eb] mt-1.5 flex-none" />}
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold text-ink">{n.title}</div>
                        {n.body && <div className="text-xs text-muted line-clamp-2 mt-0.5">{n.body}</div>}
                        <div className="text-[11px] text-muted mt-1">{fmtIsoStamp(n.created_at)}</div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function QuickCreate() {
  const { me, can } = useMeta()
  const [open, setOpen] = useState(false)
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false))
  if (!me || me.party_id) return null
  const restricted = isRestrictedStaffUser(me)
  const items = QUICK_CREATE.filter(i => can(i.module, 'create') && (!restricted || isAllowedPathForRestrictedStaff(i.to.split('?')[0]!)))
  if (!items.length) return null
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="swk-create" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Quick Add">
        <Plus size={16} />
        <span className="swk-hide-sm">Quick Add</span>
        <ChevronDown size={14} className="opacity-75 swk-hide-sm" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            className="swk-menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
          >
            {items.map((i, idx) => (
              <motion.div key={i.to} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.02 }}>
                <Link role="menuitem" to={i.to} onClick={() => setOpen(false)}>
                  <span className="ic">
                    <i.icon size={16} />
                  </span>
                  <span>
                    <b className="font-semibold text-ink">{i.label}</b>
                    <small>{i.desc}</small>
                  </span>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** High-contrast collapsible sidebar for the active workspace section. */
function AppSidebar({ pathname, collapsed, onToggle, onCloseMobile }: { pathname: string; collapsed: boolean; onToggle: () => void; onCloseMobile: () => void }) {
  const { me, can } = useMeta()
  const here = findNav(pathname)
  const items = useMemo(() => (here?.section.items ?? []).filter(i => isNavItemVisible(i, can, me)), [here, can, me])
  if (!here || items.length < 1 || here.section.items.length < 2) return null
  const meta = APP_META[here.section.key]
  return (
    <aside className={cls('swk-app-sidebar no-print', collapsed && 'is-collapsed')}>
      <nav className="swk-sidebar-nav" aria-label={`${here.section.label} pages`}>
        <div className="flex items-center justify-between gap-2 pb-2 mb-1 border-b border-line lg:hidden">
          <Link to="/home" onClick={onCloseMobile} className="inline-flex items-center gap-2 no-underline">
            <img src="/brand/web/swk-icon-192.webp" alt="" className="size-8 object-contain" />
            <span className="font-display font-bold text-sm text-ink">SWK OS</span>
          </Link>
          <button type="button" onClick={onCloseMobile} aria-label="Close navigation" className="swk-sidebar-collapse-btn">
            <X size={15} />
          </button>
        </div>
        <div className="swk-sidebar-head">
          <Link to="/home" onClick={onCloseMobile} className="swk-sidebar-back" title="All apps">
            <ArrowLeft size={14} />
            <span className="swk-sidebar-link-tx">All apps</span>
          </Link>
          <button
            type="button"
            onClick={onToggle}
            className="swk-sidebar-collapse-btn swk-hide-md"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
        </div>
        <div className="swk-sidebar-group">
          <div className="swk-sidebar-group-label">
            {meta && <meta.icon size={13} />}
            <span className="swk-sidebar-link-tx">{here.section.label}</span>
          </div>
          {items.map((i, idx) => {
            const isActive = here.item.to === i.to
            return (
              <NavLink
                key={i.to}
                to={i.to}
                onClick={onCloseMobile}
                title={i.desc ? `${i.label} — ${i.desc}` : i.label}
                className={cls('swk-sidebar-link', isActive && 'active')}
                aria-current={isActive ? 'page' : undefined}
              >
                <i.icon size={16} strokeWidth={1.9} />
                <span className="swk-sidebar-link-tx">{i.label}</span>
                {items.length >= 3 && <span className="swk-sidebar-step-badge">{String(idx + 1).padStart(2, '0')}</span>}
              </NavLink>
            )
          })}
        </div>
      </nav>
    </aside>
  )
}

/**
 * Inline Sequential Workflow Stepper (Eliminates Sidebar Hopping):
 * Renders the active section's workflow steps cleanly one after another with Previous / Next controls.
 */
function WorkflowStepper({ pathname }: { pathname: string }) {
  const { me, can } = useMeta()
  const nav = useNavigate()
  const activeRef = useRef<HTMLAnchorElement | null>(null)
  const here = findNav(pathname)
  const items = useMemo(() => (here?.section.items ?? []).filter(i => isNavItemVisible(i, can, me)), [here, can, me])
  const currentIdx = items.findIndex(i => i.to === here?.item.to)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  }, [pathname])

  if (!here || items.length < 2 || pathname.startsWith('/chat') || pathname === '/dashboard') return null
  const prev = currentIdx > 0 ? items[currentIdx - 1] : null
  const next = currentIdx >= 0 && currentIdx < items.length - 1 ? items[currentIdx + 1] : null

  return (
    <div className="swk-workflow-bar no-print" role="region" aria-label={`${here.section.label} workflow steps`}>
      <div className="swk-workflow-steps">
        {items.map((step, idx) => {
          const active = idx === currentIdx
          return (
            <Link
              key={step.to}
              ref={active ? activeRef : undefined}
              to={step.to}
              className={cls('swk-wf-pill', active && 'active')}
              aria-current={active ? 'step' : undefined}
              title={step.desc || step.label}
            >
              <span className="swk-wf-num">{idx + 1}</span>
              <span>{step.label}</span>
            </Link>
          )
        })}
      </div>
      <div className="swk-wf-nav">
        <button
          type="button"
          className="btn outline sm"
          disabled={!prev}
          onClick={() => prev && nav(prev.to)}
          title={prev ? `Previous: ${prev.label}` : 'First step'}
        >
          <ChevronLeft size={14} /> Prev
        </button>
        <button
          type="button"
          className="btn green sm"
          disabled={!next}
          onClick={() => next && nav(next.to)}
          title={next ? `Next: ${next.label}` : 'Final step'}
        >
          {next ? `Next: ${next.label}` : 'Final step'} <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}

export function Shell() {
  const { me, setMe, meta, can } = useMeta()
  const nav = useNavigate()
  const loc = useLocation()
  const sipSnap = useSipClient()
  const isStaff = Boolean(me?.id && !me?.party_id)
  const mustChangePw = Boolean(me?.mustChangePassword)
  const canFieldLive = canAccessFieldLiveMap(me)
  const canAi = isStaff && can('ai', 'view')

  const [palette, setPalette] = useState(false)
  const [guide, setGuide] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [opsSheet, setOpsSheet] = useState(false)
  useEffect(() => {
    setDrawer(false)
    setOpsSheet(false)
  }, [loc.pathname])

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('swk.sidebar.collapsed') === '1')
  const toggleSidebar = () =>
    setCollapsed(c => {
      const next = !c
      try {
        localStorage.setItem('swk.sidebar.collapsed', next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  const userRef = useClickOutside<HTMLDivElement>(() => setUserMenu(false))

  const chatUnread =
    useQuery({
      queryKey: ['chat-unread'],
      enabled: isStaff && !mustChangePw,
      queryFn: () => get<{ unread: number }>('/api/chat/unread'),
      refetchInterval: 60000,
    }).data?.unread ?? 0

  const mobileApps = useMemo(() => (isStaff ? launcherApps(can, me) : []), [isStaff, can, me])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette(true)
      }
      if (e.key === 'Escape') {
        setOpsSheet(false)
        setDrawer(false)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  useEffect(() => {
    rememberVisit(loc.pathname)
  }, [loc.pathname])

  useEffect(() => {
    if (!isStaff) return
    let disposePush: (() => void) | undefined
    void registerNativePush().then(fn => {
      disposePush = fn
    })
    const onNavigate = (ev: Event) => {
      const target = String((ev as CustomEvent<{ url?: string }>)?.detail?.url || '').trim()
      if (target.startsWith('/') && !target.startsWith('//')) nav(target)
    }
    const onSipWake = () => {
      void sipClient.init(true)
    }
    const onSipCallEnded = () => {
      void sipClient.hangup()
    }
    window.addEventListener('swk:navigate', onNavigate)
    window.addEventListener('swk:sip-wake', onSipWake)
    window.addEventListener('swk:sip-call-ended', onSipCallEnded)
    return () => {
      window.removeEventListener('swk:navigate', onNavigate)
      window.removeEventListener('swk:sip-wake', onSipWake)
      window.removeEventListener('swk:sip-call-ended', onSipCallEnded)
      disposePush?.()
    }
  }, [isStaff, nav, me?.id])

  const logout = async () => {
    try { await unregisterNativePush() } catch { /* ignore */ }
    try { await stopNativeFieldDuty() } catch { /* ignore */ }
    try { await post('/api/auth/logout') } catch { /* ignore */ }
    try { await sipClient.disconnect() } catch { /* ignore */ }
    await clearMobileSession()
    setMe(null)
    nav('/login')
  }

  const isPrint = loc.pathname.startsWith('/print')
  const here = findNav(loc.pathname)
  const isHome = loc.pathname === '/home'
  // Same visibility rule as AppSidebar: it renders nothing when the user can see none of the section's items,
  // so the sidebar grid column must not be reserved either (otherwise the page is squeezed into 248px).
  const showSidebar = !isHome && !!here && here.section.items.length > 1 && here.section.items.some(i => isNavItemVisible(i, can, me))
  const pageTitle = isHome ? 'All apps' : here?.item.label ?? titleFromPath(loc.pathname)
  if (isPrint) {
    return (
      <main id="main">
        <Outlet context={{ openGuide: () => setGuide(true), openSearch: () => setPalette(true), logout }} />
      </main>
    )
  }

  const initials = (me?.name || me?.email || 'S')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]!.toUpperCase())
    .join('')
  const isFieldOrVoicePath = loc.pathname === '/reception-qr' || loc.pathname.startsWith('/field-duty') || loc.pathname === '/field-live' || loc.pathname.startsWith('/phone') || loc.pathname.startsWith('/utilities')
  const activeCall = sipSnap.activeCall

  return (
    <div className="swk-app">
      <SwissAtmosphereBackdrop />
      <div className="swk-main-col">
        <header className="swk-top no-print">
          {!isHome && !!here && (
            <button type="button" className="swk-menu-btn" onClick={() => setDrawer(d => !d)} aria-label="Open menu" aria-expanded={drawer}>
              <Menu size={18} />
            </button>
          )}
          <Link to="/home" className="swk-top-brand" aria-label="SWK Properties OS, all apps">
            <img className="icon" src="/brand/web/swk-icon-192.webp" alt="" />
            <img className="word swk-hide-sm" src="/brand/web/swk-logo-light.webp" alt="SWK Properties" />
          </Link>

          {/* Mobile compact location/office pill */}
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center md:hidden">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-muted leading-none">SWK Dubai HQ</span>
            <span className="mt-0.5 inline-flex items-center gap-1 text-[12.5px] font-medium text-ink truncate max-w-[165px]">
              <MapPin size={12} className="text-[#0e9f6e] shrink-0" />
              <span className="truncate">{isHome ? 'Sheikh Zayed Rd' : pageTitle}</span>
            </span>
          </div>

          <div className="swk-top-title">
            <div className="crumb">
              <Link to="/home">SWK OS</Link>
              {here && (
                <>
                  <ChevronRight size={12} />
                  <span>{here.section.label}</span>
                </>
              )}
              <ChevronRight size={12} />
              <b>{pageTitle}</b>
            </div>
          </div>

          <div className="hidden md:block flex-1" />
          <DubaiClock />
          <button type="button" className="swk-search-pill" onClick={() => setPalette(true)} aria-label="Search (Ctrl K)">
            <Search size={15} />
            <span className="swk-hide-sm">Search leads, properties…</span>
            <kbd>Ctrl K</kbd>
          </button>
          {!mustChangePw && <ChatNotifier />}
          {!mustChangePw && <NotificationBell />}
          <span className="hidden sm:inline-flex">
            <QuickCreate />
          </span>
          <div className="relative" ref={userRef}>
            <button type="button" className="swk-avatar cursor-pointer" onClick={() => setUserMenu(o => !o)} aria-label="Account menu" aria-expanded={userMenu}>
              <StaffPhoto email={me?.email} className="size-full object-cover object-top" fallback={initials} />
            </button>
            <AnimatePresence>
              {userMenu && (
                <motion.div className="swk-menu" style={{ minWidth: 260 }} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
                  <div className="px-3 py-2.5">
                    <div className="font-semibold text-ink text-[14px] truncate">{me?.name}</div>
                    <div className="text-xs text-muted truncate">{me?.email}</div>
                  </div>
                  <div className="sep" />
                  {canPrintReceptionQr(me) ? (
                    <Link to="/reception-display" onClick={() => setUserMenu(false)}>
                      <span className="ic"><QrCode size={16} /></span>Reception check-in code screen
                    </Link>
                  ) : isStaff ? (
                    <Link to="/reception-qr" onClick={() => setUserMenu(false)}>
                      <span className="ic"><Camera size={16} /></span>Scan &amp; Check-In Attendance
                    </Link>
                  ) : null}
                  {isStaff && (
                    <>
                      <button type="button" className="item" onClick={() => { setUserMenu(false); lockScreenNow('manual') }}>
                        <span className="ic"><Lock size={16} /></span>Lock screen
                      </button>
                      <button type="button" className="item" onClick={() => { setUserMenu(false); openManageLockPin() }}>
                        <span className="ic"><ShieldCheck size={16} /></span>Local lock PIN
                      </button>
                    </>
                  )}
                  <Link to="/profile" onClick={() => setUserMenu(false)}>
                    <span className="ic"><UserRound size={16} /></span>My profile &amp; password
                  </Link>
                  <Link to="/workspace-tools" onClick={() => setUserMenu(false)}>
                    <span className="ic"><Languages size={16} /></span>Language &amp; preferences
                  </Link>
                  <Link to="/home" onClick={() => setUserMenu(false)}>
                    <span className="ic"><LayoutGrid size={16} /></span>All apps
                  </Link>
                  <button type="button" className="item" onClick={() => { setUserMenu(false); setGuide(true) }}>
                    <span className="ic"><LifeBuoy size={16} /></span>Help guide
                  </button>
                  <div className="sep" />
                  <button type="button" className="item" onClick={() => void logout()}>
                    <span className="ic"><LogOut size={16} /></span>Sign out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </header>

        {/* Mobile Active SIP Call Ribbon (only appears when a live call is active — zero idle clutter!) */}
        {isStaff && activeCall && (
          <div className="md:hidden no-print px-4 py-2 bg-[#0b1f2a] text-white flex items-center justify-between gap-2 border-b border-white/10">
            <Link to="/phone" className="flex items-center gap-2 min-w-0 flex-1 no-underline text-white">
              <span className="size-2.5 rounded-full bg-[#0e9f6e] animate-pulse shrink-0" />
              <span className="truncate text-xs font-semibold">
                {activeCall.isMaskedVault ? 'Masked Vault Call' : activeCall.remoteDisplay} · {activeCall.state === 'connected' ? `${Math.floor(activeCall.durationSec / 60)}:${String(activeCall.durationSec % 60).padStart(2, '0')}` : 'Ringing…'}
              </span>
            </Link>
            <div className="flex items-center gap-1.5 shrink-0">
              {activeCall.state === 'ringing_in' ? (
                <button type="button" onClick={() => void sipClient.answer()} className="rounded-full bg-[#047857] px-3 py-1 text-[11px] font-bold text-white border-0 cursor-pointer inline-flex items-center gap-1">
                  <Phone size={12} /> Answer
                </button>
              ) : (
                <button type="button" onClick={() => sipClient.toggleMute()} className="size-7 rounded-full bg-white/15 text-white grid place-items-center border-0 cursor-pointer" aria-label={activeCall.muted ? 'Unmute' : 'Mute'}>
                  {activeCall.muted ? <MicOff size={13} /> : <Mic size={13} />}
                </button>
              )}
              <button type="button" onClick={() => void sipClient.hangup()} className="size-7 rounded-full bg-[#dc2626] text-white grid place-items-center border-0 cursor-pointer" aria-label="End call">
                <PhoneOff size={13} />
              </button>
            </div>
          </div>
        )}

        {me?.demo && (
          <div className="demo-notice no-print">
            <span>
              <strong>Demo workspace</strong> · sample data · external messages switched off
            </span>
            <details>
              <summary>Details</summary>
              <p className="mt-2 mb-3 text-xs text-body">Safe practice environment. Resets every night. External email and WhatsApp messages are disabled.</p>
              <button
                type="button"
                className="btn outline sm"
                onClick={async () => {
                  if (confirm('Restore the demo to its original state and sign out?')) {
                    await post('/api/demo/reset')
                    window.location.href = '/login'
                  }
                }}
              >
                Reset demo
              </button>
            </details>
          </div>
        )}
        {me?.defaultPassword && !me?.demo && (
          <div className="no-print bg-[#fef7e6] text-[#8a5f14] border-b border-[#f2dfb6] px-5 py-2 text-sm font-semibold flex items-center gap-3 flex-wrap">
            You are signed in with the default password.{' '}
            <Link to="/profile" className="underline text-[#0b1f2a]">
              Change it now
            </Link>
          </div>
        )}

        <div className={cls('swk-body', drawer && 'sb-open', showSidebar && 'has-sidebar', showSidebar && collapsed && 'is-collapsed')}>
          {drawer && <div className="swk-sb-scrim" onClick={() => setDrawer(false)} />}
          {!isHome && <AppSidebar pathname={loc.pathname} collapsed={collapsed} onToggle={toggleSidebar} onCloseMobile={() => setDrawer(false)} />}
          <main className="swk-main" id="main">
            {!isHome && <WorkflowStepper pathname={loc.pathname} />}
            <motion.div key={loc.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}>
              <Outlet context={{ openGuide: () => setGuide(true), openSearch: () => setPalette(true), logout }} />
            </motion.div>
          </main>
        </div>

        {/* Floating Pill Mobile Bottom Navigation with Raised Center QR/Scan Orb (@siren.uix + Editorial Inspiration) */}
        {isStaff ? (
          <nav className="swk-mobile-bottom-nav no-print" aria-label="Mobile quick navigation">
            <NavLink to="/home" className={({ isActive }) => cls('swk-mnav-item relative', (isActive || loc.pathname === '/dashboard') && 'active')}>
              <LayoutGrid size={19} />
              <span>Home</span>
            </NavLink>
            <NavLink to="/chat" className={({ isActive }) => cls('swk-mnav-item relative', isActive && 'active')} aria-label={`Inside messenger${chatUnread > 0 ? `, ${chatUnread} unread` : ''}`}>
              <MessagesSquare size={19} />
              {chatUnread > 0 && (
                <span className="absolute top-1 right-2.5 min-w-[17px] h-[17px] px-1 rounded-full bg-[#dc2626] text-white text-[9.5px] font-bold grid place-items-center leading-none border-2 border-white">
                  {chatUnread > 99 ? '99+' : chatUnread}
                </span>
              )}
              <span>Inside</span>
            </NavLink>

            <Link to="/reception-qr" className="swk-mnav-orb" aria-label="Office QR Check-In">
              <span className="swk-mnav-orb-btn">
                <QrCode size={22} />
              </span>
            </Link>

            <NavLink to={canAi ? '/ai' : '/calendar'} className={({ isActive }) => cls('swk-mnav-item relative', isActive && 'active')}>
              <Sparkles size={19} />
              <span>{canAi ? 'AI Brain' : 'Schedule'}</span>
            </NavLink>

            <button
              type="button"
              onClick={() => setOpsSheet(o => !o)}
              aria-expanded={opsSheet}
              aria-label="Field, Calling and All Company Ops"
              className={cls('swk-mnav-item relative', (opsSheet || isFieldOrVoicePath) && 'active')}
            >
              <Wrench size={19} />
              {(sipSnap.activeCall || sipSnap.registration === 'registered') && (
                <span className={cls('absolute top-1.5 right-3 size-2 rounded-full', sipSnap.activeCall ? 'bg-[#0e9f6e] animate-pulse' : 'bg-[#2563eb]')} />
              )}
              <span>Apps</span>
            </button>
          </nav>
        ) : (
          <nav className="swk-mobile-bottom-nav no-print" aria-label="Portal quick navigation">
            <NavLink to="/portal" className={({ isActive }) => cls('swk-mnav-item col-span-3', isActive && 'active')}>
              <LayoutGrid size={19} />
              <span>Service Portal</span>
            </NavLink>
            <button type="button" onClick={() => setPalette(true)} className="swk-mnav-item col-span-2">
              <Search size={19} />
              <span>Search</span>
            </button>
          </nav>
        )}
      </div>

      {/* Mobile Field / QR / SIP + Full Role-Scoped Company Ops Drawer */}
      <AnimatePresence>
        {isStaff && opsSheet && (
          <motion.div
            className="fixed inset-0 z-[85] md:hidden no-print flex flex-col justify-end bg-[#0b1f2a]/50 backdrop-blur-xs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={e => {
              if (e.target === e.currentTarget) setOpsSheet(false)
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Field, Calling and Company Operations"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="max-h-[84dvh] overflow-y-auto rounded-t-[28px] border-t border-line bg-white px-5 pt-4 pb-[calc(92px+env(safe-area-inset-bottom,0px))] shadow-2xl space-y-4"
            >
              <div className="mx-auto h-1.5 w-11 rounded-full bg-[#cbd5e1]" />
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#475569]">
                    <span className="inline-block size-[5px] bg-[#121212]" />
                    SWK Field · Voice · All Ops
                  </div>
                  <h2 className="m-0 mt-1 text-lg font-medium tracking-[-0.03em] text-[#121212]">Quick Actions &amp; Company Apps</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setOpsSheet(false)}
                  aria-label="Close drawer"
                  className="size-9 rounded-full border border-line bg-soft text-ink grid place-items-center cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <Link to="/reception-qr" onClick={() => setOpsSheet(false)} className="rounded-2xl border border-line bg-soft/80 p-3 flex items-center gap-2.5 no-underline text-ink">
                  <span className="size-10 rounded-xl bg-[#121212] text-[#51fec0] grid place-items-center shrink-0"><QrCode size={18} /></span>
                  <span className="min-w-0"><b className="block text-xs truncate">Office QR Scan</b><small className="text-[11px] text-muted">Attendance check-in</small></span>
                </Link>
                <Link to="/field-duty" onClick={() => setOpsSheet(false)} className="rounded-2xl border border-line bg-soft/80 p-3 flex items-center gap-2.5 no-underline text-ink">
                  <span className="size-10 rounded-xl bg-[#121212] text-[#51fec0] grid place-items-center shrink-0"><Navigation size={18} /></span>
                  <span className="min-w-0"><b className="block text-xs truncate">Field Duty GPS</b><small className="text-[11px] text-muted">Viewing tracking &amp; SOS</small></span>
                </Link>
                <Link to="/phone" onClick={() => setOpsSheet(false)} className="rounded-2xl border border-line bg-soft/80 p-3 flex items-center gap-2.5 no-underline text-ink">
                  <span className="size-10 rounded-xl bg-[#121212] text-[#51fec0] grid place-items-center shrink-0"><PhoneCall size={18} /></span>
                  <span className="min-w-0"><b className="block text-xs truncate">SIP Softphone</b><small className="text-[11px] text-muted">{sipSnap.configured ? `Ext ${sipSnap.extensionNo}` : 'Dialer & Vault call'}</small></span>
                </Link>
                <Link to="/utilities" onClick={() => setOpsSheet(false)} className="rounded-2xl border border-line bg-soft/80 p-3 flex items-center gap-2.5 no-underline text-ink">
                  <span className="size-10 rounded-xl bg-[#121212] text-[#51fec0] grid place-items-center shrink-0"><Wrench size={18} /></span>
                  <span className="min-w-0"><b className="block text-xs truncate">Utilities Suite</b><small className="text-[11px] text-muted">Word, OCR &amp; Search</small></span>
                </Link>
                {canFieldLive && (
                  <Link to="/field-live" onClick={() => setOpsSheet(false)} className="col-span-2 rounded-2xl border border-[#a7f3d0] bg-[#ecfdf5]/85 p-3 flex items-center gap-2.5 no-underline text-[#047857]">
                    <span className="size-10 rounded-xl bg-[#121212] text-[#51fec0] grid place-items-center shrink-0"><MapPinned size={18} /></span>
                    <span className="min-w-0"><b className="block text-xs truncate">Leadership Live Field GPS Map</b><small className="text-[11px] text-[#047857]">Real-time Dubai team pins &amp; route trails</small></span>
                  </Link>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { setOpsSheet(false); setPalette(true) }} className="btn outline sm flex-1 justify-center">
                  <Search size={14} /> Quick Search
                </button>
                <button type="button" onClick={() => { setOpsSheet(false); lockScreenNow('manual') }} className="btn outline sm flex-1 justify-center">
                  <Lock size={14} /> Lock Screen
                </button>
              </div>

              <div className="space-y-2.5 pt-2 border-t border-line">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted">All Permitted Company Ops</div>
                {mobileApps.map(app => (
                  <div key={app.key} className="rounded-2xl border border-line bg-soft/75 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Link to={app.landing} onClick={() => setOpsSheet(false)} className="flex items-center gap-2 text-xs font-semibold text-ink no-underline">
                        <app.icon size={15} className="text-[#121212]" /> {app.label}
                      </Link>
                      <span className="text-[10.5px] font-mono text-muted">{app.items.length} steps</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {app.items.map(item => (
                        <Link
                          key={item.to}
                          to={item.to}
                          onClick={() => setOpsSheet(false)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[11.5px] font-medium text-ink no-underline hover:border-[#121212]"
                        >
                          <item.icon size={12} className="text-[#0e9f6e]" />
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Coordinated Desktop Bottom-Right Dock Rail (Softphone + Inside sit side-by-side, ZERO overlap!) */}
      {isStaff && !mustChangePw && (
        <div className="swk-dock-rail no-print">
          <SipSoftphoneDock docked />
          <ChatDock docked />
        </div>
      )}

      {isStaff && <BiometricLockOverlay onLogout={logout} />}
      {!mustChangePw && <LiveNotifications />}
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
      <Modal open={guide} onClose={() => setGuide(false)} title="How to use SWK OS" width={660}>
        <div className="grid gap-4 text-sm text-body">
          <div><b className="font-display text-ink">Step-by-step workflow bar</b> — Inside any app, use the horizontal workflow bar at the top of the screen (or click Next Step) to move cleanly from one stage to the next without hunting through menus.</div>
          <div><b className="font-display text-ink">Quick search</b> — Press <kbd className="border border-line rounded px-1.5">Ctrl</kbd> + <kbd className="border border-line rounded px-1.5">K</kbd> anytime to find properties, leads, deals, leases, cheques, and invoices.</div>
          <div><b className="font-display text-ink">Selling a property</b> — Seller Form A → Viewings → Buyer Offers → Sale Contract (F) → Escrow → Developer NOC → DLD Transfer → Deal Folders.</div>
          <div><b className="font-display text-ink">Leasing a property</b> — Leases &amp; Ejari → Rent Schedules → Rent Cheques → Rent Receipts → Inspections → Handovers → Maintenance.</div>
          <div><b className="font-display text-ink">Off-plan sales</b> — Booking → SPA → Oqood Registration → Payment Plan → Handover.</div>
          <div className="text-muted text-xs">{meta?.settings.company_name} · Dubai, UAE · Gulf Standard Time</div>
        </div>
      </Modal>
    </div>
  )
}
export type { ReactNode }

function titleFromPath(p: string) {
  if (p.startsWith('/e/')) return p.split('/')[2]?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? 'Records'
  const seg = p.split('/').filter(Boolean)[0] ?? 'Dashboard'
  return seg.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
