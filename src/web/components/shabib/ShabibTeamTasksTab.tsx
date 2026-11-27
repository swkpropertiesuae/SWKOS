import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  Circle,
  ClipboardList,
  Clock,
  MapPin,
  Plus,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react'
import { get, patch, post, put } from '../../lib/api'
import { useToast } from '../../lib/toast'
import { CustomSelect } from '../CustomSelect'

export function ShabibTeamTasksTab() {
  const qc = useQueryClient()
  const toast = useToast()
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [selectedStaffId, setSelectedStaffId] = useState<number | 'all'>('all')
  const [newTask, setNewTask] = useState({
    title: '',
    assigned_to_id: '',
    due_date: new Date().toISOString().slice(0, 10),
    priority: 'High',
    description: '',
  })
  const [busy, setBusy] = useState(false)

  const q = useQuery({
    queryKey: ['shabib-team-daily', date],
    queryFn: () => get<any>('/api/shabib-workspace/team-daily', { date }),
    refetchInterval: 30_000,
  })

  const refresh = () => void qc.invalidateQueries({ queryKey: ['shabib-team-daily'] })

  const toggleVerifier = async (userId: number, current: boolean, name: string) => {
    setBusy(true)
    try {
      await put('/api/shabib-workspace/verifiers', { user_id: userId, enabled: !current })
      toast.ok(!current ? `${name} assigned as Site-Visit Verification Authority` : `Verification Authority removed from ${name}`)
      refresh()
    } catch (e: any) {
      toast.error(e.message || 'Could not update verifier')
    } finally {
      setBusy(false)
    }
  }

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTask.title.trim()) return
    setBusy(true)
    try {
      await post('/api/shabib-workspace/tasks', {
        title: newTask.title.trim(),
        assigned_to_id: newTask.assigned_to_id ? Number(newTask.assigned_to_id) : null,
        due_date: newTask.due_date || date,
        priority: newTask.priority,
        description: newTask.description.trim() || undefined,
      })
      toast.ok('Task assigned and added to daily to-do list')
      setNewTask({ title: '', assigned_to_id: '', due_date: date, priority: 'High', description: '' })
      refresh()
    } catch (err: any) {
      toast.error(err.message || 'Could not create task')
    } finally {
      setBusy(false)
    }
  }

  const toggleTask = async (taskId: number) => {
    try {
      await patch(`/api/shabib-workspace/tasks/${taskId}/toggle`, {})
      refresh()
    } catch (err: any) {
      toast.error(err.message || 'Could not update task')
    }
  }

  const d = q.data
  const staff: any[] = d?.staff ?? []
  const totals = d?.totals ?? { staff_count: 0, checked_in_count: 0, verifiers_count: 0, open_tasks: 0, done_today: 0, visits_today: 0 }
  const focusedStaff = selectedStaffId === 'all' ? null : staff.find(s => s.user_id === selectedStaffId)

  return (
    <div className="space-y-6">
      {/* Top KPI Strip + Date Picker */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-card p-5 shadow-xs">
        <div>
          <h2 className="m-0 text-[18px] font-bold text-ink flex items-center gap-2">
            <Users size={18} className="text-[#0e9f6e]" /> Team Roster, Job Roles, Daily To-Do &amp; Verification Authority
          </h2>
          <p className="m-0 mt-0.5 text-xs text-muted">
            Monitor every staff member&apos;s job role, tasks to do vs. completed today, and toggle who is authorized by Shabib to verify GPS-pinned site visits &amp; viewings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-muted">Workday:</label>
          <input type="date" className="input !h-9 !w-auto text-xs" value={date} onChange={e => setDate(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <div className="rounded-2xl border border-line bg-card p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Total Staff</div>
          <div className="mt-1 font-mono text-2xl font-bold text-ink">{totals.staff_count}</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Checked In</div>
          <div className="mt-1 font-mono text-2xl font-bold text-emerald-900">{totals.checked_in_count}</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Tasks To Do</div>
          <div className="mt-1 font-mono text-2xl font-bold text-amber-950">{totals.open_tasks}</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-white p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Done Today</div>
          <div className="mt-1 font-mono text-2xl font-bold text-emerald-700">{totals.done_today}</div>
        </div>
        <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-sky-800">Site Visits Today</div>
          <div className="mt-1 font-mono text-2xl font-bold text-sky-950">{totals.visits_today}</div>
        </div>
        <div className="rounded-2xl border border-[#121212] bg-[#121212] p-3.5 text-white">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#51fec0]">Assigned Verifiers</div>
          <div className="mt-1 font-mono text-2xl font-bold">{totals.verifiers_count}</div>
        </div>
      </div>

      {/* Staff Roster Table with Role, Today To-Do, Today Done & Verifier Toggle */}
      <div className="rounded-3xl border border-line bg-card p-5 shadow-xs overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="m-0 text-[15px] font-bold text-ink">Individual Staff Directory &amp; Daily Accountability</h3>
          <span className="text-[11px] text-muted">Click any row to filter their individual to-do list below</span>
        </div>
        <table className="w-full text-left text-xs border-collapse min-w-[820px]">
          <thead>
            <tr className="border-b border-line text-[10.5px] uppercase tracking-wider text-muted">
              <th className="py-2.5 pr-3">Staff Member</th>
              <th className="py-2.5 px-3">Job Role &amp; Dept</th>
              <th className="py-2.5 px-3">Attendance</th>
              <th className="py-2.5 px-3">To Do</th>
              <th className="py-2.5 px-3">Done Today</th>
              <th className="py-2.5 px-3">Site Visits</th>
              <th className="py-2.5 pl-3 text-right">Site-Visit Verification Authority</th>
            </tr>
          </thead>
          <tbody>
            {staff.map(s => (
              <tr
                key={s.user_id}
                onClick={() => setSelectedStaffId(cur => (cur === s.user_id ? 'all' : s.user_id))}
                className={`border-b border-line/60 cursor-pointer transition-colors ${
                  selectedStaffId === s.user_id ? 'bg-[#ecfdf5]/80' : 'hover:bg-soft/60'
                }`}
              >
                <td className="py-3 pr-3">
                  <div className="font-bold text-ink">{s.name}</div>
                  <div className="text-[11px] text-muted">{s.email}{s.phone ? ` · ${s.phone}` : ''}</div>
                </td>
                <td className="py-3 px-3">
                  <div className="font-semibold text-ink">{s.job_role}</div>
                  <div className="text-[11px] text-muted">{s.department} · {s.role_name}</div>
                </td>
                <td className="py-3 px-3">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${
                    s.checked_in ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-soft text-muted'
                  }`}>
                    <Clock size={11} /> {s.checked_in ? s.attendance_status : 'Not In'}
                  </span>
                </td>
                <td className="py-3 px-3">
                  <span className="font-mono font-bold text-ink">{s.tasks_todo.length}</span>
                  {s.overdue_count > 0 && (
                    <span className="ml-1.5 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                      {s.overdue_count} late
                    </span>
                  )}
                </td>
                <td className="py-3 px-3 font-mono font-bold text-emerald-700">{s.tasks_done_today.length}</td>
                <td className="py-3 px-3">
                  <span className="inline-flex items-center gap-1 font-mono font-semibold text-ink">
                    <MapPin size={11} className="text-sky-600" /> {s.field_reports_today.length}
                  </span>
                </td>
                <td className="py-3 pl-3 text-right" onClick={e => e.stopPropagation()}>
                  {s.is_owner ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#121212] px-3 py-1 text-[10.5px] font-bold text-[#51fec0]">
                      <ShieldCheck size={12} /> Owner (Always)
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleVerifier(s.user_id, s.is_verifier, s.name)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold border cursor-pointer transition-all ${
                        s.is_verifier
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-line bg-white text-ink hover:border-[#121212]'
                      }`}
                    >
                      <UserCheck size={12} /> {s.is_verifier ? 'Assigned Verifier ✓' : 'Assign as Verifier'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom Grid: Quick Assign Form + Individual/Team To-Do vs Done Today */}
      <div className="grid gap-5 lg:grid-cols-12">
        <form onSubmit={createTask} className="lg:col-span-4 rounded-3xl border border-line bg-card p-5 space-y-3 shadow-xs">
          <h3 className="m-0 text-[15px] font-bold text-ink flex items-center gap-2">
            <Plus size={16} className="text-[#0e9f6e]" /> Assign Daily Individual / Team Task
          </h3>
          <input
            className="input"
            required
            placeholder="Task to be done (e.g. Collect Marina Gate Form F & cheques) *"
            value={newTask.title}
            onChange={e => setNewTask({ ...newTask, title: e.target.value })}
          />
          <CustomSelect
            className="select"
            value={newTask.assigned_to_id}
            onChange={e => setNewTask({ ...newTask, assigned_to_id: e.target.value })}
          >
            <option value="">Shared Team To-Do (All Staff)</option>
            {staff.map(s => (
              <option key={s.user_id} value={s.user_id}>{s.name} — {s.job_role}</option>
            ))}
          </CustomSelect>
          <div className="grid grid-cols-2 gap-2.5">
            <input type="date" className="input" value={newTask.due_date} onChange={e => setNewTask({ ...newTask, due_date: e.target.value })} />
            <CustomSelect className="select" value={newTask.priority} onChange={e => setNewTask({ ...newTask, priority: e.target.value })}>
              {['Urgent', 'High', 'Normal', 'Low'].map(p => <option key={p} value={p}>{p}</option>)}
            </CustomSelect>
          </div>
          <textarea
            className="input min-h-[70px]"
            placeholder="Specific instructions, target unit, client name, or deadline details…"
            value={newTask.description}
            onChange={e => setNewTask({ ...newTask, description: e.target.value })}
          />
          <button disabled={busy} type="submit" className="btn w-full justify-center bg-[#121212] text-[#51fec0]">
            <Plus size={15} /> Add to Daily To-Do List
          </button>
        </form>

        <div className="lg:col-span-4 rounded-3xl border border-line bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="m-0 text-[15px] font-bold text-ink flex items-center gap-2">
              <ClipboardList size={16} className="text-amber-600" />
              {focusedStaff ? `${focusedStaff.name}: To Do` : 'Team Tasks To Do'}
            </h3>
            {focusedStaff && (
              <button type="button" onClick={() => setSelectedStaffId('all')} className="text-xs font-semibold text-[#0e9f6e] underline bg-transparent border-0 cursor-pointer">
                Show All Team
              </button>
            )}
          </div>
          <div className="space-y-2 max-h-[340px] overflow-auto">
            {(focusedStaff ? focusedStaff.tasks_todo : (d?.team_todo ?? [])).length === 0 ? (
              <p className="text-xs text-muted">No open tasks pending.</p>
            ) : (focusedStaff ? focusedStaff.tasks_todo : (d?.team_todo ?? [])).map((t: any) => {
              const assignee = staff.find(s => s.user_id === Number(t.assigned_to_id))
              return (
                <div key={t.id} className="flex items-start gap-2.5 rounded-xl border border-line bg-soft/40 p-2.5 text-xs">
                  <button
                    type="button"
                    onClick={() => void toggleTask(t.id)}
                    title="Mark Done"
                    className="mt-0.5 text-muted hover:text-emerald-600 bg-transparent border-0 p-0 cursor-pointer"
                  >
                    <Circle size={16} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-ink">{t.title}</div>
                    <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-muted">
                      <span>{assignee ? assignee.name : 'Team Shared'}</span>
                      <span>· Due {t.due_date || date}</span>
                      <span className="font-semibold text-amber-700">{t.priority || 'Normal'}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="lg:col-span-4 rounded-3xl border border-emerald-200/80 bg-emerald-50/30 p-5 shadow-xs">
          <h3 className="m-0 mb-3 text-[15px] font-bold text-emerald-950 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600" />
            {focusedStaff ? `${focusedStaff.name}: Done (${date})` : `Team Tasks Done (${date})`}
          </h3>
          <div className="space-y-2 max-h-[340px] overflow-auto">
            {(focusedStaff ? focusedStaff.tasks_done_today : (d?.team_done_today ?? [])).length === 0 ? (
              <p className="text-xs text-muted">No tasks completed yet for {date}.</p>
            ) : (focusedStaff ? focusedStaff.tasks_done_today : (d?.team_done_today ?? [])).map((t: any) => {
              const assignee = staff.find(s => s.user_id === Number(t.assigned_to_id))
              return (
                <div key={t.id} className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-white p-2.5 text-xs">
                  <button
                    type="button"
                    onClick={() => void toggleTask(t.id)}
                    title="Re-open task"
                    className="mt-0.5 text-emerald-600 bg-transparent border-0 p-0 cursor-pointer"
                  >
                    <CheckCircle2 size={16} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-ink line-through opacity-80">{t.title}</div>
                    <div className="mt-0.5 text-[11px] text-emerald-700">
                      {assignee ? assignee.name : 'Team'} · Completed {String(t.completed_at || t.updated_at || '').slice(11, 16) || date}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
