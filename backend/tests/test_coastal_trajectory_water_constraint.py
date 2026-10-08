"""
Targeted test suite verifying that marine oil spill trajectories
(Hindcasting & Forward Drift / What-If Simulator) remain strictly inside the water/sea area
and do not cross through land.
"""
from datetime import datetime, timezone
import pytest

from app.gis.coastal_boundary import is_water, is_land
from app.services.source_analyzer.reverse_drift_engine import ReverseDriftEngine
from app.services.simulator.engine import WhatIfSimulationEngine
from app.services.movement_prediction.physics_provider import LagrangianPhysicsProvider


def test_hindcast_trajectory_stays_in_water():
    """Verify that reverse drift hindcasting waypoints remain strictly in the sea/water area."""
    engine = ReverseDriftEngine()
    # Spill offshore Chennai
    res = engine.calculate_reverse_trajectory(
        origin_lat=13.12,
        origin_lon=80.40,
        spill_area_km2=25.0,
        detection_time=datetime.now(timezone.utc),
        wind_speed_ms=8.0,
        wind_direction_deg=225.0,  # blowing from SW -> reverse points SW towards land
        current_speed_ms=0.5,
        current_direction_deg=45.0,
        lookback_hours=24.0,
    )

    assert len(res.steps) >= 4
    for step in res.steps:
        assert is_water(step.latitude, step.longitude), (
            f"Hindcast step T-{step.hours_prior}h ({step.latitude}, {step.longitude}) must be in water!"
        )

    for coord in res.trajectory_coords:
        lon, lat = coord[0], coord[1]
        assert is_water(lat, lon), f"Hindcast trajectory coordinate [{lon}, {lat}] must be in water!"


def test_forward_drift_trajectory_stays_in_water():
    """Verify that Lagrangian forward drift forecast points remain strictly in the water."""
    provider = LagrangianPhysicsProvider()
    res = provider.predict(
        origin_lat=13.12,
        origin_lon=80.35,
        spill_area_km2=10.0,
        detection_time=datetime.now(timezone.utc),
        wind_speed_ms=10.0,
        wind_direction_deg=90.0,  # East wind pushing West towards shore
        current_speed_ms=0.6,
        current_direction_deg=270.0,  # West current pushing towards shore
        forecast_horizon_hours=24.0,
    )

    assert len(res.forecast_points) >= 4
    for fp in res.forecast_points:
        assert is_water(fp["latitude"], fp["longitude"]), (
            f"Forecast point +{fp['horizon_hours']}h ({fp['latitude']}, {fp['longitude']}) must be in water!"
        )


def test_landfall_is_detected_correctly():
    """Verify that when a slick drifts toward the coast, shoreline landfall is correctly triggered."""
    res = WhatIfSimulationEngine.execute_simulation(
        latitude=13.10,
        longitude=80.34,
        spill_size=1500.0,
        oil_type="LIGHT_CRUDE",
        wind_speed_kmh=25.0,
        wind_direction_deg=90.0,
        current_speed_knots=1.5,
        current_direction_deg=270.0,
        duration_hours=24.0,
    )

    coastal = res["coastal_impact"]
    assert coastal["shoreline_impacted"] is True, "Shoreline landfall must be detected when slick moves toward shore!"
    assert coastal["time_to_shore_hours"] is not None
    assert coastal["landfall_coordinates"] is not None
    lf_lat = coastal["landfall_coordinates"]["latitude"]
    lf_lon = coastal["landfall_coordinates"]["longitude"]
    assert is_water(lf_lat, lf_lon) or coastal["closest_distance_to_coast_km"] <= 3.0


def test_trajectory_does_not_continue_through_land():
    """Verify that simulation trajectory does NOT continue deep inland across the continent."""
    res = WhatIfSimulationEngine.execute_simulation(
        latitude=13.0827,
        longitude=80.35,
        spill_size=2000.0,
        wind_speed_kmh=30.0,
        wind_direction_deg=90.0,
        current_speed_knots=2.0,
        current_direction_deg=270.0,
        duration_hours=36.0,
    )

    wps = res["predicted_movement"]["waypoints"]
    for wp in wps:
        assert is_water(wp["latitude"], wp["longitude"]), (
            f"Waypoint at hour {wp['hour']} ({wp['latitude']}, {wp['longitude']}) must not penetrate land!"
        )


def test_case_a_open_ocean_spill():
    """Test A: Open-ocean spill. Trajectory remains in open ocean."""
    res = WhatIfSimulationEngine.execute_simulation(
        latitude=6.50,
        longitude=85.00,  # Open central Bay of Bengal
        spill_size=1000.0,
        wind_speed_kmh=15.0,
        wind_direction_deg=225.0,
        current_speed_knots=1.0,
        current_direction_deg=45.0,
        duration_hours=24.0,
    )

    wps = res["predicted_movement"]["waypoints"]
    for wp in wps:
        assert is_water(wp["latitude"], wp["longitude"])
    assert res["coastal_impact"]["shoreline_impacted"] is False


def test_case_b_spill_near_chennai_coast():
    """Test B: Spill near Chennai coast drifting offshore/parallel."""
    res = WhatIfSimulationEngine.execute_simulation(
        latitude=13.15,
        longitude=80.38,
        spill_size=1000.0,
        wind_speed_kmh=15.0,
        wind_direction_deg=225.0,  # Pushes NE into Bay of Bengal
        current_speed_knots=1.0,
        current_direction_deg=45.0,
        duration_hours=24.0,
    )

    wps = res["predicted_movement"]["waypoints"]
    for wp in wps:
        assert is_water(wp["latitude"], wp["longitude"])


def test_case_c_trajectory_moving_toward_coast_landfall():
    """Test C: Trajectory moving toward coast reaches coastline and stops without penetrating land."""
    res = WhatIfSimulationEngine.execute_simulation(
        latitude=13.0827,
        longitude=80.35,
        spill_size=2000.0,
        wind_speed_kmh=20.0,
        wind_direction_deg=90.0,
        current_speed_knots=1.2,
        current_direction_deg=270.0,
        duration_hours=24.0,
    )

    wps = res["predicted_movement"]["waypoints"]
    # All waypoints must be in water
    for wp in wps:
        assert is_water(wp["latitude"], wp["longitude"])

    # Shoreline landfall must be flagged
    assert res["coastal_impact"]["shoreline_impacted"] is True


def test_case_d_trajectory_moving_parallel_to_coast():
    """Test D: Trajectory moving parallel to coast follows drift direction without cutting land."""
    res = WhatIfSimulationEngine.execute_simulation(
        latitude=12.50,
        longitude=80.30,
        spill_size=1000.0,
        wind_speed_kmh=15.0,
        wind_direction_deg=180.0,  # Pushes North parallel to Coromandel coastline
        current_speed_knots=1.2,
        current_direction_deg=0.0,
        duration_hours=24.0,
    )

    wps = res["predicted_movement"]["waypoints"]
    for wp in wps:
        assert is_water(wp["latitude"], wp["longitude"])
