import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { VantraLogo } from './VantraLogo'
import { Button } from '../ui/Button'

const links = [
  { label: 'Personal Banking', to: '/#products' },
  { label: 'Products & Offers', to: '/#products' },
  { label: 'FAQ & Assistant', to: '/assistant' },
]

export function PublicNav() {
  const location = useLocation()

  return (
    <header className="sticky top-4 z-40 mx-auto flex w-full max-w-6xl items-center justify-between rounded-full border border-border-hair bg-surface/85 px-5 py-3 shadow-soft backdrop-blur-md">
      <Link to="/" className="text-ink">
        <VantraLogo />
      </Link>
      <nav className="hidden items-center gap-7 md:flex">
        {links.map((l) => (
          <Link
            key={l.label}
            to={l.to}
            className={cn(
              'text-sm font-medium text-ink-muted transition-colors hover:text-ink',
              location.pathname === l.to && 'text-ink',
            )}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <Link to="/login">
        <Button size="sm">Log In / Sign Up</Button>
      </Link>
    </header>
  )
}
