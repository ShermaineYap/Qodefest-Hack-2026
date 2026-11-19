from app.models import Flags, RedactedPayload
from app.scoring import score_payload, tier_for


def test_tier_boundaries() -> None:
    assert tier_for(0) == "low"
    assert tier_for(44) == "low"
    assert tier_for(45) == "medium"
    assert tier_for(79) == "medium"
    assert tier_for(80) == "high"
    assert tier_for(100) == "high"


def test_verdict_shape_matches_extension_client() -> None:
    verdict = score_payload(RedactedPayload(v=1, host="xn--80ak6aa92e.com", flags=Flags(punycode=True)))
    assert verdict.tier == "high"
    assert verdict.score == 80
    assert verdict.request_id.startswith("req_")
    assert verdict.headline
    assert verdict.sentences
    assert verdict.checked
    assert verdict.held_for_review is False


def test_clean_payload_is_low() -> None:
    verdict = score_payload(RedactedPayload(v=1, host="example.com"))
    assert verdict.tier == "low"
    assert verdict.score == 0
