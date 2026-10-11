"""
Real-stack RBAC tests (SQLite in-memory; no PostgreSQL needed).
Covers: login/role mismatch, 401/403 enforcement on admin APIs, citizen report ownership,
admin verification workflow, public-safe data, inactive accounts, token expiry, vessel ranking.
"""
import io
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.core import security
from app.core.config import Settings, get_settings
from app.core.security import hash_password, _secret
from app.database.session import Base, get_db
from app.main import app
from app.models.user import User

pytestmark = pytest.mark.real_auth

PW = "S3cure-Passw0rd!"
# Test-only secret key (>= 32 bytes to conform to RFC 7518 Section 3.2 for HMAC-SHA256)
TEST_WRONG_SECRET = "wrong_hmac_signing_key_for_tampering_test_min_32_bytes"


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
        db.add(User(id="a1", name="Admin One", email="admin@example.com",
                    password_hash=hash_password(PW), role="admin"))
        db.add(User(id="c1", name="Citizen One", email="cit@example.com",
                    password_hash=hash_password(PW), role="citizen"))
        db.add(User(id="c2", name="Citizen Two", email="cit2@example.com",
                    password_hash=hash_password(PW), role="citizen"))
        db.add(User(id="c3", name="Disabled", email="off@example.com",
                    password_hash=hash_password(PW), role="citizen", is_active=False))
        db.commit()
    yield TestClient(app), Session
    app.dependency_overrides.pop(get_db, None)


def login(client, email, role, pw=PW):
    return client.post("/api/auth/login", json={"email": email, "password": pw, "role": role})


def hdr(client, email, role):
    r = login(client, email, role)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def report_form():
    return {
        "location": "Marina Beach", "latitude": "13.05", "longitude": "80.28",
        "date": "2026-01-01", "time": "10:30", "description": "Dark oily sheen near shore",
        "severity": "high",
    }


# ── login ──────────────────────────────────────────────────────────────────

def test_login_success_and_no_hash_leak(env):
    c, _ = env
    r = login(c, "cit@example.com", "citizen")
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["role"] == "citizen"
    assert "password" not in str(body).lower().replace("password_", "")
    assert "hash" not in str(body).lower()


def test_login_invalid_credentials_generic(env):
    c, _ = env
    r1 = login(c, "cit@example.com", "citizen", pw="wrong-password")
    r2 = login(c, "nobody@example.com", "citizen")
    assert r1.status_code == r2.status_code == 401
    assert r1.json() == r2.json() == {"detail": "Invalid credentials"}


def test_login_role_mismatch(env):
    c, _ = env
    r = login(c, "cit@example.com", "admin")
    assert r.status_code == 403
    assert r.json()["detail"] == "Unauthorized role. Please use the correct login option."
    assert login(c, "admin@example.com", "citizen").status_code == 403


def test_inactive_account_rejected(env):
    c, _ = env
    assert login(c, "off@example.com", "citizen").status_code == 403


def test_login_lockout(env):
    c, _ = env
    for _ in range(5):
        assert login(c, "cit@example.com", "citizen", pw="bad-bad-bad").status_code == 401
    assert login(c, "cit@example.com", "citizen").status_code == 429


def test_register_creates_citizen_only(env):
    c, S = env
    r = c.post("/api/auth/register", json={"name": "New Person", "email": "new@example.com",
                                          "password": PW, "role": "admin"})
    assert r.status_code == 201
    assert r.json()["role"] == "citizen"
    with S() as db:
        u = db.query(User).filter_by(email="new@example.com").one()
        assert u.password_hash != PW and u.password_hash.startswith("$2")
    assert c.post("/api/auth/register", json={"name": "Weak", "email": "w@example.com",
                                             "password": "short"}).status_code == 422


# ── RBAC enforcement ───────────────────────────────────────────────────────

ADMIN_ENDPOINTS = [
    ("get", "/api/admin/dashboard"), ("get", "/api/admin/reports"), ("get", "/api/admin/ais"),
    ("get", "/api/admin/vessel-ranking"), ("get", "/api/admin/users"), ("get", "/api/admin/alerts"),
    ("get", "/api/admin/hindcast"), ("get", "/api/admin/drift"), ("get", "/api/admin/evidence"),
    ("post", "/api/admin/detection"), ("post", "/api/admin/investigation"),
    ("get", "/api/v1/incidents"), ("get", "/api/v1/vessels/live"), ("get", "/api/v1/dashboard/summary"),
    ("post", "/api/v1/detection/analyze"), ("get", "/api/v1/reports"),
]


