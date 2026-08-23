# Vantra Bank

An AI-assisted digital banking demo: a public site with an LLM assistant, an
Account Holder portal, and an internal Agent Ops portal for KYC review,
fraud/AML monitoring, document processing, case triage, and credit
underwriting. Full-stack — real database, real auth, real LLM calls.

## Stack

- **Frontend** — React + TypeScript + Vite, Tailwind v4, Framer Motion + GSAP,
  Recharts, Phosphor icons. Two visual modes (light for customers, dark for
  agents) sharing one design-token system. The landing page hero is a real
  AI-generated video (cards settling into a wallet) scroll-scrubbed with
  GSAP `ScrollTrigger` — not a canned autoplay clip.
- **Backend** — FastAPI + SQLAlchemy + SQLite, JWT auth (bcrypt-hashed
  passwords), Groq (`openai/gpt-oss-120b`) for chat/summarization/structured
  analysis, Tesseract OCR + Groq text model for document field extraction.

## Why OCR is Tesseract + LLM, not a vision model

The original plan was a vision-capable LLM for document OCR. The connected
Groq account doesn't currently have access to any vision model (confirmed by
probing `/v1/models` and a few known vision model IDs — all 404 or
decommissioned). Real image analysis now happens locally via Tesseract; the
raw OCR text is then handed to the Groq text model to structure into named
fields with confidence scores. This runs fully today with no new credentials.
If you later get a vision-capable key, swap `app/ocr.py` + the extraction
call in `app/routers/documents.py` back to an image-based call.

## Setup

New machine, nothing installed yet? Use **[SETUP.md](SETUP.md)** for the full walkthrough (Tesseract install per OS, env vars, troubleshooting). The quick version:

### Backend

```bash
cd server
python -m venv venv
venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env   # then fill in GROQ_API_KEY
venv\Scripts\python.exe -m app.seed     # creates vantra.db with demo data
venv\Scripts\python.exe -m uvicorn app.main:app --port 8000 --reload
```

Tesseract OCR must be installed separately (`winget install
UB-Mannheim.TesseractOCR` on Windows) — point `TESSERACT_CMD` in `.env` at
`tesseract.exe` if it's not on your PATH.

### Frontend

```bash
npm install
npm run dev
```

Runs at `http://localhost:5173`, talking to the backend at
`http://localhost:8000` (see `.env` → `VITE_API_BASE`).

## Demo credentials

| Role | Email | Password |
|---|---|---|
| Account Holder | `maren@vantra.bank` | `VantraDemo123!` |
| Bank Agent | `dana.reyes@vantra.bank` | `VantraDemo123!` |

New account holders can also sign up from the login page.

## Feature docs

Deep dives on the five biggest features, each covering how it works,
what's real vs. simplified, and how to test it:

- [FAQ Assistant](docs/FAQ_ASSISTANT.md) — public chat, branch lookup,
  appointment booking, human escalation
- [KYC Verification](docs/KYC_VERIFICATION.md) — upload → OCR → LLM →
  signature → agent review
- [AML Detection](docs/AML_DETECTION.md) — 8-rule engine, risk scoring,
  case linking, ring detection
- [Fraud Detection](docs/FRAUD_DETECTION.md) — 10-rule engine, risk scoring,
  known-bad-merchant feedback loop
- [Chatbot Experience](docs/CHATBOT_EXPERIENCE.md) — the shared chat
  architecture behind all three assistants
- [WhatsApp Demo](docs/WHATSAPP_DEMO.md) — a WhatsApp-styled skin on the same
  FAQ assistant, for demoing the "message the bank" experience with no real
  WhatsApp Business API integration to host
- [DB Admin Console](docs/DB_ADMIN.md) — a Toad-like tool to browse/edit/
  delete any table and run LLM-generated SQL, for testing

## What's real vs. illustrative

Real, backed by the database and live LLM calls: auth, accounts/transactions/
goals, transfers, card freeze, notifications, the full KYC flow (upload →
OCR → LLM-structured fields → signature → submit → AI recommendation → agent
approve/reject → customer notified), fraud alerts + agent actions, AML
alerts + agent actions, document processing + account-linking search, case
inbox with live AI routing (try "Simulate email" on the Case Inbox page),
credit underwriting decisions, the policy library with LLM Q&A grounded in
the actual document text, and both the FAQ and internal Copilot chat
assistants (streaming, real Groq calls).

Also real, added in a second pass:
- **AI spending insights & 30-day cash-flow forecast** on the account holder
  dashboard (`/api/accounts/insights`, `/api/accounts/forecast`) — the
  forecast detects recurring merchants/amounts directly from transaction
  history and warns if the projected balance goes low.
- **Fraud dispute assistant** — from a security notification, a customer can
  describe what happened and the AI drafts the case summary and files it
  straight into the agent's Fraud queue (`POST /api/cases/dispute`).
- **Spoken assistant replies** — a speaker toggle in any chat panel using the
  browser's built-in text-to-speech (no backend involved).
- **AI transparency page** at `/trust`, linked from the footer.

### AML detection engine (`POST /api/aml/scan`)

