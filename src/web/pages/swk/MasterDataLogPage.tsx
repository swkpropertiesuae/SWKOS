import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  Download,
  FileSearch,
  History,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import { get } from '../../lib/api'
import { useMeta } from '../../lib/meta'
import { canUseOsCustomizer } from '@shared/swk-staff-access'
import { ErrorBox, Loading } from '../../ui/kit'
import { ModuleHeader, Pill } from '../../swk/ui'
import { fmtIsoStamp } from '../../lib/format'

interface MasterOverview {
  canSeeSecurity: boolean
  registry: Array<{
    key: string
    label: string
    category: string
    to: string
    count: number
    description: string
  }>
  totals: {
    masterTables: number
    totalMasterRecords: number
    customFieldsCount: number
    totalAttachments: number
    totalAuditEntries: number
    operationalHealthScore: number
  }
  gaps: Array<{
    id: string
    severity: 'high' | 'medium' | 'low' | 'ok'
    area: string
    title: string
    detail: string
    actionLabel: string
    actionTo: string
  }>
  security: {
    grade: string
    score: number
    environment: string
    blockedProbesSinceBoot: number
    failedLogins24h: number
    activeSessions: number
    totpAdoption: { enabled: number; totalStaff: number }
    controls: Array<{ key: string; label: string; status: string; standard: string }>
    recentBlockedEvents: Array<{ at: string; rule: string; method: string; path: string; ip: string; detail: string }>
  } | null
}

interface LogEntry {
  uid: string
  source: string
  at: string
  actor: string
  action: string
  entity: string
  target: string
  detail: string
  ip: string
  severity: 'info' | 'warn' | 'critical'
}

