"""
FastAPI router for the Marine Waste & Debris Module.
Base prefix: /api/waste
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from sqlalchemy import select, desc
from sqlalchemy.orm import Session

from app.core.auth import (
    authenticate_user,
    require_admin,
    require_citizen,
    get_current_user_optional,
)
from app.database.session import get_db
from app.models.marine_waste import MarineWasteIncident
from app.models.citizen_report import CitizenReport
from app.models.user import User
from app.ml.waste_detector import analyze_marine_waste
from app.services.waste_service import MarineWasteService
from app.services.citizen_reporting.service import CitizenReportingService
from app.services.report_workflow import save_video, add_event
from app.schemas.marine_waste import (
    WasteDetectionResponse,
    MarineWasteIncidentResponse,
    MarineWasteIncidentCreate,
    MarineWasteActionRequest,
    MarineWasteSummaryResponse,
    MarineWasteLayersResponse,
)

router = APIRouter(prefix="/waste", tags=["Marine Waste & Debris"])

ALLOWED_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}


# ── 1. AI Vision Inference Endpoint ──────────────────────────────────────────

@router.post(
    "/detect",
    response_model=WasteDetectionResponse,
    summary="Run AI Marine Waste detection & density analysis on an image",
)
async def detect_marine_waste(
    image: Optional[UploadFile] = File(None),
    file: Optional[UploadFile] = File(None),
    latitude: float = Form(13.0827, ge=-90.0, le=90.0),
    longitude: float = Form(80.2707, ge=-180.0, le=180.0),
    distance_from_coast_km: Optional[float] = Form(None),
):
    """
    Analyzes an uploaded ocean or beach photograph, segments synthetic polymers and netting,
    determines waste classification, density, pollution score, severity, and cleanup priority.
    """
    upload = image if (image and image.filename) else file
    if upload is None or not upload.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image file is required for Marine Waste detection.",
        )

    # Validate file extension
    import os
    ext = os.path.splitext(upload.filename)[1].lower()
    if ext not in ALLOWED_IMAGE_EXTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported image extension '{ext}'. Allowed: PNG, JPG, JPEG, WEBP.",
        )

    content = await upload.read()
    if len(content) < 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded image is empty or corrupted.",
        )

    try:
        raw_result = analyze_marine_waste(content, latitude=latitude, longitude=longitude)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Image vision analysis failed: {str(e)}",
        )

    # Compute transparent 0-100 Pollution Score using the exact prompt formula
    dist = distance_from_coast_km if distance_from_coast_km is not None else MarineWasteService.calculate_distance_from_coast(latitude, longitude)
    score, breakdown = MarineWasteService.calculate_pollution_score(
        waste_type=raw_result["waste_type"],
        density_score=raw_result["density_score"],
        estimated_area_m2=raw_result["estimated_area_m2"],
        distance_from_coast_km=dist,
        latitude=latitude,
        longitude=longitude,
    )

    severity = MarineWasteService.classify_severity(score)
    priority = MarineWasteService.determine_cleanup_priority(
        score=score,
        severity=severity,
        waste_type=raw_result["waste_type"],
        entanglement_hazard=raw_result["entanglement_hazard"],
        navigation_hazard=raw_result["navigation_hazard"],
        latitude=latitude,
        longitude=longitude,
    )

    rec_action = MarineWasteService.recommend_action(
        raw_result["waste_type"],
        severity,
        priority,
        raw_result["navigation_hazard"],
    )

    return WasteDetectionResponse(
        detected=raw_result["detected"],
        waste_type=raw_result["waste_type"],
        confidence=raw_result["confidence"],
        density=raw_result["density"],
        density_score=raw_result["density_score"],
        estimated_area_m2=raw_result["estimated_area_m2"],
        estimated_items_count=raw_result["estimated_items_count"],
        entanglement_hazard=raw_result["entanglement_hazard"],
        navigation_hazard=raw_result["navigation_hazard"],
        pollution_score=score,
        severity=severity,
        cleanup_priority=priority,
        recommended_action=rec_action,
        score_breakdown=breakdown,
        mask_overlay_base64=raw_result.get("mask_overlay_base64"),
        processing_time_ms=raw_result["processing_time_ms"],
        image_metadata={
            "filename": upload.filename,
            "size_bytes": len(content),
            "features": raw_result.get("features_extracted", {}),
        },
        detection_notes=raw_result["detection_notes"],
    )


# ── 2. Citizen Waste Reports Endpoint ────────────────────────────────────────

@router.post(
    "/reports",
    status_code=status.HTTP_201_CREATED,
    summary="Submit a citizen marine waste & debris observation",
)
async def submit_waste_report(
    location: str = Form(..., min_length=2, max_length=255),
    latitude: float = Form(..., ge=-90.0, le=90.0),
    longitude: float = Form(..., ge=-180.0, le=180.0),
    date: str = Form(..., description="YYYY-MM-DD"),
    time: str = Form(..., description="HH:MM"),
    description: str = Form(..., min_length=5, max_length=2000),
    waste_type: str = Form("FLOATING_PLASTIC"),
    density: str = Form("MODERATE"),
    severity: str = Form("MODERATE"),
    image: Optional[UploadFile] = File(None),
    video: Optional[UploadFile] = File(None),
    auto_escalate_incident: bool = Form(True),
    db: Session = Depends(get_db),
    user: User = Depends(require_citizen),
):
    """Submits a citizen marine debris report, stores evidence, and optionally creates an operational incident."""
    try:
        observed = datetime.strptime(f"{date} {time}", "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid observation date or time format.")

    photo_url = None
    photo_filename = None
    photo_content_type = None
    photo_size = 0.0

    if image is not None and image.filename:
        photo_meta = await CitizenReportingService.save_uploaded_photo(image)
        photo_url, photo_filename, photo_content_type, photo_size = photo_meta

    video_url = None
    if video is not None and video.filename:
        video_url = await save_video(video)

    # Save to citizen_reports table with pollution_type="MARINE_WASTE"
    report_code = CitizenReportingService.generate_report_code(db)
    citizen_report = CitizenReport(
        id=str(uuid.uuid4()),
        report_code=report_code,
        latitude=latitude,
        longitude=longitude,
        location_description=location.strip(),
        description=description.strip(),
        incident_category=waste_type.upper(),
        severity=severity.upper(),
        pollution_type="MARINE_WASTE",
        waste_type=waste_type.upper(),
        waste_density=density.upper(),
        observed_at=observed,
        reporter_name=user.name,
        reporter_contact=user.email,
        reporter_affiliation="CITIZEN",
        user_id=user.id,
        photo_url=photo_url,
        photo_filename=photo_filename,
        photo_content_type=photo_content_type,
        photo_file_size_bytes=photo_size,
        video_url=video_url,
        status="SUBMITTED",
        verification_confidence=30.0,
        ai_analysis_notes=f"Marine waste report filed for {waste_type}.",
    )
    db.add(citizen_report)
    db.flush()

    add_event(db, citizen_report.id, "SUBMITTED", "Citizen marine debris report submitted.", actor_id=user.id)

    # Optionally escalate to a trackable MarineWasteIncident
    waste_incident = None
    if auto_escalate_incident:
        inc_payload = MarineWasteIncidentCreate(
            waste_type=waste_type.upper() if waste_type.upper() in ["FLOATING_PLASTIC", "PLASTIC_BOTTLES", "FISHING_NETS", "MARINE_DEBRIS", "FLOATING_WASTE", "OTHER_WASTE"] else "FLOATING_PLASTIC",
            density=density.upper() if density.upper() in ["LOW", "MODERATE", "HIGH", "VERY_HIGH"] else "MODERATE",
            latitude=latitude,
            longitude=longitude,
            location_name=location,
            image_url=photo_url,
            citizen_report_id=citizen_report.id,
        )
        waste_incident = MarineWasteService.create_waste_incident(db, inc_payload, user_id=user.id)
        citizen_report.linked_incident_id = None  # oil spill FK remains clean

    db.commit()
    db.refresh(citizen_report)

    rec_action = (
        waste_incident.recommended_action
        if waste_incident
        else MarineWasteService.recommend_action(citizen_report.waste_type or "FLOATING_PLASTIC", citizen_report.severity or "MODERATE", "P2 — HIGH")
    )

    return {
        "report_id": citizen_report.id,
        "report_code": citizen_report.report_code,
        "status": citizen_report.status,
        "pollution_type": citizen_report.pollution_type,
        "waste_type": citizen_report.waste_type,
        "incident_code": waste_incident.incident_code if waste_incident else None,
        "pollution_score": waste_incident.pollution_score if waste_incident else 50.0,
        "severity": waste_incident.severity if waste_incident else "MODERATE",
        "cleanup_priority": waste_incident.cleanup_priority if waste_incident else "P2 — HIGH",
        "density": waste_incident.density if waste_incident else citizen_report.waste_density or "MODERATE",
        "estimated_items_count": waste_incident.estimated_items_count if waste_incident else 45,
        "recommended_action": rec_action,
        "image_url": waste_incident.image_url if waste_incident else photo_url,
        "mask_overlay_url": waste_incident.mask_overlay_url if waste_incident else None,
        "message": "Marine waste report successfully submitted and registered.",
    }


@router.get(
    "/reports",
    summary="List citizen marine waste reports",
)
def list_waste_reports(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    user: User = Depends(authenticate_user),
):
    """Returns waste reports (citizens see own; admins see all)."""
    q = select(CitizenReport).where(CitizenReport.pollution_type == "MARINE_WASTE")
    if user.role != "admin":
        q = q.where(CitizenReport.user_id == user.id)

    if status_filter and status_filter.upper() != "ALL":
        q = q.where(CitizenReport.status == status_filter.upper())

    rows = db.execute(q.order_by(desc(CitizenReport.created_at)).limit(200)).scalars().all()
    return [
        {
            "id": r.id,
            "report_code": r.report_code,
            "pollution_type": r.pollution_type,
            "waste_type": r.waste_type or r.incident_category,
            "density": r.waste_density,
            "severity": r.severity,
            "status": r.status,
            "latitude": r.latitude,
            "longitude": r.longitude,
            "location_description": r.location_description,
            "description": r.description,
            "photo_url": r.photo_url,
            "video_url": r.video_url,
            "reporter_name": r.reporter_name,
            "observed_at": r.observed_at,
            "created_at": r.created_at,
        }
        for r in rows
    ]


# ── 3. Marine Waste Incidents CRUD ───────────────────────────────────────────

@router.get(
    "/incidents",
    response_model=List[MarineWasteIncidentResponse],
    summary="List operational marine waste incidents & hotspots",
)
def list_waste_incidents(
    status_filter: Optional[str] = Query(None, alias="status"),
    waste_type: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Returns marine waste incident hotspots for operations and GIS mapping."""
    q = select(MarineWasteIncident)
    if status_filter and status_filter.upper() != "ALL":
        q = q.where(MarineWasteIncident.status == status_filter.upper())
    if waste_type and waste_type.upper() != "ALL":
        q = q.where(MarineWasteIncident.waste_type == waste_type.upper())
    if severity and severity.upper() != "ALL":
        q = q.where(MarineWasteIncident.severity == severity.upper())

    rows = db.execute(q.order_by(desc(MarineWasteIncident.created_at)).limit(200)).scalars().all()
    return rows


