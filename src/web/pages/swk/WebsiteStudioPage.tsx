import { useMemo,useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery,useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight,Bath,BedDouble,Expand,Flame,Eye,EyeOff,Pencil,Plus,Rocket,Download,Search,Globe,CheckCircle2,AlertTriangle,GitCommitHorizontal,Share2 } from 'lucide-react'
import { ShareWithClient } from '../../components/ShareWithClient'
import { downloadAuthFile, get, post, put } from '../../lib/api'
import { useToast } from '../../lib/toast'
import { useMeta } from '../../lib/meta'
import { websiteImage,WEBSITE_URL } from '@shared/entities/website'

type Listing = { id: number; version: number; reference: string; slug: string; title: string; purpose: string; status: string; property_type: string; published: boolean; hot_offer: boolean; badge?: string | null; community: string; building?: string; developer?: string; price_aed: number; bedrooms?: number; bathrooms?: number; area_sqft?: number; image_url?: string }
type Promo = { id: number; version: number; title: string; eyebrow?: string; tab: string; active: boolean; price_guide?: string; plan_highlight?: string; image?: string; href?: string; community?: string }
type Status = { config: { repo: string; branch: string; tokenSet: boolean; hookSet: boolean }; last: Record<string, any> | null; published: number; hot: number; promotions: number; problems: string[] }

const aed = (n: number) => 'AED ' + Math.round(n || 0).toLocaleString('en-US')
const statusDot = (l: Listing) => (l.purpose === 'off-plan' ? '#51fec0' : l.status === 'sold' || l.status === 'rented' ? '#dc2626' : l.status === 'reserved' ? '#a5ce3a' : '#62c584')
const statusText = (l: Listing) => (l.purpose === 'off-plan' ? 'Off-Plan Launch' : l.purpose === 'rent' ? 'For Rent' : l.status === 'available' ? 'For Sale · Ready' : l.status)
const beds = (l: Listing) => (l.property_type === 'Office' ? 'Commercial' : !l.bedrooms ? 'Studio' : `${l.bedrooms} ${l.bedrooms === 1 ? 'Bed' : 'Beds'}`)

