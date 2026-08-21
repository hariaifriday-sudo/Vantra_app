from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import require_account_holder, require_agent
from ..llm import structured_completion

router = APIRouter(prefix="/api/kyc", tags=["kyc"])

RECOMMENDATION_SYSTEM_PROMPT = """You are a bank compliance assistant reviewing a customer's KYC
(Know Your Customer) submission before a human agent makes the final call.
Given the extracted fields and their OCR confidence scores, return ONLY a JSON object:
{"recommendation": "Approve" | "Request More Info" | "Reject",
 "notes": "2-4 short bullet points as a single string separated by newlines, explaining the reasoning"}
Be conservative: recommend "Request More Info" if any field has confidence below 75,
or if information looks inconsistent or implausible."""


# ---- Account holder ----

@router.get("/me", response_model=schemas.KycOut | None)
def my_kyc(user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    app_ = (
        db.query(models.KycApplication)
        .filter(models.KycApplication.user_id == user.id)
        .order_by(models.KycApplication.created_at.desc())
        .first()
    )
    return app_


@router.post("/start", response_model=schemas.KycOut)
def start_kyc(user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    app_ = models.KycApplication(user_id=user.id, case_ref="PENDING", status="draft")
    db.add(app_)
    db.commit()
    db.refresh(app_)
    app_.case_ref = f"KYC-{40000 + app_.id}"
    db.commit()
    db.refresh(app_)
    return app_


@router.post("/{kyc_id}/submit", response_model=schemas.KycOut)
async def submit_kyc(kyc_id: int, payload: schemas.KycSubmitRequest, user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    app_ = db.get(models.KycApplication, kyc_id)
    if not app_ or app_.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "KYC application not found")
    if not payload.signed:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A signature is required to submit")

    app_.fields = payload.fields
    app_.confidences = payload.confidences
    app_.signed = True
    app_.status = "pending"
    app_.submitted_at = datetime.now(timezone.utc)

    try:
        result = await structured_completion(
            RECOMMENDATION_SYSTEM_PROMPT,
            f"Extracted fields and confidences: {app_.fields} / {app_.confidences}",
        )
        app_.ai_recommendation = result.get("recommendation", "Request More Info")
        app_.ai_notes = result.get("notes", "")
    except Exception:  # noqa: BLE001 - never block submission on an LLM hiccup
        app_.ai_recommendation = None
        app_.ai_notes = None

    db.add(models.Notification(
        user_id=user.id,
        type="kyc",
        title="KYC submitted for review",
        body=f"Your verification ({app_.case_ref}) is now pending review. We'll notify you the moment there's an update.",
        severity="neutral",
    ))
    db.add(models.AuditLog(actor_id=user.id, actor_label=user.full_name, action="kyc_submit", target_type="kyc", target_id=app_.case_ref, details=None))
    db.commit()
    db.refresh(app_)
    return app_


# ---- Agent ----

@router.get("/queue", response_model=list[schemas.KycOut])
def kyc_queue(_: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    return (
        db.query(models.KycApplication)
        .filter(models.KycApplication.status.in_(["pending", "needs_info"]))
        .order_by(models.KycApplication.submitted_at.desc())
        .all()
    )


@router.get("/{kyc_id}", response_model=schemas.KycOut)
def kyc_detail(kyc_id: int, _: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    app_ = db.get(models.KycApplication, kyc_id)
    if not app_:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "KYC application not found")
    return app_


@router.post("/{kyc_id}/decision", response_model=schemas.KycOut)
def kyc_decision(kyc_id: int, payload: schemas.KycDecisionRequest, agent: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    app_ = db.get(models.KycApplication, kyc_id)
    if not app_:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "KYC application not found")

    status_map = {"approve": "approved", "request_info": "needs_info", "reject": "rejected"}
    app_.status = status_map[payload.decision]
    app_.reviewed_by = agent.id
    app_.reviewed_at = datetime.now(timezone.utc)
    app_.reviewer_notes = payload.notes

    body_map = {
        "approve": f"Your identity verification ({app_.case_ref}) has been approved.",
        "request_info": f"We need a bit more information for {app_.case_ref}: {payload.notes or 'please check your KYC Center for details.'}",
        "reject": f"Your identity verification ({app_.case_ref}) could not be approved: {payload.notes or 'please contact support.'}",
    }
    db.add(models.Notification(
        user_id=app_.user_id,
        type="kyc",
        title="KYC status updated",
        body=body_map[payload.decision],
        severity="neutral" if payload.decision == "approve" else "watch",
        action_label="Review" if payload.decision == "request_info" else None,
    ))
    db.add(models.AuditLog(
        actor_id=agent.id,
        actor_label=agent.full_name,
        action=f"kyc_{payload.decision}",
        target_type="kyc",
        target_id=app_.case_ref,
        details=payload.notes,
    ))
    db.commit()
    db.refresh(app_)
    return app_
