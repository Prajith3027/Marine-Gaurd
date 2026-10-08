"""
Module 20 — What-If Oil Spill Simulation Engine.
Coordinates the isolated analytical pipeline:
  User Scenario
        ↓
  Movement Prediction (Lagrangian Drift + Fay Radial Spreading)
        ↓
  Ecosystem Impact (Marine Biome Sensitivity Decay)
        ↓
  Coastal Impact (Landfall Point & Shoreline ETA)
        ↓
  Risk Assessment (Explainable Multi-factor 0-100 Score)
        ↓
  Priority Ranking (Urgency Tier)
        ↓
  Economic Impact (4-Pillar Financial Loss Model)
        ↓
  Response Recommendations (Tactical Containment, Booms & Skimmers)

STRICT PRODUCTION ISOLATION:
  This engine does NOT touch or mutate real 'incidents' records.
"""
from __future__ import annotations
import math
from datetime import datetime, timezone, timedelta
from typing import Any

from app.gis.spatial_service import (
    haversine_km,
    COASTLINE_COORDINATES,
    SIMULATION_PORTS,
    SIMULATION_SHIPPING_LANES,
)
from app.gis.coastal_boundary import (
    snap_to_water,
    validate_and_constrain_step,
    INDIA_COASTLINE,
)

# Reference static ecosystem zones for spatial decay evaluation
SIMULATION_ECOSYSTEM_ZONES = [
    {"name": "Pulicat Lagoon & Mangrove Sanctuary", "type": "MANGROVE", "lat": 13.418, "lon": 80.320, "weight": 0.95},
    {"name": "Muttukadu Coastal Estuary", "type": "BREEDING_NURSERY", "lat": 12.816, "lon": 80.245, "weight": 0.85},
    {"name": "Gulf of Mannar Coral Reef Biosphere", "type": "CORAL_REEF", "lat": 9.280, "lon": 79.120, "weight": 1.00},
    {"name": "Chennai Coastal Trawling Grounds", "type": "FISHING_ZONE", "lat": 13.150, "lon": 80.380, "weight": 0.80},
    {"name": "Ennore Creek Brackish Wetlands", "type": "MANGROVE", "lat": 13.235, "lon": 80.325, "weight": 0.90},
    {"name": "Palk Bay Seagrass Beds", "type": "SEAGRASS_BED", "lat": 9.750, "lon": 79.200, "weight": 0.88},
    {"name": "Kovalam Marine Biodiversity Zone", "type": "BIODIVERSITY_ZONE", "lat": 12.788, "lon": 80.252, "weight": 0.82},
]

# Oil type physical characteristics
OIL_TYPE_PROPERTIES = {
    "LIGHT_CRUDE": {
        "label": "Light Crude Oil",
        "api_gravity": 38.0,
        "evaporation_24h_pct": 40.0,
        "fay_spreading_factor": 1.4,
        "shoreline_stickiness": 0.8,
        "dispersant_suitable": True,
        "persistence_tier": "MODERATE",
    },
    "HEAVY_CRUDE": {
        "label": "Heavy Crude Oil",
        "api_gravity": 22.0,
        "evaporation_24h_pct": 12.0,
        "fay_spreading_factor": 0.9,
        "shoreline_stickiness": 1.6,
        "dispersant_suitable": True,
        "persistence_tier": "HIGH",
    },
    "DIESEL_REFINED": {
        "label": "Refined Marine Diesel",
        "api_gravity": 45.0,
        "evaporation_24h_pct": 65.0,
        "fay_spreading_factor": 1.8,
        "shoreline_stickiness": 0.4,
        "dispersant_suitable": False,
        "persistence_tier": "LOW",
    },
    "BUNKER_FUEL": {
        "label": "Heavy Bunker C Fuel",
        "api_gravity": 12.0,
        "evaporation_24h_pct": 5.0,
        "fay_spreading_factor": 0.6,
        "shoreline_stickiness": 2.2,
        "dispersant_suitable": False,
        "persistence_tier": "EXTREME",
    },
}

MANDATORY_DISCLAIMER = (
    "PROBABILISTIC SCENARIO MODEL — DECISION SUPPORT ONLY. "
    "Predictions are mathematical estimations based on hypothetical atmospheric and "
    "hydrodynamic conditions and do not represent guaranteed real-world outcomes or production incident data."
)


