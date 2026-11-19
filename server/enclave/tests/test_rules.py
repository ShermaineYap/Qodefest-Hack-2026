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


def url_payload(host: str, registrable: str, path: str = "", scheme: str = "https", **flags: bool) -> RedactedPayload:
    return RedactedPayload(v=1, scheme=scheme, host=host, registrable=registrable, pathShape=path, flags=Flags(**flags))


def test_brand_outside_its_domain_is_high() -> None:
    p = url_payload("maybank-secure-login.xyz", "maybank-secure-login.xyz", "/login", suspiciousTld=True)
    score, _ = evaluate(p)
    assert score >= 85
    assert {"deny_list", "brand_impersonation", "credential_harvest"} <= set(rules(p))


def test_brand_lookalike_not_on_deny_list_is_still_high() -> None:
    p = url_payload("secure.maybank-update.com", "maybank-update.com", "/account")
    assert evaluate(p)[0] == 85


def test_real_brand_domain_has_no_brand_floor() -> None:
    p = url_payload("www.maybank2u.com.my", "maybank2u.com.my", "/login")
    assert evaluate(p)[0] == 0


def test_insecure_login_floor() -> None:
    p = url_payload("example.com", "example.com", "/login", scheme="http")
    assert evaluate(p)[0] == 60
