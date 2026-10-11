"""
Admin endpoints — /api/admin   (EVERY route requires role == admin; enforced server-side)

Reuses the existing AI / AIS / hindcast / drift engines rather than duplicating them:
  detection      -> app.ml.detection.service.DetectionService
  ais            -> app.gis.vessel_service.VesselService (+ explainable ranking)
  hindcast       -> app.services.source_analyzer.SourceAnalyzerService
  drift          -> app.services.movement_prediction.MovementPredictionService
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.auth import require_admin
from app.database.session import get_db
from app.gis.vessel_service import VesselService
from app.ml.detection.service import DetectionService
from app.models.citizen_report import CitizenReport
from app.models.enums import IncidentSeverity, IncidentStatus
from app.models.incident import Incident
from app.models.user import (
    Investigation, PublicAlert, User, VesselScore, ROLE_ADMIN,
)
from app.schemas.citizen_report import CitizenReportVerifyRequest
from app.services.citizen_reporting.service import CitizenReportingService
from app.services.movement_prediction import MovementPredictionService
from app.services.report_workflow import (
    DEFAULT_PUBLIC_NOTES, REPORT_STATUSES, add_event, admin_report_view,
)
from app.services.source_analyzer import SourceAnalyzerService
from app.services.vessel_ranking import (
    AIS_DATA_NOTE, AIS_DATA_ORIGIN, DISCLAIMER, rank_vessels,
)

router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(require_admin)])

SIMULATION_LABEL = "Simulation Data"


# ── helpers ────────────────────────────────────────────────────────────────

def _get_incident(db: Session, ident: Optional[str]) -> Incident:
    """Resolve by UUID or incident_code; defaults to the highest-risk active incident."""
    inc = None
    if ident:
        inc = db.execute(select(Incident).where(Incident.incident_code == ident)).scalar_one_or_none()
        if inc is None:
            try:
                uuid.UUID(ident)
                inc = db.get(Incident, ident)
            except (ValueError, TypeError):
                inc = None
    else:
        inc = db.execute(
            select(Incident).where(Incident.is_active == True, Incident.status != IncidentStatus.RESOLVED)  # noqa: E712
            .order_by(Incident.risk_score.desc().nullslast())
        ).scalars().first()
    if inc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Incident not found")
    return inc


def _incident_brief(i: Incident) -> dict:
    return {
        "id": i.id, "incident_code": i.incident_code,
        "latitude": i.latitude, "longitude": i.longitude,
        "severity": i.severity.value if hasattr(i.severity, "value") else str(i.severity),
        "status": i.status.value if hasattr(i.status, "value") else str(i.status),
        "spill_area_km2": i.spill_area_km2, "risk_score": i.risk_score,
        "detection_confidence": i.detection_confidence, "detected_at": i.detected_at,
    }


def _hindcast(db: Session, incident: Incident) -> Optional[dict]:
    try:
        return SourceAnalyzerService().evaluate_source_analysis(
            db, incident.id, force_recalculate=False, persist=False
        ).model_dump()
    except Exception:  # hindcast is optional context for ranking
        return None


# ── dashboard / incidents ──────────────────────────────────────────────────

@router.get("/dashboard", summary="Command-center counters")
def dashboard(db: Session = Depends(get_db)):
    active = select(Incident).where(Incident.is_active == True, Incident.status != IncidentStatus.RESOLVED)  # noqa: E712
    active_rows = db.execute(active).scalars().all()
    high = sum(1 for i in active_rows if i.severity in (IncidentSeverity.HIGH, IncidentSeverity.CRITICAL))
    resolved = db.execute(
        select(func.count(Incident.id)).where(Incident.status == IncidentStatus.RESOLVED)
    ).scalar_one()
    reports = db.execute(select(func.count(CitizenReport.id))).scalar_one()
    investigating = db.execute(
        select(func.count(Investigation.id)).where(Investigation.status.in_(("OPEN", "IN_PROGRESS")))
    ).scalar_one()
    candidates = db.execute(
        select(func.count(func.distinct(VesselScore.mmsi)))
        .join(Investigation, Investigation.id == VesselScore.investigation_id)
        .where(Investigation.status.in_(("OPEN", "IN_PROGRESS")), VesselScore.investigation_score >= 35)
    ).scalar_one()
    # Marine Waste operational counters
    from app.models.marine_waste import MarineWasteIncident
    waste_rows = db.execute(select(MarineWasteIncident)).scalars().all()
    active_waste = [w for w in waste_rows if w.status != "RESOLVED"]
    waste_critical = sum(1 for w in active_waste if w.severity == "CRITICAL")
    waste_high_prio = sum(1 for w in active_waste if "P1" in (w.cleanup_priority or "") or "P2" in (w.cleanup_priority or ""))
    waste_pending_actions = sum(1 for w in active_waste if w.action_taken in (None, "NONE") or w.status != "RESOLVED")
    waste_resolved = sum(1 for w in waste_rows if w.status == "RESOLVED")

    total_incidents = len(active_rows) + len(active_waste)
    critical_total = sum(1 for i in active_rows if i.severity == IncidentSeverity.CRITICAL) + waste_critical
    high_prio_total = high + waste_high_prio
    pending_actions_total = len(active_rows) + waste_pending_actions
    resolved_total = resolved + waste_resolved

    return {
        "active_oil_spills": len(active_rows),
        "reports_received": reports,
        "reports_under_investigation": investigating,
        "candidate_vessels": candidates,
        "high_risk_incidents": high,
        "resolved_incidents": resolved,
        # Unified Pollution Overview
        "total_pollution_incidents": total_incidents,
        "oil_spill_incidents": len(active_rows),
        "marine_waste_incidents": len(active_waste),
        "critical_incidents": critical_total,
        "high_priority_incidents": high_prio_total,
        "pending_actions": pending_actions_total,
        "resolved_pollution_incidents": resolved_total,
    }


@router.get("/incidents", summary="Incident list for analysis selectors")
def incidents(db: Session = Depends(get_db)):
    rows = db.execute(
        select(Incident).where(Incident.is_active == True)  # noqa: E712
        .order_by(Incident.risk_score.desc().nullslast()).limit(200)
    ).scalars().all()
    return [_incident_brief(i) for i in rows]


# ── citizen report management ──────────────────────────────────────────────

@router.get("/reports", summary="All citizen reports")
def list_reports(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
):
    q = select(CitizenReport, User.name).outerjoin(User, User.id == CitizenReport.user_id)
    if status_filter and status_filter.upper() != "ALL":
        q = q.where(CitizenReport.status == status_filter.upper())
    rows = db.execute(q.order_by(CitizenReport.created_at.desc()).limit(500)).all()
    out = []
    for r, uname in rows:
        v = admin_report_view(db, r, uname)
        v.pop("timeline")
        out.append(v)
    return out


def _report_or_404(db: Session, report_id: str) -> tuple[CitizenReport, Optional[str]]:
    try:
        uuid.UUID(report_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    row = db.execute(
        select(CitizenReport, User.name).outerjoin(User, User.id == CitizenReport.user_id)
        .where(CitizenReport.id == report_id)
    ).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    return row[0], row[1]


@router.get("/reports/{report_id}", summary="Report detail (full)")
def get_report(report_id: str, db: Session = Depends(get_db)):
    r, uname = _report_or_404(db, report_id)
    return admin_report_view(db, r, uname)


UPLOAD_DIR = Path("uploads/reports")


def _stream_report_media_admin(filename: Optional[str], default_media_type: str = "image/jpeg") -> FileResponse:
    if not filename:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No media attached to this report")
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid file path")
    safe_name = Path(filename).name
    upload_dir = UPLOAD_DIR.resolve()
    target_path = (upload_dir / safe_name).resolve()
    if upload_dir not in target_path.parents and target_path != upload_dir:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid file path")
    if not target_path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Media file not found")
    return FileResponse(target_path, media_type=default_media_type)


@router.get("/reports/{report_id}/photo", summary="Admin: Get photo evidence for citizen report")
def get_admin_report_photo(report_id: str, db: Session = Depends(get_db)):
    r, _ = _report_or_404(db, report_id)
    filename = r.photo_filename or (Path(r.photo_url).name if r.photo_url else None)
    ctype = r.photo_content_type or "image/jpeg"
    return _stream_report_media_admin(filename, ctype)


@router.get("/reports/{report_id}/video", summary="Admin: Get video evidence for citizen report")
def get_admin_report_video(report_id: str, db: Session = Depends(get_db)):
    r, _ = _report_or_404(db, report_id)
    filename = Path(r.video_url).name if r.video_url else None
    return _stream_report_media_admin(filename, "video/mp4")


class ReportAction(BaseModel):
    action: Literal["review", "verify", "reject", "start_investigation", "resolve"]
    notes: Optional[str] = Field(None, max_length=2000, description="Internal verification notes")
    public_remarks: Optional[str] = Field(None, max_length=1000, description="Visible to the citizen")
    run_ai_check: bool = True
    create_incident: bool = False


_ACTION_STATUS = {
    "review": "UNDER_REVIEW", "verify": "VERIFIED", "reject": "REJECTED",
    "start_investigation": "INVESTIGATION_STARTED", "resolve": "RESOLVED",
}


@router.post("/reports/{report_id}/action", summary="Verify / reject / investigate / resolve a report")
def report_action(report_id: str, payload: ReportAction,
                  db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    r, uname = _report_or_404(db, report_id)
    target = _ACTION_STATUS[payload.action]
    assert target in REPORT_STATUSES

    if payload.action == "verify" and payload.run_ai_check:
        try:  # existing AI-assisted scoring supplies confidence + notes; admin decision still wins
            CitizenReportingService.verify_report(
                db, r.id,
                CitizenReportVerifyRequest(auto_create_incident=payload.create_incident, operator_name=admin.name),
            )
        except Exception:
            db.rollback()
            r, uname = _report_or_404(db, report_id)

    r.status = target
    r.reviewed_by = admin.name
    r.reviewed_at = datetime.now(timezone.utc)
    if payload.notes:
        r.review_notes = payload.notes.strip()
    if payload.public_remarks:
        r.public_remarks = payload.public_remarks.strip()

    if payload.action == "start_investigation":
        db.add(Investigation(
            id=str(uuid.uuid4()), incident_id=r.linked_incident_id, report_id=r.id,
            title=f"Investigation for report {r.report_code}", status="OPEN",
            notes=payload.notes, created_by=admin.id,
        ))

    add_event(db, r.id, target, payload.public_remarks or DEFAULT_PUBLIC_NOTES.get(target), actor_id=admin.id)
    if payload.notes:
        add_event(db, r.id, target, payload.notes, actor_id=admin.id, is_public=False)
    db.commit()
    db.refresh(r)
    return admin_report_view(db, r, uname)


# ── AI oil-spill detection (existing engine) ───────────────────────────────

@router.post("/detection", summary="Run the existing AI oil-spill detection")
async def run_detection(
    image: Optional[UploadFile] = File(None),
    latitude: float = Form(10.85, ge=-90.0, le=90.0),
    longitude: float = Form(79.90, ge=-180.0, le=180.0),
    timestamp: Optional[datetime] = Form(None),
    demo_preset: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    return await DetectionService.analyze_image(
        db=db, file=image, latitude=latitude, longitude=longitude,
        timestamp=timestamp, demo_preset=demo_preset,
    )


# ── AIS tracking & vessel ranking ──────────────────────────────────────────

@router.get("/ais", summary="AIS vessel tracking for an incident (simulated feed)")
def ais(incident_id: Optional[str] = None, db: Session = Depends(get_db)):
    inc = _get_incident(db, incident_id)
    suspects = VesselService.get_suspect_vessels_for_incident(inc, db)
    ranking = rank_vessels(inc, db, _hindcast(db, inc))
    by_mmsi = {r["mmsi"]: r for r in ranking["vessels"]}
    vessels = []
    for v in suspects.suspects:
        rk = by_mmsi[v.mmsi]
        bd = {b["factor"]: b for b in rk["breakdown"]}
        last = v.trajectory[-1]
        vessels.append({
            "name": v.name, "mmsi": v.mmsi, "vessel_type": v.vessel_type, "flag": v.flag,
            "latitude": v.current_lat, "longitude": v.current_lon,
            "speed_knots": v.current_speed_knots, "course_deg": last.course_deg,
            "heading_deg": v.heading_deg, "timestamp": last.timestamp,
            "history": [
                {"latitude": w.latitude, "longitude": w.longitude, "timestamp": w.timestamp,
                 "speed_knots": w.speed_knots, "course_deg": w.course_deg}
                for w in v.trajectory
            ],
            "distance_from_origin_km": v.closest_approach_km,
            "time_correlation_pct": bd["Time Correlation"]["factor_score_pct"],
            "trajectory_correlation_pct": bd["Trajectory Match"]["factor_score_pct"],
            "behavioural_anomaly": bd["Behaviour Anomaly"]["explanation"],
            "anomaly_indicators": v.anomaly_indicators,
            "investigation_score": rk["investigation_score"],
            "classification": rk["classification"],
        })
    return {
        "incident": _incident_brief(inc),
        "vessels": vessels,
        "data_origin": AIS_DATA_ORIGIN,
        "data_note": AIS_DATA_NOTE,
    }


@router.get("/vessel-ranking", summary="Explainable vessel investigation ranking")
def vessel_ranking(incident_id: Optional[str] = None, db: Session = Depends(get_db)):
    inc = _get_incident(db, incident_id)
    return rank_vessels(inc, db, _hindcast(db, inc))


class InvestigationCreate(BaseModel):
    incident_id: str
    report_id: Optional[str] = None
    title: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = Field(None, max_length=4000)


def _inv_view(inv: Investigation) -> dict:
    return {
        "id": inv.id, "incident_id": inv.incident_id, "report_id": inv.report_id,
        "title": inv.title, "status": inv.status, "notes": inv.notes,
        "created_at": inv.created_at, "updated_at": inv.updated_at,
        "scores": [
            {"rank": int(s.rank), "mmsi": s.mmsi, "vessel_name": s.vessel_name,
             "investigation_score": s.investigation_score, "breakdown": s.breakdown}
            for s in sorted(inv.scores, key=lambda s: s.rank)
        ],
    }


@router.post("/investigation", status_code=status.HTTP_201_CREATED,
             summary="Open an investigation and persist vessel scores")
def create_investigation(payload: InvestigationCreate, db: Session = Depends(get_db),
                         admin: User = Depends(require_admin)):
    inc = _get_incident(db, payload.incident_id)
    ranking = rank_vessels(inc, db, _hindcast(db, inc))
    inv = Investigation(
        id=str(uuid.uuid4()), incident_id=inc.id, report_id=payload.report_id,
        title=payload.title or f"Investigation — {inc.incident_code}", status="OPEN",
        notes=payload.notes, created_by=admin.id,
    )
    db.add(inv)
    db.flush()
    for v in ranking["vessels"]:
        db.add(VesselScore(
            id=str(uuid.uuid4()), investigation_id=inv.id, mmsi=v["mmsi"], vessel_name=v["vessel_name"],
            rank=v["rank"], investigation_score=v["investigation_score"],
            breakdown={"classification": v["classification"], "factors": v["breakdown"],
                       "data_origin": AIS_DATA_ORIGIN},
        ))
    if payload.report_id:
        try:
            uuid.UUID(payload.report_id)
            rep = db.get(CitizenReport, payload.report_id)
        except ValueError:
            rep = None
        if rep:
            rep.status = "INVESTIGATION_STARTED"
            add_event(db, rep.id, "INVESTIGATION_STARTED",
                      DEFAULT_PUBLIC_NOTES["INVESTIGATION_STARTED"], actor_id=admin.id)
    db.commit()
    db.refresh(inv)
    return _inv_view(inv)


@router.get("/investigation", summary="List investigations")
def list_investigations(db: Session = Depends(get_db)):
    rows = db.execute(select(Investigation).order_by(Investigation.created_at.desc()).limit(200)).scalars().all()
    return [_inv_view(i) for i in rows]


@router.get("/investigation/{inv_id}", summary="Investigation detail")
def get_investigation(inv_id: str, db: Session = Depends(get_db)):
    inv = db.get(Investigation, inv_id)
    if not inv:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Investigation not found")
    return _inv_view(inv)


class InvestigationUpdate(BaseModel):
    status: Optional[Literal["OPEN", "IN_PROGRESS", "CLOSED"]] = None
    notes: Optional[str] = Field(None, max_length=4000)


@router.patch("/investigation/{inv_id}", summary="Update investigation status / notes")
def update_investigation(inv_id: str, payload: InvestigationUpdate, db: Session = Depends(get_db)):
    inv = db.get(Investigation, inv_id)
    if not inv:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Investigation not found")
    if payload.status:
        inv.status = payload.status
    if payload.notes is not None:
        inv.notes = payload.notes
    db.commit()
    db.refresh(inv)
    return _inv_view(inv)


# ── hindcasting & future drift (existing engines) ──────────────────────────

@router.get("/hindcast", summary="Backward drift / probable origin / candidate vessels")
def hindcast(incident_id: Optional[str] = None, db: Session = Depends(get_db)):
    inc = _get_incident(db, incident_id)
    try:
        sa = SourceAnalyzerService().evaluate_source_analysis(
            db, inc.id, force_recalculate=False, persist=False
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))
    data = sa.model_dump()
    cands = sorted(data["candidates"], key=lambda c: c["rank_order"])
    top = cands[0] if cands else None
    ranking = rank_vessels(inc, db, data)
    return {
        "incident": _incident_brief(inc),
        "flow": ["Current Spill", "Ocean Current + Wind", "Backward Drift",
                 "Probable Origin", "AIS Correlation", "Candidate Vessels"],
        "probable_origin": None if not top else {
            "name": top["name"], "latitude": top["latitude"], "longitude": top["longitude"],
            "uncertainty_radius_km": top["radius_km"], "confidence_pct": top["confidence_score"],
        },
        "alternative_origins": [
            {"name": c["name"], "latitude": c["latitude"], "longitude": c["longitude"],
             "uncertainty_radius_km": c["radius_km"], "confidence_pct": c["confidence_score"]}
            for c in cands[1:]
        ],
        "estimated_release_window": {
            "start": data["estimated_discharge_time_start"], "end": data["estimated_discharge_time_end"],
        },
        "overall_confidence_pct": data["overall_confidence_score"],
        "backward_path": [
            {"hours_prior": p["hours_prior"], "latitude": p["latitude"], "longitude": p["longitude"],
             "uncertainty_radius_km": p["uncertainty_radius_km"]}
            for p in data["reverse_trajectory"]
        ],
        "candidate_vessels": [
            {"rank": v["rank"], "vessel_name": v["vessel_name"], "mmsi": v["mmsi"],
             "investigation_score": v["investigation_score"], "classification": v["classification"],
             "trajectory": v["trajectory"]}
            for v in ranking["vessels"]
        ],
        "data_origin": SIMULATION_LABEL,
        "data_note": "Currents, wind and AIS inputs are simulated. The probable origin is an estimate with "
                     "uncertainty, not a known location.",
        "disclaimer": data["legal_disclaimer"],
    }


@router.get("/drift", summary="Forward drift prediction (+6h / +12h / +24h)")
def drift(incident_id: Optional[str] = None, db: Session = Depends(get_db)):
    inc = _get_incident(db, incident_id)
    pred = MovementPredictionService.get_latest_prediction(db, inc.id)
    keep = {6.0, 12.0, 24.0}
    return {
        "incident": _incident_brief(inc),
        "current": {"latitude": pred.origin_latitude, "longitude": pred.origin_longitude,
                    "area_km2": pred.origin_area_km2},
        "forecast": [p.model_dump() for p in pred.forecast_points if p.horizon_hours in keep]
                    or [p.model_dump() for p in pred.forecast_points],
        "environmental_conditions": pred.environmental_conditions.model_dump(),
        "confidence": pred.confidence,
        "data_origin": SIMULATION_LABEL if pred.is_simulated else "LIVE",
        "data_note": "Simulation Data — drift is computed with a prototype model and demo environmental forcing."
                     if pred.is_simulated else "Computed from connected environmental data.",
    }


# ── public alerts ──────────────────────────────────────────────────────────

class AlertCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=3, max_length=4000)
    location: Optional[str] = Field(None, max_length=255)
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "LOW"
    status: Literal["ACTIVE", "RESOLVED", "DRAFT"] = "ACTIVE"
    alert_type: Literal["OIL_SPILL_DETECTED", "COASTAL_WARNING", "RESTRICTED_ZONE",
                        "ENVIRONMENTAL_ALERT", "RESPONSE_UPDATE"] = "ENVIRONMENTAL_ALERT"
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)


class AlertUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=200)
    description: Optional[str] = Field(None, min_length=3, max_length=4000)
    severity: Optional[Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]] = None
    status: Optional[Literal["ACTIVE", "RESOLVED", "DRAFT"]] = None


def _alert(a: PublicAlert) -> dict:
    return {c: getattr(a, c) for c in (
        "id", "title", "description", "location", "alert_type", "severity", "status",
        "latitude", "longitude", "created_by", "created_at")}


@router.get("/alerts", summary="All public alerts (incl. drafts)")
def list_alerts(db: Session = Depends(get_db)):
    return [_alert(a) for a in db.execute(select(PublicAlert).order_by(PublicAlert.created_at.desc())).scalars()]


@router.post("/alerts", status_code=status.HTTP_201_CREATED, summary="Create a public alert")
def create_alert(payload: AlertCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    a = PublicAlert(id=str(uuid.uuid4()), created_by=admin.id, **payload.model_dump())
    db.add(a)
    db.commit()
    db.refresh(a)
    return _alert(a)


@router.patch("/alerts/{alert_id}", summary="Update a public alert")
def update_alert(alert_id: str, payload: AlertUpdate, db: Session = Depends(get_db)):
    a = db.get(PublicAlert, alert_id)
    if not a:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(a, k, v)
    db.commit()
    db.refresh(a)
    return _alert(a)


# ── user management ────────────────────────────────────────────────────────

@router.get("/users", summary="List accounts")
def list_users(db: Session = Depends(get_db)):
    counts = dict(db.execute(
        select(CitizenReport.user_id, func.count(CitizenReport.id)).group_by(CitizenReport.user_id)
    ).all())
    rows = db.execute(select(User).order_by(User.created_at.desc())).scalars().all()
    return [
        {"id": u.id, "name": u.name, "email": u.email, "role": u.role, "is_active": u.is_active,
         "created_at": u.created_at, "last_login_at": u.last_login_at, "report_count": counts.get(u.id, 0)}
        for u in rows
    ]


class UserStatusUpdate(BaseModel):
    is_active: bool


@router.patch("/users/{user_id}", summary="Activate / deactivate an account")
def update_user(user_id: str, payload: UserStatusUpdate, db: Session = Depends(get_db),
                admin: User = Depends(require_admin)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if u.id == admin.id and not payload.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot deactivate your own account")
    u.is_active = payload.is_active
    db.commit()
    return {"id": u.id, "is_active": u.is_active}


@router.get("/users/{user_id}/reports", summary="Reports submitted by a user")
def user_reports(user_id: str, db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    rows = db.execute(
        select(CitizenReport).where(CitizenReport.user_id == user_id).order_by(CitizenReport.created_at.desc())
    ).scalars().all()
    out = []
    for r in rows:
        v = admin_report_view(db, r, u.name)
        v.pop("timeline")
        out.append(v)
    return out


# ── evidence report ────────────────────────────────────────────────────────

@router.get("/evidence", summary="Compiled investigation evidence report for an incident")
def evidence(incident_id: Optional[str] = None, db: Session = Depends(get_db)):
    inc = _get_incident(db, incident_id)
    hc = _hindcast(db, inc)
    ranking = rank_vessels(inc, db, hc)
    reports = db.execute(
        select(CitizenReport).where(CitizenReport.linked_incident_id == inc.id)
    ).scalars().all()
    invs = db.execute(select(Investigation).where(Investigation.incident_id == inc.id)).scalars().all()
    return {
        "generated_at": datetime.now(timezone.utc),
        "incident": _incident_brief(inc),
        "hindcast": None if not hc else {
            "primary_source_region": hc["primary_source_region_name"],
            "confidence_pct": hc["overall_confidence_score"],
            "release_window": [hc["estimated_discharge_time_start"], hc["estimated_discharge_time_end"]],
        },
        "vessel_ranking": ranking["vessels"],
        "linked_citizen_reports": [
            {"report_code": r.report_code, "status": r.status, "category": r.incident_category,
             "observed_at": r.observed_at} for r in reports
        ],
        "investigations": [{"id": i.id, "title": i.title, "status": i.status, "created_at": i.created_at} for i in invs],
        "data_origin": SIMULATION_LABEL,
        "data_note": AIS_DATA_NOTE,
        "disclaimer": DISCLAIMER,
    }