class WhatIfSimulationEngine:
    """Isolated multi-domain scenario calculation engine."""

    @classmethod
    def execute_simulation(
        cls,
        latitude: float,
        longitude: float,
        spill_size: float,
        spill_size_unit: str = "BARRELS",
        oil_type: str = "LIGHT_CRUDE",
        wind_speed_kmh: float = 15.0,
        wind_direction_deg: float = 225.0,
        current_speed_knots: float = 1.5,
        current_direction_deg: float = 45.0,
        duration_hours: float = 24.0,
    ) -> dict[str, Any]:
        """
        Executes the 7-step analytical simulation pipeline and returns comprehensive
        structured output without touching the production incidents database.
        """
        oil_key = oil_type.upper()
        props = OIL_TYPE_PROPERTIES.get(oil_key, OIL_TYPE_PROPERTIES["LIGHT_CRUDE"])

        # 0. Normalization
        unit = spill_size_unit.upper()
        if unit == "TONS":
            barrels = spill_size / 0.136
        elif unit == "M3":
            barrels = spill_size * 6.2898
        else:
            barrels = spill_size
        metric_tons = barrels * 0.136

        # Step 1: Movement Prediction (Lagrangian Vector Advection + Fay Spreading)
        movement = cls._simulate_movement(
            lat=latitude,
            lon=longitude,
            barrels=barrels,
            oil_props=props,
            wind_kmh=wind_speed_kmh,
            wind_dir=wind_direction_deg,
            current_knots=current_speed_knots,
            current_dir=current_direction_deg,
            duration=duration_hours,
        )

        # Step 2: Coastal Impact Evaluation
        coastal = cls._evaluate_coastal_impact(
            waypoints=movement["waypoints"],
            duration_hours=duration_hours,
        )

        # Step 3: Marine Ecosystem Impact
        ecosystem = cls._evaluate_ecosystem_impact(
            waypoints=movement["waypoints"],
            oil_props=props,
        )

        # Step 4: Multi-Factor Risk Assessment
        risk = cls._evaluate_risk(
            barrels=barrels,
            coastal_impact=coastal,
            ecosystem_impact=ecosystem,
            oil_props=props,
            duration_hours=duration_hours,
        )

        # Step 5: Priority Ranking & Urgency Tier
        priority = cls._evaluate_priority(
            risk_score=risk["score"],
            coastal_impact=coastal,
            barrels=barrels,
        )

        # Step 6: Multi-Pillar Economic Impact Model
        economic = cls._evaluate_economic_impact(
            barrels=barrels,
            metric_tons=metric_tons,
            oil_props=props,
            movement=movement,
            coastal=coastal,
            ecosystem=ecosystem,
            duration_hours=duration_hours,
        )

        # Step 7: Tactical Response Recommendations
        recommendations = cls._evaluate_response_recommendations(
            barrels=barrels,
            oil_key=oil_key,
            oil_props=props,
            coastal=coastal,
            movement=movement,
            risk=risk,
        )

        return {
            "predicted_movement": movement,
            "risk": risk,
            "ecosystem_impact": ecosystem,
            "coastal_impact": coastal,
            "priority": priority,
            "economic_estimate": economic,
            "recommendations": recommendations,
            "disclaimer": MANDATORY_DISCLAIMER,
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Step 1: Movement & Fay Spreading
    # ─────────────────────────────────────────────────────────────────────────
    @classmethod
    def _simulate_movement(
        cls,
        lat: float,
        lon: float,
        barrels: float,
        oil_props: dict[str, Any],
        wind_kmh: float,
        wind_dir: float,
        current_knots: float,
        current_dir: float,
        duration: float,
    ) -> dict[str, Any]:
        wind_ms = wind_kmh / 3.6
        current_ms = current_knots * 0.514444

        # Current vector (heading towards current_dir)
        cur_rad = math.radians(current_dir)
        u_current = current_ms * math.sin(cur_rad)
        v_current = current_ms * math.cos(cur_rad)

        # Wind vector (meteorological: blowing FROM wind_dir -> pushes towards wind_dir + 180 + 4 deg Coriolis)
        wind_push_deg = (wind_dir + 180.0 + 4.0) % 360.0
        wind_push_rad = math.radians(wind_push_deg)
        wind_factor = 0.035
        u_wind = (wind_factor * wind_ms) * math.sin(wind_push_rad)
        v_wind = (wind_factor * wind_ms) * math.cos(wind_push_rad)

        # Combined drift vector
        u_drift = u_current + u_wind
        v_drift = v_current + v_wind
        drift_speed_ms = math.hypot(u_drift, v_drift)
        drift_heading_deg = (math.degrees(math.atan2(u_drift, v_drift)) + 360.0) % 360.0
        drift_speed_kmh = drift_speed_ms * 3.6

        # Initial slick dimensions (Fay phase 1)
        initial_area_km2 = max(0.05, 0.003 * math.pow(barrels, 0.75))

        # Hourly waypoints
        waypoints: list[dict[str, Any]] = []
        cur_lat, cur_lon = snap_to_water(lat, lon)
        step_hours = 1 if duration <= 36 else (2 if duration <= 72 else 4)
        num_steps = int(duration / step_hours) + 1

        total_distance_km = 0.0
        has_reached_shore = False
        shoreline_contact_point: tuple[float, float] | None = None

        for i in range(num_steps):
            t_hour = i * step_hours
            if t_hour > duration:
                t_hour = duration

            # Fay radial spreading formula with oil viscosity modifier
            fay_factor = oil_props.get("fay_spreading_factor", 1.0)
            area_t_km2 = initial_area_km2 * (1.0 + (fay_factor * 0.45 * math.pow(max(1.0, t_hour), 0.6)))
            uncertainty_radius_km = round(math.sqrt(area_t_km2 / math.pi) + (0.08 * t_hour), 2)

            waypoints.append({
                "step": i,
                "hour": round(t_hour, 1),
                "latitude": round(cur_lat, 5),
                "longitude": round(cur_lon, 5),
                "slick_area_km2": round(area_t_km2, 3),
                "uncertainty_radius_km": uncertainty_radius_km,
                "drift_speed_kmh": round(drift_speed_kmh, 2),
                "distance_from_origin_km": round(total_distance_km, 2),
                "is_landfall": has_reached_shore,
            })

            # Advance coordinates for next step
            if has_reached_shore:
                # Once the slick reaches the coastline, it remains at the beached landfall site
                # rather than continuing through mainland territory.
                continue

            step_disp_m = drift_speed_ms * (step_hours * 3600)
            step_disp_km = (drift_speed_kmh * step_hours)

            delta_lat = (step_disp_m * math.cos(math.radians(drift_heading_deg))) / 111320.0
            avg_lat_rad = math.radians(cur_lat)
            delta_lon = (step_disp_m * math.sin(math.radians(drift_heading_deg))) / (111320.0 * max(0.1, math.cos(avg_lat_rad)))

            cand_lat = cur_lat + delta_lat
            cand_lon = cur_lon + delta_lon

            corr_lat, corr_lon, hit_coast = validate_and_constrain_step((cur_lat, cur_lon), (cand_lat, cand_lon))

            if hit_coast:
                has_reached_shore = True
                shoreline_contact_point = (corr_lat, corr_lon)
                step_actual_dist = haversine_km(cur_lat, cur_lon, corr_lat, corr_lon)
                cur_lat = corr_lat
                cur_lon = corr_lon
                total_distance_km += step_actual_dist
            else:
                cur_lat = corr_lat
                cur_lon = corr_lon
                total_distance_km += step_disp_km

        final_area = waypoints[-1]["slick_area_km2"] if waypoints else initial_area_km2

        return {
            "drift_speed_kmh": round(drift_speed_kmh, 2),
            "drift_speed_knots": round(drift_speed_ms * 1.94384, 2),
            "drift_heading_deg": round(drift_heading_deg, 1),
            "total_drift_distance_km": round(total_distance_km, 2),
            "initial_area_km2": round(initial_area_km2, 3),
            "final_area_km2": round(final_area, 3),
            "evaporated_percentage": oil_props.get("evaporation_24h_pct", 25.0) * min(1.5, duration / 24.0),
            "waypoints": waypoints,
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Step 2: Coastal Impact Evaluation
    # ─────────────────────────────────────────────────────────────────────────
    @classmethod
    def _evaluate_coastal_impact(
        cls,
        waypoints: list[dict[str, Any]],
        duration_hours: float,
    ) -> dict[str, Any]:
        earliest_landfall_hour: float | None = None
        closest_distance_km = float("inf")
        landfall_lat: float | None = None
        landfall_lon: float | None = None

        threatened_coastal_assets: list[dict[str, Any]] = []

        for wp in waypoints:
            lat = wp["latitude"]
            lon = wp["longitude"]
            hour = wp["hour"]
            radius = wp["uncertainty_radius_km"]
            is_landfall = wp.get("is_landfall", False)

            # Test distance to coastal boundary
            for c_lat, c_lon in INDIA_COASTLINE:
                d = haversine_km(lat, lon, c_lat, c_lon)
                if d < closest_distance_km:
                    closest_distance_km = d
                    landfall_lat = c_lat
                    landfall_lon = c_lon

            # If the slick envelope reaches within 2.5 km of shore or hits coast
            if (is_landfall or closest_distance_km <= (radius + 2.5)) and earliest_landfall_hour is None:
                earliest_landfall_hour = hour
                landfall_lat = lat if is_landfall else landfall_lat
                landfall_lon = lon if is_landfall else landfall_lon

        closest_distance_km = round(closest_distance_km, 2)
        shoreline_impacted = earliest_landfall_hour is not None

        # Check nearby ports
        for port in SIMULATION_PORTS:
            p_lat = port.get("latitude", port.get("lat", 0.0))
            p_lon = port.get("longitude", port.get("lon", 0.0))
            # Check min distance from any waypoint
            min_p_dist = min(haversine_km(wp["latitude"], wp["longitude"], p_lat, p_lon) for wp in waypoints)
            if min_p_dist <= 35.0:
                threatened_coastal_assets.append({
                    "name": port["name"],
                    "type": "PORT",
                    "distance_km": round(min_p_dist, 2),
                    "sensitivity": "CRITICAL" if min_p_dist < 15.0 else "HIGH",
                    "risk_notes": f"Commercial port within {round(min_p_dist, 1)}km of predicted trajectory.",
                })

        # Add key coastal beaches if within proximity
        reference_beaches = [
            {"name": "Chennai Marina Beach", "lat": 13.050, "lon": 80.282, "type": "BEACH"},
            {"name": "Besant Nagar Beach", "lat": 12.999, "lon": 80.272, "type": "BEACH"},
            {"name": "Mahabalipuram Heritage Coast", "lat": 12.616, "lon": 80.198, "type": "HERITAGE_SHORE"},
        ]
        for b in reference_beaches:
            min_b_dist = min(haversine_km(wp["latitude"], wp["longitude"], b["lat"], b["lon"]) for wp in waypoints)
            if min_b_dist <= 25.0:
                threatened_coastal_assets.append({
                    "name": b["name"],
                    "type": b["type"],
                    "distance_km": round(min_b_dist, 2),
                    "sensitivity": "CRITICAL" if min_b_dist < 10.0 else "HIGH",
                    "risk_notes": f"Recreational/heritage shoreline within {round(min_b_dist, 1)}km.",
                })

        return {
            "shoreline_impacted": shoreline_impacted,
            "time_to_shore_hours": earliest_landfall_hour,
            "closest_distance_to_coast_km": closest_distance_km,
            "landfall_coordinates": {
                "latitude": landfall_lat,
                "longitude": landfall_lon,
            } if landfall_lat is not None else None,
            "threatened_assets_count": len(threatened_coastal_assets),
            "threatened_assets": threatened_coastal_assets,
            "shoreline_threat_summary": (
                f"Landfall estimated in {earliest_landfall_hour:.1f} hours at [{landfall_lat:.3f}, {landfall_lon:.3f}]."
                if shoreline_impacted
                else f"No shoreline contact within {duration_hours}h horizon. Closest approach is {closest_distance_km} km."
            ),
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Step 3: Marine Ecosystem Impact
    # ─────────────────────────────────────────────────────────────────────────
    @classmethod
    def _evaluate_ecosystem_impact(
        cls,
        waypoints: list[dict[str, Any]],
        oil_props: dict[str, Any],
    ) -> dict[str, Any]:
        affected_zones: list[dict[str, Any]] = []
        max_decay_score = 0.0

        for zone in SIMULATION_ECOSYSTEM_ZONES:
            z_lat = zone["lat"]
            z_lon = zone["lon"]
            z_weight = zone["weight"]

            # Compute min distance from slick center to zone
            min_dist = min(haversine_km(wp["latitude"], wp["longitude"], z_lat, z_lon) for wp in waypoints)
            # Proximity decay: 50km decay radius
            decay_factor = max(0.0, 1.0 - (min_dist / 50.0))
            zone_score = round(z_weight * decay_factor * 100.0, 1)

            if zone_score > max_decay_score:
                max_decay_score = zone_score

            if min_dist <= 40.0:
                affected_zones.append({
                    "name": zone["name"],
                    "type": zone["type"],
                    "weight": z_weight,
                    "distance_km": round(min_dist, 2),
                    "impact_score": zone_score,
                    "vulnerability_tier": "CRITICAL" if zone_score >= 70.0 else ("HIGH" if zone_score >= 40.0 else "MODERATE"),
                })

        affected_zones.sort(key=lambda x: x["impact_score"], reverse=True)

        return {
            "vulnerability_score": round(max_decay_score, 1),
            "vulnerable_biomes_count": len(affected_zones),
            "zones": affected_zones,
            "most_vulnerable_zone": affected_zones[0] if affected_zones else None,
            "ecological_summary": (
                f"High ecological exposure to {affected_zones[0]['name']} ({affected_zones[0]['type']})."
                if affected_zones and max_decay_score >= 50.0
                else "Low to moderate direct marine biodiversity impact detected along trajectory."
            ),
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Step 4: Multi-Factor Risk Assessment
    # ─────────────────────────────────────────────────────────────────────────
    @classmethod
    def _evaluate_risk(
        cls,
        barrels: float,
        coastal_impact: dict[str, Any],
        ecosystem_impact: dict[str, Any],
        oil_props: dict[str, Any],
        duration_hours: float,
    ) -> dict[str, Any]:
        # 1. Spill volume score (max 25)
        # 100 bbl -> 6, 500 bbl -> 13, 2000 bbl -> 19, 10000+ bbl -> 25
        vol_score = min(25.0, round(5.0 * math.log10(max(10.0, barrels)), 1))

        # 2. Coastal proximity score (max 25)
        closest_km = coastal_impact["closest_distance_to_coast_km"]
        time_shore = coastal_impact["time_to_shore_hours"]
        if coastal_impact["shoreline_impacted"] and time_shore is not None:
            if time_shore <= 6.0:
                coast_score = 25.0
            elif time_shore <= 12.0:
                coast_score = 22.0
            elif time_shore <= 24.0:
                coast_score = 18.0
            else:
                coast_score = 15.0
        else:
            coast_score = max(2.0, round(25.0 * math.exp(-closest_km / 35.0), 1))

        # 3. Environmental sensitivity score (max 20)
        eco_raw = ecosystem_impact["vulnerability_score"]  # 0-100
        eco_score = round(min(20.0, (eco_raw / 100.0) * 20.0), 1)

        # 4. Oil Persistence & Toxicity hazard (max 15)
        persistence_tier = oil_props.get("persistence_tier", "MODERATE")
        stickiness = oil_props.get("shoreline_stickiness", 1.0)
        persist_score = min(15.0, round(stickiness * 6.5, 1))

        # 5. Spreading / Horizon expansion factor (max 15)
        spread_score = min(15.0, round(5.0 + (duration_hours / 24.0) * 3.5, 1))

        total_risk = round(min(100.0, vol_score + coast_score + eco_score + persist_score + spread_score), 1)

        if total_risk >= 75.0:
            level = "CRITICAL"
        elif total_risk >= 50.0:
            level = "HIGH"
        elif total_risk >= 25.0:
            level = "MODERATE"
        else:
            level = "LOW"

        return {
            "score": total_risk,
            "level": level,
            "factors": {
                "spill_volume_score": vol_score,
                "coastal_proximity_score": coast_score,
                "ecosystem_sensitivity_score": eco_score,
                "persistence_hazard_score": persist_score,
                "spread_expansion_score": spread_score,
            },
            "explanation": (
                f"Overall simulated risk is {level} ({total_risk}/100) driven by "
                f"volume factor ({vol_score}/25) and coastal proximity factor ({coast_score}/25)."
            ),
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Step 5: Priority Assessment
    # ─────────────────────────────────────────────────────────────────────────
    @classmethod
    def _evaluate_priority(
        cls,
        risk_score: float,
        coastal_impact: dict[str, Any],
        barrels: float,
    ) -> dict[str, Any]:
        time_to_shore = coastal_impact.get("time_to_shore_hours")
        shoreline_impacted = coastal_impact.get("shoreline_impacted", False)

        # Urgency tier
        if (shoreline_impacted and time_to_shore is not None and time_to_shore <= 6.0) or risk_score >= 80.0:
            urgency = "IMMEDIATE"
            priority_score = min(100.0, round(risk_score * 1.05, 1))
            action = "Activate emergency shoreline booms and rapid containment within 60 minutes."
        elif (shoreline_impacted and time_to_shore is not None and time_to_shore <= 24.0) or risk_score >= 55.0:
            urgency = "HIGH"
            priority_score = round(risk_score * 0.95, 1)
            action = "Dispatch offshore response vessels and prepare defensive deflection booming."
        elif risk_score >= 35.0:
            urgency = "ELEVATED"
            priority_score = round(risk_score * 0.85, 1)
            action = "Continuous satellite/radar tracking and alert regional port authorities."
        else:
            urgency = "ROUTINE"
            priority_score = round(risk_score * 0.75, 1)
            action = "Passive tracking and scheduled surveillance flights."

        return {
            "priority_score": priority_score,
            "urgency_tier": urgency,
            "recommended_dispatch_action": action,
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Step 6: Multi-Pillar Economic Impact Model
    # ─────────────────────────────────────────────────────────────────────────
    @classmethod
    def _evaluate_economic_impact(
        cls,
        barrels: float,
        metric_tons: float,
        oil_props: dict[str, Any],
        movement: dict[str, Any],
        coastal: dict[str, Any],
        ecosystem: dict[str, Any],
        duration_hours: float,
    ) -> dict[str, Any]:
        stickiness = oil_props.get("shoreline_stickiness", 1.0)
        final_area_km2 = movement.get("final_area_km2", 1.0)
        shoreline_impacted = coastal.get("shoreline_impacted", False)

        # Pillar 1: Commercial Fisheries Loss
        # Active fishing area disruption ($12,000 / km2 / day)
        fishing_zones = [z for z in ecosystem.get("zones", []) if z.get("type") == "FISHING_ZONE"]
        fisheries_exposure_factor = 1.5 if fishing_zones else 0.6
        fisheries_loss = round(final_area_km2 * 12000.0 * (duration_hours / 24.0) * fisheries_exposure_factor, 0)

        # Pillar 2: Commercial Port & Shipping Delay Cost
        port_assets = [a for a in coastal.get("threatened_assets", []) if a.get("type") == "PORT"]
        if port_assets:
            # Demurrage and port channel security restrictions ($45,000 / day)
            port_shipping_loss = round(45000.0 * max(1.0, duration_hours / 24.0) * len(port_assets), 0)
        elif coastal.get("closest_distance_to_coast_km", 100.0) < 20.0:
            port_shipping_loss = 25000.0
        else:
            port_shipping_loss = 5000.0

        # Pillar 3: Shoreline Cleanup & Remediation Cost
        if shoreline_impacted:
            # Estimate impacted shoreline length (approx 1.2 km per km2 of slick landfall)
            impacted_coast_km = max(1.5, round(math.sqrt(final_area_km2) * 1.8, 1))
            cost_per_km = 160000.0 * stickiness
            shoreline_cleanup_loss = round(impacted_coast_km * cost_per_km, 0)
        else:
            impacted_coast_km = 0.0
            shoreline_cleanup_loss = 15000.0  # Shoreline patrol and precautionary monitoring

        # Pillar 4: Tactical Containment & Operational Recovery Opex
        # Boom deployment + vessel charter + skimmer hourly rates
        days = max(1.0, duration_hours / 24.0)
        containment_opex = round((35000.0 * days) + (barrels * 18.0), 0)

        total_expected_usd = round(fisheries_loss + port_shipping_loss + shoreline_cleanup_loss + containment_opex, 0)
        low_estimate_usd = round(total_expected_usd * 0.75, 0)
        high_estimate_usd = round(total_expected_usd * 1.45, 0)

        return {
            "total_expected_usd": total_expected_usd,
            "low_estimate_usd": low_estimate_usd,
            "high_estimate_usd": high_estimate_usd,
            "currency": "USD",
            "pillars": {
                "commercial_fisheries_usd": fisheries_loss,
                "port_shipping_delays_usd": port_shipping_loss,
                "shoreline_cleanup_remediation_usd": shoreline_cleanup_loss,
                "containment_operational_opex_usd": containment_opex,
            },
            "impacted_shoreline_length_km": impacted_coast_km,
            "economic_notes": (
                f"Projected financial exposure range: ${low_estimate_usd:,.0f} — ${high_estimate_usd:,.0f} USD. "
                f"Largest cost driver: {'Shoreline cleanup' if shoreline_impacted else 'Fisheries and maritime operations'}."
            ),
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Step 7: Response Recommendations
    # ─────────────────────────────────────────────────────────────────────────
    @classmethod
    def _evaluate_response_recommendations(
        cls,
        barrels: float,
        oil_key: str,
        oil_props: dict[str, Any],
        coastal: dict[str, Any],
        movement: dict[str, Any],
        risk: dict[str, Any],
    ) -> dict[str, Any]:
        shoreline_impacted = coastal.get("shoreline_impacted", False)
        closest_km = coastal.get("closest_distance_to_coast_km", 50.0)
        final_area_km2 = movement.get("final_area_km2", 1.0)

        # Tier classification
        if barrels >= 5000.0 or (shoreline_impacted and barrels >= 1000.0):
            response_tier = "TIER_3_MAJOR"
            strategy = "MULTI_AGENCY_NATIONAL_RESPONSE"
        elif barrels >= 500.0 or shoreline_impacted:
            response_tier = "TIER_2_MEDIUM"
            strategy = "REGIONAL_MARITIME_CONTAINMENT"
        else:
            response_tier = "TIER_1_SMALL"
            strategy = "LOCAL_HARBOR_DEFENSE"

        # Containment boom length requirement (perimeter protection)
        perimeter_meters = 2.0 * math.sqrt(final_area_km2 * 1e6) * 0.7
        containment_boom_meters = min(15000.0, max(500.0, round(perimeter_meters / 100.0) * 100.0))

        # Skimmer capacity (m3 / day to clear volume within 3 days)
        oil_volume_m3 = barrels * 0.159
        daily_skimmer_capacity_m3 = max(50.0, round((oil_volume_m3 * 0.8) / 3.0, 1))

        # Chemical dispersant viability check
        dispersant_allowed = (
            oil_props.get("dispersant_suitable", False)
            and closest_km >= 5.0
            and oil_key not in ["DIESEL_REFINED", "BUNKER_FUEL"]
        )
        if dispersant_allowed:
            dispersant_note = "Chemical dispersants viable offshore (>5km from coastline). Authorize aerial spray."
        elif oil_key == "DIESEL_REFINED":
            dispersant_note = "Dispersants NOT recommended for diesel/refined fuels due to rapid natural evaporation and vapor ignition risk."
        elif closest_km < 5.0:
            dispersant_note = "Dispersants PROHIBITED within 5km coastal boundary to protect nearshore benthic biomes."
        else:
            dispersant_note = "Dispersant effectiveness restricted for this high-viscosity fuel grade. Use mechanical recovery."

        # Action checklist
        actions = [
            {
                "priority": 1,
                "title": "Deploy Containment Booms",
                "detail": f"Deploy approximately {containment_boom_meters:,.0f} meters of offshore curtain booms around primary slick heading.",
            },
            {
                "priority": 2,
                "title": "Mobilize Mechanical Skimmers",
                "detail": f"Require minimum skimmer fleet capacity of {daily_skimmer_capacity_m3:,.1f} m³/day (weir or brush skimmers).",
            },
            {
                "priority": 3,
                "title": "Shoreline Protection Booming",
                "detail": (
                    "Anchor exclusion booms at vulnerable river mouths and harbor entries before landfall."
                    if shoreline_impacted
                    else "Keep coastal response teams on standby; maintain 12-hour surveillance updates."
                ),
            },
            {
                "priority": 4,
                "title": "Dispersant Application Status",
                "detail": dispersant_note,
            },
        ]

        return {
            "response_tier": response_tier,
            "overall_strategy": strategy,
            "containment_boom_meters": containment_boom_meters,
            "daily_skimmer_capacity_m3": daily_skimmer_capacity_m3,
            "dispersant_suitable": dispersant_allowed,
            "dispersant_guidance": dispersant_note,
            "tactical_actions": actions,
        }
