import { Suspense, lazy } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowUpRight,
  Briefcase,
  Calculator,
  Camera,
  ClipboardCheck,
  Compass,
  ExternalLink,
  FileCode2,
  Languages,
  MapPinned,
  QrCode,
  ScanText,
  Search,
  Wrench,
} from 'lucide-react'
import { useMeta } from '../../lib/meta'
import { ModuleHeader, Pill, Segmented } from '../../swk/ui'
import { Loading } from '../../ui/kit'

const WordStudioPage = lazy(() => import('./WordStudioPage'))
const DocumentToolsPage = lazy(() => import('./DocumentToolsPage'))
const TranslatorPage = lazy(() => import('./TranslatorPage'))
const UnifiedSearchPage = lazy(() => import('./UnifiedSearchPage'))
const ToolkitPage = lazy(() => import('./ToolkitPage'))

type HubTab = 'overview' | 'word' | 'docs' | 'translator' | 'search' | 'calculators' | 'field'

const HUB_TABS: { value: HubTab; label: string }[] = [
  { value: 'overview', label: 'All Utilities' },
  { value: 'word', label: 'Word Studio' },
  { value: 'docs', label: 'PDF & OCR' },
  { value: 'translator', label: 'Translator' },
  { value: 'search', label: 'Unified Search' },
  { value: 'calculators', label: 'UAE Calculators & QR' },
  { value: 'field', label: 'Field Day Pack' },
]

interface HubCardDef {
  key: HubTab
  title: string
  eyebrow: string
  blurb: string
  icon: typeof FileCode2
  route: string
  badge?: string
}

const PILLAR_CARDS: HubCardDef[] = [
  {
    key: 'word',
    title: 'SWK Word Studio',
    eyebrow: 'DOCX · PDF · RTL',
    blurb: 'Private rich-text drafting with official SWK letterhead, inline AI Assist, and instant .docx/.pdf export.',
    icon: FileCode2,
    route: '/utilities/word',
    badge: 'New',
  },
  {
    key: 'docs',
    title: 'PDF, OCR & Camera Scan',
    eyebrow: 'SCAN · CONVERT · WATERMARK',
    blurb: 'EN/AR OCR with AI/Word/Translator handoffs, live multi-page camera scan to PDF, PDF-to-Word .docx, and PDF watermarking.',
    icon: ScanText,
    route: '/document-tools',
    badge: 'Upgraded',
  },
  {
    key: 'translator',
    title: 'UAE Real Estate Translator',
    eyebrow: '9 LANGUAGES · GLOSSARY LOCK',
    blurb: 'Side-by-side EN/AR/HI/UR/RU/ZH/FR/ES/FA translation with RERA/Ejari/Oqood terminology lock, document upload, and TTS.',
    icon: Languages,
    route: '/utilities/translator',
    badge: 'New',
  },
  {
    key: 'search',
    title: 'SWK Unified Search',
    eyebrow: 'INTERNAL · WEBSITE · MARKET · WEB',
    blurb: 'Role-scoped search across SWK Internal, SWKPROPERTY.COM listings, 24 Dubai communities, and Live Web with AI brief citations.',
    icon: Search,
    route: '/utilities/search',
    badge: 'New',
  },
  {
    key: 'calculators',
    title: 'UAE Calculators, PDC & Public QR',
    eyebrow: 'DLD · CBUAE · CONVERTERS · QR',
    blurb: 'All 8 Dubai deal calculators plus sqft/sqm & multi-currency converters, PDC cheque schedules, and branded public QR generator.',
    icon: Calculator,
    route: '/toolkit',
    badge: '11 Tools',
  },
  {
    key: 'field',
    title: 'Field Day Pack',
    eyebrow: 'ATTENDANCE · SITE VISITS · REPORTS',
    blurb: 'One-tap access to Daily Reports, Office Reception QR Check-In, Field Duty GPS sessions, and Property Inspections.',
    icon: Compass,
    route: '/utilities?tab=field',
  },
]

