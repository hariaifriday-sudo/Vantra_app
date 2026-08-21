from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", response_model=schemas.TokenResponse)
def signup(payload: schemas.SignupRequest, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")

    user = models.User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role="account_holder",
        avatar_seed=(hash(payload.email) % 70) + 1,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Starter data so a brand-new account isn't empty.
    checking = models.Account(user_id=user.id, type="checking", name="Everyday Checking", number_masked="•••• " + str(1000 + user.id * 37 % 8999), balance=2500.0)
    db.add(checking)
    db.add(models.Notification(
        user_id=user.id,
        type="welcome",
        title="Welcome to Vantra",
        body="Your account is ready. Start by verifying your identity in the KYC Center.",
        severity="neutral",
        action_label="Start KYC",
    ))
    db.commit()

    token = create_access_token(subject=str(user.id), role=user.role)
    return schemas.TokenResponse(access_token=token, role=user.role, full_name=user.full_name, email=user.email)


@router.post("/login", response_model=schemas.TokenResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")

    if user.role != payload.role:
        expected = "an Account Holder" if user.role == "account_holder" else "a Bank Agent"
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"This account is registered as {expected}. Switch tabs and try again.")

    token = create_access_token(subject=str(user.id), role=user.role)
    return schemas.TokenResponse(access_token=token, role=user.role, full_name=user.full_name, email=user.email)


@router.get("/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(get_current_user)):
    return user
