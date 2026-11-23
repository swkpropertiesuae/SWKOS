import { useMemo,useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery,useQueryClient } from '@tanstack/react-query'
import { ArrowRight,CheckCircle2,Clock,Pencil,Plus,Trash2,Workflow,XCircle,Zap } from 'lucide-react'
import { optValue } from '@shared/types'
import { get,post,put,del } from '../../lib/api'
import { useMeta } from '../../lib/meta'
import { useToast } from '../../lib/toast'
import { Modal,useDialogs } from '../../ui/kit'

type Rule = { id: number; version: number; name: string; entity: string; trigger: string; field?: string; operator?: string; value?: string; action: string; assignee_id?: number | null; target?: string; message?: string; body?: string; due_days?: number; delay_minutes?: number; active: boolean; _labels?: Record<string, string> }
type Run = { id: number; label: string; status: string; error?: string; created_at: string; attempts: number }

const TRIGGERS = ['Record created', 'Record updated', 'Status / stage changed to']
const OPS = ['equals', 'not equals', 'contains', 'greater than', 'less than', 'is empty', 'is not empty']
const ACTIONS = ['Create follow-up task', 'Notify user', 'Post to Inside group', 'Queue e-mail to customer contact', 'Queue e-mail to address', 'Send WhatsApp to customer contact', 'Send WhatsApp to number', 'Ask an AI employee to review', 'Set field value']
const EXCLUDED = new Set(['automation_rules', 'workflow_runs', 'workflow_attempts', 'tasks', 'email_outbox', 'ai_actions', 'users', 'roles', 'api_keys'])

/** Ready-made recipes for an SWK brokerage. Picking one opens the builder prefilled; people, groups and addresses are chosen there. */
const TEMPLATES: { title: string; blurb: string; rule: Partial<Rule> }[] = [
  { title: 'New lead → follow-up call task', blurb: 'Every new enquiry gets a call task due tomorrow.', rule: { name: 'Call every new lead', entity: 'leads', trigger: 'Record created', action: 'Create follow-up task', message: 'Call new lead {_title}', due_days: 1 } },
  { title: 'Lead qualified → tell the sales group', blurb: 'Post to an Inside group when a lead becomes Qualified.', rule: { name: 'Qualified lead alert', entity: 'leads', trigger: 'Status / stage changed to', field: 'status', value: 'Qualified', action: 'Post to Inside group', message: 'Qualified lead: {_title}' } },
  { title: 'Leave request → notify HR', blurb: 'HR is alerted the moment someone applies for leave.', rule: { name: 'New leave request', entity: 'leave_requests', trigger: 'Record created', action: 'Notify user', message: 'Leave request: {_title}' } },
  { title: 'Invoice paid → celebrate in the team group', blurb: 'Share paid invoices with the team in Inside.', rule: { name: 'Invoice paid', entity: 'invoices', trigger: 'Status / stage changed to', field: 'status', value: 'Paid', action: 'Post to Inside group', message: 'Invoice paid: {_title}' } },
  { title: 'Support ticket → owner task', blurb: 'Open tickets get a task so nothing is missed.', rule: { name: 'Ticket follow-up', entity: 'tickets', trigger: 'Record created', action: 'Create follow-up task', message: 'Handle ticket {_title}', due_days: 1 } },
  { title: 'Lead converted → AI review', blurb: 'Ask an AI employee to check the converted lead file.', rule: { name: 'Converted lead review', entity: 'leads', trigger: 'Status / stage changed to', field: 'status', value: 'Converted', action: 'Ask an AI employee to review', target: 'Jarvis', message: 'Review converted lead {_title}' } },
]

