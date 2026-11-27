import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Award,
  Bath,
  BedDouble,
  Building2,
  Calculator,
  Calendar,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Expand,
  ExternalLink,
  Layers,
  MapPin,
  Maximize2,
  Phone,
  Printer,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { resolveApiUrl } from '../lib/api'
import { MediaTour3DEmbed } from '../components/AuthMedia'
import { Property3DViewer } from '../components/brochure/Property3DViewer'
import { PropertyVideoTour } from '../components/brochure/PropertyVideoTour'

type SharedAsset = { kind: string; title: string; category?: string; mime?: string; url: string }

type Item = {
  id?: number
  title: string
  subtitle?: string
  purpose: string
  status?: string
  type?: string
  location?: string
  community?: string
  building_name?: string
  developer?: string
  price?: number
  price_label: string
  price_per_sqft?: number | null
  beds?: number | null
  baths?: number | null
  area?: number | null
  furnishing?: string
  tenure?: string
  completion?: string
  year_built?: number | null
  floor_no?: string | null
  parking_slots?: number | null
  view?: string | null
  payment_plan?: string
  rera_permit_no?: string | null
  roi_percent?: number | null
  is_off_plan?: boolean
  watermarked?: boolean
  description: string[]
  features: string[]
  images: string[]
  reference?: string
  floor_plan?: string
  tour?: string
  model_3d_url?: string
  brochure_url?: string
  ppt_url?: string
  payment_plan_pdf_url?: string
  video_url?: string
  videos?: SharedAsset[]
  tours3d?: SharedAsset[]
  floor_plans?: SharedAsset[]
  brochures?: SharedAsset[]
}

type Data = {
  title: string | null
  client_name: string | null
  expires_at: string
  items: Item[]
  agent: { name: string; title: string; phone: string; email: string; photo: string | null } | null
  company: { name: string; orn: string; trade_license?: string; address: string; phone: string; website: string }
}

