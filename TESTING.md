# Vantra Bank — Feature Testing Guide

A step-by-step walkthrough of every feature, in the order you'll naturally hit them.
Run both servers first (see [README.md](README.md#setup)):

```bash
# Terminal 1 — backend
cd server && venv\Scripts\python.exe -m uvicorn app.main:app --port 8000 --reload

# Terminal 2 — frontend
npm run dev
```

Open **http://localhost:5173**.

## Demo credentials

| Role | Email | Password |
|---|---|---|
| Account Holder | `maren@vantra.bank` | `VantraDemo123!` |
| Bank Agent | `dana.reyes@vantra.bank` | `VantraDemo123!` |

Two more account holders exist as **monitored entities only** (not meant for login demos) — `n.kowalczyk@vantra.bank` and `ops@haldenimport.biz`, same password. Their transaction history is deliberately shaped to trigger the real AML detection engine (see §3.4).

If you want a completely clean slate at any point: stop the backend, delete `server/vantra.db`, run `venv\Scripts\python.exe -m app.seed` again, restart.

---

## 1. Public site (no login required)

### 1.1 Homepage — `/`
- Confirm the hero video (cards on a dark background) loads and is paused on frame one.
- Scroll down slowly from the hero: the video card should stay visually pinned on screen, scrubbing forward (badges fade, cards tilt) as you scroll, then fly/shrink down into the dashed wallet-pocket placeholder in the "Smart Wallet" section and settle in — the scrub speed should track your scroll speed exactly, not autoplay independently.
- Scroll back up: the card should reverse smoothly, no stutter or duplicate/ghost card left behind.
- Click **Log In / Sign Up** in the nav → lands on `/login`.
- Click **Explore the Assistant** → lands on `/assistant`.
- Scroll to the FAQ accordion and expand a couple of items.

### 1.2 FAQ & AI Assistant — `/assistant`
- Confirm the **Spline 3D robot** loads in the hero (may take a few seconds).
- Type a question in the chat box, e.g. *"What is an EMI?"* — reply should stream in token-by-token. This hits `GET /api/chat/stream?context=faq` live against Groq.
- Click the **speaker icon** next to "Ask Vantra" (top-right of the chat panel) to turn on spoken replies, then ask another question — the browser should read the answer aloud, and a pulsing "Speaking…" ring should appear over the robot while it talks.
- Click the **mic icon** — if your browser supports Web Speech (Chrome does), speak a question; it should transcribe and auto-send.
- Try the **Products** and **Calculator** tabs on the right-hand panel; move the calculator sliders and confirm the monthly payment updates live.
- Click a quick-suggestion chip (e.g. "Calculate my EMI") — it should populate and send the chat. As you send messages, the **"You might also ask"** strip below the chat should stop repeating whatever you've already asked.
- **Branch lookup**: click **Find a branch near me** (or ask "where's a branch in Austin?") — confirm a card renders inline with a real address/phone/hours and a working **Open in Google Maps** link.
- **Appointment booking**: ask something like *"I'm Jane Doe, jane@example.com, book me at the New York branch tomorrow at 11am for a loan question"* — confirm a booking form appears **pre-filled** from what you said (name/branch/date/time/reason), with a note that it was pre-filled. Adjust anything and click **Confirm appointment** — confirm a green "Appointment requested" confirmation with a real reference code (`APT-XXXXXX`) appears.
- **Escalate to a human**: click **Talk to a human agent** (or the link at the bottom of the page) and give an email if asked — confirm the assistant confirms a ticket was opened and gives the customer-care phone number. Cross-check as agent: log in as Dana → **Case Inbox** → the new ticket should be there.
- **FAQ search**: switch to the FAQ tab, type "freeze" in the search box — confirm it filters to the matching question, and expanding it shows a real written answer (not a placeholder).
- **Persistence**: reload the page — the conversation you just had should still be there, not reset.

### 1.3 Login / Signup — `/login`
- Toggle between **Account Holder** and **Bank Agent** — the right-hand panel should flip from light to dark and the fields change (Agent adds Employee ID + Department).
- Click **Create an account**, fill in a new account holder (any email not already used), submit — you should land straight in `/app` with a starter checking account and a welcome notification.
- Log out (see §2.7) and log back in with `maren@vantra.bank` to continue with the richer seeded data for the rest of this guide.

### 1.4 Trust page — `/trust` (linked from footer → Resources → "How We Use AI")
- Confirm all four AI-use cards render and the principles list is legible in both light/desktop widths.

---

## 2. Account Holder portal (log in as `maren@vantra.bank`)

### 2.1 Dashboard — `/app`
- **Stat tiles**: Total Balance, Income, Expenses should show real numbers (not zero).
- **AI Insight card** (mint, top-left): a real LLM-generated spending observation. Refresh the page — it should **not** regenerate (cached for the week); delete the browser's `vantra_token` or wait 7 days to see a fresh one, or just trust it's cached by checking the network tab shows no repeat call after the first.
- **30-Day Cash Flow Forecast card**: shows a projected balance and either a neutral note or a watch-colored warning if trending low.
- **Financial Overview** chart: 6-month income/expense trend.
- **All Expenses** donut: category breakdown for the last 30 days.
- **Transaction History** table and **Savings Goals** list at the bottom.
- Right-hand panel: the docked **Ask Vantra** chat (see §2.6 for the full test).

### 2.2 KYC Automation — `/app/kyc`
This is the flagship flow — real OCR, real LLM, real signature.
1. Click the dropzone and upload a **clear photo of any ID-like document** (a driver's license, or even a printed page with "Name: ___, Date of Birth: ___, Address: ___" works — Tesseract just needs legible text). JPG/PNG/WEBP only. No document handy? Use the bundled fixture: `server/tests/fixtures/sample_id.png` (synthetic, not a real person — see [server/tests/fixtures/README.md](server/tests/fixtures/README.md)).
2. Wait for "Scanning document with OCR…" to finish (a few seconds).
3. **AI Review step**: confirm extracted fields appear with confidence badges (High/Medium/Low). Edit any field, then click **Looks good, continue**.
4. **Confirm & Sign step**: check the authorization box, draw a signature in the pad (click-drag with mouse), click **Submit for Review**.
5. Confirm you land on **Pending Bank Review** with a real case reference like `KYC-40001`.
6. Revisit `/app/kyc` — it should now show your application's live status instead of the upload form (this persists across refresh).

### 2.3 Notifications — `/app/notifications` — Fraud Dispute Assistant
1. Filter to **Security** — find "Unusual transaction flagged."
2. Click **This wasn't me** — a textarea expands.
3. Type a short description (e.g. "I was home all week, don't recognize this charge") and click **File dispute**.
4. Confirm a green "Dispute filed (…)" confirmation appears with a real AI-generated summary, and the card stays visible (not marked unread-red anymore).
5. **Cross-check as agent**: log in as Dana (§3) and open **Case Inbox** — the dispute should be the newest ticket, routed to Fraud, with the same AI summary.

### 2.4 Accounts / Transfers / Cards / Loans & Goals
- **Accounts** (`/app/accounts`): lists all three seeded accounts with real balances.
- **Transfers** (`/app/transfers`): pick a "from" account, pick a quick-send payee, enter an amount, submit — balance should update and a success message appears. Try an amount larger than the balance — should show "Insufficient funds."
- **Cards** (`/app/cards`): click **Freeze card** — button should switch to a disabled "Frozen" state.
- **Loans & Goals** (`/app/loans`): savings goals grid, plus a **Recurring & Upcoming** list below it — same recurring-transaction detection as the dashboard forecast, itemized (merchant, cadence, next expected date, amount).
- **Generate test transactions** (`/app/accounts`, "Simulate" card): click **Generate regular activity**, then separately **Simulate an AML scenario** and **Simulate a fraud scenario** — each posts to `POST /api/banking/simulate-transactions` and immediately runs the matching real detection engine scoped to your account. Confirm new transactions appear in your history, then cross-check as agent (§3.3/§3.4) that a fresh "Live" alert shows up for the AML/fraud scenarios specifically.

### 2.5 Settings — `/app/settings`
- Confirm the profile/notifications/security rows render (these are static — no backend wiring, listed for completeness).

### 2.6 Account Assistant chat (docked right rail, any `/app/*` page)
- Ask something account-specific, e.g. *"What's my Iceland Trip goal progress?"* — the assistant has your real balances/goals injected into its system prompt and should answer with actual numbers, not a generic answer.
- **Savings goals**: ask *"Create a savings goal called Ski Trip, target $2000, due in 6 months"* — confirm it's created for real (check `/app/loans` afterward). Ask it to update or delete that same goal by name.
- **Transfer approval flow**: ask *"Send $50 to [any saved beneficiary name]"* — confirm the assistant says it's staged the transfer (not that it moved money), and an **Approve / Reject** card renders inline in the chat. Click **Approve** — confirm your balance actually updates without a page reload.
- **Auto-payments**: ask *"Set up a monthly $20 payment to [a beneficiary]"* — confirm it's scheduled immediately (no approval step), then ask *"What auto-payments do I have?"* to confirm it lists back. Ask to cancel it.
- **Document generation**: ask *"Generate my account statement for the last 3 months"* (or "interest certificate" / "tax certificate") — confirm a real PDF download link appears inline, not a description of how to get one.
- **Test-data simulation via chat**: ask *"Simulate a fraud scenario on my account"* — same effect as the Accounts-page buttons in §2.4, callable conversationally.
- Ask *"How do I freeze my card?"* — should give real guidance without inventing account specifics it doesn't have.

### 2.7 Log out
- Click your avatar (top-right) → **Log out** → should land on `/login`.

---

## 3. Agent Ops portal (log in as `dana.reyes@vantra.bank`, select **Bank Agent** tab)

### 3.1 Dashboard — `/agent`
- Stat tiles (Pending KYC, Open Fraud Alerts, Unread Case Emails, Underwriting Decisions) should reflect live counts — click one to jump to that queue.
- **Priority Worklist** merges items across queues with an "Open" link per row.

### 3.2 KYC Review — `/agent/kyc`
- If you completed §2.2, your submission should appear in the queue.
- Click it: confirm the **AI Recommendation** card shows real reasoning (Approve/Request More Info/Reject with bullet-style notes), and **Submitted Fields** shows what the customer entered with confidence badges.
- Type an optional note, then click **Approve** (or **Request More Information** / **Reject**).
- Confirm the item leaves the queue, and (as the customer) a new notification appears on `/app/notifications` reflecting the decision.

### 3.3 Fraud & Incident Tracking — `/agent/fraud` — Real Detection Engine, 10 Rules
1. Click any row to open the detail drawer — confirm the **AI explanation** is populated.
2. Add an optional note, then try **Confirm Fraud & Notify Customer**, **Dismiss as False Positive**, or **Escalate** — a toast confirms the action, and for "Confirm Fraud" the customer gets a new notification.
3. Click **Configuration** (top-right) — confirm all 10 rule types are listed (geo-mismatch, velocity, amount outlier, impossible travel, duplicate charge, new-beneficiary transfer, new-payee burst, off-hours anomaly, new-category spike, known-bad-merchant), each with its own editable thresholds. Try editing a value, disabling a rule, or adding a new one.
4. Click **Run Fraud Sweep** (top-right of the main page) — confirm a toast reports alerts found across transactions scanned. Alerts sharing a holder within 7 days should share the same **linked case** and a summed **risk score** (visible in the alert detail).
5. **Known-bad-merchant feedback loop**: confirm an alert as fraud (step 2), note the merchant name, then check **Configuration** → the `known_bad_merchant` rule's merchant list should now include it — meaning any *other* customer's future transaction at that merchant gets auto-flagged.

### 3.4 AML Transaction Monitoring — `/agent/aml` — Real Detection Engine, 8 Rules
This is the second flagship flow.
1. Click **Run AML Sweep** (top-right). This takes ~10–20 seconds — it's making real LLM calls per detected pattern, not a canned response.
2. Confirm a toast reports how many new alerts were found across how many transactions.
3. In **Open Alerts**, look for entries tagged **Live** — these are freshly computed, not seeded. You should see patterns for *Nadia Kowalczyk* (rapid fund movement / structuring) and *Halden Import Group* (structuring).
4. Click a **Live** alert: confirm **Evidence transactions** lists the actual merchant/amount rows that triggered it, and the AI narrative references those specifics (not generic text). Confirm a **risk score** is shown, and if a holder has multiple open alerts within 7 days, they share a **linked case ID** and the score reflects all of them combined.
5. Click **File SAR Draft** — wait a few seconds — a full formal SAR narrative should appear in the drawer, citing the real dollar amounts and dates. Click it again ("Regenerate SAR Draft") to see it produce a fresh draft.
6. Click **Run AML Sweep** a second time — confirm it does *not* recreate duplicate alerts for the same pattern (dedupe window is 24h).
7. Try the **Escalate** and **Clear** buttons on a different alert; add an analyst note first and confirm it's saved (reopen the alert to check).
8. Click **Configuration** — confirm all 8 rule types are listed (structuring, velocity, round-number, pass-through, dormant reactivation, personalized velocity baseline, sanctions match, coordinated structuring), each editable. Try disabling one, then re-running the sweep to confirm it no longer fires.

### 3.5 Document Processing — `/agent/documents`
- Upload any legible document image (loan form, invoice, anything with text) — `server/tests/fixtures/sample_id.png` works fine here too.
- Confirm extracted fields appear grouped (Applicant / Financials / Collateral) with confidence badges.
- In **Account Linking**, type a name fragment (try "Priya" or "Coastal") — confirm matching account holders/entities appear with a match score, and **Link to Account** toggles to "Linked."

### 3.6 Case Inbox — `/agent/cases` — Live AI Routing
- Click **Simulate email** (top of the queue list) a couple of times — each click posts a synthetic customer email to `POST /api/cases/route` and the AI classifies it live: confirm a new ticket appears with a real summary, a department, a confidence score, and Auto-Routed/Needs Review status that varies sensibly with content.
- Click any ticket, use the department dropdown + **Reassign**, and try **Mark Resolved**.

### 3.7 Credit Underwriting — `/agent/underwriting`
- Select an applicant, confirm DTI / Credit Score / LTV tiles and the AI risk summary.
- Click **Regenerate AI Analysis** — wait a few seconds — confirm the summary refreshes and a **"What would change the grade"** counterfactual appears, referencing this applicant's actual numbers.
- Try **Accept Recommendation**, **Request Additional Documents**, and **Override** (with a justification note) on different applicants.

### 3.8 Knowledge & Policy Library — `/agent/knowledge` — RAG Grounding
- Search for a term (try "SAR" or "due diligence") and filter by category — confirm results narrow correctly.
- Open a document, use **Ask about this policy**, ask something answerable from that specific doc (e.g. on the SAR policy, ask *"what's the filing deadline?"*) — confirm the answer is correct and grounded (not generic).

### 3.9 Vantra Copilot (floating orb, bottom-right, any `/agent/*` page)
- Open it, ask a cross-document question, e.g. *"When is enhanced due diligence required?"* — confirm the answer cites a specific policy title (e.g. "Source: [BSA/AML] Customer Identification Program (CIP) Standard"), proving it retrieved real policy text rather than answering from general knowledge.
- Ask something **not** covered by any policy (e.g. "What's the weather today?") — it should say it doesn't know rather than making something up.
- **Real queue grounding**: ask *"Summarize my open AML cases"* or *"What's pending for me today?"* — confirm it answers with your actual open AML/Fraud alert counts, KYC-pending count, and case-inbox items (highest risk first), not a generic "I don't have visibility into that" non-answer.

---

## 4. Cross-cutting checks

- **Roles are enforced**: while logged in as Maren, manually navigate to `/agent` — should redirect to `/app` (not show agent data). Same in reverse for Dana → `/agent`.
- **Logout clears session**: after logging out, refreshing `/app` should redirect to `/login`, not show cached data.
- **Reduced motion**: enable "reduce motion" in your OS accessibility settings, reload — animations should be near-instant, not absent-looking broken.
- **Responsive**: the marketing pages (`/`, `/assistant`, `/login`, `/trust`) hold up down to ~375px width. The three-column dashboard/ops shells are desktop-first (see README known follow-ups) — narrow-viewport testing there will show cramped columns, which is a known, not-yet-addressed limitation.

---

## 5. API-level testing (optional, for backend verification without the UI)

All endpoints require `Authorization: Bearer <token>` except `/api/auth/*` and `/api/health`.

```bash
# Log in and capture a token
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"maren@vantra.bank","password":"VantraDemo123!","role":"account_holder"}' \
  | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# Dashboard summary
curl -s http://localhost:8000/api/accounts/dashboard -H "Authorization: Bearer $TOKEN"

# AI insight (real LLM call, cached weekly)
curl -s http://localhost:8000/api/accounts/insights -H "Authorization: Bearer $TOKEN"

# Cash-flow forecast
curl -s http://localhost:8000/api/accounts/forecast -H "Authorization: Bearer $TOKEN"

# OCR + LLM document extraction, using the bundled sample fixture
curl -s -X POST "http://localhost:8000/api/documents/extract?kind=kyc" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@server/tests/fixtures/sample_id.png;type=image/png"
```

```bash
AGENT_TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dana.reyes@vantra.bank","password":"VantraDemo123!","role":"agent"}' \
  | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# Trigger the real AML detection sweep (takes 10-20s)
curl -s -X POST http://localhost:8000/api/aml/scan -H "Authorization: Bearer $AGENT_TOKEN"

# Ask the RAG-grounded copilot via the streaming chat endpoint
curl -s -N "http://localhost:8000/api/chat/stream?message=When+is+enhanced+due+diligence+required%3F&session_key=test1&context=agent_copilot&token=$AGENT_TOKEN"
```

A full endpoint list is visible at `http://localhost:8000/docs` (FastAPI's auto-generated Swagger UI) once the backend is running.

---

## 6. Known limitations to expect, not bugs

- The AML page's **Anomaly Rate Trend**, **Flag Rate by Category**, and **Rule Coverage by Framework** charts are illustrative sample data — only the **Open Alerts** list and the Run Sweep flow are computed live.
- OCR quality depends on the input photo — a blurry or low-contrast scan will legitimately produce lower confidence scores or missing fields. That's the confidence system working correctly, not a bug.
- First LLM call after a backend restart can take a couple seconds longer (connection warm-up).