export default function UtilitiesHubPage() {
  const { can } = useMeta()
  const [sp, setSp] = useSearchParams()
  const rawTab = sp.get('tab') as HubTab | null
  const active: HubTab = HUB_TABS.some(t => t.value === rawTab) ? rawTab! : 'overview'

  const setTab = (next: HubTab) => {
    setSp(prev => {
      const n = new URLSearchParams(prev)
      if (next === 'overview') n.delete('tab')
      else n.set('tab', next)
      if (next !== 'calculators') n.delete('tool')
      if (next !== 'word') n.delete('id')
      return n
    }, { replace: true })
  }

  const fieldLinks = [
    {
      title: 'Daily Work Report',
      desc: 'Log viewings, client follow-ups, blockers, and end-of-day outcomes.',
      to: '/e/daily_reports',
      icon: ClipboardCheck,
      show: true,
    },
    {
      title: 'Reception QR Check-In',
      desc: 'Scan the office reception screen on company Wi-Fi to mark daily attendance.',
      to: '/reception-qr',
      icon: QrCode,
      show: true,
    },
    {
      title: 'Field Duty & Site Visits',
      desc: 'Start and log verified GPS client viewings, developer visits, and trustee runs.',
      to: '/field-duty',
      icon: MapPinned,
      show: true,
    },
    {
      title: 'Property Inspection App',
      desc: 'Move-in / move-out condition checklist, photo capture, and tenant sign-off.',
      to: '/inspect',
      icon: Camera,
      show: can('leases', 'view'),
    },
    {
      title: 'My Assigned Deals',
      desc: 'View your dispatched CRM Vault units with masked calling and status updates.',
      to: '/my-deals',
      icon: Briefcase,
      show: true,
    },
  ].filter(item => item.show)

  const currentMeta = PILLAR_CARDS.find(c => c.key === active)

  return (
    <div className="mx-auto max-w-[1640px] grid gap-5">
      <ModuleHeader
        eyebrow="SWK OMNI UTILITY SUITE"
        title="Real Estate Utility Suite"
        subtitle="Everything an SWK advisor or manager needs on the move — Word Studio, PDF & Camera OCR, UAE Translator, Unified Search, 11 Deal Calculators, Public QR, and Field Day tools."
        icon={<Wrench size={24} />}
        actions={
          currentMeta && active !== 'field' ? (
            <Link to={currentMeta.route} className="btn outline sm">
              <ExternalLink size={14} /> Open Full Screen
            </Link>
          ) : undefined
        }
      />

      <div className="overflow-x-auto pb-1">
        <Segmented value={active} onChange={setTab} options={HUB_TABS} layoutId="utilities-hub-tabs" />
      </div>

      {active === 'overview' && (
        <div className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PILLAR_CARDS.map(card => (
              <div
                key={card.key}
                className="rounded-2xl border border-line bg-card p-6 flex flex-col gap-3 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex size-11 items-center justify-center rounded-full bg-[#121212] text-[#51fec0]">
                    <card.icon size={20} />
                  </span>
                  {card.badge && <Pill tone="oasis">{card.badge}</Pill>}
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted">{card.eyebrow}</div>
                  <h2 className="m-0 mt-1 text-[18px] font-semibold text-ink">{card.title}</h2>
                  <p className="m-0 mt-1.5 text-[13px] text-muted leading-relaxed">{card.blurb}</p>
                </div>
                <div className="mt-auto pt-3 flex items-center gap-2">
                  <button type="button" className="btn green sm flex-1" onClick={() => setTab(card.key)}>
                    Launch Here
                  </button>
                  {card.key !== 'field' && (
                    <Link to={card.route} className="btn outline sm" aria-label={`Open ${card.title} full screen`}>
                      <ArrowUpRight size={15} />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Quick Field Day Strip */}
          <section className="rounded-2xl border border-line bg-card p-5 grid gap-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#0e9f6e]">Quick Launch</div>
                <h2 className="m-0 text-[16px] font-semibold text-ink">Field Day Pack</h2>
              </div>
              <button type="button" className="btn outline sm" onClick={() => setTab('field')}>
                View All Field Tools
              </button>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
              {fieldLinks.map(item => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="rounded-xl border border-line bg-soft p-3.5 flex items-center gap-3 no-underline text-ink hover:bg-hover transition-colors"
                >
                  <span className="flex size-9 items-center justify-center rounded-lg bg-[#121212] text-[#51fec0] shrink-0">
                    <item.icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{item.title}</span>
                    <span className="block truncate text-[11px] text-muted">Open tool</span>
                  </span>
                  <ArrowUpRight size={14} className="text-muted shrink-0" />
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}

      {active === 'word' && (
        <Suspense fallback={<Loading label="Loading Word Studio…" />}>
          <WordStudioPage embedded />
        </Suspense>
      )}

      {active === 'docs' && (
        <Suspense fallback={<Loading label="Loading Document Tools…" />}>
          <DocumentToolsPage embedded />
        </Suspense>
      )}

      {active === 'translator' && (
        <Suspense fallback={<Loading label="Loading UAE Translator…" />}>
          <TranslatorPage embedded />
        </Suspense>
      )}

      {active === 'search' && (
        <Suspense fallback={<Loading label="Loading Unified Search…" />}>
          <UnifiedSearchPage embedded />
        </Suspense>
      )}

      {active === 'calculators' && (
        <Suspense fallback={<Loading label="Loading UAE Deal Toolkit…" />}>
          <ToolkitPage embedded />
        </Suspense>
      )}

      {active === 'field' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fieldLinks.map(item => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-2xl border border-line bg-card p-6 flex flex-col gap-3 no-underline text-ink hover:shadow-md transition-shadow"
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-[#121212] text-[#51fec0]">
                <item.icon size={20} />
              </span>
              <div>
                <h2 className="m-0 text-[17px] font-semibold text-ink">{item.title}</h2>
                <p className="m-0 mt-1 text-[13px] text-muted leading-relaxed">{item.desc}</p>
              </div>
              <span className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-[#0e9f6e]">
                Open {item.title} <ArrowUpRight size={14} />
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
