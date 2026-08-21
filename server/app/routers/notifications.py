from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import require_account_holder

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("/", response_model=list[schemas.NotificationOut])
def list_notifications(user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    return (
        db.query(models.Notification)
        .filter(models.Notification.user_id == user.id)
        .order_by(models.Notification.created_at.desc())
        .all()
    )


@router.post("/{notification_id}/read", response_model=schemas.NotificationOut)
def mark_read(notification_id: int, user: models.User = Depends(require_account_holder), db: Session = Depends(get_db)):
    notification = db.get(models.Notification, notification_id)
    if not notification or notification.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    notification.read = True
    db.commit()
    db.refresh(notification)
    return notification
