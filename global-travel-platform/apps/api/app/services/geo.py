from __future__ import annotations

import math

EARTH_RADIUS_KM = 6371.0
# Typical jet cruise speed plus ~30 min for taxi, climb and descent.
CRUISE_KMH = 830
OVERHEAD_MINUTES = 30


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, l1, p2, l2 = map(math.radians, (lat1, lon1, lat2, lon2))
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin((l2 - l1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def approx_nonstop_minutes(distance_km: float) -> int:
    """Rough nonstop block time for display only (labelled approximate in the UI)."""
    return round((OVERHEAD_MINUTES + distance_km / CRUISE_KMH * 60) / 5) * 5
