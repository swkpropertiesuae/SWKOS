import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, Download, Play, Printer, Check } from 'lucide-react'
import { buildApiPath, downloadAuthFile, get } from '../lib/api'
import { useToast } from '../lib/toast'
import { RefSelect } from '../components/RefSelect'
import { CustomSelect } from '../components/CustomSelect'
import { Empty, ErrorBox, Loading, PageHeader, Spinner, Badge } from '../ui/kit'
import { cls, fmtDate, fmtDateTime, fmtMoney, fmtNum } from '../lib/format'

function fmtCell(c: any, v: any) {
  if (v === null || v === undefined || v === '') return ''
  switch (c.type) {
    case 'money': return fmtMoney(v)
    case 'number': return fmtNum(v)
    case 'percent': return fmtNum(v) + '%'
    case 'date': return fmtDate(v)
    case 'datetime': return fmtDateTime(v)
    default: return String(v)
  }
}

export function ReportResultView({ res }: { res: any }) {
  if (res.layout === 'statement') {
    return (
      <div className="print-sheet !w-auto !min-h-0 !shadow-none max-w-3xl" style={{ boxShadow: 'none' }}>
        <table>
          <tbody>
            {res.rows.map((r: any, i: number) =>
              r.kind === 'header' ? (
                <tr key={i}><td colSpan={3} className="!bg-[#f4f6fb] font-bold uppercase text-[11px] tracking-wider !pt-3">{r.name}</td></tr>
              ) : (
                <tr key={i} className={cls(r.kind === 'total' && 'font-bold', r.kind === 'grand' && 'font-extrabold text-[13px] !bg-[#f4f6fb]', r.kind === 'check' && 'text-muted italic')}>
                  <td style={{ width: 70 }} className="text-muted">{r.code}</td>
                  <td style={{ paddingLeft: r.kind === 'line' ? 18 : 8 }}>{r.name}</td>
                  <td className="num" style={{ textAlign: 'right', width: 140 }}>
                    {r.kind === 'check' && Math.abs(r.amount) < 0.005 ? <Check size={14} className="inline text-emerald" /> : fmtMoney(r.amount)}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
        {res.note && <p className="text-xs text-muted mt-3">{res.note}</p>}
      </div>
    )
  }
  return (
    <div>
      <div className="table-wrap border border-line rounded-[22px]">
        <table className="grid">
          <thead>
            <tr>
              {res.columns.map((c: any) => (
                <th key={c.key} className={['money', 'number', 'percent'].includes(c.type) ? 'num' : ''}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {res.rows.length === 0 && <tr><td colSpan={res.columns.length}><Empty title="No data for these filters" /></td></tr>}
            {res.rows.map((r: any, i: number) => (
              <tr key={i}>
                {res.columns.map((c: any) => (
                  <td key={c.key} className={['money', 'number', 'percent'].includes(c.type) ? 'num' : ''}>
                    {c.key === 'link' ? null : c.key === 'job_status' || c.key === 'status' || c.key === 'sla' ? <Badge value={r[c.key]} /> : fmtCell(c, r[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {res.totals && res.rows.length > 0 && (
            <tfoot>
              <tr>
                {res.columns.map((c: any, i: number) => (
                  <td key={c.key} className={['money', 'number', 'percent'].includes(c.type) ? 'num' : ''}>
                    {i === 0 ? 'Total' : res.totals[c.key] !== undefined && res.totals[c.key] !== null ? fmtCell(c, res.totals[c.key]) : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {res.note && <p className="text-xs text-muted mt-2">{res.note}</p>}
    </div>
  )
}

export function ReportsPage({ fixed }: { fixed?: string[] }) {
  const toast = useToast()
  const [sp, setSp] = useSearchParams()
  const cat = useQuery({ queryKey: ['report-catalog'], queryFn: () => get<any[]>('/api/reports') })
  const key = sp.get('r') ?? ''
  const def = cat.data?.find(r => r.key === key)
  const [params, setParams] = useState<Record<string, string>>({})
  const [run, setRun] = useState<Record<string, string> | null>(null)
  const groups = useMemo(() => {
    const g = new Map<string, any[]>()
    for (const r of (cat.data ?? []).filter(r => !fixed || fixed.includes(r.key))) {
      if (!g.has(r.group)) g.set(r.group, [])
      g.get(r.group)!.push(r)
    }
    return [...g.entries()]
  }, [cat.data, fixed])

  useEffect(() => {
    if (!def) { setRun(null); return }
    const p: Record<string, string> = {}
    const today = new Date().toLocaleDateString('sv-SE')
    for (const pd of def.params) {
      p[pd.name] = sp.get(pd.name) ?? (pd.default === 'today' ? today : pd.default === 'monthStart' ? today.slice(0, 8) + '01' : pd.default === 'yearStart' ? today.slice(0, 5) + '01-01' : pd.default ?? '')
    }
    setParams(p)
    if (def.params.every((pd: any) => (pd.type === 'ref' ? !!p[pd.name] : true))) setRun(p)
    else setRun(null)
  }, [key, def?.key])

  const res = useQuery({ queryKey: ['report', key, run], enabled: !!def && !!run, queryFn: () => get<any>(`/api/reports/${key}`, run ?? {}), retry: false })
  const choose = (k: string) => { const n = new URLSearchParams(); n.set('r', k); setSp(n) }

  return (
    <div className="fade-in max-w-[1480px] mx-auto pb-8">
      <PageHeader
        icon={<BarChart3 size={20} />}
        title={fixed ? 'Financial Statements' : 'Reports'}
        subtitle="Operational, sales, finance and compliance reports — export to CSV or print / save as PDF"
      />
      <div className="grid gap-5 lg:grid-cols-[280px_1fr] items-start">
        <nav className="card p-2.5 no-print lg:sticky lg:top-0 max-h-[78vh] overflow-auto" aria-label="Reports">
          {!cat.data ? (
            <Loading />
          ) : (
            groups.map(([g, list]) => (
              <div key={g} className="mb-2">
                <div className="px-3 pt-2.5 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#6d28d9]">{g}</div>
                <div className="grid gap-0.5">
                  {list.map(r => (
                    <button
                      key={r.key}
                      onClick={() => choose(r.key)}
                      className={cls(
                        'w-full text-start px-3 py-2 text-[13px] rounded-xl border-0 cursor-pointer transition-colors',
                        r.key === key ? 'bg-[#0f172a] text-white font-semibold' : 'bg-transparent text-body hover:bg-hover',
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </nav>
        <div className="min-w-0">
          {!def ? (
            <div className="card"><Empty icon={<BarChart3 size={34} />} title="Choose a report" hint="Pick a report from the list to set its filters and run it." /></div>
          ) : (
            <div className="card p-5 md:p-6">
              <div className="flex items-start gap-3 flex-wrap mb-4">
                <div className="flex-1 min-w-0">
                  <h2 className="m-0 text-[19px] font-bold">{def.label}</h2>
                  <p className="text-sm text-muted m-0 mt-0.5">{def.description}</p>
                </div>
                <div className="flex gap-2 no-print">
                  <button
                    type="button"
                    className={cls('btn outline sm', !run && 'opacity-50 pointer-events-none')}
                    disabled={!run}
                    onClick={() => void downloadAuthFile(buildApiPath(`/api/reports/${key}`, { ...(run ?? {}), format: 'csv' }), `${key}.csv`).catch(e => toast.error(e.message))}
                  >
                    <Download /> CSV
                  </button>
                  <button className="btn outline sm" onClick={() => window.print()} disabled={!res.data}>
                    <Printer /> Print
                  </button>
                </div>
              </div>
              {def.params.length > 0 && (
                <form className="flex gap-3 items-end flex-wrap pb-4 mb-4 border-b border-line no-print" onSubmit={e => { e.preventDefault(); setRun({ ...params }) }}>
                  {def.params.map((pd: any) => (
                    <div key={pd.name} style={{ minWidth: pd.type === 'ref' ? 260 : 150 }}>
                      <label className="label">{pd.label}</label>
                      {pd.type === 'date' ? (
                        <input className="input" type="date" value={params[pd.name] ?? ''} onChange={e => setParams(p => ({ ...p, [pd.name]: e.target.value }))} />
                      ) : pd.type === 'ref' ? (
                        <RefSelect entity={pd.ref} value={params[pd.name] ? Number(params[pd.name]) : null} onChange={id => setParams(p => ({ ...p, [pd.name]: id ? String(id) : '' }))} />
                      ) : pd.type === 'select' ? (
                        <CustomSelect className="select" value={params[pd.name] ?? ''} onChange={e => setParams(p => ({ ...p, [pd.name]: e.target.value }))}>
                          <option value="">All</option>
                          {pd.options.map((o: string) => <option key={o}>{o}</option>)}
                        </CustomSelect>
                      ) : (
                        <input className="input" type={pd.type === 'number' ? 'number' : 'text'} value={params[pd.name] ?? ''} onChange={e => setParams(p => ({ ...p, [pd.name]: e.target.value }))} />
                      )}
                    </div>
                  ))}
                  <button className="btn green"><Play /> Run</button>
                </form>
              )}
              {res.isFetching ? (
                <Loading label="Running report…" />
              ) : res.error ? (
                <ErrorBox error={res.error} />
              ) : res.data ? (
                <>
                  <h3 className="mt-0 mb-3 text-[15px] font-bold">{res.data.title}</h3>
                  <ReportResultView res={res.data} />
                </>
              ) : (
                <p className="text-sm text-muted">Choose the filters and press Run.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
void Link
void Spinner
