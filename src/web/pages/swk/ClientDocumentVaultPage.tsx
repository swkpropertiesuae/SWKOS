import { useMemo, useState } from 'react'
import { CustomSelect } from '../../components/CustomSelect'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpRight,
  CheckCircle2,
  FileCheck2,
  FolderLock,
  Search,
  ShieldAlert,
  Upload,
} from 'lucide-react'
import { get, post, upload } from '../../lib/api'
import { useToast } from '../../lib/toast'
import { BracketLink, SwissHeroHeader } from '../../components/ui/SwissPrimitives'

const CATEGORIES = ['Identity & Residency', 'Income & Banking', 'Property & DLD', 'Bank & Compliance'] as const

export default function ClientDocumentVaultPage() {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const toast = useToast()
  const qc = useQueryClient()

  const listQ = useQuery({
    queryKey: ['client-vault-list'],
    queryFn: () => get<any>('/api/client-vault'),
  })

  const clients: any[] = listQ.data?.clients ?? []
  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase()
    return clients.filter(c => !t || `${c.name} ${c.code} ${c.phone || ''} ${c.email || ''}`.toLowerCase().includes(t))
  }, [clients, search])

  const activeId = selectedId ?? filtered[0]?.id ?? null

  const detailQ = useQuery({
    queryKey: ['client-vault-detail', activeId],
    enabled: Boolean(activeId),
    queryFn: () => get<any>(`/api/client-vault/${activeId}`),
  })

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['client-vault-list'] })
    if (activeId) void qc.invalidateQueries({ queryKey: ['client-vault-detail', activeId] })
  }

  const updateItem = async (docKey: string, patch: Record<string, any>) => {
    if (!activeId) return
    setBusyKey(docKey)
    try {
      await post(`/api/client-vault/${activeId}/item`, { doc_key: docKey, ...patch })
      toast.ok('Client Vault updated')
      refresh()
    } catch (e: any) { toast.error(e.message) } finally { setBusyKey(null) }
  }

  const uploadForDoc = async (docKey: string, docLabel: string, file: File | undefined) => {
    if (!activeId || !file) return
    setBusyKey(docKey)
    try {
      const uploaded: any = await upload([file], {
        category: docLabel,
        link_entity: 'parties',
        link_id: String(activeId),
        note: `Client Vault · ${docLabel}`,
      })
      const att = Array.isArray(uploaded) ? uploaded[0] : uploaded?.rows?.[0] ?? uploaded
      await post(`/api/client-vault/${activeId}/item`, {
        doc_key: docKey,
        status: 'Uploaded',
        attachment_id: att?.id ?? null,
        file_name: file.name,
      })
      toast.ok(`${docLabel} uploaded to Client Vault`)
      refresh()
    } catch (e: any) { toast.error(e.message) } finally { setBusyKey(null) }
  }

  const detail = detailQ.data
  const checklist: any[] = detail?.checklist ?? []

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 pb-10">
      <SwissHeroHeader
        eyebrow="Per-Client Compliance Document Vault"
        title="Documents Vault per Client"
        subtitle="Complete 13-document UAE Real Estate & Mortgage checklist per client: Passport, EID, Visa Page, Salary Certificate, 6M Payslips, 6M Bank Statements, AECB Credit Report, Signed Bank Application, Info Sheet, Form F, Oqood, Title Deed & Developer SOA/NOC."
        actions={
          <>
            <BracketLink to="/documents" variant="light" size="sm">
              All Uploaded PDFs <ArrowUpRight size={13} />
            </BracketLink>
            <BracketLink to="/e/parties?new=1" variant="dark" size="sm">
              + New Client
            </BracketLink>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Clients List */}
        <div className="lg:col-span-4 rounded-3xl border border-line bg-card p-4 shadow-xs space-y-3">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input pl-9 text-xs h-10" placeholder="Search clients by name, code, phone…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="space-y-2 max-h-[620px] overflow-auto">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted">No clients found. Add a client in CRM Parties to open their Document Vault.</div>
            ) : filtered.map(c => {
              const active = c.id === activeId
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left rounded-2xl border p-3.5 cursor-pointer transition-all ${
                    active ? 'border-[#121212] bg-[#121212] text-white' : 'border-line bg-soft/40 text-ink hover:border-ink/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <b className="truncate text-[13.5px]">{c.name}</b>
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                      active ? 'bg-[#d4a752] text-[#0b1f2a]' : c.completion_pct >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
                    }`}>
                      {c.uploaded_count}/13
                    </span>
                  </div>
                  <div className={`mt-1 text-[11px] ${active ? 'text-slate-300' : 'text-muted'}`}>
                    {c.code} · KYC: {c.kyc_status || 'Pending'} {c.expired_count > 0 ? `· ${c.expired_count} Expired` : ''}
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-black/15 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${c.completion_pct}%` }} />
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Right: 13-Doc Vault Checklist */}
        <div className="lg:col-span-8 space-y-4">
          {!detail ? (
            <div className="rounded-3xl border border-line bg-card p-10 text-center text-sm text-muted">
              Select a client on the left to inspect, upload, and verify their 13-document vault.
            </div>
          ) : (
            <>
              <div className="rounded-3xl border border-line bg-card p-5 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-mono font-bold text-[#8a621c]">{detail.client.code}</div>
                  <h2 className="m-0 text-[20px] font-bold text-ink">{detail.client.name}</h2>
                  <div className="text-xs text-muted mt-0.5">
                    {detail.client.phone || 'No phone'} · {detail.client.email || 'No email'} · KYC: <b>{detail.client.kyc_status || 'Pending'}</b>
                  </div>
                </div>
                <Link to={`/e/parties/${detail.client.id}`} className="btn outline sm no-underline">
                  Open Client 360° <ArrowUpRight size={13} />
                </Link>
              </div>

              {CATEGORIES.map(cat => {
                const docs = checklist.filter(d => d.category === cat)
                return (
                  <div key={cat} className="rounded-3xl border border-line bg-card p-5 shadow-xs space-y-3">
                    <h3 className="m-0 text-[14px] font-bold uppercase tracking-wider text-[#8a621c]">{cat}</h3>
                    <div className="space-y-2.5">
                      {docs.map(doc => (
                        <div key={doc.key} className="rounded-2xl border border-line bg-soft/40 p-3.5 flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <b className="text-[13.5px] text-ink">{doc.label}</b>
                              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${
                                doc.status === 'Verified'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : doc.status === 'Uploaded'
                                    ? 'bg-sky-100 text-sky-800'
                                    : doc.status === 'Expired'
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-amber-100 text-amber-800'
                              }`}>
                                {doc.status === 'Verified' && <CheckCircle2 size={11} />}
                                {doc.status === 'Expired' && <ShieldAlert size={11} />}
                                {doc.status}
                              </span>
                            </div>
                            <div className="text-[11.5px] text-muted mt-0.5">{doc.hint}</div>
                            {doc.file_name && (
                              <div className="mt-1 text-[11px] font-semibold text-[#0b1f2a] dark:text-[#f3d27a] flex items-center gap-1.5">
                                <FileCheck2 size={12} /> {doc.file_name}
                                {doc.attachment_id && (
                                  <a href={`/api/files/${doc.attachment_id}/download`} className="underline text-[#2563eb]">Download</a>
                                )}
                                {doc.verified_by_name && <span className="text-emerald-700">· Verified by {doc.verified_by_name}</span>}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {doc.expiryTracked && (
                              <input
                                type="date"
                                aria-label={`${doc.label} expiry`}
                                className="input h-8 text-xs w-[132px]"
                                value={doc.expiry_date || ''}
                                onChange={e => void updateItem(doc.key, { status: doc.status, expiry_date: e.target.value || null })}
                              />
                            )}
                            <label className="btn outline sm cursor-pointer">
                              <Upload size={12} /> {busyKey === doc.key ? 'Saving…' : 'Upload'}
                              <input type="file" className="hidden" onChange={e => void uploadForDoc(doc.key, doc.label, e.target.files?.[0])} />
                            </label>
                            <CustomSelect
                              compact
                              className="select h-8 py-0 text-xs w-[148px]"
                              value={doc.status}
                              disabled={busyKey === doc.key}
                              onChange={e => void updateItem(doc.key, { status: e.target.value, expiry_date: doc.expiry_date })}
                            >
                              <option value="Missing">Missing</option>
                              <option value="Uploaded">Uploaded</option>
                              <option value="Verified">Verified</option>
                              <option value="Expired">Expired</option>
                            </CustomSelect>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
