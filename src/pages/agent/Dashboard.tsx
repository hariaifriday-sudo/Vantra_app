import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Sparkle } from '@phosphor-icons/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Pill } from '@/components/ui/Pill'
import { SectionReveal, StaggerGroup, StaggerItem } from '@/components/ui/SectionReveal'
import { AssistantOrb } from '@/components/assistant/AssistantOrb'
import { cn } from '@/lib/utils'
import { api, type AgentOverview } from '@/lib/api'

const riskTone: Record<string, 'negative' | 'watch' | 'accent' | 'neutral'> = {
  Critical: 'negative',
  High: 'negative',
  Medium: 'watch',
  Low: 'neutral',
}

export default function AgentDashboard() {
  const [overview, setOverview] = useState<AgentOverview | null>(null)

  useEffect(() => {
    api.get<AgentOverview>('/api/agent/overview').then(setOverview)
  }, [])

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Ops Dashboard</h1>
        <p className="mt-1 text-sm text-ink-muted">Everything waiting on you today, across every queue.</p>
      </div>

      {!overview ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-3xl bg-surface-2" />)}
        </div>
      ) : (
        <StaggerGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {overview.stats.map((s) => (
            <StaggerItem key={s.label}>
              <Link to={s.href}>
                <Card className="group p-5 transition-colors hover:border-accent">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-ink-muted">{s.label}</span>
                    <ArrowUpRight size={14} className="text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </div>
                  <p className="mt-3 font-display tabular-nums text-3xl font-bold text-ink">{s.value}</p>
                </Card>
              </Link>
            </StaggerItem>
          ))}
        </StaggerGroup>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <SectionReveal>
          <Card>
            <CardHeader>
              <CardTitle>Priority Worklist</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-ink-muted">
                      <th className="pb-2 font-medium">Type</th>
                      <th className="pb-2 font-medium">Customer</th>
                      <th className="pb-2 font-medium">Risk</th>
                      <th className="pb-2 font-medium">Age</th>
                      <th className="pb-2 font-medium">Assignee</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {overview?.worklist.map((w, i) => (
                      <tr key={i} className="border-t border-border-hair">
                        <td className="py-3 font-medium text-ink">{w.type}</td>
                        <td className="py-3 text-ink-muted">{w.customer}</td>
                        <td className="py-3">
                          <Pill tone={riskTone[w.risk]}>{w.risk}</Pill>
                        </td>
                        <td className="py-3 text-ink-muted">{w.age}</td>
                        <td className={cn('py-3', w.assignee === 'Unassigned' ? 'text-watch' : 'text-ink-muted')}>{w.assignee}</td>
                        <td className="py-3 text-right">
                          <Link to={w.href} className="text-xs font-semibold text-accent hover:underline">
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {overview && overview.worklist.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-sm text-ink-muted">
                          Nothing urgent right now.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </SectionReveal>

        <SectionReveal delay={0.05} className="space-y-6">
          <Card className="p-5">
            <div className="flex items-center gap-2.5">
              <AssistantOrb size={26} />
              <p className="font-display text-sm font-semibold text-ink">Ask Copilot</p>
            </div>
            <p className="mt-2 text-sm text-ink-muted">"Summarize open AML cases from this week" or "what's the SAR filing threshold?"</p>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <Sparkle size={15} className="text-accent" weight="fill" /> Today's Regulatory Digest
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-3 text-sm">
              <p className="text-ink-muted">
                <span className="font-medium text-ink">Fair Lending Underwriting Guidelines</span> updated recently — a gap was flagged against the current model's income-verification threshold.
              </p>
              <Link to="/agent/knowledge" className="inline-block text-xs font-semibold text-accent hover:underline">
                Review in Knowledge Library →
              </Link>
            </CardContent>
          </Card>
        </SectionReveal>
      </div>
    </div>
  )
}
