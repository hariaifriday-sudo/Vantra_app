import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import {
  ArrowRight,
  ShieldCheck,
  ClockCountdown,
  ChartLineUp,
  LockKey,
  Fingerprint,
  Globe,
  Lightning,
  CaretDown,
} from '@phosphor-icons/react'
import { PublicNav } from '@/components/layout/PublicNav'
import { PublicFooter } from '@/components/layout/PublicFooter'
import { Button } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/Pill'
import { Card } from '@/components/ui/Card'
import { SectionReveal, StaggerGroup, StaggerItem } from '@/components/ui/SectionReveal'

gsap.registerPlugin(ScrollTrigger)

const trustLogos = ['Plaid', 'Wise', 'Square', 'Revolut', 'Coinbase', 'Klarna']

const capabilities = [
  { icon: ClockCountdown, title: '24/7 AI Assistant', body: 'Chat or talk to Vantra any hour — balances, transfers, and answers without hold music.' },
  { icon: Fingerprint, title: 'Smart KYC Onboarding', body: 'Scan an ID, and our OCR pipeline fills your verification form in under a minute.' },
  { icon: ShieldCheck, title: 'Real-Time Fraud Protection', body: 'Every transaction is screened the instant it happens, not after the statement arrives.' },
]

const faqPreview = [
  { q: 'How secure is Vantra?', a: 'Funds and data are protected with bank-level encryption, continuous fraud monitoring, and biometric login.' },
  { q: 'How does the AI assistant help me?', a: 'It can check balances, explain charges, walk you through KYC, and calculate loan payments — in chat or voice.' },
  { q: 'How long does KYC verification take?', a: 'Most applicants are auto-reviewed in under two minutes; edge cases go to a human agent within one business day.' },
]

const pricing = [
  { name: 'Everyday', price: 'Free', blurb: 'Core banking for individuals.', features: ['No monthly fees', 'AI assistant access', 'Virtual card'] },
  { name: 'Plus', price: '$9/mo', blurb: 'For people who want more control.', features: ['Everything in Everyday', 'Priority support', 'Higher transfer limits'], featured: true },
  { name: 'Business', price: 'Custom', blurb: 'Built for teams and companies.', features: ['Multi-user access', 'Underwriting-ready', 'Dedicated manager'] },
]

