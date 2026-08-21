import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { SignOut } from '@phosphor-icons/react'
import { useAuth } from '@/lib/auth'

export function UserMenu({ avatarUrl, name }: { avatarUrl: string; name: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function signOut() {
    logout()
    navigate('/login')
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} className="cursor-pointer rounded-full">
        <img src={avatarUrl} alt={name} className="h-10 w-10 rounded-full border border-border-hair object-cover" />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            role="menu"
            className="absolute right-0 top-12 z-50 w-48 overflow-hidden rounded-2xl border border-border-hair bg-surface shadow-lift"
          >
            <div className="px-4 py-3">
              <p className="truncate text-sm font-medium text-ink">{name}</p>
            </div>
            <button
              role="menuitem"
              onClick={signOut}
              className="flex w-full items-center gap-2 border-t border-border-hair px-4 py-3 text-left text-sm text-negative hover:bg-negative/10"
            >
              <SignOut size={16} /> Log out
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
