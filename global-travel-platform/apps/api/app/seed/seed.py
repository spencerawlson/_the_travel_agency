"""Idempotent reference-data seeding (safe to re-run on every deploy).

Seeds: countries, cities, airports (OurAirports), currencies, the demo
affiliate provider, destinations and default app settings.
Deliberately NOT seeded: exchange rates, commissions, search/click events.
"""

from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AffiliateProvider,
    Airport,
    AppSetting,
    City,
    Country,
    Currency,
    Destination,
)
from app.services.text import normalize

DATA = Path(__file__).parent / "data"

CURRENCIES = [
    ("CAD", "Canadian dollar", "$", 2, 1),
    ("USD", "US dollar", "$", 2, 2),
    ("EUR", "Euro", "€", 2, 3),
    ("GBP", "Pound sterling", "£", 2, 4),
]

DEFAULT_SETTINGS: dict[str, tuple[object, str]] = {
    "site.default_locale": ("en", "Default UI locale"),
    "site.supported_locales": (["en", "fr"], "Enabled UI locales"),
    "search.default_currency": ("CAD", "Default search currency"),
    "referrals.live_enabled_note": (
        "Controlled by REFERRALS_LIVE_ENABLED env var; requires compliance sign-off.",
        "Informational",
    ),
}


def load_airport_dataset() -> dict:
    return json.loads((DATA / "airports.json").read_text(encoding="utf-8"))


async def seed_reference_data(
    session: AsyncSession, *, airport_codes: set[str] | None = None
) -> dict[str, int]:
    """Seed everything. `airport_codes` limits airports (used by fast tests)."""
    counts: dict[str, int] = {}
    dataset = load_airport_dataset()

    existing_countries = set((await session.scalars(select(Country.code))).all())
    countries = [c for c in dataset["countries"] if c["code"] not in existing_countries]
    session.add_all(
        Country(code=c["code"], name=c["name"], continent=c["continent"]) for c in countries
    )
    counts["countries"] = len(countries)
    await session.flush()

    airports = dataset["airports"]
    if airport_codes is not None:
        airports = [a for a in airports if a["iata"] in airport_codes]

    city_ids = {
        (name, cc): cid
        for cid, name, cc in (await session.execute(select(City.id, City.name, City.country_code)))
    }
    country_names = {c["code"]: c["name"] for c in dataset["countries"]}
    pending: dict[tuple[str, str], City] = {}
    for a in airports:
        city_key = (a["city"][:160], a["country"])
        if city_key not in city_ids and city_key not in pending:
            pending[city_key] = City(name=city_key[0], country_code=a["country"], timezone=a["tz"])
    session.add_all(pending.values())
    await session.flush()  # one round-trip assigns all new city ids
    city_ids.update({k: c.id for k, c in pending.items()})
    counts["cities"] = len(pending)

    existing_airports = set((await session.scalars(select(Airport.iata_code))).all())
    new_airports = [
        Airport(
            iata_code=a["iata"],
            icao_code=a["icao"],
            name=a["name"][:200],
            city_id=city_ids[(a["city"][:160], a["country"])],
            country_code=a["country"],
            latitude=a["lat"],
            longitude=a["lon"],
            timezone=a["tz"],
            size=a["size"],
            search_text=normalize(
                f"{a['iata']} {a['city']} {a.get('locality', '')} {a['name']} "
                f"{country_names.get(a['country'], '')}"
            )[:600],
        )
        for a in airports
        if a["iata"] not in existing_airports
    ]
    session.add_all(new_airports)
    counts["airports"] = len(new_airports)
    await session.flush()

    existing_currencies = set((await session.scalars(select(Currency.code))).all())
    for code, name, symbol, minor, order in CURRENCIES:
        if code not in existing_currencies:
            session.add(
                Currency(code=code, name=name, symbol=symbol, minor_units=minor, sort_order=order)
            )
    counts["currencies"] = len([c for c in CURRENCIES if c[0] not in existing_currencies])

    if not (
        await session.scalars(select(AffiliateProvider).where(AffiliateProvider.code == "mock"))
    ).first():
        session.add(
            AffiliateProvider(
                code="mock",
                name="Demo Provider (sample data)",
                kind="flights",
                status="sandbox",
                is_demo=True,
                allowed_redirect_hosts=[],
                agreement_verified=False,
                notes="Deterministic synthetic data for development. Never live.",
            )
        )
        counts["providers"] = 1

    await session.flush()
    airport_city = {
        iata: cid
        for iata, cid in (await session.execute(select(Airport.iata_code, Airport.city_id)))
    }
    existing_dest = set((await session.scalars(select(Destination.slug))).all())
    added = 0
    destinations = json.loads((DATA / "destinations.json").read_text(encoding="utf-8"))
    for order, dest in enumerate(destinations):
        if dest["slug"] in existing_dest or dest["airport"] not in airport_city:
            continue
        session.add(
            Destination(
                slug=dest["slug"],
                city_id=airport_city[dest["airport"]],
                airport_iata=dest["airport"],
                translations={"en": dest["en"], "fr": dest["fr"]},
                tags=dest["tags"],
                theme=dest["theme"],
                sort_order=order,
            )
        )
        added += 1
    counts["destinations"] = added

    existing_settings = set((await session.scalars(select(AppSetting.key))).all())
    for key, (value, desc) in DEFAULT_SETTINGS.items():
        if key not in existing_settings:
            session.add(AppSetting(key=key, value=value, description=desc))

    await session.commit()
    return counts
