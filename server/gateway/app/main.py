from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import PlainTextResponse

from app.client import EnclaveClient, EnclaveUnavailable
from app.config import settings
from app.db import init_db, insert_message, list_messages
from app.models import AgentMessage, RedactedPayload, StoredMessage, Verdict


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db(settings.db_path)
    yield


app = FastAPI(title="Lantern gateway", lifespan=lifespan)
enclave = EnclaveClient()


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


# Temporary connectivity check while the extension is not wired yet.
@app.get("/api/ping", response_class=PlainTextResponse)
def ping() -> str:
    return "ping"


# Transport only. The enclave owns redaction checks, rules and scoring.
# A non-2xx response tells the extension to render NOT CHECKED (fail closed).
@app.post("/risk/link", response_model=Verdict)
async def risk_link(payload: RedactedPayload) -> Verdict:
    try:
        return await enclave.score(payload)
    except EnclaveUnavailable:
        raise HTTPException(status_code=503, detail="enclave_unavailable")


# Dummy agent endpoint: store what the extension sends, no agent call yet.
@app.post("/agent/message", response_model=StoredMessage, status_code=201)
def agent_message(message: AgentMessage) -> StoredMessage:
    received_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    return insert_message(settings.db_path, message, received_at)


@app.get("/agent/messages")
def agent_messages(limit: int = Query(20, ge=1, le=100)) -> list[dict]:
    return list_messages(settings.db_path, limit)
