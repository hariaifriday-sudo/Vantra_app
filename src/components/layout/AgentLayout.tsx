import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { MagnifyingGlass, X } from '@phosphor-icons/react'
import { AgentSidebar } from './AgentSidebar'
import { UserMenu } from './UserMenu'
import { AssistantOrb } from '../assistant/AssistantOrb'
import { ChatPanel } from '../assistant/ChatPanel'
import { useAuth } from '@/lib/auth'

const copilotIntro = [
  {
    role: 'assistant' as const,
    text: 'Copilot here. Ask me about a case, a policy, or say "find the SAR filing threshold" — I search the regulatory library and your open queues.',
  },
]

export function AgentLayout() {
  const [copilotOpen, setCopilotOpen] = useState(false)
  const { user } = useAuth()
  const displayName = user ? `${user.fullName.split(' ')[0][0]}. ${user.fullName.split(' ').slice(1).join(' ')}` : 'Agent'

  return (
    <div className="agent-mode flex h-screen gap-4 bg-paper p-4">
      <AgentSidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex h-10 w-80 max-w-full items-center gap-2 rounded-full border border-border-hair bg-surface px-4 text-sm text-ink-muted">
            <MagnifyingGlass size={16} />
            <input placeholder="Search anything..." className="flex-1 bg-transparent outline-none placeholder:text-ink-muted" />
          </div>
          <div className="flex items-center gap-2.5 rounded-full border border-border-hair bg-surface py-1.5 pl-1.5 pr-3.5">
            <span className="text-sm font-medium text-ink">{displayName}</span>
            <UserMenu avatarUrl="https://i.pravatar.cc/80?img=33" name={user?.fullName ?? 'Agent'} />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <Outlet />
        </div>
      </div>

      <button
        onClick={() => setCopilotOpen((v) => !v)}
        aria-label={copilotOpen ? 'Close copilot' : 'Open copilot'}
        className="fixed bottom-6 right-6 z-40 grid h-14 w-14 cursor-pointer place-items-center rounded-full border border-border-hair bg-surface shadow-lift transition-transform hover:scale-105 active:scale-95"
      >
        {copilotOpen ? <X size={20} className="text-ink" /> : <AssistantOrb size={30} />}
      </button>

      <AnimatePresence>
        {copilotOpen ? (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed bottom-24 right-6 z-40 h-[520px] w-[380px] max-w-[90vw]"
          >
            <ChatPanel title="Vantra Copilot" initialMessages={copilotIntro} context="agent_copilot" dark className="h-full shadow-lift" />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
