import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Calculator, ChatCircleDots, MagnifyingGlass, Microphone, CaretDown } from '@phosphor-icons/react'
import { PublicNav } from '@/components/layout/PublicNav'
import { PublicFooter } from '@/components/layout/PublicFooter'
import { Card } from '@/components/ui/Card'
import { ChatPanel } from '@/components/assistant/ChatPanel'
import { SectionReveal } from '@/components/ui/SectionReveal'
import { cn } from '@/lib/utils'
import { assistantIntro, faqCategories, productOffers, quickQuestions } from '@/data/mock'

const SPLINE_SRC = 'https://my.spline.design/roboatlaasassistant-dr0YVvtwIcvxIKtwDNA3MebL/'

type Tab = 'faq' | 'products' | 'calculator'

export default function Assistant() {
  const [tab, setTab] = useState<Tab>('faq')
  const [mode, setMode] = useState<'chat' | 'voice'>('chat')
  const [loanAmount, setLoanAmount] = useState(15000)
  const [months, setMonths] = useState(24)
  const rate = 0.079
  const monthly = (loanAmount * (rate / 12)) / (1 - Math.pow(1 + rate / 12, -months))

  return (
    <div className="min-h-screen bg-paper px-3 py-4 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <PublicNav />
      </div>

      <main className="mx-auto mt-8 max-w-6xl px-2 sm:px-4">
        {/* Hero with Spline */}
        <div className="grid items-center gap-8 lg:grid-cols-2">
          <SectionReveal>
            <h1 className="text-balance font-display text-4xl font-extrabold leading-tight text-ink sm:text-5xl">Ask Vantra anything.</h1>
            <p className="mt-4 max-w-md text-ink-muted">
              24/7 answers on accounts, cards, loans, and offers — plus navigation help and quick calculations. Chat or just talk.
            </p>

            <div className="mt-6 inline-flex rounded-full border border-border-hair bg-surface p-1">
              <button
                onClick={() => setMode('chat')}
                className={cn('flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors', mode === 'chat' ? 'bg-accent text-accent-ink' : 'text-ink-muted')}
              >
                <ChatCircleDots size={16} /> Chat
              </button>
              <button
                onClick={() => setMode('voice')}
                className={cn('flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors', mode === 'voice' ? 'bg-accent text-accent-ink' : 'text-ink-muted')}
              >
                <Microphone size={16} /> Voice
              </button>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {quickQuestions.map((q) => (
                <button
                  key={q}
                  className="rounded-full border border-border-hair bg-surface px-3.5 py-2 text-xs font-medium text-ink-muted transition-colors hover:border-accent hover:text-ink"
                >
                  {q}
                </button>
              ))}
            </div>
          </SectionReveal>

          <SectionReveal delay={0.1} className="relative h-[340px] w-full overflow-hidden rounded-[32px] border border-border-hair bg-gradient-to-b from-[#141b2e] to-[#0b0d10] sm:h-[420px] lg:h-[480px]">
            <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(60% 50% at 50% 65%, rgba(47,212,196,0.25), transparent 70%)' }} />
            <iframe
              src={SPLINE_SRC}
              title="Vantra AI assistant, an animated robot figure"
              className="h-full w-full"
              loading="lazy"
              style={{ border: 'none' }}
            />
          </SectionReveal>
        </div>

        {/* Chat + explore panel */}
        <div className="mt-14 grid gap-6 lg:grid-cols-[1fr_360px]">
          <ChatPanel initialMessages={assistantIntro} className="h-[560px]" />

          <Card className="flex h-[560px] flex-col overflow-hidden">
            <div className="flex border-b border-border-hair">
              {(['faq', 'products', 'calculator'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'flex-1 py-3.5 text-sm font-medium capitalize transition-colors',
                    tab === t ? 'border-b-2 border-accent text-ink' : 'text-ink-muted',
                  )}
                >
                  {t === 'faq' ? 'FAQ' : t}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {tab === 'faq' ? (
                <div className="space-y-1">
                  {faqCategories.map((c) => (
                    <details key={c.name} className="group rounded-xl px-2 py-2.5 hover:bg-surface-2">
                      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-ink">
                        {c.name}
                        <span className="flex items-center gap-2 text-ink-muted">
                          {c.count}
                          <CaretDown size={13} className="transition-transform group-open:rotate-180" />
                        </span>
                      </summary>
                      <p className="mt-2 text-xs leading-relaxed text-ink-muted">Browse {c.count} articles about {c.name.toLowerCase()}, or just ask in chat.</p>
                    </details>
                  ))}
                </div>
              ) : null}

              {tab === 'products' ? (
                <div className="space-y-3">
                  {productOffers.map((p) => (
                    <div key={p.name} className="rounded-2xl border border-border-hair p-4">
                      <div className="flex items-center justify-between">
                        <p className="font-display text-sm font-semibold text-ink">{p.name}</p>
                        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">{p.rate}</span>
                      </div>
                      <p className="mt-1.5 text-xs text-ink-muted">{p.blurb}</p>
                      <button className="mt-2 text-xs font-semibold text-accent hover:underline">Ask about this →</button>
                    </div>
                  ))}
                </div>
              ) : null}

              {tab === 'calculator' ? (
                <div className="space-y-6">
                  <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Calculator size={16} /> Loan payment estimator
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-ink-muted">
                      <span>Loan amount</span>
                      <span className="tabular-nums font-semibold text-ink">${loanAmount.toLocaleString()}</span>
                    </div>
                    <input
                      type="range"
                      min={1000}
                      max={60000}
                      step={500}
                      value={loanAmount}
                      onChange={(e) => setLoanAmount(Number(e.target.value))}
                      className="mt-2 w-full accent-[#e8b23d]"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-ink-muted">
                      <span>Term</span>
                      <span className="tabular-nums font-semibold text-ink">{months} months</span>
                    </div>
                    <input
                      type="range"
                      min={6}
                      max={60}
                      step={6}
                      value={months}
                      onChange={(e) => setMonths(Number(e.target.value))}
                      className="mt-2 w-full accent-[#e8b23d]"
                    />
                  </div>
                  <div className="rounded-2xl bg-mint/35 p-4">
                    <p className="text-xs font-medium text-ink-muted">Estimated monthly payment</p>
                    <p className="tabular-nums font-display text-2xl font-bold text-ink">${monthly.toFixed(2)}</p>
                    <p className="mt-1 text-[11px] text-ink-muted">at 7.9% APR — illustrative only</p>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        </div>

        <div className="mt-10 flex items-center justify-center gap-1.5 text-sm text-ink-muted">
          <MagnifyingGlass size={14} /> Can't find it?{' '}
          <Link to="/login" className="font-semibold text-accent hover:underline">
            Log in
          </Link>{' '}
          for account-specific help.
        </div>
      </main>

      <div className="mx-auto mt-16 max-w-6xl">
        <PublicFooter />
      </div>
    </div>
  )
}
