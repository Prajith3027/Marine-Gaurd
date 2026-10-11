"""
FastAPI application entry point — Module 3: REST API layer.

Endpoints:
  GET  /health                         → system health check
  GET  /api/v1/                        → API v1 root
  GET  /api/v1/health                  → API + DB health
  GET  /api/v1/incidents               → list/filter incidents
  POST /api/v1/incidents               → create incident
  GET  /api/v1/incidents/{id}          → get incident
  PUT  /api/v1/incidents/{id}          → update incident
  DEL  /api/v1/incidents/{id}          → archive incident
  GET  /api/v1/incidents/{id}/events   → list events
  POST /api/v1/incidents/{id}/events   → add event
  GET  /api/v1/incidents/nearby        → proximity search
  GET  /api/v1/map/incidents           → map geographic data
  GET  /api/v1/dashboard/summary       → dashboard metrics
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings
from app.api.v1 import router as v1_router
from app.database.session import engine, Base

settings = get_settings()
logger = logging.getLogger(__name__)


# ── Startup / shutdown ─────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create all tables on startup (safe if they already exist)."""
    try:
        # Import all models so Base knows about them
        import app.models  # noqa: F401
        Base.metadata.create_all(bind=engine)
        # Ensure new enum values exist in PostgreSQL enum types
        from sqlalchemy import text
        with engine.connect() as conn:
            try:
                conn.execute(text("ALTER TYPE incident_status_enum ADD VALUE IF NOT EXISTS 'RECOVERY'"))
                conn.commit()
            except Exception:
                pass
        # Auth extension: verify columns + optional admin provisioning from explicit configuration (no demo data)
        from app.database.auth_setup import migrate_citizen_reports, seed_initial_admin
        from app.database.session import SessionLocal
        migrate_citizen_reports()
        with SessionLocal() as _db:
            seed_initial_admin(_db)
        logger.info("Database tables verified/created.")
    except SQLAlchemyError as e:
        env_lower = (settings.app_env or "").strip().lower()
        if env_lower not in ("development", "dev", "test", "testing"):
            logger.error(f"Critical database startup failure in production: {e}")
            raise
        logger.warning(f"DB startup warning (DB may not be running): {e}")
    yield
    logger.info("Application shutdown.")


# ── Application factory ────────────────────────────────────────────────────

is_production = (settings.app_env or "").strip().lower() in ("production", "prod")
docs_url = None if is_production else "/docs"
redoc_url = None if is_production else "/redoc"
openapi_url = None if is_production else "/openapi.json"

app = FastAPI(
    title="Marine Pollution Response System API",
    version=settings.app_version,
    description=(
        "Integrated Marine Pollution Response System — Dual Operations for "
        "Intelligent Oil Spill Intelligence and Marine Waste & Debris Command"
    ),
    docs_url=docs_url,
    redoc_url=redoc_url,
    openapi_url=openapi_url,
    lifespan=lifespan,
)

# ── Security Headers & Content Security Policy ──────────────────────────────

def build_content_security_policy(is_prod: bool, app_settings) -> str:
    """
    Generate an environment-aware Content Security Policy:
    - Production:
        * Removes development-only localhost and 127.0.0.1 origins from connect-src.
        * Permits 'self' and only explicitly validated HTTPS frontend/API origins.
        * Uses strict `script-src 'self'` without 'unsafe-inline' (compatible with external bundle chunks).
        * Retains `object-src 'none'` and `frame-ancestors 'none'`.
    - Development:
        * Retains 'self', localhost, 127.0.0.1, and websocket origins for Vite HMR.
        * Retains 'unsafe-inline' for development scripts.
    """
    if is_prod:
        script_src = "'self'"
        connect_origins = ["'self'"]
        if getattr(app_settings, "frontend_url", None):
            from urllib.parse import urlparse
            try:
                parsed = urlparse(app_settings.frontend_url.strip())
                if parsed.scheme in ("https", "http") and parsed.netloc and "*" not in parsed.netloc:
                    origin = f"{parsed.scheme}://{parsed.netloc}"
                    if origin not in connect_origins and not origin.startswith(("http://localhost", "http://127.0.0.1")):
                        connect_origins.append(origin)
            except Exception:
                pass
        connect_src = " ".join(connect_origins)
    else:
        script_src = "'self' 'unsafe-inline'"
        connect_src = "'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*"

    return (
        "default-src 'self'; "
        f"script-src {script_src}; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com data:; "
        "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://unpkg.com; "
        "media-src 'self' data: blob:; "
        f"connect-src {connect_src}; "
        "object-src 'none'; "
        "frame-ancestors 'none'"
    )


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

    # Environment-aware Content Security Policy
    current_settings = get_settings()
    is_prod = (current_settings.app_env or "").strip().lower() in ("production", "prod")
    response.headers["Content-Security-Policy"] = build_content_security_policy(is_prod, current_settings)

    # HSTS only on HTTPS requests in production
    if is_prod and request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    return response

