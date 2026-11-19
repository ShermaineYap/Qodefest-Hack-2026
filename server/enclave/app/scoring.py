import uuid

from app.models import RedactedPayload, Tier, Verdict
from app.rules import evaluate

HIGH_FLOOR = 80
MEDIUM_FLOOR = 45

COPY = {
    "high": {
        "headline": "This looks like a scam link. Do not enter your password or bank details.",
        "sentences": [
            "The address shows several warning signs.",
            "Do not enter your password or bank details.",
        ],
        "checked": ["domain", "path type", "lookalike characters", "local rules"],
    },
    "medium": {
        "headline": "This link looks off. Open it only if you were expecting it.",
        "sentences": [
            "Some details of this address look unusual.",
            "Open it only if you were expecting it.",
        ],
        "checked": ["domain", "path type", "lookalike characters", "local rules"],
    },
    "low": {
        "headline": "Nothing unusual about this link.",
        "sentences": ["The address did not match any known scam patterns."],
        "checked": ["domain", "local rules"],
    },
}


def tier_for(score: int) -> Tier:
    if score >= HIGH_FLOOR:
        return "high"
    if score >= MEDIUM_FLOOR:
        return "medium"
    return "low"


def score_payload(payload: RedactedPayload) -> Verdict:
    score, checks = evaluate(payload)
    tier = tier_for(score)
    copy = COPY[tier]
    return Verdict(
        request_id=f"req_{uuid.uuid4().hex[:12]}",
        tier=tier,
        score=score,
        headline=copy["headline"],
        sentences=copy["sentences"],
        checked=copy["checked"],
        category=None,
        held_for_review=False,
        checks=checks,
    )
