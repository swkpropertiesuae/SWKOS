/**
 * Off-Plan Launches — Dubai off-plan project inventory & payment plan intelligence.
 * Driven 100% by live off-plan properties (/api/e/properties where is_off_plan=true or status='Off-Plan'),
 * units (/api/e/units) and registered developers (/api/e/developers).
 */
import { useEffect,useMemo,useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AnimatePresence,motion,useMotionValue,useReducedMotion,useSpring,useTransform } from 'motion/react'
import { ArrowUpRight,Box,Building,CalendarClock,ChevronLeft,ChevronRight,Copy,ExternalLink,FileText,Film,HandCoins,Image as ImageIcon,Landmark,Lock,MessageCircle,Plus,Rocket,Share2,ShieldCheck,Trophy } from 'lucide-react'
import { coverPhotoUrl,normalizeMediaList,type ProjectMediaItem } from '@shared/media'
import { get,openAuthFile } from '../../lib/api'
import { useMeta } from '../../lib/meta'
import { AuthImg,MediaTour3DEmbed,MediaVideoPlayer } from '../../components/AuthMedia'
import { Property3DViewer } from '../../components/brochure/Property3DViewer'
import { DeveloperProjectLaunchModal } from '../../components/DeveloperProjectLaunchModal'
import { ShareWithClient } from '../../components/ShareWithClient'
import { Bar,Card,EmptyState,Field,ModuleHeader,Pill,ProgressRing,Reveal,StatTile,SWK,aed,num } from '../../swk/ui'
import { COMMUNITIES,DEVELOPERS,UAE,communityByName,paymentPlan } from '../../swk/uae'
import { copyText,Drawer,SelectField,useToasts } from './kit3/parts'

type Plan = { booking: number; construction: number; handover: number; post: number }
type Project = {
  id: string; project: string; developer: string; community: string; image: string; from: number; types: string[]; handoverQ: string; handover: Date
  plan: Plan; completion: number; escrow: string; reraNo: string; oqood: boolean; avail: number; total: number; commission: number; minPaidResale: number
  blurb: string; featured?: boolean; swkId: number
  beds: number | null; areaSqft: number | null; ptype: string
  media: ProjectMediaItem[]; videoUrl?: string | null; tourUrl?: string | null; model3dUrl?: string | null; floorPlanUrl?: string | null; brochureUrl?: string | null
}

const PHASE_COLORS = { booking: SWK.navy, construction: SWK.champ, handover: SWK.oasis, post: SWK.sky }
const q2date = (q: string) => { const [qq, y] = q.split(' '); const m = (Number(qq.slice(1)) - 1) * 3 + 2; return new Date(Number(y), m, 28) }
const img = (p: string) => (p.startsWith('/') ? p : `/media/properties/${p}.webp`)
const P = (b: number, c: number, h: number, po = 0): Plan => ({ booking: b, construction: c, handover: h, post: po })

const devLogo = (name: string) => DEVELOPERS.find(d => d.name.toLowerCase() === name.toLowerCase() || name.toLowerCase().includes(d.name.split(' ')[0].toLowerCase()))?.logo
const communityImg = (name: string) => communityByName(name)?.image

function planFromString(s?: string): Plan {
  switch (s) {
    case '50/50': return P(10, 40, 50)
    case '60/40': return P(10, 50, 40)
    case '70/30': return P(10, 60, 30)
    case '80/20': return P(10, 70, 20)
    case 'Post-handover 2y': return P(10, 50, 0, 40)
    case 'Post-handover 3y': return P(10, 40, 0, 50)
    case '100% on completion': return P(10, 0, 90)
    default: return P(10, 60, 30)
  }
}
/** 'Custom' or empty plans: read the split the launch import writes into the description ("Payment plan: Plan 40/60 (10/30/60)"). */
function planFromRecord(r: { payment_plan?: string; description?: string }): Plan {
  if (r.payment_plan && r.payment_plan !== 'Custom') return planFromString(r.payment_plan)
  const m = String(r.description ?? '').match(/Payment plan: Plan ([\d/]+)( post-handover)?(?: \(([\d/]+)\))?/)
  if (!m) return planFromString(r.payment_plan)
  const n = (m[3] ?? m[1]).split('/').map(Number)
  if (n.length === 4) return P(n[0], n[1], n[2], n[3])
  if (n.length === 3) return P(n[0], n[1], n[2])
  if (n.length === 2 && n[0] >= 10) return m[2] ? P(10, n[0] - 10, 0, n[1]) : P(10, n[0] - 10, n[1])
  return planFromString(r.payment_plan)
}
const isPost = (p: Project) => p.plan.post > 0
const planLabel = (p: Plan) => p.post ? `${p.booking + p.construction}/${p.handover ? `${p.handover}/` : ''}${p.post} post-handover` : `${p.booking + p.construction}/${p.handover}`

