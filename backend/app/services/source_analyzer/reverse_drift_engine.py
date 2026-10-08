"""
Lagrangian Reverse-Drift Physics Engine for Module 18.
Inverts hydrodynamic surface currents and windage vectors to compute backwards trajectory
and expanding uncertainty dispersion envelopes back in time.
"""
from __future__ import annotations
import math
from datetime import datetime, timezone, timedelta
from typing import Optional, Any
from dataclasses import dataclass, field

from app.gis.coastal_boundary import (
    validate_and_constrain_step,
    snap_to_water,
    is_water,
)


@dataclass
class ReverseTrajectoryStep:
    hours_prior: float
    timestamp: datetime
    latitude: float
    longitude: float
    uncertainty_radius_km: float
    step_summary: str
    left_bound_lat: float
    left_bound_lon: float
    right_bound_lat: float
    right_bound_lon: float


@dataclass
class ReverseDriftResult:
    steps: list[ReverseTrajectoryStep] = field(default_factory=list)
    trajectory_coords: list[list[float]] = field(default_factory=list)  # [[lon, lat], ...]
    envelope_polygon_geojson: dict[str, Any] = field(default_factory=dict)
    drift_speed_kmh: float = 0.0
    drift_bearing_deg: float = 0.0
    backwards_bearing_deg: float = 0.0


