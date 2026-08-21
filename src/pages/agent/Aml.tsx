import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, DownloadSimple, Gear, LinkSimple, X, Sparkle, ArrowSquareOut, CheckCircle, MagnifyingGlass, FileText } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Pill'
import { AnomalyTrend } from '@/components/charts/AnomalyTrend'
import { RadialGauge } from '@/components/charts/RadialGauge'
import { FrameworkCoverage } from '@/components/charts/FrameworkCoverage'
import { SectionReveal } from '@/components/ui/SectionReveal'
import { cn, formatCurrency } from '@/lib/utils'
import { amlAnomalyTrend, amlFlagCategories, amlFrameworkCoverage } from '@/data/mock'
import { api, ApiError, type AmlAlertOut, type AmlScanResult } from '@/lib/api'

const statusTone: Record<string, 'negative' | 'watch' | 'accent' | 'neutral'> = {
  Open: 'negative',
  Investigating: 'watch',
  Escalated: 'watch',
  'SAR Filed': 'accent',
  Cleared: 'neutral',
}

export default function Aml() {
  const [view, setView] = useState<'monitor' | 'investigate'>('monitor')
  const [range, setRange] = useState<'Daily' | 'Weekly' | 'Monthly'>('Daily')
  const [alerts, setAlerts] = useState<AmlAlertOut[] | null>(null)
  const [selected, setSelected] = useState<AmlAlertOut | null>(null)
  const [notes, setNotes] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [acting, setActing] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)

  useEffect(() => {
    api.get<AmlAlertOut[]>('/api/aml/alerts').then(setAlerts)
  }, [])

  async function act(action: 'escalate' | 'file_sar' | 'clear', label: string) {
    if (!selected) return
    setActing(true)
    try {
      const updated = await api.post<AmlAlertOut>(`/api/aml/alerts/${selected.id}/action`, { action, notes: notes || undefined })
      setAlerts((prev) => prev?.map((a) => (a.id === updated.id ? updated : a)) ?? null)
      setSelected(updated)
      setToast(label)
      window.setTimeout(() => setToast(null), 2600)
    } finally {
      setActing(false)
    }
  }

  async function runScan() {
    setScanning(true)
    setScanError(null)
    try {
      const result = await api.post<AmlScanResult>('/api/aml/scan')
      if (result.created.length > 0) {
        setAlerts((prev) => [...result.created, ...(prev ?? [])])
        setToast(`Sweep found ${result.created.length} new alert${result.created.length === 1 ? '' : 's'} across ${result.scanned_transactions} transactions.`)
      } else {
        setToast(`Sweep complete — no new patterns across ${result.scanned_transactions} transactions.`)
      }
      window.setTimeout(() => setToast(null), 4000)
    } catch (err) {
      setScanError(err instanceof ApiError ? err.message : 'Scan failed — try again.')
    } finally {
      setScanning(false)
    }
  }

  const openAlerts = alerts?.filter((a) => a.status === 'Open' || a.status === 'Investigating') ?? []

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/agent" className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink">
            <ArrowLeft size={13} /> Back to dashboard
          </Link>
          <h1 className="font-display text-2xl font-bold text-ink">AML Transaction Monitoring</h1>
          <p className="mt-1 font-mono text-sm text-ink-muted">Daily AML Sweep — Batch #048291</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Pill tone="accent">Segment: Retail &amp; SMB</Pill>
            <Pill>Ruleset: FinCEN-Std v4.2</Pill>
            <Pill>Model: aml-typology-v3</Pill>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={runScan} disabled={scanning} icon={<MagnifyingGlass size={14} />}>
            {scanning ? 'Scanning…' : 'Run AML Sweep'}
          </Button>
          <Button variant="secondary" size="sm" icon={<Gear size={14} />}>
            Configuration
          </Button>
          <Button variant="secondary" size="sm" icon={<DownloadSimple size={14} />}>
            Export CSV
          </Button>
          <Button variant="secondary" size="sm" icon={<LinkSimple size={14} />}>
            Copy Link
          </Button>
        </div>
      </div>
      {scanError ? <p className="text-sm text-negative">{scanError}</p> : null}

      <div className="inline-flex rounded-full border border-border-hair bg-surface p-1">
        {(['monitor', 'investigate'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn('rounded-full px-5 py-2 text-sm font-medium capitalize transition-colors', view === v ? 'bg-accent text-accent-ink' : 'text-ink-muted')}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionReveal>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Anomaly Rate Trend</CardTitle>
              <div className="flex gap-1 rounded-full bg-surface-2 p-0.5">
                {(['Daily', 'Weekly', 'Monthly'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={cn('rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors', range === r ? 'bg-surface text-ink shadow-soft' : 'text-ink-muted')}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <p className="tabular-nums font-display text-2xl font-bold text-ink">27.4%</p>
              <p className="text-xs text-ink-muted">current anomaly rate, {range.toLowerCase()} view · illustrative</p>
              <div className="mt-3">
                <AnomalyTrend data={amlAnomalyTrend} />
              </div>
            </CardContent>
          </Card>
        </SectionReveal>

        <SectionReveal delay={0.05}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Flag Rate by Category</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <RadialGauge data={amlFlagCategories} total="100%" />
            </CardContent>
          </Card>
        </SectionReveal>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionReveal>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Rule Coverage by Framework</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <FrameworkCoverage data={amlFrameworkCoverage} />
            </CardContent>
          </Card>
        </SectionReveal>

        <SectionReveal delay={0.05}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Open Alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-4">
              {!alerts ? (
                <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />
              ) : openAlerts.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-muted">No open alerts.</p>
              ) : (
                openAlerts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => { setSelected(a); setNotes(a.agent_notes ?? '') }}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-border-hair px-4 py-3 text-left transition-colors hover:border-accent"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-medium text-ink">{a.alert_type}</p>
                        {a.source === 'scan' ? <Pill tone="accent" className="shrink-0">Live</Pill> : null}
                      </div>
                      <p className="truncate text-xs text-ink-muted">{a.entity_name} · {formatCurrency(a.volume)}</p>
                    </div>
                    <Pill tone={statusTone[a.status] ?? 'accent'} className="shrink-0">
                      {a.status}
                    </Pill>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </SectionReveal>
      </div>

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
                  <p className="font-mono text-xs text-ink-muted">{selected.case_ref}</p>
                  <h2 className="font-display text-lg font-bold text-ink">{selected.alert_type}</h2>
                </div>
                <button onClick={() => setSelected(null)} className="grid h-8 w-8 place-items-center rounded-full text-ink-muted hover:bg-surface-2" aria-label="Close">
                  <X size={16} />
                </button>
              </div>

              <div className="mt-4 rounded-2xl bg-surface-2 p-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-ink">{selected.entity_name}</span>
                  <span className="tabular-nums text-ink-muted">{formatCurrency(selected.volume)}</span>
                </div>
              </div>

              <div className="mt-5 flex items-start gap-2 rounded-2xl border border-border-hair bg-paper p-4">
                <Sparkle size={16} className="mt-0.5 shrink-0 text-accent" weight="fill" />
                <p className="text-sm leading-relaxed text-ink-muted">{selected.narrative ?? 'No AI narrative available.'}</p>
              </div>

              {selected.evidence?.merchants?.length ? (
                <div className="mt-3 rounded-2xl border border-border-hair p-4">
                  <p className="mb-2 text-xs font-semibold text-ink-muted">Evidence transactions</p>
                  <div className="space-y-1.5">
                    {selected.evidence.merchants.map((m, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-ink-muted">{m}</span>
                        <span className="tabular-nums text-ink">{formatCurrency(selected.evidence.amounts?.[i] ?? 0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {selected.sar_draft ? (
                <div className="mt-3 rounded-2xl bg-accent/10 p-4">
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
                    <FileText size={13} /> Drafted SAR narrative
                  </p>
                  <p className="text-sm leading-relaxed text-ink-muted">{selected.sar_draft}</p>
                </div>
              ) : null}

              {selected.status === 'Open' || selected.status === 'Investigating' ? (
                <div className="mt-4">
                  <label className="mb-1.5 block text-xs font-semibold text-ink-muted">Analyst notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded-xl border border-border-hair bg-surface px-3.5 py-2.5 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    placeholder="Add context before escalating, filing, or clearing…"
                  />
                </div>
              ) : null}

              <div className="mt-4 space-y-2">
                <Button className="w-full" disabled={acting || selected.status === 'Cleared'} iconRight={<ArrowSquareOut size={15} />} onClick={() => act('escalate', 'Escalated to Compliance')}>
                  Escalate to Compliance
                </Button>
                <Button variant="secondary" className="w-full" disabled={acting || selected.status === 'Cleared'} onClick={() => act('file_sar', 'SAR draft filed')}>
                  {selected.sar_draft ? 'Regenerate SAR Draft' : 'File SAR Draft'}
                </Button>
                <Button variant="ghost" className="w-full" disabled={acting || selected.status === 'Cleared'} onClick={() => act('clear', 'Alert cleared')}>
                  Clear
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
            className="fixed bottom-6 left-1/2 z-50 flex max-w-md -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-center text-sm text-paper shadow-lift"
          >
            <CheckCircle size={16} weight="fill" className="shrink-0 text-positive" /> {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