function countdown(to: Date, now: Date) {
  const d = Math.max(0, Math.round((to.getTime() - now.getTime()) / 864e5))
  const y = Math.floor(d / 365), m = Math.floor((d % 365) / 30.4)
  return { days: d, text: d === 0 ? 'Handover due' : `${y ? `${y}y ` : ''}${m}m to handover` }
}

export default function OffPlanPage() {
  const { can } = useMeta()
  const props = useQuery({ queryKey: ['swk-op', 'properties'], queryFn: () => get<{ rows: any[] }>('/api/e/properties', { pageSize: 500 }) })
  const unitsQ = useQuery({ queryKey: ['swk-op', 'units'], queryFn: () => get<{ rows: any[] }>('/api/e/units', { pageSize: 500 }) })
  const devsQ = useQuery({ queryKey: ['swk-op', 'developers'], queryFn: () => get<{ rows: any[] }>('/api/e/developers', { pageSize: 200 }) })
  const toasts = useToasts()
  const now = useMemo(() => new Date(), [])
  const [launchOpen, setLaunchOpen] = useState(false)
  const [shareProject, setShareProject] = useState<Project | null>(null)

  const all: Project[] = useMemo(() => {
    const unitRows = unitsQ.data?.rows ?? []
    const devRows = devsQ.data?.rows ?? []
    const devById = new Map<number, string>(devRows.map((d: any) => [Number(d.id), d.name]))

    return (props.data?.rows ?? []).filter(r => r.is_off_plan || r.status === 'Off-Plan').map(r => {
      const c = communityByName(r._labels?.community_ref) ?? communityByName(r.community_id) ?? communityByName(r.title) ?? communityByName(r.address)
      const curYear = now.getFullYear()
      const year = Number(r.completion_year) || curYear + 2
      const hd = r.available_date ? new Date(r.available_date) : null
      const hq = hd && !isNaN(hd.getTime()) && hd.getFullYear() >= curYear ? `Q${Math.floor(hd.getMonth() / 3) + 1} ${hd.getFullYear()}` : `Q4 ${year < curYear ? curYear + 1 : year}`
      const pUnits = unitRows.filter((u: any) => u.property_id === r.id)
      const availUnits = pUnits.filter((u: any) => u.status === 'Available').length
      const totalUnits = pUnits.length || 1
      const avail = pUnits.length ? availUnits : (r.status === 'Sold' ? 0 : 1)
      const devName = r._labels?.developer_ref || devById.get(Number(r.developer_ref)) || (isNaN(Number(r.developer_id)) && r.developer_id ? r.developer_id : devById.get(Number(r.developer_id))) || 'Developer'
      const yearsLeft = Math.max(0, year - curYear)
      const completion = yearsLeft === 0 ? 90 : yearsLeft === 1 ? 65 : yearsLeft === 2 ? 35 : 15
      const media = normalizeMediaList(r.media)
      const firstMedia = coverPhotoUrl(media)

      return {
        id: `swk-${r.id}`,
        project: r.title || r.building_name || `Project #${r.id}`,
        developer: devName,
        community: c?.name ?? r.community_id ?? r.sub_community ?? 'Dubai',
        image: firstMedia ?? c?.image ?? img('golf-fields-1'),
        from: Number(r.price) || 0,
        types: pUnits.length ? [...new Set(pUnits.map((u: any) => u.unit_no || (u.bedrooms ? `${u.bedrooms} BR` : u.unit_type)))].slice(0, 4) as string[] : [r.bedrooms ? `${r.bedrooms} BR ${r.property_type ?? ''}`.trim() : r.property_type ?? 'Unit'],
        handoverQ: hq,
        handover: q2date(hq),
        plan: planFromRecord(r),
        completion,
        escrow: 'DLD Registered Project Escrow',
        reraNo: r.rera_permit_no || 'Pending permit',
        oqood: Boolean(r.rera_permit_no || r.title_deed_no),
        avail,
        total: totalUnits,
        commission: Number(r.roi_percent) > 0 && Number(r.roi_percent) <= 10 ? Number(r.roi_percent) : 4,
        minPaidResale: 40,
        blurb: r.description || `${r.property_type || 'Residential'} off-plan launch in ${c?.name ?? r.community_id ?? 'Dubai'}.`,
        featured: Boolean(r.is_exclusive),
        swkId: r.id,
        beds: r.bedrooms != null && r.bedrooms !== '' ? Number(r.bedrooms) : null, areaSqft: Number(r.area_sqft) || null, ptype: r.property_type || 'Apartment',
        media,
        videoUrl: r.video_url || media.find(m => m.kind === 'video')?.url || null,
        tourUrl: r.virtual_tour_url || media.find(m => m.kind === 'tour3d')?.url || null,
        model3dUrl: r.model_3d_url || null,
        floorPlanUrl: r.floor_plan_url || media.find(m => m.kind === 'floorplan')?.url || null,
        brochureUrl: r.brochure_url || media.find(m => m.kind === 'brochure')?.url || null,
      }
    })
  }, [props.data, unitsQ.data, devsQ.data, now])

  const featured = useMemo(() => {
    const excl = all.filter(p => p.featured)
    if (excl.length) return excl
    const withPhotos = all.filter(p => p.media.some(m => m.kind === 'photo' && m.url.startsWith('/media/launches/')))
    return (withPhotos.length ? withPhotos : all).slice(0, 6)
  }, [all])

  const [dev, setDev] = useState('all'); const [comm, setComm] = useState('all'); const [year, setYear] = useState('all')
  const maxBudget = Math.max(5_000_000, Math.ceil(Math.max(0, ...all.map(p => p.from)) / 500_000) * 500_000)
  const [budget, setBudget] = useState(maxBudget); const [postOnly, setPostOnly] = useState(false)
  useEffect(() => setBudget(maxBudget), [maxBudget])
  const [open, setOpen] = useState<Project | null>(null)

  const list = all.filter(p => (dev === 'all' || p.developer === dev) && (comm === 'all' || p.community === comm) && (year === 'all' || String(p.handover.getFullYear()) === year) && (p.from <= budget || budget >= maxBudget) && (!postOnly || isPost(p)))
  const opt = (a: string[]) => [{ value: 'all', label: 'All' }, ...[...new Set(a)].sort().map(v => ({ value: v, label: v }))]
  const avgEntry = all.length ? all.reduce((s, p) => s + p.from, 0) / all.length : 0

  return (
    <div className="flex flex-col gap-6">
      <ModuleHeader eyebrow="Primary market · Developers" icon={<Rocket size={22} />} title="Off-Plan Launches"
        subtitle="Live off-plan inventory with milestone payment plans, DLD escrow & Oqood status, construction progress and brokerage commission."
        actions={<>
          {all.length > 0 && <Pill tone="oasis">{all.length} active launch{all.length > 1 ? 'es' : ''}</Pill>}
          <Link to="/e/developers" className="swk-btn swk-btn-ghost"><Building size={15} /> Developers</Link>
          {can('properties', 'create') && (
            <button type="button" onClick={() => setLaunchOpen(true)} className="swk-btn swk-btn-primary">
              <Rocket size={15} /> Launch Developer Project
            </button>
          )}
          <Link to="/e/properties?new=1" className="swk-btn swk-btn-ghost"><Plus size={15} /> Quick Form</Link>
        </>} />

      {featured.length > 0 && <Spotlight items={featured} now={now} onOpen={setOpen} />}

      <Reveal className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        <StatTile label="Projects tracked" value={all.length} icon={<Building size={16} />} hint={`${new Set(all.map(p => p.developer)).size} developers`} tone="navy" />
        <StatTile label="Avg entry price" value={avgEntry} format={v => aed(v, { compact: true })} icon={<HandCoins size={16} />} hint="Off-plan portfolio" />
        <StatTile label="Post-handover plans" value={all.filter(isPost).length} icon={<CalendarClock size={16} />} hint="Pay after keys" />
        <StatTile label="Units available" value={all.reduce((s, p) => s + p.avail, 0)} icon={<Landmark size={16} />} hint="Available inventory" tone="champ" />
      </Reveal>

      {all.length > 0 && (
        <Reveal>
          <Card title="Find a launch">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.4fr_auto] items-end">
              <SelectField label="Developer" value={dev} onChange={setDev} options={opt(all.map(p => p.developer))} />
              <SelectField label="Community" value={comm} onChange={setComm} options={opt(all.map(p => p.community))} />
              <SelectField label="Handover year" value={year} onChange={setYear} options={opt(all.map(p => String(p.handover.getFullYear())))} />
              <label className="swk-field">
                <span className="swk-field-label">Budget — launch price up to <b className="text-ink">{aed(budget, { compact: true })}</b></span>
                <input type="range" min={500_000} max={maxBudget} step={250_000} value={budget} onChange={e => setBudget(Number(e.target.value))} aria-label="Maximum launch price" className="w-full h-11" style={{ accentColor: SWK.champDeep }} />
              </label>
              <label className="swk-toggle h-11"><input type="checkbox" checked={postOnly} onChange={e => setPostOnly(e.target.checked)} /> Post-handover only</label>
            </div>
          </Card>
        </Reveal>
      )}

      {props.isLoading && <div className="text-[12.5px] text-muted">Loading SWK off-plan inventory…</div>}
      {!props.isLoading && all.length === 0 ? (
        <EmptyState
          title="No off-plan launches recorded yet"
          hint="Launch a developer project (like Shahrukhz by Danube) with pictures, videos, 3D tours, unit typologies, payment plans, and watermarked client brochures in one step."
          action={<div className="flex gap-2 justify-center flex-wrap">{can('properties', 'create') && <button type="button" onClick={() => setLaunchOpen(true)} className="swk-btn swk-btn-primary"><Rocket size={15} /> Launch Developer Project</button>}<Link to="/e/developers?new=1" className="swk-btn swk-btn-ghost">Add developer</Link></div>}
        />
      ) : !list.length ? (
        <EmptyState title="No launches match filters" hint="Widen your budget or clear filters." />
      ) : (
        <motion.div layout className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">{list.map((p, i) => <ProjectCard key={p.id} p={p} i={i} now={now} onOpen={() => setOpen(p)} />)}</AnimatePresence>
        </motion.div>
      )}

      {all.length > 0 && <DeveloperLeague projects={all} />}

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.project ?? ''} eyebrow={open ? `${open.developer} · ${open.community}` : ''} width={720}>
        {open && <ProjectDetail p={open} now={now} onToast={toasts.push} onShare={() => setShareProject(open)} />}
      </Drawer>
      {launchOpen && <DeveloperProjectLaunchModal onClose={() => setLaunchOpen(false)} />}
      {shareProject && <ShareWithClient entity="properties" ids={[shareProject.swkId]} label={shareProject.project} onClose={() => setShareProject(null)} />}
      {toasts.node}
    </div>
  )
}

