import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import require_agent
from ..llm import structured_completion

router = APIRouter(prefix="/api/aml", tags=["aml"])

CTR_THRESHOLD = 10_000
STRUCTURING_MIN_LEG = 3_000
STRUCTURING_WINDOW_DAYS = 3
VELOCITY_MIN_COUNT = 4
VELOCITY_WINDOW_HOURS = 24

SAR_SYSTEM_PROMPT = """You are a bank compliance officer drafting a Suspicious Activity Report
(SAR) narrative for internal review before filing. Given the alert details, write a formal but
concise narrative (3-5 sentences) covering: what pattern was observed, the accounts/entities
involved, the dollar amounts and date range, and which typology it matches. Return ONLY JSON:
{"narrative": string}."""


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@router.get("/alerts", response_model=list[schemas.AmlAlertOut])
def list_alerts(_: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    return db.query(models.AmlAlert).order_by(models.AmlAlert.created_at.desc()).all()


@router.post("/alerts/{alert_id}/action", response_model=schemas.AmlAlertOut)
async def act_on_alert(alert_id: int, payload: schemas.AmlActionRequest, agent: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    alert = db.get(models.AmlAlert, alert_id)
    if not alert:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found")

    status_map = {"escalate": "Escalated", "file_sar": "SAR Filed", "clear": "Cleared"}
    alert.status = status_map[payload.action]
    if payload.notes:
        alert.agent_notes = payload.notes

    if payload.action == "file_sar":
        try:
            result = await structured_completion(
                SAR_SYSTEM_PROMPT,
                f"Entity: {alert.entity_name}\nPattern: {alert.alert_type}\nVolume: ${alert.volume:,.2f}\n"
                f"Existing analyst notes: {alert.narrative}\nEvidence: {alert.evidence}",
            )
            alert.sar_draft = result.get("narrative")
        except Exception:  # noqa: BLE001
            alert.sar_draft = "Automatic SAR drafting unavailable — please draft manually using the narrative above."

    db.add(models.AuditLog(
        actor_id=agent.id,
        actor_label=agent.full_name,
        action=f"aml_{payload.action}",
        target_type="aml_alert",
        target_id=alert.case_ref,
        details=f"{alert.entity_name} / {alert.alert_type}" + (f" — {payload.notes}" if payload.notes else ""),
    ))
    db.commit()
    db.refresh(alert)
    return alert


@router.post("/scan", response_model=schemas.AmlScanResult)
async def run_scan(agent: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    created, scanned = await scan_for_aml(db)

    db.add(models.AuditLog(
        actor_id=agent.id,
        actor_label=agent.full_name,
        action="aml_scan",
        target_type="aml_alert",
        target_id="sweep",
        details=f"{len(created)} new alert(s) from {scanned} transactions scanned",
    ))
    db.commit()

    return schemas.AmlScanResult(created=created, scanned_transactions=scanned)


async def scan_for_aml(db: Session, holder_ids: list[int] | None = None) -> tuple[list[models.AmlAlert], int]:
    """Runs a real rules-based pass over transaction data: structuring
    (multiple sub-threshold transactions summing past the CTR threshold in a
    short window) and velocity (unusually many transactions in 24h). Creates
    AmlAlert rows for newly-detected patterns; skips ones already flagged.
    Scoped to `holder_ids` when given (e.g. a single account holder just
    generated test activity), otherwise sweeps every account holder."""
    query = db.query(models.User).filter(models.User.role == "account_holder")
    if holder_ids is not None:
        query = query.filter(models.User.id.in_(holder_ids))
    holders = query.all()
    created: list[models.AmlAlert] = []
    scanned = 0

    for holder in holders:
        accounts = db.query(models.Account).filter(models.Account.user_id == holder.id).all()
        account_ids = [a.id for a in accounts]
        if not account_ids:
            continue
        txns = (
            db.query(models.TransactionRecord)
            .filter(models.TransactionRecord.account_id.in_(account_ids))
            .filter(models.TransactionRecord.category != "Transfer")
            .order_by(models.TransactionRecord.occurred_at.asc())
            .all()
        )
        scanned += len(txns)
        if len(txns) < 2:
            continue

        # --- Structuring: rolling window of sub-threshold legs summing past CTR_THRESHOLD ---
        window: list[models.TransactionRecord] = []
        for t in txns:
            amt = abs(t.amount)
            if amt < STRUCTURING_MIN_LEG or amt >= CTR_THRESHOLD:
                continue
            window.append(t)
            window = [w for w in window if (_aware(t.occurred_at) - _aware(w.occurred_at)).days <= STRUCTURING_WINDOW_DAYS]
            total = sum(abs(w.amount) for w in window)
            if total >= CTR_THRESHOLD and len(window) >= 2:
                alert = await _create_alert_if_new(
                    db, holder, "Structuring Pattern", total, window,
                    f"{len(window)} transactions each under the ${CTR_THRESHOLD:,} CTR threshold, "
                    f"totaling ${total:,.2f} within {STRUCTURING_WINDOW_DAYS} days.",
                )
                if alert:
                    created.append(alert)
                break  # one structuring alert per holder per scan is enough signal

        # --- Velocity: too many transactions in a short window ---
        for i in range(len(txns) - VELOCITY_MIN_COUNT + 1):
            burst = txns[i : i + VELOCITY_MIN_COUNT]
            span_hours = (_aware(burst[-1].occurred_at) - _aware(burst[0].occurred_at)).total_seconds() / 3600
            if span_hours <= VELOCITY_WINDOW_HOURS:
                total = sum(abs(b.amount) for b in burst)
                alert = await _create_alert_if_new(
                    db, holder, "Rapid Fund Movement", total, burst,
                    f"{len(burst)} transactions within {span_hours:.1f} hours, totaling ${total:,.2f}.",
                )
                if alert:
                    created.append(alert)
                break  # one velocity alert per holder per scan is enough signal

    db.commit()
    for a in created:
        db.refresh(a)

    return created, scanned


async def _create_alert_if_new(db: Session, holder: models.User, alert_type: str, volume: float, evidence_txns: list[models.TransactionRecord], summary: str):
    existing = (
        db.query(models.AmlAlert)
        .filter(models.AmlAlert.user_id == holder.id, models.AmlAlert.alert_type == alert_type, models.AmlAlert.source == "scan")
        .filter(models.AmlAlert.created_at >= datetime.now(timezone.utc) - timedelta(days=1))
        .first()
    )
    if existing:
        return None

    evidence = {
        "transaction_ids": [t.id for t in evidence_txns],
        "merchants": [t.merchant for t in evidence_txns],
        "amounts": [t.amount for t in evidence_txns],
        "dates": [t.occurred_at.isoformat() for t in evidence_txns],
    }

    try:
        result = await structured_completion(
            "You are an AML analyst. Given a detected transaction pattern, write a 1-2 sentence "
            'narrative explaining the risk and which typology it matches. Return ONLY JSON: {"narrative": string}.',
            f"Holder: {holder.full_name}\nPattern: {alert_type}\nDetail: {summary}\nTransactions: {evidence}",
        )
        narrative = result.get("narrative", summary)
    except Exception:  # noqa: BLE001
        narrative = summary

    alert = models.AmlAlert(
        entity_name=holder.full_name,
        user_id=holder.id,
        alert_type=alert_type,
        volume=volume,
        status="Open",
        narrative=narrative,
        evidence=evidence,
        source="scan",
        case_ref=f"ALT-{secrets.token_hex(3).upper()}",
    )
    db.add(alert)
    return alert
