# Chatbot Experience

The chat UI itself — one shared component, three different "brains" behind
it depending on where it's opened. This doc covers the interaction design
and architecture that's common across all of them; for what each specific
assistant can *do*, see [FAQ_ASSISTANT.md](FAQ_ASSISTANT.md) and the "Chat
assistants" section of the main [README](../README.md).

## One component, three contexts

Every chat surface in the app — the public FAQ assistant, the docked
account-holder assistant, and the internal Agent Copilot — is the same
`ChatPanel` component (`src/components/assistant/ChatPanel.tsx`), just
mounted with a different `context` prop:

| Context | Where | Authenticated? | Backend behavior |
|---|---|---|---|
| `faq` | `/assistant`, public | No | Tool-calling (`FAQ_TOOLS`) — branch lookup, appointment booking, escalation |
| `account` | Docked on every `/app/*` page | Yes | Tool-calling (`ACCOUNT_TOOLS`) — goals, transfers, payments, documents, test-data simulation, all grounded in the real logged-in customer's data |
| `agent_copilot` | Floating orb on every `/agent/*` page | Yes | **No tool-calling** — RAG-grounded plain streaming. Every message runs a similarity search over the policy library first (`app/rag.py`), and answers cite the retrieved policy text plus the agent's real open-queue counts (AML/Fraud/KYC/cases) |

One component, one visual language, one streaming pipeline — the difference
is entirely server-side, in which system prompt and which tools (if any)
`routers/chat.py` wires up for that context.

## Streaming

`GET /api/chat/stream?message=...&session_key=...&context=...&token=...` —
a plain `text/plain` streaming response (not SSE, not websockets), read on
the frontend with `response.body.getReader()` and appended token-by-token to
the last message in state. Chosen deliberately over `EventSource` so it
works with a normal `fetch()` call and needs no extra CORS/auth-header
plumbing — the token rides as a query param instead of a header.

## Tool-calling and the "never trust the model with exact data" rule

For `account` and `faq` contexts, `stream_chat_with_tools` runs an
OpenAI-style function-calling loop (`server/app/llm.py`) — non-streaming
per-round (Groq's streamed tool-call deltas were unreliable to reassemble),
with the final natural-language answer streamed back once tool calls
resolve.

The important design rule: anything the UI needs to render *exactly right*
— a transfer amount, an account ID, a real download URL, a branch address,
a Google Maps link — is **never left to the model to reproduce in prose**.
Tools that produce this kind of data write it into a server-side
`artifacts` dict, and after the model's reply finishes streaming,
`routers/chat.py` appends one or more fenced blocks:

```
```vantra:approve-transfer
{"pending_transfer_id": 42, "to": "...", "amount": 50, "from_account": "..."}
```
```

The frontend (`extractVantraBlocks` in `ChatPanel.tsx`) strips these out of
the displayed text and renders the matching real component instead:
`vantra:approve-transfer` → `TransferApprovalCard`, `vantra:branches` →
`BranchResultsCard`, `vantra:appointment-form` → `AppointmentBookingCard`.
The model only ever has to *decide* to call a tool and describe the result
in words — the actual numbers/links on screen come from the database, every
time.

## Voice in and out

- **Input**: the mic button uses the browser's native `SpeechRecognition`
  (Chrome/Edge) — transcribes and auto-sends. Gracefully disabled (not
  hidden) with a tooltip on unsupported browsers.
- **Output**: a speaker toggle uses `window.speechSynthesis` to read replies
  aloud — entirely client-side, no backend involved, and it speaks the
  *cleaned* text (fenced `vantra:` blocks stripped first, so it never reads
  raw JSON aloud). A `ChatPanel` prop, `onSpeakingChange`, fires when speech
  starts/stops so a parent page can react — the FAQ Assistant page uses this
  to pulse a ring over the hero robot while it's "talking."

## Persistence

Pass a `persistKey` prop and the conversation survives a page reload —
messages are mirrored to `localStorage` under `vantra_chat_<key>` on every
change and reloaded on mount. Used on the public FAQ page (visitors
shouldn't lose a half-finished appointment-booking conversation on a
refresh); the docked account/agent widgets don't set it, so those reset per
session by design.

## Markdown rendering

Replies render through `react-markdown` + `remark-gfm` — tables, bold,
lists, and links all work, with tables wrapped in a horizontally-scrollable
container for mobile. The system prompt for every context includes the same
formatting guidance: short answers by default, a real Markdown table for
anything with several numbers, bold the 1–2 numbers that matter, no filler
preamble.

## Key files

| Concern | File |
|---|---|
| The chat UI itself | `src/components/assistant/ChatPanel.tsx` |
| Avatar | `src/components/assistant/AssistantOrb.tsx` |
| Inline action cards | `src/components/assistant/TransferApprovalCard` (in ChatPanel.tsx), `BranchResultsCard.tsx`, `AppointmentBookingCard.tsx` |
| Streaming endpoint + system prompts | `server/app/routers/chat.py` |
| Account-holder tools | `server/app/chat_tools.py` (`ACCOUNT_TOOLS`, `build_executor`) |
| FAQ tools | `server/app/chat_tools.py` (`FAQ_TOOLS`, `build_faq_executor`) |
| Tool-calling loop | `server/app/llm.py` (`stream_chat_with_tools`) |
| Policy RAG (Agent Copilot) | `server/app/rag.py` |

## Try it

Each context has its own walkthrough in [TESTING.md](../TESTING.md): §1.2
"FAQ & AI Assistant" (FAQ), §2.6 "Account Assistant chat" (account), §3.9
"Vantra Copilot" (Agent Copilot).
