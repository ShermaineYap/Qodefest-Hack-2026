from typing import Literal

from pydantic import BaseModel, Field

Tier = Literal["LOW", "MEDIUM", "HIGH", "NOT_CHECKED"]


class RiskRequest(BaseModel):
    url: str = Field(min_length=1, max_length=8192)


class Check(BaseModel):
    rule: str
    floor: int


class Verdict(BaseModel):
    request_id: str | None = None
    tier: Tier
    score: int | None = None
    checks: list[Check] = Field(default_factory=list)
    error: str | None = None
