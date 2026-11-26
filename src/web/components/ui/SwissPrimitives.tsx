/**
 * SWK OS Swiss Architectural UI Primitives — Direct design language continuation of swkpropertiesuae.com.
 * Luminous frosted glass, architectural 4-corner BracketButton / BracketLink, crisp SectionEyebrow
 * with 5px square obsidian dot, Switzer tight-tracked SplitHeading, SwissCarousel horizontal deck,
 * and clean luminous SwissHeroHeader (replacing dark multi-color banners).
 */
import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cls } from '../../lib/format'

export const SWISS_EASE = [0.22, 1, 0.36, 1] as const

type BracketVariant = 'light' | 'dark' | 'white'
type BracketSize = 'sm' | 'md' | 'lg'

const BRACKET_STYLES: Record<BracketVariant, { base: string; bracket: string }> = {
  light: {
    base: 'bg-white/90 text-[#121212] hover:bg-[#121212] hover:text-white border border-black/[0.08] shadow-[0_8px_24px_rgba(12,56,96,0.08)] backdrop-blur-xl',
    bracket: 'border-[#121212]',
  },
  dark: {
    base: 'bg-[#121212] text-white hover:bg-[#222222] border border-[#121212] shadow-[0_12px_28px_rgba(18,18,18,0.22)]',
    bracket: 'border-[#121212]',
  },
  white: {
    base: 'bg-white text-[#121212] hover:bg-[#f4f7fa] border border-black/[0.08]',
    bracket: 'border-white/75',
  },
}

const BRACKET_SIZES: Record<BracketSize, string> = {
  sm: 'px-4 py-2 text-[11px] tracking-[0.14em]',
  md: 'px-5 py-2.5 text-[11.5px] tracking-[0.15em]',
  lg: 'px-7 py-3.5 text-[12px] tracking-[0.16em]',
}

function CornerBrackets({ colorClass }: { colorClass: string }) {
  const base =
    'pointer-events-none absolute w-[7px] h-[7px] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] opacity-70 group-hover:opacity-100'
  return (
    <>
      <span aria-hidden className={cls(base, 'top-[-3px] left-[-3px] border-t-[1.5px] border-l-[1.5px] group-hover:top-[-5px] group-hover:left-[-5px]', colorClass)} />
      <span aria-hidden className={cls(base, 'top-[-3px] right-[-3px] border-t-[1.5px] border-r-[1.5px] group-hover:top-[-5px] group-hover:right-[-5px]', colorClass)} />
      <span aria-hidden className={cls(base, 'bottom-[-3px] left-[-3px] border-b-[1.5px] border-l-[1.5px] group-hover:bottom-[-5px] group-hover:left-[-5px]', colorClass)} />
      <span aria-hidden className={cls(base, 'bottom-[-3px] right-[-3px] border-b-[1.5px] border-r-[1.5px] group-hover:bottom-[-5px] group-hover:right-[-5px]', colorClass)} />
    </>
  )
}

export function BracketLink({
  to,
  children,
  variant = 'light',
  size = 'md',
  className,
  external,
}: {
  to: string
  children: ReactNode
  variant?: BracketVariant
  size?: BracketSize
  className?: string
  external?: boolean
}) {
  const v = BRACKET_STYLES[variant]
  const classes = cls(
    'group relative inline-flex items-center justify-center gap-2 font-medium uppercase leading-none whitespace-nowrap rounded-full transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] no-underline cursor-pointer',
    v.base,
    BRACKET_SIZES[size],
    className,
  )
  if (external) {
    return (
      <a href={to} target="_blank" rel="noopener noreferrer" className={classes}>
        <CornerBrackets colorClass={v.bracket} />
        <span className="relative z-10 inline-flex items-center gap-1.5">{children}</span>
      </a>
    )
  }
  return (
    <Link to={to} className={classes}>
      <CornerBrackets colorClass={v.bracket} />
      <span className="relative z-10 inline-flex items-center gap-1.5">{children}</span>
    </Link>
  )
}

export function BracketButton({
  children,
  variant = 'dark',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BracketVariant
  size?: BracketSize
}) {
  const v = BRACKET_STYLES[variant]
  return (
    <button
      type={type}
      {...rest}
      className={cls(
        'group relative inline-flex items-center justify-center gap-2 font-medium uppercase leading-none whitespace-nowrap rounded-full transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed',
        v.base,
        BRACKET_SIZES[size],
        className,
      )}
    >
      <CornerBrackets colorClass={v.bracket} />
      <span className="relative z-10 inline-flex items-center gap-1.5">{children}</span>
    </button>
  )
}

