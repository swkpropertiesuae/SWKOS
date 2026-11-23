import { AccountCarousel } from './ui/account-card'
import { useMemo,useState,useEffect,type ReactNode } from 'react'
import { useNavigate,useSearchParams,Link } from 'react-router-dom'
import { useQuery,useQueryClient } from '@tanstack/react-query'
import { Plus,Search,Download,Upload,Filter,RefreshCw,Trash2,ArrowUp,ArrowDown,Columns3,Table2,X,CalendarDays,ChevronLeft,ChevronRight,Bookmark,Check,Share2,ScanText } from 'lucide-react'
import { SmartImport } from './SmartImport'
import { ShareWithClient,SHAREABLE_ENTITIES } from './ShareWithClient'
import type { FieldDef } from '@shared/types'
import { optValue } from '@shared/types'
import { canViewEmployeeRecords } from '@shared/swk-staff-access'
import { useMeta,type MetaEntity } from '../lib/meta'
import { buildApiPath, del, get, post, put, downloadAuthFile } from '../lib/api'
import { CellValue } from './Fields'
import { EntityFormModal } from './EntityForm'
import { Badge,Empty,ErrorBox,Modal,PageHeader,Pagination,useDialogs,Loading } from '../ui/kit'
import { iconByName } from '../lib/icons'
import { useToast } from '../lib/toast'
import { cls,fmtMoney } from '../lib/format'

export const recordPath = (entity: string, id: number) => (entity === 'jobs' ? `/jobs/${id}` : `/e/${entity}/${id}`)

interface Flt { field: string; op: string; value: string }
const OPS: Record<string, [string, string][]> = {
  text: [['contains', 'contains'], ['eq', 'equals'], ['starts', 'starts with'], ['ends', 'ends with'], ['null', 'is empty'], ['notnull', 'is not empty']],
  num: [['eq', '='], ['gt', '>'], ['gte', '≥'], ['lt', '<'], ['lte', '≤'], ['between', 'between (a..b)']],
  date: [['eq', 'on'], ['gte', 'on or after'], ['lte', 'on or before'], ['between', 'between (a..b)'], ['null', 'is empty']],
  select: [['eq', 'is'], ['ne', 'is not'], ['null', 'is empty']],
  bool: [['eq', 'is']],
  ref: [['contains', 'name contains'], ['null', 'is empty'], ['notnull', 'is set']],
}
const opKind = (f: FieldDef) => (['int', 'number', 'money', 'percent'].includes(f.type) ? 'num' : f.type === 'date' || f.type === 'datetime' ? 'date' : f.type === 'select' ? 'select' : f.type === 'bool' ? 'bool' : f.type === 'ref' ? 'ref' : 'text')

export function listColumns(def: MetaEntity): FieldDef[] {
  const l = def.fields.filter(f => f.list && !f.secret)
  return (l.length ? l : def.fields.filter(f => !f.hidden && !f.secret && f.type !== 'json' && f.type !== 'textarea').slice(0, 6)).slice(0, 9)
}

