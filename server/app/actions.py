"""Shared banking-action logic used by both the REST endpoints and the chat
assistant's tool-calling layer, so "click a button" and "ask the chatbot"
behave identically and stay in sync."""
from __future__ import annotations

import io
import random
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.orm import Session

from . import models

SAVINGS_APY = 0.0435  # matches the "Horizon Savings" offer used elsewhere in the app


class ActionError(Exception):
    """A user-facing error (insufficient funds, not found, bad input) — safe to show verbatim in chat."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _best_match(query: str, candidates: list[tuple[str, object]]) -> object | None:
    """Fuzzy-matches `query` against (label, item) pairs; returns the best item above a low bar."""
    if not query or not candidates:
        return None
    query = query.lower().strip()
    best_item, best_score = None, 0.0
    for label, item in candidates:
        label_l = label.lower()
        score = 1.0 if query == label_l else (0.85 if query in label_l or label_l in query else SequenceMatcher(None, query, label_l).ratio())
        if score > best_score:
            best_item, best_score = item, score
    return best_item if best_score >= 0.35 else None


# ---- Lookups ----

def resolve_account(db: Session, user: models.User, name_query: str | None) -> models.Account:
    accounts = db.query(models.Account).filter(models.Account.user_id == user.id).all()
    if not accounts:
        raise ActionError("You don't have any accounts yet.")
    if not name_query:
        # default to the first non-credit account (checking-like)
        return next((a for a in accounts if a.type != "credit"), accounts[0])
    match = _best_match(name_query, [(a.name, a) for a in accounts] + [(a.type, a) for a in accounts])
    if not match:
        raise ActionError(f"I couldn't find an account matching \"{name_query}\".")
    return match


def find_beneficiary(db: Session, user: models.User, name_query: str) -> models.Beneficiary | None:
    beneficiaries = db.query(models.Beneficiary).filter(models.Beneficiary.user_id == user.id).all()
    return _best_match(name_query, [(b.name, b) for b in beneficiaries])


def list_beneficiaries(db: Session, user: models.User) -> list[models.Beneficiary]:
    return db.query(models.Beneficiary).filter(models.Beneficiary.user_id == user.id).order_by(models.Beneficiary.name).all()


# ---- Savings ----

def calculate_savings_plan(target_amount: float, months: int, already_saved: float = 0.0) -> dict:
    if target_amount <= 0 or months <= 0:
        raise ActionError("Target amount and timeframe must both be greater than zero.")
    remaining = max(0.0, target_amount - already_saved)
    monthly = round(remaining / months, 2)
    return {
        "target_amount": target_amount,
        "already_saved": already_saved,
        "remaining": round(remaining, 2),
        "months": months,
        "monthly_contribution": monthly,
        "target_date": _add_months(_now(), months).strftime("%b %Y"),
    }


def _add_months(date: datetime, months: int) -> datetime:
    month_index = date.month - 1 + months
    year = date.year + month_index // 12
    month = month_index % 12 + 1
    return date.replace(year=year, month=month, day=1)


def create_savings_goal(db: Session, user: models.User, name: str, target: float, saved: float = 0.0, due_by: str = "Ongoing", icon: str = "target", months: int | None = None) -> models.SavingsGoal:
    if target <= 0:
        raise ActionError("Savings target must be greater than zero.")
    name = name.strip() or "New Goal"

    existing = db.query(models.SavingsGoal).filter(models.SavingsGoal.user_id == user.id, models.SavingsGoal.name == name).first()
    if existing:
        raise ActionError(f'You already have a "{name}" goal (${existing.saved:,.0f} of ${existing.target:,.0f}). Use update_savings_goal to change it instead of creating a duplicate.')

    if months is not None and months > 0:
        # Computed from the real current date rather than trusting the model to
        # know "today" — it doesn't reliably, and will otherwise invent a past date.
        due_by = _add_months(_now(), months).strftime("%b %Y")
    goal = models.SavingsGoal(user_id=user.id, name=name, target=target, saved=max(0.0, saved), due_by=due_by or "Ongoing", icon=icon)
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


def get_savings_goal(db: Session, user: models.User, goal_id: int) -> models.SavingsGoal:
    goal = db.get(models.SavingsGoal, goal_id)
    if not goal or goal.user_id != user.id:
        raise ActionError("That savings goal could not be found.")
    return goal


def update_savings_goal(db: Session, user: models.User, goal_id: int, name: str | None = None, target: float | None = None, saved: float | None = None, due_by: str | None = None, months: int | None = None) -> models.SavingsGoal:
    goal = get_savings_goal(db, user, goal_id)
    if name:
        goal.name = name.strip()
    if target is not None:
        if target <= 0:
            raise ActionError("Savings target must be greater than zero.")
        goal.target = target
    if saved is not None:
        goal.saved = max(0.0, saved)
    if months is not None and months > 0:
        goal.due_by = _add_months(_now(), months).strftime("%b %Y")
    elif due_by:
        goal.due_by = due_by
    db.commit()
    db.refresh(goal)
    return goal


def delete_savings_goal(db: Session, user: models.User, goal_id: int) -> None:
    goal = get_savings_goal(db, user, goal_id)
    db.delete(goal)
    db.commit()


# ---- Transfers (chat-initiated transfers always land as "awaiting approval") ----

def propose_transfer(db: Session, user: models.User, beneficiary_name: str, amount: float, from_account_name: str | None = None, note: str | None = None) -> models.PendingTransfer:
    if amount <= 0:
        raise ActionError("Transfer amount must be greater than zero.")
    account = resolve_account(db, user, from_account_name)
    beneficiary = find_beneficiary(db, user, beneficiary_name)
    to_label = beneficiary.name if beneficiary else beneficiary_name
    if account.balance < amount:
        raise ActionError(f"Insufficient funds in {account.name} (balance ${account.balance:,.2f}) for a ${amount:,.2f} transfer.")

    pending = models.PendingTransfer(
        user_id=user.id,
        from_account_id=account.id,
        beneficiary_id=beneficiary.id if beneficiary else None,
        to_label=to_label,
        amount=amount,
        note=note,
        status="awaiting_approval",
    )
    db.add(pending)
    db.commit()
    db.refresh(pending)
    return pending


def get_pending_transfer(db: Session, user: models.User, pending_id: int) -> models.PendingTransfer:
    pending = db.get(models.PendingTransfer, pending_id)
    if not pending or pending.user_id != user.id:
        raise ActionError("That transfer request could not be found.")
    return pending


def approve_pending_transfer(db: Session, user: models.User, pending_id: int) -> models.PendingTransfer:
    pending = get_pending_transfer(db, user, pending_id)
    if pending.status != "awaiting_approval":
        raise ActionError(f"This transfer is already {pending.status.replace('_', ' ')}.")

    account = db.get(models.Account, pending.from_account_id)
    if account.balance < pending.amount:
        raise ActionError(f"Insufficient funds in {account.name} to complete this transfer now.")

    account.balance -= pending.amount
    db.add(models.TransactionRecord(
        account_id=account.id,
        merchant=f"Transfer to {pending.to_label}",
        category="Transfer",
        amount=-pending.amount,
        status="Completed",
    ))
    pending.status = "approved"
    pending.decided_at = _now()
    db.add(models.AuditLog(
        actor_id=user.id, actor_label=user.full_name, action="transfer_approved",
        target_type="pending_transfer", target_id=str(pending.id),
        details=f"${pending.amount:.2f} to {pending.to_label}",
    ))
    db.commit()
    db.refresh(pending)
    return pending


def reject_pending_transfer(db: Session, user: models.User, pending_id: int) -> models.PendingTransfer:
    pending = get_pending_transfer(db, user, pending_id)
    if pending.status != "awaiting_approval":
        raise ActionError(f"This transfer is already {pending.status.replace('_', ' ')}.")
    pending.status = "rejected"
    pending.decided_at = _now()
    db.commit()
    db.refresh(pending)
    return pending


def list_pending_transfers(db: Session, user: models.User) -> list[models.PendingTransfer]:
    return (
        db.query(models.PendingTransfer)
        .filter(models.PendingTransfer.user_id == user.id, models.PendingTransfer.status == "awaiting_approval")
        .order_by(models.PendingTransfer.created_at.desc())
        .all()
    )


# ---- Scheduled / auto payments ----

def _advance(date: datetime, frequency: str) -> datetime:
    return date + (timedelta(days=7) if frequency == "weekly" else timedelta(days=30))


def schedule_auto_payment(db: Session, user: models.User, beneficiary_name: str, amount: float, frequency: str = "monthly", from_account_name: str | None = None, start_date: datetime | None = None) -> models.ScheduledPayment:
    if amount <= 0:
        raise ActionError("Payment amount must be greater than zero.")
    if frequency not in ("weekly", "monthly"):
        frequency = "monthly"
    account = resolve_account(db, user, from_account_name)
    beneficiary = find_beneficiary(db, user, beneficiary_name)
    to_label = beneficiary.name if beneficiary else beneficiary_name

    payment = models.ScheduledPayment(
        user_id=user.id,
        from_account_id=account.id,
        beneficiary_id=beneficiary.id if beneficiary else None,
        to_label=to_label,
        amount=amount,
        frequency=frequency,
        next_run_date=_aware(start_date) if start_date else _now(),
        status="active",
    )
    db.add(payment)
    db.add(models.AuditLog(
        actor_id=user.id, actor_label=user.full_name, action="auto_payment_scheduled",
        target_type="scheduled_payment", target_id="pending", details=f"${amount:.2f} {frequency} to {to_label}",
    ))
    db.commit()
    db.refresh(payment)
    return payment


def list_auto_payments(db: Session, user: models.User) -> list[models.ScheduledPayment]:
    return (
        db.query(models.ScheduledPayment)
        .filter(models.ScheduledPayment.user_id == user.id, models.ScheduledPayment.status == "active")
        .order_by(models.ScheduledPayment.next_run_date)
        .all()
    )


def cancel_auto_payment(db: Session, user: models.User, payment_id: int) -> models.ScheduledPayment:
    payment = db.get(models.ScheduledPayment, payment_id)
    if not payment or payment.user_id != user.id:
        raise ActionError("That scheduled payment could not be found.")
    payment.status = "cancelled"
    db.commit()
    db.refresh(payment)
    return payment


def process_due_scheduled_payments(db: Session, user: models.User) -> list[models.ScheduledPayment]:
    """Executes any active scheduled payments whose next_run_date has passed.
    Called lazily (e.g. on dashboard/auto-payments load) since there's no cron daemon."""
    due = (
        db.query(models.ScheduledPayment)
        .filter(models.ScheduledPayment.user_id == user.id, models.ScheduledPayment.status == "active", models.ScheduledPayment.next_run_date <= _now())
        .all()
    )
    executed = []
    for payment in due:
        account = db.get(models.Account, payment.from_account_id)
        if not account or account.balance < payment.amount:
            payment.next_run_date = _advance(_aware(payment.next_run_date), payment.frequency)
            continue
        account.balance -= payment.amount
        db.add(models.TransactionRecord(
            account_id=account.id,
            merchant=f"Auto-pay: {payment.to_label}",
            category="Bills",
            amount=-payment.amount,
            status="Completed",
        ))
        payment.last_run_at = _now()
        payment.next_run_date = _advance(_aware(payment.next_run_date), payment.frequency)
        executed.append(payment)
    if due:
        db.commit()
    return executed


