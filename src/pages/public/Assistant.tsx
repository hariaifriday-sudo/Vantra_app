import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calculator, ChatCircleDots, Headset, MagnifyingGlass, Microphone, CaretDown, Sparkle } from '@phosphor-icons/react'
import { PublicNav } from '@/components/layout/PublicNav'
import { PublicFooter } from '@/components/layout/PublicFooter'
import { Card } from '@/components/ui/Card'
import { ChatPanel, type ChatPanelHandle, type ChatMessage } from '@/components/assistant/ChatPanel'
import { SectionReveal } from '@/components/ui/SectionReveal'
import { cn } from '@/lib/utils'
import { assistantIntro, faqArticles, faqCategories, productOffers, quickActions, quickQuestions } from '@/data/mock'

const SPLINE_SRC = 'https://my.spline.design/roboatlaasassistant-dr0YVvtwIcvxIKtwDNA3MebL/'

type Tab = 'faq' | 'products' | 'calculator'

export default function Assistant() {
  const [tab, setTab] = useState<Tab>('faq')
  const [mode, setMode] = useState<'chat' | 'voice'>('chat')
  const [loanAmount, setLoanAmount] = useState(15000)
  const [months, setMonths] = useState(24)
  const [faqSearch, setFaqSearch] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [transcript, setTranscript] = useState<ChatMessage[]>(assistantIntro)
  const chatRef = useRef<ChatPanelHandle>(null)
  const rate = 0.079
  const monthly = (loanAmount * (rate / 12)) / (1 - Math.pow(1 + rate / 12, -months))

  const filteredArticles = useMemo(() => {
    const q = faqSearch.trim().toLowerCase()
    if (!q) return null
    return faqArticles.filter((a) => a.q.toLowerCase().includes(q) || a.a.toLowerCase().includes(q) || a.category.toLowerCase().includes(q))
  }, [faqSearch])

  // "Already asked" is inferred from the live transcript (typed, voice, or
  // chip-driven — anything that made it into a message) so the strip below
  // the chat keeps surfacing genuinely new suggestions rather than repeating
  // whatever the visitor just asked.
  const askedText = transcript.map((m) => m.text.toLowerCase()).join(' \n ')
  const suggestions = [...quickQuestions, ...quickActions].filter((q) => !askedText.includes(q.toLowerCase())).slice(0, 4)

  function ask(text: string) {
    chatRef.current?.sendMessage(text)
  }

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
              24/7 answers on accounts, cards, loans, and offers — plus branch lookup, appointment booking, and a real person when you need one.
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
                  onClick={() => ask(q)}
                  className="cursor-pointer rounded-full border border-border-hair bg-surface px-3.5 py-2 text-xs font-medium text-ink-muted transition-colors hover:border-accent hover:text-ink"
                >
                  {q}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {quickActions.map((q) => (
                <button
                  key={q}
                  onClick={() => ask(q)}
                  className="cursor-pointer rounded-full border border-accent/40 bg-accent/10 px-3.5 py-2 text-xs font-semibold text-ink transition-colors hover:bg-accent/20"
                >
                  {q}
                </button>
              ))}
            </div>
          </SectionReveal>

          <SectionReveal delay={0.1} className="relative h-[340px] w-full sm:h-[420px] lg:h-[480px]">
            {/* Ambient glow bleeding past the panel's own edges — without this
                the dark rounded rect reads as a "widget" dropped onto the page
                rather than something that belongs to it. Matches the panel's
                own internal glow color so the transition from light page to
                dark panel isn't a hard cliff. */}
            <div className="pointer-events-none absolute -inset-10 -z-10 rounded-[48px] bg-[#2fd4c4]/20 blur-3xl" />
            <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[40px] bg-[#5a4fcf]/15 blur-2xl" />

            <div className="relative h-full w-full overflow-hidden rounded-[32px] bg-gradient-to-b from-[#141b2e] to-[#0b0d10] shadow-[0_30px_80px_-20px_rgba(20,27,46,0.45)]">
              <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(60% 50% at 50% 65%, rgba(47,212,196,0.25), transparent 70%)' }} />
              {/* Soft inner highlight along the top edge stands in for the hard
                  border, giving the panel depth without a visible outline. */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
              {/* Spline has no runtime API here to trigger a real "speaking"
                  animation on the robot itself, so a pulsing ring stands in as
                  visible feedback that a reply is being read aloud. */}
              {speaking ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="h-40 w-40 animate-ping rounded-full bg-[#2fd4c4]/20" />
                </div>
              ) : null}
              <iframe
                src={SPLINE_SRC}
                title="Vantra AI assistant, an animated robot figure"
                className="h-full w-full"
                loading="lazy"
                style={{ border: 'none' }}
              />
              {speaking ? (
                <div className="absolute bottom-4 left-4 flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-[11px] font-medium text-white backdrop-blur-sm">
                  <Sparkle size={12} weight="fill" className="text-[#2fd4c4]" /> Speaking…
                </div>
              ) : null}
            </div>
          </SectionReveal>
        </div>

        {/* Chat + explore panel */}
        <div className="mt-14 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-3">
            <ChatPanel
              ref={chatRef}
              initialMessages={assistantIntro}
              className="h-[560px]"
              persistKey="faq-assistant"
              onSpeakingChange={setSpeaking}
              onMessagesChange={setTranscript}
            />
            {suggestions.length ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-ink-muted">You might also ask:</span>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    className="cursor-pointer rounded-full border border-border-hair bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-accent hover:text-ink"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <Card className="flex h-[560px] flex-col overflow-hidden">
            <div className="flex border-b border-border-hair">
              {(['faq', 'products', 'calculator'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'flex-1 cursor-pointer py-3.5 text-sm font-medium capitalize transition-colors',
                    tab === t ? 'border-b-2 border-accent text-ink' : 'text-ink-muted',
                  )}
                >
                  {t === 'faq' ? 'FAQ' : t}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {tab === 'faq' ? (
                <div>
                  <div className="mb-3 flex items-center gap-2 rounded-full border border-border-hair bg-paper px-3 py-2">
                    <MagnifyingGlass size={14} className="text-ink-muted" />
                    <input
                      value={faqSearch}
                      onChange={(e) => setFaqSearch(e.target.value)}
                      placeholder="Search FAQs..."
                      className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-ink-muted"
                    />
                  </div>

                  {filteredArticles ? (
                    <div className="space-y-1">
                      {filteredArticles.length ? (
                        filteredArticles.map((a) => (
                          <details key={a.q} className="group rounded-xl px-2 py-2.5 hover:bg-surface-2">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-ink">
                              {a.q}
                              <CaretDown size={13} className="shrink-0 text-ink-muted transition-transform group-open:rotate-180" />
                            </summary>
                            <p className="mt-2 text-xs leading-relaxed text-ink-muted">{a.a}</p>
                          </details>
                        ))
                      ) : (
                        <p className="px-2 py-3 text-xs text-ink-muted">
                          No matches — try{' '}
                          <button onClick={() => ask(faqSearch)} className="cursor-pointer font-semibold text-accent hover:underline">
                            asking in chat
                          </button>{' '}
                          instead.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {faqCategories.map((c) => {
                        const articles = faqArticles.filter((a) => a.category === c.name)
                        return (
                          <details key={c.name} className="group rounded-xl px-2 py-2.5 hover:bg-surface-2">
                            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-ink">
                              {c.name}
                              <span className="flex items-center gap-2 text-ink-muted">
                                {c.count}
                                <CaretDown size={13} className="transition-transform group-open:rotate-180" />
                              </span>
                            </summary>
                            <div className="mt-1.5 space-y-1 border-l border-border-hair pl-3">
                              {articles.map((a) => (
                                <details key={a.q} className="group/inner">
                                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1.5 text-xs font-medium text-ink">
                                    {a.q}
                                    <CaretDown size={11} className="shrink-0 text-ink-muted transition-transform group-open/inner:rotate-180" />
                                  </summary>
                                  <p className="pb-2 text-xs leading-relaxed text-ink-muted">{a.a}</p>
                                </details>
                              ))}
                              <p className="py-1.5 text-[11px] text-ink-muted">
                                {c.count - articles.length} more — just{' '}
                                <button onClick={() => ask(`Tell me more about ${c.name.toLowerCase()}`)} className="cursor-pointer font-semibold text-accent hover:underline">
                                  ask in chat
                                </button>
                                .
                              </p>
                            </div>
                          </details>
                        )
                      })}
                    </div>
                  )}
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
                      <button onClick={() => ask(`Tell me about ${p.name}`)} className="mt-2 cursor-pointer text-xs font-semibold text-accent hover:underline">
                        Ask about this →
                      </button>
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

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-2 text-sm text-ink-muted">
          <MagnifyingGlass size={14} /> Can't find it?{' '}
          <Link to="/login" className="font-semibold text-accent hover:underline">
            Log in
          </Link>{' '}
          for account-specific help, or
          <button onClick={() => ask('I would like to talk to a human agent')} className="ml-1 inline-flex cursor-pointer items-center gap-1 font-semibold text-accent hover:underline">
            <Headset size={14} /> talk to a human
          </button>
          .
        </div>
      </main>

      <div className="mx-auto mt-16 max-w-6xl">
        <PublicFooter />
      </div>
    </div>
  )
}
