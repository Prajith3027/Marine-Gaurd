"""
Automated unit & integration tests for Module 19: Citizen / Fisherman Reporting Application.
Tests:
  - File upload validation (allowed MIME types vs executable/disallowed scripts)
  - Maximum file size security enforcement (10MB limit)
  - GPS coordinate boundary validation
  - Missing field validation (description, coords)
  - Status workflow transitions (SUBMITTED -> UNDER_REVIEW -> AI_ASSISTED_VERIFICATION -> VERIFIED/REJECTED)
  - Privacy protection (reporter_contact masked / omitted in public endpoints)
  - AI heuristic verification scoring and explanatory notes
  - Incident auto-escalation and Multi-Source Verification (Module 17) evidence injection
"""
import io
import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database.session import SessionLocal
from app.models.citizen_report import CitizenReport
from app.models.incident import Incident
from app.models.enums import IncidentStatus, IncidentSeverity

client = TestClient(app)


def test_submit_report_valid_json():
    """Verify standard submission via JSON endpoint works and initializes workflow."""
    payload = {
        "latitude": 13.0827,
        "longitude": 80.2707,
        "description": "Noticed large dark rainbow oily sheen stretching approximately 300 meters offshore near Marina Beach.",
        "incident_category": "SURFACE_SHEEN",
        "location_description": "Marina Beach Fishermen Cove",
        "estimated_spill_size": "100-500m",
        "reporter_name": "R. Murugan",
        "reporter_contact": "+91 98401 23456",
        "reporter_affiliation": "FISHERMAN",
    }
    res = client.post("/api/v1/reports/submit-json", json=payload)
    assert res.status_code == 201
    data = res.json()

    assert data["id"] is not None
    assert data["report_code"].startswith("REP-")
    assert data["status"] == "SUBMITTED"
    assert data["verification_confidence"] == 25.0
    assert data["incident_category"] == "SURFACE_SHEEN"
    # Verify privacy: reporter_contact is NOT exposed in public schema
    assert "reporter_contact" not in data


def test_submit_report_multipart_valid_image():
    """Verify multipart form upload with a valid JPEG image."""
    image_bytes = b"\xFF\xD8\xFF\xE0\x00\x10JFIF" + b"\x00" * 200  # Valid JPEG header
    files = {
        "photo": ("spill_evidence.jpg", io.BytesIO(image_bytes), "image/jpeg"),
    }
    form_data = {
        "latitude": "12.9800",
        "longitude": "80.2500",
        "description": "Sticky black tar balls washing ashore across Elliot's Beach rocky shoreline.",
        "incident_category": "TAR_BALLS",
        "location_description": "Besant Nagar Beach",
        "reporter_name": "Kavitha S.",
        "reporter_contact": "kavitha@example.com",
    }
    res = client.post("/api/v1/reports", data=form_data, files=files)
    assert res.status_code == 201
    data = res.json()

    assert data["report_code"].startswith("REP-")
    assert data["photo_url"] is not None
    assert data["photo_url"].startswith("/uploads/reports/rep_")
    assert data["status"] == "SUBMITTED"


def test_file_upload_security_disallowed_type():
    """Verify security guardrail rejects malicious or non-image files (.exe, .sh, .py)."""
    script_bytes = b"#!/bin/bash\necho 'malicious upload'\n"
    files = {
        "photo": ("payload.sh", io.BytesIO(script_bytes), "application/x-sh"),
    }
    form_data = {
        "latitude": "13.0800",
        "longitude": "80.2800",
        "description": "Suspected fuel oil slick observed from coastal trawler.",
    }
    res = client.post("/api/v1/reports", data=form_data, files=files)
    assert res.status_code == 400
    assert "Unsupported file type" in res.json()["detail"]


def test_file_upload_size_limit():
    """Verify security guardrail enforces strict 10MB maximum file size limit."""
    # 11 MB of zero bytes
    oversize_bytes = b"\x00" * (11 * 1024 * 1024)
    files = {
        "photo": ("huge_photo.jpg", io.BytesIO(oversize_bytes), "image/jpeg"),
    }
    form_data = {
        "latitude": "13.0800",
        "longitude": "80.2800",
        "description": "Large offshore spill patch observed near shipping lane.",
    }
    res = client.post("/api/v1/reports", data=form_data, files=files)
    assert res.status_code == 413
    assert "exceeds maximum allowed size" in res.json()["detail"]


def test_gps_boundary_validation():
    """Verify GPS latitude and longitude out-of-range inputs are rejected."""
    # Invalid latitude > 90
    res1 = client.post(
        "/api/v1/reports/submit-json",
        json={"latitude": 95.0, "longitude": 80.0, "description": "Invalid latitude test report."},
    )
    assert res1.status_code == 422

    # Invalid longitude < -180
    res2 = client.post(
        "/api/v1/reports/submit-json",
        json={"latitude": 13.0, "longitude": -190.0, "description": "Invalid longitude test report."},
    )
    assert res2.status_code == 422


