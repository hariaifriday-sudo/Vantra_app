"""Tool (function-calling) definitions the account-holder chat assistant can
invoke, plus the executor that bridges a tool call to app/actions.py. Kept
separate from routers/chat.py to keep the schema list and the wiring readable."""
from typing import Any

from sqlalchemy.orm import Session

from . import actions, branches as branch_data, models
from .actions import ActionError

def _tool(name: str, description: str, properties: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {"type": "object", "properties": properties, "required": required or []},
        },
    }


# Kept deliberately terse: every token here is paid on every tool-decision call,
# and this account's Groq key has a tight per-minute token budget. Behavioral
# nuance (approval flow, "don't guess dates", etc.) lives in the system prompt
# instead of being repeated per-tool.
ACCOUNT_TOOLS: list[dict[str, Any]] = [
    _tool(
        "calculate_savings_plan", "Exact monthly contribution needed to hit a savings target by a deadline.",
        {
            "target_amount": {"type": "number"},
            "months": {"type": "integer"},
            "already_saved": {"type": "number", "description": "default 0"},
        },
        ["target_amount", "months"],
    ),
    _tool(
        "create_savings_goal", "Creates a new savings goal.",
        {
            "name": {"type": "string"},
            "target_amount": {"type": "number"},
            "already_saved": {"type": "number", "description": "default 0"},
            "months": {"type": "integer", "description": "deadline, N months from today"},
            "due_by": {"type": "string", "description": "only if months omitted, e.g. 'Ongoing'"},
        },
        ["name", "target_amount"],
    ),
    _tool(
        "update_savings_goal", "Updates an existing goal (rename/target/saved/deadline). goal_id comes from the Savings goals list.",
        {
            "goal_id": {"type": "integer"},
            "name": {"type": "string"},
            "target_amount": {"type": "number"},
            "saved": {"type": "number"},
            "months": {"type": "integer", "description": "new deadline, N months from today"},
            "due_by": {"type": "string"},
        },
        ["goal_id"],
    ),
    _tool("delete_savings_goal", "Permanently deletes a savings goal by id.", {"goal_id": {"type": "integer"}}, ["goal_id"]),
    _tool("list_beneficiaries", "Lists the customer's saved transfer beneficiaries.", {}),
    _tool(
        "propose_transfer", "Stages a transfer for the customer's approval — does not move money by itself.",
        {
            "beneficiary_name": {"type": "string"},
            "amount": {"type": "number"},
            "from_account": {"type": "string", "description": "omit for primary account"},
            "note": {"type": "string"},
        },
        ["beneficiary_name", "amount"],
    ),
    _tool(
        "schedule_auto_payment", "Creates a recurring payment. Takes effect immediately, no approval step.",
        {
            "beneficiary_name": {"type": "string"},
            "amount": {"type": "number"},
            "frequency": {"type": "string", "enum": ["weekly", "monthly"]},
            "from_account": {"type": "string", "description": "omit for primary account"},
        },
        ["beneficiary_name", "amount", "frequency"],
    ),
    _tool("list_auto_payments", "Lists active scheduled/auto payments.", {}),
    _tool("cancel_auto_payment", "Cancels a scheduled payment by id (from list_auto_payments).", {"payment_id": {"type": "integer"}}, ["payment_id"]),
    _tool(
        "generate_statement", "PDF account statement; a download link is shown to the customer automatically.",
        {
            "account": {"type": "string", "description": "e.g. 'checking'; omit for primary account"},
            "period": {"type": "string", "enum": ["last_30_days", "last_3_months", "last_6_months", "ytd", "last_year"]},
        },
    ),
    _tool("generate_interest_certificate", "PDF interest certificate for savings; download link shown automatically.", {"year": {"type": "integer", "description": "defaults to current year"}}),
    _tool("generate_tax_certificate", "PDF tax/interest-income certificate; download link shown automatically.", {"year": {"type": "integer", "description": "defaults to current year"}}),
    _tool(
        "simulate_test_transactions",
        "DEMO/TESTING ONLY: generates realistic fake transactions on the customer's account for a "
        "showcase scenario, then runs real AML/Fraud detection so any resulting alert appears for "
        "agents immediately. Only call this when the customer explicitly asks to simulate, test, or "
        "demo transaction activity — never for a real transfer/spending request.",
        {"scenario": {"type": "string", "enum": ["regular", "aml", "fraud"], "description": "regular = normal spending, no alerts expected; aml = structuring or rapid-transfer pattern; fraud = geo-mismatch, card-testing velocity, or amount outlier"}},
        ["scenario"],
    ),
]


