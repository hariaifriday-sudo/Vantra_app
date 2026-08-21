import { useEffect, useState } from 'react'
import { ArrowsClockwise, CheckCircle, Sparkle } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Pill'
import { cn } from '@/lib/utils'
import { api, type CaseTicketOut } from '@/lib/api'

const statusTone: Record<string, 'positive' | 'watch'> = { 'Auto-Routed': 'positive', 'Needs Review': 'watch' }

const demoEmails = [
  { sender_email: 'p.osei@email.com', subject: 'Wrong amount debited twice', body: 'I was charged $89.99 twice for the same order yesterday. Please refund the duplicate charge as soon as possible.' },
  { sender_email: 'l.chen@email.com', subject: 'Question about mortgage pre-approval', body: 'I want to understand the documents needed for a mortgage pre-approval before I apply. Can someone walk me through it?' },
]

export default function Cases() {
  const [cases, setCases] = useState<CaseTicketOut[] | null>(null)
  const [selected, setSelected] = useState<CaseTicketOut | null>(null)
  const [simulating, setSimulating] = useState(false)

  useEffect(() => {
    api.get<CaseTicketOut[]>('/api/cases/').then((data) => {
      setCases(data)
      setSelected(data[0] ?? null)
    })
  }, [])

  async function reassign(department: string) {
    if (!selected) return
    const updated = await api.post<CaseTicketOut>(`/api/cases/${selected.id}/reassign`, { department })
    setCases((prev) => prev?.map((c) => (c.id === updated.id ? updated : c)) ?? null)
    setSelected(updated)
  }

  async function resolve() {
    if (!selected) return
    const updated = await api.post<CaseTicketOut>(`/api/cases/${selected.id}/resolve`)
    setCases((prev) => prev?.map((c) => (c.id === updated.id ? updated : c)) ?? null)
    setSelected(updated)
  }

  async function simulateIncoming() {
    setSimulating(true)
    try {
      const sample = demoEmails[Math.floor(Math.random() * demoEmails.length)]
      const ticket = await api.post<CaseTicketOut>('/api/cases/route', sample)
      setCases((prev) => [ticket, ...(prev ?? [])])
      setSelected(ticket)
    } finally {
      setSimulating(false)
    }
  }

  if (!cases) return <div className="h-64 animate-pulse rounded-3xl bg-surface-2" />

  return (
    <div className="grid gap-6 pb-10 lg:grid-cols-[380px_1fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Case Inbox</CardTitle>
          <Button size="sm" variant="secondary" onClick={simulateIncoming} disabled={simulating} icon={<Sparkle size={13} />}>
            {simulating ? 'Routing…' : 'Simulate email'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-1.5 pt-3">
          {cases.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className={cn('w-full rounded-xl px-3.5 py-3 text-left transition-colors', selected?.id === c.id ? 'bg-surface-2' : 'hover:bg-surface-2/60')}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium text-ink">{c.subject}</p>
                {c.department ? <Pill tone={statusTone[c.status]}>{c.department}</Pill> : null}
              </div>
              <p className="mt-1 truncate text-xs text-ink-muted">{c.ai_summary}</p>
              <p className="mt-1 font-mono text-[11px] text-ink-muted">{c.sender_email}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      {!selected ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-ink-muted">No cases yet.</CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-xl font-bold text-ink">{selected.subject}</h1>
              <p className="text-xs text-ink-muted">from {selected.sender_email}</p>
            </div>
            <Pill tone={statusTone[selected.status] ?? 'watch'}>{selected.status}</Pill>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>AI Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4 text-sm">
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-ink-muted">
                {selected.ai_summary}
              </motion.p>
              <div className="flex flex-wrap gap-4 text-xs text-ink-muted">
                <span>
                  Routed to <span className="font-semibold text-ink">{selected.department ?? '—'}</span>
                </span>
                <span>
                  Confidence <span className="font-semibold text-ink">{selected.confidence ?? '—'}%</span>
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Original Message</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 text-sm leading-relaxed text-ink-muted">
              <p className="whitespace-pre-line">{selected.body}</p>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            <select onChange={(e) => reassign(e.target.value)} value={selected.department ?? ''} className="rounded-full border border-border-hair bg-surface px-4 py-2.5 text-sm text-ink outline-none">
              {['Fraud', 'Loans', 'KYC', 'General Support'].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <Button variant="secondary" icon={<ArrowsClockwise size={15} />} onClick={() => reassign(selected.department ?? 'General Support')}>
              Reassign
            </Button>
            <Button variant="ghost" icon={<CheckCircle size={15} />} onClick={resolve} disabled={selected.status === 'Resolved'}>
              {selected.status === 'Resolved' ? 'Resolved' : 'Mark Resolved'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
