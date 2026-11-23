import * as React from 'react'
import { cn } from '@/lib/utils'

export interface UiBadgeProps extends React.ComponentProps<'span'> {
  variant?: 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive'
}

const VARIANT_CLASSES: Record<NonNullable<UiBadgeProps['variant']>, string> = {
  default: 'bg-[#0b1f2a] text-white border-transparent',
  secondary: 'bg-[#f1f5f9] text-[#0b1f2a] border-[#e2e8f0]',
  outline: 'bg-transparent text-foreground border-border',
  success: 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]',
  warning: 'bg-[#fef7e6] text-[#92400e] border-[#fde68a]',
  destructive: 'bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]',
}

export function UiBadge({ className, variant = 'default', ...props }: UiBadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(
        'inline-flex items-center justify-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap transition-colors',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  )
}