export default function AutomationsPage() {
  const { meta, can, def } = useMeta()
  const qc = useQueryClient(), toast = useToast(), dlg = useDialogs()
  const rulesQ = useQuery({ queryKey: ['list', 'automation_rules', 'page'], queryFn: () => get<{ rows: Rule[] }>('/api/e/automation_rules', { pageSize: 500, sort: 'id', dir: 'desc' }) })
  const runsQ = useQuery({ queryKey: ['list', 'workflow_runs', 'page'], queryFn: () => get<{ rows: Run[] }>('/api/e/workflow_runs', { pageSize: 15, sort: 'id', dir: 'desc' }), refetchInterval: 20000 })
  const [editing, setEditing] = useState<Partial<Rule> | null>(null)
  const entities = useMemo(() => (meta?.entities ?? []).filter(e => !EXCLUDED.has(e.key) && !e.readonlyApi && !e.child && can(e.module, 'view')).sort((a, b) => a.plural.localeCompare(b.plural)), [meta, can])
  const label = (key: string) => entities.find(e => e.key === key)?.plural ?? key
  const canEdit = can('admin', 'create')
  const toggle = async (r: Rule) => { try { await put(`/api/e/automation_rules/${r.id}`, { active: !r.active, version: r.version }); void qc.invalidateQueries({ queryKey: ['list', 'automation_rules'] }) } catch (e: any) { toast.error(e.message) } }
  const remove = async (r: Rule) => { if (!(await dlg.confirm({ title: `Delete "${r.name}"?`, danger: true, ok: 'Delete' }))) return; try { await del(`/api/e/automation_rules/${r.id}`); void qc.invalidateQueries({ queryKey: ['list', 'automation_rules'] }) } catch (e: any) { toast.error(e.message) } }
  const fieldLabel = (entity: string, f?: string) => (f ? def(entity)?.fields.find(x => x.name === f)?.label ?? f : '')
  const rules = rulesQ.data?.rows ?? []

  return (
    <div className="mx-auto max-w-[1260px]">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div><div className="web-eyebrow">Work · No-code automations</div><h1 className="web-title">Automations</h1><p className="web-lead">When something happens in SWK OS, do something else automatically: create a task, alert a colleague, post in an Inside group, e-mail or WhatsApp a client, or hand it to an AI employee.</p></div>
        {canEdit && <button className="web-btn" onClick={() => setEditing({ trigger: 'Record created', action: 'Create follow-up task', operator: 'equals', due_days: 1, delay_minutes: 0, active: true })}><Plus size={14} /> New automation</button>}
      </header>

      {canEdit && (
        <section className="mb-10">
          <div className="web-eyebrow mb-3">Start from a recipe</div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TEMPLATES.filter(t => entities.some(e => e.key === t.rule.entity)).map(t => (
              <button key={t.title} type="button" className="web-card hoverable flex flex-col gap-2 border-0 p-5 text-left" onClick={() => setEditing({ operator: 'equals', delay_minutes: 0, due_days: 1, active: true, ...t.rule })}>
                <span className="flex size-10 items-center justify-center rounded-full bg-[#121212] text-[#51fec0]"><Zap size={17} /></span>
                <b className="text-[15px] font-medium text-[#121212]">{t.title}</b><span className="text-[13px] text-[#737373]">{t.blurb}</span>
              </button>))}
          </div>
        </section>
      )}

      <section className="mb-10">
        <div className="web-eyebrow mb-3">Your automations · {rules.length}</div>
        {!rules.length && !rulesQ.isLoading && <div className="web-card p-10 text-center text-[#737373]">No automations yet. Pick a recipe above to start.</div>}
        <div className="flex flex-col gap-3">
          {rules.map(r => (
            <div key={r.id} className={`web-card flex flex-wrap items-center gap-4 p-5 ${r.active ? '' : 'opacity-60'}`}>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#121212] text-[#51fec0]"><Workflow size={18} /></span>
              <div className="min-w-0 flex-1">
                <b className="block text-[15px] font-medium text-[#121212]">{r.name}</b>
                <p className="m-0 mt-1 text-[13.5px] leading-relaxed text-[#4a4a4a]">
                  When <b className="font-medium text-[#121212]">{label(r.entity)}</b> {r.trigger === 'Record created' ? 'is created' : r.trigger === 'Record updated' ? 'is updated' : <>has <b className="font-medium text-[#121212]">{fieldLabel(r.entity, r.field)}</b> changed to <b className="font-medium text-[#121212]">{r.value}</b></>}
                  {r.trigger !== 'Status / stage changed to' && r.field ? <>, if <b className="font-medium text-[#121212]">{fieldLabel(r.entity, r.field)}</b> {r.operator} {r.value && <b className="font-medium text-[#121212]">{r.value}</b>}</> : null}
                  <ArrowRight size={13} className="mx-1.5 inline text-[#0e9f6e]" />{r.action.toLowerCase()}{r._labels?.assignee_id ? <> · <b className="font-medium text-[#121212]">{r._labels.assignee_id}</b></> : null}{r.delay_minutes ? ` after ${r.delay_minutes} min` : ''}
                </p>
              </div>
              {canEdit && <>
                <label className="flex items-center gap-2 text-[12.5px] text-[#4a4a4a]"><input type="checkbox" className="size-4 accent-[#0e9f6e]" checked={r.active} onChange={() => void toggle(r)} />{r.active ? 'On' : 'Off'}</label>
                <button className="btn outline icon sm" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}><Pencil /></button>
                <button className="btn outline icon sm" aria-label={`Delete ${r.name}`} onClick={() => void remove(r)}><Trash2 /></button>
              </>}
            </div>))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center"><div className="web-eyebrow flex-1">Recent runs</div><Link to="/e/workflow_runs" className="link text-[13px]">All runs</Link></div>
        <div className="web-card divide-y divide-[#e5e5e5]">
          {(runsQ.data?.rows ?? []).map(r => (
            <Link key={r.id} to={`/e/workflow_runs/${r.id}`} className="flex items-center gap-3 px-5 py-3 no-underline hover:bg-[#f8f8f8]">
              {r.status === 'Succeeded' ? <CheckCircle2 size={17} className="text-[#0e9f6e]" /> : r.status === 'Queued' || r.status === 'Running' ? <Clock size={17} className="text-[#b45309]" /> : <XCircle size={17} className="text-[#dc2626]" />}
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-[#121212]">{r.label}</span>
              {r.error && <span className="hidden max-w-[40%] truncate text-[12px] text-[#dc2626] md:inline">{r.error}</span>}
              <span className="web-pill">{r.status}</span>
            </Link>))}
          {!runsQ.data?.rows.length && <div className="p-6 text-center text-[13px] text-[#737373]">Runs appear here when an automation fires.</div>}
        </div>
      </section>

      {editing && <RuleBuilder initial={editing} entities={entities} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void qc.invalidateQueries({ queryKey: ['list', 'automation_rules'] }) }} />}
    </div>
  )
}

