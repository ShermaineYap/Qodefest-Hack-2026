import uuid

from app.models import RedactedPayload, Tier, Verdict
from app.rules import brand_of, evaluate

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


def rule_sentence(rule: str, payload: RedactedPayload) -> str | None:
    brand = brand_of(payload)
    label, real = brand if brand else ("", "")
    return {
        "deny_list": "This address is on a known-scam list.",
        "brand_impersonation": f"The address mentions {label}, but {label}'s real address is {real}.",
        "credential_harvest": f"It asks for a {label} login on an address that is not {label}'s.",
        "lookalike_characters": "The address uses lookalike letters to copy a familiar name.",
        "userinfo_obfuscation": "The address hides where it really goes before the @ sign.",
        "ip_literal": "The address goes to a number instead of a name.",
        "insecure_login": "It asks you to sign in without a secure connection.",
        "shortener": "This is a short link, so the real destination is hidden.",
        "open_redirect": "The address can forward you somewhere else.",
        "suspicious_tld": f"Addresses ending in .{payload.tld} are often used by throwaway scam sites.",
    }.get(rule)


def score_payload(payload: RedactedPayload) -> Verdict:
    score, checks = evaluate(payload)
    tier = tier_for(score)
    copy = COPY[tier]
    evidence = [s for s in (rule_sentence(c.rule, payload) for c in sorted(checks, key=lambda c: -c.floor)) if s]
    return Verdict(
        request_id=f"req_{uuid.uuid4().hex[:12]}",
        tier=tier,
        score=score,
        headline=copy["headline"],
        sentences=(evidence[:3] + copy["sentences"][-1:]) if evidence and tier != "low" else copy["sentences"],
        checked=copy["checked"],
        category=None,
        held_for_review=False,
        checks=checks,
    )
