"""Local OCR via Tesseract. Runs entirely on this machine — no image data
leaves the server. Structuring the raw text into named fields is handled
separately by the Groq text model (see llm.structured_completion)."""
import io
import os
import shutil

import pytesseract
from PIL import Image

from .config import settings

_DEFAULT_WINDOWS_PATH = r"C:\Program Files\Tesseract-OCR\tesseract.exe"


def _resolve_tesseract_cmd() -> str | None:
    if settings.tesseract_cmd:
        return settings.tesseract_cmd
    if shutil.which("tesseract"):
        return shutil.which("tesseract")
    if os.name == "nt" and os.path.exists(_DEFAULT_WINDOWS_PATH):
        return _DEFAULT_WINDOWS_PATH
    return None


_cmd = _resolve_tesseract_cmd()
if _cmd:
    pytesseract.pytesseract.tesseract_cmd = _cmd


class OcrResult:
    def __init__(self, text: str, avg_confidence: int):
        self.text = text
        self.avg_confidence = avg_confidence


def extract_text(image_bytes: bytes) -> OcrResult:
    image = Image.open(io.BytesIO(image_bytes))
    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")

    data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
    words = [w for w in data["text"] if w.strip()]
    confidences = [int(c) for c, w in zip(data["conf"], data["text"]) if w.strip() and int(c) >= 0]

    text = " ".join(words)
    avg_confidence = round(sum(confidences) / len(confidences)) if confidences else 0
    return OcrResult(text=text, avg_confidence=avg_confidence)
