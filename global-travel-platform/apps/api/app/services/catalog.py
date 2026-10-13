"""Destinations, deals, and currency conversion."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.errors import AppError, NotFoundError
from app.models import Airport, Destination, ExchangeRateRecord
from app.providers.base import CabinClass, FlightSearchRequest, TripType
from app.providers.registry import get_registry
from app.schemas.public import DestinationLandmarkOut, DestinationOfficialLinkOut, DestinationOut
from app.services.geo import approx_nonstop_minutes, haversine_km
from app.services.search import ensure_currency, resolve_airports


def destination_out(d: Destination, locale: str, origin: Airport | None = None) -> DestinationOut:
    t = d.translations.get(locale) or d.translations["en"]
    facts = d.facts or {}
    distance: int | None = None
    minutes: int | None = None
    if origin is not None and origin.iata_code != d.airport_iata:
        km = haversine_km(
            origin.latitude, origin.longitude, d.airport.latitude, d.airport.longitude
        )
        distance, minutes = round(km), approx_nonstop_minutes(km)
    return DestinationOut(
        slug=d.slug,
        name=t["name"],
        summary=t["summary"],
        description=t["description"],
        highlights=t.get("highlights", []),
        city=d.city.name,
        country_code=d.city.country_code,
        airport_iata=d.airport_iata,
        tags=list(d.tags),
        theme=d.theme,
        latitude=d.airport.latitude,
        longitude=d.airport.longitude,
        timezone=d.airport.timezone,
        best_months=list(facts.get("best_months", [])),
        currency=facts.get("currency"),
        languages=list(facts.get("languages", [])),
        origin=origin.iata_code if origin is not None else None,
        distance_km=distance,
        approx_flight_minutes=minutes,
        history=t.get("history"),
        culture=t.get("culture"),
        landmarks=[DestinationLandmarkOut(**lm) for lm in t.get("landmarks", [])],
        official_links=[DestinationOfficialLinkOut(**ol) for ol in t.get("official_links", [])],
    )


async def list_destinations(session: AsyncSession) -> list[Destination]:
    stmt = (
        select(Destination)
        .options(joinedload(Destination.city), joinedload(Destination.airport))
        .where(Destination.is_published.is_(True))
        .order_by(Destination.sort_order, Destination.slug)
    )
    return list((await session.scalars(stmt)).unique())


async def get_destination(session: AsyncSession, slug: str) -> Destination:
    stmt = (
        select(Destination)
        .options(joinedload(Destination.city), joinedload(Destination.airport))
        .where(Destination.slug == slug, Destination.is_published.is_(True))
    )
    dest = (await session.scalars(stmt)).first()
    if dest is None:
        raise NotFoundError("Destination not found")
    return dest


async def get_origin_airport(session: AsyncSession, iata: str | None) -> Airport | None:
    if not iata:
        return None
    stmt = select(Airport).where(Airport.iata_code == iata.upper(), Airport.is_active.is_(True))
    return (await session.scalars(stmt)).first()


async def find_deals(
    session: AsyncSession, origin_iata: str, currency: str, locale: str
) -> list[dict]:
    """Cheapest offer per published destination, from enabled providers
    (real cached fares with Travelpayouts; demo data with the mock provider).
    Provider responses are cached, so this stays within partner rate limits."""
    await ensure_currency(session, currency)
    today = datetime.now(UTC).date()
    depart, ret = today + timedelta(days=45), today + timedelta(days=52)
    deals: list[dict] = []
    for dest in await list_destinations(session):
        if dest.airport_iata == origin_iata:
            continue
        origin, destination = await resolve_airports(session, origin_iata, dest.airport_iata)
        request = FlightSearchRequest(
            origin=origin,
            destination=destination,
            trip_type=TripType.round_trip,
            depart_date=depart,
            return_date=ret,
            adults=1,
            children=0,
            infants=0,
            cabin=CabinClass.economy,
            currency=currency,
            locale=locale,
        )
        best = None
        for provider in get_registry().all():
            try:
                offers = await provider.search(request)
            except Exception:  # noqa: S112 - a failed provider just yields no deal
                continue
            for offer in offers:
                if best is None or offer.price.amount < best.price.amount:
                    best = offer
        if best is not None:
            deals.append(
                {
                    "destination_slug": dest.slug,
                    "destination_name": destination_out(dest, locale).name,
                    "origin": origin_iata,
                    "destination": dest.airport_iata,
                    "depart_date": depart,
                    "return_date": ret,
                    "price": {"amount": best.price.amount, "currency": best.price.currency},
                    "is_demo": best.is_demo,
                }
            )
    deals.sort(key=lambda d: d["price"]["amount"])
    return deals


async def convert(
    session: AsyncSession, amount: Decimal, from_currency: str, to_currency: str
) -> tuple[Decimal, ExchangeRateRecord | None]:
    """Convert using the most recent recorded rate. Refuses (raises) rather than
    guessing when no sourced rate exists for the pair."""
    if from_currency == to_currency:
        return amount, None
    stmt = (
        select(ExchangeRateRecord)
        .where(
            ExchangeRateRecord.base_currency == from_currency,
            ExchangeRateRecord.quote_currency == to_currency,
        )
        .order_by(ExchangeRateRecord.effective_at.desc())
        .limit(1)
    )
    record = (await session.scalars(stmt)).first()
    if record is None:
        raise AppError(
            f"No recorded exchange rate for {from_currency}->{to_currency}",
            code="exchange_rate_unavailable",
            status_code=422,
        )
    converted = (amount * record.rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return converted, record
