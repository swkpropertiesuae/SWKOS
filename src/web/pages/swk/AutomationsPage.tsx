import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  GitBranch,
  Minus,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Workflow,
  XCircle,
  Zap,
} from 'lucide-react'
import { optValue } from '@shared/types'
import { get, post, put, del } from '../../lib/api'
import { useMeta } from '../../lib/meta'
import { useToast } from '../../lib/toast'
import { Modal, useDialogs } from '../../ui/kit'

type Rule = {
  id: number
  version: number
  name: string
  entity: string
  trigger: string
  field?: string
  operator?: string
  value?: string
  action: string
  assignee_id?: number | null
  target?: string
  message?: string
  body?: string
  due_days?: number
  delay_minutes?: number
  active: boolean
  _labels?: Record<string, string>
}
type Run = { id: number; label: string; status: string; error?: string; created_at: string; attempts: number }

const TRIGGERS = ['Record created', 'Record updated', 'Status / stage changed to']
const OPS = ['equals', 'not equals', 'contains', 'greater than', 'less than', 'is empty', 'is not empty']
const ACTIONS = [
  'Create follow-up task',
  'Notify user',
  'Post to Inside group',
  'Queue e-mail to customer contact',
  'Queue e-mail to address',
  'Send WhatsApp to customer contact',
  'Send WhatsApp to number',
  'Ask an AI employee to review',
  'Set field value',
]
const EXCLUDED = new Set([
  'automation_rules',
  'workflow_runs',
  'workflow_attempts',
  'tasks',
  'email_outbox',
  'ai_actions',
  'users',
  'roles',
  'api_keys',
])

const TEMPLATES: { id: string; title: string; blurb: string; rule: Partial<Rule> }[] = [
  {
    id: 'tpl-lead-call',
    title: 'New lead → follow-up call task',
    blurb: 'Every new enquiry gets a call task due tomorrow.',
    rule: { name: 'Call every new lead', entity: 'leads', trigger: 'Record created', action: 'Create follow-up task', message: 'Call new lead {_title}', due_days: 1 },
  },
  {
    id: 'tpl-lead-qual',
    title: 'Lead qualified → tell the sales group',
    blurb: 'Post to an Inside group when a lead becomes Qualified.',
    rule: { name: 'Qualified lead alert', entity: 'leads', trigger: 'Status / stage changed to', field: 'status', value: 'Qualified', action: 'Post to Inside group', message: 'Qualified lead: {_title}' },
  },
  {
    id: 'tpl-leave-hr',
    title: 'Leave request → notify HR',
    blurb: 'HR is alerted the moment someone applies for leave.',
    rule: { name: 'New leave request', entity: 'leave_requests', trigger: 'Record created', action: 'Notify user', message: 'Leave request: {_title}' },
  },
  {
    id: 'tpl-inv-paid',
    title: 'Invoice paid → celebrate in Inside',
    blurb: 'Share paid invoices with the team in Inside.',
    rule: { name: 'Invoice paid', entity: 'invoices', trigger: 'Status / stage changed to', field: 'status', value: 'Paid', action: 'Post to Inside group', message: 'Invoice paid: {_title}' },
  },
  {
    id: 'tpl-ticket',
    title: 'Support ticket → owner task',
    blurb: 'Open tickets get a task so nothing is missed.',
    rule: { name: 'Ticket follow-up', entity: 'tickets', trigger: 'Record created', action: 'Create follow-up task', message: 'Handle ticket {_title}', due_days: 1 },
  },
  {
    id: 'tpl-ai',
    title: 'Lead converted → AI review',
    blurb: 'Ask an AI employee to check the converted lead file.',
    rule: { name: 'Converted lead review', entity: 'leads', trigger: 'Status / stage changed to', field: 'status', value: 'Converted', action: 'Ask an AI employee to review', target: 'Jarvis', message: 'Review converted lead {_title}' },
  },
]

type SelectedFlow = { kind: 'rule'; rule: Rule } | { kind: 'template'; tpl: (typeof TEMPLATES)[number] }
type InspectorTab = 'setup' | 'conditions' | 'runs'

