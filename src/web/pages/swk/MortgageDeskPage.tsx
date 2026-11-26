import { useMemo, useState } from 'react'
import { CustomSelect } from '../../components/CustomSelect'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  Calculator,
  CalendarClock,
  CheckCircle2,
  Landmark,
  PhoneCall,
  Plus,
  ShieldCheck,
} from 'lucide-react'
import { get, post, put } from '../../lib/api'
import { useToast } from '../../lib/toast'
import { BracketLink, SwissHeroHeader } from '../../components/ui/SwissPrimitives'

const aed = (n: number) => 'AED ' + Math.round(Number(n) || 0).toLocaleString('en-US')

export default function MortgageDeskPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [ev, setEv] = useState({
    client_name: '',
    bank_name: 'Emirates NBD',
    event_type: 'Valuation Booking',
    due_date: new Date().toISOString().slice(0, 10),
    rm_name: '',
    rm_phone: '',
    valuation_company: '',
    valuation_fee_aed: '2625',
    loan_amount_aed: '',
    notes: '',
  })

  // Built-in UAE CBUAE Stress Test & Cash-to-Close Calculator
  const [propPrice, setPropPrice] = useState(2_000_000)
  const [ltvPct, setLtvPct] = useState(80)
  const [ratePct, setRatePct] = useState(4.09)
  const [tenorYrs, setTenorYrs] = useState(25)
  const [monthlyIncome, setMonthlyIncome] = useState(35_000)
  const [existingEmi, setExistingEmi] = useState(3_000)

  const q = useQuery({
    queryKey: ['mortgage-desk-overview'],
    queryFn: () => get<any>('/api/mortgage-desk/overview'),
  })

  const calc = useMemo(() => {
    const loan = Math.round(propPrice * (ltvPct / 100))
    const down = propPrice - loan
    const r = ratePct / 100 / 12
    const n = tenorYrs * 12
    const emi = r > 0 ? Math.round((loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)) : Math.round(loan / n)
    const stressR = (ratePct + 2) / 100 / 12
    const stressEmi = Math.round((loan * stressR * Math.pow(1 + stressR, n)) / (Math.pow(1 + stressR, n) - 1))
    const dbrPct = monthlyIncome > 0 ? Math.round(((stressEmi + existingEmi) / monthlyIncome) * 1000) / 10 : 0
    const dld4 = Math.round(propPrice * 0.04) + 580
    const mortReg = Math.round(loan * 0.0025) + 290
    const agency = Math.round(propPrice * 0.02 * 1.05)
    const trustee = propPrice >= 500_000 ? 4_200 : 2_100
    const cashToClose = down + dld4 + mortReg + agency + trustee + 3_150
    return { loan, down, emi, stressEmi, dbrPct, dbrPass: dbrPct <= 50, cashToClose, dld4, mortReg }
  }, [propPrice, ltvPct, ratePct, tenorYrs, monthlyIncome, existingEmi])

  const createEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await post('/api/mortgage-desk/events', {
        ...ev,
        valuation_fee_aed: Number(ev.valuation_fee_aed) || 0,
        loan_amount_aed: Number(ev.loan_amount_aed) || 0,
      })
      toast.ok('Mortgage Desk schedule / valuation booked')
      setEv({ ...ev, client_name: '', rm_name: '', rm_phone: '', valuation_company: '', loan_amount_aed: '', notes: '' })
      void qc.invalidateQueries({ queryKey: ['mortgage-desk-overview'] })
    } catch (err: any) { toast.error(err.message) } finally { setBusy(false) }
  }

  const s = q.data?.summary ?? { active_cases: 0, total_loan_book_aed: 0, expected_referral_commission_aed: 0, upcoming_valuations: 0, overdue_deadlines: 0 }
  const events: any[] = q.data?.events ?? []
  const cases: any[] = q.data?.cases ?? []
  const banks: any[] = q.data?.uae_banks ?? []

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 pb-10">
      {/* Swiss Architectural Header */}
      <SwissHeroHeader
        eyebrow="Mortgage Exclusive Business Desk · UAE CBUAE Ready"
        title="Mortgage & Valuation Business Desk"
        subtitle="Manage schedules, Form F & Pre-Approval deadlines, independent bank valuations, Bank RM follow-ups, UAE partner bank rate cards, and CBUAE 50% DBR stress tests."
        actions={
          <>
            <BracketLink to="/e/mortgage_cases?new=1" variant="dark" size="sm">
              <Plus size={13} className="text-[#51fec0]" /> New Mortgage Case
            </BracketLink>
            <BracketLink to="/client-vault" variant="light" size="sm">
              <ShieldCheck size={13} className="text-[#0e9f6e]" /> 13-Doc Client Vault
            </BracketLink>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            ['Active Mortgage Cases', s.active_cases],
            ['Active Loan Book', aed(s.total_loan_book_aed)],
            ['Bank Referral Comm.', aed(s.expected_referral_commission_aed)],
            ['Pending Valuations', s.upcoming_valuations],
            ['Overdue Deadlines', s.overdue_deadlines],
          ].map(([lbl, val]) => (
            <div key={String(lbl)} className="rounded-2xl border border-black/[0.08] bg-white/95 p-3.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#5b6778]">{lbl}</div>
              <div className="mt-1.5 font-mono text-[18px] font-semibold text-[#121212] tabular-nums">{val}</div>
            </div>
          ))}
        </div>
      </SwissHeroHeader>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Book Valuation / Deadline / RM Follow-up */}
        <form onSubmit={createEvent} className="lg:col-span-5 rounded-3xl border border-line bg-card p-5 space-y-3 shadow-xs">
          <h2 className="m-0 text-[16px] font-bold text-ink flex items-center gap-2">
            <CalendarClock size={17} className="text-[#8a621c]" /> Book Valuation / Deadline / RM Follow-Up
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            <input className="input col-span-2" required placeholder="Client Name *" value={ev.client_name} onChange={e => setEv({ ...ev, client_name: e.target.value })} />
            <CustomSelect className="select" value={ev.event_type} onChange={e => setEv({ ...ev, event_type: e.target.value })}>
              {['Valuation Booking', 'Pre-Approval Deadline', 'Form F Expiry', 'FOL Signing', 'DLD Trustee Date', 'Bank RM Follow-up'].map(x => <option key={x} value={x}>{x}</option>)}
            </CustomSelect>
            <input className="input" type="date" required value={ev.due_date} onChange={e => setEv({ ...ev, due_date: e.target.value })} />
            <CustomSelect className="select" value={ev.bank_name} onChange={e => setEv({ ...ev, bank_name: e.target.value })}>
              {['Emirates NBD', 'FAB', 'ADCB', 'Mashreq', 'DIB', 'CBD', 'HSBC', 'RAKBANK', 'Standard Chartered', 'Ajman Bank'].map(b => <option key={b} value={b}>{b}</option>)}
            </CustomSelect>
            <input className="input" type="number" placeholder="Loan Amount (AED)" value={ev.loan_amount_aed} onChange={e => setEv({ ...ev, loan_amount_aed: e.target.value })} />
            <input className="input" placeholder="Bank RM Name" value={ev.rm_name} onChange={e => setEv({ ...ev, rm_name: e.target.value })} />
            <input className="input" placeholder="Bank RM Phone" value={ev.rm_phone} onChange={e => setEv({ ...ev, rm_phone: e.target.value })} />
            <input className="input" placeholder="Valuation Firm (e.g. Cavendish)" value={ev.valuation_company} onChange={e => setEv({ ...ev, valuation_company: e.target.value })} />
            <input className="input" type="number" placeholder="Valuation Fee (AED)" value={ev.valuation_fee_aed} onChange={e => setEv({ ...ev, valuation_fee_aed: e.target.value })} />
          </div>
          <textarea className="input min-h-[60px]" placeholder="Schedule notes, access contact, trustee timing…" value={ev.notes} onChange={e => setEv({ ...ev, notes: e.target.value })} />
          <button disabled={busy} type="submit" className="btn w-full justify-center bg-[#121212] text-[#51fec0]">
            <Plus size={14} /> Schedule &amp; Track Follow-Up
          </button>
        </form>

        {/* Live Schedules, Valuations & Deadlines Board */}
        <div className="lg:col-span-7 rounded-3xl border border-line bg-card p-5 shadow-xs space-y-3">
          <h2 className="m-0 text-[16px] font-bold text-ink">Active Schedules, Deadlines &amp; Valuation Queue ({events.length})</h2>
          {events.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line p-8 text-center text-xs text-muted">
              No scheduled valuations or bank deadlines yet. Book your first valuation or RM follow-up on the left.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[420px] overflow-auto">
              {events.map(item => (
                <div key={item.id} className="rounded-2xl border border-line bg-soft/40 p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#0b1f2a] px-2.5 py-0.5 text-[10.5px] font-bold text-[#f3d27a]">{item.event_type}</span>
                      <b className="text-[13.5px] text-ink">{item.client_name}</b>
                      <span className="text-xs font-semibold text-[#8a621c]">{item.bank_name}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted flex flex-wrap gap-3">
                      <span>Due: <b className="text-ink">{item.due_date}</b></span>
                      {item.loan_amount_aed > 0 && <span>Loan: <b>{aed(item.loan_amount_aed)}</b></span>}
                      {item.valuation_company && <span>Valuer: {item.valuation_company}</span>}
                      {item.rm_name && <span className="inline-flex items-center gap-1"><PhoneCall size={11} /> RM: {item.rm_name} {item.rm_phone || ''}</span>}
                    </div>
                  </div>
                  <CustomSelect
                    compact
                    className="select h-8 py-0 text-xs w-[158px]"
                    value={item.status}
                    onChange={async e => {
                      await put(`/api/mortgage-desk/events/${item.id}`, { status: e.target.value })
                      toast.ok('Updated status')
                      void qc.invalidateQueries({ queryKey: ['mortgage-desk-overview'] })
                    }}
                  >
                    {['Scheduled', 'Urgent', 'Overdue', 'Completed'].map(st => <option key={st} value={st}>{st}</option>)}
                  </CustomSelect>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* CBUAE LTV / DBR / Cash-to-Close Calculator + UAE Partner Banks */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5 rounded-3xl border border-line bg-card p-5 shadow-xs space-y-4">
          <h3 className="m-0 text-[15px] font-bold text-ink flex items-center gap-2">
            <Calculator size={16} className="text-emerald-700" /> UAE CBUAE DBR Stress &amp; Cash-to-Close Calculator
          </h3>
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <label className="block"><span className="text-muted">Property Price (AED)</span><input className="input mt-1" type="number" value={propPrice} onChange={e => setPropPrice(Number(e.target.value) || 0)} /></label>
            <label className="block"><span className="text-muted">LTV % (Max 80% Res / 60% NR)</span><input className="input mt-1" type="number" max={85} value={ltvPct} onChange={e => setLtvPct(Number(e.target.value) || 0)} /></label>
            <label className="block"><span className="text-muted">Interest Rate (% p.a.)</span><input className="input mt-1" type="number" step="0.05" value={ratePct} onChange={e => setRatePct(Number(e.target.value) || 0)} /></label>
            <label className="block"><span className="text-muted">Tenor (Years)</span><input className="input mt-1" type="number" max={25} value={tenorYrs} onChange={e => setTenorYrs(Number(e.target.value) || 25)} /></label>
            <label className="block"><span className="text-muted">Monthly Income (AED)</span><input className="input mt-1" type="number" value={monthlyIncome} onChange={e => setMonthlyIncome(Number(e.target.value) || 0)} /></label>
            <label className="block"><span className="text-muted">Existing Liabilities / 5% CC</span><input className="input mt-1" type="number" value={existingEmi} onChange={e => setExistingEmi(Number(e.target.value) || 0)} /></label>
          </div>
          <div className="rounded-2xl bg-[#121212] text-white p-4 space-y-2 text-xs">
            <div className="flex justify-between"><span>Loan Amount ({ltvPct}%)</span><b className="text-[#f3d27a]">{aed(calc.loan)}</b></div>
            <div className="flex justify-between"><span>Monthly EMI (@ {ratePct}%)</span><b>{aed(calc.emi)} / mo</b></div>
            <div className="flex justify-between"><span>CBUAE +2% Stress EMI</span><b>{aed(calc.stressEmi)} / mo</b></div>
            <div className="flex justify-between">
              <span>CBUAE Stress DBR (Cap 50%)</span>
              <b className={calc.dbrPass ? 'text-emerald-400' : 'text-rose-400'}>{calc.dbrPct}% · {calc.dbrPass ? 'PASS' : 'EXCEEDS 50%'}</b>
            </div>
            <div className="pt-2 border-t border-white/15 flex justify-between text-sm">
              <span>Total Cash-to-Close (incl. DLD 4% + Fees)</span>
              <b className="text-[#c5e86c]">{aed(calc.cashToClose)}</b>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 rounded-3xl border border-line bg-card p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="m-0 text-[15px] font-bold text-ink flex items-center gap-2"><Building2 size={16} className="text-[#8a621c]" /> UAE Partner Bank Benchmarks</h3>
            <Link to="/e/mortgage_cases" className="text-xs font-bold text-[#2563eb] no-underline">All Cases ({cases.length}) →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-soft text-left">
                <tr><th className="p-2.5">Bank</th><th className="p-2.5">Type</th><th className="p-2.5">3Y Fixed</th><th className="p-2.5">Res / Non-Res LTV</th><th className="p-2.5">Val Fee</th><th className="p-2.5">SLA</th></tr>
              </thead>
              <tbody>
                {banks.map(b => (
                  <tr key={b.bank} className="border-t border-line">
                    <td className="p-2.5 font-bold text-ink">{b.bank}</td>
                    <td className="p-2.5 text-muted">{b.type}</td>
                    <td className="p-2.5 font-bold text-emerald-700">{b.fixed_3y}</td>
                    <td className="p-2.5">{b.max_ltv_res} / {b.max_ltv_nonres}</td>
                    <td className="p-2.5">{b.valuation_fee}</td>
                    <td className="p-2.5"><span className="inline-flex items-center gap-1 font-semibold"><CheckCircle2 size={11} className="text-emerald-600" /> {b.sla_days}d</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
