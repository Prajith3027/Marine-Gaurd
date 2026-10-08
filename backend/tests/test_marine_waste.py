"""
Unit and integration tests for the Marine Waste & Debris Module.
Tests cover:
- Waste detection AI inference (real computer vision processing, confidence, density, hazards)
- Pollution score calculation (exact 35/25/15/15/10 formula)
- Severity classification (0-25 LOW, 26-50 MODERATE, 51-75 HIGH, 76-100 CRITICAL)
- Cleanup priority ranking (P1 to P4 with hazard escalation)
- Model creation, retrieval, and serialization
- API endpoints: /detect, /reports, /incidents, /incidents/{id}/action, /summary, /map/layers
- Authorization and role requirements
- Invalid input handling
"""
import pytest
import io
import numpy as np
from PIL import Image
from fastapi.testclient import TestClient

from app.main import app
from app.ml.waste_detector import MarineWasteDetector, analyze_marine_waste
from app.services.waste_service import MarineWasteService
from app.models.marine_waste import MarineWasteIncident
from app.database.session import get_db, SessionLocal
from app.models.user import User, ROLE_ADMIN, ROLE_CITIZEN
from app.core.security import hash_password, create_access_token
from app.core.auth import authenticate_user, require_citizen, require_admin

client = TestClient(app)


def create_synthetic_test_image(pattern: str = "plastic_mesh") -> bytes:
    """Generate in-memory RGB PNG bytes for testing real vision inference."""
    arr = np.zeros((200, 200, 3), dtype=np.uint8)
    if pattern == "plastic_mesh":
        # Draw high-contrast line grid to simulate ghost nets / ropes
        arr[::8, :, :] = [255, 255, 255]
        arr[:, ::8, :] = [255, 255, 255]
        # Add high saturation blue/cyan plastic
        arr[40:160, 40:160] = [20, 210, 230]
    elif pattern == "bottle_cluster":
        # Draw bright PET bottle shapes
        arr[30:70, 40:80] = [240, 240, 240]
        arr[100:150, 110:160] = [220, 230, 240]
    elif pattern == "clear_water":
        # Uniform dark blue water (very low edge density)
        arr[:] = [10, 30, 60]
    else:
        arr[:] = [50, 50, 50]

    img = Image.fromarray(arr)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture(autouse=True)
def setup_waste_test_db():
    """Ensure at least one seed incident exists in test SQLite db before tests run."""
    from app.database.auth_setup import migrate_citizen_reports
    from app.database.session import engine
    migrate_citizen_reports(engine)

    db = SessionLocal()
    try:
        inc = db.query(MarineWasteIncident).first()
        if not inc:
            inc = MarineWasteIncident(
                incident_code="MW-SEED-001",
                waste_type="FLOATING_PLASTIC",
                density="MODERATE",
                density_score=50.0,
                estimated_area_m2=350.0,
                estimated_items_count=18,
                entanglement_hazard=False,
                navigation_hazard=False,
                pollution_score=48.0,
                severity="MODERATE",
                cleanup_priority="P3 — MODERATE",
                status="REPORTED",
                latitude=13.0827,
                longitude=80.2707,
                location_name="Marina Beach Waters",
                distance_from_coast_km=2.0,
            )
            db.add(inc)
            db.commit()
    finally:
        db.close()


@pytest.fixture(scope="module")
def admin_headers():
    """Create or authenticate admin test user."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "test_admin_waste@cleansea.gov").first()
        if not user:
            user = User(
                email="test_admin_waste@cleansea.gov",
                name="Waste Test Admin",
                role=ROLE_ADMIN,
                password_hash=hash_password("AdminPass123!"),
                is_active=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        token, _ = create_access_token(str(user.id), user.role)
        return {"Authorization": f"Bearer {token}"}
    finally:
        db.close()


@pytest.fixture()
def citizen_headers():
    """Create or authenticate citizen test user and provide auth override."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "test_citizen_waste@cleansea.gov").first()
        if not user:
            user = User(
                email="test_citizen_waste@cleansea.gov",
                name="Waste Test Citizen",
                role=ROLE_CITIZEN,
                password_hash=hash_password("CitizenPass123!"),
                is_active=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)

        # Override require_citizen directly so the citizen report endpoint authenticates cleanly
        app.dependency_overrides[require_citizen] = lambda: user
        token, _ = create_access_token(str(user.id), user.role)
        yield {"Authorization": f"Bearer {token}"}
        app.dependency_overrides.pop(require_citizen, None)
    finally:
        db.close()


# ── TEST 1: FORMULA & SCORING MATHEMATICS ──

