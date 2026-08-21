from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import require_agent
from ..llm import structured_completion

router = APIRouter(prefix="/api/policies", tags=["policies"])


@router.get("/", response_model=list[schemas.PolicyOut])
def list_policies(q: str | None = None, category: str | None = None, _: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    query = db.query(models.Policy)
    if category and category != "All":
        query = query.filter(models.Policy.category == category)
    if q:
        query = query.filter(or_(models.Policy.title.ilike(f"%{q}%"), models.Policy.body.ilike(f"%{q}%")))
    return query.order_by(models.Policy.updated_at.desc()).all()


class PolicyQuestion(BaseModel):
    question: str


@router.post("/{policy_id}/ask")
async def ask_about_policy(policy_id: int, payload: PolicyQuestion, _: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    policy = db.get(models.Policy, policy_id)
    if not policy:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Policy not found")

    result = await structured_completion(
        "You are a bank compliance assistant. Answer the agent's question using ONLY the "
        "policy document text provided. Return ONLY JSON: {\"answer\": string}. "
        "If the answer isn't in the document, say so plainly.",
        f"POLICY: {policy.title}\n\n{policy.body}\n\nQUESTION: {payload.question}",
    )
    return {"answer": result.get("answer", "I couldn't find that in this document.")}
