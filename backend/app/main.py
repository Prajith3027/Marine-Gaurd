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
        # Auth extension: new citizen_reports columns + optional admin seed from environment
        from app.database.auth_setup import migrate_citizen_reports, seed_initial_admin
        from app.database.session import SessionLocal
        migrate_citizen_reports()
        with SessionLocal() as _db:
            seed_initial_admin(_db)
        logger.info("Database tables verified/created.")
    except SQLAlchemyError as e:
        logger.warning(f"DB startup warning (DB may not be running): {e}")
    yield
    logger.info("Application shutdown.")


# ── Application factory ────────────────────────────────────────────────────

app = FastAPI(
    title="Marine Pollution Response System API",
    version=settings.app_version,
    description=(
        "Integrated Marine Pollution Response System — Dual Operations for "
        "Intelligent Oil Spill Intelligence and Marine Waste & Debris Command"
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

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
from fastapi.staticfiles import StaticFiles

# ── Routers & Static Mounts ────────────────────────────────────────────────
os.makedirs("uploads/reports", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

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
