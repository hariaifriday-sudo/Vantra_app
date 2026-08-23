# DB Admin Console

A Toad-like database admin tool at `/db-admin` — **unlisted**, not linked
from any nav, and gated behind agent login (`RequireRole role="agent"`,
same as the rest of the internal Agent Ops tooling). Built for testing:
browse every table, edit or delete a row, or describe what you want in
plain English and have an LLM draft the SQLite statement for you to review
before it runs. This bypasses every other router's business-logic
guardrails and can touch any table directly — it's not meant to represent a
real production admin surface, hence the agent-only gate and the "Testing
tool — not for production data" banner in the header.

## Where to find it

- Page: `src/pages/public/DbAdmin.tsx`
- Backend: `server/app/routers/db_admin.py` (`/api/db-admin/*`), every
  endpoint behind `Depends(require_agent)`
- Route: `/db-admin` in `src/App.tsx`, wrapped in `RequireRole role="agent"`

## Table browser

The sidebar lists every table defined in `models.Base.metadata` (introspected
directly from the SQLAlchemy models — no hardcoded table list to keep in
sync) with a live row count, filterable by name. Selecting one loads a
paginated, sortable grid (`GET /api/db-admin/tables/{name}`).

- **Edit** (pencil icon) opens a dialog with one field per column, typed by
  the column's real SQLAlchemy type: checkboxes for booleans, number inputs
  for integers/floats, a JSON-validated textarea for `JSON` columns, plain
  text otherwise. The primary key is shown but read-only. Saves via
  `PATCH /api/db-admin/tables/{name}/rows/{pk}`, built with SQLAlchemy Core
  (`table.update().where(...)`) — parameterized, not string-built SQL.
- **Delete** (trash icon) asks for confirmation, then
  `DELETE /api/db-admin/tables/{name}/rows/{pk}`.
- **Add row** opens the same dialog empty (autoincrement integer primary
  keys are omitted — the DB assigns them), posts to
  `POST /api/db-admin/tables/{name}/rows`.
- Timestamp columns are shown **read-only** in these dialogs rather than
  editable — coercing a JSON string into a Python `datetime` through the
  ORM's bind processor without a real date-picker is more brittle than it's
  worth for a testing tool. Use the SQL console for those (SQLite is
  flexible with date-string literals in raw text SQL).
- This whole path assumes a single-column primary key, true of every table
  in this schema (`id`) — a table with a composite or no primary key would
  get a clear 400 rather than a silent wrong update, but none currently
  exist here.

## SQL console

Type a request in plain English (e.g. *"show the 10 largest checking
accounts"* or *"cancel appointment APT-7DAC1F"*) and **Generate SQL**
(`POST /api/db-admin/sql/generate`) calls the LLM with the real schema — every
table and column name, types, primary/foreign keys, built fresh per request
by `_schema_context()` — and asks for exactly one SQLite statement plus a
one-sentence note, returned as JSON so it's parsed, not scraped from prose.

The generated SQL always lands in an **editable textarea** before anything
runs — nothing is auto-executed from a natural-language request. Two
guardrails on top of that:

- **No fabricated no-op queries.** Early on, a request naming a column that
  didn't actually exist on the stated table (a typo, or the field living on
  a different table) got a syntactically-valid but semantically-empty query
  back (e.g. `WHERE 0`) — technically "SQL," but useless, since it silently
  returns nothing instead of surfacing the mismatch. The prompt now
  explicitly tells the model to correct an unambiguous typo/wrong-table
  reference and say so in the note, or — if nothing in the schema
  reasonably matches — return no SQL at all and explain why in the note,
  which the backend surfaces as a real error instead of a query that looks
  fine and does nothing.
- **Destructive-statement confirmation.** Clicking **Run SQL** on anything
  matching `UPDATE`/`DELETE`/`DROP`/`TRUNCATE`/`ALTER` doesn't run it
  immediately — it swaps in a "this changes or removes data, run it?"
  confirmation showing the exact statement, requiring a second explicit
  click.

`POST /api/db-admin/sql/execute` runs it: `SELECT`/`PRAGMA`/`EXPLAIN` fetch
up to 500 rows and roll back (read-only, nothing to persist); anything else
commits and returns the affected row count. Only a single statement is
allowed per run — a stray `;` followed by more SQL is rejected outright
rather than silently executing a chain that was never actually reviewed in
the box.

## Try it

Log in as `dana.reyes@vantra.bank` (or any agent), then navigate directly to
`http://localhost:5173/db-admin`. See **TESTING.md, §4 "Internal/testing
tools"** ([TESTING.md](../TESTING.md)) for a full walkthrough.
