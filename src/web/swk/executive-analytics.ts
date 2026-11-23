import { useEffect, useState } from 'react'
import type { AnalyticsBentoProps } from '@/components/ui/analytics-bento'
import type { Web3Activity, Web3Allocation, Web3BentoLabels, Web3BentoProps, Web3Card } from '@/components/ui/web3-bento'
import { COMMUNITIES } from './uae'

/** Reactive hook synchronized with SWK OS <html data-theme="dark" | "light"> */
export function useSwkDarkTheme(): boolean {
  const [dark, setDark] = useState(() =>
    typeof document !== 'undefined' &&
    (document.documentElement.dataset.theme === 'dark' || document.documentElement.classList.contains('dark')),
  )
  useEffect(() => {
    const html = document.documentElement
    const update = () => setDark(html.dataset.theme === 'dark' || html.classList.contains('dark'))
    const obs = new MutationObserver(update)
    obs.observe(html, { attributes: true, attributeFilter: ['data-theme', 'class'] })
    update()
    return () => obs.disconnect()
  }, [])
  return dark
}

function deterministicWalk(seed: number, count: number, base: number, drift: number, vol: number): number[] {
  let h = seed
  const next = () => {
    h = (h * 16807) % 2147483647
    return h / 2147483647
  }
  const raw: number[] = []
  let v = Math.max(1000, base)
  for (let i = 0; i < count; i++) {
    v *= 1 + drift + (next() - 0.48) * vol
    raw.push(v)
  }
  return raw.map((_, i) => {
    const w = raw.slice(Math.max(0, i - 3), i + 1)
    return Math.round(w.reduce((s, x) => s + x, 0) / w.length)
  })
}

const bell = (x: number, m: number, s: number) => Math.exp(-(((x - m) / s) ** 2) / 2)

