"""Flight search orchestration: validate -> fan out to providers -> cache offers
-> record an anonymous search event."""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.metrics import flight_searches, provider_errors
from app.models import Airport, Currency, FlightSearchEvent
from app.providers.base import (
    AirportRef,
    FlightOffer,
    FlightProvider,
    FlightSearchRequest,
    ProviderError,
    ProviderErrorKind,
)
from app.providers.registry import get_registry
from app.schemas.public import FlightSearchIn
from app.services.airports import get_airport_refs
from app.services.errors import record_error

logger = logging.getLogger("app.search")

MAX_DAYS_AHEAD = 361
# Disclaimer codes; the web app renders localised text for each.
DISCLAIMER_DEMO = "demo_data"
DISCLAIMER_PRICES = "prices_may_change"
DISCLAIMER_SELLER = "seller_responsible"
DISCLAIMER_CACHED = "cached_prices"


def offer_cache_key(offer_id: str) -> str:
    return f"offer:{offer_id}"


def validate_dates(req: FlightSearchIn, today: date | None = None) -> None:
    # Allow "yesterday" in UTC so travellers in UTC-12..UTC-1 can search for
    # their local today.
    today = today or datetime.now(UTC).date()
    earliest = today - timedelta(days=1)
    latest = today + timedelta(days=MAX_DAYS_AHEAD)
    if req.depart_date < earliest:
        raise AppError("Departure date is in the past", code="invalid_date", status_code=422)
    if req.depart_date > latest or (req.return_date and req.return_date > latest):
        raise AppError(
            f"Dates must be within {MAX_DAYS_AHEAD} days", code="invalid_date", status_code=422
        )


async def ensure_currency(session: AsyncSession, code: str) -> None:
    currency = await session.get(Currency, code)
    if currency is None or not currency.is_active:
        raise AppError(
            f"Unsupported currency: {code}", code="unsupported_currency", status_code=422
        )


async def resolve_airports(
    session: AsyncSession, origin: str, destination: str
) -> tuple[AirportRef, AirportRef]:
    refs = await get_airport_refs(session, [origin, destination])
    missing = [c for c in (origin, destination) if c not in refs]
    if missing:
        raise AppError(
            "Unknown airport code",
            code="unknown_airport",
            status_code=422,
            details={"codes": missing},
        )
    return refs[origin], refs[destination]


async def _run_provider(
    provider: FlightProvider, request: FlightSearchRequest, limit_seconds: float
) -> list[FlightOffer]:
    try:
        return await asyncio.wait_for(provider.search(request), timeout=limit_seconds)
    except TimeoutError as exc:
        raise ProviderError(provider.code, ProviderErrorKind.timeout, "Provider timed out") from exc
    except ProviderError:
        raise
    except Exception as exc:  # contain misbehaving integrations
        logger.exception("provider_unexpected_error", extra={"provider": provider.code})
        raise ProviderError(
            provider.code, ProviderErrorKind.bad_response, "Unexpected provider failure"
        ) from exc


async def search_flights(
    session: AsyncSession, payload: FlightSearchIn, *, client_hash: str | None
) -> tuple[FlightSearchEvent, AirportRef, AirportRef, list[FlightOffer], list[dict]]:
    validate_dates(payload)
    await ensure_currency(session, payload.currency)
    origin, destination = await resolve_airports(session, payload.origin, payload.destination)

    request = FlightSearchRequest(
        origin=origin,
        destination=destination,
        trip_type=payload.trip_type,
        depart_date=payload.depart_date,
        return_date=payload.return_date,
        adults=payload.adults,
        children=payload.children,
        infants=payload.infants,
        cabin=payload.cabin,
        currency=payload.currency,
        locale=payload.locale,
    )
    settings = get_settings()
    providers = get_registry().all()
    started = time.perf_counter()
    results = await asyncio.gather(
        *(_run_provider(p, request, settings.provider_timeout_seconds) for p in providers),
        return_exceptions=True,
    )
    latency_ms = int((time.perf_counter() - started) * 1000)

    offers: list[FlightOffer] = []
    statuses: list[dict] = []
    for provider, result in zip(providers, results, strict=True):
        if isinstance(result, ProviderError):
            provider_errors.labels(provider.code, result.kind.value).inc()
            await record_error(
                source="provider",
                code=result.kind.value,
                message=result.message,
                provider_code=provider.code,
            )
            statuses.append(
                {"provider": provider, "status": "error", "error": result.kind.value, "count": 0}
            )
        elif isinstance(result, BaseException):  # pragma: no cover - _run_provider wraps all
            raise result
        else:
            offers.extend(result)
            statuses.append(
                {"provider": provider, "status": "ok", "error": None, "count": len(result)}
            )

    failed = sum(1 for s in statuses if s["status"] == "error")
    if failed == len(statuses):
        status = "provider_error"
    elif failed:
        status = "partial"
    elif not offers:
        status = "no_results"
    else:
        status = "ok"

    event = FlightSearchEvent(
        origin_iata=origin.iata,
        destination_iata=destination.iata,
        trip_type=payload.trip_type.value,
        depart_date=payload.depart_date,
        return_date=payload.return_date,
        adults=payload.adults,
        children=payload.children,
        infants=payload.infants,
        cabin=payload.cabin.value,
        currency=payload.currency,
        locale=payload.locale,
        providers=[p.code for p in providers],
        result_count=len(offers),
        status=status,
        latency_ms=latency_ms,
        is_demo=all(p.is_demo for p in providers),
        client_hash=client_hash,
    )
    session.add(event)
    await session.commit()
    flight_searches.labels(status).inc()

    if status == "provider_error":
        raise AppError(
            "Flight providers are temporarily unavailable. Please try again shortly.",
            code="provider_unavailable",
            status_code=502,
            details={"search_id": str(event.id)},
        )

    offers.sort(key=lambda o: o.price.amount)
    cache = get_cache()
    for offer in offers:
        await cache.set_json(
            offer_cache_key(offer.id),
            {
                "offer": offer.model_dump(mode="json"),
                "search_event_id": str(event.id),
                "origin": origin.iata,
                "destination": destination.iata,
            },
            settings.offer_ttl_seconds,
        )
    return event, origin, destination, offers, statuses


async def airport_display(session: AsyncSession, iata: str) -> Airport | None:
    from sqlalchemy.orm import joinedload

    stmt = (
        select(Airport)
        .options(joinedload(Airport.city), joinedload(Airport.country))
        .where(Airport.iata_code == iata)
    )
    return (await session.scalars(stmt)).first()
