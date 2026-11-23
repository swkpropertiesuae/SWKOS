import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Area, AreaChart, Bar as RBar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import QRCode from 'qrcode'
import {
  AlertTriangle, ArrowLeftRight, Award, Calculator, Check, Copy, Download, Printer, QrCode, RotateCcw, ShieldCheck,
} from 'lucide-react'
import {
  AnimatedNumber, Bar, CHART, Card, Field, ModuleHeader, Pill, ProgressRing, Reveal, SWK, Segmented, aed, num, pct,
} from '../../swk/ui'
import {
  COMMUNITIES, RERA_BANDS, RENT_INDEX, UAE, commissionWaterfall, costToClose, leaseCosts, mortgagePlan, paymentPlan, reraIncrease, visaEligibility, yieldCalc, type Residency,
} from '../../swk/uae'

type ToolKey =
  | 'cost'
  | 'mortgage'
  | 'rera'
  | 'yield'
  | 'visa'
  | 'commission'
  | 'movein'
  | 'offplan'
  | 'converter'
  | 'pdc'
  | 'qr'

const TOOLS: { value: ToolKey; label: string }[] = [
  { value: 'cost', label: 'Buyer Cost-to-Close' },
  { value: 'mortgage', label: 'CBUAE Mortgage' },
  { value: 'rera', label: 'RERA Rent Index' },
  { value: 'yield', label: 'Yield & ROI' },
  { value: 'visa', label: 'Golden Visa' },
  { value: 'commission', label: 'Commission Split' },
  { value: 'movein', label: 'Tenant Move-In' },
  { value: 'offplan', label: 'Off-Plan Schedule' },
  { value: 'converter', label: 'Area & Currency' },
  { value: 'pdc', label: 'PDC Cheque Split' },
  { value: 'qr', label: 'Public QR Generator' },
]

const SQFT_PER_SQM = 10.7639104167

type CcyCode = 'AED' | 'USD' | 'EUR' | 'GBP' | 'INR' | 'SAR' | 'RUB' | 'CNY'
const DEFAULT_RATES_TO_AED: Record<CcyCode, number> = {
  AED: 1,
  USD: 3.6725,
  EUR: 3.98,
  GBP: 4.66,
  INR: 0.0435,
  SAR: 0.9793,
  RUB: 0.038,
  CNY: 0.508,
}
const CCY_LABELS: Record<CcyCode, string> = {
  AED: 'UAE Dirham',
  USD: 'US Dollar',
  EUR: 'Euro',
  GBP: 'British Pound',
  INR: 'Indian Rupee',
  SAR: 'Saudi Riyal',
  RUB: 'Russian Ruble',
  CNY: 'Chinese Yuan',
}

type QrMode = 'listing' | 'whatsapp' | 'vcard' | 'custom'

/** Reject any QR text targeting internal attendance / reception check-in terminals. */
function isForbiddenQrPayload(raw: string): string | null {
  const candidates = [raw]
  try {
    const once = decodeURIComponent(raw)
    candidates.push(once)
    candidates.push(decodeURIComponent(once))
  } catch {
    /* ignore malformed percent encoding */
  }
  for (const s of candidates) {
    if (/swk[12]\./i.test(s)) {
      return 'Blocked: Attendance QR prefixes (SWK1. / SWK2.) cannot be generated in the Public QR tool.'
    }
    if (/\/reception-qr/i.test(s) || /\/qr-checkin/i.test(s) || /\/qr-reception/i.test(s)) {
      return 'Blocked: Internal office reception check-in paths (/reception-qr, /qr-checkin) cannot be generated here.'
    }
  }
  return null
}