# ---- Statements & certificates (PDF) ----

def _pdf_styles():
    styles = getSampleStyleSheet()
    title = ParagraphStyle("VantraTitle", parent=styles["Heading1"], fontSize=18, textColor=colors.HexColor("#1a1a1a"), spaceAfter=4)
    subtitle = ParagraphStyle("VantraSubtitle", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor("#6b6b6b"), spaceAfter=18)
    section = ParagraphStyle("VantraSection", parent=styles["Heading2"], fontSize=12, spaceBefore=14, spaceAfter=8)
    body = styles["Normal"]
    return title, subtitle, section, body


def _resolve_period(period: str) -> tuple[datetime, datetime, str]:
    """Maps a loose period string to (start, end, label). Accepts things like
    'last_30_days', 'last_3_months', 'last_6_months', 'ytd', or a 4-digit year."""
    now = _now()
    p = (period or "last_30_days").strip().lower().replace(" ", "_")
    if p.isdigit() and len(p) == 4:
        year = int(p)
        start = datetime(year, 1, 1, tzinfo=timezone.utc)
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        return start, min(end, now), f"Jan 1 – Dec 31, {year}"
    if p in ("ytd", "year_to_date"):
        start = datetime(now.year, 1, 1, tzinfo=timezone.utc)
        return start, now, f"Jan 1, {now.year} – {now.strftime('%b %d, %Y')}"
    if "3" in p and "month" in p:
        start = now - timedelta(days=90)
    elif "6" in p and "month" in p:
        start = now - timedelta(days=180)
    elif "year" in p:
        start = now - timedelta(days=365)
    else:
        start = now - timedelta(days=30)
    return start, now, f"{start.strftime('%b %d, %Y')} – {now.strftime('%b %d, %Y')}"