def _account_out(a: models.Account) -> dict:
    return {"id": a.id, "name": a.name, "type": a.type, "balance": round(a.balance, 2)}


def _goal_out(g: models.SavingsGoal) -> dict:
    return {"id": g.id, "name": g.name, "target": g.target, "saved": g.saved, "due_by": g.due_by}


def _beneficiary_out(b: models.Beneficiary) -> dict:
    return {"id": b.id, "name": b.name, "account_ref": b.account_ref, "bank_name": b.bank_name}


def _payment_out(p: models.ScheduledPayment) -> dict:
    return {"id": p.id, "to": p.to_label, "amount": p.amount, "frequency": p.frequency, "next_run_date": p.next_run_date.strftime("%b %d, %Y")}


def build_executor(db: Session, user: models.User, token: str, api_base: str, artifacts: dict[str, list]):
    """Returns an async (name, args) -> dict function. Side effects that need a
    deterministic, non-hallucinated UI element (approval cards, download links)
    are recorded into `artifacts` for routers/chat.py to render after the model's
    natural-language reply, rather than trusting the model to reproduce them."""

    async def execute(name: str, args: dict[str, Any]) -> dict:
        try:
            if name == "calculate_savings_plan":
                return actions.calculate_savings_plan(
                    float(args["target_amount"]), int(args["months"]), float(args.get("already_saved", 0) or 0)
                )

            if name == "create_savings_goal":
                goal = actions.create_savings_goal(
                    db, user, args["name"], float(args["target_amount"]),
                    float(args.get("already_saved", 0) or 0), args.get("due_by") or "Ongoing",
                    months=int(args["months"]) if args.get("months") else None,
                )
                artifacts["goals_changed"] = True
                return {"status": "created", "goal": _goal_out(goal)}

            if name == "update_savings_goal":
                goal = actions.update_savings_goal(
                    db, user, int(args["goal_id"]), args.get("name"),
                    float(args["target_amount"]) if args.get("target_amount") is not None else None,
                    float(args["saved"]) if args.get("saved") is not None else None,
                    args.get("due_by"), int(args["months"]) if args.get("months") else None,
                )
                artifacts["goals_changed"] = True
                return {"status": "updated", "goal": _goal_out(goal)}

            if name == "delete_savings_goal":
                actions.delete_savings_goal(db, user, int(args["goal_id"]))
                artifacts["goals_changed"] = True
                return {"status": "deleted", "goal_id": int(args["goal_id"])}

            if name == "list_beneficiaries":
                return {"beneficiaries": [_beneficiary_out(b) for b in actions.list_beneficiaries(db, user)]}

            if name == "propose_transfer":
                pending = actions.propose_transfer(
                    db, user, args["beneficiary_name"], float(args["amount"]),
                    args.get("from_account"), args.get("note"),
                )
                account = db.get(models.Account, pending.from_account_id)
                artifacts["pending_transfers"].append({
                    "pending_transfer_id": pending.id,
                    "to": pending.to_label,
                    "amount": pending.amount,
                    "from_account": account.name,
                })
                return {
                    "status": "awaiting_approval",
                    "to": pending.to_label,
                    "amount": pending.amount,
                    "from_account": account.name,
                    "note": "No money has moved yet. An approve/reject action will be shown to the customer automatically — tell them what you prepared and that it needs their approval, but do not ask them to reply 'yes'.",
                }

            if name == "schedule_auto_payment":
                payment = actions.schedule_auto_payment(
                    db, user, args["beneficiary_name"], float(args["amount"]),
                    args.get("frequency", "monthly"), args.get("from_account"),
                )
                artifacts["auto_payments_changed"] = True
                return {"status": "scheduled", **_payment_out(payment)}

            if name == "list_auto_payments":
                actions.process_due_scheduled_payments(db, user)
                return {"auto_payments": [_payment_out(p) for p in actions.list_auto_payments(db, user)]}

            if name == "cancel_auto_payment":
                payment = actions.cancel_auto_payment(db, user, int(args["payment_id"]))
                artifacts["auto_payments_changed"] = True
                return {"status": "cancelled", "id": payment.id}

            if name == "generate_statement":
                # Validated eagerly so a bad account/period surfaces as a normal
                # tool error the model can relay, instead of a dead link.
                actions.resolve_account(db, user, args.get("account"))
                url = (
                    f"{api_base}/api/documents/statement?token={token}&period={args.get('period', 'last_30_days')}"
                    + (f"&account={args['account']}" if args.get("account") else "")
                )
                artifacts["documents"].append({"label": "Download statement (PDF)", "url": url})
                return {"status": "ready", "note": "The download link will be shown to the customer automatically."}

            if name == "generate_interest_certificate":
                url = f"{api_base}/api/documents/interest-certificate?token={token}" + (f"&year={args['year']}" if args.get("year") else "")
                artifacts["documents"].append({"label": "Download interest certificate (PDF)", "url": url})
                return {"status": "ready", "note": "The download link will be shown to the customer automatically."}

            if name == "generate_tax_certificate":
                url = f"{api_base}/api/documents/tax-certificate?token={token}" + (f"&year={args['year']}" if args.get("year") else "")
                artifacts["documents"].append({"label": "Download tax certificate (PDF)", "url": url})
                return {"status": "ready", "note": "The download link will be shown to the customer automatically."}

            if name == "simulate_test_transactions":
                return await actions.simulate_transactions(db, user, args["scenario"])

            return {"error": f"Unknown tool '{name}'"}
        except ActionError as exc:
            return {"error": str(exc)}
        except (KeyError, TypeError, ValueError) as exc:
            return {"error": f"Invalid arguments: {exc}"}

    return execute


