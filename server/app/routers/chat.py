import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..chat_tools import ACCOUNT_TOOLS, build_executor
from ..database import SessionLocal, get_db
from ..llm import stream_chat, stream_chat_with_tools
from ..rag import format_context, retrieve_policies
from ..security import decode_access_token

router = APIRouter(prefix="/api/chat", tags=["chat"])

FORMAT_GUIDANCE = """Format: 1-3 short sentences for simple questions, no preamble. Use a Markdown
table for anything with several numbers. Bold the 1-2 numbers that matter most. No filler like
"I'd be happy to help" — just answer, optionally with a short next-step suggestion."""

FAQ_SYSTEM_PROMPT = f"""You are Vantra, the AI banking assistant for Vantra Bank, speaking to a
visitor who may not be logged in. Help with general FAQs, product/offer questions (savings,
credit cards, personal loans), navigation help, and basic financial calculations (EMI, interest).
Be concise, warm, and precise. Never invent account-specific details you don't have. If asked
something account-specific, tell the user to log in.

{FORMAT_GUIDANCE}"""

AGENT_SYSTEM_PROMPT = f"""You are Vantra Copilot, an internal AI assistant for Vantra Bank
employees (compliance, fraud ops, credit risk, support). Help agents with case guidance and
quick lookups. Below is the most relevant excerpt(s) from the internal policy library, retrieved
for this specific question — base regulatory/policy answers on this retrieved text and cite the
policy title in your answer. If the retrieved text doesn't actually answer the question, say so
plainly instead of guessing.

{FORMAT_GUIDANCE}

--- RETRIEVED POLICY CONTEXT ---
{{policy_context}}
--- END CONTEXT ---"""


def _account_system_prompt(user: models.User, db: Session) -> str:
    accounts = db.query(models.Account).filter(models.Account.user_id == user.id).all()
    account_ids = [a.id for a in accounts]
    goals = db.query(models.SavingsGoal).filter(models.SavingsGoal.user_id == user.id).all()

    recent_txns = (
        db.query(models.TransactionRecord)
        .filter(models.TransactionRecord.account_id.in_(account_ids))
        .order_by(models.TransactionRecord.occurred_at.desc())
        .limit(8)
        .all()
        if account_ids
        else []
    )
    txn_by_account = {a.id: a.name for a in accounts}

    kyc = (
        db.query(models.KycApplication)
        .filter(models.KycApplication.user_id == user.id)
        .order_by(models.KycApplication.created_at.desc())
        .first()
    )
    kyc_summary = f"{kyc.status} (case {kyc.case_ref})" if kyc else "not started"

    offers = (
        db.query(models.Notification)
        .filter(models.Notification.user_id == user.id, models.Notification.type == "offer")
        .order_by(models.Notification.created_at.desc())
        .limit(5)
        .all()
    )

    acct_summary = "\n".join(
        f"- {a.name} ({a.type}, {a.number_masked}): ${a.balance:,.2f}" for a in accounts
    ) or "no accounts yet"
    goal_summary = "\n".join(
        f"- [id {g.id}] {g.name}: ${g.saved:,.2f} saved of ${g.target:,.2f} target, due {g.due_by}" for g in goals
    ) or "no savings goals yet"
    txn_summary = "\n".join(
        f"- {t.occurred_at.strftime('%b %d')} | {txn_by_account.get(t.account_id, 'Account')} | "
        f"{t.merchant} | {t.category} | {'+' if t.amount >= 0 else ''}${t.amount:,.2f} | {t.status}"
        for t in recent_txns
    ) or "no transactions yet"
    offer_summary = "\n".join(f"- {o.title}: {o.body}" for o in offers) or "no current offers"

    return f"""You are Vantra, the AI banking assistant, speaking to logged-in customer {user.full_name}.
Use the real account data below to answer directly — never say you don't have access to
transaction history, balances, KYC status, or offers, since all of that is provided here.

Accounts:
{acct_summary}

Savings goals:
{goal_summary}

KYC status: {kyc_summary}

Recent transactions (most recent first, up to 8 — for older ones use generate_statement):
{txn_summary}

Current offers:
{offer_summary}

You have tools to actually take action, not just talk — use them whenever the customer asks you
to do something rather than describing how they'd do it themselves. Goal tools use the id listed
next to each goal above — there's no goal-management screen in the app, so use the tools directly
for renames/deletes too. propose_transfer never moves money itself, only stages an approve button
in the app — say so, don't wait for a text reply. schedule_auto_payment/cancel_auto_payment take
effect immediately (no approval step) — confirm amount/payee/frequency first. Document tools show
a download link automatically; don't write out the URL yourself. simulate_test_transactions is for
demo/testing only, when the customer explicitly asks to simulate or showcase activity — it adds
fake transactions and runs real AML/Fraud detection on them. Card freeze/unfreeze has no tool yet
— point the customer to the Cards page. Never reveal full account numbers, only masked/name.

{FORMAT_GUIDANCE}"""


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
    request: Request,
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
    use_tools = context == "account" and user is not None

    if context == "account" and user:
        system_prompt = _account_system_prompt(user, db)
    elif context == "agent_copilot":
        matches = retrieve_policies(db, message)
        system_prompt = AGENT_SYSTEM_PROMPT.format(policy_context=format_context(matches))
    else:
        system_prompt = FAQ_SYSTEM_PROMPT

    # The model's training data doesn't tell it what "today" is, and it will
    # otherwise invent plausible-looking but wrong dates (e.g. a savings-goal
    # deadline in the past) — so ground every context with the real date.
    system_prompt = f"Today's date is {datetime.now(timezone.utc).strftime('%A, %B %d, %Y')}.\n\n{system_prompt}"

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
            if use_tools:
                api_base = str(request.base_url).rstrip("/")
                artifacts: dict[str, list] = {"pending_transfers": [], "documents": []}
                executor = build_executor(session, user, token or "", api_base, artifacts)
                async for chunk in stream_chat_with_tools(messages, system_prompt, ACCOUNT_TOOLS, executor):
                    full_reply += chunk
                    yield chunk

                for doc in artifacts["documents"]:
                    block = f"\n\n📄 [{doc['label']}]({doc['url']})"
                    full_reply += block
                    yield block
                for pt in artifacts["pending_transfers"]:
                    block = "\n\n```vantra:approve-transfer\n" + json.dumps(pt) + "\n```"
                    full_reply += block
                    yield block
            else:
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