function Spotlight({ items, now, onOpen }: { items: Project[]; now: Date; onOpen: (p: Project) => void }) {
  const [i, setI] = useState(0); const [paused, setPaused] = useState(false)
  useEffect(() => { if (paused || items.length < 2) return; const t = setInterval(() => setI(v => (v + 1) % items.length), 6000); return () => clearInterval(t) }, [paused, items.length])
  const p = items[i]; if (!p) return null
  const logo = devLogo(p.developer)
  return (
    <section aria-roledescription="carousel" aria-label="Featured launches" className="relative overflow-hidden rounded-[26px] min-h-[340px] md:min-h-[380px]" style={{ background: SWK.midnight }}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <AnimatePresence mode="popLayout">
        <motion.div key={p.id} className="absolute inset-0" initial={{ opacity: 0, scale: 1.12 }} animate={{ opacity: 1, scale: 1.02 }} exit={{ opacity: 0 }} transition={{ opacity: { duration: .8 }, scale: { duration: 7, ease: 'linear' } }}>
          <AuthImg src={p.image} alt={p.project} className="h-full w-full object-cover" />
        </motion.div>
      </AnimatePresence>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(100deg, rgba(15,42,51,.94) 0%, rgba(15,42,51,.7) 45%, rgba(15,42,51,.1) 100%)' }} />
      <div className="relative z-[1] p-6 md:p-10 flex flex-col md:flex-row gap-6 md:items-end justify-between min-h-[340px] md:min-h-[380px]">
        <AnimatePresence mode="wait">
          <motion.div key={p.id} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: .5, ease: [0.16, 1, 0.3, 1] }} className="max-w-[620px] text-white flex flex-col gap-3 mt-auto">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="swk-pill" style={{ background: 'rgba(138,98,28,.2)', color: '#f8f5ef' }}>Featured launch</span>
              <span className="swk-pill" style={{ background: 'rgba(255,255,255,.12)', color: '#fff' }}>{p.handoverQ} handover</span>
              {logo && <span className="h-7 px-2 rounded-lg bg-white/95 grid place-items-center"><img src={logo} alt={p.developer} className="h-5 object-contain" /></span>}
            </div>
            <h2 className="font-display text-[30px] md:text-[42px] font-semibold leading-[1.05] !text-white" style={{ color: '#fff' }}>{p.project}</h2>
            <p className="text-[14px] text-white/75">{p.blurb}</p>
            <div className="flex flex-wrap gap-6 mt-1">
              <div><div className="text-[11px] uppercase tracking-wider text-white/55">From</div><div className="font-display text-[22px] font-semibold" style={{ color: '#f8f5ef' }}>{p.from ? aed(p.from, { compact: true }) : 'On request'}</div></div>
              <div><div className="text-[11px] uppercase tracking-wider text-white/55">Payment plan</div><div className="font-display text-[22px] font-semibold">{planLabel(p.plan)}</div></div>
              <div><div className="text-[11px] uppercase tracking-wider text-white/55">Community</div><div className="font-display text-[22px] font-semibold">{p.community}</div></div>
            </div>
            <div className="flex gap-2 mt-2"><button className="swk-btn swk-btn-gold" onClick={() => onOpen(p)}>View payment plan <ArrowUpRight size={16} /></button></div>
          </motion.div>
        </AnimatePresence>
        <div className="flex md:flex-col items-center gap-4">
          <div className="rounded-full p-2" style={{ background: 'rgba(255,255,255,.95)' }}><ProgressRing key={p.id} value={p.completion} size={96} color={SWK.oasis} sub="built" /></div>
          <div className="text-white/80 text-[12px] text-center">{countdown(p.handover, now).text}</div>
        </div>
      </div>
      {items.length > 1 && (
        <div className="absolute z-[2] bottom-4 right-5 flex items-center gap-2">
          <button className="w-8 h-8 rounded-full grid place-items-center text-white" style={{ background: 'rgba(255,255,255,.14)' }} onClick={() => setI(v => (v - 1 + items.length) % items.length)} aria-label="Previous launch"><ChevronLeft size={16} /></button>
          {items.map((it, k) => (
            <button key={it.id} onClick={() => setI(k)} aria-label={`Show ${it.project}`} aria-current={k === i} className="h-1.5 rounded-full overflow-hidden" style={{ width: k === i ? 34 : 12, background: 'rgba(255,255,255,.3)', transition: 'width .3s' }}>
              {k === i && <motion.span key={`${it.id}-${paused}`} className="block h-full" style={{ background: SWK.champ }} initial={{ width: paused ? '100%' : 0 }} animate={{ width: '100%' }} transition={{ duration: paused ? 0 : 6, ease: 'linear' }} />}
            </button>
          ))}
          <button className="w-8 h-8 rounded-full grid place-items-center text-white" style={{ background: 'rgba(255,255,255,.14)' }} onClick={() => setI(v => (v + 1) % items.length)} aria-label="Next launch"><ChevronRight size={16} /></button>
        </div>
      )}
    </section>
  )
}

