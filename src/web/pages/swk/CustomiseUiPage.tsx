import { Link } from 'react-router-dom'
import { ArrowLeft, Crown, Palette, Pin, Sparkles, Star } from 'lucide-react'
import { useUiCustomization } from '../../lib/uiCustomization'
import { CustomiseUiControls } from '../../components/CustomiseUiControls'
import { GlossyBlackCard, LogoPresenceBadge } from '../../components/ui/PremiumPrimitives'

export default function CustomiseUiPage() {
  const ui = useUiCustomization()

  return (
    <div className="mx-auto max-w-[1360px] space-y-6 pb-12">
      {/* Header Banner */}
      <GlossyBlackCard accent="tricolor" className="p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <LogoPresenceBadge subtitle="Live Workspace Designer" />
            <h1 className="m-0 font-display text-2xl sm:text-3xl font-bold text-white">
              Customise UI Studio
            </h1>
            <p className="m-0 max-w-2xl text-sm text-white/75">
              Change your workspace background, white &amp; glossy black cards, fonts, sizes, styles, highlight glow, and pin or drag your favorite shortcuts anywhere on screen.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ui.isOwner && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d4a955]/50 bg-[#d4a955]/15 px-3 py-1.5 text-xs font-bold text-[#ebc97c]">
                <Crown size={13} /> Owner · Can Set Company Default
              </span>
            )}
            <Link
              to="/home"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold text-white no-underline hover:bg-[#d4a955] hover:text-[#0a0b0e]"
            >
              <ArrowLeft size={14} /> Back to Home
            </Link>
          </div>
        </div>
      </GlossyBlackCard>

      {/* Main Split: Controls + Live Interactive Preview */}
      <div className="grid gap-6 lg:grid-cols-12 items-start">
        <div className="lg:col-span-7 rounded-[24px] border border-black/10 bg-white p-5 sm:p-6 shadow-sm">
          <CustomiseUiControls />
        </div>

        {/* Live Specimen Playground */}
        <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-24">
          <div className="card space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted">
                <Palette size={14} /> Live Theme Preview
              </span>
              <span className="rounded-full border border-line px-2.5 py-0.5 font-mono text-[11px] font-bold">
                {ui.prefs.typography.fontSizePx}px · {ui.prefs.layout.density}
              </span>
            </div>

            <div>
              <h2 className="m-0">Executive Dubai Portfolio</h2>
              <p className="mt-1.5 mb-0 text-sm">
                This live card reflects your exact background, card fill, heading font, body font, size, weight, style, corner radius, and highlight ring in real time.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="swk-ui-highlighted rounded-2xl border p-3.5">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.12em]">
                  <span className="inline-flex items-center gap-1">
                    <Star size={12} className="fill-current" /> Highlighted Deal
                  </span>
                  <Sparkles size={12} />
                </div>
                <div className="mt-1.5 font-mono text-lg font-bold">AED 4,850,000</div>
                <div className="text-xs text-muted">Dubai Creek Harbour · 8.4% ROI</div>
              </div>

              <div className="swk-gloss-black rounded-2xl p-3.5 text-white">
                <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#ebc97c]">
                  Glossy Dark Card
                </div>
                <div className="mt-1.5 font-mono text-lg font-bold text-white">12 Active Deals</div>
                <div className="text-xs text-white/75">RERA ORN 51517</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="button" className="btn">
                Primary Action Button
              </button>
              <button type="button" className="btn outline">
                Secondary Outline
              </button>
            </div>

            <div className="rounded-xl border border-line p-3 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <Pin size={13} /> Active Pinning Setup
              </div>
              <div className="text-muted">
                Docked Bar: <b className="capitalize">{ui.prefs.pinning.dockPosition}</b> · Pinned Shortcuts:{' '}
                <b>{ui.prefs.pinning.pinnedItems.length}</b> · Floating Quick-Pad:{' '}
                <b>{ui.prefs.pinning.floatingPad.enabled ? 'Visible (Drag Anywhere)' : 'Off'}</b>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
