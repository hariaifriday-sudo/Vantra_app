import { CalendarCheck, Clock, MapPin } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

export interface AppointmentLookup {
  reference: string
  branch_name: string
  preferred_date: string
  preferred_time: string
  status: string
}

const STATUS_TONE: Record<string, string> = {
  Requested: 'bg-accent/15 text-accent',
  Confirmed: 'bg-positive/15 text-positive',
  Cancelled: 'bg-negative/15 text-negative',
}

export function MyAppointmentsCard({ appointments, dark }: { appointments: AppointmentLookup[]; dark: boolean }) {
  return (
    <div className="mt-2 w-full space-y-2">
      {appointments.map((a) => (
        <div key={a.reference} className={cn('rounded-xl border p-3 text-sm', dark ? 'border-white/10 bg-white/[0.04]' : 'border-border-hair bg-paper')}>
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 font-semibold">
              <CalendarCheck size={14} /> {a.branch_name}
            </p>
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', STATUS_TONE[a.status] ?? (dark ? 'bg-white/10 text-white/70' : 'bg-surface-2 text-ink-muted'))}>
              {a.status}
            </span>
          </div>
          <p className={cn('mt-1.5 flex items-center gap-1.5 text-xs', dark ? 'text-white/70' : 'text-ink-muted')}>
            <Clock size={13} className="shrink-0" /> {a.preferred_date} at {a.preferred_time}
          </p>
          <p className={cn('mt-1 flex items-center gap-1.5 text-[11px]', dark ? 'text-white/40' : 'text-ink-muted/70')}>
            <MapPin size={12} className="shrink-0" /> Ref <span className="font-mono">{a.reference}</span>
          </p>
        </div>
      ))}
    </div>
  )
}