function PlanBar({ plan, height = 10 }: { plan: Plan; height?: number }) {
  const segs = (['booking', 'construction', 'handover', 'post'] as const).filter(k => plan[k] > 0)
  return (
    <div>
      <div className="flex w-full rounded-full overflow-hidden gap-[2px]" style={{ height }} role="img" aria-label={`Payment plan ${segs.map(k => `${k} ${plan[k]}%`).join(', ')}`}>
        {segs.map((k, i) => <motion.div key={k} style={{ background: PHASE_COLORS[k] }} initial={{ width: 0 }} whileInView={{ width: `${plan[k]}%` }} viewport={{ once: true }} transition={{ duration: .9, delay: i * .12, ease: [0.16, 1, 0.3, 1] }} />)}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[10.5px] text-muted">
        {segs.map(k => <span key={k} className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: PHASE_COLORS[k] }} />{k === 'post' ? 'Post-handover' : k[0].toUpperCase() + k.slice(1)} {plan[k]}%</span>)}
      </div>
    </div>
  )
}

/** Pointer-driven 3D tilt; flat when the viewer prefers reduced motion. */
function useTilt(max = 7) {
  const reduce = useReducedMotion()
  const x = useMotionValue(0.5), y = useMotionValue(0.5)
  const rotateY = useSpring(useTransform(x, [0, 1], [-max, max]), { stiffness: 180, damping: 18 })
  const rotateX = useSpring(useTransform(y, [0, 1], [max, -max]), { stiffness: 180, damping: 18 })
  if (reduce) return { style: {}, handlers: {} }
  return {
    style: { rotateX, rotateY, transformPerspective: 900 },
    handlers: {
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => { const r = e.currentTarget.getBoundingClientRect(); x.set((e.clientX - r.left) / r.width); y.set((e.clientY - r.top) / r.height) },
      onPointerLeave: () => { x.set(0.5); y.set(0.5) },
    },
  }
}