export default function Homepage() {
  const heroRef = useRef<HTMLDivElement>(null)
  const cardsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || !heroRef.current || !cardsRef.current) return

    const ctx = gsap.context(() => {
      gsap.to(cardsRef.current, {
        yPercent: -10,
        rotate: -2,
        scrollTrigger: { trigger: heroRef.current, start: 'top top', end: 'bottom top', scrub: 0.6 },
      })
      gsap.to(heroRef.current, {
        scale: 0.97,
        opacity: 0.85,
        scrollTrigger: { trigger: heroRef.current, start: 'top top', end: 'bottom top', scrub: 0.6 },
      })
    })
    return () => ctx.revert()
  }, [])

  return (
    <div className="min-h-screen bg-[#0a0a0a] px-3 py-4 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <PublicNav />
      </div>

      <main className="mx-auto mt-4 max-w-6xl overflow-hidden rounded-[32px] bg-paper">
        {/* Hero */}
        <section ref={heroRef} className="relative px-6 pb-20 pt-16 text-center sm:px-12">
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center overflow-hidden">
            <span className="select-none font-display text-[18vw] font-black leading-none text-ink/[0.03]">VANTRA</span>
          </div>

          <div className="relative">
            <SectionReveal className="flex justify-center">
              <Eyebrow>
                <Lightning size={13} weight="fill" className="text-accent" />
                AI-Powered Banking, Built for Everyone
              </Eyebrow>
            </SectionReveal>

            <SectionReveal delay={0.05}>
              <h1 className="mx-auto mt-6 max-w-2xl text-balance font-display text-5xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-6xl">
                Banking that thinks a step ahead of you.
              </h1>
            </SectionReveal>

            <SectionReveal delay={0.1}>
              <p className="mx-auto mt-5 max-w-lg text-balance text-base text-ink-muted">
                Vantra pairs everyday banking with an AI assistant that answers questions, verifies your identity, and watches every transaction — quietly, in the background.
              </p>
            </SectionReveal>

            <SectionReveal delay={0.15} className="mt-8 flex items-center justify-center gap-3">
              <Link to="/login">
                <Button size="lg" iconRight={<ArrowRight size={18} weight="bold" />}>
                  Get Started
                </Button>
              </Link>
              <Link to="/assistant">
                <Button size="lg" variant="outline">
                  Explore the Assistant
                </Button>
              </Link>
            </SectionReveal>

            <div ref={cardsRef} className="relative mx-auto mt-16 h-56 w-72 sm:h-64 sm:w-80">
              <div className="absolute inset-0 rotate-[8deg] rounded-3xl bg-[#141414] shadow-lift" />
              <div className="absolute inset-0 -rotate-[3deg] rounded-3xl bg-gradient-to-br from-[#c9c2f0] via-[#bfe3f5] to-[#e8e4f7] p-6 text-left shadow-lift">
                <div className="flex items-center justify-between">
                  <div className="h-8 w-11 rounded-md bg-white/50" />
                  <span className="font-display text-sm font-bold text-ink/70">VANTRA</span>
                </div>
                <p className="mt-10 font-mono text-lg tracking-[0.2em] text-ink/70">•••• •••• •••• 4821</p>
                <p className="mt-3 text-xs font-medium text-ink/60">MAREN OKAFOR</p>
              </div>
            </div>
          </div>

          <SectionReveal delay={0.2} className="mt-16 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 opacity-60">
            {trustLogos.map((logo) => (
              <span key={logo} className="font-display text-sm font-semibold text-ink-muted">
                {logo}
              </span>
            ))}
          </SectionReveal>
        </section>

        {/* Why choose us */}
        <section className="border-t border-border-hair px-6 py-20 sm:px-12">
          <SectionReveal className="mx-auto max-w-xl text-center">
            <Eyebrow>Why Choose Us</Eyebrow>
            <h2 className="mt-4 text-balance font-display text-3xl font-bold text-ink sm:text-4xl">AI that works behind every decision.</h2>
          </SectionReveal>

          <StaggerGroup className="mt-14 grid gap-6 sm:grid-cols-3">
            {capabilities.map((c) => (
              <StaggerItem key={c.title}>
                <Card className="h-full p-6">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-accent/15 text-accent">
                    <c.icon size={22} weight="bold" />
                  </div>
                  <h3 className="mt-5 font-display text-lg font-semibold text-ink">{c.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{c.body}</p>
                </Card>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </section>

        {/* Bento grid */}
        <section id="products" className="border-t border-border-hair px-6 py-20 sm:px-12">
          <SectionReveal className="mx-auto max-w-xl text-center">
            <Eyebrow>Products &amp; Offers</Eyebrow>
            <h2 className="mt-4 text-balance font-display text-3xl font-bold text-ink sm:text-4xl">Everything you need for modern banking.</h2>
          </SectionReveal>

          <StaggerGroup className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-3">
            <StaggerItem className="sm:col-span-2">
              <Card className="flex h-full flex-col justify-between gap-8 bg-mint/30 p-8 sm:flex-row sm:items-center">
                <div>
                  <h3 className="font-display text-xl font-semibold text-ink">Smart Insights</h3>
                  <p className="mt-2 max-w-xs text-sm text-ink-muted">Real-time spending analysis so you always know where your money went.</p>
                </div>
                <div className="grid w-full max-w-[220px] grid-cols-4 gap-2 sm:w-auto">
                  {[38, 62, 45, 80, 55, 70, 30, 90].map((h, i) => (
                    <div key={i} className="flex h-24 items-end">
                      <div className="w-full rounded-md bg-positive/60" style={{ height: `${h}%` }} />
                    </div>
                  ))}
                </div>
              </Card>
            </StaggerItem>

            <StaggerItem>
              <Card className="h-full p-8">
                <h3 className="font-display text-xl font-semibold text-ink">High Security</h3>
                <p className="mt-2 text-sm text-ink-muted">AI continuously monitors every transaction.</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {['AI Protection', 'Encryption', 'Identity Shield', 'Zero Liability', '24/7 Monitoring'].map((tag) => (
                    <span key={tag} className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-ink-muted">
                      {tag}
                    </span>
                  ))}
                </div>
              </Card>
            </StaggerItem>

            <StaggerItem>
              <Card className="relative h-full overflow-hidden bg-[#1a1206] p-8 text-white">
                <div
                  className="absolute inset-0 opacity-70"
                  style={{ background: 'radial-gradient(120% 100% at 20% 100%, #e8b23d 0%, #7a4a12 45%, transparent 75%)' }}
                />
                <div className="relative">
                  <h3 className="font-display text-xl font-semibold">Borderless Banking</h3>
                  <p className="mt-2 max-w-[200px] text-sm text-white/70">Pay and transfer money wherever life takes you.</p>
                </div>
              </Card>
            </StaggerItem>

            <StaggerItem className="sm:col-span-2">
              <Card className="flex h-full items-center justify-between gap-6 p-8">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">24/7 Support</p>
                  <h3 className="mt-1 font-display text-xl font-semibold text-ink">Instant transfers</h3>
                  <p className="mt-2 max-w-xs text-sm text-ink-muted">Pay anywhere with competitive exchange rates and same-second delivery.</p>
                </div>
                <div className="hidden w-56 shrink-0 rounded-2xl border border-border-hair bg-paper p-4 sm:block">
                  <div className="flex items-center justify-between">
                    <Lightning size={16} weight="fill" className="text-positive" />
                    <span className="rounded-full bg-positive/12 px-2 py-0.5 text-[10px] font-semibold text-positive">Sent instantly</span>
                  </div>
                  <p className="mt-3 text-[10px] font-medium text-ink-muted">AMOUNT TRANSFERRED</p>
                  <p className="tabular-nums font-display text-lg font-bold text-ink">$1,240.00</p>
                </div>
              </Card>
            </StaggerItem>
          </StaggerGroup>
        </section>

        {/* FAQ preview */}
        <section className="border-t border-border-hair px-6 py-20 sm:px-12">
          <SectionReveal className="mx-auto max-w-xl text-center">
            <Eyebrow>FAQ</Eyebrow>
            <h2 className="mt-4 text-balance font-display text-3xl font-bold text-ink sm:text-4xl">Everything you need to know.</h2>
          </SectionReveal>

          <div className="mx-auto mt-12 max-w-2xl divide-y divide-border-hair">
            {faqPreview.map((item) => (
              <details key={item.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between font-display text-base font-semibold text-ink">
                  {item.q}
                  <CaretDown size={16} className="text-ink-muted transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">{item.a}</p>
              </details>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link to="/assistant" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
              Ask Vantra a question directly <ArrowRight size={14} weight="bold" />
            </Link>
          </div>
        </section>

        {/* Pricing */}
        <section className="border-t border-border-hair px-6 py-20 sm:px-12">
          <SectionReveal className="mx-auto max-w-xl text-center">
            <Eyebrow>Pricing</Eyebrow>
            <h2 className="mt-4 text-balance font-display text-3xl font-bold text-ink sm:text-4xl">Choose the plan that grows with you.</h2>
          </SectionReveal>

          <StaggerGroup className="mx-auto mt-14 grid max-w-4xl gap-5 sm:grid-cols-3">
            {pricing.map((tier) => (
              <StaggerItem key={tier.name}>
                <Card className={`h-full p-7 ${tier.featured ? 'border-accent bg-[#1a1206] text-white' : ''}`}>
                  {tier.featured ? (
                    <span className="rounded-full bg-accent px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent-ink">Most popular</span>
                  ) : null}
                  <h3 className={`mt-3 font-display text-lg font-semibold ${tier.featured ? 'text-white' : 'text-ink'}`}>{tier.name}</h3>
                  <p className={`mt-1 font-display text-3xl font-bold ${tier.featured ? 'text-white' : 'text-ink'}`}>{tier.price}</p>
                  <p className={`mt-2 text-sm ${tier.featured ? 'text-white/70' : 'text-ink-muted'}`}>{tier.blurb}</p>
                  <ul className={`mt-5 space-y-2 text-sm ${tier.featured ? 'text-white/85' : 'text-ink-muted'}`}>
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-center gap-2">
                        <ShieldCheck size={14} weight="bold" className={tier.featured ? 'text-accent' : 'text-positive'} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button variant={tier.featured ? 'primary' : 'secondary'} className="mt-6 w-full">
                    {tier.price === 'Custom' ? 'Contact Sales' : 'Get Started'}
                  </Button>
                </Card>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </section>

        {/* Closing CTA */}
        <SectionReveal className="border-t border-border-hair px-6 py-20 text-center sm:px-12">
          <h2 className="mx-auto max-w-lg text-balance font-display text-3xl font-bold text-ink sm:text-4xl">
            Bank smarter with AI that works quietly behind every payment.
          </h2>
          <Link to="/login" className="mt-7 inline-block">
            <Button size="lg">Open an Account</Button>
          </Link>
        </SectionReveal>
      </main>

      <div className="mx-auto max-w-6xl">
        <PublicFooter />
      </div>

      <div className="mx-auto mt-6 hidden max-w-6xl items-center gap-6 px-2 text-xs text-white/30 sm:flex">
        <span className="flex items-center gap-1.5">
          <LockKey size={12} /> 256-bit encrypted
        </span>
        <span className="flex items-center gap-1.5">
          <Globe size={12} /> Available in 150+ countries
        </span>
        <span className="flex items-center gap-1.5">
          <ChartLineUp size={12} /> 99.99% uptime
        </span>
      </div>
    </div>
  )
}
