# AML Detection

A real, configurable rules engine that scans actual transaction data for
money-laundering patterns — not a demo stub returning canned alerts. Eight
independent rule types, composite risk scoring, automatic case-linking, and
a cross-holder ring-detection pass, all tunable from the UI with no code
change.

## Where to find it

- Agent page: `/agent/aml` — `src/pages/agent/Aml.tsx`
- Config panel: `src/components/agent/RuleConfigPanel.tsx` (`domain="aml"`)
- Backend: `server/app/routers/aml.py`
- Shared rule engine plumbing: `server/app/rules.py` (`RULE_TYPES["aml"]`,
  `AML_BASE_SEVERITY`, generic CRUD used by both AML and Fraud)
- Data model: `AmlAlert`, `DetectionRule` in `server/app/models.py`

## The eight rule types

| Rule type | What it catches | Base severity |
|---|---|---|
| `structuring` | Sub-threshold transactions summing past the CTR reporting threshold within a rolling window | 40 |
| `velocity` | Rapid fund movement — several transfers in a short window | 30 |
| `round_number` | Suspiciously round transaction amounts above a threshold | 15 |
| `pass_through` | Money in and back out again within hours, same rough amount (mule-account pattern) | 35 |
| `dormant_reactivation` | A long-dormant account suddenly moving a large amount | 25 |
| `velocity_baseline` | Each holder's **own** adaptive spending baseline exceeded by a multiple — personalized, not a fixed threshold for everyone | 25 |
| `sanctions_match` | Transaction tagged with a high-risk country code or watchlist name | 60 |
| `coordinated_structuring` | A **cross-holder** pass (not scoped to one account) — flags when the same pattern trips for multiple *different* holders within a time window, i.e. a coordinated ring | 70 |

Every rule's parameters (thresholds, windows, multiples) are live-editable —
no restart, no code change. `RULE_TYPES["aml"]` in `rules.py` defines the
default value for each parameter; actual live values come from the
`DetectionRule` table.

## Composite risk scoring + case linking

An alert isn't scored in isolation. When a new alert fires for a holder,
`_create_alert_if_new` (`aml.py`) looks for any other **open** alert on that
same holder within `CASE_LINK_WINDOW_DAYS` (7 days). If one exists:
- All alerts in the group get the same `linked_case_id`.
- `risk_score` becomes the **sum** of `AML_BASE_SEVERITY` across every
  *distinct* rule type in the group, capped at 100 — so a holder tripping
  three different rule types scores meaningfully higher than tripping the
  same rule three times, and every alert already in the group gets
  retroactively re-scored as new signals join it.

If there's no other open alert, the risk score is just that rule's own base
severity, and no case is linked yet.

## Coordinated ring detection

`_scan_for_coordinated_rings` runs once per sweep, independent of the
per-holder loop. It looks at every `structuring` alert created *in this same
sweep*, groups them by whether they came from distinct holders, and if at
least `min_holders` (default 2) different holders tripped structuring within
`ring_window_hours` (default 48h), it creates a single `coordinated_ring`
alert not tied to any one user — `entity_name` reads something like
"Coordinated ring (3 accounts)". This is the one alert type that's
holder-independent by design.

## Narrative generation + SAR drafts

Every new alert gets an LLM-written narrative grounded in the actual
evidence transactions (ids, merchants, amounts, dates) that triggered it —
if the LLM call fails, it falls back to a plain-text summary rather than
blocking alert creation. From the alert drawer, **File SAR Draft** asks the
LLM to write a full formal Suspicious Activity Report narrative from that
same evidence, citing real dollar amounts and dates; clicking it again
regenerates a fresh draft.

## Dedup

Re-running a sweep never creates duplicate alerts for a pattern already
flagged for the same holder/alert-type within the last 24 hours
(`_create_alert_if_new`'s existence check).

## Agent Copilot grounding

The floating Copilot chat (any `/agent/*` page) has the real open-AML-queue
summary (case ref, entity, alert type, volume, risk score, linked case)
injected into its system prompt (`_agent_system_prompt` in
`routers/chat.py`) — asking "summarize my AML cases" or "what's pending
today" gets a real answer instead of "I don't have visibility into that."

## Configuration panel

`RuleConfigPanel domain="aml"` (shared with Fraud, same component) gives
agents full CRUD over rules: view all 8 types with their current parameters,
edit any threshold, disable a rule without deleting it, or add a new rule
instance of an existing type. Default rules can be disabled but not
deleted. Every change is audit-logged.

## What's real vs. illustrative

Real: the scan itself, every rule above, risk scoring, case linking, ring
detection, narrative + SAR generation, Copilot grounding, rule
configuration. Two seeded accounts (Nadia Kowalczyk, Halden Import Group)
carry deliberately suspicious transaction histories so a sweep has
something genuine to find — alerts it creates are tagged **"Live"** in the
UI to distinguish them from the illustrative seeded alerts already in the
demo data.

Illustrative only: the **Anomaly Rate Trend**, **Flag Rate by Category**,
and **Rule Coverage by Framework** charts on the AML page render from static
sample data (`src/data/mock.ts`) — a full anomaly-scoring model (as opposed
to these explicit rule checks) was out of scope for this demo.

## Try it

See **TESTING.md, §3.4 "AML Transaction Monitoring"** ([TESTING.md](../TESTING.md)).
