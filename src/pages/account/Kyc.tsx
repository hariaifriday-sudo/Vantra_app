import { useEffect, useState, type ChangeEvent } from 'react'
import { motion } from 'framer-motion'
import { CloudArrowUp, FileText, CheckCircle, WarningCircle, Sparkle, ClockCounterClockwise, XCircle } from '@phosphor-icons/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Stepper } from '@/components/ui/Stepper'
import { SignaturePad } from '@/components/assistant/SignaturePad'
import { cn } from '@/lib/utils'
import { api, ApiError, type DocumentExtractField, type KycOut } from '@/lib/api'

const steps = ['Upload', 'AI Review', 'Confirm & Sign', 'Submitted']

function confidenceTone(v: number) {
  if (v >= 90) return { label: 'High', cls: 'bg-positive/12 text-positive' }
  if (v >= 75) return { label: 'Medium', cls: 'bg-watch/14 text-watch' }
  return { label: 'Low', cls: 'bg-negative/12 text-negative' }
}

const statusCopy: Record<string, { title: string; body: string; icon: typeof ClockCounterClockwise; tone: string }> = {
  pending: { title: 'Pending Bank Review', body: "A compliance agent will review your submission — usually within 1 business day.", icon: ClockCounterClockwise, tone: 'text-watch bg-watch/15' },
  needs_info: { title: 'More Information Needed', body: 'A reviewer requested additional details. See notes below.', icon: WarningCircle, tone: 'text-watch bg-watch/15' },
  approved: { title: 'Verified', body: 'Your identity has been verified. You now have full access to Vantra.', icon: CheckCircle, tone: 'text-positive bg-positive/15' },
  rejected: { title: 'Verification Unsuccessful', body: 'We were unable to verify your identity with the documents provided.', icon: XCircle, tone: 'text-negative bg-negative/15' },
}

