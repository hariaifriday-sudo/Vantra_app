from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, engine
from .routers import accounts, aml, audit, auth, banking, cases, chat, documents, fraud, kyc, notifications, overview, policies, public, underwriting

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Vantra Bank API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(notifications.router)
app.include_router(kyc.router)
app.include_router(documents.router)
app.include_router(fraud.router)
app.include_router(aml.router)
app.include_router(cases.router)
app.include_router(underwriting.router)
app.include_router(policies.router)
app.include_router(audit.router)
app.include_router(chat.router)
app.include_router(overview.router)
app.include_router(banking.router)
app.include_router(public.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
