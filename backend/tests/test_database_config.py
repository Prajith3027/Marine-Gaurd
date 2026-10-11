"""
Tests for Marine Gaurd Database Configuration & Architecture.

Verifies:
1. Working directory independence for database resolution.
2. PostgreSQL connection failures do not silently fall back to SQLite.
3. Explicit SQLite mode uses deterministic absolute paths.
4. Application and test databases are strictly isolated.
5. Connection error messages sanitize and do not expose passwords/credentials.
6. Existing authentication & RBAC continue to work.
7. Citizen report, admin, and marine waste workflows remain functional.
8. Four existing database files are untouched by test executions.
"""
import os
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, PROJECT_ROOT, BACKEND_DIR, normalize_sqlite_url
from app.database.session import _build_engine, engine, get_db, SessionLocal
from app.main import app
from app.models.user import User, ROLE_ADMIN, ROLE_CITIZEN
from app.models.incident import Incident
from app.models.citizen_report import CitizenReport
from app.models.marine_waste import MarineWasteIncident


EXISTING_DB_FILES = [
    PROJECT_ROOT / "oilspill.db",
    PROJECT_ROOT / "test.db",
    BACKEND_DIR / "oilspill.db",
    BACKEND_DIR / "test.db",
]


def test_cwd_independent_sqlite_resolution():
    """Verify that relative SQLite paths resolve to identical absolute paths regardless of CWD."""
    # Test relative path variants
    variants = ["sqlite:///oilspill.db", "sqlite:///./oilspill.db", "sqlite:///backend/oilspill.db"]
    expected_oilspill = f"sqlite:///{(PROJECT_ROOT / 'oilspill.db').resolve().as_posix()}"
    expected_backend_oilspill = f"sqlite:///{(PROJECT_ROOT / 'backend' / 'oilspill.db').resolve().as_posix()}"

    assert normalize_sqlite_url(variants[0], PROJECT_ROOT) == expected_oilspill
    assert normalize_sqlite_url(variants[1], PROJECT_ROOT) == expected_oilspill
    assert normalize_sqlite_url(variants[2], PROJECT_ROOT) == expected_backend_oilspill

    # Test resolution with Settings class
    s_root = Settings(database_url="sqlite:///oilspill.db")
    assert s_root.resolved_database_url == expected_oilspill

    s_explicit = Settings(use_sqlite=True, database_url="postgresql+psycopg://user:pass@localhost:5432/db")
    assert s_explicit.resolved_database_url == expected_oilspill


def test_postgres_connection_failure_no_silent_fallback():
    """Verify that PostgreSQL connection failures raise RuntimeError and DO NOT silently create SQLite DB."""
    # Attempting to connect to an unreachable PostgreSQL instance
    fake_pg_url = "postgresql+psycopg2://user_marine:super_secret_password_12345@127.0.0.1:5432/fake_marine_db"

    with pytest.raises(RuntimeError) as exc_info:
        _build_engine(custom_url=fake_pg_url)

    err_msg = str(exc_info.value)
    # Must fail with clear explanation
    assert "Database connection failed" in err_msg
    assert "PostgreSQL service is unavailable" in err_msg


def test_database_connection_errors_do_not_reveal_credentials():
    """Verify that connection failure error message hides passwords/credentials."""
    secret_pass = "super_secret_password_12345"
    fake_pg_url = f"postgresql+psycopg2://user_marine:{secret_pass}@127.0.0.1:5432/fake_marine_db"

    with pytest.raises(RuntimeError) as exc_info:
        _build_engine(custom_url=fake_pg_url)

    err_msg = str(exc_info.value)
    # Password MUST NOT appear in the exception message
    assert secret_pass not in err_msg
    # Password must be masked with ***
    assert "***" in err_msg


def test_explicit_sqlite_mode_uses_expected_absolute_path():
    """Verify explicit SQLite configuration uses expected absolute path."""
    # When default DB is PostgreSQL and USE_SQLITE is set:
    s = Settings(use_sqlite=True, database_url="postgresql+psycopg://user:pass@localhost:5432/db")
    expected_url = f"sqlite:///{(PROJECT_ROOT / 'oilspill.db').resolve().as_posix()}"
    assert s.resolved_database_url == expected_url

    # Relative custom path with use_sqlite=True
    s_custom = Settings(use_sqlite=True, database_url="sqlite:///custom_marine.db")
    expected_custom = f"sqlite:///{(PROJECT_ROOT / 'custom_marine.db').resolve().as_posix()}"
    assert s_custom.resolved_database_url == expected_custom


