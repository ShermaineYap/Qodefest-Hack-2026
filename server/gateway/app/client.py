import httpx

from app.config import settings
from app.models import RiskRequest, Verdict


class EnclaveUnavailable(RuntimeError):
    pass


class EnclaveClient:
    def __init__(self, base_url: str | None = None, timeout: float | None = None) -> None:
        self._base_url = base_url or settings.enclave_url
        self._timeout = timeout or settings.enclave_timeout

    async def score(self, req: RiskRequest) -> Verdict:
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(f"{self._base_url}/score", json=req.model_dump())
                resp.raise_for_status()
                return Verdict.model_validate(resp.json())
        except (httpx.HTTPError, ValueError) as exc:
            raise EnclaveUnavailable(str(exc)) from exc