function ProjectCard({ p, i, now, onOpen }: { p: Project; i: number; now: Date; onOpen: () => void }) {
  const logo = devLogo(p.developer); const cd = countdown(p.handover, now)
  const photos = p.media.filter(m => m.kind === 'photo')
  const photoCount = photos.length
  const tilt = useTilt()
  const [hover, setHover] = useState(false); const [shot, setShot] = useState(0)
  useEffect(() => { if (!hover || photos.length < 2) return; const t = setInterval(() => setShot(v => (v + 1) % photos.length), 1400); return () => clearInterval(t) }, [hover, photos.length])
  const src = hover && photos.length > 1 ? photos[shot].url : p.image
  return (
    <motion.article layout initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: .95 }} transition={{ duration: .45, delay: Math.min(i, 8) * .04 }} whileHover={{ y: -4 }} style={tilt.style} {...tilt.handlers} onHoverStart={() => setHover(true)} onHoverEnd={() => { setHover(false); setShot(0) }} className="swk-card overflow-hidden flex flex-col group">
      <button onClick={onOpen} className="relative h-[180px] overflow-hidden text-left" aria-label={`Open ${p.project}`}>
        <AnimatePresence initial={false}>
          <motion.div key={src} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .5 }}>
            <AuthImg src={src} fallback={communityImg(p.community)} alt={p.project} className="h-full w-full object-cover transition-transform duration-[1.2s] group-hover:scale-[1.06]" />
          </motion.div>
        </AnimatePresence>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(15,42,51,0) 35%, rgba(15,42,51,.82) 100%)' }} />
        <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
          <Pill tone="oasis">SWK inventory</Pill>
          {photoCount > 0 && <Pill tone="grey"><ImageIcon size={11} /> {photoCount}</Pill>}
          {p.videoUrl && <Pill tone="champ"><Film size={11} /> Video</Pill>}
          <Pill tone="sky"><Box size={11} /> 3D</Pill>
          {isPost(p) && <Pill tone="sky">Post-handover</Pill>}
          {!p.oqood && <Pill tone="dune">Permit / Oqood pending</Pill>}
        </div>
        {logo && <span className="absolute top-3 right-3 h-8 px-2 rounded-lg bg-white/95 grid place-items-center"><img src={logo} alt={p.developer} className="h-5 max-w-[80px] object-contain" /></span>}
        <div className="absolute bottom-3 left-4 right-4 text-white">
          <div className="font-display text-[19px] font-semibold leading-tight">{p.project}</div>
          <div className="text-[12px] opacity-80">{p.developer} · {p.community}</div>
        </div>
      </button>
      <div className="p-4 flex flex-col gap-3.5 flex-1">
        <div className="flex items-center gap-4">
          <ProgressRing value={p.completion} size={70} stroke={7} color={SWK.oasis} sub="built" />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted">Launch price from</div>
            <div className="font-display text-[20px] font-semibold text-ink">{p.from ? aed(p.from, { compact: true }) : 'Price on request'}</div>
            <div className="text-[12px] text-muted truncate">{p.types.join(' · ')}</div>
          </div>
        </div>
        <PlanBar plan={p.plan} />
        <div>
          <div className="flex justify-between text-[12px] mb-1"><span className="text-muted">Availability</span><span className="font-semibold text-ink tabular-nums">{num(p.avail)} / {num(p.total)} units</span></div>
          <Bar value={p.avail} max={p.total} color={p.avail / p.total < 0.15 ? SWK.dune : SWK.champ} delay={.1} />
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: SWK.navy }}><CalendarClock size={14} /> {p.handoverQ} · {cd.text}</span>
          <span className="text-[11.5px] text-muted">{p.commission}% comm.</span>
        </div>
        <div className="flex gap-2">
          <button className="swk-btn swk-btn-primary !h-9 flex-1 text-[12.5px]" onClick={onOpen}>Payment plan & details</button>
          <Link to={`/e/properties/${p.swkId}`} className="swk-btn swk-btn-ghost !h-9 !w-9 !p-0" aria-label="Open property record"><ArrowUpRight size={16} /></Link>
        </div>
      </div>
    </motion.article>
  )
}

