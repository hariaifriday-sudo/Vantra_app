import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowsLeftRight,
  Receipt,
  CreditCard,
  DotsThreeOutline,
  MagnifyingGlass,
  FunnelSimple,
  Plus,
  Airplane,
  FirstAidKit,
  Laptop,
  Target,
  Sparkle,
  TrendUp,
  WarningCircle,
} from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/StatTile'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { TrendChart } from '@/components/charts/TrendChart'
import { DonutChart } from '@/components/charts/DonutChart'
import { SectionReveal, StaggerGroup, StaggerItem } from '@/components/ui/SectionReveal'
import { AssistantOrb } from '@/components/assistant/AssistantOrb'
import { cn, formatCurrency } from '@/lib/utils'
import { quickPayees } from '@/data/mock'
import { api, type DashboardSummary, type ForecastOut, type InsightOut } from '@/lib/api'
import { useDataRefresh } from '@/lib/refresh'

const actions = [
  { label: 'Transfer', icon: ArrowsLeftRight, to: '/app/transfers' },
  { label: 'Bills', icon: Receipt, to: '/app/transfers' },
  { label: 'Cards', icon: CreditCard, to: '/app/cards' },
  { label: 'More', icon: DotsThreeOutline, to: '/app/accounts' },
]

const goalIcons: Record<string, typeof Airplane> = { airplane: Airplane, firstaid: FirstAidKit, laptop: Laptop, target: Target }

interface TrendPoint {
  month: string
  income: number
  expenses: number
}
interface ExpenseSlice {
  name: string
  value: number
  color: string
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [expenses, setExpenses] = useState<ExpenseSlice[]>([])
  const [insight, setInsight] = useState<InsightOut | null>(null)
  const [forecast, setForecast] = useState<ForecastOut | null>(null)
  const [error, setError] = useState<string | null>(null)

  function loadCore() {
    Promise.all([
      api.get<DashboardSummary>('/api/accounts/dashboard'),
      api.get<TrendPoint[]>('/api/accounts/trend'),
      api.get<ExpenseSlice[]>('/api/accounts/expense-breakdown'),
    ])
      .then(([s, t, e]) => {
        setSummary(s)
        setTrend(t)
        setExpenses(e)
      })
      .catch(() => setError("Couldn't load your dashboard. Please refresh."))
    api.get<ForecastOut>('/api/accounts/forecast').then(setForecast).catch(() => {})
  }

  useEffect(() => {
    loadCore()
    // Insight is fetched once, not on every refresh: it makes its own live LLM
    // call and is cached server-side for the week, so re-requesting it on every
    // chat-driven refresh would be wasted latency for a number that won't have changed.
    api.get<InsightOut>('/api/accounts/insights').then(setInsight).catch(() => {})
  }, [])

  useDataRefresh(loadCore)

  if (error) return <p className="p-6 text-sm text-negative">{error}</p>
  if (!summary) return <DashboardSkeleton />

  const totalExpensePct = expenses.reduce((sum, e) => sum + e.value, 0) || 1

