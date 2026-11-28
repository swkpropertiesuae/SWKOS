import { Suspense, lazy, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Maximize2, Palette, Save, Undo2, X } from 'lucide-react'
import { useUiCustomization } from '../lib/uiCustomization'

const CustomiseUiControls = lazy(() =>
  import('./CustomiseUiControls').then(m => ({ default: m.CustomiseUiControls })),
)

/**
 * Live Slide-Over Customise UI Drawer.
 * Opens right beside the active screen (Dashboard, Home, Shabib's Workspace, Pipeline)
 * so every color, font, size, highlight & pin updates live in real time.
 */
export function CustomiseUiDrawer() {
  const ui = useUiCustomization()

  useEffect(() => {
    if (!ui.drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ui.closeDrawer()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ui.drawerOpen, ui.closeDrawer])

  return (
    <AnimatePresence>
      {ui.drawerOpen && (
        <>
          {/* Light click-away scrim (subtle so user sees live UI changes underneath!) */}
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={ui.closeDrawer}
            className="swk-customise-drawer no-print fixed inset-0 z-[94] bg-black/20"
          />

          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Customise UI Studio"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            className="swk-customise-drawer swk-customise-studio-panel no-print fixed right-0 top-0 bottom-0 z-[95] flex w-full max-w-[440px] flex-col border-l border-[#d4a955]/40 bg-white text-[#0a0b0e] shadow-[-16px_0_60px_rgba(10,11,14,0.28)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-2 border-b border-black/10 bg-[#0a0b0e] px-4 py-3.5 text-white shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="grid size-9 place-items-center rounded-xl bg-[#d4a955]/20 text-[#ebc97c] border border-[#d4a955]/45 shrink-0">
                  <Palette size={17} />
                </span>
                <div className="min-w-0">
                  <div className="text-[14px] font-bold tracking-[-0.02em] text-white leading-tight">Customise UI</div>
                  <div className="text-[11px] text-white/70 truncate">Colors, Fonts, Highlights, Pin &amp; Drag</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Link
                  to="/customise-ui"
                  onClick={ui.closeDrawer}
                  title="Open Full Customise UI Studio"
                  aria-label="Open Full Customise UI Studio"
                  className="grid size-8 place-items-center rounded-lg border border-white/15 bg-white/10 text-white no-underline hover:bg-[#d4a955] hover:text-[#0a0b0e]"
                >
                  <Maximize2 size={14} />
                </Link>
                <button
                  type="button"
                  onClick={ui.closeDrawer}
                  aria-label="Close Customise UI"
                  className="grid size-8 place-items-center rounded-lg border border-white/15 bg-white/10 text-white cursor-pointer hover:bg-white/20"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Scrollable 5-Tab Controls */}
            <div className="flex-1 overflow-y-auto p-4">
              <Suspense fallback={<div className="p-6 text-center text-xs text-muted">Loading Customise UI…</div>}>
                <CustomiseUiControls compact />
              </Suspense>
            </div>

            {/* Sticky Action Footer */}
            <div className="flex items-center justify-between gap-2 border-t border-black/10 bg-[#faf9f6] px-4 py-3 shrink-0">
              <button
                type="button"
                disabled={!ui.canUndo}
                onClick={ui.undoTheme}
                className="inline-flex items-center gap-1.5 rounded-xl border border-black/15 bg-white px-3 py-2 text-xs font-bold text-[#0a0b0e] cursor-pointer disabled:opacity-40"
              >
                <Undo2 size={13} /> Undo
              </button>
              <button
                type="button"
                onClick={() => void ui.saveNow()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0a0b0e] px-4 py-2 text-xs font-bold text-[#ebc97c] border border-[#d4a955]/60 cursor-pointer"
              >
                <Save size={13} /> {ui.saving ? 'Saving…' : 'Save & Sync'}
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