export default function AutomationsPage() {
  const { meta, can, def } = useMeta()
  const qc = useQueryClient()
  const toast = useToast()
  const dlg = useDialogs()
  const rulesQ = useQuery({ queryKey: ['list', 'automation_rules', 'page'], queryFn: () => get<{ rows: Rule[] }>('/api/e/automation_rules', { pageSize: 500, sort: 'id', dir: 'desc' }) })
  const runsQ = useQuery({ queryKey: ['list', 'workflow_runs', 'page'], queryFn: () => get<{ rows: Run[] }>('/api/e/workflow_runs', { pageSize: 15, sort: 'id', dir: 'desc' }), refetchInterval: 20000 })
  const [editing, setEditing] = useState<Partial<Rule> | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<'trigger' | 'condition' | 'action' | 'done'>('action')
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('setup')
  const [zoom, setZoom] = useState(100)

  const entities = useMemo(
    () => (meta?.entities ?? []).filter(e => !EXCLUDED.has(e.key) && !e.readonlyApi && !e.child && can(e.module, 'view')).sort((a, b) => a.plural.localeCompare(b.plural)),
    [meta, can],
  )
  const label = (key?: string) => (key ? entities.find(e => e.key === key)?.plural ?? key : 'Records')
  const fieldLabel = (entity?: string, f?: string) => (entity && f ? def(entity)?.fields.find(x => x.name === f)?.label ?? f : '')
  const canEdit = can('admin', 'create')
  const rules = rulesQ.data?.rows ?? []
  const visibleTemplates = useMemo(() => TEMPLATES.filter(t => entities.some(e => e.key === t.rule.entity)), [entities])

  const selectedFlow = useMemo<SelectedFlow | null>(() => {
    if (selectedKey?.startsWith('rule:')) {
      const id = Number(selectedKey.slice(5))
      const found = rules.find(r => r.id === id)
      if (found) return { kind: 'rule', rule: found }
    }
    if (selectedKey?.startsWith('tpl:')) {
      const id = selectedKey.slice(4)
      const found = visibleTemplates.find(t => t.id === id)
      if (found) return { kind: 'template', tpl: found }
    }
    if (rules[0]) return { kind: 'rule', rule: rules[0] }
    if (visibleTemplates[0]) return { kind: 'template', tpl: visibleTemplates[0] }
    return null
  }, [selectedKey, rules, visibleTemplates])

  const activeRule: Partial<Rule> | null = selectedFlow
    ? selectedFlow.kind === 'rule'
      ? selectedFlow.rule
      : selectedFlow.tpl.rule
    : null

  const toggle = async (r: Rule) => {
    try {
      await put(`/api/e/automation_rules/${r.id}`, { active: !r.active, version: r.version })
      void qc.invalidateQueries({ queryKey: ['list', 'automation_rules'] })
      toast.ok(r.active ? 'Automation paused' : 'Automation enabled')
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const remove = async (r: Rule) => {
    if (!(await dlg.confirm({ title: `Delete "${r.name}"?`, danger: true, ok: 'Delete' }))) return
    try {
      await del(`/api/e/automation_rules/${r.id}`)
      void qc.invalidateQueries({ queryKey: ['list', 'automation_rules'] })
      toast.ok('Automation deleted')
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const openEditorForSelection = () => {
    if (!canEdit) return
    if (selectedFlow?.kind === 'rule') {
      setEditing(selectedFlow.rule)
    } else if (selectedFlow?.kind === 'template') {
      setEditing({ operator: 'equals', delay_minutes: 0, due_days: 1, active: true, ...selectedFlow.tpl.rule })
    } else {
      setEditing({ trigger: 'Record created', action: 'Create follow-up task', operator: 'equals', due_days: 1, delay_minutes: 0, active: true })
    }
  }

  return (
    <div className="mx-auto max-w-[1480px] grid gap-5 pb-10">
      {/* Top Studio Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-line bg-card/95 px-5 py-4 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.12)]">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-[#0f172a] dark:bg-[#142a38] text-[#c5e86c] shrink-0">
            <Workflow size={18} />
          </span>
          <div className="min-w-0">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-[var(--eyebrow)]">
              SWK Visual Workflow Studio
            </div>
            <h1 className="m-0 text-[20px] font-bold tracking-[-0.025em] text-ink truncate">
              Automations &amp; Live Flow Builder
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/e/workflow_runs" className="btn outline sm">
            <Clock size={14} /> Run History ({runsQ.data?.rows?.length ?? 0})
          </Link>
          {canEdit && (
            <button
              type="button"
              className="btn navy sm"
              onClick={() => setEditing({ trigger: 'Record created', action: 'Create follow-up task', operator: 'equals', due_days: 1, delay_minutes: 0, active: true })}
            >
              <Plus size={14} /> New Workflow
            </button>
          )}
        </div>
      </header>

      {/* 3-Column Visual Studio (Image 3 NexusFlow + Image 4 Minimalist Flow) */}
      <div className="grid gap-4 lg:grid-cols-12 items-stretch">
        {/* Left Sidebar: Active Workflows & Blueprint Templates */}
        <aside className="lg:col-span-3 rounded-[26px] border border-line bg-card/95 p-4 shadow-[0_12px_32px_-20px_rgba(15,23,42,0.1)] flex flex-col gap-4">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted mb-2">
              Active Workflows ({rules.length})
            </div>
            <div className="grid gap-1.5">
              {rules.length === 0 && !rulesQ.isLoading && (
                <div className="rounded-2xl bg-soft p-3 text-xs text-muted">
                  No active rules yet — click a blueprint below to launch one.
                </div>
              )}
              {rules.map(r => {
                const isSel = selectedFlow?.kind === 'rule' && selectedFlow.rule.id === r.id
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedKey(`rule:${r.id}`)}
                    className={`w-full flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition-all cursor-pointer ${
                      isSel
                        ? 'border-[#6d28d9]/40 bg-[#f5f3ff] text-[#0f172a] dark:border-[#c5e86c]/40 dark:bg-soft dark:text-ink'
                        : 'border-transparent bg-transparent text-body hover:bg-hover'
                    }`}
                  >
                    <span className={`size-2 rounded-full shrink-0 ${r.active ? 'bg-[#047857] dark:bg-[#34d399]' : 'bg-[#94a3b8]'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-bold">{r.name}</span>
                      <span className="block truncate text-[11px] text-muted">{label(r.entity)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="border-t border-line pt-3">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted mb-2">
              Brokerage Blueprints
            </div>
            <div className="grid gap-1.5">
              {visibleTemplates.map(t => {
                const isSel = selectedFlow?.kind === 'template' && selectedFlow.tpl.id === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedKey(`tpl:${t.id}`)}
                    className={`w-full flex items-center gap-2.5 rounded-2xl border px-3 py-2 text-left transition-all cursor-pointer ${
                      isSel
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-line bg-soft text-ink hover:border-ink/35'
                    }`}
                  >
                    <Zap size={13} className={isSel ? 'text-[#c5e86c] dark:text-[#0b1f2a] shrink-0' : 'text-[var(--eyebrow)] shrink-0'} />
                    <span className="truncate text-[12px] font-semibold">{t.title}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </aside>

        {/* Center Dot-Grid Visual Node Graph Canvas */}
        <section
          aria-label="Visual workflow node canvas"
          className="lg:col-span-6 relative rounded-[26px] border border-line bg-card/85 p-5 flex flex-col justify-between min-h-[520px] shadow-[0_12px_32px_-20px_rgba(15,23,42,0.1)]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.3) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        >
          {/* Canvas Top Bar: Selected Rule Title + Zoom Control */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3.5 py-1.5 text-[12px] font-bold text-ink shadow-2xs">
              <span className="size-2 rounded-full bg-[var(--eyebrow)]" />
              {activeRule?.name || 'Select a workflow'}
              {selectedFlow?.kind === 'template' && (
                <span className="rounded-full bg-[#f5f3ff] dark:bg-soft px-2 py-0.5 text-[10px] font-bold text-[var(--eyebrow)]">Blueprint</span>
              )}
            </div>
            <div className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-2 py-1 text-[11.5px] font-mono text-ink shadow-2xs">
              <button type="button" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(85, z - 5))} className="size-6 grid place-items-center rounded-full border-0 bg-transparent text-ink hover:bg-hover cursor-pointer">
                <Minus size={12} />
              </button>
              <span className="px-1.5 font-semibold">{zoom}%</span>
              <button type="button" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(110, z + 5))} className="size-6 grid place-items-center rounded-full border-0 bg-transparent text-ink hover:bg-hover cursor-pointer">
                <Plus size={12} />
              </button>
            </div>
          </div>

          {/* Connected Node Graph */}
          {activeRule ? (
            <div
              className="flex-1 flex flex-col items-center justify-center py-2 transition-transform"
              style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'center top' }}
            >
              {/* Node 1: Trigger */}
              <button
                type="button"
                onClick={() => { setSelectedNode('trigger'); setInspectorTab('setup') }}
                className={`w-full max-w-[340px] flex items-center gap-3 rounded-[20px] border bg-card p-3.5 text-left shadow-sm transition-all cursor-pointer ${
                  selectedNode === 'trigger' ? 'border-[#047857] ring-2 ring-[#047857]/20' : 'border-line hover:border-ink/40'
                }`}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#ecfdf5] text-[#047857]">
                  <Zap size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#047857] dark:text-[#34d399]">Trigger</div>
                  <div className="truncate text-[13.5px] font-bold text-ink">
                    {label(activeRule.entity)} · {activeRule.trigger}
                  </div>
                </div>
              </button>

              {/* Vertical Connector 1 -> 2 */}
              <svg width="24" height="34" viewBox="0 0 24 34" aria-hidden="true">
                <line x1="12" y1="3" x2="12" y2="31" stroke="#047857" strokeWidth="1.8" />
                <circle cx="12" cy="4" r="3" fill="#047857" />
                <circle cx="12" cy="30" r="3" fill="#6d28d9" />
              </svg>

              {/* Node 2: Condition Gate */}
              <button
                type="button"
                onClick={() => { setSelectedNode('condition'); setInspectorTab('conditions') }}
                className={`w-full max-w-[340px] flex items-center gap-3 rounded-[20px] border bg-card p-3.5 text-left shadow-sm transition-all cursor-pointer ${
                  selectedNode === 'condition' ? 'border-[#6d28d9] dark:border-[#c5e86c] ring-2 ring-[#6d28d9]/20' : 'border-line hover:border-ink/40'
                }`}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f5f3ff] text-[#6d28d9]">
                  <GitBranch size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--eyebrow)]">Condition Gate</div>
                  <div className="truncate text-[13px] font-bold text-ink">
                    {activeRule.field
                      ? `${fieldLabel(activeRule.entity, activeRule.field)} ${activeRule.operator || 'equals'} "${activeRule.value ?? ''}"`
                      : 'Match all incoming records'}
                  </div>
                </div>
                <span className="rounded-full bg-[#ecfdf5] px-2 py-0.5 text-[10px] font-bold text-[#047857]">Yes</span>
              </button>

              {/* Branching SVG Connector 2 -> 3 */}
              <svg width="260" height="40" viewBox="0 0 260 40" aria-hidden="true">
                <path d="M 130 3 L 130 16 C 130 22, 85 20, 85 36" fill="none" stroke="#047857" strokeWidth="1.8" />
                <path d="M 130 3 L 130 16 C 130 22, 195 20, 195 36" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 4" />
                <circle cx="130" cy="4" r="3" fill="#6d28d9" />
                <circle cx="85" cy="36" r="3" fill="#047857" />
                <circle cx="195" cy="36" r="2.8" fill="#94a3b8" />
              </svg>

              {/* Node 3 Row: Primary Obsidian Active Action + Else/Skip Pill */}
              <div className="w-full max-w-[380px] grid grid-cols-[1.5fr_0.9fr] gap-3 items-center">
                <button
                  type="button"
                  onClick={() => { setSelectedNode('action'); setInspectorTab('setup') }}
                  className={`flex items-center gap-3 rounded-[20px] border p-3.5 text-left shadow-md transition-all cursor-pointer ${
                    selectedNode === 'action'
                      ? 'border-[#0f172a] dark:border-[#c5e86c]/50 bg-[#0f172a] dark:bg-[#142a38] text-white'
                      : 'border-[#0f172a]/80 dark:border-line bg-[#0f172a]/92 dark:bg-[#142a38]/90 text-white hover:bg-[#0f172a]'
                  }`}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-[#c5e86c]">
                    <Play size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#c5e86c]">Action</div>
                    <div className="truncate text-[13px] font-bold text-white">{activeRule.action}</div>
                  </div>
                </button>
                <div className="rounded-[18px] border border-dashed border-line bg-card/85 p-3 text-center">
                  <div className="text-[10px] font-bold uppercase text-muted">No Match</div>
                  <div className="text-[11.5px] font-semibold text-body mt-0.5">Skip quietly</div>
                </div>
              </div>

              {/* Vertical Connector 3 -> 4 */}
              <svg width="24" height="32" viewBox="0 0 24 32" aria-hidden="true">
                <line x1="12" y1="3" x2="12" y2="29" stroke="#047857" strokeWidth="1.8" />
                <circle cx="12" cy="4" r="3" fill="#047857" />
                <circle cx="12" cy="28" r="3" fill="#047857" />
              </svg>

              {/* Node 4: Completion & Audit */}
              <button
                type="button"
                onClick={() => { setSelectedNode('done'); setInspectorTab('runs') }}
                className={`w-full max-w-[300px] flex items-center gap-3 rounded-[20px] border bg-card px-4 py-3 text-left shadow-xs transition-all cursor-pointer ${
                  selectedNode === 'done' ? 'border-[#047857] ring-2 ring-[#047857]/20' : 'border-line hover:border-ink/40'
                }`}
              >
                <CheckCircle2 size={18} className="text-[#047857] dark:text-[#34d399] shrink-0" />
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-ink">Workflow Completed</div>
                  <div className="text-[11px] text-muted">
                    {activeRule.delay_minutes ? `Executes after ${activeRule.delay_minutes} min · Audit logged` : 'Instant execution · Audit logged'}
                  </div>
                </div>
              </button>
            </div>
          ) : (
            <div className="flex-1 grid place-items-center text-sm text-muted">Select a workflow to visualize its node graph.</div>
          )}

          {/* Floating Bottom Canvas Action Dock (Image 3 & 4 signature bar) */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1.5 shadow-[0_12px_28px_-14px_rgba(15,23,42,0.25)]">
              {canEdit && (
                <button
                  type="button"
                  onClick={openEditorForSelection}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#6d28d9] px-3.5 py-1.5 text-[12px] font-bold text-white border-0 cursor-pointer hover:bg-[#5b21b6] transition-colors"
                >
                  <Pencil size={13} /> {selectedFlow?.kind === 'rule' ? 'Configure Flow' : 'Use Blueprint'}
                </button>
              )}
              {canEdit && selectedFlow?.kind === 'rule' && (
                <button
                  type="button"
                  onClick={() => void toggle(selectedFlow.rule)}
                  className="rounded-full bg-soft px-3 py-1.5 text-[12px] font-semibold text-ink border-0 cursor-pointer hover:bg-hover transition-colors"
                >
                  {selectedFlow.rule.active ? 'Pause' : 'Activate'}
                </button>
              )}
              <Link
                to="/ai"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#f5f3ff] dark:bg-soft px-3 py-1.5 text-[12px] font-semibold text-[#6d28d9] dark:text-[#c5e86c] no-underline hover:bg-[#ede9fe] dark:hover:bg-hover transition-colors"
              >
                <Sparkles size={13} /> AI Assistant
              </Link>
            </div>
          </div>
        </section>

        {/* Right Column: Node Configuration & Runs Inspector (Image 3 right sidebar) */}
        <aside className="lg:col-span-3 rounded-[26px] border border-line bg-card/95 p-4 shadow-[0_12px_32px_-20px_rgba(15,23,42,0.1)] flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="m-0 text-[15px] font-bold text-ink">Node Configuration</h2>
              {canEdit && selectedFlow?.kind === 'rule' && (
                <button
                  type="button"
                  aria-label={`Delete ${selectedFlow.rule.name}`}
                  onClick={() => void remove(selectedFlow.rule)}
                  className="btn outline icon sm"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-1 rounded-xl bg-soft p-1 mb-4">
              {(
                [
                  { id: 'setup', label: 'Setup' },
                  { id: 'conditions', label: 'Condition' },
                  { id: 'runs', label: 'Runs' },
                ] as { id: InspectorTab; label: string }[]
              ).map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setInspectorTab(t.id)}
                  className={`rounded-lg py-1.5 text-[11.5px] font-semibold border-0 cursor-pointer transition-colors ${
                    inspectorTab === t.id ? 'bg-card text-ink shadow-2xs' : 'bg-transparent text-muted'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {inspectorTab === 'setup' && activeRule && (
              <div className="grid gap-3 text-[12.5px]">
                <div className="rounded-2xl border border-line bg-soft p-3">
                  <div className="text-[10.5px] font-bold uppercase text-muted">Record Entity</div>
                  <div className="mt-0.5 font-bold text-ink">{label(activeRule.entity)}</div>
                </div>
                <div className="rounded-2xl border border-line bg-soft p-3">
                  <div className="text-[10.5px] font-bold uppercase text-muted">Trigger Event</div>
                  <div className="mt-0.5 font-bold text-ink">{activeRule.trigger}</div>
                </div>
                <div className="rounded-2xl border border-line bg-soft p-3">
                  <div className="text-[10.5px] font-bold uppercase text-muted">Execution Action</div>
                  <div className="mt-0.5 font-bold text-ink">{activeRule.action}</div>
                  {activeRule.target && <div className="mt-1 text-[11.5px] text-[var(--eyebrow)] font-semibold">Target: {activeRule.target}</div>}
                </div>
                {activeRule.message && (
                  <div className="rounded-2xl border border-line bg-soft p-3">
                    <div className="text-[10.5px] font-bold uppercase text-muted">Message Template</div>
                    <div className="mt-1 font-mono text-[11.5px] text-body break-words">{activeRule.message}</div>
                  </div>
                )}
              </div>
            )}

            {inspectorTab === 'conditions' && activeRule && (
              <div className="grid gap-3 text-[12.5px]">
                <div className="rounded-2xl border border-line bg-soft p-3">
                  <div className="text-[10.5px] font-bold uppercase text-muted">Condition Field</div>
                  <div className="mt-0.5 font-bold text-ink">{activeRule.field ? fieldLabel(activeRule.entity, activeRule.field) : 'None (every matching event)'}</div>
                </div>
                <div className="rounded-2xl border border-line bg-soft p-3">
                  <div className="text-[10.5px] font-bold uppercase text-muted">Operator &amp; Value</div>
                  <div className="mt-0.5 font-mono text-[12px] font-semibold text-ink">
                    {activeRule.field ? `${activeRule.operator || 'equals'} "${activeRule.value ?? ''}"` : 'Always true'}
                  </div>
                </div>
                <div className="rounded-2xl border border-line bg-soft p-3">
                  <div className="text-[10.5px] font-bold uppercase text-muted">Execution Timing</div>
                  <div className="mt-0.5 font-bold text-ink">
                    {activeRule.delay_minutes ? `Wait ${activeRule.delay_minutes} min` : 'Immediate'}
                  </div>
                </div>
              </div>
            )}

            {inspectorTab === 'runs' && (
              <div className="grid gap-2 max-h-[340px] overflow-y-auto">
                {(runsQ.data?.rows ?? []).slice(0, 8).map(r => (
                  <Link
                    key={r.id}
                    to={`/e/workflow_runs/${r.id}`}
                    className="flex items-center gap-2.5 rounded-2xl border border-line bg-soft px-3 py-2 no-underline hover:border-ink"
                  >
                    {r.status === 'Succeeded' ? (
                      <CheckCircle2 size={14} className="text-[#047857] dark:text-[#34d399] shrink-0" />
                    ) : r.status === 'Queued' || r.status === 'Running' ? (
                      <Clock size={14} className="text-[#b45309] dark:text-[#fbbf24] shrink-0" />
                    ) : (
                      <XCircle size={14} className="text-[#dc2626] dark:text-[#f87171] shrink-0" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink">{r.label}</span>
                  </Link>
                ))}
                {!runsQ.data?.rows?.length && (
                  <div className="rounded-2xl bg-soft p-4 text-center text-xs text-muted">
                    No workflow runs logged yet.
                  </div>
                )}
              </div>
            )}
          </div>

          {canEdit && (
            <button type="button" onClick={openEditorForSelection} className="btn navy w-full justify-center">
              <Bot size={14} /> {selectedFlow?.kind === 'rule' ? 'Edit Workflow Rule' : 'Activate Blueprint'}
            </button>
          )}
        </aside>
      </div>

      {editing && (
        <RuleBuilder
          initial={editing}
          entities={entities}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void qc.invalidateQueries({ queryKey: ['list', 'automation_rules'] })
          }}
        />
      )}
    </div>
  )
}

/** Sentence-style builder: When <record> <trigger> [if <field> <op> <value>] then <action> <who/where>. */
function RuleBuilder({
  initial,
  entities,
  onClose,
  onSaved,
}: {
  initial: Partial<Rule>
  entities: { key: string; plural: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const { def } = useMeta()
  const toast = useToast()
  const [r, setR] = useState<Partial<Rule>>(initial)
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<Rule>) => setR(x => ({ ...x, ...p }))
  const ent = r.entity ? def(r.entity) : null
  const fields = (ent?.fields ?? []).filter(f => !f.secret && !f.virtual && f.type !== 'json')
  const field = fields.find(f => f.name === r.field)
  const users = useQuery({
    queryKey: ['users-lookup'],
    queryFn: () => get<{ id: number; label: string }[]>('/api/e/users/lookup', { limit: 100 }),
  }).data?.map(u => ({ id: u.id, name: u.label }))
  const groups =
    useQuery({
      queryKey: ['chat-threads'],
      queryFn: () => get<{ id: number; kind: string; title: string }[]>('/api/chat/threads'),
    }).data?.filter(t => t.kind === 'group') ?? []

  const save = async () => {
    setBusy(true)
    const body = { ...r, field: r.field || null, value: r.value ?? null, assignee_id: r.assignee_id || null }
    delete (body as any)._labels
    try {
      r.id ? await put(`/api/e/automation_rules/${r.id}`, body) : await post('/api/e/automation_rules', body)
      toast.ok('Automation saved')
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const needsUser = r.action === 'Create follow-up task' || r.action === 'Notify user'
  const sel = 'select'
  const box = 'rounded-2xl border border-line bg-soft p-4'

  return (
    <Modal
      open
      onClose={onClose}
      title={r.id ? 'Edit automation' : 'New automation'}
      width={680}
      footer={
        <>
          <div className="flex-1" />
          <button className="btn outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn navy" disabled={busy || !r.name || !r.entity || !r.trigger || !r.action} onClick={() => void save()}>
            Save automation
          </button>
        </>
      }
    >
      <label className="mb-4 block">
        <span className="label">Name</span>
        <input className="input" value={r.name ?? ''} onChange={e => set({ name: e.target.value })} placeholder="e.g. Call every new lead" />
      </label>
      <div className={box}>
        <div className="web-eyebrow mb-2">When</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <select className={sel} aria-label="Record type" value={r.entity ?? ''} onChange={e => set({ entity: e.target.value, field: '', value: '' })}>
            <option value="">Choose a record type…</option>
            {entities.map(e => (
              <option key={e.key} value={e.key}>
                {e.plural}
              </option>
            ))}
          </select>
          <select className={sel} aria-label="Trigger" value={r.trigger} onChange={e => set({ trigger: e.target.value })}>
            {TRIGGERS.map(t => (
              <option key={t} value={t}>
                {t === 'Record created' ? 'is created' : t === 'Record updated' ? 'is updated' : 'field changes to…'}
              </option>
            ))}
          </select>
        </div>
        {r.entity && (
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <select className={sel} aria-label="Condition field" value={r.field ?? ''} onChange={e => set({ field: e.target.value, value: '' })}>
              <option value="">{r.trigger === 'Status / stage changed to' ? 'Field…' : 'Any record (no condition)'}</option>
              {fields.map(f => (
                <option key={f.name} value={f.name}>
                  {f.label}
                </option>
              ))}
            </select>
            {r.trigger !== 'Status / stage changed to' && (
              <select className={sel} aria-label="Operator" value={r.operator ?? 'equals'} onChange={e => set({ operator: e.target.value })} disabled={!r.field}>
                {OPS.map(o => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            )}
            {field?.type === 'select' ? (
              <select className={sel} aria-label="Value" value={r.value ?? ''} onChange={e => set({ value: e.target.value })}>
                <option value="">Value…</option>
                {(field.options ?? []).map(o => (
                  <option key={optValue(o)}>{optValue(o)}</option>
                ))}
              </select>
            ) : (
              <input className="input" aria-label="Value" placeholder="Value" value={r.value ?? ''} onChange={e => set({ value: e.target.value })} disabled={!r.field} />
            )}
          </div>
        )}
      </div>
      <div className="my-2 flex justify-center text-[#6d28d9]">
        <ArrowRight className="rotate-90" size={18} />
      </div>
      <div className={box}>
        <div className="web-eyebrow mb-2">Then</div>
        <select className={`${sel} mb-2`} aria-label="Action" value={r.action} onChange={e => set({ action: e.target.value, target: '' })}>
          {ACTIONS.map(a => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <div className="grid gap-2 sm:grid-cols-2">
          {needsUser && (
            <select className={sel} aria-label="User" value={r.assignee_id ?? ''} onChange={e => set({ assignee_id: Number(e.target.value) || null })}>
              <option value="">{r.action === 'Notify user' ? 'Who to notify…' : 'Assign task to… (optional)'}</option>
              {(users ?? []).map(u => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          )}
          {r.action === 'Post to Inside group' && (
            <select className={sel} aria-label="Inside group" value={r.target ?? ''} onChange={e => set({ target: e.target.value })}>
              <option value="">Which group…</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          )}
          {['Queue e-mail to address', 'Send WhatsApp to number', 'Set field value', 'Ask an AI employee to review'].includes(r.action ?? '') && (
            <input
              className="input"
              aria-label="Target"
              value={r.target ?? ''}
              onChange={e => set({ target: e.target.value })}
              placeholder={
                r.action === 'Queue e-mail to address'
                  ? 'name@example.com'
                  : r.action === 'Send WhatsApp to number'
                    ? '+971…'
                    : r.action === 'Set field value'
                      ? 'field=value'
                      : 'AI employee name, e.g. Jarvis'
              }
            />
          )}
          {r.action === 'Create follow-up task' && (
            <label className="flex items-center gap-2 text-[13px]">
              <span className="text-muted">Due in</span>
              <input className="input" style={{ width: 80 }} type="number" min={0} value={r.due_days ?? 1} onChange={e => set({ due_days: Number(e.target.value) })} />
              <span className="text-muted">days</span>
            </label>
          )}
        </div>
        <label className="mt-3 block">
          <span className="label">Title / subject — use {'{field_name}'} for values, e.g. {'{_title}'}</span>
          <input className="input" value={r.message ?? ''} onChange={e => set({ message: e.target.value })} />
        </label>
        <label className="mt-2 block">
          <span className="label">Message (optional)</span>
          <textarea className="textarea" value={r.body ?? ''} onChange={e => set({ body: e.target.value })} />
        </label>
        <label className="mt-2 flex items-center gap-2 text-[13px]">
          <span className="text-muted">Wait</span>
          <input className="input" style={{ width: 90 }} type="number" min={0} max={10080} value={r.delay_minutes ?? 0} onChange={e => set({ delay_minutes: Number(e.target.value) })} />
          <span className="text-muted">minutes before running</span>
        </label>
      </div>
    </Modal>
  )
}
