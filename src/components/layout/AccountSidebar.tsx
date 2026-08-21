import { NavLink } from 'react-router-dom'
import { ChartPieSlice, CreditCard, House, IdentificationCard, ArrowsLeftRight, Bank, Gear } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { VantraLogo } from './VantraLogo'

const items = [
  { to: '/app', label: 'Dashboard', icon: House, end: true },
  { to: '/app/accounts', label: 'Accounts', icon: ChartPieSlice },
  { to: '/app/transfers', label: 'Transfers', icon: ArrowsLeftRight },
  { to: '/app/cards', label: 'Cards', icon: CreditCard },
  { to: '/app/loans', label: 'Loans & Goals', icon: Bank },
  { to: '/app/kyc', label: 'KYC Center', icon: IdentificationCard },
]

export function AccountSidebar() {
  return (
    <aside className="flex w-[76px] shrink-0 flex-col items-center gap-1 rounded-3xl bg-accent py-5">
      <div className="mb-6 grid h-9 w-9 place-items-center rounded-xl bg-accent-ink/10 text-accent-ink">
        <VantraLogo mark className="text-accent-ink" />
      </div>
      <nav className="flex flex-1 flex-col items-center gap-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={item.label}
            className={({ isActive }) =>
              cn(
                'grid h-11 w-11 place-items-center rounded-2xl text-accent-ink/70 transition-colors',
                isActive ? 'bg-accent-ink/15 text-accent-ink' : 'hover:bg-accent-ink/10 hover:text-accent-ink',
              )
            }
          >
            <item.icon size={20} weight="bold" />
          </NavLink>
        ))}
      </nav>
      <NavLink
        to="/app/settings"
        title="Settings"
        className={({ isActive }) =>
          cn('grid h-11 w-11 place-items-center rounded-2xl text-accent-ink/70 hover:bg-accent-ink/10', isActive && 'bg-accent-ink/15 text-accent-ink')
        }
      >
        <Gear size={20} weight="bold" />
      </NavLink>
    </aside>
  )
}
