from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Path, Query, Request, Response
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache
from app.core.config import get_settings
from app.core.errors import NotFoundError
from app.core.metrics import render
from app.core.ratelimit import client_ip, rate_limit
from app.core.security import client_hash, constant_time_equals
from app.db.session import get_db
from app.models import Airport, Currency
from app.providers.base import FlightSlice
from app.providers.registry import get_registry
from app.schemas.public import (
    AirportOut,
    CurrencyOut,
    DealOut,
    DealsOut,
    DestinationOut,
    FlightSearchIn,
    FlightSearchOut,
    HealthOut,
    Locale,
    MoneyOut,
    OfferOut,
    ProviderStatusOut,
    ReferralClickIn,
    ReferralClickOut,
    SegmentOut,
    SliceOut,
)
from app.services import catalog
from app.services.airports import search_airports
from app.services.referrals import record_click
from app.services.search import (
    DISCLAIMER_DEMO,
    DISCLAIMER_PRICES,
    DISCLAIMER_SELLER,
    airport_display,
    search_flights,
)

router = APIRouter()
DB = Annotated[AsyncSession, Depends(get_db)]


def _airport_out(a: Airport) -> AirportOut:
    return AirportOut(
        iata=a.iata_code,
        name=a.name,
        city=a.city.name,
        country_code=a.country_code,
        country_name=a.country.name,
        timezone=a.timezone,
    )


# --- health & metrics ----------------------------------------------------------


@router.get("/health", response_model=HealthOut, tags=["system"])
async def health(session: DB, response: Response) -> HealthOut:
    checks: dict[str, str] = {}
    try:
        await session.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "error"
    checks["redis"] = "ok" if await get_cache().ping() else "error"
    providers = get_registry().all()
    checks["providers"] = ",".join(p.code for p in providers) or "none"
    ok = checks["database"] == "ok" and checks["redis"] == "ok"
    if not ok:
        response.status_code = 503
    s = get_settings()
    return HealthOut(
        status="ok" if ok else "degraded",
        version=s.app_version,
        environment=s.environment,
        checks=checks,
        demo_mode=all(p.is_demo for p in providers),
        referrals_live_enabled=s.referrals_live_enabled,
    )


@router.get("/health/live", tags=["system"], include_in_schema=False)
async def liveness() -> dict[str, str]:
    return {"status": "alive"}


@router.get("/metrics", tags=["system"], include_in_schema=False)
async def metrics(authorization: Annotated[str | None, Header()] = None) -> Response:
    token = get_settings().metrics_token
    if not token:
        raise NotFoundError("Not found")
    if not authorization or not constant_time_equals(authorization, f"Bearer {token}"):
        raise NotFoundError("Not found")
    return Response(render(), media_type="text/plain; version=0.0.4")


# --- reference data ----------------------------------------------------------


@router.get(
    "/airports/search",
    response_model=list[AirportOut],
    tags=["reference"],
    dependencies=[Depends(rate_limit("autocomplete", "rate_limit_autocomplete"))],
)
async def airports_search(
    session: DB,
    response: Response,
    q: Annotated[str, Query(min_length=2, max_length=64)],
    limit: Annotated[int, Query(ge=1, le=20)] = 8,
) -> list[AirportOut]:
    response.headers["Cache-Control"] = "public, max-age=300"
    return [_airport_out(a) for a in await search_airports(session, q, limit)]


@router.get("/currencies", response_model=list[CurrencyOut], tags=["reference"])
async def currencies(session: DB, response: Response) -> list[CurrencyOut]:
    response.headers["Cache-Control"] = "public, max-age=3600"
    rows = await session.scalars(
        select(Currency).where(Currency.is_active.is_(True)).order_by(Currency.sort_order)
    )
    return [
        CurrencyOut(code=c.code, name=c.name, symbol=c.symbol, minor_units=c.minor_units)
        for c in rows
    ]


@router.get("/destinations", response_model=list[DestinationOut], tags=["reference"])
async def destinations(
    session: DB,
    locale: Locale = "en",
    origin: Annotated[str | None, Query(pattern=r"^[A-Za-z]{3}$")] = None,
) -> list[DestinationOut]:
    """`origin` (IATA) adds an approximate distance and nonstop flight time."""
    from_airport = await catalog.get_origin_airport(session, origin)
    return [
        catalog.destination_out(d, locale, from_airport)
        for d in await catalog.list_destinations(session)
    ]


