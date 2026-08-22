import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from .. import rules as rules_crud
from ..database import get_db
from ..deps import require_agent
from ..llm import structured_completion
from ..rules import AML_BASE_SEVERITY

router = APIRouter(prefix="/api/aml", tags=["aml"])

# Same "Merchant — City, CC" convention as fraud's geo-mismatch check.
COUNTERPARTY_TAG_RE = re.compile(r"—\s*([\w\s]+),\s*([A-Z]{2})$")
CASE_LINK_WINDOW_DAYS = 7  # open alerts for the same holder within this window get merged into one case

SAR_SYSTEM_PROMPT = """You are a bank compliance officer drafting a Suspicious Activity Report
(SAR) narrative for internal review before filing. Given the alert details, write a formal but
concise narrative (3-5 sentences) covering: what pattern was observed, the accounts/entities
involved, the dollar amounts and date range, and which typology it matches. Return ONLY JSON:
{"narrative": string}."""


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.get("/alerts", response_model=list[schemas.AmlAlertOut])
def list_alerts(_: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    return db.query(models.AmlAlert).order_by(models.AmlAlert.created_at.desc()).all()


@router.post("/alerts/{alert_id}/action", response_model=schemas.AmlAlertOut)
async def act_on_alert(alert_id: int, payload: schemas.AmlActionRequest, agent: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    alert = db.get(models.AmlAlert, alert_id)
    if not alert:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found")

    status_map = {"escalate": "Escalated", "file_sar": "SAR Filed", "clear": "Cleared"}
    alert.status = status_map[payload.action]
    if payload.notes:
        alert.agent_notes = payload.notes

    if payload.action == "file_sar":
        try:
            result = await structured_completion(
                SAR_SYSTEM_PROMPT,
                f"Entity: {alert.entity_name}\nPattern: {alert.alert_type}\nVolume: ${alert.volume:,.2f}\n"
                f"Existing analyst notes: {alert.narrative}\nEvidence: {alert.evidence}",
            )
            alert.sar_draft = result.get("narrative")
        except Exception:  # noqa: BLE001
            alert.sar_draft = "Automatic SAR drafting unavailable — please draft manually using the narrative above."

    db.add(models.AuditLog(
        actor_id=agent.id,
        actor_label=agent.full_name,
        action=f"aml_{payload.action}",
        target_type="aml_alert",
        target_id=alert.case_ref,
        details=f"{alert.entity_name} / {alert.alert_type}" + (f" — {payload.notes}" if payload.notes else ""),
    ))
    db.commit()
    db.refresh(alert)
    return alert


@router.post("/scan", response_model=schemas.AmlScanResult)
async def run_scan(agent: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    created, scanned = await scan_for_aml(db)

    db.add(models.AuditLog(
        actor_id=agent.id,
        actor_label=agent.full_name,
        action="aml_scan",
        target_type="aml_alert",
        target_id="sweep",
        details=f"{len(created)} new alert(s) from {scanned} transactions scanned",
    ))
    db.commit()

    return schemas.AmlScanResult(created=created, scanned_transactions=scanned)


async def scan_for_aml(db: Session, holder_ids: list[int] | None = None) -> tuple[list[models.AmlAlert], int]:
    """Runs a real rules-based pass over transaction data using the active
    `DetectionRule` rows for domain="aml": structuring (multiple sub-threshold
    transactions summing past a reporting threshold in a short window) and
    velocity (unusually many transactions in a short window). Creates AmlAlert
    rows for newly-detected patterns; skips ones already flagged. Scoped to
    `holder_ids` when given (e.g. a single account holder just generated test
    activity), otherwise sweeps every account holder."""
    rules = db.query(models.DetectionRule).filter(models.DetectionRule.domain == "aml", models.DetectionRule.enabled.is_(True)).all()
    by_type = {t: [r for r in rules if r.rule_type == t] for t in rules_crud.RULE_TYPES["aml"]}
    structuring_rules = by_type["structuring"]
    velocity_rules = by_type["velocity"]

    query = db.query(models.User).filter(models.User.role == "account_holder")
    if holder_ids is not None:
        query = query.filter(models.User.id.in_(holder_ids))
    holders = query.all()
    created: list[models.AmlAlert] = []
    scanned = 0

    for holder in holders:
        accounts = db.query(models.Account).filter(models.Account.user_id == holder.id).all()
        account_ids = [a.id for a in accounts]
        if not account_ids:
            continue
        txns = (
            db.query(models.TransactionRecord)
            .filter(models.TransactionRecord.account_id.in_(account_ids))
            .filter(models.TransactionRecord.category != "Transfer")
            .order_by(models.TransactionRecord.occurred_at.asc())
            .all()
        )
        scanned += len(txns)
        if len(txns) < 2:
            continue

        for rule in structuring_rules:
            ctr_threshold = rule.params.get("ctr_threshold", 10_000)
            min_leg = rule.params.get("min_leg", 3_000)
            window_days = rule.params.get("window_days", 3)

            window: list[models.TransactionRecord] = []
            for t in txns:
                amt = abs(t.amount)
                if amt < min_leg or amt >= ctr_threshold:
                    continue
                window.append(t)
                window = [w for w in window if (_aware(t.occurred_at) - _aware(w.occurred_at)).days <= window_days]
                total = sum(abs(w.amount) for w in window)
                if total >= ctr_threshold and len(window) >= 2:
                    alert = await _create_alert_if_new(
                        db, holder, "structuring", rule.label, total, window,
                        f"{len(window)} transactions each under the ${ctr_threshold:,} reporting threshold, "
                        f"totaling ${total:,.2f} within {window_days} days.",
                    )
                    if alert:
                        created.append(alert)
                    break  # one alert per rule per holder per scan is enough signal

        for rule in velocity_rules:
            min_count = rule.params.get("min_count", 4)
            window_hours = rule.params.get("window_hours", 24)
            if min_count < 1 or len(txns) < min_count:
                continue

            for i in range(len(txns) - min_count + 1):
                burst = txns[i : i + min_count]
                span_hours = (_aware(burst[-1].occurred_at) - _aware(burst[0].occurred_at)).total_seconds() / 3600
                if span_hours <= window_hours:
                    total = sum(abs(b.amount) for b in burst)
                    alert = await _create_alert_if_new(
                        db, holder, "velocity", rule.label, total, burst,
                        f"{len(burst)} transactions within {span_hours:.1f} hours, totaling ${total:,.2f}.",
                    )
                    if alert:
                        created.append(alert)
                    break  # one alert per rule per holder per scan is enough signal

        for rule in by_type["round_number"]:
            min_amount = rule.params.get("min_amount", 1_000)
            round_to = rule.params.get("round_to", 500) or 500
            for t in txns:
                amt = abs(t.amount)
                if t.category in ("Transfer", "Income") or amt < min_amount:
                    continue
                if abs(round(amt / round_to) * round_to - amt) < 0.01:
                    alert = await _create_alert_if_new(
                        db, holder, "round_number", rule.label, amt, [t],
                        f"${amt:,.2f} at {t.merchant} is a suspiciously round amount for layering purposes.",
                    )
                    if alert:
                        created.append(alert)
                    break

        for rule in by_type["pass_through"]:
            min_amount = rule.params.get("min_amount", 3_000)
            max_hours = rule.params.get("max_hours", 24)
            tolerance_pct = rule.params.get("tolerance_pct", 10)
            matched = False
            for i, t_in in enumerate(txns):
                if t_in.amount < min_amount:
                    continue
                for t_out in txns[i + 1:]:
                    hours = (_aware(t_out.occurred_at) - _aware(t_in.occurred_at)).total_seconds() / 3600
                    if hours > max_hours:
                        break
                    if t_out.amount >= 0:
                        continue
                    if abs(abs(t_out.amount) - t_in.amount) <= (tolerance_pct / 100) * t_in.amount:
                        alert = await _create_alert_if_new(
                            db, holder, "pass_through", rule.label, t_in.amount, [t_in, t_out],
                            f"${t_in.amount:,.2f} in from {t_in.merchant} moved back out to {t_out.merchant} "
                            f"within {hours:.1f} hours — consistent with a pass-through/mule account.",
                        )
                        if alert:
                            created.append(alert)
                        matched = True
                        break
                if matched:
                    break

        for rule in by_type["dormant_reactivation"]:
            dormant_days = rule.params.get("dormant_days", 60)
            min_amount = rule.params.get("min_amount", 2_000)
            for i in range(1, len(txns)):
                gap_days = (_aware(txns[i].occurred_at) - _aware(txns[i - 1].occurred_at)).days
                if gap_days >= dormant_days and abs(txns[i].amount) >= min_amount:
                    alert = await _create_alert_if_new(
                        db, holder, "dormant_reactivation", rule.label, abs(txns[i].amount), [txns[i - 1], txns[i]],
                        f"Account was inactive for {gap_days} days, then moved ${abs(txns[i].amount):,.2f} "
                        f"at {txns[i].merchant} with no intervening activity.",
                    )
                    if alert:
                        created.append(alert)
                    break

        for rule in by_type["velocity_baseline"]:
            multiple = rule.params.get("multiple", 3.0)
            baseline_days = rule.params.get("baseline_days", 90)
            recent_days = rule.params.get("recent_days", 7)
            now = _now()
            baseline_start = now - timedelta(days=baseline_days)
            recent_start = now - timedelta(days=recent_days)
            baseline_period = max(1, baseline_days - recent_days)
            baseline_count = sum(1 for t in txns if baseline_start <= _aware(t.occurred_at) < recent_start)
            recent_count = sum(1 for t in txns if _aware(t.occurred_at) >= recent_start)
            baseline_rate = baseline_count / baseline_period
            recent_rate = recent_count / max(1, recent_days)
            if baseline_count >= 2 and recent_count >= 3 and baseline_rate > 0 and recent_rate >= multiple * baseline_rate:
                recent_txns = [t for t in txns if _aware(t.occurred_at) >= recent_start]
                alert = await _create_alert_if_new(
                    db, holder, "velocity_baseline", rule.label, sum(abs(t.amount) for t in recent_txns), recent_txns,
                    f"{recent_count} transactions in the last {recent_days} days vs. this account's own baseline "
                    f"of ~{baseline_rate:.1f}/day — a {recent_rate / baseline_rate:.1f}x jump from its normal pace.",
                )
                if alert:
                    created.append(alert)

        for rule in by_type["sanctions_match"]:
            high_risk = {c.strip().upper() for c in rule.params.get("high_risk_countries", "").split(",") if c.strip()}
            watchlist = [n.strip().lower() for n in rule.params.get("watchlist_names", "").split(",") if n.strip()]
            for t in txns:
                m = COUNTERPARTY_TAG_RE.search(t.merchant)
                country_hit = m and m.group(2).upper() in high_risk
                name_hit = any(w in t.merchant.lower() for w in watchlist)
                if country_hit or name_hit:
                    reason = f"country code {m.group(2)}" if country_hit else "a watchlisted counterparty name"
                    alert = await _create_alert_if_new(
                        db, holder, "sanctions_match", rule.label, abs(t.amount), [t],
                        f"Transaction with {t.merchant} matches {reason} on the sanctions/high-risk watchlist.",
                    )
                    if alert:
                        created.append(alert)
                    break

    ring_alert = await _scan_for_coordinated_rings(db, by_type["coordinated_structuring"], created)
    if ring_alert:
        created.append(ring_alert)

    db.commit()
    for a in created:
        db.refresh(a)

    return created, scanned


async def _scan_for_coordinated_rings(db: Session, ring_rules: list[models.DetectionRule], created_this_run: list[models.AmlAlert]) -> models.AmlAlert | None:
    """Coordinated smurfing rings rarely share a counterparty in this dataset,
    but multiple *different* holders independently tripping structuring within
    the same short window is itself a strong ring indicator — synchronized
    structuring attempts are a known typology. Fires at most one ring alert
    per scan, deduped like any other alert."""
    if not ring_rules:
        return None
    rule = ring_rules[0]
    window_hours = rule.params.get("ring_window_hours", 48)
    min_holders = rule.params.get("min_holders", 2)

    structuring_alerts = [a for a in created_this_run if a.rule_type == "structuring" and a.user_id]
    distinct_holders = {a.user_id: a for a in structuring_alerts}
    if len(distinct_holders) < min_holders:
        return None

    existing = (
        db.query(models.AmlAlert)
        .filter(models.AmlAlert.rule_type == "coordinated_structuring")
        .filter(models.AmlAlert.created_at >= _now() - timedelta(hours=window_hours))
        .first()
    )
    if existing:
        return None

    holders = [db.get(models.User, uid) for uid in distinct_holders]
    names = ", ".join(h.full_name for h in holders if h)
    total_volume = sum(a.volume for a in distinct_holders.values())
    summary = f"{len(distinct_holders)} unrelated account holders ({names}) each tripped structuring within {window_hours} hours — consistent with a coordinated smurfing ring."

    try:
        result = await structured_completion(
            "You are an AML analyst. Given a coordinated structuring ring detection across multiple accounts, "
            'write a 1-2 sentence narrative. Return ONLY JSON: {"narrative": string}.',
            summary,
        )
        narrative = result.get("narrative", summary)
    except Exception:  # noqa: BLE001
        narrative = summary

    alert = models.AmlAlert(
        entity_name=f"Coordinated ring ({len(distinct_holders)} accounts)",
        user_id=None,
        alert_type=rule.label,
        rule_type="coordinated_structuring",
        volume=total_volume,
        status="Open",
        narrative=narrative,
        evidence={"holder_ids": list(distinct_holders.keys()), "holder_names": [h.full_name for h in holders if h], "linked_case_refs": [a.case_ref for a in distinct_holders.values()]},
        source="scan",
        case_ref=f"ALT-{secrets.token_hex(3).upper()}",
        risk_score=min(100, AML_BASE_SEVERITY["coordinated_structuring"]),
    )
    db.add(alert)
    return alert


async def _create_alert_if_new(
    db: Session, holder: models.User, rule_type: str, alert_type: str, volume: float,
    evidence_txns: list[models.TransactionRecord], summary: str,
):
    existing = (
        db.query(models.AmlAlert)
        .filter(models.AmlAlert.user_id == holder.id, models.AmlAlert.alert_type == alert_type, models.AmlAlert.source == "scan")
        .filter(models.AmlAlert.created_at >= _now() - timedelta(days=1))
        .first()
    )
    if existing:
        return None

    evidence = {
        "transaction_ids": [t.id for t in evidence_txns],
        "merchants": [t.merchant for t in evidence_txns],
        "amounts": [t.amount for t in evidence_txns],
        "dates": [t.occurred_at.isoformat() for t in evidence_txns],
    }

    try:
        result = await structured_completion(
            "You are an AML analyst. Given a detected transaction pattern, write a 1-2 sentence "
            'narrative explaining the risk and which typology it matches. Return ONLY JSON: {"narrative": string}.',
            f"Holder: {holder.full_name}\nPattern: {alert_type}\nDetail: {summary}\nTransactions: {evidence}",
        )
        narrative = result.get("narrative", summary)
    except Exception:  # noqa: BLE001
        narrative = summary

    # Case linking: fold this into an existing open case for the same holder
    # (composite risk instead of N disconnected tickets), and bump both alerts'
    # risk_score to reflect that multiple signals are now stacking.
    recent_open = (
        db.query(models.AmlAlert)
        .filter(models.AmlAlert.user_id == holder.id, models.AmlAlert.status.in_(["Open", "Investigating"]))
        .filter(models.AmlAlert.created_at >= _now() - timedelta(days=CASE_LINK_WINDOW_DAYS))
        .all()
    )
    linked_case_id = recent_open[0].linked_case_id if recent_open and recent_open[0].linked_case_id else (
        recent_open[0].case_ref if recent_open else None
    )
    base_severity = AML_BASE_SEVERITY.get(rule_type, 20)
    group_rule_types = {a.rule_type for a in recent_open if a.rule_type} | {rule_type}
    composite_score = min(100, sum(AML_BASE_SEVERITY.get(rt, 20) for rt in group_rule_types))

    alert = models.AmlAlert(
        entity_name=holder.full_name,
        user_id=holder.id,
        alert_type=alert_type,
        rule_type=rule_type,
        volume=volume,
        status="Open",
        narrative=narrative,
        evidence=evidence,
        source="scan",
        case_ref=f"ALT-{secrets.token_hex(3).upper()}",
        risk_score=composite_score if recent_open else base_severity,
        linked_case_id=linked_case_id,
    )
    db.add(alert)

    if recent_open:
        # Retroactively link + rescore the earlier alert(s) in this case too.
        for prior in recent_open:
            prior.linked_case_id = linked_case_id or prior.case_ref
            prior.risk_score = composite_score
        alert.linked_case_id = linked_case_id or recent_open[0].case_ref

    return alert


# ---- Rule configuration ----

@router.get("/rules", response_model=list[schemas.DetectionRuleOut])
def list_rules(_: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    return rules_crud.list_rules(db, "aml")


@router.post("/rules", response_model=schemas.DetectionRuleOut)
def create_rule(payload: schemas.DetectionRuleCreate, agent: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    rule = rules_crud.create_rule(db, "aml", payload)
    db.add(models.AuditLog(actor_id=agent.id, actor_label=agent.full_name, action="aml_rule_create", target_type="detection_rule", target_id=str(rule.id), details=rule.label))
    db.commit()
    return rule


@router.patch("/rules/{rule_id}", response_model=schemas.DetectionRuleOut)
def update_rule(rule_id: int, payload: schemas.DetectionRuleUpdate, agent: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    rule = rules_crud.update_rule(db, "aml", rule_id, payload)
    db.add(models.AuditLog(actor_id=agent.id, actor_label=agent.full_name, action="aml_rule_update", target_type="detection_rule", target_id=str(rule.id), details=rule.label))
    db.commit()
    return rule


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rule(rule_id: int, agent: models.User = Depends(require_agent), db: Session = Depends(get_db)):
    rules_crud.delete_rule(db, "aml", rule_id)
    db.add(models.AuditLog(actor_id=agent.id, actor_label=agent.full_name, action="aml_rule_delete", target_type="detection_rule", target_id=str(rule_id), details=None))
    db.commit()
