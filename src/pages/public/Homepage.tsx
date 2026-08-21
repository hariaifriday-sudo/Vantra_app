import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion'
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
  Bank,
  CreditCard,
  Sparkle,
  Plus,
  Quotes,
  CaretLeft,
  CaretRight,
} from '@phosphor-icons/react'
import { PublicNav } from '@/components/layout/PublicNav'
import { PublicFooter } from '@/components/layout/PublicFooter'
import { Button } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/Pill'
import { Card } from '@/components/ui/Card'
import { SectionReveal, StaggerGroup, StaggerItem } from '@/components/ui/SectionReveal'

gsap.registerPlugin(ScrollTrigger)

const trustLogos = ['Plaid', 'Wise', 'Square', 'Revolut', 'Coinbase', 'Klarna']

const walletFeatures = [
  { icon: CreditCard, title: 'Unified Card Control', body: 'Manage every Vantra card from one intelligent wallet.' },
  { icon: Sparkle, title: 'AI Spending Insights', body: 'AI turns your spending into insights you can act on.' },
  { icon: Globe, title: 'Secure Global Payments', body: 'Pay securely in 150+ countries with fair exchange rates.' },
  { icon: ShieldCheck, title: 'Real-Time Protection', body: 'Instant fraud alerts guard every transaction you make.' },
]

const capabilities = [
  { icon: ClockCountdown, title: '24/7 AI Assistant', body: 'Chat or talk to Vantra any hour — balances, transfers, and answers without hold music.' },
  { icon: Fingerprint, title: 'Smart KYC Onboarding', body: 'Scan an ID, and our OCR pipeline fills your verification form in under a minute.' },
  { icon: ShieldCheck, title: 'Real-Time Fraud Protection', body: 'Every transaction is screened the instant it happens, not after the statement arrives.' },
]

const testimonials = [
  {
    quote: 'Vantra made managing my finances effortless. The smart budgeting tools helped me save 30% more in just three months.',
    name: 'Sarah M.',
    role: 'Freelance Designer',
    avatar: 'https://i.pravatar.cc/72?img=47',
  },
  {
    quote: "I've never seen a more intuitive and friendly banking app. Vantra bank truly set the bar high.",
    name: 'James T.',
    role: 'Software Engineer',
    avatar: 'https://i.pravatar.cc/72?img=12',
  },
  {
    quote: 'Vantra Bank transformed our business finances completely. Our cash flow is healthier and expenses have never been smoother.',
    name: 'Daniel K.',
    role: 'Startup Founder',
    avatar: 'https://i.pravatar.cc/72?img=33',
  },
  {
    quote: 'Switching to Vantra was the best financial decision I’ve made — instant transfers, real-time insights, and zero hidden fees.',
    name: 'Lisa R.',
    role: 'Digital Marketer',
    avatar: 'https://i.pravatar.cc/72?img=45',
  },
]

const faqPreview = [
  { q: 'How secure is Vantra?', a: 'Funds and data are protected with bank-level encryption, continuous fraud monitoring, and biometric login.' },
  { q: 'How does the AI assistant help me?', a: 'It can check balances, explain charges, walk you through KYC, and calculate loan payments — in chat or voice.' },
  { q: 'How long does KYC verification take?', a: 'Most applicants are auto-reviewed in under two minutes; edge cases go to a human agent within one business day.' },
  { q: 'Are there any monthly fees?', a: 'The Everyday plan is free for life. Plus and Business add optional features for a flat monthly rate — cancel anytime.' },
]

const pricing = [
  { name: 'Everyday', price: 'Free', blurb: 'Core banking for individuals.', features: ['No monthly fees', 'AI assistant access', 'Virtual card'] },
  { name: 'Plus', price: '$9/mo', blurb: 'For people who want more control.', features: ['Everything in Everyday', 'Priority support', 'Higher transfer limits'], featured: true },
  { name: 'Business', price: 'Custom', blurb: 'Built for teams and companies.', features: ['Multi-user access', 'Underwriting-ready', 'Dedicated manager'] },
]

