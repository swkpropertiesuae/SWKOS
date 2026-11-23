import { useEffect,useMemo,useState,type PointerEvent,type ReactNode } from 'react'
import { Link,useNavigate } from 'react-router-dom'
import { motion,useReducedMotion } from 'motion/react'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight,Clock3,Search,X } from 'lucide-react'
import { useMeta } from '../lib/meta'
import { get } from '../lib/api'
import { launcherApps,recentItems,type LauncherApp } from '../swk/nav'

const ease = [0.22, 1, 0.36, 1] as const
// The entrance plays once per page load; replaying it on every return to /home looked like the page breaking.
let entrancePlayed = false

function dubaiHour() { return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', hour12: false }).format(new Date())) }
function greeting() { const h = dubaiHour(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' }
const today = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())

/** Survey-mark crosshair drawn half outside the card edge (21st.dev feature-08). */
function CrossDecor({ at }: { at: 'top-start' | 'bottom-end' }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round"
      className={`pointer-events-none absolute z-10 size-3.5 text-[#5b676e] ${at === 'top-start' ? 'left-0 top-0 -translate-x-1/2 -translate-y-1/2' : 'bottom-0 right-0 translate-x-1/2 translate-y-1/2'}`}>
      <path d="M5 12h14" /><path d="M12 5v14" />
    </svg>
  )
}

/**
 * App card — ported from 21st.dev "Feature Grid Spotlight Cards" (@mohammadshehadeh/feature-08):
 * hairline rails that run past the card, corner crosshairs, and a pointer-follow spotlight, here in
 * the website's mint over a white surface. The icon is the SWK brand tile from /brand/apps.
 */
function AppCard({ app, badge }: { app: LauncherApp; badge?: ReactNode }) {
  const onMove = (e: PointerEvent<HTMLAnchorElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
  }
  return (
    <Link to={app.landing} onPointerMove={onMove} title={app.blurb}
      className="group relative flex h-full items-center gap-3.5 bg-white/85 px-4 py-4 no-underline backdrop-blur-sm transition-colors duration-300 hover:bg-white focus-visible:bg-white">
      <span aria-hidden className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_160px_at_var(--mx)_var(--my),rgba(212,167,82,0.16),transparent_70%)]" />
      <span aria-hidden className="absolute -inset-y-3 -left-px w-px bg-[#e6e0d4]" />
      <span aria-hidden className="absolute -inset-y-3 -right-px w-px bg-[#e6e0d4]" />
      <span aria-hidden className="absolute -inset-x-3 -top-px h-px bg-[#e6e0d4]" />
      <span aria-hidden className="absolute -inset-x-3 -bottom-px h-px bg-[#e6e0d4]" />
      <CrossDecor at="top-start" /><CrossDecor at="bottom-end" />
      <img src={`/brand/apps/${app.key}.svg`} alt="" width={46} height={46} className="relative z-10 size-[46px] shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-0.5 group-hover:scale-[1.05]"
        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
      <span className="relative z-10 flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-medium tracking-[-0.02em] text-[#0f2a33] transition-colors group-hover:text-[#8a621c]">{app.label}</span>
          {badge}
        </span>
        <span className="line-clamp-1 text-[12.5px] text-[#5b676e]">{app.blurb}</span>
      </span>
      <ArrowUpRight size={15} aria-hidden className="relative z-10 shrink-0 text-[#a3a9a6] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#8a621c]" />
    </Link>
  )
}