# ---- Public FAQ assistant tools (unauthenticated — no account/user data) ----

FAQ_TOOLS: list[dict[str, Any]] = [
    _tool(
        "find_nearest_branch",
        "Finds Vantra branch locations, with address, phone, hours, and a Google Maps link. "
        "Call whenever the customer asks about a branch, ATM, or wants to visit in person.",
        {"location": {"type": "string", "description": "city, neighborhood, or zip the customer mentioned; omit to list all branches"}},
    ),
    _tool(
        "propose_appointment_booking",
        "Stages a NEW appointment-booking form, pre-filled with anything you can already tell from the "
        "conversation — does not book anything by itself. Call only when the customer wants to book a "
        "brand new branch visit that doesn't exist yet. Do NOT call this to change the date/time of an "
        "appointment they already booked (e.g. \"reschedule\", \"move my appointment\", \"change the "
        "time\") — that is reschedule_appointment instead, which updates the existing one instead of "
        "creating a duplicate. Pass an empty string for any field you don't know; never guess. The form "
        "itself lets them fill in or correct whatever you didn't pre-fill.",
        {
            "name": {"type": "string", "description": "customer's name if they've given it; empty string otherwise"},
            "email": {"type": "string", "description": "customer's email if they've given it; empty string otherwise"},
            "branch_name": {"type": "string", "description": "exact branch name if mentioned or implied (e.g. by a city already discussed); empty string otherwise"},
            "preferred_date": {"type": "string", "description": "YYYY-MM-DD if mentioned/inferable from today's date; empty string otherwise"},
            "preferred_time": {"type": "string", "description": "one of: 9:00 AM, 10:00 AM, 11:00 AM, 1:00 PM, 2:00 PM, 3:00 PM, 4:00 PM — closest match to what they said; empty string otherwise"},
            "reason": {"type": "string", "description": "why they're visiting, if mentioned or clearly implied by the conversation; empty string otherwise"},
        },
        ["name", "email", "branch_name", "preferred_date", "preferred_time", "reason"],
    ),
    _tool(
        "escalate_to_human",
        "Opens a support ticket for a human agent to follow up by email. Call when the customer "
        "explicitly asks to talk to a person, or when their issue is outside what you can resolve "
        "in chat (e.g. a specific account action while not logged in).",
        {"email": {"type": "string"}, "message": {"type": "string", "description": "summary of what they need help with"}},
        ["email", "message"],
    ),
    _tool(
        "check_my_appointments",
        "Looks up branch appointments already booked under an email address (via "
        "propose_appointment_booking, in this chat or an earlier one) — not a login, just a lookup "
        "by the email the customer gives you. Call whenever they ask about an appointment they "
        "already booked, e.g. \"what are my upcoming appointments\". If they haven't given you an "
        "email yet in this conversation, ask for it first rather than guessing.",
        {"email": {"type": "string"}},
        ["email"],
    ),
    _tool(
        "reschedule_appointment",
        "Changes the date and/or time of an appointment the customer already booked. Updates the "
        "existing appointment in place — does NOT create a new one, so never call "
        "propose_appointment_booking for a reschedule request. Requires the reference (e.g. "
        "'APT-7DAC1F') from an earlier check_my_appointments call or booking confirmation in this "
        "conversation; if you don't have it, call check_my_appointments first.",
        {
            "reference": {"type": "string"},
            "preferred_date": {"type": "string", "description": "YYYY-MM-DD; empty string to leave unchanged"},
            "preferred_time": {"type": "string", "description": "one of: 9:00 AM, 10:00 AM, 11:00 AM, 1:00 PM, 2:00 PM, 3:00 PM, 4:00 PM; empty string to leave unchanged"},
        },
        ["reference"],
    ),
    _tool(
        "cancel_appointment",
        "Cancels an appointment the customer already booked. Requires the reference (e.g. "
        "'APT-7DAC1F') from an earlier check_my_appointments call or booking confirmation in this "
        "conversation; if you don't have it, call check_my_appointments first.",
        {"reference": {"type": "string"}},
        ["reference"],
    ),
]


