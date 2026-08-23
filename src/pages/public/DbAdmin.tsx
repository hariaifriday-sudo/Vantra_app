import { useEffect, useMemo, useState } from 'react'
import {
  ArrowsClockwise,
  CaretLeft,
  CaretRight,
  CircleNotch,
  Database,
  MagnifyingGlass,
  PencilSimple,
  Play,
  Plus,
  Sparkle,
  Trash,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Pill'
import { cn } from '@/lib/utils'
import { api, ApiError } from '@/lib/api'

// ---- types (local to this admin tool — not part of the public API surface in lib/api.ts) ----

interface TableSummary {
  name: string
  row_count: number
}

interface ColumnInfo {
  name: string
  type: string
  primary_key: boolean
  nullable: boolean
}

interface TableData {
  columns: ColumnInfo[]
  pk_columns: string[]
  rows: Record<string, unknown>[]
  total: number
  limit: number
  offset: number
}

interface SqlExecuteResult {
  is_select: boolean
  columns: string[]
  rows: unknown[][]
  row_count: number
}

type RowValues = Record<string, unknown>

const DESTRUCTIVE_SQL = /^\s*(update|delete|drop|truncate|alter)\b/i
const DATE_TYPE = /^DATETIME|^DATE|^TIME/i
const BOOL_TYPE = /^BOOLEAN/i
const INT_TYPE = /^INTEGER/i
const NUM_TYPE = /^(FLOAT|NUMERIC|REAL|DOUBLE)/i
const JSON_TYPE = /^JSON/i
const TEXT_TYPE = /^TEXT/i

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

export default function DbAdmin() {
  const [tables, setTables] = useState<TableSummary[] | null>(null)
  const [tablesError, setTablesError] = useState<string | null>(null)
  const [tableFilter, setTableFilter] = useState('')

  const [selected, setSelected] = useState<string | null>(null)
  const [tableData, setTableData] = useState<TableData | null>(null)
  const [tableLoading, setTableLoading] = useState(false)
  const [tableError, setTableError] = useState<string | null>(null)

  const [limit, setLimit] = useState(25)
  const [offset, setOffset] = useState(0)
  const [orderBy, setOrderBy] = useState<string | null>(null)
  const [orderDir, setOrderDir] = useState<'asc' | 'desc'>('asc')

  const [editingRow, setEditingRow] = useState<RowValues | null>(null)
  const [addingRow, setAddingRow] = useState(false)
  const [deletingRow, setDeletingRow] = useState<RowValues | null>(null)
  const [rowActionError, setRowActionError] = useState<string | null>(null)
  const [rowSaving, setRowSaving] = useState(false)

  const [nlPrompt, setNlPrompt] = useState('')
  const [sql, setSql] = useState('')
  const [sqlNote, setSqlNote] = useState('')
  const [generating, setGenerating] = useState(false)
  const [running, setRunning] = useState(false)
  const [sqlResult, setSqlResult] = useState<SqlExecuteResult | null>(null)
  const [sqlError, setSqlError] = useState<string | null>(null)
  const [confirmingDestructive, setConfirmingDestructive] = useState(false)

  function loadTables() {
    setTablesError(null)
    api
      .get<TableSummary[]>('/api/db-admin/tables')
      .then(setTables)
      .catch((err) => setTablesError(err instanceof ApiError ? err.message : 'Failed to load tables'))
  }

  useEffect(loadTables, [])

  function loadTable(name: string, opts?: { limit?: number; offset?: number; orderBy?: string | null; orderDir?: 'asc' | 'desc' }) {
    const l = opts?.limit ?? limit
    const o = opts?.offset ?? offset
    const ob = opts?.orderBy !== undefined ? opts.orderBy : orderBy
    const od = opts?.orderDir ?? orderDir
    setTableLoading(true)
    setTableError(null)
    const params = new URLSearchParams({ limit: String(l), offset: String(o) })
    if (ob) {
      params.set('order_by', ob)
      params.set('order_dir', od)
    }
    api
      .get<TableData>(`/api/db-admin/tables/${name}?${params}`)
      .then(setTableData)
      .catch((err) => setTableError(err instanceof ApiError ? err.message : 'Failed to load table'))
      .finally(() => setTableLoading(false))
  }

  function selectTable(name: string) {
    setSelected(name)
    setOffset(0)
    setOrderBy(null)
    setOrderDir('asc')
    loadTable(name, { offset: 0, orderBy: null, orderDir: 'asc' })
  }

  function toggleSort(col: string) {
    if (!selected) return
    const nextDir: 'asc' | 'desc' = orderBy === col && orderDir === 'asc' ? 'desc' : 'asc'
    setOrderBy(col)
    setOrderDir(nextDir)
    loadTable(selected, { orderBy: col, orderDir: nextDir })
  }

  function changePage(delta: number) {
    if (!selected || !tableData) return
    const next = Math.max(0, offset + delta * limit)
    setOffset(next)
    loadTable(selected, { offset: next })
  }

  function changeLimit(newLimit: number) {
    if (!selected) return
    setLimit(newLimit)
    setOffset(0)
    loadTable(selected, { limit: newLimit, offset: 0 })
  }

  function refreshCurrent() {
    loadTables()
    if (selected) loadTable(selected)
  }

  async function saveEdit(values: RowValues) {
    if (!selected || !tableData || !editingRow) return
    const pkCol = tableData.pk_columns[0]
    const pkValue = editingRow[pkCol]
    setRowSaving(true)
    setRowActionError(null)
    try {
      await api.patch(`/api/db-admin/tables/${selected}/rows/${encodeURIComponent(String(pkValue))}`, { values })
      setEditingRow(null)
      loadTable(selected)
      loadTables()
    } catch (err) {
      setRowActionError(err instanceof ApiError ? err.message : 'Update failed')
    } finally {
      setRowSaving(false)
    }
  }

  async function saveAdd(values: RowValues) {
    if (!selected) return
    setRowSaving(true)
    setRowActionError(null)
    try {
      await api.post(`/api/db-admin/tables/${selected}/rows`, { values })
      setAddingRow(false)
      loadTable(selected)
      loadTables()
    } catch (err) {
      setRowActionError(err instanceof ApiError ? err.message : 'Insert failed')
    } finally {
      setRowSaving(false)
    }
  }

  async function confirmDelete() {
    if (!selected || !tableData || !deletingRow) return
    const pkCol = tableData.pk_columns[0]
    const pkValue = deletingRow[pkCol]
    setRowSaving(true)
    setRowActionError(null)
    try {
      await api.delete(`/api/db-admin/tables/${selected}/rows/${encodeURIComponent(String(pkValue))}`)
      setDeletingRow(null)
      loadTable(selected)
      loadTables()
    } catch (err) {
      setRowActionError(err instanceof ApiError ? err.message : 'Delete failed')
    } finally {
      setRowSaving(false)
    }
  }

  async function generateSql() {
    if (!nlPrompt.trim()) return
    setGenerating(true)
    setSqlError(null)
    setSqlResult(null)
    try {
      const result = await api.post<{ sql: string; note: string }>('/api/db-admin/sql/generate', { prompt: nlPrompt })
      setSql(result.sql)
      setSqlNote(result.note)
    } catch (err) {
      setSqlError(err instanceof ApiError ? err.message : 'Could not generate SQL')
    } finally {
      setGenerating(false)
    }
  }

  async function runSql() {
    if (!sql.trim()) return
    if (DESTRUCTIVE_SQL.test(sql) && !confirmingDestructive) {
      setConfirmingDestructive(true)
      return
    }
    setConfirmingDestructive(false)
    setRunning(true)
    setSqlError(null)
    try {
      const result = await api.post<SqlExecuteResult>('/api/db-admin/sql/execute', { sql })
      setSqlResult(result)
      loadTables()
      if (selected) loadTable(selected)
    } catch (err) {
      setSqlError(err instanceof ApiError ? err.message : 'Query failed')
    } finally {
      setRunning(false)
    }
  }

  const filteredTables = useMemo(
    () => (tables ?? []).filter((t) => t.name.toLowerCase().includes(tableFilter.toLowerCase())),
    [tables, tableFilter],
  )

  return (
    <div className="flex h-screen flex-col bg-paper text-ink">
      <header className="flex shrink-0 items-center justify-between border-b border-border-hair bg-surface px-5 py-3">
        <div className="flex items-center gap-2.5">
          <Database size={18} className="text-accent" />
          <h1 className="font-display text-sm font-bold">Vantra DB Admin</h1>
          <Pill tone="watch">Testing tool — not for production data</Pill>
        </div>
        <Button size="sm" variant="secondary" icon={<ArrowsClockwise size={13} />} onClick={refreshCurrent}>
          Refresh
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col border-r border-border-hair bg-surface">
          <div className="p-3">
            <div className="flex items-center gap-2 rounded-full border border-border-hair bg-paper px-3 py-2">
              <MagnifyingGlass size={13} className="text-ink-muted" />
              <input
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value)}
                placeholder="Filter tables…"
                className="w-full bg-transparent text-xs outline-none placeholder:text-ink-muted"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {tablesError && <p className="px-2 py-2 text-xs text-negative">{tablesError}</p>}
            {!tables && !tablesError && <p className="px-2 py-2 text-xs text-ink-muted">Loading tables…</p>}
            {filteredTables.map((t) => (
              <button
                key={t.name}
                onClick={() => selectTable(t.name)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors',
                  selected === t.name ? 'bg-surface-2 font-semibold text-ink' : 'text-ink-muted hover:bg-surface-2/60',
                )}
              >
                <span className="truncate font-mono">{t.name}</span>
                <span className="shrink-0 text-[10px] text-ink-muted">{t.row_count}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-5">
          <SqlConsole
            nlPrompt={nlPrompt}
            setNlPrompt={setNlPrompt}
            sql={sql}
            setSql={setSql}
            sqlNote={sqlNote}
            generating={generating}
            running={running}
            sqlResult={sqlResult}
            sqlError={sqlError}
            confirmingDestructive={confirmingDestructive}
            onCancelConfirm={() => setConfirmingDestructive(false)}
            onGenerate={generateSql}
            onRun={runSql}
          />

          <div className="mt-5">
            {!selected && <div className="rounded-2xl border border-dashed border-border-hair p-10 text-center text-sm text-ink-muted">Pick a table from the sidebar to browse its rows.</div>}

            {selected && (
              <div className="rounded-2xl border border-border-hair bg-surface">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-hair p-3.5">
                  <div className="flex items-center gap-2">
                    <h2 className="font-mono text-sm font-semibold">{selected}</h2>
                    {tableData && <span className="text-xs text-ink-muted">{tableData.total} rows</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={() => setAddingRow(true)}>
                      Add row
                    </Button>
                  </div>
                </div>

                {tableError && <p className="p-4 text-sm text-negative">{tableError}</p>}
                {tableLoading && <p className="p-4 text-sm text-ink-muted">Loading…</p>}

                {tableData && !tableLoading && (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-border-hair bg-surface-2/60">
                            {tableData.columns.map((c) => (
                              <th
                                key={c.name}
                                onClick={() => toggleSort(c.name)}
                                className="cursor-pointer select-none whitespace-nowrap px-3 py-2 font-mono font-semibold text-ink-muted hover:text-ink"
                              >
                                {c.name}
                                {c.primary_key && <span className="ml-1 text-accent">PK</span>}
                                {orderBy === c.name && <span className="ml-1">{orderDir === 'asc' ? '↑' : '↓'}</span>}
                              </th>
                            ))}
                            <th className="px-3 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {tableData.rows.length === 0 && (
                            <tr>
                              <td colSpan={tableData.columns.length + 1} className="px-3 py-6 text-center text-ink-muted">
                                No rows.
                              </td>
                            </tr>
                          )}
                          {tableData.rows.map((row, i) => (
                            <tr key={i} className="border-b border-border-hair/60 hover:bg-surface-2/40">
                              {tableData.columns.map((c) => (
                                <td key={c.name} className="max-w-[240px] truncate whitespace-nowrap px-3 py-2 font-mono text-ink">
                                  {truncate(formatCell(row[c.name]), 60)}
                                </td>
                              ))}
                              <td className="whitespace-nowrap px-3 py-2 text-right">
                                <button onClick={() => setEditingRow(row)} className="rounded p-1 text-ink-muted hover:bg-surface-2 hover:text-ink" title="Edit row">
                                  <PencilSimple size={13} />
                                </button>
                                <button onClick={() => setDeletingRow(row)} className="rounded p-1 text-ink-muted hover:bg-negative/10 hover:text-negative" title="Delete row">
                                  <Trash size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-border-hair p-3 text-xs text-ink-muted">
                      <div className="flex items-center gap-2">
                        <span>
                          Showing {tableData.total === 0 ? 0 : offset + 1}–{Math.min(offset + limit, tableData.total)} of {tableData.total}
                        </span>
                        <select value={limit} onChange={(e) => changeLimit(Number(e.target.value))} className="rounded-full border border-border-hair bg-paper px-2 py-1 text-xs outline-none">
                          {[25, 50, 100, 250].map((n) => (
                            <option key={n} value={n}>
                              {n}/page
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button disabled={offset === 0} onClick={() => changePage(-1)} className="rounded-full border border-border-hair p-1.5 disabled:opacity-40">
                          <CaretLeft size={13} />
                        </button>
                        <button disabled={offset + limit >= tableData.total} onClick={() => changePage(1)} className="rounded-full border border-border-hair p-1.5 disabled:opacity-40">
                          <CaretRight size={13} />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {editingRow && tableData && (
        <RowFormDialog
          title={`Edit row · ${selected}`}
          columns={tableData.columns}
          pkColumns={tableData.pk_columns}
          initialValues={editingRow}
          saving={rowSaving}
          error={rowActionError}
          onCancel={() => {
            setEditingRow(null)
            setRowActionError(null)
          }}
          onSave={saveEdit}
        />
      )}

      {addingRow && tableData && (
        <RowFormDialog
          title={`Add row · ${selected}`}
          columns={tableData.columns}
          pkColumns={tableData.pk_columns}
          initialValues={null}
          saving={rowSaving}
          error={rowActionError}
          onCancel={() => {
            setAddingRow(false)
            setRowActionError(null)
          }}
          onSave={saveAdd}
        />
      )}

      {deletingRow && tableData && (
        <ConfirmDialog
          title="Delete row?"
          body={`This permanently deletes ${tableData.pk_columns[0]} = ${formatCell(deletingRow[tableData.pk_columns[0]])} from ${selected}. This can't be undone.`}
          confirmLabel="Delete"
          danger
          busy={rowSaving}
          error={rowActionError}
          onCancel={() => {
            setDeletingRow(null)
            setRowActionError(null)
          }}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}

// ---- SQL console ----

function SqlConsole({
  nlPrompt,
  setNlPrompt,
  sql,
  setSql,
  sqlNote,
  generating,
  running,
  sqlResult,
  sqlError,
  confirmingDestructive,
  onCancelConfirm,
  onGenerate,
  onRun,
}: {
  nlPrompt: string
  setNlPrompt: (v: string) => void
  sql: string
  setSql: (v: string) => void
  sqlNote: string
  generating: boolean
  running: boolean
  sqlResult: SqlExecuteResult | null
  sqlError: string | null
  confirmingDestructive: boolean
  onCancelConfirm: () => void
  onGenerate: () => void
  onRun: () => void
}) {
  return (
    <div className="rounded-2xl border border-border-hair bg-surface p-4">
      <div className="flex items-center gap-2">
        <Sparkle size={14} className="text-accent" />
        <h2 className="font-display text-sm font-semibold">SQL Console</h2>
      </div>
      <p className="mt-1 text-xs text-ink-muted">Describe what you want in plain English, review the generated SQL, then run it.</p>

      <div className="mt-3 flex gap-2">
        <input
          value={nlPrompt}
          onChange={(e) => setNlPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onGenerate()}
          placeholder='e.g. "show the 10 largest checking accounts" or "cancel appointment APT-7DAC1F"'
          className="flex-1 rounded-full border border-border-hair bg-paper px-4 py-2.5 text-sm outline-none placeholder:text-ink-muted"
        />
        <Button size="sm" variant="secondary" icon={generating ? <CircleNotch size={13} className="animate-spin" /> : <Sparkle size={13} />} onClick={onGenerate} disabled={generating || !nlPrompt.trim()}>
          {generating ? 'Generating…' : 'Generate SQL'}
        </Button>
      </div>

      <textarea
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        placeholder="-- generated or hand-written SQL appears here"
        rows={3}
        spellCheck={false}
        className="mt-3 w-full rounded-xl border border-border-hair bg-paper px-3.5 py-2.5 font-mono text-xs outline-none placeholder:text-ink-muted"
      />
      {sqlNote && <p className="mt-1.5 text-xs text-ink-muted">{sqlNote}</p>}

      {confirmingDestructive && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-negative/30 bg-negative/8 px-3.5 py-2.5 text-xs">
          <span className="flex items-center gap-1.5 text-negative">
            <WarningCircle size={14} /> This statement changes or removes data. Run it?
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onCancelConfirm}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" className="bg-negative text-white hover:brightness-105" onClick={onRun}>
              Yes, run it
            </Button>
          </div>
        </div>
      )}

      {!confirmingDestructive && (
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" icon={running ? <CircleNotch size={13} className="animate-spin" /> : <Play size={13} />} onClick={onRun} disabled={running || !sql.trim()}>
            {running ? 'Running…' : 'Run SQL'}
          </Button>
          {sqlResult && <span className="text-xs text-ink-muted">{sqlResult.is_select ? `${sqlResult.row_count} row(s) returned` : `${sqlResult.row_count} row(s) affected`}</span>}
        </div>
      )}

      {sqlError && <p className="mt-2 text-xs text-negative">{sqlError}</p>}

      {sqlResult && sqlResult.is_select && sqlResult.rows.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-border-hair">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border-hair bg-surface-2/60">
                {sqlResult.columns.map((c) => (
                  <th key={c} className="whitespace-nowrap px-3 py-2 font-mono font-semibold text-ink-muted">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sqlResult.rows.map((row, i) => (
                <tr key={i} className="border-b border-border-hair/60">
                  {row.map((cell, j) => (
                    <td key={j} className="max-w-[280px] truncate whitespace-nowrap px-3 py-2 font-mono text-ink">
                      {truncate(formatCell(cell), 80)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---- dialogs ----

function DialogShell({ title, onCancel, children }: { title: string; onCancel: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border-hair bg-surface p-5 shadow-lift">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-sm font-semibold">{title}</h3>
          <button onClick={onCancel} className="rounded p-1 text-ink-muted hover:bg-surface-2 hover:text-ink">
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function fieldInputType(type: string): 'checkbox' | 'number' | 'textarea' | 'text' | 'readonly' {
  if (DATE_TYPE.test(type)) return 'readonly'
  if (BOOL_TYPE.test(type)) return 'checkbox'
  if (INT_TYPE.test(type) || NUM_TYPE.test(type)) return 'number'
  if (JSON_TYPE.test(type) || TEXT_TYPE.test(type)) return 'textarea'
  return 'text'
}

function RowFormDialog({
  title,
  columns,
  pkColumns,
  initialValues,
  saving,
  error,
  onCancel,
  onSave,
}: {
  title: string
  columns: ColumnInfo[]
  pkColumns: string[]
  initialValues: RowValues | null
  saving: boolean
  error: string | null
  onCancel: () => void
  onSave: (values: RowValues) => void
}) {
  const isAdd = initialValues === null
  const editableColumns = columns.filter((c) => !(isAdd && c.primary_key && INT_TYPE.test(c.type)))

  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {}
    for (const c of editableColumns) {
      const v = initialValues ? initialValues[c.name] : undefined
      d[c.name] = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)
    }
    return d
  })
  const [formError, setFormError] = useState<string | null>(null)

  function submit() {
    const values: RowValues = {}
    for (const c of editableColumns) {
      const kind = fieldInputType(c.type)
      if (kind === 'readonly') continue
      const raw = draft[c.name]
      if (raw === '' && c.nullable) {
        values[c.name] = null
        continue
      }
      if (kind === 'checkbox') {
        values[c.name] = raw === 'true'
      } else if (kind === 'number') {
        if (raw === '') continue
        const n = Number(raw)
        if (Number.isNaN(n)) {
          setFormError(`${c.name}: not a valid number`)
          return
        }
        values[c.name] = n
      } else if (JSON_TYPE.test(c.type)) {
        if (raw.trim() === '') continue
        try {
          values[c.name] = JSON.parse(raw)
        } catch {
          setFormError(`${c.name}: not valid JSON`)
          return
        }
      } else {
        values[c.name] = raw
      }
    }
    setFormError(null)
    onSave(values)
  }

  return (
    <DialogShell title={title} onCancel={onCancel}>
      <div className="mt-4 space-y-3">
        {editableColumns.map((c) => {
          const kind = fieldInputType(c.type)
          const disabled = c.primary_key && !isAdd
          return (
            <div key={c.name}>
              <label className="mb-1 flex items-center gap-1.5 font-mono text-[11px] text-ink-muted">
                {c.name}
                {c.primary_key && <span className="text-accent">PK</span>}
                {!c.nullable && !c.primary_key && <span className="text-negative">*</span>}
              </label>
              {kind === 'readonly' ? (
                <input value={draft[c.name]} disabled className="w-full rounded-lg border border-border-hair bg-surface-2/50 px-3 py-2 text-xs text-ink-muted" />
              ) : kind === 'checkbox' ? (
                <select
                  value={draft[c.name] || 'false'}
                  onChange={(e) => setDraft((d) => ({ ...d, [c.name]: e.target.value }))}
                  className="w-full rounded-lg border border-border-hair bg-paper px-3 py-2 text-xs outline-none"
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : kind === 'textarea' ? (
                <textarea
                  value={draft[c.name]}
                  disabled={disabled}
                  onChange={(e) => setDraft((d) => ({ ...d, [c.name]: e.target.value }))}
                  rows={3}
                  spellCheck={false}
                  className="w-full rounded-lg border border-border-hair bg-paper px-3 py-2 font-mono text-xs outline-none disabled:bg-surface-2/50 disabled:text-ink-muted"
                />
              ) : (
                <input
                  value={draft[c.name]}
                  disabled={disabled}
                  type={kind === 'number' ? 'number' : 'text'}
                  onChange={(e) => setDraft((d) => ({ ...d, [c.name]: e.target.value }))}
                  className="w-full rounded-lg border border-border-hair bg-paper px-3 py-2 text-xs outline-none disabled:bg-surface-2/50 disabled:text-ink-muted"
                />
              )}
            </div>
          )
        })}
        {pkColumns.some((pk) => DATE_TYPE.test(columns.find((c) => c.name === pk)?.type ?? '')) === false &&
          columns.some((c) => DATE_TYPE.test(c.type)) && <p className="text-[11px] text-ink-muted">Timestamp columns are read-only here — use the SQL console to change them.</p>}
      </div>

      {(formError || error) && <p className="mt-3 text-xs text-negative">{formError || error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : isAdd ? 'Add row' : 'Save changes'}
        </Button>
      </div>
    </DialogShell>
  )
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  busy: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <DialogShell title={title} onCancel={onCancel}>
      <p className="mt-3 text-sm text-ink-muted">{body}</p>
      {error && <p className="mt-2 text-xs text-negative">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={onConfirm} disabled={busy} className={danger ? 'bg-negative text-white hover:brightness-105' : undefined}>
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </DialogShell>
  )
}
