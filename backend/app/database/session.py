"""
Database session factory.
SQLAlchemy engine and session are configured here.
No tables are created in Module 1 — only connection setup.
"""
import logging
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.engine.url import make_url
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.core.config import get_settings, PROJECT_ROOT, normalize_sqlite_url

logger = logging.getLogger(__name__)


def _build_engine(custom_url: str | None = None):
    settings = get_settings()
    db_url = custom_url or settings.resolved_database_url or "sqlite:///oilspill.db"

    if "postgresql+psycopg://" in db_url:
        db_url = db_url.replace("postgresql+psycopg://", "postgresql+psycopg2://")

    if db_url.startswith("sqlite"):
        db_url = normalize_sqlite_url(db_url, PROJECT_ROOT)
        prefix = "sqlite:///"
        if db_url.startswith(prefix) and db_url not in ("sqlite:///:memory:", "sqlite:///"):
            # Ensure parent directory exists for file-based SQLite
            db_file_path = Path(db_url[len(prefix):])
            db_file_path.parent.mkdir(parents=True, exist_ok=True)

        return create_engine(
            db_url,
            connect_args={"check_same_thread": False},
            echo=settings.debug,
        )

    try:
        eng = create_engine(
            db_url,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
            echo=settings.debug,
        )
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        return eng
    except Exception as e:
        try:
            safe_url = make_url(db_url).render_as_string(hide_password=True)
        except Exception:
            safe_url = "configured database"
        logger.error("Failed to connect to configured database (%s)", safe_url)
        raise RuntimeError(
            f"Database connection failed for '{safe_url}'. "
            f"PostgreSQL service is unavailable or credentials are invalid. "
            f"Ensure PostgreSQL is running and accessible, or explicitly configure "
            f"local SQLite development mode (e.g. USE_SQLITE=true or DATABASE_URL=sqlite:///oilspill.db)."
        ) from None


engine = _build_engine()

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def reset_engine(custom_url: str | None = None):
    """
    Rebuild the global engine and rebind SessionLocal.
    Useful for test suites and dynamic database reconfiguration.
    """
    global engine, SessionLocal
    if engine is not None:
        try:
            engine.dispose()
        except Exception:
            pass
    engine = _build_engine(custom_url=custom_url)
    SessionLocal.configure(bind=engine)
    return engine


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""
    pass


def get_db():
    """
    FastAPI dependency that yields a database session.
    Automatically closes the session when the request completes.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_db_connection() -> bool:
    """
    Test database connectivity.
    Returns True if connection succeeds, False otherwise.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
