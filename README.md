# Vantra Bank

An AI-assisted digital banking demo: a public site with an LLM assistant, an
Account Holder portal, and an internal Agent Ops portal for KYC review,
fraud/AML monitoring, document processing, case triage, and credit
underwriting. Full-stack — real database, real auth, real LLM calls.

## Stack

- **Frontend** — React + TypeScript + Vite, Tailwind v4, Framer Motion + GSAP,
  Recharts, Phosphor icons. Two visual modes (light for customers, dark for
  agents) sharing one design-token system.
- **Backend** — FastAPI + SQLAlchemy + SQLite, JWT auth (bcrypt-hashed
  passwords), Groq (`qwen/qwen3.6-27b`) for chat/summarization/structured
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
- **Real rules-based AML detection** (`POST /api/aml/scan`) — scans actual
  transaction data for structuring (sub-threshold transactions summing past
  the CTR threshold in a rolling window) and velocity/rapid-fund-movement
  patterns, and creates real `AmlAlert` rows with an LLM-written narrative
  grounded in the specific transactions found. Two seeded accounts (Nadia
  Kowalczyk, Halden Import Group) carry deliberately suspicious transaction
  patterns so the sweep has something real to find. Alerts it creates are
  tagged "Live" in the UI to distinguish them from the illustrative seeded
  ones.
- **RAG-grounded Agent Copilot** — every Copilot message runs a TF-IDF
  similarity search (`app/rag.py`) over the policy library first, and the
  system prompt is built from the actual retrieved excerpts, so answers cite
  real policy text instead of general knowledge. (No embeddings API was
  available on this Groq account, so this uses local lexical similarity
  rather than dense vectors — swap in a real embedding model if the policy
  corpus grows past a few dozen documents.)
- **SAR draft generation** — "File SAR Draft" on an AML alert now has the
  LLM write an actual filing narrative from the alert's evidence, shown in
  the drawer for compliance to review.
- **Underwriting counterfactuals** — "Regenerate AI Analysis" asks the LLM
  what specific change would move an applicant to a better risk grade.
- **Agent override notes** — fraud and AML action drawers now accept an
  optional note, persisted on the alert and in the audit log.
- **AI transparency page** at `/trust`, linked from the footer.

Illustrative only (no dedicated backend model yet): the AML page's anomaly
trend / flag-rate / framework-coverage charts still render from static
sample data (`src/data/mock.ts`) — a full anomaly-scoring model (as opposed
to the two rule-based checks above) was out of scope. The public FAQ page's
category/product browsing panel and loan calculator are also static content,
not DB-backed.

## Known follow-ups

- Mobile responsiveness for the three-column account/agent dashboard shells
  hasn't been tuned below ~1024px — it's a desktop-first layout for now.
- No password reset, no rate limiting, no file storage for KYC document
  images (only the extracted text/fields are persisted).
- Bundle isn't code-split yet (single ~1.1MB JS chunk) — fine for local use,
  worth splitting before any real deployment.
