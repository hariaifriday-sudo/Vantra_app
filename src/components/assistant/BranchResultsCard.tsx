import { ArrowSquareOut, Clock, MapPin, Phone } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import type { BranchOut } from '@/lib/api'

export function BranchResultsCard({ branches, dark }: { branches: BranchOut[]; dark: boolean }) {
  return (
    <div className="mt-2 w-full space-y-2">
      {branches.map((b) => (
        <div key={b.name} className={cn('rounded-xl border p-3 text-sm', dark ? 'border-white/10 bg-white/[0.04]' : 'border-border-hair bg-paper')}>
          <p className="font-semibold">{b.name}</p>
          <p className={cn('mt-1 flex items-start gap-1.5 text-xs', dark ? 'text-white/70' : 'text-ink-muted')}>
            <MapPin size={13} className="mt-0.5 shrink-0" /> {b.address}
          </p>
          <p className={cn('mt-1 flex items-center gap-1.5 text-xs', dark ? 'text-white/70' : 'text-ink-muted')}>
            <Phone size={13} className="shrink-0" /> {b.phone}
          </p>
          <p className={cn('mt-1 flex items-center gap-1.5 text-xs', dark ? 'text-white/70' : 'text-ink-muted')}>
            <Clock size={13} className="shrink-0" /> {b.hours}
          </p>
          <a
            href={b.maps_url}
            target="_blank"
            rel="noreferrer"
            className={cn(
              'mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
              dark ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-accent/15 text-accent hover:bg-accent/25',
            )}
          >
            Open in Google Maps <ArrowSquareOut size={12} weight="bold" />
          </a>
        </div>
      ))}
    </div>
  )
}