@router.get("/destinations/{slug}", response_model=DestinationOut, tags=["reference"])
async def destination(
    session: DB,
    slug: Annotated[str, Path(pattern=r"^[a-z0-9-]{1,80}$")],
    locale: Locale = "en",
    origin: Annotated[str | None, Query(pattern=r"^[A-Za-z]{3}$")] = None,
) -> DestinationOut:
    from_airport = await catalog.get_origin_airport(session, origin)
    return catalog.destination_out(
        await catalog.get_destination(session, slug), locale, from_airport
    )


@router.get(
    "/deals",
    response_model=DealsOut,
    tags=["flights"],
    dependencies=[Depends(rate_limit("search", "rate_limit_search"))],
)
async def deals(
    session: DB,
    origin: Annotated[str, Query(pattern=r"^[A-Za-z]{3}$")] = "YUL",
    currency: Annotated[str, Query(pattern=r"^[A-Za-z]{3}$")] = "CAD",
    locale: Locale = "en",
) -> DealsOut:
    items = await catalog.demo_deals(session, origin.upper(), currency.upper(), locale)
    is_demo = all(p.is_demo for p in get_registry().all())
    disclaimers = [DISCLAIMER_PRICES, DISCLAIMER_SELLER]
    if is_demo:
        disclaimers.insert(0, DISCLAIMER_DEMO)
    return DealsOut(
        is_demo=is_demo,
        origin=origin.upper(),
        currency=currency.upper(),
        deals=[DealOut.model_validate(d) for d in items],
        disclaimers=disclaimers,
    )


# --- flights & referrals -------------------------------------------------------


@router.post(
    "/flights/search",
    response_model=FlightSearchOut,
    tags=["flights"],
    dependencies=[Depends(rate_limit("search", "rate_limit_search"))],
)
async def flights_search(payload: FlightSearchIn, request: Request, session: DB) -> FlightSearchOut:
    event, _, _, offers, statuses = await search_flights(
        session, payload, client_hash=client_hash(client_ip(request))
    )
    origin = await airport_display(session, event.origin_iata)
    destination = await airport_display(session, event.destination_iata)
    assert origin is not None and destination is not None
    names = {p.code: p.display_name for p in get_registry().all()}
    is_demo = event.is_demo
    disclaimers = [DISCLAIMER_PRICES, DISCLAIMER_SELLER]
    if is_demo:
        disclaimers.insert(0, DISCLAIMER_DEMO)

    def _slice(s: FlightSlice) -> SliceOut:
        return SliceOut(
            segments=[SegmentOut.model_validate(seg.model_dump()) for seg in s.segments],
            duration_minutes=s.duration_minutes,
            stops=s.stops,
        )

    return FlightSearchOut(
        search_id=event.id,
        is_demo=is_demo,
        currency=payload.currency,
        origin=_airport_out(origin),
        destination=_airport_out(destination),
        offers=[
            OfferOut(
                id=o.id,
                provider_code=o.provider_code,
                provider_name=names.get(o.provider_code, o.provider_code),
                is_demo=o.is_demo,
                price=MoneyOut.model_validate(o.price.model_dump()),
                cabin=o.cabin,
                outbound=_slice(o.outbound),
                inbound=_slice(o.inbound) if o.inbound else None,
                seller_name=o.seller_name,
                seller_type=o.seller_type,
                expires_at=o.expires_at,
                notes=o.notes,
            )
            for o in offers
        ],
        providers=[
            ProviderStatusOut(
                code=s["provider"].code,
                name=s["provider"].display_name,
                is_demo=s["provider"].is_demo,
                status=s["status"],
                error=s["error"],
                result_count=s["count"],
            )
            for s in statuses
        ],
        disclaimers=disclaimers,
    )


@router.post(
    "/referrals/click",
    response_model=ReferralClickOut,
    tags=["referrals"],
    dependencies=[Depends(rate_limit("referral", "rate_limit_referral"))],
)
async def referral_click(
    payload: ReferralClickIn, request: Request, session: DB
) -> ReferralClickOut:
    event, url, provider, seller = await record_click(
        session,
        offer_id=payload.offer_id,
        locale=payload.locale,
        client_hash=client_hash(client_ip(request)),
    )
    return ReferralClickOut(
        click_id=event.id,
        redirect_url=url,
        is_demo=event.is_demo,
        provider_name=provider.name,
        seller_name=seller,
        notice="demo_redirect" if event.is_demo else "partner_redirect",
    )
