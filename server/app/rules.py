"""Shared CRUD for AML/Fraud detection rules, used by both routers/aml.py and
routers/fraud.py so the "view/add/edit/delete rules" behavior is identical
across the two Configuration panels."""
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from . import models, schemas

RULE_TYPES: dict[str, dict[str, dict]] = {
    "aml": {
        "structuring": {"ctr_threshold": 10_000, "min_leg": 3_000, "window_days": 3},
        "velocity": {"min_count": 4, "window_hours": 24},
        "round_number": {"min_amount": 1_000, "round_to": 500},
        "pass_through": {"min_amount": 3_000, "max_hours": 24, "tolerance_pct": 10},
        "dormant_reactivation": {"dormant_days": 60, "min_amount": 2_000},
        "velocity_baseline": {"multiple": 3.0, "baseline_days": 90, "recent_days": 7},
        "sanctions_match": {"high_risk_countries": "IR,KP,SY,CU,RU", "watchlist_names": ""},
        "coordinated_structuring": {"ring_window_hours": 48, "min_holders": 2},
    },
    "fraud": {
        "geo_mismatch": {"risk": "Critical"},
        "velocity": {"min_count": 4, "window_minutes": 10},
        "amount_outlier": {"multiple": 4.0, "baseline_min_count": 3},
        "impossible_travel": {"max_hours_between_countries": 3},
        "duplicate_charge": {"window_minutes": 30},
        "new_beneficiary_transfer": {"lookback_days": 3, "min_amount": 1_000},
        "new_payee_burst": {"window_hours": 24, "min_new_payees": 3},
        "off_hours_anomaly": {"quiet_start_hour": 1, "quiet_end_hour": 5},
        "new_category_spike": {"min_amount": 1_000},
        "known_bad_merchant": {"merchants": ""},  # auto-populated when an agent confirms fraud — see fraud.py act_on_alert
    },
}

# Base severity contribution per rule_type, used to build each alert's
# composite risk_score alongside signal-stacking (multiple open alerts for the
# same holder push the score higher — see _create_alert_if_new in aml.py/fraud.py).
AML_BASE_SEVERITY: dict[str, int] = {
    "structuring": 40,
    "velocity": 30,
    "round_number": 15,
    "pass_through": 35,
    "dormant_reactivation": 25,
    "velocity_baseline": 25,
    "sanctions_match": 60,
    "coordinated_structuring": 70,
}

FRAUD_BASE_SEVERITY: dict[str, int] = {
    "geo_mismatch": 50,
    "velocity": 45,
    "amount_outlier": 30,
    "impossible_travel": 65,
    "duplicate_charge": 25,
    "new_beneficiary_transfer": 40,
    "new_payee_burst": 45,
    "off_hours_anomaly": 20,
    "new_category_spike": 25,
    "known_bad_merchant": 75,
}


def list_rules(db: Session, domain: str) -> list[models.DetectionRule]:
    return db.query(models.DetectionRule).filter(models.DetectionRule.domain == domain).order_by(models.DetectionRule.rule_type, models.DetectionRule.id).all()


def create_rule(db: Session, domain: str, payload: schemas.DetectionRuleCreate) -> models.DetectionRule:
    valid_types = RULE_TYPES.get(domain, {})
    if payload.rule_type not in valid_types:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"rule_type must be one of: {', '.join(valid_types)}")

    params = {**valid_types[payload.rule_type], **payload.params}
    rule = models.DetectionRule(domain=domain, rule_type=payload.rule_type, label=payload.label.strip() or payload.rule_type, params=params, enabled=payload.enabled)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


def update_rule(db: Session, domain: str, rule_id: int, payload: schemas.DetectionRuleUpdate) -> models.DetectionRule:
    rule = db.get(models.DetectionRule, rule_id)
    if not rule or rule.domain != domain:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rule not found")

    if payload.label is not None:
        rule.label = payload.label.strip() or rule.label
    if payload.params is not None:
        rule.params = {**rule.params, **payload.params}
    if payload.enabled is not None:
        rule.enabled = payload.enabled
    db.commit()
    db.refresh(rule)
    return rule


def delete_rule(db: Session, domain: str, rule_id: int) -> None:
    rule = db.get(models.DetectionRule, rule_id)
    if not rule or rule.domain != domain:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rule not found")
    if rule.is_default:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Default rules can't be deleted — disable them instead.")
    db.delete(rule)
    db.commit()
