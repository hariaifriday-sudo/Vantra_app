from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import require_account_holder
from ..llm import structured_completion

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@router.get("/dashboard", response_model=schemas.DashboardSummary)
def dashboard(user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    accounts = db.query(models.Account).filter(models.Account.user_id == user.id).all()
    account_ids = [a.id for a in accounts]
    transactions = (
        db.query(models.TransactionRecord)
        .filter(models.TransactionRecord.account_id.in_(account_ids))
        .order_by(models.TransactionRecord.occurred_at.desc())
        .limit(20)
        .all()
        if account_ids
        else []
    )
    goals = db.query(models.SavingsGoal).filter(models.SavingsGoal.user_id == user.id).all()

    month_ago = datetime.now(timezone.utc) - timedelta(days=30)
    recent = [t for t in transactions if t.occurred_at.replace(tzinfo=timezone.utc) >= month_ago] if transactions else []
    income_month = sum(t.amount for t in recent if t.amount > 0)
    expenses_month = -sum(t.amount for t in recent if t.amount < 0)

    return schemas.DashboardSummary(
        accounts=accounts,
        transactions=transactions,
        goals=goals,
        total_balance=sum(a.balance for a in accounts),
        income_month=income_month,
        expenses_month=expenses_month,
    )


@router.get("/trend")
def monthly_trend(user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    accounts = db.query(models.Account).filter(models.Account.user_id == user.id).all()
    account_ids = [a.id for a in accounts]
    if not account_ids:
        return []

    transactions = db.query(models.TransactionRecord).filter(models.TransactionRecord.account_id.in_(account_ids)).all()

    buckets: dict[str, dict[str, float]] = {}
    now = datetime.now(timezone.utc)
    months_order = []
    for i in range(5, -1, -1):
        # step back i months from "now" using simple month-index arithmetic
        month_index = (now.year * 12 + (now.month - 1)) - i
        year, month0 = divmod(month_index, 12)
        label = datetime(year, month0 + 1, 1).strftime("%b")
        months_order.append((year, month0 + 1, label))
        buckets[label] = {"income": 0.0, "expenses": 0.0}

    valid_keys = {(y, m) for y, m, _ in months_order}
    label_by_key = {(y, m): label for y, m, label in months_order}

    for t in transactions:
        occurred = t.occurred_at.replace(tzinfo=timezone.utc) if t.occurred_at.tzinfo is None else t.occurred_at
        key = (occurred.year, occurred.month)
        if key not in valid_keys:
            continue
        label = label_by_key[key]
        if t.amount > 0:
            buckets[label]["income"] += t.amount
        else:
            buckets[label]["expenses"] += -t.amount

    return [{"month": label, "income": round(buckets[label]["income"], 2), "expenses": round(buckets[label]["expenses"], 2)} for _, _, label in months_order]


@router.get("/expense-breakdown")
def expense_breakdown(user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    accounts = db.query(models.Account).filter(models.Account.user_id == user.id).all()
    account_ids = [a.id for a in accounts]
    if not account_ids:
        return []

    month_ago = datetime.now(timezone.utc) - timedelta(days=30)
    transactions = (
        db.query(models.TransactionRecord)
        .filter(models.TransactionRecord.account_id.in_(account_ids))
        .filter(models.TransactionRecord.amount < 0)
        .filter(models.TransactionRecord.category != "Transfer")
        .all()
    )
    transactions = [t for t in transactions if t.occurred_at.replace(tzinfo=timezone.utc) >= month_ago]

    totals: dict[str, float] = {}
    for t in transactions:
        totals[t.category] = totals.get(t.category, 0.0) + (-t.amount)
    grand_total = sum(totals.values()) or 1

    palette = ["#e8b23d", "#c9c2f0", "#bfe3f5", "#c7efd8", "#f0b959"]
    out = []
    for i, (category, amount) in enumerate(sorted(totals.items(), key=lambda kv: -kv[1])):
        out.append({"name": category, "value": round(amount / grand_total * 100), "color": palette[i % len(palette)]})
    return out


@router.get("/insights", response_model=schemas.InsightOut)
async def insights(user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    """Returns this week's AI spending digest, generating and caching it as a
    Notification the first time it's requested each week (so refreshing the
    dashboard doesn't re-call the LLM every load)."""
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    existing = (
        db.query(models.Notification)
        .filter(models.Notification.user_id == user.id, models.Notification.type == "insight", models.Notification.created_at >= week_ago)
        .order_by(models.Notification.created_at.desc())
        .first()
    )
    if existing:
        return schemas.InsightOut(title=existing.title, body=existing.body, generated_at=existing.created_at)

    accounts = db.query(models.Account).filter(models.Account.user_id == user.id).all()
    account_ids = [a.id for a in accounts]
    month_ago = datetime.now(timezone.utc) - timedelta(days=30)
    prior_month_ago = datetime.now(timezone.utc) - timedelta(days=60)

    this_month = [t for t in db.query(models.TransactionRecord).filter(models.TransactionRecord.account_id.in_(account_ids)).all() if _aware(t.occurred_at) >= month_ago] if account_ids else []
    last_month = [t for t in db.query(models.TransactionRecord).filter(models.TransactionRecord.account_id.in_(account_ids)).all() if prior_month_ago <= _aware(t.occurred_at) < month_ago] if account_ids else []

    def category_totals(txns):
        totals: dict[str, float] = defaultdict(float)
        for t in txns:
            if t.amount < 0 and t.category != "Transfer":
                totals[t.category] += -t.amount
        return dict(totals)

    goals = db.query(models.SavingsGoal).filter(models.SavingsGoal.user_id == user.id).all()
    goal_summary = "; ".join(f"{g.name}: {g.saved:.0f}/{g.target:.0f}" for g in goals) or "none"

    prompt = (
        f"This month's spending by category: {category_totals(this_month)}. "
        f"Last month's spending by category: {category_totals(last_month)}. "
        f"Savings goals (saved/target): {goal_summary}. "
        "Write a short, specific, encouraging spending insight a customer would actually want to "
        "read on their banking dashboard — one real comparison or trend, not generic advice."
    )
    try:
        result = await structured_completion(
            "You are a banking assistant writing a short personalized spending insight. "
            'Return ONLY JSON: {"title": "3-6 word headline", "body": "1-2 sentence insight"}.',
            prompt,
        )
        title, body = result.get("title", "Your spending this month"), result.get("body", "")
    except Exception:  # noqa: BLE001
        title, body = "Your spending this month", "We couldn't generate a fresh insight right now — check back soon."

    notification = models.Notification(user_id=user.id, type="insight", title=title, body=body, severity="neutral")
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return schemas.InsightOut(title=notification.title, body=notification.body, generated_at=notification.created_at)


@router.get("/forecast", response_model=schemas.ForecastOut)
def forecast(user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    accounts = db.query(models.Account).filter(models.Account.user_id == user.id).all()
    account_ids = [a.id for a in accounts]
    current_balance = sum(a.balance for a in accounts if a.type != "credit")

    if not account_ids:
        return schemas.ForecastOut(current_balance=current_balance, projected_30d_balance=current_balance, recurring=[], warning=False)

    txns = (
        db.query(models.TransactionRecord)
        .filter(models.TransactionRecord.account_id.in_(account_ids))
        .filter(models.TransactionRecord.category != "Transfer")
        .order_by(models.TransactionRecord.occurred_at.asc())
        .all()
    )

    groups: dict[tuple[str, str], list[models.TransactionRecord]] = defaultdict(list)
    for t in txns:
        groups[(t.merchant, t.category)].append(t)

    now = datetime.now(timezone.utc)
    recurring: list[schemas.RecurringItem] = []
    projected_delta = 0.0

    for (merchant, category), items in groups.items():
        if len(items) < 2:
            continue
        dates = sorted(_aware(t.occurred_at) for t in items)
        gaps = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
        avg_interval = max(1, round(sum(gaps) / len(gaps)))
        avg_amount = sum(t.amount for t in items) / len(items)
        last_date = dates[-1]
        days_since_last = (now - last_date).days

        # how many occurrences are expected in the next 30 days
        first_gap = avg_interval - days_since_last
        if first_gap > 30:
            continue
        occurrences = 0
        cursor = first_gap
        while cursor <= 30:
            occurrences += 1
            cursor += avg_interval
        if occurrences == 0:
            continue

        next_expected_date = last_date + timedelta(days=avg_interval)
        recurring.append(schemas.RecurringItem(
            merchant=merchant,
            category=category,
            avg_amount=round(avg_amount, 2),
            interval_days=avg_interval,
            next_expected=next_expected_date.strftime("%b %d"),
        ))
        projected_delta += avg_amount * occurrences

    projected_balance = round(current_balance + projected_delta, 2)
    warning = projected_balance < 200
    warning_message = None
    if warning:
        warning_message = f"Based on your recurring bills and income, your balance may drop to about ${projected_balance:,.2f} in the next 30 days."
        recent_warning = (
            db.query(models.Notification)
            .filter(models.Notification.user_id == user.id, models.Notification.type == "forecast_warning", models.Notification.created_at >= now - timedelta(days=7))
            .first()
        )
        if not recent_warning:
            db.add(models.Notification(
                user_id=user.id,
                type="forecast_warning",
                title="Low balance projected",
                body=warning_message,
                severity="watch",
                action_label="Review",
            ))
            db.commit()

    return schemas.ForecastOut(
        current_balance=round(current_balance, 2),
        projected_30d_balance=projected_balance,
        recurring=sorted(recurring, key=lambda r: r.next_expected),
        warning=warning,
        warning_message=warning_message,
    )


@router.get("/", response_model=list[schemas.AccountOut])
def list_accounts(user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    return db.query(models.Account).filter(models.Account.user_id == user.id).all()


@router.get("/goals", response_model=list[schemas.SavingsGoalOut])
def list_goals(user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    return db.query(models.SavingsGoal).filter(models.SavingsGoal.user_id == user.id).all()


@router.post("/transfer", response_model=schemas.AccountOut)
def transfer(payload: schemas.TransferRequest, user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    account = db.get(models.Account, payload.from_account_id)
    if not account or account.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    if account.balance < payload.amount:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Insufficient funds")

    account.balance -= payload.amount
    db.add(models.TransactionRecord(
        account_id=account.id,
        merchant=f"Transfer to {payload.to_label}",
        category="Transfer",
        amount=-payload.amount,
        status="Completed",
    ))
    db.add(models.AuditLog(
        actor_id=user.id,
        actor_label=user.full_name,
        action="transfer_funds",
        target_type="account",
        target_id=str(account.id),
        details=f"${payload.amount:.2f} to {payload.to_label}",
    ))
    db.commit()
    db.refresh(account)
    return account


@router.post("/cards/{account_id}/freeze", response_model=schemas.AccountOut)
def freeze_card(account_id: int, user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    account = db.get(models.Account, account_id)
    if not account or account.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    db.add(models.AuditLog(
        actor_id=user.id,
        actor_label=user.full_name,
        action="freeze_card",
        target_type="account",
        target_id=str(account.id),
        details=None,
    ))
    db.commit()
    return account
