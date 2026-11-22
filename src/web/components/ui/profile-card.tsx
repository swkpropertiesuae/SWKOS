import type { ComponentType,ReactNode } from 'react'
import { cls } from '../../lib/format'

/**
 * Profile Card — ported from 21st.dev (@klyv-ui/profile-card) and restyled to the
 * swkpropertiesuae.com design system (obsidian ink, mint accent, 1rem radius, Switzer).
 * Same API as the original: full card (cover, avatar, bio, stats, links, actions) and a
 * compact single-row variant for directories. The name is a real heading and the stats
 * are a description list so screen readers read "Transactions, 140+" as a pair.
 */
export interface ProfileCardStat { label: string; value: ReactNode }
export interface ProfileCardLink { label: string; href: string; icon?: ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean | 'true' }> }
export type ProfileCardVariant = 'full' | 'compact'
export interface ProfileCardProps {
  name: string
  role?: ReactNode
  avatarSrc?: string
  coverSrc?: string
  bio?: ReactNode
  stats?: ProfileCardStat[]
  links?: ProfileCardLink[]
  primaryAction?: ReactNode
  secondaryAction?: ReactNode
  badge?: ReactNode
  variant?: ProfileCardVariant
  headingLevel?: 'h1' | 'h2' | 'h3' | 'h4'
  className?: string
}

const initialsOf = (name: string) => name.replace(/\(.*?\)/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]!.toUpperCase()).join('')

export function ProfileAvatar({ name, src, size = 'md', className }: { name: string; src?: string; size?: 'md' | 'lg' | 'xl'; className?: string }) {
  const px = size === 'xl' ? 'size-32 text-3xl' : size === 'lg' ? 'size-24 text-2xl' : 'size-12 text-sm'
  return (
    <span className={cls('relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#121212] font-semibold tracking-[-0.02em] text-[#51fec0]', px, className)}>
      {src ? <img src={src} alt="" loading="lazy" className="size-full object-cover object-top" /> : <span aria-hidden="true">{initialsOf(name)}</span>}
    </span>
  )
}

const DEFAULT_COVER = 'linear-gradient(135deg, #eef8fd 0%, #d4effc 48%, #f5fbff 100%)'

export function ProfileCard({ name, role, avatarSrc, coverSrc, bio, stats, links, primaryAction, secondaryAction, badge, variant = 'full', headingLevel: Heading = 'h3', className }: ProfileCardProps) {
  const actions = (primaryAction || secondaryAction) && (
    <div className={cls('flex items-center gap-2', variant === 'full' && 'w-full [&>*]:flex-1')}>{secondaryAction}{primaryAction}</div>
  )
  const linkRow = links && links.length > 0 && (
    <ul className="m-0 flex list-none flex-wrap items-center justify-center gap-1 p-0">
      {links.map(link => {
        const Icon = link.icon
        return (
          <li key={link.href}>
            <a href={link.href} target={link.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" aria-label={Icon ? link.label : undefined} title={Icon ? link.label : undefined}
              className={cls('inline-flex items-center justify-center rounded-full text-[#4a4a4a] transition-colors hover:bg-[#f5f5f5] hover:text-[#0e9f6e]', Icon ? 'size-9' : 'h-8 px-3 text-[12px] font-semibold')}>
              {Icon ? <Icon size={16} strokeWidth={2} aria-hidden="true" /> : link.label}
            </a>
          </li>
        )
      })}
    </ul>
  )

  if (variant === 'compact') {
    return (
      <div className={cls('web-card flex items-center gap-3 p-4', className)}>
        <ProfileAvatar name={name} src={avatarSrc} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Heading className="m-0 truncate text-[15px] font-medium text-[#121212]">{name}</Heading>
          {role && <span className="truncate text-[12px] text-[#8b8b8b]">{role}</span>}
        </div>
        {badge}
        {linkRow}
        {actions}
      </div>
    )
  }

  return (
    <div className={cls('web-card overflow-hidden', className)}>
      <div className="relative h-28" style={{ background: coverSrc ? undefined : DEFAULT_COVER }}>
        {coverSrc && <img src={coverSrc} alt="" className="size-full object-cover" />}
        <div aria-hidden="true" className="bg-arch-grid absolute inset-0" />
        {badge && <div className="absolute right-3 top-3">{badge}</div>}
      </div>
      <div className="flex flex-col items-center gap-4 px-6 pb-6 text-center">
        <ProfileAvatar name={name} src={avatarSrc} size="lg" className="-mt-12 ring-4 ring-white shadow-[0_10px_28px_rgba(12,56,96,0.14)]" />
        <div className="flex flex-col items-center gap-1.5">
          <Heading className="m-0 text-[22px] font-medium tracking-[-0.035em] text-[#121212]">{name}</Heading>
          {role && <span className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-[#8b8b8b]">{role}</span>}
        </div>
        {bio && <p className="m-0 max-w-[44ch] text-[14px] leading-relaxed text-[#4a4a4a]">{bio}</p>}
        {stats && stats.length > 0 && (
          <dl className="m-0 grid w-full auto-cols-fr grid-flow-col divide-x divide-[#e5e5e5] rounded-2xl border border-[#e5e5e5] py-3">
            {stats.map(stat => (
              <div key={stat.label} className="flex flex-col-reverse items-center gap-1 px-2">
                <dt className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#8b8b8b]">{stat.label}</dt>
                <dd className="m-0 text-[17px] font-medium tabular-nums tracking-[-0.02em] text-[#121212]">{stat.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {linkRow}
        {actions}
      </div>
    </div>
  )
}

export default ProfileCard
