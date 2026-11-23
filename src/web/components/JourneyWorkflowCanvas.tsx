import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Calculator,
  CalendarCheck,
  CalendarDays,
  Check,
  Clock3,
  FileCheck,
  FileSignature,
  HandCoins,
  Megaphone,
  Percent,
  PhoneCall,
  Plus,
  QrCode,
  Rocket,
  Scale,
  ShieldCheck,
  UserPlus,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { isAllowedPathForRestrictedStaff } from '@shared/swk-staff-access'

type DeptFilter = 'all' | 'offplan' | 'secondary' | 'leasing'

interface JourneyNode {
  id: string
  step: string
  title: string
  sub: string
  to: string
  newTo?: string
  icon: LucideIcon
  tintBg: string
  tintFg: string
  count?: number | string
  done?: boolean
  depts: DeptFilter[]
}

interface JourneyStage {
  key: string
  label: string
  nodes: JourneyNode[]
}

interface QuickTile {
  id: string
  title: string
  sub: string
  to: string
  icon: LucideIcon
  featured?: boolean
  depts: DeptFilter[]
}

const TEAM_RIBBON = [
  { initials: 'SS', name: 'Shabib', badge: '4', tone: '#3b82f6', bg: '#dbeafe', fg: '#1e3a8a' },
  { initials: 'MH', name: 'Haseeb', badge: '6', tone: '#6366f1', bg: '#e0e7ff', fg: '#312e81' },
  { initials: 'SA', name: 'Saifullah', badge: '3', tone: '#ef4444', bg: '#fee2e2', fg: '#7f1d1d' },
  { initials: 'FA', name: 'Fareed', badge: '2', tone: '#10b981', bg: '#d1fae5', fg: '#064e3b' },
  { initials: 'SH', name: 'Shahid', badge: '5', tone: '#f59e0b', bg: '#fef3c7', fg: '#78350f' },
  { initials: 'TS', name: 'Talha', badge: '3', tone: '#8b5cf6', bg: '#ede9fe', fg: '#4c1d95' },
  { initials: 'UM', name: 'Umar', badge: '2', tone: '#0ea5e9', bg: '#e0f2fe', fg: '#0c4a6e' },
]

/** Curved SVG bezier bridge sitting in its own grid column between two journey stages */
function StageConnector({ accentTop, accentMid, accentBot, active }: { accentTop: string; accentMid: string; accentBot: string; active?: boolean }) {
  return (
    <div className="hidden xl:flex items-center justify-center pointer-events-none select-none" aria-hidden="true">
      <svg viewBox="0 0 24 280" className="w-6 h-full max-h-[280px] overflow-visible">
        <path
          d="M 1 52 C 12 52, 12 52, 23 52"
          fill="none"
          stroke={active ? accentTop : '#cbd5e1'}
          strokeWidth={active ? 2 : 1.5}
        />
        <path
          d="M 1 52 C 12 52, 12 140, 23 140"
          fill="none"
          stroke={active ? accentMid : '#cbd5e1'}
          strokeWidth={active ? 1.8 : 1.35}
          strokeDasharray={active ? undefined : '3 3'}
        />
        <path
          d="M 1 140 C 12 140, 12 140, 23 140"
          fill="none"
          stroke={active ? accentMid : '#cbd5e1'}
          strokeWidth={active ? 2 : 1.5}
        />
        <path
          d="M 1 228 C 12 228, 12 140, 23 140"
          fill="none"
          stroke={active ? accentBot : '#cbd5e1'}
          strokeWidth={active ? 1.6 : 1.3}
          strokeDasharray="3 3"
        />
        <path
          d="M 1 228 C 12 228, 12 228, 23 228"
          fill="none"
          stroke={active ? accentBot : '#cbd5e1'}
          strokeWidth={active ? 2 : 1.5}
        />
        {[52, 140, 228].map((y, idx) => (
          <g key={y}>
            <circle cx={1} cy={y} r={3} fill={[accentTop, accentMid, accentBot][idx]} />
            <circle cx={23} cy={y} r={3} fill={[accentTop, accentMid, accentBot][idx]} />
          </g>
        ))}
      </svg>
    </div>
  )
}

