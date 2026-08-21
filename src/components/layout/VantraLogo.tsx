import { cn } from '@/lib/utils'

export function VantraLogo({ className, mark = false }: { className?: string; mark?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2 font-display font-bold', className)}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 4L12 20L21 4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!mark && <span>Vantra</span>}
    </div>
  )
}
