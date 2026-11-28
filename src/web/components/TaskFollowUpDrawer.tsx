import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  History,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Paperclip,
  Phone,
  Send,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react'
import {
  QUICK_FOLLOWUP_TEMPLATES,
  TASK_FOLLOWUP_CHANNELS,
  TASK_FOLLOWUP_OUTCOMES,
  TASK_FOLLOWUP_STAGES,
  type TaskAttachmentItem,
  type TaskFollowUpChannel,
  type TaskFollowUpEntry,
  type TaskFollowUpOutcome,
  type TaskFollowUpStage,
  type TaskFollowUpSummary,
} from '@shared/task-followups'
import { del, get, post, upload } from '../lib/api'
import { useToast } from '../lib/toast'
import { cls } from '../lib/format'
import { AttachmentChips, FormAttachmentField } from './FormAttachmentField'

const CHANNEL_ICON: Record<TaskFollowUpChannel, React.ComponentType<{ size?: number }>> = {
  Call: Phone,
  WhatsApp: MessageSquare,
  Email: Mail,
  'Site Visit': MapPin,
  'Client Meeting': Users,
  'Developer / Bank': Building2,
  'Internal Note': FileText,
}

export function followUpStageBadgeClass(stage?: string): string {
  switch (stage) {
    case 'Done':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200'
    case 'Blocked':
      return 'bg-rose-50 text-rose-800 border-rose-200'
    case 'Waiting Client':
      return 'bg-amber-50 text-amber-800 border-amber-200'
    case 'Waiting Owner':
      return 'bg-orange-50 text-orange-800 border-orange-200'
    case 'Waiting Bank / Dev':
      return 'bg-sky-50 text-sky-800 border-sky-200'
    case 'In progress':
      return 'bg-[#121212] text-[#51fec0] border-[#121212]'
    default:
      return 'bg-soft text-muted border-line'
  }
}

function dubaiDateOffset(days: number): string {
  const target = new Date(Date.now() + days * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(target)
}

function formatDubaiStamp(iso: string): string {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Dubai',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso.slice(0, 16).replace('T', ' ')
  }
}

export interface TaskFollowUpDrawerProps {
  taskId: number | null
  initialTitle?: string
  onClose: () => void
  onUpdated?: () => void
}

