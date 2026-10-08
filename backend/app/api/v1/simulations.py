"""
Module 20 — What-If Oil Spill Simulator REST API Endpoints.
Provides scenario creation, execution, retrieval, listing, and scenario comparison.
Strictly isolated from the real incidents table.
"""
from __future__ import annotations
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database.session import get_db
from app.models.simulation import SimulationRun, SimulationInput, SimulationOutput
from app.schemas.simulation import (
    SimulationCreateRequest,
    SimulationRunResponse,
    SimulationRunListItem,
    SimulationOutputResponse,
    SimulationCompareItem,
    SimulationCompareResponse,
)
from app.services.simulator.engine import WhatIfSimulationEngine, MANDATORY_DISCLAIMER
from app.gis.coastal_boundary import is_land, is_water, snap_to_water

logger = logging.getLogger("simulator")

router = APIRouter(prefix="/simulations", tags=["What-If Simulator"])


@router.get(
    "/validate-location",
    summary="Check if a candidate coordinate is in marine water area",
)
def validate_location(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
):
    """Validates if a coordinate is in ocean/sea water and returns nearest water coordinate if not."""
    water = is_water(lat, lon)
    snapped_lat, snapped_lon = snap_to_water(lat, lon) if not water else (lat, lon)
    return {
        "is_water": water,
        "is_land": not water,
        "latitude": lat,
        "longitude": lon,
        "snapped_latitude": snapped_lat,
        "snapped_longitude": snapped_lon,
    }


@router.post(
    "",
    response_model=SimulationRunResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a hypothetical oil spill scenario",
)
def create_simulation(
    payload: SimulationCreateRequest,
    db: Session = Depends(get_db),
):
    """
    Creates a separate simulation record with specified inputs and optionally runs
    the multi-domain consequences simulation pipeline immediately.
    Guaranteed NOT to modify production incidents.
    """
    inp = payload.inputs
    # Constrain origin coordinate to ocean/sea water
    if is_land(inp.latitude, inp.longitude):
        safe_lat, safe_lon = snap_to_water(inp.latitude, inp.longitude)
        logger.info(f"Origin ({inp.latitude}, {inp.longitude}) is on land; snapped to marine water ({safe_lat}, {safe_lon})")
        inp.latitude = safe_lat
        inp.longitude = safe_lon

    # Unit normalization to barrels
    unit = inp.spill_size_unit.upper()
    if unit == "TONS":
        barrels = inp.spill_size / 0.136
    elif unit == "M3":
        barrels = inp.spill_size * 6.2898
    else:
        barrels = inp.spill_size

    # 1. Create SimulationRun
    run_name = payload.name or f"Scenario — {inp.spill_size:,.0f} {inp.spill_size_unit} {inp.oil_type.replace('_', ' ').title()}"
    run = SimulationRun(
        name=run_name,
        status="RUNNING" if payload.auto_run else "CREATED",
        notes=payload.notes,
    )
    db.add(run)
    db.flush()

    # 2. Create SimulationInput
    sim_input = SimulationInput(
        simulation_id=run.id,
        latitude=inp.latitude,
        longitude=inp.longitude,
        spill_size=inp.spill_size,
        spill_size_unit=unit,
        spill_size_barrels=round(barrels, 2),
        oil_type=inp.oil_type,
        wind_speed_kmh=inp.wind_speed_kmh,
        wind_direction_deg=inp.wind_direction_deg,
        current_speed_knots=inp.current_speed_knots,
        current_direction_deg=inp.current_direction_deg,
        duration_hours=inp.duration_hours,
    )
    db.add(sim_input)

    # 3. If auto_run, execute simulation pipeline
    if payload.auto_run:
        try:
            results = WhatIfSimulationEngine.execute_simulation(
                latitude=inp.latitude,
                longitude=inp.longitude,
                spill_size=inp.spill_size,
                spill_size_unit=unit,
                oil_type=inp.oil_type,
                wind_speed_kmh=inp.wind_speed_kmh,
                wind_direction_deg=inp.wind_direction_deg,
                current_speed_knots=inp.current_speed_knots,
                current_direction_deg=inp.current_direction_deg,
                duration_hours=inp.duration_hours,
            )

            sim_output = SimulationOutput(
                simulation_id=run.id,
                predicted_movement=results["predicted_movement"],
                risk=results["risk"],
                ecosystem_impact=results["ecosystem_impact"],
                coastal_impact=results["coastal_impact"],
                priority=results["priority"],
                economic_estimate=results["economic_estimate"],
                recommendations=results["recommendations"],
                disclaimer=results["disclaimer"],
            )
            db.add(sim_output)
            run.status = "COMPLETED"
        except Exception as e:
            logger.exception(f"Simulation run {run.id} execution failed: {e}")
            run.status = "FAILED"

    db.commit()
    db.refresh(run)
    return run


