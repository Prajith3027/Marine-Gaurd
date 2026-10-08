"""
ORM model for Module 19: Citizen and Fisherman Reporting Application.
Stores crowd-sourced spill reports, metadata, photo references, verification confidence,
and operational review workflows.
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Column,
    String,
    Float,
    DateTime,
    Text,
    ForeignKey,
    Index,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database.session import Base
import app.models.user  # noqa: F401  (registers users table referenced by user_id FK)


class CitizenReport(Base):
    """
    Citizen/Fisherman crowd-sourced oil spill observation record.
    Workflow transitions: SUBMITTED -> UNDER_REVIEW -> AI_ASSISTED_VERIFICATION -> VERIFIED / REJECTED
    """
    __tablename__ = "citizen_reports"

    id = Column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
        index=True,
        doc="Unique identifier for the report",
    )
    report_code = Column(
        String(64),
        unique=True,
        nullable=False,
        index=True,
        doc="Human-readable tracking code (e.g. REP-20260910-A1B2)",
    )

    # Geospatial location
    latitude = Column(Float, nullable=False, doc="Reported latitude (-90 to 90)")
    longitude = Column(Float, nullable=False, doc="Reported longitude (-180 to 180)")
    location_description = Column(String(255), nullable=True, doc="Human descriptive coastal or offshore area name")

    # Photo / Media References
    photo_url = Column(String(512), nullable=True, doc="Public or storage URL of uploaded evidence photo")
    photo_filename = Column(String(255), nullable=True, doc="Sanitized stored file name")
    photo_content_type = Column(String(64), nullable=True, doc="MIME content type (image/jpeg, image/png, etc.)")
    photo_file_size_bytes = Column(Float, nullable=True, doc="Uploaded file size in bytes")

    # Observation details
    description = Column(Text, nullable=False, doc="Citizen or fisherman detailed description of the anomaly")
    incident_category = Column(
        String(64),
        nullable=False,
        default="SURFACE_SHEEN",
        doc="Category: SURFACE_SHEEN, TAR_BALLS, HEAVY_BLACK_OIL, VESSEL_DISCHARGE, SHORELINE_COATING, OTHER",
    )
    estimated_spill_size = Column(String(64), nullable=True, doc="Estimated size (e.g. <100m, 100-500m, >500m)")
    observed_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        doc="Timestamp when citizen made the visual observation",
    )

    # Reporter Contact Information (Private / Protected)
    reporter_name = Column(String(128), nullable=True, doc="Optional reporter full name")
    reporter_contact = Column(String(128), nullable=True, doc="Optional private contact phone number or email")
    reporter_affiliation = Column(String(64), nullable=True, default="CITIZEN", doc="CITIZEN, FISHERMAN, PORT_STAFF, TOURIST")

    # Verification & Review Workflow
    status = Column(
        String(64),
        nullable=False,
        default="SUBMITTED",
        index=True,
        doc="Status: SUBMITTED, UNDER_REVIEW, AI_ASSISTED_VERIFICATION, VERIFIED, REJECTED",
    )
    verification_confidence = Column(
        Float,
        nullable=False,
        default=0.0,
        doc="AI & contextual verification confidence score (0.0 to 100.0%)",
    )
    ai_analysis_notes = Column(Text, nullable=True, doc="Automated AI vision & contextual heuristic analysis notes")

    # Incident Linkage
    linked_incident_id = Column(
        UUID(as_uuid=False),
        ForeignKey("incidents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        doc="Foreign key to linked incident if verified",
    )

    # Ownership & citizen-facing fields (auth extension)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    severity = Column(String(16), nullable=True, doc="Citizen-assessed severity: LOW, MEDIUM, HIGH, CRITICAL")
    video_url = Column(String(512), nullable=True, doc="Optional uploaded video evidence URL")
    public_remarks = Column(Text, nullable=True, doc="Public-safe admin remarks visible to the reporting citizen")

    # Marine Pollution System discriminator (OIL_SPILL | MARINE_WASTE)
    pollution_type = Column(String(32), nullable=False, default="OIL_SPILL", index=True, doc="OIL_SPILL or MARINE_WASTE")
    waste_type = Column(String(64), nullable=True, doc="FLOATING_PLASTIC, PLASTIC_BOTTLES, FISHING_NETS, MARINE_DEBRIS, FLOATING_WASTE, OTHER_WASTE")
    waste_density = Column(String(32), nullable=True, doc="LOW, MODERATE, HIGH, VERY_HIGH")

    # Audit & Review Metadata
    reviewed_by = Column(String(128), nullable=True, doc="Command operator or reviewer name")
    reviewed_at = Column(DateTime(timezone=True), nullable=True, doc="Timestamp of commander review")
    review_notes = Column(Text, nullable=True, doc="Commander or operator review remarks")

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    incident = relationship("Incident", backref="citizen_reports", foreign_keys=[linked_incident_id])

    __table_args__ = (
        Index("ix_citizen_reports_status_created", "status", "created_at"),
        Index("ix_citizen_reports_coords", "latitude", "longitude"),
    )
