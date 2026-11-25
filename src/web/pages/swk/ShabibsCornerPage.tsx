import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Crown,
  FileCheck2,
  KeyRound,
  Layers,
  MapPin,
  QrCode,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Wand2,
  Zap,
} from 'lucide-react'
import { get } from '../../lib/api'
import { fmtIsoStamp } from '../../lib/format'
import { EntityFormModal } from '../../components/EntityForm'
import { ConfidentialAiImporter } from '../../components/ConfidentialAiImporter'
import { ErrorBox, Loading } from '../../ui/kit'

interface PipelineStage {
  step: number
  key: string
  title: string
  subtitle: string
  entity: string
  counts: { label: string; value: number }[]
  how_to_fill: string[]
  links: { label: string; to: string }[]
}

interface OverviewData {
  owner: { name: string; email: string }
  generated_at: string
  stages: PipelineStage[]
  pending_approvals: {
    seal_requests: number
    delete_bin: number
    withdrawals: number
    general_approvals: number
    mobile_devices: number
    total: number
  }
  recent_overrides: {
    id: number
    at: string
    user_name: string
    entity: string
    record_id: number | null
    record_label: string | null
    details: { op?: string; reason?: string; bypassed_fields?: string[] }
  }[]
  capabilities: {
    emergency_override: boolean
    confidential_ai_importer: boolean
    ai_configured: boolean
  }
}

type CornerTab = 'pipeline' | 'ai_importer' | 'emergency' | 'approvals'

const EMERGENCY_FORMS: { entity: string; label: string; blurb: string; icon: typeof Building2 }[] = [
  { entity: 'properties', label: 'Property Inventory', blurb: 'Create listing even without title deed, RERA permit or full specs', icon: Building2 },
  { entity: 'leads', label: 'Buyer / Tenant Lead', blurb: 'Log VIP enquiry immediately with minimal details', icon: Users },
  { entity: 'parties', label: 'Owner / Client Party', blurb: 'Register owner or buyer before full KYC arrives', icon: ShieldCheck },
  { entity: 'viewings', label: 'Urgent Site Viewing', blurb: 'Schedule viewing bypassing mandate or pre-requisites', icon: MapPin },
  { entity: 'offers', label: 'Formal Offer / MOU', blurb: 'Capture urgent offer price & terms on the spot', icon: FileCheck2 },
  { entity: 'jobs', label: 'Sales / Leasing Deal', blurb: 'Open deal file immediately under Owner authority', icon: Scale },
  { entity: 'leases', label: 'Lease / Ejari Record', blurb: 'Record urgent tenancy pending Ejari upload', icon: KeyRound },
]

