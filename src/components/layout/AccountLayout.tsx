import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, ChatCircleDots, X } from '@phosphor-icons/react'
import { AccountSidebar } from './AccountSidebar'
import { UserMenu } from './UserMenu'
import { ChatPanel } from '../assistant/ChatPanel'
import { useAuth } from '@/lib/auth'
import { api, type NotificationOut } from '@/lib/api'

export function AccountLayout() {
  const [chatOpen, setChatOpen] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const firstName = user?.fullName.split(' ')[0] ?? 'there'

  useEffect(() => {
    api
      .get<NotificationOut[]>('/api/notifications/')
      .then((list) => setUnreadCount(list.filter((n) => !n.read).length))
      .catch(() => {})
  }, [])

  return (
    <div className="flex h-screen gap-4 bg-paper p-4">
      <AccountSidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="font-display text-xl font-bold text-ink">Welcome back, {firstName} 👋</p>
            <p className="text-sm text-ink-muted">Here's what's happening with your money.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/app/notifications')}
              className="relative grid h-10 w-10 cursor-pointer place-items-center rounded-full border border-border-hair bg-surface text-ink-muted hover:text-ink"
              aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            >
              <Bell size={18} />
              {unreadCount > 0 ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-negative" /> : null}
            </button>
            <button
              onClick={() => setChatOpen((v) => !v)}
              aria-pressed={chatOpen}
              aria-label={chatOpen ? 'Hide assistant panel' : 'Show assistant panel'}
              className="grid h-10 w-10 cursor-pointer place-items-center rounded-full border border-border-hair bg-surface text-ink-muted hover:text-ink lg:hidden"
            >
              {chatOpen ? <X size={18} /> : <ChatCircleDots size={18} />}
            </button>
            <UserMenu avatarUrl="https://i.pravatar.cc/80?img=47" name={user?.fullName ?? 'Account holder'} />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className={`w-[340px] shrink-0 ${chatOpen ? 'block' : 'hidden'} lg:block`}>
        <ChatPanel
          context="account"
          initialMessages={[{ role: 'assistant', text: `Hi ${firstName}, ask me anything about your accounts, KYC status, or offers.` }]}
          className="h-full"
        />
      </div>
    </div>
  )
}
