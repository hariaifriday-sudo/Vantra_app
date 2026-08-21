# Test Fixtures

**`sample_id.png`** — a synthetic, clearly-labeled fake ID (not a real
document, no real person) with clean printed text: name, DOB, address,
ID number, nationality, occupation. Generated with Pillow, not scanned
from anything real.

Use it to test the OCR + LLM extraction pipeline without needing a real
document handy — see [TESTING.md](../../TESTING.md) §2.2 and §3.5.

```bash
curl -s -X POST "http://localhost:8000/api/documents/extract?kind=kyc" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@server/tests/fixtures/sample_id.png;type=image/png"
```

Expect all six fields extracted at ~95% confidence — if confidence is
much lower than that on this specific fixture, something's wrong with
the OCR setup (see SETUP.md's troubleshooting table), not with the
image.
