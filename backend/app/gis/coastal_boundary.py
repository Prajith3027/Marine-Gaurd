"""
Coastal Boundary & Marine Trajectory Geometry Service.
Provides pure-Python point-in-water validation, coastline segment intersection,
and trajectory waypoint correction to ensure marine oil spill trajectories
remain strictly within the ocean/sea area.
"""
from __future__ import annotations

import math
from typing import Optional, Any

# ─────────────────────────────────────────────────────────────────────────────
# COASTAL PERIMETER & LANDMASS POLYGONS
# High-resolution coastal baseline enclosing peninsular India and Sri Lanka.
# Coordinates are in (latitude, longitude) decimal degrees.
# ─────────────────────────────────────────────────────────────────────────────

INDIA_COASTLINE: list[tuple[float, float]] = [
    # Gujarat & Gulf of Kutch
    (23.700, 68.500),
    (23.000, 69.500),
    (22.833, 69.355),  # Mandvi
    (23.013, 70.220),  # Kandla Port
    (22.800, 70.200),
    (22.300, 69.000),  # Dwarka Outer
    (21.600, 69.600),  # Porbandar
    (21.000, 70.000),  # Veraval
    (20.700, 70.900),  # Diu
    (20.800, 71.500),
    (21.200, 72.800),  # Surat
    (20.500, 72.800),  # Daman
    # Maharashtra & Konkan Coast
    (19.800, 72.700),
    (19.135, 72.812),  # Versova / Juhu
    (19.098, 72.826),  # Juhu Beach
    (18.949, 72.951),  # JNPT Mumbai
    (18.900, 72.800),  # Colaba / Mumbai Port
    (18.300, 72.900),  # Alibaug
    (17.500, 73.200),  # Ratnagiri
    (16.050, 73.460),  # Malvan Marine Sanctuary
    (15.544, 73.755),  # Calangute / Goa
    (15.416, 73.803),  # Mormugao Port
    # Karnataka & Kerala (Malabar Coast)
    (14.800, 74.100),  # Karwar
    (14.200, 74.500),  # Honnavar
    (13.300, 74.700),  # Malpe
    (12.800, 74.800),  # Mangalore
    (11.900, 75.300),  # Kannur
    (11.250, 75.770),  # Kozhikode
    (10.500, 76.000),  # Ponnani
    (9.967, 76.271),   # Cochin Port
    (9.500, 76.300),   # Alappuzha
    (8.880, 76.580),   # Kollam
    (8.402, 76.978),   # Kovalam Kerala
    (8.172, 77.712),   # Kudankulam
    (8.080, 77.550),   # Kanyakumari (Cape Comorin)
    # Tamil Nadu (Coromandel Coast, Gulf of Mannar & Palk Bay)
    (8.754, 78.196),   # Tuticorin Port
    (9.050, 78.800),   # Gulf of Mannar Reserve
    (9.280, 79.120),   # Gulf of Mannar Coral Reef
    (9.280, 79.310),   # Mandapam / Rameswaram
    (9.500, 79.250),   # Palk Bay
    (9.750, 79.200),   # Palk Bay Seagrass Beds
    (10.300, 79.850),  # Point Calimere
    (10.770, 79.850),  # Nagapattinam
    (11.150, 79.850),  # Karaikal
    (11.750, 79.770),  # Cuddalore
    (11.930, 79.830),  # Pondicherry
    (12.616, 80.198),  # Mahabalipuram
    (12.788, 80.252),  # Kovalam Marine Biodiversity
    (12.816, 80.245),  # Muttukadu
    (12.999, 80.272),  # Besant Nagar Beach
    (13.050, 80.282),  # Chennai Marina Beach
    (13.084, 80.297),  # Chennai Port
    (13.125, 80.298),  # Kasimedu Fishermen Wharf
    (13.235, 80.325),  # Ennore Creek
    (13.250, 80.339),  # Kamarajar Port
    (13.418, 80.320),  # Pulicat Lagoon
    # Andhra Pradesh
    (14.250, 80.150),  # Krishnapatnam Port
    (15.000, 80.200),  # Ongole
    (15.800, 80.400),  # Bapatla
    (16.150, 81.150),  # Machilipatnam
    (16.800, 82.350),  # Kakinada
    (17.690, 83.298),  # Visakhapatnam Port
    (18.300, 84.000),  # Srikakulam
    # Odisha & West Bengal
    (19.200, 84.900),  # Gopalpur
    (19.720, 85.300),  # Chilika Lake
    (19.798, 85.825),  # Puri Golden Beach
    (20.264, 86.671),  # Paradip Port
    (20.800, 86.900),  # Dhamra
    (21.500, 87.200),  # Chandipur
    (21.620, 87.520),  # Digha
    (21.800, 88.000),  # Haldia / Sagar Island
    (21.600, 88.250),  # Sandheads
    (21.940, 89.180),  # Sundarbans
    (22.000, 89.000),  # Bengal Delta
]