# ── CORS ───────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Global error handlers ──────────────────────────────────────────────────

@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_error_handler(request: Request, exc: SQLAlchemyError):
    logger.error(f"Database error on {request.url}: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "A database error occurred. Please try again later."},
    )


@app.exception_handler(Exception)
async def generic_error_handler(request: Request, exc: Exception):
    logger.error(f"Unexpected error on {request.url}: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal server error occurred."},
    )

import os
from pathlib import Path
from fastapi.responses import FileResponse
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, or_

from app.database.session import get_db
from app.core.auth import authenticate_user
from app.models.user import User
from app.models.citizen_report import CitizenReport

# ── Protected Media Route (Replaces Unauthenticated Static Mount) ──────────
os.makedirs("uploads/reports", exist_ok=True)

@app.get("/uploads/reports/{filename}", tags=["Media"], summary="Authenticated report media endpoint")
async def get_uploaded_report_media(
    filename: str,
    db: Session = Depends(get_db),
    user: User = Depends(authenticate_user),
):
    """
    Authenticated media endpoint.
    - Rejects unauthenticated requests (401).
    - Admins can view any uploaded evidence.
    - Citizens can view ONLY evidence belonging to reports they own (403 otherwise).
    - Prevents directory traversal attacks.
    """
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid file path")

    safe_name = Path(filename).name
    upload_dir = Path("uploads/reports").resolve()
    target_path = (upload_dir / safe_name).resolve()

    if upload_dir not in target_path.parents and target_path != upload_dir:
        raise HTTPException(status_code=400, detail="Invalid file path")

    if not target_path.is_file():
        raise HTTPException(status_code=404, detail="Media file not found")

    report = db.execute(
        select(CitizenReport).where(
            or_(
                CitizenReport.photo_filename == safe_name,
                CitizenReport.photo_url.like(f"%{safe_name}"),
                CitizenReport.video_url.like(f"%{safe_name}")
            )
        )
    ).scalars().first()

    is_admin = (user.role or "").lower() == "admin"
    if report is None:
        if not is_admin:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        if not is_admin and report.user_id != user.id:
            raise HTTPException(status_code=403, detail="Access denied to report media")

    ext = target_path.suffix.lower()
    media_type = "image/jpeg"
    if ext == ".png":
        media_type = "image/png"
    elif ext == ".webp":
        media_type = "image/webp"
    elif ext in (".mp4", ".mov"):
        media_type = "video/mp4"
    elif ext == ".webm":
        media_type = "video/webm"

    return FileResponse(target_path, media_type=media_type)

app.include_router(v1_router, prefix="/api/v1")

# Role-based API surface (JWT + server-side RBAC)
from app.api.auth_routes import router as auth_router            # noqa: E402
from app.api.citizen_routes import router as citizen_router, public_router  # noqa: E402
from app.api.admin_routes import router as admin_router          # noqa: E402
from app.api.voice_routes import router as voice_router          # noqa: E402
from app.api.waste_routes import router as waste_router          # noqa: E402
app.include_router(auth_router, prefix="/api")
app.include_router(citizen_router, prefix="/api")
app.include_router(public_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(voice_router, prefix="/api")
app.include_router(waste_router, prefix="/api")

# ── Core endpoints ─────────────────────────────────────────────────────────

@app.get("/health", tags=["System"], summary="Basic health check")
async def health_check():
    """Returns {status: healthy} when the API process is running."""
    return {"status": "healthy"}


@app.get("/", tags=["System"], summary="API root")
async def root():
    return {
        "message": "AI Oil Spill Intelligence API",
        "version": settings.app_version,
        "docs":     "/docs",
        "health":   "/health",
        "api_v1":   "/api/v1/",
    }
