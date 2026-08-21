from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import require_agent

router = APIRouter(prefix="/api/agent", tags=["agent"])


@router.get("/overview")
def agent_overview(_: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    pending_kyc = db.query(models.KycApplication).filter(models.KycApplication.status.in_(["pending", "needs_info"])).count()
    open_fraud = db.query(models.FraudAlert).filter(models.FraudAlert.status == "Open").count()
    unread_cases = db.query(models.CaseTicket).filter(models.CaseTicket.status != "Resolved").count()
    pending_underwriting = db.query(models.UnderwritingApplication).filter(models.UnderwritingApplication.status.in_(["Pending", "Flagged"])).count()

    worklist = []
    for k in db.query(models.KycApplication).filter(models.KycApplication.status.in_(["pending", "needs_info"])).order_by(models.KycApplication.submitted_at.desc()).limit(3):
        owner = db.get(models.User, k.user_id)
        worklist.append({"type": "KYC", "customer": owner.full_name if owner else "Unknown", "risk": "Medium", "age": _age(k.submitted_at), "assignee": "Unassigned", "href": "/agent/kyc"})
    for f in db.query(models.FraudAlert).filter(models.FraudAlert.status == "Open").order_by(models.FraudAlert.created_at.desc()).limit(3):
        worklist.append({"type": "Fraud", "customer": f.merchant, "risk": f.risk, "age": _age(f.created_at), "assignee": "Unassigned", "href": "/agent/fraud"})
    for a in db.query(models.AmlAlert).filter(models.AmlAlert.status.in_(["Open", "Investigating"])).order_by(models.AmlAlert.created_at.desc()).limit(2):
        worklist.append({"type": "AML", "customer": a.entity_name, "risk": "Critical", "age": _age(a.created_at), "assignee": "Unassigned", "href": "/agent/aml"})
    for u in db.query(models.UnderwritingApplication).filter(models.UnderwritingApplication.status.in_(["Pending", "Flagged"])).order_by(models.UnderwritingApplication.created_at.desc()).limit(2):
        worklist.append({"type": "Underwriting", "customer": u.applicant_name, "risk": "Medium" if u.status == "Pending" else "High", "age": _age(u.created_at), "assignee": "Unassigned", "href": "/agent/underwriting"})

    return {
        "stats": [
            {"label": "Pending KYC Reviews", "value": str(pending_kyc), "href": "/agent/kyc"},
            {"label": "Open Fraud Alerts", "value": str(open_fraud), "href": "/agent/fraud"},
            {"label": "Unread Case Emails", "value": str(unread_cases), "href": "/agent/cases"},
            {"label": "Underwriting Decisions", "value": str(pending_underwriting), "href": "/agent/underwriting"},
        ],
        "worklist": worklist,
    }


def _age(dt) -> str:
    if dt is None:
        return "—"
    from datetime import datetime, timezone

    delta = datetime.now(timezone.utc) - dt.replace(tzinfo=timezone.utc)
    hours = int(delta.total_seconds() // 3600)
    if hours < 1:
        return "just now"
    if hours < 24:
        return f"{hours}h"
    return f"{hours // 24}d"
