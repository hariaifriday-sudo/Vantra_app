from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import SessionLocal, get_db
from ..llm import stream_chat
from ..rag import format_context, retrieve_policies
from ..security import decode_access_token

router = APIRouter(prefix="/api/chat", tags=["chat"])

FAQ_SYSTEM_PROMPT = """You are Vantra, the AI banking assistant for Vantra Bank, speaking to a
visitor who may not be logged in. Help with general FAQs, product/offer questions (savings,
credit cards, personal loans), navigation help, and basic financial calculations (EMI, interest).
Be concise, warm, and precise. Never invent account-specific details you don't have. If asked
something account-specific, tell the user to log in."""

AGENT_SYSTEM_PROMPT = """You are Vantra Copilot, an internal AI assistant for Vantra Bank
employees (compliance, fraud ops, credit risk, support). Help agents with case guidance and
quick lookups. Below is the most relevant excerpt(s) from the internal policy library, retrieved
for this specific question — base regulatory/policy answers on this retrieved text and cite the
policy title in your answer. If the retrieved text doesn't actually answer the question, say so
plainly instead of guessing.

--- RETRIEVED POLICY CONTEXT ---
{policy_context}
--- END CONTEXT ---"""


def _account_system_prompt(user: models.User, db: Session) -> str:
    accounts = db.query(models.Account).filter(models.Account.user_id == user.id).all()
    goals = db.query(models.SavingsGoal).filter(models.SavingsGoal.user_id == user.id).all()
    acct_summary = "; ".join(f"{a.name}: ${a.balance:,.2f}" for a in accounts) or "no accounts yet"
    goal_summary = "; ".join(f"{g.name}: ${g.saved:,.2f} of ${g.target:,.2f}" for g in goals) or "no savings goals yet"
    return (
        f"You are Vantra, the AI banking assistant, speaking to logged-in customer {user.full_name}. "
        f"Their accounts: {acct_summary}. Their savings goals: {goal_summary}. "
        "Use this real data to answer questions about their balances and progress. Help with "
        "transfers, KYC status, card actions, and calculations. Be concise and warm. Never reveal "
        "full account numbers, only reference accounts by name."
    )


async def _resolve_user(token: Optional[str], db: Session) -> Optional[models.User]:
    if not token:
        return None
    try:
        payload = decode_access_token(token)
        return db.get(models.User, int(payload["sub"]))
    except Exception:  # noqa: BLE001
        return None


@router.get("/stream")
async def chat_stream(
    message: str,
    session_key: str,
    context: str = Query("faq", pattern="^(faq|account|agent_copilot)$"),
    token: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Streams the assistant's reply as plain text chunks. `token` is passed as a
    query param (not a header) so this works with a plain EventSource-free fetch
    stream from the browser without extra CORS/auth-header plumbing."""
    user = await _resolve_user(token, db)

    if context == "account" and user:
        system_prompt = _account_system_prompt(user, db)
    elif context == "agent_copilot":
        matches = retrieve_policies(db, message)
        system_prompt = AGENT_SYSTEM_PROMPT.format(policy_context=format_context(matches))
    else:
        system_prompt = FAQ_SYSTEM_PROMPT

    history = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.session_key == session_key)
        .order_by(models.ChatMessage.created_at.asc())
        .limit(20)
        .all()
    )
    messages = [{"role": h.role, "content": h.content} for h in history]
    messages.append({"role": "user", "content": message})

    user_id = user.id if user else None

    async def generate():
        session = SessionLocal()
        try:
            session.add(models.ChatMessage(user_id=user_id, session_key=session_key, context=context, role="user", content=message))
            session.commit()

            full_reply = ""
            async for chunk in stream_chat(messages, system_prompt):
                full_reply += chunk
                yield chunk

            session.add(models.ChatMessage(user_id=user_id, session_key=session_key, context=context, role="assistant", content=full_reply))
            session.commit()
        finally:
            session.close()

    return StreamingResponse(generate(), media_type="text/plain")


@router.get("/history", response_model=list[schemas.ChatMessageOut])
def chat_history(session_key: str, db: Session = Depends(get_db)):
    return (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.session_key == session_key)
        .order_by(models.ChatMessage.created_at.asc())
        .all()
    )
