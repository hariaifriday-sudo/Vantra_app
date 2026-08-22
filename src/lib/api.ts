// Resolved at runtime from public/config.js (window.__VANTRA_CONFIG__) when present,
// so a single built `dist/` folder can be pointed at any backend without rebuilding —
// falls back to the build-time Vite env var, then a same-machine default.
const runtimeConfig = (window as unknown as { __VANTRA_CONFIG__?: { API_BASE?: string } }).__VANTRA_CONFIG__
const API_BASE = runtimeConfig?.API_BASE || import.meta.env.VITE_API_BASE || 'http://localhost:8000'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function getToken() {
  return localStorage.getItem('vantra_token')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail ?? detail
    } catch {
      // response wasn't JSON — keep statusText
    }
    throw new ApiError(res.status, typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  postForm: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
  token: {
    get: getToken,
    set: (token: string) => localStorage.setItem('vantra_token', token),
    clear: () => localStorage.removeItem('vantra_token'),
  },
  base: API_BASE,
}

// ---- Types mirroring server/app/schemas.py ----

export interface Account {
  id: number
  type: string
  name: string
  number_masked: string
  balance: number
  currency: string
}

export interface TransactionOut {
  id: number
  merchant: string
  category: string
  amount: number
  status: string
  occurred_at: string
}

export interface SavingsGoal {
  id: number
  name: string
  icon: string
  target: number
  saved: number
  due_by: string
}

export interface DashboardSummary {
  accounts: Account[]
  transactions: TransactionOut[]
  goals: SavingsGoal[]
  total_balance: number
  income_month: number
  expenses_month: number
}

export interface InsightOut {
  title: string
  body: string
  generated_at: string
}

export interface RecurringItem {
  merchant: string
  category: string
  avg_amount: number
  interval_days: number
  next_expected: string
}

export interface ForecastOut {
  current_balance: number
  projected_30d_balance: number
  recurring: RecurringItem[]
  warning: boolean
  warning_message: string | null
}

export interface NotificationOut {
  id: number
  type: string
  title: string
  body: string
  severity: string
  action_label: string | null
  read: boolean
  created_at: string
}

export interface KycOut {
  id: number
  case_ref: string
  status: string
  fields: Record<string, string>
  confidences: Record<string, number>
  ai_recommendation: string | null
  ai_notes: string | null
  submitted_at: string | null
  reviewer_notes: string | null
  created_at: string
}

export interface DocumentExtractField {
  label: string
  value: string
  confidence: number
}

export interface FraudAlertOut {
  id: number
  account_masked: string
  amount: number
  merchant: string
  rule: string
  risk: string
  status: string
  ai_explanation: string | null
  agent_notes: string | null
  created_at: string
}

export interface FraudScanResult {
  created: FraudAlertOut[]
  scanned_transactions: number
}

export interface AmlAlertOut {
  id: number
  entity_name: string
  alert_type: string
  volume: number
  status: string
  narrative: string | null
  evidence: { transaction_ids?: number[]; merchants?: string[]; amounts?: number[]; dates?: string[] }
  sar_draft: string | null
  agent_notes: string | null
  source: 'seed' | 'scan'
  case_ref: string
  created_at: string
}

export interface AmlScanResult {
  created: AmlAlertOut[]
  scanned_transactions: number
}

export interface CaseTicketOut {
  id: number
  sender_email: string
  subject: string
  body: string
  ai_summary: string | null
  department: string | null
  confidence: number | null
  status: string
  created_at: string
}

export interface UnderwritingOut {
  id: number
  applicant_name: string
  loan_type: string
  amount: number
  grade: string | null
  status: string
  ai_summary: string | null
  recommendation: string | null
  dti: number | null
  credit_score: number | null
  ltv: number | null
  counterfactual: string | null
  created_at: string
}

export interface PolicyOut {
  id: number
  category: string
  title: string
  body: string
  owner: string
  flagged: boolean
  updated_at: string
}

export interface AgentOverview {
  stats: { label: string; value: string; href: string }[]
  worklist: { type: string; customer: string; risk: string; age: string; assignee: string; href: string }[]
}

export interface AccountMatch {
  name: string
  account_ref: string
  match: number
}

export interface SimulateTransactionsResult {
  scenario: string
  pattern: string
  transactions_created: number
  alerts_created: { type?: string; rule?: string; risk?: string; volume?: number; amount?: number }[]
}