function ProjectDetail({ p, now, onToast, onShare }: { p: Project; now: Date; onToast: (m: string) => void; onShare: () => void }) {
  const [price, setPrice] = useState(p.from)
  const [split, setSplit] = useState(50)
  const [mediaTab, setMediaTab] = useState<'gallery' | 'video' | '3d'>('gallery')
  const photos = useMemo(() => p.media.filter(m => m.kind === 'photo'), [p.media])
  const plan = useMemo(() => paymentPlan({
    price, bookingPct: p.plan.booking, constructionPct: p.plan.construction, handoverPct: p.plan.handover, postHandoverPct: p.plan.post,
    constructionInstalments: p.plan.construction ? Math.min(8, Math.max(2, Math.round(p.plan.construction / 10))) : 0, postInstalments: p.plan.post ? 4 : 0,
    start: now, handover: p.handover > now ? p.handover : new Date(now.getTime() + 180 * 864e5),
  }), [price, p, now])
  const gross = price * p.commission / 100
  const minPaid = price * p.minPaidResale / 100
  const phaseColor = (ph: string) => ph === 'Booking' ? PHASE_COLORS.booking : ph === 'Construction' ? PHASE_COLORS.construction : ph === 'Handover' ? PHASE_COLORS.handover : ph === 'Post-handover' ? PHASE_COLORS.post : SWK.champDeep
  const wa = [
    `*${p.project}* by ${p.developer}`, `📍 ${p.community}, Dubai`, `🏠 ${p.types.join(', ')}`, `💰 From ${aed(p.from)}`, `🗓 Handover ${p.handoverQ} · ${p.completion}% built`,
    `💳 Payment plan ${planLabel(p.plan)}`, `🏦 Escrow: ${p.escrow} · ${p.reraNo}`,
    p.videoUrl && /^https?:\/\//i.test(p.videoUrl) ? `🎬 Video: ${p.videoUrl}` : '',
    p.tourUrl && /^https?:\/\//i.test(p.tourUrl) ? `🧊 3D Tour: ${p.tourUrl}` : '',
    '', `Unit at ${aed(price)}: ${plan.rows.slice(0, 2).map(r => `${r.label} ${aed(r.amount)}`).join(' + ')}`,
    '', 'SWK Properties · RERA ORN 51517', 'Prices & availability subject to developer confirmation.',
  ].filter(Boolean).join('\n')
  return (
    <div className="flex flex-col gap-5">
      {/* Interactive Media Header (Photos / Video / 3D Tour) */}
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setMediaTab('gallery')} className={`rounded-full px-3 py-1 text-xs font-bold border cursor-pointer ${mediaTab === 'gallery' ? 'bg-[#121212] text-white border-[#121212]' : 'bg-white text-ink border-line'}`}>
            <ImageIcon size={12} className="inline mr-1" /> Photos ({Math.max(1, photos.length)})
          </button>
          {p.videoUrl && (
            <button type="button" onClick={() => setMediaTab('video')} className={`rounded-full px-3 py-1 text-xs font-bold border cursor-pointer ${mediaTab === 'video' ? 'bg-[#121212] text-white border-[#121212]' : 'bg-white text-ink border-line'}`}>
              <Film size={12} className="inline mr-1" /> Launch Video
            </button>
          )}
          <button type="button" onClick={() => setMediaTab('3d')} className={`rounded-full px-3 py-1 text-xs font-bold border cursor-pointer ${mediaTab === '3d' ? 'bg-[#121212] text-white border-[#121212]' : 'bg-white text-ink border-line'}`}>
            <Box size={12} className="inline mr-1" /> 3D Model & Floor Layout
          </button>
          <div className="flex-1" />
          <Link to={`/e/properties/${p.swkId}`} className="swk-pill swk-pill-champ no-underline">Manage Media Studio →</Link>
        </div>

        {mediaTab === 'video' && p.videoUrl ? (
          <MediaVideoPlayer url={p.videoUrl} title={p.project} />
        ) : mediaTab === '3d' ? (
          <div className="flex flex-col gap-3">
            {/* indicative model from the listing's type, beds and size; the real tour/site view follows when one exists */}
            <Property3DViewer title={p.project} type={p.ptype} beds={p.beds} area={p.areaSqft} location={`${p.community}, Dubai`} />
            {(p.tourUrl || p.model3dUrl) && <MediaTour3DEmbed url={(p.tourUrl || p.model3dUrl)!} title={p.project} />}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="relative h-[200px] rounded-2xl overflow-hidden bg-[#0b1824]">
              <AuthImg src={p.image} alt={p.project} className="h-full w-full object-cover" />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 35%, rgba(15,42,51,.88))' }} />
              <div className="absolute bottom-3 left-4 right-4 text-white text-[12px] opacity-90 line-clamp-2">{p.blurb}</div>
            </div>
            {photos.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {photos.slice(0, 4).map(ph => (
                  <div key={ph.id} className="aspect-[16/10] rounded-xl overflow-hidden border border-line bg-soft">
                    <AuthImg src={ph.url} alt={ph.title || p.project} className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-6">
        <div className="swk-kv"><span>Handover</span><b>{p.handoverQ}</b></div>
        <div className="swk-kv"><span>Construction</span><b>{p.completion}%</b></div>
        <div className="swk-kv"><span>RERA project</span><b>{p.reraNo}</b></div>
        <div className="swk-kv"><span>Escrow bank</span><b>{p.escrow}</b></div>
        <div className="swk-kv"><span>Units left</span><b>{p.avail} / {p.total}</b></div>
        <div className="swk-kv"><span>Oqood</span><b style={{ color: p.oqood ? SWK.oasis : SWK.dune }}>{p.oqood ? 'Available' : 'Pending'}</b></div>
      </div>

      <div className="swk-card"><div className="swk-card-body flex flex-col gap-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]"><Field label="Unit price" prefix="AED" value={price} onChange={setPrice} step={10000} hint={`Launch from ${aed(p.from)}`} /></div>
          <div className="text-right"><div className="text-[11px] uppercase tracking-wider text-muted">Total incl. 4% Oqood</div><div className="font-display text-[20px] font-semibold text-ink">{aed(price * 1.04)}</div></div>
        </div>
        <PlanBar plan={p.plan} height={12} />
        <div className="max-h-[300px] overflow-y-auto rounded-xl" style={{ border: `1px solid ${SWK.line}` }}>
          <table className="swk-table">
            <thead><tr><th>Milestone</th><th>Date</th><th className="num">%</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {plan.rows.map((r, k) => (
                <motion.tr key={`${r.label}-${k}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: k * .03 }}>
                  <td><span className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full flex-none" style={{ background: phaseColor(r.phase) }} />{r.label}</span></td>
                  <td className="text-muted text-[12.5px]">{r.date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</td>
                  <td className="num">{r.pct.toFixed(1)}</td>
                  <td className="num font-semibold">{aed(r.amount)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div></div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4" style={{ border: `1px solid ${SWK.line}` }}>
          <div className="flex items-center gap-2 font-semibold text-ink text-[13.5px]"><ShieldCheck size={16} style={{ color: SWK.oasis }} /> Escrow & Oqood</div>
          <p className="text-[12px] text-muted mt-1.5 leading-relaxed">All instalments must be paid into the project escrow account at {p.escrow} (Dubai Law 8 of 2007) — never to the developer or SWK directly. The SPA is registered on the DLD interim register (Oqood) for a 4% fee; buyers receive an Oqood certificate until the title deed is issued at handover.</p>
        </div>
        <div className="rounded-2xl bg-white p-4" style={{ border: `1px solid ${SWK.line}` }}>
          <div className="flex items-center gap-2 font-semibold text-ink text-[13.5px]"><Lock size={16} style={{ color: SWK.dune }} /> Anti-flipping / resale</div>
          <p className="text-[12px] text-muted mt-1.5 leading-relaxed">{p.developer} issues a resale / assignment NOC only after <b className="text-ink">{p.minPaidResale}%</b> of the price is paid (≈ {aed(minPaid)} on this unit). Assignment fees typically apply (1–4%); the new buyer pays DLD Oqood transfer.</p>
        </div>
      </div>

      <div className="rounded-2xl p-4 text-white" style={{ background: `linear-gradient(135deg, ${SWK.navy}, ${SWK.midnight})` }}>
        <div className="flex items-center justify-between gap-2"><span className="swk-eyebrow" style={{ color: '#f8f5ef' }}>SWK commission estimate</span><span className="text-[11px] text-white/60">{p.commission}% developer-paid</span></div>
        <div className="font-display text-[28px] font-semibold mt-1" style={{ color: '#f8f5ef' }}>{aed(gross)}</div>
        <div className="text-[12px] text-white/70">+ VAT {aed(gross * UAE.vat)} · invoice {aed(gross * (1 + UAE.vat))}</div>
        <label className="block mt-3 text-[12px] text-white/80">Agent split {split}% → agent {aed(gross * split / 100)} · SWK net {aed(gross * (100 - split) / 100)}
          <input type="range" min={30} max={80} step={5} value={split} onChange={e => setSplit(Number(e.target.value))} className="w-full mt-1" style={{ accentColor: SWK.champ }} aria-label="Agent split percent" />
        </label>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button type="button" className="swk-btn swk-btn-primary" onClick={onShare}><Share2 size={15} /> Share Watermarked Brochure</button>
        <button type="button" className="swk-btn swk-btn-gold" onClick={async () => { if (await copyText(wa)) onToast('WhatsApp brochure text copied') }}><Copy size={15} /> Copy pitch</button>
        <a className="swk-btn swk-btn-ghost" href={`https://wa.me/?text=${encodeURIComponent(wa)}`} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp</a>
        {p.floorPlanUrl && (
          p.floorPlanUrl.startsWith('/api/files/') ? (
            <button type="button" className="swk-btn swk-btn-ghost" onClick={() => void openAuthFile(p.floorPlanUrl!, `${p.project}-floor-plan.pdf`)}><FileText size={14} /> Floor Plan</button>
          ) : (
            <a className="swk-btn swk-btn-ghost" href={p.floorPlanUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Floor Plan</a>
          )
        )}
        {p.brochureUrl && (
          p.brochureUrl.startsWith('/api/files/') ? (
            <button type="button" className="swk-btn swk-btn-ghost" onClick={() => void openAuthFile(p.brochureUrl!, `${p.project}-brochure.pdf`)}><FileText size={14} /> Brochure PDF</button>
          ) : (
            <a className="swk-btn swk-btn-ghost" href={p.brochureUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Brochure PDF</a>
          )
        )}
      </div>
    </div>
  )
}

function DeveloperLeague({ projects }: { projects: Project[] }) {
  const rows = Object.values(projects.reduce<Record<string, { dev: string; n: number; comp: number; avail: number; from: number }>>((acc, p) => {
    const r = acc[p.developer] ??= { dev: p.developer, n: 0, comp: 0, avail: 0, from: Infinity }
    r.n++; r.comp += p.completion; r.avail += p.avail; r.from = Math.min(r.from, p.from); return acc
  }, {})).map(r => ({ ...r, comp: r.comp / r.n })).sort((a, b) => b.n - a.n || b.comp - a.comp)
  const maxN = Math.max(...rows.map(r => r.n), 1)
  return (
    <Reveal>
      <Card title={<span className="inline-flex items-center gap-2"><Trophy size={18} style={{ color: SWK.champDeep }} /> Developer league</span>} subtitle="Ranked by active off-plan launches in SWK portfolio">
        <div className="grid gap-x-8 md:grid-cols-2">
          {rows.map((r, k) => {
            const logo = devLogo(r.dev)
            return (
              <motion.div key={r.dev} className="swk-row" initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: k * .05 }}>
                <span className="w-7 text-center font-display font-semibold" style={{ color: k < 3 ? SWK.champDeep : SWK.muted }}>{k + 1}</span>
                <span className="swk-row-ic !bg-white" style={{ border: `1px solid ${SWK.line}` }}>{logo ? <img src={logo} alt="" className="w-7 h-7 object-contain" /> : <Building size={16} />}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-2"><span className="swk-row-t">{r.dev}</span><span className="text-[12px] text-muted tabular-nums">{r.n} project{r.n > 1 ? 's' : ''} · {Math.round(r.comp)}% avg</span></div>
                  <div className="mt-1.5 flex items-center gap-2"><div className="flex-1"><Bar value={r.n} max={maxN} color={SWK.navy} height={6} delay={k * .05} /></div><div className="w-20"><Bar value={r.comp} color={SWK.oasis} height={6} delay={k * .05} /></div></div>
                  <div className="swk-row-s mt-1">{num(r.avail)} units available · from {aed(r.from, { compact: true })}</div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </Card>
    </Reveal>
  )
}

void COMMUNITIES
