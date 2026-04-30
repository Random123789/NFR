"""Configuration management using environment variables."""

from dataclasses import dataclass
from pathlib import Path
import os

from dotenv import load_dotenv


load_dotenv(dotenv_path=Path(__file__).resolve().with_name(".env"))

LOCAL_DEV_ORIGINS = (
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
)


@dataclass(frozen=True)
class Settings:
    """Application settings from environment variables."""

    db_host: str = os.getenv("DB_HOST", "localhost")
    db_port: int = int(os.getenv("DB_PORT", "3306"))
    db_user: str = os.getenv("DB_USER", "root")
    db_password: str = os.getenv("DB_PASSWORD", "")
    db_name: str = os.getenv("DB_NAME", "nfr")

    port: int = int(os.getenv("PORT", "4000"))
    host: str = os.getenv("HOST", "0.0.0.0")
    environment: str = os.getenv("ENVIRONMENT", "development")

    cors_origin: str = os.getenv("CORS_ORIGIN", "http://localhost:5173")

    @property
    def cors_origins(self) -> list[str]:
        """Configured CORS origins, deduplicated while preserving order."""
        return list(dict.fromkeys([self.cors_origin, *LOCAL_DEV_ORIGINS]))

    @property
    def cors_origin_regex(self) -> str | None:
        """Allow local Vite ports in development without opening production CORS."""
        if self.environment != "development":
            return None

        return r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"


settings = Settings()