/** Exact swkpropertiesuae.com architectural eyebrow with 5px square obsidian/emerald dot */
export function SectionEyebrow({
  children,
  className,
  accent = 'obsidian',
}: {
  children: ReactNode
  className?: string
  accent?: 'obsidian' | 'emerald' | 'mint'
}) {
  const dot =
    accent === 'emerald'
      ? 'bg-[#0e9f6e]'
      : accent === 'mint'
        ? 'bg-[#51fec0]'
        : 'bg-[#121212]'
  return (
    <div
      className={cls(
        'inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#475569]',
        className,
      )}
    >
      <span className={cls('inline-block h-[5px] w-[5px] shrink-0', dot)} aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}

/** Crisp live pulsing status indicator matching swkpropertiesuae.com */
export function LiveStatusDot({
  onDark = false,
  className,
}: {
  onDark?: boolean
  className?: string
}) {
  const color = onDark ? 'bg-[#51fec0]' : 'bg-[#0e9f6e]'
  return (
    <span className={cls('relative inline-flex h-2 w-2 shrink-0', className)} aria-hidden="true">
      <span className={cls('absolute inline-flex h-full w-full animate-ping rounded-full opacity-70', color)} />
      <span className={cls('relative inline-flex h-2 w-2 rounded-full', color)} />
    </span>
  )
}

/** Frosted-glass architectural surface panel */
export function GlassPanel({
  children,
  className,
  id,
}: {
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <section
      id={id}
      className={cls(
        'relative rounded-[28px] border border-white/85 bg-white/86 shadow-[0_20px_56px_rgba(12,56,96,0.085)] backdrop-blur-2xl',
        className,
      )}
    >
      {children}
    </section>
  )
}

/**
 * Luminous Swiss Architectural Page Hero — replaces heavy dark navy/purple/charcoal circus banners
 * across Dashboard, Command Center, Shabib's Corner, Master Log, Pipeline, Mortgage Desk, Client Vault & AI Lab.
 */
export function SwissHeroHeader({
  eyebrow,
  badge,
  title,
  mutedTitle,
  subtitle,
  actions,
  children,
  className,
}: {
  eyebrow: ReactNode
  badge?: ReactNode
  title: ReactNode
  mutedTitle?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: SWISS_EASE }}
      className={cls(
        'relative overflow-hidden rounded-[28px] border border-white/88 bg-white/86 p-6 sm:p-7 shadow-[0_24px_64px_rgba(12,56,96,0.10)] backdrop-blur-2xl',
        className,
      )}
    >
      {/* Subtle architectural hairline accents */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[#121212]/15 to-transparent"
      />
      <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <SectionEyebrow>{eyebrow}</SectionEyebrow>
            {badge}
          </div>
          <h1 className="mt-2.5 m-0 text-[26px] sm:text-[34px] font-medium tracking-[-0.04em] text-[#121212] leading-[1.06]">
            {title}
            {mutedTitle && <span className="font-normal text-[#64748b]"> {mutedTitle}</span>}
          </h1>
          {subtitle && (
            <p className="mt-2 mb-0 max-w-3xl text-[14px] leading-relaxed text-[#475569]">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-3.5 shrink-0">
            {actions}
          </div>
        )}
      </div>
      {children && <div className="relative z-10 mt-5">{children}</div>}
    </motion.section>
  )
}

/**
 * Interactive Horizontal Carousel matching swkpropertiesuae.com's GalleryHoverCarousel & SignatureHorizontalDeck.
 * Includes progress indicator bar, accessible prev/next circular buttons that invert to obsidian + mint on hover,
 * and smooth snap-scroll track with zero horizontal page bleed.
 */
export function SwissCarousel({
  ariaLabel,
  hint = 'SCROLL OR USE ARROWS',
  headerLeft,
  headerRight,
  children,
  className,
  trackClassName,
}: {
  ariaLabel: string
  hint?: string
  headerLeft?: ReactNode
  headerRight?: ReactNode
  children: ReactNode
  className?: string
  trackClassName?: string
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(true)
  const [progress, setProgress] = useState(0)

  const updateScroll = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const maxScroll = Math.max(el.scrollWidth - el.clientWidth, 1)
    setCanPrev(el.scrollLeft > 8)
    setCanNext(el.scrollLeft < maxScroll - 8)
    setProgress(Math.min(1, Math.max(0, el.scrollLeft / maxScroll)))
  }, [])

  useEffect(() => {
    updateScroll()
    const el = scrollerRef.current
    if (!el) return
    const ro = new ResizeObserver(updateScroll)
    ro.observe(el)
    window.addEventListener('resize', updateScroll)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', updateScroll)
    }
  }, [updateScroll, children])

  const scrollByStep = (dir: -1 | 1) => {
    const el = scrollerRef.current
    if (!el) return
    const step = Math.max(260, Math.floor(el.clientWidth * 0.78))
    el.scrollBy({ left: dir * step, behavior: 'smooth' })
  }

  return (
    <div className={cls('relative min-w-0', className)} role="region" aria-label={ariaLabel}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {headerLeft}
          <div className="hidden sm:flex items-center gap-2.5 flex-1 max-w-[240px]">
            <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-[#0b1f33]/10">
              <div
                className="h-full rounded-full bg-[#121212] transition-all duration-300"
                style={{ width: `${Math.max(22, Math.round(progress * 100))}%` }}
              />
            </div>
            <span className="font-mono text-[10px] font-medium text-[#64748b] tracking-[0.12em] uppercase whitespace-nowrap">
              {hint}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {headerRight}
          <button
            type="button"
            onClick={() => scrollByStep(-1)}
            disabled={!canPrev}
            aria-label={`Previous ${ariaLabel}`}
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/85 bg-white/90 text-[#121212] shadow-[0_8px_24px_rgba(12,56,96,0.09)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-[#121212] hover:bg-[#121212] hover:text-[#51fec0] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollByStep(1)}
            disabled={!canNext}
            aria-label={`Next ${ariaLabel}`}
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/85 bg-white/90 text-[#121212] shadow-[0_8px_24px_rgba(12,56,96,0.09)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-[#121212] hover:bg-[#121212] hover:text-[#51fec0] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        onScroll={updateScroll}
        className={cls(
          'flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          trackClassName,
        )}
      >
        {children}
      </div>
    </div>
  )
}
