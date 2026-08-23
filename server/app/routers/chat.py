import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import branches as branch_data
from .. import models, schemas
from ..chat_tools import ACCOUNT_TOOLS, FAQ_TOOLS, build_executor, build_faq_executor
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

You have tools for real actions, not just talk: find_nearest_branch shows real branch address/
hours/Google-Maps-link automatically — don't re-type them yourself. propose_appointment_booking
stages a booking form for the customer to fill in — call it as soon as they want to book a visit.
Pre-fill whatever you can already tell from the conversation (name, email, branch, date, time,
reason) as arguments; pass an empty string for anything you don't know rather than asking for it
first — the form itself lets them fill in or fix whatever's missing. check_my_appointments looks up
appointments already booked under an email — use it whenever they ask about an existing booking
(e.g. "what are my upcoming appointments"); ask for their email first if they haven't given it in
this conversation, never guess it or assume "no appointments" without actually calling the tool.
For a reschedule or cancellation request about an appointment they already have, use
reschedule_appointment / cancel_appointment — never propose_appointment_booking, that creates a
brand new appointment instead of changing the one they're asking about, even if they never gave you
a reference number. These need the reference: if you don't already see one in this conversation
(e.g. from an earlier booking confirmation or appointment card), call check_my_appointments with
their email FIRST to find it — ask for their email if you don't have it — then reschedule/cancel.
Only fall back to propose_appointment_booking if check_my_appointments finds no matching
appointment at all.
escalate_to_human opens a real support ticket — use it when they explicitly want a human, or when
their request is genuinely outside what you can do unauthenticated; you'll need their email first.

Customer care line: {branch_data.CUSTOMER_CARE_NUMBER} ({branch_data.CUSTOMER_CARE_HOURS}). Give
this out when a human wants to call instead of chat, when escalating, or when you can't resolve
something and there's no better next step — not on every message.

