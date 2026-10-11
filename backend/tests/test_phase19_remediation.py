"""
Test suite for Phase 19.1 Security Remediation:
- Authenticated media streaming & object-level ownership authorization
- Anonymous denial (401), cross-citizen denial (403), admin authorization (200)
- Path traversal rejection
- Security headers (nosniff, DENY, CSP, referrer policy)
- Production-versus-development API documentation toggle
- Hardened photo uploads (bounded read, magic byte validation, Pillow decoding)
"""
import io
import os
import uuid
from pathlib import Path
from PIL import Image
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.core import security
from app.core.config import get_settings
from app.core.security import hash_password
from app.database.session import Base, get_db
from app.main import app
from app.models.user import User
from app.models.citizen_report import CitizenReport

PW = "Remediation-Passw0rd!"
pytestmark = pytest.mark.real_auth


@pytest.fixture()
def env():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False)

    def _db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _db
    security._FAILS.clear()
    with Session() as db:
        db.add(User(id="admin_1", name="Admin User", email="admin19@example.com",
                    password_hash=hash_password(PW), role="admin"))
        db.add(User(id="cit_1", name="Citizen Alice", email="alice@example.com",
                    password_hash=hash_password(PW), role="citizen"))
        db.add(User(id="cit_2", name="Citizen Bob", email="bob@example.com",
                    password_hash=hash_password(PW), role="citizen"))
        db.commit()

    yield TestClient(app), Session
    app.dependency_overrides.pop(get_db, None)


def _token(client, email, role):
    res = client.post("/api/auth/login", json={"email": email, "password": PW, "role": role})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


def _make_valid_image(fmt="JPEG"):
    buf = io.BytesIO()
    img = Image.new("RGB", (64, 64), color="blue")
    img.save(buf, format=fmt)
    return buf.getvalue()


# ── Step 2: Media Authorization Tests ────────────────────────────────────────

def test_media_anonymous_denied(env):
    client, Session = env
    # Anonymous request to /uploads/reports/{filename}
    res = client.get("/uploads/reports/rep_nonexistent.jpg")
    assert res.status_code == 401, "Anonymous request must be rejected with 401"


def test_media_authorization_ownership_matrix(env, tmp_path):
    client, Session = env
    t_admin = _token(client, "admin19@example.com", "admin")
    t_alice = _token(client, "alice@example.com", "citizen")
    t_bob = _token(client, "bob@example.com", "citizen")

    # Create dummy image in uploads/reports directory
    upload_dir = Path("uploads/reports")
    upload_dir.mkdir(parents=True, exist_ok=True)
    filename = f"rep_test_{uuid.uuid4().hex[:8]}.jpg"
    file_path = upload_dir / filename
    img_data = _make_valid_image("JPEG")
    file_path.write_bytes(img_data)

    report_id = str(uuid.uuid4())
    try:
        # Create report owned by Alice (cit_1)
        with Session() as db:
            rep = CitizenReport(
                id=report_id,
                report_code="REP-TEST-001",
                latitude=13.0,
                longitude=80.0,
                description="Test report with private evidence",
                incident_category="SURFACE_SHEEN",
                user_id="cit_1",
                photo_filename=filename,
                photo_url=f"/uploads/reports/{filename}",
                photo_content_type="image/jpeg",
                status="SUBMITTED",
            )
            db.add(rep)
            db.commit()

        # 1. Anonymous -> 401
        res = client.get(f"/uploads/reports/{filename}")
        assert res.status_code == 401

        res = client.get(f"/api/citizen/reports/{report_id}/photo")
        assert res.status_code == 401

        # 2. Alice (owner) via /uploads/reports -> 200
        res = client.get(f"/uploads/reports/{filename}", headers={"Authorization": f"Bearer {t_alice}"})
        assert res.status_code == 200
        assert res.content == img_data

        # 3. Alice (owner) via /api/citizen/reports/{id}/photo -> 200
        res = client.get(f"/api/citizen/reports/{report_id}/photo", headers={"Authorization": f"Bearer {t_alice}"})
        assert res.status_code == 200
        assert res.content == img_data

        # 4. Bob (cross-citizen) via /uploads/reports -> 403 Forbidden
        res = client.get(f"/uploads/reports/{filename}", headers={"Authorization": f"Bearer {t_bob}"})
        assert res.status_code == 403
        assert "Access denied" in res.json()["detail"]

        # 5. Bob (cross-citizen) via /api/citizen/reports/{id}/photo -> 404 (indistinguishable from missing)
        res = client.get(f"/api/citizen/reports/{report_id}/photo", headers={"Authorization": f"Bearer {t_bob}"})
        assert res.status_code == 404

        # 6. Admin via /uploads/reports -> 200
        res = client.get(f"/uploads/reports/{filename}", headers={"Authorization": f"Bearer {t_admin}"})
        assert res.status_code == 200

        # 7. Admin via /api/admin/reports/{id}/photo -> 200
        res = client.get(f"/api/admin/reports/{report_id}/photo", headers={"Authorization": f"Bearer {t_admin}"})
        assert res.status_code == 200

    finally:
        if file_path.exists():
            file_path.unlink()


