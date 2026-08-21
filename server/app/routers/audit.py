from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import require_agent

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("/", response_model=list[schemas.AuditLogOut])
def list_audit(target_type: str | None = None, target_id: str | None = None, _: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    query = db.query(models.AuditLog)
    if target_type:
        query = query.filter(models.AuditLog.target_type == target_type)
    if target_id:
        query = query.filter(models.AuditLog.target_id == target_id)
    return query.order_by(models.AuditLog.created_at.desc()).limit(200).all()
