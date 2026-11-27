import { useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'

/**
 * 21st.dev-inspired Glossy Floating Shining Obsidian-Black Detail Card
 * Features:
 *  - Piano-black glossy gradient surface with top specular glass reflection
 *  - Mouse-tracking Imperial Gold radial spotlight glow
 *  - SWK Logo tricolor top hairline accent (Gold → UAE Emerald → UAE Crimson)
 *  - Crisp floating drop shadow & subtle hover lift
 */
export function GlossyBlackCard({
  children,
  className = '',
  spotlight = true,
  accent = 'tricolor',
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
  spotlight?: boolean
  accent?: 'gold' | 'emerald' | 'crimson' | 'tricolor'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false })

  const topBar =
    accent === 'gold'
      ? 'linear-gradient(90deg, #9e7427 0%, #ebc97c 50%, #9e7427 100%)'
      : accent === 'emerald'
        ? 'linear-gradient(90deg, #13472c 0%, #34d399 50%, #1e6b43 100%)'
        : accent === 'crimson'
          ? 'linear-gradient(90deg, #6d141f 0%, #f43f5e 50%, #96202f 100%)'
          : 'linear-gradient(90deg, #96202f 0%, #d4a955 50%, #1e6b43 100%)'

  const spotRgba =
    accent === 'emerald'
      ? 'rgba(52, 211, 153, 0.16)'
      : accent === 'crimson'
        ? 'rgba(244, 63, 94, 0.16)'
        : 'rgba(235, 201, 124, 0.18)'

  return (
    <div
      ref={ref}
      onMouseMove={e => {
        if (!spotlight || !ref.current) return
        const r = ref.current.getBoundingClientRect()
        setPos({ x: e.clientX - r.left, y: e.clientY - r.top, active: true })
      }}
      onMouseLeave={() => setPos(p => ({ ...p, active: false }))}
      className={`swk-gloss-black rounded-[24px] p-5 text-white ${className}`}
      {...rest}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px] z-20"
        style={{ background: topBar }}
      />
      {spotlight && pos.active && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 transition-opacity duration-200"
          style={{
            background: `radial-gradient(280px circle at ${pos.x}px ${pos.y}px, ${spotRgba}, transparent 65%)`,
          }}
        />
      )}
      <div className="relative z-10 h-full flex flex-col justify-between">{children}</div>
    </div>
  )
}

/**
 * 21st.dev-inspired Shimmer Hover Button with SWK Logo Gold / Emerald / Crimson Highlights
 */
export function ShineButton({
  variant = 'obsidian',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'obsidian' | 'gold' | 'emerald' | 'crimson' | 'white'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}) {
  const sizeCls =
    size === 'sm'
      ? 'min-h-[34px] px-3.5 py-1.5 text-xs'
      : size === 'lg'
        ? 'min-h-[46px] px-6 py-2.5 text-sm'
        : 'min-h-[40px] px-4.5 py-2 text-[13px]'

  const variantCls =
    variant === 'gold'
      ? 'bg-gradient-to-br from-[#e7c579] via-[#d4a955] to-[#a97c29] text-[#0a0b0e] border-[#ebc97c] hover:brightness-105'
      : variant === 'emerald'
        ? 'bg-gradient-to-br from-[#257e4f] via-[#1e6b43] to-[#13472c] text-white border-[#d4a955]/45 hover:border-[#ebc97c]'
        : variant === 'crimson'
          ? 'bg-gradient-to-br from-[#b42638] via-[#96202f] to-[#6d141f] text-white border-[#ebc97c]/40 hover:border-[#ebc97c]'
          : variant === 'white'
            ? 'bg-white text-[#0a0b0e] border-[#0a0b0e]/15 hover:bg-[#0a0b0e] hover:text-[#ebc97c] hover:border-[#d4a955]'
            : 'bg-gradient-to-br from-[#22242d] via-[#0b0c10] to-[#050507] text-[#ebc97c] border-[#d4a955]/45 hover:text-white hover:border-[#ebc97c]'

  return (
    <button
      {...rest}
      className={`group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full border font-semibold tracking-[0.01em] shadow-[0_14px_30px_-12px_rgba(10,11,14,0.48)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${sizeCls} ${variantCls} ${className}`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -translate-x-[130%] bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-500 group-hover:translate-x-[130%]"
      />
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </button>
  )
}

/**
 * Compact SWK Logo Presence Badge — visibly carries the official Crest + Gold / Emerald / Crimson brand bar
 */
export function LogoPresenceBadge({
  label = 'SWK PROPERTIES · ORN 51517',
  subtitle,
  dark = false,
}: {
  label?: string
  subtitle?: string
  dark?: boolean
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em] ${
        dark
          ? 'border-[#d4a955]/40 bg-white/[0.06] text-[#ebc97c]'
          : 'border-[#d4a955]/45 bg-[#faf7ef] text-[#0a0b0e]'
      }`}
    >
      <img src="/brand/web/swk-icon-192.webp?v=swk-8k-v1" alt="" className="h-4 w-4 object-contain" />
      <span>{label}</span>
      {subtitle && <span className={dark ? 'text-white/70 font-medium' : 'text-[#5b616e] font-medium'}>· {subtitle}</span>}
      <span className="inline-flex items-center gap-0.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[#96202f]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#d4a955]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#1e6b43]" />
      </span>
    </span>
  )
}
