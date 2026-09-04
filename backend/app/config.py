"""Environment-driven settings. Demo defaults require zero external services."""
import os
from functools import lru_cache
from pathlib import Path

# .env.example tells you to copy it to .env and put your keys there, and nothing
# was reading that file: every setting came from the real environment, so a key
# written into .env was silently ignored and the app quietly stayed on the stub
# provider. Load it here, before any setting is read.
#
# Real environment variables still win, so docker-compose and CI are unaffected.
try:
    from dotenv import load_dotenv

    for _candidate in (
        Path(__file__).resolve().parents[2] / ".env",   # repository root
        Path(__file__).resolve().parents[1] / ".env",   # backend/, if run from there
    ):
        if _candidate.is_file():
            load_dotenv(_candidate, override=False)
except ImportError:  # pragma: no cover - python-dotenv ships with uvicorn[standard]
    pass


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
    # Lets a judge switch between seeded officers with an X-User-Id header instead
    # of logging in. Convenience only: it never grants administrator access, and
    # setting DEMO_HEADER_AUTH=false requires a real token everywhere.
    demo_header_auth: bool = os.environ.get("DEMO_HEADER_AUTH", "true").lower() == "true"
    jwt_ttl_minutes: int = int(os.environ.get("JWT_TTL_MINUTES", "720"))

    cors_origins: list[str] = os.environ.get(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")

    max_upload_bytes: int = int(os.environ.get("MAX_UPLOAD_BYTES", str(8 * 1024 * 1024)))

    # Password hashing cost. Tests lower it; never lower it in a deployment.
    pbkdf2_iterations: int = int(os.environ.get("PBKDF2_ITERATIONS", "200000"))


@lru_cache
def get_settings() -> Settings:
    return Settings()
