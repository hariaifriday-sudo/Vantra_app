import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Tone = 'neutral' | 'positive' | 'negative' | 'watch' | 'accent'

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-muted',
  positive: 'bg-positive/12 text-positive',
  negative: 'bg-negative/12 text-negative',
  watch: 'bg-watch/14 text-watch',
  accent: 'bg-accent/15 text-accent',
}

export function Pill({
  tone = 'neutral',
  icon,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; icon?: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
        tones[tone],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  )
}

export function Eyebrow({ className, children, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border-hair bg-surface px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}
