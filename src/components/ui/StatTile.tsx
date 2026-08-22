import type { ReactNode } from 'react'
import { ArrowUpRight, TrendUp, TrendDown } from '@phosphor-icons/react'
import { cn, formatCurrency } from '@/lib/utils'
import { AnimatedNumber } from './AnimatedNumber'
import { Card } from './Card'

interface StatTileProps {
  label: string
  value: string
  /** When given, the tile tweens to this value on change instead of the static `value` string. */
  numericValue?: number
  delta?: { value: string; positive: boolean }
  tint?: 'mint' | 'lavender' | 'sky' | 'none'
  period?: string
  action?: ReactNode
  className?: string
}

const tints: Record<string, string> = {
  mint: 'bg-mint/45',
  lavender: 'bg-lavender/35',
  sky: 'bg-sky/40',
  none: 'bg-surface',
}

export function StatTile({ label, value, numericValue, delta, tint = 'none', period, action, className }: StatTileProps) {
  return (
    <Card className={cn('group relative overflow-hidden p-5', tints[tint], className)}>
      <div className="flex items-start justify-between">
        <span className="text-sm font-medium text-ink-muted">{label}</span>
        {period ? (
          <span className="rounded-full bg-surface/70 px-2.5 py-1 text-xs font-medium text-ink-muted">{period}</span>
        ) : null}
      </div>
      <div className="mt-4 flex items-end justify-between">
        <span className="font-display tabular-nums text-3xl font-bold text-ink">
          {numericValue !== undefined ? <AnimatedNumber value={numericValue} format={formatCurrency} /> : value}
        </span>
        {action ?? (
          <span className="grid h-9 w-9 place-items-center rounded-full bg-surface/70 text-ink transition-transform duration-200 group-hover:translate-x-0.5">
            <ArrowUpRight size={16} weight="bold" />
          </span>
        )}
      </div>
      {delta ? (
        <div className={cn('mt-2 inline-flex items-center gap-1 text-xs font-semibold', delta.positive ? 'text-positive' : 'text-negative')}>
          {delta.positive ? <TrendUp size={14} weight="bold" /> : <TrendDown size={14} weight="bold" />}
          {delta.value}
        </div>
      ) : null}
    </Card>
  )
}
