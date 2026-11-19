from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

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


class AgentMessage(BaseModel):
    model_config = ConfigDict(extra="allow")

    v: int = 1
    client: str = ""
    kind: str = ""
    text: str = Field(default="", max_length=8000)
    url: str = Field(default="", max_length=2048)
    ts: str = ""
    image: str = Field(default="", max_length=6_000_000)

    @field_validator("image")
    @classmethod
    def validate_image(cls, value: str) -> str:
        if not value:
            return value
        if not value.startswith(("data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64,")):
            raise ValueError("image must be a png, jpeg or webp data URL")
        return value


AnalysisStatus = Literal["scam", "not_scam", "unsure"]


class Analysis(BaseModel):
    status: AnalysisStatus
    reply: str
    reasons: list[str] = Field(default_factory=list)
    model: str = ""
    elapsed_ms: int = 0


class StoredMessage(BaseModel):
    id: int
    received_at: str
    status: AnalysisStatus | None = None
    reply: str = ""
    reasons: list[str] = Field(default_factory=list)
    model: str = ""