export function Launcher() {
  const { me, can } = useMeta()
  const nav = useNavigate()
  const reduce = useReducedMotion()
  const [animate] = useState(() => !entrancePlayed)
  useEffect(() => { entrancePlayed = true }, [])
  const [query, setQuery] = useState('')
  const apps = useMemo(() => launcherApps(can, me), [can, me])
  const recents = useMemo(() => recentItems(can, 4, me), [can, me])
  const unread = useQuery({ queryKey: ['chat-unread'], queryFn: () => get<{ unread: number }>('/api/chat/unread'), refetchInterval: 30000 }).data?.unread ?? 0
  const needle = query.trim().toLocaleLowerCase()
  const shownApps = apps.filter(a => !needle || a.label.toLocaleLowerCase().includes(needle) || a.blurb.toLocaleLowerCase().includes(needle))
  const features = needle ? apps.flatMap(a => a.items.map(i => ({ ...i, app: a.label }))).filter(i => i.label.toLocaleLowerCase().includes(needle) || (i.desc ?? '').toLocaleLowerCase().includes(needle)) : []
  const firstName = (me?.name || '').split(' ')[0]
  const openFirst = () => { const target = features[0]?.to ?? shownApps[0]?.landing; if (target) nav(target) }
  const container = { hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.035, delayChildren: 0.04 } } }
  const rise = { hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease } } }

  return (
    <div className="mx-auto max-w-[1260px] pb-10">
      <motion.header className="relative mb-8 pt-2" initial={animate ? { opacity: 0, y: 8 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease }}>
        <div className="web-eyebrow">SWK Properties LLC · RERA ORN 51517 · {today()}</div>
        <h1 className="web-title" style={{ fontSize: 'clamp(30px, 3.6vw, 46px)' }}>{greeting()}{firstName ? `, ${firstName}` : ''}.</h1>
        <p className="web-lead">Your SWK workspace. Open an app, or search any page.</p>
        <form className="relative mt-6 max-w-2xl" role="search" onSubmit={e => { e.preventDefault(); openFirst() }}>
          <Search size={17} aria-hidden className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[#5b676e]" />
          <input type="text" inputMode="search" enterKeyHint="search" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setQuery('') }}
            placeholder="Search apps or pages…" aria-label="Search apps and features" autoFocus autoComplete="off"
            className="h-12 w-full rounded-full border border-white/70 bg-white/90 pl-12 pr-12 text-[15px] text-[#0f2a33] shadow-[0_12px_36px_rgba(15,42,51,0.08)] outline-none no-focus-outline backdrop-blur-xl placeholder:text-[#5b676e] focus:border-[#0f2a33] focus:ring-4 focus:ring-[#d4a752]/35" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-4 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-[#f4f0e8] text-[#3d4a51] hover:bg-[#0f2a33] hover:text-white"><X size={15} /></button>}
        </form>
        {!needle && recents.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-2" aria-label="Recently opened">
            <span className="mr-1 inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-[#5b676e]"><Clock3 size={13} />Recent</span>
            {recents.map(r => <Link key={r.to} to={r.to} className="web-pill no-underline hover:bg-[#0f2a33] hover:text-white" style={{ height: 32 }}><r.icon size={13} />{r.label}</Link>)}
          </div>
        )}
      </motion.header>

      {features.length > 0 && (
        <section aria-label="Matching pages" className="web-card mb-10 overflow-hidden">
          <div className="web-eyebrow px-6 pt-5">Pages</div>
          <ul className="m-0 list-none p-2">
            {features.map(f => (
              <li key={f.to}><Link to={f.to} className="group flex items-center gap-4 rounded-xl px-4 py-3 no-underline hover:bg-[#f8f5ef]">
                <span className="flex size-10 items-center justify-center rounded-full bg-[#0f2a33] text-[#d4a752]"><f.icon size={17} /></span>
                <span className="min-w-0 flex-1"><b className="block font-medium text-[#0f2a33]">{f.label}</b><small className="text-[#5b676e]">{f.desc ?? f.app}</small></span>
                <span className="web-pill">{f.app}</span><ArrowUpRight size={16} className="text-[#5b676e] group-hover:text-[#8a621c]" />
              </Link></li>
            ))}
          </ul>
        </section>
      )}

      {shownApps.length > 0 && (
        <motion.section aria-label="Apps" className="grid grid-cols-1 gap-5 px-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" variants={container} initial={animate || needle ? 'hidden' : false} animate="show" key={needle ? 'f' : 'all'}>
          {shownApps.map(a => (
            <motion.div key={a.key} variants={rise} className="h-full">
              <AppCard app={a} badge={a.key === 'messages' && unread > 0 ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#a3263a] px-1.5 text-[10.5px] font-semibold text-white" aria-label={`${unread} unread messages`}>{unread > 99 ? '99+' : unread}</span> : undefined} />
            </motion.div>
          ))}
        </motion.section>
      )}

      {needle && !shownApps.length && !features.length && (
        <div className="web-card p-10 text-center"><b className="text-[#0f2a33]">No app or page matches “{query.trim()}”</b><p className="text-[#5b676e]">Try a simpler word, or press Ctrl + K to search properties, leads, and deals.</p><button className="web-btn light mt-2" onClick={() => setQuery('')}>Clear search</button></div>
      )}
    </div>
  )
}
