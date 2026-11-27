import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Box,
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Film,
  Globe,
  Megaphone,
  MessageCircle,
  Presentation,
  Send,
  Sparkles,
} from 'lucide-react'
import { downloadAuthFile, get, openAuthFile, post } from '../lib/api'
import { useMeta } from '../lib/meta'
import { useToast } from '../lib/toast'
import { canAccessSwkAdminLogic } from '@shared/swk-staff-access'
import type { SocialKitBundle, SocialPlatformDraft } from '@shared/social-templates'
import { MediaTour3DEmbed } from './AuthMedia'
import { Property3DViewer } from './brochure/Property3DViewer'
import { PropertyVideoTour } from './brochure/PropertyVideoTour'

type KitEntity = 'properties' | 'developers' | 'communities'

interface CatalogKitManifest {
  entity: KitEntity
  id: number
  title: string
  subtitle: string
  emirate: string
  developerName: string
  communityName: string
  isOffPlan: boolean
  price: number
  priceLabel: string
  handover: string
  yieldPct: number
  unitMix: string
  amenities: string[]
  features: string[]
  images: string[]
  brochureUrl: string
  paymentPlanUrl: string | null
  pptUrl: string
  socialUrl: string
  videoUrl: string | null
  virtualTourUrl: string | null
  model3dUrl: string | null
  floorPlanUrl: string | null
  promo: { badge: string; headline: string; benefits: string[] }
  paymentBreakdown: { planLabel: string; rows: { stage: string; timing: string; pct: number; amountAed: number }[] }
  emirateFeeSummary: {
    emirate: string
    authority: string
    registrationFeePct: number
    registrationFeeAed: number
    adminFeeAed: number
    trusteeFeeAed: number
    totalClosingFeesAed: number
    goldenVisaEligible: boolean
  }
  social: SocialKitBundle
}

const fmtAed = (n: number) => `AED ${Math.round(n).toLocaleString('en-US')}`

