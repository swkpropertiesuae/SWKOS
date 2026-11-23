import { useEffect,useMemo,useState,type ReactNode } from 'react'
import { Link,NavLink,Outlet,useLocation,useNavigate } from 'react-router-dom'
import { useQuery,useQueryClient } from '@tanstack/react-query'
import { AnimatePresence,motion } from 'motion/react'
import { Bell,Search,Plus,Check,ChevronDown,ChevronRight,LogOut,UserRound,LifeBuoy,LayoutGrid,Languages,ArrowLeft,PanelLeftClose,PanelLeftOpen,QrCode,Sparkles,Camera,Menu,MessagesSquare,Wrench,PhoneCall,MapPinned,Navigation,Lock,X } from 'lucide-react'
import { useMeta } from '../lib/meta'
import { get,post } from '../lib/api'
import { cls,fmtIsoStamp } from '../lib/format'
import { Modal,useClickOutside } from '../ui/kit'
import { useToast } from '../lib/toast'
import { CommandPalette } from './CommandPalette'
import { LiveNotifications } from './LiveNotifications'
import { ChatNotifier } from './ChatNotifier'
import { SipSoftphoneDock } from './SipSoftphoneDock'
import { BiometricLockOverlay } from './BiometricLockOverlay'
import { StaffPhoto } from './ui/staff-photo'
import { clearMobileSession,lockScreenNow,registerNativePush,stopNativeFieldDuty,unregisterNativePush } from '../lib/mobileBridge'
import { sipClient,useSipClient } from '../lib/sipClient'
import { APP_META,QUICK_CREATE,findNav,isNavItemVisible,launcherApps,rememberVisit } from '../swk/nav'
import { canAccessSwkAdminLogic,canAccessFieldLiveMap,canPrintReceptionQr,isRestrictedStaffUser,isAllowedPathForRestrictedStaff } from '@shared/swk-staff-access'

/** Live Dubai time (Gulf Standard Time). */
function DubaiClock() {
  const [t, setT] = useState(new Date())
  useEffect(() => { const i = setInterval(() => setT(new Date()), 20000); return () => clearInterval(i) }, [])
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hour12: true }).format(t).toUpperCase()
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', weekday: 'short', day: '2-digit', month: 'short' }).format(t)
  return <span className="swk-chip swk-hide-md" title="Gulf Standard Time (GST, UTC+4)"><span className="dot" />Dubai <b>{time}</b><span className="text-muted">· {day}</span></span>
}

function NotificationBell() {
  const nav = useNavigate(), qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false))
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => get<{ unread: number; rows: any[] }>('/api/notifications'), refetchInterval: 60000 })
  const unread = q.data?.unread ?? 0
  const read = async (ids?: number[]) => { await post('/api/notifications/read', ids ? { ids } : { all: true }); void qc.invalidateQueries({ queryKey: ['notifications'] }) }
  return (
    <div className="relative" ref={ref}>
      <button className="swk-tbtn" onClick={() => setOpen(o => !o)} aria-label={`Notifications, ${unread} unread`}><Bell size={17} />{unread > 0 && <span className="count">{unread > 99 ? '99+' : unread}</span>}</button>
      <AnimatePresence>{open && (
        <motion.div className="swk-menu" style={{ width: 380, padding: 0, overflow: 'hidden' }} initial={{ opacity: 0, y: -6, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: .98 }} transition={{ duration: .16 }}>
          <div className="flex items-center px-4 py-3 border-b border-line"><b className="font-display text-[15px] text-ink">Notifications</b><div className="flex-1" />{unread > 0 && <button className="swk-btn swk-btn-ghost" style={{ height: 30, padding: '0 10px', fontSize: 12 }} onClick={() => void read()}><Check size={14} /> Mark all read</button>}</div>
          <div className="max-h-[60vh] overflow-auto">
            {!q.data?.rows.length ? <div className="p-8 text-center text-muted text-sm">You're all caught up.</div> : q.data.rows.map(n => (
              <button key={n.id} className={cls('w-full text-start px-4 py-3 border-0 border-b border-line bg-transparent cursor-pointer hover:bg-[#f7f7f7]', !n.read_at && 'bg-[#f2fdf8]')} onClick={() => { void read([n.id]); setOpen(false); if (n.link) nav(n.link) }}>
                <div className="flex gap-2 items-start">{!n.read_at && <span className="w-2 h-2 rounded-full bg-[#0e9f6e] mt-1.5 flex-none" />}<div className="min-w-0"><div className="text-[13.5px] font-semibold text-ink">{n.title}</div>{n.body && <div className="text-xs text-muted line-clamp-2">{n.body}</div>}<div className="text-[11px] text-muted mt-0.5">{fmtIsoStamp(n.created_at)}</div></div></div>
              </button>))}
          </div>
        </motion.div>)}</AnimatePresence>
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
      <button className="swk-create" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}><Plus size={16} /><span className="swk-hide-sm">Quick Add</span><ChevronDown size={14} className="opacity-70 swk-hide-sm" /></button>
      <AnimatePresence>{open && (
        <motion.div role="menu" className="swk-menu" initial={{ opacity: 0, y: -6, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: .98 }} transition={{ duration: .16 }}>
          {items.map((i, idx) => (
            <motion.div key={i.to} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * .025 }}>
              <Link role="menuitem" to={i.to} onClick={() => setOpen(false)}><span className="ic"><i.icon size={16} /></span><span><b className="font-semibold">{i.label}</b><small>{i.desc}</small></span></Link>
            </motion.div>))}
        </motion.div>)}</AnimatePresence>
    </div>
  )
}

