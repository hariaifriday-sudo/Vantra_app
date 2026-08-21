# Running Vantra on a New Machine

Everything you need to get Vantra running from a fresh clone — no prior context assumed.

## Prerequisites

| Tool | Version | Check with |
|---|---|---|
| Node.js | 20+ | `node -v` |
| Python | 3.11+ | `python --version` (Windows) / `python3 --version` (macOS/Linux) |
| Tesseract OCR | 5.x | `tesseract --version` |
| A Groq API key | — | free at [console.groq.com](https://console.groq.com) |

Vantra has no other external dependencies — the database is a local SQLite file created by the seed script, and there's no cloud service to provision.

## 1. Clone and install Tesseract

```bash
git clone <this-repo-url>
cd vantra-app
```

**Windows:**
```powershell
winget install --id UB-Mannheim.TesseractOCR -e
```
Default install path is `C:\Program Files\Tesseract-OCR\tesseract.exe` — you'll point the backend at this in step 3 if it's not on your `PATH`.

**macOS:**
```bash
brew install tesseract
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt-get install tesseract-ocr
```

On macOS/Linux, `tesseract` typically lands on `PATH` automatically — you can leave `TESSERACT_CMD` unset in step 3.

## 2. Backend

```bash
cd server
python -m venv venv
```

Activate the virtual environment:
- Windows: `venv\Scripts\activate`
- macOS/Linux: `source venv/bin/activate`

Install dependencies:
```bash
pip install -r requirements.txt
```

## 3. Configure the backend

```bash
cp .env.example .env      # macOS/Linux
copy .env.example .env    # Windows
```

Open `server/.env` and fill in:

```env
GROQ_API_KEY=gsk_your_real_key_here
GROQ_MODEL=qwen/qwen3.6-27b
TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe   # Windows only — delete this line on macOS/Linux if tesseract is on PATH
JWT_SECRET=<generate one below>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
DATABASE_URL=sqlite:///./vantra.db
CORS_ORIGINS=http://localhost:5173
```

Generate a random `JWT_SECRET` (don't reuse the example value or anyone's demo key):
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Get a `GROQ_API_KEY` at [console.groq.com/keys](https://console.groq.com/keys) — the free tier is sufficient for this app.

## 4. Seed the database and start the backend

Still inside `server/` with the virtual environment active:

```bash
python -m app.seed
uvicorn app.main:app --port 8000 --reload
```

You should see `Application startup complete.` and two demo logins printed by the seed script. Leave this running in its own terminal.

## 5. Frontend

Open a **second terminal** at the project root (`vantra-app/`, not `server/`):

```bash
npm install
cp .env.example .env      # macOS/Linux — copy .env.example → .env
copy .env.example .env    # Windows
npm run dev
```

The default `.env` (`VITE_API_BASE=http://localhost:8000`) is correct as long as the backend is running on port 8000 on the same machine — no edits needed for local use.

Open **http://localhost:5173**.

## 6. Log in

| Role | Email | Password |
|---|---|---|
| Account Holder | `maren@vantra.bank` | `VantraDemo123!` |
| Bank Agent | `dana.reyes@vantra.bank` | `VantraDemo123!` |

See [TESTING.md](TESTING.md) for a full feature-by-feature walkthrough once you're in.

## Running on a different machine than the one you develop on

If the frontend and backend run on **separate machines** (not just separate terminals on one machine):
1. On the backend machine, set `CORS_ORIGINS` in `server/.env` to the frontend's actual origin (e.g. `http://192.168.1.50:5173`), not `localhost`.
2. On the frontend machine, set `VITE_API_BASE` in the root `.env` to the backend's reachable address (e.g. `http://192.168.1.40:8000`).
3. Restart both after changing `.env` files — Vite and Uvicorn only read them at startup.

## Troubleshooting

| Symptom | Fix |
|---|---|
| KYC/document upload fails with a 415 or extraction error | Confirm `tesseract --version` works in the same terminal the backend runs in; on Windows, double-check `TESSERACT_CMD` points at the real `.exe` path. |
| Chat/AI features return a 502 or "temporarily unavailable" | `GROQ_API_KEY` is missing, invalid, or rate-limited — check `server/.env` and the terminal running Uvicorn for the actual error. |
| Frontend loads but every API call fails / CORS errors in the browser console | `CORS_ORIGINS` in `server/.env` doesn't match the URL the frontend is actually served from, or the backend isn't running. |
| "Database already seeded — skipping" but data looks wrong or old | Delete `server/vantra.db`, then re-run `python -m app.seed`. |
| Port 5173 or 8000 already in use | Something else is bound to that port — stop it, or run Vite on another port (`npm run dev -- --port 5174`) and update `CORS_ORIGINS` / `VITE_API_BASE` to match. |