function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function ToolkitPage({ embedded = false }: { embedded?: boolean }) {
  const [sp, setSp] = useSearchParams()
  const active = (TOOLS.some(t => t.value === sp.get('tool')) ? sp.get('tool') : 'cost') as ToolKey
  const setActive = (t: ToolKey) => {
    setSp(prev => {
      const next = new URLSearchParams(prev)
      next.set('tool', t)
      return next
    }, { replace: true })
  }
  const [copied, setCopied] = useState(false)

  // 1) Cost to close state
  const [cPrice, setCPrice] = useState(3_200_000)
  const [cUseLoan, setCUseLoan] = useState(true)
  const [cDownPct, setCDownPct] = useState(20)
  const [cBrokerPct, setCBrokerPct] = useState(2)
  const [cNoc, setCNoc] = useState(1500)

  // 2) Mortgage state
  const [mPrice, setMPrice] = useState(3_500_000)
  const [mResidency, setMResidency] = useState<Residency>('expat')
  const [mFirstHome, setMFirstHome] = useState(true)
  const [mOffPlan, setMOffPlan] = useState(false)
  const [mRate, setMRate] = useState(4.49)
  const [mYears, setMYears] = useState(25)
  const [mIncome, setMIncome] = useState(55_000)
  const [mDebts, setMDebts] = useState(3_500)
  const [mDownPct, setMDownPct] = useState(20)

  // 3) RERA rent increase state
  const [rComm, setRComm] = useState(COMMUNITIES[2]!.name)
  const [rBeds, setRBeds] = useState<'Studio' | '1 BR' | '2 BR' | '3 BR'>('2 BR')
  const [rCurrent, setRCurrent] = useState(125_000)
  const [rIndexOverride, setRIndexOverride] = useState<number | null>(null)

  // 4) Yield state
  const [yComm, setYComm] = useState(COMMUNITIES[2]!.name)
  const [yPrice, setYPrice] = useState(2_400_000)
  const [yRent, setYRent] = useState(165_000)
  const [yArea, setYArea] = useState(1280)
  const [ySc, setYSc] = useState(18)
  const [yVacancy, setYVacancy] = useState(2)
  const [yMaint, setYMaint] = useState(3)
  const [yMgmt, setYMgmt] = useState(5)

  // 5) Golden visa state
  const [vValue, setVValue] = useState(2_350_000)
  const [vOwners, setVOwners] = useState(1)
  const [vMortgaged, setVMortgaged] = useState(true)
  const [vOffPlan, setVOffPlan] = useState(false)

  // 6) Commission waterfall state
  const [wPrice, setWPrice] = useState(4_500_000)
  const [wPct, setWPct] = useState(2)
  const [wCoBroker, setWCoBroker] = useState(50)
  const [wReferral, setWReferral] = useState(5)
  const [wAgentSplit, setWAgentSplit] = useState(55)
  const [wLeader, setWLeader] = useState(5)

  // 7) Tenant move-in state
  const [tRent, setTRent] = useState(140_000)
  const [tFurnished, setTFurnished] = useState(false)
  const [tVilla, setTVilla] = useState(false)
  const [tCheques, setTCheques] = useState<'1' | '2' | '4' | '6' | '12'>('4')

  // 8) Off-plan payment plan state
  const [oPrice, setOPrice] = useState(2_800_000)
  const [oBooking, setOBooking] = useState(20)
  const [oConst, setOConst] = useState(40)
  const [oHandover, setOHandover] = useState(20)
  const [oPost, setOPost] = useState(20)
  const [oConstInst, setOConstInst] = useState(6)
  const [oPostInst, setOPostInst] = useState(4)
  const [oMonthsToHandover, setOMonthsToHandover] = useState(24)

  // 9) Area & Currency converter state
  const [convSqft, setConvSqft] = useState(1250)
  const [convPricePerSqft, setConvPricePerSqft] = useState(2150)
  const [convCcy, setConvCcy] = useState<CcyCode>('AED')
  const [convAmount, setConvAmount] = useState(2_000_000)
  const [rates, setRates] = useState<Record<CcyCode, number>>({ ...DEFAULT_RATES_TO_AED })

  // 10) PDC Cheque Split state
  const [pdcRent, setPdcRent] = useState(160_000)
  const [pdcCount, setPdcCount] = useState<'1' | '2' | '4' | '6' | '12'>('4')
  const [pdcStart, setPdcStart] = useState(todayDateInput)
  const [pdcFurnished, setPdcFurnished] = useState(false)
  const [pdcEjariFee, setPdcEjariFee] = useState(UAE.ejariFee)

  // 11) Public QR Generator state
  const [qrMode, setQrMode] = useState<QrMode>('listing')
  const [qrUrl, setQrUrl] = useState('https://swkpropertiesuae.com/properties')
  const [qrWaPhone, setQrWaPhone] = useState('+971501000001')
  const [qrWaText, setQrWaText] = useState('Hello SWK Properties, I would like to book a viewing.')
  const [qrVcName, setQrVcName] = useState('SWK Properties Advisor')
  const [qrVcPhone, setQrVcPhone] = useState('+97143304899')
  const [qrVcEmail, setQrVcEmail] = useState('info@swkpropertiesuae.com')
  const [qrVcTitle, setQrVcTitle] = useState('Senior Property Consultant')
  const [qrCustom, setQrCustom] = useState('https://www.swk.properties')
  const [qrCaption, setQrCaption] = useState('Scan to view SWK Properties')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [qrErr, setQrErr] = useState('')

  // Calculations
  const cLoan = cUseLoan ? Math.max(0, cPrice * (1 - cDownPct / 100)) : 0
  const costRes = useMemo(() => costToClose({ price: cPrice, loan: cLoan, brokerPct: cBrokerPct / 100, nocFee: cNoc, includeBroker: true }), [cPrice, cLoan, cBrokerPct, cNoc])
  const mortRes = useMemo(() => mortgagePlan({ price: mPrice, residency: mResidency, firstHome: mFirstHome, offPlan: mOffPlan, ratePct: mRate, years: mYears, income: mIncome, debts: mDebts, downPct: mDownPct }), [mPrice, mResidency, mFirstHome, mOffPlan, mRate, mYears, mIncome, mDebts, mDownPct])
  const indexAvg = rIndexOverride ?? (RENT_INDEX[rComm]?.[rBeds] ?? 150_000)
  const reraRes = useMemo(() => reraIncrease(rCurrent, indexAvg), [rCurrent, indexAvg])
  const yieldRes = useMemo(() => yieldCalc({ price: yPrice, annualRent: yRent, areaSqft: yArea, serviceChargePerSqft: ySc, vacancyWeeks: yVacancy, maintenancePct: yMaint, mgmtFeePct: yMgmt }), [yPrice, yRent, yArea, ySc, yVacancy, yMaint, yMgmt])
  const visaRes = useMemo(() => visaEligibility({ value: vValue, jointOwners: vOwners, mortgaged: vMortgaged, offPlan: vOffPlan }), [vValue, vOwners, vMortgaged, vOffPlan])
  const commRes = useMemo(() => commissionWaterfall({ price: wPrice, pct: wPct, coBrokerShare: wCoBroker, referralPct: wReferral, agentSplit: wAgentSplit, leaderOverride: wLeader }), [wPrice, wPct, wCoBroker, wReferral, wAgentSplit, wLeader])
  const moveRes = useMemo(() => leaseCosts({ annualRent: tRent, furnished: tFurnished, villa: tVilla, cheques: Number(tCheques) }), [tRent, tFurnished, tVilla, tCheques])
  const offRes = useMemo(() => {
    const start = new Date()
    const ho = new Date()
    ho.setMonth(ho.getMonth() + oMonthsToHandover)
    return paymentPlan({ price: oPrice, bookingPct: oBooking, constructionPct: oConst, handoverPct: oHandover, postHandoverPct: oPost, constructionInstalments: oConstInst, postInstalments: oPostInst, start, handover: ho })
  }, [oPrice, oBooking, oConst, oHandover, oPost, oConstInst, oPostInst, oMonthsToHandover])

  const convSqm = convSqft / SQFT_PER_SQM
  const convAedTotal = Math.max(0, convAmount) * Math.max(0.0001, rates[convCcy] || 1)

  const pdcSchedule = useMemo(() => {
    const n = Math.max(1, Number(pdcCount))
    const monthsStep = 12 / n
    const baseDate = pdcStart ? new Date(`${pdcStart}T00:00:00`) : new Date()
    const validBase = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate
    const rent = Math.max(0, pdcRent)
    const perCheque = Math.floor((rent / n) * 100) / 100
    const rows = Array.from({ length: n }, (_, i) => {
      const due = new Date(validBase)
      due.setMonth(due.getMonth() + Math.round(i * monthsStep))
      const amount = i === n - 1 ? Math.round((rent - perCheque * (n - 1)) * 100) / 100 : perCheque
      return {
        index: i + 1,
        dueDate: due.toISOString().slice(0, 10),
        amount,
      }
    })
    const depositPct = pdcFurnished ? 10 : 5
    const deposit = rent * (depositPct / 100)
    const agencyInclVat = rent * 0.05 * (1 + UAE.vat)
    return {
      rows,
      depositPct,
      deposit,
      agencyInclVat,
      firstCheque: rows[0]?.amount ?? 0,
      dayOneTotal: (rows[0]?.amount ?? 0) + deposit + pdcEjariFee + agencyInclVat,
    }
  }, [pdcRent, pdcCount, pdcStart, pdcFurnished, pdcEjariFee])

  const qrPayload = useMemo(() => {
    if (qrMode === 'listing') return qrUrl.trim()
    if (qrMode === 'whatsapp') {
      const digits = qrWaPhone.replace(/[^\d]/g, '')
      const msg = qrWaText.trim()
      return digits ? `https://wa.me/${digits}${msg ? `?text=${encodeURIComponent(msg)}` : ''}` : ''
    }
    if (qrMode === 'vcard') {
      return [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${qrVcName.trim()}`,
        'ORG:SWK Properties LLC',
        qrVcTitle.trim() ? `TITLE:${qrVcTitle.trim()}` : '',
        qrVcPhone.trim() ? `TEL;TYPE=CELL:${qrVcPhone.trim()}` : '',
        qrVcEmail.trim() ? `EMAIL:${qrVcEmail.trim()}` : '',
        'URL:https://www.swkpropertiesuae.com',
        'END:VCARD',
      ]
        .filter(Boolean)
        .join('\n')
    }
    return qrCustom.trim()
  }, [qrMode, qrUrl, qrWaPhone, qrWaText, qrVcName, qrVcTitle, qrVcPhone, qrVcEmail, qrCustom])

  const qrBlockReason = useMemo(() => (qrPayload ? isForbiddenQrPayload(qrPayload) : null), [qrPayload])

  useEffect(() => {
    if (active !== 'qr') return
    if (!qrPayload) {
      setQrDataUrl('')
      setQrErr('')
      return
    }
    if (qrBlockReason) {
      setQrDataUrl('')
      setQrErr(qrBlockReason)
      return
    }
    let cancelled = false
    setQrErr('')
    QRCode.toDataURL(qrPayload, {
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#121212', light: '#ffffff' },
    })
      .then(url => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch((e: any) => {
        if (!cancelled) {
          setQrDataUrl('')
          setQrErr(e?.message || 'Could not generate QR code')
        }
      })
    return () => {
      cancelled = true
    }
  }, [active, qrPayload, qrBlockReason])

  const downloadQrPng = () => {
    if (!qrDataUrl || qrBlockReason) return
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = `swk-public-qr-${qrMode}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const buildSummary = () => {
    switch (active) {
      case 'cost':
        return `*SWK Properties — Buyer Cost-to-Close*\nProperty Price: ${aed(cPrice)}\nDown Payment: ${aed(costRes.downPayment)}\nDLD + Trustee + Agency + Fees: ${aed(costRes.fees)} (${costRes.feesPct.toFixed(1)}%)\n*Total Cash Required:* ${aed(costRes.cashRequired)}`
      case 'mortgage':
        return `*SWK Properties — UAE Mortgage Estimate*\nProperty: ${aed(mPrice)} (${mResidency === 'national' ? 'UAE National' : 'Expat'})\nLoan Amount: ${aed(mortRes.loan)} (LTV ${(mortRes.appliedLtv * 100).toFixed(0)}%)\nMonthly EMI: ${aed(mortRes.emi)} @ ${mRate}% for ${mortRes.years} yrs\nDBR: ${(mortRes.dbr * 100).toFixed(1)}% (${mortRes.dbrOk ? 'Within CBUAE 50% cap' : 'Exceeds 50% cap'})`
      case 'rera':
        return `*SWK Properties — RERA Rental Index Check (Decree 43/2013)*\nCommunity: ${rComm} (${rBeds})\nCurrent Rent: ${aed(rCurrent)} | Index Avg: ${aed(indexAvg)}\nAllowed Increase: ${reraRes.maxIncreasePct}% (+${aed(reraRes.maxIncrease)})\n*Max Renewal Rent:* ${aed(reraRes.maxRent)} (90-day notice required)`
      case 'yield':
        return `*SWK Properties — Investment Yield Analysis*\nPrice: ${aed(yPrice)} | Annual Rent: ${aed(yRent)}\nGross Yield: ${yieldRes.gross.toFixed(2)}% | *Net Yield: ${yieldRes.net.toFixed(2)}%*\nNet Annual Income: ${aed(yieldRes.netIncome)} (after AED ${num(yieldRes.serviceCharge)} service charges)`
      case 'visa':
        return `*SWK Properties — UAE Residency Assessment*\nProperty Share Value: ${aed(visaRes.share)}\nStatus: *${visaRes.tier}*${visaRes.gap > 0 ? `\nGap to 10-Yr Golden Visa: ${aed(visaRes.gap)}` : ''}`
      case 'commission':
        return `*SWK Properties — Commission Split Statement*\nDeal Price: ${aed(wPrice)} @ ${wPct}%\nGross Commission: ${aed(commRes.gross)} (+5% VAT = ${aed(commRes.invoiceTotal)})\nCo-Broker (Form I): ${aed(commRes.coBroker)} | Agent Share: ${aed(commRes.agent)} | SWK Net: ${aed(commRes.company)}`
      case 'movein':
        return `*SWK Properties — Tenant Move-In Estimate*\nAnnual Rent: ${aed(tRent)} (${tCheques} cheques of ${aed(moveRes.chequeAmount)})\n*Total Upfront Move-In:* ${aed(moveRes.moveIn)}\nMonthly DM Housing Fee (5%): ${aed(moveRes.housingFeeMonthly)}`
      case 'offplan':
        return `*SWK Properties — Off-Plan Payment Schedule*\nUnit Price: ${aed(oPrice)}\nPlan: ${oBooking}% Booking / ${oConst}% Construction / ${oHandover}% Handover / ${oPost}% Post-Handover\nDLD Oqood (4%): ${aed(oPrice * 0.04)}`
      case 'converter':
        return `*SWK Properties — Area & Currency Conversion*\nArea: ${num(convSqft, 1)} sqft = ${num(convSqm, 2)} sqm\nAmount: ${num(convAmount, 2)} ${convCcy} = ${aed(convAedTotal)} (USD ${num(convAedTotal / rates.USD, 0)} · EUR ${num(convAedTotal / rates.EUR, 0)} · GBP ${num(convAedTotal / rates.GBP, 0)})`
      case 'pdc':
        return `*SWK Properties — PDC Cheque Split Schedule*\nAnnual Rent: ${aed(pdcRent)} (${pdcCount} cheques)\nSecurity Deposit (${pdcSchedule.depositPct}%): ${aed(pdcSchedule.deposit)} | Ejari: ${aed(pdcEjariFee)}\n${pdcSchedule.rows.map(r => `• Cheque ${r.index} (${r.dueDate}): ${aed(r.amount)}`).join('\n')}`
      case 'qr':
        return qrBlockReason ? 'Public QR blocked by security policy' : `*SWK Properties — Public QR Link*\n${qrPayload}`
    }
  }

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(buildSummary())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  return (
    <div className="grid gap-5 max-w-[1640px] mx-auto">
      {!embedded && (
        <ModuleHeader
          eyebrow="DLD · RERA · CBUAE · FTA"
          title="UAE Deal Toolkit"
          subtitle="Interactive calculators for Dubai transfers, CBUAE mortgages, RERA rental caps, net yields, Golden Visa, PDC cheque schedules, area/currency conversions, and public QR codes."
          icon={<Calculator size={24} />}
          actions={
            <div className="flex items-center gap-2">
              <button type="button" className="swk-btn swk-btn-gold" onClick={copySummary}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied for WhatsApp' : 'Copy WhatsApp summary'}
              </button>
              <button type="button" className="swk-btn swk-btn-ghost" onClick={() => window.print()}>
                <Printer size={16} />Print sheet
              </button>
            </div>
          }
        />
      )}

      {embedded && (
        <div className="flex justify-end gap-2">
          <button type="button" className="swk-btn swk-btn-gold" onClick={copySummary}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? 'Copied for WhatsApp' : 'Copy WhatsApp summary'}
          </button>
        </div>
      )}

      <div className="overflow-x-auto pb-1">
        <Segmented value={active} onChange={setActive} options={TOOLS} layoutId="toolkit-tabs" />
      </div>

      {/* ============================================================ 1. COST TO CLOSE */}
      {active === 'cost' && (
        <Reveal className="grid gap-5 lg:grid-cols-12">
          <Card className="lg:col-span-5" title="Transaction parameters" subtitle="DLD 4% transfer fee, trustee office & agency commission">
            <div className="grid gap-4">
              <Field label="Purchase price (AED)" value={cPrice} onChange={setCPrice} prefix="AED" step={50000} />
              <div className="flex items-center justify-between pt-1">
                <label className="swk-toggle">
                  <input type="checkbox" checked={cUseLoan} onChange={e => setCUseLoan(e.target.checked)} />
                  <span>Financed with UAE bank mortgage</span>
                </label>
                <Pill tone={cUseLoan ? 'navy' : 'champ'}>{cUseLoan ? 'Mortgage buyer' : 'Cash buyer'}</Pill>
              </div>
              {cUseLoan && (
                <Field label="Down payment (%)" value={cDownPct} onChange={v => setCDownPct(Math.min(90, Math.max(15, v)))} suffix="%" step={5} hint={`Loan amount: ${aed(cLoan)}`} />
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Agency commission (%)" value={cBrokerPct} onChange={setCBrokerPct} suffix="% + VAT" step={0.25} />
                <Field label="Developer NOC fee" value={cNoc} onChange={setCNoc} prefix="AED" step={250} hint="AED 500 – 5,000" />
              </div>
            </div>
          </Card>

          <Card className="lg:col-span-7" title="Upfront cash required at transfer" subtitle="Breakdown of DLD, Registration Trustee, NOC, bank & agency fees" tone="champ">
            <div className="grid sm:grid-cols-3 gap-3 mb-4">
              <div className="p-4 rounded-2xl bg-[#121212] text-white">
                <div className="text-[11px] uppercase tracking-wider text-[#f7f7f7]">Total cash to close</div>
                <div className="font-display text-[24px] font-semibold mt-1"><AnimatedNumber value={costRes.cashRequired} format={v => aed(v)} /></div>
                <div className="text-[11.5px] text-white/70 mt-1">Down payment + all closing costs</div>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-[#e5e5e5]">
                <div className="text-[11px] uppercase tracking-wider text-muted">Closing fees total</div>
                <div className="font-display text-[22px] font-semibold text-ink mt-1"><AnimatedNumber value={costRes.fees} format={v => aed(v)} /></div>
                <div className="text-[11.5px] text-muted mt-1">{costRes.feesPct.toFixed(2)}% of property price</div>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-[#e5e5e5]">
                <div className="text-[11px] uppercase tracking-wider text-muted">Down payment</div>
                <div className="font-display text-[22px] font-semibold text-ink mt-1"><AnimatedNumber value={costRes.downPayment} format={v => aed(v)} /></div>
                <div className="text-[11.5px] text-muted mt-1">{cUseLoan ? `${cDownPct}% equity` : '100% cash purchase'}</div>
              </div>
            </div>

            <div className="grid md:grid-cols-[200px_1fr] gap-4 items-center">
              <div style={{ height: 190 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={costRes.lines} dataKey="amount" nameKey="label" innerRadius={48} outerRadius={78} paddingAngle={3} cornerRadius={4}>
                      {costRes.lines.map((_, i) => <Cell key={i} fill={CHART[i % CHART.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => aed(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-2xl p-4 border border-[#e5e5e5]">
                {costRes.lines.map((l, i) => (
                  <div key={l.key} className="swk-kv">
                    <span className="flex items-center gap-2">
                      <i className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: CHART[i % CHART.length] }} />
                      <span><strong className="text-ink font-medium">{l.label}</strong><small className="block text-[11px] text-muted">{l.note}</small></span>
                    </span>
                    <b>{aed(l.amount)}</b>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </Reveal>
      )}

      {/* ============================================================ 2. MORTGAGE */}
      {active === 'mortgage' && (
        <Reveal className="grid gap-5 lg:grid-cols-12">
          <Card className="lg:col-span-5" title="Borrower & property profile" subtitle="UAE Central Bank LTV & 50% DBR rules">
            <div className="grid gap-3.5">
              <Field label="Property price" value={mPrice} onChange={setMPrice} prefix="AED" step={100000} />
              <div>
                <div className="swk-field-label mb-1.5">Residency status</div>
                <Segmented value={mResidency} onChange={setMResidency} options={[{ value: 'expat', label: 'UAE Expat / Non-Resident' }, { value: 'national', label: 'UAE National' }]} layoutId="mort-res" />
              </div>
              <div className="flex flex-wrap gap-5 py-1">
                <label className="swk-toggle"><input type="checkbox" checked={mFirstHome} onChange={e => setMFirstHome(e.target.checked)} /><span>First property</span></label>
                <label className="swk-toggle"><input type="checkbox" checked={mOffPlan} onChange={e => setMOffPlan(e.target.checked)} /><span>Off-plan (50% LTV cap)</span></label>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <Field label="Down payment" value={mDownPct} onChange={setMDownPct} suffix="%" step={5} />
                <Field label="Interest rate" value={mRate} onChange={setMRate} suffix="% p.a." step={0.1} />
                <Field label="Tenure (max 25y)" value={mYears} onChange={v => setMYears(Math.min(25, Math.max(1, v)))} suffix="yrs" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Monthly net income" value={mIncome} onChange={setMIncome} prefix="AED" step={2500} />
                <Field label="Existing monthly debts" value={mDebts} onChange={setMDebts} prefix="AED" step={500} hint="Cards, auto loans, etc." />
              </div>
            </div>
          </Card>

          <Card className="lg:col-span-7" title="CBUAE pre-qualification & amortisation" subtitle="Maximum LTV, monthly EMI & Debt-Burden Ratio check">
            <div className="grid sm:grid-cols-3 gap-3 mb-4">
              <div className="p-4 rounded-2xl bg-[#121212] text-white">
                <div className="text-[11px] uppercase tracking-wider text-[#f7f7f7]">Monthly EMI</div>
                <div className="font-display text-[24px] font-semibold mt-1"><AnimatedNumber value={mortRes.emi} format={v => aed(v)} /></div>
                <div className="text-[11.5px] text-white/70 mt-1">Loan {aed(mortRes.loan, { compact: true })} ({(mortRes.appliedLtv * 100).toFixed(0)}% LTV)</div>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-[#e5e5e5]">
                <div className="text-[11px] uppercase tracking-wider text-muted">CBUAE Max LTV</div>
                <div className="font-display text-[24px] font-semibold text-ink mt-1">{(mortRes.ltv * 100).toFixed(0)}%</div>
                <div className="text-[11.5px] text-muted mt-1">Min down {(100 - mortRes.ltv * 100).toFixed(0)}% required</div>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-[#e5e5e5]">
                <div className="text-[11px] uppercase tracking-wider text-muted">Max affordable price</div>
                <div className="font-display text-[22px] font-semibold text-ink mt-1"><AnimatedNumber value={mortRes.maxPriceByDbr} format={v => aed(v, { compact: true })} /></div>
                <div className="text-[11.5px] text-muted mt-1">At 50% DBR ceiling</div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#ffffff] border border-[#e5e5e5] mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] font-semibold text-ink">Debt-Burden Ratio (DBR): {(mortRes.dbr * 100).toFixed(1)}% of monthly income</span>
                <Pill tone={mortRes.dbrOk ? 'oasis' : 'dune'}>{mortRes.dbrOk ? 'Passes CBUAE ≤ 50% rule' : 'Exceeds 50% CBUAE limit'}</Pill>
              </div>
              <Bar value={mortRes.dbr * 100} max={100} color={mortRes.dbrOk ? SWK.oasis : SWK.dune} height={10} />
              <div className="flex justify-between text-[11px] text-muted mt-1.5">
                <span>0%</span><span>CBUAE statutory cap: 50%</span><span>100%</span>
              </div>
            </div>

            <div style={{ height: 210 }}>
              <ResponsiveContainer>
                <AreaChart data={mortRes.schedule} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mBal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={SWK.navy} stopOpacity={0.35} /><stop offset="100%" stopColor={SWK.navy} stopOpacity={0} /></linearGradient>
                    <linearGradient id="mPaid" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={SWK.champ} stopOpacity={0.45} /><stop offset="100%" stopColor={SWK.champ} stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
                  <XAxis dataKey="year" tickFormatter={y => `Yr ${y}`} />
                  <YAxis tickFormatter={v => aed(v, { compact: true }).replace('AED ', '')} width={54} />
                  <Tooltip formatter={(v: any) => aed(Number(v))} />
                  <Area type="monotone" dataKey="balance" name="Remaining balance" stroke={SWK.navy} strokeWidth={2} fill="url(#mBal)" />
                  <Area type="monotone" dataKey="paid" name="Equity paid" stroke={SWK.champDeep} strokeWidth={2} fill="url(#mPaid)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Reveal>
      )}

      {/* ============================================================ 3. RERA RENT INDEX */}
      {active === 'rera' && (
        <Reveal className="grid gap-5 lg:grid-cols-12">
          <Card className="lg:col-span-5" title="Tenancy & RERA index lookup" subtitle="Dubai Decree No. 43 of 2013 statutory rent slabs">
            <div className="grid gap-4">
              <label className="swk-field">
                <span className="swk-field-label">Dubai community</span>
                <span className="swk-field-box">
                  <select value={rComm} onChange={e => { setRComm(e.target.value); setRIndexOverride(null) }}>
                    {COMMUNITIES.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </span>
              </label>
              <div>
                <div className="swk-field-label mb-1.5">Bedrooms</div>
                <Segmented value={rBeds} onChange={v => { setRBeds(v); setRIndexOverride(null) }} options={[{ value: 'Studio', label: 'Studio' }, { value: '1 BR', label: '1 BR' }, { value: '2 BR', label: '2 BR' }, { value: '3 BR', label: '3 BR' }]} layoutId="rera-beds" />
              </div>
              <Field label="Current annual contract rent" value={rCurrent} onChange={setRCurrent} prefix="AED" step={5000} />
              <Field label="RERA index average rent (editable)" value={indexAvg} onChange={v => setRIndexOverride(v)} prefix="AED" step={5000} hint="Auto-filled from community benchmark; override with live Dubai REST figure." />
            </div>
          </Card>

          <Card className="lg:col-span-7" title="RERA renewal calculation" subtitle="90-day written notice required prior to lease expiry (Law 26/2007)">
            <div className="grid sm:grid-cols-3 gap-3 mb-4">
              <div className="p-4 rounded-2xl bg-[#121212] text-white">
                <div className="text-[11px] uppercase tracking-wider text-[#f7f7f7]">Maximum new rent</div>
                <div className="font-display text-[24px] font-semibold mt-1"><AnimatedNumber value={reraRes.maxRent} format={v => aed(v)} /></div>
                <div className="text-[11.5px] text-white/70 mt-1">+{aed(reraRes.maxIncrease)} / year</div>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-[#e5e5e5]">
                <div className="text-[11px] uppercase tracking-wider text-muted">Allowed increase</div>
                <div className="font-display text-[26px] font-semibold text-ink mt-1">{reraRes.maxIncreasePct}%</div>
                <div className="text-[11.5px] text-muted mt-1">{reraRes.band.label}</div>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-[#e5e5e5]">
                <div className="text-[11px] uppercase tracking-wider text-muted">Gap vs RERA index</div>
                <div className="font-display text-[24px] font-semibold text-ink mt-1">{reraRes.below.toFixed(1)}%</div>
                <div className="text-[11.5px] text-muted mt-1">Below index average</div>
              </div>
            </div>

            <table className="swk-table">
              <thead>
                <tr><th>Decree 43/2013 slab</th><th>Max increase</th><th className="num">Resulting rent</th><th>Status</th></tr>
              </thead>
              <tbody>
                {RERA_BANDS.map(b => {
                  const match = b.increase === reraRes.maxIncreasePct
                  return (
                    <tr key={b.label} style={match ? { background: '#f7f7f7', fontWeight: 600 } : undefined}>
                      <td>{b.label}</td>
                      <td>{b.increase}%</td>
                      <td className="num">{aed(rCurrent * (1 + b.increase / 100))}</td>
                      <td>{match ? <Pill tone="champ">Applies to this lease</Pill> : <span className="text-xs text-muted">—</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        </Reveal>
      )}

      {/* ============================================================ 4. YIELD & ROI */}
      {active === 'yield' && (
        <Reveal className="grid gap-5 lg:grid-cols-12">
          <Card className="lg:col-span-5" title="Property & operating assumptions" subtitle="Mollak / RERA service charge index & management deductions">
            <div className="grid gap-3.5">
              <label className="swk-field">
                <span className="swk-field-label">Community preset (auto-fills service charge)</span>
                <span className="swk-field-box">
                  <select value={yComm} onChange={e => {
                    const c = COMMUNITIES.find(x => x.name === e.target.value)
                    setYComm(e.target.value)
                    if (c) setYSc(c.serviceCharge)
                  }}>
                    {COMMUNITIES.map(c => <option key={c.id} value={c.name}>{c.name} (AED {c.serviceCharge}/sqft)</option>)}
                  </select>
                </span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Purchase price" value={yPrice} onChange={setYPrice} prefix="AED" step={50000} />
                <Field label="Annual gross rent" value={yRent} onChange={setYRent} prefix="AED" step={5000} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Built-up area" value={yArea} onChange={setYArea} suffix="sqft" step={50} />
                <Field label="Service charge" value={ySc} onChange={setYSc} suffix="AED/sqft" step={1} />
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <Field label="Vacancy" value={yVacancy} onChange={setYVacancy} suffix="wks/yr" />
                <Field label="Maintenance" value={yMaint} onChange={setYMaint} suffix="%" step={0.5} />
                <Field label="Property mgmt" value={yMgmt} onChange={setYMgmt} suffix="%" step={0.5} />
              </div>
            </div>
          </Card>

          <Card className="lg:col-span-7" title="Gross vs net yield after DLD costs & service charges" subtitle="Includes 4% DLD transfer & agency acquisition cost in denominator">
            <div className="flex flex-wrap items-center gap-6 p-4 rounded-2xl bg-[#ffffff] border border-[#e5e5e5] mb-4">
              <ProgressRing value={Math.min(100, yieldRes.gross * 10)} size={104} color={SWK.navy} label={pct(yieldRes.gross, 2)} sub="Gross" />
              <ProgressRing value={Math.min(100, yieldRes.net * 10)} size={104} color={SWK.oasis} label={pct(yieldRes.net, 2)} sub="Net ROI" />
              <div className="flex-1 min-w-[200px] grid gap-1.5">
                <div className="swk-kv"><span>Net annual cashflow</span><b>{aed(yieldRes.netIncome)}</b></div>
                <div className="swk-kv"><span>Monthly net income</span><b>{aed(yieldRes.netIncome / 12)}</b></div>
                <div className="swk-kv"><span>Payback horizon</span><b>{Number.isFinite(yieldRes.paybackYears) ? `${yieldRes.paybackYears.toFixed(1)} yrs` : '—'}</b></div>
              </div>
            </div>

            <div className="grid gap-2.5">
              {[
                { l: 'Gross annual rent', v: yRent, c: SWK.navy },
                { l: `Mollak service charges (${yArea} sqft × AED ${ySc})`, v: yieldRes.serviceCharge, c: SWK.champDeep },
                { l: `Property management (${yMgmt}%)`, v: yieldRes.mgmt, c: SWK.ocean },
                { l: `Maintenance reserve (${yMaint}%)`, v: yieldRes.maint, c: SWK.sky },
                { l: `Vacancy allowance (${yVacancy} weeks)`, v: yieldRes.vacancy, c: SWK.dune },
              ].map(r => (
                <div key={r.l}>
                  <div className="flex justify-between text-[12.5px] mb-1"><span className="text-body">{r.l}</span><b className="text-ink">{aed(r.v)}</b></div>
                  <Bar value={r.v} max={yRent} color={r.c} height={7} />
                </div>
              ))}
            </div>
          </Card>
        </Reveal>
      )}

      {/* ============================================================ 5. GOLDEN VISA */}
      {active === 'visa' && (
        <Reveal className="grid gap-5 lg:grid-cols-12">
          <Card className="lg:col-span-5" title="Property & ownership structure" subtitle="ICP / DLD Golden Visa (AED 2M) & Investor Visa (AED 750K)">
            <div className="grid gap-4">
              <Field label="Title deed / Oqood property value" value={vValue} onChange={setVValue} prefix="AED" step={50000} />
              <Field label="Number of joint owners on deed" value={vOwners} onChange={v => setVOwners(Math.max(1, v))} step={1} hint="Spouses may combine shares if marriage certificate is attested." />
              <div className="flex flex-wrap gap-5 pt-1">
                <label className="swk-toggle"><input type="checkbox" checked={vMortgaged} onChange={e => setVMortgaged(e.target.checked)} /><span>Mortgaged property</span></label>
                <label className="swk-toggle"><input type="checkbox" checked={vOffPlan} onChange={e => setVOffPlan(e.target.checked)} /><span>Off-plan (Oqood)</span></label>
              </div>
            </div>
          </Card>

          <Card className="lg:col-span-7" title="Residency eligibility verdict" subtitle="Assessed per owner share against statutory DLD thresholds" tone={visaRes.golden ? 'navy' : 'light'}>
            <div className="flex items-center gap-4 mb-5">
              <div className="w-14 h-14 rounded-2xl grid place-items-center bg-[#0e9f6e]/20 text-[#0e9f6e] flex-none">
                <Award size={28} />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[.2em] text-[#0e9f6e]">Qualification result</div>
                <div className="font-display text-[26px] font-semibold">{visaRes.tier}</div>
                <div className="text-xs opacity-80 mt-0.5">Individual share: {aed(visaRes.share)} (threshold: {aed(UAE.goldenVisaMin)})</div>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex justify-between text-xs mb-1.5">
                <span>Progress toward AED 2,000,000 Golden Visa</span>
                <b>{Math.min(100, (visaRes.share / UAE.goldenVisaMin) * 100).toFixed(0)}%</b>
              </div>
              <Bar value={visaRes.share} max={UAE.goldenVisaMin} color={SWK.champ} height={10} />
            </div>

            <div className="grid gap-2 text-[13px]">
              {visaRes.notes.map((n, i) => (
                <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-white/10 border border-white/15">
                  <ShieldCheck size={16} className="text-[#0e9f6e] mt-0.5 flex-none" />
                  <span>{n}</span>
                </div>
              ))}
            </div>
          </Card>
        </Reveal>
      )}

      {/* ============================================================ 6. COMMISSION WATERFALL */}
      {active === 'commission' && (
        <Reveal className="grid gap-5 lg:grid-cols-12">
          <Card className="lg:col-span-5" title="Deal & split structure" subtitle="Form I co-broking, referral, agent slab & 5% FTA VAT">
            <div className="grid gap-3.5">
              <Field label="Transaction value" value={wPrice} onChange={setWPrice} prefix="AED" step={100000} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Gross commission %" value={wPct} onChange={setWPct} suffix="%" step={0.25} />
                <Field label="External co-broker (Form I)" value={wCoBroker} onChange={setWCoBroker} suffix="%" step={5} />
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <Field label="Referral %" value={wReferral} onChange={setWReferral} suffix="%" step={1} />
                <Field label="Agent split %" value={wAgentSplit} onChange={setWAgentSplit} suffix="%" step={5} />
                <Field label="Team lead %" value={wLeader} onChange={setWLeader} suffix="%" step={1} />
              </div>
            </div>
          </Card>

          <Card className="lg:col-span-7" title="Commission waterfall & FTA tax invoice" subtitle="Net brokerage retention and agent wallet payout">
            <div className="grid sm:grid-cols-3 gap-3 mb-4">
              <div className="p-4 rounded-2xl bg-[#121212] text-white">
                <div className="text-[11px] uppercase tracking-wider text-[#f7f7f7]">Tax invoice (incl. 5% VAT)</div>
                <div className="font-display text-[22px] font-semibold mt-1"><AnimatedNumber value={commRes.invoiceTotal} format={v => aed(v)} /></div>
                <div className="text-[11px] text-white/70 mt-1">VAT 5%: {aed(commRes.vat)}</div>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-[#e5e5e5]">
                <div className="text-[11px] uppercase tracking-wider text-muted">SWK Agent payout</div>
                <div className="font-display text-[22px] font-semibold text-ink mt-1"><AnimatedNumber value={commRes.agent} format={v => aed(v)} /></div>
                <div className="text-[11px] text-muted mt-1">{wAgentSplit}% of net pool</div>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-[#e5e5e5]">
                <div className="text-[11px] uppercase tracking-wider text-muted">SWK House net</div>
                <div className="font-display text-[22px] font-semibold text-ink mt-1"><AnimatedNumber value={commRes.company} format={v => aed(v)} /></div>
                <div className="text-[11px] text-muted mt-1">Retained by brokerage</div>
              </div>
            </div>

            <div style={{ height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={[
                  { name: 'Gross', amount: commRes.gross },
                  { name: 'Co-broker', amount: commRes.coBroker },
                  { name: 'Referral', amount: commRes.referral },
                  { name: 'Agent', amount: commRes.agent },
                  { name: 'Leader', amount: commRes.leader },
                  { name: 'SWK Net', amount: commRes.company },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={v => aed(v, { compact: true }).replace('AED ', '')} width={54} />
                  <Tooltip formatter={(v: any) => aed(Number(v))} />
                  <RBar dataKey="amount" radius={[8, 8, 0, 0]}>
                    {CHART.slice(0, 6).map((c, i) => <Cell key={i} fill={c} />)}
                  </RBar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Reveal>
      )}

      {/* ============================================================ 7. TENANT MOVE-IN */}
      {active === 'movein' && (
        <Reveal className="grid gap-5 lg:grid-cols-12">
          <Card className="lg:col-span-5" title="Lease terms" subtitle="Ejari, DEWA deposit, security deposit & PDC cheques">
            <div className="grid gap-4">
              <Field label="Annual rent" value={tRent} onChange={setTRent} prefix="AED" step={5000} />
              <div>
                <div className="swk-field-label mb-1.5">Cheque frequency</div>
                <Segmented value={tCheques} onChange={setTCheques} options={[
                  { value: '1', label: '1 Cheque' }, { value: '2', label: '2 Cheques' }, { value: '4', label: '4 Cheques' }, { value: '6', label: '6 Cheques' }, { value: '12', label: '12 Cheques' },
                ]} layoutId="move-chq" />
              </div>
              <div className="flex flex-wrap gap-5 pt-1">
                <label className="swk-toggle"><input type="checkbox" checked={tFurnished} onChange={e => setTFurnished(e.target.checked)} /><span>Furnished (10% deposit)</span></label>
                <label className="swk-toggle"><input type="checkbox" checked={tVilla} onChange={e => setTVilla(e.target.checked)} /><span>Villa (AED 4,000 DEWA)</span></label>
              </div>
            </div>
          </Card>

          <Card className="lg:col-span-7" title="Day-1 tenant cash summary" subtitle="Includes first rent cheque, deposits, Ejari & agency fee">
            <div className="grid sm:grid-cols-3 gap-3 mb-4">
              <div className="p-4 rounded-2xl bg-[#121212] text-white">
                <div className="text-[11px] uppercase tracking-wider text-[#f7f7f7]">Upfront move-in total</div>
                <div className="font-display text-[22px] font-semibold mt-1"><AnimatedNumber value={moveRes.moveIn} format={v => aed(v)} /></div>
                <div className="text-[11px] text-white/70 mt-1">Includes 1st cheque</div>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-[#e5e5e5]">
                <div className="text-[11px] uppercase tracking-wider text-muted">Each PDC cheque</div>
                <div className="font-display text-[22px] font-semibold text-ink mt-1"><AnimatedNumber value={moveRes.chequeAmount} format={v => aed(v)} /></div>
                <div className="text-[11px] text-muted mt-1">{tCheques} cheques / year</div>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-[#e5e5e5]">
                <div className="text-[11px] uppercase tracking-wider text-muted">DM housing fee (5%)</div>
                <div className="font-display text-[22px] font-semibold text-ink mt-1"><AnimatedNumber value={moveRes.housingFeeMonthly} format={v => aed(v)} /></div>
                <div className="text-[11px] text-muted mt-1">Billed monthly via DEWA</div>
              </div>
            </div>

            <div className="bg-[#ffffff] rounded-2xl p-4 border border-[#e5e5e5]">
              {moveRes.lines.map(l => (
                <div key={l.label} className="swk-kv">
                  <span className="flex items-center gap-2">
                    <span>{l.label}</span>
                    <Pill tone={l.refundable ? 'oasis' : 'grey'}>{l.refundable ? 'Refundable' : 'Fee / Rent'}</Pill>
                  </span>
                  <b>{aed(l.amount)}</b>
                </div>
              ))}
            </div>
          </Card>
        </Reveal>
      )}

      {/* ============================================================ 8. OFF-PLAN SCHEDULE */}
      {active === 'offplan' && (
        <Reveal className="grid gap-5 lg:grid-cols-12">
          <Card className="lg:col-span-5" title="Developer payment plan" subtitle="Booking, construction, handover, post-handover & 4% Oqood">
            <div className="grid gap-3.5">
              <Field label="Launch unit price" value={oPrice} onChange={setOPrice} prefix="AED" step={50000} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Booking / down %" value={oBooking} onChange={setOBooking} suffix="%" step={5} />
                <Field label="During construction %" value={oConst} onChange={setOConst} suffix="%" step={5} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="On handover %" value={oHandover} onChange={setOHandover} suffix="%" step={5} />
                <Field label="Post-handover (24m) %" value={oPost} onChange={setOPost} suffix="%" step={5} />
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <Field label="Const. milestones" value={oConstInst} onChange={v => setOConstInst(Math.max(1, Math.min(12, v)))} />
                <Field label="Post-HO cheques" value={oPostInst} onChange={v => setOPostInst(Math.max(0, Math.min(12, v)))} />
                <Field label="Months to HO" value={oMonthsToHandover} onChange={v => setOMonthsToHandover(Math.max(6, Math.min(60, v)))} suffix="m" />
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted">Plan total: <b>{offRes.planPct}%</b></span>
                <Pill tone={offRes.valid ? 'oasis' : 'dune'}>{offRes.valid ? 'Totals 100%' : 'Must equal 100%'}</Pill>
              </div>
            </div>
          </Card>

          <Card className="lg:col-span-7" title="Instalment schedule & Oqood registration" subtitle="Escrow-protected milestones per Dubai Law No. 8 of 2007">
            <div className="max-h-[380px] overflow-auto">
              <table className="swk-table">
                <thead>
                  <tr><th>Milestone</th><th>Phase</th><th>Target date</th><th className="num">Share</th><th className="num">Amount (AED)</th></tr>
                </thead>
                <tbody>
                  {offRes.rows.map((r, i) => (
                    <tr key={i}>
                      <td className="font-medium">{r.label}</td>
                      <td><Pill tone={r.phase === 'DLD' ? 'champ' : r.phase === 'Handover' ? 'oasis' : 'navy'}>{r.phase}</Pill></td>
                      <td className="text-xs text-muted">{r.date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</td>
                      <td className="num">{r.pct.toFixed(1)}%</td>
                      <td className="num font-semibold">{aed(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Reveal>
      )}

      {/* ============================================================ 9. AREA & CURRENCY CONVERTER */}
      {active === 'converter' && (
        <Reveal className="grid gap-5 lg:grid-cols-12">
          <Card className="lg:col-span-5" title="Dubai Area Converter (sqft ↔ sqm)" subtitle="DLD title deed square metres vs brokerage square feet">
            <div className="grid gap-4">
              <Field
                label="Built-up / Plot Area (sq. ft)"
                value={Number(convSqft.toFixed(2))}
                onChange={v => setConvSqft(Math.max(0, v))}
                suffix="sqft"
                step={25}
              />
              <Field
                label="Built-up / Plot Area (sq. m)"
                value={Number(convSqm.toFixed(2))}
                onChange={v => setConvSqft(Math.max(0, v) * SQFT_PER_SQM)}
                suffix="sqm"
                step={5}
                hint={`1 sqm = ${SQFT_PER_SQM.toFixed(4)} sqft`}
              />
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-line">
                <Field
                  label="Price per sqft"
                  value={Math.round(convPricePerSqft)}
                  onChange={v => setConvPricePerSqft(Math.max(0, v))}
                  prefix="AED"
                  step={50}
                />
                <Field
                  label="Price per sqm"
                  value={Math.round(convPricePerSqft * SQFT_PER_SQM)}
                  onChange={v => setConvPricePerSqft(Math.max(0, v) / SQFT_PER_SQM)}
                  prefix="AED"
                  step={250}
                />
              </div>
              <div className="rounded-2xl bg-[#121212] text-white p-4">
                <div className="text-[11px] uppercase tracking-wider text-white/75">Implied Property Value</div>
                <div className="font-display text-[22px] font-semibold mt-1">{aed(convSqft * convPricePerSqft)}</div>
                <div className="text-[11.5px] text-white/70 mt-0.5">
                  {num(convSqft, 1)} sqft ({num(convSqm, 2)} sqm) @ {aed(convPricePerSqft)}/sqft
                </div>
              </div>
            </div>
          </Card>

          <Card
            className="lg:col-span-7"
            title="Multi-Currency Property Converter"
            subtitle="AED ↔ USD / EUR / GBP / INR / SAR / RUB / CNY with editable exchange rates"
            actions={
              <button
                type="button"
                className="btn outline sm"
                onClick={() => setRates({ ...DEFAULT_RATES_TO_AED })}
              >
                <RotateCcw size={13} /> Reset Rates
              </button>
            }
          >
            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              <label className="swk-field">
                <span className="swk-field-label">Input Currency</span>
                <span className="swk-field-box">
                  <select value={convCcy} onChange={e => setConvCcy(e.target.value as CcyCode)}>
                    {(Object.keys(CCY_LABELS) as CcyCode[]).map(c => (
                      <option key={c} value={c}>{c} — {CCY_LABELS[c]}</option>
                    ))}
                  </select>
                </span>
              </label>
              <Field
                label={`Amount (${convCcy})`}
                value={convAmount}
                onChange={v => setConvAmount(Math.max(0, v))}
                prefix={convCcy}
                step={10000}
              />
            </div>

            <div className="overflow-auto">
              <table className="swk-table">
                <thead>
                  <tr>
                    <th>Currency</th>
                    <th>Rate (1 unit = AED)</th>
                    <th className="num">Converted Value</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(CCY_LABELS) as CcyCode[]).map(code => {
                    const rate = rates[code]
                    const converted = convAedTotal / Math.max(0.0001, rate)
                    return (
                      <tr key={code} style={code === convCcy ? { background: '#f5f5f5', fontWeight: 600 } : undefined}>
                        <td>
                          <b>{code}</b> <span className="text-xs text-muted">· {CCY_LABELS[code]}</span>
                        </td>
                        <td>
                          {code === 'AED' ? (
                            <span className="text-xs text-muted">1.0000 (Base)</span>
                          ) : (
                            <input
                              type="number"
                              step="0.001"
                              min="0.0001"
                              className="input"
                              style={{ width: 110, minHeight: 30, padding: '2px 8px', fontSize: 12.5 }}
                              value={rate}
                              onChange={e => setRates(r => ({ ...r, [code]: Math.max(0.0001, Number(e.target.value) || 0.0001) }))}
                              aria-label={`${code} to AED rate`}
                            />
                          )}
                        </td>
                        <td className="num font-semibold">
                          {code} {converted.toLocaleString('en-US', { maximumFractionDigits: code === 'AED' ? 0 : 2 })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </Reveal>
      )}

      {/* ============================================================ 10. PDC CHEQUE SPLIT */}
      {active === 'pdc' && (
        <Reveal className="grid gap-5 lg:grid-cols-12">
          <Card className="lg:col-span-5" title="Tenancy & PDC Parameters" subtitle="Split annual rent into 1 / 2 / 4 / 6 / 12 Dubai PDC cheques">
            <div className="grid gap-4">
              <Field label="Annual Contract Rent" value={pdcRent} onChange={v => setPdcRent(Math.max(0, v))} prefix="AED" step={5000} />
              <div>
                <div className="swk-field-label mb-1.5">Number of Cheques</div>
                <Segmented
                  value={pdcCount}
                  onChange={setPdcCount}
                  options={[
                    { value: '1', label: '1' },
                    { value: '2', label: '2' },
                    { value: '4', label: '4' },
                    { value: '6', label: '6' },
                    { value: '12', label: '12' },
                  ]}
                  layoutId="pdc-count"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="swk-field">
                  <span className="swk-field-label">Lease Start Date</span>
                  <span className="swk-field-box">
                    <input type="date" value={pdcStart} onChange={e => setPdcStart(e.target.value)} />
                  </span>
                </label>
                <Field label="Ejari Registration Fee" value={pdcEjariFee} onChange={v => setPdcEjariFee(Math.max(0, v))} prefix="AED" step={10} />
              </div>
              <label className="swk-toggle">
                <input type="checkbox" checked={pdcFurnished} onChange={e => setPdcFurnished(e.target.checked)} />
                <span>Furnished unit (10% security deposit instead of 5%)</span>
              </label>
            </div>
          </Card>

          <Card className="lg:col-span-7" title="Post-Dated Cheque Schedule" subtitle="Cheque dates, security deposit, Ejari & Day-1 cash required">
            <div className="grid sm:grid-cols-4 gap-3 mb-4">
              <div className="p-3.5 rounded-2xl bg-[#121212] text-white">
                <div className="text-[10.5px] uppercase tracking-wider text-white/75">1st Cheque</div>
                <div className="font-display text-[19px] font-semibold mt-1">{aed(pdcSchedule.firstCheque)}</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-white border border-line">
                <div className="text-[10.5px] uppercase tracking-wider text-muted">Security ({pdcSchedule.depositPct}%)</div>
                <div className="font-display text-[19px] font-semibold text-ink mt-1">{aed(pdcSchedule.deposit)}</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-white border border-line">
                <div className="text-[10.5px] uppercase tracking-wider text-muted">Ejari + Agency VAT</div>
                <div className="font-display text-[19px] font-semibold text-ink mt-1">{aed(pdcEjariFee + pdcSchedule.agencyInclVat)}</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#e8fff6] border border-[#0e9f6e]/30">
                <div className="text-[10.5px] uppercase tracking-wider text-[#121212]">Day-1 Total</div>
                <div className="font-display text-[19px] font-semibold text-[#121212] mt-1">{aed(pdcSchedule.dayOneTotal)}</div>
              </div>
            </div>

            <div className="max-h-[340px] overflow-auto">
              <table className="swk-table">
                <thead>
                  <tr>
                    <th>Cheque #</th>
                    <th>Due Date</th>
                    <th>Payee</th>
                    <th className="num">Amount (AED)</th>
                  </tr>
                </thead>
                <tbody>
                  {pdcSchedule.rows.map(r => (
                    <tr key={r.index}>
                      <td className="font-semibold">Cheque {r.index} of {pdcCount}</td>
                      <td>{r.dueDate}</td>
                      <td className="text-xs text-muted">Landlord / Property Management</td>
                      <td className="num font-semibold">{aed(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Reveal>
      )}

      {/* ============================================================ 11. PUBLIC QR GENERATOR */}
      {active === 'qr' && (
        <Reveal className="grid gap-5 lg:grid-cols-12">
          <Card className="lg:col-span-6" title="Branded Public QR Generator" subtitle="Generate downloadable QR PNGs for SWKPROPERTY.COM listings, WhatsApp links, and agent vCards">
            <div className="grid gap-4">
              <div>
                <div className="swk-field-label mb-1.5">QR Type</div>
                <Segmented
                  value={qrMode}
                  onChange={setQrMode}
                  options={[
                    { value: 'listing', label: 'SWKPROPERTY.COM' },
                    { value: 'whatsapp', label: 'WhatsApp' },
                    { value: 'vcard', label: 'vCard' },
                    { value: 'custom', label: 'Custom URL' },
                  ]}
                  layoutId="qr-mode"
                />
              </div>

              {qrMode === 'listing' && (
                <label className="swk-field">
                  <span className="swk-field-label">SWKPROPERTY.COM URL</span>
                  <span className="swk-field-box">
                    <input type="url" value={qrUrl} onChange={e => setQrUrl(e.target.value)} placeholder="https://swkpropertiesuae.com/properties/..." />
                  </span>
                </label>
              )}

              {qrMode === 'whatsapp' && (
                <div className="grid gap-3">
                  <label className="swk-field">
                    <span className="swk-field-label">WhatsApp Number (with country code)</span>
                    <span className="swk-field-box">
                      <input type="text" value={qrWaPhone} onChange={e => setQrWaPhone(e.target.value)} placeholder="+971501000001" />
                    </span>
                  </label>
                  <label className="swk-field">
                    <span className="swk-field-label">Prefilled Message</span>
                    <span className="swk-field-box">
                      <input type="text" value={qrWaText} onChange={e => setQrWaText(e.target.value)} placeholder="Hello SWK Properties..." />
                    </span>
                  </label>
                </div>
              )}

              {qrMode === 'vcard' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="swk-field">
                    <span className="swk-field-label">Full Name</span>
                    <span className="swk-field-box"><input type="text" value={qrVcName} onChange={e => setQrVcName(e.target.value)} /></span>
                  </label>
                  <label className="swk-field">
                    <span className="swk-field-label">Role / Title</span>
                    <span className="swk-field-box"><input type="text" value={qrVcTitle} onChange={e => setQrVcTitle(e.target.value)} /></span>
                  </label>
                  <label className="swk-field">
                    <span className="swk-field-label">Phone</span>
                    <span className="swk-field-box"><input type="text" value={qrVcPhone} onChange={e => setQrVcPhone(e.target.value)} /></span>
                  </label>
                  <label className="swk-field">
                    <span className="swk-field-label">Email</span>
                    <span className="swk-field-box"><input type="email" value={qrVcEmail} onChange={e => setQrVcEmail(e.target.value)} /></span>
                  </label>
                </div>
              )}

              {qrMode === 'custom' && (
                <label className="swk-field">
                  <span className="swk-field-label">Public URL or Text</span>
                  <span className="swk-field-box">
                    <input type="text" value={qrCustom} onChange={e => setQrCustom(e.target.value)} placeholder="https://www.swk.properties/..." />
                  </span>
                </label>
              )}

              <label className="swk-field">
                <span className="swk-field-label">Card Caption</span>
                <span className="swk-field-box">
                  <input type="text" value={qrCaption} onChange={e => setQrCaption(e.target.value)} placeholder="Scan to view SWK Properties" />
                </span>
              </label>

              {qrErr && (
                <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 flex items-start gap-2">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <span>{qrErr}</span>
                </div>
              )}
            </div>
          </Card>

          <Card className="lg:col-span-6" title="SWK QR Preview" subtitle="Public marketing & contact sharing only (attendance prefixes strictly blocked)">
            <div className="flex flex-col items-center justify-center gap-4 p-4 rounded-2xl bg-[#f7f7f7] border border-line">
              {qrDataUrl && !qrErr ? (
                <>
                  <div className="rounded-2xl bg-white p-5 border border-line shadow-sm text-center">
                    <img src="/brand/web/swk-logo-light.webp" alt="SWK Properties" className="h-8 w-auto mx-auto mb-3" />
                    <img src={qrDataUrl} alt="Generated SWK Public QR Code" className="w-56 h-56 mx-auto rounded-lg" />
                    {qrCaption.trim() && <div className="mt-2.5 text-xs font-semibold text-[#121212]">{qrCaption}</div>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn green" onClick={downloadQrPng}>
                      <Download size={15} /> Download QR PNG
                    </button>
                    <button
                      type="button"
                      className="btn outline"
                      onClick={() => { void navigator.clipboard.writeText(qrPayload) }}
                    >
                      <ArrowLeftRight size={15} /> Copy Payload
                    </button>
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-sm text-muted flex flex-col items-center gap-2">
                  <QrCode size={36} className="opacity-40" />
                  <span>{qrErr || 'Enter a public URL, WhatsApp link, or vCard details to preview QR.'}</span>
                </div>
              )}
            </div>
          </Card>
        </Reveal>
      )}

      <p className="text-xs text-muted text-center m-0">
        Indicative calculations based on DLD, RERA, CBUAE and FTA schedules. Verify final trustee, bank and developer NOC figures prior to issuing client quotes.
      </p>
    </div>
  )
}