@pytest.mark.parametrize("method,path", ADMIN_ENDPOINTS)
def test_citizen_forbidden_and_anonymous_unauthorized(env, method, path):
    c, _ = env
    assert getattr(c, method)(path).status_code == 401
    h = hdr(c, "cit@example.com", "citizen")
    assert getattr(c, method)(path, headers=h).status_code == 403


def test_admin_cannot_use_citizen_submit_but_citizen_can(env):
    c, _ = env
    assert c.post("/api/citizen/reports", data=report_form(),
                  headers=hdr(c, "admin@example.com", "admin")).status_code == 403
    assert c.post("/api/citizen/reports", data=report_form()).status_code == 401
    r = c.post("/api/citizen/reports", data=report_form(), headers=hdr(c, "cit@example.com", "citizen"))
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "SUBMITTED"


def test_token_expiry_and_tampering(env):
    c, _ = env
    s = get_settings()
    expired = jwt.encode({"sub": "c1", "role": "citizen", "iat": 1, "exp": int(
        (datetime.now(timezone.utc) - timedelta(minutes=5)).timestamp())}, s.secret_key, algorithm="HS256")
    assert c.get("/api/auth/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401
    forged = jwt.encode({"sub": "c1", "role": "admin", "iat": 1, "exp": 9999999999}, TEST_WRONG_SECRET, algorithm="HS256")
    assert c.get("/api/admin/dashboard", headers={"Authorization": f"Bearer {forged}"}).status_code == 401
    assert c.get("/api/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401

    # Tampering with signature bytes of an otherwise valid token must be rejected
    valid_token, _ = security.create_access_token("c1", "citizen")
    parts = valid_token.split(".")
    tampered_sig = parts[2][:-1] + ("X" if parts[2][-1] != "X" else "Y")
    tampered_token = f"{parts[0]}.{parts[1]}.{tampered_sig}"
    assert c.get("/api/auth/me", headers={"Authorization": f"Bearer {tampered_token}"}).status_code == 401


def test_role_claim_in_token_is_not_trusted(env):
    """A citizen's genuine token with a doctored role claim cannot reach admin APIs (role re-read from DB)."""
    c, _ = env
    s = get_settings()
    t = jwt.encode({"sub": "c1", "role": "admin", "iat": 1, "exp": 9999999999}, s.secret_key, algorithm="HS256")
    assert c.get("/api/admin/dashboard", headers={"Authorization": f"Bearer {t}"}).status_code == 403


# ── JWT security & production secret validation ────────────────────────────

def test_production_rejects_missing_secret():
    """Production must reject missing or empty secrets rather than silently using a weak default."""
    with pytest.raises(ValueError, match="SECRET_KEY is missing or empty"):
        Settings(app_env="production", secret_key="")
    with pytest.raises(ValueError, match="SECRET_KEY is missing or empty"):
        Settings(app_env="production", secret_key="   ")


def test_production_rejects_default_or_insecure_secrets():
    """Production must reject known insecure default placeholders."""
    insecure_keys = [
        "CHANGE_ME_IN_PRODUCTION",
        "your_secret_key_here",
        "dev_secret_key_change_in_production",
        "secret",
        "changeme",
        "admin",
        "password",
    ]
    for key in insecure_keys:
        with pytest.raises(ValueError, match="Insecure or default SECRET_KEY detected"):
            Settings(app_env="production", secret_key=key)


def test_production_rejects_short_secret():
    """Production must reject secrets under 32 bytes (256 bits) for HMAC-SHA256."""
    with pytest.raises(ValueError, match="must be at least 32 bytes"):
        Settings(app_env="production", secret_key="short_16_byte_key")


def test_production_accepts_secure_secret():
    """Production must accept cryptographically strong secrets of at least 32 bytes."""
    valid_key = "a_very_secure_random_key_that_is_at_least_32_bytes_long_12345"
    s = Settings(app_env="production", secret_key=valid_key)
    assert s.secret_key == valid_key


def test_security_secret_function_enforces_production_rules(monkeypatch):
    """security._secret() must fail-safe if an insecure key reaches runtime outside development."""
    prod_settings_mock = Settings(
        app_env="development",
        secret_key="dev_secret_key_change_in_production",
    )
    prod_settings_mock.app_env = "production"
    monkeypatch.setattr("app.core.security.get_settings", lambda: prod_settings_mock)

    # Insecure default
    prod_settings_mock.secret_key = "CHANGE_ME_IN_PRODUCTION"
    with pytest.raises(RuntimeError, match="Insecure default SECRET_KEY detected"):
        _secret()

    # Empty
    prod_settings_mock.secret_key = ""
    with pytest.raises(RuntimeError, match="SECRET_KEY is missing or empty"):
        _secret()

    # Short (< 32 bytes)
    prod_settings_mock.secret_key = "short_key"
    with pytest.raises(RuntimeError, match="must be at least 32 bytes"):
        _secret()

    # Valid >= 32 bytes
    prod_settings_mock.secret_key = "a_very_secure_random_key_that_is_at_least_32_bytes_long_12345"
    assert _secret() == "a_very_secure_random_key_that_is_at_least_32_bytes_long_12345"


def test_deactivation_blocks_existing_token(env):
    c, S = env
    h = hdr(c, "cit@example.com", "citizen")
    assert c.get("/api/citizen/summary", headers=h).status_code == 200
    with S() as db:
        db.get(User, "c1").is_active = False
        db.commit()
    assert c.get("/api/citizen/summary", headers=h).status_code == 403


# ── citizen reports & admin workflow ───────────────────────────────────────

def test_citizen_report_ownership_and_admin_workflow(env):
    c, _ = env
    ch1 = hdr(c, "cit@example.com", "citizen")
    ch2 = hdr(c, "cit2@example.com", "citizen")
    ah = hdr(c, "admin@example.com", "admin")

    rep = c.post("/api/citizen/reports", data=report_form(), headers=ch1).json()
    rid = rep["id"]

    assert [r["id"] for r in c.get("/api/citizen/reports", headers=ch1).json()] == [rid]
    assert c.get("/api/citizen/reports", headers=ch2).json() == []
    assert c.get(f"/api/citizen/reports/{rid}", headers=ch2).status_code == 404

    admin_list = c.get("/api/admin/reports", headers=ah).json()
    assert admin_list[0]["citizen"] == "Citizen One"

    r = c.post(f"/api/admin/reports/{rid}/action", headers=ah, json={
        "action": "verify", "notes": "internal: matches satellite pass",
        "public_remarks": "Thank you — verified.", "run_ai_check": False})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "VERIFIED"

    mine = c.get(f"/api/citizen/reports/{rid}", headers=ch1).json()
    assert mine["status"] == "VERIFIED"
    assert mine["public_remarks"] == "Thank you — verified."
    # no admin-only data leaks to the citizen
    for forbidden in ("review_notes", "ai_analysis_notes", "reporter_contact", "linked_incident_id", "user_id"):
        assert forbidden not in mine
    assert "internal" not in str(mine["timeline"])
    assert [t["status"] for t in mine["timeline"]] == ["SUBMITTED", "VERIFIED"]

    assert c.post(f"/api/admin/reports/{rid}/action", headers=ah,
                  json={"action": "start_investigation"}).json()["status"] == "INVESTIGATION_STARTED"
    assert c.post(f"/api/admin/reports/{rid}/action", headers=ah,
                  json={"action": "resolve"}).json()["status"] == "RESOLVED"
    summary = c.get("/api/citizen/summary", headers=ch1).json()
    assert summary["reports_submitted"] == 1 and summary["verified_incidents"] == 1


def test_report_validation(env):
    c, _ = env
    h = hdr(c, "cit@example.com", "citizen")
    bad = report_form() | {"latitude": "123"}
    assert c.post("/api/citizen/reports", data=bad, headers=h).status_code == 422
    future = report_form() | {"date": "2999-01-01"}
    assert c.post("/api/citizen/reports", data=future, headers=h).status_code == 422
    files = {"image": ("x.exe", io.BytesIO(b"MZ" + b"\0" * 300), "application/x-msdownload")}
    assert c.post("/api/citizen/reports", data=report_form(), files=files, headers=h).status_code == 400
    files = {"video": ("x.mp4", io.BytesIO(b"not a video" * 20), "video/mp4")}
    assert c.post("/api/citizen/reports", data=report_form(), files=files, headers=h).status_code == 400


# ── alerts, users, public ──────────────────────────────────────────────────

def test_alerts_public_safe_and_users_management(env):
    c, _ = env
    ah = hdr(c, "admin@example.com", "admin")
    ch = hdr(c, "cit@example.com", "citizen")
    a = c.post("/api/admin/alerts", headers=ah, json={
        "title": "Coastal warning", "description": "Avoid shoreline", "severity": "HIGH",
        "status": "ACTIVE", "alert_type": "COASTAL_WARNING", "latitude": 13.0, "longitude": 80.2})
    assert a.status_code == 201
    c.post("/api/admin/alerts", headers=ah, json={
        "title": "Draft only", "description": "not public", "status": "DRAFT"})
    titles = [x["title"] for x in c.get("/api/citizen/alerts", headers=ch).json()]
    assert titles == ["Coastal warning"]
    assert [x["title"] for x in c.get("/api/public/alerts").json()] == ["Coastal warning"]
    assert c.post("/api/admin/alerts", headers=ch, json={"title": "x" * 5, "description": "y" * 5}).status_code == 403

    pub = c.get("/api/public/spills").json()
    assert set(pub) == {"spills", "citizen_reports", "emergency_zones"}
    assert pub["emergency_zones"][0]["radius_km"] == 10.0

    users = c.get("/api/admin/users", headers=ah).json()
    assert "password_hash" not in str(users)
    assert c.patch("/api/admin/users/a1", headers=ah, json={"is_active": False}).status_code == 400
    assert c.patch("/api/admin/users/c1", headers=ah, json={"is_active": False}).status_code == 200
    assert login(c, "cit@example.com", "citizen").status_code == 403
    assert c.patch("/api/admin/users/c1", headers=hdr(c, "cit2@example.com", "citizen"),
                   json={"is_active": True}).status_code == 403


# ── explainable vessel ranking ─────────────────────────────────────────────

def test_vessel_ranking_explainable(env):
    c, S = env
    from app.models.incident import Incident
    from app.models.enums import IncidentSeverity, IncidentStatus
    with S() as db:
        db.add(Incident(incident_code="INC-T-1", status=IncidentStatus.VERIFIED,
                        severity=IncidentSeverity.HIGH, latitude=13.0, longitude=80.5,
                        spill_area_km2=12.0, risk_score=70.0, detected_at=datetime.now(timezone.utc),
                        is_active=True))
        db.commit()
    ah = hdr(c, "admin@example.com", "admin")
    r = c.get("/api/admin/vessel-ranking?incident_id=INC-T-1", headers=ah)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["data_origin"] == "SIMULATION"
    vs = data["vessels"]
    assert [v["rank"] for v in vs] == list(range(1, len(vs) + 1))
    assert vs[0]["investigation_score"] >= vs[1]["investigation_score"] >= vs[2]["investigation_score"]
    assert vs[0]["classification"] == "Most Likely Associated Vessel"
    assert sum(b["weight_pct"] for b in vs[0]["breakdown"]) == 100
    assert all(b["explanation"] for b in vs[0]["breakdown"])
    assert "guilty" not in str(data).lower()

    ais = c.get("/api/admin/ais?incident_id=INC-T-1", headers=ah).json()
    assert {"mmsi", "latitude", "longitude", "speed_knots", "course_deg", "heading_deg", "timestamp",
            "history", "distance_from_origin_km", "time_correlation_pct",
            "trajectory_correlation_pct", "behavioural_anomaly"} <= set(ais["vessels"][0])

    inv = c.post("/api/admin/investigation", headers=ah, json={"incident_id": "INC-T-1", "title": "T"})
    assert inv.status_code == 201, inv.text
    assert len(inv.json()["scores"]) == len(vs)
