/**
 * World-Class Public CRM Promoter Launch Showcase (`/p/:slug`)
 *
 * Authentic Binghatti Arts District gallery aesthetic — Warm Gallery Linen (#FAF4EE),
 * Desert Silk (#F3E2D2), Binghatti Vermilion (#C82315), Deep Burgundy (#5E1818),
 * Champagne Gold (#D9B56D), and Velvet Obsidian (#120D0E) — featuring official Binghatti
 * wordmarks & sunburst emblems, Official Narrated Veo 3.1 Cinema Film, 2D -> 3D Floor Plan
 * Explorer, Live 60/40 Payment Plan & DLD Calculator, 12-Image 4K Lightbox, Brand Kit
 * Downloads, and Direct VIP Priority Allocation Desk for the assigned CRM Promoter.
 */
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Award,
  Building2,
  Calculator,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Film,
  Layers,
  MapPin,
  Maximize2,
  MessageCircle,
  Phone,
  Play,
  Presentation,
  Share2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react'
import { get, post } from '../lib/api'

interface PromoTypology {
  key: string
  label: string
  subtitle: string
  priceAed: number
  monthlyAed: number
  monthlyNote: string
  dldMedianAed: number
  discountPct: string
  ejariRentRange: string
  grossYieldRange: string
  areaSqft: string
  floorPlanUrl: string
  schedule: Array<{ date: string; pct: string; amountAed: number; cumulative: string; highlight?: boolean }>
}

interface PromoPayload {
  slug: string
  theme: string
  brandAssets: {
    logoWhite: string | null
    logoBurgundy: string | null
    sunburstOrange: string | null
    sunburstGold: string | null
    desertSilkBg: string | null
  } | null
  project: {
    id: number
    reference: string
    title: string
    subtitle: string
    developer: string
    community: string
    emirate: string
    handover: string
    paymentPlan: string
    paymentPlanSummary: string
    fromPrice: number
    unitMix: string
    roiPercent: number
    tenure: string
    furnishing: string
    promoBadge: string
    promoHeadline: string
    description: string
    amenities: string[]
    features: string[]
    tourUrl: string | null
    photos: Array<{ url: string; title: string; category: string }>
    floorPlans: Array<{ url: string; title: string; category: string }>
    videoUrl: string | null
    brochureUrl: string | null
    paymentPlanPdfUrl: string | null
    pptUrl: string | null
  }
  typologies: PromoTypology[]
  driveTimes: Array<{ mins: string; place: string; note: string }>
  dldProof: Array<{ metric: string; label: string; sub: string }>
  promoter: {
    name: string
    title: string
    phone: string
    whatsappDigits: string
    whatsappUrl: string
    email: string
    location: string
  }
}

const aed = (n: number) => `AED ${Math.round(n).toLocaleString('en-US')}`

