import { useEffect, useState } from 'react'
import { CreditCard, PiggyBank, ArrowsLeftRight, Snowflake, Bank, Target, User, Bell, ShieldCheck, CheckCircle, CalendarBlank } from '@phosphor-icons/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StaggerGroup, StaggerItem } from '@/components/ui/SectionReveal'
import { cn, formatCurrency } from '@/lib/utils'
import { quickPayees } from '@/data/mock'
import { api, ApiError, type Account, type ForecastOut, type SavingsGoal } from '@/lib/api'

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
      <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
    </div>
  )
}

const accountIcon: Record<string, typeof Bank> = { checking: Bank, savings: PiggyBank, credit: CreditCard, loan: Bank }

export function Accounts() {
  const [accounts, setAccounts] = useState<Account[] | null>(null)

  useEffect(() => {
    api.get<Account[]>('/api/accounts/').then(setAccounts)
  }, [])

  return (
    <div className="pb-10">
      <PageHeader title="Accounts" subtitle="Everything you hold with Vantra, grouped in one place." />
      {!accounts ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => <div key={i} className="h-20 animate-pulse rounded-3xl bg-surface-2" />)}
        </div>
      ) : (
        <StaggerGroup className="grid gap-4 sm:grid-cols-2">
          {accounts.map((a) => {
            const Icon = accountIcon[a.type] ?? Bank
            return (
              <StaggerItem key={a.id}>
                <Card className="flex items-center gap-4 p-5">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-lavender/40 text-ink">
                    <Icon size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{a.name}</p>
                    <p className="text-xs text-ink-muted">{a.number_masked}</p>
                  </div>
                  <p className={`tabular-nums font-display text-lg font-bold ${a.balance < 0 ? 'text-negative' : 'text-ink'}`}>{formatCurrency(a.balance)}</p>
                </Card>
              </StaggerItem>
            )
          })}
        </StaggerGroup>
      )}
    </div>
  )
}

