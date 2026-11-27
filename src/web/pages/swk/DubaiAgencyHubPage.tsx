import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Award,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  FileCode2,
  FileSpreadsheet,
  Globe,
  Scale,
  ShieldAlert,
  Sparkles,
  Trophy,
  Zap,
} from 'lucide-react'
import { downloadAuthFile, get, post } from '../../lib/api'
import { useToast } from '../../lib/toast'
import { ErrorBox, Loading } from '../../ui/kit'
import { BracketLink, SwissHeroHeader } from '../../components/ui/SwissPrimitives'
import { GlossyBlackCard, ShineButton } from '../../components/ui/PremiumPrimitives'

type HubTab = 'portals' | 'sla-matcher' | 'compare' | 'leaderboard' | 'compliance'

const aed = (n: number) => 'AED ' + Math.round(Number(n) || 0).toLocaleString('en-US')

export default function DubaiAgencyHubPage() {
  const toast = useToast()
  const [tab, setTab] = useState<HubTab>('portals')
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null)
  const [matchResult, setMatchResult] = useState<any>(null)
  const [matchBusy, setMatchBusy] = useState(false)

  // 3-Project Investor Comparator state
  const [pickedIds, setPickedIds] = useState<number[]>([])
  const [downPct, setDownPct] = useState(20)
  const [ratePct, setRatePct] = useState(4.25)
  const [loanYears, setLoanYears] = useState(25)
  const [scPsf, setScPsf] = useState(16)
  const [cmpResult, setCmpResult] = useState<any>(null)
  const [cmpBusy, setCmpBusy] = useState(false)

  const ovQ = useQuery({
    queryKey: ['dubai-agency-hub'],
    queryFn: () => get<any>('/api/agency-hub/overview'),
    staleTime: 60_000,
  })

  const d = ovQ.data
  const s = d?.summary ?? {}
  const listings: any[] = d?.listings ?? []
  const slaLeads: any[] = d?.sla_leads ?? []
  const leaderboard: any[] = d?.leaderboard ?? []
  const expiries: any[] = d?.expiries ?? []

  const defaultCompareIds = useMemo(() => listings.slice(0, 3).map((x: any) => x.id), [listings])
  const activeCompareIds = pickedIds.length ? pickedIds : defaultCompareIds

  const runMatch = async (leadId: number) => {
    setSelectedLeadId(leadId)
    setMatchBusy(true)
    try {
      const res = await get<any>(`/api/agency-hub/match/${leadId}`)
      setMatchResult(res)
      toast.ok(`Found ${res.matches?.length ?? 0} matching properties`)
    } catch (e: any) {
      toast.error(e.message || 'Could not match properties')
    } finally {
      setMatchBusy(false)
    }
  }

  const toggleCompareId = (id: number) => {
    const base = pickedIds.length ? [...pickedIds] : [...defaultCompareIds]
    if (base.includes(id)) {
      const next = base.filter(x => x !== id)
      setPickedIds(next)
    } else if (base.length < 3) {
      setPickedIds([...base, id])
    } else {
      toast.ok('Select up to 3 projects at a time to compare side-by-side.')
    }
  }

  const runCompare = async () => {
    if (!activeCompareIds.length) {
      toast.error('Select at least 1 project first')
      return
    }
    setCmpBusy(true)
    try {
      const res = await post<any>('/api/agency-hub/compare', {
        property_ids: activeCompareIds,
        down_payment_pct: downPct,
        interest_rate_pct: ratePct,
        loan_years: loanYears,
        service_charge_psf: scPsf,
      })
      setCmpResult(res)
    } catch (e: any) {
      toast.error(e.message || 'Comparison failed')
    } finally {
      setCmpBusy(false)
    }
  }

  const exportCompare = async (format: 'pdf' | 'docx' | 'jpeg') => {
    if (!activeCompareIds.length) return
    try {
      const res = await fetch('/api/agency-hub/compare/export', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-SWK-Client': 'web' },
        body: JSON.stringify({
          property_ids: activeCompareIds,
          down_payment_pct: downPct,
          interest_rate_pct: ratePct,
          loan_years: loanYears,
          service_charge_psf: scPsf,
          format,
        }),
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `SWK-Investor-Comparison.${format === 'jpeg' ? 'jpg' : format}`
      a.click()
      URL.revokeObjectURL(url)
      toast.ok(`Downloaded ${format.toUpperCase()} comparison sheet`)
    } catch (e: any) {
      toast.error(e.message || 'Export failed')
    }
  }

  const copyText = async (txt: string, label: string) => {
    try {
      await navigator.clipboard.writeText(txt)
      toast.ok(`${label} copied`)
    } catch {
      toast.error('Copy failed')
    }
  }

  if (ovQ.error) return <ErrorBox error={ovQ.error} onRetry={() => void ovQ.refetch()} />
  if (!d) return <Loading label="Loading Dubai Agency Hub…" />

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-12">
      <SwissHeroHeader
        eyebrow="Dubai Real Estate Agency Suite · PropSpace · Pixxi · Reelly · Behomes"
        badge={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0a0b0e] border border-[#d4a955]/45 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#ebc97c]">
            <Zap size={12} /> Pro Agency Tools
          </span>
        }
        title="Dubai Agency Hub"
        subtitle="Everything top Dubai brokerages rely on — in simple English: Property Finder & Bayut XML feeds, Listing Quality Scores, 5-minute Lead SLA alerts, 1-Click Smart Property Matching, 3-Project Golden Visa & ROI Comparisons, Live Broker Leaderboard, and UAE Compliance Expiry Alerts."
        actions={
          <>
            <button
              type="button"
              onClick={() => void downloadAuthFile('/api/agency-hub/feeds/propertyfinder.xml', 'swk-propertyfinder-feed.xml').catch((e: any) => toast.error(e.message))}
              className="btn outline sm"
            >
              <Globe size={14} /> Property Finder XML
            </button>
            <button
              type="button"
              onClick={() => void downloadAuthFile('/api/agency-hub/feeds/bayut.xml', 'swk-bayut-dubizzle-feed.xml').catch((e: any) => toast.error(e.message))}
              className="btn outline sm"
            >
              <Globe size={14} /> Bayut / Dubizzle XML
            </button>
            <BracketLink to="/admin/backup" variant="dark" size="sm">
              <FileSpreadsheet size={13} className="text-[#ebc97c]" /> Excel &amp; Daily Backup
            </BracketLink>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <GlossyBlackCard accent="gold" className="p-4">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.15em] text-[#ebc97c]">
              <span>Avg Listing Quality</span> <BadgeCheck size={15} />
            </div>
            <div className="mt-2 font-mono text-[24px] font-bold text-white tabular-nums">{s.avg_quality_score ?? 0}%</div>
            <div className="mt-0.5 text-xs text-white/70">{s.pf_enabled ?? 0} PF · {s.bayut_enabled ?? 0} Bayut live</div>
          </GlossyBlackCard>
          <GlossyBlackCard accent="crimson" className="p-4">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.15em] text-[#fda4af]">
              <span>5-Min Lead SLA Alerts</span> <Clock3 size={15} />
            </div>
            <div className="mt-2 font-mono text-[24px] font-bold text-white tabular-nums">{s.sla_breached_count ?? 0}</div>
            <div className="mt-0.5 text-xs text-white/70">{s.open_leads ?? 0} open leads · {s.sla_met_count ?? 0} met 5-min SLA</div>
          </GlossyBlackCard>
          <GlossyBlackCard accent="emerald" className="p-4">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.15em] text-[#34d399]">
              <span>Active Brokers Ranked</span> <Trophy size={15} />
            </div>
            <div className="mt-2 font-mono text-[24px] font-bold text-[#34d399] tabular-nums">{leaderboard.length}</div>
            <div className="mt-0.5 text-xs text-white/70">Live deals, viewings &amp; monthly targets</div>
          </GlossyBlackCard>
          <GlossyBlackCard accent="tricolor" className="p-4">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.15em] text-[#ebc97c]">
              <span>Compliance Expiries</span> <ShieldAlert size={15} />
            </div>
            <div className="mt-2 font-mono text-[24px] font-bold text-white tabular-nums">{s.expiries_total ?? 0}</div>
            <div className="mt-0.5 text-xs text-white/70">{s.expiries_critical ?? 0} urgent (≤15 days or expired)</div>
          </GlossyBlackCard>
        </div>
      </SwissHeroHeader>

      {/* Clean Tab Strip */}
      <div className="flex flex-wrap gap-2">
        {([
          ['portals', 'Portal XML & Listing Quality', Globe],
          ['sla-matcher', '5-Min Lead SLA & Smart Matcher', Sparkles],
          ['compare', '3-Project ROI & Golden Visa', Scale],
          ['leaderboard', 'Broker Leaderboard & Targets', Trophy],
          ['compliance', 'Expiry Radar (Trakheesi / Ejari)', ShieldAlert],
        ] as const).map(([key, label, Icon]) => {
          const active = tab === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold cursor-pointer transition-all ${
                active
                  ? 'bg-[#0a0b0e] text-[#ebc97c] border border-[#d4a955]/50 shadow-[0_12px_26px_-10px_rgba(10,11,14,0.5)]'
                  : 'bg-white text-[#0a0b0e] border border-black/[0.1] hover:border-[#d4a955]/50'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          )
        })}
      </div>

      {/* ======================================================== TAB 1: PORTALS & QUALITY SCORE */}
      {tab === 'portals' && (
        <section className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <GlossyBlackCard accent="gold" className="p-5 flex flex-col justify-between gap-4">
              <div>
                <div className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#ebc97c]">Property Finder XML Feed</div>
                <h2 className="m-0 mt-1 font-display text-lg font-bold text-white">Direct Portal Syndication Ready</h2>
                <p className="m-0 mt-1.5 text-xs text-white/75 leading-relaxed">
                  Standards-compliant XML feed with Trakheesi permits, AED prices, areas, bedrooms, and SWK advisory desk contact details (Zero-Shabib protected).
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ShineButton
                  variant="gold"
                  size="sm"
                  onClick={() => void downloadAuthFile('/api/agency-hub/feeds/propertyfinder.xml', 'swk-propertyfinder-feed.xml').catch((e: any) => toast.error(e.message))}
                >
                  <Download size={13} /> Download XML
                </ShineButton>
                <ShineButton
                  variant="obsidian"
                  size="sm"
                  onClick={() => void copyText(`${window.location.origin}/api/agency-hub/feeds/propertyfinder.xml`, 'Property Finder feed URL')}
                >
                  <Copy size={13} /> Copy Feed URL
                </ShineButton>
              </div>
            </GlossyBlackCard>

            <GlossyBlackCard accent="emerald" className="p-5 flex flex-col justify-between gap-4">
              <div>
                <div className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#34d399]">Bayut &amp; Dubizzle XML Feed</div>
                <h2 className="m-0 mt-1 font-display text-lg font-bold text-white">Dual-Portal Bayut / Dubizzle Export</h2>
                <p className="m-0 mt-1.5 text-xs text-white/75 leading-relaxed">
                  Instant XML export mapped to Bayut &amp; Dubizzle fields (Buy/Rent purpose, SQFT size, off-plan flag, RERA permit, and portal tags).
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ShineButton
                  variant="emerald"
                  size="sm"
                  onClick={() => void downloadAuthFile('/api/agency-hub/feeds/bayut.xml', 'swk-bayut-dubizzle-feed.xml').catch((e: any) => toast.error(e.message))}
                >
                  <Download size={13} /> Download XML
                </ShineButton>
                <ShineButton
                  variant="obsidian"
                  size="sm"
                  onClick={() => void copyText(`${window.location.origin}/api/agency-hub/feeds/bayut.xml`, 'Bayut feed URL')}
                >
                  <Copy size={13} /> Copy Feed URL
                </ShineButton>
              </div>
            </GlossyBlackCard>
          </div>

          <div className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="m-0 text-base font-bold text-ink">Listing Quality Scorecard (0–100%)</h3>
                <p className="m-0 text-xs text-muted">Fix missing permits, photos, or descriptions so listings rank higher on Property Finder &amp; Bayut.</p>
              </div>
              <Link to="/e/properties" className="btn outline sm no-underline">Open All Projects</Link>
            </div>
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Project / Listing</th>
                    <th>Community</th>
                    <th className="num">Price / Rent</th>
                    <th>Permit</th>
                    <th>Portals</th>
                    <th>Quality Score</th>
                    <th>What To Add</th>
                  </tr>
                </thead>
                <tbody>
                  {listings.slice(0, 40).map(p => (
                    <tr key={p.id}>
                      <td>
                        <Link to={`/e/properties/${p.id}`} className="link font-semibold">{p.title}</Link>
                        <div className="text-[11px] text-muted font-mono">{p.property_no} · {p.bedrooms || 'Studio'} BR</div>
                      </td>
                      <td>{p.community}</td>
                      <td className="num font-mono font-semibold">
                        {p.price_aed > 0 ? aed(p.price_aed) : p.rent_annual_aed > 0 ? `${aed(p.rent_annual_aed)}/yr` : '—'}
                      </td>
                      <td className="font-mono text-xs">{p.rera_permit_no || <span className="text-[#96202f] font-semibold">Missing</span>}</td>
                      <td>
                        <div className="flex gap-1">
                          {p.syndicate_pf && <span className="rounded bg-[#0a0b0e] text-[#ebc97c] px-1.5 py-0.5 text-[10px] font-bold">PF</span>}
                          {p.syndicate_bayut && <span className="rounded bg-[#1e6b43] text-white px-1.5 py-0.5 text-[10px] font-bold">Bayut</span>}
                          {p.syndicate_dubizzle && <span className="rounded bg-[#96202f] text-white px-1.5 py-0.5 text-[10px] font-bold">DBZ</span>}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className={`font-mono font-bold text-xs ${p.quality_score >= 85 ? 'text-[#1e6b43]' : p.quality_score >= 65 ? 'text-[#9e7427]' : 'text-[#96202f]'}`}>
                            {p.quality_score}%
                          </span>
                          <span className="text-[10.5px] text-muted">{p.grade}</span>
                        </div>
                      </td>
                      <td className="text-xs text-muted">{p.missing.length ? p.missing.join(', ') : <span className="text-[#1e6b43] font-semibold">100% Complete</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ======================================================== TAB 2: 5-MIN SLA & SMART MATCHER */}
      {tab === 'sla-matcher' && (
        <section className="grid gap-5 lg:grid-cols-12 items-start">
          <div className="card p-5 lg:col-span-7">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="m-0 text-base font-bold text-ink">5-Minute Lead Response Monitor</h3>
                <p className="m-0 text-xs text-muted">Click “Match Homes” on any buyer or tenant lead to get top property matches &amp; a ready WhatsApp pitch.</p>
              </div>
              <Link to="/e/leads?new=1" className="btn green sm no-underline">Add New Lead</Link>
            </div>
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Requirement</th>
                    <th>Advisor</th>
                    <th>5-Min SLA</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {slaLeads.length === 0 ? (
                    <tr><td colSpan={5} className="text-center text-muted py-6">No active leads yet. Add a lead to test 1-click matching.</td></tr>
                  ) : slaLeads.map(l => (
                    <tr key={l.id} className={selectedLeadId === l.id ? 'bg-[#faf6ec]' : ''}>
                      <td>
                        <Link to={`/e/leads/${l.id}`} className="link font-semibold">{l.client_name}</Link>
                        <div className="text-[11px] text-muted">{l.source} · {l.status}</div>
                      </td>
                      <td className="text-xs">
                        <div><b>{l.budget_aed > 0 ? aed(l.budget_aed) : 'Flexible budget'}</b></div>
                        <div className="text-muted">{l.target_area || 'Any area'} · {l.bedrooms_wanted ? `${l.bedrooms_wanted} BR` : l.interest}</div>
                      </td>
                      <td className="text-xs">{l.advisor_name}</td>
                      <td>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${
                          l.sla_status === 'MET_5MIN'
                            ? 'bg-[#ecfdf5] text-[#1e6b43]'
                            : l.sla_status === 'WAITING_LIVE'
                              ? 'bg-[#fef9c3] text-[#854d0e]'
                              : 'bg-[#fef2f2] text-[#96202f]'
                        }`}>
                          {l.sla_status === 'MET_5MIN' ? 'On Time' : l.sla_status === 'WAITING_LIVE' ? `${l.wait_minutes}m live` : `${l.wait_minutes}m overdue`}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => void runMatch(l.id)}
                          disabled={matchBusy && selectedLeadId === l.id}
                          className="btn outline sm"
                        >
                          <Sparkles size={12} /> Match Homes
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <GlossyBlackCard accent="gold" className="p-5 lg:col-span-5">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#ebc97c]">1-Click Smart Matcher</div>
            <h3 className="m-0 mt-1 font-display text-lg font-bold text-white">
              {matchResult ? `Best Matches for ${matchResult.lead?.client_name}` : 'Select a Lead to Match'}
            </h3>
            <p className="m-0 mt-1 text-xs text-white/70">
              Scores every active project by budget, bedrooms, community, payment plan, and Trakheesi readiness.
            </p>

            {matchBusy && <div className="mt-5 text-xs text-[#ebc97c]">Matching properties…</div>}
            {!matchBusy && !matchResult && (
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-5 text-xs text-white/75">
                Click <b>Match Homes</b> on any lead on the left to generate instant matches and a ready-to-send WhatsApp message.
              </div>
            )}
            {!matchBusy && matchResult && (
              <div className="mt-4 space-y-3 max-h-[540px] overflow-y-auto pr-1">
                {(matchResult.matches ?? []).map((m: any) => (
                  <div key={m.property_id} className="rounded-2xl border border-white/12 bg-white/[0.06] p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link to={`/e/properties/${m.property_id}`} className="font-bold text-sm text-white no-underline hover:text-[#ebc97c]">
                          {m.title}
                        </Link>
                        <div className="text-[11px] text-white/70">{m.community} · {m.bedrooms || 'Studio'} BR · {m.area_sqft} sf</div>
                      </div>
                      <span className="rounded-full bg-[#d4a955] px-2.5 py-0.5 font-mono text-xs font-bold text-[#0a0b0e] shrink-0">
                        {m.match_score}% match
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-bold text-[#ebc97c]">{m.price_aed > 0 ? aed(m.price_aed) : 'Price on request'}</span>
                      <button
                        type="button"
                        onClick={() => void copyText(m.whatsapp_pitch, 'WhatsApp client pitch')}
                        className="inline-flex items-center gap-1 rounded-full bg-[#1e6b43] px-3 py-1 text-[11px] font-bold text-white border-0 cursor-pointer hover:bg-[#15803d]"
                      >
                        <Copy size={11} /> Copy WhatsApp Pitch
                      </button>
                    </div>
                    {m.reasons?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {m.reasons.map((r: string) => (
                          <span key={r} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/85">{r}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </GlossyBlackCard>
        </section>
      )}

      {/* ======================================================== TAB 3: 3-PROJECT INVESTOR COMPARATOR */}
      {tab === 'compare' && (
        <section className="space-y-5">
          <div className="card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="m-0 text-base font-bold text-ink">Compare Up To 3 Projects Side-by-Side</h3>
                <p className="m-0 text-xs text-muted">Instant Dubai 4% DLD / Abu Dhabi 2% ADM fees, Net ROI, Monthly Mortgage &amp; 10-Year UAE Golden Visa eligibility.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ShineButton variant="obsidian" size="sm" onClick={() => void runCompare()} disabled={cmpBusy}>
                  <Scale size={14} /> {cmpBusy ? 'Calculating…' : `Compare (${activeCompareIds.length})`}
                </ShineButton>
                <button type="button" onClick={() => void exportCompare('pdf')} className="btn outline sm"><Download size={13} /> PDF</button>
                <button type="button" onClick={() => void exportCompare('docx')} className="btn outline sm"><FileCode2 size={13} /> Word</button>
                <button type="button" onClick={() => void exportCompare('jpeg')} className="btn outline sm"><Download size={13} /> JPEG</button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="label">Down Payment %</label>
                <input className="input" type="number" min={10} max={100} value={downPct} onChange={e => setDownPct(Number(e.target.value) || 20)} />
              </div>
              <div>
                <label className="label">Mortgage Interest %</label>
                <input className="input" type="number" step="0.1" min={0} max={15} value={ratePct} onChange={e => setRatePct(Number(e.target.value) || 4.25)} />
              </div>
              <div>
                <label className="label">Loan Term (Years)</label>
                <input className="input" type="number" min={5} max={25} value={loanYears} onChange={e => setLoanYears(Number(e.target.value) || 25)} />
              </div>
              <div>
                <label className="label">Service Charge (AED/sqft)</label>
                <input className="input" type="number" min={0} max={100} value={scPsf} onChange={e => setScPsf(Number(e.target.value) || 16)} />
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {listings.slice(0, 18).map(p => {
                const selected = activeCompareIds.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleCompareId(p.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all ${
                      selected
                        ? 'bg-[#0a0b0e] text-[#ebc97c] border border-[#d4a955]/60'
                        : 'bg-[#f7f7f9] text-[#0a0b0e] border border-black/[0.08] hover:border-[#0a0b0e]'
                    }`}
                  >
                    {selected ? '✓ ' : '+ '}
                    {p.title}
                  </button>
                )
              })}
            </div>
          </div>

          {cmpResult?.items?.length > 0 && (
            <div className="grid gap-4 md:grid-cols-3">
              {cmpResult.items.map((item: any) => (
                <GlossyBlackCard key={item.id} accent={item.golden_visa_eligible ? 'gold' : 'emerald'} className="p-5 flex flex-col justify-between gap-4">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#ebc97c]">{item.community} · {item.emirate}</span>
                      {item.golden_visa_eligible && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#d4a955] px-2.5 py-0.5 text-[10px] font-bold text-[#0a0b0e]">
                          <Award size={11} /> 10Y Golden Visa
                        </span>
                      )}
                    </div>
                    <h4 className="m-0 mt-1.5 font-display text-lg font-bold text-white">{item.title}</h4>
                    <div className="text-xs text-white/70">{item.developer} · {item.bedrooms || 'Studio'} BR · {item.area_sqft} sq ft</div>
                    <div className="mt-3 font-mono text-2xl font-bold text-[#ebc97c]">{aed(item.price_aed)}</div>
                    <div className="text-[11px] text-white/70 font-mono">
                      {item.psf_aed ? `AED ${item.psf_aed.toLocaleString('en-US')}/sqft` : '—'} · {item.handover}
                    </div>
                  </div>

                  <div className="space-y-1.5 border-t border-white/12 pt-3 text-xs">
                    <div className="flex justify-between"><span className="text-white/70">{item.gov_fee_label}</span><b className="font-mono text-white">{aed(item.gov_fee_aed)}</b></div>
                    <div className="flex justify-between"><span className="text-white/70">Upfront Cash Needed</span><b className="font-mono text-white">{aed(item.total_cash_required_aed)}</b></div>
                    <div className="flex justify-between"><span className="text-white/70">Est. Annual Rent</span><b className="font-mono text-[#34d399]">{aed(item.est_annual_rent_aed)}</b></div>
                    <div className="flex justify-between"><span className="text-white/70">Gross / Net ROI</span><b className="font-mono text-[#34d399]">{item.gross_roi_pct}% / {item.net_roi_pct}%</b></div>
                    <div className="flex justify-between"><span className="text-white/70">Monthly Mortgage</span><b className="font-mono text-white">{aed(item.monthly_mortgage_aed)}/mo</b></div>
                    <div className="flex justify-between"><span className="text-white/70">5-Year Net Rental Yield</span><b className="font-mono text-[#ebc97c]">{aed(item.five_year_net_yield_aed)}</b></div>
                  </div>
                </GlossyBlackCard>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ======================================================== TAB 4: BROKER LEADERBOARD */}
      {tab === 'leaderboard' && (
        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="m-0 text-base font-bold text-ink">Live Broker Leaderboard &amp; Monthly Target Tracker</h3>
              <p className="m-0 text-xs text-muted">Ranked by live commission GCI, closed/active deal volume, and completed site visits &amp; viewings.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Advisor</th>
                  <th>Division</th>
                  <th className="num">Deals</th>
                  <th className="num">Deal Volume</th>
                  <th className="num">GCI Earned</th>
                  <th>Monthly Target Progress</th>
                  <th className="num">Viewings / Visits</th>
                  <th className="num">Tasks Done</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((ag, idx) => (
                  <tr key={ag.id}>
                    <td>
                      <span className={`inline-grid size-7 place-items-center rounded-full font-mono text-xs font-bold ${idx === 0 ? 'bg-[#0a0b0e] text-[#ebc97c]' : 'bg-[#f4f5f7] text-[#0a0b0e]'}`}>
                        {idx + 1}
                      </span>
                    </td>
                    <td>
                      <div className="font-bold text-ink">{ag.name}</div>
                      <div className="text-[11px] text-muted font-mono">BRN {ag.dld_broker_id || '—'}</div>
                    </td>
                    <td className="text-xs">{ag.division}</td>
                    <td className="num font-mono font-bold">{ag.deals_count}</td>
                    <td className="num font-mono">{aed(ag.volume_aed)}</td>
                    <td className="num font-mono font-bold text-[#1e6b43]">{aed(ag.gci_aed)}</td>
                    <td style={{ minWidth: 160 }}>
                      <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                        <span>{ag.target_pct}%</span>
                        <span className="text-muted">{aed(ag.monthly_target_aed)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-black/[0.08] overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, ag.target_pct)}%`,
                            background: 'linear-gradient(90deg, #96202f 0%, #d4a955 55%, #1e6b43 100%)',
                          }}
                        />
                      </div>
                    </td>
                    <td className="num font-mono">{ag.viewings_and_visits}</td>
                    <td className="num font-mono">{ag.tasks_done} / {ag.tasks_done + ag.tasks_open}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ======================================================== TAB 5: COMPLIANCE EXPIRY RADAR */}
      {tab === 'compliance' && (
        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="m-0 text-base font-bold text-ink">Unified Dubai Compliance &amp; Expiry Radar</h3>
              <p className="m-0 text-xs text-muted">Trakheesi ad permits, RERA BRN cards, Form A mandates, Ejari leases, and staff Visas/Emirates IDs in one timeline.</p>
            </div>
          </div>
          {expiries.length === 0 ? (
            <div className="rounded-2xl border border-[#1e6b43]/30 bg-[#ecfdf5] p-5 flex items-center gap-3 text-sm font-semibold text-[#1e6b43]">
              <CheckCircle2 size={18} /> All permits, broker cards, mandates, leases, and staff visas are up to date.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Urgency</th>
                    <th>Category</th>
                    <th>Item / Person</th>
                    <th>Reference</th>
                    <th>Expiry Date</th>
                    <th className="num">Days Left</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {expiries.map((ex, i) => (
                    <tr key={`${ex.category}-${ex.ref_no}-${i}`}>
                      <td>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${
                          ex.severity === 'EXPIRED' || ex.severity === 'CRITICAL'
                            ? 'bg-[#fef2f2] text-[#96202f]'
                            : ex.severity === 'WARNING'
                              ? 'bg-[#fef9c3] text-[#854d0e]'
                              : 'bg-[#ecfdf5] text-[#1e6b43]'
                        }`}>
                          <AlertTriangle size={11} /> {ex.severity}
                        </span>
                      </td>
                      <td className="font-semibold text-xs">{ex.category}</td>
                      <td>{ex.title}</td>
                      <td className="font-mono text-xs">{ex.ref_no}</td>
                      <td className="font-mono text-xs">{ex.expiry_date}</td>
                      <td className="num font-mono font-bold">{ex.days_left < 0 ? `${Math.abs(ex.days_left)}d ago` : `${ex.days_left}d`}</td>
                      <td><Link to={ex.link} className="btn outline sm no-underline">Open</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
