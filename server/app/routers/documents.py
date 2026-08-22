from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import actions, models, schemas
from ..actions import ActionError
from ..database import get_db
from ..deps import get_current_user
from ..llm import extract_document_fields
from ..ocr import extract_text
from ..security import decode_access_token

router = APIRouter(prefix="/api/documents", tags=["documents"])


def _user_from_query_token(token: str, db: Session) -> models.User:
    """Auth via a query-string token instead of a header — needed because these
    endpoints are opened as plain browser links (PDF download), which can't set
    an Authorization header. Mirrors the pattern already used by /api/chat/stream."""
    try:
        payload = decode_access_token(token)
        user = db.get(models.User, int(payload["sub"]))
    except Exception:  # noqa: BLE001
        user = None
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired link")
    return user


def _pdf_response(pdf_bytes: bytes, filename: str) -> Response:
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/statement")
def download_statement(
    token: str,
    account: str | None = Query(None, description="Account name to match, e.g. 'checking'"),
    period: str = Query("last_30_days"),
    db: Session = Depends(get_db),
):
    user = _user_from_query_token(token, db)
    try:
        pdf_bytes, filename = actions.generate_statement_pdf(db, user, account, period)
    except ActionError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    return _pdf_response(pdf_bytes, filename)


@router.get("/interest-certificate")
def download_interest_certificate(token: str, year: int | None = None, db: Session = Depends(get_db)):
    user = _user_from_query_token(token, db)
    try:
        pdf_bytes, filename = actions.generate_interest_certificate_pdf(db, user, year)
    except ActionError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    return _pdf_response(pdf_bytes, filename)


@router.get("/tax-certificate")
def download_tax_certificate(token: str, year: int | None = None, db: Session = Depends(get_db)):
    user = _user_from_query_token(token, db)
    try:
        pdf_bytes, filename = actions.generate_tax_certificate_pdf(db, user, year)
    except ActionError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    return _pdf_response(pdf_bytes, filename)

KYC_FIELD_HINT = "full name, date of birth, residential address, government ID number, nationality, occupation"
LOAN_FIELD_HINT = "business or applicant name, tax ID or EIN, annual revenue, requested loan amount, collateral description"

MAX_UPLOAD_BYTES = 8 * 1024 * 1024


@router.post("/extract", response_model=schemas.DocumentExtractResponse)
async def extract(
    file: UploadFile = File(...),
    kind: str = Query("kyc", pattern="^(kyc|loan)$"),
    user: models.User = Depends(get_current_user),
):
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Upload a JPG, PNG, or WEBP scan of the document")

    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File is too large (8MB max)")

    hint = KYC_FIELD_HINT if kind == "kyc" else LOAN_FIELD_HINT

    ocr = extract_text(data)
    if not ocr.text.strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No legible text found in that scan — try a clearer, well-lit photo.")

    result = await extract_document_fields(ocr.text, ocr.avg_confidence, hint)

    fields = [
        schemas.DocumentExtractField(label=f.get("label", ""), value=f.get("value", ""), confidence=int(f.get("confidence", 50)))
        for f in result.get("fields", [])
        if f.get("label") and f.get("value")
    ]
    if not fields and result.get("error"):
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Document extraction failed: {result['error']}")

    return schemas.DocumentExtractResponse(fields=fields, raw_text=ocr.text)


@router.get("/link-search", response_model=list[schemas.AccountMatchOut])
def link_search(q: str, _: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not q or len(q) < 2:
        return []
    matches = (
        db.query(models.User)
        .filter(models.User.role == "account_holder")
        .filter(or_(models.User.full_name.ilike(f"%{q}%"), models.User.email.ilike(f"%{q}%")))
        .limit(5)
        .all()
    )
    out = []
    for m in matches:
        name_ratio = _similarity(q.lower(), m.full_name.lower())
        out.append(schemas.AccountMatchOut(name=m.full_name, account_ref=f"ACC-{80000 + m.id}", match=name_ratio))
    return sorted(out, key=lambda x: -x.match)


def _similarity(a: str, b: str) -> int:
    """Cheap token-overlap similarity score (0-100), no extra dependency needed."""
    a_tokens, b_tokens = set(a.split()), set(b.split())
    if not a_tokens or not b_tokens:
        return 40
    overlap = len(a_tokens & b_tokens) / len(a_tokens | b_tokens)
    return max(40, min(99, int(overlap * 100) + 40))
