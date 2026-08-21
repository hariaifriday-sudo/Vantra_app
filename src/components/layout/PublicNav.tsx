import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, useMotionValueEvent, useScroll } from 'framer-motion'
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
  const [scrolled, setScrolled] = useState(false)
  const { scrollY } = useScroll()

  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 12))

  return (
    <motion.header
      animate={{ paddingTop: scrolled ? '0.5rem' : '0.75rem', paddingBottom: scrolled ? '0.5rem' : '0.75rem' }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn(
        'sticky top-4 z-40 mx-auto flex w-full max-w-6xl items-center justify-between rounded-full border border-border-hair bg-surface/85 px-5 shadow-soft backdrop-blur-md transition-shadow duration-300',
        scrolled && 'shadow-lift',
      )}
    >
      <Link to="/" className="text-ink">
        <VantraLogo />
      </Link>
      <nav className="hidden items-center gap-7 md:flex">
        {links.map((l) => {
          const active = location.pathname === l.to
          return (
            <Link key={l.label} to={l.to} className="relative py-1 text-sm font-medium text-ink-muted transition-colors hover:text-ink">
              <span className={cn('relative z-10', active && 'text-ink')}>{l.label}</span>
              {active ? (
                <motion.span layoutId="public-nav-underline" className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-accent" transition={{ type: 'spring', stiffness: 500, damping: 34 }} />
              ) : null}
            </Link>
          )
        })}
      </nav>
      <Link to="/login">
        <Button size="sm">Log In / Sign Up</Button>
      </Link>
    </motion.header>
  )
}