export function Transfers() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [fromId, setFromId] = useState<number | null>(null)
  const [payee, setPayee] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api.get<Account[]>('/api/accounts/').then((data) => {
      setAccounts(data)
      setFromId(data[0]?.id ?? null)
    })
  }, [])

  async function submit() {
    if (!fromId || !payee || !amount) return
    setSubmitting(true)
    setError(null)
    setStatus('idle')
    try {
      const updated = await api.post<Account>('/api/accounts/transfer', { from_account_id: fromId, to_label: payee, amount: Number(amount) })
      setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
      setStatus('success')
      setAmount('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Transfer failed')
      setStatus('error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg pb-10">
      <PageHeader title="Transfers" subtitle="Move money between your accounts or to someone else." />
      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink-muted">From</label>
            <select value={fromId ?? ''} onChange={(e) => setFromId(Number(e.target.value))} className="w-full rounded-xl border border-border-hair bg-surface px-3.5 py-3 text-sm text-ink outline-none">
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — {formatCurrency(a.balance)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink-muted">To</label>
            <div className="flex flex-wrap gap-2">
              {quickPayees.map((p) => (
                <button
                  key={p.name}
                  onClick={() => setPayee(p.name)}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm text-ink transition-colors ${payee === p.name ? 'border-accent bg-accent/10' : 'border-border-hair bg-surface hover:border-accent'}`}
                >
                  <span className="h-5 w-5 rounded-full" style={{ background: p.color }} />
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink-muted">Amount</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min={0} step="0.01" placeholder="$0.00" className="w-full rounded-xl border border-border-hair bg-surface px-3.5 py-3 text-sm text-ink outline-none" />
          </div>
          {status === 'success' ? (
            <p className="flex items-center gap-1.5 text-sm text-positive">
              <CheckCircle size={15} weight="fill" /> Transfer sent.
            </p>
          ) : null}
          {error ? <p className="text-sm text-negative">{error}</p> : null}
          <Button className="w-full" disabled={submitting || !fromId || !payee || !amount} onClick={submit} iconRight={<ArrowsLeftRight size={16} weight="bold" />}>
            {submitting ? 'Sending…' : 'Send Transfer'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export function Cards() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [frozen, setFrozen] = useState<Set<number>>(new Set())

  useEffect(() => {
    api.get<Account[]>('/api/accounts/').then((data) => setAccounts(data.filter((a) => a.type === 'credit')))
  }, [])

  async function freeze(id: number) {
    await api.post(`/api/accounts/cards/${id}/freeze`)
    setFrozen((prev) => new Set(prev).add(id))
  }

  return (
    <div className="pb-10">
      <PageHeader title="Cards" subtitle="Manage your physical and virtual Vantra cards." />
      {accounts.map((a) => (
        <Card key={a.id} className="max-w-sm overflow-hidden">
          <div className="relative aspect-[1.6/1] bg-gradient-to-br from-[#c9c2f0] via-[#bfe3f5] to-[#e8e4f7] p-6">
            <div className="flex items-center justify-between">
              <div className="h-7 w-10 rounded-md bg-white/50" />
              <span className="font-display text-sm font-bold text-ink/70">VANTRA</span>
            </div>
            <p className="mt-8 font-mono text-lg tracking-[0.2em] text-ink/70">{a.number_masked}</p>
          </div>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm font-medium text-ink">{a.name}</p>
              <p className="text-xs text-ink-muted">{frozen.has(a.id) ? 'Frozen' : 'Active'}</p>
            </div>
            <Button variant="secondary" size="sm" icon={<Snowflake size={14} />} disabled={frozen.has(a.id)} onClick={() => freeze(a.id)}>
              {frozen.has(a.id) ? 'Frozen' : 'Freeze card'}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function Loans() {
  const [goals, setGoals] = useState<SavingsGoal[]>([])
  const [forecast, setForecast] = useState<ForecastOut | null>(null)

  useEffect(() => {
    api.get<SavingsGoal[]>('/api/accounts/goals').then(setGoals)
    api.get<ForecastOut>('/api/accounts/forecast').then(setForecast)
  }, [])

  return (
    <div className="pb-10">
      <PageHeader title="Loans & Goals" subtitle="Track savings goals and any active credit with Vantra." />
      <div className="grid gap-4 sm:grid-cols-3">
        {goals.map((g) => (
          <Card key={g.id} className="p-5">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-mint/45 text-ink">
              <Target size={18} />
            </span>
            <p className="mt-4 font-medium text-ink">{g.name}</p>
            <p className="tabular-nums text-sm text-ink-muted">
              {formatCurrency(g.saved)} of {formatCurrency(g.target)}
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent" style={{ width: `${(g.saved / g.target) * 100}%` }} />
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-ink">Recurring &amp; Upcoming</h2>
        <Card>
          <CardContent className="divide-y divide-border-hair p-0">
            {!forecast ? (
              <div className="p-5 text-sm text-ink-muted">Loading…</div>
            ) : forecast.recurring.length === 0 ? (
              <div className="p-5 text-sm text-ink-muted">No recurring patterns detected yet.</div>
            ) : (
              forecast.recurring.map((r) => (
                <div key={r.merchant} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-ink-muted">
                      <CalendarBlank size={16} />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-ink">{r.merchant}</p>
                      <p className="text-xs text-ink-muted">Every ~{r.interval_days} days · next {r.next_expected}</p>
                    </div>
                  </div>
                  <p className={cn('tabular-nums text-sm font-semibold', r.avg_amount > 0 ? 'text-positive' : 'text-ink')}>
                    {r.avg_amount > 0 ? '+' : ''}
                    {formatCurrency(r.avg_amount)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function Settings() {
  const rows = [
    { icon: User, label: 'Profile & personal details' },
    { icon: Bell, label: 'Notification preferences' },
    { icon: ShieldCheck, label: 'Security & login' },
  ]
  return (
    <div className="mx-auto max-w-lg pb-10">
      <PageHeader title="Settings" subtitle="Manage your profile, security, and preferences." />
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border-hair p-0">
          {rows.map((r) => (
            <button key={r.label} className="flex w-full items-center gap-3 px-6 py-4 text-left text-sm text-ink hover:bg-surface-2">
              <r.icon size={18} className="text-ink-muted" />
              {r.label}
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
