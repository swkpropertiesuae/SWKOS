import { useEffect, useState } from 'react'

/**
 * Zero-Latency Premium White + Glossy Floating Obsidian-Black SWK Launch Veil.
 * Dismisses the instant workspace metadata is ready (no artificial delay).
 */
export function BrandSplashScreen({
  ready,
  onDone,
}: {
  ready: boolean
  onDone: () => void
}) {
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    if (!ready) {
      const safety = window.setTimeout(() => {
        setExiting(true)
        window.setTimeout(onDone, 140)
      }, 1400)
      return () => clearTimeout(safety)
    }
    setExiting(true)
    const t = window.setTimeout(onDone, 140)
    return () => clearTimeout(t)
  }, [ready, onDone])

  return (
    <div
      role="status"
      aria-label="Opening SWK Properties OS"
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center px-6 transition-opacity duration-150 ${
        exiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{ background: '#ffffff' }}
    >
      <div className="swk-gloss-black relative z-10 flex w-full max-w-[360px] flex-col items-center rounded-[28px] px-8 py-9 text-center">
        <img
          src="/brand/swk-logo.png"
          alt="SWK Properties"
          className="h-24 w-auto object-contain drop-shadow-[0_10px_28px_rgba(212,169,85,0.28)]"
        />
        <div className="mt-4 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#ebc97c]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#10b981]" />
          <span>Dubai Real Estate Operating System</span>
        </div>
        <div className="mt-5 h-[3px] w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full w-full rounded-full transition-transform duration-150"
            style={{
              background: 'linear-gradient(90deg, #d4a955 0%, #ebc97c 45%, #1e6b43 76%, #96202f 100%)',
            }}
          />
        </div>
      </div>
    </div>
  )
}
