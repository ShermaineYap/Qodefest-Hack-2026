from app.models import Check, RedactedPayload


# Deterministic floors (M1 subset), derived from the redacted payload's flags.
# localSignals are advisory only: the server re-derives its own signals so a
# stale or spoofed client cannot lower the verdict.
def evaluate(payload: RedactedPayload) -> tuple[int, list[Check]]:
    flags = payload.flags
    floors = [
        ("lookalike_characters", 80, flags.punycode or flags.mixedScript or flags.homoglyph),
        ("userinfo_obfuscation", 70, flags.userinfo),
        ("ip_literal", 60, flags.ipLiteral),
        ("shortener", 45, flags.shortener),
        ("suspicious_tld", 25, flags.suspiciousTld),
    ]

    score = 0
    checks: list[Check] = []
    for rule, floor, hit in floors:
        if hit:
            score = max(score, floor)
            checks.append(Check(rule=rule, floor=floor))
    return score, checks
