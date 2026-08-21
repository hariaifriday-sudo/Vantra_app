import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  SquaresFour,
  IdentificationCard,
  ShieldWarning,
  MagnifyingGlass,
  ScanSmiley,
  Tray,
  ChartLineUp,
  BookOpenText,
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { VantraLogo } from './VantraLogo'

const items = [
  { to: '/agent', label: 'Dashboard', icon: SquaresFour, end: true },
  { to: '/agent/kyc', label: 'KYC Review', icon: IdentificationCard },
  { to: '/agent/fraud', label: 'Fraud & Incidents', icon: ShieldWarning },
  { to: '/agent/aml', label: 'AML Monitoring', icon: MagnifyingGlass },
  { to: '/agent/documents', label: 'Document Processing', icon: ScanSmiley },
  { to: '/agent/cases', label: 'Case Inbox', icon: Tray },
  { to: '/agent/underwriting', label: 'Credit Underwriting', icon: ChartLineUp },
  { to: '/agent/knowledge', label: 'Knowledge & Policy', icon: BookOpenText },
]

export function AgentSidebar() {
  return (
    <aside className="flex w-60 shrink-0 flex-col rounded-3xl border border-border-hair bg-surface p-4">
      <div className="mb-6 flex items-center gap-2 px-2 text-ink">
        <VantraLogo />
        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">Ops</span>
      </div>
      <nav className="flex-1 space-y-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className="relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
          >
            {({ isActive }) => (
              <>
                {isActive ? (
                  <motion.span
                    layoutId="agent-nav-active"
                    className="absolute inset-0 rounded-xl bg-surface-2"
                    transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                  />
                ) : null}
                <item.icon size={18} className={cn('relative z-10', isActive && 'text-ink')} />
                <span className={cn('relative z-10', isActive && 'text-ink')}>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