@router.get(
    "",
    response_model=list[SimulationRunListItem],
    summary="List all hypothetical oil spill scenarios",
)
def list_simulations(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Lists saved simulation runs with summary metrics."""
    runs = (
        db.query(SimulationRun)
        .order_by(desc(SimulationRun.created_at))
        .offset(skip)
        .limit(limit)
        .all()
    )

    items: list[SimulationRunListItem] = []
    for r in runs:
        inp = r.inputs
        out = r.outputs

        risk_score = None
        risk_level = None
        time_to_shore = None
        total_economic = None

        if out:
            risk_score = out.risk.get("score") if isinstance(out.risk, dict) else None
            risk_level = out.risk.get("level") if isinstance(out.risk, dict) else None
            time_to_shore = out.coastal_impact.get("time_to_shore_hours") if isinstance(out.coastal_impact, dict) else None
            total_economic = out.economic_estimate.get("total_expected_usd") if isinstance(out.economic_estimate, dict) else None

        items.append(
            SimulationRunListItem(
                id=r.id,
                name=r.name,
                status=r.status,
                spill_size_barrels=inp.spill_size_barrels if inp else None,
                oil_type=inp.oil_type if inp else None,
                duration_hours=inp.duration_hours if inp else None,
                risk_score=risk_score,
                risk_level=risk_level,
                time_to_shore_hours=time_to_shore,
                total_economic_usd=total_economic,
                created_at=r.created_at,
            )
        )
    return items


@router.get(
    "/compare",
    response_model=SimulationCompareResponse,
    summary="Compare two or more hypothetical simulation scenarios",
)
def compare_simulations(
    ids: str = Query(..., description="Comma-separated simulation IDs to compare (e.g. id1,id2)"),
    db: Session = Depends(get_db),
):
    """Returns side-by-side metrics across specified simulation runs."""
    id_list = [i.strip() for i in ids.split(",") if i.strip()]
    if len(id_list) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least 2 comma-separated simulation IDs must be provided for comparison.",
        )

    runs = db.query(SimulationRun).filter(SimulationRun.id.in_(id_list)).all()
    if len(runs) < len(id_list):
        found_ids = {r.id for r in runs}
        missing = set(id_list) - found_ids
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Simulation IDs not found: {list(missing)}",
        )

    scenarios: list[SimulationCompareItem] = []
    for r in runs:
        inp = r.inputs
        out = r.outputs
        if not inp or not out:
            continue

        risk_score = out.risk.get("score", 0.0) if isinstance(out.risk, dict) else 0.0
        risk_level = out.risk.get("level", "UNKNOWN") if isinstance(out.risk, dict) else "UNKNOWN"
        time_shore = out.coastal_impact.get("time_to_shore_hours") if isinstance(out.coastal_impact, dict) else None
        impacted = out.coastal_impact.get("shoreline_impacted", False) if isinstance(out.coastal_impact, dict) else False
        eco_score = out.ecosystem_impact.get("vulnerability_score", 0.0) if isinstance(out.ecosystem_impact, dict) else 0.0
        economic = out.economic_estimate.get("total_expected_usd", 0.0) if isinstance(out.economic_estimate, dict) else 0.0
        tier = out.recommendations.get("response_tier", "TIER_1_SMALL") if isinstance(out.recommendations, dict) else "TIER_1_SMALL"
        booms = out.recommendations.get("containment_boom_meters", 0.0) if isinstance(out.recommendations, dict) else 0.0

        scenarios.append(
            SimulationCompareItem(
                id=r.id,
                name=r.name,
                oil_type=inp.oil_type,
                spill_size_barrels=inp.spill_size_barrels,
                duration_hours=inp.duration_hours,
                risk_score=risk_score,
                risk_level=risk_level,
                time_to_shore_hours=time_shore,
                shoreline_impacted=impacted,
                ecosystem_vulnerability_score=eco_score,
                total_economic_usd=economic,
                response_tier=tier,
                containment_boom_meters=booms,
                created_at=r.created_at,
            )
        )

    # Compute delta summary between the first two scenarios
    delta_summary: dict[str, Any] = {}
    if len(scenarios) >= 2:
        s1 = scenarios[0]
        s2 = scenarios[1]
        delta_summary = {
            "scenario_1": s1.name,
            "scenario_2": s2.name,
            "risk_score_diff": round(s2.risk_score - s1.risk_score, 1),
            "economic_usd_diff": round(s2.total_economic_usd - s1.total_economic_usd, 0),
            "spill_volume_ratio": round(s2.spill_size_barrels / max(1.0, s1.spill_size_barrels), 2),
            "booms_meters_diff": round(s2.containment_boom_meters - s1.containment_boom_meters, 0),
        }

    return SimulationCompareResponse(
        scenarios=scenarios,
        delta_summary=delta_summary,
        disclaimer=MANDATORY_DISCLAIMER,
    )


@router.get(
    "/{id}",
    response_model=SimulationRunResponse,
    summary="Get detailed hypothetical simulation run by ID",
)
def get_simulation(id: str, db: Session = Depends(get_db)):
    """Fetches a specific simulation run with inputs and calculated outputs."""
    run = db.query(SimulationRun).filter(SimulationRun.id == id).first()
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Simulation with ID '{id}' not found.",
        )

    # Check if cached outputs contain obsolete land-crossing waypoints or invalid coastal distances
    if run.outputs and run.inputs:
        wps = run.outputs.predicted_movement.get("waypoints", []) if isinstance(run.outputs.predicted_movement, dict) else []
        has_land_wps = any(is_land(w.get("latitude", 0), w.get("longitude", 0)) for w in wps)
        coastal_data = run.outputs.coastal_impact if isinstance(run.outputs.coastal_impact, dict) else {}
        invalid_coast_dist = coastal_data.get("closest_distance_to_coast_km", 0) > 1000.0

        if has_land_wps or invalid_coast_dist:
            logger.info(f"Auto-refreshing simulation {id} with water-constrained geometry")
            try:
                # Ensure input origin is also offshore
                inp_lat = run.inputs.latitude
                inp_lon = run.inputs.longitude
                if is_land(inp_lat, inp_lon):
                    inp_lat, inp_lon = snap_to_water(inp_lat, inp_lon)
                    run.inputs.latitude = inp_lat
                    run.inputs.longitude = inp_lon

                results = WhatIfSimulationEngine.execute_simulation(
                    latitude=inp_lat,
                    longitude=inp_lon,
                    spill_size=run.inputs.spill_size,
                    spill_size_unit=run.inputs.spill_size_unit,
                    oil_type=run.inputs.oil_type,
                    wind_speed_kmh=run.inputs.wind_speed_kmh,
                    wind_direction_deg=run.inputs.wind_direction_deg,
                    current_speed_knots=run.inputs.current_speed_knots,
                    current_direction_deg=run.inputs.current_direction_deg,
                    duration_hours=run.inputs.duration_hours,
                )
                run.outputs.predicted_movement = results["predicted_movement"]
                run.outputs.risk = results["risk"]
                run.outputs.ecosystem_impact = results["ecosystem_impact"]
                run.outputs.coastal_impact = results["coastal_impact"]
                run.outputs.priority = results["priority"]
                run.outputs.economic_estimate = results["economic_estimate"]
                run.outputs.recommendations = results["recommendations"]
                run.outputs.disclaimer = results["disclaimer"]
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(run.outputs, "predicted_movement")
                flag_modified(run.outputs, "coastal_impact")
                db.commit()
                db.refresh(run)
            except Exception as e:
                logger.warning(f"Failed to auto-refresh simulation {id}: {e}")

    return run


@router.post(
    "/{id}/run",
    response_model=SimulationRunResponse,
    summary="Execute or re-calculate simulation consequences",
)
def run_simulation(id: str, db: Session = Depends(get_db)):
    """
    Executes or re-calculates the multi-domain consequences for an existing scenario
    without modifying real incidents.
    """
    run = db.query(SimulationRun).filter(SimulationRun.id == id).first()
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Simulation with ID '{id}' not found.",
        )

    inp = run.inputs
    if not inp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Simulation run has no input parameters configured.",
        )

    run.status = "RUNNING"
    db.commit()

    try:
        results = WhatIfSimulationEngine.execute_simulation(
            latitude=inp.latitude,
            longitude=inp.longitude,
            spill_size=inp.spill_size,
            spill_size_unit=inp.spill_size_unit,
            oil_type=inp.oil_type,
            wind_speed_kmh=inp.wind_speed_kmh,
            wind_direction_deg=inp.wind_direction_deg,
            current_speed_knots=inp.current_speed_knots,
            current_direction_deg=inp.current_direction_deg,
            duration_hours=inp.duration_hours,
        )

        # Update or create output
        if run.outputs:
            run.outputs.predicted_movement = results["predicted_movement"]
            run.outputs.risk = results["risk"]
            run.outputs.ecosystem_impact = results["ecosystem_impact"]
            run.outputs.coastal_impact = results["coastal_impact"]
            run.outputs.priority = results["priority"]
            run.outputs.economic_estimate = results["economic_estimate"]
            run.outputs.recommendations = results["recommendations"]
            run.outputs.disclaimer = results["disclaimer"]
        else:
            sim_output = SimulationOutput(
                simulation_id=run.id,
                predicted_movement=results["predicted_movement"],
                risk=results["risk"],
                ecosystem_impact=results["ecosystem_impact"],
                coastal_impact=results["coastal_impact"],
                priority=results["priority"],
                economic_estimate=results["economic_estimate"],
                recommendations=results["recommendations"],
                disclaimer=results["disclaimer"],
            )
            db.add(sim_output)

        run.status = "COMPLETED"
        db.commit()
        db.refresh(run)
        return run

    except Exception as e:
        logger.exception(f"Error executing simulation {id}: {e}")
        run.status = "FAILED"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Simulation calculation error: {str(e)}",
        )


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a hypothetical simulation run",
)
def delete_simulation(id: str, db: Session = Depends(get_db)):
    """Deletes a simulation run, cascades to inputs and outputs."""
    run = db.query(SimulationRun).filter(SimulationRun.id == id).first()
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Simulation with ID '{id}' not found.",
        )
    db.delete(run)
    db.commit()
    return None