export function CatalogMarketingKit({ entity, id, compact = false }: { entity: KitEntity; id: number; compact?: boolean }) {
  const toast = useToast()
  const { can, me } = useMeta()
  const canWebsite = can('website', 'edit')
  const canScheduleSocial = canAccessSwkAdminLogic(me)

  const q = useQuery({
    queryKey: ['catalog-kit', entity, id],
    queryFn: () => get<CatalogKitManifest>(`/api/catalog-kit/${entity}/${id}`),
    enabled: id > 0,
  })

  const [section, setSection] = useState<'assets' | '3d' | 'video' | 'social'>('assets')
  const [platformIdx, setPlatformIdx] = useState(0)
  const [lang, setLang] = useState<'english' | 'arabic'>('english')
  const [copiedKey, setCopiedKey] = useState('')
  const [busyAction, setBusyAction] = useState('')

  if (q.isLoading) {
    return <div className="p-6 text-sm text-muted">Generating branded brochure, PPTX deck, 3D tour &amp; 8-platform social media kit…</div>
  }
  if (q.error || !q.data) {
    return <div className="p-4 rounded-xl bg-red-50 text-red-700 text-sm">Could not load marketing kit: {(q.error as Error)?.message || 'Not available'}</div>
  }

  const kit = q.data
  const slug = kit.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'swk'
  const activeDraft: SocialPlatformDraft | undefined = kit.social.platforms[platformIdx] ?? kit.social.platforms[0]
  const activeVariant = activeDraft ? activeDraft[lang] : null

  const runDownload = async (kind: string, url: string, filename: string, openInTab = false) => {
    setBusyAction(kind)
    try {
      if (openInTab) await openAuthFile(url, filename)
      else await downloadAuthFile(url, filename)
      toast.ok(`Downloaded ${filename}`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusyAction('')
    }
  }

  const copyDraft = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      toast.ok('Social media draft copied to clipboard')
      setTimeout(() => setCopiedKey(''), 1800)
    } catch {
      toast.error('Clipboard copy blocked by browser')
    }
  }

  const downloadAllSocialTxt = () => {
    const content = kit.social.platforms
      .map(p => [
        `================================================================`,
        `PLATFORM: ${p.label} (${p.channel})`,
        `================================================================`,
        `[ENGLISH HEADLINE] ${p.english.headline}`,
        p.english.body,
        ``,
        `[ARABIC HEADLINE] ${p.arabic.headline}`,
        p.arabic.body,
        ``,
      ].join('\n'))
      .join('\n')
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${slug}-social-media-kit.txt`
    a.click()
    URL.revokeObjectURL(a.href)
    toast.ok('Downloaded 8-platform EN/AR social media drafts (.txt)')
  }

  const promoteWebsiteDraft = async () => {
    if (entity !== 'properties') return
    setBusyAction('promote')
    try {
      const r = await post<{ draftNotice: string }>(`/api/catalog-kit/offplan/${id}/promote-website`, {})
      toast.ok(r.draftNotice || 'Saved as Website Studio draft (not auto-published)')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusyAction('')
    }
  }

  const scheduleToSocialStudio = async () => {
    if (!activeDraft || !activeVariant) return
    setBusyAction('schedule')
    try {
      await post('/api/website/social-campaigns', {
        title: `${kit.title} — ${activeDraft.channel} (${lang === 'arabic' ? 'AR' : 'EN'})`,
        channel: activeDraft.channel,
        status: 'Scheduled',
        target_url: kit.social.targetUrl,
        caption: `${activeVariant.headline}\n\n${activeVariant.body}`,
        offer_highlight: kit.social.offerHighlight,
      })
      toast.ok(`Scheduled ${activeDraft.channel} draft in Website & Social Studio`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusyAction('')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Luxury Promotional Header + Instant Document Downloads */}
      <div className="rounded-2xl p-5 text-white shadow-md" style={{ background: 'linear-gradient(135deg, #0e3a2f 0%, #09251e 100%)', border: '1px solid rgba(200,162,83,0.4)' }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider" style={{ background: 'rgba(200,162,83,0.2)', color: '#f3d27a' }}>
              <Sparkles size={12} /> {kit.promo.badge || `${kit.emirate} Marketing Kit`}
            </div>
            <h3 className="m-0 mt-2 text-xl font-bold text-white">{kit.title}</h3>
            <p className="m-0 mt-1 text-[13px] text-white/80">{kit.promo.headline || kit.subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busyAction === 'brochure'}
              onClick={() => void runDownload('brochure', kit.brochureUrl, `${slug}-brochure.pdf`, true)}
              className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold cursor-pointer border-0"
              style={{ background: '#c8a253', color: '#09251e' }}
            >
              <FileText size={14} /> {busyAction === 'brochure' ? 'Building PDF…' : 'Brochure PDF'}
            </button>
            {kit.paymentPlanUrl && (
              <button
                type="button"
                disabled={busyAction === 'payplan'}
                onClick={() => void runDownload('payplan', kit.paymentPlanUrl!, `${slug}-payment-plan.pdf`, true)}
                className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold cursor-pointer bg-white/15 text-white border border-white/25 hover:bg-white/25"
              >
                <FileSpreadsheet size={14} /> {busyAction === 'payplan' ? 'Building…' : 'Payment Plan PDF'}
              </button>
            )}
            <button
              type="button"
              disabled={busyAction === 'ppt'}
              onClick={() => void runDownload('ppt', kit.pptUrl, `${slug}-presentation.pptx`, false)}
              className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold cursor-pointer bg-white/15 text-white border border-white/25 hover:bg-white/25"
            >
              <Presentation size={14} /> {busyAction === 'ppt' ? 'Building PPTX…' : 'PowerPoint (.PPTX)'}
            </button>
            {entity === 'properties' && canWebsite && (
              <button
                type="button"
                disabled={busyAction === 'promote'}
                onClick={() => void promoteWebsiteDraft()}
                className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold cursor-pointer bg-emerald-500/25 text-emerald-100 border border-emerald-400/40 hover:bg-emerald-500/35"
              >
                <Globe size={14} /> {busyAction === 'promote' ? 'Saving Draft…' : 'Promote to Website Draft'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="flex flex-wrap gap-2">
        {[
          { k: 'assets' as const, label: 'Amenities, Payment Plan & Fees', icon: FileText },
          { k: '3d' as const, label: '3D Floor Plan & Masterplan', icon: Box },
          { k: 'video' as const, label: 'Narrated Video Tour', icon: Film },
          { k: 'social' as const, label: `Social Media Studio (${kit.social.platforms.length} Platforms EN+AR)`, icon: Megaphone },
        ].map(t => {
          const Icon = t.icon
          const active = section === t.k
          return (
            <button
              key={t.k}
              type="button"
              onClick={() => setSection(t.k)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold border cursor-pointer transition-colors ${
                active ? 'bg-[#0e3a2f] text-white border-[#0e3a2f]' : 'bg-white text-ink border-line hover:bg-soft'
              }`}
            >
              <Icon size={13} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* SECTION 1: Amenities, Promo Benefits & Emirate Payment/Fee Schedule */}
      {section === 'assets' && (
        <div className={`grid gap-4 ${compact ? 'grid-cols-1' : 'lg:grid-cols-2'}`}>
          <div className="rounded-2xl border border-line bg-white p-4 flex flex-col gap-3">
            <div className="text-xs font-extrabold uppercase tracking-wider text-muted">Signature Amenities &amp; Lifestyle</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {kit.amenities.map((a, i) => (
                <div key={i} className="flex items-center gap-2 rounded-xl bg-soft border border-line/60 px-3 py-2 text-xs font-medium text-ink">
                  <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                  <span>{a}</span>
                </div>
              ))}
            </div>
            {kit.promo.benefits.length > 0 && (
              <>
                <div className="text-xs font-extrabold uppercase tracking-wider text-muted mt-2">Promotion &amp; Investor Highlights</div>
                <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
                  {kit.promo.benefits.map((b, i) => (
                    <li key={i} className="text-xs text-body flex items-start gap-2">
                      <span className="text-[#b78328] font-bold">▸</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-white p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-extrabold uppercase tracking-wider text-muted">
                {kit.emirate} Government Fees &amp; Payment Milestones
              </div>
              <span className="rounded-full bg-[#f8f5ef] border border-[#e3d9c6] px-2.5 py-0.5 text-[11px] font-bold text-[#0e3a2f]">
                {kit.emirateFeeSummary.registrationFeePct}% {kit.emirate === 'Abu Dhabi' ? 'ADM' : 'DLD'}
              </span>
            </div>
            <div className="text-xs text-muted">{kit.paymentBreakdown.planLabel}</div>
            {kit.paymentBreakdown.rows.length > 0 && (
              <div className="rounded-xl border border-line overflow-hidden">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-soft text-left text-muted">
                      <th className="p-2 font-bold">Milestone</th>
                      <th className="p-2 font-bold">Timing</th>
                      <th className="p-2 font-bold text-right">%</th>
                      <th className="p-2 font-bold text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kit.paymentBreakdown.rows.map((r, idx) => (
                      <tr key={idx} className="border-t border-line/60">
                        <td className="p-2 font-medium text-ink">{r.stage}</td>
                        <td className="p-2 text-muted">{r.timing}</td>
                        <td className="p-2 text-right font-bold">{r.pct}%</td>
                        <td className="p-2 text-right font-mono font-semibold">{fmtAed(r.amountAed)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
              <div className="rounded-xl bg-soft p-2.5">
                <div className="text-[10.5px] uppercase text-muted font-bold">{kit.emirateFeeSummary.authority.split('(')[0].trim()}</div>
                <div className="font-mono font-bold text-ink mt-0.5">{fmtAed(kit.emirateFeeSummary.totalClosingFeesAed)} total closing</div>
              </div>
              <div className="rounded-xl bg-soft p-2.5">
                <div className="text-[10.5px] uppercase text-muted font-bold">UAE Golden Visa</div>
                <div className="font-bold text-emerald-700 mt-0.5">{kit.emirateFeeSummary.goldenVisaEligible ? '10-Year Visa Eligible' : 'AED 2M+ Portfolio Eligible'}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: Interactive 3D Floor Plan & Satellite Masterplan */}
      {section === '3d' && (
        <div className="flex flex-col gap-4">
          <Property3DViewer
            title={kit.title}
            type={entity === 'developers' ? 'Master Portfolio' : entity === 'communities' ? 'Master Community' : kit.unitMix}
            location={`${kit.communityName}, ${kit.emirate}`}
          />
          {(kit.virtualTourUrl || kit.model3dUrl) && (
            <MediaTour3DEmbed url={(kit.virtualTourUrl || kit.model3dUrl)!} title={`${kit.title} — 3D Satellite & Virtual Tour`} />
          )}
        </div>
      )}

      {/* SECTION 3: Voice-Narrated Cinema Video Tour */}
      {section === 'video' && (
        <PropertyVideoTour
          title={kit.title}
          purpose={kit.isOffPlan ? 'Off-Plan Launch' : 'Signature UAE Portfolio'}
          location={`${kit.communityName}, ${kit.emirate}`}
          developer={kit.developerName}
          priceLabel={kit.priceLabel}
          price={kit.price}
          paymentPlan={kit.paymentBreakdown.planLabel}
          features={kit.amenities}
          images={kit.images.length ? kit.images : ['/media/communities/downtown-dubai.webp']}
          videoUrl={kit.videoUrl || undefined}
        />
      )}

      {/* SECTION 4: 8-Platform Social Media Templates & Messaging Drafts (EN + AR) */}
      {section === 'social' && activeDraft && activeVariant && (
        <div className="rounded-2xl border border-line bg-white p-4 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {kit.social.platforms.map((p, idx) => (
                <button
                  key={p.platform}
                  type="button"
                  onClick={() => setPlatformIdx(idx)}
                  className={`rounded-full px-3 py-1 text-xs font-bold border cursor-pointer ${
                    idx === platformIdx ? 'bg-[#0e3a2f] text-white border-[#0e3a2f]' : 'bg-soft text-ink border-line hover:bg-white'
                  }`}
                >
                  {p.channel}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setLang('english')}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold border cursor-pointer ${lang === 'english' ? 'bg-[#c8a253] text-[#09251e] border-[#c8a253]' : 'bg-white text-ink border-line'}`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setLang('arabic')}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold border cursor-pointer ${lang === 'arabic' ? 'bg-[#c8a253] text-[#09251e] border-[#c8a253]' : 'bg-white text-ink border-line'}`}
              >
                العربية
              </button>
            </div>
          </div>

          <div dir={lang === 'arabic' ? 'rtl' : 'ltr'} className="rounded-xl border border-line bg-[#faf8f4] p-4 flex flex-col gap-2">
            <div className="text-xs font-bold uppercase tracking-wider text-[#8a621c]">{activeDraft.label}</div>
            <div className="text-sm font-bold text-ink">{activeVariant.headline}</div>
            <pre className="m-0 whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-body">{activeVariant.body}</pre>
            <div className="text-xs font-semibold text-emerald-800 pt-1">CTA: {activeVariant.cta}</div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copyDraft(`${activeVariant.headline}\n\n${activeVariant.body}`, `${activeDraft.platform}-${lang}`)}
              className="btn green"
            >
              {copiedKey === `${activeDraft.platform}-${lang}` ? <Check size={14} /> : <Copy size={14} />}
              {copiedKey === `${activeDraft.platform}-${lang}` ? 'Copied!' : `Copy ${activeDraft.channel} Draft`}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${activeVariant.headline}\n\n${activeVariant.body}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn outline no-underline"
            >
              <MessageCircle size={14} /> Send on WhatsApp
            </a>
            <button type="button" onClick={downloadAllSocialTxt} className="btn outline">
              <Download size={14} /> Download All 8 Platforms (.TXT)
            </button>
            {canScheduleSocial && (
              <button
                type="button"
                disabled={busyAction === 'schedule'}
                onClick={() => void scheduleToSocialStudio()}
                className="btn outline"
              >
                {busyAction === 'schedule' ? <CalendarClock size={14} /> : <Send size={14} />}
                {busyAction === 'schedule' ? 'Scheduling…' : 'Schedule in Social Studio'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
