import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle, Plus, Trash, WarningCircle, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Pill'
import { cn } from '@/lib/utils'
import { api, ApiError, type DetectionRuleOut } from '@/lib/api'

type Domain = 'aml' | 'fraud'

interface RuleField {
  key: string
  label: string
  type: 'number' | 'text'
}

const RULE_TYPES: Record<Domain, Record<string, { name: string; fields: RuleField[] }>> = {
  aml: {
    structuring: {
      name: 'Structuring',
      fields: [
        { key: 'ctr_threshold', label: 'Reporting threshold ($)', type: 'number' },
        { key: 'min_leg', label: 'Minimum leg amount ($)', type: 'number' },
        { key: 'window_days', label: 'Window (days)', type: 'number' },
      ],
    },
    velocity: {
      name: 'Velocity',
      fields: [
        { key: 'min_count', label: 'Minimum transactions', type: 'number' },
        { key: 'window_hours', label: 'Window (hours)', type: 'number' },
      ],
    },
    round_number: {
      name: 'Round-number',
      fields: [
        { key: 'min_amount', label: 'Minimum amount ($)', type: 'number' },
        { key: 'round_to', label: 'Round to nearest ($)', type: 'number' },
      ],
    },
    pass_through: {
      name: 'Pass-through',
      fields: [
        { key: 'min_amount', label: 'Minimum in-amount ($)', type: 'number' },
        { key: 'max_hours', label: 'Max hours in→out', type: 'number' },
        { key: 'tolerance_pct', label: 'Amount match tolerance (%)', type: 'number' },
      ],
    },
    dormant_reactivation: {
      name: 'Dormant reactivation',
      fields: [
        { key: 'dormant_days', label: 'Dormant period (days)', type: 'number' },
        { key: 'min_amount', label: 'Reactivation amount ($)', type: 'number' },
      ],
    },
    velocity_baseline: {
      name: 'Personalized velocity',
      fields: [
        { key: 'multiple', label: 'Multiple of own baseline', type: 'number' },
        { key: 'baseline_days', label: 'Baseline window (days)', type: 'number' },
        { key: 'recent_days', label: 'Recent window (days)', type: 'number' },
      ],
    },
    sanctions_match: {
      name: 'Sanctions / high-risk',
      fields: [
        { key: 'high_risk_countries', label: 'High-risk country codes (comma-separated)', type: 'text' },
        { key: 'watchlist_names', label: 'Watchlist names (comma-separated)', type: 'text' },
      ],
    },
    coordinated_structuring: {
      name: 'Coordinated ring',
      fields: [
        { key: 'ring_window_hours', label: 'Ring window (hours)', type: 'number' },
        { key: 'min_holders', label: 'Minimum distinct holders', type: 'number' },
      ],
    },
  },
  fraud: {
    geo_mismatch: {
      name: 'Geo-mismatch',
      fields: [{ key: 'risk', label: 'Risk level (Critical/High/Medium/Low)', type: 'text' }],
    },
    velocity: {
      name: 'Velocity',
      fields: [
        { key: 'min_count', label: 'Minimum transactions', type: 'number' },
        { key: 'window_minutes', label: 'Window (minutes)', type: 'number' },
      ],
    },
    amount_outlier: {
      name: 'Amount outlier',
      fields: [
        { key: 'multiple', label: 'Multiple of recent average', type: 'number' },
        { key: 'baseline_min_count', label: 'Minimum baseline transactions', type: 'number' },
      ],
    },
    impossible_travel: {
      name: 'Impossible travel',
      fields: [{ key: 'max_hours_between_countries', label: 'Max hours between countries', type: 'number' }],
    },
    duplicate_charge: {
      name: 'Duplicate charge',
      fields: [{ key: 'window_minutes', label: 'Window (minutes)', type: 'number' }],
    },
    new_beneficiary_transfer: {
      name: 'New-beneficiary transfer',
      fields: [
        { key: 'lookback_days', label: 'Beneficiary lookback (days)', type: 'number' },
        { key: 'min_amount', label: 'Minimum transfer amount ($)', type: 'number' },
      ],
    },
    new_payee_burst: {
      name: 'New-payee burst',
      fields: [
        { key: 'window_hours', label: 'Window (hours)', type: 'number' },
        { key: 'min_new_payees', label: 'Minimum new payees', type: 'number' },
      ],
    },
    off_hours_anomaly: {
      name: 'Off-hours anomaly',
      fields: [
        { key: 'quiet_start_hour', label: 'Quiet window start (hour, 0-23)', type: 'number' },
        { key: 'quiet_end_hour', label: 'Quiet window end (hour, 0-23)', type: 'number' },
      ],
    },
    new_category_spike: {
      name: 'New-category spike',
      fields: [{ key: 'min_amount', label: 'Minimum amount ($)', type: 'number' }],
    },
    known_bad_merchant: {
      name: 'Known bad merchant',
      fields: [{ key: 'merchants', label: 'Blocklisted merchants (comma-separated, auto-updated)', type: 'text' }],
    },
  },
}

