import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { DownloadSimple, Gear, X, Sparkle, CheckCircle } from '@phosphor-icons/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Pill'
import { formatCurrency } from '@/lib/utils'
import { api, type FraudAlertOut } from '@/lib/api'

const riskTone: Record<string, 'negative' | 'watch' | 'neutral'> = {
  Critical: 'negative',
  High: 'negative',
  Medium: 'watch',
  Low: 'neutral',
}

export default function Fraud() {
  const [alerts, setAlerts] = useState<FraudAlertOut[] | null>(null)
  const [selected, setSelected] = useState<FraudAlertOut | null>(null)
  const [notes, setNotes] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [acting, setActing] = useState(false)

  useEffect(() => {
    api.get<FraudAlertOut[]>('/api/fraud/alerts').then(setAlerts)
  }, [])

  async function act(action: 'confirm_fraud' | 'dismiss' | 'escalate', label: string) {
    if (!selected) return
    setActing(true)
    try {
      const updated = await api.post<FraudAlertOut>(`/api/fraud/alerts/${selected.id}/action`, { action, notes: notes || undefined })
      setAlerts((prev) => prev?.map((a) => (a.id === updated.id ? updated : a)) ?? null)
      setToast(label)
      setSelected(null)
      setNotes('')
      window.setTimeout(() => setToast(null), 2600)
    } finally {
      setActing(false)
    }
  }

  const openCount = alerts?.filter((a) => a.status === 'Open').length ?? 0
  const criticalHighCount = alerts?.filter((a) => a.status === 'Open' && (a.risk === 'Critical' || a.risk === 'High')).length ?? 0

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Fraud &amp; Incident Tracking</h1>
          <p className="mt-1 text-sm text-ink-muted">Real-time anomaly detection assist.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={<Gear size={14} />}>
            Configuration
          </Button>
          <Button variant="secondary" size="sm" icon={<DownloadSimple size={14} />}>
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: 'Open Alerts', value: String(openCount) },
          { label: 'Critical / High Risk', value: String(criticalHighCount) },
          { label: 'Confirmed Fraud', value: String(alerts?.filter((a) => a.status === 'Confirmed').length ?? 0) },
          { label: 'Dismissed', value: String(alerts?.filter((a) => a.status === 'Dismissed').length ?? 0) },
        ].map((s) => (
          <Card key={s.label} className="p-5">
            <p className="text-xs font-medium text-ink-muted">{s.label}</p>
            <p className="mt-2 tabular-nums font-display text-2xl font-bold text-ink">{s.value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Live Transaction Stream</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {!alerts ? (
            <div className="h-48 animate-pulse rounded-2xl bg-surface-2" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-muted">
                    <th className="pb-2 font-medium">Account</th>
                    <th className="pb-2 font-medium">Amount</th>
                    <th className="pb-2 font-medium">Merchant</th>
                    <th className="pb-2 font-medium">Rule Triggered</th>
                    <th className="pb-2 font-medium">Risk</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => (
                    <tr key={a.id} onClick={() => { setSelected(a); setNotes('') }} className="cursor-pointer border-t border-border-hair transition-colors hover:bg-surface-2">
                      <td className="py-3 font-mono text-ink">{a.account_masked}</td>
                      <td className="py-3 tabular-nums font-medium text-ink">{formatCurrency(a.amount)}</td>
                      <td className="py-3 text-ink-muted">{a.merchant}</td>
                      <td className="py-3 text-ink-muted">{a.rule}</td>
                      <td className="py-3">
                        <Pill tone={riskTone[a.risk]}>{a.risk}</Pill>
                      </td>
                      <td className="py-3 text-ink-muted">{a.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AnimatePresence>
        {selected ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 p-4"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 40, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              className="h-full w-full max-w-md overflow-y-auto rounded-3xl border border-border-hair bg-surface p-6"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-xs text-ink-muted">{selected.account_masked}</p>
                  <h2 className="font-display text-lg font-bold text-ink">{formatCurrency(selected.amount)}</h2>
                </div>
                <button onClick={() => setSelected(null)} className="grid h-8 w-8 place-items-center rounded-full text-ink-muted hover:bg-surface-2" aria-label="Close">
                  <X size={16} />
                </button>
              </div>

              <div className="mt-5 flex items-start gap-2 rounded-2xl border border-border-hair bg-paper p-4">
                <Sparkle size={16} className="mt-0.5 shrink-0 text-accent" weight="fill" />
                <p className="text-sm leading-relaxed text-ink-muted">{selected.ai_explanation ?? 'No AI explanation available for this alert.'}</p>
              </div>

              {selected.agent_notes ? (
                <div className="mt-3 rounded-2xl bg-surface-2 p-4 text-sm text-ink-muted">
                  <p className="mb-1 text-xs font-semibold text-ink">Review notes</p>
                  {selected.agent_notes}
                </div>
              ) : null}

              {selected.status === 'Open' ? (
                <div className="mt-4">
                  <label className="mb-1.5 block text-xs font-semibold text-ink-muted">Notes (optional, especially if overriding the AI's risk read)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded-xl border border-border-hair bg-surface px-3.5 py-2.5 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    placeholder="e.g. Customer confirmed travel via phone — false positive."
                  />
                </div>
              ) : null}

              <div className="mt-4 space-y-2">
                <Button className="w-full" disabled={acting || selected.status !== 'Open'} onClick={() => act('confirm_fraud', 'Customer notified')}>
                  Confirm Fraud &amp; Notify Customer
                </Button>
                <Button variant="secondary" className="w-full" disabled={acting || selected.status !== 'Open'} onClick={() => act('dismiss', 'Marked as false positive')}>
                  Dismiss as False Positive
                </Button>
                <Button variant="ghost" className="w-full" disabled={acting || selected.status !== 'Open'} onClick={() => act('escalate', 'Escalated')}>
                  Escalate
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {toast ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm text-paper shadow-lift"
          >
            <CheckCircle size={16} weight="fill" className="text-positive" /> {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
