import { Check } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center">
      {steps.map((label, i) => (
        <div key={label} className="flex flex-1 items-center last:flex-none">
          <div className="flex flex-col items-center gap-2">
            <div
              className={cn(
                'grid h-9 w-9 place-items-center rounded-full border-2 text-sm font-semibold transition-colors',
                i < current && 'border-positive bg-positive text-white',
                i === current && 'border-accent bg-accent text-accent-ink',
                i > current && 'border-border-hair bg-surface text-ink-muted',
              )}
            >
              {i < current ? <Check size={16} weight="bold" /> : i + 1}
            </div>
            <span className={cn('whitespace-nowrap text-xs font-medium', i <= current ? 'text-ink' : 'text-ink-muted')}>{label}</span>
          </div>
          {i < steps.length - 1 ? <div className={cn('mx-3 mb-5 h-0.5 flex-1 rounded-full', i < current ? 'bg-positive' : 'bg-border-hair')} /> : null}
        </div>
      ))}
    </div>
  )
}
