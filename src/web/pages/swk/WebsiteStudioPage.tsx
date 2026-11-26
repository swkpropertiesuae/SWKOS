import { useEffect, useMemo, useState } from 'react'
import { CustomSelect } from '../../components/CustomSelect'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowUpRight,
  Bath,
  BedDouble,
  CheckCircle2,
  Download,
  Expand,
  Eye,
  EyeOff,
  Flame,
  GitCommitHorizontal,
  Globe,
  Megaphone,
  Pencil,
  Plus,
  Rocket,
  Save,
  Search,
  Share2,
  ShieldCheck,
} from 'lucide-react'
import { ShareWithClient } from '../../components/ShareWithClient'
import { downloadAuthFile, get, post, put } from '../../lib/api'
import { useToast } from '../../lib/toast'
import { useMeta } from '../../lib/meta'
import { websiteImage, WEBSITE_URL } from '@shared/entities/website'

type Listing = { id: number; version: number; reference: string; slug: string; title: string; purpose: string; status: string; property_type: string; published: boolean; hot_offer: boolean; badge?: string | null; community: string; building?: string; developer?: string; price_aed: number; bedrooms?: number; bathrooms?: number; area_sqft?: number; image_url?: string }
type Promo = { id: number; version: number; title: string; eyebrow?: string; tab: string; active: boolean; price_guide?: string; plan_highlight?: string; image?: string; href?: string; community?: string }
type Status = { config: { repo: string; branch: string; tokenSet: boolean; hookSet: boolean }; last: Record<string, any> | null; published: number; hot: number; promotions: number; siteUpdates?: any; zeroShabibGuard?: boolean; problems: string[] }

const aed = (n: number) => 'AED ' + Math.round(n || 0).toLocaleString('en-US')
const statusDot = (l: Listing) => (l.purpose === 'off-plan' ? '#d4a752' : l.status === 'sold' || l.status === 'rented' ? '#a3263a' : l.status === 'reserved' ? '#a5ce3a' : '#62c584')
const statusText = (l: Listing) => (l.purpose === 'off-plan' ? 'Off-Plan Launch' : l.purpose === 'rent' ? 'For Rent' : l.status === 'available' ? 'For Sale · Ready' : l.status)
const beds = (l: Listing) => (l.property_type === 'Office' ? 'Commercial' : !l.bedrooms ? 'Studio' : `${l.bedrooms} ${l.bedrooms === 1 ? 'Bed' : 'Beds'}`)

