"""Build the airport/city/country seed dataset from OurAirports.

Source: https://ourairports.com/data/  (public domain, no attribution required,
but we record it anyway in the output metadata and docs/DATABASE.md).

Selection: airports of type large_airport or medium_airport that have
scheduled_service == "yes" and a 3-letter IATA code. Time zones are derived
from coordinates with `timezonefinder` (IANA identifiers).

Usage (one-off, the output is committed so normal setup needs no network):

    python -m venv .tmpvenv && .tmpvenv/bin/pip install timezonefinder
    .tmpvenv/bin/python scripts/build_airport_dataset.py

Writes apps/api/app/seed/data/airports.json
"""

from __future__ import annotations

import csv
import io
import json
import re
import sys
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

from timezonefinder import TimezoneFinder

BASE = "https://davidmegginson.github.io/ourairports-data"
OUT = Path(__file__).resolve().parents[1] / "apps/api/app/seed/data/airports.json"
IATA_RE = re.compile(r"^[A-Z]{3}$")
# "Paris (Roissy-en-France, Val-d'Oise)" -> city "Paris", locality kept for search.
SUFFIX_RE = re.compile(r"\s*\(.*\)\s*$")


def fetch_csv(name: str) -> list[dict[str, str]]:
    with urllib.request.urlopen(f"{BASE}/{name}", timeout=60) as resp:  # noqa: S310 - fixed https URL
        text = resp.read().decode("utf-8")
    return list(csv.DictReader(io.StringIO(text)))


def main() -> int:
    countries = {c["code"]: c for c in fetch_csv("countries.csv")}
    airports_raw = fetch_csv("airports.csv")
    tf = TimezoneFinder()

    airports = []
    used_countries: set[str] = set()
    seen_iata: set[str] = set()
    for a in airports_raw:
        iata = (a.get("iata_code") or "").strip().upper()
        if a["type"] not in ("large_airport", "medium_airport"):
            continue
        if a.get("scheduled_service") != "yes" or not IATA_RE.match(iata) or iata in seen_iata:
            continue
        locality = (a.get("municipality") or "").strip()
        if not locality:
            continue
        city = SUFFIX_RE.sub("", locality).strip() or locality
        lat, lon = float(a["latitude_deg"]), float(a["longitude_deg"])
        tz = tf.timezone_at(lat=lat, lng=lon)
        seen_iata.add(iata)
        used_countries.add(a["iso_country"])
        airports.append(
            {
                "iata": iata,
                "icao": (a.get("gps_code") or a.get("ident") or "").strip()[:4] or None,
                "name": a["name"].strip(),
                "city": city,
                **({"locality": locality} if locality != city else {}),
                "country": a["iso_country"],
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "tz": tz,
                "size": "large" if a["type"] == "large_airport" else "medium",
            }
        )

    airports.sort(key=lambda x: x["iata"])
    out = {
        "source": "OurAirports (https://ourairports.com/data/), public domain",
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "selection": "large/medium airports with scheduled service and IATA code",
        "countries": [
            {
                "code": code,
                "name": countries[code]["name"],
                "continent": countries[code]["continent"],
            }
            for code in sorted(used_countries)
            if code in countries
        ],
        "airports": airports,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {len(airports)} airports / {len(out['countries'])} countries -> {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
