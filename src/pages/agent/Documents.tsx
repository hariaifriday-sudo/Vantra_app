import { useState, type ChangeEvent } from 'react'
import { CloudArrowUp, MagnifyingGlass, LinkSimple, Sparkle } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Pill'
import { api, ApiError, type AccountMatch, type DocumentExtractField } from '@/lib/api'

export default function Documents() {
  const [fileName, setFileName] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [fields, setFields] = useState<DocumentExtractField[]>([])
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<AccountMatch[]>([])
  const [searching, setSearching] = useState(false)
  const [linked, setLinked] = useState<string | null>(null)

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setScanning(true)
    setError(null)
    setFields([])
    try {
      const form = new FormData()
      form.append('file', file)
      const result = await api.postForm<{ fields: DocumentExtractField[] }>('/api/documents/extract?kind=loan', form)
      setFields(result.fields)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Extraction failed.')
    } finally {
      setScanning(false)
    }
  }

  async function search(q: string) {
    setQuery(q)
    if (q.length < 2) {
      setCandidates([])
      return
    }
    setSearching(true)
    try {
      setCandidates(await api.get<AccountMatch[]>(`/api/documents/link-search?q=${encodeURIComponent(q)}`))
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Document Processing</h1>
        <p className="mt-1 text-sm text-ink-muted">OCR extraction from loan and financial forms.</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border-hair bg-paper py-10 text-center transition-colors hover:border-accent">
            <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp" onChange={handleFile} />
            <CloudArrowUp size={22} className="text-accent" />
            <span className="text-sm font-medium text-ink">
              {fileName ? `Loaded: ${fileName}` : 'Drop a loan or financial form (JPG/PNG/WEBP) to extract'}
            </span>
          </label>
          {error ? <p className="mt-3 text-sm text-negative">{error}</p> : null}
        </CardContent>
      </Card>

      {scanning ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
              <Sparkle size={28} className="text-accent" weight="fill" />
            </motion.div>
            <p className="text-sm text-ink-muted">Running OCR and extracting fields with Vantra AI…</p>
          </CardContent>
        </Card>
      ) : null}

      {fields.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Extracted Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-4">
            {fields.map((f) => (
              <div key={f.label} className="flex items-center justify-between rounded-xl bg-surface-2 px-3.5 py-2.5">
                <div>
                  <p className="text-[11px] text-ink-muted">{f.label}</p>
                  <p className="text-sm font-medium text-ink">{f.value}</p>
                </div>
                <Pill tone={f.confidence >= 90 ? 'positive' : f.confidence >= 75 ? 'watch' : 'negative'}>{f.confidence}%</Pill>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <LinkSimple size={16} /> Account Linking
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          <div className="flex items-center gap-2 rounded-xl border border-border-hair bg-surface px-3.5 py-2.5">
            <MagnifyingGlass size={15} className="text-ink-muted" />
            <input
              value={query}
              onChange={(e) => search(e.target.value)}
              placeholder="Search by name or email"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-muted"
            />
          </div>
          {searching ? <p className="text-xs text-ink-muted">Searching…</p> : null}
          <div className="space-y-2">
            {candidates.map((c) => (
              <div key={c.account_ref} className="flex items-center justify-between rounded-xl border border-border-hair px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">{c.name}</p>
                  <p className="font-mono text-xs text-ink-muted">{c.account_ref}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Pill tone={c.match >= 90 ? 'positive' : 'watch'}>{c.match}% match</Pill>
                  <Button size="sm" variant={linked === c.account_ref ? 'secondary' : 'primary'} onClick={() => setLinked(c.account_ref)}>
                    {linked === c.account_ref ? 'Linked' : 'Link to Account'}
                  </Button>
                </div>
              </div>
            ))}
            {query.length >= 2 && !searching && candidates.length === 0 ? (
              <p className="text-sm text-ink-muted">No matching account holders found.</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