function fieldsFor(domain: Domain, ruleType: string): RuleField[] {
  return RULE_TYPES[domain][ruleType]?.fields ?? []
}

function RuleRow({
  rule,
  domain,
  onChanged,
  onDeleted,
}: {
  rule: DetectionRuleOut
  domain: Domain
  onChanged: (r: DetectionRuleOut) => void
  onDeleted: (id: number) => void
}) {
  const [params, setParams] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(rule.params).map(([k, v]) => [k, String(v)])),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fields = fieldsFor(domain, rule.rule_type)
  const dirty = fields.some((f) => params[f.key] !== String(rule.params[f.key] ?? ''))

  async function toggle() {
    setSaving(true)
    setError(null)
    try {
      const updated = await api.patch<DetectionRuleOut>(`/api/${domain}/rules/${rule.id}`, { enabled: !rule.enabled })
      onChanged(updated)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  async function saveParams() {
    setSaving(true)
    setError(null)
    try {
      const numericParams: Record<string, number | string> = {}
      for (const f of fields) {
        numericParams[f.key] = f.type === 'number' ? Number(params[f.key]) : params[f.key]
      }
      const updated = await api.patch<DetectionRuleOut>(`/api/${domain}/rules/${rule.id}`, { params: numericParams })
      onChanged(updated)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    setSaving(true)
    setError(null)
    try {
      await api.delete(`/api/${domain}/rules/${rule.id}`)
      onDeleted(rule.id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete')
      setSaving(false)
    }
  }

  return (
    <div className={cn('rounded-2xl border p-4', rule.enabled ? 'border-border-hair' : 'border-border-hair opacity-50')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-ink">{rule.label}</p>
            <Pill className="shrink-0">{RULE_TYPES[domain][rule.rule_type]?.name ?? rule.rule_type}</Pill>
            {rule.is_default ? <Pill tone="accent" className="shrink-0">Default</Pill> : null}
          </div>
          <button onClick={toggle} disabled={saving} className="mt-1 text-xs text-ink-muted underline-offset-2 hover:underline">
            {rule.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
          </button>
        </div>
        {!rule.is_default ? (
          <button onClick={remove} disabled={saving} aria-label="Delete rule" className="shrink-0 rounded-full p-2 text-ink-muted hover:bg-negative/10 hover:text-negative">
            <Trash size={15} />
          </button>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {fields.map((f) => (
          <div key={f.key} className={f.type === 'text' && fields.length === 1 ? 'col-span-2' : ''}>
            <label className="mb-1 block text-[11px] font-medium text-ink-muted">{f.label}</label>
            <input
              type={f.type}
              value={params[f.key] ?? ''}
              onChange={(e) => setParams((p) => ({ ...p, [f.key]: e.target.value }))}
              className="w-full rounded-lg border border-border-hair bg-surface px-2.5 py-1.5 text-xs text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </div>
        ))}
      </div>

      {dirty ? (
        <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={saveParams} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      ) : null}
      {error ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-negative">
          <WarningCircle size={13} /> {error}
        </p>
      ) : null}
    </div>
  )
}

function AddRuleForm({ domain, onAdded, onCancel }: { domain: Domain; onAdded: (r: DetectionRuleOut) => void; onCancel: () => void }) {
  const types = Object.keys(RULE_TYPES[domain])
  const [ruleType, setRuleType] = useState(types[0])
  const [label, setLabel] = useState('')
  const [params, setParams] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fields = fieldsFor(domain, ruleType)

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      const numericParams: Record<string, number | string> = {}
      for (const f of fields) {
        if (params[f.key] === undefined || params[f.key] === '') continue
        numericParams[f.key] = f.type === 'number' ? Number(params[f.key]) : params[f.key]
      }
      const created = await api.post<DetectionRuleOut>(`/api/${domain}/rules`, {
        rule_type: ruleType,
        label: label.trim() || RULE_TYPES[domain][ruleType].name,
        params: numericParams,
      })
      onAdded(created)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create rule')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-dashed border-border-hair p-4">
      <p className="mb-3 text-xs font-semibold text-ink-muted">New rule</p>
      <div className="space-y-2.5">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-ink-muted">Type</label>
          <select
            value={ruleType}
            onChange={(e) => {
              setRuleType(e.target.value)
              setParams({})
            }}
            className="w-full rounded-lg border border-border-hair bg-surface px-2.5 py-1.5 text-xs text-ink outline-none"
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {RULE_TYPES[domain][t].name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-ink-muted">Label</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={RULE_TYPES[domain][ruleType].name}
            className="w-full rounded-lg border border-border-hair bg-surface px-2.5 py-1.5 text-xs text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {fields.map((f) => (
            <div key={f.key} className={f.type === 'text' && fields.length === 1 ? 'col-span-2' : ''}>
              <label className="mb-1 block text-[11px] font-medium text-ink-muted">{f.label}</label>
              <input
                type={f.type}
                value={params[f.key] ?? ''}
                onChange={(e) => setParams((p) => ({ ...p, [f.key]: e.target.value }))}
                className="w-full rounded-lg border border-border-hair bg-surface px-2.5 py-1.5 text-xs text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </div>
          ))}
        </div>
      </div>
      {error ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-negative">
          <WarningCircle size={13} /> {error}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1" onClick={submit} disabled={saving}>
          {saving ? 'Adding…' : 'Add rule'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export function RuleConfigPanel({ domain, onClose }: { domain: Domain; onClose: () => void }) {
  const [rules, setRules] = useState<DetectionRuleOut[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    api.get<DetectionRuleOut[]>(`/api/${domain}/rules`).then(setRules)
  }, [domain])

  function handleChanged(updated: DetectionRuleOut) {
    setRules((prev) => (prev ? prev.map((r) => (r.id === updated.id ? updated : r)) : prev))
  }

  function handleDeleted(id: number) {
    setRules((prev) => (prev ? prev.filter((r) => r.id !== id) : prev))
    setToast('Rule deleted')
    window.setTimeout(() => setToast(null), 2200)
  }

  function handleAdded(created: DetectionRuleOut) {
    setRules((prev) => (prev ? [...prev, created] : [created]))
    setAdding(false)
    setToast('Rule added')
    window.setTimeout(() => setToast(null), 2200)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 p-4"
      onClick={onClose}
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
            <h2 className="font-display text-lg font-bold text-ink">{domain === 'aml' ? 'AML' : 'Fraud'} Detection Rules</h2>
            <p className="text-xs text-ink-muted">Adjust thresholds, disable, or add a new rule.</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-ink-muted hover:bg-surface-2" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {!rules ? (
            <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />
          ) : (
            rules.map((r) => <RuleRow key={r.id} rule={r} domain={domain} onChanged={handleChanged} onDeleted={handleDeleted} />)
          )}

          {adding ? (
            <AddRuleForm domain={domain} onAdded={handleAdded} onCancel={() => setAdding(false)} />
          ) : (
            <Button variant="secondary" className="w-full" icon={<Plus size={15} />} onClick={() => setAdding(true)}>
              Add rule
            </Button>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {toast ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm text-paper shadow-lift"
          >
            <CheckCircle size={16} weight="fill" className="text-positive" /> {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  )
}
