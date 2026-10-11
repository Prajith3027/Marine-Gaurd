"""
Regression tests for Phase 18: Hindcast side-effect fix.
Ensures that read-only GET requests (/api/admin/hindcast, /api/admin/ais,
/api/admin/vessel-ranking, and /api/v1/incidents/{id}/source-analysis)
never mutate the database, never commit records, and never log spurious audit events,
while preserving full response fidelity and intentional POST write workflows.
"""
import uuid
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.main import app
from app.database.session import SessionLocal
from app.models.incident import Incident
from app.models.incident_event import IncidentEvent
from app.models.source_analysis import SourceAnalysis, SourceCandidate, SourceEvidence
from app.models.enums import IncidentStatus, IncidentSeverity

client = TestClient(app)


@pytest.fixture
def db_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def fresh_incident(db_session: Session) -> Incident:
    inc = Incident(
        incident_code=f"TEST-HINDCAST-{uuid.uuid4().hex[:6].upper()}",
        latitude=13.0827,
        longitude=80.3700,
        severity=IncidentSeverity.CRITICAL,
        status=IncidentStatus.DETECTED,
        spill_area_km2=3.5,
        detection_confidence=0.91,
        description="Fresh test incident without pre-computed source analysis.",
        source="SATELLITE",
    )
    db_session.add(inc)
    db_session.commit()
    db_session.refresh(inc)
    return inc


def count_all_records(db_session: Session, incident_id: str):
    events_count = db_session.query(func.count(IncidentEvent.id)).filter(IncidentEvent.incident_id == incident_id).scalar()
    analysis_count = db_session.query(func.count(SourceAnalysis.id)).filter(SourceAnalysis.incident_id == incident_id).scalar()
    candidates_count = db_session.query(func.count(SourceCandidate.id)).scalar()
    evidence_count = db_session.query(func.count(SourceEvidence.id)).scalar()
    return {
        "events": events_count,
        "analysis": analysis_count,
        "candidates": candidates_count,
        "evidence": evidence_count,
    }