def test_pollution_score_formula_weights():
    """
    Verify exact formula:
    Pollution Score = Density*0.35 + Area*0.25 + Distance*0.15 + Sensitivity*0.15 + Severity*0.10
    """
    # Test case 1: High values across all components
    score_high, breakdown_high = MarineWasteService.calculate_pollution_score(
        waste_type="FISHING_NETS",
        density_score=100.0,
        estimated_area_m2=1000.0,
        distance_from_coast_km=0.5,
        latitude=9.28,
        longitude=79.31,
    )
    assert score_high >= 80.0
    assert score_high <= 100.0
    assert breakdown_high.density_weighted == 35.0
    assert breakdown_high.area_weighted == 25.0
    assert breakdown_high.distance_weighted == 14.25
    assert breakdown_high.sensitivity_weighted > 10.0
    assert breakdown_high.severity_weighted == 9.5

    # Test case 2: Low values
    score_low, breakdown_low = MarineWasteService.calculate_pollution_score(
        waste_type="OTHER_WASTE",
        density_score=10.0,
        estimated_area_m2=50.0,
        distance_from_coast_km=60.0,
        latitude=0.0,
        longitude=0.0,
    )
    assert score_low < 35.0
    assert breakdown_low.density_weighted == 3.5


def test_severity_classification_boundaries():
    """Verify 0-25 LOW, 26-50 MODERATE, 51-75 HIGH, 76-100 CRITICAL boundaries."""
    assert MarineWasteService.classify_severity(0) == "LOW"
    assert MarineWasteService.classify_severity(25) == "LOW"
    assert MarineWasteService.classify_severity(26) == "MODERATE"
    assert MarineWasteService.classify_severity(50) == "MODERATE"
    assert MarineWasteService.classify_severity(51) == "HIGH"
    assert MarineWasteService.classify_severity(75) == "HIGH"
    assert MarineWasteService.classify_severity(76) == "CRITICAL"
    assert MarineWasteService.classify_severity(100) == "CRITICAL"


def test_cleanup_priority_hazard_escalation():
    """Verify cleanup priority assignment and ghost net / navigation escalation."""
    # Low score with no hazards -> P4
    p_low = MarineWasteService.determine_cleanup_priority(
        score=20.0,
        severity="LOW",
        waste_type="FLOATING_PLASTIC",
        entanglement_hazard=False,
        navigation_hazard=False,
        latitude=0.0,
        longitude=0.0,
    )
    assert p_low == "P4 — LOW"

    # Low score escalated by ghost fishing net entanglement -> P2
    p_net_escalated = MarineWasteService.determine_cleanup_priority(
        score=20.0,
        severity="LOW",
        waste_type="FISHING_NETS",
        entanglement_hazard=True,
        navigation_hazard=False,
        latitude=0.0,
        longitude=0.0,
    )
    assert p_net_escalated in ("P1 — IMMEDIATE", "P2 — HIGH")

    # Critical score -> P1
    p_crit = MarineWasteService.determine_cleanup_priority(
        score=85.0,
        severity="CRITICAL",
        waste_type="FISHING_NETS",
        entanglement_hazard=True,
        navigation_hazard=True,
        latitude=0.0,
        longitude=0.0,
    )
    assert p_crit == "P1 — IMMEDIATE"


# ── TEST 2: COMPUTER VISION INFERENCE ENGINE ──

def test_waste_detector_real_inference_image_dependent():
    """Verify detector processes image pixels and returns different results for different inputs."""
    detector = MarineWasteDetector.get_instance()

    mesh_bytes = create_synthetic_test_image("plastic_mesh")
    water_bytes = create_synthetic_test_image("clear_water")

    result_mesh = detector.analyze_image(mesh_bytes)
    result_water = detector.analyze_image(water_bytes)

    # Both must complete with structure
    assert result_mesh["detected"] is True
    assert result_mesh["waste_type"] in (
        "FLOATING_PLASTIC", "PLASTIC_BOTTLES", "FISHING_NETS",
        "MARINE_DEBRIS", "FLOATING_WASTE", "OTHER_WASTE"
    )
    assert result_mesh["confidence"] > 0.40
    assert result_mesh["mask_overlay_base64"] is not None

    # Mesh image should have higher density and item count than uniform water
    assert result_mesh["density_score"] > result_water["density_score"]
    assert result_mesh["estimated_items_count"] >= result_water["estimated_items_count"]
    assert result_mesh["processing_time_ms"] > 0