/** Sentence-style builder: When <record> <trigger> [if <field> <op> <value>] then <action> <who/where>. Saves an automation_rules record; the server validates it. */
function RuleBuilder({ initial, entities, onClose, onSaved }: { initial: Partial<Rule>; entities: { key: string; plural: string }[]; onClose: () => void; onSaved: () => void }) {
  const { def } = useMeta(), toast = useToast()
  const [r, setR] = useState<Partial<Rule>>(initial)
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<Rule>) => setR(x => ({ ...x, ...p }))
  const ent = r.entity ? def(r.entity) : null
  const fields = (ent?.fields ?? []).filter(f => !f.secret && !f.virtual && f.type !== 'json')
  const field = fields.find(f => f.name === r.field)
  const users = useQuery({ queryKey: ['users-lookup'], queryFn: () => get<{ id: number; label: string }[]>('/api/e/users/lookup', { limit: 100 }) }).data?.map(u => ({ id: u.id, name: u.label }))
  const groups = useQuery({ queryKey: ['chat-threads'], queryFn: () => get<{ id: number; kind: string; title: string }[]>('/api/chat/threads') }).data?.filter(t => t.kind === 'group') ?? []
  const save = async () => {
    setBusy(true)
    const body = { ...r, field: r.field || null, value: r.value ?? null, assignee_id: r.assignee_id || null }
    delete (body as any)._labels
    try { r.id ? await put(`/api/e/automation_rules/${r.id}`, body) : await post('/api/e/automation_rules', body); toast.ok('Automation saved'); onSaved() } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }
  const needsUser = r.action === 'Create follow-up task' || r.action === 'Notify user'
  const sel = 'select'; const box = 'rounded-2xl border border-[#e5e5e5] bg-[#f7f7f7] p-4'
  return (
    <Modal open onClose={onClose} title={r.id ? 'Edit automation' : 'New automation'} width={680}
      footer={<><div className="flex-1" /><button className="btn outline" onClick={onClose}>Cancel</button><button className="web-btn" disabled={busy || !r.name || !r.entity || !r.trigger || !r.action} onClick={() => void save()}>Save automation</button></>}>
      <label className="mb-4 block"><span className="label">Name</span><input className="input" value={r.name ?? ''} onChange={e => set({ name: e.target.value })} placeholder="e.g. Call every new lead" /></label>
      <div className={box}>
        <div className="web-eyebrow mb-2">When</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <select className={sel} aria-label="Record type" value={r.entity ?? ''} onChange={e => set({ entity: e.target.value, field: '', value: '' })}><option value="">Choose a record type…</option>{entities.map(e => <option key={e.key} value={e.key}>{e.plural}</option>)}</select>
          <select className={sel} aria-label="Trigger" value={r.trigger} onChange={e => set({ trigger: e.target.value })}>{TRIGGERS.map(t => <option key={t} value={t}>{t === 'Record created' ? 'is created' : t === 'Record updated' ? 'is updated' : 'field changes to…'}</option>)}</select>
        </div>
        {r.entity && (
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <select className={sel} aria-label="Condition field" value={r.field ?? ''} onChange={e => set({ field: e.target.value, value: '' })}><option value="">{r.trigger === 'Status / stage changed to' ? 'Field…' : 'Any record (no condition)'}</option>{fields.map(f => <option key={f.name} value={f.name}>{f.label}</option>)}</select>
            {r.trigger !== 'Status / stage changed to' && <select className={sel} aria-label="Operator" value={r.operator ?? 'equals'} onChange={e => set({ operator: e.target.value })} disabled={!r.field}>{OPS.map(o => <option key={o}>{o}</option>)}</select>}
            {field?.type === 'select' ? <select className={sel} aria-label="Value" value={r.value ?? ''} onChange={e => set({ value: e.target.value })}><option value="">Value…</option>{(field.options ?? []).map(o => <option key={optValue(o)}>{optValue(o)}</option>)}</select>
              : <input className="input" aria-label="Value" placeholder="Value" value={r.value ?? ''} onChange={e => set({ value: e.target.value })} disabled={!r.field} />}
          </div>)}
      </div>
      <div className="my-2 flex justify-center text-[#0e9f6e]"><ArrowRight className="rotate-90" size={18} /></div>
      <div className={box}>
        <div className="web-eyebrow mb-2">Then</div>
        <select className={`${sel} mb-2`} aria-label="Action" value={r.action} onChange={e => set({ action: e.target.value, target: '' })}>{ACTIONS.map(a => <option key={a}>{a}</option>)}</select>
        <div className="grid gap-2 sm:grid-cols-2">
          {needsUser && <select className={sel} aria-label="User" value={r.assignee_id ?? ''} onChange={e => set({ assignee_id: Number(e.target.value) || null })}><option value="">{r.action === 'Notify user' ? 'Who to notify…' : 'Assign task to… (optional)'}</option>{(users ?? []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
          {r.action === 'Post to Inside group' && <select className={sel} aria-label="Inside group" value={r.target ?? ''} onChange={e => set({ target: e.target.value })}><option value="">Which group…</option>{groups.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select>}
          {['Queue e-mail to address', 'Send WhatsApp to number', 'Set field value', 'Ask an AI employee to review'].includes(r.action ?? '') && <input className="input" aria-label="Target" value={r.target ?? ''} onChange={e => set({ target: e.target.value })} placeholder={r.action === 'Queue e-mail to address' ? 'name@example.com' : r.action === 'Send WhatsApp to number' ? '+971…' : r.action === 'Set field value' ? 'field=value' : 'AI employee name, e.g. Jarvis'} />}
          {r.action === 'Create follow-up task' && <label className="flex items-center gap-2 text-[13px]"><span className="text-[#737373]">Due in</span><input className="input" style={{ width: 80 }} type="number" min={0} value={r.due_days ?? 1} onChange={e => set({ due_days: Number(e.target.value) })} /><span className="text-[#737373]">days</span></label>}
        </div>
        <label className="mt-3 block"><span className="label">Title / subject — use {'{field_name}'} for values, e.g. {'{_title}'}</span><input className="input" value={r.message ?? ''} onChange={e => set({ message: e.target.value })} /></label>
        <label className="mt-2 block"><span className="label">Message (optional)</span><textarea className="textarea" value={r.body ?? ''} onChange={e => set({ body: e.target.value })} /></label>
        <label className="mt-2 flex items-center gap-2 text-[13px]"><span className="text-[#737373]">Wait</span><input className="input" style={{ width: 90 }} type="number" min={0} max={10080} value={r.delay_minutes ?? 0} onChange={e => set({ delay_minutes: Number(e.target.value) })} /><span className="text-[#737373]">minutes before running</span></label>
      </div>
    </Modal>
  )
}
