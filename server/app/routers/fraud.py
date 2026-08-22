import re
import secrets
import statistics
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from .. import rules as rules_crud
from ..database import get_db
from ..deps import require_agent
from ..rules import FRAUD_BASE_SEVERITY

router = APIRouter(prefix="/api/fraud", tags=["fraud"])

# "Merchant — City, CC" is the convention seed data and the simulator use for a
# transaction that happened somewhere outside the customer's normal footprint.
# Captures (city, country) so impossible_travel can compare country codes —
# geo_mismatch itself only checks truthiness, so the groups don't affect it.
GEO_MISMATCH_RE = re.compile(r"—\s*([\w\s]+),\s*([A-Z]{2})$")
# Internal money-movement categories aren't retail spend — a large wire is AML's
# job to flag (structuring/velocity), not a "your card looks stolen" signal here.
NON_SPEND_CATEGORIES = ("Transfer", "Transfer Out", "Wire Transfer", "Income")
CASE_LINK_WINDOW_DAYS = 7


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.get("/alerts", response_model=list[schemas.FraudAlertOut])
def list_alerts(_: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    return db.query(models.FraudAlert).order_by(models.FraudAlert.created_at.desc()).all()


@router.post("/alerts/{alert_id}/action", response_model=schemas.FraudAlertOut)
def act_on_alert(alert_id: int, payload: schemas.FraudActionRequest, agent: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    alert = db.get(models.FraudAlert, alert_id)
    if not alert:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found")

    status_map = {"confirm_fraud": "Confirmed", "dismiss": "Dismissed", "escalate": "Escalated"}
    alert.status = status_map[payload.action]
    alert.resolved_by = agent.id
    alert.resolved_at = datetime.now(timezone.utc)
    if payload.notes:
        alert.agent_notes = payload.notes

    if payload.action == "confirm_fraud":
        if alert.user_id:
            db.add(models.Notification(
                user_id=alert.user_id,
                type="security",
                title="We flagged a transaction on your account",
                body=f"A ${alert.amount:,.2f} charge at {alert.merchant} was flagged and confirmed as fraud. We've started a dispute on your behalf.",
                severity="watch",
                action_label="Review",
            ))
        # Feedback loop: this merchant is now known-bad for every customer, not
        # just this one case — the next scan flags it immediately anywhere it appears.
        blocklist_rule = db.query(models.DetectionRule).filter(models.DetectionRule.domain == "fraud", models.DetectionRule.rule_type == "known_bad_merchant").first()
        if blocklist_rule:
            merchants = {m.strip().lower() for m in blocklist_rule.params.get("merchants", "").split(",") if m.strip()}
            if alert.merchant.strip().lower() not in merchants:
                merchants.add(alert.merchant.strip().lower())
                blocklist_rule.params = {**blocklist_rule.params, "merchants": ", ".join(sorted(merchants))}

    db.add(models.AuditLog(
        actor_id=agent.id,
        actor_label=agent.full_name,
        action=f"fraud_{payload.action}",
        target_type="fraud_alert",
        target_id=str(alert.id),
        details=f"{alert.merchant} / ${alert.amount:.2f}" + (f" — {payload.notes}" if payload.notes else ""),
    ))
    db.commit()
    db.refresh(alert)
    return alert


@router.post("/scan", response_model=schemas.FraudScanResult)
async def run_scan(agent: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    created, scanned = await scan_for_fraud(db)

    db.add(models.AuditLog(
        actor_id=agent.id,
        actor_label=agent.full_name,
        action="fraud_scan",
        target_type="fraud_alert",
        target_id="sweep",
        details=f"{len(created)} new alert(s) from {scanned} transactions scanned",
    ))
    db.commit()

    return schemas.FraudScanResult(created=created, scanned_transactions=scanned)


async def scan_for_fraud(db: Session, holder_ids: list[int] | None = None) -> tuple[list[models.FraudAlert], int]:
    """Real rules-based fraud detection over transaction data using the active
    `DetectionRule` rows for domain="fraud": geo-mismatch (merchant tagged with
    a foreign city/country), velocity (card-testing — several transactions
    within minutes), and amount outliers (far above the account's own recent
    average). Scoped to `holder_ids` when given, else every account holder.
    Skips patterns already flagged in the last day."""
    rules = db.query(models.DetectionRule).filter(models.DetectionRule.domain == "fraud", models.DetectionRule.enabled.is_(True)).all()
    by_type = {t: [r for r in rules if r.rule_type == t] for t in rules_crud.RULE_TYPES["fraud"]}
    geo_rules = by_type["geo_mismatch"]
    velocity_rules = by_type["velocity"]
    outlier_rules = by_type["amount_outlier"]

    query = db.query(models.User).filter(models.User.role == "account_holder")
    if holder_ids is not None:
        query = query.filter(models.User.id.in_(holder_ids))
    holders = query.all()
    created: list[models.FraudAlert] = []
    scanned = 0

    for holder in holders:
        accounts = db.query(models.Account).filter(models.Account.user_id == holder.id).all()
        account_ids = [a.id for a in accounts]
        if not account_ids:
            continue
        account_by_id = {a.id: a for a in accounts}
        txns = (
            db.query(models.TransactionRecord)
            .filter(models.TransactionRecord.account_id.in_(account_ids))
            .order_by(models.TransactionRecord.occurred_at.asc())
            .all()
        )
        scanned += len(txns)
        if not txns:
            continue

        # --- Geo-mismatch: merchant tagged with a foreign city/country ---
        for rule in geo_rules:
            risk = rule.params.get("risk", "Critical")
            for t in txns:
                if GEO_MISMATCH_RE.search(t.merchant):
                    alert = await _create_fraud_alert_if_new(
                        db, holder, "geo_mismatch", account_by_id[t.account_id], t, rule.label, risk,
                        f"This transaction's merchant is tagged outside {holder.full_name.split()[0]}'s usual "
                        f"spend footprint, with no prior travel notice on file.",
                    )
                    if alert:
                        created.append(alert)

        # --- Velocity: card-testing — several transactions within minutes ---
        for rule in velocity_rules:
            min_count = rule.params.get("min_count", 4)
            window_minutes = rule.params.get("window_minutes", 10)
            if min_count < 1 or len(txns) < min_count:
                continue
            for i in range(len(txns) - min_count + 1):
                burst = txns[i : i + min_count]
                span_minutes = (_aware(burst[-1].occurred_at) - _aware(burst[0].occurred_at)).total_seconds() / 60
                if span_minutes <= window_minutes:
                    last = burst[-1]
                    alert = await _create_fraud_alert_if_new(
                        db, holder, "velocity", account_by_id[last.account_id], last, f"{rule.label}: {len(burst)} txns/{span_minutes:.0f}min", "High",
                        f"{len(burst)} transactions hit this account within {span_minutes:.1f} minutes — consistent "
                        f"with card-testing or a compromised card number.",
                    )
                    if alert:
                        created.append(alert)
                    break  # one alert per rule per holder per scan is enough signal

        # --- Amount outlier: far above this account's own recent spend average ---
        for rule in outlier_rules:
            multiple = rule.params.get("multiple", 4.0)
            baseline_min_count = rule.params.get("baseline_min_count", 3)
            spend_history: list[float] = []
            for t in txns:
                if t.category in NON_SPEND_CATEGORIES or t.amount >= 0:
                    continue
                if len(spend_history) >= baseline_min_count:
                    baseline = statistics.mean(spend_history)
                    ratio = abs(t.amount) / baseline if baseline > 0 else 0
                    if ratio >= multiple:
                        alert = await _create_fraud_alert_if_new(
                            db, holder, "amount_outlier", account_by_id[t.account_id], t, f"{rule.label} ({ratio:.1f}x)", "Medium" if ratio < multiple * 1.5 else "High",
                            f"Transaction is {ratio:.1f}x this account's recent average purchase size (${baseline:,.2f}).",
                        )
                        if alert:
                            created.append(alert)
                spend_history.append(abs(t.amount))

        # --- Impossible travel: geo-tagged transactions in different countries, too close in time ---
        for rule in by_type["impossible_travel"]:
            max_hours = rule.params.get("max_hours_between_countries", 3)
            geo_txns = [(t, m.group(2)) for t in txns if (m := GEO_MISMATCH_RE.search(t.merchant))]
            for i in range(1, len(geo_txns)):
                t_prev, country_prev = geo_txns[i - 1]
                t_cur, country_cur = geo_txns[i]
                if country_prev == country_cur:
                    continue
                hours = (_aware(t_cur.occurred_at) - _aware(t_prev.occurred_at)).total_seconds() / 3600
                if hours <= max_hours:
                    alert = await _create_fraud_alert_if_new(
                        db, holder, "impossible_travel", account_by_id[t_cur.account_id], t_cur, rule.label, "Critical",
                        f"Transactions in {country_prev} and {country_cur} only {hours:.1f} hours apart — "
                        f"not physically possible to travel between them that fast.",
                    )
                    if alert:
                        created.append(alert)
                    break

        # --- Duplicate charge: same merchant, same amount, close together ---
        for rule in by_type["duplicate_charge"]:
            window_minutes = rule.params.get("window_minutes", 30)
            for i in range(1, len(txns)):
                t_prev, t_cur = txns[i - 1], txns[i]
                if t_prev.merchant != t_cur.merchant or abs(t_prev.amount - t_cur.amount) > 0.01:
                    continue
                minutes = (_aware(t_cur.occurred_at) - _aware(t_prev.occurred_at)).total_seconds() / 60
                if minutes <= window_minutes:
                    alert = await _create_fraud_alert_if_new(
                        db, holder, "duplicate_charge", account_by_id[t_cur.account_id], t_cur, rule.label, "Medium",
                        f"${abs(t_cur.amount):,.2f} charged twice at {t_cur.merchant} within {minutes:.0f} minutes — "
                        f"possible double-charge or replay.",
                    )
                    if alert:
                        created.append(alert)
                    break

        # --- New-beneficiary large transfer: money moving to a payee added very recently ---
        for rule in by_type["new_beneficiary_transfer"]:
            lookback_days = rule.params.get("lookback_days", 3)
            min_amount = rule.params.get("min_amount", 1_000)
            recent_beneficiaries = (
                db.query(models.Beneficiary)
                .filter(models.Beneficiary.user_id == holder.id, models.Beneficiary.created_at >= _now() - timedelta(days=lookback_days))
                .all()
            )
            matched = False
            for b in recent_beneficiaries:
                for t in txns:
                    if t.amount < 0 and abs(t.amount) >= min_amount and b.name.lower() in t.merchant.lower():
                        alert = await _create_fraud_alert_if_new(
                            db, holder, "new_beneficiary_transfer", account_by_id[t.account_id], t, rule.label, "High",
                            f"${abs(t.amount):,.2f} sent to {b.name}, added as a beneficiary only "
                            f"{(_now() - _aware(b.created_at)).days} day(s) ago.",
                        )
                        if alert:
                            created.append(alert)
                        matched = True
                        break
                if matched:
                    break

        # --- Burst to new payees: several first-time transfer destinations in a short window ---
        for rule in by_type["new_payee_burst"]:
            window_hours = rule.params.get("window_hours", 24)
            min_new_payees = rule.params.get("min_new_payees", 3)
            transfer_txns = [t for t in txns if t.amount < 0 and t.category in ("Transfer", "Transfer Out", "Wire Transfer")]
            seen_payees: set[str] = set()
            first_time: list[models.TransactionRecord] = []
            for t in transfer_txns:
                if t.merchant not in seen_payees:
                    first_time.append(t)
                seen_payees.add(t.merchant)
            for i in range(len(first_time) - min_new_payees + 1):
                burst = first_time[i : i + min_new_payees]
                span_hours = (_aware(burst[-1].occurred_at) - _aware(burst[0].occurred_at)).total_seconds() / 3600
                if span_hours <= window_hours:
                    alert = await _create_fraud_alert_if_new(
                        db, holder, "new_payee_burst", account_by_id[burst[-1].account_id], burst[-1], rule.label, "High",
                        f"{len(burst)} transfers to brand-new payees within {span_hours:.1f} hours — "
                        f"consistent with an account takeover moving funds out quickly.",
                    )
                    if alert:
                        created.append(alert)
                    break

        # --- Off-hours anomaly: activity in a time-of-day window this holder has never used before ---
        for rule in by_type["off_hours_anomaly"]:
            quiet_start = rule.params.get("quiet_start_hour", 1)
            quiet_end = rule.params.get("quiet_end_hour", 5)
            seen_quiet_hour = False
            for t in txns:
                hour = _aware(t.occurred_at).hour
                in_quiet_window = quiet_start <= hour <= quiet_end
                if in_quiet_window and not seen_quiet_hour:
                    alert = await _create_fraud_alert_if_new(
                        db, holder, "off_hours_anomaly", account_by_id[t.account_id], t, rule.label, "Low",
                        f"First transaction ever recorded between {quiet_start}:00–{quiet_end}:00 for this account "
                        f"— outside {holder.full_name.split()[0]}'s established activity hours.",
                    )
                    if alert:
                        created.append(alert)
                    break
                if in_quiet_window:
                    seen_quiet_hour = True

        # --- New-category spike: a large first-ever purchase in a category this holder has never used ---
        for rule in by_type["new_category_spike"]:
            min_amount = rule.params.get("min_amount", 1_000)
            seen_categories: set[str] = set()
            for t in txns:
                if t.category not in seen_categories and t.category not in NON_SPEND_CATEGORIES and t.amount < 0 and abs(t.amount) >= min_amount and seen_categories:
                    alert = await _create_fraud_alert_if_new(
                        db, holder, "new_category_spike", account_by_id[t.account_id], t, rule.label, "Medium",
                        f"${abs(t.amount):,.2f} at {t.merchant} is this account's first-ever \"{t.category}\" "
                        f"purchase, and a large one to start with.",
                    )
                    if alert:
                        created.append(alert)
                    break
                seen_categories.add(t.category)

        # --- Known-bad merchant: agent-confirmed fraud merchants, checked for every customer ---
        for rule in by_type["known_bad_merchant"]:
            blocklist = {m.strip().lower() for m in rule.params.get("merchants", "").split(",") if m.strip()}
            if not blocklist:
                continue
            for t in txns:
                if t.merchant.strip().lower() in blocklist:
                    alert = await _create_fraud_alert_if_new(
                        db, holder, "known_bad_merchant", account_by_id[t.account_id], t, rule.label, "Critical",
                        f"{t.merchant} was previously confirmed as fraudulent on another account — "
                        f"any new transaction here is auto-flagged.",
                    )
                    if alert:
                        created.append(alert)
                    break

    db.commit()
    for a in created:
        db.refresh(a)

    return created, scanned


async def _create_fraud_alert_if_new(
    db: Session, holder: models.User, rule_type: str, account: models.Account, txn: models.TransactionRecord,
    rule: str, risk: str, explanation: str,
) -> models.FraudAlert | None:
    existing = (
        db.query(models.FraudAlert)
        .filter(models.FraudAlert.user_id == holder.id, models.FraudAlert.rule == rule, models.FraudAlert.merchant == txn.merchant)
        .filter(models.FraudAlert.created_at >= _now() - timedelta(days=1))
        .first()
    )
    if existing:
        return None

    # Case-linking + composite scoring mirrors aml.py's _create_alert_if_new: any
    # other open alert for this holder within the window joins the same group and
    # everyone's risk_score becomes the sum of distinct rule types stacked so far.
    recent_open = (
        db.query(models.FraudAlert)
        .filter(models.FraudAlert.user_id == holder.id, models.FraudAlert.status == "Open")
        .filter(models.FraudAlert.created_at >= _now() - timedelta(days=CASE_LINK_WINDOW_DAYS))
        .all()
    )
    base_severity = FRAUD_BASE_SEVERITY.get(rule_type, 20)
    if recent_open:
        linked_case_id = next((a.linked_case_id for a in recent_open if a.linked_case_id), None) or f"FR-{secrets.token_hex(3).upper()}"
        group_rule_types = {a.rule_type for a in recent_open if a.rule_type} | {rule_type}
        composite_score = min(100, sum(FRAUD_BASE_SEVERITY.get(rt, 20) for rt in group_rule_types))
    else:
        linked_case_id = None
        composite_score = base_severity

    alert = models.FraudAlert(
        account_masked=account.number_masked,
        user_id=holder.id,
        amount=abs(txn.amount),
        merchant=txn.merchant,
        rule=rule,
        rule_type=rule_type,
        risk=risk,
        risk_score=composite_score,
        linked_case_id=linked_case_id,
        status="Open",
        ai_explanation=explanation,
    )
    db.add(alert)
    if recent_open:
        for prior in recent_open:
            prior.linked_case_id = linked_case_id
            prior.risk_score = composite_score
    return alert


# ---- Rule configuration ----

@router.get("/rules", response_model=list[schemas.DetectionRuleOut])
def list_rules(_: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    return rules_crud.list_rules(db, "fraud")


@router.post("/rules", response_model=schemas.DetectionRuleOut)
def create_rule(payload: schemas.DetectionRuleCreate, agent: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    rule = rules_crud.create_rule(db, "fraud", payload)
    db.add(models.AuditLog(actor_id=agent.id, actor_label=agent.full_name, action="fraud_rule_create", target_type="detection_rule", target_id=str(rule.id), details=rule.label))
    db.commit()
    return rule


@router.patch("/rules/{rule_id}", response_model=schemas.DetectionRuleOut)
def update_rule(rule_id: int, payload: schemas.DetectionRuleUpdate, agent: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    rule = rules_crud.update_rule(db, "fraud", rule_id, payload)
    db.add(models.AuditLog(actor_id=agent.id, actor_label=agent.full_name, action="fraud_rule_update", target_type="detection_rule", target_id=str(rule.id), details=rule.label))
    db.commit()
    return rule


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rule(rule_id: int, agent: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    rules_crud.delete_rule(db, "fraud", rule_id)
    db.add(models.AuditLog(actor_id=agent.id, actor_label=agent.full_name, action="fraud_rule_delete", target_type="detection_rule", target_id=str(rule_id), details=None))
    db.commit()
