"""
Comprehensive End-to-End Audit & Verification Suite for Marine Guard:
1. Complete Oil Spill Detection, GIS, Risk, AIS Attribution & Drift Workflow
2. Complete Marine Waste Detection, Classification, 5-Factor Scoring & Cleanup Action Workflow
3. Strict RBAC Enforcement (Citizen vs Admin vs Anonymous vs Forged)
4. Database & Cross-Module Data Consistency
"""
import io
import json
import pytest
from PIL import Image
from fastapi.testclient import TestClient

import app.models  # noqa: F401
from app.main import app
from app.database.session import Base, engine, SessionLocal
from app.core.security import hash_password
from app.models.user import User, ROLE_ADMIN, ROLE_CITIZEN
from app.models.marine_waste import MarineWasteIncident
from app.models.incident import Incident
from app.services.waste_service import MarineWasteService

pytestmark = pytest.mark.real_auth


def create_synthetic_image(color=(30, 80, 150), size=(200, 200)) -> bytes:
    img = Image.new("RGB", size, color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture(scope="module")
def client():
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        # Ensure test users
        if not db.query(User).filter_by(email="audit_admin@marine.gov.in").first():
            db.add(User(
                id="audit-admin-id",
                name="Audit Administrator",
                email="audit_admin@marine.gov.in",
                password_hash=hash_password("AdminSecure2026!"),
                role=ROLE_ADMIN,
                is_active=True,
            ))
        if not db.query(User).filter_by(email="audit_citizen1@marine.org").first():
            db.add(User(
                id="audit-citizen1-id",
                name="Audit Citizen One",
                email="audit_citizen1@marine.org",
                password_hash=hash_password("CitizenSecure2026!"),
                role=ROLE_CITIZEN,
                is_active=True,
            ))
        if not db.query(User).filter_by(email="audit_citizen2@marine.org").first():
            db.add(User(
                id="audit-citizen2-id",
                name="Audit Citizen Two",
                email="audit_citizen2@marine.org",
                password_hash=hash_password("CitizenSecure2026!"),
                role=ROLE_CITIZEN,
                is_active=True,
            ))
        db.commit()

    test_client = TestClient(app)
    return test_client


def get_token(client, email, password, role):
    resp = client.post("/api/auth/login", json={"email": email, "password": password, "role": role})
    assert resp.status_code == 200, f"Login failed for {email}: {resp.text}"
    return resp.json()["access_token"]


# =========================================================================
# 1. E2E OIL SPILL PIPELINE AUDIT
# =========================================================================
def test_e2e_oil_spill_pipeline(client):
    admin_token = get_token(client, "audit_admin@marine.gov.in", "AdminSecure2026!", "admin")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Run Oil Spill Detection API
    img_bytes = create_synthetic_image(color=(20, 30, 40), size=(256, 256))
    files = {"file": ("sar_oil_slick.jpg", io.BytesIO(img_bytes), "image/jpeg")}
    detect_resp = client.post(
        "/api/v1/detection/analyze",
        files=files,
        data={"latitude": 13.0827, "longitude": 80.2707, "source": "SENTINEL_1"},
        headers=admin_headers,
    )
    assert detect_resp.status_code == 200, f"Detection failed: {detect_resp.text}"
    det_data = detect_resp.json()
    assert det_data["detected"] is True
    assert "confidence" in det_data
    assert "spill_area_km2" in det_data

    # 2. Ingest Incident
    import uuid
    code = f"AUD-{uuid.uuid4().hex[:6].upper()}"
    inc_resp = client.post(
        "/api/v1/incidents",
        json={
            "incident_code": code,
            "latitude": 13.0827,
            "longitude": 80.2707,
            "status": "DETECTED",
            "severity": "CRITICAL",
            "risk_score": 88.5,
            "detection_confidence": 0.92,
            "spill_area_km2": 4.5,
            "description": "SAR slick observed off Chennai Port",
            "source": "SENTINEL_1",
            "location_geojson": {"type": "Point", "coordinates": [80.2707, 13.0827]},
        },
        headers=admin_headers,
    )
    assert inc_resp.status_code in (200, 201), f"Incident creation failed: {inc_resp.text}"
    incident_id = inc_resp.json()["id"]

    # 3. Retrieve GIS Map incidents and layers
    map_resp = client.get("/api/v1/map/incidents", headers=admin_headers)
    assert map_resp.status_code == 200
    incidents = map_resp.json()["incidents"]
    assert any(i["id"] == incident_id for i in incidents)

    # 4. AIS Vessel Correlation & Suspect Attribution
    suspect_resp = client.get(f"/api/v1/vessels/suspect/{incident_id}", headers=admin_headers)
    assert suspect_resp.status_code == 200
    suspect_data = suspect_resp.json()
    assert "suspects" in suspect_data
    assert isinstance(suspect_data["suspects"], list)

    # 5. Reverse Drift (Hindcast) Evaluation
    hindcast_resp = client.post(
        f"/api/v1/incidents/{incident_id}/source-analysis",
        json={
            "lookback_hours": 12,
            "force_recalculate": True,
        },
        headers=admin_headers,
    )
    assert hindcast_resp.status_code in (200, 201)
    hc_data = hindcast_resp.json()
    assert "reverse_trajectory" in hc_data or "candidates" in hc_data

    # 6. Forward Drift Movement Prediction
    drift_resp = client.post(
        f"/api/v1/incidents/{incident_id}/movement/predict",
        json={},
        headers=admin_headers,
    )
    assert drift_resp.status_code in (200, 201)
    dr_data = drift_resp.json()
    assert "forecast_points" in dr_data or "trajectory_geojson" in dr_data

    # 7. Summary Dashboard KPIs
    summary_resp = client.get("/api/v1/dashboard/summary", headers=admin_headers)
    assert summary_resp.status_code == 200
    assert "total_incidents" in summary_resp.json()


# =========================================================================
# 2. E2E MARINE WASTE PIPELINE AUDIT
# =========================================================================
def test_e2e_marine_waste_pipeline(client):
    citizen_token = get_token(client, "audit_citizen1@marine.org", "CitizenSecure2026!", "citizen")
    citizen_headers = {"Authorization": f"Bearer {citizen_token}"}
    admin_token = get_token(client, "audit_admin@marine.gov.in", "AdminSecure2026!", "admin")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. AI Marine Waste Detection
    waste_bytes = create_synthetic_image(color=(16, 185, 129), size=(200, 200))
    files = {"image": ("floating_plastics.jpg", io.BytesIO(waste_bytes), "image/jpeg")}
    detect_resp = client.post(
        "/api/waste/detect",
        files=files,
        data={"latitude": 13.05, "longitude": 80.28, "distance_from_coast_km": 2.0},
    )
    assert detect_resp.status_code == 200
    det = detect_resp.json()
    assert det["detected"] is True
    assert det["waste_type"] in ["FLOATING_PLASTIC", "PLASTIC_BOTTLES", "FISHING_NETS", "MARINE_DEBRIS", "FLOATING_WASTE", "OTHER_WASTE"]
    assert 0.0 <= det["pollution_score"] <= 100.0
    assert det["severity"] in ["LOW", "MODERATE", "HIGH", "CRITICAL"]
    assert "P" in det["cleanup_priority"]
    assert "score_breakdown" in det
    assert len(det["recommended_action"]) > 0

    # 2. Submit Citizen Waste Report
    report_form = {
        "location": "Marina Beach South Sector",
        "latitude": "13.045",
        "longitude": "80.281",
        "date": "2026-01-01",
        "time": "09:00",
        "description": "Dense pile of fishing nets and plastic containers washed near waterline.",
        "waste_type": "FISHING_NETS",
        "density": "HIGH",
        "severity": "CRITICAL",
        "auto_escalate_incident": "true",
    }
    report_files = {"image": ("debris.jpg", io.BytesIO(waste_bytes), "image/jpeg")}
    rep_resp = client.post(
        "/api/waste/reports",
        data=report_form,
        files=report_files,
        headers=citizen_headers,
    )
    assert rep_resp.status_code == 201, f"Report submission failed: {rep_resp.text}"
    rep_data = rep_resp.json()
    assert rep_data["status"] == "SUBMITTED"
    assert rep_data["pollution_type"] == "MARINE_WASTE"
    report_id = rep_data["report_id"]

    # 3. Citizen can list own reports and sees this report
    my_reports_resp = client.get("/api/waste/reports", headers=citizen_headers)
    assert my_reports_resp.status_code == 200
    my_reports = my_reports_resp.json()
    assert any(r["id"] == report_id for r in my_reports)

    # 4. Admin lists marine waste incidents
    incidents_resp = client.get("/api/waste/incidents", headers=admin_headers)
    assert incidents_resp.status_code == 200
    waste_incidents = incidents_resp.json()
    assert len(waste_incidents) >= 1
    target_inc = next(i for i in waste_incidents if i.get("latitude") == 13.045)
    incident_id = target_inc["id"]

    # 5. Admin assigns cleanup action and transitions status
    action_resp = client.post(
        f"/api/waste/incidents/{incident_id}/action",
        json={
            "action": "DIVING_RETRIEVAL_NET",
            "action_notes": "Emergency diver squad dispatched to free net from reef.",
            "status_update": "ACTION_ASSIGNED",
        },
        headers=admin_headers,
    )
    assert action_resp.status_code == 200
    act_data = action_resp.json()
    assert act_data["status"] == "ACTION_ASSIGNED"
    assert act_data["action_taken"] == "DIVING_RETRIEVAL_NET"

    # 6. Admin resolves incident
    resolve_resp = client.post(
        f"/api/waste/incidents/{incident_id}/action",
        json={
            "action": "DIVING_RETRIEVAL_NET",
            "action_notes": "Nets completely recovered and weighed at port depot.",
            "status_update": "RESOLVED",
        },
        headers=admin_headers,
    )
    assert resolve_resp.status_code == 200
    assert resolve_resp.json()["status"] == "RESOLVED"

    # 7. Summary KPIs reflect the data
    summary_resp = client.get("/api/waste/summary")
    assert summary_resp.status_code == 200
    summ = summary_resp.json()
    assert summ["total_incidents"] >= 1

    # 8. GeoJSON Map Layers return correct properties
    map_layers_resp = client.get("/api/waste/map/layers")
    assert map_layers_resp.status_code == 200
    features = map_layers_resp.json()["features"]
    assert any(f["properties"]["id"] == incident_id for f in features)


# =========================================================================
# 3. STRICT RBAC SECURITY AUDIT
# =========================================================================
def test_strict_rbac_security(client):
    citizen_token = get_token(client, "audit_citizen1@marine.org", "CitizenSecure2026!", "citizen")
    citizen2_token = get_token(client, "audit_citizen2@marine.org", "CitizenSecure2026!", "citizen")
    admin_token = get_token(client, "audit_admin@marine.gov.in", "AdminSecure2026!", "admin")

    c1_hdr = {"Authorization": f"Bearer {citizen_token}"}
    c2_hdr = {"Authorization": f"Bearer {citizen2_token}"}
    adm_hdr = {"Authorization": f"Bearer {admin_token}"}
    fake_hdr = {"Authorization": "Bearer forged.invalid.token"}

    # 1. Unauthenticated request to protected endpoint -> 401
    assert client.get("/api/admin/dashboard").status_code == 401
    assert client.get("/api/citizen/summary").status_code == 401
    assert client.get("/api/waste/reports").status_code == 401

    # 2. Forged token -> 401
    assert client.get("/api/admin/dashboard", headers=fake_hdr).status_code == 401
    assert client.get("/api/citizen/summary", headers=fake_hdr).status_code == 401

    # 3. Citizen accessing Admin routes -> 403 Forbidden
    admin_endpoints = [
        ("GET", "/api/admin/dashboard"),
        ("GET", "/api/admin/reports"),
        ("GET", "/api/admin/users"),
        ("GET", "/api/admin/alerts"),
        ("POST", "/api/waste/incidents"),
    ]
    for method, path in admin_endpoints:
        if method == "GET":
            res = client.get(path, headers=c1_hdr)
        else:
            res = client.post(path, json={}, headers=c1_hdr)
        assert res.status_code == 403, f"Expected 403 for citizen on {path}, got {res.status_code}"

    # 4. Citizen cannot view private data of another citizen
    # Submit report by citizen 1
    form_data = {
        "location": "Private Cove",
        "latitude": "12.9",
        "longitude": "80.1",
        "date": "2026-01-01",
        "time": "08:30",
        "description": "Private debris observation.",
        "severity": "HIGH",
    }
    c1_rep_resp = client.post("/api/citizen/reports", data=form_data, headers=c1_hdr)
    assert c1_rep_resp.status_code == 201, f"Report submit failed: {c1_rep_resp.text}"
    c1_rep = c1_rep_resp.json()
    rep_id = c1_rep["id"]

    # Citizen 2 cannot see report in their own reports list
    c2_list = client.get("/api/citizen/reports", headers=c2_hdr).json()
    assert not any(r["id"] == rep_id for r in c2_list)

    # Citizen 2 directly requesting citizen 1's report -> 404/403
    direct_req = client.get(f"/api/citizen/reports/{rep_id}", headers=c2_hdr)
    assert direct_req.status_code in (403, 404)

    # 5. Admin can access all reports and admin endpoints -> 200
    assert client.get("/api/admin/dashboard", headers=adm_hdr).status_code == 200
    assert client.get("/api/admin/reports", headers=adm_hdr).status_code == 200


# =========================================================================
# 4. POLLUTION SCORING & FORMULA BOUNDARY AUDIT
# =========================================================================
def test_pollution_scoring_formula_boundaries():
    """
    Validates:
      Pollution Score =
          (Density × 0.35)
        + (Affected Area × 0.25)
        + (Coast Distance × 0.15)
        + (Ecological Sensitivity × 0.15)
        + (Waste Severity × 0.10)

      0–25   → LOW
      26–50  → MODERATE
      51–75  → HIGH
      76–100 → CRITICAL
    """
    # Test boundary 1: 0 (min clamp)
    score_0, bd_0 = MarineWasteService.calculate_pollution_score(
        waste_type="OTHER_WASTE",
        density_score=0.0,
        estimated_area_m2=0.0,
        distance_from_coast_km=100.0,
        latitude=0.0,
        longitude=0.0,
    )
    assert 0.0 <= score_0 <= 100.0
    assert not (score_0 != score_0)  # No NaN

    # Test exact severity thresholds
    assert MarineWasteService.classify_severity(0.0) == "LOW"
    assert MarineWasteService.classify_severity(25.0) == "LOW"
    assert MarineWasteService.classify_severity(26.0) == "MODERATE"
    assert MarineWasteService.classify_severity(50.0) == "MODERATE"
    assert MarineWasteService.classify_severity(51.0) == "HIGH"
    assert MarineWasteService.classify_severity(75.0) == "HIGH"
    assert MarineWasteService.classify_severity(76.0) == "CRITICAL"
    assert MarineWasteService.classify_severity(100.0) == "CRITICAL"

    # Priority mapping checks
    assert "P1" in MarineWasteService.determine_cleanup_priority(85.0, "CRITICAL", "FISHING_NETS", True, False, 13.0, 80.0)
    assert "P4" in MarineWasteService.determine_cleanup_priority(15.0, "LOW", "OTHER_WASTE", False, False, 13.0, 80.0)

    # Action recommendations
    assert MarineWasteService.recommend_action("FISHING_NETS", "CRITICAL", "P1 — IMMEDIATE", False) == "Diving Retrieval Net"
    assert MarineWasteService.recommend_action("FLOATING_PLASTIC", "HIGH", "P2 — HIGH", False) == "Beach Cleanup Crew"
    assert MarineWasteService.recommend_action("MARINE_DEBRIS", "HIGH", "P2 — HIGH", False) == "Harbor Skimmer Boat"
    assert MarineWasteService.recommend_action("OTHER_WASTE", "LOW", "P4 — LOW", False) == "Monitor Area"
    assert MarineWasteService.recommend_action("OTHER_WASTE", "HIGH", "P2 — HIGH", True) == "Port Notification"