export default function ShabibsCornerPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<CornerTab>('pipeline')
  const [expandedStep, setExpandedStep] = useState<number>(1)
  const [emergencyEntity, setEmergencyEntity] = useState<string | null>(null)

  const q = useQuery({
    queryKey: ['shabibs-corner-overview'],
    queryFn: () => get<OverviewData>('/api/shabibs-corner/overview'),
  })

  if (q.isLoading) return <Loading label="Opening Shabib's Corner…" />
  if (q.error) return <ErrorBox error={q.error as Error} onRetry={() => void q.refetch()} />
  const data = q.data!

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
      {/* Bespoke Executive Owner Hero */}
      <section className="relative overflow-hidden rounded-[22px] border border-[#c89b3c]/45 bg-gradient-to-br from-[#07131b] via-[#0c2230] to-[#08191e] p-6 sm:p-7 text-white shadow-[0_24px_56px_-22px_rgba(7,19,27,0.68)]">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4 min-w-0">
            <img
              src="/brand/web/swk-icon-192.webp"
              alt="SWK Properties Crest"
              className="size-16 rounded-2xl border border-[#c89b3c]/50 bg-[#0a1b24] p-1 shadow-lg shrink-0 object-contain"
            />
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#c89b3c]/45 bg-[#c89b3c]/16 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#f3d27a]">
                <Crown size={12} /> Exclusive Owner Command Suite · {data.owner.email}
              </div>
              <h1 className="m-0 mt-2 text-[26px] sm:text-[34px] font-bold tracking-[-0.03em] !text-white leading-tight">
                Shabib&apos;s Corner
              </h1>
              <p className="m-0 mt-1 text-[14.5px] text-slate-300 max-w-2xl">
                Complete step-by-step brokerage workflow from Inventory Intake to Key Delivery, Confidential AI Brain bulk format conversion, and hardcoded Owner Emergency Override controls.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              to="/ai"
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-[#046c4e] px-4 py-2.5 text-[13.5px] font-semibold text-white no-underline hover:bg-[#05825e] transition-colors"
            >
              <Sparkles size={15} /> Owner AI Brain (Auto Best-Model)
            </Link>
            <button
              type="button"
              onClick={() => setTab('emergency')}
              className="inline-flex items-center gap-2 rounded-xl border border-[#c89b3c]/55 bg-[#c89b3c]/20 px-4 py-2.5 text-[13.5px] font-semibold text-[#f7dda0] hover:bg-[#c89b3c] hover:text-[#07131b] transition-colors cursor-pointer"
            >
              <ShieldAlert size={15} /> Emergency Override Desk
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mt-6 flex flex-wrap gap-2 border-t border-white/12 pt-4">
          {([
            { id: 'pipeline', label: '1 → 8 Workflow Pipeline', icon: Layers },
            { id: 'ai_importer', label: 'Confidential AI Format Converter & Bulk Upload', icon: Wand2 },
            { id: 'emergency', label: `Emergency Override Desk (${data.recent_overrides.length})`, icon: ShieldAlert },
            { id: 'approvals', label: `Owner Approvals (${data.pending_approvals.total})`, icon: ShieldCheck },
          ] as const).map(t => {
            const active = tab === t.id
            const Icon = t.icon
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-semibold transition-all cursor-pointer border ${
                  active
                    ? 'bg-white text-[#07131b] border-white shadow-sm'
                    : 'bg-white/8 text-slate-200 border-white/15 hover:bg-white/16 hover:text-white'
                }`}
              >
                <Icon size={16} />
                {t.label}
              </button>
            )
          })}
        </div>
      </section>

      {/* TAB 1: STEP-BY-STEP BROKERAGE WORKFLOW PIPELINE */}
      {tab === 'pipeline' && (
        <section className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="swk-eyebrow">COMPLETE END-TO-END PROCESS ARCHITECTURE</div>
              <h2 className="m-0 text-[22px] font-bold text-ink">Inventory Intake → Lead → Viewing → Form F → Conveyancing → Delivery</h2>
            </div>
            <button type="button" className="btn outline sm" onClick={() => setTab('ai_importer')}>
              <Wand2 size={15} /> Bulk Upload Any Format via AI Brain
            </button>
          </div>

          <div className="grid gap-4">
            {data.stages.map(stage => {
              const open = expandedStep === stage.step
              return (
                <div
                  key={stage.key}
                  className={`rounded-[20px] border bg-card transition-all shadow-[var(--surface-raised)] overflow-hidden ${
                    open ? 'border-[#046c4e]/60 ring-2 ring-[#046c4e]/12' : 'border-line hover:border-line-strong'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedStep(open ? 0 : stage.step)}
                    className="w-full text-left flex flex-wrap items-center justify-between gap-4 p-5 bg-transparent border-0 cursor-pointer"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`flex size-12 shrink-0 items-center justify-center rounded-2xl font-mono text-[16px] font-bold ${
                        open
                          ? 'bg-[#046c4e] text-white'
                          : 'bg-[#0a1b24] text-[#e2b857]'
                      }`}>
                        0{stage.step}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[17px] font-bold text-ink">{stage.title}</div>
                        <div className="text-[13.5px] text-muted mt-0.5">{stage.subtitle}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {stage.counts.map(c => (
                        <div key={c.label} className="rounded-xl border border-line bg-soft px-3 py-1.5 text-center min-w-[92px]">
                          <div className="font-mono text-[16px] font-bold text-ink leading-tight">{c.value.toLocaleString()}</div>
                          <div className="text-[11px] font-semibold text-muted">{c.label}</div>
                        </div>
                      ))}
                    </div>
                  </button>

                  {open && (
                    <div className="border-t border-line bg-soft/45 px-5 py-5 grid gap-5 lg:grid-cols-12">
                      <div className="lg:col-span-7 grid gap-2.5">
                        <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--eyebrow)]">
                          Step-by-Step SOP · How to Fill &amp; Required Details
                        </div>
                        <ul className="m-0 p-0 list-none grid gap-2">
                          {stage.how_to_fill.map((line, i) => (
                            <li key={i} className="flex items-start gap-2.5 text-[14.5px] text-ink leading-snug">
                              <CheckCircle2 size={16} className="text-[#046c4e] dark:text-emerald-400 shrink-0 mt-0.5" />
                              <span>{line}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="lg:col-span-5 flex flex-col justify-between gap-3 rounded-2xl border border-line bg-card p-4">
                        <div>
                          <div className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted mb-2.5">
                            Direct Stage Launchers
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {stage.links.map(l => (
                              <Link
                                key={l.to + l.label}
                                to={l.to}
                                className="btn outline sm no-underline"
                              >
                                {l.label} <ArrowUpRight size={14} />
                              </Link>
                            ))}
                          </div>
                        </div>

                        <div className="border-t border-line pt-3 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[12.5px] text-muted">Need to skip mandatory (*) fields urgently?</span>
                          <button
                            type="button"
                            className="btn orange sm"
                            onClick={() => setEmergencyEntity(stage.entity)}
                          >
                            <Zap size={14} /> Emergency Quick-Fill
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* TAB 2: CONFIDENTIAL AI FORMAT CONVERTER */}
      {tab === 'ai_importer' && <ConfidentialAiImporter />}

      {/* TAB 3: HARDCODED OWNER/ADMIN EMERGENCY OVERRIDE DESK */}
      {tab === 'emergency' && (
        <section className="grid gap-5">
          <div className="rounded-[20px] border border-[#a6761f]/45 bg-card p-5 shadow-[var(--surface-raised)]">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <div className="swk-eyebrow">HARDCODED OWNER &amp; ADMIN AUTHORITY</div>
                <h2 className="m-0 text-[21px] font-bold text-ink">Emergency Quick-Fill (Bypass Mandatory * Fields)</h2>
                <p className="m-0 mt-1 text-[14px] text-muted">
                  Hardcoded strictly for <b>Owner</b> and <b>Admin</b>. Every other role (including Manager, HR, Office Admin &amp; Agents) is blocked at the API layer (HTTP 403).
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {EMERGENCY_FORMS.map(item => {
                const Icon = item.icon
                return (
                  <button
                    key={item.entity}
                    type="button"
                    onClick={() => setEmergencyEntity(item.entity)}
                    className="group text-left rounded-2xl border border-line bg-soft/60 p-4 transition-all hover:border-[#a6761f] hover:bg-card hover:shadow-md cursor-pointer flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-[#0a1b24] text-[#e2b857]">
                        <Icon size={18} />
                      </span>
                      <span className="badge amber">Override Armed</span>
                    </div>
                    <div className="font-bold text-[15.5px] text-ink mt-1">{item.label}</div>
                    <div className="text-[13px] text-muted leading-snug">{item.blurb}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Audit Trail of Past Emergency Overrides */}
          <div className="rounded-[20px] border border-line bg-card p-5 shadow-[var(--surface-raised)]">
            <h3 className="m-0 text-[18px] font-bold text-ink mb-3">Permanent Emergency Override Audit Log</h3>
            {data.recent_overrides.length === 0 ? (
              <div className="rounded-xl border border-line bg-soft p-6 text-center text-[14px] text-muted">
                No emergency mandatory-field overrides recorded yet. Every override submitted by Owner or Admin will be permanently stamped here.
              </div>
            ) : (
              <div className="table-wrap rounded-xl border border-line">
                <table className="grid">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Authorized By</th>
                      <th>Module / Record</th>
                      <th>Emergency Detail</th>
                      <th>Bypassed * Fields</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_overrides.map(ov => (
                      <tr key={ov.id}>
                        <td className="font-mono text-[13px] whitespace-nowrap">{fmtIsoStamp(ov.at)}</td>
                        <td className="font-semibold">{ov.user_name}</td>
                        <td>
                          {ov.record_id ? (
                            <Link className="link" to={`/e/${ov.entity}/${ov.record_id}`}>
                              {ov.entity} · {ov.record_label || `#${ov.record_id}`}
                            </Link>
                          ) : (
                            <span>{ov.entity}</span>
                          )}
                        </td>
                        <td>{ov.details?.reason || '—'}</td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {(ov.details?.bypassed_fields ?? []).length > 0
                              ? (ov.details.bypassed_fields ?? []).map(f => (
                                  <span key={f} className="badge amber font-mono">{f}</span>
                                ))
                              : <span className="text-muted text-xs">None skipped</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB 4: OWNER EXECUTIVE APPROVALS & OVERSIGHT */}
      {tab === 'approvals' && (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              title: 'Company Seal & Signature Requests',
              count: data.pending_approvals.seal_requests,
              desc: 'Approve or reject Admin, Haseeb, Meenakshi & Rahaba requests to attach the SWK seal or Owner signature.',
              to: '/approvals',
              icon: ShieldCheck,
            },
            {
              title: 'Pending Delete Recycle Bin',
              count: data.pending_approvals.delete_bin,
              desc: 'Only Owner Shabib can permanently approve deletions or restore deleted brokerage records.',
              to: '/recycle-bin',
              icon: Trash2,
            },
            {
              title: 'Deal Withdrawal Requests',
              count: data.pending_approvals.withdrawals,
              desc: 'Review cancelled deals, commission adjustments, and advisor withdrawal justifications.',
              to: '/withdrawals',
              icon: Scale,
            },
            {
              title: 'Office Reception QR Display',
              count: 0,
              desc: 'Live 20-second rotating office Wi-Fi attendance QR screen (Owner, Admin & Haseeb only).',
              to: '/reception-display',
              icon: QrCode,
            },
            {
              title: 'Live Field Duty GPS Map',
              count: 0,
              desc: 'Real-time Dubai map tracking active staff site visits & check-ins.',
              to: '/field-live',
              icon: MapPin,
            },
            {
              title: 'Master CRM Owner Vault',
              count: 0,
              desc: 'Encrypted 3,600+ Dubai owner records with unmasked phone visibility & agent dispatch.',
              to: '/crm-vault',
              icon: Building2,
            },
          ].map(card => {
            const Icon = card.icon
            return (
              <Link
                key={card.title}
                to={card.to}
                className="group rounded-[20px] border border-line bg-card p-5 no-underline shadow-[var(--surface-raised)] transition-all hover:-translate-y-0.5 hover:border-[#046c4e] flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-[#0a1b24] text-[#e2b857]">
                    <Icon size={20} />
                  </span>
                  {card.count > 0 ? (
                    <span className="badge red">{card.count} Pending</span>
                  ) : (
                    <ArrowUpRight size={18} className="text-muted group-hover:text-ink" />
                  )}
                </div>
                <div>
                  <div className="text-[16.5px] font-bold text-ink">{card.title}</div>
                  <div className="text-[13.5px] text-muted mt-1 leading-snug">{card.desc}</div>
                </div>
              </Link>
            )
          })}
        </section>
      )}

      {/* Pre-Armed Emergency Entity Form Modal */}
      {emergencyEntity && (
        <EntityFormModal
          entity={emergencyEntity}
          defaultEmergencyOverride
          title={`Owner Emergency Form — ${emergencyEntity.replace(/_/g, ' ').toUpperCase()}`}
          onClose={() => setEmergencyEntity(null)}
          onSaved={() => {
            setEmergencyEntity(null)
            void qc.invalidateQueries({ queryKey: ['shabibs-corner-overview'] })
          }}
        />
      )}
    </div>
  )
}
