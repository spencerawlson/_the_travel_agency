from __future__ import annotations

import asyncio
from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import FlightSearchEvent, SystemErrorEvent
from app.providers.base import (
    AffiliateRedirect,
    AirportRef,
    CabinClass,
    FlightOffer,
    FlightProvider,
    FlightSearchRequest,
    ProviderError,
    ProviderErrorKind,
    TripType,
)
from app.providers.mock import MockFlightProvider, great_circle_km
from app.providers.registry import ProviderRegistry, set_registry

from .conftest import search_payload

YUL = AirportRef(
    iata="YUL",
    name="Montreal",
    city="Montréal",
    country_code="CA",
    latitude=45.4678,
    longitude=-73.7423,
    timezone="America/Toronto",
)
NRT = AirportRef(
    iata="NRT",
    name="Narita",
    city="Tokyo",
    country_code="JP",
    latitude=35.7647,
    longitude=140.386,
    timezone="Asia/Tokyo",
)


def _request(**kw: object) -> FlightSearchRequest:
    base: dict[str, object] = dict(
        origin=YUL,
        destination=NRT,
        trip_type=TripType.round_trip,
        depart_date=date(2030, 5, 1),
        return_date=date(2030, 5, 10),
        adults=2,
        children=1,
        infants=0,
        cabin=CabinClass.business,
        currency="USD",
        locale="en",
    )
    base.update(kw)
    return FlightSearchRequest(**base)  # type: ignore[arg-type]


class FailingProvider(FlightProvider):
    code = "failing"
    display_name = "Failing"
    is_demo = True

    async def search(self, request: FlightSearchRequest) -> list[FlightOffer]:
        raise ProviderError(self.code, ProviderErrorKind.unavailable, "upstream 503")

    def build_redirect(self, offer: FlightOffer) -> AffiliateRedirect:  # pragma: no cover
        raise NotImplementedError


class CrashingProvider(FailingProvider):
    code = "crashing"

    async def search(self, request: FlightSearchRequest) -> list[FlightOffer]:
        raise RuntimeError("bug in integration")


class SlowProvider(FailingProvider):
    code = "slow"

    async def search(self, request: FlightSearchRequest) -> list[FlightOffer]:
        await asyncio.sleep(5)
        return []


async def test_mock_is_deterministic_and_labelled() -> None:
    p = MockFlightProvider()
    a, b = await p.search(_request()), await p.search(_request())
    volatile = {"fetched_at", "expires_at"}
    assert [o.model_dump(exclude=volatile) for o in a] == [
        o.model_dump(exclude=volatile) for o in b
    ]
    assert all(o.is_demo and o.seller_type == "demo" for o in a)
    assert all(o.redirect_url.startswith("/demo/partner?") for o in a)
    assert all(o.outbound.segments[0].carrier_name.startswith("Demo ") for o in a)


async def test_mock_times_are_timezone_aware_and_consistent() -> None:
    offers = await MockFlightProvider().search(_request())
    for o in offers:
        first, last = o.outbound.segments[0], o.outbound.segments[-1]
        assert first.depart_at.tzinfo is not None and last.arrive_at.tzinfo is not None
        assert str(first.depart_at.tzinfo) == "America/Toronto"
        assert str(last.arrive_at.tzinfo) == "Asia/Tokyo"
        assert last.arrive_at > first.depart_at
        assert o.outbound.duration_minutes > great_circle_km(YUL, NRT) / 1000 * 60


async def test_mock_currency_changes_prices_without_implied_rate() -> None:
    usd = await MockFlightProvider().search(_request(currency="USD"))
    eur = await MockFlightProvider().search(_request(currency="EUR"))
    assert {o.price.currency for o in usd} == {"USD"}
    assert {o.price.currency for o in eur} == {"EUR"}


async def test_all_providers_failing_returns_502(client: AsyncClient, db) -> None:  # type: ignore[no-untyped-def]
    set_registry(ProviderRegistry([FailingProvider()]))
    resp = await client.post("/api/v1/flights/search", json=search_payload())
    assert resp.status_code == 502
    assert resp.json()["error"]["code"] == "provider_unavailable"
    event = (await db.scalars(select(FlightSearchEvent))).one()
    assert event.status == "provider_error"
    err = (await db.scalars(select(SystemErrorEvent))).one()
    assert err.source == "provider" and err.provider_code == "failing"


async def test_partial_failure_still_returns_results(client: AsyncClient) -> None:
    set_registry(ProviderRegistry([MockFlightProvider(), CrashingProvider()]))
    resp = await client.post("/api/v1/flights/search", json=search_payload())
    assert resp.status_code == 200
    statuses = {p["code"]: p for p in resp.json()["providers"]}
    assert statuses["mock"]["status"] == "ok"
    assert statuses["crashing"] == {
        **statuses["crashing"],
        "status": "error",
        "error": "bad_response",
    }


async def test_provider_timeout(client: AsyncClient, settings) -> None:  # type: ignore[no-untyped-def]
    settings.provider_timeout_seconds = 0.05
    set_registry(ProviderRegistry([SlowProvider()]))
    resp = await client.post("/api/v1/flights/search", json=search_payload())
    assert resp.status_code == 502


def test_registry_rejects_unknown_provider() -> None:
    with pytest.raises(ValueError, match="Unknown providers"):
        ProviderRegistry.from_codes(["mock", "not-a-provider"])
