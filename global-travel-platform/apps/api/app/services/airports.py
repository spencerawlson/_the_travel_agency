from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models import Airport
from app.providers.base import AirportRef
from app.services.text import normalize

_SIZE_RANK = {"large": 0, "medium": 1, "small": 2}


async def search_airports(session: AsyncSession, query: str, limit: int = 10) -> list[Airport]:
    term = normalize(query)
    if not term:
        return []
    stmt = (
        select(Airport)
        .options(joinedload(Airport.city), joinedload(Airport.country))
        .where(Airport.is_active.is_(True), Airport.search_text.contains(term, autoescape=True))
        .limit(200)
    )
    candidates = list((await session.scalars(stmt)).unique())

    def rank(a: Airport) -> tuple[int, int, str]:
        city = normalize(a.city.name)
        if a.iata_code.lower() == term:
            score = 0
        elif city == term or city.startswith(term):
            score = 1
        elif a.iata_code.lower().startswith(term):
            score = 2
        elif normalize(a.name).startswith(term):
            score = 3
        else:
            score = 4
        return (score, _SIZE_RANK.get(a.size, 3), a.iata_code)

    candidates.sort(key=rank)
    return candidates[:limit]


async def get_airport_refs(session: AsyncSession, codes: list[str]) -> dict[str, AirportRef]:
    stmt = (
        select(Airport)
        .options(joinedload(Airport.city))
        .where(Airport.iata_code.in_([c.upper() for c in codes]), Airport.is_active.is_(True))
    )
    result: dict[str, AirportRef] = {}
    for a in (await session.scalars(stmt)).unique():
        result[a.iata_code] = AirportRef(
            iata=a.iata_code,
            name=a.name,
            city=a.city.name,
            country_code=a.country_code,
            latitude=a.latitude,
            longitude=a.longitude,
            timezone=a.timezone,
        )
    return result