export function PromoterShowcasePage() {
  const { slug = 'the-arts-district-by-binghatti' } = useParams()
  const q = useQuery({
    queryKey: ['public-promo', slug],
    queryFn: () => get<PromoPayload>(`/api/public/promo/${encodeURIComponent(slug)}`),
    retry: false,
  })

  const [activeTypoIdx, setActiveTypoIdx] = useState(0)
  const [goldenVisaMode, setGoldenVisaMode] = useState(false)
  const [lightboxImg, setLightboxImg] = useState<{ url: string; title: string; idx?: number } | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', unit_type: 'Studio Residence (AED 525,000)', message: '' })
  const [sending, setSending] = useState(false)
  const [sentOk, setSentOk] = useState(false)
  const [formErr, setFormErr] = useState('')

  const data = q.data
  const project = data?.project
  const promoter = data?.promoter
  const brand = data?.brandAssets
  const typologies = data?.typologies ?? []
  const activeTypo = typologies[activeTypoIdx] ?? typologies[0] ?? null

  useEffect(() => {
    if (project && promoter) {
      document.title = `${project.title} — Exclusive Launch with ${promoter.name}`
    }
  }, [project, promoter])

  useEffect(() => {
    if (!lightboxImg) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxImg(null)
      if (lightboxImg.idx != null && project?.photos.length) {
        if (e.key === 'ArrowRight') {
          const next = (lightboxImg.idx + 1) % project.photos.length
          setLightboxImg({ url: project.photos[next]!.url, title: project.photos[next]!.title, idx: next })
        } else if (e.key === 'ArrowLeft') {
          const prev = (lightboxImg.idx - 1 + project.photos.length) % project.photos.length
          setLightboxImg({ url: project.photos[prev]!.url, title: project.photos[prev]!.title, idx: prev })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxImg, project])

  const calc = useMemo(() => {
    const basePrice = goldenVisaMode ? 2_150_000 : (activeTypo?.priceAed ?? project?.fromPrice ?? 525_000)
    const down20 = Math.round(basePrice * 0.2)
    const dld4 = Math.round(basePrice * 0.04)
    const oqood = 4_200
    const bookingTotal = down20 + dld4 + oqood
    const handover40 = Math.round(basePrice * 0.4)
    const estRentMid = goldenVisaMode
      ? 139_000
      : activeTypo?.key === 'studio'
        ? 42_500
        : activeTypo?.key === '1br'
          ? 59_000
          : 80_000
    const grossYield = ((estRentMid / basePrice) * 100).toFixed(1)
    return { basePrice, down20, dld4, oqood, bookingTotal, handover40, estRentMid, grossYield }
  }, [goldenVisaMode, activeTypo, project])

  if (q.isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#120D0E] text-[#FAF4EE] gap-4 px-6">
        <div className="w-11 h-11 rounded-full border-2 border-[#D9B56D]/30 border-t-[#C82315] animate-spin" />
        <div className="text-xs uppercase tracking-[0.26em] text-[#D9B56D] font-semibold">Loading Private Launch Showcase…</div>
      </div>
    )
  }

  if (q.isError || !data || !project || !promoter) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#120D0E] text-[#FAF4EE] px-6 text-center">
        <div className="max-w-md rounded-3xl border border-[#D9B56D]/30 bg-[#1B1314] p-8">
          <div className="text-xs uppercase tracking-[0.22em] text-[#D9B56D] font-bold">Private Launch Showcase</div>
          <h1 className="mt-3 text-2xl font-serif text-white">Showcase Link Unavailable</h1>
          <p className="mt-2 text-sm text-[#D8CBC0]">This promotional launch link is no longer active. Please contact your advisor for an updated priority showcase link.</p>
        </div>
      </div>
    )
  }

  const shareUrl = typeof window !== 'undefined' ? window.location.href : `https://os.swk.properties/p/${data.slug}`
  const waDirect = (customMsg?: string) => {
    const msg =
      customMsg ||
      `Hi ${promoter.name}, I'm interested in ${project.title} (EOI / 60-40 Plan). Please share available units, floor plans, and priority allocation details. Ref: ${shareUrl}`
    return `${promoter.whatsappUrl}?text=${encodeURIComponent(msg)}`
  }

  const copyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2200)
    } catch {
      /* ignore clipboard deny */
    }
  }

  const submitEnquiry = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormErr('')
    if (form.name.trim().length < 2 || form.phone.trim().length < 6) {
      setFormErr('Please enter your name and valid WhatsApp / phone number.')
      return
    }
    setSending(true)
    try {
      await post(`/api/public/promo/${encodeURIComponent(data.slug)}/enquiry`, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        unit_type: form.unit_type,
        message: form.message.trim() || undefined,
        consent: true,
      })
      setSentOk(true)
    } catch (err: any) {
      setFormErr(err?.message || 'Could not submit enquiry — please tap WhatsApp below for immediate assistance.')
    } finally {
      setSending(false)
    }
  }

  const heroBg = project.photos[1]?.url || project.photos[0]?.url || '/media/launches/the-arts-district-by-binghatti-1.webp'

  return (
    <div className="min-h-screen bg-[#FAF4EE] text-[#2F1713] selection:bg-[#C82315] selection:text-white pb-24">
      {/* 1. LUXURY STICKY NAVIGATION BAR */}
      <header className="sticky top-0 z-40 border-b border-[#D9B56D]/20 bg-[#120D0E]/92 backdrop-blur-xl text-[#FAF4EE]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <a href="#top" className="flex items-center gap-3 no-underline shrink-0">
            {brand?.sunburstOrange && (
              <img src={brand.sunburstOrange} alt="Binghatti Sunburst" className="w-8 h-8 rounded-lg shadow-sm" />
            )}
            <div className="leading-tight">
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#F3D289]">{project.title}</div>
              <div className="text-[10.5px] text-[#D7C8BC] hidden sm:block">Presented by {promoter.name} · {promoter.phone}</div>
            </div>
          </a>

          <nav className="hidden lg:flex items-center gap-6 text-[12px] font-semibold tracking-wide text-[#E7DAD0]">
            {project.videoUrl && <a href="#film" className="hover:text-[#F3D289] no-underline text-inherit transition-colors">Cinema Film</a>}
            {typologies.length > 0 && <a href="#floorplans" className="hover:text-[#F3D289] no-underline text-inherit transition-colors">2D → 3D Plans</a>}
            <a href="#payment-plan" className="hover:text-[#F3D289] no-underline text-inherit transition-colors">60/40 &amp; Pricing</a>
            <a href="#gallery" className="hover:text-[#F3D289] no-underline text-inherit transition-colors">4K Gallery</a>
            <a href="#downloads" className="hover:text-[#F3D289] no-underline text-inherit transition-colors">Brand Kit</a>
            <a href="#reserve" className="hover:text-[#F3D289] no-underline text-inherit transition-colors">Reserve EOI</a>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void copyShareUrl()}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[#D9B56D]/40 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-[11.5px] font-semibold text-[#F3D289] cursor-pointer transition-colors"
            >
              {copiedLink ? <Check size={13} /> : <Share2 size={13} />}
              {copiedLink ? 'Link Copied' : 'Share'}
            </button>
            <a
              href={`tel:${promoter.phone.replace(/\s+/g, '')}`}
              className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/8 hover:bg-white/15 px-3.5 py-1.5 text-[12px] font-bold text-white no-underline transition-colors"
            >
              <Phone size={13} className="text-[#F3D289]" /> {promoter.phone}
            </a>
            <a
              href={waDirect()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#C82315] hover:bg-[#AE1D11] px-4 py-1.5 text-[12px] font-bold text-white no-underline shadow-[0_6px_20px_rgba(200,35,21,0.4)] transition-all"
            >
              <MessageCircle size={14} /> WhatsApp {promoter.name.split(' ')[0]}
            </a>
          </div>
        </div>
      </header>

      {/* 2. FULL-BLEED CINEMATIC HERO WITH BINGHATTI BRAND ASSETS & SHABIB SIRAJ VIP CARD */}
      <section id="top" className="relative overflow-hidden bg-[#120D0E] text-white">
        <div className="absolute inset-0">
          <img src={heroBg} alt={project.title} className="w-full h-full object-cover opacity-80 scale-[1.02]" />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(100deg, rgba(16,9,10,0.95) 0%, rgba(16,9,10,0.82) 44%, rgba(16,9,10,0.38) 100%)',
            }}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-32"
            style={{ background: 'linear-gradient(180deg, transparent 0%, #120D0E 100%)' }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 pt-10 pb-16 lg:pt-14 lg:pb-20">
          <div className="grid lg:grid-cols-[1.28fr_0.72fr] gap-8 lg:gap-10 items-end">
            {/* Left Hero Column */}
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center gap-2.5">
                {brand?.sunburstOrange && (
                  <img src={brand.sunburstOrange} alt="Official Emblem" className="w-9 h-9 rounded-xl shadow-md" />
                )}
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#C82315] border border-[#F3D289]/55 px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.2em] text-white shadow-lg">
                  <Sparkles size={12} /> {project.promoBadge}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/20 px-3.5 py-1.5 text-[11px] font-semibold text-[#F4D58F]">
                  <MapPin size={12} /> {project.community} · {project.emirate}
                </span>
              </div>

              {brand?.logoWhite ? (
                <img
                  src={brand.logoWhite}
                  alt={project.title}
                  className="max-h-40 sm:max-h-48 w-auto self-start drop-shadow-[0_14px_34px_rgba(0,0,0,0.65)]"
                />
              ) : (
                <h1 className="font-serif text-4xl sm:text-6xl font-bold tracking-tight text-white m-0">{project.title}</h1>
              )}

              <p className="font-serif italic text-xl sm:text-2xl text-[#F4D58F] max-w-2xl leading-snug m-0">
                {project.subtitle}
              </p>

              {/* 3 Authentic Binghatti Sunburst Pricing Pills */}
              <div className="grid sm:grid-cols-3 gap-3 mt-1 max-w-2xl">
                {[
                  { tier: 'STUDIO APARTMENT', price: 'AED 525,000', sub: 'From AED 2,500 / month', badge: '-27.2% vs DLD' },
                  { tier: '1-BEDROOM SUITE', price: 'AED 850,000', sub: 'From AED 4,250 / month', badge: '-12.4% vs DLD' },
                  { tier: '2BR CORNER TERRACE', price: 'AED 1,300,000', sub: 'From AED 5,000 / month', badge: '-14.7% vs DLD' },
                ].map(card => (
                  <div
                    key={card.tier}
                    className="rounded-2xl bg-[#FAF4EE]/96 text-[#2F1713] p-4 border border-[#D9B56D]/70 shadow-[0_14px_34px_rgba(0,0,0,0.35)]"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9.5px] font-extrabold uppercase tracking-[0.14em] text-[#7C3E1B]">{card.tier}</span>
                      <span className="text-[9.5px] font-bold text-[#146B43] bg-[#E8F6EE] px-1.5 py-0.5 rounded-full">{card.badge}</span>
                    </div>
                    <div className="font-serif text-[22px] font-bold text-[#C82315] mt-1 leading-none">{card.price}</div>
                    <div className="text-[11.5px] font-semibold text-[#5E382C] mt-1.5">{card.sub}</div>
                  </div>
                ))}
              </div>

              {/* Hero CTAs */}
              <div className="flex flex-wrap gap-3 pt-2">
                <a
                  href={waDirect()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-[#C82315] hover:bg-[#AA1B0F] px-6 py-3.5 text-sm font-bold text-white no-underline shadow-[0_12px_30px_rgba(200,35,21,0.45)] transition-all"
                >
                  <MessageCircle size={17} /> Reserve Priority EOI with {promoter.name}
                </a>
                {project.videoUrl && (
                  <a
                    href="#film"
                    className="inline-flex items-center gap-2 rounded-full border border-[#D9B56D]/60 bg-white/10 hover:bg-white/18 backdrop-blur-md px-5 py-3.5 text-sm font-bold text-[#FAF4EE] no-underline transition-all"
                  >
                    <Play size={16} className="fill-[#F3D289] text-[#F3D289]" /> Watch Official Film
                  </a>
                )}
                {project.brochureUrl && (
                  <a
                    href={project.brochureUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/35 hover:bg-black/55 backdrop-blur-md px-5 py-3.5 text-sm font-semibold text-white no-underline transition-all"
                  >
                    <FileText size={16} className="text-[#F3D289]" /> Brand Brochure PDF
                  </a>
                )}
              </div>
            </div>

            {/* Right VIP Promoter Concierge Card — SHABIB SIRAJ */}
            <div className="rounded-3xl border border-[#D9B56D]/45 bg-[#171011]/90 backdrop-blur-xl p-6 shadow-[0_24px_60px_rgba(0,0,0,0.55)]">
              <div className="flex items-center gap-3.5 pb-4 border-b border-[#D9B56D]/25">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#C82315] via-[#8F1A14] to-[#5E1818] border border-[#F3D289]/60 flex items-center justify-center font-serif text-xl font-bold text-[#FAF4EE] shadow-lg shrink-0">
                  {promoter.name
                    .split(' ')
                    .map(w => w[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#F3D289]">
                    <Award size={12} /> Official Launch Promoter
                  </div>
                  <div className="font-serif text-2xl font-bold text-white leading-tight mt-0.5">{promoter.name}</div>
                  <div className="text-[12px] text-[#D8C9BC]">{promoter.title}</div>
                </div>
              </div>

              <div className="mt-4 space-y-2.5 text-[12.5px] text-[#E9DDD2]">
                <div className="flex items-center justify-between py-1.5 border-b border-white/10">
                  <span className="text-[#BEA999]">Direct VIP Line</span>
                  <a href={`tel:${promoter.phone.replace(/\s+/g, '')}`} className="font-mono text-[14px] font-bold text-[#F3D289] no-underline hover:underline">
                    {promoter.phone}
                  </a>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-white/10">
                  <span className="text-[#BEA999]">Payment Plan</span>
                  <span className="font-bold text-white">60 / 40 Flexible · 0% Fee</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-white/10">
                  <span className="text-[#BEA999]">Expected Handover</span>
                  <span className="font-bold text-white">{project.handover}</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-[#BEA999]">Est. Gross Rental Yield</span>
                  <span className="font-bold text-[#7CE5B1]">6.3% – 8.6% p.a. (Ejari)</span>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2.5">
                <a
                  href={waDirect()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#25D366] hover:bg-[#1EB858] px-4 py-3 text-[12.5px] font-extrabold text-[#0B2314] no-underline shadow-md transition-all"
                >
                  <MessageCircle size={15} /> WhatsApp Now
                </a>
                <a
                  href={`tel:${promoter.phone.replace(/\s+/g, '')}`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#F3D289] hover:bg-[#E7C272] px-4 py-3 text-[12.5px] font-extrabold text-[#1C1110] no-underline shadow-md transition-all"
                >
                  <Phone size={15} /> Direct Call
                </a>
              </div>

              <a
                href="#reserve"
                className="mt-2.5 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[#D9B56D]/45 bg-white/5 hover:bg-white/12 px-4 py-2.5 text-[12px] font-bold text-[#FAF4EE] no-underline transition-all"
              >
                Lock Floor &amp; Corner Terrace Allocation <ArrowRight size={14} />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 3. VERIFIED DLD PROOF STRIP */}
      {data.dldProof.length > 0 && (
        <section className="bg-[#5E1818] text-[#FAF4EE] border-y border-[#D9B56D]/35">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-7 grid grid-cols-2 lg:grid-cols-4 gap-5">
            {data.dldProof.map(item => (
              <div key={item.label} className="border-l-2 border-[#D9B56D] pl-4">
                <div className="font-serif text-2xl sm:text-3xl font-bold text-[#F5D892]">{item.metric}</div>
                <div className="text-[12.5px] font-bold text-white mt-0.5">{item.label}</div>
                <div className="text-[11px] text-[#E6D3C4] mt-0.5">{item.sub}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. OFFICIAL NARRATED VEO 3.1 CINEMA LAUNCH FILM */}
      {project.videoUrl && (
        <section id="film" className="bg-[#151010] text-[#FAF4EE] py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-7">
              <div>
                <div className="inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#F3D289]">
                  <Film size={14} /> Official Narrated Cinema Launch Film
                </div>
                <h2 className="font-serif text-3xl sm:text-4xl font-bold text-white mt-2 m-0">
                  Experience The Arts District in Motion
                </h2>
                <p className="text-sm text-[#D6C8BC] mt-2 max-w-2xl m-0">
                  Full HD photorealistic architectural cinematography with studio British narration, orchestral score, and direct VIP priority allocation with {promoter.name} ({promoter.phone}).
                </p>
              </div>
              <a
                href={project.videoUrl}
                download
                className="inline-flex items-center gap-2 rounded-full border border-[#D9B56D]/50 bg-white/5 hover:bg-white/12 px-4 py-2 text-xs font-bold text-[#F3D289] no-underline transition-colors"
              >
                <Download size={14} /> Download HD Film (.MP4)
              </a>
            </div>

            <div className="rounded-3xl overflow-hidden border border-[#D9B56D]/45 bg-black shadow-[0_28px_80px_rgba(0,0,0,0.65)]">
              <video
                src={project.videoUrl}
                poster={project.photos[0]?.url}
                controls
                playsInline
                preload="metadata"
                className="w-full aspect-video object-cover bg-black"
              />
            </div>
          </div>
        </section>
      )}

      {/* 5. INTERACTIVE 2D BLUEPRINT -> 1:1 PHOTOREALISTIC 3D FLOOR PLAN STUDIO */}
      {typologies.length > 0 && activeTypo && (
        <section id="floorplans" className="py-16 bg-gradient-to-b from-[#FCF7F2] to-[#F5ECE2]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-md bg-[#7C3E1B] px-3 py-1 text-[10.5px] font-extrabold uppercase tracking-[0.2em] text-white">
                  <Layers size={12} /> Discover Your Space · 2D Blueprint to 3D Reality
                </div>
                <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#4F1713] mt-3 m-0">
                  Photorealistic 3D Floor Plans &amp; Unit Pricing
                </h2>
              </div>
              {brand?.logoBurgundy && (
                <img src={brand.logoBurgundy} alt="Binghatti Arts District" className="h-14 w-auto hidden sm:block" />
              )}
            </div>

            {/* Unit Typology Tabs */}
            <div className="flex flex-wrap gap-2.5 mb-6">
              {typologies.map((t, idx) => {
                const active = idx === activeTypoIdx
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => {
                      setActiveTypoIdx(idx)
                      setGoldenVisaMode(false)
                    }}
                    className={`rounded-2xl px-5 py-3 text-left border cursor-pointer transition-all ${
                      active
                        ? 'bg-[#5E1818] text-white border-[#5E1818] shadow-[0_12px_28px_rgba(94,24,24,0.28)]'
                        : 'bg-white text-[#3C1B15] border-[#DEC9B5] hover:border-[#C82315]'
                    }`}
                  >
                    <div className={`text-[10.5px] font-extrabold uppercase tracking-wider ${active ? 'text-[#F4D58F]' : 'text-[#7C3E1B]'}`}>
                      {t.label}
                    </div>
                    <div className="font-serif text-xl font-bold mt-0.5">{aed(t.priceAed)}</div>
                    <div className={`text-[11px] mt-0.5 ${active ? 'text-white/80' : 'text-[#6F4C3F]'}`}>{t.monthlyNote}</div>
                  </button>
                )
              })}
            </div>

            {/* Side-by-Side 2D->3D Plate + Metrics */}
            <div className="grid lg:grid-cols-[1.35fr_0.65fr] gap-6 items-stretch">
              <div className="rounded-3xl bg-[#161111] border-2 border-[#D4AA63] p-4 flex flex-col shadow-[0_20px_50px_rgba(45,16,12,0.16)]">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="rounded-full bg-[#C82315] px-3.5 py-1 text-[10.5px] font-extrabold uppercase tracking-[0.15em] text-white">
                    Official 2D Blueprint + 1:1 Photorealistic 3D Cutaway
                  </span>
                  <button
                    type="button"
                    onClick={() => setLightboxImg({ url: activeTypo.floorPlanUrl, title: `${activeTypo.label} — 2D & 3D Architectural Plan` })}
                    className="inline-flex items-center gap-1 rounded-full bg-white/10 hover:bg-white/20 px-3 py-1 text-[11px] font-semibold text-[#F3D289] border-0 cursor-pointer"
                  >
                    <Maximize2 size={12} /> Full-Screen Zoom
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setLightboxImg({ url: activeTypo.floorPlanUrl, title: `${activeTypo.label} — 2D & 3D Architectural Plan` })}
                  className="flex-1 rounded-2xl overflow-hidden bg-[#F5EFE6] border-0 p-0 cursor-zoom-in"
                >
                  <img
                    src={activeTypo.floorPlanUrl}
                    alt={activeTypo.label}
                    className="w-full h-full max-h-[470px] object-contain"
                  />
                </button>
              </div>

              <div className="rounded-3xl bg-white border border-[#E2D0BF] p-6 flex flex-col justify-between shadow-[0_14px_36px_rgba(88,30,18,0.07)]">
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#7C3E1B]">Selected Typology</div>
                  <h3 className="font-serif text-2xl font-bold text-[#4F1713] mt-1 m-0">{activeTypo.label}</h3>
                  <p className="text-[13px] text-[#6B483B] mt-1.5 leading-relaxed">{activeTypo.subtitle}</p>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-[#FAF4EE] border border-[#E7D8C9] p-3.5">
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#7C3E1B]">Launch Price</div>
                      <div className="font-serif text-xl font-bold text-[#C82315] mt-1">{aed(activeTypo.priceAed)}</div>
                    </div>
                    <div className="rounded-2xl bg-[#FAF4EE] border border-[#E7D8C9] p-3.5">
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#7C3E1B]">Monthly (60/40)</div>
                      <div className="font-serif text-xl font-bold text-[#4F1713] mt-1">{aed(activeTypo.monthlyAed)}</div>
                    </div>
                    <div className="rounded-2xl bg-[#FAF4EE] border border-[#E7D8C9] p-3.5">
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#7C3E1B]">DSO DLD Arbitrage</div>
                      <div className="text-[15px] font-extrabold text-[#146B43] mt-1">{activeTypo.discountPct} vs Median</div>
                      <div className="text-[10.5px] text-[#6F4D3F]">DLD: {aed(activeTypo.dldMedianAed)}</div>
                    </div>
                    <div className="rounded-2xl bg-[#FAF4EE] border border-[#E7D8C9] p-3.5">
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#7C3E1B]">Est. Ejari Yield</div>
                      <div className="text-[15px] font-extrabold text-[#C82315] mt-1">{activeTypo.grossYieldRange}</div>
                      <div className="text-[10.5px] text-[#6F4D3F]">{activeTypo.ejariRentRange}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-5 border-t border-[#ECDFD2] flex flex-col gap-2.5">
                  <a
                    href={waDirect(`Hi ${promoter.name}, please send me available ${activeTypo.label} units (${aed(activeTypo.priceAed)}) and floor levels for ${project.title}.`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#C82315] hover:bg-[#AE1D11] px-4 py-3 text-[13px] font-bold text-white no-underline shadow-md transition-all"
                  >
                    <MessageCircle size={15} /> Request {activeTypo.label} Units from {promoter.name}
                  </a>
                  {project.paymentPlanPdfUrl && (
                    <a
                      href={project.paymentPlanPdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[#D8BFA9] bg-[#FAF4EE] hover:bg-[#F3E6D8] px-4 py-2.5 text-[12.5px] font-bold text-[#5E1818] no-underline transition-all"
                    >
                      <FileSpreadsheet size={15} /> Download Full 60/40 Schedule PDF
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 6. AUTHENTIC BINGHATTI DESERT SILK 60/40 PAYMENT PLAN & DLD ARBITRAGE CALCULATOR */}
      <section
        id="payment-plan"
        className="py-16 border-y border-[#DFC7B2]"
        style={
          brand?.desertSilkBg
            ? { backgroundImage: `url(${brand.desertSilkBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : { background: 'linear-gradient(155deg, #F3E2D2 0%, #EAD2BC 100%)' }
        }
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-md bg-[#5E1818] px-3 py-1 text-[10.5px] font-extrabold uppercase tracking-[0.2em] text-[#F5D892]">
                <Calculator size={12} /> Official 24 Nov 2026 Schedule · 60 / 40 Flexible Plan
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#4F1713] mt-3 m-0">
                Interactive 60/40 Payment Plan &amp; Closing Calculator
              </h2>
            </div>

            <div className="flex flex-wrap gap-2">
              {typologies.map((t, idx) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    setActiveTypoIdx(idx)
                    setGoldenVisaMode(false)
                  }}
                  className={`rounded-full px-4 py-2 text-xs font-bold border cursor-pointer transition-all ${
                    !goldenVisaMode && idx === activeTypoIdx
                      ? 'bg-[#C82315] text-white border-[#C82315] shadow-md'
                      : 'bg-white/90 text-[#4F1713] border-[#D8BFA9]'
                  }`}
                >
                  {t.label.split(' ')[0]} · {aed(t.priceAed)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setGoldenVisaMode(true)}
                className={`rounded-full px-4 py-2 text-xs font-bold border cursor-pointer transition-all ${
                  goldenVisaMode
                    ? 'bg-[#5E1818] text-[#F5D892] border-[#5E1818] shadow-md'
                    : 'bg-white/90 text-[#4F1713] border-[#D8BFA9]'
                }`}
              >
                10-Yr Golden Visa Bundle (AED 2.15M)
              </button>
            </div>
          </div>

          <div className="grid lg:grid-cols-[0.82fr_1.18fr] gap-6 items-start">
            {/* Financial Summary Card */}
            <div className="rounded-3xl bg-white/95 backdrop-blur-md border border-[#DFC7B2] p-6 shadow-[0_18px_46px_rgba(70,22,14,0.12)]">
              <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#7C3E1B]">
                {goldenVisaMode ? '10-Year UAE Golden Visa Portfolio (1BR + 2BR Corner)' : activeTypo?.label}
              </div>
              <div className="font-serif text-3xl font-bold text-[#C82315] mt-1">{aed(calc.basePrice)}</div>
              <p className="text-xs text-[#6B483B] mt-1">Direct Developer Allocation · 0% Buyer Commission · DLD Escrow Protected</p>

              <div className="mt-5 space-y-2.5 text-[13px]">
                <div className="flex justify-between py-2 border-b border-[#EFE2D6]">
                  <span className="text-[#6B483B]">20% Booking Deposit (31 Dec 2026)</span>
                  <span className="font-bold text-[#3D1612]">{aed(calc.down20)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-[#EFE2D6]">
                  <span className="text-[#6B483B]">4% Dubai Land Department (DLD) Fee</span>
                  <span className="font-bold text-[#3D1612]">{aed(calc.dld4)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-[#EFE2D6]">
                  <span className="text-[#6B483B]">DLD Oqood Admin Fee (Est.)</span>
                  <span className="font-bold text-[#3D1612]">{aed(calc.oqood)}</span>
                </div>
                <div className="flex justify-between py-2.5 px-3 rounded-xl bg-[#FFF2CC] border border-[#E7C679]">
                  <span className="font-bold text-[#5E1818]">Total Initial Outlay (Booking + DLD)</span>
                  <span className="font-extrabold text-[#C82315]">{aed(calc.bookingTotal)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-[#EFE2D6]">
                  <span className="text-[#6B483B]">40% On Completion (Mortgage Eligible)</span>
                  <span className="font-bold text-[#3D1612]">{aed(calc.handover40)}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-[#6B483B] inline-flex items-center gap-1.5">
                    <TrendingUp size={14} className="text-[#146B43]" /> Projected Gross Ejari Yield
                  </span>
                  <span className="font-extrabold text-[#146B43]">~{calc.grossYield}% p.a. ({aed(calc.estRentMid)}/yr)</span>
                </div>
              </div>

              <a
                href={waDirect(
                  `Hi ${promoter.name}, please prepare an official 60/40 cashflow sheet for ${
                    goldenVisaMode ? 'the AED 2.15M Golden Visa Bundle (1BR + 2BR)' : `${activeTypo?.label} (${aed(calc.basePrice)})`
                  } at ${project.title}.`,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#5E1818] hover:bg-[#461111] px-4 py-3 text-xs font-bold text-[#F5D892] no-underline transition-all"
              >
                <MessageCircle size={15} /> Get Custom Cashflow Sheet from {promoter.name}
              </a>
            </div>

            {/* Official Milestone Schedule Table */}
            <div className="rounded-3xl bg-white/95 backdrop-blur-md border border-[#DFC7B2] overflow-hidden shadow-[0_18px_46px_rgba(70,22,14,0.12)]">
              <div className="px-5 py-4 bg-[#5E1818] text-[#FAF4EE] flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#F3D289]">Exact Milestone Schedule</div>
                  <div className="font-serif text-lg font-bold text-white">
                    {goldenVisaMode ? '1-Bedroom + 2BR Corner Combined (60/40)' : `${activeTypo?.label} — Official 60/40`}
                  </div>
                </div>
                <span className="rounded-full bg-[#C82315] px-3 py-1 text-[10.5px] font-bold text-white">Handover Q4 2028</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[12.5px]">
                  <thead>
                    <tr className="bg-[#FAF4EE] border-b border-[#E7D6C6] text-[#7C3E1B] text-[11px] uppercase tracking-wider">
                      <th className="py-3 px-4 font-extrabold">Schedule / Milestone</th>
                      <th className="py-3 px-4 font-extrabold text-right">Installment %</th>
                      <th className="py-3 px-4 font-extrabold text-right">Amount (AED)</th>
                      <th className="py-3 px-4 font-extrabold text-right">Cumulative</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activeTypo?.schedule ?? []).map((row, i) => {
                      const scaledAmt = goldenVisaMode ? Math.round((row.amountAed / (activeTypo?.priceAed || 1)) * 2_150_000) : row.amountAed
                      return (
                        <tr
                          key={i}
                          className={`border-b border-[#EFE3D7] ${
                            row.highlight ? 'bg-[#FFF3CF]/90 font-bold text-[#5E1818]' : i % 2 === 0 ? 'bg-white' : 'bg-[#FCF7F2]'
                          }`}
                        >
                          <td className="py-2.5 px-4">{row.date}</td>
                          <td className="py-2.5 px-4 text-right font-mono">{row.pct}</td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-[#C82315]">{aed(scaledAmt)}</td>
                          <td className="py-2.5 px-4 text-right font-mono">{row.cumulative}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. 12-IMAGE 4K ARCHITECTURAL & CULTURAL GALLERY */}
      <section id="gallery" className="py-16 bg-[#140F10] text-[#FAF4EE]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#F3D289]">
                Curated 4K Architectural &amp; Lifestyle Gallery
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-white mt-2 m-0">
                Monumental Public Art &amp; Sculptural Living
              </h2>
            </div>
            <div className="text-xs text-[#D6C8BC]">Click any render for full-screen 4K gallery view ({project.photos.length} plates)</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {project.photos.map((ph, idx) => (
              <button
                key={ph.url}
                type="button"
                onClick={() => setLightboxImg({ url: ph.url, title: ph.title, idx })}
                className="group relative aspect-[16/10] rounded-2xl overflow-hidden border border-[#D9B56D]/25 bg-[#1D1516] p-0 cursor-pointer text-left"
              >
                <img
                  src={ph.url}
                  alt={ph.title}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent opacity-85 group-hover:opacity-95 transition-opacity" />
                <div className="absolute top-3 left-3 rounded-full bg-black/55 backdrop-blur-md border border-white/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#F3D289]">
                  {ph.category}
                </div>
                <div className="absolute bottom-3 left-3.5 right-3.5 flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-semibold text-white truncate">{ph.title}</span>
                  <Maximize2 size={14} className="text-[#F3D289] shrink-0 opacity-80 group-hover:opacity-100" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 8. CONNECTIVITY, DRIVE TIMES & AMENITIES */}
      <section className="py-16 bg-[#FAF4EE]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-8 items-start">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-md bg-[#7C3E1B] px-3 py-1 text-[10.5px] font-extrabold uppercase tracking-[0.2em] text-white">
                <MapPin size={12} /> Strategic Dubai Corridor · E311 · D54 · E66
              </div>
              <h2 className="font-serif text-3xl font-bold text-[#4F1713] mt-3 m-0">
                17 Minutes to Burj Khalifa · Adjacent to Nad Al Sheba
              </h2>
              <p className="text-sm text-[#6B483B] mt-2 leading-relaxed">{project.description}</p>

              <div className="mt-6 grid sm:grid-cols-2 gap-3">
                {data.driveTimes.map(d => (
                  <div key={d.place} className="rounded-2xl bg-white border border-[#E5D4C3] p-4 flex items-center gap-3.5 shadow-sm">
                    <div className="w-12 h-12 rounded-xl bg-[#C82315] text-white flex flex-col items-center justify-center shrink-0">
                      <span className="font-serif text-lg font-bold leading-none">{d.mins}</span>
                      <span className="text-[9px] font-bold uppercase tracking-wider opacity-90">MIN</span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-[#3D1612] leading-snug">{d.place}</div>
                      <div className="text-[11px] text-[#785547] mt-0.5">{d.note}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-5">
              {project.tourUrl && (
                <div className="rounded-3xl overflow-hidden border border-[#DFC7B2] bg-white shadow-md">
                  <div className="px-4 py-2.5 bg-[#5E1818] text-xs font-bold uppercase tracking-wider text-[#F3D289] flex items-center gap-2">
                    <Building2 size={14} /> Live Satellite Masterplan Location
                  </div>
                  <iframe
                    src={project.tourUrl}
                    title={`${project.title} Satellite Location`}
                    className="w-full h-[290px] border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              )}

              <div className="rounded-3xl bg-white border border-[#E5D4C3] p-6 shadow-sm">
                <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#7C3E1B] mb-3">
                  Signature Cultural &amp; Resort Amenities
                </div>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {project.amenities.map(am => (
                    <div key={am} className="flex items-center gap-2 rounded-xl bg-[#FAF4EE] border border-[#EBDCCB] px-3 py-2 text-xs font-semibold text-[#3F1C16]">
                      <CheckCircle2 size={14} className="text-[#C82315] shrink-0" />
                      <span>{am}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 9. OFFICIAL BRAND KIT DOWNLOADS (SHABIB SIRAJ EDITION) */}
      <section id="downloads" className="py-14 bg-[#201415] text-[#FAF4EE] border-y border-[#D9B56D]/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#F3D289]">
              Instant Official Brand Dossiers · Prepared by {promoter.name}
            </div>
            <h2 className="font-serif text-3xl font-bold text-white mt-2 m-0">
              Download the Complete Launch Kit
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                show: Boolean(project.brochureUrl),
                href: project.brochureUrl || '#',
                icon: FileText,
                tag: '12-PAGE PDF · 5.9 MB',
                title: 'Official Brand Brochure',
                desc: 'Full masterplan, 2D→3D floor plans, DLD arbitrage & amenities.',
                cta: 'Open Brochure PDF',
              },
              {
                show: Boolean(project.paymentPlanPdfUrl),
                href: project.paymentPlanPdfUrl || '#',
                icon: FileSpreadsheet,
                tag: '3-PAGE PDF · DESERT SILK',
                title: '60/40 Payment Plan PDF',
                desc: 'Complete 25-row monthly schedule for Studio, 1BR & 2BR Corner.',
                cta: 'Open Payment Plan',
              },
              {
                show: Boolean(project.pptUrl),
                href: project.pptUrl || '#',
                icon: Presentation,
                tag: '16-SLIDE .PPTX DECK',
                title: 'Investor Pitch Deck',
                desc: 'Boardroom-ready PowerPoint deck with DLD & Ejari rental analysis.',
                cta: 'Download PPTX Deck',
              },
              {
                show: Boolean(project.videoUrl),
                href: project.videoUrl || '#',
                icon: Film,
                tag: 'HD CINEMA · 62 SEC',
                title: 'Narrated Launch Film',
                desc: 'Photorealistic live-action walkthrough with British narration.',
                cta: 'Download HD Video',
              },
            ]
              .filter(x => x.show)
              .map(card => {
                const Icon = card.icon
                return (
                  <a
                    key={card.title}
                    href={card.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group rounded-2xl border border-[#D9B56D]/30 bg-white/[0.04] hover:bg-white/[0.09] hover:border-[#F3D289] p-5 flex flex-col justify-between no-underline transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="w-10 h-10 rounded-xl bg-[#C82315]/20 border border-[#C82315]/50 flex items-center justify-center text-[#F3D289]">
                          <Icon size={18} />
                        </span>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#D9B56D]">{card.tag}</span>
                      </div>
                      <div className="font-serif text-lg font-bold text-white mt-4">{card.title}</div>
                      <p className="text-xs text-[#CFC0B4] mt-1.5 leading-relaxed">{card.desc}</p>
                    </div>
                    <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#F3D289] group-hover:translate-x-0.5 transition-transform">
                      <Download size={13} /> {card.cta}
                    </div>
                  </a>
                )
              })}
          </div>
        </div>
      </section>

      {/* 10. DIRECT VIP PRIORITY ALLOCATION FORM -> AUTO-ASSIGNED TO SHABIB SIRAJ IN CRM */}
      <section id="reserve" className="py-16 bg-gradient-to-b from-[#FAF4EE] to-[#EFE2D5]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid lg:grid-cols-[0.95fr_1.05fr] gap-8 items-stretch">
            {/* Left Direct Contact Card */}
            <div className="rounded-3xl bg-[#140F10] text-[#FAF4EE] p-7 sm:p-8 border border-[#D9B56D]/45 flex flex-col justify-between shadow-[0_24px_60px_rgba(32,12,10,0.22)]">
              <div>
                {brand?.logoWhite && <img src={brand.logoWhite} alt={project.title} className="h-24 w-auto mb-5" />}
                <div className="inline-flex items-center gap-1.5 rounded-full bg-[#C82315] px-3.5 py-1 text-[10.5px] font-extrabold uppercase tracking-[0.18em] text-white">
                  Direct Developer Allocation · 0% Commission
                </div>
                <h2 className="font-serif text-3xl font-bold text-white mt-4 m-0">
                  Speak Directly with {promoter.name}
                </h2>
                <p className="text-sm text-[#D8C8BC] mt-2.5 leading-relaxed">
                  Secure preferred floor height, corner wrap-around terrace inventory, or 10-Year UAE Golden Visa multi-unit structuring directly at launch pricing.
                </p>

                <div className="mt-6 rounded-2xl bg-white/[0.06] border border-[#D9B56D]/35 p-5">
                  <div className="text-[10.5px] font-extrabold uppercase tracking-[0.18em] text-[#F3D289]">
                    Direct WhatsApp &amp; Voice Concierge
                  </div>
                  <a
                    href={`tel:${promoter.phone.replace(/\s+/g, '')}`}
                    className="block font-serif text-3xl font-bold text-white mt-1 no-underline hover:text-[#F3D289]"
                  >
                    {promoter.phone}
                  </a>
                  <div className="text-xs text-[#D5C6B9] mt-2">
                    {promoter.name} · {promoter.title}
                    <br />
                    {promoter.email} · {promoter.location}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href={waDirect()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#1EB858] px-5 py-3.5 text-sm font-extrabold text-[#0A2213] no-underline shadow-lg"
                >
                  <MessageCircle size={17} /> Chat on WhatsApp
                </a>
                <a
                  href={`tel:${promoter.phone.replace(/\s+/g, '')}`}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#D9B56D]/50 bg-white/8 hover:bg-white/15 px-5 py-3.5 text-sm font-bold text-white no-underline"
                >
                  <Phone size={16} /> Call
                </a>
              </div>
            </div>

            {/* Right Priority EOI Registration Form */}
            <div className="rounded-3xl bg-white border border-[#E2CEBC] p-7 sm:p-8 shadow-[0_18px_46px_rgba(70,22,14,0.09)]">
              <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#C82315]">
                <ShieldCheck size={14} /> Priority EOI Registration
              </div>
              <h3 className="font-serif text-2xl sm:text-3xl font-bold text-[#4F1713] mt-1.5 m-0">
                Reserve Your Allocation &amp; Floor Plan Pack
              </h3>
              <p className="text-xs text-[#6B483B] mt-1.5">
                Your enquiry goes directly to <strong>{promoter.name}</strong> ({promoter.phone}) for immediate floor-sheet and EOI reservation assistance.
              </p>

              {sentOk ? (
                <div className="mt-6 rounded-2xl bg-[#EEF8F1] border border-[#BBE2C6] p-6 text-center">
                  <CheckCircle2 size={36} className="text-[#146B43] mx-auto" />
                  <div className="font-serif text-2xl font-bold text-[#10492E] mt-3">Priority Request Received</div>
                  <p className="text-sm text-[#235D41] mt-2">
                    Thank you, <strong>{form.name}</strong>. <strong>{promoter.name}</strong> has been notified immediately and will reach out on <strong>{form.phone}</strong>.
                  </p>
                  <a
                    href={waDirect(`Hi ${promoter.name}, I just registered my EOI interest for ${form.unit_type} at ${project.title}. My name is ${form.name}.`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-6 py-3 text-sm font-extrabold text-[#0A2213] no-underline shadow-md"
                  >
                    <MessageCircle size={16} /> Continue Directly on WhatsApp ({promoter.phone})
                  </a>
                </div>
              ) : (
                <form onSubmit={submitEnquiry} className="mt-5 space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <label className="block">
                      <span className="block text-[11px] font-extrabold uppercase tracking-wider text-[#7C3E1B] mb-1">Full Name *</span>
                      <input
                        required
                        value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="Your full name"
                        className="w-full rounded-xl border border-[#DEC9B5] bg-[#FCF9F5] px-3.5 py-2.5 text-sm text-[#2F1713] focus:outline-none focus:border-[#C82315]"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-extrabold uppercase tracking-wider text-[#7C3E1B] mb-1">WhatsApp / Mobile *</span>
                      <input
                        required
                        value={form.phone}
                        onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="+971 5X XXX XXXX"
                        className="w-full rounded-xl border border-[#DEC9B5] bg-[#FCF9F5] px-3.5 py-2.5 text-sm text-[#2F1713] focus:outline-none focus:border-[#C82315]"
                      />
                    </label>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <label className="block">
                      <span className="block text-[11px] font-extrabold uppercase tracking-wider text-[#7C3E1B] mb-1">Email (Optional)</span>
                      <input
                        type="email"
                        value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="you@domain.com"
                        className="w-full rounded-xl border border-[#DEC9B5] bg-[#FCF9F5] px-3.5 py-2.5 text-sm text-[#2F1713] focus:outline-none focus:border-[#C82315]"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-extrabold uppercase tracking-wider text-[#7C3E1B] mb-1">Preferred Residence</span>
                      <select
                        value={form.unit_type}
                        onChange={e => setForm(f => ({ ...f, unit_type: e.target.value }))}
                        className="w-full rounded-xl border border-[#DEC9B5] bg-[#FCF9F5] px-3.5 py-2.5 text-sm text-[#2F1713] focus:outline-none focus:border-[#C82315]"
                      >
                        <option value="Studio Residence (AED 525,000)">Studio Residence — From AED 525,000</option>
                        <option value="1-Bedroom Residence (AED 850,000)">1-Bedroom Residence — From AED 850,000</option>
                        <option value="2-Bedroom Corner (AED 1,300,000)">2BR Corner Residence — From AED 1,300,000</option>
                        <option value="10-Year Golden Visa Bundle (AED 2,150,000)">10-Year Golden Visa Bundle (AED 2.15M+)</option>
                      </select>
                    </label>
                  </div>

                  <label className="block">
                    <span className="block text-[11px] font-extrabold uppercase tracking-wider text-[#7C3E1B] mb-1">Notes / Floor Preference</span>
                    <textarea
                      rows={3}
                      value={form.message}
                      onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                      placeholder="High floor, promenade view, bulk units, or preferred call time…"
                      className="w-full rounded-xl border border-[#DEC9B5] bg-[#FCF9F5] px-3.5 py-2.5 text-sm text-[#2F1713] focus:outline-none focus:border-[#C82315]"
                    />
                  </label>

                  {formErr && <div className="rounded-xl bg-[#FEECEB] border border-[#F5BDB9] px-3.5 py-2 text-xs font-semibold text-[#9E1910]">{formErr}</div>}

                  <button
                    type="submit"
                    disabled={sending}
                    className="w-full rounded-xl bg-[#C82315] hover:bg-[#AA1B0F] disabled:opacity-60 px-6 py-3.5 text-sm font-extrabold text-white border-0 cursor-pointer shadow-[0_12px_28px_rgba(200,35,21,0.3)] transition-all"
                  >
                    {sending ? 'Submitting Priority Request…' : `Request Priority Allocation with ${promoter.name}`}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#120D0E] text-[#BEA999] py-8 text-xs border-t border-[#D9B56D]/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <strong className="text-[#F3D289]">{project.title}</strong> · Promoted by <strong className="text-white">{promoter.name}</strong> ({promoter.phone})
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><Clock size={12} /> 60/40 Official Launch Plan · Handover {project.handover}</span>
          </div>
        </div>
      </footer>

      {/* FLOATING BOTTOM CONCIERGE BAR (MOBILE + DESKTOP) */}
      <div className="fixed bottom-3 inset-x-3 z-40 pointer-events-none">
        <div className="pointer-events-auto mx-auto max-w-3xl rounded-2xl border border-[#D9B56D]/50 bg-[#140E0F]/95 backdrop-blur-xl px-4 py-2.5 shadow-[0_16px_45px_rgba(0,0,0,0.55)] flex flex-wrap items-center justify-between gap-2.5 text-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-[#25D366] animate-pulse shrink-0" />
            <div className="truncate">
              <span className="font-bold text-xs sm:text-sm text-white">{promoter.name}</span>
              <span className="mx-1.5 text-[#D9B56D]">·</span>
              <span className="font-mono text-xs text-[#F3D289] font-semibold">{promoter.phone}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void copyShareUrl()}
              className="inline-flex items-center gap-1 rounded-xl border border-white/20 bg-white/8 hover:bg-white/15 px-3 py-2 text-[11.5px] font-bold text-white cursor-pointer"
            >
              {copiedLink ? <Check size={13} /> : <Copy size={13} />} {copiedLink ? 'Copied' : 'Copy Link'}
            </button>
            <a
              href={`tel:${promoter.phone.replace(/\s+/g, '')}`}
              className="inline-flex items-center gap-1 rounded-xl bg-[#F3D289] hover:bg-[#E5BF70] px-3.5 py-2 text-[11.5px] font-extrabold text-[#190F0F] no-underline"
            >
              <Phone size={13} /> Call
            </a>
            <a
              href={waDirect()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-xl bg-[#25D366] hover:bg-[#1EB858] px-3.5 py-2 text-[11.5px] font-extrabold text-[#0A2213] no-underline"
            >
              <MessageCircle size={13} /> WhatsApp
            </a>
          </div>
        </div>
      </div>

      {/* FULL-SCREEN LIGHTBOX */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/94 backdrop-blur-md flex flex-col items-center justify-center p-4"
          onClick={() => setLightboxImg(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxImg(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white border-0 flex items-center justify-center cursor-pointer"
            aria-label="Close preview"
          >
            <X size={20} />
          </button>
          {lightboxImg.idx != null && project.photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation()
                  const prev = (lightboxImg.idx! - 1 + project.photos.length) % project.photos.length
                  setLightboxImg({ url: project.photos[prev]!.url, title: project.photos[prev]!.title, idx: prev })
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white border-0 flex items-center justify-center cursor-pointer"
                aria-label="Previous render"
              >
                <ChevronLeft size={22} />
              </button>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation()
                  const next = (lightboxImg.idx! + 1) % project.photos.length
                  setLightboxImg({ url: project.photos[next]!.url, title: project.photos[next]!.title, idx: next })
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white border-0 flex items-center justify-center cursor-pointer"
                aria-label="Next render"
              >
                <ChevronRight size={22} />
              </button>
            </>
          )}
          <img
            src={lightboxImg.url}
            alt={lightboxImg.title}
            onClick={e => e.stopPropagation()}
            className="max-w-full max-h-[84vh] object-contain rounded-2xl shadow-2xl"
          />
          <div className="mt-3 text-sm font-semibold text-[#F3D289]">{lightboxImg.title}</div>
        </div>
      )}
    </div>
  )
}

export default PromoterShowcasePage
