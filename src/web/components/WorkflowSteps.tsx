import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check } from 'lucide-react'

export type WorkStep = { title: string; what: string; done: string; to: string }

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(new Date())

// Ticks are a per-person convenience kept in this browser for the day; they never reach the server.
function useTicks(userKey: string) {
  const key = `swk-steps:${userKey}:${today()}`
  const read = (): number => { try { return Math.max(0, Number(localStorage.getItem(key)) || 0) } catch { return 0 } }
  const [n, setN] = useState(read)
  const save = (v: number) => { setN(v); try { localStorage.setItem(key, String(v)) } catch { /* private mode: still works for this visit */ } }
  return [n, save] as const
}

/** The company workflow as one numbered list: finish a step, tick it, the next step opens. */
export function WorkflowSteps({ steps, userKey }: { steps: WorkStep[]; userKey: string }) {
  const [doneCount, setDone] = useTicks(userKey)
  const done = Math.min(doneCount, steps.length)
  const finished = done >= steps.length
  return (
    <section className="card p-5 border border-[#ecebe4] bg-white" aria-label="Your day, step by step">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <div>
          <span className="text-[10.5px] font-extrabold uppercase tracking-widest text-[#0a4a3b]">Start here · follow the steps in order</span>
          <h2 className="font-display font-bold text-lg text-ink m-0 mt-0.5">{finished ? 'All steps done for today' : `Step ${done + 1} of ${steps.length}: ${steps[done].title}`}</h2>
        </div>
        {done > 0 && <button type="button" className="btn outline sm" onClick={() => setDone(0)}>Start the day again</button>}
      </div>
      <p className="text-[13px] text-muted m-0 mb-3">Finish one step, tick it, then the next step opens. Every step has one job and one button.</p>
      <div className="h-1.5 rounded-full bg-[#ecebe4] overflow-hidden mb-4" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}>
        <div className="h-full bg-[#0a4a3b] transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="list-none p-0 m-0 grid gap-2">
        {steps.map((s, i) => {
          const state = i < done ? 'done' : i === done ? 'current' : 'next'
          return (
            <li key={s.title} className={`rounded-xl border p-3 flex items-start gap-3 ${state === 'current' ? 'border-[#0a4a3b] bg-[#e9f4ef]' : 'border-[#ecebe4] bg-[#fdfdfc]'} ${state === 'next' ? 'opacity-60' : ''}`} aria-current={state === 'current' ? 'step' : undefined}>
              <span className={`shrink-0 w-7 h-7 rounded-full grid place-items-center text-[13px] font-bold ${state === 'done' ? 'bg-[#0a4a3b] text-white' : state === 'current' ? 'bg-[#123025] text-[#f2efe8]' : 'bg-[#ecebe4] text-muted'}`}>
                {state === 'done' ? <Check size={15} aria-label="done" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className={`font-bold text-[14px] text-ink leading-snug ${state === 'done' ? 'line-through decoration-1' : ''}`}>{s.title}</div>
                <div className="text-[12.5px] text-muted mt-0.5">{s.what}</div>
                {state === 'current' && <div className="text-[12.5px] text-ink mt-1"><b>Done when:</b> {s.done}</div>}
                {state === 'next' && <div className="text-[12px] text-muted mt-0.5">Opens after step {i}</div>}
              </div>
              {state === 'current' && (
                <div className="shrink-0 flex flex-col sm:flex-row gap-2">
                  <Link to={s.to} className="btn sm">Open step {i + 1} <ArrowRight size={13} /></Link>
                  <button type="button" className="btn outline sm" onClick={() => setDone(i + 1)}>Mark done</button>
                </div>
              )}
              {state === 'done' && <Link to={s.to} className="shrink-0 text-[12px] font-semibold text-[#174B3B]">Open again</Link>}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
