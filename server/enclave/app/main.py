from fastapi import FastAPI

from app.models import RedactedPayload, Verdict
from app.scoring import score_payload

app = FastAPI(title="Lantern enclave")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/score", response_model=Verdict)
def score(payload: RedactedPayload) -> Verdict:
    return score_payload(payload)
