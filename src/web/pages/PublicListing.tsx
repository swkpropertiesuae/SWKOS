import { useEffect,useState } from 'react'
import { useParams } from 'react-router-dom'
import { Bath,BedDouble,CheckCircle2,ChevronLeft,ChevronRight,Expand,MapPin,Phone } from 'lucide-react'

type Item = { title: string; subtitle?: string; purpose: string; status?: string; type?: string; location?: string; developer?: string; price_label: string; beds?: number | null; baths?: number | null; area?: number | null; furnishing?: string; completion?: string; payment_plan?: string; description: string[]; features: string[]; images: string[]; reference?: string; floor_plan?: string; tour?: string }
type Data = { title: string | null; client_name: string | null; expires_at: string; items: Item[]; agent: { name: string; title: string; phone: string; email: string; photo: string | null } | null; company: { name: string; orn: string; address: string; phone: string; website: string } }

const wa = (phone: string, text: string) => `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`

function Gallery({ images, title }: { images: string[]; title: string }) {
  const [i, setI] = useState(0)
  if (!images.length) return <div className="grid aspect-[16/10] place-items-center rounded-2xl bg-[#e7f2f9] text-[13px] text-[#8b8b8b]">Photos on request</div>
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#e7f2f9]">
      <img src={images[i]} alt={`${title}, photo ${i + 1} of ${images.length}`} className="aspect-[16/10] w-full object-cover" />
      {images.length > 1 && <>
        <button type="button" aria-label="Previous photo" onClick={() => setI((i - 1 + images.length) % images.length)} className="absolute left-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-white/90 text-[#121212] shadow"><ChevronLeft size={18} /></button>
        <button type="button" aria-label="Next photo" onClick={() => setI((i + 1) % images.length)} className="absolute right-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-white/90 text-[#121212] shadow"><ChevronRight size={18} /></button>
        <span className="absolute bottom-3 right-3 rounded-full bg-[#0b1623]/80 px-3 py-1 text-[11px] text-white">{i + 1} / {images.length}</span>
      </>}
    </div>
  )
}

