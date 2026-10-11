"""
Citizen endpoints — /api/citizen  (and /api/public for public-safe data)

  POST /api/citizen/reports        citizen only
  GET  /api/citizen/reports        own reports
  GET  /api/citizen/reports/{id}   own report + public timeline
  GET  /api/citizen/summary        dashboard counters
  GET  /api/citizen/alerts         public-safe alerts
  GET  /api/public/spills          public-safe verified spills / reports / zones (no auth)
  GET  /api/public/alerts          public-safe alerts (no auth)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.auth import require_citizen
from app.database.session import get_db
from app.models.citizen_report import CitizenReport
from app.models.enums import IncidentStatus
from app.models.incident import Incident
from app.models.user import PublicAlert, User
from app.services.citizen_reporting.service import CitizenReportingService
from app.services.report_workflow import (
    SEVERITIES, add_event, citizen_report_view, save_video, DEFAULT_PUBLIC_NOTES,
)

router = APIRouter(prefix="/citizen", tags=["Citizen"])
public_router = APIRouter(prefix="/public", tags=["Public"])

_CATEGORIES = {"SURFACE_SHEEN", "TAR_BALLS", "HEAVY_BLACK_OIL", "VESSEL_DISCHARGE", "SHORELINE_COATING", "OTHER"}
_ZONE_RADIUS_KM = {"LOW": 2.0, "MEDIUM": 5.0, "HIGH": 10.0, "CRITICAL": 20.0}


# ── Citizen reports ─────────────────────────────────────────────────────────

@router.post("/reports", status_code=status.HTTP_201_CREATED, summary="Submit an oil-spill report")
async def submit_report(
    location: str = Form(..., min_length=2, max_length=255),
    latitude: float = Form(..., ge=-90.0, le=90.0),
    longitude: float = Form(..., ge=-180.0, le=180.0),
    date: str = Form(..., description="YYYY-MM-DD"),
    time: str = Form(..., description="HH:MM"),
    description: str = Form(..., min_length=5, max_length=2000),
    severity: str = Form("MEDIUM"),
    incident_category: str = Form("SURFACE_SHEEN"),
    image: Optional[UploadFile] = File(None),
    video: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_citizen),
):
    sev = severity.upper()
    if sev not in SEVERITIES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid severity")
    try:
        observed = datetime.strptime(f"{date} {time}", "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid date or time")
    if observed > datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Observation time cannot be in the future")
    cat = incident_category.upper() if incident_category.upper() in _CATEGORIES else "OTHER"

    photo_meta = None
    if image is not None and image.filename:
        photo_meta = await CitizenReportingService.save_uploaded_photo(image)
    video_url = None
    if video is not None and video.filename:
        video_url = await save_video(video)

    report = CitizenReport(
        id=str(uuid.uuid4()),
        report_code=CitizenReportingService.generate_report_code(db),
        latitude=latitude,
        longitude=longitude,
        location_description=location.strip(),
        description=description.strip(),
        incident_category=cat,
        severity=sev,
        observed_at=observed,
        reporter_name=user.name,
        reporter_contact=user.email,
        reporter_affiliation="CITIZEN",
        user_id=user.id,
        video_url=video_url,
        status="SUBMITTED",
        verification_confidence=25.0,
        ai_analysis_notes="Pending initial triage & AI multi-factor verification.",
    )
    if photo_meta:
        (report.photo_url, report.photo_filename,
         report.photo_content_type, size) = photo_meta
        report.photo_file_size_bytes = float(size)
    db.add(report)
    db.flush()
    add_event(db, report.id, "SUBMITTED", DEFAULT_PUBLIC_NOTES["SUBMITTED"], actor_id=user.id)
    db.commit()
    db.refresh(report)
    return citizen_report_view(db, report)


def _own_reports(db: Session, user: User):
    return select(CitizenReport).where(CitizenReport.user_id == user.id)


@router.get("/reports", summary="List my reports")
def list_my_reports(db: Session = Depends(get_db), user: User = Depends(require_citizen)):
    rows = db.execute(_own_reports(db, user).order_by(CitizenReport.created_at.desc())).scalars().all()
    out = []
    for r in rows:
        v = citizen_report_view(db, r)
        v.pop("timeline")
        out.append(v)
    return out


@router.get("/reports/{report_id}", summary="My report detail with public timeline")
def get_my_report(report_id: str, db: Session = Depends(get_db), user: User = Depends(require_citizen)):
    # Ownership is enforced in the query: other citizens' reports are indistinguishable from missing.
    try:
        uuid.UUID(report_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    r = db.execute(_own_reports(db, user).where(CitizenReport.id == report_id)).scalar_one_or_none()
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    return citizen_report_view(db, r)


UPLOAD_DIR = Path("uploads/reports")


def _stream_report_file(filename: Optional[str], default_media_type: str = "image/jpeg") -> FileResponse:
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


@router.get("/reports/{report_id}/photo", summary="Get private photo for owned report")
def get_my_report_photo(report_id: str, db: Session = Depends(get_db), user: User = Depends(require_citizen)):
    try:
        uuid.UUID(report_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    r = db.execute(_own_reports(db, user).where(CitizenReport.id == report_id)).scalar_one_or_none()
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    filename = r.photo_filename or (Path(r.photo_url).name if r.photo_url else None)
    ctype = r.photo_content_type or "image/jpeg"
    return _stream_report_file(filename, ctype)


@router.get("/reports/{report_id}/video", summary="Get private video for owned report")
def get_my_report_video(report_id: str, db: Session = Depends(get_db), user: User = Depends(require_citizen)):
    try:
        uuid.UUID(report_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    r = db.execute(_own_reports(db, user).where(CitizenReport.id == report_id)).scalar_one_or_none()
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    filename = Path(r.video_url).name if r.video_url else None
    return _stream_report_file(filename, "video/mp4")


@router.get("/summary", summary="Citizen dashboard counters")
def citizen_summary(db: Session = Depends(get_db), user: User = Depends(require_citizen)):
    def count(*statuses: str) -> int:
        q = select(func.count(CitizenReport.id)).where(CitizenReport.user_id == user.id)
        if statuses:
            q = q.where(CitizenReport.status.in_(statuses))
        return db.execute(q).scalar_one()

    active_alerts = db.execute(
        select(func.count(PublicAlert.id)).where(PublicAlert.status == "ACTIVE")
    ).scalar_one()
    return {
        "reports_submitted": count(),
        "reports_under_review": count("UNDER_REVIEW", "AI_ASSISTED_VERIFICATION"),
        "verified_incidents": count("VERIFIED", "INVESTIGATION_STARTED", "RESOLVED"),
        "active_alerts": active_alerts,
    }


# ── Public-safe data ───────────────────────────────────────────────────────

def _alert_view(a: PublicAlert) -> dict:
    return {
        "id": a.id, "title": a.title, "description": a.description, "location": a.location,
        "alert_type": a.alert_type, "severity": a.severity, "status": a.status,
        "latitude": a.latitude, "longitude": a.longitude, "created_at": a.created_at,
    }


def public_alerts(db: Session) -> list[dict]:
    rows = db.execute(
        select(PublicAlert).where(PublicAlert.status.in_(("ACTIVE", "RESOLVED")))
        .order_by(PublicAlert.created_at.desc()).limit(100)
    ).scalars().all()
    return [_alert_view(a) for a in rows]


@router.get("/alerts", summary="Public-safe alerts for citizens")
def citizen_alerts(db: Session = Depends(get_db), user: User = Depends(require_citizen)):
    return public_alerts(db)


@public_router.get("/alerts", summary="Public-safe alerts")
def public_alerts_endpoint(db: Session = Depends(get_db)):
    return public_alerts(db)


@public_router.get("/spills", summary="Public-safe verified spills, reports and emergency zones")
def public_spills(db: Session = Depends(get_db)):
    """
    Deliberately omits: AIS/vessel data, trajectories, responsibility scores, risk scores,
    internal descriptions, reporter identity and evidence. Coordinates are generalised (~1 km).
    """
    public_statuses = [
        IncidentStatus.VERIFIED, IncidentStatus.PRIORITIZED, IncidentStatus.ASSIGNED,
        IncidentStatus.RESPONSE_IN_PROGRESS, IncidentStatus.CONTAINMENT, IncidentStatus.MONITORING,
    ]
    incidents = db.execute(
        select(Incident).where(Incident.is_active == True, Incident.status.in_(public_statuses))  # noqa: E712
        .limit(200)
    ).scalars().all()
    spills = [
        {
            "id": i.incident_code,
            "latitude": round(i.latitude, 2), "longitude": round(i.longitude, 2),
            "severity": i.severity.value if hasattr(i.severity, "value") else str(i.severity),
            "status": "Active incident",
            "area_km2": round(i.spill_area_km2, 1) if i.spill_area_km2 else None,
            "detected_at": i.detected_at,
        }
        for i in incidents if i.latitude is not None and i.longitude is not None
    ]
    reports = db.execute(
        select(CitizenReport).where(CitizenReport.status.in_(("VERIFIED", "INVESTIGATION_STARTED")))
        .order_by(CitizenReport.created_at.desc()).limit(200)
    ).scalars().all()
    verified_reports = [
        {
            "id": r.report_code, "latitude": round(r.latitude, 2), "longitude": round(r.longitude, 2),
            "category": r.incident_category, "severity": r.severity, "status": "Verified citizen report",
            "observed_at": r.observed_at,
        }
        for r in reports
    ]
    alerts = db.execute(select(PublicAlert).where(PublicAlert.status == "ACTIVE")).scalars().all()
    zones = [
        {
            "id": a.id, "title": a.title, "severity": a.severity, "alert_type": a.alert_type,
            "latitude": a.latitude, "longitude": a.longitude,
            "radius_km": _ZONE_RADIUS_KM.get(a.severity, 5.0),
        }
        for a in alerts if a.latitude is not None and a.longitude is not None
    ]
    return {"spills": spills, "citizen_reports": verified_reports, "emergency_zones": zones}
