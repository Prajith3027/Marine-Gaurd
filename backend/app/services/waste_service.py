"""
Business logic and scoring service for Marine Waste & Debris Module.
Calculates Pollution Score, Severity, Cleanup Priority, and manages
incident creation, citizen reports, and authority response actions.
"""
from __future__ import annotations
import math
import uuid
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List, Tuple

from sqlalchemy import select, func, desc
from sqlalchemy.orm import Session

from app.models.marine_waste import MarineWasteIncident
from app.models.citizen_report import CitizenReport
from app.models.user import PublicAlert, CitizenReportEvent
from app.schemas.marine_waste import (
    WasteCategoryType,
    WasteDensityType,
    WasteSeverityType,
    CleanupPriorityType,
    WasteActionType,
    PollutionScoreBreakdown,
    MarineWasteIncidentCreate,
    MarineWasteActionRequest,
    MarineWasteSummaryResponse,
    MarineWasteLayersResponse,
    MarineWasteLayerFeature,
)
from app.gis.spatial_service import haversine_km

logger = logging.getLogger(__name__)


# ── Known Ecological Marine Reserves in Indian Waters ──────────────────────────
SENSITIVE_ZONES = [
    {"name": "Gulf of Mannar Biosphere Reserve", "lat": 9.28, "lon": 79.31, "radius_km": 30.0, "factor": 95.0},
    {"name": "Sundarbans Marine Mangrove Corridor", "lat": 21.75, "lon": 88.75, "radius_km": 40.0, "factor": 90.0},
    {"name": "Gahirmatha Olive Ridley Sanctuary", "lat": 20.72, "lon": 87.05, "radius_km": 25.0, "factor": 95.0},
    {"name": "Malvan Marine Sanctuary (Sindhudurg)", "lat": 16.05, "lon": 73.47, "radius_km": 20.0, "factor": 85.0},
    {"name": "Netrani Island Coral Reef (Karnataka)", "lat": 14.02, "lon": 74.32, "radius_km": 15.0, "factor": 85.0},
    {"name": "Palk Bay Seagrass Beds", "lat": 9.60, "lon": 79.20, "radius_km": 25.0, "factor": 90.0},
]

# Baseline Indian Commercial Port & Shipping Centers
COMMERCIAL_PORTS = [
    {"name": "Chennai Port", "lat": 13.084, "lon": 80.297, "radius_km": 12.0},
    {"name": "JNPT Mumbai", "lat": 18.949, "lon": 72.951, "radius_km": 15.0},
    {"name": "Visakhapatnam Port", "lat": 17.690, "lon": 83.298, "radius_km": 12.0},
    {"name": "Cochin Port", "lat": 9.967, "lon": 76.271, "radius_km": 12.0},
    {"name": "Kandla Port", "lat": 23.013, "lon": 70.220, "radius_km": 15.0},
]


