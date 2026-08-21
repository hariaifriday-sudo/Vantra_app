import { useEffect, useState } from 'react'
import { ArrowsClockwise, Sparkle } from '@phosphor-icons/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Pill'
import { cn, formatCurrency } from '@/lib/utils'
import { api, ApiError, type UnderwritingOut } from '@/lib/api'

const gradeTone: Record<string, 'positive' | 'watch' | 'negative'> = { A: 'positive', B: 'watch', C: 'negative', D: 'negative' }

export default function Underwriting() {
  const [queue, setQueue] = useState<UnderwritingOut[] | null>(null)
  const [selected, setSelected] = useState<UnderwritingOut | null>(null)
  const [justification, setJustification] = useState('')
  const [acting, setActing] = useState(false)
  const [explaining, setExplaining] = useState(false)
  const [explainError, setExplainError] = useState<string | null>(null)

  useEffect(() => {
    api.get<UnderwritingOut[]>('/api/underwriting/').then((data) => {
      setQueue(data)
      setSelected(data[0] ?? null)
    })
  }, [])

  async function regenerate() {
    if (!selected) return
    setExplaining(true)
    setExplainError(null)
    try {
      const updated = await api.post<UnderwritingOut>(`/api/underwriting/${selected.id}/explain`)
      setQueue((prev) => prev?.map((u) => (u.id === updated.id ? updated : u)) ?? null)
      setSelected(updated)
    } catch (err) {
      setExplainError(err instanceof ApiError ? err.message : 'AI analysis is temporarily unavailable.')
    } finally {
      setExplaining(false)
    }
  }

  async function decide(decision: 'accept' | 'request_documents' | 'override') {
    if (!selected) return
    setActing(true)
    try {
      const updated = await api.post<UnderwritingOut>(`/api/underwriting/${selected.id}/decision`, { decision, justification: justification || undefined })
      setQueue((prev) => prev?.map((u) => (u.id === updated.id ? updated : u)) ?? null)
      setSelected(updated)
      setJustification('')
    } finally {
      setActing(false)
    }
  }

  if (!queue) return <div className="h-64 animate-pulse rounded-3xl bg-surface-2" />
  if (!selected) return <p className="text-sm text-ink-muted">No applications in the queue.</p>

  const ratios = [
    { label: 'Debt-to-Income', value: selected.dti !== null ? `${selected.dti}%` : '—' },
    { label: 'Credit Score', value: selected.credit_score ?? '—' },
    { label: 'Loan-to-Value', value: selected.ltv !== null ? `${selected.ltv}%` : '—' },
  ]

  return (
    <div className="grid gap-6 pb-10 lg:grid-cols-[380px_1fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Underwriting Queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 pt-3">
          {queue.map((u) => (
            <button
              key={u.id}
              onClick={() => setSelected(u)}
              className={cn('w-full rounded-xl px-3.5 py-3 text-left transition-colors', selected.id === u.id ? 'bg-surface-2' : 'hover:bg-surface-2/60')}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium text-ink">{u.applicant_name}</p>
                {u.grade ? <Pill tone={gradeTone[u.grade]}>Grade {u.grade}</Pill> : null}
              </div>
              <p className="mt-1 text-xs text-ink-muted">{u.loan_type} · {formatCurrency(u.amount)} · {u.status}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold text-ink">{selected.applicant_name}</h1>
            <p className="text-sm text-ink-muted">{selected.loan_type} · requesting {formatCurrency(selected.amount)}</p>
          </div>
          {selected.grade ? <Pill tone={gradeTone[selected.grade]}>Risk grade {selected.grade}</Pill> : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {ratios.map((r) => (
            <Card key={r.label} className="p-5">
              <p className="text-xs font-medium text-ink-muted">{r.label}</p>
              <p className="mt-2 tabular-nums font-display text-2xl font-bold text-ink">{r.value}</p>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Sparkle size={15} className="text-accent" weight="fill" /> Risk Summary
            </CardTitle>
            <Button size="sm" variant="secondary" disabled={explaining} onClick={regenerate} icon={<ArrowsClockwise size={13} className={explaining ? 'animate-spin' : ''} />}>
              {explaining ? 'Analyzing…' : 'Regenerate AI Analysis'}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 pt-4 text-sm leading-relaxed text-ink-muted">
            {explainError ? <p className="text-negative">{explainError}</p> : null}
            <p>{selected.ai_summary ?? 'No AI summary available for this application.'}</p>
            {selected.counterfactual ? (
              <div className="rounded-2xl bg-surface-2 p-4">
                <p className="mb-1 text-xs font-semibold text-ink">What would change the grade</p>
                <p className="text-sm text-ink-muted">{selected.counterfactual}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recommendation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="rounded-2xl bg-mint/30 p-4">
              <p className="font-medium text-ink">{selected.recommendation ?? 'No recommendation available'}</p>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-muted">Override justification (optional)</label>
              <textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={2} className="w-full resize-none rounded-xl border border-border-hair bg-surface px-3.5 py-2.5 text-sm text-ink outline-none" placeholder="Explain if you're overriding the AI recommendation…" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={acting} onClick={() => decide('accept')}>
                Accept Recommendation
              </Button>
              <Button disabled={acting} variant="secondary" onClick={() => decide('request_documents')}>
                Request Additional Documents
              </Button>
              <Button disabled={acting} variant="ghost" onClick={() => decide('override')}>
                Override
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
