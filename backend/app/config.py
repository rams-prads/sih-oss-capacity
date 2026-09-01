"""Environment-driven settings. Demo defaults require zero external services."""
import os
from functools import lru_cache


class Settings:
    # SQLite by default so the demo runs with zero setup; docker-compose overrides
    # this with the Postgres URL.
    database_url: str = os.environ.get("DATABASE_URL", "sqlite:///./sih_oss.db")

    # "mock" (default, offline) or "sunbird" (real Sunbird-contract endpoints)
    karmayogi_mode: str = os.environ.get("KARMAYOGI_MODE", "mock")
    sunbird_base: str = os.environ.get("SUNBIRD_BASE", "")
    sunbird_api_key: str = os.environ.get("SUNBIRD_API_KEY", "")
    sunbird_user_token: str = os.environ.get("SUNBIRD_USER_TOKEN", "")

    # "stub" (default, offline deterministic), "openai", "gemini" or "ollama"
    llm_provider: str = os.environ.get("LLM_PROVIDER", "stub")
    llm_model: str = os.environ.get("LLM_MODEL", "")
    openai_api_key: str = os.environ.get("OPENAI_API_KEY", "")
    gemini_api_key: str = os.environ.get("GEMINI_API_KEY", "")
    ollama_base: str = os.environ.get("OLLAMA_BASE", "http://localhost:11434")

    jwt_secret: str = os.environ.get("JWT_SECRET", "dev-only-not-a-production-secret")
    jwt_ttl_minutes: int = int(os.environ.get("JWT_TTL_MINUTES", "720"))

    cors_origins: list[str] = os.environ.get(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")

    max_upload_bytes: int = int(os.environ.get("MAX_UPLOAD_BYTES", str(8 * 1024 * 1024)))


@lru_cache
def get_settings() -> Settings:
    return Settings()