def generate_statement_pdf(db: Session, user: models.User, account_name: str | None, period: str) -> tuple[bytes, str]:
    account = resolve_account(db, user, account_name)
    start, end, label = _resolve_period(period)
    txns = (
        db.query(models.TransactionRecord)
        .filter(models.TransactionRecord.account_id == account.id)
        .filter(models.TransactionRecord.occurred_at >= start, models.TransactionRecord.occurred_at <= end)
        .order_by(models.TransactionRecord.occurred_at.desc())
        .all()
    )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=LETTER, topMargin=0.75 * inch, bottomMargin=0.75 * inch)
    title, subtitle, section, body = _pdf_styles()
    elements = [
        Paragraph("Vantra Bank", title),
        Paragraph(f"Account Statement — {account.name} ({account.number_masked})", subtitle),
        Paragraph(f"Statement period: {label}", body),
        Paragraph(f"Account holder: {user.full_name}", body),
        Paragraph(f"Closing balance: ${account.balance:,.2f}", body),
        Spacer(1, 16),
        Paragraph("Transactions", section),
    ]

    data = [["Date", "Merchant", "Category", "Amount", "Status"]]
    for t in txns:
        data.append([
            t.occurred_at.strftime("%b %d, %Y"), t.merchant, t.category,
            f"{'+' if t.amount >= 0 else ''}${t.amount:,.2f}", t.status,
        ])
    if len(data) == 1:
        data.append(["—", "No transactions in this period", "—", "—", "—"])

    table = Table(data, colWidths=[0.9 * inch, 2.3 * inch, 1.1 * inch, 1.1 * inch, 1.0 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f0b959")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e0e0e0")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#faf9f7")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 24))
    elements.append(Paragraph("This is a system-generated statement for demonstration purposes.", subtitle))
    doc.build(elements)

    filename = f"vantra-statement-{account.name.replace(' ', '-').lower()}-{_now().strftime('%Y%m%d')}.pdf"
    return buf.getvalue(), filename


def generate_interest_certificate_pdf(db: Session, user: models.User, year: int | None = None) -> tuple[bytes, str]:
    year = year or _now().year
    accounts = db.query(models.Account).filter(models.Account.user_id == user.id, models.Account.type == "savings").all()
    if not accounts:
        raise ActionError("You don't have a savings account to generate an interest certificate for.")

    now = _now()
    year_start = datetime(year, 1, 1, tzinfo=timezone.utc)
    year_end = min(datetime(year + 1, 1, 1, tzinfo=timezone.utc), now)
    days_in_period = max(1, (year_end - year_start).days)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=LETTER, topMargin=0.75 * inch, bottomMargin=0.75 * inch)
    title, subtitle, section, body = _pdf_styles()
    elements = [
        Paragraph("Vantra Bank", title),
        Paragraph(f"Interest Certificate — Financial Year {year}", subtitle),
        Paragraph(f"Account holder: {user.full_name}", body),
        Paragraph(f"Issued: {now.strftime('%b %d, %Y')}", body),
        Spacer(1, 16),
        Paragraph("Interest Summary", section),
    ]

    data = [["Account", "Closing Balance", "Rate (APY)", "Estimated Interest Earned"]]
    total_interest = 0.0
    for a in accounts:
        interest = a.balance * SAVINGS_APY * (days_in_period / 365)
        total_interest += interest
        data.append([f"{a.name} ({a.number_masked})", f"${a.balance:,.2f}", f"{SAVINGS_APY * 100:.2f}%", f"${interest:,.2f}"])

    table = Table(data, colWidths=[2.3 * inch, 1.5 * inch, 1.2 * inch, 1.7 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f0b959")),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e0e0e0")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 16))
    elements.append(Paragraph(f"Total estimated interest earned in {year}: ${total_interest:,.2f}", section))
    elements.append(Paragraph(
        "Interest is estimated from the current closing balance and the account's published APY, "
        "prorated for the elapsed portion of the year. This certificate is system-generated for demonstration purposes.",
        subtitle,
    ))
    doc.build(elements)

    filename = f"vantra-interest-certificate-{year}.pdf"
    return buf.getvalue(), filename


