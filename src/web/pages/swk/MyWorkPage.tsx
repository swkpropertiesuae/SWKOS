import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, CalendarDays, Check, Circle, Columns3, MessageSquarePlus, Paperclip, Plus } from 'lucide-react'
import type { TaskAttachmentItem } from '@shared/task-followups'
import { get, post, put, upload } from '../../lib/api'
import { useMeta } from '../../lib/meta'
import { useToast } from '../../lib/toast'
import { AttachmentChips, FormAttachmentField } from '../../components/FormAttachmentField'
import { TaskFollowUpDrawer, followUpStageBadgeClass } from '../../components/TaskFollowUpDrawer'

type Task = {
  id: number
  version: number
  title: string
  status: string
  priority: string
  due_date: string | null
  kind: string
  link_label?: string
  link_entity?: string
  link_id?: number
  _labels?: Record<string, string>
  _attachments?: TaskAttachmentItem[]
  _attachment_count?: number
  _followup_count?: number
  _followup_stage?: string
  _next_followup_date?: string | null
  _next_followup_time?: string | null
  _next_action?: string | null
  _last_followup?: {
    id: number
    channel: string
    outcome: string
    stage: string
    note: string
    author_name: string
    created_at: string
  } | null
}

const dubaiToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(new Date())
const addDays = (d: string, n: number) => {
  const t = new Date(d + 'T00:00:00Z')
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}
const PRIORITY: Record<string, string> = { Urgent: '#a3263a', High: '#b45309', Medium: '#8a621c', Low: '#5b676e' }

