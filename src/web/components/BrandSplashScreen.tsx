import { useEffect, useRef, useState } from 'react'

/**
 * Luxury SWK Properties Art Deco animated launch splash screen.
 * Reproduces the uploaded launch video choreography natively at 60fps across Android, iOS & Web:
 *   1. Emerald, crimson & liquid-gold light ribbons spiral inward over Art Deco gold geometry
 *   2. Golden shockwave converges to materialize the SWK crest emblem
 *   3. Metallic gold loading bar animates LOADING... -> COMPLETE with bokeh sparks
 *   4. Radial golden spark burst transitions cleanly into Sign-In or Home
 */
export function BrandSplashScreen({
  ready,
  onDone,
}: {
  ready: boolean
  onDone: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState<'spiral' | 'loading' | 'complete' | 'exit'>('spiral')
  const readyRef = useRef(ready)
  readyRef.current = ready

  useEffect(() => {
    const start = performance.now()
    let raf = 0
    let doneCalled = false
    const finish = () => {
      if (doneCalled) return
      doneCalled = true
      onDone()
    }

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')

    // Deterministic bokeh sparks & starburst particles
    const embers = Array.from({ length: 56 }, (_, i) => ({
      angle: (i / 56) * Math.PI * 2 + (i % 5) * 0.13,
      dist: 40 + ((i * 37) % 190),
      speed: 0.35 + ((i * 19) % 100) / 110,
      size: 1.2 + ((i * 11) % 30) / 12,
      hue: i % 5 === 0 ? '#10b981' : i % 5 === 1 ? '#e11d48' : '#f3d27a',
      phase: i * 0.7,
    }))

    const resize = () => {
      if (!canvas) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(window.innerWidth * dpr)
      canvas.height = Math.round(window.innerHeight * dpr)
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const tick = (now: number) => {
      const elapsed = now - start

      // Timeline:
      // 0..800ms   : inward emerald/crimson/gold light spirals
      // 700..2150ms: crest revealed + metallic gold bar fills (holds at 92% if auth still loading)
      // 2150..2550ms: COMPLETE + golden radial spark burst
      // 2550..2850ms: fade-out transition
      let pct = 0
      if (elapsed > 500) {
        const rawPct = Math.min(100, ((elapsed - 500) / 1600) * 100)
        pct = readyRef.current ? rawPct : Math.min(92, rawPct)
      }
      setProgress(Math.round(pct))

      if (elapsed < 750) {
        setPhase('spiral')
      } else if (pct < 100) {
        setPhase('loading')
      } else if (elapsed < 2520) {
        setPhase('complete')
      } else {
        setPhase('exit')
      }

      if (ctx && canvas) {
        const w = window.innerWidth
        const h = window.innerHeight
        const cx = w / 2
        const cy = h * 0.44
        const scale = Math.min(w, h) / 420

        ctx.clearRect(0, 0, w, h)

        // Subtle Art Deco gold diamond geometry background
        ctx.save()
        ctx.strokeStyle = 'rgba(218, 178, 92, 0.14)'
        ctx.lineWidth = 1
        for (let k = 1; k <= 4; k++) {
          const r = k * 78 * scale
          ctx.beginPath()
          ctx.moveTo(cx, cy - r)
          ctx.lineTo(cx + r * 0.85, cy)
          ctx.lineTo(cx, cy + r)
          ctx.lineTo(cx - r * 0.85, cy)
          ctx.closePath()
          ctx.stroke()
        }
        // Vertical Art Deco skyscraper rays
        for (let xOff = -4; xOff <= 4; xOff++) {
          if (xOff === 0) continue
          const x = cx + xOff * 54 * scale
          ctx.beginPath()
          ctx.moveTo(x, 0)
          ctx.lineTo(x, h)
          ctx.strokeStyle = `rgba(218, 178, 92, ${Math.abs(xOff) % 2 === 0 ? 0.08 : 0.04})`
          ctx.stroke()
        }
        ctx.restore()

        // Phase 1 & 2: Three spiraling light ribbons (Emerald, Crimson, Liquid Gold)
        const ribbonProgress = Math.min(1, elapsed / 1350)
        const ribbonAlpha = elapsed < 1900 ? Math.max(0, 1 - Math.max(0, elapsed - 1250) / 650) : 0
        if (ribbonAlpha > 0.01) {
          const ribbons = [
            { color: '#10b981', glow: 'rgba(16, 185, 129, 0.7)', baseAngle: -Math.PI * 0.65 },
            { color: '#e11d48', glow: 'rgba(225, 29, 72, 0.7)', baseAngle: Math.PI * 0.15 },
            { color: '#f3d27a', glow: 'rgba(243, 210, 122, 0.85)', baseAngle: Math.PI * 0.85 },
          ]
          for (const rb of ribbons) {
            ctx.save()
            ctx.globalAlpha = ribbonAlpha
            ctx.shadowBlur = 18
            ctx.shadowColor = rb.glow
            ctx.strokeStyle = rb.color
            ctx.lineCap = 'round'
            ctx.lineWidth = 3.2 * scale
            ctx.beginPath()
            const steps = 42
            for (let s = 0; s <= steps; s++) {
              const frac = s / steps
              const t = Math.max(0, ribbonProgress - (1 - frac) * 0.42)
              if (t <= 0) continue
              const eased = 1 - Math.pow(1 - Math.min(1, t), 2.2)
              const radius = (1 - eased) * 195 * scale + 18 * scale
              const theta = rb.baseAngle + eased * Math.PI * 2.15
              const px = cx + Math.cos(theta) * radius
              const py = cy + Math.sin(theta) * radius * 0.92
              if (s === 0 || Math.max(0, ribbonProgress - (1 - (s - 1) / steps) * 0.42) <= 0) ctx.moveTo(px, py)
              else ctx.lineTo(px, py)
            }
            ctx.stroke()

            // Glowing comet head at ribbon tip
            const headEased = 1 - Math.pow(1 - ribbonProgress, 2.2)
            const hr = (1 - headEased) * 195 * scale + 18 * scale
            const hTheta = rb.baseAngle + headEased * Math.PI * 2.15
            ctx.fillStyle = '#fff9e6'
            ctx.beginPath()
            ctx.arc(cx + Math.cos(hTheta) * hr, cy + Math.sin(hTheta) * hr * 0.92, 3.6 * scale, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
          }
        }

        // Golden convergence shockwave & ambient light wing around 900ms–2000ms
        if (elapsed > 700 && elapsed < 2200) {
          const waveT = (elapsed - 700) / 1500
          const alpha = Math.sin(waveT * Math.PI) * 0.45
          const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 220 * scale)
          grad.addColorStop(0, `rgba(245, 212, 126, ${alpha})`)
          grad.addColorStop(0.55, `rgba(212, 167, 82, ${alpha * 0.35})`)
          grad.addColorStop(1, 'rgba(11, 20, 30, 0)')
          ctx.fillStyle = grad
          ctx.fillRect(0, 0, w, h)
        }

        // Ambient floating gold stardust & COMPLETE radial starburst
        const isBurst = pct >= 100 && elapsed >= 2050
        const burstT = isBurst ? Math.min(1, (elapsed - 2050) / 550) : 0
        for (const p of embers) {
          ctx.save()
          let px: number
          let py: number
          let alpha: number
          if (isBurst) {
            const spread = (35 + p.dist * 1.45 * burstT) * scale
            px = cx + Math.cos(p.angle) * spread
            py = cy + Math.sin(p.angle) * spread
            alpha = (1 - burstT * 0.75) * 0.92
          } else {
            const orbit = p.angle + elapsed * 0.00045 * p.speed
            const r = p.dist * scale * (0.85 + 0.15 * Math.sin(elapsed * 0.002 + p.phase))
            px = cx + Math.cos(orbit) * r
            py = cy + Math.sin(orbit) * r * 0.85
            alpha = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(elapsed * 0.005 + p.phase))
          }
          ctx.globalAlpha = Math.max(0, alpha)
          ctx.fillStyle = isBurst ? '#fbe39e' : p.hue
          ctx.shadowBlur = 8
          ctx.shadowColor = '#f3d27a'
          ctx.beginPath()
          ctx.arc(px, py, p.size * (isBurst ? 1.25 : 1), 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }
      }

      if (elapsed >= 2850 && readyRef.current) {
        finish()
        return
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [onDone])

  const crestVisible = phase !== 'spiral'

  return (
    <div
      role="status"
      aria-label="Launching SWK Properties OS"
      onClick={() => { if (ready && progress >= 35) onDone() }}
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden bg-[#0b141e] text-white select-none transition-opacity duration-400 ${
        phase === 'exit' ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{
        background: 'radial-gradient(ellipse at 50% 42%, #182638 0%, #0d1724 58%, #070d15 100%)',
      }}
    >
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />

      {/* Center SWK Art Deco Crest */}
      <div className="relative z-10 flex flex-col items-center px-6 -mt-8">
        <div
          className="relative flex items-center justify-center transition-all duration-700 ease-out"
          style={{
            transform: crestVisible ? 'scale(1)' : 'scale(0.68)',
            opacity: crestVisible ? 1 : 0,
            filter: phase === 'complete' ? 'drop-shadow(0 0 38px rgba(243,210,122,0.58))' : 'drop-shadow(0 18px 40px rgba(0,0,0,0.65))',
          }}
        >
          <div
            aria-hidden="true"
            className="absolute -inset-4 rounded-[38px] opacity-60 blur-2xl"
            style={{
              background: 'radial-gradient(circle, rgba(243,210,122,0.42) 0%, rgba(16,185,129,0.16) 50%, transparent 74%)',
            }}
          />
          <img
            src="/brand/swk-app-icon-rounded.png"
            alt="SWK Properties"
            className="relative size-[148px] sm:size-[176px] rounded-[34px] object-cover ring-1 ring-[#f3d27a]/45 shadow-2xl"
          />
        </div>

        {/* Metallic Gold Horizontal Progress Bar + Editorial Status */}
        <div className="mt-10 w-[240px] sm:w-[290px] flex flex-col items-center">
          <div className="relative h-[10px] w-full overflow-hidden rounded-full border border-[#d4a752]/55 bg-[#0e1926]/90 p-[1.5px] shadow-[0_0_24px_rgba(212,167,82,0.22)]">
            <div
              className="relative h-full rounded-full transition-[width] duration-150 ease-out"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #9a6c22 0%, #e5be67 55%, #fff3c4 100%)',
                boxShadow: '0 0 14px rgba(243,210,122,0.75)',
              }}
            >
              <span className="absolute right-0 top-1/2 -translate-y-1/2 size-2.5 rounded-full bg-white shadow-[0_0_12px_4px_rgba(255,243,196,0.95)]" />
            </div>
          </div>

          <div
            className="mt-4 text-[14px] sm:text-[15px] font-semibold uppercase tracking-[0.28em] text-[#f5dfb0] transition-all duration-300"
            style={{ fontFamily: "'Instrument Serif', 'Bricolage Grotesque Variable', Georgia, serif" }}
          >
            {phase === 'complete' || phase === 'exit' ? 'COMPLETE' : 'LOADING...'}
          </div>
          <div className="mt-1.5 text-[11px] font-medium tracking-[0.16em] uppercase text-[#94a3b8] text-center whitespace-nowrap">
            SWK Properties · Dubai RERA ORN 51517
          </div>
        </div>
      </div>
    </div>
  )
}
