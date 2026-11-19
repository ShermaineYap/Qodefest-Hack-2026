from typing import Literal

from pydantic import BaseModel, Field

Tier = Literal["low", "medium", "high"]


class Flags(BaseModel):
    ipLiteral: bool = False
    punycode: bool = False
    mixedScript: bool = False
    homoglyph: bool = False
    userinfo: bool = False
    shortener: bool = False
    suspiciousTld: bool = False
    hyphenHeavy: bool = False
    openRedirect: bool = False


class RedactedPayload(BaseModel):
    v: int
    scheme: str = ""
    host: str = ""
    registrable: str = ""
    tld: str = ""
    subdomainCount: int = 0
    pathShape: str = ""
    flags: Flags = Field(default_factory=Flags)
    localSignals: list[str] = Field(default_factory=list)
    redactions: dict[str, int] = Field(default_factory=dict)


class Check(BaseModel):
    rule: str
    floor: int


class Verdict(BaseModel):
    request_id: str
    tier: Tier
    score: int
    headline: str
    sentences: list[str]
    checked: list[str]
    category: str | None = None
    held_for_review: bool = False
    checks: list[Check] = Field(default_factory=list)
