from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32))  # "account_holder" | "agent"
    employee_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    department: Mapped[str | None] = mapped_column(String(64), nullable=True)
    avatar_seed: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(default=now_utc)

    accounts: Mapped[list["Account"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    goals: Mapped[list["SavingsGoal"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    notifications: Mapped[list["Notification"]] = relationship(back_populates="owner", cascade="all, delete-orphan")


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    type: Mapped[str] = mapped_column(String(32))  # checking | savings | credit | loan
    name: Mapped[str] = mapped_column(String(255))
    number_masked: Mapped[str] = mapped_column(String(32))
    balance: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(8), default="USD")

    owner: Mapped["User"] = relationship(back_populates="accounts")
    transactions: Mapped[list["TransactionRecord"]] = relationship(back_populates="account", cascade="all, delete-orphan")


class TransactionRecord(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    merchant: Mapped[str] = mapped_column(String(255))
    category: Mapped[str] = mapped_column(String(64))
    amount: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(32), default="Completed")
    occurred_at: Mapped[datetime] = mapped_column(default=now_utc)

    account: Mapped["Account"] = relationship(back_populates="transactions")


class SavingsGoal(Base):
    __tablename__ = "savings_goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(255))
    icon: Mapped[str] = mapped_column(String(16), default="target")
    target: Mapped[float] = mapped_column(Float)
    saved: Mapped[float] = mapped_column(Float, default=0.0)
    due_by: Mapped[str] = mapped_column(String(64), default="Ongoing")

    owner: Mapped["User"] = relationship(back_populates="goals")


class Beneficiary(Base):
    __tablename__ = "beneficiaries"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(255))
    account_ref: Mapped[str] = mapped_column(String(64))
    bank_name: Mapped[str] = mapped_column(String(255), default="Vantra Bank")
    color: Mapped[str] = mapped_column(String(16), default="#e8b23d")
    created_at: Mapped[datetime] = mapped_column(default=now_utc)


class PendingTransfer(Base):
    __tablename__ = "pending_transfers"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    from_account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    beneficiary_id: Mapped[int | None] = mapped_column(ForeignKey("beneficiaries.id"), nullable=True)
    to_label: Mapped[str] = mapped_column(String(255))
    amount: Mapped[float] = mapped_column(Float)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="awaiting_approval")  # awaiting_approval|approved|rejected
    created_at: Mapped[datetime] = mapped_column(default=now_utc)
    decided_at: Mapped[datetime | None] = mapped_column(nullable=True)


class ScheduledPayment(Base):
    __tablename__ = "scheduled_payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    from_account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    beneficiary_id: Mapped[int | None] = mapped_column(ForeignKey("beneficiaries.id"), nullable=True)
    to_label: Mapped[str] = mapped_column(String(255))
    amount: Mapped[float] = mapped_column(Float)
    frequency: Mapped[str] = mapped_column(String(16), default="monthly")  # weekly|monthly
    next_run_date: Mapped[datetime] = mapped_column()
    status: Mapped[str] = mapped_column(String(16), default="active")  # active|paused|cancelled
    created_at: Mapped[datetime] = mapped_column(default=now_utc)
    last_run_at: Mapped[datetime | None] = mapped_column(nullable=True)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    type: Mapped[str] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(16), default="neutral")  # neutral | watch
    action_label: Mapped[str | None] = mapped_column(String(64), nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(default=now_utc)

    owner: Mapped["User"] = relationship(back_populates="notifications")


class KycApplication(Base):
    __tablename__ = "kyc_applications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    case_ref: Mapped[str] = mapped_column(String(32), unique=True)
    status: Mapped[str] = mapped_column(String(32), default="draft")  # draft|pending|needs_info|approved|rejected
    fields: Mapped[dict] = mapped_column(JSON, default=dict)
    confidences: Mapped[dict] = mapped_column(JSON, default=dict)
    signed: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_recommendation: Mapped[str | None] = mapped_column(String(32), nullable=True)
    ai_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    reviewer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=now_utc)

    documents: Mapped[list["KycDocument"]] = relationship(back_populates="application", cascade="all, delete-orphan")


class KycDocument(Base):
    __tablename__ = "kyc_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    kyc_application_id: Mapped[int] = mapped_column(ForeignKey("kyc_applications.id"))
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(128))
    path: Mapped[str] = mapped_column(String(512))
    uploaded_at: Mapped[datetime] = mapped_column(default=now_utc)

    application: Mapped["KycApplication"] = relationship(back_populates="documents")