def test_waste_detector_invalid_image_handling():
    """Verify detector handles non-image or corrupt bytes gracefully."""
    detector = MarineWasteDetector.get_instance()
    corrupt_bytes = b"NOT_A_VALID_IMAGE_DATA_12345"
    with pytest.raises(Exception):
        detector.analyze_image(corrupt_bytes)


# ── TEST 3: FASTAPI REST API ENDPOINTS ──

def test_api_waste_detect_endpoint():
    """Test POST /api/waste/detect with file upload."""
    img_bytes = create_synthetic_test_image("bottle_cluster")
    res = client.post(
        "/api/waste/detect",
        files={"file": ("bottles.png", img_bytes, "image/png")},
        data={"latitude": "13.08", "longitude": "80.27", "location_name": "Marina Beach"},
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["detected"] is True
    assert data["waste_type"] in (
        "FLOATING_PLASTIC", "PLASTIC_BOTTLES", "FISHING_NETS",
        "MARINE_DEBRIS", "FLOATING_WASTE", "OTHER_WASTE"
    )
    assert data["pollution_score"] >= 0
    assert "score_breakdown" in data
    assert data["score_breakdown"]["density_weighted"] >= 0


@pytest.mark.real_auth
def test_api_waste_citizen_report_submission(citizen_headers):
    """Test POST /api/waste/reports for citizens."""
    img_bytes = create_synthetic_test_image("plastic_mesh")
    res = client.post(
        "/api/waste/reports",
        headers=citizen_headers,
        files={"image": ("report_debris.png", img_bytes, "image/png")},
        data={
            "location": "Besant Nagar Coast",
            "latitude": "12.98",
            "longitude": "80.25",
            "date": "2026-10-08",
            "time": "10:30",
            "description": "Entangled ghost fishing net with floating bottles trapped near shore.",
            "waste_type": "FISHING_NETS",
            "density": "HIGH",
            "severity": "HIGH",
        },
    )
    assert res.status_code == 201, res.text
    rep = res.json()
    assert rep["incident_code"].startswith("MW-")
    assert rep["waste_type"] == "FISHING_NETS"
    assert rep["pollution_score"] > 0
    assert rep["severity"] in ("LOW", "MODERATE", "HIGH", "CRITICAL")
    assert rep["cleanup_priority"] in ("P1 — IMMEDIATE", "P2 — HIGH", "P3 — MODERATE", "P4 — LOW")


def test_api_waste_incidents_crud_and_action(admin_headers):
    """Test incident retrieval, filtering, and admin dispatch action."""
    # 1. Fetch incident list
    list_res = client.get("/api/waste/incidents")
    assert list_res.status_code == 200
    incidents = list_res.json()
    assert isinstance(incidents, list)
    assert len(incidents) >= 1

    target_inc = incidents[0]
    inc_id = target_inc["id"]

    # 2. Get incident by id
    detail_res = client.get(f"/api/waste/incidents/{inc_id}")
    assert detail_res.status_code == 200
    assert detail_res.json()["id"] == inc_id

    # 3. Dispatch admin cleanup action
    action_res = client.post(
        f"/api/waste/incidents/{inc_id}/action",
        headers=admin_headers,
        json={
            "action": "HARBOR_SKIMMER_BOAT",
            "action_notes": "Deployed Skimmer Boat Unit Delta for rapid containment.",
            "status_update": "CLEANUP_DISPATCHED",
        },
    )
    assert action_res.status_code == 200, action_res.text
    act_data = action_res.json()
    assert act_data["action_taken"] == "HARBOR_SKIMMER_BOAT"
    assert act_data["status"] == "CLEANUP_DISPATCHED"


def test_api_waste_summary_and_map_layers():
    """Test KPI summary endpoint and GIS layer GeoJSON output."""
    sum_res = client.get("/api/waste/summary")
    assert sum_res.status_code == 200
    summary = sum_res.json()
    assert "total_incidents" in summary
    assert "critical_severity_count" in summary
    assert "waste_type_breakdown" in summary

    layers_res = client.get("/api/waste/map/layers")
    assert layers_res.status_code == 200
    layers = layers_res.json()
    assert layers["type"] == "FeatureCollection"
    assert "features" in layers
    assert len(layers["features"]) >= 1
    sample = layers["features"][0]
    assert sample["geometry"]["type"] == "Point"
    assert "pollution_score" in sample["properties"]
    assert "cleanup_priority" in sample["properties"]


# ── PHASE 8: COMPREHENSIVE TESTS (EDGE CASES, RBAC, ALERTS, ACTIONS, E2E) ──

def test_waste_ai_image_validation_edge_cases():
    """Verify empty files, unsupported extensions, and invalid byte streams return proper 400/422 status."""
    # 1. Unsupported extension
    res_bad_ext = client.post(
        "/api/waste/detect",
        files={"image": ("sample.txt", b"plain text content not an image", "text/plain")},
    )
    assert res_bad_ext.status_code == 400
    assert "Unsupported image extension" in res_bad_ext.json()["detail"]

    # 2. Empty byte payload
    res_empty = client.post(
        "/api/waste/detect",
        files={"image": ("empty.png", b"", "image/png")},
    )
    assert res_empty.status_code == 400
    assert "empty or corrupted" in res_empty.json()["detail"]

    # 3. Corrupt image bytes
    res_corrupt = client.post(
        "/api/waste/detect",
        files={"image": ("corrupt.jpg", b"0" * 200, "image/jpeg")},
    )
    assert res_corrupt.status_code in (400, 422)


def test_waste_classification_all_categories():
    """Verify supported waste categories and deterministic recommendation logic."""
    categories = [
        "FLOATING_PLASTIC",
        "PLASTIC_BOTTLES",
        "FISHING_NETS",
        "MARINE_DEBRIS",
        "FLOATING_WASTE",
        "OTHER_WASTE",
    ]
    for cat in categories:
        # Every category must produce a valid score and recommendation
        score, _ = MarineWasteService.calculate_pollution_score(
            waste_type=cat,
            density_score=50.0,
            estimated_area_m2=200.0,
            distance_from_coast_km=2.0,
            latitude=13.0,
            longitude=80.0,
        )
        assert 0.0 <= score <= 100.0
        rec = MarineWasteService.recommend_action(cat, "HIGH", "P2 — HIGH")
        assert rec in [
            "Beach Cleanup Crew",
            "Harbor Skimmer Boat",
            "Diving Retrieval Net",
            "Port Notification",
            "Environmental Inspection",
            "Monitor Area",
        ]

    # Test specific deterministic mappings:
    assert MarineWasteService.recommend_action("FISHING_NETS", "CRITICAL", "P1 — IMMEDIATE") == "Diving Retrieval Net"
    assert MarineWasteService.recommend_action("FLOATING_PLASTIC", "HIGH", "P2 — HIGH") == "Beach Cleanup Crew"
    assert MarineWasteService.recommend_action("MARINE_DEBRIS", "HIGH", "P2 — HIGH") == "Harbor Skimmer Boat"
    assert MarineWasteService.recommend_action("OTHER_WASTE", "LOW", "P4 — LOW", navigation_hazard=True) == "Port Notification"


def test_marine_waste_alert_trigger(admin_headers):
    """Verify High or Critical incidents automatically generate PublicAlert in public_alerts."""
    from app.models.user import PublicAlert

    # Create critical ghost net incident
    res = client.post(
        "/api/waste/incidents",
        headers=admin_headers,
        json={
            "waste_type": "FISHING_NETS",
            "density": "VERY_HIGH",
            "estimated_area_m2": 800.0,
            "estimated_items_count": 40,
            "latitude": 9.28,
            "longitude": 79.31,
            "location_name": "Rameswaram Marine Sanctuary",
            "entanglement_hazard": True,
            "navigation_hazard": True,
        },
    )
    assert res.status_code == 201, res.text
    inc = res.json()
    assert inc["severity"] in ("HIGH", "CRITICAL") or "P1" in inc["cleanup_priority"]

    # Verify alert exists in database
    db = SessionLocal()
    try:
        alert = db.query(PublicAlert).filter(
            PublicAlert.location == "Rameswaram Marine Sanctuary"
        ).order_by(PublicAlert.created_at.desc()).first()
        assert alert is not None
        assert alert.alert_type == "MARINE_DEBRIS_ALERT"
        assert alert.status == "ACTIVE"
        assert "FISHING_NETS" in alert.description.upper() or "NET" in alert.description.upper()
    finally:
        db.close()


def test_authority_actions_and_status_transitions(admin_headers):
    """Verify assigning each authority action and transitioning statuses."""
    # Create test incident
    create_res = client.post(
        "/api/waste/incidents",
        headers=admin_headers,
        json={
            "waste_type": "PLASTIC_BOTTLES",
            "density": "MODERATE",
            "estimated_area_m2": 150.0,
            "estimated_items_count": 60,
            "latitude": 13.05,
            "longitude": 80.28,
            "location_name": "Besant Nagar Beach",
        },
    )
    inc_id = create_res.json()["id"]

    # Test status transitions
    statuses_to_test = [
        ("BEACH_CLEANUP_CREW", "UNDER_REVIEW"),
        ("HARBOR_SKIMMER_BOAT", "ACTION_ASSIGNED"),
        ("ENVIRONMENTAL_INSPECTION", "IN_PROGRESS"),
        ("MONITOR_AREA", "RESOLVED"),
    ]

    for action_type, status_val in statuses_to_test:
        act_res = client.post(
            f"/api/waste/incidents/{inc_id}/action",
            headers=admin_headers,
            json={
                "action": action_type,
                "action_notes": f"Testing dispatch of {action_type} to status {status_val}.",
                "status_update": status_val,
            },
        )
        assert act_res.status_code == 200, act_res.text
        updated = act_res.json()
        assert updated["action_taken"] == action_type
        assert updated["status"] == status_val


@pytest.mark.real_auth
def test_rbac_access_control(citizen_headers, admin_headers):
    """Verify role-based authorization: citizen cannot dispatch actions or create incidents directly."""
    # 1. Citizen cannot create operational incident directly (Admin only)
    res_citizen_create = client.post(
        "/api/waste/incidents",
        headers=citizen_headers,
        json={
            "waste_type": "FLOATING_PLASTIC",
            "latitude": 13.0,
            "longitude": 80.0,
        },
    )
    assert res_citizen_create.status_code == 403, "Citizen must not access admin incident creation"

    # 2. Citizen cannot dispatch authority actions
    # First get an existing incident
    inc_list = client.get("/api/waste/incidents").json()
    inc_id = inc_list[0]["id"]

    res_citizen_action = client.post(
        f"/api/waste/incidents/{inc_id}/action",
        headers=citizen_headers,
        json={"action": "BEACH_CLEANUP_CREW"},
    )
    assert res_citizen_action.status_code == 403, "Citizen must not dispatch authority cleanup actions"

    # 3. Admin CAN dispatch authority action
    res_admin_action = client.post(
        f"/api/waste/incidents/{inc_id}/action",
        headers=admin_headers,
        json={"action": "PORT_NOTIFICATION", "status_update": "ACTION_ASSIGNED"},
    )
    assert res_admin_action.status_code == 200


def test_full_marine_waste_e2e_pipeline(citizen_headers, admin_headers):
    """
    Verify complete E2E lifecycle:
    Citizen Report -> Auto-Escalate Incident -> High Severity Alert ->
    Admin Review -> Dispatch Skimmer Boat -> Status Resolved.
    """
    test_img = create_synthetic_test_image("plastic_mesh")

    # 1. Citizen reports marine debris with photo
    report_res = client.post(
        "/api/waste/reports",
        headers=citizen_headers,
        files={"image": ("drone_debris.png", test_img, "image/png")},
        data={
            "location": "Palk Strait Marine Reserve",
            "latitude": 9.60,
            "longitude": 79.20,
            "date": "2026-10-08",
            "time": "14:30",
            "description": "Ghost fishing nets entangled on coral reef barrier.",
            "waste_type": "FISHING_NETS",
            "density": "HIGH",
            "severity": "CRITICAL",
        },
    )
    assert report_res.status_code == 201, report_res.text
    rep_data = report_res.json()
    assert rep_data["incident_code"] is not None
    inc_code = rep_data["incident_code"]

    # 2. Admin retrieves incident by code
    inc_res = client.get(f"/api/waste/incidents/{inc_code}")
    assert inc_res.status_code == 200
    inc_data = inc_res.json()
    inc_id = inc_data["id"]
    assert inc_data["waste_type"] == "FISHING_NETS"
    assert inc_data["recommended_action"] == "Diving Retrieval Net"

    # 3. Admin dispatches Diving Retrieval Net
    dispatch_res = client.post(
        f"/api/waste/incidents/{inc_id}/action",
        headers=admin_headers,
        json={
            "action": "DIVING_RETRIEVAL_NET",
            "action_notes": "Emergency diver team dispatched to extract ghost net from coral.",
            "status_update": "IN_PROGRESS",
        },
    )
    assert dispatch_res.status_code == 200
    assert dispatch_res.json()["status"] == "IN_PROGRESS"

    # 4. Admin resolves incident
    resolve_res = client.post(
        f"/api/waste/incidents/{inc_id}/action",
        headers=admin_headers,
        json={
            "action": "DIVING_RETRIEVAL_NET",
            "action_notes": "Extraction completed. Net recycled. Zero marine fauna casualties.",
            "status_update": "RESOLVED",
        },
    )
    assert resolve_res.status_code == 200
    assert resolve_res.json()["status"] == "RESOLVED"
    assert resolve_res.json()["resolved_at"] is not None