def test_media_path_traversal_rejected(env):
    client, Session = env
    t_alice = _token(client, "alice@example.com", "citizen")
    # Path traversal attempts
    res = client.get("/uploads/reports/..%2F..%2Fmain.py", headers={"Authorization": f"Bearer {t_alice}"})
    assert res.status_code in (400, 404), f"Traversal must be rejected, got {res.status_code}"

    res = client.get("/uploads/reports/....//main.py", headers={"Authorization": f"Bearer {t_alice}"})
    assert res.status_code in (400, 404)


# ── Step 3: Security Headers & Docs Tests ────────────────────────────────────

def test_http_security_headers_present(env):
    client, Session = env
    res = client.get("/health")
    assert res.status_code == 200

    assert res.headers.get("X-Content-Type-Options") == "nosniff"
    assert res.headers.get("X-Frame-Options") == "DENY"
    assert res.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert "Content-Security-Policy" in res.headers
    csp = res.headers["Content-Security-Policy"]
    assert "default-src 'self'" in csp
    assert "object-src 'none'" in csp
    assert "frame-ancestors 'none'" in csp


def test_csp_development_vs_production_directives():
    from app.main import build_content_security_policy

    # 1. Development Mode CSP:
    # Must retain local dev origins for Vite HMR and 'unsafe-inline' for development scripts
    dev_settings = SimpleNamespace(frontend_url="http://localhost:5173")
    dev_csp = build_content_security_policy(is_prod=False, app_settings=dev_settings)
    assert "script-src 'self' 'unsafe-inline'" in dev_csp
    assert "connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*" in dev_csp
    assert "object-src 'none'" in dev_csp
    assert "frame-ancestors 'none'" in dev_csp

    # 2. Production Mode CSP:
    # Must strictly exclude localhost/127.0.0.1/ws: dev origins
    # Must exclude 'unsafe-inline' from script-src
    prod_settings = SimpleNamespace(frontend_url="https://marineguard.gov.in")
    prod_csp = build_content_security_policy(is_prod=True, app_settings=prod_settings)
    assert "script-src 'self'" in prod_csp
    assert "'unsafe-inline'" not in prod_csp.split("script-src")[1].split(";")[0]
    assert "localhost" not in prod_csp
    assert "127.0.0.1" not in prod_csp
    assert "ws:" not in prod_csp
    assert "connect-src 'self' https://marineguard.gov.in" in prod_csp
    assert "object-src 'none'" in prod_csp
    assert "frame-ancestors 'none'" in prod_csp


def test_csp_production_connect_src_origin_validation():
    from app.main import build_content_security_policy

    # If frontend_url is unset or points to localhost in production, only 'self' is permitted
    prod_local = SimpleNamespace(frontend_url="http://localhost:5173")
    csp_local = build_content_security_policy(is_prod=True, app_settings=prod_local)
    assert "connect-src 'self';" in csp_local
    assert "localhost" not in csp_local

    # Malformed or wildcard frontend_url is rejected and not added to connect-src
    prod_wildcard = SimpleNamespace(frontend_url="https://*.evil.com")
    csp_wildcard = build_content_security_policy(is_prod=True, app_settings=prod_wildcard)
    assert "connect-src 'self';" in csp_wildcard
    assert "evil.com" not in csp_wildcard


def test_docs_toggle_in_development_vs_production():
    from app.main import docs_url, redoc_url, openapi_url
    settings = get_settings()
    is_prod = (settings.app_env or "").strip().lower() in ("production", "prod")
    if is_prod:
        assert docs_url is None
        assert redoc_url is None
        assert openapi_url is None
    else:
        assert docs_url == "/docs"
        assert redoc_url == "/redoc"
        assert openapi_url == "/openapi.json"


# ── Step 4: Photo Upload Hardening Tests ─────────────────────────────────────