class ReverseDriftEngine:
    """
    Computes reverse-time Lagrangian spill advection.
    V_back = -(V_current + C_w * V_wind_deflected)
    Uncertainty envelope expands back in time as diffusion/advective variance increases with lookback.
    """

    DEFAULT_WIND_FACTOR = 0.035      # 3.5% windage coefficient
    CORIOLIS_DEFLECTION_DEG = 4.0    # Northern Hemisphere deflection to the right

    def calculate_reverse_trajectory(
        self,
        origin_lat: float,
        origin_lon: float,
        spill_area_km2: float,
        detection_time: datetime,
        wind_speed_ms: Optional[float] = None,
        wind_direction_deg: Optional[float] = None,
        current_speed_ms: Optional[float] = None,
        current_direction_deg: Optional[float] = None,
        lookback_hours: float = 24.0,
        custom_drift_multiplier: Optional[float] = None,
    ) -> ReverseDriftResult:
        # Default metocean parameters if absent
        w_speed = wind_speed_ms if wind_speed_ms is not None else 6.8
        w_dir = wind_direction_deg if wind_direction_deg is not None else 230.0   # From SW
        c_speed = current_speed_ms if current_speed_ms is not None else 0.42
        c_dir = current_direction_deg if current_direction_deg is not None else 60.0    # Towards ENE

        base_time = detection_time
        if base_time.tzinfo is None:
            base_time = base_time.replace(tzinfo=timezone.utc)

        # 1. Forward Vector Decomposition
        # Wind pushes towards (w_dir + 180)
        w_towards_rad = math.radians((w_dir + 180.0) % 360.0)
        u_wind = w_speed * math.sin(w_towards_rad)
        v_wind = w_speed * math.cos(w_towards_rad)

        # Current pushes towards c_dir
        c_towards_rad = math.radians(c_dir % 360.0)
        u_curr = c_speed * math.sin(c_towards_rad)
        v_curr = c_speed * math.cos(c_towards_rad)

        # Coriolis Deflection
        deflection_deg = self.CORIOLIS_DEFLECTION_DEG if origin_lat >= 0 else -self.CORIOLIS_DEFLECTION_DEG
        deflect_rad = math.radians(deflection_deg)
        u_wind_def = u_wind * math.cos(deflect_rad) - v_wind * math.sin(deflect_rad)
        v_wind_def = u_wind * math.sin(deflect_rad) + v_wind * math.cos(deflect_rad)

        # Total Forward Drift Velocity (m/s)
        mult = custom_drift_multiplier if custom_drift_multiplier is not None else 1.0
        u_forward = (u_curr + (self.DEFAULT_WIND_FACTOR * u_wind_def)) * mult
        v_forward = (v_curr + (self.DEFAULT_WIND_FACTOR * v_wind_def)) * mult

        # 2. Reverse Drift Vector (Negative of Forward Advection)
        u_back = -u_forward
        v_back = -v_forward

        forward_speed_ms = math.sqrt(u_forward**2 + v_forward**2)
        drift_speed_kmh = forward_speed_ms * 3.6
        forward_bearing = (math.degrees(math.atan2(u_forward, v_forward)) + 360.0) % 360.0
        backward_bearing = (math.degrees(math.atan2(u_back, v_back)) + 360.0) % 360.0

        # Discrete Lookback Intervals (in hours prior to detection)
        lookback_intervals = [2.0, 4.0, 6.0, 12.0, 18.0, 24.0]
        if lookback_hours not in lookback_intervals and lookback_hours > 0:
            lookback_intervals.append(lookback_hours)
            lookback_intervals = sorted(list(set(lookback_intervals)))
        
        # Filter up to max lookback_hours
        lookback_intervals = [h for h in lookback_intervals if h <= max(24.0, lookback_hours)]

        cos_lat = math.cos(math.radians(origin_lat))
        base_radius_km = math.sqrt(max(0.1, spill_area_km2) / math.pi)

        steps: list[ReverseTrajectoryStep] = []
        cur_anchor_lat, cur_anchor_lon = snap_to_water(origin_lat, origin_lon)
        trajectory_coords: list[list[float]] = [[round(cur_anchor_lon, 5), round(cur_anchor_lat, 5)]]
        left_envelope: list[list[float]] = []
        right_envelope: list[list[float]] = []

        cur_step_lat = cur_anchor_lat
        cur_step_lon = cur_anchor_lon
        prev_h = 0.0

        for h in lookback_intervals:
            delta_h = h - prev_h
            prev_h = h
            delta_seconds = delta_h * 3600.0
            step_time = base_time - timedelta(hours=h)

            # Backwards displacement (km) for this lookback interval
            disp_x_km = (u_back * delta_seconds) / 1000.0
            disp_y_km = (v_back * delta_seconds) / 1000.0

            cand_lat = cur_step_lat + (disp_y_km / 111.32)
            cand_lon = cur_step_lon + (disp_x_km / (111.32 * max(0.1, cos_lat)))

            # Constrain step to marine water area (prevent cutting across land)
            corr_lat, corr_lon, hit = validate_and_constrain_step(
                (cur_step_lat, cur_step_lon),
                (cand_lat, cand_lon),
                offshore_margin_deg=0.005,
            )
            cur_step_lat = corr_lat
            cur_step_lon = corr_lon

            # Expanding dispersion uncertainty radius (km)
            # Dispersion grows as square-root/sublinear function of lookback time
            uncertainty_radius_km = base_radius_km + (1.2 * math.pow(h, 0.72)) + (0.15 * drift_speed_kmh * math.sqrt(h))

            # Perpendicular envelope bounds
            perp_angle_rad = math.radians((backward_bearing + 90.0) % 360.0)
            perp_dx_km = uncertainty_radius_km * math.sin(perp_angle_rad)
            perp_dy_km = uncertainty_radius_km * math.cos(perp_angle_rad)

            raw_left_lat = cur_step_lat + (perp_dy_km / 111.32)
            raw_left_lon = cur_step_lon + (perp_dx_km / (111.32 * max(0.1, cos_lat)))
            left_lat, left_lon = snap_to_water(raw_left_lat, raw_left_lon, offshore_offset_deg=0.005)

            raw_right_lat = cur_step_lat - (perp_dy_km / 111.32)
            raw_right_lon = cur_step_lon - (perp_dx_km / (111.32 * max(0.1, cos_lat)))
            right_lat, right_lon = snap_to_water(raw_right_lat, raw_right_lon, offshore_offset_deg=0.005)

            step = ReverseTrajectoryStep(
                hours_prior=h,
                timestamp=step_time,
                latitude=round(cur_step_lat, 5),
                longitude=round(cur_step_lon, 5),
                uncertainty_radius_km=round(uncertainty_radius_km, 2),
                step_summary=(
                    f"T-{h:.0f}h backward advection: estimated upstream location "
                    f"({cur_step_lat:.4f}°N, {cur_step_lon:.4f}°E), uncertainty radius ±{uncertainty_radius_km:.1f} km."
                ),
                left_bound_lat=round(left_lat, 5),
                left_bound_lon=round(left_lon, 5),
                right_bound_lat=round(right_lat, 5),
                right_bound_lon=round(right_lon, 5),
            )
            steps.append(step)
            trajectory_coords.append([round(cur_step_lon, 5), round(cur_step_lat, 5)])
            left_envelope.append([round(left_lon, 5), round(left_lat, 5)])
            right_envelope.append([round(right_lon, 5), round(right_lat, 5)])

        # Construct GeoJSON Polygon representing uncertainty cone
        polygon_ring = (
            [[round(origin_lon, 5), round(origin_lat, 5)]]
            + left_envelope
            + right_envelope[::-1]
            + [[round(origin_lon, 5), round(origin_lat, 5)]]
        )

        envelope_geojson = {
            "type": "Polygon",
            "coordinates": [polygon_ring],
        }

        return ReverseDriftResult(
            steps=steps,
            trajectory_coords=trajectory_coords,
            envelope_polygon_geojson=envelope_geojson,
            drift_speed_kmh=round(drift_speed_kmh, 2),
            drift_bearing_deg=round(forward_bearing, 1),
            backwards_bearing_deg=round(backward_bearing, 1),
        )