export function TaskFollowUpDrawer({ taskId, initialTitle, onClose, onUpdated }: TaskFollowUpDrawerProps) {
  const toast = useToast()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'followup' | 'files'>('followup')
  const [saving, setSaving] = useState(false)

  // Simple 3-step Follow-Up composer state
  const [channel, setChannel] = useState<TaskFollowUpChannel>('Call')
  const [outcome, setOutcome] = useState<TaskFollowUpOutcome>('Reached — Moving Forward')
  const [stage, setStage] = useState<TaskFollowUpStage>('In progress')
  const [note, setNote] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [nextDate, setNextDate] = useState(() => dubaiDateOffset(1))
  const [nextTime, setNextTime] = useState('10:00')
  const [syncDueDate, setSyncDueDate] = useState(true)
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [reassignTo, setReassignTo] = useState<string>('')
  const [escalate, setEscalate] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])

  const q = useQuery({
    queryKey: ['task-followups', taskId],
    enabled: Boolean(taskId && taskId > 0),
    queryFn: () =>
      get<{
        task: any
        summary: TaskFollowUpSummary
        followups: TaskFollowUpEntry[]
        attachments: TaskAttachmentItem[]
        staff: Array<{ id: number; name: string; designation: string }>
      }>(`/api/tasks/${taskId}/followups`),
  })

  useEffect(() => {
    if (!taskId) return
    setTab('followup')
    setNote('')
    setPendingFiles([])
    setEscalate(false)
  }, [taskId])

  useEffect(() => {
    if (!q.data) return
    const curStage = q.data.summary?.stage
    if (curStage && curStage !== 'To do') setStage(curStage)
    else setStage('In progress')
    if (q.data.summary?.next_action && curStage !== 'Done') setNextAction(q.data.summary.next_action)
    setReassignTo(q.data.task?.assignee_id ? String(q.data.task.assignee_id) : '')
  }, [q.data?.task?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!taskId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [taskId, onClose])

  if (!taskId) return null

  const task = q.data?.task
  const summary = q.data?.summary
  const followups = q.data?.followups ?? []
  const attachments = q.data?.attachments ?? []
  const staff = q.data?.staff ?? []

  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: ['task-followups', taskId] })
    void qc.invalidateQueries({ queryKey: ['form-attachments', 'tasks', taskId] })
    void qc.invalidateQueries({ queryKey: ['list', 'tasks'] })
    void qc.invalidateQueries({ queryKey: ['rec', 'tasks', taskId] })
    void qc.invalidateQueries({ queryKey: ['panel', 'tasks', taskId] })
    void qc.invalidateQueries({ queryKey: ['shabib-team-daily'] })
    void qc.invalidateQueries({ queryKey: ['field-reports-my-context'] })
    void qc.invalidateQueries({ queryKey: ['command-center-overview'] })
    onUpdated?.()
  }

  const applyTemplate = (tpl: (typeof QUICK_FOLLOWUP_TEMPLATES)[number]) => {
    setChannel(tpl.channel)
    setOutcome(tpl.outcome)
    setStage(tpl.stage)
    setNote(tpl.note)
    setNextAction(tpl.next_action)
  }

  const submitFollowUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!note.trim()) {
      toast.error('Please write a short follow-up note describing what happened.')
      return
    }
    setSaving(true)
    try {
      let uploadedIds: number[] = []
      if (pendingFiles.length > 0) {
        const uploaded = (await upload(pendingFiles, {
          link_entity: 'tasks',
          link_id: taskId,
          category: 'Follow-Up Proof',
        })) as TaskAttachmentItem[]
        uploadedIds = uploaded.map(u => u.id)
      }

      await post(`/api/tasks/${taskId}/followups`, {
        channel,
        outcome,
        stage,
        note: note.trim(),
        next_action: stage === 'Done' ? null : nextAction.trim() || null,
        next_followup_date: stage === 'Done' ? null : nextDate || null,
        next_followup_time: stage === 'Done' ? null : nextTime || null,
        contact_name: contactName.trim() || null,
        contact_phone: contactPhone.trim() || null,
        attachment_ids: uploadedIds,
        sync_due_date: syncDueDate,
        escalate: escalate || stage === 'Blocked',
        reassign_to_id: reassignTo ? Number(reassignTo) : null,
      })

      toast.ok(
        stage === 'Done'
          ? 'Follow-up saved and task marked Done!'
          : `Follow-up logged (${channel} · ${stage})`,
      )
      setNote('')
      setPendingFiles([])
      setEscalate(false)
      invalidateAll()
    } catch (err: any) {
      toast.error(err?.message || 'Could not save follow-up')
    } finally {
      setSaving(false)
    }
  }

  const removeFollowUp = async (fid: number) => {
    try {
      await del(`/api/tasks/${taskId}/followups/${fid}`)
      toast.ok('Follow-up entry removed')
      invalidateAll()
    } catch (err: any) {
      toast.error(err?.message || 'Could not remove follow-up')
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[210] flex justify-end no-print"
      role="dialog"
      aria-modal="true"
      aria-label="Task Follow-Up & Attachments"
    >
      <div className="flex-1 bg-[#121212]/50 backdrop-blur-[2px]" onClick={onClose} />

      <aside className="flex h-full w-full max-w-[560px] flex-col overflow-hidden border-l border-line bg-card shadow-2xl fade-in">
        {/* SWK Obsidian Executive Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-[#121212] px-5 py-4 text-white">
          <div className="min-w-0 space-y-1">
            <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#51fec0]">
              <CalendarClock size={12} /> Task Follow-Up &amp; Attachment Desk
            </div>
            <h2 className="m-0 text-[16px] font-bold leading-snug text-white">
              {task?.title || initialTitle || `Task #${taskId}`}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/75">
              {task?.assignee_name && (
                <span className="inline-flex items-center gap-1">
                  <UserCheck size={11} className="text-[#51fec0]" /> {task.assignee_name}
                </span>
              )}
              {task?.due_date && (
                <>
                  <span>·</span>
                  <span className="font-mono">Due {task.due_date}</span>
                </>
              )}
              {summary?.stage && (
                <span className={cls('rounded-full border px-2 py-0.5 text-[10px] font-bold', followUpStageBadgeClass(summary.stage))}>
                  {summary.stage}
                </span>
              )}
              <Link
                to={`/e/tasks/${taskId}`}
                onClick={onClose}
                className="inline-flex items-center gap-1 text-[#51fec0] hover:underline no-underline"
              >
                Full Record <ExternalLink size={10} />
              </Link>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-full border-0 bg-white/10 text-white hover:bg-white/20 cursor-pointer"
            aria-label="Close task follow-up drawer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Clean 2-Tab Switcher */}
        <div className="grid grid-cols-2 gap-1.5 border-b border-line bg-soft p-2.5 text-xs font-bold">
          <button
            type="button"
            onClick={() => setTab('followup')}
            className={cls(
              'inline-flex items-center justify-center gap-1.5 rounded-xl border-0 px-3 py-2 cursor-pointer transition',
              tab === 'followup' ? 'bg-[#121212] text-[#51fec0]' : 'bg-transparent text-ink hover:bg-card',
            )}
          >
            <History size={13} /> Follow-Up &amp; Timeline ({followups.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('files')}
            className={cls(
              'inline-flex items-center justify-center gap-1.5 rounded-xl border-0 px-3 py-2 cursor-pointer transition',
              tab === 'files' ? 'bg-[#121212] text-[#51fec0]' : 'bg-transparent text-ink hover:bg-card',
            )}
          >
            <Paperclip size={13} /> Attachments ({attachments.length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {q.isPending ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted">
              <Loader2 size={16} className="animate-spin text-[#0e9f6e]" /> Loading task follow-ups…
            </div>
          ) : tab === 'files' ? (
            <div className="space-y-4">
              <FormAttachmentField
                immediate
                entity="tasks"
                recordId={taskId}
                category="Task Attachment"
                label="Upload Files Directly to This Task"
                hint="PDF, Emirates ID, Form A/F, cheques, screenshots, Word, Excel · up to 25 MB each"
                onUploaded={() => invalidateAll()}
                onDeleted={() => invalidateAll()}
              />
            </div>
          ) : (
            <>
              {task?.description && (
                <div className="rounded-xl border border-line bg-soft/70 p-3 text-body leading-relaxed">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">Task Brief</div>
                  {task.description}
                </div>
              )}

              {summary?.next_followup_date && summary.stage !== 'Done' && (
                <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-amber-950">
                  <Clock size={15} className="shrink-0 text-[#8a621c]" />
                  <div className="min-w-0">
                    <div className="font-bold">
                      Next Follow-Up:{' '}
                      <span className="font-mono">
                        {summary.next_followup_date}
                        {summary.next_followup_time ? ` · ${summary.next_followup_time} GST` : ''}
                      </span>
                    </div>
                    {summary.next_action && <div className="truncate text-[11px] opacity-85">{summary.next_action}</div>}
                  </div>
                </div>
              )}

              {/* Simple 3-Step Detailed Follow-Up Form */}
              <form onSubmit={submitFollowUp} className="space-y-3.5 rounded-2xl border border-line-strong bg-card p-4 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-ink">
                    <Sparkles size={13} className="text-[#0e9f6e]" /> Log Follow-Up (3 Quick Steps)
                  </div>
                  <span className="text-[10.5px] font-semibold text-[#0e9f6e]">Auto-saved with Dubai GST timestamp</span>
                </div>

                {/* 1-Click Quick Templates */}
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_FOLLOWUP_TEMPLATES.map(tpl => (
                    <button
                      key={tpl.label}
                      type="button"
                      onClick={() => applyTemplate(tpl)}
                      className="rounded-full border border-line bg-soft px-2.5 py-1 text-[10.5px] font-semibold text-ink hover:border-[#121212] hover:bg-[#121212] hover:text-[#51fec0] transition cursor-pointer"
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>

                {/* Step 1: Channel */}
                <div className="space-y-1.5">
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted">1. How did you follow up?</div>
                  <div className="flex flex-wrap gap-1.5">
                    {TASK_FOLLOWUP_CHANNELS.map(ch => {
                      const Icon = CHANNEL_ICON[ch]
                      const active = channel === ch
                      return (
                        <button
                          key={ch}
                          type="button"
                          onClick={() => setChannel(ch)}
                          className={cls(
                            'inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition cursor-pointer',
                            active
                              ? 'border-[#121212] bg-[#121212] text-[#51fec0]'
                              : 'border-line bg-soft text-ink hover:border-[#0e9f6e]',
                          )}
                        >
                          <Icon size={12} /> {ch}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Step 2: Stage + Outcome */}
                <div className="space-y-2">
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted">2. Status / Stage &amp; Outcome</div>
                  <div className="flex flex-wrap gap-1.5">
                    {TASK_FOLLOWUP_STAGES.filter(s => s !== 'To do').map(st => {
                      const active = stage === st
                      return (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setStage(st)}
                          className={cls(
                            'rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition cursor-pointer',
                            active
                              ? st === 'Done'
                                ? 'border-emerald-700 bg-emerald-700 text-white'
                                : st === 'Blocked'
                                  ? 'border-rose-700 bg-rose-700 text-white'
                                  : 'border-[#121212] bg-[#121212] text-white'
                              : 'border-line bg-soft text-ink hover:border-[#0e9f6e]',
                          )}
                        >
                          {st === 'Done' ? 'Done ✓' : st}
                        </button>
                      )
                    })}
                  </div>
                  <select
                    aria-label="Follow-up outcome"
                    className="select !h-9 text-xs"
                    value={outcome}
                    onChange={e => setOutcome(e.target.value as TaskFollowUpOutcome)}
                  >
                    {TASK_FOLLOWUP_OUTCOMES.map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>

                {/* Step 3: Details, Next Schedule & Proof Attachment */}
                <div className="space-y-2.5">
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted">3. Details, Next Step &amp; Proof</div>
                  <textarea
                    required
                    rows={2}
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Write what happened, client / owner feedback, or pending blockers…"
                    className="textarea text-xs"
                  />

                  {stage !== 'Done' && (
                    <>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <input
                          className="input !h-9 text-xs sm:col-span-3"
                          value={nextAction}
                          onChange={e => setNextAction(e.target.value)}
                          placeholder="Next action required (e.g. Collect signed Form F & deposit cheque)"
                        />
                        <div>
                          <label className="mb-1 block text-[10.5px] font-bold text-muted">Next Follow-Up Date</label>
                          <input
                            type="date"
                            className="input !h-9 font-mono text-xs"
                            value={nextDate}
                            onChange={e => setNextDate(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10.5px] font-bold text-muted">Time (GST)</label>
                          <input
                            type="time"
                            className="input !h-9 font-mono text-xs"
                            value={nextTime}
                            onChange={e => setNextTime(e.target.value)}
                          />
                        </div>
                        <div className="flex items-end pb-1.5">
                          <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted cursor-pointer">
                            <input type="checkbox" checked={syncDueDate} onChange={e => setSyncDueDate(e.target.checked)} />
                            Sync due date
                          </label>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
                        <span className="font-bold text-muted">Quick schedule:</span>
                        {[
                          ['Today 4 PM', dubaiDateOffset(0), '16:00'],
                          ['Tomorrow 10 AM', dubaiDateOffset(1), '10:00'],
                          ['+2 Days', dubaiDateOffset(2), '10:00'],
                          ['Next Week', dubaiDateOffset(7), '10:00'],
                        ].map(([lbl, d, t]) => (
                          <button
                            key={lbl}
                            type="button"
                            onClick={() => {
                              setNextDate(d)
                              setNextTime(t)
                            }}
                            className="rounded-full border border-line bg-soft px-2 py-0.5 font-bold text-ink hover:bg-[#121212] hover:text-[#51fec0] cursor-pointer transition"
                          >
                            {lbl}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  <FormAttachmentField
                    compact
                    files={pendingFiles}
                    onChange={setPendingFiles}
                    label="Attach proof / document"
                  />

                  <div className="grid gap-2 pt-1 sm:grid-cols-2">
                    <input
                      className="input !h-8 text-[11px]"
                      placeholder="Person spoken with (optional)"
                      value={contactName}
                      onChange={e => setContactName(e.target.value)}
                    />
                    <input
                      className="input !h-8 text-[11px]"
                      placeholder="Contact phone (optional)"
                      value={contactPhone}
                      onChange={e => setContactPhone(e.target.value)}
                    />
                    {staff.length > 0 && (
                      <select
                        aria-label="Reassign task"
                        className="select !h-8 text-[11px]"
                        value={reassignTo}
                        onChange={e => setReassignTo(e.target.value)}
                      >
                        <option value="">Keep current assignee</option>
                        {staff.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.designation})
                          </option>
                        ))}
                      </select>
                    )}
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#a3263a] cursor-pointer self-center">
                      <input
                        type="checkbox"
                        checked={escalate || stage === 'Blocked'}
                        onChange={e => setEscalate(e.target.checked)}
                      />
                      <AlertTriangle size={12} /> Escalate to Owner / Manager
                    </label>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="btn w-full justify-center bg-[#121212] text-[#51fec0] hover:bg-[#1f2937]"
                >
                  {saving ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Saving Follow-Up…
                    </>
                  ) : stage === 'Done' ? (
                    <>
                      <CheckCircle2 size={14} /> Log Final Note &amp; Mark Done
                    </>
                  ) : (
                    <>
                      <Send size={13} /> Save Follow-Up &amp; Schedule Next
                    </>
                  )}
                </button>
              </form>

              {/* Complete Visual Follow-Up History Timeline */}
              <div className="space-y-2.5">
                <h3 className="m-0 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
                  Follow-Up History ({followups.length})
                </h3>
                {followups.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">
                    No follow-ups logged yet. Pick a 1-click template or fill the 3 quick steps above.
                  </div>
                ) : (
                  <ol className="m-0 list-none space-y-2.5 p-0">
                    {followups.map(fu => (
                      <li key={fu.id} className="space-y-1.5 rounded-2xl border border-line bg-soft/50 p-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-ink">{fu.author_name}</span>
                            <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[10px] font-bold text-ink">
                              {fu.channel}
                            </span>
                            <span className={cls('rounded-full border px-2 py-0.5 text-[10px] font-bold', followUpStageBadgeClass(fu.stage))}>
                              {fu.stage}
                            </span>
                            {fu.escalated && (
                              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                                Escalated
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] text-muted">{formatDubaiStamp(fu.created_at)}</span>
                            <button
                              type="button"
                              onClick={() => void removeFollowUp(fu.id)}
                              className="border-0 bg-transparent p-0.5 text-muted hover:text-[#a3263a] cursor-pointer"
                              title="Delete entry"
                              aria-label="Delete follow-up entry"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>

                        <div className="text-[11px] font-bold text-[#0e9f6e]">{fu.outcome}</div>
                        <p className="m-0 whitespace-pre-wrap text-xs leading-relaxed text-ink">{fu.note}</p>

                        {(fu.contact_name || fu.contact_phone) && (
                          <div className="text-[10.5px] text-muted">
                            Contact: <b className="text-ink">{fu.contact_name || '—'}</b>
                            {fu.contact_phone ? ` · ${fu.contact_phone}` : ''}
                          </div>
                        )}

                        {(fu.next_action || fu.next_followup_date) && (
                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-[#8a621c]">
                            {fu.next_action && <span>Next: {fu.next_action}</span>}
                            {fu.next_followup_date && (
                              <span className="font-mono">
                                · Remind {fu.next_followup_date}
                                {fu.next_followup_time ? ` ${fu.next_followup_time}` : ''}
                              </span>
                            )}
                          </div>
                        )}

                        {fu.attachments && fu.attachments.length > 0 && (
                          <AttachmentChips attachments={fu.attachments} compact />
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  )
}