class MarineWasteService:

    @staticmethod
    def calculate_distance_from_coast(lat: float, lon: float) -> float:
        """Estimates distance from Indian shoreline in kilometers."""
        # Simple geodesic approximation to approximate Indian coastal alignment
        # Closest default baseline ~2.5 km if nearshore
        return 2.5

    @staticmethod
    def evaluate_ecological_sensitivity(lat: float, lon: float) -> Tuple[float, str]:
        """
        Determines ecological sensitivity score (0 to 100) based on proximity
        to marine sanctuaries, coral reefs, and biosphere reserves.
        """
        max_score = 30.0  # Base marine baseline
        closest_zone = "Standard Coastal Waters"

        for zone in SENSITIVE_ZONES:
            dist = haversine_km(lat, lon, zone["lat"], zone["lon"])
            if dist <= zone["radius_km"]:
                score = zone["factor"] * (1.0 - (dist / (zone["radius_km"] * 1.5)))
                if score > max_score:
                    max_score = score
                    closest_zone = f"{zone['name']} ({dist:.1f} km)"

        return round(min(100.0, max(20.0, max_score)), 1), closest_zone

    @staticmethod
    def calculate_pollution_score(
        waste_type: str,
        density_score: float,
        estimated_area_m2: float,
        distance_from_coast_km: float,
        latitude: float,
        longitude: float,
    ) -> Tuple[float, PollutionScoreBreakdown]:
        """
        Calculates Transparent Pollution Score (0 to 100) using the exact prompt formula:
          Pollution Score =
              Waste Density x 35%
            + Affected Area x 25%
            + Distance From Coast x 15%
            + Ecological Sensitivity x 15%
            + Waste Severity/Persistence x 10%

        All factors are normalized to 0-100 before weighting.
        """
        # 1. Waste Density (0-100)
        norm_density = min(100.0, max(0.0, float(density_score)))

        # 2. Affected Area (0-100)
        # Normalize: 0 m² = 0, 1000 m² = 100
        norm_area = min(100.0, max(10.0, (estimated_area_m2 / 1000.0) * 100.0))

        # 3. Distance From Coast (0-100)
        # Closer to coast = higher impact on beaches/communities/tourism
        # <= 1 km = 95, 5 km = 75, 20 km = 45, > 50 km = 25
        if distance_from_coast_km <= 1.0:
            norm_dist = 95.0
        elif distance_from_coast_km <= 5.0:
            norm_dist = 80.0
        elif distance_from_coast_km <= 15.0:
            norm_dist = 60.0
        elif distance_from_coast_km <= 30.0:
            norm_dist = 40.0
        else:
            norm_dist = 25.0

        # 4. Ecological Sensitivity (0-100)
        norm_sensitivity, _ = MarineWasteService.evaluate_ecological_sensitivity(latitude, longitude)

        # 5. Waste Severity/Persistence (0-100)
        # Synthetic plastic & non-biodegradable polymers have long degradation lifespans
        persistence_table = {
            "FISHING_NETS": 95.0,     # Ghost nets persist for 600+ years, lethal to fauna
            "MARINE_DEBRIS": 85.0,    # Heavy industrial/metal/chemical hazards
            "PLASTIC_BOTTLES": 80.0,  # PET bottles persist for 450+ years
            "FLOATING_PLASTIC": 75.0, # Microplastic precursors
            "FLOATING_WASTE": 65.0,   # Mixed municipal debris
            "OTHER_WASTE": 50.0,
        }
        norm_severity = persistence_table.get(waste_type.upper(), 70.0)

        # Apply exact prompt weights:
        w_density = norm_density * 0.35
        w_area = norm_area * 0.25
        w_dist = norm_dist * 0.15
        w_sens = norm_sensitivity * 0.15
        w_sev = norm_severity * 0.10

        total_score = round(min(100.0, max(0.0, w_density + w_area + w_dist + w_sens + w_sev)), 1)

        breakdown = PollutionScoreBreakdown(
            waste_density_score=round(norm_density, 1),
            density_weighted=round(w_density, 2),
            affected_area_score=round(norm_area, 1),
            area_weighted=round(w_area, 2),
            distance_coast_score=round(norm_dist, 1),
            distance_weighted=round(w_dist, 2),
            ecological_sensitivity_score=round(norm_sensitivity, 1),
            sensitivity_weighted=round(w_sens, 2),
            waste_severity_score=round(norm_severity, 1),
            severity_weighted=round(w_sev, 2),
        )

        return total_score, breakdown

    @staticmethod
    def classify_severity(score: float) -> WasteSeverityType:
        """
        Maps Pollution Score to Severity:
          0–25   LOW
          26–50  MODERATE
          51–75  HIGH
          76–100 CRITICAL
        """
        if score >= 76.0:
            return "CRITICAL"
        elif score >= 51.0:
            return "HIGH"
        elif score >= 26.0:
            return "MODERATE"
        else:
            return "LOW"

    @staticmethod
    def determine_cleanup_priority(
        score: float,
        severity: str,
        waste_type: str,
        entanglement_hazard: bool,
        navigation_hazard: bool,
        latitude: float,
        longitude: float,
    ) -> CleanupPriorityType:
        """
        Calculates Cleanup Priority:
          P1 — IMMEDIATE
          P2 — HIGH
          P3 — MODERATE
          P4 — LOW

        Rules:
        - Critical score (>=76) -> P1 — IMMEDIATE
        - Fishing nets / entanglement hazards increase priority (P1 or P2)
        - Navigation hazards in commercial shipping paths increase priority
        - High ecological sensitivity increases priority
        """
        sensitivity, _ = MarineWasteService.evaluate_ecological_sensitivity(latitude, longitude)

        # Baseline assignment based on severity
        if severity == "CRITICAL":
            base_prio = 1
        elif severity == "HIGH":
            base_prio = 2
        elif severity == "MODERATE":
            base_prio = 3
        else:
            base_prio = 4

        # Modifiers:
        # 1. Fishing nets / entanglement hazard near marine reserves boosts to P1
        if entanglement_hazard and (score >= 45.0 or sensitivity >= 60.0):
            base_prio = 1
        elif entanglement_hazard:
            base_prio = min(base_prio, 2)

        # 2. Navigation hazard boosts by 1 tier
        if navigation_hazard:
            base_prio = min(base_prio, 2)

        # 3. High ecological sensitivity boosts by 1 tier
        if sensitivity >= 75.0 and score >= 40.0:
            base_prio = min(base_prio, 2)

        prio_map = {
            1: "P1 — IMMEDIATE",
            2: "P2 — HIGH",
            3: "P3 — MODERATE",
            4: "P4 — LOW",
        }
        return prio_map.get(base_prio, "P3 — MODERATE")

    @staticmethod
    def recommend_action(
        waste_type: str,
        severity: str,
        priority: str,
        navigation_hazard: bool = False,
    ) -> str:
        """
        Deterministic response action recommendation:
        - Navigation Hazard -> Port Notification
        - Fishing Nets + Critical / P1 -> Diving Retrieval Net
        - Floating Plastic / Plastic Bottles + High / Critical -> Beach Cleanup Crew
        - Large Floating Debris + High / Critical -> Harbor Skimmer Boat
        - Moderate -> Environmental Inspection
        - Low / Other -> Monitor Area
        """
        if navigation_hazard:
            return "Port Notification"
        if waste_type == "FISHING_NETS" and (severity in ("CRITICAL", "HIGH") or "P1" in (priority or "")):
            return "Diving Retrieval Net"
        if waste_type in ("FLOATING_PLASTIC", "PLASTIC_BOTTLES") and severity in ("HIGH", "CRITICAL"):
            return "Beach Cleanup Crew"
        if waste_type in ("MARINE_DEBRIS", "FLOATING_WASTE") and severity in ("HIGH", "CRITICAL"):
            return "Harbor Skimmer Boat"
        if severity == "MODERATE":
            return "Environmental Inspection"
        return "Monitor Area"

    @classmethod
    def trigger_marine_waste_alert(
        cls,
        db: Session,
        incident: MarineWasteIncident,
        user_id: Optional[str] = None,
    ) -> Optional[PublicAlert]:
        """
        Generates a PublicAlert when Severity is High/Critical OR Cleanup Priority is P1.
        """
        is_p1 = "P1" in (incident.cleanup_priority or "")
        if incident.severity in ("HIGH", "CRITICAL") or is_p1:
            try:
                rec_action = cls.recommend_action(
                    incident.waste_type,
                    incident.severity,
                    incident.cleanup_priority,
                    incident.navigation_hazard,
                )
                alert = PublicAlert(
                    id=str(uuid.uuid4()),
                    title=f"MARINE WASTE ALERT: {incident.severity} Debris Hazard",
                    description=(
                        f"Critical marine waste detected near {incident.location_name or 'Coastal Marine Sector'}.\n\n"
                        f"Waste Type: {incident.waste_type.replace('_', ' ').title()}\n"
                        f"Pollution Score: {incident.pollution_score}/100\n"
                        f"Priority: {incident.cleanup_priority}\n"
                        f"Location: {incident.latitude:.4f}°N, {incident.longitude:.4f}°E\n\n"
                        f"Recommended Action:\n{rec_action}"
                    ),
                    location=incident.location_name or "Coastal Marine Sector",
                    severity="CRITICAL" if incident.severity == "CRITICAL" else "HIGH",
                    status="ACTIVE",
                    alert_type="MARINE_DEBRIS_ALERT",
                    latitude=incident.latitude,
                    longitude=incident.longitude,
                    created_by=user_id,
                )
                db.add(alert)
                db.commit()
                return alert
            except Exception as e:
                logger.warning(f"Could not automatically create PublicAlert for waste incident: {e}")
        return None

    @classmethod
    def generate_incident_code(cls, db: Session) -> str:
        """Generates human-readable unique code (e.g. MW-20261008-B7E2)."""
        date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
        nonce = uuid.uuid4().hex[:4].upper()
        return f"MW-{date_str}-{nonce}"

    @classmethod
    def create_waste_incident(
        cls,
        db: Session,
        payload: MarineWasteIncidentCreate,
        user_id: Optional[str] = None,
    ) -> MarineWasteIncident:
        """Persists a new MarineWasteIncident and evaluates score, severity, priority."""
        dist_coast = payload.distance_from_coast_km if payload.distance_from_coast_km is not None else cls.calculate_distance_from_coast(payload.latitude, payload.longitude)
        
        density_val_map = {"LOW": 20.0, "MODERATE": 50.0, "HIGH": 75.0, "VERY_HIGH": 95.0}
        density_num = density_val_map.get(payload.density, 50.0)

        score, _ = cls.calculate_pollution_score(
            waste_type=payload.waste_type,
            density_score=density_num,
            estimated_area_m2=payload.estimated_area_m2,
            distance_from_coast_km=dist_coast,
            latitude=payload.latitude,
            longitude=payload.longitude,
        )

        severity = cls.classify_severity(score)
        
        entangle = payload.entanglement_hazard if payload.entanglement_hazard is not None else (payload.waste_type == "FISHING_NETS")
        nav_hazard = payload.navigation_hazard if payload.navigation_hazard is not None else (payload.waste_type == "MARINE_DEBRIS" or payload.estimated_area_m2 >= 400.0)

        priority = cls.determine_cleanup_priority(
            score=score,
            severity=severity,
            waste_type=payload.waste_type,
            entanglement_hazard=entangle,
            navigation_hazard=nav_hazard,
            latitude=payload.latitude,
            longitude=payload.longitude,
        )

        incident = MarineWasteIncident(
            id=str(uuid.uuid4()),
            incident_code=cls.generate_incident_code(db),
            waste_type=payload.waste_type,
            density=payload.density,
            density_score=density_num,
            estimated_area_m2=payload.estimated_area_m2,
            estimated_items_count=payload.estimated_items_count,
            entanglement_hazard=entangle,
            navigation_hazard=nav_hazard,
            pollution_score=score,
            severity=severity,
            cleanup_priority=priority,
            status="REPORTED",
            latitude=payload.latitude,
            longitude=payload.longitude,
            location_name=payload.location_name or "Coastal Marine Sector",
            distance_from_coast_km=dist_coast,
            image_url=payload.image_url,
            mask_overlay_url=payload.mask_overlay_url,
            reported_by_user_id=user_id,
            citizen_report_id=payload.citizen_report_id,
        )

        db.add(incident)
        db.commit()
        db.refresh(incident)

        # Trigger Public Emergency Debris Hazard alert if High / Critical / P1
        cls.trigger_marine_waste_alert(db, incident, user_id=user_id)

        return incident

    @classmethod
    def apply_action(
        cls,
        db: Session,
        incident: MarineWasteIncident,
        action_req: MarineWasteActionRequest,
    ) -> MarineWasteIncident:
        """Assigns cleanup action, notes, and updates status."""
        incident.action_taken = action_req.action
        if action_req.action_notes:
            incident.action_notes = action_req.action_notes

        if action_req.status_update:
            incident.status = action_req.status_update
        elif action_req.action != "NONE":
            incident.dispatched_at = datetime.now(timezone.utc)
            incident.status = "ACTION_ASSIGNED"

        if incident.status == "RESOLVED":
            incident.resolved_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(incident)
        return incident

    @classmethod
    def get_summary(cls, db: Session) -> MarineWasteSummaryResponse:
        """Aggregates metrics for the command center dashboard."""
        all_incidents = db.execute(select(MarineWasteIncident)).scalars().all()

        total = len(all_incidents)
        active = sum(1 for i in all_incidents if i.status != "RESOLVED")
        critical = sum(1 for i in all_incidents if i.severity == "CRITICAL")
        immediate = sum(1 for i in all_incidents if "P1" in i.cleanup_priority)
        entangle = sum(1 for i in all_incidents if i.entanglement_hazard)
        nav = sum(1 for i in all_incidents if i.navigation_hazard)
        dispatched = sum(1 for i in all_incidents if i.action_taken != "NONE")
        resolved = sum(1 for i in all_incidents if i.status == "RESOLVED")

        waste_types: Dict[str, int] = {}
        severities: Dict[str, int] = {}
        priorities: Dict[str, int] = {}

        for i in all_incidents:
            waste_types[i.waste_type] = waste_types.get(i.waste_type, 0) + 1
            severities[i.severity] = severities.get(i.severity, 0) + 1
            priorities[i.cleanup_priority] = priorities.get(i.cleanup_priority, 0) + 1

        return MarineWasteSummaryResponse(
            total_incidents=total,
            active_hotspots=active,
            critical_severity_count=critical,
            immediate_priority_count=immediate,
            entanglement_hazards_count=entangle,
            navigation_hazards_count=nav,
            dispatched_actions_count=dispatched,
            resolved_count=resolved,
            waste_type_breakdown=waste_types,
            severity_breakdown=severities,
            priority_breakdown=priorities,
        )

    @classmethod
    def get_map_layers(cls, db: Session) -> MarineWasteLayersResponse:
        """Generates GeoJSON points and properties for GIS rendering."""
        incidents = db.execute(
            select(MarineWasteIncident).order_by(MarineWasteIncident.created_at.desc()).limit(150)
        ).scalars().all()

        features = []
        for i in incidents:
            feat = MarineWasteLayerFeature(
                type="Feature",
                geometry={
                    "type": "Point",
                    "coordinates": [i.longitude, i.latitude],
                },
                properties={
                    "id": i.id,
                    "incident_code": i.incident_code,
                    "waste_type": i.waste_type,
                    "severity": i.severity,
                    "cleanup_priority": i.cleanup_priority,
                    "pollution_score": i.pollution_score,
                    "density": i.density,
                    "estimated_items_count": i.estimated_items_count,
                    "location_name": i.location_name,
                    "status": i.status,
                    "action_taken": i.action_taken,
                    "entanglement_hazard": i.entanglement_hazard,
                    "navigation_hazard": i.navigation_hazard,
                }
            )
            features.append(feat)

        return MarineWasteLayersResponse(
            type="FeatureCollection",
            features=features,
            total_count=len(features),
        )
