import ipaddress
from dataclasses import dataclass
from urllib.parse import urlparse

from app.models import Check


@dataclass(frozen=True)
class HostFacts:
    host: str
    has_userinfo: bool
    is_ip_literal: bool
    is_punycode: bool


def host_facts(url: str) -> HostFacts:
    parsed = urlparse(url if "://" in url else f"http://{url}")
    host = (parsed.hostname or "").lower()
    return HostFacts(
        host=host,
        has_userinfo=bool(parsed.username or parsed.password),
        is_ip_literal=_is_ip_literal(host),
        is_punycode=_is_punycode(host),
    )


def _is_ip_literal(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        return False


def _is_punycode(host: str) -> bool:
    try:
        return host.startswith("xn--") or host.encode("idna").decode().startswith("xn--")
    except UnicodeError:
        return True


# Deterministic floors (M1 subset). Score is a floor, never a ceiling.
def evaluate(url: str) -> tuple[int, list[Check]]:
    facts = host_facts(url)
    score = 0
    checks: list[Check] = []

    def floor(rule: str, value: int) -> None:
        nonlocal score
        score = max(score, value)
        checks.append(Check(rule=rule, floor=value))

    if facts.has_userinfo:
        floor("userinfo_obfuscation", 70)
    if facts.is_ip_literal:
        floor("ip_literal", 60)
    if facts.is_punycode:
        floor("punycode_host", 80)

    return score, checks