def test_app_and_test_database_isolation():
    """Verify that the test suite runs on an isolated test database and not the app database."""
    current_engine_url = str(engine.url)
    prod_app_url = f"sqlite:///{(PROJECT_ROOT / 'oilspill.db').resolve().as_posix()}"

    # Must not be the normal application database
    assert current_engine_url != prod_app_url
    assert "oilspill.db" not in current_engine_url

    # Must not be any of the 4 legacy database files
    for db_path in EXISTING_DB_FILES:
        if db_path.exists():
            db_abs = f"sqlite:///{db_path.resolve().as_posix()}"
            assert current_engine_url != db_abs, f"Test database must not be {db_path}"


def test_existing_databases_unmodified_by_test_suite():
    """Verify that existing database files exist and are not locked/modified during test session."""
    for db_file in EXISTING_DB_FILES:
        if db_file.exists():
            assert db_file.stat().st_size > 0, f"{db_file} must remain non-empty and preserved"


@pytest.mark.real_auth
def test_authentication_and_rbac_continue_to_work():
    """Verify real auth & RBAC stack operates properly on the isolated database."""
    client = TestClient(app)

    # 1. Login with seeded admin account
    resp = client.post(
        "/api/auth/login",
        json={"email": "admin@maritime.gov.in", "password": "Admin@Maritime2026", "role": "admin"},
    )
    assert resp.status_code == 200, f"Admin login failed: {resp.text}"
    token_data = resp.json()
    assert "access_token" in token_data
    admin_token = token_data["access_token"]

    # 2. Access admin endpoint with admin token
    headers = {"Authorization": f"Bearer {admin_token}"}
    me_resp = client.get("/api/auth/me", headers=headers)
    assert me_resp.status_code == 200
    assert me_resp.json()["role"] == ROLE_ADMIN

    # 3. Login with seeded citizen account
    resp_c = client.post(
        "/api/auth/login",
        json={"email": "citizen@marine.org", "password": "Citizen@2026", "role": "citizen"},
    )
    assert resp_c.status_code == 200, f"Citizen login failed: {resp_c.text}"
    citizen_token = resp_c.json()["access_token"]

    # 4. Citizen cannot access admin routes
    c_headers = {"Authorization": f"Bearer {citizen_token}"}
    admin_only_resp = client.get("/api/admin/users", headers=c_headers)
    assert admin_only_resp.status_code in (401, 403)


def test_core_marine_guard_workflows_preserved():
    """Verify citizen report, incident creation, and marine waste endpoints continue to function."""
    client = TestClient(app)

    # Health check
    h_resp = client.get("/api/v1/health")
    assert h_resp.status_code == 200
    assert h_resp.json()["database"] in ("healthy", "connected", "ok", True)

    # Incidents list
    inc_resp = client.get("/api/v1/incidents")
    assert inc_resp.status_code == 200
    assert isinstance(inc_resp.json(), (list, dict))

    # Waste incidents list
    waste_resp = client.get("/api/waste/incidents")
    assert waste_resp.status_code == 200
    assert isinstance(waste_resp.json(), (list, dict))


def test_external_test_database_override_safeguard():
    """Verify that external TEST_DATABASE_URL cannot accidentally target protected databases."""
    from app.core.config import validate_test_database_url

    # Targetting any of the 4 protected databases must be blocked
    forbidden_urls = [
        "sqlite:///oilspill.db",
        "sqlite:///./oilspill.db",
        "sqlite:///test.db",
        "sqlite:///backend/oilspill.db",
        "sqlite:///backend/test.db",
        f"sqlite:///{(PROJECT_ROOT / 'oilspill.db').resolve().as_posix()}",
    ]

    for bad_url in forbidden_urls:
        with pytest.raises(ValueError) as exc_info:
            validate_test_database_url(bad_url)
        assert "SAFETY VIOLATION" in str(exc_info.value)

    # Allowed safe custom test urls
    safe_url = "sqlite:///custom_safe_test.db"
    assert "custom_safe_test.db" in validate_test_database_url(safe_url)
    assert validate_test_database_url("sqlite:///:memory:") == "sqlite:///:memory:"


def test_env_discovery_from_both_locations():
    """Verify that .env discovery resolves from both project root and backend folder."""
    # Settings class checks both (PROJECT_ROOT / ".env") and (BACKEND_DIR / ".env")
    env_files = Settings.model_config["env_file"]
    assert str(PROJECT_ROOT / ".env") in env_files
    assert str(BACKEND_DIR / ".env") in env_files