class TestHindcastReadOnlyRegression:
    def test_get_hindcast_without_existing_analysis_is_strictly_read_only(
        self, db_session: Session, fresh_incident: Incident
    ):
        """GET /api/admin/hindcast must return valid response without persisting records or audit events."""
        # 1. Baseline: confirm no existing source analysis for this incident
        existing_sa = db_session.query(SourceAnalysis).filter(SourceAnalysis.incident_id == fresh_incident.id).first()
        assert existing_sa is None, "Test precondition: incident must not have prior source analysis"

        counts_before = count_all_records(db_session, fresh_incident.id)

        # 2. Execute GET request
        resp = client.get(f"/api/admin/hindcast?incident_id={fresh_incident.id}")
        assert resp.status_code == 200, f"Expected 200 OK, got {resp.status_code}: {resp.text}"

        data = resp.json()
        assert data["incident"]["id"] == str(fresh_incident.id)
        assert data["data_origin"] == "Simulation Data"
        assert "probable_origin" in data
        assert "backward_path" in data
        assert len(data["backward_path"]) >= 4
        assert "candidate_vessels" in data
        assert len(data["flow"]) == 6

        # 3. Post-condition: table counts must remain strictly identical
        counts_after = count_all_records(db_session, fresh_incident.id)
        assert counts_after["events"] == counts_before["events"], "GET request must NOT create any IncidentEvent"
        assert counts_after["analysis"] == counts_before["analysis"], "GET request must NOT create any SourceAnalysis"
        assert counts_after["candidates"] == counts_before["candidates"], "GET request must NOT create any SourceCandidate"
        assert counts_after["evidence"] == counts_before["evidence"], "GET request must NOT create any SourceEvidence"

    def test_repeated_get_hindcast_requests_do_not_mutate_counts(
        self, db_session: Session, fresh_incident: Incident
    ):
        """Repeated GET requests must be completely idempotent and never increment table counts."""
        counts_before = count_all_records(db_session, fresh_incident.id)

        for _ in range(3):
            resp = client.get(f"/api/admin/hindcast?incident_id={fresh_incident.id}")
            assert resp.status_code == 200

        counts_after = count_all_records(db_session, fresh_incident.id)
        assert counts_after == counts_before, f"Expected zero count mutations after 3 GETs. Before: {counts_before}, After: {counts_after}"

    def test_get_hindcast_with_existing_persisted_analysis(
        self, db_session: Session, fresh_incident: Incident
    ):
        """GET /api/admin/hindcast with an already-persisted analysis returns it without side effects."""
        # Intentionally create and persist source analysis via POST
        post_resp = client.post(
            f"/api/v1/incidents/{fresh_incident.id}/source-analysis",
            json={"lookback_hours": 24.0, "force_recalculate": True}
        )
        assert post_resp.status_code == 200
        post_data = post_resp.json()

        counts_after_post = count_all_records(db_session, fresh_incident.id)
        assert counts_after_post["analysis"] == 1
        assert counts_after_post["events"] >= 1

        # Now execute GET /api/admin/hindcast
        get_resp = client.get(f"/api/admin/hindcast?incident_id={fresh_incident.id}")
        assert get_resp.status_code == 200
        get_data = get_resp.json()

        # Check response fidelity
        assert get_data["incident"]["id"] == str(fresh_incident.id)
        assert get_data["overall_confidence_pct"] == post_data["overall_confidence_score"]

        # Ensure no additional writes happened
        counts_after_get = count_all_records(db_session, fresh_incident.id)
        assert counts_after_get == counts_after_post, "GET request on existing analysis must not modify database counts"

    def test_module18_get_source_analysis_is_strictly_read_only(
        self, db_session: Session, fresh_incident: Incident
    ):
        """GET /api/v1/incidents/{id}/source-analysis must calculate without persisting when analysis is absent."""
        counts_before = count_all_records(db_session, fresh_incident.id)

        resp = client.get(f"/api/v1/incidents/{fresh_incident.id}/source-analysis")
        assert resp.status_code == 200
        data = resp.json()
        assert data["incident_id"] == str(fresh_incident.id)
        assert len(data["candidates"]) == 3
        assert len(data["reverse_trajectory"]) >= 4

        counts_after = count_all_records(db_session, fresh_incident.id)
        assert counts_after == counts_before, "GET endpoint must NOT persist any records"

    def test_ais_and_vessel_ranking_get_routes_remain_read_only(
        self, db_session: Session, fresh_incident: Incident
    ):
        """GET /api/admin/ais and GET /api/admin/vessel-ranking must remain strictly read-only."""
        counts_before = count_all_records(db_session, fresh_incident.id)

        resp_ais = client.get(f"/api/admin/ais?incident_id={fresh_incident.id}")
        assert resp_ais.status_code == 200

        resp_ranking = client.get(f"/api/admin/vessel-ranking?incident_id={fresh_incident.id}")
        assert resp_ranking.status_code == 200

        counts_after = count_all_records(db_session, fresh_incident.id)
        assert counts_after == counts_before, "AIS and vessel-ranking GET routes must not mutate database"

    def test_explicit_post_write_workflow_still_persists_as_intended(
        self, db_session: Session, fresh_incident: Incident
    ):
        """Explicit POST endpoint must continue to persist analysis, candidates, evidence, and audit event."""
        counts_before = count_all_records(db_session, fresh_incident.id)

        resp = client.post(
            f"/api/v1/incidents/{fresh_incident.id}/source-analysis",
            json={"lookback_hours": 12.0, "force_recalculate": True}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["incident_id"] == str(fresh_incident.id)

        counts_after = count_all_records(db_session, fresh_incident.id)
        assert counts_after["analysis"] == counts_before["analysis"] + 1, "POST must persist 1 SourceAnalysis"
        assert counts_after["events"] == counts_before["events"] + 1, "POST must persist 1 IncidentEvent"
        assert counts_after["candidates"] > counts_before["candidates"], "POST must persist SourceCandidates"
        assert counts_after["evidence"] > counts_before["evidence"], "POST must persist SourceEvidence"

        # Verify the event record details
        latest_event = (
            db_session.query(IncidentEvent)
            .filter(IncidentEvent.incident_id == fresh_incident.id)
            .order_by(IncidentEvent.created_at.desc())
            .first()
        )
        assert latest_event is not None
        assert latest_event.event_type == "SOURCE_ANALYSIS_EVALUATED"
        assert "Probable spill source analysis evaluated" in latest_event.description