export function EntityList({ entity, preset, embedded, title, hideNew, createPresets, bulkActions, headerExtra, onOpen, pageSizeDefault = 25 }: { entity: string; preset?: { field: string; op: string; value: any }[]; embedded?: boolean; title?: ReactNode; hideNew?: boolean; createPresets?: Record<string, any>; bulkActions?: { label: ReactNode; run: (ids: number[]) => void | Promise<void> }[]; headerExtra?: ReactNode; onOpen?: (rec: any) => void; pageSizeDefault?: number }) {
  const { def: getDef, can, me } = useMeta()
  const def = getDef(entity)
  const nav = useNavigate(), qc = useQueryClient(), toast = useToast(), dlg = useDialogs()
  const [sp, setSp] = useSearchParams()
  const [local, setLocal] = useState<Record<string, string>>({})
  const param = (k: string) => (embedded ? local[k] : sp.get(k)) ?? ''
  const setParam = (patch: Record<string, string | null>) => {
    if (embedded) setLocal(l => ({ ...l, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v ?? ''])) }))
    else setSp(p => { const n = new URLSearchParams(p); for (const [k, v] of Object.entries(patch)) { if (v === null || v === '') n.delete(k); else n.set(k, v) } return n }, { replace: true })
  }
  const page = Number(param('page')) || 1, size = Number(param('size')) || pageSizeDefault
  const sort = param('sort') || def.defaultSort?.field || 'id', dir = param('dir') || def.defaultSort?.dir || 'desc'
  const [search, setSearch] = useState(param('q'))
  const selectFields = def.fields.filter(f => f.type === 'select' && !f.hidden && !f.readonly && !f.computed && (f.options?.length ?? 0) > 0)
  const dateFields = def.fields.filter(f => (f.type === 'date' || f.type === 'datetime') && !f.secret && (!f.hidden || f.list))
  const remembered = (() => { try { return JSON.parse(localStorage.getItem(`swk.view.${entity}`) || '{}') } catch { return {} } })()
  const viewParam = (param('view') || remembered.view || 'list') as 'list' | 'kanban' | 'calendar'
  const view = viewParam === 'kanban' && !selectFields.length ? 'list' : viewParam === 'calendar' && !dateFields.length ? 'list' : viewParam
  const groupField = selectFields.find(f => f.name === (param('group') || remembered.group)) ?? selectFields.find(f => f.name === def.kanban?.field) ?? selectFields.find(f => f.name === def.statusField) ?? selectFields[0]
  const dateField = dateFields.find(f => f.name === (param('date') || remembered.date)) ?? dateFields.find(f => f.name === def.calendar?.field) ?? dateFields[0]
  const month = /^\d{4}-\d{2}$/.test(param('month')) ? param('month') : new Date().toISOString().slice(0, 7)
  const setView = (v: typeof view, extra: Record<string, string | null> = {}) => {
    try { localStorage.setItem(`swk.view.${entity}`, JSON.stringify({ view: v, group: extra.group ?? groupField?.name, date: extra.date ?? dateField?.name })) } catch { /* private mode */ }
    setParam({ view: v === 'list' ? null : v, page: null, ...extra })
  }
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [newPresets, setNewPresets] = useState<Record<string, any> | null>(null)
  const [sharing, setSharing] = useState<number[] | null>(null)
  const [smart, setSmart] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [showFilters, setShowFilters] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const filters: Flt[] = useMemo(() => { try { return param('filters') ? JSON.parse(param('filters')) : [] } catch { return [] } }, [param('filters')])
  const status = param('status')
  useEffect(() => { const t = setTimeout(() => { if (search !== param('q')) setParam({ q: search, page: null }) }, 280); return () => clearTimeout(t) }, [search])

  const allFilters = [...(preset ?? []), ...filters.filter(f => f.field && (f.value !== '' || ['null', 'notnull'].includes(f.op))), ...(status && def.statusField ? [{ field: def.statusField, op: 'eq', value: status }] : [])]
  const monthEnd = (() => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10) })()
  // calendar loads the visible month plus a week either side for the leading/trailing grid days
  const calFilters = view === 'calendar' && dateField ? [{ field: dateField.name, op: 'gte', value: addDaysIso(`${month}-01`, -7) }, { field: dateField.name, op: 'lte', value: addDaysIso(monthEnd, 7) + (dateField.type === 'datetime' ? 'T23:59:59' : '') }] : []
  const viewFilters = [...allFilters, ...calFilters]
  const params = { q: param('q'), page: view === 'list' ? page : 1, pageSize: view === 'list' ? size : 500, sort, dir, filters: viewFilters.length ? JSON.stringify(viewFilters) : undefined }
  const query = useQuery({ queryKey: ['list', entity, params], queryFn: () => get<{ rows: any[]; total: number }>(`/api/e/${entity}`, params), placeholderData: p => p })
  const cols = listColumns(def)
  const Icon = iconByName(def.icon)
  const canDelete = can(def.module, 'delete') && !def.noDelete && !def.readonlyApi
  const deleteOne = async (r: any) => {
    if (!await dlg.confirm({ title: `Delete ${def.label.toLowerCase()}?`, message: `${r._title ?? r[def.title[0]] ?? r.id}. Linked records must be removed or reassigned first.`, danger: true, ok: 'Delete' })) return
    try { await del(`/api/e/${entity}/${r.id}`); setSelected(s => { const n = new Set(s); n.delete(r.id); return n }); await qc.invalidateQueries(); toast.ok('Deleted') } catch (e: any) { toast.error(e.message) }
  }
  const canCreate = can(def.module, 'create') && !def.readonlyApi && !hideNew
  const statusOpts = def.statusField ? (def.fields.find(f => f.name === def.statusField)?.options ?? []).map(optValue) : []
  const rows = query.data?.rows ?? []
  const refresh = () => qc.invalidateQueries({ queryKey: ['list', entity] })
  const lockedRows = entity === 'employees' && !canViewEmployeeRecords(me && { email: me.email, role: me.role, party_id: me.party_id })
  const open = (r: any) => (lockedRows ? undefined : onOpen ? onOpen(r) : nav(recordPath(entity, r.id)))
  const allSel = rows.length > 0 && rows.every(r => selected.has(r.id))

  const runBulk = async (kind: 'delete' | 'status', value?: string) => {
    const ids = [...selected]
    if (kind === 'delete' && !(await dlg.confirm({ title: `Delete ${ids.length} ${ids.length === 1 ? def.label : def.plural}?`, message: 'This cannot be undone. Records that are in use will be skipped.', danger: true, ok: 'Delete' }))) return
    try {
      const r = await post<{ ok: number; failed: { id: number; error: string }[] }>(`/api/e/${entity}/bulk`, kind === 'delete' ? { ids, action: 'delete' } : { ids, action: 'set', field: def.statusField, value })
      if (r.failed.length) toast.error(`${r.ok} done, ${r.failed.length} skipped: ${r.failed[0].error}`); else toast.ok(`${r.ok} updated`)
      setSelected(new Set()); refresh()
    } catch (e: any) { toast.error(e.message) }
  }

  const SortIcon = ({ f }: { f: FieldDef }) => (sort === f.name ? (dir === 'asc' ? <ArrowUp size={12} className="inline ml-1" /> : <ArrowDown size={12} className="inline ml-1" />) : null)

  const content = (
    <div className={cls(!embedded && 'fade-in')}>
      {!embedded && (
        <PageHeader icon={<Icon size={20} />} title={title ?? def.plural} subtitle={def.description ?? `${(query.data?.total ?? 0).toLocaleString()} records`} actions={<>
          {headerExtra}
          {can(def.module, 'export') && <button type="button" className="btn outline" onClick={() => void downloadAuthFile(buildApiPath(`/api/e/${entity}/export.csv`, { q: param('q'), filters: allFilters.length ? JSON.stringify(allFilters) : undefined, sort, dir }), `${entity}.csv`).catch(e => toast.error(e.message))}><Download /> Export</button>}
          {canCreate && !def.children?.length && <button className="btn outline" onClick={() => setShowImport(true)}><Upload /> Import</button>}
          {canCreate && !def.children?.length && <button className="btn outline" onClick={() => setSmart(true)}><ScanText /> Smart import (OCR)</button>}
          {canCreate && <button className="btn green" onClick={() => setEditing('new')}><Plus /> New {def.label}</button>}
        </>} />
      )}
      {entity === 'bank_accounts' && !embedded && !query.error && <AccountCarousel def={def} rows={rows} />}
      <div className="entity-surface card overflow-hidden">
        <div className="flex items-center gap-2 p-3 flex-wrap border-b border-line">
          <div className="relative flex-1 min-w-[200px] max-w-[420px]"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input pl-9" placeholder={`Search ${def.plural.toLowerCase()}…`} value={search} onChange={e => setSearch(e.target.value)} aria-label="Search" /></div>
          {statusOpts.length > 0 && <select className="select" style={{ width: 170 }} value={status} onChange={e => setParam({ status: e.target.value, page: null })} aria-label="Status filter"><option value="">All statuses</option>{statusOpts.map(o => <option key={o}>{o}</option>)}</select>}
          <button className={cls('btn outline', filters.length > 0 && 'ring-2 ring-emerald/40')} onClick={() => setShowFilters(s => !s)}><Filter /> Filters{filters.length ? ` (${filters.length})` : ''}</button>
          {(selectFields.length > 0 || dateFields.length > 0) && <div className="flex gap-1" role="tablist" aria-label="View">
            <button role="tab" aria-selected={view === 'list'} className={cls('btn sm', view === 'list' ? 'dark' : 'outline')} onClick={() => setView('list')}><Table2 /> Table</button>
            {selectFields.length > 0 && <button role="tab" aria-selected={view === 'kanban'} className={cls('btn sm', view === 'kanban' ? 'dark' : 'outline')} onClick={() => setView('kanban')}><Columns3 /> Board</button>}
            {dateFields.length > 0 && <button role="tab" aria-selected={view === 'calendar'} className={cls('btn sm', view === 'calendar' ? 'dark' : 'outline')} onClick={() => setView('calendar')}><CalendarDays /> Calendar</button>}
          </div>}
          {view === 'kanban' && selectFields.length > 1 && <select className="select" style={{ width: 180 }} aria-label="Group board by" value={groupField?.name} onChange={e => setView('kanban', { group: e.target.value })}>{selectFields.map(f => <option key={f.name} value={f.name}>Group by {f.label}</option>)}</select>}
          {view === 'calendar' && dateFields.length > 1 && <select className="select" style={{ width: 180 }} aria-label="Calendar date field" value={dateField?.name} onChange={e => setView('calendar', { date: e.target.value })}>{dateFields.map(f => <option key={f.name} value={f.name}>By {f.label}</option>)}</select>}
          {!embedded && me && <SavedViews storageKey={`swk.saved.${me.id}.${entity}`} current={{ view, group: groupField?.name ?? '', date: dateField?.name ?? '', filters: param('filters'), status, q: param('q'), sort: param('sort'), dir: param('dir') }} onApply={v => { setSearch(v.q ?? ''); setParam({ view: v.view === 'list' ? null : v.view, group: v.group || null, date: v.date || null, filters: v.filters || null, status: v.status || null, q: v.q || null, sort: v.sort || null, dir: v.dir || null, page: null }) }} />}
          <div className="flex-1" />
          <button className="btn ghost icon" onClick={refresh} aria-label="Refresh"><RefreshCw className={query.isFetching ? 'animate-spin' : ''} /></button>
          {embedded && canCreate && <button className="btn green sm" onClick={() => setEditing('new')}><Plus /> New</button>}
        </div>
        {showFilters && <FilterBuilder def={def} value={filters} onApply={f => { setParam({ filters: f.length ? JSON.stringify(f) : null, page: null }); setShowFilters(false) }} />}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-mint text-fold text-sm font-semibold flex-wrap"><span>{selected.size} selected</span>
            {bulkActions?.map((b, i) => <button key={i} className="btn sm dark" onClick={() => void b.run([...selected])}>{b.label}</button>)}
            {SHAREABLE_ENTITIES.has(entity) && <button className="btn sm dark" onClick={() => setSharing([...selected])}><Share2 size={14} /> Share with client</button>}
            {statusOpts.length > 0 && can(def.module, 'edit') && <select className="select" style={{ width: 170, minHeight: 30 }} value="" onChange={e => { if (e.target.value) void runBulk('status', e.target.value) }}><option value="">Set {def.statusField?.replace(/_/g, ' ')}…</option>{statusOpts.map(o => <option key={o}>{o}</option>)}</select>}
            {canDelete && <button className="btn sm red" onClick={() => void runBulk('delete')}><Trash2 /> Delete</button>}
            <button className="btn sm ghost" onClick={() => setSelected(new Set())}><X /> Clear</button></div>)}
        {view !== 'list' && query.data && query.data.total > rows.length && <div className="px-3 pt-2 text-xs text-muted">Showing the first {rows.length} of {query.data.total.toLocaleString()}. Search or filter to narrow it down.</div>}
        {query.error ? <ErrorBox error={query.error} onRetry={() => void query.refetch()} /> : !query.data ? <Loading /> : view === 'kanban' && groupField ? (
          <Kanban def={def} field={groupField} rows={rows} onOpen={open} onMoved={refresh} onAdd={canCreate ? v => { setNewPresets({ [groupField.name]: v }); setEditing('new') } : undefined} />
        ) : view === 'calendar' && dateField ? (
          <CalendarView def={def} field={dateField} month={month} rows={rows} onMonth={m => setParam({ month: m })} onOpen={open} onMoved={refresh} onAdd={canCreate ? d => { setNewPresets({ [dateField.name]: dateField.type === 'datetime' ? `${d}T09:00` : d }); setEditing('new') } : undefined} />
        ) : rows.length === 0 ? (
          <Empty title={param('q') || filters.length || status ? 'Nothing matches your search' : `No ${def.plural.toLowerCase()} yet`} hint={param('q') || filters.length ? 'Try clearing the filters or searching for something else.' : def.description} action={canCreate && !param('q') ? <button className="btn green" onClick={() => setEditing('new')}><Plus /> Create the first {def.label.toLowerCase()}</button> : undefined} />
        ) : (
          <div className="table-wrap" style={{ maxHeight: embedded ? 480 : undefined }}>
            <table className="grid">
              <thead><tr>
                <th style={{ width: 34 }}><input type="checkbox" aria-label="Select all" checked={allSel} onChange={e => setSelected(e.target.checked ? new Set(rows.map(r => r.id)) : new Set())} /></th>
                {cols.map(f => <th key={f.name} className={cls('sortable', ['money', 'number', 'int', 'percent'].includes(f.type) && 'num')} onClick={() => setParam({ sort: f.name, dir: sort === f.name && dir === 'asc' ? 'desc' : 'asc', page: null })} aria-sort={sort === f.name ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>{f.label}<SortIcon f={f} /></th>)}
                {canDelete && <th>Actions</th>}
              </tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className={lockedRows ? undefined : 'clickable'} onClick={() => open(r)}>
                    <td onClick={e => e.stopPropagation()}><input type="checkbox" aria-label="Select row" checked={selected.has(r.id)} onChange={e => setSelected(s => { const n = new Set(s); e.target.checked ? n.add(r.id) : n.delete(r.id); return n })} /></td>
                    {cols.map((f, i) => <td key={f.name} className={['money', 'number', 'int', 'percent'].includes(f.type) ? 'num' : ''}>{i === 0 ? <Link to={recordPath(entity, r.id)} className="link" onClick={e => e.stopPropagation()}><CellValue f={f} rec={r} statusField={def.statusField} /></Link> : canInline(f) && can(def.module, 'edit') && !def.readonlyApi ? <InlineCell entity={entity} f={f} rec={r} statusField={def.statusField} onSaved={refresh} /> : <CellValue f={f} rec={r} statusField={def.statusField} />}</td>)}
                    {canDelete && <td onClick={e => e.stopPropagation()}><button className="btn red sm" aria-label={`Delete ${def.label} ${r._title ?? r.id}`} onClick={() => void deleteOne(r)}><Trash2 size={14} /> Delete</button></td>}
                  </tr>))}
              </tbody>
              {cols.some(f => f.type === 'money') && rows.length > 1 && <tfoot><tr><td /> {cols.map((f, i) => <td key={f.name} className={f.type === 'money' ? 'num' : ''}>{f.type === 'money' ? fmtMoney(rows.reduce((s, r) => s + (Number(r[f.name]) || 0), 0)) : i === 0 ? 'Page total' : ''}</td>)}{canDelete && <td />}</tr></tfoot>}
            </table>
          </div>
        )}
        {view === 'list' && query.data && <Pagination page={page} pageSize={size} total={query.data.total} onPage={p => setParam({ page: String(p) })} onSize={s => setParam({ size: String(s), page: null })} />}
      </div>
      {editing !== null && <EntityFormModal entity={entity} id={editing === 'new' ? undefined : editing} presets={{ ...createPresets, ...newPresets }} onClose={() => { setEditing(null); setNewPresets(null) }} onSaved={r => { setEditing(null); const stay = !!newPresets; setNewPresets(null); refresh(); if (editing === 'new' && !embedded && !stay) nav(recordPath(entity, r.id)) }} />}
      {sharing && <ShareWithClient entity={entity} ids={sharing} label={`${sharing.length} ${sharing.length === 1 ? def.label : def.plural} selected for you`} onClose={() => setSharing(null)} />}
      {smart && <SmartImport def={def} onClose={() => setSmart(false)} onDone={refresh} />}
      {showImport && <ImportModal def={def} onClose={() => setShowImport(false)} onDone={() => { refresh(); }} />}
    </div>
  )
  return content
}

