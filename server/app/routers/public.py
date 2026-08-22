import secrets

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import branches as branch_data
from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/branches", response_model=list[schemas.BranchOut])
def list_branches(location: str | None = None):
    return branch_data.find_branches(location)


@router.post("/appointments", response_model=schemas.AppointmentOut)
def book_appointment(payload: schemas.AppointmentRequest, db: Session = Depends(get_db)):
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