export default function Kyc() {
  const [existing, setExisting] = useState<KycOut | 'none' | 'loading'>('loading')
  const [kycId, setKycId] = useState<number | null>(null)
  const [step, setStep] = useState(0)
  const [scanning, setScanning] = useState(false)
  const [fields, setFields] = useState<DocumentExtractField[]>([])
  const [signed, setSigned] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [caseRef, setCaseRef] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)

  useEffect(() => {
    api.get<KycOut | null>('/api/kyc/me').then((res) => setExisting(res ?? 'none'))
  }, [])

  async function startScan(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setScanning(true)
    setUploadError(null)
    try {
      const [started, extracted] = await Promise.all([
        kycId ? Promise.resolve({ id: kycId, case_ref: caseRef }) : api.post<KycOut>('/api/kyc/start'),
        (async () => {
          const form = new FormData()
          form.append('file', file)
          return api.postForm<{ fields: DocumentExtractField[] }>('/api/documents/extract?kind=kyc', form)
        })(),
      ])
      setKycId(started.id)
      setCaseRef(started.case_ref)
      setFields(extracted.fields)
      setStep(1)
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'Could not process that document. Try a clearer scan.')
    } finally {
      setScanning(false)
    }
  }

  async function submit() {
    if (!kycId) return
    const fieldMap = Object.fromEntries(fields.map((f) => [f.label, f.value]))
    const confidenceMap = Object.fromEntries(fields.map((f) => [f.label, f.confidence]))
    const result = await api.post<KycOut>(`/api/kyc/${kycId}/submit`, { fields: fieldMap, confidences: confidenceMap, signed: true })
    setExisting(result)
    setStep(3)
  }

  if (existing === 'loading') {
    return <div className="mx-auto max-w-4xl"><div className="h-64 animate-pulse rounded-3xl bg-surface-2" /></div>
  }

  if (existing !== 'none' && existing.status !== 'draft' && step !== 3) {
    const copy = statusCopy[existing.status]
    const Icon = copy?.icon ?? ClockCounterClockwise
    return (
      <div className="mx-auto max-w-4xl space-y-8 pb-10">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">KYC Automation</h1>
          <p className="mt-1 text-sm text-ink-muted">Your identity verification status.</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <span className={cn('grid h-16 w-16 place-items-center rounded-full', copy?.tone)}>
              <Icon size={30} weight="fill" />
            </span>
            <div>
              <p className="font-display text-xl font-bold text-ink">{copy?.title}</p>
              <p className="mt-1 max-w-sm text-sm text-ink-muted">{copy?.body}</p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 font-mono text-sm text-ink">
              <FileText size={15} /> {existing.case_ref}
            </div>
            {existing.reviewer_notes ? (
              <div className="mt-2 max-w-sm rounded-2xl bg-surface-2 p-4 text-left text-sm text-ink-muted">
                <p className="mb-1 text-xs font-semibold text-ink">Reviewer notes</p>
                {existing.reviewer_notes}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">KYC Automation</h1>
        <p className="mt-1 text-sm text-ink-muted">Scan your documents and our AI fills the form — you just review and sign.</p>
      </div>

      <Stepper steps={steps} current={step} />

      {step === 0 ? (
        <Card>
          <CardContent className="p-10">
            {!scanning ? (
              <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border-hair bg-paper py-16 text-center transition-colors hover:border-accent">
                <input type="file" className="hidden" onChange={startScan} accept="image/jpeg,image/png,image/webp" />
                <span className="grid h-14 w-14 place-items-center rounded-full bg-accent/15 text-accent">
                  <CloudArrowUp size={26} />
                </span>
                <p className="font-medium text-ink">Drop your ID or address proof here</p>
                <p className="text-sm text-ink-muted">JPG, PNG, or WEBP — a real scan works best</p>
                {uploadError ? <p className="text-sm text-negative">{uploadError}</p> : null}
              </label>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                  <Sparkle size={32} className="text-accent" weight="fill" />
                </motion.div>
                <p className="font-medium text-ink">Scanning document with OCR…</p>
                <p className="text-sm text-ink-muted">Vantra AI is reading and extracting your details.</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {step === 1 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Scanned Document</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-surface-2">
                <div className="absolute inset-6 rounded-xl border border-border-hair bg-paper p-4">
                  <div className="h-3 w-24 rounded bg-ink-muted/20" />
                  <div className="mt-3 h-2 w-40 rounded bg-ink-muted/15" />
                  <div className="mt-2 h-2 w-32 rounded bg-ink-muted/15" />
                  <div className="mt-6 h-2 w-full rounded bg-ink-muted/15" />
                  <div className="mt-2 h-2 w-3/4 rounded bg-ink-muted/15" />
                </div>
              </div>
              <p className="mt-3 text-xs text-ink-muted">Fields below were extracted directly from your upload by Vantra AI (OCR + LLM structuring).</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI-Extracted Fields</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {fields.length === 0 ? <p className="text-sm text-ink-muted">No fields were confidently extracted — try a clearer photo.</p> : null}
              {fields.map((f, i) => {
                const tone = confidenceTone(f.confidence)
                return (
                  <div key={f.label}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="text-xs font-semibold text-ink-muted">{f.label}</label>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', tone.cls)}>{tone.label} confidence</span>
                    </div>
                    <input
                      value={f.value}
                      onChange={(e) => {
                        const next = [...fields]
                        next[i] = { ...f, value: e.target.value }
                        setFields(next)
                      }}
                      className={cn(
                        'w-full rounded-xl border bg-surface px-3.5 py-2.5 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent',
                        f.confidence < 75 ? 'border-negative/50' : 'border-border-hair',
                      )}
                    />
                  </div>
                )
              })}
              <Button onClick={() => setStep(2)} disabled={fields.length === 0} className="mt-2 w-full">
                Looks good, continue
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Confirm &amp; Sign</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((f) => (
                <div key={f.label} className="rounded-xl bg-surface-2 px-4 py-3">
                  <p className="text-[11px] font-medium text-ink-muted">{f.label}</p>
                  <p className="text-sm font-medium text-ink">{f.value}</p>
                </div>
              ))}
            </div>

            <label className="flex items-start gap-2.5 text-sm text-ink-muted">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-border-hair accent-[#e8b23d]" />
              I confirm the information above is accurate and authorize Vantra to verify it against official records.
            </label>

            <div>
              <p className="mb-2 text-xs font-semibold text-ink-muted">Digital signature</p>
              <SignaturePad onChange={setSigned} />
            </div>

            <Button onClick={submit} disabled={!agreed || !signed} className="w-full">
              Submit for Review
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-watch/15 text-watch">
              <ClockCounterClockwise size={30} weight="fill" />
            </span>
            <div>
              <p className="font-display text-xl font-bold text-ink">Pending Bank Review</p>
              <p className="mt-1 text-sm text-ink-muted">A compliance agent will review your submission — usually within 1 business day.</p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 font-mono text-sm text-ink">
              <FileText size={15} /> {caseRef}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-positive">
              <CheckCircle size={14} weight="fill" /> Submission encrypted and logged
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-ink-muted">
              <WarningCircle size={14} /> You'll get a notification the moment there's an update.
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