export default function MasterDataLogPage() {
  const { me } = useMeta()
  const isCustomizerOwner = canUseOsCustomizer(me)
  const [tab, setTab] = useState<'log' | 'registry' | 'audit'>('log')
  const [source, setSource] = useState('all')
  const [qStr, setQStr] = useState('')
  const [catFilter, setCatFilter] = useState('All')

  const ov = useQuery({
    queryKey: ['master-hub', 'overview'],
    queryFn: () => get<MasterOverview>('/api/master-hub/overview'),
  })

  const logQ = useQuery({
    queryKey: ['master-hub', 'log', source, qStr],
    enabled: !!ov.data?.canSeeSecurity && tab === 'log',
    queryFn: () => get<{ total: number; rows: LogEntry[] }>('/api/master-hub/log', { source, q: qStr || undefined, limit: 150 }),
  })

  const categories = useMemo(() => {
    const set = new Set<string>(['All'])
    for (const r of ov.data?.registry ?? []) set.add(r.category)
    return [...set]
  }, [ov.data])

  const filteredRegistry = useMemo(() => {
    const needle = qStr.trim().toLowerCase()
    return (ov.data?.registry ?? []).filter(r => {
      if (catFilter !== 'All' && r.category !== catFilter) return false
      if (!needle) return true
      return `${r.label} ${r.key} ${r.category} ${r.description}`.toLowerCase().includes(needle)
    })
  }, [ov.data, catFilter, qStr])

  if (ov.error) return <ErrorBox error={ov.error} onRetry={() => void ov.refetch()} />
  if (!ov.data) return <Loading label="Scanning Master Data, Logs & Security Shield…" />

  const d = ov.data
  const effectiveTab = !d.canSeeSecurity && tab === 'log' ? 'registry' : tab

  return (
    <div className="fade-in max-w-[1380px] mx-auto pb-8">
      <ModuleHeader
        eyebrow="Master Governance & Enterprise Telemetry"
        title="Master Data, 360° Master Log & Security Shield"
        subtitle="Single executive source of truth for every reference table, live cross-OS activity log, operational gap analysis, and UAE enterprise anti-hacking posture."
        actions={
          <div className="flex flex-wrap gap-2">
            {isCustomizerOwner && (
              <Link to="/admin/customizer" className="btn green sm">
                <SlidersHorizontal size={14} /> No-Code OS Customizer
              </Link>
            )}
            {d.canSeeSecurity && (
              <a className="btn outline sm" href="/api/master-hub/log/export.csv" download>
                <Download size={14} /> Export Master Log CSV
              </a>
            )}
            <button className="btn outline sm" onClick={() => { void ov.refetch(); void logQ.refetch() }}>
              <RefreshCw size={14} /> Refresh Scan
            </button>
          </div>
        }
      />

      {/* Executive KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <div className="card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Master Tables</div>
          <div className="text-2xl font-extrabold mt-1">{d.totals.masterTables}</div>
          <div className="text-xs text-muted mt-0.5">{d.totals.totalMasterRecords.toLocaleString()} live records</div>
        </div>
        <div className="card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Uploaded PDF Vault</div>
          <div className="text-2xl font-extrabold mt-1">{d.totals.totalAttachments.toLocaleString()}</div>
          <div className="text-xs text-muted mt-0.5">EID, Visas, Deeds &amp; Files</div>
        </div>
        <div className="card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted">No-Code Custom Fields</div>
          <div className="text-2xl font-extrabold mt-1">{d.totals.customFieldsCount}</div>
          <div className="text-xs text-muted mt-0.5">Owner/Admin live schema</div>
        </div>
        <div className="card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted">OS Readiness Score</div>
          <div className="text-2xl font-extrabold mt-1 text-emerald">{d.totals.operationalHealthScore}%</div>
          <div className="text-xs text-muted mt-0.5">{d.gaps.filter(g => g.severity === 'high').length} high-priority gap(s)</div>
        </div>
        <div className="card p-4 col-span-2 lg:col-span-1" style={{ background: 'linear-gradient(135deg, #0a1b24 0%, #102a36 100%)', color: '#fff', borderColor: 'rgba(200,155,60,0.38)' }}>
          <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#e2b857' }}>UAE Security Shield</div>
          <div className="text-2xl font-extrabold mt-1" style={{ color: '#fff' }}>{d.security ? `${d.security.score}/100` : 'Hardened'}</div>
          <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.72)' }}>
            {d.security ? `${d.security.blockedProbesSinceBoot} attack probe(s) blocked` : 'Enterprise Grade A+'}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs mb-4" role="tablist">
        {d.canSeeSecurity && (
          <button type="button" className={effectiveTab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>
            <History size={15} className="inline mr-1.5 -mt-0.5" /> 360° Master Log
          </button>
        )}
        <button type="button" className={effectiveTab === 'registry' ? 'active' : ''} onClick={() => setTab('registry')}>
          <Database size={15} className="inline mr-1.5 -mt-0.5" /> Master Data Registry ({d.registry.length})
        </button>
        <button type="button" className={effectiveTab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>
          <ShieldCheck size={15} className="inline mr-1.5 -mt-0.5" /> OS Gap Analyzer &amp; Security Shield
        </button>
      </div>

      {/* TAB 1: 360° Master Log */}
      {effectiveTab === 'log' && d.canSeeSecurity && (
        <div className="card p-4 sm:p-5">
          <div className="flex flex-wrap gap-2.5 items-center mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                className="input"
                style={{ paddingLeft: 34 }}
                value={qStr}
                onChange={e => setQStr(e.target.value)}
                placeholder="Search actor, entity, record, IP, or action…"
                aria-label="Search Master Log"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                ['all', 'All Sources'],
                ['audit', 'Audit Changes'],
                ['login', 'Sign-Ins'],
                ['attachment', 'PDF Uploads'],
                ['attendance', 'Attendance'],
                ['integration', 'Integrations'],
              ].map(([val, lbl]) => (
                <button
                  key={val}
                  type="button"
                  className={`btn sm ${source === val ? 'green' : 'outline'}`}
                  onClick={() => setSource(val)}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {logQ.isLoading ? (
            <Loading label="Loading 360° Master Log…" />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Source</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Module / Target</th>
                    <th>Detail</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {(logQ.data?.rows ?? []).map(row => (
                    <tr key={row.uid}>
                      <td className="whitespace-nowrap text-xs font-mono text-muted">{fmtIsoStamp(row.at)}</td>
                      <td>
                        <Pill tone={row.severity === 'critical' ? 'dune' : row.severity === 'warn' ? 'champ' : 'navy'}>
                          {row.source}
                        </Pill>
                      </td>
                      <td className="font-semibold text-sm">{row.actor}</td>
                      <td>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                          row.severity === 'critical' ? 'bg-red-500/15 text-red-700 dark:text-red-300' :
                          row.severity === 'warn' ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300' :
                          'bg-emerald-500/10 text-emerald'
                        }`}>
                          {row.action}
                        </span>
                      </td>
                      <td className="text-sm">
                        <span className="font-semibold">{row.entity}</span>
                        {row.target && <div className="text-xs text-muted truncate max-w-[200px]">{row.target}</div>}
                      </td>
                      <td className="text-xs text-muted max-w-[300px] truncate" title={row.detail}>{row.detail || '—'}</td>
                      <td className="text-xs font-mono text-muted whitespace-nowrap">{row.ip || '—'}</td>
                    </tr>
                  ))}
                  {!(logQ.data?.rows?.length) && (
                    <tr><td colSpan={7} className="text-center py-8 text-muted">No matching Master Log entries.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Master Data Registry */}
      {effectiveTab === 'registry' && (
        <div className="card p-4 sm:p-5">
          <div className="flex flex-wrap gap-2.5 items-center mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                className="input"
                style={{ paddingLeft: 34 }}
                value={qStr}
                onChange={e => setQStr(e.target.value)}
                placeholder="Filter master tables…"
                aria-label="Filter master tables"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {categories.map(c => (
                <button key={c} type="button" className={`btn sm ${catFilter === c ? 'green' : 'outline'}`} onClick={() => setCatFilter(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredRegistry.map(item => (
              <Link
                key={item.key}
                to={item.to}
                className="group rounded-2xl border border-line bg-card p-4 hover:border-[#046c4e] hover:shadow-md transition-all no-underline text-inherit flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted">{item.category}</div>
                    <h3 className="text-[15px] font-bold m-0 mt-0.5 group-hover:text-emerald transition-colors">{item.label}</h3>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-500/10 text-emerald shrink-0">
                    {item.count.toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-muted m-0 leading-relaxed flex-1">{item.description}</p>
                <div className="flex items-center justify-between text-xs font-bold text-emerald pt-2 border-t border-line/60">
                  <span className="font-mono text-[11px] text-muted">{item.key}</span>
                  <span className="inline-flex items-center gap-1">Open Master <ArrowRight size={13} /></span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: Whole-OS Operational Gap Analyzer & UAE Anti-Hacking Security Shield */}
      {effectiveTab === 'audit' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <section className="card p-4 sm:p-5 lg:col-span-7">
            <div className="flex items-center gap-2 mb-3">
              <FileSearch size={18} className="text-emerald" />
              <h2 className="text-base font-bold m-0">Whole-OS Operational Gap Analysis</h2>
            </div>
            <p className="text-xs text-muted mt-0 mb-4">
              Live scan across HR files, DLD inventory permits, RERA broker cards, integrations, approvals, and marketing queues to surface what is missing right now.
            </p>
            <div className="grid gap-3">
              {d.gaps.map(g => (
                <div
                  key={g.id}
                  className="rounded-xl border border-line p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  style={{
                    borderLeftWidth: 4,
                    borderLeftColor: g.severity === 'high' ? '#c81e1e' : g.severity === 'medium' ? '#c89b3c' : g.severity === 'ok' ? '#046c4e' : '#3b82f6',
                  }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {g.severity === 'ok' ? <CheckCircle2 size={15} className="text-emerald" /> : <AlertTriangle size={15} className={g.severity === 'high' ? 'text-red-600' : 'text-amber-600'} />}
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{g.area}</span>
                    </div>
                    <div className="font-bold text-sm">{g.title}</div>
                    <div className="text-xs text-muted mt-1 leading-relaxed">{g.detail}</div>
                  </div>
                  <Link to={g.actionTo} className="btn outline sm shrink-0 self-start sm:self-center">
                    {g.actionLabel} <ArrowRight size={13} />
                  </Link>
                </div>
              ))}
            </div>
          </section>

          <section className="card p-4 sm:p-5 lg:col-span-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Lock size={18} className="text-emerald" />
                <h2 className="text-base font-bold m-0">UAE Anti-Hacking Security Shield</h2>
              </div>
              <Pill tone="oasis">{d.security?.grade ?? 'Hardened A+'}</Pill>
            </div>
            {d.security ? (
              <>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="rounded-xl border border-line p-2.5 text-center">
                    <div className="text-lg font-extrabold">{d.security.blockedProbesSinceBoot}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted font-bold">Blocked Probes</div>
                  </div>
                  <div className="rounded-xl border border-line p-2.5 text-center">
                    <div className="text-lg font-extrabold">{d.security.failedLogins24h}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted font-bold">Failed Logins 24h</div>
                  </div>
                  <div className="rounded-xl border border-line p-2.5 text-center">
                    <div className="text-lg font-extrabold">{d.security.activeSessions}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted font-bold">Active Sessions</div>
                  </div>
                </div>
                <div className="grid gap-2">
                  {d.security.controls.map(c => (
                    <div key={c.key} className="rounded-xl border border-line px-3 py-2.5 flex items-start gap-2.5">
                      <CheckCircle2 size={15} className="text-emerald shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold leading-snug">{c.label}</div>
                        <div className="text-[11px] text-muted mt-0.5">{c.standard} · <b className="text-emerald">{c.status}</b></div>
                      </div>
                    </div>
                  ))}
                </div>
                {d.security.recentBlockedEvents.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-line">
                    <div className="text-xs font-bold uppercase tracking-wider text-red-600 mb-2">Recent Blocked Intrusion Attempts</div>
                    <div className="grid gap-1.5 max-h-48 overflow-y-auto">
                      {d.security.recentBlockedEvents.map((ev, idx) => (
                        <div key={idx} className="text-[11px] rounded-lg bg-red-500/10 px-2.5 py-1.5 font-mono">
                          <b>{ev.rule}</b> · {ev.method} {ev.path} ({ev.ip})
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-muted">Full intrusion telemetry is restricted to Owner, Admin, and Operations Manager.</div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