/** Estate-OS style sidebar for the app that is open: back link, app name, then its pages. Hidden on the All apps screen. */
function AppSidebar({ pathname, collapsed, onToggle }: { pathname: string; collapsed: boolean; onToggle: () => void }) {
  const { me, can } = useMeta()
  const here = findNav(pathname)
  const items = useMemo(
    () => (here?.section.items ?? []).filter(i => isNavItemVisible(i, can, me)),
    [here, can, me],
  )
  if (!here || items.length < 1 || here.section.items.length < 2) return null
  const meta = APP_META[here.section.key]
  return (
    <aside className={cls('swk-app-sidebar no-print', collapsed && 'is-collapsed')}>
      <nav className="swk-sidebar-nav" aria-label={`${here.section.label} pages`}>
        <Link to="/home" className="swk-sidebar-logo" aria-label="SWK Properties OS, all apps"><img src="/brand/web/swk-logo-light.webp" alt="SWK Properties OS" /></Link>
        <div className="swk-sidebar-head">
          <Link to="/home" className="swk-sidebar-back" title="All apps"><ArrowLeft size={14} /><span className="swk-sidebar-link-tx">All apps</span></Link>
          <button type="button" onClick={onToggle} className="swk-sidebar-collapse-btn swk-hide-md" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}</button>
        </div>
        <div className="swk-sidebar-group">
          <div className="swk-sidebar-group-label">{meta && <meta.icon size={12} />}<span className="swk-sidebar-link-tx">{here.section.label}</span></div>
          {items.map(i => {
            const isActive = here.item.to === i.to
            return (
              <NavLink key={i.to} to={i.to} title={i.desc ? `${i.label} — ${i.desc}` : i.label} className={cls('swk-sidebar-link', isActive && 'active')} aria-current={isActive ? 'page' : undefined}>
                <i.icon size={16} strokeWidth={1.8} /><span className="swk-sidebar-link-tx">{i.label}</span>
              </NavLink>
            )
          })}
        </div>
      </nav>
    </aside>
  )
}

