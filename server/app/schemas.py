from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, EmailStr, Field


# ---- Auth ----

class SignupRequest(BaseModel):
    full_name: str
    email: EmailStr
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    role: Literal["account_holder", "agent"]
    employee_id: Optional[str] = None
    department: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    full_name: str
    email: str


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    department: Optional[str] = None
    avatar_seed: int

    class Config:
        from_attributes = True


# ---- Accounts ----

class TransactionOut(BaseModel):
    id: int
    merchant: str
    category: str
    amount: float
    status: str
    occurred_at: datetime

    class Config:
        from_attributes = True


class AccountOut(BaseModel):
    id: int
    type: str
    name: str
    number_masked: str
    balance: float
    currency: str

    class Config:
        from_attributes = True


class SavingsGoalOut(BaseModel):
    id: int
    name: str
    icon: str
    target: float
    saved: float
    due_by: str

    class Config:
        from_attributes = True


class TransferRequest(BaseModel):
    from_account_id: int
    to_label: str
    amount: float = Field(gt=0)


class DashboardSummary(BaseModel):
    accounts: list[AccountOut]
    transactions: list[TransactionOut]
    goals: list[SavingsGoalOut]
    total_balance: float
    income_month: float
    expenses_month: float


class InsightOut(BaseModel):
    title: str
    body: str
    generated_at: datetime


class RecurringItem(BaseModel):
    merchant: str
    category: str
    avg_amount: float
    interval_days: int
    next_expected: str


class ForecastOut(BaseModel):
    current_balance: float
    projected_30d_balance: float
    recurring: list[RecurringItem]
    warning: bool
    warning_message: Optional[str] = None


# ---- Notifications ----

class NotificationOut(BaseModel):
    id: int
    type: str
    title: str
    body: str
    severity: str
    action_label: Optional[str]
    read: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ---- KYC ----

class KycFieldsPayload(BaseModel):
    fields: dict[str, Any]
    confidences: dict[str, int]


class KycSubmitRequest(BaseModel):
    fields: dict[str, Any]
    confidences: dict[str, int] = Field(default_factory=dict)
    signed: bool


class KycOut(BaseModel):
    id: int
    case_ref: str
    status: str
    fields: dict[str, Any]
    confidences: dict[str, Any]
    ai_recommendation: Optional[str]
    ai_notes: Optional[str]
    submitted_at: Optional[datetime]
    reviewer_notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class KycDecisionRequest(BaseModel):
    decision: Literal["approve", "request_info", "reject"]
    notes: Optional[str] = None


# ---- Fraud ----

class FraudAlertOut(BaseModel):
    id: int
    account_masked: str
    amount: float
    merchant: str
    rule: str
    risk: str
    status: str
    ai_explanation: Optional[str]
    agent_notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class FraudActionRequest(BaseModel):
    action: Literal["confirm_fraud", "dismiss", "escalate"]
    notes: Optional[str] = None


# ---- AML ----

class AmlAlertOut(BaseModel):
    id: int
    entity_name: str
    alert_type: str
    volume: float
    status: str
    narrative: Optional[str]
    evidence: dict[str, Any] = Field(default_factory=dict)
    sar_draft: Optional[str] = None
    agent_notes: Optional[str] = None
    source: str = "seed"
    case_ref: str
    created_at: datetime

    class Config:
        from_attributes = True


class AmlActionRequest(BaseModel):
    action: Literal["escalate", "file_sar", "clear"]
    notes: Optional[str] = None


class AmlScanResult(BaseModel):
    created: list[AmlAlertOut]
    scanned_transactions: int


# ---- Cases ----

class CaseTicketOut(BaseModel):
    id: int
    sender_email: str
    subject: str
    body: str
    ai_summary: Optional[str]
    department: Optional[str]
    confidence: Optional[int]
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class CaseReassignRequest(BaseModel):
    department: str


class CaseReplyRequest(BaseModel):
    message: str


class CaseDisputeRequest(BaseModel):
    description: str
    notification_id: Optional[int] = None


# ---- Underwriting ----

class UnderwritingOut(BaseModel):
    id: int
    applicant_name: str
    loan_type: str
    amount: float
    grade: Optional[str]
    status: str
    ai_summary: Optional[str]
    recommendation: Optional[str]
    dti: Optional[float]
    credit_score: Optional[int]
    ltv: Optional[float]
    counterfactual: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class UnderwritingDecisionRequest(BaseModel):
    decision: Literal["accept", "request_documents", "override"]
    justification: Optional[str] = None


# ---- Policies ----

class PolicyOut(BaseModel):
    id: int
    category: str
    title: str
    body: str
    owner: str
    flagged: bool
    updated_at: datetime

    class Config:
        from_attributes = True


# ---- Documents / OCR ----

class DocumentExtractField(BaseModel):
    label: str
    value: str
    confidence: int


class DocumentExtractResponse(BaseModel):
    fields: list[DocumentExtractField]
    raw_text: Optional[str] = None


class AccountMatchOut(BaseModel):
    name: str
    account_ref: str
    match: int


# ---- Chat ----

class ChatMessageIn(BaseModel):
    message: str
    session_key: str
    context: Literal["faq", "account", "agent_copilot"] = "faq"


class ChatMessageOut(BaseModel):
    role: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


# ---- Audit ----

class AuditLogOut(BaseModel):
    id: int
    actor_label: str
    action: str
    target_type: str
    target_id: str
    details: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