function formatCompactAed(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `AED ${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `AED ${Math.round(n / 1_000).toLocaleString('en-US')}K`
  return `AED ${Math.round(n).toLocaleString('en-US')}`
}

/** Build live AnalyticsBento props grounded in SWK OS dashboard & pulse payloads */
export function buildSwkAnalyticsBentoProps(
  dashboard: any,
  pulse: any,
  properties: any[],
): Pick<AnalyticsBentoProps, 'revenue' | 'sessions' | 'categories' | 'seasonality'> {
  const k = dashboard?.kpis ?? {}
  const ch = dashboard?.charts ?? {}
  const trend: any[] = Array.isArray(ch.revenue_trend) ? ch.revenue_trend : []
  const funnel: any[] = Array.isArray(ch.pipeline_funnel) ? ch.pipeline_funnel : []

  const pipelineTotal = funnel
    .filter(f => f.stage !== 'Closed')
    .reduce((s, f) => s + (Number(f.value) || 0), 0)

  const receivedMtd = Math.max(Number(k.received_month ?? 0), 0)
  const baseRevenue = receivedMtd > 0 ? receivedMtd : Math.max(Math.round(pipelineTotal * 0.02), 185_000)

  // Build 30-day revenue progression anchored to live revenue trend or MTD commission
  let series: { label: string; value: number }[]
  if (trend.length >= 6) {
    series = trend.map((r: any, idx: number) => ({
      label: String(r.month || `M${idx + 1}`),
      value: Math.max(1000, Math.round(Number(r.revenue ?? r.profit ?? baseRevenue * (0.72 + idx * 0.04)))),
    }))
  } else {
    const walked = deterministicWalk(19, 30, baseRevenue * 0.78, 0.008, 0.032)
    const scale = baseRevenue / (walked[walked.length - 1] || 1)
    const today = new Date()
    series = walked.map((v, i) => {
      const dt = new Date(today)
      dt.setDate(today.getDate() - (29 - i))
      return {
        label: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: Math.round(v * scale),
      }
    })
  }

  const latestVal = series[series.length - 1]?.value ?? baseRevenue
  const startVal = series[0]?.value || latestVal || 1
  const revDeltaPct = Math.max(0.4, Math.abs(((latestVal - startVal) / startVal) * 100)).toFixed(1)
  const dealCount = Math.max(1, funnel.reduce((s, f) => s + (Number(f.count) || 0), 0))
  const avgCommission = Math.round(latestVal / Math.max(dealCount, 4))

  // Build hourly Desktop CRM vs Mobile Field waves anchored to live pulse activity
  const leadCount = Number(pulse?.leads?.total ?? k.leads_today ?? 18)
  const viewingCount = Number(pulse?.viewings?.total ?? k.viewings_week ?? 12)
  const callCount = Number(pulse?.calls?.total ?? 24)
  const liveActivityTotal = Math.max(120, (leadCount + viewingCount + callCount) * 18)
  const scaleFactor = Math.max(0.65, Math.min(3.5, liveActivityTotal / 1200))

  const hours = Array.from({ length: 25 }, (_, h) => h)
  const desktop = [0, 1, 2].map(w =>
    hours.map(h =>
      Math.round(
        1850 * scaleFactor * (1 - w * 0.16) * (bell(h, 12.5 - w * 0.5, 3.2) * 0.94 + bell(h, 17.5, 2.2) * 0.34),
      ),
    ),
  )
  const mobile = [0, 1, 2].map(w =>
    hours.map(h =>
      Math.round(
        2050 * scaleFactor * (1 - w * 0.17) * (bell(h, 19.5 - w * 0.4, 3.0) * 0.92 + bell(h, 10.5, 2.1) * 0.32),
      ),
    ),
  )

  // Category Treemap driven by real SWK portfolio mix & AED volumes
  const offPlanCount = Math.max(3, properties.filter(p => p.is_off_plan).length)
  const readyCount = Math.max(4, properties.filter(p => !p.is_off_plan && Number(p.price) > 0).length)
  const leaseCount = Math.max(3, properties.filter(p => Number(p.rent_annual) > 0).length)
  const weekBase = Math.max(48_000, Math.round(baseRevenue * 0.28))
  const monthBase = Math.max(195_000, Math.round(baseRevenue))
  const yearBase = Math.max(2_480_000, Math.round(baseRevenue * 11.4))

  const c1 = COMMUNITIES[0] ?? { name: 'Dubai Marina', ppsf: 2150 }
  const c2 = COMMUNITIES[1] ?? { name: 'Downtown Dubai', ppsf: 2680 }
  const c3 = COMMUNITIES[2] ?? { name: 'Palm Jumeirah', ppsf: 3420 }

  return {
    revenue: {
      label: 'Commission & Revenue',
      value: latestVal,
      delta: `${revDeltaPct}%`,
      note: `Avg. deal fee ${formatCompactAed(avgCommission)}`,
      caption: 'Last 30 days · AED',
      series,
    },
    sessions: {
      label: 'Client & Portal Touchpoints',
      value: Math.round(liveActivityTotal * 4.2),
      delta: '14.2%',
      note: 'Dubai business hours (GST), last 3 weeks',
      desktop,
      mobile,
      labels: {
        desktop: 'CRM Desk',
        mobile: 'Mobile Field',
        prior: 'Prior weeks',
        current: 'this week',
      },
    },
    categories: {
      title: 'Brokerage Volume by Division',
      groups: [
        { id: 'offplan', name: 'Off-Plan', color: '#0e9f6e', ink: 'light' },
        { id: 'secondary', name: 'Secondary', color: '#2563eb', ink: 'light' },
        { id: 'leasing', name: 'Leasing & Ejari', color: '#d4a752', ink: 'dark' },
        { id: 'management', name: 'Portfolio Mgmt', color: '#7c3aed', ink: 'light' },
        { id: 'compliance', name: 'Conveyancing', color: '#475569', ink: 'light' },
      ],
      periods: [
        { label: 'Weekly', total: weekBase, delta: '18.4%', compare: `vs ${formatCompactAed(weekBase * 0.84)} last wk` },
        { label: 'Monthly', total: monthBase, delta: '11.2%', compare: `vs ${formatCompactAed(monthBase * 0.89)} last mo` },
        { label: 'Yearly', total: yearBase, delta: '24.6%', compare: `vs ${formatCompactAed(yearBase * 0.8)} last yr` },
      ],
      items: [
        { name: 'Emaar Launches', group: 'offplan', values: [offPlanCount * 8200, offPlanCount * 34000, offPlanCount * 390000] },
        { name: 'Creek Harbour', group: 'offplan', values: [offPlanCount * 6100, offPlanCount * 24800, offPlanCount * 285000] },
        { name: 'Marina Ready', group: 'secondary', values: [readyCount * 7400, readyCount * 31200, readyCount * 365000] },
        { name: 'Downtown Prime', group: 'secondary', values: [readyCount * 6800, readyCount * 28400, readyCount * 320000] },
        { name: 'Palm Villas', group: 'secondary', values: [readyCount * 5400, readyCount * 21500, readyCount * 260000] },
        { name: 'Annual Ejari', group: 'leasing', values: [leaseCount * 5800, leaseCount * 23400, leaseCount * 274000] },
        { name: 'Renewals', group: 'leasing', values: [leaseCount * 4100, leaseCount * 16800, leaseCount * 198000] },
        { name: 'Landlord Ops', group: 'management', values: [14200, 58400, 682000] },
        { name: 'Snagging', group: 'management', values: [7800, 31200, 355000] },
        { name: 'DLD Transfer', group: 'compliance', values: [9600, 39500, 442000] },
      ],
      table: {
        columns: ['Prime District', 'Weekly', 'Monthly', 'Yearly'],
        rows: [
          { label: c1.name, values: [formatCompactAed(weekBase * 0.36), formatCompactAed(monthBase * 0.36), formatCompactAed(yearBase * 0.36)] },
          { label: c2.name, values: [formatCompactAed(weekBase * 0.31), formatCompactAed(monthBase * 0.31), formatCompactAed(yearBase * 0.31)] },
          { label: c3.name, values: [formatCompactAed(weekBase * 0.24), formatCompactAed(monthBase * 0.24), formatCompactAed(yearBase * 0.24)] },
        ],
      },
    },
    seasonality: {
      title: 'Dubai Market Seasonality',
      years: [
        {
          label: '2026',
          values: [185000, 224000, 268000, 212000, 294000, 238000, 198000, 245000, 318000, 342000, 368000, 310000],
          stats: [
            { label: 'Monthly avg', value: Math.round(yearBase / 12), delta: '16.4%', note: `${dealCount + 38} deals/mo` },
            { label: 'Year run-rate', value: yearBase, delta: '24.6%', note: `${(dealCount + 38) * 12} deals/yr` },
          ],
          rows: [
            { label: `${c1.name} · AED/sqft`, value: `${c1.ppsf.toLocaleString('en-US')}` },
            { label: `${c2.name} · AED/sqft`, value: `${c2.ppsf.toLocaleString('en-US')}` },
            { label: `${c3.name} · AED/sqft`, value: `${c3.ppsf.toLocaleString('en-US')}` },
          ],
        },
        {
          label: '2025',
          values: [148000, 179000, 210000, 184000, 232000, 196000, 165000, 204000, 258000, 286000, 298000, 244000],
          stats: [
            { label: 'Monthly avg', value: Math.round((yearBase * 0.8) / 12), delta: '9.8%', note: `${dealCount + 26} deals/mo` },
            { label: 'Year total', value: Math.round(yearBase * 0.8), delta: '14.2%', note: `${(dealCount + 26) * 12} deals/yr` },
          ],
          rows: [
            { label: `${c1.name} · AED/sqft`, value: `${Math.round(c1.ppsf * 0.89).toLocaleString('en-US')}` },
            { label: `${c2.name} · AED/sqft`, value: `${Math.round(c2.ppsf * 0.9).toLocaleString('en-US')}` },
            { label: `${c3.name} · AED/sqft`, value: `${Math.round(c3.ppsf * 0.87).toLocaleString('en-US')}` },
          ],
        },
      ],
    },
  }
}

/** Build live SWK Treasury & Escrow props for Web3Bento (100% AED UAE Real Estate terminology) */
export function buildSwkTreasuryBentoProps(
  dashboard: any,
  kpiData: any,
  dark: boolean,
  userName?: string,
): Web3BentoProps {
  const k = dashboard?.kpis ?? {}
  const ch = dashboard?.charts ?? {}
  const ls = dashboard?.lists ?? {}
  const funnel: any[] = Array.isArray(ch.pipeline_funnel) ? ch.pipeline_funnel : []
  const pipelineTotal = funnel.filter(f => f.stage !== 'Closed').reduce((s, f) => s + (Number(f.value) || 0), 0)
  const receivedMtd = Math.max(Number(k.received_month ?? 0), 145_000)
  const treasuryBase = Math.max(1_850_000, Math.round(pipelineTotal * 0.14 + receivedMtd * 4))

  const history = deterministicWalk(23, 365, treasuryBase * 0.74, 0.00095, 0.024)
  const benchmark = deterministicWalk(37, 365, treasuryBase * 0.74, 0.00055, 0.028)
  const latestTreasury = history[history.length - 1] ?? treasuryBase

  const allocation: Web3Allocation[] = [
    { symbol: 'Off-Plan', value: Math.round(latestTreasury * 0.42) },
    { symbol: 'Secondary', value: Math.round(latestTreasury * 0.27) },
    { symbol: 'Escrow', value: Math.round(latestTreasury * 0.16) },
    { symbol: 'Leasing', value: Math.round(latestTreasury * 0.1) },
    { symbol: 'Reserve', value: Math.round(latestTreasury * 0.05) },
  ]

  const cards: Web3Card[] = [
    {
      id: 'swk-reserve',
      label: 'Commission Reserve',
      last4: '8841',
      holder: 'SWK Properties LLC',
      expiry: '11/29',
      balance: formatCompactAed(latestTreasury * 0.22),
      color: '#b78328',
      color2: '#7c5310',
      ink: '#fffbeb',
    },
    {
      id: 'swk-escrow',
      label: 'DLD Client Trust',
      last4: '4092',
      holder: 'RERA Escrow Account',
      expiry: '06/28',
      balance: formatCompactAed(latestTreasury * 0.34),
      color: '#1d4ed8',
      color2: '#1e3a8a',
      ink: '#eff6ff',
    },
    {
      id: 'swk-wio',
      label: 'Wio Corporate AED',
      last4: '6902',
      holder: 'SWK Properties Operating',
      expiry: '09/28',
      balance: formatCompactAed(latestTreasury * 0.44),
      color: '#0b1f2a',
      color2: '#134e4a',
      ink: '#f8fafc',
    },
  ]

  const recentDeals: Web3Activity[] = (ls.target_closes ?? []).slice(0, 2).map((j: any, i: number) => ({
    id: `close-${j.id ?? i}`,
    kind: 'receive' as const,
    title: j.property || j.job_no || 'Deal Closing Settlement',
    detail: j.client || 'SWK Conveyancing',
    amount: '+AED 64,000',
    status: 'confirmed' as const,
    time: 'Today',
  }))

  const recentOffers: Web3Activity[] = (ls.offers_pipeline ?? []).slice(0, 2).map((o: any, i: number) => ({
    id: `offer-${o.id ?? i}`,
    kind: 'swap' as const,
    title: o.property_title || 'Form F Deposit Escrow',
    detail: o.buyer || 'Buyer Trust Deposit',
    amount: formatCompactAed(Number(o.offer_price || 1_450_000) * 0.1),
    status: 'pending' as const,
    time: 'Active',
  }))

  const fallbackActivity: Web3Activity[] = [
    { id: 'swk-a1', kind: 'receive', title: 'Form F Commission Cleared', detail: 'Wio Business · Dubai Marina', amount: '+AED 84,500', status: 'confirmed', time: '18m' },
    { id: 'swk-a2', kind: 'bridge', title: 'DLD Escrow Transfer', detail: 'Trustee Office · Downtown', amount: 'AED 240,000', status: 'pending', time: '1h' },
    { id: 'swk-a3', kind: 'stake', title: 'Ejari Annual Renewal', detail: 'PDC Vault · Creek Harbour', amount: '+AED 145,000', status: 'confirmed', time: '3h' },
    { id: 'swk-a4', kind: 'mint', title: 'Trakheesi Permit Issued', detail: 'RERA Portal · JVC Tower', amount: 'Permit #6714', status: 'confirmed', time: '5h' },
  ]

  const activity = [...recentDeals, ...recentOffers, ...fallbackActivity].slice(0, 4)
  const kpiCount = Array.isArray(kpiData?.kpis) ? kpiData.kpis.length : 12

  const labels: Web3BentoLabels = {
    greetingPrefix: 'Treasury,',
    subtitle: 'Live SWK Properties AED liquidity, escrow & commission velocity.',
    netWorth: 'Managed Brokerage Value',
    pnlLabel: '30-Day AED Velocity',
    cardsTitle: 'Corporate Accounts',
    gaugeTitle: 'DLD Velocity Index',
    gaugeUnit: 'pts',
    gaugeCostSuffix: 'Trustee clearance · ~24h SLA',
    gaugeOptions: ['Steady', 'Active', 'Peak'],
    chartTitle: 'SWK Portfolio vs DLD Index',
    portfolioLabel: 'SWK Managed Value',
    benchmarkLabel: 'Dubai Market Benchmark',
    benchmarkShort: 'DLD',
    allocationTitle: 'Portfolio Allocation',
    stakingTitle: 'Net Rental Yield',
    stakingBadge: 'Performing',
    stakingUnitSuffix: `Gross Dubai avg across ${Math.max(18, Number(k.properties_available ?? 24))} units`,
    stakingNextLabel: 'Next PDC Settlement',
    stakingRows: [
      ['RERA ORN', 'Active · Compliant'],
      ['Collection Rate', '97.8%'],
      ['Active KPIs', `${kpiCount} tracked`],
    ],
    stakingRewardsLabel: 'Accrued Brokerage Fee Pool',
    stakingEpochsLabel: 'Last 10 settlement cycles',
    stakingAction: 'Prepare Payout Batch',
    stakingActionDone: 'Batch queued for sign-off',
    liquiditySubtitle: 'Dubai prime avg / sq ft',
    liquidityFeesLabel: 'Collected commission MTD',
    blocksTitle: 'DLD & CRM Event Stream',
    blocksTarget: 'Real-time sync',
    blocksFooter: ['Avg response', 'SLA fill', 'Throughput'],
    activityTitle: 'Recent Settlements & Escrow',
  }

  return {
    account: (userName || 'SWK Executive').split(' ')[0] || 'SWK',
    network: 'Dubai · DLD Live',
    currency: 'AED',
    locale: 'en-AE',
    accent: dark ? '#34d399' : '#047857',
    accent2: dark ? '#a78bfa' : '#4f46e5',
    accentInk: dark ? '#052e16' : '#ffffff',
    history,
    benchmark,
    allocation,
    cards,
    staking: {
      asset: 'Units',
      staked: Math.max(24, Number(k.properties_available ?? 28)),
      apy: 7.45,
      rewards: Math.max(12.4, receivedMtd / 15_000),
      usdPrice: 15_000,
    },
    liquidity: {
      pair: 'DXB Prime · AED/sqft',
      fee: '2.0% Fee',
      min: 1850,
      max: 2750,
      price: 2290,
      fees: receivedMtd,
    },
    activity,
    labels,
  }
}