function ListingCard({ l, onToggle, onShare }: { l: Listing; onToggle: (field: 'published' | 'hot_offer') => void; onShare: () => void }) {
  return (
    <article className={`web-card hoverable group flex h-full flex-col overflow-hidden ${l.published ? '' : 'opacity-60'}`}>
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#e7f2f9]">
        {l.image_url ? <img src={websiteImage(l.image_url)} alt={l.title} loading="lazy" className="size-full object-cover transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-110 group-hover:brightness-[0.82]" /> : <div className="grid size-full place-items-center text-[12px] text-[#8b8b8b]">No image yet</div>}
        <div className="pointer-events-none absolute left-3.5 top-3.5 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#0b1623]/80 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-white backdrop-blur-md"><span className="size-1.5 rounded-[2px]" style={{ background: statusDot(l) }} aria-hidden="true" />{statusText(l)}</span>
          {l.hot_offer && <span className="inline-flex items-center gap-1 rounded-full bg-[#51fec0] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0a1624]"><Flame size={11} /> Hot offer</span>}
          {!l.published && <span className="rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-medium text-[#121212]">Hidden</span>}
        </div>
        <div className="absolute right-3.5 top-3.5 flex items-center gap-1.5">
          <button type="button" onClick={() => onToggle('hot_offer')} aria-pressed={l.hot_offer} aria-label={l.hot_offer ? 'Remove hot offer' : 'Promote as hot offer'} title={l.hot_offer ? 'Remove hot offer' : 'Promote as hot offer'}
            className={`flex size-8 cursor-pointer items-center justify-center rounded-full border-0 backdrop-blur-md transition-colors ${l.hot_offer ? 'bg-[#121212] text-[#51fec0]' : 'bg-white/90 text-[#121212] hover:bg-[#121212] hover:text-white'}`}><Flame size={14} /></button>
          <button type="button" onClick={onShare} aria-label="Share with client" title="Share with client" className="flex size-8 cursor-pointer items-center justify-center rounded-full border-0 bg-white/90 text-[#121212] backdrop-blur-md transition-colors hover:bg-[#121212] hover:text-white"><Share2 size={14} /></button>
          <button type="button" onClick={() => onToggle('published')} aria-pressed={l.published} aria-label={l.published ? 'Hide from website' : 'Show on website'} title={l.published ? 'Hide from website' : 'Show on website'}
            className="flex size-8 cursor-pointer items-center justify-center rounded-full border-0 bg-white/90 text-[#121212] backdrop-blur-md transition-colors hover:bg-[#121212] hover:text-white">{l.published ? <Eye size={14} /> : <EyeOff size={14} />}</button>
        </div>
        <Link to={`/e/website_listings/${l.id}`} aria-label={`Edit ${l.title}`} className="absolute bottom-3.5 right-3.5 flex size-11 translate-y-2 items-center justify-center rounded-full bg-white text-[#121212] opacity-0 shadow-lg transition-all duration-300 hover:bg-[#51fec0] group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100"><Pencil size={15} /></Link>
      </div>
      <div className="flex flex-1 flex-col justify-between p-5">
        <div>
          <div className="flex items-center justify-between gap-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#1b6aa7]"><span className="truncate">{l.community}</span><span className="shrink-0 font-mono text-[10px] text-[#64748b]">{l.reference}</span></div>
          <div className="mt-2.5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link to={`/e/website_listings/${l.id}`} className="block text-[17px] font-medium leading-[1.2] tracking-[-0.025em] text-[#121212] no-underline transition-colors group-hover:text-[#0e9f6e]">{l.title}</Link>
              <p className="mt-1 truncate text-xs text-[#64748b]">{[l.building, l.developer].filter(Boolean).join(' · ')}</p>
            </div>
            <div className="shrink-0 rounded-full border border-[#0e9f6e]/20 bg-[#0e9f6e]/10 px-3 py-1.5 text-right"><span className="block whitespace-nowrap text-sm font-semibold tabular-nums tracking-[-0.02em] text-[#0b7a55]">{aed(l.price_aed)}</span>{l.purpose === 'rent' && <span className="block text-[9.5px] font-medium uppercase tracking-[0.12em] text-[#0b7a55]/75">/ yr</span>}</div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 divide-x divide-[#e5e5e5] border-t border-[#e5e5e5] pt-4 text-[12px] text-[#4a4a4a]">
          <span className="flex items-center gap-1.5"><BedDouble size={14} className="text-[#8b8b8b]" />{beds(l)}</span>
          <span className="flex items-center justify-center gap-1.5"><Bath size={14} className="text-[#8b8b8b]" />{l.bathrooms ?? 0} Baths</span>
          <span className="flex items-center justify-end gap-1.5"><Expand size={14} className="text-[#8b8b8b]" />{(l.area_sqft ?? 0).toLocaleString('en-US')} ft²</span>
        </div>
      </div>
    </article>
  )
}

function PromoCard({ p, onToggle }: { p: Promo; onToggle: () => void }) {
  return (
    <article className={`web-card hoverable flex overflow-hidden ${p.active ? '' : 'opacity-60'}`}>
      <div className="relative w-40 shrink-0 bg-[#e7f2f9] sm:w-52">{p.image && <img src={websiteImage(p.image)} alt="" loading="lazy" className="size-full object-cover" />}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-5">
        <div className="web-eyebrow truncate">{p.eyebrow || p.tab}</div>
        <Link to={`/e/website_promotions/${p.id}`} className="text-[17px] font-medium leading-tight tracking-[-0.025em] text-[#121212] no-underline hover:text-[#0e9f6e]">{p.title}</Link>
        <div className="text-[13px] text-[#4a4a4a]">{[p.price_guide, p.plan_highlight].filter(Boolean).join(' · ')}</div>
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
  const [tab, setTab] = useState<'inventory' | 'promotions'>('inventory')
  const [term, setTerm] = useState('')
  const [purpose, setPurpose] = useState<'all' | 'buy' | 'rent' | 'off-plan' | 'hot' | 'hidden'>('all')
  const [deploying, setDeploying] = useState(false)
  const [share, setShare] = useState<Listing | null>(null)
  const listingsQ = useQuery({ queryKey: ['website', 'listings'], queryFn: () => get<{ rows: Listing[] }>('/api/e/website_listings', { pageSize: 1000, sort: 'sort_order', dir: 'asc' }) })
  const promosQ = useQuery({ queryKey: ['website', 'promotions'], queryFn: () => get<{ rows: Promo[] }>('/api/e/website_promotions', { pageSize: 200, sort: 'sort_order', dir: 'asc' }) })
  const statusQ = useQuery({ queryKey: ['website', 'status'], queryFn: () => get<Status>('/api/website/status') })
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
      toast.ok(r.status === 'unchanged' ? 'Website already up to date — nothing to deploy' : `Deployed: ${r.listings} listings, ${r.promotions} promotions. The live site updates in a few minutes.`)
      refresh()
    } catch (e: any) { toast.error(e.message) } finally { setDeploying(false) }
  }

  const st = statusQ.data
  const canEdit = can('website', 'edit')
  return (
    <div className="mx-auto max-w-[1260px]">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="web-eyebrow">swkpropertiesuae.com · Owner & Admin</div>
          <h1 className="web-title">Website studio</h1>
          <p className="web-lead">Add inventory, promote hot offers and run the Trending spotlight from SWK OS, then publish to the live website in one step.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a href={WEBSITE_URL} target="_blank" rel="noopener noreferrer" className="web-btn light"><Globe size={14} /> Open website</a>
          <button type="button" onClick={() => void downloadAuthFile('/api/website/export.json', 'website-export.json').catch(e => toast.error(e.message))} className="web-btn light"><Download size={14} /> Download data</button>
          {canEdit && <button type="button" className="web-btn" onClick={() => void deploy()} disabled={deploying || !st?.config.tokenSet}><Rocket size={14} /> {deploying ? 'Deploying…' : 'Publish & deploy'}</button>}
        </div>
      </header>

      <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[['On website', st?.published ?? '—'], ['Hot offers', st?.hot ?? '—'], ['Spotlight deals', st?.promotions ?? '—'], ['Hidden', rows.filter(r => !r.published).length]].map(([l, v]) => (
          <div key={String(l)} className="web-card p-5"><div className="web-eyebrow">{l}</div><div className="web-stat mt-3">{v}</div></div>
        ))}
      </section>

      <section className="web-card mb-8 flex flex-wrap items-center gap-4 p-5" aria-live="polite">
        {st?.config.tokenSet ? <CheckCircle2 size={20} className="text-[#0e9f6e]" /> : <AlertTriangle size={20} className="text-[#b45309]" />}
        <div className="min-w-0 flex-1 text-[13.5px] text-[#4a4a4a]">
          {st?.config.tokenSet
            ? <>Connected to <b className="text-[#121212]">{st.config.repo}</b> · branch <b className="text-[#121212]">{st.config.branch}</b>. Publishing commits the inventory to the website, which redeploys automatically{st.config.hookSet ? ' (deploy hook also called)' : ''}.</>
            : <>Deploy is not connected yet. Ask the server admin to set <code>WEBSITE_GITHUB_TOKEN</code> (GitHub token with Contents read &amp; write on {st?.config.repo ?? 'the website repo'}). You can keep editing; changes go live on the first deploy.</>}
          {st?.problems.length ? <div className="mt-1 text-[#b45309]">Needs attention: {st.problems.slice(0, 3).join(' · ')}</div> : null}
        </div>
        {st?.last && <div className="flex items-center gap-2 text-[12px] text-[#737373]"><GitCommitHorizontal size={15} />Last: {st.last.status} {new Date(st.last.at).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' })}{st.last.by ? ` · ${st.last.by}` : ''}{st.last.url && <a href={st.last.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-[#121212] hover:text-[#0e9f6e]">commit <ArrowUpRight size={12} /></a>}</div>}
      </section>

      <div className="mb-6 flex flex-wrap items-center gap-2" role="tablist" aria-label="Website content">
        <button role="tab" aria-selected={tab === 'inventory'} className={tab === 'inventory' ? 'web-btn' : 'web-btn light'} style={{ height: 38 }} onClick={() => setTab('inventory')}>Inventory ({rows.length})</button>
        <button role="tab" aria-selected={tab === 'promotions'} className={tab === 'promotions' ? 'web-btn' : 'web-btn light'} style={{ height: 38 }} onClick={() => setTab('promotions')}>Trending spotlight ({promosQ.data?.rows.length ?? 0})</button>
        <div className="flex-1" />
        {canEdit && <Link to={tab === 'inventory' ? '/e/website_listings?new=1' : '/e/website_promotions?new=1'} className="web-btn"><Plus size={14} /> {tab === 'inventory' ? 'Add listing' : 'Add promotion'}</Link>}
      </div>

      {tab === 'inventory' ? (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <label className="relative min-w-[220px] flex-1">
              <span className="sr-only">Search inventory</span>
              <Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8b8b8b]" />
              <input className="input" style={{ paddingLeft: 40, borderRadius: 999, height: 44 }} placeholder="Search title, reference, community, developer…" value={term} onChange={e => setTerm(e.target.value)} />
            </label>
            {([['all', 'All'], ['buy', 'Buy'], ['rent', 'Rent'], ['off-plan', 'Off-plan'], ['hot', 'Hot offers'], ['hidden', 'Hidden']] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={purpose === k} onClick={() => setPurpose(k)} className={`web-pill ${purpose === k ? 'mint' : ''}`} style={{ height: 34, border: 0, cursor: 'pointer' }}>{l}</button>
            ))}
          </div>
          {listingsQ.isLoading ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-[380px]" />)}</div>
            : !shown.length ? <div className="web-card p-12 text-center text-[#4a4a4a]">No listings match. {canEdit && <Link to="/e/website_listings?new=1" className="link">Add one</Link>}</div>
            : <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{shown.map(l => <ListingCard key={l.id} l={l} onShare={() => setShare(l)} onToggle={f => void toggle('website_listings', l.id, l.version, f, !l[f])} />)}</div>}
        </>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {(promosQ.data?.rows ?? []).map(p => <PromoCard key={p.id} p={p} onToggle={() => void toggle('website_promotions', p.id, p.version, 'active', !p.active)} />)}
          <p className="text-[12.5px] text-[#737373] lg:col-span-2">Hot-offer listings are added to the spotlight automatically on deploy, ahead of these promotions.</p>
        </div>
      )}
      {share && <ShareWithClient entity="website_listings" ids={[share.id]} label={share.title} onClose={() => setShare(null)} />}
    </div>
  )
}
