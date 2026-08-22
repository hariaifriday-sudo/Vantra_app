import { useEffect, useState } from 'react'
import { Calendar, Check } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { api, ApiError, type AppointmentOut, type BranchOut } from '@/lib/api'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

interface AppointmentPrefill {
  branch_name: string
  name?: string
  email?: string
  preferred_date?: string
  preferred_time?: string
  reason?: string
}

export function AppointmentBookingCard({ prefill, dark }: { prefill: AppointmentPrefill; dark: boolean }) {
  const [branches, setBranches] = useState<BranchOut[]>([])
  const [name, setName] = useState(prefill.name || '')
  const [email, setEmail] = useState(prefill.email || '')
  const [phone, setPhone] = useState('')
  const [branchName, setBranchName] = useState(prefill.branch_name)
  const [date, setDate] = useState(prefill.preferred_date || todayIso())
  const [time, setTime] = useState(prefill.preferred_time || '10:00 AM')
  const [reason, setReason] = useState(prefill.reason || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<AppointmentOut | null>(null)

  useEffect(() => {
    api.get<BranchOut[]>('/api/public/branches').then(setBranches).catch(() => {})
  }, [])

  async function submit() {
    if (!name.trim() || !email.trim()) {
      setError('Name and email are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await api.post<AppointmentOut>('/api/public/appointments', {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        branch_name: branchName,
        preferred_date: date,
        preferred_time: time,
        reason: reason.trim() || undefined,
      })
      setConfirmed(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not book the appointment — try again.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = cn(
    'w-full rounded-lg border px-2.5 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent',
    dark ? 'border-white/15 bg-white/[0.04] text-white placeholder:text-white/40' : 'border-border-hair bg-paper text-ink placeholder:text-ink-muted',
  )
  const labelClass = cn('mb-1 block text-[11px] font-medium', dark ? 'text-white/60' : 'text-ink-muted')

  if (confirmed) {
    return (
      <div className={cn('mt-2 w-full rounded-xl border p-3 text-sm', dark ? 'border-white/10 bg-white/[0.04]' : 'border-border-hair bg-paper')}>
        <p className="flex items-center gap-1.5 font-semibold text-positive">
          <Check size={15} weight="bold" /> Appointment requested
        </p>
        <p className={cn('mt-1 text-xs', dark ? 'text-white/70' : 'text-ink-muted')}>
          {confirmed.branch_name} · {confirmed.preferred_date} at {confirmed.preferred_time}
        </p>
        <p className={cn('mt-1 text-xs', dark ? 'text-white/50' : 'text-ink-muted')}>
          Reference <span className="font-mono">{confirmed.reference}</span> — a confirmation has been sent to your email.
        </p>
      </div>
    )
  }

  return (
    <div className={cn('mt-2 w-full rounded-xl border p-3 text-sm', dark ? 'border-white/10 bg-white/[0.04]' : 'border-border-hair bg-paper')}>
      <p className="flex items-center gap-1.5 font-semibold">
        <Calendar size={15} /> Book a branch appointment
      </p>
      {prefill.name || prefill.email || prefill.preferred_date || prefill.preferred_time || prefill.reason ? (
        <p className={cn('mt-1 text-[11px]', dark ? 'text-white/50' : 'text-ink-muted')}>Pre-filled from our conversation — check it over and confirm.</p>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div className="col-span-2">
          <label className={labelClass}>Full name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" className={inputClass} />
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Phone (optional)</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="555-0142" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Branch</label>
          <select value={branchName} onChange={(e) => setBranchName(e.target.value)} className={inputClass}>
            {(branches.length ? branches.map((b) => b.name) : [prefill.branch_name]).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Date</label>
          <input type="date" min={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Time</label>
          <select value={time} onChange={(e) => setTime(e.target.value)} className={inputClass}>
            {['9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Reason (optional)</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Open a new account" className={inputClass} />
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-negative">{error}</p> : null}
      <button
        onClick={submit}
        disabled={saving}
        className="mt-3 w-full cursor-pointer rounded-full bg-accent px-3 py-2 text-xs font-semibold text-accent-ink transition-transform active:scale-[0.98] disabled:opacity-50"
      >
        {saving ? 'Booking…' : 'Confirm appointment'}
      </button>
    </div>
  )
}
