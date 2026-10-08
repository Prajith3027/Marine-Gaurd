"""
ORM model for Marine Waste & Debris Module.
Stores marine debris incidents, vision AI analytics, density, pollution scores,
cleanup priorities, and authority dispatch records.
Compatible with both PostgreSQL and SQLite.
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    String,
    Float,
    Integer,
    Boolean,
    DateTime,
    Text,
    Index,
    ForeignKey,
)
from sqlalchemy.dialects.postgresql import UUID
from app.database.session import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class MarineWasteIncident(Base):
    """
    Dedicated operational entity for Marine Waste & Debris sites,
    hotspots, and validated citizen/aerial sightings.
    Keeps the oil spill 'incidents' table 100% untouched.
    """
    __tablename__ = "marine_waste_incidents"

    id = Column(String(36), primary_key=True, default=_uuid)
    incident_code = Column(String(50), unique=True, nullable=False, index=True)

    # Waste Classification
    # FLOATING_PLASTIC, PLASTIC_BOTTLES, FISHING_NETS, MARINE_DEBRIS, FLOATING_WASTE, OTHER_WASTE
    waste_type = Column(String(64), nullable=False, default="FLOATING_PLASTIC", index=True)

    # Quantity & Density
    density = Column(String(32), nullable=False, default="MODERATE")  # LOW, MODERATE, HIGH, VERY_HIGH
    density_score = Column(Float, nullable=False, default=50.0)      # 0.0 to 100.0
    estimated_area_m2 = Column(Float, nullable=False, default=100.0)
    estimated_items_count = Column(Integer, nullable=False, default=50)

    # Hazard Indicators
    entanglement_hazard = Column(Boolean, nullable=False, default=False)
    navigation_hazard = Column(Boolean, nullable=False, default=False)

    # Scoring & Prioritization
    pollution_score = Column(Float, nullable=False, default=50.0, index=True)  # 0 to 100
    severity = Column(String(16), nullable=False, default="MODERATE", index=True)  # LOW, MODERATE, HIGH, CRITICAL
    cleanup_priority = Column(String(20), nullable=False, default="P3 — MODERATE", index=True)  # P1 — IMMEDIATE, P2 — HIGH, P3 — MODERATE, P4 — LOW

    # Workflow Status
    # REPORTED, AI_VERIFIED, CLEANUP_DISPATCHED, CONTAINED, RESOLVED
    status = Column(String(32), nullable=False, default="REPORTED", index=True)

    # Geospatial Location
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    location_name = Column(String(255), nullable=True, default="Coastal Marine Sector")
    distance_from_coast_km = Column(Float, nullable=True, default=2.5)

    # Evidence Media & Vision AI Overlays
    image_url = Column(String(512), nullable=True)
    mask_overlay_url = Column(Text, nullable=True)
    confidence = Column(Float, nullable=True, default=0.85)

    # User & Citizen Linking
    reported_by_user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    citizen_report_id = Column(UUID(as_uuid=False), ForeignKey("citizen_reports.id", ondelete="SET NULL"), nullable=True, index=True)

    # Authority Dispatch Action
    # NONE, BEACH_CLEANUP_CREW, HARBOR_SKIMMER_BOAT, DIVING_RETRIEVAL_NET, PORT_NOTIFICATION
    action_taken = Column(String(64), nullable=False, default="NONE")
    action_notes = Column(Text, nullable=True)
    dispatched_at = Column(DateTime(timezone=True), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=_now, onupdate=_now)

    __table_args__ = (
        Index("ix_marine_waste_coords", "latitude", "longitude"),
        Index("ix_marine_waste_status_prio", "status", "cleanup_priority"),
    )

    @property
    def recommended_action(self) -> str:
        """Deterministic response action recommendation."""
        if self.navigation_hazard:
            return "Port Notification"
        if self.waste_type == "FISHING_NETS" and (self.severity in ("CRITICAL", "HIGH") or "P1" in (self.cleanup_priority or "")):
            return "Diving Retrieval Net"
        if self.waste_type in ("FLOATING_PLASTIC", "PLASTIC_BOTTLES") and self.severity in ("HIGH", "CRITICAL"):
            return "Beach Cleanup Crew"
        if self.waste_type in ("MARINE_DEBRIS", "FLOATING_WASTE") and self.severity in ("HIGH", "CRITICAL"):
            return "Harbor Skimmer Boat"
        if self.severity == "MODERATE":
            return "Environmental Inspection" 
        return "Monitor Area"

    def __repr__(self) -> str:
        return f"<MarineWasteIncident {self.incident_code} [{self.waste_type}/{self.severity}/{self.cleanup_priority}]>"
