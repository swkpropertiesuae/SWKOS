import { Link } from 'react-router-dom'
import { ArrowLeft, Gauge, KanbanSquare, LayoutDashboard, Sparkles } from 'lucide-react'
import GlassyDashboard from '@/components/ui/glassy-dashboard'
import { useSwkDarkTheme } from '../../swk/executive-analytics'

export default function SpatialCommandPage() {
  const dark = useSwkDarkTheme()

  return (
    <div className="fade-in grid gap-4 max-w-[1520px] mx-auto pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-[#e2e8f0] bg-card px-5 py-3.5 shadow-[0_4px_20px_-14px_rgba(11,31,42,0.12)]">
        <div className="flex items-center gap-3 min-w-0">
          <span className="size-10 rounded-2xl bg-[#0b1f2a] text-[#d4a752] grid place-items-center shrink-0">
            <Sparkles size={18} />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#b78328]">
              Spatial Executive Workspace
            </div>
            <h1 className="m-0 text-[18px] font-bold text-ink truncate">
              SWK OS Spatial Command · Dubai Glass Suite
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/dashboard" className="btn outline sm">
            <ArrowLeft size={14} /> Overview
          </Link>
          <Link to="/kpi" className="btn outline sm">
            <Gauge size={14} /> Executive KPIs
          </Link>
          <Link to="/pipeline" className="btn navy sm">
            <KanbanSquare size={14} /> Deal Pipeline
          </Link>
        </div>
      </div>

      <GlassyDashboard
        workspaceName="SWK OS"
        backgroundImage="/brand/web/uae-skyline-flagship.webp"
        backgroundCredit={{ label: 'SWK Properties · Dubai Skyline', href: '/market' }}
        panelFrost={14}
        initialTheme={dark ? 'dark' : 'light'}
        embedded
      />
    </div>
  )
}
void LayoutDashboard