@router.post(
    "/incidents",
    response_model=MarineWasteIncidentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create or escalate a marine waste incident (Admin)",
)
def create_waste_incident(
    payload: MarineWasteIncidentCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Manually creates an operational marine waste hotspot."""
    return MarineWasteService.create_waste_incident(db, payload, user_id=admin.id)


@router.get(
    "/incidents/{incident_id}",
    response_model=MarineWasteIncidentResponse,
    summary="Get single marine waste incident details",
)
def get_waste_incident(incident_id: str, db: Session = Depends(get_db)):
    inc = db.get(MarineWasteIncident, incident_id)
    if not inc:
        # Try finding by incident_code
        inc = db.execute(
            select(MarineWasteIncident).where(MarineWasteIncident.incident_code == incident_id)
        ).scalar_one_or_none()
    if not inc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Marine waste incident '{incident_id}' not found.")
    return inc


@router.post(
    "/incidents/{incident_id}/action",
    response_model=MarineWasteIncidentResponse,
    summary="Dispatch authority cleanup action or update status (Admin)",
)
def dispatch_waste_action(
    incident_id: str,
    action_req: MarineWasteActionRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Dispatches cleanup crews (Beach cleanup, skimmer, divers) and updates status."""
    inc = db.get(MarineWasteIncident, incident_id)
    if not inc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Marine waste incident not found.")
    return MarineWasteService.apply_action(db, inc, action_req)


# ── 4. Dashboard Summary KPIs ────────────────────────────────────────────────

@router.get(
    "/summary",
    response_model=MarineWasteSummaryResponse,
    summary="Aggregated KPI metrics for Marine Waste Command Center",
)
def get_waste_summary(db: Session = Depends(get_db)):
    """Returns real-time KPI counts across waste categories, severity, and priority."""
    return MarineWasteService.get_summary(db)


# ── 5. GIS Map Layers ────────────────────────────────────────────────────────

@router.get(
    "/map/layers",
    response_model=MarineWasteLayersResponse,
    summary="GeoJSON FeatureCollection of marine waste points for Leaflet map",
)
def get_waste_map_layers(db: Session = Depends(get_db)):
    """Provides GIS layer features with coordinates, severity badges, and debris properties."""
    return MarineWasteService.get_map_layers(db)
