"""
Pydantic schemas for the Marine Waste & Debris Module.
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field


WasteCategoryType = Literal[
    "FLOATING_PLASTIC",
    "PLASTIC_BOTTLES",
    "FISHING_NETS",
    "MARINE_DEBRIS",
    "FLOATING_WASTE",
    "OTHER_WASTE",
]

WasteDensityType = Literal["LOW", "MODERATE", "HIGH", "VERY_HIGH"]
WasteSeverityType = Literal["LOW", "MODERATE", "HIGH", "CRITICAL"]
CleanupPriorityType = Literal["P1 — IMMEDIATE", "P2 — HIGH", "P3 — MODERATE", "P4 — LOW"]
WasteActionType = Literal[
    "NONE",
    "BEACH_CLEANUP_CREW",
    "HARBOR_SKIMMER_BOAT",
    "DIVING_RETRIEVAL_NET",
    "PORT_NOTIFICATION",
    "ENVIRONMENTAL_INSPECTION",
    "MONITOR_AREA",
]


class PollutionScoreBreakdown(BaseModel):
    waste_density_score: float = Field(..., description="Waste density component (0-100)")
    density_weighted: float = Field(..., description="Density x 35%")
    affected_area_score: float = Field(..., description="Affected area component (0-100)")
    area_weighted: float = Field(..., description="Area x 25%")
    distance_coast_score: float = Field(..., description="Distance from coast component (0-100)")
    distance_weighted: float = Field(..., description="Distance x 15%")
    ecological_sensitivity_score: float = Field(..., description="Ecological sensitivity component (0-100)")
    sensitivity_weighted: float = Field(..., description="Sensitivity x 15%")
    waste_severity_score: float = Field(..., description="Waste severity/persistence component (0-100)")
    severity_weighted: float = Field(..., description="Severity x 10%")
    formula_note: str = Field(
        "Pollution Score = Waste Density x 35% + Affected Area x 25% + Distance From Coast x 15% + Ecological Sensitivity x 15% + Waste Severity x 10%"
    )


class WasteDetectionResponse(BaseModel):
    detected: bool
    waste_type: str
    confidence: float
    density: str
    density_score: float
    estimated_area_m2: float
    estimated_items_count: int
    entanglement_hazard: bool
    navigation_hazard: bool
    pollution_score: float
    severity: str
    cleanup_priority: str
    recommended_action: Optional[str] = None
    score_breakdown: PollutionScoreBreakdown
    mask_overlay_base64: Optional[str] = None
    processing_time_ms: float
    image_metadata: Dict[str, Any] = Field(default_factory=dict)
    detection_notes: str


class MarineWasteIncidentResponse(BaseModel):
    id: str
    incident_code: str
    waste_type: str
    density: str
    density_score: float
    estimated_area_m2: float
    estimated_items_count: int
    entanglement_hazard: bool
    navigation_hazard: bool
    pollution_score: float
    severity: str
    cleanup_priority: str
    recommended_action: Optional[str] = None
    status: str
    latitude: float
    longitude: float
    location_name: Optional[str] = None
    distance_from_coast_km: Optional[float] = None
    image_url: Optional[str] = None
    mask_overlay_url: Optional[str] = None
    confidence: Optional[float] = None
    action_taken: str
    action_notes: Optional[str] = None
    dispatched_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MarineWasteIncidentCreate(BaseModel):
    waste_type: WasteCategoryType = "FLOATING_PLASTIC"
    density: WasteDensityType = "MODERATE"
    estimated_area_m2: float = 120.0
    estimated_items_count: int = 50
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    location_name: Optional[str] = "Coastal Sector"
    distance_from_coast_km: Optional[float] = 2.0
    entanglement_hazard: Optional[bool] = None
    navigation_hazard: Optional[bool] = None
    image_url: Optional[str] = None
    mask_overlay_url: Optional[str] = None
    citizen_report_id: Optional[str] = None


class MarineWasteActionRequest(BaseModel):
    action: WasteActionType
    action_notes: Optional[str] = Field(None, max_length=2000)
    status_update: Optional[str] = None


class MarineWasteSummaryResponse(BaseModel):
    total_incidents: int
    active_hotspots: int
    critical_severity_count: int
    immediate_priority_count: int
    entanglement_hazards_count: int
    navigation_hazards_count: int
    dispatched_actions_count: int
    resolved_count: int
    waste_type_breakdown: Dict[str, int]
    severity_breakdown: Dict[str, int]
    priority_breakdown: Dict[str, int]


class MarineWasteLayerFeature(BaseModel):
    type: str = "Feature"
    geometry: Dict[str, Any]  # Point or Polygon GeoJSON
    properties: Dict[str, Any]


class MarineWasteLayersResponse(BaseModel):
    type: str = "FeatureCollection"
    features: List[MarineWasteLayerFeature]
    total_count: int
