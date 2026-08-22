from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import actions, models, schemas
from ..actions import ActionError
from ..database import get_db
from ..deps import require_account_holder

router = APIRouter(prefix="/api/banking", tags=["banking"])


# ---- Savings goals ----

@router.post("/goals", response_model=schemas.SavingsGoalOut)
def create_goal(payload: schemas.SavingsGoalCreate, user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    try:
        return actions.create_savings_goal(db, user, payload.name, payload.target, payload.saved, payload.due_by, payload.icon)
    except ActionError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


@router.patch("/goals/{goal_id}", response_model=schemas.SavingsGoalOut)
def update_goal(goal_id: int, payload: schemas.SavingsGoalUpdate, user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    try:
        return actions.update_savings_goal(db, user, goal_id, payload.name, payload.target, payload.saved, payload.due_by)
    except ActionError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


@router.delete("/goals/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(goal_id: int, user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    try:
        actions.delete_savings_goal(db, user, goal_id)
    except ActionError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


# ---- Beneficiaries ----

@router.get("/beneficiaries", response_model=list[schemas.BeneficiaryOut])
def list_beneficiaries(user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    return actions.list_beneficiaries(db, user)


@router.post("/beneficiaries", response_model=schemas.BeneficiaryOut)
def add_beneficiary(payload: schemas.BeneficiaryCreate, user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    beneficiary = models.Beneficiary(user_id=user.id, name=payload.name, account_ref=payload.account_ref, bank_name=payload.bank_name)
    db.add(beneficiary)
    db.commit()
    db.refresh(beneficiary)
    return beneficiary


# ---- Pending transfers (chat- or UI-initiated, always require explicit approval) ----

@router.get("/transfers/pending", response_model=list[schemas.PendingTransferOut])
def list_pending_transfers(user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    return actions.list_pending_transfers(db, user)


@router.post("/transfers/pending/{pending_id}/approve", response_model=schemas.PendingTransferOut)
def approve_transfer(pending_id: int, user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    try:
        return actions.approve_pending_transfer(db, user, pending_id)
    except ActionError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


@router.post("/transfers/pending/{pending_id}/reject", response_model=schemas.PendingTransferOut)
def reject_transfer(pending_id: int, user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    try:
        return actions.reject_pending_transfer(db, user, pending_id)
    except ActionError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


# ---- Scheduled / auto payments ----

@router.get("/auto-payments", response_model=list[schemas.ScheduledPaymentOut])
def list_auto_payments(user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    actions.process_due_scheduled_payments(db, user)
    return actions.list_auto_payments(db, user)


@router.post("/auto-payments", response_model=schemas.ScheduledPaymentOut)
def create_auto_payment(payload: schemas.ScheduledPaymentCreate, user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    account = db.get(models.Account, payload.from_account_id)
    if not account or account.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    try:
        return actions.schedule_auto_payment(db, user, payload.to_label, payload.amount, payload.frequency, account.name, payload.start_date)
    except ActionError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


@router.post("/auto-payments/{payment_id}/cancel", response_model=schemas.ScheduledPaymentOut)
def cancel_auto_payment(payment_id: int, user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    try:
        return actions.cancel_auto_payment(db, user, payment_id)
    except ActionError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


# ---- Demo/testing: simulate transaction activity for AML/Fraud showcases ----

@router.post("/simulate-transactions", response_model=schemas.SimulateTransactionsResult)
async def simulate_transactions(payload: schemas.SimulateTransactionsRequest, user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    try:
        return await actions.simulate_transactions(db, user, payload.scenario)
    except ActionError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