export function Shell() {
  const { me, setMe, meta, can } = useMeta()
  const nav = useNavigate()
  const loc = useLocation()
  const sipSnap = useSipClient()
  const isStaff = Boolean(me?.id && !me?.party_id)
  const canFieldLive = canAccessFieldLiveMap(me)
  const canAi = isStaff && can('ai', 'view')

  const [palette, setPalette] = useState(false)
  const [guide, setGuide] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [opsSheet, setOpsSheet] = useState(false)
  useEffect(() => { setDrawer(false); setOpsSheet(false) }, [loc.pathname])
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('swk.sidebar.collapsed') === '1')
  const toggleSidebar = () => setCollapsed(c => {
    const next = !c
    try { localStorage.setItem('swk.sidebar.collapsed', next ? '1' : '0') } catch { /* ignore */ }
    return next
  })
  const userRef = useClickOutside<HTMLDivElement>(() => setUserMenu(false))

  const chatUnread =
    useQuery({
      queryKey: ['chat-unread'],
      enabled: isStaff,
      queryFn: () => get<{ unread: number }>('/api/chat/unread'),
      refetchInterval: 60000,
    }).data?.unread ?? 0

  const mobileApps = useMemo(() => (isStaff ? launcherApps(can, me) : []), [isStaff, can, me])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true) }
      if (e.key === 'Escape') setOpsSheet(false)
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [])
  useEffect(() => { rememberVisit(loc.pathname) }, [loc.pathname])

  useEffect(() => {
    if (!isStaff) return
    let disposePush: (() => void) | undefined
    void registerNativePush().then(fn => { disposePush = fn })
    const onNavigate = (ev: Event) => {
      const target = String((ev as CustomEvent<{ url?: string }>)?.detail?.url || '').trim()
      if (target.startsWith('/') && !target.startsWith('//')) {
        nav(target)
      }
    }
    const onSipWake = () => {
      void sipClient.init(true)
    }
    window.addEventListener('swk:navigate', onNavigate)
    window.addEventListener('swk:sip-wake', onSipWake)
    return () => {
      window.removeEventListener('swk:navigate', onNavigate)
      window.removeEventListener('swk:sip-wake', onSipWake)
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
  const pageTitle = isHome ? 'All apps' : here?.item.label ?? titleFromPath(loc.pathname)
  if (isPrint) return <main id="main"><Outlet context={{ openGuide: () => setGuide(true), openSearch: () => setPalette(true), logout }} /></main>
  const initials = (me?.name || me?.email || 'S').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(s => s[0]!.toUpperCase()).join('')
  const isUtilitiesPath = loc.pathname.startsWith('/utilities') || loc.pathname === '/toolkit' || loc.pathname === '/document-tools'
  const isFieldOrVoicePath = loc.pathname === '/reception-qr' || loc.pathname.startsWith('/field-duty') || loc.pathname === '/field-live' || loc.pathname.startsWith('/phone')

  return (
    <div className="swk-app">
      <div className="swk-main-col">
        <header className="swk-top no-print">
          {!isHome && !!here && <button type="button" className="swk-menu-btn" onClick={() => setDrawer(d => !d)} aria-label="Open menu" aria-expanded={drawer}><Menu size={18} /></button>}
          <Link to="/home" className="swk-top-brand" aria-label="SWK Properties OS, all apps"><img className="icon" src="/brand/web/swk-icon-192.webp" alt="" /><img className="word swk-hide-sm" src="/brand/web/swk-logo-light.webp" alt="SWK Properties" /></Link>
          <div className="swk-top-title">
            <div className="crumb"><Link to="/home">SWK OS</Link>{here && <><ChevronRight size={11} /><span>{here.section.label}</span></>}<ChevronRight size={11} /><b>{pageTitle}</b></div>
          </div>
          <div className="flex-1" />
          <DubaiClock />
          <button className="swk-search-pill" onClick={() => setPalette(true)} aria-label="Search (Ctrl K)"><Search size={15} /><span className="swk-hide-sm">Search leads, properties…</span><kbd>Ctrl K</kbd></button>
          <ChatNotifier />
          <NotificationBell />
          <QuickCreate />
          <div className="relative" ref={userRef}>
            <button className="swk-avatar border-0 cursor-pointer" onClick={() => setUserMenu(o => !o)} aria-label="Account menu" aria-expanded={userMenu} style={{ width: 38, height: 38, overflow: 'hidden', padding: 0 }}><StaffPhoto email={me?.email} className="size-full object-cover object-top" fallback={initials} /></button>
            <AnimatePresence>{userMenu && (
              <motion.div className="swk-menu" style={{ minWidth: 250 }} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: .16 }}>
                <div className="px-3 py-2"><div className="font-semibold text-ink text-[14px] truncate">{me?.name}</div><div className="text-xs text-muted truncate">{me?.email}</div></div>
                <div className="sep" />
                {canPrintReceptionQr(me) ? (
                  <Link to="/reception-display" onClick={() => setUserMenu(false)}><span className="ic"><QrCode size={16} /></span>Reception check-in code screen</Link>
                ) : isStaff ? (
                  <Link to="/reception-qr" onClick={() => setUserMenu(false)}><span className="ic"><Camera size={16} /></span>Scan &amp; Check-In Attendance</Link>
                ) : null}
                {isStaff && (
                  <button className="item" onClick={() => { setUserMenu(false); lockScreenNow('manual') }}><span className="ic"><Lock size={16} /></span>Lock screen</button>
                )}
                <Link to="/profile" onClick={() => setUserMenu(false)}><span className="ic"><UserRound size={16} /></span>My profile & password</Link>
                <Link to="/workspace-tools" onClick={() => setUserMenu(false)}><span className="ic"><Languages size={16} /></span>Language & preferences</Link>
                <Link to="/home" onClick={() => setUserMenu(false)}><span className="ic"><LayoutGrid size={16} /></span>All apps</Link>
                <button className="item" onClick={() => { setUserMenu(false); setGuide(true) }}><span className="ic"><LifeBuoy size={16} /></span>Help guide</button>
                <div className="sep" />
                <button className="item" onClick={() => void logout()}><span className="ic"><LogOut size={16} /></span>Sign out</button>
              </motion.div>)}</AnimatePresence>
          </div>
        </header>
        {me?.demo && <div className="demo-notice no-print"><span><strong>Demo workspace</strong> · sample data · external messages switched off</span><details><summary>Details</summary><p>Safe practice environment. Resets every night. External email and WhatsApp messages are disabled.</p><button className="btn outline sm" onClick={async () => { if (confirm('Restore the demo to its original state and sign out?')) { await post('/api/demo/reset'); window.location.href = '/login' } }}>Reset demo</button></details></div>}
        {me?.defaultPassword && !me?.demo && <div className="no-print bg-[#f7f7f7] text-[#4a1f4d] px-5 py-2 text-sm font-semibold flex items-center gap-3 flex-wrap">You are signed in with the default password. <Link to="/profile" className="underline">Change it now</Link></div>}
        <div className={cls('swk-body', drawer && 'sb-open', !isHome && (here?.section.items.length ?? 0) > 1 && 'has-sidebar', !isHome && (here?.section.items.length ?? 0) > 1 && collapsed && 'is-collapsed')}>
          {drawer && <div className="swk-sb-scrim" onClick={() => setDrawer(false)} />}
          {!isHome && <AppSidebar pathname={loc.pathname} collapsed={collapsed} onToggle={toggleSidebar} />}
          <main className="swk-main" id="main">
            {/* Fade the new page in only: an exit phase (mode="wait") kept the old page on screen in the new layout, then a blank frame. */}
            <motion.div key={loc.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .18, ease: [0.16, 1, 0.3, 1] }}>
              <Outlet context={{ openGuide: () => setGuide(true), openSearch: () => setPalette(true), logout }} />
            </motion.div>
          </main>
        </div>

        {/* Responsive 5-Tab Mobile Bottom Navigation Bar (visible <= 768px) */}
        {isStaff ? (
          <nav className="swk-mobile-bottom-nav no-print" aria-label="Mobile quick navigation">
            <NavLink to="/home" className={({ isActive }) => cls('swk-mnav-item relative', (isActive || loc.pathname === '/dashboard') && 'active')}>
              <LayoutGrid size={18} />
              <span>Home</span>
            </NavLink>
            <NavLink to="/chat" className={({ isActive }) => cls('swk-mnav-item relative', isActive && 'active')} aria-label={`Inside messenger${chatUnread > 0 ? `, ${chatUnread} unread` : ''}`}>
              <MessagesSquare size={18} />
              {chatUnread > 0 && (
                <span className="absolute top-0.5 right-2.5 min-w-[17px] h-[17px] px-1 rounded-full bg-[#0e9f6e] text-white text-[9.5px] font-bold grid place-items-center leading-none border border-[#121212]">
                  {chatUnread > 99 ? '99+' : chatUnread}
                </span>
              )}
              <span>Inside</span>
            </NavLink>
            <NavLink to={canAi ? '/ai' : '/utilities/search'} className={({ isActive }) => cls('swk-mnav-item relative', isActive && 'active')}>
              <Sparkles size={18} />
              <span>AI Brain</span>
            </NavLink>
            <NavLink to="/utilities" className={() => cls('swk-mnav-item relative', isUtilitiesPath && 'active')}>
              <Wrench size={18} />
              <span>Utilities</span>
            </NavLink>
            <button
              type="button"
              onClick={() => setOpsSheet(o => !o)}
              aria-expanded={opsSheet}
              aria-label="Field, Calling and All Company Ops"
              className={cls('swk-mnav-item relative border-0 bg-transparent cursor-pointer', (opsSheet || isFieldOrVoicePath) && 'active')}
            >
              <QrCode size={18} />
              {(sipSnap.activeCall || sipSnap.registration === 'registered') && (
                <span className={cls('absolute top-1.5 right-3 size-2 rounded-full', sipSnap.activeCall ? 'bg-[#0e9f6e] animate-pulse' : 'bg-[#51fec0]')} />
              )}
              <span>Field &amp; Call</span>
            </button>
          </nav>
        ) : (
          <nav className="swk-mobile-bottom-nav no-print" aria-label="Portal quick navigation">
            <NavLink to="/portal" className={({ isActive }) => cls('swk-mnav-item col-span-3', isActive && 'active')}>
              <LayoutGrid size={18} />
              <span>Service Portal</span>
            </NavLink>
            <button type="button" onClick={() => setPalette(true)} className="swk-mnav-item col-span-2 border-0 bg-transparent cursor-pointer">
              <Search size={18} />
              <span>Search</span>
            </button>
          </nav>
        )}
      </div>

      {/* Mobile Field / QR / SIP + Full Role-Scoped Company Ops Drawer */}
      <AnimatePresence>
        {isStaff && opsSheet && (
          <motion.div
            className="fixed inset-0 z-[75] md:hidden no-print flex flex-col justify-end bg-black/55 backdrop-blur-xs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={e => { if (e.target === e.currentTarget) setOpsSheet(false) }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Field, Calling and Company Operations"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="max-h-[82dvh] overflow-y-auto rounded-t-3xl border-t border-black/10 bg-white px-4 pt-4 pb-[calc(82px+env(safe-area-inset-bottom,0px))] shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0e9f6e]">SWK Field · Voice · All Ops</div>
                  <h2 className="m-0 text-base font-bold text-[#121212]">Quick Actions &amp; Company Apps</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setOpsSheet(false)}
                  aria-label="Close drawer"
                  className="size-8 rounded-full border border-line bg-soft text-ink grid place-items-center cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <Link to="/reception-qr" onClick={() => setOpsSheet(false)} className="rounded-2xl border border-line bg-soft p-3 flex items-center gap-2.5 no-underline text-ink">
                  <span className="size-9 rounded-xl bg-[#121212] text-[#51fec0] grid place-items-center shrink-0"><QrCode size={17} /></span>
                  <span className="min-w-0"><b className="block text-xs truncate">Office QR Scan</b><small className="text-[11px] text-muted">Attendance check-in</small></span>
                </Link>
                <Link to="/field-duty" onClick={() => setOpsSheet(false)} className="rounded-2xl border border-line bg-soft p-3 flex items-center gap-2.5 no-underline text-ink">
                  <span className="size-9 rounded-xl bg-[#121212] text-[#51fec0] grid place-items-center shrink-0"><Navigation size={17} /></span>
                  <span className="min-w-0"><b className="block text-xs truncate">Field Duty GPS</b><small className="text-[11px] text-muted">Viewing tracking &amp; SOS</small></span>
                </Link>
                <Link to="/phone" onClick={() => setOpsSheet(false)} className="rounded-2xl border border-line bg-soft p-3 flex items-center gap-2.5 no-underline text-ink">
                  <span className="size-9 rounded-xl bg-[#121212] text-[#51fec0] grid place-items-center shrink-0"><PhoneCall size={17} /></span>
                  <span className="min-w-0"><b className="block text-xs truncate">SIP Softphone</b><small className="text-[11px] text-muted">{sipSnap.configured ? `Ext ${sipSnap.extensionNo}` : 'Dialer & Vault call'}</small></span>
                </Link>
                <Link to="/utilities/search" onClick={() => setOpsSheet(false)} className="rounded-2xl border border-line bg-soft p-3 flex items-center gap-2.5 no-underline text-ink">
                  <span className="size-9 rounded-xl bg-[#121212] text-[#51fec0] grid place-items-center shrink-0"><Search size={17} /></span>
                  <span className="min-w-0"><b className="block text-xs truncate">Unified Search</b><small className="text-[11px] text-muted">Internal, Portal &amp; Web</small></span>
                </Link>
                {canFieldLive && (
                  <Link to="/field-live" onClick={() => setOpsSheet(false)} className="col-span-2 rounded-2xl border border-[#0e9f6e]/35 bg-[#e8fff6] p-3 flex items-center gap-2.5 no-underline text-[#121212]">
                    <span className="size-9 rounded-xl bg-[#0e9f6e] text-white grid place-items-center shrink-0"><MapPinned size={17} /></span>
                    <span className="min-w-0"><b className="block text-xs truncate">Leadership Live Field GPS Map</b><small className="text-[11px] text-[#0b7f58]">Real-time Dubai team pins &amp; route trails</small></span>
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
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted">All Permitted Company Ops</div>
                {mobileApps.map(app => (
                  <div key={app.key} className="rounded-2xl border border-line bg-[#fafafa] p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Link to={app.landing} onClick={() => setOpsSheet(false)} className="flex items-center gap-2 text-xs font-bold text-ink no-underline">
                        <app.icon size={15} className="text-[#0e9f6e]" /> {app.label}
                      </Link>
                      <span className="text-[10.5px] text-muted">{app.items.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {app.items.map(item => (
                        <Link
                          key={item.to}
                          to={item.to}
                          onClick={() => setOpsSheet(false)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[11.5px] font-medium text-ink no-underline hover:border-[#0e9f6e]"
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

      {isStaff && <SipSoftphoneDock />}
      {isStaff && <BiometricLockOverlay onLogout={logout} />}
      <LiveNotifications />
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
      <Modal open={guide} onClose={() => setGuide(false)} title="How to use SWK OS" width={660}>
        <div className="grid gap-4 text-sm">
          <div><b className="font-display text-ink">App icons & workflow</b> — Click <b>All apps</b> in the top bar to switch between departments. Inside any app, use the compact charcoal app-icon sidebar to move step-by-step through the workflow.</div>
          <div><b className="font-display text-ink">Quick search</b> — Press <kbd className="border border-line rounded px-1.5">Ctrl</kbd> + <kbd className="border border-line rounded px-1.5">K</kbd> anytime to find properties, leads, deals, leases, cheques, and invoices.</div>
          <div><b className="font-display text-ink">Selling a property</b> — Seller Form A → Viewings → Buyer Offers → Sale Contract (F) → Escrow → Developer NOC → DLD Transfer → Deal Folders.</div>
          <div><b className="font-display text-ink">Leasing a property</b> — Leases & Ejari → Rent Schedules → Rent Cheques → Rent Receipts → Inspections → Handovers → Maintenance.</div>
          <div><b className="font-display text-ink">Off-plan sales</b> — Booking → SPA → Oqood Registration → Payment Plan → Handover.</div>
          <div className="text-muted">{meta?.settings.company_name} · Dubai, UAE · Gulf Standard Time</div>
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
