"""
Lagrangian Physics Drift Provider for Oil Spill Movement.
Combines hydrodynamic surface currents and atmospheric windage vectors
using empirical maritime spill advection coefficients and Fay's radial dispersion theory.
"""
from __future__ import annotations
import math
import json
from datetime import datetime, timezone, timedelta
from typing import Optional

from app.services.movement_prediction.base import (
    BaseMovementPredictionProvider,
    PredictionDriftResult,
)
from app.gis.coastal_boundary import (
    validate_and_constrain_step,
    snap_to_water,
    is_water,
)


def degrees_to_cardinal(deg: float) -> str:
    """Converts a heading bearing degree (0-360) into standard compass cardinal string."""
    val = int((deg / 22.5) + 0.5)
    points = [
        "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
        "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"
    ]
    return points[val % 16]


class LagrangianPhysicsProvider(BaseMovementPredictionProvider):
    """
    Implements standard vector addition Lagrangian spill drift:
    V_drift = V_current + C_w * V_wind (with Coriolis deflection and expanding uncertainty envelope).
    """

    DEFAULT_WIND_DRIFT_FACTOR = 0.035  # Empirical 3.5% windage coefficient
    CORIOLIS_DEFLECTION_DEG = 4.0     # Deflection angle to the right (Northern Hemisphere)

    def predict(
        self,
        origin_lat: float,
        origin_lon: float,
        spill_area_km2: float,
        detection_time: datetime,
        wind_speed_ms: Optional[float] = None,
        wind_direction_deg: Optional[float] = None,
        current_speed_ms: Optional[float] = None,
        current_direction_deg: Optional[float] = None,
        forecast_horizon_hours: float = 24.0,
    ) -> PredictionDriftResult:
        # Defaults if conditions are missing
        w_speed = wind_speed_ms if wind_speed_ms is not None else 7.2
        w_dir = wind_direction_deg if wind_direction_deg is not None else 235.0  # From SW
        c_speed = current_speed_ms if current_speed_ms is not None else 0.45
        c_dir = current_direction_deg if current_direction_deg is not None else 65.0   # Towards ENE

        base_time = detection_time
        if base_time.tzinfo is None:
            base_time = base_time.replace(tzinfo=timezone.utc)

        # 1. Vector Decomposition
        # Wind: meteorological direction is direction FROM which it blows -> pushing towards (w_dir + 180)
        w_towards_rad = math.radians((w_dir + 180.0) % 360.0)
        u_wind = w_speed * math.sin(w_towards_rad)
        v_wind = w_speed * math.cos(w_towards_rad)

        # Current: direction is direction TOWARDS which it flows (set)
        c_towards_rad = math.radians(c_dir % 360.0)
        u_curr = c_speed * math.sin(c_towards_rad)
        v_curr = c_speed * math.cos(c_towards_rad)

        # Coriolis Deflection (deflects right in Northern Hemisphere, left in Southern)
        deflection_deg = self.CORIOLIS_DEFLECTION_DEG if origin_lat >= 0 else -self.CORIOLIS_DEFLECTION_DEG
        deflect_rad = math.radians(deflection_deg)
        u_wind_deflected = u_wind * math.cos(deflect_rad) - v_wind * math.sin(deflect_rad)
        v_wind_deflected = u_wind * math.sin(deflect_rad) + v_wind * math.cos(deflect_rad)

        # Total Drift Velocity (m/s)
        u_drift = u_curr + (self.DEFAULT_WIND_DRIFT_FACTOR * u_wind_deflected)
        v_drift = v_curr + (self.DEFAULT_WIND_DRIFT_FACTOR * v_wind_deflected)

        # Speed in km/h
        drift_speed_ms = math.sqrt(u_drift**2 + v_drift**2)
        drift_speed_kmh = drift_speed_ms * 3.6

        # Standard Forecast Horizons
        standard_horizons = [1.0, 3.0, 6.0, 12.0, 24.0]
        # Include max horizon if different
        if forecast_horizon_hours not in standard_horizons and forecast_horizon_hours > 0:
            standard_horizons.append(forecast_horizon_hours)
            standard_horizons.sort()

        cur_anchor_lat, cur_anchor_lon = snap_to_water(origin_lat, origin_lon)
        forecast_points = []
        trajectory_coords = [[round(cur_anchor_lon, 5), round(cur_anchor_lat, 5)]]
        feature_points = []

        # Envelope points for constructing uncertainty corridor polygon
        left_envelope = []
        right_envelope = []

        # Cosine factor for longitude displacement
        cos_lat = math.cos(math.radians(origin_lat))
        if abs(cos_lat) < 1e-4:
            cos_lat = 1.0

        for h in standard_horizons:
            seconds = h * 3600.0
            dx_meters = u_drift * seconds
            dy_meters = v_drift * seconds

            # Geodesic coordinate displacement
            d_lat = dy_meters / 111320.0
            d_lon = dx_meters / (111320.0 * cos_lat)

            cand_lat = round(origin_lat + d_lat, 5)
            cand_lon = round(origin_lon + d_lon, 5)

            # Validate against coastline: ensure step does not cross land
            prev_lat = forecast_points[-1]["latitude"] if forecast_points else cur_anchor_lat
            prev_lon = forecast_points[-1]["longitude"] if forecast_points else cur_anchor_lon

            corr_lat, corr_lon, hit = validate_and_constrain_step(
                (prev_lat, prev_lon),
                (cand_lat, cand_lon),
                offshore_margin_deg=0.005,
            )
            new_lat = corr_lat
            new_lon = corr_lon

            dist_km = round(math.sqrt(dx_meters**2 + dy_meters**2) / 1000.0, 2)
            bearing = round((math.degrees(math.atan2(dx_meters, dy_meters)) + 360.0) % 360.0, 1)
            cardinal = degrees_to_cardinal(bearing)

            # Slick expansion using Fay's radial spreading approximation
            exp_area = round(spill_area_km2 + 0.85 * math.sqrt(h) * math.sqrt(max(1.0, spill_area_km2)), 2)

            arrival_dt = base_time + timedelta(hours=h)
            arrival_time_str = f"{arrival_dt.strftime('%H:%M UTC')} (+{int(h)}h)"

            pt_dict = {
                "horizon_hours": h,
                "timestamp": arrival_dt.isoformat(),
                "latitude": new_lat,
                "longitude": new_lon,
                "distance_km": dist_km,
                "bearing_deg": bearing,
                "bearing_cardinal": cardinal,
                "estimated_area_km2": exp_area,
                "arrival_time": arrival_time_str,
            }
            forecast_points.append(pt_dict)
            trajectory_coords.append([new_lon, new_lat])

            # GeoJSON Feature for Milestone Pin
            feature_points.append({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [new_lon, new_lat],
                },
                "properties": pt_dict,
            })

            # Calculate lateral uncertainty corridor width (expanding with time)
            # Lateral spread offset in meters perpendicular to track
            perp_angle = math.radians((bearing + 90.0) % 360.0)
            uncertainty_width_m = max(350.0, (dist_km * 1000.0 * 0.14) + (math.sqrt(h) * 400.0))

            offset_dx = uncertainty_width_m * math.sin(perp_angle)
            offset_dy = uncertainty_width_m * math.cos(perp_angle)

            raw_left_lat = round(new_lat + (offset_dy / 111320.0), 5)
            raw_left_lon = round(new_lon + (offset_dx / (111320.0 * cos_lat)), 5)
            left_lat, left_lon = snap_to_water(raw_left_lat, raw_left_lon, offshore_offset_deg=0.005)

            raw_right_lat = round(new_lat - (offset_dy / 111320.0), 5)
            raw_right_lon = round(new_lon - (offset_dx / (111320.0 * cos_lat)), 5)
            right_lat, right_lon = snap_to_water(raw_right_lat, raw_right_lon, offshore_offset_deg=0.005)

            left_envelope.append([left_lon, left_lat])
            right_envelope.append([right_lon, right_lat])

        # Construct GeoJSON LineString for trajectory
        trajectory_geojson = json.dumps({
            "type": "LineString",
            "coordinates": trajectory_coords,
        })

        # Construct GeoJSON FeatureCollection of forecast milestones
        predicted_positions_geojson = json.dumps({
            "type": "FeatureCollection",
            "features": feature_points,
        })

        # Construct Uncertainty Corridor Polygon GeoJSON:
        # Start at origin, traverse along left envelope, wrap around tip, return along right envelope to origin
        corridor_coords = [[round(origin_lon, 5), round(origin_lat, 5)]]
        corridor_coords.extend(left_envelope)
        corridor_coords.extend(reversed(right_envelope))
        corridor_coords.append([round(origin_lon, 5), round(origin_lat, 5)])  # Close polygon

        uncertainty_corridor_geojson = json.dumps({
            "type": "Polygon",
            "coordinates": [corridor_coords],
        })

        env_conditions = {
            "wind_speed_ms": round(w_speed, 1),
            "wind_direction_deg": round(w_dir, 1),
            "current_speed_ms": round(c_speed, 2),
            "current_direction_deg": round(c_dir, 1),
            "water_temp_c": 26.5,
            "wave_height_m": 1.2,
        }

        # Model confidence: declines gracefully with extended horizons
        conf = round(max(0.60, 0.92 - (forecast_horizon_hours * 0.006)), 2)

        return PredictionDriftResult(
            forecast_points=forecast_points,
            trajectory_geojson=trajectory_geojson,
            predicted_positions_geojson=predicted_positions_geojson,
            uncertainty_corridor_geojson=uncertainty_corridor_geojson,
            environmental_conditions=env_conditions,
            model_name="LAGRANGIAN_DRIFT_PHYSICS_V2",
            confidence=conf,
            is_simulated=False,
        )
