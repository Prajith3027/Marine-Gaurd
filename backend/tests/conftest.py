"""
Test configuration.

Pre-existing module tests were written before authentication existed and call the
operational APIs directly. They now run with the authentication dependency overridden by a
synthetic administrator so they keep validating the (unchanged) AI / GIS / AIS logic.
Tests in test_auth_rbac.py opt OUT of this override and exercise the real auth stack.
"""
import os
import shutil
import tempfile
from pathlib import Path
from types import SimpleNamespace
import pytest

from app.core.config import PROJECT_ROOT, BACKEND_DIR, normalize_sqlite_url, validate_test_database_url, FORBIDDEN_TEST_DBS

# Ensure tests NEVER touch the 4 existing databases or the production/app database.
# Support TEST_DATABASE_URL override (with safety validation), otherwise use a dedicated temporary isolated database.
_TEST_TEMP_DIR = globals().get("_TEST_TEMP_DIR")
if not os.environ.get("_MG_TEST_INITIALIZED"):
    os.environ["_MG_TEST_INITIALIZED"] = "1"
    _CUSTOM_TEST_URL = os.environ.get("TEST_DATABASE_URL")
    if _CUSTOM_TEST_URL:
        os.environ["DATABASE_URL"] = validate_test_database_url(_CUSTOM_TEST_URL)
    else:
        _TEST_TEMP_DIR = tempfile.mkdtemp(prefix="mg_test_isolated_")
        _ISOLATED_TEST_DB = Path(_TEST_TEMP_DIR) / "isolated_test.db"
        os.environ["DATABASE_URL"] = f"sqlite:///{_ISOLATED_TEST_DB.as_posix()}"

    from app.core.config import get_settings
    get_settings.cache_clear()

    from app.database.session import reset_engine, Base, engine
    reset_engine()
    import app.models  # noqa: F401
    Base.metadata.create_all(bind=engine)

from app.core.auth import authenticate_user
from app.main import app


def _fake_admin():
    return SimpleNamespace(id="test-admin", name="Test Admin", email="admin@test.local",
                           role="admin", is_active=True)


@pytest.fixture(autouse=True)
def _default_admin_override(request):
    if request.node.get_closest_marker("real_auth"):
        app.dependency_overrides.pop(authenticate_user, None)
        yield
        app.dependency_overrides[authenticate_user] = _fake_admin
        return
    app.dependency_overrides[authenticate_user] = _fake_admin
    yield
    app.dependency_overrides.pop(authenticate_user, None)


def pytest_configure(config):
    config.addinivalue_line("markers", "real_auth: run with the real authentication stack")
    # Module-level TestClient(app) objects are created at import time (before fixtures run);
    # install the override immediately so those clients are authenticated as well.
    from app.main import app as main_app
    main_app.dependency_overrides[authenticate_user] = _fake_admin
    # Ensure all tables are created on the isolated test database
    import app.models  # noqa: F401
    from app.database.session import Base, engine, SessionLocal
    Base.metadata.create_all(bind=engine)
    from app.database.auth_setup import migrate_citizen_reports, seed_demo_data
    migrate_citizen_reports()
    with SessionLocal() as _db:
        from app.models.user import User, ROLE_ADMIN
        from app.core.security import hash_password
        if not _db.query(User).filter(User.email == "admin@maritime.gov.in").first():
            _db.add(User(
                name="Test Administrator",
                email="admin@maritime.gov.in",
                password_hash=hash_password("Admin@Maritime2026"),
                role=ROLE_ADMIN,
                is_active=True,
            ))
            _db.commit()
        seed_demo_data(_db)



def pytest_sessionfinish(session, exitstatus):
    """Dispose engine and clean up isolated test directory after all tests complete."""
    from app.database.session import engine
    if engine is not None:
        try:
            engine.dispose()
        except Exception:
            pass
    if _TEST_TEMP_DIR and os.path.exists(_TEST_TEMP_DIR):
        try:
            shutil.rmtree(_TEST_TEMP_DIR, ignore_errors=True)
        except Exception:
            pass