  return (
    <div className="space-y-6 pb-6">
      <StaggerGroup className="grid gap-4 sm:grid-cols-3">
        <StaggerItem>
          <StatTile label="Total Balance" value={formatCurrency(summary.total_balance)} numericValue={summary.total_balance} tint="mint" period="All accounts" />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Income" value={formatCurrency(summary.income_month)} numericValue={summary.income_month} period="Last 30 days" />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Expenses" value={formatCurrency(summary.expenses_month)} numericValue={summary.expenses_month} period="Last 30 days" />
        </StaggerItem>
      </StaggerGroup>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionReveal>
          <Card className="h-full bg-mint/25 p-5">
            <div className="flex items-start gap-3">
              <AssistantOrb size={28} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  <Sparkle size={12} weight="fill" className="text-accent" /> AI Insight
                </p>
                {insight ? (
                  <>
                    <p className="mt-1.5 font-display text-sm font-semibold text-ink">{insight.title}</p>
                    <p className="mt-1 text-sm text-ink-muted">{insight.body}</p>
                  </>
                ) : (
                  <div className="mt-2 space-y-2">
                    <div className="h-3 w-2/3 animate-pulse rounded bg-ink/10" />
                    <div className="h-3 w-full animate-pulse rounded bg-ink/10" />
                  </div>
                )}
              </div>
            </div>
          </Card>
        </SectionReveal>

        <SectionReveal delay={0.05}>
          <Card className={cn('h-full p-5', forecast?.warning && 'border-watch/50 bg-watch/10')}>
            <div className="flex items-start gap-3">
              <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full', forecast?.warning ? 'bg-watch/20 text-watch' : 'bg-surface-2 text-ink-muted')}>
                {forecast?.warning ? <WarningCircle size={16} weight="fill" /> : <TrendUp size={16} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">30-Day Cash Flow Forecast</p>
                {forecast ? (
                  <>
                    <p className="mt-1.5 font-display tabular-nums text-lg font-bold text-ink">{formatCurrency(forecast.projected_30d_balance)}</p>
                    <p className="text-xs text-ink-muted">
                      {forecast.warning ? forecast.warning_message : `Projected from ${formatCurrency(forecast.current_balance)} today, based on ${forecast.recurring.length} recurring item${forecast.recurring.length === 1 ? '' : 's'}.`}
                    </p>
                  </>
                ) : (
                  <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-ink/10" />
                )}
              </div>
            </div>
          </Card>
        </SectionReveal>
      </div>

      <SectionReveal className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <p className="mr-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Actions</p>
          {actions.map((a) => (
            <button key={a.label} onClick={() => navigate(a.to)} className="flex flex-col items-center gap-1.5">
              <span className="grid h-11 w-11 cursor-pointer place-items-center rounded-full border border-border-hair bg-surface text-ink transition-colors hover:bg-surface-2">
                <a.icon size={18} />
              </span>
              <span className="text-[11px] text-ink-muted">{a.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Quick send</p>
          <div className="flex -space-x-2">
            {quickPayees.map((p) => (
              <div
                key={p.name}
                title={p.name}
                className="grid h-9 w-9 place-items-center rounded-full border-2 border-paper text-[11px] font-bold text-white"
                style={{ background: p.color }}
              >
                {p.name[0]}
              </div>
            ))}
            <button onClick={() => navigate('/app/transfers')} className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border-2 border-paper bg-surface-2 text-ink-muted">
              <Plus size={14} />
            </button>
          </div>
        </div>
      </SectionReveal>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <SectionReveal>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Financial Overview</CardTitle>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-ink-muted">
                  <span className="h-2 w-2 rounded-full bg-positive" /> Income
                </span>
                <span className="flex items-center gap-1.5 text-ink-muted">
                  <span className="h-2 w-2 rounded-full bg-accent" /> Expenses
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <TrendChart data={trend} />
            </CardContent>
          </Card>
        </SectionReveal>

        <SectionReveal delay={0.05}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>All Expenses</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {expenses.length ? (
                <>
                  <DonutChart data={expenses} centerLabel={`${totalExpensePct}%`} />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {expenses.map((e) => (
                      <div key={e.name} className="flex items-center gap-1.5 text-xs text-ink-muted">
                        <span className="h-2 w-2 rounded-full" style={{ background: e.color }} />
                        {e.name} · {e.value}%
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="py-10 text-center text-sm text-ink-muted">No expenses in the last 30 days.</p>
              )}
            </CardContent>
          </Card>
        </SectionReveal>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <SectionReveal>
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
              <div className="flex items-center gap-2">
                <button className="grid h-8 w-8 place-items-center rounded-full border border-border-hair text-ink-muted hover:text-ink" aria-label="Search transactions">
                  <MagnifyingGlass size={14} />
                </button>
                <button className="grid h-8 w-8 place-items-center rounded-full border border-border-hair text-ink-muted hover:text-ink" aria-label="Filter transactions">
                  <FunnelSimple size={14} />
                </button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-ink-muted">
                      <th className="pb-2 font-medium">Merchant</th>
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.transactions.map((t) => (
                      <tr key={t.id} className="border-t border-border-hair">
                        <td className="py-3">
                          <p className="font-medium text-ink">{t.merchant}</p>
                          <p className="text-xs text-ink-muted">{t.category}</p>
                        </td>
                        <td className="py-3 text-ink-muted">{new Date(t.occurred_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
                        <td className="py-3">
                          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', t.status === 'Pending' ? 'bg-watch/14 text-watch' : 'bg-positive/12 text-positive')}>
                            {t.status}
                          </span>
                        </td>
                        <td className={cn('py-3 text-right tabular-nums font-semibold', t.amount > 0 ? 'text-positive' : 'text-ink')}>
                          {t.amount > 0 ? '+' : ''}
                          {formatCurrency(t.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </SectionReveal>

        <SectionReveal delay={0.05}>
          <Card>
            <CardHeader>
              <CardTitle>Savings Goals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {summary.goals.map((g) => {
                const Icon = goalIcons[g.icon] ?? Target
                const pct = Math.round((g.saved / g.target) * 100)
                return (
                  <div key={g.id} className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-lavender/40 text-ink">
                      <Icon size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-ink">{g.name}</span>
                        <span className="text-xs text-ink-muted">{pct}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-ink-muted">
                        {formatCurrency(g.saved)} of {formatCurrency(g.target)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </SectionReveal>
      </div>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 pb-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-3xl bg-surface-2" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="h-72 animate-pulse rounded-3xl bg-surface-2" />
        <div className="h-72 animate-pulse rounded-3xl bg-surface-2" />
      </div>
    </div>
  )
}
