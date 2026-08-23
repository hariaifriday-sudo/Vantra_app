# FAQ Assistant

The public-facing AI assistant at `/assistant` — no login required. Answers
general banking questions, and can take real actions: find a branch, book,
look up, reschedule, or cancel an appointment, and escalate to a human
agent. The same backend and tools also power a WhatsApp-styled standalone
demo at `/whatsapp-demo` — see [WHATSAPP_DEMO.md](WHATSAPP_DEMO.md).

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

### Look up, reschedule, and cancel appointments (`check_my_appointments`, `reschedule_appointment`, `cancel_appointment`)
`check_my_appointments` looks up every `BranchAppointment` under an email
address — not a login, just a lookup by whatever email the customer gives in
chat — and renders them inline via `MyAppointmentsCard`
(`src/components/assistant/MyAppointmentsCard.tsx`). If none are found, the
tool result explicitly tells the model not to invent one.

`reschedule_appointment` and `cancel_appointment` take a `reference` (e.g.
`APT-7DAC1F` — the model picks this up from an earlier `check_my_appointments`
result or booking confirmation already in the conversation) and update the
row directly, re-rendering the same card with the new date/time or
`Cancelled` status. The system prompt is explicit that these — not
`propose_appointment_booking` — are the right tool for a reschedule/cancel
request, and that the model should call `check_my_appointments` first if it
doesn't already have the reference in context.

That said, tool selection isn't guaranteed on a small/fast model — testing
showed the model sometimes still reached for `propose_appointment_booking`
on a reschedule request even with the reference in view, which used to
create a **second** appointment instead of changing the first. As a
backstop independent of which tool gets called, `POST /api/public/
appointments` (`server/app/routers/public.py`) now checks for an existing
`Requested` appointment at the same branch/email before inserting — if one
exists, it updates that row (same reference, new date/time) instead of
creating a duplicate; a different branch still creates a genuinely separate
appointment. This means the "no duplicate" guarantee holds regardless of
whether the model correctly used the reschedule tool.

### Escalate to a human (`escalate_to_human`)
Opens a real support ticket — not a canned "please call us" reply. Requires
an email and a summary; creates a `CaseTicket` (`department="General
Support"`, `status="Needs Review"`) that shows up in the agent's Case Inbox
like any other incoming email. The ticket body includes the **full
conversation transcript** (`_format_transcript` in `chat_tools.py`), not
just the one-line summary the model writes, so the agent picking it up sees
everything the customer already said. The reply also surfaces the
customer-care phone number for anything urgent.

### Message feedback
Every assistant reply gets a real thumbs-up/down (`FeedbackButtons` in
`ChatPanel.tsx`) — the model tags its own message with a `vantra:message-meta`
block carrying the real `ChatMessage.id`, and a click posts to `POST /api/
chat/messages/{id}/feedback`, persisted on the row (`ChatMessage.feedback`,
`"up"` or `"down"`).

### Email me this (branch results)
`BranchResultsCard` has an **Email me this** button per branch
(`EmailBranchButton`) that posts to `POST /api/public/branches/email`. No
SMTP is wired up in this demo — same spirit as the Case Inbox's "Simulate
email" button — it records a real `AuditLog` entry of the send rather than
delivering actual mail.

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