export function JourneyWorkflowCanvas({
  kpis,
  dealCount,
  adminOk,
  restricted,
}: {
  kpis: Record<string, any>
  dealCount: number
  adminOk: boolean
  restricted: boolean
}) {
  const [dept, setDept] = useState<DeptFilter>('all')
  const [selectedId, setSelectedId] = useState<string>('leads')

  const stages = useMemo<JourneyStage[]>(() => {
    const raw: JourneyStage[] = [
      {
        key: 'intake',
        label: 'Listing & Intake',
        nodes: [
          {
            id: 'inventory',
            step: '01',
            title: 'Inventory & A2A',
            sub: 'Verified Dubai units',
            to: '/e/properties',
            newTo: '/e/inventory_submissions?new=1',
            icon: Building2,
            tintBg: '#ecfdf5',
            tintFg: '#047857',
            count: Number(kpis.properties_available ?? 0),
            done: true,
            depts: ['all', 'offplan', 'secondary', 'leasing'],
          },
          {
            id: 'portals',
            step: '02',
            title: 'Portal Studio',
            sub: 'Bayut, PF & Form A',
            to: '/listings',
            icon: Megaphone,
            tintBg: '#eff6ff',
            tintFg: '#1d4ed8',
            count: Number(kpis.mandates_active ?? 0),
            done: true,
            depts: ['all', 'offplan', 'secondary', 'leasing'],
          },
          {
            id: 'leads',
            step: '03',
            title: 'Leads Intake',
            sub: 'Enquiries & routing',
            to: '/e/leads',
            newTo: '/e/leads?new=1',
            icon: UserPlus,
            tintBg: '#f5f3ff',
            tintFg: '#6d28d9',
            count: `${Number(kpis.leads_today ?? 0)} today`,
            done: true,
            depts: ['all', 'offplan', 'secondary', 'leasing'],
          },
        ],
      },
      {
        key: 'qualify',
        label: 'Visits & Offers',
        nodes: [
          {
            id: 'followups',
            step: '04',
            title: 'Follow-Ups & Calls',
            sub: 'Callbacks & CRM tasks',
            to: '/e/activities',
            icon: PhoneCall,
            tintBg: '#fef3c7',
            tintFg: '#92400e',
            done: true,
            depts: ['all', 'offplan', 'secondary', 'leasing'],
          },
          {
            id: 'viewings',
            step: '05',
            title: 'Site Viewings',
            sub: 'Scheduled tours',
            to: '/e/viewings',
            newTo: '/e/viewings?new=1',
            icon: CalendarCheck,
            tintBg: '#e0f2fe',
            tintFg: '#0369a1',
            count: `${Number(kpis.viewings_week ?? 0)} / 7d`,
            done: Number(kpis.viewings_week ?? 0) > 0,
            depts: ['all', 'offplan', 'secondary', 'leasing'],
          },
          {
            id: 'offers',
            step: '06',
            title: 'Buyer Offers',
            sub: 'Negotiation desk',
            to: '/e/offers',
            icon: HandCoins,
            tintBg: '#fef7e6',
            tintFg: '#b78328',
            count: `${Number(kpis.offers_pending ?? 0)} open`,
            depts: ['all', 'offplan', 'secondary', 'leasing'],
          },
        ],
      },
      {
        key: 'closing',
        label: 'Closing & DLD',
        nodes: [
          {
            id: 'formf',
            step: '07',
            title: 'Sale Contract (F)',
            sub: 'MOU & E-Signatures',
            to: '/e/sales_contracts',
            icon: FileCheck,
            tintBg: '#eef2ff',
            tintFg: '#4338ca',
            depts: ['all', 'offplan', 'secondary'],
          },
          {
            id: 'escrow',
            step: '08',
            title: 'Escrow & NOC',
            sub: 'RERA Trust clearance',
            to: '/e/escrow_accounts',
            icon: ShieldCheck,
            tintBg: '#ecfdf5',
            tintFg: '#047857',
            depts: ['all', 'offplan', 'secondary'],
          },
          {
            id: 'jobs',
            step: '09',
            title: 'Closing Deal File',
            sub: 'DLD Transfer / Ejari',
            to: '/e/jobs',
            newTo: '/e/jobs?new=1',
            icon: FileSignature,
            tintBg: '#fff1f2',
            tintFg: '#be123c',
            count: `${dealCount} active`,
            depts: ['all', 'offplan', 'secondary', 'leasing'],
          },
        ],
      },
    ]

    return raw.map(st => ({
      ...st,
      nodes: st.nodes.filter(
        n => n.depts.includes(dept) && (!restricted || isAllowedPathForRestrictedStaff(n.to)),
      ),
    }))
  }, [dept, kpis, dealCount, restricted])

  const quickTiles = useMemo<QuickTile[]>(() => {
    const base: QuickTile[] = [
      { id: 'q-lead', title: 'New Lead', sub: 'Capture enquiry', to: '/e/leads?new=1', icon: UserPlus, featured: true, depts: ['all', 'offplan', 'secondary', 'leasing'] },
      { id: 'q-receipts', title: 'UAE Receipts', sub: 'Escrow & fees', to: '/e/receipts', icon: Wallet, depts: ['all', 'offplan', 'secondary', 'leasing'] },
      { id: 'q-split', title: '50/50 Split', sub: 'Broker payouts', to: '/e/agent_commissions', icon: Percent, depts: ['all', 'offplan', 'secondary', 'leasing'] },
      { id: 'q-pdc', title: 'PDC Vault', sub: 'Rent cheques', to: '/pdc', icon: CalendarDays, depts: ['all', 'leasing', 'secondary'] },
      adminOk
        ? { id: 'q-withdraw', title: 'Withdrawals', sub: 'Refund sign-off', to: '/withdrawals', icon: Scale, depts: ['all', 'offplan', 'secondary'] }
        : { id: 'q-toolkit', title: 'Deal Toolkit', sub: 'DLD & ROI calc', to: '/toolkit', icon: Calculator, depts: ['all', 'offplan', 'secondary', 'leasing'] },
      {
        id: 'q-qr',
        title: adminOk ? 'Attendance' : 'QR Check-In',
        sub: adminOk ? 'Daily gate logs' : 'Scan office QR',
        to: adminOk ? '/e/attendance' : '/reception-qr',
        icon: QrCode,
        depts: ['all', 'offplan', 'secondary', 'leasing'],
      },
    ]
    return base.filter(t => t.depts.includes(dept) && (!restricted || isAllowedPathForRestrictedStaff(t.to.split('?')[0])))
  }, [adminOk, dept, restricted])

  const allNodes = stages.flatMap(s => s.nodes)
  const activeNode = allNodes.find(n => n.id === selectedId) ?? allNodes[0]

  return (
    <section
      aria-label="Deal and Brokerage Journeys"
      className="relative overflow-hidden rounded-[30px] border border-[#e5e8f2] bg-white/88 backdrop-blur-xl p-5 sm:p-6 shadow-[0_18px_48px_-26px_rgba(15,23,42,0.14)]"
      style={{
        backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.22) 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }}
    >
      {/* Top Bar: Title + Floating Team Avatar Strip + Quick Circle Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#6d28d9]">
            Connected Real Estate Workflow
          </div>
          <h2 className="m-0 mt-0.5 text-[20px] font-bold tracking-[-0.025em] text-[#0f172a]">
            Deal &amp; Customer Journeys
          </h2>
        </div>

        {/* Center Floating Team Avatars (SugarCRM Customer Journeys signature element) */}
        <div
          className="hidden lg:flex items-center gap-1.5 rounded-full border border-[#e5e8f2] bg-white/95 px-3 py-1.5 shadow-[0_8px_22px_-12px_rgba(15,23,42,0.14)]"
          aria-label="Active SWK advisory team"
        >
          {TEAM_RIBBON.map(m => (
            <Link
              key={m.name}
              to="/team"
              title={`${m.name} · ${m.badge} active tasks`}
              className="group relative flex flex-col items-center no-underline"
            >
              <span
                className="flex size-8 items-center justify-center rounded-full text-[11px] font-bold ring-2 ring-white transition-transform group-hover:-translate-y-0.5"
                style={{ background: m.bg, color: m.fg }}
              >
                {m.initials}
              </span>
              <span
                className="-mt-1.5 rounded-full px-1.5 text-[9px] font-bold text-white leading-[14px] shadow-xs"
                style={{ background: m.tone }}
              >
                {m.badge}
              </span>
            </Link>
          ))}
        </div>

        {/* Right Filter Pills + Circular Utility Icons */}
        <div className="flex flex-wrap items-center gap-2">
          {!restricted && (
            <div className="inline-flex items-center rounded-full border border-[#e5e8f2] bg-white p-1 shadow-2xs">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'offplan', label: 'Off-Plan' },
                  { id: 'secondary', label: 'Ready' },
                  { id: 'leasing', label: 'Leasing' },
                ] as { id: DeptFilter; label: string }[]
              ).map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDept(tab.id)}
                  className={`rounded-full px-3 py-1 text-[11.5px] font-semibold border-0 transition-colors cursor-pointer ${
                    dept === tab.id ? 'bg-[#0f172a] text-white' : 'bg-transparent text-[#475569] hover:text-[#0f172a]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
          <Link
            to="/e/leads?new=1"
            aria-label="Create new lead"
            className="flex size-9 items-center justify-center rounded-full border border-[#e5e8f2] bg-white text-[#0f172a] no-underline shadow-2xs hover:bg-[#0f172a] hover:text-white transition-colors"
          >
            <Plus size={16} />
          </Link>
          <Link
            to="/pipeline"
            aria-label="Open deal pipeline"
            className="flex size-9 items-center justify-center rounded-full border border-[#e5e8f2] bg-white text-[#0f172a] no-underline shadow-2xs hover:bg-[#0f172a] hover:text-white transition-colors"
          >
            <Rocket size={15} />
          </Link>
          <Link
            to="/calendar"
            aria-label="Open calendar"
            className="flex size-9 items-center justify-center rounded-full border border-[#e5e8f2] bg-white text-[#0f172a] no-underline shadow-2xs hover:bg-[#0f172a] hover:text-white transition-colors"
          >
            <CalendarDays size={15} />
          </Link>
        </div>
      </div>

      {/* Connected 4-Stage Canvas with SVG Bezier Bridges */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.04fr_20px_1.04fr_20px_1.04fr_20px_1.08fr] items-stretch">
        {stages.map((stage, sIdx) => (
          <div key={stage.key} className="contents">
            <div className="flex flex-col justify-between rounded-[24px] border border-[#e8ecf4] bg-[#f4f6fb]/92 p-3">
              <div className="grid gap-2.5 flex-1">
                {stage.nodes.map(node => {
                  const isSel = activeNode?.id === node.id
                  return (
                    <div
                      key={node.id}
                      onClick={() => setSelectedId(node.id)}
                      className={`group flex items-center gap-2.5 rounded-[18px] border bg-white px-2.5 py-2.5 transition-all cursor-pointer ${
                        isSel
                          ? 'border-[#0f172a] shadow-[0_10px_24px_-14px_rgba(15,23,42,0.28)] ring-1 ring-[#0f172a]/10'
                          : 'border-[#eef1f7] hover:border-[#cbd5e1] hover:shadow-xs'
                      }`}
                    >
                      <span
                        className="flex size-8 shrink-0 items-center justify-center rounded-xl"
                        style={{ background: node.tintBg, color: node.tintFg }}
                      >
                        <node.icon size={15} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[12.5px] font-bold text-[#0f172a] leading-tight">{node.title}</span>
                          {node.done ? (
                            <Check size={12} className="text-[#047857] shrink-0" />
                          ) : (
                            <Clock3 size={11} className="text-[#b78328] shrink-0" />
                          )}
                        </div>
                        <div className="mt-0.5 text-[10.5px] text-[#526273] leading-tight">
                          {node.count !== undefined ? `${node.count} · ` : ''}
                          {node.sub}
                        </div>
                      </div>
                      <Link
                        to={node.to}
                        onClick={e => e.stopPropagation()}
                        aria-label={`Open ${node.title}`}
                        className="flex size-6.5 shrink-0 items-center justify-center rounded-full border border-[#e5e8f2] bg-[#f8fafc] text-[#475569] no-underline transition-colors group-hover:bg-[#0f172a] group-hover:text-white group-hover:border-[#0f172a]"
                      >
                        <ArrowUpRight size={12} />
                      </Link>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 pt-2 border-t border-[#e5e9f2] text-center text-[11.5px] font-semibold text-[#475569]">
                {stage.label}
              </div>
            </div>

            {sIdx < 3 && (
              <StageConnector
                accentTop={sIdx === 0 ? '#3b82f6' : sIdx === 1 ? '#10b981' : '#6366f1'}
                accentMid={sIdx === 0 ? '#8b5cf6' : sIdx === 1 ? '#0ea5e9' : '#0f172a'}
                accentBot={sIdx === 0 ? '#f59e0b' : sIdx === 1 ? '#f43f5e' : '#047857'}
                active={stage.nodes.some(n => n.id === activeNode?.id)}
              />
            )}
          </div>
        ))}

        {/* Stage 4: Signature 2x3 Square Quick Action Grid with Obsidian Active Card (Image 2 "New Tasks") */}
        <div className="flex flex-col justify-between rounded-[24px] border border-[#e8ecf4] bg-[#f4f6fb]/92 p-3.5">
          <div className="grid grid-cols-2 gap-2.5 flex-1">
            {quickTiles.map(tile => (
              <Link
                key={tile.id}
                to={tile.to}
                className={`group flex flex-col justify-between rounded-[18px] p-3 no-underline transition-all hover:-translate-y-0.5 ${
                  tile.featured
                    ? 'bg-[#0f172a] text-white shadow-[0_14px_28px_-14px_rgba(15,23,42,0.55)] hover:bg-[#1e293b]'
                    : 'border border-[#eef1f7] bg-white text-[#0f172a] hover:border-[#0f172a] hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`flex size-7 items-center justify-center rounded-xl ${
                      tile.featured ? 'bg-white/15 text-[#c5e86c]' : 'bg-[#f1f5f9] text-[#0f172a]'
                    }`}
                  >
                    <tile.icon size={14} />
                  </span>
                  <ArrowUpRight
                    size={13}
                    className={tile.featured ? 'text-white/70 group-hover:text-white' : 'text-[#94a3b8] group-hover:text-[#0f172a]'}
                  />
                </div>
                <div className="mt-2.5">
                  <div className={`text-[12.5px] font-bold leading-tight ${tile.featured ? 'text-white' : 'text-[#0f172a]'}`}>
                    {tile.title}
                  </div>
                  <div className={`mt-0.5 text-[10.5px] leading-tight ${tile.featured ? 'text-white/75' : 'text-[#526273]'}`}>
                    {tile.sub}
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-3 pt-2 border-t border-[#e5e9f2] text-center text-[11.5px] font-semibold text-[#475569]">
            Actions &amp; Settlement
          </div>
        </div>
      </div>

      {/* Interactive Node Inspector Strip (Image 3 & Image 4 bottom bar) */}
      {activeNode && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e5e8f2] bg-white/95 px-4 py-2.5 shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="rounded-full bg-[#0f172a] px-2.5 py-0.5 font-mono text-[10.5px] font-bold text-[#c5e86c]">
              STEP {activeNode.step}
            </span>
            <span className="truncate text-[13px] font-bold text-[#0f172a]">{activeNode.title}</span>
            <span className="hidden sm:inline text-[12px] text-[#526273]">· {activeNode.sub}</span>
          </div>
          <div className="flex items-center gap-2">
            {activeNode.newTo && (
              <Link to={activeNode.newTo} className="btn outline sm">
                <Plus size={13} /> Quick Create
              </Link>
            )}
            <Link to={activeNode.to} className="btn navy sm">
              Open Module <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      )}
    </section>
  )
}
