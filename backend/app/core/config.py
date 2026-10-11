"""
Application configuration.
Reads settings from environment variables / .env file.
"""
from functools import lru_cache
from pathlib import Path
import re
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Anchored paths independent of current working directory
CORE_DIR = Path(__file__).resolve().parent
APP_DIR = CORE_DIR.parent
BACKEND_DIR = APP_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent


def normalize_sqlite_url(url: str, base_dir: Path = PROJECT_ROOT) -> str:
    """
    Normalize relative SQLite URLs to deterministic absolute paths anchored
    to base_dir (default: PROJECT_ROOT).
    Leaves in-memory databases ('sqlite://', 'sqlite:///:memory:') and absolute paths intact.
    """
    if not url or not url.startswith("sqlite:"):
        return url
    if url in ("sqlite://", "sqlite:///:memory:"):
        return url

    prefix = "sqlite:///"
    if url.startswith(prefix):
        raw_path = url[len(prefix):]
        # Check for Windows drive letter (e.g., C:/ or C:\) or Unix root (/)
        is_win_abs = bool(re.match(r"^[a-zA-Z]:[/\\\\]", raw_path))
        is_posix_abs = raw_path.startswith("/")
        if is_win_abs or is_posix_abs:
            abs_path = Path(raw_path).resolve()
        else:
            cleaned = raw_path.lstrip("./").lstrip(".\\\\")
            abs_path = (base_dir / cleaned).resolve()
        return f"sqlite:///{abs_path.as_posix()}"
FORBIDDEN_TEST_DBS = {
    (PROJECT_ROOT / "oilspill.db").resolve(),
    (PROJECT_ROOT / "test.db").resolve(),
    (BACKEND_DIR / "oilspill.db").resolve(),
    (BACKEND_DIR / "test.db").resolve(),
}


def validate_test_database_url(url: str) -> str:
    """Validate that custom test database URL does not collide with any protected database."""
    norm_url = normalize_sqlite_url(url, PROJECT_ROOT)
    prefix = "sqlite:///"
    if norm_url.startswith(prefix) and norm_url not in ("sqlite:///:memory:", "sqlite:///"):
        target_path = Path(norm_url[len(prefix):]).resolve()
        if target_path in FORBIDDEN_TEST_DBS:
            raise ValueError(
                f"SAFETY VIOLATION: TEST_DATABASE_URL points to protected database '{target_path}'. "
                f"Tests are strictly forbidden from writing to production or legacy database files."
            )
    return norm_url


INSECURE_SECRET_PATTERNS = {
    "",
    "change_me_in_production",
    "your_secret_key_here",
    "dev_secret_key_change_in_production",
    "secret",
    "secret_key",
    "changeme",
    "admin",
    "password",
    "test",
    "testing",
    "jwt_secret",
}
MIN_JWT_SECRET_BYTES = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(PROJECT_ROOT / ".env"), str(BACKEND_DIR / ".env")),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    app_name: str = "AI Oil Spill Intelligence API"
    app_version: str = "0.1.0"
    app_env: str = "development"
    debug: bool = True
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    # Database
    database_url: str = "postgresql+psycopg://oilspill_user:changeme@localhost:5432/oilspill_db"
    use_sqlite: bool = False
    test_database_url: str | None = None

    # Security
    secret_key: str = "dev_secret_key_change_in_production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        env_lower = (self.app_env or "").strip().lower()
        is_production = env_lower not in ("development", "dev", "test", "testing")
        if is_production:
            sec = (self.secret_key or "").strip()
            if not sec:
                raise ValueError(
                    "Production configuration error: SECRET_KEY is missing or empty. "
                    "A cryptographically secure key of at least 32 bytes (256 bits) must be configured."
                )
            if sec.lower() in INSECURE_SECRET_PATTERNS:
                raise ValueError(
                    "Production configuration error: Insecure or default SECRET_KEY detected. "
                    "Production must use a cryptographically strong secret configured via environment."
                )
            if len(sec.encode("utf-8")) < MIN_JWT_SECRET_BYTES:
                raise ValueError(
                    f"Production configuration error: SECRET_KEY must be at least {MIN_JWT_SECRET_BYTES} bytes "
                    f"(256 bits) for {self.jwt_algorithm}, but got {len(sec.encode('utf-8'))} bytes."
                )
        return self

    # Administrator provisioning (must be explicitly provided via environment; no insecure default credentials)
    initial_admin_email: str | None = None
    initial_admin_password: str | None = None
    initial_admin_name: str = "Authorized Administrator"

    # Upload limits for citizen report media
    max_image_bytes: int = 10 * 1024 * 1024
    max_video_bytes: int = 50 * 1024 * 1024

    # CORS
    frontend_url: str = "http://localhost:5173"

    @property
    def resolved_database_url(self) -> str:
        """
        Return the fully resolved database URL:
        - If USE_SQLITE is true, explicitly use SQLite anchored to PROJECT_ROOT.
        - If database_url starts with sqlite:, normalize relative paths to absolute paths
          anchored deterministically to PROJECT_ROOT.
        - Otherwise, return database_url unchanged.
        """
        if self.use_sqlite:
            if self.database_url and self.database_url.startswith("sqlite:"):
                return normalize_sqlite_url(self.database_url, PROJECT_ROOT)
            return f"sqlite:///{(PROJECT_ROOT / 'oilspill.db').resolve().as_posix()}"

        if self.database_url and self.database_url.startswith("sqlite:"):
            return normalize_sqlite_url(self.database_url, PROJECT_ROOT)

        return self.database_url


@lru_cache()
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()

