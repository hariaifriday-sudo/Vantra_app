import { useState } from 'react'
import { ArrowSquareOut, Check, Clock, Envelope, MapPin, PaperPlaneTilt, Phone } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { api, ApiError, type BranchOut } from '@/lib/api'

function EmailBranchButton({ branchName, dark }: { branchName: string; dark: boolean }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    if (!email.trim()) return
    setSending(true)
    setError(null)
    try {
      await api.post('/api/public/branches/email', { email: email.trim(), branch_name: branchName })
      setSent(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send — try again.')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <p className={cn('mt-2 flex items-center gap-1.5 text-xs font-medium text-positive')}>
        <Check size={13} weight="bold" /> Sent to {email}
      </p>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={cn('mt-2 inline-flex items-center gap-1.5 text-xs font-medium underline-offset-2 hover:underline', dark ? 'text-white/60' : 'text-ink-muted')}
      >
        <Envelope size={13} /> Email me this
      </button>
    )
  }

  return (
    <div className="mt-2 flex items-center gap-1.5">
      <input
        type="email"
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && send()}
        placeholder="you@example.com"
        className={cn(
          'min-w-0 flex-1 rounded-full border px-2.5 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent',
          dark ? 'border-white/15 bg-white/[0.04] text-white placeholder:text-white/40' : 'border-border-hair bg-surface text-ink placeholder:text-ink-muted',
        )}
      />
      <button
        onClick={send}
        disabled={sending || !email.trim()}
        aria-label="Send"
        className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full bg-accent text-accent-ink transition-transform active:scale-90 disabled:opacity-50"
      >
        <PaperPlaneTilt size={12} weight="fill" />
      </button>
      {error ? <span className="text-[11px] text-negative">{error}</span> : null}
    </div>
  )
}

export function BranchResultsCard({ branches, dark }: { branches: BranchOut[]; dark: boolean }) {
  return (
    <div className="mt-2 w-full space-y-2">
      {branches.map((b) => (
        <div key={b.name} className={cn('rounded-xl border p-3 text-sm', dark ? 'border-white/10 bg-white/[0.04]' : 'border-border-hair bg-paper')}>
          <p className="font-semibold">{b.name}</p>
          <p className={cn('mt-1 flex items-start gap-1.5 text-xs', dark ? 'text-white/70' : 'text-ink-muted')}>
            <MapPin size={13} className="mt-0.5 shrink-0" /> {b.address}
          </p>
          <p className={cn('mt-1 flex items-center gap-1.5 text-xs', dark ? 'text-white/70' : 'text-ink-muted')}>
            <Phone size={13} className="shrink-0" /> {b.phone}
          </p>
          <p className={cn('mt-1 flex items-center gap-1.5 text-xs', dark ? 'text-white/70' : 'text-ink-muted')}>
            <Clock size={13} className="shrink-0" /> {b.hours}
          </p>
          <a
            href={b.maps_url}
            target="_blank"
            rel="noreferrer"
            className={cn(
              'mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
              dark ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-accent/15 text-accent hover:bg-accent/25',
            )}
          >
            Open in Google Maps <ArrowSquareOut size={12} weight="bold" />
          </a>
          <EmailBranchButton branchName={b.name} dark={dark} />
        </div>
      ))}
    </div>
  )
}
