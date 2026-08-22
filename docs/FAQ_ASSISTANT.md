# FAQ Assistant

The public-facing AI assistant at `/assistant` — no login required. Answers
general banking questions, and can take three real actions: find a branch,
book an appointment, and escalate to a human agent.

## Where to find it

- Page: `src/pages/public/Assistant.tsx`, linked from the nav as **FAQ & Assistant**
- Chat endpoint: `GET /api/chat/stream?context=faq` (`server/app/routers/chat.py`)
- Tool definitions + executor: `server/app/chat_tools.py` (`FAQ_TOOLS`, `build_faq_executor`)

## What it can do

### Answer questions (streaming, grounded)
Every message hits Groq live via `stream_chat_with_tools`, streamed token-by-
token to the browser. The system prompt (`FAQ_SYSTEM_PROMPT`) grounds the
model in the real customer-care phone number and hours, and tells it exactly
when to use each tool below rather than describing what the customer should
do themselves.

### Find a branch (`find_nearest_branch`)
Takes an optional `location` (city/neighborhood/zip). Branch data is a small
static directory (`server/app/branches.py`) — this is a demo bank, not a
real chain, so there's no live geocoding. The Google Maps link is built
**server-side** from the real address (`urllib.parse.quote_plus` + Maps
search URL), never constructed or guessed by the model. Results render as an
inline `BranchResultsCard` (`src/components/assistant/BranchResultsCard.tsx`)
with address, phone, hours, and a working "Open in Google Maps" button.

### Book an appointment (`propose_appointment_booking`)
Stages a booking form — the tool itself never books anything. What makes
this useful: the model pre-fills the form from whatever's already in the
conversation. If you say *"I'm Jane Doe, jane@example.com, book me at the
New York branch tomorrow at 11am for a loan question"*, the tool call
resolves "tomorrow" against the real current date, matches "New York"
loosely against the real branch list (`Vantra Midtown`), and snaps "11am" to
the nearest of the form's fixed time slots — all six fields (name, email,
branch, date, time, reason) arrive pre-filled, with a note telling the
customer to double-check rather than re-type everything. The form itself
(`src/components/assistant/AppointmentBookingCard.tsx`) fetches the live
branch list (`GET /api/public/branches`) for its dropdown and posts to
`POST /api/public/appointments` on submit, which creates a real
`BranchAppointment` row and returns a reference code (`APT-XXXXXX`).

### Escalate to a human (`escalate_to_human`)
Opens a real support ticket — not a canned "please call us" reply. Requires
an email and a summary; creates a `CaseTicket` (`department="General
Support"`, `status="Needs Review"`) that shows up in the agent's Case Inbox
like any other incoming email. The reply also surfaces the customer-care
phone number for anything urgent.

### FAQ tab — search + real content
Unlike a typical placeholder FAQ list, the categories expand into actual
written Q&A pairs (`faqArticles` in `src/data/mock.ts` — a curated sample per
category, not the full article count shown next to each category name; the
rest are answerable in chat). A search box filters across all articles by
question, answer, or category text.

### Products & Calculator tabs
Static product cards (rate/blurb) with an "Ask about this →" button that
sends a contextual question into chat. The loan calculator is a fully local,
client-side computation (amount + term sliders → monthly payment at a fixed
7.9% APR) — illustrative only, not tied to a real underwriting model.

### Quality-of-life details
- **Persisted conversation** — the transcript survives a page reload
  (`localStorage`, keyed per page via the `persistKey` prop on `ChatPanel`).
- **"You might also ask"** — a suggestion strip that reads the live
  transcript and filters out anything already asked, so it doesn't keep
  recommending a question you just sent.
- **Voice in/out** — mic button (Web Speech `SpeechRecognition`) and a
  speaker toggle (`speechSynthesis`) that reads replies aloud; a pulsing
  "Speaking…" ring overlays the hero robot while audio plays.
- **Spline 3D robot hero** — an embedded Spline scene (`SPLINE_SRC` in
  `Assistant.tsx`), with a radial-gradient edge mask and ambient glow so the
  panel blends into the page instead of reading as a boxed-in widget.

## What's illustrative, not real

The product-offer list and loan calculator are static content — no backend
model behind them. Branch data is a small hardcoded directory, not a real
locations API (see `server/app/branches.py`).

## Try it

See **TESTING.md, §1.2 "FAQ & AI Assistant"** ([TESTING.md](../TESTING.md))
for a full click-by-click walkthrough (branch lookup, pre-filled booking,
escalation, search, persistence).
