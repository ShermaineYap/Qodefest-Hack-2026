import uuid

from app.models import ScoreRequest, Tier, Verdict
from app.rules import evaluate

HIGH_FLOOR = 80
MEDIUM_FLOOR = 45


def tier_for(score: int) -> Tier:
    if score >= HIGH_FLOOR:
        return "HIGH"
    if score >= MEDIUM_FLOOR:
        return "MEDIUM"
    return "LOW"


def score_url(req: ScoreRequest) -> Verdict:
    score, checks = evaluate(req.url)
    return Verdict(
        request_id=f"req_{uuid.uuid4().hex[:12]}",
        tier=tier_for(score),
        score=score,
        checks=checks,
    )
