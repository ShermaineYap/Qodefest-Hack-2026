from fastapi import FastAPI

from app.models import ScoreRequest, Verdict
from app.scoring import score_url

app = FastAPI(title="Lantern enclave")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/score", response_model=Verdict)
def score(req: ScoreRequest) -> Verdict:
    return score_url(req)
