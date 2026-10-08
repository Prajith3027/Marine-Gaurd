"""
Models package — exports all ORM models.
Import this module to ensure all models are registered with SQLAlchemy Base.
"""
from app.models.enums import (          # noqa: F401
    IncidentStatus,
    IncidentSeverity,
    ZoneType,
    ZoneSensitivity,
)
from app.models.incident import Incident                        # noqa: F401
from app.models.detection import DetectionResult               # noqa: F401
from app.models.risk import RiskAssessment                     # noqa: F401
from app.models.environmental_zone import EnvironmentalZone   # noqa: F401
from app.models.incident_event import IncidentEvent           # noqa: F401
from app.models.movement_prediction import MovementPrediction   # noqa: F401
from app.models.ecosystem_risk import EcosystemRiskAssessment   # noqa: F401
from app.models.coastal_impact import CoastalImpactPrediction   # noqa: F401
from app.models.emergency_vessel import (                       # noqa: F401
    EmergencyVessel,
    VesselPosition,
    ResponseResource,
    OptimizedRoute,
    ResponseAssignment,
)
from app.models.cleanup_plan import (                           # noqa: F401
    CleanupPlan,
    CleanupRecommendation,
)
from app.models.resource_allocation import (                    # noqa: F401
    ResourceAssignment,
    ResourceStatusHistory,
)
from app.models.verification import (                           # noqa: F401
    VerificationSource,
    VerificationRecord,
    VerificationEvidence,
)
from app.models.source_analysis import (                         # noqa: F401
    SourceAnalysis,
    SourceCandidate,
    SourceEvidence,
)
from app.models.citizen_report import CitizenReport             # noqa: F401
from app.models.simulation import (                             # noqa: F401
    SimulationRun,
    SimulationInput,
    SimulationOutput,
)
from app.models.economic_impact import (                       # noqa: F401
    EconomicAssumption,
    EconomicAssessment,
    EconomicAssessmentCategory,
)
from app.models.environmental_recovery import (                 # noqa: F401
    RecoveryFactor,
    RecoveryPrediction,
    EnvironmentalRecoveryAssessment,
)
from app.models.alert import (                                  # noqa: F401
    Alert,
    AlertRule,
    AlertRecipient,
    AlertEvent,
)
from app.models.assistant import (                              # noqa: F401
    AssistantConversation,
    AssistantMessage,
)
from app.models.user import (                                   # noqa: F401
    User,
    CitizenReportEvent,
    PublicAlert,
    Investigation,
    VesselScore,
)
from app.models.marine_waste import MarineWasteIncident         # noqa: F401

__all__ = [
    "User",
    "CitizenReportEvent",
    "PublicAlert",
    "Investigation",
    "VesselScore",
    "MarineWasteIncident",
    "IncidentStatus",
    "IncidentSeverity",
    "ZoneType",
    "ZoneSensitivity",
    "Incident",
    "DetectionResult",
    "RiskAssessment",
    "EnvironmentalZone",
    "IncidentEvent",
    "MovementPrediction",
    "EcosystemRiskAssessment",
    "CoastalImpactPrediction",
    "EmergencyVessel",
    "VesselPosition",
    "ResponseResource",
    "OptimizedRoute",
    "ResponseAssignment",
    "CleanupPlan",
    "CleanupRecommendation",
    "ResourceAssignment",
    "ResourceStatusHistory",
    "VerificationSource",
    "VerificationRecord",
    "VerificationEvidence",
    "SourceAnalysis",
    "SourceCandidate",
    "SourceEvidence",
    "CitizenReport",
    "SimulationRun",
    "SimulationInput",
    "SimulationOutput",
    "EconomicAssumption",
    "EconomicAssessment",
    "EconomicAssessmentCategory",
    "RecoveryFactor",
    "RecoveryPrediction",
    "EnvironmentalRecoveryAssessment",
    "Alert",
    "AlertRule",
    "AlertRecipient",
    "AlertEvent",
    "AssistantConversation",
    "AssistantMessage",
]


