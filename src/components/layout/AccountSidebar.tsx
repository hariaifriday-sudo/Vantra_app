import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChartPieSlice, CreditCard, House, IdentificationCard, ArrowsLeftRight, PiggyBank, Bell, Gear } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { VantraLogo } from './VantraLogo'

const items = [
  { to: '/app', label: 'Dashboard', icon: House, end: true },
  { to: '/app/accounts', label: 'Accounts', icon: ChartPieSlice },
  { to: '/app/transfers', label: 'Transfers', icon: ArrowsLeftRight },
  { to: '/app/cards', label: 'Cards', icon: CreditCard },
  { to: '/app/loans', label: 'Loans & Goals', icon: PiggyBank },
  { to: '/app/kyc', label: 'KYC Center', icon: IdentificationCard },
  { to: '/app/notifications', label: 'Notifications', icon: Bell },
]

export function AccountSidebar() {
  return (
    <aside className="flex w-[76px] shrink-0 flex-col items-center gap-1 rounded-3xl bg-accent py-5">
      <div className="mb-6 grid h-9 w-9 place-items-center rounded-xl bg-accent-ink/10 text-accent-ink">
        <VantraLogo mark className="text-accent-ink" />
      </div>
      <nav className="flex flex-1 flex-col items-center gap-1">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} title={item.label} className="relative grid h-11 w-11 place-items-center rounded-2xl text-accent-ink/70 transition-colors hover:text-accent-ink">
            {({ isActive }) => (
              <>
                {isActive ? (
                  <motion.span
                    layoutId="account-nav-active"
                    className="absolute inset-0 rounded-2xl bg-accent-ink/15"
                    transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                  />
                ) : null}
                <item.icon size={20} weight="bold" className={cn('relative z-10', isActive && 'text-accent-ink')} />
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <NavLink to="/app/settings" title="Settings" className="relative grid h-11 w-11 place-items-center rounded-2xl text-accent-ink/70 hover:bg-accent-ink/10 hover:text-accent-ink">
        {({ isActive }) => (
          <>
            {isActive ? (
              <motion.span
                layoutId="account-nav-active"
                className="absolute inset-0 rounded-2xl bg-accent-ink/15"
                transition={{ type: 'spring', stiffness: 500, damping: 34 }}
              />
            ) : null}
            <Gear size={20} weight="bold" className={cn('relative z-10', isActive && 'text-accent-ink')} />
          </>
        )}
      </NavLink>
    </aside>
  )
}