function FilterBuilder({ def, value, onApply }: { def: MetaEntity; value: Flt[]; onApply: (f: Flt[]) => void }) {
  const fields = def.fields.filter(f => !f.secret && !f.virtual && f.type !== 'json' && (!f.hidden || f.list))
  const [rows, setRows] = useState<Flt[]>(value.length ? value : [{ field: fields[0]?.name ?? '', op: 'contains', value: '' }])
  const upd = (i: number, p: Partial<Flt>) => setRows(r => r.map((x, k) => (k === i ? { ...x, ...p } : x)))
  return (
    <div className="p-3 bg-soft border-b border-line">
      {rows.map((r, i) => {
        const f = fields.find(x => x.name === r.field)
        const kind = f ? opKind(f) : 'text'
        const ops = OPS[kind]
        return (
          <div key={i} className="flex gap-2 mb-2 flex-wrap items-center">
            <select className="select" style={{ width: 200 }} value={r.field} onChange={e => { const nf = fields.find(x => x.name === e.target.value)!; upd(i, { field: nf.name, op: OPS[opKind(nf)][0][0], value: '' }) }}>{fields.map(x => <option key={x.name} value={x.name}>{x.label}</option>)}</select>
            <select className="select" style={{ width: 170 }} value={r.op} onChange={e => upd(i, { op: e.target.value })}>{ops.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            {!['null', 'notnull'].includes(r.op) && (kind === 'select' && f ? <select className="select" style={{ width: 200 }} value={r.value} onChange={e => upd(i, { value: e.target.value })}><option value="">Select…</option>{(f.options ?? []).map(o => <option key={optValue(o)}>{optValue(o)}</option>)}</select>
              : kind === 'bool' ? <select className="select" style={{ width: 120 }} value={r.value} onChange={e => upd(i, { value: e.target.value })}><option value="">Select…</option><option value="1">Yes</option><option value="0">No</option></select>
              : <input className="input" style={{ width: 240 }} type={kind === 'date' && r.op !== 'between' ? 'date' : kind === 'num' && r.op !== 'between' ? 'number' : 'text'} placeholder={r.op === 'between' ? 'from..to' : 'Value'} value={r.value} onChange={e => upd(i, { value: e.target.value })} />)}
            <button className="btn ghost icon sm" onClick={() => setRows(x => x.filter((_, k) => k !== i))} aria-label="Remove filter"><X /></button>
          </div>)
      })}
      <div className="flex gap-2"><button className="btn outline sm" onClick={() => setRows(r => [...r, { field: fields[0].name, op: 'contains', value: '' }])}><Plus /> Add condition</button><div className="flex-1" /><button className="btn ghost sm" onClick={() => onApply([])}>Clear</button><button className="btn green sm" onClick={() => onApply(rows)}>Apply</button></div>
    </div>
  )
}

function Kanban({ def, field, rows, onOpen, onMoved, onAdd }: { def: MetaEntity; field: FieldDef; rows: any[]; onOpen: (r: any) => void; onMoved: () => void; onAdd?: (value: string) => void }) {
  const toast = useToast()
  const [over, setOver] = useState<string | null>(null)
  const known = (field.options ?? []).map(optValue)
  const opts = [...known, ...(rows.some(r => !r[field.name] || !known.includes(r[field.name])) ? [''] : [])]
  const cols = listColumns(def).filter(f => f.name !== field.name).slice(1, 4)
  const money = def.fields.find(f => f.type === 'money' && f.list)
  const move = async (id: number, to: string) => {
    const r = rows.find(x => x.id === id); if (!r || r[field.name] === to || (!to && field.required)) return
    try { await put(`/api/e/${def.key}/${id}`, { [field.name]: to || null, version: r.version }); onMoved() } catch (e: any) { toast.error(e.message) }
  }
  return (
    <div className="flex gap-3 p-3 overflow-x-auto items-start" style={{ minHeight: 320 }}>
      {opts.map(o => {
        const list = rows.filter(r => (o === '' ? !r[field.name] || !known.includes(r[field.name]) : r[field.name] === o))
        return (
          <div key={o} className={cls('w-[270px] flex-none rounded-xl bg-soft border border-line', over === o && 'ring-2 ring-emerald')} onDragOver={e => { e.preventDefault(); setOver(o) }} onDragLeave={() => setOver(null)} onDrop={e => { e.preventDefault(); setOver(null); void move(Number(e.dataTransfer.getData('text/plain')), o) }}>
            <div className="flex items-center justify-between px-3 py-2">{o ? <Badge value={o} /> : <span className="text-xs font-bold text-muted">No {field.label.toLowerCase()}</span>}<span className="text-xs text-muted font-bold">{list.length}{money ? ` · ${fmtMoney(list.reduce((s, r) => s + (r[money.name] || 0), 0), 0)}` : ''}</span></div>
            <div className="p-2 flex flex-col gap-2">
              {list.map(r => (
                <div key={r.id} draggable onDragStart={e => e.dataTransfer.setData('text/plain', String(r.id))} onClick={() => onOpen(r)} className="bg-card border border-line rounded-lg p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow">
                  <div className="font-bold text-ink text-[13.5px] leading-snug">{r._title}</div>
                  {cols.map(f => <div key={f.name} className="text-xs text-muted mt-1 truncate"><span className="font-semibold">{f.label}: </span><CellValue f={f} rec={r} /></div>)}
                </div>))}
              {!list.length && <div className="text-xs text-muted text-center py-4">Drop here</div>}
              {onAdd && o && <button type="button" className="btn ghost sm w-full justify-start" onClick={() => onAdd(o)}><Plus size={14} /> Add {def.label.toLowerCase()}</button>}
            </div>
          </div>)
      })}
    </div>
  )
}

function ImportModal({ def, onClose, onDone }: { def: MetaEntity; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState(''); const [name, setName] = useState('')
  const [res, setRes] = useState<any>(null); const [busy, setBusy] = useState(false); const toast = useToast()
  const run = async (dryRun: boolean) => {
    setBusy(true)
    try { const r = await post<any>(`/api/e/${def.key}/import`, { csv: text, dryRun }); setRes(r); if (!dryRun && r.created) { toast.ok(`${r.created} ${def.plural.toLowerCase()} imported`); onDone() } } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={`Import ${def.plural} from CSV or Excel`} width={640} footer={<><button type="button" className="btn outline" onClick={() => void downloadAuthFile(`/api/e/${def.key}/template.csv`, `${def.key}-template.csv`).catch(e => toast.error(e.message))}><Download /> Template</button><div className="flex-1" /><button className="btn outline" onClick={onClose}>Close</button><button className="btn outline" disabled={!text || busy} onClick={() => void run(true)}>Validate only</button><button className="btn green" disabled={!text || busy} onClick={() => void run(false)}>Import</button></>}>
      <p className="text-sm text-muted mt-0">Use the template for column names. Reference columns (customer, property, agent…) accept the code or exact name. Up to 5,000 rows.</p>
      <input type="file" accept=".csv,text/csv,.xlsx" className="input" onChange={async e => { const f = e.target.files?.[0]; if (f) { setName(f.name); setText(/\.xlsx$/i.test(f.name) ? await xlsxToCsv(f) : await f.text()); setRes(null) } }} />
      {name && <div className="text-xs text-muted mt-1">{name} · {text.split('\n').length - 1} rows</div>}
      {res && <div className="mt-3 text-sm"><div className={res.failed ? 'text-[#8f1325] font-bold' : 'text-fold font-bold'}>{res.dryRun ? 'Validation: ' : 'Imported: '}{res.created} OK, {res.failed} failed</div>
        {res.errors.length > 0 && <ul className="mt-2 max-h-48 overflow-auto text-[13px] pl-4">{res.errors.map((e: any) => <li key={e.row}>Row {e.row}: {e.error}</li>)}</ul>}</div>}
    </Modal>
  )
}


/** Reads the first sheet of an .xlsx file and returns it as CSV text for the normal import path. */
async function xlsxToCsv(file: File): Promise<string> {
  const { readSheet } = await import('read-excel-file/browser')
  const cell = (v: unknown) => { const t = v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? ''); return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t }
  return (await readSheet(file)).map(r => r.map(cell).join(',')).join('\n')
}

const addDaysIso = (d: string, n: number) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }
const INLINE_TYPES = ['text', 'int', 'number', 'money', 'percent', 'date', 'select', 'bool', 'email', 'phone']
const canInline = (f: FieldDef) => INLINE_TYPES.includes(f.type) && !f.readonly && !f.computed && !f.virtual && !f.secret && !f.unique

