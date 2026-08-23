import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import branches as branch_data
from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/branches", response_model=list[schemas.BranchOut])
def list_branches(location: str | None = None):
    return branch_data.find_branches(location)


@router.post("/branches/email", status_code=status.HTTP_204_NO_CONTENT)
def email_branch_details(payload: schemas.BranchEmailRequest, db: Session = Depends(get_db)):
    """No real mail server is wired up for this demo (same spirit as the
    Case Inbox's "Simulate email" button) — this records a real audit-log
    entry of the send rather than actually delivering mail."""
    branch = next((b for b in branch_data.BRANCHES if b["name"] == payload.branch_name), None)
    if not branch:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Branch not found")
    db.add(models.AuditLog(
        actor_label="Public visitor",
        action="branch_details_emailed",
        target_type="branch",
        target_id=payload.branch_name,
        details=f"Sent to {payload.email}: {branch['address']}",
    ))
    db.commit()


@router.post("/appointments", response_model=schemas.AppointmentOut)
def book_appointment(payload: schemas.AppointmentRequest, db: Session = Depends(get_db)):
    # The chat assistant sometimes re-opens a booking form for what's actually a
    # reschedule of an existing request (e.g. "move my appointment to the 25th")
    # rather than using the dedicated reschedule tool — if we blindly inserted,
    # that submits as a second, duplicate appointment at the same branch. Treat a
    # still-pending request at the same branch/email as the one being changed.
    existing = (
        db.query(models.BranchAppointment)
        .filter(
            models.BranchAppointment.email == payload.email,
            models.BranchAppointment.branch_name == payload.branch_name,
            models.BranchAppointment.status == "Requested",
        )
        .order_by(models.BranchAppointment.created_at.desc())
        .first()
    )
    if existing:
        existing.name = payload.name
        existing.phone = payload.phone
        existing.preferred_date = payload.preferred_date
        existing.preferred_time = payload.preferred_time
        existing.reason = payload.reason
        db.commit()
        db.refresh(existing)
        return existing

    appointment = models.BranchAppointment(
        reference=f"APT-{secrets.token_hex(3).upper()}",
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        branch_name=payload.branch_name,
        preferred_date=payload.preferred_date,
        preferred_time=payload.preferred_time,
        reason=payload.reason,
        status="Requested",
    )
    db.add(appointment)
    db.commit()
    db.refresh(appointment)
    return appointment
