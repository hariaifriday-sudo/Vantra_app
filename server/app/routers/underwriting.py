from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import require_agent
from ..llm import structured_completion

router = APIRouter(prefix="/api/underwriting", tags=["underwriting"])

EXPLAIN_SYSTEM_PROMPT = """You are a credit underwriter's AI assistant. Given an applicant's
financials, write a risk summary and a counterfactual. Return ONLY JSON:
{"summary": "2-3 sentence plain-language risk summary",
 "counterfactual": "one sentence: what specific change would move this to a better risk grade",
 "recommendation": "Approve" | "Approve with Conditions" | "Decline"}"""


@router.get("/", response_model=list[schemas.UnderwritingOut])
def list_applications(_: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    return db.query(models.UnderwritingApplication).order_by(models.UnderwritingApplication.created_at.desc()).all()


@router.post("/{app_id}/explain", response_model=schemas.UnderwritingOut)
async def explain(app_id: int, _: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    application = db.get(models.UnderwritingApplication, app_id)
    if not application:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Application not found")

    prompt = (
        f"Applicant: {application.applicant_name}\nLoan type: {application.loan_type}\n"
        f"Amount requested: ${application.amount:,.2f}\nCurrent grade: {application.grade}\n"
        f"Debt-to-income: {application.dti}\nCredit score: {application.credit_score}\nLoan-to-value: {application.ltv}"
    )
    try:
        result = await structured_completion(EXPLAIN_SYSTEM_PROMPT, prompt)
        application.ai_summary = result.get("summary", application.ai_summary)
        application.counterfactual = result.get("counterfactual")
        application.recommendation = result.get("recommendation", application.recommendation)
    except Exception:  # noqa: BLE001
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "AI analysis is temporarily unavailable")

    db.commit()
    db.refresh(application)
    return application


@router.post("/{app_id}/decision", response_model=schemas.UnderwritingOut)
def decide(app_id: int, payload: schemas.UnderwritingDecisionRequest, agent: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    application = db.get(models.UnderwritingApplication, app_id)
    if not application:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Application not found")

    status_map = {"accept": "Approved", "request_documents": "Pending", "override": "Approved"}
    application.status = status_map[payload.decision]
    if payload.decision == "request_documents":
        application.status = "Awaiting Documents"

    db.add(models.AuditLog(
        actor_id=agent.id,
        actor_label=agent.full_name,
        action=f"underwriting_{payload.decision}",
        target_type="underwriting",
        target_id=str(application.id),
        details=payload.justification,
    ))
    db.commit()
    db.refresh(application)
    return application
