import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, CheckCircle, IdentificationCard, PaperPlaneTilt, ShieldWarning, Sparkle, Tag } from '@phosphor-icons/react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { SectionReveal, StaggerGroup, StaggerItem } from '@/components/ui/SectionReveal'
import { cn } from '@/lib/utils'
import { api, ApiError, type CaseTicketOut, type NotificationOut } from '@/lib/api'

const iconByType: Record<string, typeof ShieldWarning> = {
  security: ShieldWarning,
  kyc: IdentificationCard,
  statement: CheckCircle,
  offer: Tag,
  welcome: CheckCircle,
  insight: Sparkle,
  forecast_warning: Bell,
}

const filters = ['All', 'KYC', 'Security', 'Statement', 'Offer']

export default function Notifications() {
  const [notifications, setNotifications] = useState<NotificationOut[] | null>(null)
  const [activeFilter, setActiveFilter] = useState('All')
  const [disputingId, setDisputingId] = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [filed, setFiled] = useState<Record<number, CaseTicketOut>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get<NotificationOut[]>('/api/notifications/').then(setNotifications)
  }, [])

  async function markRead(id: number) {
    const updated = await api.post<NotificationOut>(`/api/notifications/${id}/read`)
    setNotifications((prev) => prev?.map((n) => (n.id === id ? updated : n)) ?? null)
  }

  async function fileDispute(notificationId: number) {
    if (!description.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const ticket = await api.post<CaseTicketOut>('/api/cases/dispute', { description, notification_id: notificationId })
      setFiled((prev) => ({ ...prev, [notificationId]: ticket }))
      setNotifications((prev) => prev?.map((n) => (n.id === notificationId ? { ...n, read: true } : n)) ?? null)
      setDisputingId(null)
      setDescription('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not file the dispute — try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const visible = notifications?.filter((n) => activeFilter === 'All' || n.type.toLowerCase() === activeFilter.toLowerCase())

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Notifications</h1>
        <p className="mt-1 text-sm text-ink-muted">Everything Vantra and your account need you to know.</p>
      </div>

      <SectionReveal className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
              activeFilter === f ? 'border-accent bg-accent text-accent-ink' : 'border-border-hair bg-surface text-ink-muted hover:text-ink',
            )}
          >
            {f}
          </button>
        ))}
      </SectionReveal>

      {!notifications ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-3xl bg-surface-2" />
          ))}
        </div>
      ) : (
        <StaggerGroup className="space-y-3">
          {visible?.map((n) => (
            <StaggerItem key={n.id}>
              <Card className={cn('flex gap-4 p-5', n.severity === 'watch' && !n.read && 'border-l-4 border-l-watch', n.read && !filed[n.id] && 'opacity-60')}>
                <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-full', n.severity === 'watch' ? 'bg-watch/15 text-watch' : 'bg-surface-2 text-ink-muted')}>
                  {(() => {
                    const Icon = iconByType[n.type] ?? Bell
                    return <Icon size={18} weight={n.severity === 'watch' ? 'fill' : 'regular'} />
                  })()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-ink">{n.title}</p>
                    <span className="shrink-0 text-xs text-ink-muted">{new Date(n.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">{n.body}</p>

                  {filed[n.id] ? (
                    <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-positive/12 px-3 py-2 text-xs font-medium text-positive">
                      <CheckCircle size={14} weight="fill" /> Dispute filed ({filed[n.id].ai_summary}) — our fraud team will follow up.
                    </div>
                  ) : n.type === 'security' && !n.read ? (
                    <>
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" onClick={() => setDisputingId(disputingId === n.id ? null : n.id)}>
                          This wasn't me
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => markRead(n.id)}>
                          It was me, dismiss
                        </Button>
                      </div>
                      <AnimatePresence>
                        {disputingId === n.id ? (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-3 overflow-hidden"
                          >
                            <div className="rounded-2xl border border-border-hair bg-paper p-3">
                              <label className="mb-1.5 block text-xs font-semibold text-ink-muted">Tell us what happened</label>
                              <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={2}
                                placeholder="e.g. I haven't traveled recently and don't recognize this merchant."
                                className="w-full resize-none rounded-xl border border-border-hair bg-surface px-3 py-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
                              />
                              {error ? <p className="mt-1.5 text-xs text-negative">{error}</p> : null}
                              <Button size="sm" className="mt-2" disabled={submitting || !description.trim()} onClick={() => fileDispute(n.id)} iconRight={<PaperPlaneTilt size={13} weight="fill" />}>
                                {submitting ? 'Filing…' : 'File dispute'}
                              </Button>
                            </div>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </>
                  ) : n.action_label && !n.read ? (
                    <Button size="sm" variant="secondary" className="mt-3" onClick={() => markRead(n.id)}>
                      {n.action_label}
                    </Button>
                  ) : !n.read ? (
                    <button onClick={() => markRead(n.id)} className="mt-2 text-xs font-medium text-ink-muted hover:text-ink">
                      Mark as read
                    </button>
                  ) : null}
                </div>
              </Card>
            </StaggerItem>
          ))}
        </StaggerGroup>
      )}

      {notifications && visible?.length === 0 ? (
        <p className="flex items-center justify-center gap-1.5 pt-4 text-sm text-ink-muted">
          <Bell size={14} /> Nothing here yet
        </p>
      ) : null}
    </div>
  )
}
