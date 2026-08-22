import re
import statistics
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import require_agent

router = APIRouter(prefix="/api/fraud", tags=["fraud"])

# "Merchant — City, CC" is the convention seed data and the simulator use for a
# transaction that happened somewhere outside the customer's normal footprint.
GEO_MISMATCH_RE = re.compile(r"—\s*[\w\s]+,\s*[A-Z]{2}$")
VELOCITY_MIN_COUNT = 4
VELOCITY_WINDOW_MINUTES = 10
OUTLIER_MULTIPLE = 4.0
OUTLIER_BASELINE_MIN_COUNT = 3
# Internal money-movement categories aren't retail spend — a large wire is AML's
# job to flag (structuring/velocity), not a "your card looks stolen" signal here.
NON_SPEND_CATEGORIES = ("Transfer", "Transfer Out", "Wire Transfer", "Income")


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@router.get("/alerts", response_model=list[schemas.FraudAlertOut])
def list_alerts(_: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    return db.query(models.FraudAlert).order_by(models.FraudAlert.created_at.desc()).all()


@router.post("/alerts/{alert_id}/action", response_model=schemas.FraudAlertOut)
def act_on_alert(alert_id: int, payload: schemas.FraudActionRequest, agent: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    alert = db.get(models.FraudAlert, alert_id)
    if not alert:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found")

    status_map = {"confirm_fraud": "Confirmed", "dismiss": "Dismissed", "escalate": "Escalated"}
    alert.status = status_map[payload.action]
    alert.resolved_by = agent.id
    alert.resolved_at = datetime.now(timezone.utc)
    if payload.notes:
        alert.agent_notes = payload.notes

    if payload.action == "confirm_fraud" and alert.user_id:
        db.add(models.Notification(
            user_id=alert.user_id,
            type="security",
            title="We flagged a transaction on your account",
            body=f"A ${alert.amount:,.2f} charge at {alert.merchant} was flagged and confirmed as fraud. We've started a dispute on your behalf.",
            severity="watch",
            action_label="Review",
        ))

    db.add(models.AuditLog(
        actor_id=agent.id,
        actor_label=agent.full_name,
        action=f"fraud_{payload.action}",
        target_type="fraud_alert",
        target_id=str(alert.id),
        details=f"{alert.merchant} / ${alert.amount:.2f}" + (f" — {payload.notes}" if payload.notes else ""),
    ))
    db.commit()
    db.refresh(alert)
    return alert


@router.post("/scan", response_model=schemas.FraudScanResult)
async def run_scan(agent: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    created, scanned = await scan_for_fraud(db)

    db.add(models.AuditLog(
        actor_id=agent.id,
        actor_label=agent.full_name,
        action="fraud_scan",
        target_type="fraud_alert",
        target_id="sweep",
        details=f"{len(created)} new alert(s) from {scanned} transactions scanned",
    ))
    db.commit()

    return schemas.FraudScanResult(created=created, scanned_transactions=scanned)


async def scan_for_fraud(db: Session, holder_ids: list[int] | None = None) -> tuple[list[models.FraudAlert], int]:
    """Real rules-based fraud detection over transaction data: geo-mismatch
    (merchant tagged with a foreign city/country), velocity (card-testing —
    several transactions within minutes), and amount outliers (far above the
    account's own recent average). Scoped to `holder_ids` when given, else
    every account holder. Skips patterns already flagged in the last day."""
    query = db.query(models.User).filter(models.User.role == "account_holder")
    if holder_ids is not None:
        query = query.filter(models.User.id.in_(holder_ids))
    holders = query.all()
    created: list[models.FraudAlert] = []
    scanned = 0

    for holder in holders:
        accounts = db.query(models.Account).filter(models.Account.user_id == holder.id).all()
        account_ids = [a.id for a in accounts]
        if not account_ids:
            continue
        account_by_id = {a.id: a for a in accounts}
        txns = (
            db.query(models.TransactionRecord)
            .filter(models.TransactionRecord.account_id.in_(account_ids))
            .order_by(models.TransactionRecord.occurred_at.asc())
            .all()
        )
        scanned += len(txns)
        if not txns:
            continue

        # --- Geo-mismatch: merchant tagged with a foreign city/country ---
        for t in txns:
            if GEO_MISMATCH_RE.search(t.merchant):
                alert = await _create_fraud_alert_if_new(
                    db, holder, account_by_id[t.account_id], t, "Geo-mismatch", "Critical",
                    f"This transaction's merchant is tagged outside {holder.full_name.split()[0]}'s usual "
                    f"spend footprint, with no prior travel notice on file.",
                )
                if alert:
                    created.append(alert)

        # --- Velocity: card-testing — several transactions within minutes ---
        for i in range(len(txns) - VELOCITY_MIN_COUNT + 1):
            burst = txns[i : i + VELOCITY_MIN_COUNT]
            span_minutes = (_aware(burst[-1].occurred_at) - _aware(burst[0].occurred_at)).total_seconds() / 60
            if span_minutes <= VELOCITY_WINDOW_MINUTES:
                last = burst[-1]
                alert = await _create_fraud_alert_if_new(
                    db, holder, account_by_id[last.account_id], last, f"Velocity: {len(burst)} txns/{span_minutes:.0f}min", "High",
                    f"{len(burst)} transactions hit this account within {span_minutes:.1f} minutes — consistent "
                    f"with card-testing or a compromised card number.",
                )
                if alert:
                    created.append(alert)
                break  # one velocity alert per holder per scan is enough signal

        # --- Amount outlier: far above this account's own recent spend average ---
        spend_history: list[float] = []
        for t in txns:
            if t.category in NON_SPEND_CATEGORIES or t.amount >= 0:
                continue
            if len(spend_history) >= OUTLIER_BASELINE_MIN_COUNT:
                baseline = statistics.mean(spend_history)
                ratio = abs(t.amount) / baseline if baseline > 0 else 0
                if ratio >= OUTLIER_MULTIPLE:
                    alert = await _create_fraud_alert_if_new(
                        db, holder, account_by_id[t.account_id], t, f"Amount outlier vs recent avg ({ratio:.1f}x)", "Medium" if ratio < OUTLIER_MULTIPLE * 1.5 else "High",
                        f"Transaction is {ratio:.1f}x this account's recent average purchase size (${baseline:,.2f}).",
                    )
                    if alert:
                        created.append(alert)
            spend_history.append(abs(t.amount))

    db.commit()
    for a in created:
        db.refresh(a)

    return created, scanned


async def _create_fraud_alert_if_new(
    db: Session, holder: models.User, account: models.Account, txn: models.TransactionRecord,
    rule: str, risk: str, explanation: str,
) -> models.FraudAlert | None:
    existing = (
        db.query(models.FraudAlert)
        .filter(models.FraudAlert.user_id == holder.id, models.FraudAlert.rule == rule, models.FraudAlert.merchant == txn.merchant)
        .filter(models.FraudAlert.created_at >= datetime.now(timezone.utc) - timedelta(days=1))
        .first()
    )
    if existing:
        return None

    alert = models.FraudAlert(
        account_masked=account.number_masked,
        user_id=holder.id,
        amount=abs(txn.amount),
        merchant=txn.merchant,
        rule=rule,
        risk=risk,
        status="Open",
        ai_explanation=explanation,
    )
    db.add(alert)
    return alert
