from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import PlainTextResponse

from app.agent import AgentUnavailable, analyze
from app.client import EnclaveClient, EnclaveUnavailable
from app.config import settings
from app.db import init_db, insert_message, list_messages
from app.insights import admin_chat
from app.models import (
    AdminAnswer,
    AdminQuestion,
    AgentMessage,
    RedactedPayload,
    StoredMessage,
    Verdict,
)


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


# Message check: one model call (text or screenshot), then a fingerprint lookup against stored
# scams to label the verdict new_scam or known_scam. Fail-closed: if the model is unreachable
# the client gets 503, not a made-up answer.
@app.post("/agent/message", response_model=StoredMessage, status_code=201)
async def agent_message(message: AgentMessage) -> StoredMessage:
    try:
        analysis = await analyze(message)
    except AgentUnavailable:
        raise HTTPException(status_code=503, detail="agent_unavailable")
    received_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    return insert_message(settings.db_path, message, analysis, received_at)


@app.get("/agent/messages")
def agent_messages(limit: int = Query(20, ge=1, le=100)) -> list[dict]:
    return list_messages(settings.db_path, limit)


# Admin console: natural-language questions over the same message log. The
# endpoint stays inside the gateway's /agent proxy prefix.
@app.post("/agent/admin/chat", response_model=AdminAnswer)
async def agent_admin_chat(body: AdminQuestion) -> AdminAnswer:
    return await admin_chat(settings.db_path, body)
