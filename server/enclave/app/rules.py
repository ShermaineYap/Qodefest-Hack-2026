import re

from app.models import Check, RedactedPayload

# Deterministic floors, derived from the redacted payload.
# localSignals are advisory only: the server re-derives its own signals from
# `flags`, `host` and `registrable`, so a stale or spoofed client cannot lower
# the verdict. Brand and deny-list tables mirror extension/src/link.ts; change
# them together.

DENY_LIST = {
    "maybank-secure-login.xyz",
    "cimb-verify.top",
    "poslaju-fee.click",
    "tng-reload.top",
}

# token -> (label, official registrable domains)
BRANDS: dict[str, tuple[str, list[str]]] = {
    "maybank": ("Maybank", ["maybank.com.my", "maybank2u.com.my", "maybank.com"]),
    "cimb": ("CIMB", ["cimb.com.my", "cimbclicks.com.my", "cimb.com"]),
    "publicbank": ("Public Bank", ["publicbank.com.my", "pbebank.com"]),
    "rhb": ("RHB", ["rhbgroup.com", "rhb.com.my"]),
    "hongleong": ("Hong Leong Bank", ["hlb.com.my", "hongleongbank.com.my", "hongleongconnect.my"]),
    "ambank": ("AmBank", ["ambankgroup.com", "ambank.com.my"]),
    "bsn": ("BSN", ["bsn.com.my"]),
    "bimb": ("BIMB", ["bimb.com.my"]),
    "bankislam": ("Bank Islam", ["bankislam.com.my"]),
    "muamalat": ("Muamalat", ["muamalat.com.my"]),
    "touchngo": ("Touch 'n Go eWallet", ["touchngo.com.my", "tngdigital.com.my"]),
    "shopee": ("Shopee", ["shopee.com.my", "shopee.co.id", "shopee.sg"]),
    "lazada": ("Lazada", ["lazada.com.my", "lazada.co.id", "lazada.sg"]),
    "grab": ("Grab", ["grab.com", "grab.com.my", "grabpay.com"]),
    "lhdn": ("LHDN", ["lhdn.gov.my", "hasil.gov.my"]),
    "myeg": ("MyEG", ["myeg.com.my"]),
    "poslaju": ("PosLaju", ["poslaju.com.my", "pos.com.my"]),
    "dhl": ("DHL", ["dhl.com", "dhl.com.my"]),
    "fedex": ("FedEx", ["fedex.com"]),
    "ninjavan": ("Ninja Van", ["ninjavan.co", "ninjavan.co.id"]),
    "jnt": ("J&T Express", ["jtexpress.my", "jnt.com.my"]),
    "apple": ("Apple", ["apple.com", "icloud.com", "apple.com.my"]),
    "google": ("Google", ["google.com", "google.com.my", "gmail.com", "youtube.com"]),
    "microsoft": ("Microsoft", ["microsoft.com", "live.com", "office.com", "microsoftonline.com"]),
}

CREDENTIAL_PATHS = {"/login", "/verify", "/account"}


def find_brand(host: str, registrable: str) -> tuple[str, str] | None:
    """Return (label, real domain) when a brand name appears outside that brand's real domain."""
    compact = re.sub(r"[^a-z0-9]", "", host.lower())
    for token, (label, domains) in BRANDS.items():
        if token in compact and registrable.lower() not in domains:
            return label, domains[0]
    return None


def evaluate(payload: RedactedPayload) -> tuple[int, list[Check]]:
    flags = payload.flags
    host = payload.host.lower()
    registrable = payload.registrable.lower()
    brand = find_brand(host, registrable) if host else None

    floors = [
        ("deny_list", 95, registrable in DENY_LIST or host in DENY_LIST),
        ("brand_impersonation", 85, brand is not None),
        ("credential_harvest", 80, brand is not None and payload.pathShape in CREDENTIAL_PATHS),
        ("lookalike_characters", 80, flags.punycode or flags.mixedScript or flags.homoglyph),
        ("userinfo_obfuscation", 70, flags.userinfo),
        ("ip_literal", 60, flags.ipLiteral),
        ("insecure_login", 60, payload.scheme == "http" and payload.pathShape in CREDENTIAL_PATHS),
        ("shortener", 45, flags.shortener),
        ("open_redirect", 45, flags.openRedirect),
        ("suspicious_tld", 25, flags.suspiciousTld),
    ]

    score = 0
    checks: list[Check] = []
    for rule, floor, hit in floors:
        if hit:
            score = max(score, floor)
            checks.append(Check(rule=rule, floor=floor))
    return score, checks


def brand_of(payload: RedactedPayload) -> tuple[str, str] | None:
    return find_brand(payload.host, payload.registrable) if payload.host else None