# Closed mainland polygon by bounding across northern landmass
INDIA_LAND_POLYGON: list[tuple[float, float]] = (
    INDIA_COASTLINE
    + [
        (26.000, 89.000),
        (28.000, 85.000),
        (30.000, 78.000),
        (28.000, 72.000),
        (25.000, 68.500),
        (23.700, 68.500),
    ]
)

# Sri Lanka island polygon
SRI_LANKA_POLYGON: list[tuple[float, float]] = [
    (9.800, 79.800),
    (9.800, 80.300),
    (8.600, 81.300),
    (7.300, 81.900),
    (6.000, 81.300),
    (5.900, 80.500),
    (6.900, 79.800),
    (8.000, 79.700),
]


def point_in_polygon(lat: float, lon: float, polygon: list[tuple[float, float]]) -> bool:
    """Standard ray-casting algorithm to test if (lat, lon) is inside a polygon."""
    n = len(polygon)
    inside = False
    p1_lat, p1_lon = polygon[0]
    for i in range(1, n + 1):
        p2_lat, p2_lon = polygon[i % n]
        if min(p1_lat, p2_lat) < lat <= max(p1_lat, p2_lat):
            if lon <= max(p1_lon, p2_lon):
                if p1_lat != p2_lat:
                    x_inters = (lat - p1_lat) * (p2_lon - p1_lon) / (p2_lat - p1_lat) + p1_lon
                    if p1_lon == p2_lon or lon <= x_inters:
                        inside = not inside
        p1_lat, p1_lon = p2_lat, p2_lon
    return inside


def is_land(lat: float, lon: float) -> bool:
    """Returns True if the coordinate is located on mainland India or Sri Lanka."""
    return point_in_polygon(lat, lon, INDIA_LAND_POLYGON) or point_in_polygon(lat, lon, SRI_LANKA_POLYGON)


def is_water(lat: float, lon: float) -> bool:
    """Returns True if the coordinate is located in the ocean/sea (not on land)."""
    return not is_land(lat, lon)


def segment_intersection(
    p1: tuple[float, float],
    p2: tuple[float, float],
    c1: tuple[float, float],
    c2: tuple[float, float],
) -> Optional[tuple[float, float, float]]:
    """
    Computes 2D segment intersection between trajectory leg (p1 -> p2)
    and coastline segment (c1 -> c2).
    Returns (hit_lat, hit_lon, fraction_t_along_trajectory) or None.
    """
    x1, y1 = p1[1], p1[0]  # lon, lat
    x2, y2 = p2[1], p2[0]
    x3, y3 = c1[1], c1[0]
    x4, y4 = c2[1], c2[0]

    denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(denom) < 1e-12:
        return None

    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
    u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom

    if 0.0 <= t <= 1.0 and 0.0 <= u <= 1.0:
        hit_lon = x1 + t * (x2 - x1)
        hit_lat = y1 + t * (y2 - y1)
        return (hit_lat, hit_lon, t)

    return None


def find_first_coast_intersection(
    p_start: tuple[float, float],
    p_end: tuple[float, float],
) -> Optional[tuple[float, float, float]]:
    """
    Finds the earliest coastline intersection along trajectory leg p_start -> p_end.
    Returns (hit_lat, hit_lon, min_t) or None.
    """
    earliest_hit = None
    min_t = float("inf")

    # 1. Check Indian mainland coastline segments
    for i in range(len(INDIA_COASTLINE) - 1):
        hit = segment_intersection(p_start, p_end, INDIA_COASTLINE[i], INDIA_COASTLINE[i + 1])
        if hit and hit[2] < min_t:
            min_t = hit[2]
            earliest_hit = hit

    # 2. Check Sri Lanka coastline segments
    n_sl = len(SRI_LANKA_POLYGON)
    for i in range(n_sl):
        hit = segment_intersection(p_start, p_end, SRI_LANKA_POLYGON[i], SRI_LANKA_POLYGON[(i + 1) % n_sl])
        if hit and hit[2] < min_t:
            min_t = hit[2]
            earliest_hit = hit

    return earliest_hit


