from typing import Literal

from pydantic import BaseModel, Field

Tier = Literal["LOW", "MEDIUM", "HIGH", "NOT_CHECKED"]


class ScoreRequest(BaseModel):
    url: str = Field(min_length=1, max_length=8192)


class Check(BaseModel):
    rule: str
    floor: int


class Verdict(BaseModel):
    request_id: str
    tier: Tier
    score: int
    checks: list[Check] = Field(default_factory=list)