A real, configurable rules engine over actual transaction data — not a demo
stub. Eight rule types: `structuring`, `velocity`, `round_number`,
`pass_through`, `dormant_reactivation`, `velocity_baseline` (each holder's
own adaptive spending baseline, not a fixed threshold), `sanctions_match`
(country/watchlist), and `coordinated_structuring` (a holder-independent
pass that flags coordinated rings — the same pattern tripping across
multiple *different* holders within a time window). Alerts get a composite
`risk_score` (summed severity across every distinct rule type triggered for
that holder) and share a `linked_case_id` with other alerts on the same
holder within a 7-day window, so a case grows and re-scores itself as more
signals come in. Every rule's thresholds are live-editable — view, add,
edit, or disable rules from **Configuration** on the AML page, no code
change needed. Two seeded accounts (Nadia Kowalczyk, Halden Import Group)
carry deliberately suspicious patterns so the sweep has something real to
find; alerts it creates are tagged "Live" to distinguish them from the
illustrative seeded ones. The Agent Copilot chat is grounded in the real
open-alert queue, not a canned answer.

### Fraud detection engine (`POST /api/fraud/scan`)

The same architecture as AML, built in parallel. Ten rule types:
`geo_mismatch`, `velocity` (card-testing bursts), `amount_outlier`,
`impossible_travel`, `duplicate_charge`, `new_beneficiary_transfer`,
`new_payee_burst`, `off_hours_anomaly`, `new_category_spike`, and
`known_bad_merchant` — a feedback loop where confirming an alert as fraud
automatically blocklists that merchant for every future customer, not just
the one case. Same composite risk scoring and case-linking as AML, and the
same live rule **Configuration** panel on the Fraud page.

### Chat assistants — real tool-calling, not just Q&A

Both chat surfaces can take real actions (OpenAI-style function calling),
not just describe what to do:

- **Account holder chat** (any `/app/*` page): create/update/delete savings
  goals, calculate a savings plan, list beneficiaries, stage a transfer for
  in-app approval (`propose_transfer` — never moves money itself), schedule
  or cancel a recurring auto-payment, generate a PDF statement / interest
  certificate / tax certificate (real download links, never a URL the model
  invented), and generate realistic test transactions for a regular/AML/
  fraud scenario — which immediately runs the real detection engines above
  so a resulting alert shows up for agents right away. Also on the account
  holder side: dedicated **Simulate** buttons (regular/AML/fraud) on the
  Accounts page do the same thing without going through chat.
- **Public FAQ assistant** (`/assistant`, no login required): finds real
  branch locations with a Google-Maps link (address/hours/link are built
  server-side, never hallucinated), stages a branch-appointment booking form
  pre-filled from whatever's already in the conversation (name, branch,
  date/time, reason — inferred from natural language like "tomorrow
  afternoon"), looks up/reschedules/cancels an appointment already booked
  under an email (`check_my_appointments`, `reschedule_appointment`,
  `cancel_appointment` — a same-email/branch resubmission is also deduped
  server-side into an update instead of a duplicate row, as a backstop for
  when the model reaches for the wrong tool), and escalates to a human by
  opening a real support ticket (with the full conversation transcript
  attached, not just a one-line summary) in the agent's Case Inbox. The FAQ
  tab has a real search box and written Q&A content (not just category
  counts), a "you might also ask" strip that tracks what's actually been
  asked, and the conversation persists across a page reload. Every assistant
  reply carries a real thumbs-up/down (`POST /api/chat/messages/{id}/
  feedback`), and a branch result card has an **Email me this** button
  (simulated send, logged to the audit trail — no SMTP wired up in this
  demo).
- **WhatsApp-styled demo** (`/whatsapp-demo`, unlisted — see
  [docs/WHATSAPP_DEMO.md](docs/WHATSAPP_DEMO.md)): the same FAQ backend and
  tools behind a WhatsApp-lookalike chat UI, for demoing the "message the
  bank" experience without standing up a real WhatsApp Business API
  integration. Its own voice I/O wiring and its own `localStorage`
  persistence, deliberately kept separate from `ChatPanel` per how this
  demo page is meant to be shown (a standalone link, not part of the main
  site).
- **DB Admin console** (`/db-admin`, unlisted, agent-login gated — see
  [docs/DB_ADMIN.md](docs/DB_ADMIN.md)): a Toad-like tool for testing —
  browse/edit/delete any row in any table, or describe a request in plain
  English and have an LLM draft the SQLite statement for you to review
  before running it.

Illustrative only (no dedicated backend model yet): the AML page's anomaly
trend / flag-rate / framework-coverage charts still render from static
sample data (`src/data/mock.ts`). The public FAQ page's product-offer list
and loan calculator are static content, not DB-backed.

## Known follow-ups

- Mobile responsiveness for the three-column account/agent dashboard shells
  hasn't been tuned below ~1024px — it's a desktop-first layout for now.
- No password reset, no rate limiting, no file storage for KYC document
  images (only the extracted text/fields are persisted).
- Bundle isn't code-split yet (single ~1.1MB JS chunk) — fine for local use,
  worth splitting before any real deployment.