class FraudAlert(Base):
    __tablename__ = "fraud_alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_masked: Mapped[str] = mapped_column(String(32))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    amount: Mapped[float] = mapped_column(Float)
    merchant: Mapped[str] = mapped_column(String(255))
    rule: Mapped[str] = mapped_column(String(255))
    rule_type: Mapped[str | None] = mapped_column(String(32), nullable=True)  # geo_mismatch | velocity | ... — drives risk scoring
    risk: Mapped[str] = mapped_column(String(16))  # Critical|High|Medium|Low
    risk_score: Mapped[int] = mapped_column(Integer, default=0)
    linked_case_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default="Open")
    ai_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=now_utc)
    resolved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(nullable=True)
    agent_notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class AmlAlert(Base):
    __tablename__ = "aml_alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    entity_name: Mapped[str] = mapped_column(String(255))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    alert_type: Mapped[str] = mapped_column(String(64))
    rule_type: Mapped[str | None] = mapped_column(String(32), nullable=True)  # structuring | velocity | round_number | ... — drives risk scoring
    volume: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(32), default="Open")
    narrative: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)
    sar_draft: Mapped[str | None] = mapped_column(Text, nullable=True)
    agent_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(16), default="seed")  # seed | scan
    case_ref: Mapped[str] = mapped_column(String(32), unique=True)
    risk_score: Mapped[int] = mapped_column(Integer, default=0)
    linked_case_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(default=now_utc)


class CaseTicket(Base):
    __tablename__ = "case_tickets"

    id: Mapped[int] = mapped_column(primary_key=True)
    sender_email: Mapped[str] = mapped_column(String(255))
    subject: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    department: Mapped[str | None] = mapped_column(String(64), nullable=True)
    confidence: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="Needs Review")
    created_at: Mapped[datetime] = mapped_column(default=now_utc)


class UnderwritingApplication(Base):
    __tablename__ = "underwriting_applications"

    id: Mapped[int] = mapped_column(primary_key=True)
    applicant_name: Mapped[str] = mapped_column(String(255))
    loan_type: Mapped[str] = mapped_column(String(64))
    amount: Mapped[float] = mapped_column(Float)
    grade: Mapped[str | None] = mapped_column(String(4), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="Pending")
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommendation: Mapped[str | None] = mapped_column(String(64), nullable=True)
    dti: Mapped[float | None] = mapped_column(Float, nullable=True)
    credit_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ltv: Mapped[float | None] = mapped_column(Float, nullable=True)
    counterfactual: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=now_utc)


class Policy(Base):
    __tablename__ = "policies"

    id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)
    owner: Mapped[str] = mapped_column(String(64))
    flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(default=now_utc)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    session_key: Mapped[str] = mapped_column(String(64), index=True)
    context: Mapped[str] = mapped_column(String(32))  # faq | account | agent_copilot
    role: Mapped[str] = mapped_column(String(16))  # user | assistant
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=now_utc)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    actor_label: Mapped[str] = mapped_column(String(255))
    action: Mapped[str] = mapped_column(String(255))
    target_type: Mapped[str] = mapped_column(String(64))
    target_id: Mapped[str] = mapped_column(String(64))
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=now_utc)


class DetectionRule(Base):
    """A configurable AML or fraud detection rule. Seeded from the thresholds
    that used to be hardcoded module constants in routers/aml.py and
    routers/fraud.py — the scan functions now read active rules from here
    instead, so agents can tune/add/remove rules from the Configuration UI
    without a code change."""
    __tablename__ = "detection_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    domain: Mapped[str] = mapped_column(String(16))  # aml | fraud
    rule_type: Mapped[str] = mapped_column(String(32))  # structuring | velocity | geo_mismatch | amount_outlier
    label: Mapped[str] = mapped_column(String(255))
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(default=now_utc)


class BranchAppointment(Base):
    """A branch visit booked from the public FAQ assistant. No login is
    required to book, so user_id is nullable — the visitor is identified by
    the contact details they enter directly into the booking card."""
    __tablename__ = "branch_appointments"

    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    branch_name: Mapped[str] = mapped_column(String(255))
    preferred_date: Mapped[str] = mapped_column(String(32))
    preferred_time: Mapped[str] = mapped_column(String(32))
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="Requested")
    created_at: Mapped[datetime] = mapped_column(default=now_utc)
    created_at: Mapped[datetime] = mapped_column(default=now_utc)