export default function Homepage() {
  const heroRef = useRef<HTMLDivElement>(null)
  const cardsRef = useRef<HTMLDivElement>(null)
  const cardJourneyRef = useRef<HTMLDivElement>(null)
  const walletPocketRef = useRef<HTMLDivElement>(null)
  const walletCardGroupRef = useRef<HTMLDivElement>(null)
  const testimonialsRef = useRef<HTMLDivElement>(null)
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const tiltX = useMotionValue(0)
  const tiltY = useMotionValue(0)
  const springTiltX = useSpring(tiltX, { stiffness: 150, damping: 16 })
  const springTiltY = useSpring(tiltY, { stiffness: 150, damping: 16 })

  function handleCardTilt(e: ReactMouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    tiltY.set(((e.clientX - rect.left) / rect.width - 0.5) * 16)
    tiltX.set(((e.clientY - rect.top) / rect.height - 0.5) * -16)
  }
  function resetCardTilt() {
    tiltX.set(0)
    tiltY.set(0)
  }

  function scrollTestimonials(dir: 1 | -1) {
    testimonialsRef.current?.scrollBy({ left: dir * 300, behavior: 'smooth' })
  }

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || !heroRef.current || !cardsRef.current) return

    const ctx = gsap.context(() => {
      // Deliberately opacity-only: a `scale`/transform here would make this
      // section a containing block for the pinned card below (per the CSS
      // spec, `position: fixed` descendants position relative to a transformed
      // ancestor instead of the viewport), breaking the pin's math.
      gsap.to(heroRef.current, {
        opacity: 0.85,
        scrollTrigger: { trigger: heroRef.current, start: 'top top', end: 'bottom top', scrub: 0.6 },
      })

      // The hero card travels down the page (pinned in place while everything
      // else scrolls past it), shrinking, flattening, and fading out right as
      // the resting card already sitting in the wallet pocket fades in. Both
      // tweens are deliberately keyed off the SAME trigger/basis (travelCard's
      // own pin range) rather than one being tied to the pocket's position —
      // pinSpacing shifts the pocket further down the page by the pin's exact
      // duration, which would otherwise put the two on independently-shifting
      // coordinate systems and leave a scroll range where neither card shows.
      if (cardJourneyRef.current && cardsRef.current && walletPocketRef.current && walletCardGroupRef.current) {
        const travelCard = cardJourneyRef.current
        // The pin target (travelCard) is left untouched — GSAP owns its transform
        // for the fixed-position pin trick. We animate the shrink/rotate/fade on
        // this inner child instead, so our tween never fights GSAP's own math.
        const travelCardInner = cardsRef.current
        const dockedCard = walletCardGroupRef.current
        const pinDistance = 1300

        gsap.set(dockedCard, { opacity: 0 })

        ScrollTrigger.create({
          trigger: travelCard,
          start: 'center center',
          end: `+=${pinDistance}`,
          pin: travelCard,
          pinSpacing: true,
          anticipatePin: 1,
          scrub: 0.8,
          onUpdate: (self) => {
            const p = self.progress
            const handoff = 0.7
            gsap.set(travelCardInner, { scale: 1 - 0.55 * p, rotate: -6 * (1 - p) })
            gsap.set(travelCardInner, { opacity: p > handoff ? 1 - (p - handoff) / (1 - handoff) : 1 })
          },
        })

        gsap.to(dockedCard, {
          opacity: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: travelCard,
            start: `center center+=${pinDistance * 0.65}`,
            end: `center center+=${pinDistance}`,
            scrub: 0.6,
          },
        })
      }
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
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <motion.div
              className="absolute -left-20 top-4 h-72 w-72 rounded-full bg-lavender/50 blur-3xl"
              animate={{ x: [0, 30, 0], y: [0, 24, 0], scale: [1, 1.12, 1] }}
              transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="absolute -right-16 top-24 h-64 w-64 rounded-full bg-sky/50 blur-3xl"
              animate={{ x: [0, -24, 0], y: [0, 28, 0], scale: [1, 1.15, 1] }}
              transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
            />
            <motion.div
              className="absolute left-1/3 bottom-0 h-56 w-56 rounded-full bg-mint/50 blur-3xl"
              animate={{ x: [0, 20, 0], y: [0, -18, 0], scale: [1, 1.1, 1] }}
              transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
            />
          </div>

          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center overflow-hidden">
            <span className="select-none font-display text-[18vw] font-black leading-none text-ink/[0.03]">VANTRA</span>
          </div>

          <div className="relative">
            <SectionReveal className="flex items-center justify-center gap-6">
              <span className="hidden h-1.5 w-1.5 rounded-full bg-ink/15 sm:block" />
              <Eyebrow>
                <Lightning size={13} weight="fill" className="text-accent" />
                AI-Powered Banking, Built for Everyone
              </Eyebrow>
              <span className="hidden h-1.5 w-1.5 rounded-full bg-ink/15 sm:block" />
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

            <div ref={cardJourneyRef} className="relative mx-auto mt-16 h-56 w-72 sm:h-64 sm:w-80">
              <div
                ref={cardsRef}
                onMouseMove={handleCardTilt}
                onMouseLeave={resetCardTilt}
                style={{ perspective: 900 }}
                className="relative h-full w-full"
              >
                <motion.div
                  initial={{ opacity: 0, y: 16, scale: 0.95 }}
                  animate={{ opacity: 1, y: [0, -10, 0], scale: 1 }}
                  transition={{
                    opacity: { duration: 0.6, delay: 0.55 },
                    scale: { duration: 0.6, delay: 0.55 },
                    y: { duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1.2 },
                  }}
                  className="absolute -left-9 top-4 z-20 grid h-12 w-12 place-items-center rounded-2xl bg-surface text-positive shadow-lift"
                >
                  <ShieldCheck size={20} weight="fill" />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 16, scale: 0.95 }}
                  animate={{ opacity: 1, y: [0, 12, 0], scale: 1 }}
                  transition={{
                    opacity: { duration: 0.6, delay: 0.75 },
                    scale: { duration: 0.6, delay: 0.75 },
                    y: { duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: 0.6 },
                  }}
                  className="absolute -right-6 bottom-8 z-20 grid h-11 w-11 place-items-center rounded-2xl bg-surface text-accent shadow-lift"
                >
                  <Lightning size={18} weight="fill" />
                </motion.div>

                <motion.div style={{ rotateX: springTiltX, rotateY: springTiltY, transformStyle: 'preserve-3d' }} className="relative h-full w-full">
                  <div className="absolute inset-0 rotate-[8deg] rounded-3xl bg-[#141414] shadow-lift" />
                  <motion.div
                    animate={{ y: [0, -8, 0] }}
                    transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute inset-0 -rotate-[3deg] rounded-3xl bg-gradient-to-br from-[#c9c2f0] via-[#bfe3f5] to-[#e8e4f7] p-6 text-left shadow-lift"
                  >
                    <div className="flex items-center justify-between">
                      <div className="h-8 w-11 rounded-md bg-white/50" />
                      <span className="flex items-center gap-1.5 font-display text-sm font-bold text-ink/70">
                        <Bank size={16} weight="fill" /> VANTRA
                      </span>
                    </div>
                    <p className="mt-10 font-mono text-lg tracking-[0.2em] text-ink/70">•••• •••• •••• 4821</p>
                    <p className="mt-3 text-xs font-medium text-ink/60">MAREN OKAFOR</p>
                  </motion.div>
                </motion.div>
              </div>
            </div>
          </div>

          <SectionReveal delay={0.2} className="mt-16 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
            <motion.div
              className="flex w-max items-center gap-14 opacity-60"
              animate={{ x: ['0%', '-50%'] }}
              transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
            >
              {[...trustLogos, ...trustLogos].map((logo, i) => (
                <span key={`${logo}-${i}`} className="font-display text-sm font-semibold text-ink-muted">
                  {logo}
                </span>
              ))}
            </motion.div>
          </SectionReveal>
        </section>

        {/* Smart Wallet */}
        <section className="border-t border-border-hair px-6 py-20 sm:px-12">
          <SectionReveal className="mx-auto max-w-xl text-center">
            <Eyebrow>Smart Wallet</Eyebrow>
            <h2 className="mt-4 text-balance font-display text-3xl font-bold text-ink sm:text-4xl">Everything your cards need. In one place.</h2>
            <p className="mx-auto mt-4 max-w-md text-sm text-ink-muted">
              One wallet that intelligently organizes every payment, subscription, and transaction across all your cards.
            </p>
          </SectionReveal>

          <div className="relative mx-auto mt-16 grid max-w-4xl items-center gap-12 sm:grid-cols-[1fr_auto_1fr] sm:gap-6">
            <StaggerGroup className="space-y-10 text-center sm:text-right">
              {walletFeatures.slice(0, 2).map((f) => (
                <StaggerItem key={f.title}>
                  <div className="flex flex-col items-center gap-3 sm:flex-row-reverse sm:items-start">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
                      <f.icon size={18} weight="bold" />
                    </span>
                    <div>
                      <h3 className="font-display text-sm font-semibold text-ink">{f.title}</h3>
                      <p className="mt-1 text-xs text-ink-muted sm:max-w-[170px]">{f.body}</p>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </StaggerGroup>

            <SectionReveal delay={0.1} className="relative mx-auto h-72 w-56">
              {/* Wallet pocket — also the scroll endpoint the traveling hero card docks into. */}
              <div ref={walletPocketRef} className="absolute inset-x-0 bottom-0 z-10 h-40 rounded-3xl border-2 border-dashed border-border-hair bg-surface-2 shadow-soft">
                <div className="grid h-full place-items-center text-ink/10">
                  <Bank size={64} weight="fill" />
                </div>
              </div>

              <div ref={walletCardGroupRef} style={{ opacity: 0 }} className="absolute inset-x-3 top-0 z-0 h-36">
                <div className="absolute inset-0 rotate-[6deg] rounded-2xl bg-[#141414] shadow-lift" />
                <motion.div
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute inset-0 -rotate-[2deg] rounded-2xl bg-gradient-to-br from-[#c9c2f0] via-[#bfe3f5] to-[#e8e4f7] p-4 text-left shadow-lift"
                >
                  <div className="flex items-center justify-between">
                    <div className="h-4 w-6 rounded-sm bg-white/60" />
                    <span className="flex items-center gap-1 text-[10px] font-bold text-ink/70">
                      <Bank size={11} weight="fill" /> VANTRA
                    </span>
                  </div>
                  <p className="mt-4 font-mono text-xs tracking-[0.15em] text-ink/60">•••• •••• •••• 4821</p>
                  <p className="mt-1.5 text-[9px] font-medium text-ink/50">MAREN OKAFOR</p>
                </motion.div>
              </div>
            </SectionReveal>

            <StaggerGroup className="space-y-10 text-center sm:text-left">
              {walletFeatures.slice(2, 4).map((f) => (
                <StaggerItem key={f.title}>
                  <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
                      <f.icon size={18} weight="bold" />
                    </span>
                    <div>
                      <h3 className="font-display text-sm font-semibold text-ink">{f.title}</h3>
                      <p className="mt-1 text-xs text-ink-muted sm:max-w-[170px]">{f.body}</p>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </StaggerGroup>
          </div>

          <div className="mt-14 text-center">
            <Link to="/login">
              <Button size="lg">Get Started</Button>
            </Link>
          </div>
        </section>

        {/* Why choose us */}
        <section className="border-t border-border-hair px-6 py-20 sm:px-12">
          <SectionReveal className="mx-auto max-w-xl text-center">
            <Eyebrow>Why Choose Us</Eyebrow>
            <h2 className="mt-4 text-balance font-display text-3xl font-bold text-ink sm:text-4xl">AI that works behind every decision.</h2>
          </SectionReveal>

          <StaggerGroup className="mx-auto mt-14 grid max-w-4xl gap-10 text-center sm:grid-cols-3">
            {capabilities.map((c) => (
              <StaggerItem key={c.title}>
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-border-hair text-ink">
                  <c.icon size={20} weight="light" />
                </div>
                <h3 className="mt-5 font-display text-lg font-semibold text-ink">{c.title}</h3>
                <p className="mx-auto mt-2 max-w-[220px] text-sm leading-relaxed text-ink-muted">{c.body}</p>
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
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute -bottom-10 left-1/2 h-40 w-[140%] -translate-x-1/2 rounded-[100%] bg-gradient-to-t from-accent/70 via-accent/25 to-transparent blur-2xl" />
                  <div className="absolute -bottom-24 left-1/2 h-48 w-[160%] -translate-x-1/2 rounded-[100%] bg-gradient-to-t from-[#7a4a12]/80 to-transparent blur-3xl" />
                </div>
                <div className="relative flex h-full flex-col justify-between">
                  <div>
                    <h3 className="font-display text-xl font-semibold">Borderless Banking</h3>
                    <p className="mt-2 max-w-[200px] text-sm text-white/70">Pay and transfer money wherever life takes you.</p>
                  </div>
                  <button className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/25 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/10">
                    View Countries <ArrowRight size={12} weight="bold" />
                  </button>
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

        {/* Testimonials */}
        <section className="border-t border-border-hair py-20">
          <div className="mx-auto flex max-w-5xl items-end justify-between gap-4 px-6 sm:px-0">
            <SectionReveal>
              <Eyebrow>Testimonials</Eyebrow>
              <h2 className="mt-4 text-balance font-display text-3xl font-bold text-ink sm:text-4xl">What our users are saying.</h2>
            </SectionReveal>
            <SectionReveal delay={0.05} className="hidden shrink-0 gap-2 sm:flex">
              <button
                onClick={() => scrollTestimonials(-1)}
                aria-label="Previous testimonial"
                className="grid h-10 w-10 cursor-pointer place-items-center rounded-full border border-border-hair text-ink-muted transition-colors hover:text-ink"
              >
                <CaretLeft size={16} />
              </button>
              <button
                onClick={() => scrollTestimonials(1)}
                aria-label="Next testimonial"
                className="grid h-10 w-10 cursor-pointer place-items-center rounded-full border border-border-hair text-ink-muted transition-colors hover:text-ink"
              >
                <CaretRight size={16} />
              </button>
            </SectionReveal>
          </div>

          <div
            ref={testimonialsRef}
            className="mx-auto mt-12 flex max-w-5xl snap-x snap-mandatory gap-5 overflow-x-auto px-6 pb-4 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {testimonials.map((t) => (
              <Card key={t.name} className="w-[270px] shrink-0 snap-start p-6">
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                  Trusted Partner
                </span>
                <Quotes size={22} weight="fill" className="mt-4 text-accent/50" />
                <p className="mt-3 text-sm leading-relaxed text-ink">{t.quote}</p>
                <div className="mt-5 flex items-center gap-3">
                  <img src={t.avatar} alt={t.name} className="h-9 w-9 rounded-full object-cover" />
                  <div>
                    <p className="text-sm font-semibold text-ink">{t.name}</p>
                    <p className="text-xs text-ink-muted">{t.role}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* FAQ preview */}
        <section className="border-t border-border-hair px-6 py-20 sm:px-12">
          <SectionReveal className="mx-auto max-w-xl text-center">
            <Eyebrow>FAQ</Eyebrow>
            <h2 className="mt-4 text-balance font-display text-3xl font-bold text-ink sm:text-4xl">Everything you need to know.</h2>
          </SectionReveal>

          <div className="mx-auto mt-12 max-w-2xl divide-y divide-border-hair">
            {faqPreview.map((item, i) => {
              const isOpen = openFaq === i
              return (
                <div key={item.q} className="py-5">
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="flex w-full cursor-pointer items-center justify-between text-left font-display text-base font-semibold text-ink"
                  >
                    {item.q}
                    <motion.span
                      animate={{ rotate: isOpen ? 45 : 0 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border-hair text-ink-muted"
                    >
                      <Plus size={14} weight="bold" />
                    </motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen ? (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                        className="overflow-hidden"
                      >
                        <p className="pt-3 text-sm leading-relaxed text-ink-muted">{item.a}</p>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              )
            })}
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
        <section className="relative overflow-hidden border-t border-border-hair px-6 py-20 text-center sm:px-12">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center overflow-hidden">
            <span className="select-none font-display text-[16vw] font-black leading-none text-ink/[0.03]">VANTRA</span>
          </div>
          <SectionReveal className="relative">
            <h2 className="mx-auto max-w-lg text-balance font-display text-3xl font-bold text-ink sm:text-4xl">
              Bank smarter with AI that works quietly behind every payment.
            </h2>
            <Link to="/login" className="mt-7 inline-block">
              <Button size="lg">Open an Account</Button>
            </Link>
          </SectionReveal>
        </section>
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
