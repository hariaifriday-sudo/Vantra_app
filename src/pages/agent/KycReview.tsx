import { useEffect, useState } from 'react'
import { CheckCircle, Sparkle, WarningCircle, XCircle } from '@phosphor-icons/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Pill'
import { cn } from '@/lib/utils'
import { api, type KycOut } from '@/lib/api'

const recommendationTone: Record<string, 'positive' | 'watch' | 'negative'> = {
  Approve: 'positive',
  'Request More Info': 'watch',
  Reject: 'negative',
}

export default function KycReview() {
  const [queue, setQueue] = useState<KycOut[] | null>(null)
  const [selected, setSelected] = useState<KycOut | null>(null)
  const [notes, setNotes] = useState('')
  const [acting, setActing] = useState(false)

  useEffect(() => {
    api.get<KycOut[]>('/api/kyc/queue').then((data) => {
      setQueue(data)
      setSelected(data[0] ?? null)
    })
  }, [])

  async function decide(decision: 'approve' | 'request_info' | 'reject') {
    if (!selected) return
    setActing(true)
    try {
      await api.post(`/api/kyc/${selected.id}/decision`, { decision, notes: notes || undefined })
      const remaining = queue?.filter((k) => k.id !== selected.id) ?? []
      setQueue(remaining)
      setSelected(remaining[0] ?? null)
      setNotes('')
    } finally {
      setActing(false)
    }
  }

  if (!queue) return <div className="h-64 animate-pulse rounded-3xl bg-surface-2" />

  if (queue.length === 0 || !selected) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
          <CheckCircle size={28} className="text-positive" weight="fill" />
          <p className="font-medium text-ink">Queue clear</p>
          <p className="text-sm text-ink-muted">No pending KYC applications right now.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-6 pb-10 lg:grid-cols-[380px_1fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Review Queue ({queue.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 pt-3">
          {queue.map((k) => (
            <button
              key={k.id}
              onClick={() => setSelected(k)}
              className={cn('flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-left transition-colors', selected.id === k.id ? 'bg-surface-2' : 'hover:bg-surface-2/60')}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{(k.fields.full_name as string) || (k.fields['Full Name'] as string) || k.case_ref}</p>
                <p className="font-mono text-xs text-ink-muted">{k.case_ref} · {k.status}</p>
              </div>
              {k.ai_recommendation ? <Pill tone={recommendationTone[k.ai_recommendation] ?? 'accent'}>{k.ai_recommendation}</Pill> : null}
            </button>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold text-ink">{Object.values(selected.fields)[0] ?? selected.case_ref}</h1>
            <p className="font-mono text-xs text-ink-muted">{selected.case_ref} · submitted {selected.submitted_at ? new Date(selected.submitted_at).toLocaleDateString() : '—'}</p>
          </div>
          {selected.ai_recommendation ? <Pill tone={recommendationTone[selected.ai_recommendation] ?? 'accent'}>{selected.ai_recommendation}</Pill> : null}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>AI Recommendation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4 text-sm">
            {selected.ai_notes ? (
              <div className={cn('flex items-start gap-2 rounded-2xl p-4', selected.ai_recommendation === 'Approve' ? 'bg-mint/30' : 'bg-watch/12')}>
                <Sparkle size={16} weight="fill" className={cn('mt-0.5 shrink-0', selected.ai_recommendation === 'Approve' ? 'text-positive' : 'text-watch')} />
                <div className="whitespace-pre-line text-xs text-ink-muted">{selected.ai_notes}</div>
              </div>
            ) : (
              <p className="text-xs text-ink-muted">No AI recommendation available for this application.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Submitted Fields</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
            {Object.entries(selected.fields).map(([label, value]) => (
              <div key={label} className="rounded-xl bg-surface-2 px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium text-ink-muted">{label}</p>
                  {selected.confidences?.[label] !== undefined ? (
                    <span className="text-[10px] font-semibold text-ink-muted">{selected.confidences[label]}%</span>
                  ) : null}
                </div>
                <p className="text-sm font-medium text-ink">{String(value)}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink-muted">Notes (shown to the customer for "Request More Info" or "Reject")</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full resize-none rounded-xl border border-border-hair bg-surface px-3.5 py-2.5 text-sm text-ink outline-none" placeholder="e.g. Please resubmit a clearer photo of your address proof." />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button disabled={acting} onClick={() => decide('approve')} icon={<CheckCircle size={16} weight="bold" />}>
            Approve
          </Button>
          <Button disabled={acting} variant="secondary" onClick={() => decide('request_info')} icon={<WarningCircle size={16} weight="bold" />}>
            Request More Information
          </Button>
          <Button disabled={acting} variant="outline" onClick={() => decide('reject')} icon={<XCircle size={16} weight="bold" />} className="border-negative/40 text-negative hover:bg-negative/10">
            Reject
          </Button>
        </div>
      </div>
    </div>
  )
}
