import { useEffect, useState } from 'react'

/**
 * Serene Swiss Architectural SWK Properties Launch Veil — exact visual match to swkpropertiesuae.com.
 * Luminous sky-ice gradient canvas + architectural vertical hairline grid + centered SWK crest +
 * crisp hairline obsidian loading progress bar. Fast, refined, corporate luxury.
 */
export function BrandSplashScreen({
  ready,
  onDone,
}: {
  ready: boolean
  onDone: () => void
}) {
  const [progress, setProgress] = useState(12)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    const start = performance.now()
    let raf = 0
    let finished = false
    const done = () => {
      if (finished) return
      finished = true
      onDone()
    }

    const tick = (now: number) => {
      const elapsed = now - start
      const raw = Math.min(100, 12 + (elapsed / 900) * 88)
      const pct = ready ? raw : Math.min(92, raw)
      setProgress(Math.round(pct))

      if (ready && pct >= 100 && elapsed >= 950) {
        setExiting(true)
        window.setTimeout(done, 240)
        return
      }
      if (elapsed > 3200) {
        done()
        return
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [ready, onDone])

  return (
    <div
      role="status"
      aria-label="Loading SWK Properties OS"
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center px-6 transition-opacity duration-300 ${
        exiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{
        background: 'linear-gradient(135deg, #eef8fd 0%, #d4effc 48%, #f5fbff 100%)',
      }}
    >
      <div className="bg-arch-grid pointer-events-none absolute inset-0 opacity-75" />

      <div className="relative z-10 flex w-full max-w-[360px] flex-col items-center rounded-[28px] border border-white/90 bg-white/86 px-8 py-9 text-center shadow-[0_28px_72px_rgba(12,56,96,0.12)] backdrop-blur-2xl">
        <div className="flex items-center gap-3">
          <img
            src="/brand/web/swk-icon-192.webp"
            alt="SWK Properties"
            className="h-12 w-12 object-contain drop-shadow-[0_6px_16px_rgba(12,56,96,0.16)]"
          />
          <img
            src="/brand/web/swk-logo-light.webp"
            alt="SWK Properties"
            className="h-10 w-auto object-contain"
          />
        </div>

        <div className="mt-5 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#475569]">
          <span className="inline-block h-[5px] w-[5px] bg-[#0e9f6e]" />
          <span>Dubai Real Estate Operating System</span>
        </div>

        <div className="mt-6 w-full">
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-black/[0.08]">
            <div
              className="h-full rounded-full bg-[#121212] transition-[width] duration-150 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-[#64748b]">
            <span>{progress >= 100 ? 'Ready' : 'Initializing workspace'}</span>
            <span className="tabular-nums text-[#121212]">{progress}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}
