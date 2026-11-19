from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    enclave_url: str = os.environ.get("ENCLAVE_URL", "http://enclave:3100")
    enclave_timeout: float = float(os.environ.get("ENCLAVE_TIMEOUT", "8"))
    db_path: str = os.environ.get("DB_PATH", "./data/messages.db")


settings = Settings()
