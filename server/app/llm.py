"""Thin wrapper around the Groq-hosted OpenAI-compatible API.

Used for: streaming assistant/copilot chat, structured JSON analysis
(fraud explanations, AML narratives, case routing, underwriting summaries,
KYC recommendations), and structuring raw OCR text into named document
fields (the image itself is read locally by Tesseract — see app/ocr.py —
since this Groq account has no vision-capable model available).
"""
import json
from typing import AsyncGenerator, Optional

from openai import AsyncOpenAI

from .config import settings

client = AsyncOpenAI(
    api_key=settings.groq_api_key or "not-set",
    base_url="https://api.groq.com/openai/v1",
)


async def stream_chat(
    messages: list[dict[str, str]],
    system_prompt: str,
    temperature: float = 0.4,
) -> AsyncGenerator[str, None]:
    """Streams the model's reply, silently dropping any <think>...</think>
    reasoning block some Groq models emit before their real answer."""
    full_messages = [{"role": "system", "content": system_prompt}, *messages]

    buffer = ""
    in_think = False
    OPEN, CLOSE = "<think>", "</think>"

    try:
        stream = await client.chat.completions.create(
            model=settings.groq_model,
            messages=full_messages,
            temperature=temperature,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if not delta:
                continue
            buffer += delta

            while True:
                if in_think:
                    idx = buffer.find(CLOSE)
                    if idx == -1:
                        buffer = ""  # discard reasoning text, nothing safe to emit yet
                        break
                    buffer = buffer[idx + len(CLOSE):]
                    in_think = False
                    continue

                idx = buffer.find(OPEN)
                if idx == -1:
                    # Hold back a tail that could be the start of "<think>" split across chunks.
                    safe_len = max(0, len(buffer) - (len(OPEN) - 1))
                    if safe_len:
                        yield buffer[:safe_len]
                    buffer = buffer[safe_len:]
                    break

                if idx > 0:
                    yield buffer[:idx]
                buffer = buffer[idx + len(OPEN):]
                in_think = True

        if buffer and not in_think:
            yield buffer
    except Exception as exc:  # noqa: BLE001 - surface upstream failure to the client stream
        yield f"\n\n_(Assistant is temporarily unavailable: {exc})_"


def _strip_think(content: str) -> str:
    """Removes a <think>...</think> reasoning block some Groq models emit
    before their real (JSON) answer."""
    start = content.find("<think>")
    if start == -1:
        return content
    end = content.find("</think>", start)
    if end == -1:
        return content[:start]
    return content[:start] + content[end + len("</think>"):]


async def structured_completion(system_prompt: str, user_prompt: str, temperature: float = 0.2) -> dict:
    """Asks the LLM for a JSON answer and parses it. Doesn't rely on Groq's
    strict json_object response_format: some models on this account prefix
    their answer with a <think>...</think> block, which fails that mode's
    server-side validation before we ever see a response. Instead we prompt
    for JSON, strip any reasoning block, and parse leniently."""
    response = await client.chat.completions.create(
        model=settings.groq_model,
        messages=[
            {"role": "system", "content": f"{system_prompt}\n\nRespond with JSON only — no prose before or after it."},
            {"role": "user", "content": user_prompt},
        ],
        temperature=temperature,
        max_tokens=4096,
    )
    content = _strip_think(response.choices[0].message.content or "{}").strip()
    content = content.removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        start, end = content.find("{"), content.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(content[start : end + 1])
        raise


async def extract_document_fields(raw_text: str, ocr_confidence: int, field_hint: str) -> dict:
    """Structures raw OCR text (already extracted locally by Tesseract) into
    named fields with a confidence per field, using the Groq text model."""
    if not raw_text.strip():
        return {"fields": [], "error": "No legible text was found in the scan."}

    system_prompt = (
        "You are a document-understanding assistant for a bank. You are given raw "
        "OCR text extracted from a scanned document, plus the OCR engine's overall "
        "confidence for the scan. Map the OCR text onto the requested fields. Return "
        "ONLY a JSON object of the shape "
        '{"fields": [{"label": str, "value": str, "confidence": int 0-100}]}. '
        "Base each field's confidence on the OCR engine's confidence AND on how "
        "unambiguous that value is in the text — lower it if the text is garbled or "
        "the value is uncertain. If a field is not present in the text, omit it "
        "rather than guessing."
    )
    user_prompt = f"OCR engine confidence: {ocr_confidence}%\nRequested fields: {field_hint}\n\nOCR text:\n{raw_text}"

    try:
        parsed = await structured_completion(system_prompt, user_prompt, temperature=0.1)
        return parsed if isinstance(parsed, dict) else {"fields": []}
    except Exception as exc:  # noqa: BLE001
        return {"fields": [], "error": str(exc)}