def find_nearest_coast_point(lat: float, lon: float) -> tuple[float, float, float]:
    """
    Finds the closest point on the coastline to (lat, lon).
    Returns (coast_lat, coast_lon, distance_km).
    """
    min_dist = float("inf")
    best_pt = (lat, lon)

    def dist_sq(a_lat, a_lon, b_lat, b_lon):
        return (a_lat - b_lat) ** 2 + (a_lon - b_lon) ** 2

    # Check all vertices and segment midpoints
    for i in range(len(INDIA_COASTLINE) - 1):
        c1 = INDIA_COASTLINE[i]
        c2 = INDIA_COASTLINE[i + 1]
        for frac in (0.0, 0.25, 0.5, 0.75, 1.0):
            p_lat = c1[0] + frac * (c2[0] - c1[0])
            p_lon = c1[1] + frac * (c2[1] - c1[1])
            d = dist_sq(lat, lon, p_lat, p_lon)
            if d < min_dist:
                min_dist = d
                best_pt = (p_lat, p_lon)

    dist_km = math.sqrt(min_dist) * 111.32
    return (best_pt[0], best_pt[1], dist_km)


def snap_to_water(
    lat: float,
    lon: float,
    offshore_offset_deg: float = 0.005,
) -> tuple[float, float]:
    """
    If (lat, lon) is on land, snaps it to the nearest coastal water point
    slightly offshore in the marine area.
    """
    if is_water(lat, lon):
        return (lat, lon)

    coast_lat, coast_lon, _ = find_nearest_coast_point(lat, lon)

    # Offset offshore: for peninsular India (lat > 8.08), west coast offsets West, east coast offsets East
    if coast_lat >= 8.08:
        # If longitude is east of 78.5 (East Coast / Bay of Bengal), offset East into water
        if coast_lon >= 78.2:
            water_lon = coast_lon + offshore_offset_deg
            water_lat = coast_lat
        else:  # West Coast / Arabian Sea, offset West into water
            water_lon = coast_lon - offshore_offset_deg
            water_lat = coast_lat
    else:  # Southern Cape / Indian Ocean, offset South into water
        water_lat = coast_lat - offshore_offset_deg
        water_lon = coast_lon

    # Verify snap is in water; if not, step slightly further offshore
    steps = 1
    while not is_water(water_lat, water_lon) and steps < 10:
        steps += 1
        if coast_lon >= 78.2:
            water_lon += offshore_offset_deg
        else:
            water_lon -= offshore_offset_deg

    return (round(water_lat, 5), round(water_lon, 5))


def validate_and_constrain_step(
    p_curr: tuple[float, float],
    p_next: tuple[float, float],
    offshore_margin_deg: float = 0.003,
) -> tuple[float, float, bool]:
    """
    Validates a movement step from p_curr (known to be in water) to p_next.
    If the leg crosses land:
      - Detects the exact intersection point with the coastline.
      - Places the corrected waypoint right at the shoreline landfall point
        (with a tiny offshore margin into the water edge).
      - Returns (corrected_lat, corrected_lon, True) to indicate shoreline contact.
    If the leg stays in water:
      - Returns (p_next[0], p_next[1], False).
    """
    curr_lat, curr_lon = p_curr
    cand_lat, cand_lon = p_next

    # Check both segment intersection and destination point validity
    hit = find_first_coast_intersection(p_curr, p_next)
    is_cand_land = is_land(cand_lat, cand_lon)

    if hit is None and not is_cand_land:
        # Entire step is purely in open water
        return (cand_lat, cand_lon, False)

    # Intersection detected or candidate point is on land
    if hit is not None:
        hit_lat, hit_lon, t = hit
        # Position waypoint at the coastline intersection, nudged slightly back towards sea
        t_safe = max(0.0, t - 0.04)
        corr_lat = curr_lat + t_safe * (cand_lat - curr_lat)
        corr_lon = curr_lon + t_safe * (cand_lon - curr_lon)

        # Fallback check: ensure corrected point is strictly in water
        if not is_water(corr_lat, corr_lon):
            corr_lat, corr_lon = snap_to_water(hit_lat, hit_lon, offshore_offset_deg=offshore_margin_deg)

        return (round(corr_lat, 5), round(corr_lon, 5), True)
    else:
        # Destination is on land even if no direct intersection was found
        corr_lat, corr_lon = snap_to_water(cand_lat, cand_lon, offshore_offset_deg=offshore_margin_deg)
        return (round(corr_lat, 5), round(corr_lon, 5), True)
