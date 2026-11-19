from app.models import Flags, RedactedPayload
from app.rules import evaluate


def payload(**flags: bool) -> RedactedPayload:
    return RedactedPayload(v=1, host="example.com", flags=Flags(**flags))


def rules(url_payload: RedactedPayload) -> list[str]:
    _, checks = evaluate(url_payload)
    return [c.rule for c in checks]


def test_clean_payload_has_no_floors() -> None:
    score, checks = evaluate(payload())
    assert score == 0
    assert checks == []


def test_userinfo_floor() -> None:
    assert evaluate(payload(userinfo=True))[0] == 70
    assert "userinfo_obfuscation" in rules(payload(userinfo=True))


def test_ip_literal_floor() -> None:
    assert evaluate(payload(ipLiteral=True))[0] == 60
    assert "ip_literal" in rules(payload(ipLiteral=True))


def test_lookalike_floors_at_80() -> None:
    for flag in ("punycode", "mixedScript", "homoglyph"):
        assert evaluate(payload(**{flag: True}))[0] == 80
    assert "lookalike_characters" in rules(payload(punycode=True))


def test_shortener_floor() -> None:
    assert evaluate(payload(shortener=True))[0] == 45
    assert "shortener" in rules(payload(shortener=True))


def test_suspicious_tld_floor() -> None:
    assert evaluate(payload(suspiciousTld=True))[0] == 25


def test_worst_floor_wins() -> None:
    score, checks = evaluate(payload(userinfo=True, punycode=True))
    assert score == 80
    assert {c.rule for c in checks} == {"userinfo_obfuscation", "lookalike_characters"}


def test_local_signals_do_not_change_the_score() -> None:
    clean = RedactedPayload(v=1, host="example.com", localSignals=["deny_list"])
    assert evaluate(clean)[0] == 0