/** Public client listing page (/l/<token>) in the swkpropertiesuae.com style. No sign-in; only client-safe fields arrive from the server. */
export function PublicListing() {
  const { token = '' } = useParams()
  const [data, setData] = useState<Data | null>(null), [err, setErr] = useState('')
  const [form, setForm] = useState({ name: '', phone: '', email: '', message: '', item: '' }), [sent, setSent] = useState(false), [busy, setBusy] = useState(false)
  useEffect(() => { fetch(`/api/public/share/${encodeURIComponent(token)}`).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setData(j); document.title = `${j.title || 'Properties selected for you'} | SWK Properties` }).catch(e => setErr(e.message || 'Link not found')) }, [token])
  const enquire = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true)
    try { const r = await fetch(`/api/public/share/${encodeURIComponent(token)}/enquiry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...form, consent: true }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setSent(true) } catch (er: any) { alert(er.message) } finally { setBusy(false) }
  }
  const bg = { background: 'linear-gradient(135deg, #eef8fd 0%, #d4effc 48%, #f5fbff 100%)' }
  if (err) return <div className="grid min-h-screen place-items-center p-6 text-center" style={bg}><div className="web-card max-w-md p-10"><img src="/brand/web/swk-logo-light.webp" alt="SWK Properties" className="mx-auto h-14" /><h1 className="web-title" style={{ fontSize: 26 }}>Link unavailable</h1><p className="text-[#4a4a4a]">{err}</p><a className="web-btn mt-4" href="https://www.swkpropertiesuae.com">Visit swkpropertiesuae.com</a></div></div>
  if (!data) return <div className="grid min-h-screen place-items-center" style={bg}><span className="text-[#8b8b8b]">Loading…</span></div>
  const a = data.agent
  return (
    <div className="min-h-screen" style={bg}>
      <header className="sticky top-0 z-20 border-b border-white/60 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-[1180px] items-center gap-3 px-4 sm:px-8">
          <img src="/brand/web/swk-icon-192.webp" alt="" className="size-11" /><img src="/brand/web/swk-logo-light.webp" alt="SWK Properties" className="h-10" />
          <span className="ml-auto hidden text-[10px] font-medium uppercase tracking-[0.22em] text-[#8b8b8b] sm:inline">RERA ORN {data.company.orn}</span>
          {a && <a className="web-btn ml-auto sm:ml-4" style={{ height: 40 }} href={wa(a.phone, `Hello ${a.name}, I am viewing the properties you shared.`)} target="_blank" rel="noopener noreferrer">WhatsApp {a.name.split(' ')[0]}</a>}
        </div>
      </header>
      <main className="mx-auto max-w-[1180px] px-4 pb-16 pt-10 sm:px-8">
        <div className="web-eyebrow">{data.client_name ? `Prepared for ${data.client_name}` : 'Selected for you'} · {data.items.length} {data.items.length === 1 ? 'property' : 'properties'}</div>
        <h1 className="web-title">{data.title || 'Properties selected for you'}</h1>
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-10">
            {data.items.map((it, n) => (
              <article key={n} className="web-card overflow-hidden p-4 sm:p-6">
                <Gallery images={it.images} title={it.title} />
                <div className="mt-5 flex flex-wrap items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-2"><span className="web-pill mint">{it.purpose}</span>{it.type && <span className="web-pill">{it.type}</span>}{it.reference && <span className="web-pill">Ref {it.reference}</span>}</div>
                    <h2 className="m-0 mt-3 text-[24px] font-medium leading-tight tracking-[-0.03em]">{it.title}</h2>
                    {it.location && <p className="m-0 mt-1 flex items-center gap-1.5 text-[13.5px] text-[#4a4a4a]"><MapPin size={14} />{it.location}{it.developer ? ` · ${it.developer}` : ''}</p>}
                  </div>
                  {it.price_label && <div className="rounded-full border border-[#0e9f6e]/20 bg-[#0e9f6e]/10 px-4 py-2 text-[17px] font-semibold tabular-nums text-[#0b7a55]">{it.price_label}</div>}
                </div>
                <div className="mt-5 grid grid-cols-3 divide-x divide-[#e5e5e5] rounded-2xl border border-[#e5e5e5] py-3 text-center text-[13px]">
                  <span className="flex items-center justify-center gap-1.5"><BedDouble size={15} className="text-[#8b8b8b]" />{it.type === 'Office' ? 'Commercial' : it.beds ? `${it.beds} Beds` : 'Studio'}</span>
                  <span className="flex items-center justify-center gap-1.5"><Bath size={15} className="text-[#8b8b8b]" />{it.baths ?? '—'} Baths</span>
                  <span className="flex items-center justify-center gap-1.5"><Expand size={15} className="text-[#8b8b8b]" />{it.area ? `${Number(it.area).toLocaleString('en-US')} ft²` : '—'}</span>
                </div>
                {(it.furnishing || it.completion || it.payment_plan) && <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3">{[['Furnishing', it.furnishing], ['Completion', it.completion], ['Payment plan', it.payment_plan]].filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="text-[10.5px] uppercase tracking-[0.14em] text-[#8b8b8b]">{k}</dt><dd className="m-0 mt-0.5 font-medium">{v}</dd></div>)}</dl>}
                {it.description.length > 0 && <div className="mt-5 space-y-2 text-[14px] leading-relaxed text-[#4a4a4a]">{it.description.map((d, k) => <p key={k} className="m-0">{d}</p>)}</div>}
                {it.features.length > 0 && <ul className="m-0 mt-5 grid list-none gap-2 p-0 sm:grid-cols-2">{it.features.map(f => <li key={f} className="flex items-center gap-2 text-[13.5px]"><CheckCircle2 size={15} className="text-[#0e9f6e]" />{f}</li>)}</ul>}
                <div className="mt-6 flex flex-wrap gap-2">
                  <button type="button" className="web-btn" onClick={() => { setForm(f => ({ ...f, item: it.title })); document.getElementById('enquire')?.scrollIntoView({ behavior: 'smooth' }) }}>Enquire about this</button>
                  {it.floor_plan && <a className="web-btn light" href={it.floor_plan} target="_blank" rel="noopener noreferrer">Floor plan</a>}
                  {it.tour && <a className="web-btn light" href={it.tour} target="_blank" rel="noopener noreferrer">Virtual tour</a>}
                </div>
              </article>
            ))}
          </div>
          <aside className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
            {a && <div className="web-card p-6 text-center">
              <span className="mx-auto flex size-24 items-center justify-center overflow-hidden rounded-full bg-[#121212] text-2xl font-semibold text-[#51fec0]">{a.photo ? <img src={a.photo} alt="" className="size-full object-cover object-top" /> : a.name.split(' ').map(x => x[0]).slice(0, 2).join('')}</span>
              <div className="mt-3 text-[18px] font-medium">{a.name}</div><div className="text-[10.5px] uppercase tracking-[0.16em] text-[#8b8b8b]">{a.title}</div>
              <div className="mt-4 grid gap-2"><a className="web-btn" href={wa(a.phone, `Hello ${a.name}, I am interested in the properties you shared.`)} target="_blank" rel="noopener noreferrer">WhatsApp</a><a className="web-btn light" href={`tel:${a.phone.replace(/\s/g, '')}`}><Phone size={14} /> Call</a></div>
            </div>}
            <form id="enquire" onSubmit={e => void enquire(e)} className="web-card grid gap-3 p-6">
              <div className="web-eyebrow">Request details or a viewing</div>
              {sent ? <p className="m-0 text-[14px] text-[#0b7a55]">Thank you. {a?.name.split(' ')[0] ?? 'Your consultant'} will contact you shortly.</p> : <>
                <input className="input" required minLength={2} placeholder="Your name" aria-label="Your name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                <input className="input" required type="tel" placeholder="Phone / WhatsApp" aria-label="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                <input className="input" type="email" placeholder="E-mail (optional)" aria-label="E-mail" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                {form.item && <div className="text-[12px] text-[#4a4a4a]">About: <b>{form.item}</b></div>}
                <textarea className="textarea" placeholder="Message (optional)" aria-label="Message" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
                <button className="web-btn" disabled={busy}>Send enquiry</button>
                <p className="m-0 text-[11px] text-[#8b8b8b]">By sending you agree that SWK Properties may contact you about these properties.</p>
              </>}
            </form>
          </aside>
        </div>
      </main>
      <footer className="border-t border-white/60 bg-[#121212] py-8 text-center text-[12px] text-white/70">
        <img src="/brand/web/swk-logo-dark.webp" alt="SWK Properties" className="mx-auto mb-3 h-12" />
        {data.company.name} · RERA ORN {data.company.orn} · {data.company.address}<br />{data.company.phone} · <a href={data.company.website} className="text-[#51fec0]">swkpropertiesuae.com</a>
      </footer>
    </div>
  )
}
