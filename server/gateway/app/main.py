from fastapi import FastAPI
from fastapi.responses import PlainTextResponse

from app.client import EnclaveClient, EnclaveUnavailable
from app.models import RiskRequest, Verdict

app = FastAPI(title="Lantern gateway")
enclave = EnclaveClient()


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


# Temporary connectivity check while the extension is not wired yet.
@app.get("/api/ping", response_class=PlainTextResponse)
def ping() -> str:
    return "ping"


# Transport only. The enclave owns redaction, rules and scoring.
@app.post("/risk/link", response_model=Verdict)
async def risk_link(req: RiskRequest) -> Verdict:
    try:
        return await enclave.score(req)
    except EnclaveUnavailable:
        return Verdict(tier="NOT_CHECKED", error="enclave_unavailable")
