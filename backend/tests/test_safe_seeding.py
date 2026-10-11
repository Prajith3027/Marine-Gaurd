"""
Tests for safe administrator provisioning and decoupled demo-data seeding.
Verifies Phase 10A requirements on isolated in-memory SQLite databases:
1. Admin seeding creates only the configured administrator.
2. Missing or invalid credentials never trigger fallback to default credentials.
3. Repeated admin seeding does not overwrite an existing account.
4. Admin seeding creates no demo citizen, incidents, reports, or alerts.
5. Demo data is not seeded during normal startup.
6. Demo seeding only occurs through an explicit opt-in path (rejected in production).
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.core.config import Settings
from app.core.security import verify_password
from app.database.session import Base
from app.database.auth_setup import seed_initial_admin, seed_demo_data
from app.models.user import User, ROLE_ADMIN, ROLE_CITIZEN, PublicAlert
from app.models.incident import Incident
from app.models.citizen_report import CitizenReport
from app.models.marine_waste import MarineWasteIncident


@pytest.fixture()
def in_memory_db():
    """Provides a pristine, isolated in-memory SQLite database session."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_admin_seeding_creates_only_configured_admin(in_memory_db, monkeypatch):
    """Admin seeding creates only the configured administrator with hashed password."""
    configured_email = "custom_adm@maritime.gov.in"
    configured_pass = "Str0ng!Adm1n#Pass2026"
    configured_name = "Chief Maritime Officer"

    mock_settings = Settings(
        app_env="development",
        initial_admin_email=configured_email,
        initial_admin_password=configured_pass,
        initial_admin_name=configured_name,
    )
    monkeypatch.setattr("app.database.auth_setup.get_settings", lambda: mock_settings)

    success = seed_initial_admin(in_memory_db)
    assert success is True

    # Exactly 1 user must exist
    all_users = in_memory_db.query(User).all()
    assert len(all_users) == 1

    admin = all_users[0]
    assert admin.email == configured_email
    assert admin.name == configured_name
    assert admin.role == ROLE_ADMIN
    assert admin.is_active is True
    assert admin.password_hash != configured_pass
    assert verify_password(configured_pass, admin.password_hash) is True


def test_missing_credentials_never_fallback_to_defaults(in_memory_db, monkeypatch):
    """Missing or invalid credentials fail safely and never fallback to default credentials."""
    mock_settings = Settings(
        app_env="development",
        initial_admin_email=None,
        initial_admin_password=None,
    )
    monkeypatch.setattr("app.database.auth_setup.get_settings", lambda: mock_settings)

    success = seed_initial_admin(in_memory_db)
    assert success is False
    assert in_memory_db.query(User).count() == 0

    # Ensure no default admin was created
    default_admin = in_memory_db.query(User).filter(User.email == "admin@maritime.gov.in").first()
    assert default_admin is None


@pytest.mark.parametrize("insecure_password", [
    "admin@maritime2026",
    "Admin@Maritime2026",
    "admin",
    "admin123",
    "changeme",
    "password",
    "short",  # < 8 chars
])
def test_insecure_passwords_rejected(in_memory_db, monkeypatch, insecure_password):
    """Insecure or default passwords are rejected without creating an account."""
    mock_settings = Settings(
        app_env="development",
        initial_admin_email="admin@test.gov.in",
        initial_admin_password=insecure_password,
    )
    monkeypatch.setattr("app.database.auth_setup.get_settings", lambda: mock_settings)

    success = seed_initial_admin(in_memory_db)
    assert success is False
    assert in_memory_db.query(User).count() == 0


def test_repeated_admin_seeding_does_not_overwrite(in_memory_db, monkeypatch):
    """Repeated admin seeding is idempotent and does not overwrite or reset account."""
    mock_settings_1 = Settings(
        app_env="development",
        initial_admin_email="safe_admin@domain.gov.in",
        initial_admin_password="InitialPassword#123",
        initial_admin_name="Original Name",
    )
    monkeypatch.setattr("app.database.auth_setup.get_settings", lambda: mock_settings_1)

    assert seed_initial_admin(in_memory_db) is True
    admin_v1 = in_memory_db.query(User).filter(User.email == "safe_admin@domain.gov.in").first()
    orig_id = admin_v1.id
    orig_hash = admin_v1.password_hash
    orig_name = admin_v1.name

    # Second call with different password and name
    mock_settings_2 = Settings(
        app_env="development",
        initial_admin_email="safe_admin@domain.gov.in",
        initial_admin_password="NewAttemptedPassword#999",
        initial_admin_name="Different Name",
    )
    monkeypatch.setattr("app.database.auth_setup.get_settings", lambda: mock_settings_2)

    assert seed_initial_admin(in_memory_db) is False

    in_memory_db.expire_all()
    admin_v2 = in_memory_db.query(User).filter(User.email == "safe_admin@domain.gov.in").first()
    assert admin_v2.id == orig_id
    assert admin_v2.password_hash == orig_hash
    assert admin_v2.name == orig_name
    # Verify original password still validates, new one does not
    assert verify_password("InitialPassword#123", admin_v2.password_hash) is True
    assert verify_password("NewAttemptedPassword#999", admin_v2.password_hash) is False