def test_upload_valid_jpeg(env):
    client, Session = env
    t_alice = _token(client, "alice@example.com", "citizen")
    jpeg_bytes = _make_valid_image("JPEG")
    files = {"image": ("field.jpg", io.BytesIO(jpeg_bytes), "image/jpeg")}
    data = {
        "location": "Chennai Coast",
        "latitude": 13.08,
        "longitude": 80.27,
        "date": "2026-10-10",
        "time": "10:00",
        "description": "Oil slick observed near harbour entrance with pungent odor.",
        "incident_category": "SURFACE_SHEEN",
        "severity": "HIGH",
    }
    res = client.post("/api/citizen/reports", data=data, files=files, headers={"Authorization": f"Bearer {t_alice}"})
    assert res.status_code == 201, res.text
    out = res.json()
    assert out["photo_url"].startswith("/uploads/reports/rep_")
    assert out["photo_url"].endswith(".jpg")

    # Clean up uploaded file
    filename = Path(out["photo_url"]).name
    fpath = Path("uploads/reports") / filename
    if fpath.exists():
        fpath.unlink()


def test_upload_valid_png(env):
    client, Session = env
    t_alice = _token(client, "alice@example.com", "citizen")
    png_bytes = _make_valid_image("PNG")
    files = {"image": ("field.png", io.BytesIO(png_bytes), "image/png")}
    data = {
        "location": "Ennore Beach",
        "latitude": 13.20,
        "longitude": 80.32,
        "date": "2026-10-10",
        "time": "11:00",
        "description": "Tar balls deposited along sandy coastline section.",
        "incident_category": "TAR_BALLS",
        "severity": "MEDIUM",
    }
    res = client.post("/api/citizen/reports", data=data, files=files, headers={"Authorization": f"Bearer {t_alice}"})
    assert res.status_code == 201, res.text
    out = res.json()
    assert out["photo_url"].endswith(".png")

    filename = Path(out["photo_url"]).name
    fpath = Path("uploads/reports") / filename
    if fpath.exists():
        fpath.unlink()


def test_upload_spoofed_mime_type_rejected(env):
    client, Session = env
    t_alice = _token(client, "alice@example.com", "citizen")
    # Non-image shell script spoofed as image/jpeg
    fake_bytes = b"#!/bin/bash\necho 'malicious code execution attempt'\n" * 5
    files = {"image": ("malicious.jpg", io.BytesIO(fake_bytes), "image/jpeg")}
    data = {
        "location": "Marina Beach",
        "latitude": 13.05,
        "longitude": 80.28,
        "date": "2026-10-10",
        "time": "12:00",
        "description": "Attempting spoofed upload attack test.",
        "incident_category": "SURFACE_SHEEN",
        "severity": "LOW",
    }
    res = client.post("/api/citizen/reports", data=data, files=files, headers={"Authorization": f"Bearer {t_alice}"})
    assert res.status_code == 400
    assert "not a valid" in res.json()["detail"].lower() or "unsupported" in res.json()["detail"].lower()


def test_upload_truncated_or_corrupt_rejected(env):
    client, Session = env
    t_alice = _token(client, "alice@example.com", "citizen")
    # Arbitrary non-image bytes of length 150
    corrupt_bytes = b"CORRUPT" * 25
    files = {"image": ("corrupt.jpg", io.BytesIO(corrupt_bytes), "image/jpeg")}
    data = {
        "location": "Marina Beach",
        "latitude": 13.05,
        "longitude": 80.28,
        "date": "2026-10-10",
        "time": "12:00",
        "description": "Attempting corrupted image upload.",
        "incident_category": "SURFACE_SHEEN",
        "severity": "LOW",
    }
    res = client.post("/api/citizen/reports", data=data, files=files, headers={"Authorization": f"Bearer {t_alice}"})
    assert res.status_code == 400


def test_upload_oversized_rejected(env):
    client, Session = env
    t_alice = _token(client, "alice@example.com", "citizen")
    # 11MB of zero bytes disguised as image
    oversized_bytes = b"\xff\xd8\xff\xe0" + b"\x00" * (11 * 1024 * 1024)
    files = {"image": ("huge.jpg", io.BytesIO(oversized_bytes), "image/jpeg")}
    data = {
        "location": "Marina Beach",
        "latitude": 13.05,
        "longitude": 80.28,
        "date": "2026-10-10",
        "time": "12:00",
        "description": "Attempting oversized upload test.",
        "incident_category": "SURFACE_SHEEN",
        "severity": "LOW",
    }
    res = client.post("/api/citizen/reports", data=data, files=files, headers={"Authorization": f"Bearer {t_alice}"})
    assert res.status_code == 413, f"Expected 413 Content Too Large, got {res.status_code}"
