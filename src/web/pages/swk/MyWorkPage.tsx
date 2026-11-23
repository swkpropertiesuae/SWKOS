import { useMemo,useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery,useQueryClient } from '@tanstack/react-query'
import { CalendarDays,Check,Circle,Columns3,Plus } from 'lucide-react'
import { get,post,put } from '../../lib/api'
import { useMeta } from '../../lib/meta'
import { useToast } from '../../lib/toast'

type Task = { id: number; version: number; title: string; status: string; priority: string; due_date: string | null; kind: string; link_label?: string; link_entity?: string; link_id?: number; _labels?: Record<string, string> }
const dubaiToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(new Date())
const addDays = (d: string, n: number) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }
const PRIORITY: Record<string, string> = { Urgent: '#dc2626', High: '#b45309', Medium: '#1b6aa7', Low: '#8b8b8b' }

/** monday-style "My work": everything assigned to me, bucketed by due date, with one-click done and quick add. */
export default function MyWorkPage() {
  const { me } = useMeta(), qc = useQueryClient(), toast = useToast()
  const [title, setTitle] = useState(''), [due, setDue] = useState(dubaiToday())
  const filters = JSON.stringify([{ field: 'assignee_id', op: 'eq', value: me?.id }, { field: 'status', op: 'ne', value: 'Done' }])
  const q = useQuery({ queryKey: ['list', 'tasks', 'mine', me?.id], enabled: !!me, queryFn: () => get<{ rows: Task[] }>('/api/e/tasks', { pageSize: 500, sort: 'due_date', dir: 'asc', filters }) })
  const today = dubaiToday(), weekEnd = addDays(today, 7)
  const buckets = useMemo(() => {
    const b: Record<string, Task[]> = { Overdue: [], Today: [], 'This week': [], Later: [], 'No date': [] }
    for (const t of q.data?.rows ?? []) {
      const d = t.due_date?.slice(0, 10)
      b[!d ? 'No date' : d < today ? 'Overdue' : d === today ? 'Today' : d <= weekEnd ? 'This week' : 'Later']!.push(t)
    }
    return b
  }, [q.data, today, weekEnd])
  const refresh = () => qc.invalidateQueries({ queryKey: ['list', 'tasks'] })
  const done = async (t: Task) => { try { await put(`/api/e/tasks/${t.id}`, { status: 'Done', version: t.version }); toast.ok(`Done: ${t.title}`); void refresh() } catch (e: any) { toast.error(e.message) } }
  const add = async () => { if (!title.trim()) return; try { await post('/api/e/tasks', { title: title.trim(), due_date: due || null, assignee_id: me?.id, status: 'To do', priority: 'Medium', kind: 'Task' }); setTitle(''); void refresh() } catch (e: any) { toast.error(e.message) } }
  const open = (q.data?.rows ?? []).length

  return (
    <div className="mx-auto max-w-[1000px]">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div><div className="web-eyebrow">Work</div><h1 className="web-title">My work</h1><p className="web-lead">{open ? `${open} open task${open === 1 ? '' : 's'} assigned to you${buckets.Overdue!.length ? `, ${buckets.Overdue!.length} overdue` : ''}.` : 'Nothing open. Add a task below.'}</p></div>
        <div className="flex gap-2"><Link to="/e/tasks?view=kanban" className="web-btn light"><Columns3 size={14} /> Board</Link><Link to="/e/tasks?view=calendar" className="web-btn light"><CalendarDays size={14} /> Calendar</Link></div>
      </header>
      <form className="web-card mb-8 flex flex-wrap items-center gap-2 p-3" onSubmit={e => { e.preventDefault(); void add() }}>
        <Plus size={18} className="ml-2 text-[#8b8b8b]" />
        <input className="min-w-[200px] flex-1 border-0 bg-transparent px-2 py-2 text-[15px] outline-none no-focus-outline" placeholder="Add a task for yourself…" aria-label="New task" value={title} onChange={e => setTitle(e.target.value)} />
        <input type="date" className="input" style={{ width: 160 }} aria-label="Due date" value={due} onChange={e => setDue(e.target.value)} />
        <button className="web-btn" style={{ height: 40 }} disabled={!title.trim()}>Add</button>
      </form>
      {Object.entries(buckets).filter(([, v]) => v.length).map(([k, list]) => (
        <section key={k} className="mb-6">
          <div className={`mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] ${k === 'Overdue' ? 'text-[#dc2626]' : 'text-[#8b8b8b]'}`}>{k}<span className="rounded-full bg-[#f5f5f5] px-2 py-0.5 text-[#4a4a4a]">{list.length}</span></div>
          <div className="web-card divide-y divide-[#e5e5e5]">
            {list.map(t => (
              <div key={t.id} className="group flex items-center gap-3 px-4 py-3">
                <button type="button" aria-label={`Mark ${t.title} done`} className="flex size-6 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-[#cfcfcf] hover:text-[#0e9f6e]" onClick={() => void done(t)}><Circle size={20} className="group-hover:hidden" /><Check size={20} className="hidden group-hover:block" /></button>
                <Link to={`/e/tasks/${t.id}`} className="min-w-0 flex-1 no-underline">
                  <span className="block truncate text-[14.5px] text-[#121212]">{t.title}</span>
                  <span className="block truncate text-[12px] text-[#8b8b8b]">{[t.kind !== 'Task' && t.kind, t.link_label, t._labels?.project_id].filter(Boolean).join(' · ')}</span>
                </Link>
                <span className="hidden items-center gap-1.5 text-[12px] text-[#4a4a4a] sm:flex"><span className="size-2 rounded-full" style={{ background: PRIORITY[t.priority] ?? '#8b8b8b' }} />{t.priority}</span>
                <span className="web-pill">{t.status}</span>
                <span className={`w-20 text-right text-[12px] ${t.due_date && t.due_date < today ? 'font-semibold text-[#dc2626]' : 'text-[#737373]'}`}>{t.due_date ? new Date(t.due_date + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '—'}</span>
              </div>))}
          </div>
        </section>
      ))}
    </div>
  )
}
