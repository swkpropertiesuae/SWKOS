import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Brain, Plus, Search, Sparkles } from 'lucide-react'
import { get, post } from '../../lib/api'
import { useToast } from '../../lib/toast'
import { CustomSelect } from '../../components/CustomSelect'

const CATEGORIES = ['All', 'Secondary Resale', 'Mortgage & Valuation', 'Off-Plan', 'Distressed Exit', 'Golden Visa', 'A2A Co-Broke', 'Leasing & Ejari', 'Compliance & RERA']

export default function AiCaseStudyPage() {
  const [cat, setCat] = useState('All')
  const [scenario, setScenario] = useState('')
  const [matches, setMatches] = useState<any[] | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    category: 'Secondary Resale',
    title: '',
    client_profile: '',
    property_context: '',
    challenge: '',
    strategy_applied: '',
    winning_outcome: '',
    lessons_learned: '',
    tags: '',
  })
  const toast = useToast()
  const qc = useQueryClient()

  const listQ = useQuery({
    queryKey: ['ai-case-studies', cat],
    queryFn: () => get<any>('/api/ai-case-studies', cat === 'All' ? {} : { category: cat }),
  })

  const runMatcher = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scenario.trim()) return
    setBusy(true)
    try {
      const r = await post<any>('/api/ai-case-studies/query', { scenario })
      setMatches(r.matches ?? [])
    } catch (err: any) { toast.error(err.message) } finally { setBusy(false) }
  }

  const saveCaseStudy = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await post('/api/ai-case-studies', form)
      toast.ok('Case study trained & indexed for SWK AI Copilot')
      setFormOpen(false)
      setForm({ category: 'Secondary Resale', title: '', client_profile: '', property_context: '', challenge: '', strategy_applied: '', winning_outcome: '', lessons_learned: '', tags: '' })
      void qc.invalidateQueries({ queryKey: ['ai-case-studies'] })
    } catch (err: any) { toast.error(err.message) } finally { setBusy(false) }
  }

  const rows: any[] = listQ.data?.rows ?? []

  return (
    <div className="mx-auto max-w-[1360px] space-y-6 pb-10">
      <section className="rounded-[28px] bg-gradient-to-br from-[#0b1f2a] via-[#172844] to-[#0a1322] p-6 text-white shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-[#d4a752]/20 border border-[#d4a752]/40 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.15em] text-[#f3d27a]">
            <Brain size={13} /> Continuous AI Model Knowledge &amp; Training Studio
          </div>
          <h1 className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-white">AI Case-Study Lab</h1>
          <p className="mt-1 text-xs text-slate-300 max-w-2xl">
            Every Dubai real estate, valuation shortfall, off-plan assignment, distressed cash exit, and mortgage scenario is structured and indexed so SWK AI learns from every case and guides advisors with real institutional playbooks.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setFormOpen(v => !v)} className="inline-flex items-center gap-1.5 rounded-full bg-[#d4a752] px-4 py-2 text-xs font-bold text-[#0b1f2a] border-0 cursor-pointer hover:bg-[#e5be6e]">
            <Plus size={14} /> Train New Case Study
          </button>
          <Link to="/ai" className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-4 py-2 text-xs font-bold text-white no-underline hover:bg-white/20">
            <Sparkles size={14} className="text-[#c5e86c]" /> Open SWK AI Assistant
          </Link>
        </div>
      </section>

      {/* Scenario Matcher */}
      <form onSubmit={runMatcher} className="rounded-3xl border border-line bg-card p-5 shadow-xs space-y-3">
        <div className="text-sm font-bold text-ink flex items-center gap-2">
          <Search size={16} className="text-[#2563eb]" /> Ask the Trained Case-Study Model
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            className="input flex-1 min-w-[260px]"
            placeholder="Describe a live deal challenge (e.g. 'bank valuation came 150K low on Creek Harbour 2BR' or 'self-employed buyer DBR 53%')"
            value={scenario}
            onChange={e => setScenario(e.target.value)}
          />
          <button disabled={busy} type="submit" className="btn bg-[#0b1f2a] text-[#f3d27a]">
            <Sparkles size={14} /> Match Winning Playbook
          </button>
        </div>
        {matches && (
          <div className="pt-2 space-y-2.5">
            <div className="text-xs font-bold text-[#8a621c]">{matches.length} Matching Trained Precedent(s):</div>
            {matches.length === 0 ? (
              <p className="text-xs text-muted">No close match yet — train this new scenario using the button above so the AI learns it permanently.</p>
            ) : matches.map(m => (
              <div key={m.id} className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 text-xs space-y-1">
                <div className="font-bold text-sm text-ink">{m.code} · {m.title}</div>
                <div><b>Winning Strategy:</b> {m.strategy_applied}</div>
                <div className="text-emerald-800"><b>Outcome:</b> {m.winning_outcome}</div>
                <div className="text-muted"><b>Key Lesson:</b> {m.lessons_learned}</div>
              </div>
            ))}
          </div>
        )}
      </form>

      {/* Train New Case Study Form */}
      {formOpen && (
        <form onSubmit={saveCaseStudy} className="rounded-3xl border border-[#d4a752]/50 bg-[#fefaf0] dark:bg-card p-5 space-y-3 shadow-sm">
          <h2 className="m-0 text-[16px] font-bold text-ink">Train New Real-World Case Study into AI Model</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <CustomSelect className="select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
            </CustomSelect>
            <input className="input" required placeholder="Case Study Title *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            <input className="input" placeholder="Client Profile (Salaried, Self-Employed, Non-Resident, Cash…)" value={form.client_profile} onChange={e => setForm({ ...form, client_profile: e.target.value })} />
            <input className="input" placeholder="Property / Community / Developer Context" value={form.property_context} onChange={e => setForm({ ...form, property_context: e.target.value })} />
            <textarea className="input min-h-[70px]" required placeholder="Challenge / Bottleneck Encountered *" value={form.challenge} onChange={e => setForm({ ...form, challenge: e.target.value })} />
            <textarea className="input min-h-[70px]" required placeholder="Winning Strategy Applied *" value={form.strategy_applied} onChange={e => setForm({ ...form, strategy_applied: e.target.value })} />
            <input className="input" placeholder="Final Outcome (Days to close, Commission, LTV…)" value={form.winning_outcome} onChange={e => setForm({ ...form, winning_outcome: e.target.value })} />
            <input className="input" placeholder="Keywords / Tags (comma-separated)" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} />
          </div>
          <textarea className="input min-h-[60px]" placeholder="Reusable AI Rule / Lesson Learned for future deals" value={form.lessons_learned} onChange={e => setForm({ ...form, lessons_learned: e.target.value })} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setFormOpen(false)} className="btn outline">Cancel</button>
            <button disabled={busy} type="submit" className="btn bg-[#0b1f2a] text-[#f3d27a]">Save &amp; Train AI</button>
          </div>
        </form>
      )}

      {/* Category Pills */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-bold cursor-pointer ${
              cat === c ? 'border-[#0b1f2a] bg-[#0b1f2a] text-[#f3d27a]' : 'border-line bg-card text-ink'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Case Studies Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map(cs => (
          <article key={cs.id} className="rounded-3xl border border-line bg-card p-5 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full bg-[#0b1f2a] px-2.5 py-0.5 text-[10.5px] font-bold text-[#f3d27a]">{cs.category}</span>
              <span className="font-mono text-[11px] text-muted">{cs.code} · {cs.trained_by_name || 'SWK'}</span>
            </div>
            <h3 className="m-0 text-[16px] font-bold text-ink flex items-start gap-2">
              <BookOpen size={16} className="text-[#8a621c] shrink-0 mt-0.5" /> {cs.title}
            </h3>
            <div className="text-xs text-muted">{cs.client_profile} · <b>{cs.property_context}</b></div>
            <div className="rounded-2xl bg-soft/60 p-3 text-xs space-y-1.5">
              <div><b className="text-rose-700">Challenge:</b> {cs.challenge}</div>
              <div><b className="text-ink">Strategy:</b> {cs.strategy_applied}</div>
              <div><b className="text-emerald-700">Outcome:</b> {cs.winning_outcome}</div>
              <div><b className="text-[#8a621c]">AI Rule:</b> {cs.lessons_learned}</div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