/** Airtable-style cell: double-click (or Enter) to edit in place, Enter or leaving the cell saves, Escape cancels. Checkboxes toggle at once. */
function InlineCell({ entity, f, rec, statusField, onSaved }: { entity: string; f: FieldDef; rec: any; statusField?: string; onSaved: () => void }) {
  const toast = useToast()
  const [edit, setEdit] = useState(false), [val, setVal] = useState<any>(rec[f.name] ?? '')
  const save = async (v: any) => {
    setEdit(false)
    const next = v === '' ? null : ['int', 'number', 'money', 'percent'].includes(f.type) ? Number(v) : v
    if (next === (rec[f.name] ?? null)) return
    if (f.required && next === null) { toast.error(`${f.label} is required`); return }
    try { await put(`/api/e/${entity}/${rec.id}`, { [f.name]: next, version: rec.version }); onSaved() } catch (e: any) { toast.error(e.message) }
  }
  if (f.type === 'bool') return <input type="checkbox" aria-label={f.label} checked={!!rec[f.name]} onClick={e => e.stopPropagation()} onChange={e => void save(e.target.checked)} />
  if (!edit) return <span role="button" tabIndex={0} title="Double-click to edit" className="block min-h-[20px] rounded px-1 -mx-1 hover:bg-hover hover:outline hover:outline-1 hover:outline-line" onClick={e => e.stopPropagation()} onDoubleClick={() => { setVal(rec[f.name] ?? ''); setEdit(true) }} onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); setVal(rec[f.name] ?? ''); setEdit(true) } }}><CellValue f={f} rec={rec} statusField={statusField} /></span>
  const common = { autoFocus: true, 'aria-label': f.label, onClick: (e: any) => e.stopPropagation(), onKeyDown: (e: any) => { if (e.key === 'Escape') setEdit(false); if (e.key === 'Enter') void save(val) } }
  if (f.type === 'select') return <select className="select" style={{ minHeight: 30 }} {...common} value={val} onChange={e => void save(e.target.value)} onBlur={() => setEdit(false)}><option value="">—</option>{(f.options ?? []).map(o => <option key={optValue(o)}>{optValue(o)}</option>)}</select>
  return <input className="input" style={{ minHeight: 30 }} {...common} type={f.type === 'date' ? 'date' : ['int', 'number', 'money', 'percent'].includes(f.type) ? 'number' : 'text'} step="any" value={val} onChange={e => setVal(e.target.value)} onBlur={() => void save(val)} />
}