{FORMAT_GUIDANCE}"""

def _agent_system_prompt(agent: models.User, db: Session, policy_context: str) -> str:
    """Grounds the copilot in the agent's real queues — without this it can only
    search the policy library, so "summarize my AML cases" or "what's pending
    today" had nothing to answer from and returned a canned non-answer."""
    aml_open = (
        db.query(models.AmlAlert)
        .filter(models.AmlAlert.status.in_(["Open", "Investigating"]))
        .order_by(models.AmlAlert.risk_score.desc(), models.AmlAlert.created_at.desc())
        .all()
    )
    fraud_open = db.query(models.FraudAlert).filter(models.FraudAlert.status == "Open").order_by(models.FraudAlert.risk_score.desc(), models.FraudAlert.created_at.desc()).all()
    kyc_pending = db.query(models.KycApplication).filter(models.KycApplication.status.in_(["pending", "needs_info"])).count()
    cases_open = db.query(models.CaseTicket).filter(models.CaseTicket.status == "Needs Review").all()
    underwriting_pending = db.query(models.UnderwritingApplication).filter(models.UnderwritingApplication.status == "Pending").all()

    aml_summary = "\n".join(
        f"- [{a.case_ref}] {a.entity_name}: {a.alert_type}, ${a.volume:,.2f}, risk {a.risk_score}"
        + (f", linked to case {a.linked_case_id}" if a.linked_case_id and a.linked_case_id != a.case_ref else "")
        for a in aml_open[:8]
    ) or "none open"
    fraud_summary = "\n".join(
        f"- {f.account_masked}: {f.rule}, ${f.amount:,.2f}, risk {f.risk} (score {f.risk_score})"
        + (f", linked to case {f.linked_case_id}" if f.linked_case_id else "")
        for f in fraud_open[:8]
    ) or "none open"
    cases_summary = "\n".join(f"- [{c.id}] {c.subject} ({c.department or 'unrouted'})" for c in cases_open[:5]) or "none open"
    underwriting_summary = "\n".join(
        f"- {u.applicant_name}: {u.loan_type}, ${u.amount:,.2f}, grade {u.grade or '—'}" for u in underwriting_pending[:5]
    ) or "none pending"

    return f"""You are Vantra Copilot, an internal AI assistant for Vantra Bank
employees (compliance, fraud ops, credit risk, support), speaking to {agent.full_name}
({agent.department or 'Compliance'}). Use the real queue data below to answer directly —
never say you don't have visibility into cases, alerts, or pending work, since it's all here.

Open AML alerts ({len(aml_open)} total, highest risk first):
{aml_summary}

Open Fraud alerts ({len(fraud_open)} total):
{fraud_summary}

KYC applications pending review: {kyc_pending}

Open support cases ({len(cases_open)} total):
{cases_summary}

Underwriting applications pending ({len(underwriting_pending)} total):
{underwriting_summary}

For policy/regulatory questions, use the retrieved excerpt below and cite the policy title.
If the retrieved text doesn't actually answer the question, say so plainly instead of guessing.

{FORMAT_GUIDANCE}

--- RETRIEVED POLICY CONTEXT ---
{policy_context}
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
    use_tools = (context == "account" and user is not None) or context == "faq"

    if context == "account" and user:
        system_prompt = _account_system_prompt(user, db)
    elif context == "agent_copilot" and user:
        matches = retrieve_policies(db, message)
        system_prompt = _agent_system_prompt(user, db, format_context(matches))
    elif context == "agent_copilot":
        matches = retrieve_policies(db, message)
        system_prompt = (
            "You are Vantra Copilot. The agent isn't authenticated, so you can only answer from "
            f"the policy library below, not live queues.\n\n{FORMAT_GUIDANCE}\n\n"
            f"--- RETRIEVED POLICY CONTEXT ---\n{format_context(matches)}\n--- END CONTEXT ---"
        )
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
            if use_tools and context == "account":
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
            elif use_tools:  # context == "faq"
                faq_artifacts: dict[str, object] = {"branches": [], "appointment_form": None, "appointments": []}
                # The escalate_to_human tool needs the real conversation, not
                # just the one-line summary the model chooses to write — an
                # agent picking up the resulting ticket should see everything
                # the customer already said, not a paraphrase.
                executor = build_faq_executor(session, messages, faq_artifacts)
                async for chunk in stream_chat_with_tools(messages, system_prompt, FAQ_TOOLS, executor):
                    full_reply += chunk
                    yield chunk

                if faq_artifacts["branches"]:
                    block = "\n\n```vantra:branches\n" + json.dumps(faq_artifacts["branches"]) + "\n```"
                    full_reply += block
                    yield block
                if faq_artifacts["appointment_form"]:
                    block = "\n\n```vantra:appointment-form\n" + json.dumps(faq_artifacts["appointment_form"]) + "\n```"
                    full_reply += block
                    yield block
                if faq_artifacts["appointments"]:
                    block = "\n\n```vantra:appointments\n" + json.dumps(faq_artifacts["appointments"]) + "\n```"
                    full_reply += block
                    yield block
            else:
                async for chunk in stream_chat(messages, system_prompt):
                    full_reply += chunk
                    yield chunk

            assistant_message = models.ChatMessage(user_id=user_id, session_key=session_key, context=context, role="assistant", content=full_reply)
            session.add(assistant_message)
            session.commit()
            session.refresh(assistant_message)
            # A trailing metadata block, same pattern as the artifact blocks
            # above — gives the frontend the real row id so feedback
            # (thumbs up/down) attaches to an actual message, not a guess.
            meta_block = "\n\n```vantra:message-meta\n" + json.dumps({"message_id": assistant_message.id}) + "\n```"
            yield meta_block
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


@router.post("/messages/{message_id}/feedback", response_model=schemas.ChatMessageOut)
def submit_feedback(message_id: int, payload: schemas.MessageFeedbackRequest, db: Session = Depends(get_db)):
    """Thumbs up/down on an assistant reply. Unauthenticated (the public FAQ
    assistant has no login), so this is intentionally not scoped to a user —
    anyone holding a real message id from their own session can rate it."""
    message = db.get(models.ChatMessage, message_id)
    if not message or message.role != "assistant":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    message.feedback = payload.feedback
    db.commit()
    db.refresh(message)
    return message
