from app.rules import evaluate


def rules(url: str) -> list[str]:
    _, checks = evaluate(url)
    return [c.rule for c in checks]


def test_clean_url_has_no_floors() -> None:
    score, checks = evaluate("https://maybank.com.my/login")
    assert score == 0
    assert checks == []


def test_userinfo_obfuscation_floor() -> None:
    score, _ = evaluate("https://maybank.com.my@evil.xyz/login")
    assert score >= 70
    assert "userinfo_obfuscation" in rules("https://maybank.com.my@evil.xyz/login")


def test_ip_literal_floor() -> None:
    score, _ = evaluate("http://192.168.0.1/login")
    assert score >= 60
    assert "ip_literal" in rules("http://192.168.0.1/login")


def test_punycode_floor() -> None:
    score, _ = evaluate("https://xn--80ak6aa92e.com/login")
    assert score >= 80
    assert "punycode_host" in rules("https://xn--80ak6aa92e.com/login")


def test_unicode_host_encodes_to_punycode() -> None:
    # Cyrillic "м" instead of ASCII "m" in maybank
    assert "punycode_host" in rules("https://\u043caybank.com.my/login")


def test_worst_floor_wins() -> None:
    score, _ = evaluate("https://192.168.0.1@xn--80ak6aa92e.com/login")
    assert score == 80
