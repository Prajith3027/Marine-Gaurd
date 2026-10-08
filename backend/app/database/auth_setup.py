"""
Idempotent database migration + admin seeding for the auth extension.

* Adds the new columns to the pre-existing `citizen_reports` table (PostgreSQL / SQLite).
* Creates the initial admin and demo citizen accounts.
* Populates foundational maritime incidents and demo alerts if empty.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_password
from app.database.session import engine
from app.models.user import ROLE_ADMIN, ROLE_CITIZEN, User, PublicAlert
from app.models.incident import Incident
from app.models.enums import IncidentStatus, IncidentSeverity
from app.models.citizen_report import CitizenReport

logger = logging.getLogger(__name__)

_NEW_REPORT_COLUMNS = {
    "user_id": "VARCHAR(36)",
    "severity": "VARCHAR(16)",
    "video_url": "VARCHAR(512)",
    "public_remarks": "TEXT",
    "pollution_type": "VARCHAR(32) DEFAULT 'OIL_SPILL'",
    "waste_type": "VARCHAR(64)",
    "waste_density": "VARCHAR(32)",
}


def migrate_citizen_reports(bind=engine) -> None:
    insp = inspect(bind)
    if "citizen_reports" not in insp.get_table_names():
        return
    existing = {c["name"] for c in insp.get_columns("citizen_reports")}
    with bind.begin() as conn:
        for col, ddl in _NEW_REPORT_COLUMNS.items():
            if col not in existing:
                conn.execute(text(f"ALTER TABLE citizen_reports ADD COLUMN {col} {ddl}"))
                logger.info("Added citizen_reports.%s", col)


def seed_initial_admin(db: Session) -> bool:
    s = get_settings()

    # 1. Seed Admin Account
    admin_email = (s.initial_admin_email or "admin@maritime.gov.in").strip().lower()
    admin_pass = s.initial_admin_password or "Admin@Maritime2026"
    existing_admin = db.query(User).filter(User.email == admin_email).first()
    if not existing_admin:
        db.add(User(
            name=s.initial_admin_name or "Authorized Administrator",
            email=admin_email,
            password_hash=hash_password(admin_pass),
            role=ROLE_ADMIN,
            is_active=True,
        ))
        logger.info("Seeded initial admin account %s", admin_email)

    # 2. Seed Demo Citizen Account
    citizen_email = "citizen@marine.org"
    existing_citizen = db.query(User).filter(User.email == citizen_email).first()
    if not existing_citizen:
        db.add(User(
            name="Citizen Marine Observer",
            email=citizen_email,
            password_hash=hash_password("Citizen@2026"),
            role=ROLE_CITIZEN,
            is_active=True,
        ))
        logger.info("Seeded initial citizen account %s", citizen_email)

    db.commit()

    # 3. Seed Sample Incidents if none exist
    incident_count = db.query(Incident).count()
    if incident_count == 0:
        inc1_id = str(uuid.uuid4())
        inc1 = Incident(
            id=inc1_id,
            incident_code="INC-20261005-001",
            status=IncidentStatus.VERIFIED,
            severity=IncidentSeverity.CRITICAL,
            risk_score=88.5,
            detection_confidence=0.94,
            spill_area_km2=14.8,
            latitude=13.1500,
            longitude=80.4500,
            detected_at=datetime.now(timezone.utc),
            description="DeepLabV3+ synthetic aperture radar satellite pass detected heavy crude oil slick in Chennai offshore tanker fairway.",
        )
        inc2_id = str(uuid.uuid4())
        inc2 = Incident(
            id=inc2_id,
            incident_code="INC-20261005-002",
            status=IncidentStatus.DETECTED,
            severity=IncidentSeverity.HIGH,
            risk_score=72.0,
            detection_confidence=0.89,
            spill_area_km2=6.4,
            latitude=13.3200,
            longitude=80.5200,
            detected_at=datetime.now(timezone.utc),
            description="Multi-spectral imagery identified anomalous dark formation in high traffic shipping corridor.",
        )
        db.add(inc1)
        db.add(inc2)
        db.commit()
        logger.info("Seeded 2 baseline incidents for maritime surveillance demonstration.")

        # Seed sample citizen report
        cit_user = db.query(User).filter(User.email == citizen_email).first()
        db.add(CitizenReport(
            id=str(uuid.uuid4()),
            report_code="CR-20261005-001",
            user_id=cit_user.id if cit_user else None,
            latitude=13.0780,
            longitude=80.2800,
            location_description="Marina Beach North Shoreline",
            description="Dark iridescent oily sheen washing ashore near fishing wharf with pungent petroleum smell.",
            incident_category="SHORELINE_POLLUTION",
            severity="HIGH",
            status="VERIFIED",
            observed_at=datetime.now(timezone.utc),
            verification_confidence=0.92,
            ai_analysis_notes="Computer vision detected petroleum hydrocarbon iridescent pattern matching heavy marine fuel oil.",
            public_remarks="Coast Guard Sector 4 deployed containment booms. Investigation opened.",
            linked_incident_id=inc1_id,
        ))

        # Seed sample public alert
        db.add(PublicAlert(
            id=str(uuid.uuid4()),
            title="Urgent Advisory: Precautionary Fishing Ban & Beach Closure",
            description="High-severity hydrocarbon spill detected 12 NM offshore Chennai. Avoid water contact along Marina to Ennore coast.",
            location="Marina Beach to Ennore Coast",
            severity="HIGH",
            status="ACTIVE",
            alert_type="FISHING_BAN",
            latitude=13.0827,
            longitude=80.2707,
            created_at=datetime.now(timezone.utc),
        ))
        db.commit()
        logger.info("Seeded baseline citizen reports and public emergency alerts.")

    seed_initial_marine_waste(db)
    return True


def seed_initial_marine_waste(db: Session) -> bool:
    """Pre-seeds demonstration marine waste & debris incidents along coastal India."""
    from app.models.marine_waste import MarineWasteIncident
    existing = db.query(MarineWasteIncident).first()
    if existing:
        return False

    demo_incidents = [
        MarineWasteIncident(
            id=str(uuid.uuid4()),
            incident_code="MW-20261008-NETS1",
            waste_type="FISHING_NETS",
            density="HIGH",
            density_score=82.0,
            estimated_area_m2=450.0,
            estimated_items_count=8,
            entanglement_hazard=True,
            navigation_hazard=True,
            pollution_score=88.5,
            severity="CRITICAL",
            cleanup_priority="P1 — IMMEDIATE",
            status="REPORTED",
            latitude=9.2876,
            longitude=79.3129,
            location_name="Gulf of Mannar Marine Biosphere Reserve",
            distance_from_coast_km=1.8,
            confidence=0.94,
            action_taken="NONE",
            action_notes="Submerged ghost net cluster reported by local trawlers; coral entanglement threat.",
        ),
        MarineWasteIncident(
            id=str(uuid.uuid4()),
            incident_code="MW-20261008-PLAS2",
            waste_type="PLASTIC_BOTTLES",
            density="MODERATE",
            density_score=54.0,
            estimated_area_m2=280.0,
            estimated_items_count=320,
            entanglement_hazard=False,
            navigation_hazard=False,
            pollution_score=52.0,
            severity="HIGH",
            cleanup_priority="P2 — HIGH",
            status="AI_VERIFIED",
            latitude=13.0500,
            longitude=80.2824,
            location_name="Marina Beach Coastal Tide Line, Chennai",
            distance_from_coast_km=0.4,
            confidence=0.89,
            action_taken="NONE",
            action_notes="Dense plastic bottle and sachet accumulation line following high tide.",
        ),
        MarineWasteIncident(
            id=str(uuid.uuid4()),
            incident_code="MW-20261008-DEBR3",
            waste_type="MARINE_DEBRIS",
            density="HIGH",
            density_score=70.0,
            estimated_area_m2=520.0,
            estimated_items_count=45,
            entanglement_hazard=False,
            navigation_hazard=True,
            pollution_score=74.0,
            severity="HIGH",
            cleanup_priority="P2 — HIGH",
            status="CLEANUP_DISPATCHED",
            latitude=18.9300,
            longitude=72.8200,
            location_name="Mumbai Port Approach Navigation Channel",
            distance_from_coast_km=4.2,
            confidence=0.91,
            action_taken="HARBOR_SKIMMER_BOAT",
            action_notes="Harbor skimmer boat dispatched to clear floating timber and industrial packaging.",
        ),
    ]

    for inc in demo_incidents:
        db.add(inc)
    db.commit()
    logger.info("Seeded demonstration Marine Waste & Debris incidents.")
    return True