def _format_transcript(messages: list[dict[str, str]]) -> str:
    speaker = {"user": "Customer", "assistant": "Vantra"}
    lines = [f"{speaker.get(m['role'], m['role'])}: {m['content']}" for m in messages if m.get("content")]
    return "\n".join(lines)


def build_faq_executor(db: Session, messages: list[dict[str, str]], artifacts: dict[str, list]):
    """Same artifact-recording pattern as build_executor above, but for the
    unauthenticated public assistant — no user/account context available.
    `messages` is the same role/content history handed to the model, so
    escalate_to_human can attach the real conversation, not just the
    one-line summary the model writes."""

    async def execute(name: str, args: dict[str, Any]) -> dict:
        try:
            if name == "find_nearest_branch":
                results = branch_data.find_branches(args.get("location"))
                artifacts["branches"] = results
                return {"branches": results, "note": "Branch details are shown to the customer automatically — don't re-type the address or link."}

            if name == "propose_appointment_booking":
                valid_times = {"9:00 AM", "10:00 AM", "11:00 AM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"}
                preferred_time = args.get("preferred_time") or ""
                # Match loosely against the real branch list — the model may say
                # "the Austin branch" rather than the exact "Vantra Riverside"
                # name, and the <select> on the frontend needs an exact value
                # to pre-select correctly.
                branch_guess = (args.get("branch_name") or "").strip().lower()
                matched_branch = next(
                    (b["name"] for b in branch_data.BRANCHES if branch_guess and (branch_guess in b["name"].lower() or branch_guess in b["city"].lower())),
                    branch_data.BRANCHES[0]["name"],
                )
                artifacts["appointment_form"] = {
                    "name": args.get("name") or "",
                    "email": args.get("email") or "",
                    "branch_name": matched_branch,
                    "preferred_date": args.get("preferred_date") or "",
                    "preferred_time": preferred_time if preferred_time in valid_times else "",
                    "reason": args.get("reason") or "",
                }
                return {"status": "form_shown", "note": "A pre-filled booking form has been shown to the customer — tell them what you filled in and to confirm/complete the rest, don't ask them to re-type it in chat."}

            if name == "escalate_to_human":
                transcript = _format_transcript(messages)
                body = f"Summary: {args['message']}\n\n--- Full conversation ---\n{transcript}" if transcript else args["message"]
                ticket = models.CaseTicket(
                    sender_email=args["email"],
                    subject="FAQ assistant escalation",
                    body=body,
                    department="General Support",
                    status="Needs Review",
                )
                db.add(ticket)
                db.commit()
                db.refresh(ticket)
                return {
                    "status": "escalated",
                    "ticket_id": ticket.id,
                    "customer_care_number": branch_data.CUSTOMER_CARE_NUMBER,
                    "note": f"Tell the customer a support agent will email them at {args['email']}, and mention they can also call {branch_data.CUSTOMER_CARE_NUMBER} ({branch_data.CUSTOMER_CARE_HOURS}) for anything urgent.",
                }

            if name == "check_my_appointments":
                rows = (
                    db.query(models.BranchAppointment)
                    .filter(models.BranchAppointment.email == args["email"])
                    .order_by(models.BranchAppointment.created_at.desc())
                    .all()
                )
                results = [
                    {
                        "reference": r.reference,
                        "branch_name": r.branch_name,
                        "preferred_date": r.preferred_date,
                        "preferred_time": r.preferred_time,
                        "status": r.status,
                    }
                    for r in rows
                ]
                artifacts["appointments"] = results
                if not results:
                    return {"appointments": [], "note": f"No appointments found for {args['email']} — tell the customer plainly, don't invent one."}
                return {"appointments": results, "note": "The customer's appointments are shown to them automatically — don't re-list the details in text, just acknowledge them."}

            if name == "reschedule_appointment":
                appt = (
                    db.query(models.BranchAppointment)
                    .filter(models.BranchAppointment.reference == args["reference"])
                    .first()
                )
                if not appt:
                    return {"error": f"No appointment found with reference {args['reference']}."}
                valid_times = {"9:00 AM", "10:00 AM", "11:00 AM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"}
                new_date = (args.get("preferred_date") or "").strip()
                new_time = (args.get("preferred_time") or "").strip()
                if new_date:
                    appt.preferred_date = new_date
                if new_time and new_time in valid_times:
                    appt.preferred_time = new_time
                db.commit()
                db.refresh(appt)
                result = {
                    "reference": appt.reference,
                    "branch_name": appt.branch_name,
                    "preferred_date": appt.preferred_date,
                    "preferred_time": appt.preferred_time,
                    "status": appt.status,
                }
                artifacts["appointments"] = [result]
                return {"status": "rescheduled", "appointment": result, "note": "The updated appointment is shown to the customer automatically — don't re-list the details in text, just confirm it's rescheduled."}

            if name == "cancel_appointment":
                appt = (
                    db.query(models.BranchAppointment)
                    .filter(models.BranchAppointment.reference == args["reference"])
                    .first()
                )
                if not appt:
                    return {"error": f"No appointment found with reference {args['reference']}."}
                appt.status = "Cancelled"
                db.commit()
                db.refresh(appt)
                result = {
                    "reference": appt.reference,
                    "branch_name": appt.branch_name,
                    "preferred_date": appt.preferred_date,
                    "preferred_time": appt.preferred_time,
                    "status": appt.status,
                }
                artifacts["appointments"] = [result]
                return {"status": "cancelled", "appointment": result, "note": "The cancelled appointment is shown to the customer automatically — don't re-list the details in text, just confirm it's cancelled."}

            return {"error": f"Unknown tool '{name}'"}
        except (KeyError, TypeError, ValueError) as exc:
            return {"error": f"Invalid arguments: {exc}"}

    return execute
