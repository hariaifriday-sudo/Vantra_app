from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import require_agent

router = APIRouter(prefix="/api/fraud", tags=["fraud"])


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