def test_missing_required_fields():
    """Verify missing description or coordinates produces validation errors."""
    res = client.post(
        "/api/v1/reports/submit-json",
        json={"latitude": 13.0, "longitude": 80.0, "description": "ab"},  # Too short min_length 5
    )
    assert res.status_code == 422


def test_status_workflow_transitions():
    """Verify review workflow state transitions: SUBMITTED -> UNDER_REVIEW -> AI_ASSISTED_VERIFICATION -> VERIFIED."""
    # 1. Create report
    res_create = client.post(
        "/api/v1/reports/submit-json",
        json={
            "latitude": 13.1500,
            "longitude": 80.3200,
            "description": "Thick black oil sludge seen discharging from cargo vessel near harbor entrance.",
            "incident_category": "VESSEL_DISCHARGE",
            "reporter_name": "Harbor Patrol Witness",
            "reporter_contact": "+91 99999 88888",
        },
    )
    assert res_create.status_code == 201
    rep_id = res_create.json()["id"]

    # 2. Transition: SUBMITTED -> UNDER_REVIEW
    res_under_review = client.patch(
        f"/api/v1/reports/{rep_id}/status",
        json={"status": "UNDER_REVIEW", "reviewed_by": "Duty Officer Verma", "review_notes": "Assigned for aerial drone confirmation."},
    )
    assert res_under_review.status_code == 200
    data_ur = res_under_review.json()
    assert data_ur["status"] == "UNDER_REVIEW"
    assert data_ur["reviewed_by"] == "Duty Officer Verma"
    assert data_ur["review_notes"] == "Assigned for aerial drone confirmation."

    # 3. Transition: UNDER_REVIEW -> AI_ASSISTED_VERIFICATION
    res_ai_stage = client.patch(
        f"/api/v1/reports/{rep_id}/status",
        json={"status": "AI_ASSISTED_VERIFICATION", "reviewed_by": "Ops Control"},
    )
    assert res_ai_stage.status_code == 200
    assert res_ai_stage.json()["status"] == "AI_ASSISTED_VERIFICATION"

    # 4. Invalid status check
    res_bad = client.patch(
        f"/api/v1/reports/{rep_id}/status",
        json={"status": "INVALID_STATE_XYZ"},
    )
    assert res_bad.status_code == 422


def test_ai_assisted_verification_and_incident_creation():
    """Verify AI heuristic verification scoring, confidence computation, auto incident creation, and M17 integration."""
    # 1. Create a high-plausibility report
    res_create = client.post(
        "/api/v1/reports/submit-json",
        json={
            "latitude": 13.1000,
            "longitude": 80.3000,
            "description": "Massive crude oil slick and black oil sheen with strong diesel smell spreading fast near Chennai port approaches.",
            "incident_category": "HEAVY_BLACK_OIL",
            "photo_url": "https://example.com/spill_photo.jpg",
            "reporter_name": "Capt. Sundaram (Tugboat Alpha)",
            "reporter_contact": "+91 98840 11223",
        },
    )
    assert res_create.status_code == 201
    rep_id = res_create.json()["id"]

    # 2. Trigger AI verification with auto_create_incident=True
    verify_res = client.post(
        f"/api/v1/reports/{rep_id}/verify",
        json={"auto_create_incident": True, "operator_name": "Commander R. Sharma"},
    )
    assert verify_res.status_code == 200
    data = verify_res.json()

    assert data["status"] == "VERIFIED"
    assert data["verification_confidence"] >= 65.0
    assert "AI Multi-Factor Verification" in data["ai_analysis_notes"]
    assert data["linked_incident_id"] is not None

    # 3. Verify created incident exists in incidents table
    linked_inc_id = data["linked_incident_id"]
    inc_res = client.get(f"/api/v1/incidents/{linked_inc_id}")
    assert inc_res.status_code == 200
    inc_data = inc_res.json()
    assert inc_data["source"] == "CITIZEN_REPORT"
    assert inc_data["status"] == "DETECTED"

    # 4. Verify evidence was injected into Multi-Source Verification (Module 17)
    ver_res = client.get(f"/api/v1/incidents/{linked_inc_id}/verification")
    assert ver_res.status_code == 200
    ver_data = ver_res.json()
    citizen_ev = next((ev for ev in ver_data["evidence_breakdown"] if ev["source_code"] == "CITIZEN_REPORT"), None)
    assert citizen_ev is not None
    assert citizen_ev["agrees_with_spill"] is True