def generate_tax_certificate_pdf(db: Session, user: models.User, year: int | None = None) -> tuple[bytes, str]:
    year = year or _now().year
    accounts = db.query(models.Account).filter(models.Account.user_id == user.id, models.Account.type == "savings").all()
    now = _now()
    year_start = datetime(year, 1, 1, tzinfo=timezone.utc)
    year_end = min(datetime(year + 1, 1, 1, tzinfo=timezone.utc), now)
    days_in_period = max(1, (year_end - year_start).days)
    total_interest = sum(a.balance * SAVINGS_APY * (days_in_period / 365) for a in accounts)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=LETTER, topMargin=0.75 * inch, bottomMargin=0.75 * inch)
    title, subtitle, section, body = _pdf_styles()
    elements = [
        Paragraph("Vantra Bank", title),
        Paragraph(f"Tax & Interest Income Certificate — Financial Year {year}", subtitle),
        Paragraph(f"Account holder: {user.full_name}", body),
        Paragraph(f"Issued: {now.strftime('%b %d, %Y')}", body),
        Spacer(1, 16),
        Paragraph("Summary for Tax Filing", section),
    ]
    data = [
        ["Total interest income", f"${total_interest:,.2f}"],
        ["Tax deducted at source (TDS)", "$0.00"],
        ["Net interest credited", f"${total_interest:,.2f}"],
    ]
    table = Table(data, colWidths=[3.5 * inch, 2.0 * inch])
    table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e0e0e0")),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 16))
    elements.append(Paragraph(
        "This certificate summarizes interest income for tax-filing purposes. No tax was withheld at source "
        "in this demo environment. Consult a tax advisor for your actual filing obligations.",
        subtitle,
    ))
    doc.build(elements)

    filename = f"vantra-tax-certificate-{year}.pdf"
    return buf.getvalue(), filename