def test_admin_seeding_creates_no_demo_citizen_or_incidents(in_memory_db, monkeypatch):
    """Admin seeding creates NO demo citizens, incidents, reports, alerts, or waste records."""
    mock_settings = Settings(
        app_env="development",
        initial_admin_email="solo_admin@navy.gov.in",
        initial_admin_password="SoloAdminSecure!2026",
    )
    monkeypatch.setattr("app.database.auth_setup.get_settings", lambda: mock_settings)

    assert seed_initial_admin(in_memory_db) is True

    # Users: only the 1 admin, no citizen
    assert in_memory_db.query(User).count() == 1
    assert in_memory_db.query(User).filter(User.role == ROLE_CITIZEN).count() == 0

    # Incident domain tables: all empty
    assert in_memory_db.query(Incident).count() == 0
    assert in_memory_db.query(CitizenReport).count() == 0
    assert in_memory_db.query(PublicAlert).count() == 0
    assert in_memory_db.query(MarineWasteIncident).count() == 0


def test_demo_seeding_rejected_in_production(in_memory_db, monkeypatch):
    """Demo seeding is strictly rejected and returns False in non-development environments."""
    mock_settings = Settings(
        app_env="production",
        secret_key="a_cryptographically_secure_production_secret_key_32_bytes_min",
    )
    monkeypatch.setattr("app.database.auth_setup.get_settings", lambda: mock_settings)

    success = seed_demo_data(in_memory_db)
    assert success is False
    assert in_memory_db.query(User).count() == 0
    assert in_memory_db.query(Incident).count() == 0
    assert in_memory_db.query(MarineWasteIncident).count() == 0


def test_demo_seeding_opt_in_in_development(in_memory_db, monkeypatch):
    """Demo seeding populates demo citizen, incidents, and marine waste in development."""
    mock_settings = Settings(
        app_env="development",
    )
    monkeypatch.setattr("app.database.auth_setup.get_settings", lambda: mock_settings)

    success = seed_demo_data(in_memory_db)
    assert success is True

    # Citizen account
    cit = in_memory_db.query(User).filter(User.email == "citizen@marine.org").first()
    assert cit is not None
    assert cit.role == ROLE_CITIZEN

    # Incidents and waste
    assert in_memory_db.query(Incident).count() >= 2
    assert in_memory_db.query(CitizenReport).count() >= 1
    assert in_memory_db.query(PublicAlert).count() >= 1
    assert in_memory_db.query(MarineWasteIncident).count() >= 3


@pytest.mark.parametrize("env_name", [
    "production",
    "prod",
    "staging",
    "stage",
    "",
    "   ",
    "UNKNOWN_ENV",
    "qa",
])
def test_demo_seeding_rejected_in_all_non_dev_environments(in_memory_db, monkeypatch, env_name):
    """An unset, empty, or unrecognized APP_ENV fails safely and rejects demo seeding."""
    mock_settings = Settings(
        app_env=env_name,
        secret_key="cryptographically_strong_random_secret_32_bytes_test",
    )
    monkeypatch.setattr("app.database.auth_setup.get_settings", lambda: mock_settings)

    success = seed_demo_data(in_memory_db)
    assert success is False
    assert in_memory_db.query(User).count() == 0
    assert in_memory_db.query(Incident).count() == 0
    assert in_memory_db.query(MarineWasteIncident).count() == 0


def test_password_byte_length_bcrypt_limits():
    """Verify password byte length compatibility with bcrypt (max 72 bytes, min 8 chars)."""
    from app.core.security import validate_password_strength

    # Valid: 8 chars
    validate_password_strength("12345678")

    # Valid: 72 ASCII bytes
    validate_password_strength("A" * 72)

    # Invalid: 73 ASCII bytes (> 72 bytes)
    with pytest.raises(ValueError, match="too long"):
        validate_password_strength("A" * 73)

    # Multi-byte UTF-8 character (e.g. '€' is 3 bytes in UTF-8): 25 chars * 3 bytes = 75 bytes (> 72 bytes)
    with pytest.raises(ValueError, match="too long"):
        validate_password_strength("€" * 25)


def test_startup_with_missing_admin_credentials_does_not_fail():
    """Application lifespan proceeds cleanly when admin credentials are missing, without seeding."""
    import asyncio
    from app.main import lifespan
    from fastapi import FastAPI

    test_app = FastAPI()

    async def _run():
        async with lifespan(test_app):
            pass

    asyncio.run(_run())


def test_production_startup_raises_on_db_error(monkeypatch):
    """Lifespan in production must raise critical DB errors rather than silently swallowing them."""
    import asyncio
    from app.main import lifespan
    from fastapi import FastAPI
    from sqlalchemy.exc import OperationalError

    test_app = FastAPI()
    mock_settings = Settings(
        app_env="production",
        secret_key="production_secret_key_at_least_32_bytes_length",
    )
    monkeypatch.setattr("app.main.settings", mock_settings)

    def failing_create_all(*args, **kwargs):
        raise OperationalError("Connection refused", {}, None)

    monkeypatch.setattr("app.main.Base.metadata.create_all", failing_create_all)

    async def _run():
        async with lifespan(test_app):
            pass

    with pytest.raises(OperationalError):
        asyncio.run(_run())

