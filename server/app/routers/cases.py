from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import require_account_holder, require_agent
from ..llm import structured_completion

router = APIRouter(prefix="/api/cases", tags=["cases"])

ROUTING_SYSTEM_PROMPT = """You are a bank support-ticket triage assistant. Read the customer
email and return ONLY a JSON object:
{"summary": "one sentence summarizing the request",
 "department": "Fraud" | "Loans" | "KYC" | "General Support",
 "confidence": int 0-100,
 "status": "Auto-Routed" | "Needs Review",
 "sentiment": "positive" | "neutral" | "negative" | "urgent"}
Use "Needs Review" instead of "Auto-Routed" when confidence would be below 70,
the message is ambiguous, or sentiment is urgent/negative."""


class IncomingEmail(BaseModel):
    sender_email: EmailStr
    subject: str
    body: str


@router.get("/", response_model=list[schemas.CaseTicketOut])
def list_cases(_: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    return db.query(models.CaseTicket).order_by(models.CaseTicket.created_at.desc()).all()


@router.post("/route", response_model=schemas.CaseTicketOut)
async def route_incoming_email(payload: IncomingEmail, db: Session = Depends(get_db)):
    """Simulates a new support email arriving and being triaged by the AI in real time."""
    ticket = models.CaseTicket(sender_email=payload.sender_email, subject=payload.subject, body=payload.body, status="Needs Review")
    try:
        result = await structured_completion(ROUTING_SYSTEM_PROMPT, f"Subject: {payload.subject}\n\n{payload.body}")
        ticket.ai_summary = result.get("summary")
        ticket.department = result.get("department", "General Support")
        ticket.confidence = int(result.get("confidence", 50))
        ticket.status = result.get("status", "Needs Review")
    except Exception:  # noqa: BLE001
        ticket.ai_summary = "Automatic summarization unavailable — please review manually."
        ticket.department = "General Support"
        ticket.confidence = 0

    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket


@router.post("/dispute", response_model=schemas.CaseTicketOut)
async def file_dispute(payload: schemas.CaseDisputeRequest, user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    """Lets an account holder describe a disputed transaction in their own
    words; the AI drafts the case summary and routes it straight to Fraud."""
    ticket = models.CaseTicket(sender_email=user.email, subject="Transaction dispute", body=payload.description, department="Fraud", status="Needs Review")
    try:
        result = await structured_completion(
            "You are a bank fraud-intake assistant. The customer is disputing a transaction. "
            'Return ONLY JSON: {"summary": "one sentence summary of the dispute for the agent queue"}.',
            payload.description,
        )
        ticket.ai_summary = result.get("summary", payload.description[:140])
        ticket.confidence = 90
    except Exception:  # noqa: BLE001
        ticket.ai_summary = payload.description[:140]
        ticket.confidence = 0

    db.add(ticket)

    if payload.notification_id:
        notification = db.get(models.Notification, payload.notification_id)
        if notification and notification.user_id == user.id:
            notification.read = True

    db.add(models.AuditLog(actor_id=user.id, actor_label=user.full_name, action="dispute_filed", target_type="case", target_id="pending", details=payload.description[:200]))
    db.commit()
    db.refresh(ticket)
    return ticket


@router.post("/{case_id}/reassign", response_model=schemas.CaseTicketOut)
def reassign(case_id: int, payload: schemas.CaseReassignRequest, agent: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    ticket = db.get(models.CaseTicket, case_id)
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found")
    ticket.department = payload.department
    db.add(models.AuditLog(actor_id=agent.id, actor_label=agent.full_name, action="case_reassign", target_type="case", target_id=str(ticket.id), details=payload.department))
    db.commit()
    db.refresh(ticket)
    return ticket


@router.post("/{case_id}/resolve", response_model=schemas.CaseTicketOut)
def resolve(case_id: int, agent: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    ticket = db.get(models.CaseTicket, case_id)
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found")
    ticket.status = "Resolved"
    db.add(models.AuditLog(actor_id=agent.id, actor_label=agent.full_name, action="case_resolve", target_type="case", target_id=str(ticket.id), details=None))
    db.commit()
    db.refresh(ticket)
    return ticket
