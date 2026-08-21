import { useEffect, useState } from 'react'
import { MagnifyingGlass, WarningCircle, Sparkle } from '@phosphor-icons/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { cn } from '@/lib/utils'
import { api, type PolicyOut } from '@/lib/api'

const categories = ['All', 'BSA/AML', 'KYC/CIP', 'Consumer Lending', 'Data Privacy', 'Internal Operations']

export default function Knowledge() {
  const [category, setCategory] = useState('All')
  const [query, setQuery] = useState('')
  const [policies, setPolicies] = useState<PolicyOut[]>([])
  const [selected, setSelected] = useState<PolicyOut | null>(null)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams()
    if (category !== 'All') params.set('category', category)
    if (query) params.set('q', query)
    api.get<PolicyOut[]>(`/api/policies/?${params.toString()}`).then((data) => {
      setPolicies(data)
      setSelected((prev) => (prev && data.some((p) => p.id === prev.id) ? prev : data[0] ?? null))
    })
  }, [category, query])

  async function ask() {
    if (!selected || !question.trim()) return
    setAsking(true)
    setAnswer(null)
    try {
      const res = await api.post<{ answer: string }>(`/api/policies/${selected.id}/ask`, { question })
      setAnswer(res.answer)
    } finally {
      setAsking(false)
    }
  }

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Knowledge &amp; Policy Library</h1>
        <p className="mt-1 text-sm text-ink-muted">Regulatory &amp; audit assist, plus internal SOP lookup.</p>
      </div>

      <div className="flex items-center gap-2 rounded-full border border-border-hair bg-surface px-4 py-3">
        <MagnifyingGlass size={16} className="text-ink-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search policies, SOPs, and regulations..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-muted"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <div className="space-y-1">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn('block w-full rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition-colors', category === c ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:bg-surface-2/60')}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>{policies.length} documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 pt-3">
              {policies.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setSelected(p); setAnswer(null); setQuestion('') }}
                  className={cn('w-full rounded-xl px-3.5 py-3 text-left transition-colors', selected?.id === p.id ? 'bg-surface-2' : 'hover:bg-surface-2/60')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-ink">{p.title}</p>
                    {p.flagged ? <WarningCircle size={15} weight="fill" className="shrink-0 text-watch" /> : null}
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {p.owner} · updated {new Date(p.updated_at).toLocaleDateString()}
                  </p>
                </button>
              ))}
              {policies.length === 0 ? <p className="py-6 text-center text-sm text-ink-muted">No matching documents.</p> : null}
            </CardContent>
          </Card>

          {selected ? (
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>{selected.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                {selected.flagged ? (
                  <div className="flex items-start gap-2 rounded-2xl bg-watch/12 p-4">
                    <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-watch" />
                    <p className="text-sm text-ink-muted">A newer regulation may conflict with this policy — flagged for compliance review.</p>
                  </div>
                ) : null}

                <div className="whitespace-pre-line text-sm leading-relaxed text-ink-muted">{selected.body}</div>

                <div className="rounded-2xl border border-border-hair p-4">
                  <p className="mb-2 text-xs font-semibold text-ink-muted">Ask about this policy</p>
                  <div className="flex items-center gap-2 rounded-full bg-surface-2 px-3.5 py-2">
                    <input
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && ask()}
                      placeholder="e.g. what's the SAR filing deadline?"
                      className="flex-1 bg-transparent text-xs outline-none placeholder:text-ink-muted"
                    />
                    <button onClick={ask} disabled={asking} className="shrink-0 text-ink-muted hover:text-ink" aria-label="Ask">
                      <Sparkle size={14} className={asking ? 'animate-pulse text-accent' : ''} weight={asking ? 'fill' : 'regular'} />
                    </button>
                  </div>
                  {answer ? <p className="mt-3 text-xs leading-relaxed text-ink">{answer}</p> : null}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}
