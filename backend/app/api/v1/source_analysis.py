"""
REST API endpoints for Module 18 — Probable Spill Source Analyzer.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.schemas.source_analysis import (
    SourceAnalysisResponse,
    SourceAnalysisRequest,
)
from app.services.source_analyzer import SourceAnalyzerService

router = APIRouter(prefix="", tags=["Probable Spill Source Analyzer"])
source_analyzer_service = SourceAnalyzerService()


@router.post(
    "/incidents/{incident_id}/source-analysis",
    response_model=SourceAnalysisResponse,
    summary="Evaluate reverse-trajectory and estimate probable spill source region",
)
def evaluate_source_analysis(
    incident_id: str,
    payload: SourceAnalysisRequest = SourceAnalysisRequest(),
    db: Session = Depends(get_db),
):
    """
    Executes reverse Lagrangian advection modeling back in time (T-2h, T-6h, T-12h, T-24h, T-48h)
    and cross-references uncertainty dispersion envelopes against bathymetric shipping corridors,
    coastal anchorages, and historical AIS vessel tracks to estimate candidate source areas.

    **Statutory Guardrail Notice**:
    All vessel and contextual attribution is strictly probabilistic and non-accusatory.
    """
    try:
        return source_analyzer_service.evaluate_source_analysis(
            db,
            incident_id,
            lookback_hours=payload.lookback_hours,
            force_recalculate=payload.force_recalculate,
            custom_drift_multiplier=payload.custom_drift_multiplier,
            persist=True,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Source analysis evaluation failed: {str(e)}",
        )


@router.get(
    "/incidents/{incident_id}/source-analysis",
    response_model=SourceAnalysisResponse,
    summary="Get probable spill source analysis dossier for an incident",
)
def get_source_analysis(
    incident_id: str,
    db: Session = Depends(get_db),
):
    """
    Retrieves the probable source region dossier for an incident, including candidate
    source areas (Regions A, B, C with confidence %), backward trajectory coordinates,
    and potentially relevant contextual vessels for statutory review.
    """
    try:
        return source_analyzer_service.get_source_analysis(db, incident_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch source analysis dossier: {str(e)}",
        )
