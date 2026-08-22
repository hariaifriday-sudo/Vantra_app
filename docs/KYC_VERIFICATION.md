# KYC Verification

The identity-verification flow for account holders: upload an ID → real OCR
→ LLM-structured fields → customer review/edit → signature → submit → AI
recommendation → agent decision → customer notified. Every step after the
upload is real (real OCR, real LLM calls, real DB rows) — nothing in this
flow is mocked.

## Where to find it

- Customer flow: `/app/kyc` — `src/pages/account/Kyc.tsx`
- Agent review: `/agent/kyc` — `src/pages/agent/KycReview.tsx`
- Backend: `server/app/routers/kyc.py`, document extraction in
  `server/app/routers/documents.py` + `server/app/ocr.py`
- Data model: `KycApplication` in `server/app/models.py`

## The customer flow, step by step

1. **Upload** — a dropzone accepts a JPG/PNG/WEBP of any ID-like document
   (max 8MB). Calls `POST /api/documents/extract?kind=kyc`.
2. **OCR** — `ocr.py` runs local **Tesseract** (`pytesseract.image_to_data`)
   to get raw text plus an averaged word-level confidence score. No cloud
   vision API is used (see the README's "Why OCR is Tesseract + LLM" note).
3. **LLM structuring** — the raw OCR text, OCR confidence, and a field hint
   ("full name, date of birth, residential address, government ID number,
   nationality, occupation") go to the Groq model via `structured_completion`,
   which returns `{"fields":[{"label","value","confidence"}]}`. The prompt
   explicitly folds in OCR confidence and tells the model to omit fields it
   can't find rather than invent them.
4. **AI Review step** — the customer sees the extracted fields with
   color-coded confidence pills (High/Medium/Low) and can edit any of them
   before continuing. The step is blocked if zero fields were extracted.
5. **Confirm & Sign** — an authorization checkbox plus a real HTML5 `<canvas>`
   signature pad (`src/components/assistant/SignaturePad.tsx`, freehand
   pointer-event drawing). Submit is disabled until both are done.
6. **Submit** — `POST /api/kyc/{kyc_id}/submit` with `{fields, confidences,
   signed}`. This is where the **AI recommendation** is generated (see
   below), the application status becomes `pending`, and the customer lands
   on a "Pending Bank Review" card with a real case reference (`KYC-40001`
   style, `case_ref = f"KYC-{40000+id}"`).

## The AI recommendation

Generated synchronously at submit time, grounded directly in what the
customer actually entered — the prompt is fed `f"Extracted fields and
confidences: {fields} / {confidences}"` verbatim, not a generic description.
It returns `{"recommendation": "Approve"|"Request More Info"|"Reject",
"notes": "..."}`, and is instructed to be conservative: recommend "Request
More Info" if any field's confidence is under 75 or something looks
inconsistent/implausible. If the LLM call fails for any reason, the
recommendation is just left `null` — submission is never blocked by an AI
outage.

## Agent review

`/agent/kyc` lists everything with status `pending` or `needs_info`
(`GET /api/kyc/queue`). Opening one shows the AI recommendation pill and
notes alongside the customer's submitted fields and their confidence scores,
plus a notes textarea and three actions — **Approve**, **Request More
Information**, **Reject** (`POST /api/kyc/{kyc_id}/decision`). Every
decision, regardless of which one, creates a real in-app `Notification` for
the customer and an `AuditLog` row — the agent's action is never silent.

## Re-verification ("re-KYC")

If a customer's existing application is `needs_info`, `rejected`, or even
already `approved`, they still see a status card with a button to start
again ("Resubmit documents" / "Try again" / "Start a new verification").
This reuses the same `kycId`/`case_ref` rather than creating a new
application, resets the wizard to step one, and submitting again
unconditionally overwrites the fields and resets status to `pending` — the
backend places no guard on re-submitting from any prior state, so a
previously-approved customer can genuinely re-verify.

## What's real vs. what's a demo simplification

Real: OCR, LLM field structuring, LLM recommendation, agent decisions,
customer notifications, audit logging, re-verification.

Simplified for the demo: the signature pad only tracks a boolean ("did the
customer draw something") — the actual strokes/canvas image are never
captured, converted, or persisted anywhere. A `KycDocument` model exists in
`models.py` for storing the uploaded scan itself, but it's never
instantiated — only the LLM-extracted *fields* survive; the original image
is not saved to disk or DB after extraction.

## Try it

See **TESTING.md, §2.2 "KYC Automation"** (customer flow, using the bundled
`server/tests/fixtures/sample_id.png` if you don't have a document handy)
and **§3.2 "KYC Review"** (agent review) — both in [TESTING.md](../TESTING.md).
