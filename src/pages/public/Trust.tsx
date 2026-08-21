import { Link } from 'react-router-dom'
import { CheckCircle, IdentificationCard, MagnifyingGlass, ChatCircleDots, ShieldCheck, UserCheck } from '@phosphor-icons/react'
import { PublicNav } from '@/components/layout/PublicNav'
import { PublicFooter } from '@/components/layout/PublicFooter'
import { Card } from '@/components/ui/Card'
import { Eyebrow } from '@/components/ui/Pill'
import { SectionReveal, StaggerGroup, StaggerItem } from '@/components/ui/SectionReveal'

const uses = [
  {
    icon: ChatCircleDots,
    title: 'Chat & voice assistants',
    body: "Both the public assistant and the one inside your account are large-language-model based. The account assistant can see your real balances, transactions, and goals to answer specifically — but it never has access to your full account number, password, or the ability to move money without you completing the action yourself.",
  },
  {
    icon: IdentificationCard,
    title: 'KYC document reading',
    body: "When you upload an ID during verification, the text is read locally (OCR) and then structured into form fields by an AI model. Every field shows a confidence score, you can edit anything before submitting, and a human compliance reviewer makes the final approve/reject decision — the AI only ever recommends.",
  },
  {
    icon: ShieldCheck,
    title: 'Fraud & AML monitoring',
    body: "Transactions are screened against rule-based patterns (velocity, structuring, geo-mismatch). When something matches, an AI writes a plain-language explanation of why — but confirming fraud, filing a report, or clearing an alert is always a human agent's decision, never automatic.",
  },
  {
    icon: MagnifyingGlass,
    title: 'Underwriting & case routing',
    body: "Loan risk summaries and support-ticket routing are AI-generated to save agents time, always shown alongside the underlying numbers (credit score, DTI, LTV) or original message so a human can verify the reasoning, not just the conclusion.",
  },
]

const principles = [
  'A human makes every decision that affects your account, your money, or your application outcome — approvals, rejections, and fraud confirmations are never fully automated.',
  'Every AI-generated field, summary, or recommendation is labeled and shown next to the data it came from, so you or an agent can verify it.',
  "Your data is used to answer your questions and process your requests — not to train models shared with other customers, and not sold to third parties.",
  'You can always ask a human. Every AI surface in Vantra has a path to escalate to a real person.',
]

export default function Trust() {
  return (
    <div className="min-h-screen bg-paper px-3 py-4 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <PublicNav />
      </div>

      <main className="mx-auto mt-12 max-w-3xl px-2 sm:px-4">
        <SectionReveal>
          <Eyebrow>Trust &amp; Transparency</Eyebrow>
          <h1 className="mt-4 text-balance font-display text-4xl font-extrabold leading-tight text-ink sm:text-5xl">How Vantra uses AI.</h1>
          <p className="mt-4 max-w-xl text-ink-muted">
            AI touches a lot of what you see in Vantra — the chat assistant, KYC review, fraud detection, loan decisions. Here's exactly where it's used, what it can and can't do, and where a human is always in the loop.
          </p>
        </SectionReveal>

        <StaggerGroup className="mt-12 space-y-4">
          {uses.map((u) => (
            <StaggerItem key={u.title}>
              <Card className="flex gap-4 p-6">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent/15 text-accent">
                  <u.icon size={20} weight="bold" />
                </span>
                <div>
                  <h3 className="font-display text-base font-semibold text-ink">{u.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{u.body}</p>
                </div>
              </Card>
            </StaggerItem>
          ))}
        </StaggerGroup>

        <SectionReveal className="mt-14">
          <h2 className="font-display text-2xl font-bold text-ink">Our principles</h2>
          <div className="mt-5 space-y-3">
            {principles.map((p) => (
              <div key={p} className="flex items-start gap-3">
                <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-positive" />
                <p className="text-sm leading-relaxed text-ink-muted">{p}</p>
              </div>
            ))}
          </div>
        </SectionReveal>

        <SectionReveal delay={0.05} className="mt-14">
          <Card className="flex flex-col items-start gap-3 bg-mint/25 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <UserCheck size={22} className="shrink-0 text-ink" />
              <p className="text-sm text-ink">Have a question about a specific AI decision on your account?</p>
            </div>
            <Link to="/assistant" className="shrink-0 text-sm font-semibold text-accent hover:underline">
              Ask Vantra directly →
            </Link>
          </Card>
        </SectionReveal>
      </main>

      <div className="mx-auto mt-16 max-w-6xl">
        <PublicFooter />
      </div>
    </div>
  )
}