function ListingCard({ l, onToggle, onShare }: { l: Listing; onToggle: (field: 'published' | 'hot_offer') => void; onShare: () => void }) {
  return (
    <article className={`web-card hoverable group flex h-full flex-col overflow-hidden ${l.published ? '' : 'opacity-60'}`}>
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#efe9dd]">
        {l.image_url ? <img src={websiteImage(l.image_url)} alt={l.title} loading="lazy" className="size-full object-cover transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-110 group-hover:brightness-[0.82]" /> : <div className="grid size-full place-items-center text-[12px] text-[#5b676e]">No image yet</div>}
        <div className="pointer-events-none absolute left-3.5 top-3.5 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#0f2a33]/80 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-white backdrop-blur-md"><span className="size-1.5 rounded-[2px]" style={{ background: statusDot(l) }} aria-hidden="true" />{statusText(l)}</span>
          {l.hot_offer && <span className="inline-flex items-center gap-1 rounded-full bg-[#d4a752] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0f2a33]"><Flame size={11} /> Hot offer</span>}
          {!l.published && <span className="rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-medium text-[#0f2a33]">Hidden</span>}
        </div>
        <div className="absolute right-3.5 top-3.5 flex items-center gap-1.5">
          <button type="button" onClick={() => onToggle('hot_offer')} aria-pressed={l.hot_offer} aria-label={l.hot_offer ? 'Remove hot offer' : 'Promote as hot offer'} title={l.hot_offer ? 'Remove hot offer' : 'Promote as hot offer'}
            className={`flex size-8 cursor-pointer items-center justify-center rounded-full border-0 backdrop-blur-md transition-colors ${l.hot_offer ? 'bg-[#0f2a33] text-[#d4a752]' : 'bg-white/90 text-[#0f2a33] hover:bg-[#0f2a33] hover:text-white'}`}><Flame size={14} /></button>
          <button type="button" onClick={onShare} aria-label="Share with client" title="Share with client" className="flex size-8 cursor-pointer items-center justify-center rounded-full border-0 bg-white/90 text-[#0f2a33] backdrop-blur-md transition-colors hover:bg-[#0f2a33] hover:text-white"><Share2 size={14} /></button>
          <button type="button" onClick={() => onToggle('published')} aria-pressed={l.published} aria-label={l.published ? 'Hide from website' : 'Show on website'} title={l.published ? 'Hide from website' : 'Show on website'}
            className="flex size-8 cursor-pointer items-center justify-center rounded-full border-0 bg-white/90 text-[#0f2a33] backdrop-blur-md transition-colors hover:bg-[#0f2a33] hover:text-white">{l.published ? <Eye size={14} /> : <EyeOff size={14} />}</button>
        </div>
        <Link to={`/e/website_listings/${l.id}`} aria-label={`Edit ${l.title}`} className="absolute bottom-3.5 right-3.5 flex size-11 translate-y-2 items-center justify-center rounded-full bg-white text-[#0f2a33] opacity-0 shadow-lg transition-all duration-300 hover:bg-[#d4a752] group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100"><Pencil size={15} /></Link>
      </div>
      <div className="flex flex-1 flex-col justify-between p-5">
        <div>
          <div className="flex items-center justify-between gap-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#8a621c]"><span className="truncate">{l.community}</span><span className="shrink-0 font-mono text-[10px] text-[#5b676e]">{l.reference}</span></div>
          <div className="mt-2.5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link to={`/e/website_listings/${l.id}`} className="block text-[17px] font-medium leading-[1.2] tracking-[-0.025em] text-[#0f2a33] no-underline transition-colors group-hover:text-[#8a621c]">{l.title}</Link>
              <p className="mt-1 truncate text-xs text-[#5b676e]">{[l.building, l.developer].filter(Boolean).join(' · ')}</p>
            </div>
            <div className="shrink-0 rounded-full border border-[#8a621c]/20 bg-[#8a621c]/10 px-3 py-1.5 text-right"><span className="block whitespace-nowrap text-sm font-semibold tabular-nums tracking-[-0.02em] text-[#7a5518]">{aed(l.price_aed)}</span>{l.purpose === 'rent' && <span className="block text-[9.5px] font-medium uppercase tracking-[0.12em] text-[#7a5518]/75">/ yr</span>}</div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 divide-x divide-[#e6e0d4] border-t border-[#e6e0d4] pt-4 text-[12px] text-[#3d4a51]">
          <span className="flex items-center gap-1.5"><BedDouble size={14} className="text-[#5b676e]" />{beds(l)}</span>
          <span className="flex items-center justify-center gap-1.5"><Bath size={14} className="text-[#5b676e]" />{l.bathrooms ?? 0} Baths</span>
          <span className="flex items-center justify-end gap-1.5"><Expand size={14} className="text-[#5b676e]" />{(l.area_sqft ?? 0).toLocaleString('en-US')} ft²</span>
        </div>
      </div>
    </article>
  )
}

function PromoCard({ p, onToggle }: { p: Promo; onToggle: () => void }) {
  return (
    <article className={`web-card hoverable flex overflow-hidden ${p.active ? '' : 'opacity-60'}`}>
      <div className="relative w-40 shrink-0 bg-[#efe9dd] sm:w-52">{p.image && <img src={websiteImage(p.image)} alt="" loading="lazy" className="size-full object-cover" />}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-5">
        <div className="web-eyebrow truncate">{p.eyebrow || p.tab}</div>
        <Link to={`/e/website_promotions/${p.id}`} className="text-[17px] font-medium leading-tight tracking-[-0.025em] text-[#0f2a33] no-underline hover:text-[#8a621c]">{p.title}</Link>
        <div className="text-[13px] text-[#3d4a51]">{[p.price_guide, p.plan_highlight].filter(Boolean).join(' · ')}</div>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <span className={`web-pill ${p.active ? 'mint' : ''}`}>{p.active ? 'Live' : 'Paused'}</span>
          <span className="web-pill">{p.tab}</span>
          <div className="flex-1" />
          <button type="button" className="web-btn light" style={{ height: 34, padding: '0 14px' }} onClick={onToggle}>{p.active ? 'Pause' : 'Go live'}</button>
          <Link to={`/e/website_promotions/${p.id}`} className="web-btn" style={{ height: 34, padding: '0 14px' }}>Edit</Link>
        </div>
      </div>
    </article>
  )
}

export default function WebsiteStudioPage() {
  const qc = useQueryClient(), toast = useToast(), { can } = useMeta()
  const [tab, setTab] = useState<'inventory' | 'promotions' | 'updates' | 'social'>('inventory')
  const [term, setTerm] = useState('')
  const [purpose, setPurpose] = useState<'all' | 'buy' | 'rent' | 'off-plan' | 'hot' | 'hidden'>('all')
  const [deploying, setDeploying] = useState(false)
  const [savingUpdates, setSavingUpdates] = useState(false)
  const [share, setShare] = useState<Listing | null>(null)

  const listingsQ = useQuery({ queryKey: ['website', 'listings'], queryFn: () => get<{ rows: Listing[] }>('/api/e/website_listings', { pageSize: 1000, sort: 'sort_order', dir: 'asc' }) })
  const promosQ = useQuery({ queryKey: ['website', 'promotions'], queryFn: () => get<{ rows: Promo[] }>('/api/e/website_promotions', { pageSize: 200, sort: 'sort_order', dir: 'asc' }) })
  const statusQ = useQuery({ queryKey: ['website', 'status'], queryFn: () => get<Status>('/api/website/status') })
  const socialQ = useQuery({ queryKey: ['website', 'social'], queryFn: () => get<{ rows: any[] }>('/api/website/social-campaigns') })

  const [siteForm, setSiteForm] = useState({
    announcement: '',
    hero_offer_badge: '',
    hero_offer_title: '',
    hero_offer_subtitle: '',
    hero_offer_cta_label: '',
    hero_offer_cta_href: '/off-plan',
  })
  const [socialForm, setSocialForm] = useState({
    title: '',
    channel: 'Instagram',
    status: 'Scheduled',
    publish_date: new Date().toISOString().slice(0, 10),
    target_url: 'https://www.swkpropertiesuae.com/off-plan',
    offer_highlight: '',
    caption: '',
  })

  useEffect(() => {
    const su = statusQ.data?.siteUpdates
    if (su && !siteForm.announcement) {
      setSiteForm({
        announcement: su.announcement || '',
        hero_offer_badge: su.hero_offer_badge || '',
        hero_offer_title: su.hero_offer_title || '',
        hero_offer_subtitle: su.hero_offer_subtitle || '',
        hero_offer_cta_label: su.hero_offer_cta_label || '',
        hero_offer_cta_href: su.hero_offer_cta_href || '/off-plan',
      })
    }
  }, [statusQ.data?.siteUpdates]) // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => { void qc.invalidateQueries({ queryKey: ['website'] }) }
  const rows = listingsQ.data?.rows ?? []
  const shown = useMemo(() => {
    const t = term.trim().toLowerCase()
    return [...rows]
      .filter(l => purpose === 'all' || (purpose === 'hot' ? l.hot_offer : purpose === 'hidden' ? !l.published : l.purpose === purpose))
      .filter(l => !t || [l.title, l.reference, l.community, l.building, l.developer].some(v => String(v ?? '').toLowerCase().includes(t)))
      .sort((a, b) => Number(b.hot_offer) - Number(a.hot_offer))
  }, [rows, term, purpose])

  const toggle = async (entity: string, id: number, version: number, field: string, value: boolean) => {
    try { await put(`/api/e/${entity}/${id}`, { [field]: value, version }); refresh() } catch (e: any) { toast.error(e.message) }
  }
  const deploy = async () => {
    setDeploying(true)
    try {
      const r = await post<Record<string, any>>('/api/website/deploy')
      toast.ok(r.status === 'unchanged' ? 'Website already up to date — nothing to deploy' : `Deployed: ${r.listings} listings, ${r.promotions} promotions & live updates.`)
      refresh()
    } catch (e: any) { toast.error(e.message) } finally { setDeploying(false) }
  }
  const saveUpdates = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingUpdates(true)
    try {
      await put('/api/website/site-updates', siteForm)
      toast.ok('Live website announcement & offer banner saved (ready to deploy & live on /api/public/website/cms)')
      refresh()
    } catch (err: any) { toast.error(err.message) } finally { setSavingUpdates(false) }
  }
  const createCampaign = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await post('/api/website/social-campaigns', socialForm)
      toast.ok('Social media campaign saved')
      setSocialForm({ ...socialForm, title: '', offer_highlight: '', caption: '' })
      refresh()
    } catch (err: any) { toast.error(err.message) }
  }

  const st = statusQ.data
  const canEdit = can('website', 'edit')
  return (
    <div className="mx-auto max-w-[1260px] pb-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="web-eyebrow">swkpropertiesuae.com · Two-Way Live Sync</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10.5px] font-bold text-emerald-800">
              <ShieldCheck size={12} /> 100% Public Identity Privacy Lock Active
            </span>
          </div>
          <h1 className="web-title mt-1">Website &amp; Social Studio</h1>
          <p className="web-lead">Manage inventory, hot offers, live site announcements, and social media campaigns directly from SWK OS and publish to swkpropertiesuae.com in one click.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a href={WEBSITE_URL} target="_blank" rel="noopener noreferrer" className="web-btn light"><Globe size={14} /> Open website</a>
          <button type="button" onClick={() => void downloadAuthFile('/api/website/export.json', 'website-export.json').catch(e => toast.error(e.message))} className="web-btn light"><Download size={14} /> Download data</button>
          {canEdit && <button type="button" className="web-btn" onClick={() => void deploy()} disabled={deploying || !st?.config.tokenSet}><Rocket size={14} /> {deploying ? 'Deploying…' : 'Publish & deploy'}</button>}
        </div>
      </header>

      <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[['On website', st?.published ?? '—'], ['Hot offers', st?.hot ?? '—'], ['Spotlight deals', st?.promotions ?? '—'], ['Social campaigns', socialQ.data?.rows?.length ?? 0]].map(([l, v]) => (
          <div key={String(l)} className="web-card p-5"><div className="web-eyebrow">{l}</div><div className="web-stat mt-3">{v}</div></div>
        ))}
      </section>

      <section className="web-card mb-8 flex flex-wrap items-center gap-4 p-5" aria-live="polite">
        {st?.config.tokenSet ? <CheckCircle2 size={20} className="text-[#8a621c]" /> : <AlertTriangle size={20} className="text-[#b45309]" />}
        <div className="min-w-0 flex-1 text-[13.5px] text-[#3d4a51]">
          {st?.config.tokenSet
            ? <>Connected to <b className="text-[#0f2a33]">{st.config.repo}</b> · branch <b className="text-[#0f2a33]">{st.config.branch}</b>. Publishing commits listings, promotions &amp; live site updates automatically.</>
            : <>GitHub auto-deploy token (<code>WEBSITE_GITHUB_TOKEN</code>) not set yet; live CMS JSON is active at <code>/api/public/website/cms</code> and all changes sync on first deploy.</>}
          {st?.problems.length ? <div className="mt-1 text-[#b45309]">Needs attention: {st.problems.slice(0, 3).join(' · ')}</div> : null}
        </div>
        {st?.last && <div className="flex items-center gap-2 text-[12px] text-[#5b676e]"><GitCommitHorizontal size={15} />Last: {st.last.status} {new Date(st.last.at).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' })}{st.last.by ? ` · ${st.last.by}` : ''}{st.last.url && <a href={st.last.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-[#0f2a33] hover:text-[#8a621c]">commit <ArrowUpRight size={12} /></a>}</div>}
      </section>

      <div className="mb-6 flex flex-wrap items-center gap-2" role="tablist" aria-label="Website content">
        <button role="tab" aria-selected={tab === 'inventory'} className={tab === 'inventory' ? 'web-btn' : 'web-btn light'} style={{ height: 38 }} onClick={() => setTab('inventory')}>Inventory ({rows.length})</button>
        <button role="tab" aria-selected={tab === 'promotions'} className={tab === 'promotions' ? 'web-btn' : 'web-btn light'} style={{ height: 38 }} onClick={() => setTab('promotions')}>Offers &amp; Spotlight ({promosQ.data?.rows.length ?? 0})</button>
        <button role="tab" aria-selected={tab === 'updates'} className={tab === 'updates' ? 'web-btn' : 'web-btn light'} style={{ height: 38 }} onClick={() => setTab('updates')}>Site Updates &amp; Banners</button>
        <button role="tab" aria-selected={tab === 'social'} className={tab === 'social' ? 'web-btn' : 'web-btn light'} style={{ height: 38 }} onClick={() => setTab('social')}>Social Media ({socialQ.data?.rows?.length ?? 0})</button>
        <div className="flex-1" />
        {canEdit && (tab === 'inventory' || tab === 'promotions') && (
          <Link to={tab === 'inventory' ? '/e/website_listings?new=1' : '/e/website_promotions?new=1'} className="web-btn">
            <Plus size={14} /> {tab === 'inventory' ? 'Add listing' : 'Add offer'}
          </Link>
        )}
      </div>

      {tab === 'inventory' && (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <label className="relative min-w-[220px] flex-1">
              <span className="sr-only">Search inventory</span>
              <Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#5b676e]" />
              <input className="input" style={{ paddingLeft: 40, borderRadius: 999, height: 44 }} placeholder="Search title, reference, community, developer…" value={term} onChange={e => setTerm(e.target.value)} />
            </label>
            {(['all', 'off-plan', 'buy', 'rent', 'hot', 'hidden'] as const).map(p => (
              <button key={p} type="button" className={purpose === p ? 'web-btn' : 'web-btn light'} style={{ height: 38, padding: '0 16px' }} onClick={() => setPurpose(p)}>
                {p === 'all' ? 'All' : p === 'hot' ? 'Hot offers' : p === 'hidden' ? 'Hidden' : p === 'off-plan' ? 'Off-Plan' : p === 'buy' ? 'For Sale' : 'For Rent'}
              </button>
            ))}
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map(l => <ListingCard key={l.id} l={l} onToggle={f => void toggle('website_listings', l.id, l.version, f, !l[f])} onShare={() => setShare(l)} />)}
          </div>
          {!shown.length && <div className="web-card p-12 text-center text-sm text-[#5b676e]">No listings match this filter.</div>}
        </>
      )}

      {tab === 'promotions' && (
        <div className="grid gap-5 lg:grid-cols-2">
          {(promosQ.data?.rows ?? []).map(p => <PromoCard key={p.id} p={p} onToggle={() => void toggle('website_promotions', p.id, p.version, 'active', !p.active)} />)}
          {!(promosQ.data?.rows ?? []).length && <div className="web-card p-12 text-center text-sm text-[#5b676e] lg:col-span-2">No spotlight promotions yet.</div>}
        </div>
      )}

      {tab === 'updates' && (
        <form onSubmit={saveUpdates} className="web-card p-6 space-y-4">
          <div>
            <h2 className="m-0 text-lg font-bold text-[#0f2a33]">Live Website Announcement Bar &amp; Offer Updates</h2>
            <p className="m-0 mt-1 text-xs text-[#5b676e]">Updates <code>src/data/site-updates.json</code> on <b>swkpropertiesuae.com</b> on deploy and immediately serves via <code>/api/public/website/cms</code>.</p>
          </div>
          <label className="block text-xs font-bold text-[#0f2a33]">
            Top Announcement Bar Text
            <input className="input mt-1" value={siteForm.announcement} onChange={e => setSiteForm({ ...siteForm, announcement: e.target.value })} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-[#0f2a33]">
              Offer Badge
              <input className="input mt-1" value={siteForm.hero_offer_badge} onChange={e => setSiteForm({ ...siteForm, hero_offer_badge: e.target.value })} />
            </label>
            <label className="block text-xs font-bold text-[#0f2a33]">
              Offer Headline
              <input className="input mt-1" value={siteForm.hero_offer_title} onChange={e => setSiteForm({ ...siteForm, hero_offer_title: e.target.value })} />
            </label>
            <label className="block text-xs font-bold text-[#0f2a33]">
              CTA Button Label
              <input className="input mt-1" value={siteForm.hero_offer_cta_label} onChange={e => setSiteForm({ ...siteForm, hero_offer_cta_label: e.target.value })} />
            </label>
            <label className="block text-xs font-bold text-[#0f2a33]">
              CTA Target Path
              <input className="input mt-1" value={siteForm.hero_offer_cta_href} onChange={e => setSiteForm({ ...siteForm, hero_offer_cta_href: e.target.value })} />
            </label>
          </div>
          <label className="block text-xs font-bold text-[#0f2a33]">
            Offer Subtitle / Details
            <textarea className="input mt-1 min-h-[70px]" value={siteForm.hero_offer_subtitle} onChange={e => setSiteForm({ ...siteForm, hero_offer_subtitle: e.target.value })} />
          </label>
          {canEdit && (
            <button disabled={savingUpdates} type="submit" className="web-btn">
              <Save size={14} /> {savingUpdates ? 'Saving…' : 'Save Live Website Updates'}
            </button>
          )}
        </form>
      )}

      {tab === 'social' && (
        <div className="grid gap-6 lg:grid-cols-12">
          <form onSubmit={createCampaign} className="lg:col-span-5 web-card p-5 space-y-3">
            <h2 className="m-0 text-base font-bold text-[#0f2a33] flex items-center gap-2"><Megaphone size={16} /> Schedule Social Media Post / Campaign</h2>
            <input className="input" required placeholder="Campaign Title *" value={socialForm.title} onChange={e => setSocialForm({ ...socialForm, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-2.5">
              <CustomSelect className="select" value={socialForm.channel} onChange={e => setSocialForm({ ...socialForm, channel: e.target.value })}>
                {['Instagram', 'LinkedIn', 'TikTok', 'YouTube', 'WhatsApp Broadcast', 'Facebook'].map(c => <option key={c} value={c}>{c}</option>)}
              </CustomSelect>
              <input className="input" type="date" value={socialForm.publish_date} onChange={e => setSocialForm({ ...socialForm, publish_date: e.target.value })} />
            </div>
            <input className="input" placeholder="Offer Highlight (e.g. 1% Monthly · 0% Commission)" value={socialForm.offer_highlight} onChange={e => setSocialForm({ ...socialForm, offer_highlight: e.target.value })} />
            <input className="input" placeholder="Website Landing URL" value={socialForm.target_url} onChange={e => setSocialForm({ ...socialForm, target_url: e.target.value })} />
            <textarea className="input min-h-[90px]" required placeholder="Post caption, hashtags & call to action *" value={socialForm.caption} onChange={e => setSocialForm({ ...socialForm, caption: e.target.value })} />
            <button type="submit" className="web-btn w-full justify-center"><Plus size={14} /> Save Campaign</button>
          </form>
          <div className="lg:col-span-7 space-y-3">
            {(socialQ.data?.rows ?? []).length === 0 ? (
              <div className="web-card p-10 text-center text-sm text-[#5b676e]">No social media campaigns scheduled yet.</div>
            ) : (socialQ.data?.rows ?? []).map((c: any) => (
              <div key={c.id} className="web-card p-4 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <b className="text-sm text-[#0f2a33]">{c.title}</b>
                  <span className="web-pill mint">{c.channel} · {c.status}</span>
                </div>
                {c.offer_highlight && <div className="font-semibold text-[#8a621c]">{c.offer_highlight}</div>}
                <p className="m-0 text-[#3d4a51] whitespace-pre-wrap">{c.caption}</p>
                <div className="text-[#5b676e] pt-1">Publish: {c.publish_date} · <a href={c.target_url} target="_blank" rel="noopener noreferrer" className="underline">{c.target_url}</a></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {share && <ShareWithClient entity="website_listings" ids={[share.id]} label={share.title} onClose={() => setShare(null)} />}
    </div>
  )
}