/** Month calendar for any date field: drag a card to another day to reschedule, + on a day to add a record on it. */
function CalendarView({ def, field, month, rows, onMonth, onOpen, onMoved, onAdd }: { def: MetaEntity; field: FieldDef; month: string; rows: any[]; onMonth: (m: string) => void; onOpen: (r: any) => void; onMoved: () => void; onAdd?: (day: string) => void }) {
  const toast = useToast()
  const [over, setOver] = useState<string | null>(null)
  const first = new Date(month + '-01T00:00:00Z')
  const start = addDaysIso(month + '-01', -((first.getUTCDay() + 6) % 7)) // weeks start Monday
  const days = Array.from({ length: 42 }, (_, i) => addDaysIso(start, i))
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(new Date())
  const dayOf = (r: any) => String(r[field.name] ?? '').slice(0, 10)
  const shift = (n: number) => { const d = new Date(first); d.setUTCMonth(d.getUTCMonth() + n); onMonth(d.toISOString().slice(0, 7)) }
  const move = async (id: number, day: string) => {
    const r = rows.find(x => x.id === id); if (!r || dayOf(r) === day) return
    const v = field.type === 'datetime' && r[field.name] ? day + String(r[field.name]).slice(10) : day
    try { await put(`/api/e/${def.key}/${id}`, { [field.name]: v, version: r.version }); onMoved() } catch (e: any) { toast.error(e.message) }
  }
  const statusOpts = def.statusField ? (def.fields.find(f => f.name === def.statusField)?.options ?? []).map(optValue) : []
  const tone = (r: any) => { const i = statusOpts.indexOf(r[def.statusField ?? '']); return ['#0f2a33', '#8a621c', '#8a621c', '#b45309', '#7c3aed', '#5b676e', '#a3263a'][i < 0 ? 0 : i % 7] }
  const unscheduled = rows.filter(r => !r[field.name]).length
  return (
    <div className="p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className="btn outline icon sm" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft /></button>
        <button className="btn outline sm" onClick={() => onMonth(today.slice(0, 7))}>Today</button>
        <button className="btn outline icon sm" aria-label="Next month" onClick={() => shift(1)}><ChevronRight /></button>
        <h3 className="m-0 ml-2 text-[17px]">{first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h3>
        <span className="text-xs text-muted">by {field.label.toLowerCase()}{unscheduled ? ` · ${unscheduled} without a date` : ''}</span>
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-line">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className="border-b border-line bg-soft px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">{d}</div>)}
        {days.map(d => {
          const list = rows.filter(r => dayOf(r) === d)
          const inMonth = d.startsWith(month)
          return (
            <div key={d} className={cls('group min-h-[112px] border-b border-r border-line p-1.5', !inMonth && 'bg-soft/60', over === d && 'ring-2 ring-inset ring-emerald')}
              onDragOver={e => { e.preventDefault(); setOver(d) }} onDragLeave={() => setOver(null)} onDrop={e => { e.preventDefault(); setOver(null); void move(Number(e.dataTransfer.getData('text/plain')), d) }}>
              <div className="mb-1 flex items-center">
                <span className={cls('flex size-6 items-center justify-center rounded-full text-[12px]', d === today ? 'bg-[#0f2a33] font-semibold text-[#d4a752]' : inMonth ? 'text-ink' : 'text-muted')}>{Number(d.slice(8))}</span>
                {onAdd && <button type="button" aria-label={`Add on ${d}`} className="ml-auto flex size-6 items-center justify-center rounded-full border-0 bg-transparent text-muted opacity-0 hover:bg-hover group-hover:opacity-100 focus-visible:opacity-100" onClick={() => onAdd(d)}><Plus size={13} /></button>}
              </div>
              <div className="flex flex-col gap-1">
                {list.slice(0, 4).map(r => (
                  <button key={r.id} type="button" draggable onDragStart={e => e.dataTransfer.setData('text/plain', String(r.id))} onClick={() => onOpen(r)} title={r._title}
                    className="flex w-full items-center gap-1.5 truncate rounded-md border-0 bg-card px-1.5 py-1 text-left text-[11.5px] text-ink shadow-[0_1px_2px_rgba(0,0,0,.08)] hover:shadow-md cursor-grab">
                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: tone(r) }} />{field.type === 'datetime' && r[field.name] ? <span className="text-muted">{String(r[field.name]).slice(11, 16)}</span> : null}<span className="truncate">{r._title}</span>
                  </button>))}
                {list.length > 4 && <span className="px-1 text-[11px] text-muted">+{list.length - 4} more</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

type SavedView = { name: string; view: string; group: string; date: string; filters: string; status: string; q: string; sort: string; dir: string }
/** Named views (layout, grouping, filters, search, sort) per person and record type, like Airtable views. shortcut: kept in this browser only, move to the server if views must follow people between devices. */
function SavedViews({ storageKey, current, onApply }: { storageKey: string; current: Omit<SavedView, 'name'>; onApply: (v: SavedView) => void }) {
  const dlg = useDialogs()
  const read = (): SavedView[] => { try { return JSON.parse(localStorage.getItem(storageKey) || '[]') } catch { return [] } }
  const [views, setViews] = useState<SavedView[]>(read)
  const [open, setOpen] = useState(false)
  const write = (v: SavedView[]) => { setViews(v); try { localStorage.setItem(storageKey, JSON.stringify(v)) } catch { /* private mode */ } }
  const same = (v: SavedView) => (Object.keys(current) as (keyof typeof current)[]).every(k => (v[k] ?? '') === (current[k] ?? ''))
  const active = views.find(same)
  return (
    <div className="relative">
      <button className={cls('btn outline sm', active && 'ring-2 ring-emerald/40')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}><Bookmark /> {active ? active.name : 'Views'}</button>
      {open && (
        <div role="menu" className="absolute left-0 top-[calc(100%+6px)] z-30 w-64 rounded-2xl border border-line bg-card p-1.5 shadow-[0_24px_60px_rgba(15,42,51,0.16)]">
          {views.length === 0 && <div className="px-3 py-2 text-xs text-muted">Save the current layout, grouping and filters as a view.</div>}
          {views.map(v => (
            <div key={v.name} className="flex items-center rounded-xl hover:bg-hover">
              <button role="menuitem" className="flex flex-1 items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-[13px]" onClick={() => { onApply(v); setOpen(false) }}>{same(v) ? <Check size={14} className="text-emerald" /> : <span className="w-[14px]" />}{v.name}<span className="ml-auto text-[10.5px] uppercase tracking-wider text-muted">{v.view === 'kanban' ? 'board' : v.view === 'calendar' ? 'calendar' : 'table'}</span></button>
              <button aria-label={`Delete view ${v.name}`} className="mr-1 flex size-7 items-center justify-center rounded-full border-0 bg-transparent text-muted hover:text-signal" onClick={() => write(views.filter(x => x !== v))}><X size={13} /></button>
            </div>))}
          <div className="my-1 h-px bg-line" />
          <button role="menuitem" className="flex w-full items-center gap-2 rounded-xl border-0 bg-transparent px-3 py-2 text-left text-[13px] font-semibold hover:bg-hover" onClick={async () => { setOpen(false); const name = (await dlg.prompt({ title: 'Save view', label: 'View name', required: true }))?.trim(); if (name) write([...views.filter(v => v.name !== name), { name, ...current }]) }}><Plus size={14} /> Save current view</button>
        </div>
      )}
    </div>
  )
}
