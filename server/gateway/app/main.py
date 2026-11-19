from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse

from app.client import EnclaveClient, EnclaveUnavailable
from app.models import RedactedPayload, Verdict

app = FastAPI(title="Lantern gateway")
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
