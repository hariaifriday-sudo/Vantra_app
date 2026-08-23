# WhatsApp Demo

A WhatsApp-styled standalone page at `/whatsapp-demo` — **unlisted**, not
linked from any nav on the main site, reachable only by direct URL
(`src/App.tsx`: `{/* Deliberately not linked from any nav... */}`). It
exists to demo the "message the bank on WhatsApp" experience without
standing up a real WhatsApp Business API integration (Meta Cloud API or
Twilio, a webhook, a verified phone number) — none of which is feasible for
an unhosted local demo. Instead, this is a pixel-styled WhatsApp lookalike
UI wired to the exact same backend as the public FAQ assistant.

## Where to find it

- Page: `src/pages/public/WhatsAppDemo.tsx` — a self-contained component,
  deliberately **not** built on the shared `ChatPanel` (see
  [CHATBOT_EXPERIENCE.md](CHATBOT_EXPERIENCE.md)) so the WhatsApp skin isn't
  constrained by (or leaking into) the component every other chat surface
  shares.
- Same chat endpoint, same tools, same system prompt as the FAQ assistant:
  `GET /api/chat/stream?context=faq`, `FAQ_TOOLS` /
  `build_faq_executor` in `server/app/chat_tools.py`. See
  [FAQ_ASSISTANT.md](FAQ_ASSISTANT.md) for what the assistant can actually
  do — everything there works identically here.

## What's real vs. styling

**Real**: every reply is a live Groq call through the same tool-calling
loop as `/assistant` — branch lookup, appointment booking/lookup/
reschedule/cancel, human escalation, all backed by the same database rows.

**Styling only**: the header bar, message bubbles, the "typing…" indicator,
and the "UI DEMO — WhatsApp-style preview, not affiliated with WhatsApp/
Meta" banner are a lookalike skin — there's no actual WhatsApp Business
account, phone number, or webhook involved anywhere in this flow.

## Quality-of-life details specific to this page

- **Voice in/out**: its own `SpeechRecognition` wiring (`toggleVoice`,
  `listening` state, a pulsing "● Listening…" indicator in place of the
  text input) — built separately from `ChatPanel`'s equivalent because this
  page doesn't use `ChatPanel` at all. Mirrors the same Web Speech API
  pattern, gracefully disabled (not hidden) on unsupported browsers.
- **Persistence**: its own session key and message history persisted to
  `localStorage` (`loadPersistedSessionKey`, `loadPersistedMessages`) — a
  page reload keeps the full conversation, including any appointment
  already booked in it, matching the main FAQ page's `persistKey` behavior
  but implemented independently since this page doesn't take a `ChatPanel`
  prop.

## Try it

Navigate directly to `http://localhost:5173/whatsapp-demo` (no login, no
nav link). See **TESTING.md, §4 "Internal/testing tools"**
([TESTING.md](../TESTING.md)) for a full walkthrough.