# ---- Demo/testing: simulate realistic transaction activity ----
# Generates transactions shaped to actually trip the real AML (app/routers/aml.py)
# and Fraud (app/routers/fraud.py) detection rules, then runs those same scans
# scoped to this one customer so alerts show up immediately for an agent.

_FOREIGN_LOCATIONS = [("Lagos", "NG"), ("Manila", "PH"), ("Bucharest", "RO"), ("Jakarta", "ID"), ("Karachi", "PK")]
_REGULAR_SPENDS = [
    ("Whole Foods Market", "Groceries", (35, 110)),
    ("Trader Joes", "Groceries", (25, 80)),
    ("Blue Bottle Coffee", "Dining", (6, 18)),
    ("City Power & Water", "Bills", (90, 180)),
    ("Amazon", "Shopping", (20, 140)),
    ("Uber", "Transport", (12, 45)),
]


def _recent(minutes_ago: float) -> datetime:
    return _now() - timedelta(minutes=minutes_ago)


async def simulate_transactions(db: Session, user: models.User, scenario: str) -> dict:
    from .routers.aml import scan_for_aml
    from .routers.fraud import scan_for_fraud

    if scenario not in ("regular", "aml", "fraud"):
        raise ActionError("Scenario must be one of: regular, aml, fraud.")

    account = resolve_account(db, user, None)
    created: list[models.TransactionRecord] = []
    sub_pattern = "normal spending"

    if scenario == "regular":
        for _ in range(random.randint(2, 4)):
            merchant, category, (lo, hi) = random.choice(_REGULAR_SPENDS)
            created.append(models.TransactionRecord(
                account_id=account.id, merchant=merchant, category=category,
                amount=-round(random.uniform(lo, hi), 2), status="Completed",
                occurred_at=_recent(random.uniform(60, 4 * 24 * 60)),
            ))

    elif scenario == "aml":
        sub_pattern = random.choice(["structuring", "velocity"])
        if sub_pattern == "structuring":
            for i, minutes_ago in enumerate([2200, 1100, 200]):
                created.append(models.TransactionRecord(
                    account_id=account.id, merchant=f"Wire Out — Partner {chr(65 + i)}", category="Wire Transfer",
                    amount=-round(random.uniform(3400, 4900), 2), status="Completed", occurred_at=_recent(minutes_ago),
                ))
        else:
            for i, minutes_ago in enumerate([760, 560, 340, 90]):
                created.append(models.TransactionRecord(
                    account_id=account.id, merchant=f"External Transfer #{i + 1}", category="Transfer Out",
                    amount=-round(random.uniform(4000, 9000), 2), status="Completed", occurred_at=_recent(minutes_ago),
                ))

    else:  # fraud
        sub_pattern = random.choice(["geo_mismatch", "velocity", "amount_outlier"])
        if sub_pattern == "geo_mismatch":
            city, cc = random.choice(_FOREIGN_LOCATIONS)
            created.append(models.TransactionRecord(
                account_id=account.id, merchant=f"Unknown POS — {city}, {cc}", category="Shopping",
                amount=-round(random.uniform(800, 2200), 2), status="Completed", occurred_at=_recent(2),
            ))
        elif sub_pattern == "velocity":
            for i in range(random.choice([4, 5])):
                created.append(models.TransactionRecord(
                    account_id=account.id, merchant=f"POS Terminal #{i + 1}", category="Shopping",
                    amount=-round(random.uniform(20, 140), 2), status="Completed", occurred_at=_recent((4 - i) * 1.5),
                ))
        else:
            merchant = random.choice(["Electronics Superstore", "Luxury Boutique", "Premier Jewelers"])
            created.append(models.TransactionRecord(
                account_id=account.id, merchant=merchant, category="Shopping",
                amount=-round(random.uniform(3000, 6000), 2), status="Completed", occurred_at=_recent(2),
            ))

    db.add_all(created)
    db.commit()

    alerts_created: list[dict] = []
    if scenario == "aml":
        aml_alerts, _ = await scan_for_aml(db, holder_ids=[user.id])
        alerts_created = [{"type": a.alert_type, "volume": a.volume} for a in aml_alerts]
    elif scenario == "fraud":
        fraud_alerts, _ = await scan_for_fraud(db, holder_ids=[user.id])
        alerts_created = [{"rule": a.rule, "risk": a.risk, "amount": a.amount} for a in fraud_alerts]

    return {
        "scenario": scenario,
        "pattern": sub_pattern,
        "transactions_created": len(created),
        "alerts_created": alerts_created,
    }
