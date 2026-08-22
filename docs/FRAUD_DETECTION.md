# Fraud Detection

The same real, configurable rules-engine architecture as [AML
detection](AML_DETECTION.md), built in parallel and scanning the same
transaction data for a different family of patterns. Ten rule types,
composite risk scoring, case-linking, and a feedback loop where a confirmed
fraud merchant gets auto-blocklisted for every future customer.

## Where to find it

- Agent page: `/agent/fraud` — `src/pages/agent/Fraud.tsx`
- Config panel: `src/components/agent/RuleConfigPanel.tsx` (`domain="fraud"`)
- Backend: `server/app/routers/fraud.py`
- Shared rule engine plumbing: `server/app/rules.py` (`RULE_TYPES["fraud"]`,
  `FRAUD_BASE_SEVERITY`)
- Data model: `FraudAlert`, `DetectionRule` in `server/app/models.py`

## The ten rule types

| Rule type | What it catches | Base severity |
|---|---|---|
| `geo_mismatch` | Merchant tagged with a city/country outside the holder's usual footprint | 50 |
| `velocity` | Card-testing — several transactions in a short window | 45 |
| `amount_outlier` | A purchase far above the account's own recent average | 30 |
| `impossible_travel` | Geo-tagged transactions in two different countries too close in time to be physically possible | 65 |
| `duplicate_charge` | Same merchant, same amount, charged twice within minutes (double-charge/replay) | 25 |
| `new_beneficiary_transfer` | A large transfer to a beneficiary added very recently | 40 |
| `new_payee_burst` | Several first-time transfer destinations in a short window (account-takeover pattern) | 45 |
| `off_hours_anomaly` | Activity in a time-of-day window this holder has never used before | 20 |
| `new_category_spike` | A large first-ever purchase in a spending category this holder has never used | 25 |
| `known_bad_merchant` | A merchant previously confirmed as fraudulent — see the feedback loop below | 75 |

Same as AML: every parameter is live-editable from **Configuration**, no
code change or restart needed.

## Composite risk scoring + case linking

Identical mechanism to AML (`_create_fraud_alert_if_new` in `fraud.py`):
alerts for the same holder within a 7-day window share a `linked_case_id`
and a `risk_score` that's the sum of `FRAUD_BASE_SEVERITY` across every
distinct rule type in the group (capped at 100), retroactively re-scoring
existing alerts in the group as new ones join.

## The known-bad-merchant feedback loop

This is the one rule type unique to Fraud. When an agent confirms an alert
as fraud (**Confirm Fraud & Notify Customer**), `act_on_alert` appends that
merchant's name to the `known_bad_merchant` rule's merchant list
(`DetectionRule.params["merchants"]`, a plain CSV string). On every
subsequent sweep, any transaction anywhere in the system at a blocklisted
merchant is auto-flagged — the system learns from confirmed fraud in real
time, across every customer, not just the one case that triggered it.

## Dedup

Same as AML — a pattern already flagged for a holder/merchant combination
within the last 24 hours isn't re-alerted on the next sweep.

## Configuration panel

Same shared `RuleConfigPanel` component as AML (`domain="fraud"`): view all
10 rule types, edit thresholds, disable/enable, add new rule instances.
Default rules can be disabled but not deleted; every change is
audit-logged.

## What's real vs. illustrative

Everything above is real — the scan, all ten rules, risk scoring, case
linking, the feedback loop, and rule configuration. Fraud alerts can be
generated on demand via the transaction simulator (`simulate_transactions`,
scenario `"fraud"`) to see the engine catch geo-mismatch, card-testing
velocity, or amount-outlier patterns without waiting for organic data — see
the Accounts page's **Simulate** card or ask the account chat to "simulate a
fraud scenario."

## Try it

See **TESTING.md, §3.3 "Fraud & Incident Tracking"** ([TESTING.md](../TESTING.md)).