/** monday-style "My work": everything assigned to me, bucketed by due date, with attachments and one-click follow-up drawer. */
export default function MyWorkPage() {
  const { me } = useMeta(), qc = useQueryClient(), toast = useToast()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState(dubaiToday())
  const [priority, setPriority] = useState('Medium')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [activeTask, setActiveTask] = useState<{ id: number; title: string } | null>(null)

  const filters = JSON.stringify([
    { field: 'assignee_id', op: 'eq', value: me?.id },
    { field: 'status', op: 'ne', value: 'Done' },
  ])
  const q = useQuery({
    queryKey: ['list', 'tasks', 'mine', me?.id],
    enabled: !!me,
    queryFn: () => get<{ rows: Task[] }>('/api/e/tasks', { pageSize: 500, sort: 'due_date', dir: 'asc', filters }),
  })
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

  const done = async (t: Task) => {
    try {
      await put(`/api/e/tasks/${t.id}`, { status: 'Done', version: t.version })
      toast.ok(`Done: ${t.title}`)
      void refresh()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const add = async () => {
    if (!title.trim() || saving) return
    setSaving(true)
    try {
      const created = await post<any>('/api/e/tasks', {
        title: title.trim(),
        due_date: due || null,
        assignee_id: me?.id,
        status: 'To do',
        priority,
        kind: 'Task',
      })
      if (pendingFiles.length > 0 && created?.id) {
        await upload(pendingFiles, { link_entity: 'tasks', link_id: created.id, category: 'Task Attachment' })
      }
      toast.ok(pendingFiles.length ? `Task added with ${pendingFiles.length} attachment(s)` : 'Task added')
      setTitle('')
      setPendingFiles([])
      void refresh()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const open = (q.data?.rows ?? []).length

  return (
    <div className="mx-auto max-w-[1040px]">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="web-eyebrow">Work</div>
          <h1 className="web-title">My work</h1>
          <p className="web-lead">
            {open
              ? `${open} open task${open === 1 ? '' : 's'} assigned to you${buckets.Overdue!.length ? `, ${buckets.Overdue!.length} overdue` : ''}.`
              : 'Nothing open. Add a task below.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/e/tasks?view=kanban" className="web-btn light"><Columns3 size={14} /> Board</Link>
          <Link to="/e/tasks?view=calendar" className="web-btn light"><CalendarDays size={14} /> Calendar</Link>
        </div>
      </header>

      <form
        className="web-card mb-8 space-y-2.5 p-3.5"
        onSubmit={e => {
          e.preventDefault()
          void add()
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Plus size={18} className="ml-1 text-[#5b676e]" />
          <input
            className="min-w-[200px] flex-1 border-0 bg-transparent px-2 py-2 text-[15px] outline-none no-focus-outline"
            placeholder="Add a task for yourself…"
            aria-label="New task"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
          <select
            className="select !h-10 !w-[115px] text-xs"
            aria-label="Priority"
            value={priority}
            onChange={e => setPriority(e.target.value)}
          >
            {['Urgent', 'High', 'Medium', 'Low'].map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <input
            type="date"
            className="input"
            style={{ width: 155 }}
            aria-label="Due date"
            value={due}
            onChange={e => setDue(e.target.value)}
          />
          <button className="web-btn" style={{ height: 40 }} disabled={!title.trim() || saving}>
            {saving ? 'Adding…' : 'Add'}
          </button>
        </div>
        <div className="pl-2">
          <FormAttachmentField
            compact
            files={pendingFiles}
            onChange={setPendingFiles}
            label="Attach files to task"
          />
        </div>
      </form>

      {Object.entries(buckets)
        .filter(([, v]) => v.length)
        .map(([k, list]) => (
          <section key={k} className="mb-6">
            <div className={`mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] ${k === 'Overdue' ? 'text-[#a3263a]' : 'text-[#5b676e]'}`}>
              {k}
              <span className="rounded-full bg-[#f4f0e8] px-2 py-0.5 text-[#3d4a51]">{list.length}</span>
            </div>
            <div className="web-card divide-y divide-[#e6e0d4]">
              {list.map(t => (
                <div key={t.id} className="group px-4 py-3.5 space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      aria-label={`Mark ${t.title} done`}
                      className="flex size-6 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-[#cfc6b4] hover:text-[#8a621c] cursor-pointer"
                      onClick={() => void done(t)}
                    >
                      <Circle size={20} className="group-hover:hidden" />
                      <Check size={20} className="hidden group-hover:block" />
                    </button>
                    <Link to={`/e/tasks/${t.id}`} className="min-w-0 flex-1 no-underline">
                      <span className="block truncate text-[14.5px] font-medium text-[#0f2a33]">{t.title}</span>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-[#5b676e]">
                        {[t.kind !== 'Task' && t.kind, t.link_label, t._labels?.project_id].filter(Boolean).length > 0 && (
                          <span>{[t.kind !== 'Task' && t.kind, t.link_label, t._labels?.project_id].filter(Boolean).join(' · ')}</span>
                        )}
                        {t._followup_stage && t._followup_stage !== 'To do' && (
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${followUpStageBadgeClass(t._followup_stage)}`}>
                            {t._followup_stage}
                          </span>
                        )}
                        {t._next_followup_date && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-emerald-800">
                            <CalendarClock size={10} /> Next: {t._next_followup_date}
                            {t._next_followup_time ? ` ${t._next_followup_time}` : ''}
                          </span>
                        )}
                      </div>
                    </Link>

                    <span className="hidden items-center gap-1.5 text-[12px] text-[#3d4a51] sm:flex">
                      <span className="size-2 rounded-full" style={{ background: PRIORITY[t.priority] ?? '#5b676e' }} />
                      {t.priority}
                    </span>

                    <button
                      type="button"
                      onClick={() => setActiveTask({ id: t.id, title: t.title })}
                      className="inline-flex items-center gap-1.5 rounded-full border-0 bg-[#121212] px-3 py-1.5 text-[11px] font-bold text-[#51fec0] hover:bg-[#1f2937] cursor-pointer transition"
                    >
                      <MessageSquarePlus size={12} />
                      <span>Follow Up{(t._followup_count ?? 0) > 0 ? ` (${t._followup_count})` : ''}</span>
                      {(t._attachment_count ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-white/15 px-1.5 py-0.2 text-[10px] text-white">
                          <Paperclip size={9} /> {t._attachment_count}
                        </span>
                      )}
                    </button>

                    <span className={`w-16 text-right text-[12px] ${t.due_date && t.due_date < today ? 'font-semibold text-[#a3263a]' : 'text-[#5b676e]'}`}>
                      {t.due_date
                        ? new Date(t.due_date + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
                        : '—'}
                    </span>
                  </div>

                  {t._last_followup && (
                    <div className="pl-9 text-[11.5px] text-[#5b676e] truncate">
                      <strong className="text-[#0f2a33]">Latest ({t._last_followup.channel}):</strong> {t._last_followup.outcome} — {t._last_followup.note}
                    </div>
                  )}

                  {t._attachments && t._attachments.length > 0 && (
                    <div className="pl-9">
                      <AttachmentChips attachments={t._attachments} compact />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}

      <TaskFollowUpDrawer
        taskId={activeTask?.id ?? null}
        initialTitle={activeTask?.title}
        onClose={() => setActiveTask(null)}
        onUpdated={() => void refresh()}
      />
    </div>
  )
}