const wa = (phone: string, text: string) => `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
const fmtAed = (n: number) => `AED ${Math.round(n).toLocaleString('en-US')}`

function WatermarkedGallery({ images, title }: { images: string[]; title: string }) {
  const [i, setI] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const resolved = images.map(src => resolveApiUrl(src))

  if (!resolved.length) {
    return (
      <div className="grid aspect-[16/10] place-items-center rounded-3xl bg-[#0e1e2b] text-sm text-[#e5c07b]">
        SWK Private Portfolio Photography Available Upon Request
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      <div className="relative overflow-hidden rounded-3xl bg-[#0b1824] border border-[#d4a752]/25 shadow-lg group">
        <img
          src={resolved[i]}
          alt={`${title} — watermarked photo ${i + 1} of ${resolved.length}`}
          className="aspect-[16/10] w-full object-cover cursor-zoom-in"
          onClick={() => setLightbox(true)}
          onContextMenu={e => e.preventDefault()}
        />
        <div className="pointer-events-none absolute top-3.5 right-3.5 inline-flex items-center gap-1.5 rounded-full bg-[#0b1824]/80 border border-[#d4a752]/45 px-3 py-1 text-[11px] font-bold text-[#f3d27a] backdrop-blur-md">
          <ShieldCheck size={13} /> SWK Logo &amp; Crest Watermarked
        </div>
        <button
          type="button"
          aria-label="Open fullscreen gallery"
          onClick={() => setLightbox(true)}
          className="absolute bottom-3.5 left-3.5 inline-flex items-center gap-1.5 rounded-full bg-[#0b1824]/85 border border-white/20 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer hover:bg-[#d4a752] hover:text-[#0b1824] transition-colors"
        >
          <Maximize2 size={13} /> Fullscreen ({i + 1}/{resolved.length})
        </button>
        {resolved.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              onClick={() => setI((i - 1 + resolved.length) % resolved.length)}
              className="absolute left-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-[#0b1824]/80 text-white shadow-lg cursor-pointer hover:bg-[#d4a752] hover:text-[#0b1824] transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              aria-label="Next photo"
              onClick={() => setI((i + 1) % resolved.length)}
              className="absolute right-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-[#0b1824]/80 text-white shadow-lg cursor-pointer hover:bg-[#d4a752] hover:text-[#0b1824] transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}
      </div>

      {resolved.length > 1 && (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {resolved.map((src, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setI(idx)}
              className={`relative overflow-hidden rounded-xl border-2 p-0 cursor-pointer bg-transparent transition-all ${
                idx === i ? 'border-[#d4a752] ring-2 ring-[#d4a752]/30' : 'border-transparent opacity-70 hover:opacity-100'
              }`}
            >
              <img src={src} alt={`Thumbnail ${idx + 1}`} className="aspect-[16/10] w-full object-cover block" />
            </button>
          ))}
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-[#050b11]/95 backdrop-blur-xl flex flex-col items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close fullscreen gallery"
            onClick={() => setLightbox(false)}
            className="absolute top-5 right-5 grid size-11 place-items-center rounded-full bg-white/10 text-white border border-white/20 cursor-pointer hover:bg-white/20"
          >
            <X size={20} />
          </button>
          <img
            src={resolved[i]}
            alt={title}
            className="max-h-[82vh] max-w-[92vw] rounded-2xl object-contain shadow-2xl border border-[#d4a752]/30"
          />
          <div className="mt-4 flex items-center gap-4 text-white">
            <button type="button" onClick={() => setI((i - 1 + resolved.length) % resolved.length)} className="rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white border border-white/20 cursor-pointer">Previous</button>
            <span className="font-mono text-xs text-[#f3d27a]">{i + 1} / {resolved.length} · SWK Watermarked</span>
            <button type="button" onClick={() => setI((i + 1) % resolved.length)} className="rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white border border-white/20 cursor-pointer">Next</button>
          </div>
        </div>
      )}
    </div>
  )
}

function DubaiInvestmentCalculator({ price, purpose, roiPercent }: { price: number; purpose: string; roiPercent?: number | null }) {
  const [downPct, setDownPct] = useState(20)
  const [ratePct, setRatePct] = useState(4.25)
  const [years, setYears] = useState(25)

  const isRent = /rent/i.test(purpose)
  if (!price || price <= 0 || isRent) return null

  const downPayment = (price * downPct) / 100
  const loan = Math.max(0, price - downPayment)
  const r = ratePct / 100 / 12
  const n = years * 12
  const monthly = r > 0 ? (loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : loan / n
  const dldFee = price * 0.04
  const trusteeFee = price >= 500_000 ? 4200 : 2100
  const estYield = roiPercent && roiPercent > 0 ? roiPercent : 7.0
  const estAnnualRent = price * (estYield / 100)
  const goldenVisa = price >= 2_000_000

  return (
    <div className="rounded-3xl border border-[#e3d9c6] bg-white p-5 sm:p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#0b1f2a] text-[#f3d27a]">
            <Calculator size={17} />
          </span>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#8a621c]">DUBAI FINANCIAL ADVISORY</div>
            <h3 className="m-0 text-[17px] font-bold text-[#0b1f2a]">UAE Mortgage, DLD 4% Fee &amp; Yield Estimator</h3>
          </div>
        </div>
        {goldenVisa && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/40 px-3 py-1 text-xs font-bold text-amber-900">
            <Award size={14} className="text-amber-600" /> 10-Year UAE Golden Visa Eligible
          </span>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-5">
        <div>
          <div className="flex justify-between text-xs font-semibold text-[#334155] mb-1">
            <span>Down Payment</span><span className="font-mono">{downPct}% ({fmtAed(downPayment)})</span>
          </div>
          <input type="range" min={15} max={80} step={5} value={downPct} onChange={e => setDownPct(Number(e.target.value))} className="w-full accent-[#0b1f2a]" />
        </div>
        <div>
          <div className="flex justify-between text-xs font-semibold text-[#334155] mb-1">
            <span>Interest Rate</span><span className="font-mono">{ratePct.toFixed(2)}% p.a.</span>
          </div>
          <input type="range" min={3.25} max={7.5} step={0.25} value={ratePct} onChange={e => setRatePct(Number(e.target.value))} className="w-full accent-[#0b1f2a]" />
        </div>
        <div>
          <div className="flex justify-between text-xs font-semibold text-[#334155] mb-1">
            <span>Mortgage Tenure</span><span className="font-mono">{years} Years</span>
          </div>
          <input type="range" min={5} max={25} step={5} value={years} onChange={e => setYears(Number(e.target.value))} className="w-full accent-[#0b1f2a]" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-[#0b1f2a] p-4 text-white">
          <div className="text-[11px] uppercase tracking-wider text-slate-300 font-semibold">Est. Monthly Payment</div>
          <div className="mt-1 font-mono text-xl font-bold text-[#f3d27a]">{fmtAed(monthly)}</div>
          <div className="text-[11px] text-slate-300 mt-0.5">Loan {fmtAed(loan)}</div>
        </div>
        <div className="rounded-2xl bg-[#f8f5ef] border border-[#e6e0d4] p-4">
          <div className="text-[11px] uppercase tracking-wider text-[#64748b] font-semibold">DLD Transfer (4%)</div>
          <div className="mt-1 font-mono text-lg font-bold text-[#0b1f2a]">{fmtAed(dldFee)}</div>
          <div className="text-[11px] text-[#64748b] mt-0.5">+ Trustee fee {fmtAed(trusteeFee)}</div>
        </div>
        <div className="rounded-2xl bg-[#f8f5ef] border border-[#e6e0d4] p-4">
          <div className="text-[11px] uppercase tracking-wider text-[#64748b] font-semibold">Est. Gross Rental Yield</div>
          <div className="mt-1 font-mono text-lg font-bold text-emerald-700">{estYield.toFixed(1)}% / yr</div>
          <div className="text-[11px] text-[#64748b] mt-0.5">~{fmtAed(estAnnualRent)} annual rent</div>
        </div>
        <div className="rounded-2xl bg-[#f8f5ef] border border-[#e6e0d4] p-4">
          <div className="text-[11px] uppercase tracking-wider text-[#64748b] font-semibold">Total Upfront Cash</div>
          <div className="mt-1 font-mono text-lg font-bold text-[#0b1f2a]">{fmtAed(downPayment + dldFee + trusteeFee)}</div>
          <div className="text-[11px] text-[#64748b] mt-0.5">Down payment + DLD + Trustee</div>
        </div>
      </div>
    </div>
  )
}

/**
 * World-Class SWK Luxury Property Brochure (/l/<token>).
 * Every image is strictly server-watermarked with BOTH SWK Logo & App Icon.
 * Includes interactive 3D Architectural Viewer, Guided Voice-Narrated Cinema Video Tour,
 * UAE Mortgage/DLD/Golden Visa Calculator, and Private Office Concierge.
 */
export function PublicListing() {
  const { token = '' } = useParams()
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [form, setForm] = useState({ name: '', phone: '', email: '', message: '', item: '' })
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch(resolveApiUrl(`/api/public/share/${encodeURIComponent(token)}`))
      .then(async r => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error)
        setData(j)
        document.title = `${j.title || 'Private Property Dossier'} | SWK Properties Dubai`
      })
      .catch(e => setErr(e.message || 'Brochure link not found'))
  }, [token])

  const enquire = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const r = await fetch(resolveApiUrl(`/api/public/share/${encodeURIComponent(token)}/enquiry`), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...form, consent: true }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      setSent(true)
    } catch (er: any) {
      alert(er.message)
    } finally {
      setBusy(false)
    }
  }

  const pageBg = { background: 'linear-gradient(180deg, #faf7f0 0%, #f2ece0 55%, #f9f6ef 100%)' }

  if (err) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center" style={pageBg}>
        <div className="max-w-md rounded-3xl border border-[#e3d9c6] bg-white p-10 shadow-xl">
          <img src="/brand/swk-app-icon-rounded.png" alt="SWK Properties" className="mx-auto h-16 w-16 rounded-2xl shadow-md mb-4" />
          <h1 className="m-0 text-2xl font-bold text-[#0b1f2a]">Brochure Link Unavailable</h1>
          <p className="mt-2 text-sm text-[#475569]">{err}</p>
          <a className="btn green mt-5 no-underline" href="https://www.swkpropertiesuae.com">Visit SWK Properties Dubai</a>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#0b1824] text-white">
        <div className="text-center">
          <img src="/brand/swk-app-icon-rounded.png" alt="" className="mx-auto h-16 w-16 rounded-2xl shadow-lg mb-4 animate-pulse" />
          <div className="text-xs font-bold uppercase tracking-[0.22em] text-[#f3d27a]">PREPARING SWK LUXURY BROCHURE…</div>
        </div>
      </div>
    )
  }

  const a = data.agent
  const leadItem = data.items[0]
  const heroBg = leadItem?.images?.[0] ? resolveApiUrl(leadItem.images[0]) : '/brand/web/uae-skyline-flagship.webp'
  const totalPortfolioValue = data.items.reduce((s, it) => s + (Number(it.price) || 0), 0)

  return (
    <div className="min-h-screen text-[#0f172a]" style={pageBg}>
      {/* Sticky Luxury Concierge Header */}
      <header className="no-print sticky top-0 z-30 border-b border-[#d4a752]/25 bg-[#0b1824]/92 backdrop-blur-xl text-white">
        <div className="mx-auto flex h-[74px] max-w-[1320px] items-center justify-between gap-3 px-4 sm:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/brand/swk-app-icon-rounded.png" alt="SWK Crest" className="size-10 rounded-xl shadow-md border border-[#d4a752]/40 shrink-0" />
            <div className="min-w-0">
              <img src="/brand/web/swk-logo-dark.webp" alt="SWK Properties" className="h-7 object-contain block" />
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#f3d27a] mt-0.5">
                PRIVATE OFFICE · RERA ORN {data.company.orn}
              </div>
            </div>
          </div>

          <nav className="hidden lg:flex items-center gap-1.5 text-xs font-semibold">
            <a href="#portfolio" className="rounded-full px-3 py-1.5 text-white/85 no-underline hover:bg-white/10">Portfolio</a>
            <a href="#model-3d-0" className="rounded-full px-3 py-1.5 text-white/85 no-underline hover:bg-white/10">3D Model</a>
            <a href="#video-tour-0" className="rounded-full px-3 py-1.5 text-white/85 no-underline hover:bg-white/10">Video Tour</a>
            <a href="#enquire" className="rounded-full px-3 py-1.5 text-white/85 no-underline hover:bg-white/10">Private Viewing</a>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => window.print()}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white cursor-pointer hover:bg-white/20"
            >
              <Printer size={14} /> Print PDF
            </button>
            {a && (
              <a
                href={wa(a.phone, `Hello ${a.name}, I am reviewing the SWK Private Brochure (${data.title || 'Selected Properties'}).`)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#d4a752] px-4 py-2 text-xs font-extrabold text-[#0b1824] no-underline hover:bg-[#e5be6d]"
              >
                WhatsApp {a.name.split(' ')[0]}
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Full-Bleed Architectural Cover Hero */}
      <section className="relative overflow-hidden bg-[#0b1824] text-white">
        <img src={heroBg} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-40 scale-[1.02]" />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(11,24,36,0.72) 0%, rgba(11,24,36,0.62) 45%, rgba(11,24,36,0.96) 100%)' }}
        />
        <div className="relative z-10 mx-auto max-w-[1320px] px-4 sm:px-8 py-14 sm:py-20">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#d4a752]/50 bg-[#d4a752]/15 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-[#f3d27a]">
            <Sparkles size={13} />
            {data.client_name ? `PRIVATELY CURATED FOR ${data.client_name.toUpperCase()}` : 'SWK PRIVATE CLIENT BROCHURE'}
          </div>
          <h1 className="mt-4 max-w-4xl text-3xl sm:text-5xl font-bold tracking-[-0.03em] text-white leading-[1.08]">
            {data.title || leadItem?.title || 'Curated Dubai Luxury Residences'}
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] sm:text-[16px] text-slate-200 leading-relaxed">
            Exclusive portfolio presentation featuring verified watermarked photography, interactive 3D architectural representation, guided voice-narrated cinema tour, and live DLD financial projections.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3 max-w-2xl">
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-md">
              <div className="text-[10.5px] uppercase tracking-[0.16em] text-[#f3d27a] font-bold">Curated Residences</div>
              <div className="mt-1 font-mono text-2xl font-bold">{data.items.length} {data.items.length === 1 ? 'Property' : 'Properties'}</div>
            </div>
            {totalPortfolioValue > 0 && (
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-md">
                <div className="text-[10.5px] uppercase tracking-[0.16em] text-[#f3d27a] font-bold">Portfolio Value</div>
                <div className="mt-1 font-mono text-2xl font-bold">{fmtAed(totalPortfolioValue)}</div>
              </div>
            )}
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-md">
              <div className="text-[10.5px] uppercase tracking-[0.16em] text-[#f3d27a] font-bold">Brokerage Assurance</div>
              <div className="mt-1 font-mono text-lg font-bold">RERA ORN {data.company.orn}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Brochure Content + Sticky Advisor Concierge */}
      <main id="portfolio" className="mx-auto max-w-[1320px] px-4 sm:px-8 py-10 sm:py-14">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_350px] items-start">
          <div className="flex flex-col gap-12 min-w-0">
            {data.items.map((it, idx) => {
              const sqm = it.area ? Math.round(Number(it.area) * 0.092903) : null
              return (
                <article key={idx} className="rounded-[32px] border border-[#e3d9c6] bg-white/95 p-5 sm:p-8 shadow-[0_24px_64px_-32px_rgba(11,31,42,0.22)] flex flex-col gap-7">
                  {/* Top Title & Price Bar */}
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#ece5d8] pb-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#0b1f2a] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#f3d27a]">{it.purpose}</span>
                        {it.type && <span className="rounded-full bg-[#f4efe4] border border-[#e3d9c6] px-3 py-1 text-[11px] font-bold text-[#0b1f2a]">{it.type}</span>}
                        {it.reference && <span className="rounded-full bg-[#f8f5ef] border border-[#e3d9c6] px-3 py-1 font-mono text-[11px] font-semibold text-[#475569]">REF {it.reference}</span>}
                        {it.rera_permit_no && <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 font-mono text-[11px] font-semibold text-emerald-800">Trakheesi {it.rera_permit_no}</span>}
                      </div>
                      <h2 className="m-0 mt-3 text-2xl sm:text-3xl font-bold tracking-[-0.025em] text-[#0b1f2a]">{it.title}</h2>
                      {it.location && (
                        <p className="m-0 mt-1.5 flex items-center gap-1.5 text-[14.5px] text-[#475569]">
                          <MapPin size={15} className="text-[#b78328] shrink-0" />
                          <span>{it.location}{it.developer ? ` · Developed by ${it.developer}` : ''}</span>
                        </p>
                      )}
                    </div>
                    {it.price_label && (
                      <div className="rounded-2xl border border-[#d4a752]/40 bg-gradient-to-br from-[#0b1f2a] to-[#143040] px-5 py-3 text-right text-white shadow-md">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#f3d27a]">Asking Price</div>
                        <div className="font-mono text-2xl font-bold tracking-tight mt-0.5">{it.price_label}</div>
                        {it.price_per_sqft && (
                          <div className="font-mono text-[11.5px] text-slate-300 mt-0.5">AED {it.price_per_sqft.toLocaleString('en-US')} / sq ft</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 1. Server-Watermarked Gallery */}
                  <WatermarkedGallery images={it.images} title={it.title} />

                  {/* 2. Complete Architectural Specs Matrix */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <SpecBox icon={<BedDouble size={16} />} label="Bedrooms" value={it.type === 'Office' ? 'Commercial' : it.beds ? `${it.beds} Bedrooms` : 'Studio'} />
                    <SpecBox icon={<Bath size={16} />} label="Bathrooms" value={it.baths ? `${it.baths} Bathrooms` : 'En-suite'} />
                    <SpecBox icon={<Expand size={16} />} label="Built-Up Area" value={it.area ? `${Number(it.area).toLocaleString('en-US')} ft²${sqm ? ` (${sqm} m²)` : ''}` : 'On Request'} />
                    <SpecBox icon={<Building2 size={16} />} label="Tenure & Status" value={[it.tenure || 'Freehold', it.completion ? `Handover ${it.completion}` : it.status].filter(Boolean).join(' · ')} />
                    {it.furnishing && <SpecBox icon={<Layers size={16} />} label="Furnishing" value={it.furnishing} />}
                    {it.floor_no && <SpecBox icon={<Compass size={16} />} label="Floor Level" value={`Floor ${it.floor_no}`} />}
                    {it.parking_slots && <SpecBox icon={<Car size={16} />} label="Parking" value={`${it.parking_slots} Covered Bay${it.parking_slots > 1 ? 's' : ''}`} />}
                    {it.payment_plan && <SpecBox icon={<Calendar size={16} />} label="Payment Plan" value={it.payment_plan} />}
                  </div>

                  {/* 3. Architectural Editorial & Features */}
                  {(it.description.length > 0 || it.features.length > 0) && (
                    <div className="grid gap-6 md:grid-cols-12">
                      {it.description.length > 0 && (
                        <div className={it.features.length > 0 ? 'md:col-span-7' : 'md:col-span-12'}>
                          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8a621c] mb-2">RESIDENCE NARRATIVE</div>
                          <div className="space-y-3 text-[15px] leading-[1.7] text-[#334155]">
                            {it.description.map((para, k) => <p key={k} className="m-0">{para}</p>)}
                          </div>
                        </div>
                      )}
                      {it.features.length > 0 && (
                        <div className={it.description.length > 0 ? 'md:col-span-5' : 'md:col-span-12'}>
                          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8a621c] mb-2.5">SIGNATURE AMENITIES &amp; HIGHLIGHTS</div>
                          <ul className="m-0 p-0 list-none grid gap-2">
                            {it.features.map(f => (
                              <li key={f} className="flex items-center gap-2.5 rounded-xl bg-[#f8f5ef] border border-[#ebe3d3] px-3 py-2 text-[13.5px] font-medium text-[#0b1f2a]">
                                <CheckCircle2 size={15} className="text-[#0e9f6e] shrink-0" />
                                <span>{f}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 4. Interactive 3D & 360° Experience (Live Developer 3D Tour + SWK Architectural Cutaway) */}
                  <div id={`model-3d-${idx}`} className="flex flex-col gap-4">
                    {(it.tour || it.model_3d_url) && (
                      <div className="rounded-3xl overflow-hidden border border-[#d4a752]/35 bg-[#0b1824] p-3 shadow-xl">
                        <div className="px-2 pb-2.5 flex items-center justify-between gap-2 text-white">
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#f3d27a]">INTERACTIVE 360° / 3D PROJECT TOUR</div>
                            <div className="text-sm font-semibold">{it.title}</div>
                          </div>
                        </div>
                        <MediaTour3DEmbed url={resolveApiUrl((it.tour || it.model_3d_url)!)} title={it.title} />
                      </div>
                    )}
                    <Property3DViewer
                      title={it.title}
                      type={it.type}
                      beds={it.beds}
                      baths={it.baths}
                      area={it.area}
                      floorNo={it.floor_no}
                      location={it.location}
                    />
                  </div>

                  {/* 5. Guided Cinema Video & Voice Narration Tour */}
                  <div id={`video-tour-${idx}`}>
                    <PropertyVideoTour
                      title={it.title}
                      purpose={it.purpose}
                      location={it.location}
                      developer={it.developer}
                      priceLabel={it.price_label}
                      price={it.price}
                      beds={it.beds}
                      baths={it.baths}
                      area={it.area}
                      paymentPlan={it.payment_plan}
                      features={it.features}
                      images={it.images.map(src => resolveApiUrl(src))}
                      videoUrl={it.video_url ? resolveApiUrl(it.video_url) : undefined}
                      advisorName={a?.name}
                    />
                  </div>

                  {/* 6. Live UAE Mortgage, DLD 4% Fee & Yield Estimator */}
                  {it.price && <DubaiInvestmentCalculator price={it.price} purpose={it.purpose} roiPercent={it.roi_percent} />}

                  {/* Action Buttons */}
                  <div className="no-print flex flex-wrap items-center gap-3 pt-2 border-t border-[#ece5d8]">
                    <button
                      type="button"
                      onClick={() => {
                        setForm(f => ({ ...f, item: it.title }))
                        document.getElementById('enquire')?.scrollIntoView({ behavior: 'smooth' })
                      }}
                      className="btn green"
                    >
                      Book Private Viewing
                    </button>
                    {it.floor_plan && (
                      <a href={resolveApiUrl(it.floor_plan)} target="_blank" rel="noopener noreferrer" className="btn outline no-underline">
                        <ExternalLink size={14} /> Official Floor Plan
                      </a>
                    )}
                    {it.brochure_url && (
                      <a href={resolveApiUrl(it.brochure_url)} target="_blank" rel="noopener noreferrer" className="btn outline no-underline">
                        <ExternalLink size={14} /> Official Brochure PDF
                      </a>
                    )}
                    {it.payment_plan_pdf_url && (
                      <a href={resolveApiUrl(it.payment_plan_pdf_url)} target="_blank" rel="noopener noreferrer" className="btn outline no-underline">
                        <ExternalLink size={14} /> Payment Plan PDF
                      </a>
                    )}
                    {it.ppt_url && (
                      <a href={resolveApiUrl(it.ppt_url)} target="_blank" rel="noopener noreferrer" className="btn outline no-underline">
                        <ExternalLink size={14} /> Presentation Deck (.PPTX)
                      </a>
                    )}
                    {it.tour && (
                      <a href={resolveApiUrl(it.tour)} target="_blank" rel="noopener noreferrer" className="btn outline no-underline">
                        <ExternalLink size={14} /> Open 360° / 3D Tour
                      </a>
                    )}
                    {it.model_3d_url && (
                      <a href={resolveApiUrl(it.model_3d_url)} target="_blank" rel="noopener noreferrer" className="btn outline no-underline">
                        <ExternalLink size={14} /> Download 3D Model (.glb)
                      </a>
                    )}
                  </div>
                </article>
              )
            })}
          </div>

          {/* Sticky Private Client Advisor Concierge Sidebar */}
          <aside className="no-print flex flex-col gap-6 lg:sticky lg:top-24">
            {a && (
              <div className="rounded-3xl border border-[#d4a752]/35 bg-[#0b1824] p-6 text-center text-white shadow-xl">
                <div className="mx-auto flex size-24 items-center justify-center overflow-hidden rounded-full border-2 border-[#d4a752] bg-[#132a3c] text-2xl font-bold text-[#f3d27a] shadow-lg">
                  {a.photo ? <img src={a.photo} alt={a.name} className="size-full object-cover object-top" /> : a.name.split(' ').map(x => x[0]).slice(0, 2).join('')}
                </div>
                <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[#f3d27a]">DEDICATED PRIVATE ADVISOR</div>
                <div className="mt-1 text-xl font-bold text-white">{a.name}</div>
                <div className="text-xs text-slate-300 mt-0.5">{a.title}</div>
                <div className="mt-5 grid gap-2.5">
                  <a
                    href={wa(a.phone, `Hello ${a.name}, I would like to arrange a private viewing for ${data.title || 'the SWK portfolio'}.`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#d4a752] px-4 py-2.5 text-sm font-extrabold text-[#0b1824] no-underline hover:bg-[#e5be6d]"
                  >
                    WhatsApp Direct
                  </a>
                  <a
                    href={`tel:${a.phone.replace(/\s/g, '')}`}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white no-underline hover:bg-white/20"
                  >
                    <Phone size={15} /> {a.phone}
                  </a>
                </div>
              </div>
            )}

            <form id="enquire" onSubmit={e => void enquire(e)} className="rounded-3xl border border-[#e3d9c6] bg-white p-6 shadow-md grid gap-3.5">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8a621c]">PRIVATE CONCIERGE</div>
                <h3 className="m-0 mt-1 text-lg font-bold text-[#0b1f2a]">Request Private Viewing or Offer Pack</h3>
              </div>
              {sent ? (
                <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-4 text-sm font-medium text-emerald-900">
                  Thank you. {a?.name.split(' ')[0] ?? 'Your SWK Private Advisor'} has received your confidential enquiry and will respond shortly.
                </div>
              ) : (
                <>
                  <input className="input" required minLength={2} placeholder="Full Name" aria-label="Your name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                  <input className="input" required type="tel" placeholder="Mobile / WhatsApp (+971 ...)" aria-label="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                  <input className="input" type="email" placeholder="Email Address (optional)" aria-label="E-mail" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                  {form.item && (
                    <div className="rounded-xl bg-[#f8f5ef] px-3 py-2 text-xs text-[#334155]">
                      Selected Residence: <strong>{form.item}</strong>
                    </div>
                  )}
                  <textarea className="textarea" rows={3} placeholder="Preferred viewing date, financing query, or offer note…" aria-label="Message" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
                  <button type="submit" className="btn green w-full justify-center" disabled={busy}>
                    {busy ? 'Sending…' : 'Confirm Private Enquiry'}
                  </button>
                  <p className="m-0 text-[11px] text-[#64748b] leading-relaxed">
                    All property photography is strictly watermarked and copyrighted to SWK Properties LLC (RERA ORN {data.company.orn}).
                  </p>
                </>
              )}
            </form>
          </aside>
        </div>
      </main>

      {/* Luxury Corporate Footer */}
      <footer className="border-t border-[#d4a752]/30 bg-[#0b1824] py-10 px-4 text-center text-white">
        <div className="mx-auto max-w-[1100px] flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <img src="/brand/swk-app-icon-rounded.png" alt="SWK Icon" className="h-12 w-12 rounded-xl border border-[#d4a752]/40" />
            <img src="/brand/web/swk-logo-dark.webp" alt="SWK Properties" className="h-10 object-contain" />
          </div>
          <div className="text-xs text-slate-300 leading-relaxed">
            {data.company.name} · RERA ORN {data.company.orn} · DET Licence {data.company.trade_license || '1511391'}<br />
            {data.company.address} · {data.company.phone} ·{' '}
            <a href={data.company.website} className="text-[#f3d27a] font-semibold">www.swkpropertiesuae.com</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

function SpecBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#ebe3d3] bg-[#faf7f1] px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#64748b]">
        <span className="text-[#8a621c]">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="mt-1.5 text-[14.5px] font-bold text-[#0b1f2a]">{value}</div>
    </div>
  )
}
