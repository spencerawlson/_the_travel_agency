"""Travelpayouts provider: mapping, links, fallbacks, errors and API wiring.
All HTTP is mocked (httpx.MockTransport); no live calls or real tokens."""

from __future__ import annotations

from datetime import date, timedelta
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import AffiliateProvider, ReferralClickEvent
from app.providers.base import (
    AirportRef,
    CabinClass,
    FlightSearchRequest,
    ProviderError,
    ProviderErrorKind,
    TripType,
)
from app.providers.registry import ProviderRegistry, set_registry
from app.providers.travelpayouts import (
    ProviderConfigError,
    TravelpayoutsProvider,
    passenger_block,
)

from .conftest import future, search_payload

YUL = AirportRef(
    iata="YUL",
    name="Montreal",
    city="Montréal",
    country_code="CA",
    latitude=45.4678,
    longitude=-73.7423,
    timezone="America/Toronto",
)
CDG = AirportRef(
    iata="CDG",
    name="Charles de Gaulle",
    city="Paris",
    country_code="FR",
    latitude=49.009,
    longitude=2.5541,
    timezone="Europe/Paris",
)

DEPART = date.today() + timedelta(days=30)
RETURN = DEPART + timedelta(days=7)


def ticket(**overrides: object) -> dict:
    t: dict = {
        "origin": "YMQ",
        "destination": "PAR",
        "origin_airport": "YUL",
        "destination_airport": "CDG",
        "price": 812,
        "airline": "TS",
        "flight_number": "110",
        "departure_at": f"{DEPART.isoformat()}T18:30:00-05:00",
        "return_at": f"{RETURN.isoformat()}T13:00:00+01:00",
        "transfers": 0,
        "return_transfers": 1,
        "duration": 1020,  # total incl. layovers
        "duration_to": 420,
        "duration_back": 480,
        "link": f"/search/YUL{DEPART:%d%m}CDG{RETURN:%d%m}1?t=abc",
        "gate": "Farera",
    }
    t.update(overrides)
    return t


class FakeAPI:
    """Records calls and returns queued responses per path."""

    def __init__(self) -> None:
        self.calls: list[httpx.Request] = []
        self.prices: list[httpx.Response] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        if request.url.path.endswith("airlines.json"):
            return httpx.Response(200, json=[{"code": "TS", "name": "Air Transat"}])
        if self.prices:
            return self.prices.pop(0)
        return httpx.Response(200, json={"success": True, "currency": "cad", "data": []})

    def price_calls(self) -> list[httpx.Request]:
        return [c for c in self.calls if "prices_for_dates" in c.url.path]


@pytest.fixture
def tp_settings(settings):  # type: ignore[no-untyped-def]
    settings.travelpayouts_api_token = "test-token"
    settings.travelpayouts_marker = "584743"
    settings.travelpayouts_market = None
    return settings


@pytest.fixture
def api():  # type: ignore[no-untyped-def]
    return FakeAPI()


@pytest.fixture
def provider(tp_settings, api):  # type: ignore[no-untyped-def]
    return TravelpayoutsProvider(transport=httpx.MockTransport(api.handler))


def req(**kw: object) -> FlightSearchRequest:
    base: dict = dict(
        origin=YUL,
        destination=CDG,
        trip_type=TripType.round_trip,
        depart_date=DEPART,
        return_date=RETURN,
        adults=1,
        children=0,
        infants=0,
        cabin=CabinClass.economy,
        currency="CAD",
        locale="en",
    )
    base.update(kw)
    return FlightSearchRequest(**base)


def test_requires_token_and_marker(settings) -> None:  # type: ignore[no-untyped-def]
    settings.travelpayouts_api_token = None
    settings.travelpayouts_marker = None
    with pytest.raises(ProviderConfigError):
        TravelpayoutsProvider()


def test_passenger_block_encoding() -> None:
    assert passenger_block(1, 0, 0, CabinClass.economy) == "1"
    assert passenger_block(2, 1, 0, CabinClass.economy) == "21"
    assert passenger_block(1, 0, 1, CabinClass.economy) == "101"
    assert passenger_block(2, 1, 0, CabinClass.business) == "c21"
    assert passenger_block(1, 0, 0, CabinClass.premium_economy) == "w1"


async def test_maps_cached_fares(provider, api) -> None:  # type: ignore[no-untyped-def]
    api.prices.append(
        httpx.Response(200, json={"success": True, "currency": "cad", "data": [ticket()]})
    )
    [offer] = await provider.search(req())

    sent = parse_qs(urlsplit(str(api.price_calls()[0].url)).query)
    assert sent["origin"] == ["YUL"] and sent["destination"] == ["CDG"]
    assert sent["departure_at"] == [DEPART.isoformat()]
    assert sent["return_at"] == [RETURN.isoformat()] and sent["one_way"] == ["false"]
    assert sent["currency"] == ["cad"]
    assert api.price_calls()[0].headers["x-access-token"] == "test-token"
    assert "token" not in sent  # never in the URL (logs/proxies)

    assert offer.is_demo is False and offer.price_basis == "per_adult"
    assert str(offer.price.amount) == "812" and offer.price.currency == "CAD"
    seg = offer.outbound.segments[0]
    assert seg.carrier_name == "Air Transat" and seg.flight_number == "TS110"
    assert offer.outbound.stops == 0 and offer.inbound is not None and offer.inbound.stops == 1
    # Outbound door-to-door = 420 min flight (no outbound layover).
    assert offer.outbound.duration_minutes == 420
    assert str(seg.arrive_at.tzinfo) == "Europe/Paris"
    assert (seg.arrive_at - seg.depart_at).total_seconds() == 420 * 60
    # Return gets all the layover time (1 stop): 480 + (1020 - 420 - 480).
    assert offer.inbound.duration_minutes == 600
    assert set(offer.notes) >= {"cached_fare", "seller_on_partner"}
    assert offer.seller_name == "Farera"  # the selling agency (`gate`)
    assert "different_dates" not in offer.notes and "economy_only" not in offer.notes


async def test_booking_link_has_marker_and_party(provider, api) -> None:  # type: ignore[no-untyped-def]
    api.prices.append(
        httpx.Response(
            200,
            json={
                "success": True,
                "data": [
                    ticket(
                        link=f"/search/YUL{DEPART:%d%m}CDG{RETURN:%d%m}1?t=abc&marker=someone-else"
                    )
                ],
            },
        )
    )
    [offer] = await provider.search(req(adults=2, children=1, cabin=CabinClass.business))
    url = urlsplit(offer.redirect_url)
    assert url.scheme == "https" and url.hostname == "www.aviasales.com"
    assert url.path == f"/search/YUL{DEPART:%d%m}CDG{RETURN:%d%m}c21"
    q = parse_qs(url.query)
    assert q["marker"] == ["584743"] and q["t"] == ["abc"]  # our marker replaces theirs
    assert "economy_only" in offer.notes


async def test_builds_route_link_when_missing(provider, api) -> None:  # type: ignore[no-untyped-def]
    api.prices.append(httpx.Response(200, json={"success": True, "data": [ticket(link="")]}))
    [offer] = await provider.search(req(trip_type=TripType.one_way, return_date=None))
    assert urlsplit(offer.redirect_url).path == f"/search/YUL{DEPART:%d%m}CDG1"
    assert offer.inbound is None


async def test_falls_back_to_month_and_flags_dates(provider, api) -> None:  # type: ignore[no-untyped-def]
    other = DEPART + timedelta(days=3)
    api.prices.append(httpx.Response(200, json={"success": True, "data": []}))
    api.prices.append(
        httpx.Response(
            200,
            json={
                "success": True,
                "data": [ticket(departure_at=f"{other.isoformat()}T09:00:00-05:00")],
            },
        )
    )
    [offer] = await provider.search(req())
    calls = api.price_calls()
    assert parse_qs(urlsplit(str(calls[1].url)).query)["departure_at"] == [f"{DEPART:%Y-%m}"]
    assert "different_dates" in offer.notes


async def test_responses_are_cached(provider, api) -> None:  # type: ignore[no-untyped-def]
    api.prices.append(httpx.Response(200, json={"success": True, "data": [ticket()]}))
    await provider.search(req())
    await provider.search(req())
    assert len(api.price_calls()) == 1


async def test_skips_malformed_rows(provider, api) -> None:  # type: ignore[no-untyped-def]
    api.prices.append(
        httpx.Response(
            200,
            json={
                "success": True,
                "data": [
                    ticket(price="n/a"),
                    ticket(departure_at=None),
                    ticket(price=0),
                    ticket(price=950),
                ],
            },
        )
    )
    offers = await provider.search(req())
    assert [str(o.price.amount) for o in offers] == ["950"]


@pytest.mark.parametrize(
    ("response", "kind"),
    [
        (httpx.Response(401, text="Unauthorized"), ProviderErrorKind.configuration),
        (httpx.Response(429), ProviderErrorKind.rate_limited),
        (httpx.Response(503), ProviderErrorKind.unavailable),
        (
            httpx.Response(200, json={"success": False, "error": "x"}),
            ProviderErrorKind.bad_response,
        ),
        (httpx.Response(200, text="<html>"), ProviderErrorKind.bad_response),
    ],
)
async def test_error_mapping(provider, api, response, kind) -> None:  # type: ignore[no-untyped-def]
    api.prices.append(response)
    with pytest.raises(ProviderError) as exc:
        await provider.search(req())
    assert exc.value.kind == kind


async def test_timeout_maps_to_timeout(tp_settings) -> None:  # type: ignore[no-untyped-def]
    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    p = TravelpayoutsProvider(transport=httpx.MockTransport(boom))
    with pytest.raises(ProviderError) as exc:
        await p.search(req())
    assert exc.value.kind == ProviderErrorKind.timeout


# --- end to end through the API ------------------------------------------------


async def test_api_real_fares_not_bookable_until_live(
    client: AsyncClient, db, provider, api, settings
):  # type: ignore[no-untyped-def]
    api.prices.append(httpx.Response(200, json={"success": True, "data": [ticket()]}))
    set_registry(ProviderRegistry([provider]))

    health = (await client.get("/api/v1/health")).json()
    assert health["demo_mode"] is False

    resp = await client.post(
        "/api/v1/flights/search",
        json=search_payload(depart_date=DEPART.isoformat(), return_date=RETURN.isoformat()),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["is_demo"] is False
    assert body["disclaimers"][0] == "cached_prices" and "demo_data" not in body["disclaimers"]
    [offer] = body["offers"]
    assert offer["price_basis"] == "per_adult" and offer["bookable"] is False
    assert "redirect_url" not in offer

    # Kill switch off: click is refused and recorded.
    click = await client.post("/api/v1/referrals/click", json={"offer_id": offer["id"]})
    assert click.status_code == 403 and click.json()["error"]["code"] == "referrals_disabled"

    # Fully enabled partner: the validated Aviasales link is returned.
    row = (
        await db.scalars(select(AffiliateProvider).where(AffiliateProvider.code == "travelpayouts"))
    ).one()
    row.status, row.agreement_verified = "live", True
    await db.commit()
    settings.referrals_live_enabled = True
    try:
        ok = await client.post("/api/v1/referrals/click", json={"offer_id": offer["id"]})
        assert ok.status_code == 200, ok.text
        target = urlsplit(ok.json()["redirect_url"])
        assert target.hostname == "www.aviasales.com"
        assert parse_qs(target.query)["marker"] == ["584743"]
        statuses = sorted(e.status for e in (await db.scalars(select(ReferralClickEvent))).all())
        assert statuses == ["blocked_live_disabled", "redirected"]
    finally:
        row.status, row.agreement_verified = "sandbox", False
        await db.commit()


async def test_api_provider_outage_is_reported(client: AsyncClient, provider, api) -> None:  # type: ignore[no-untyped-def]
    api.prices.append(httpx.Response(503))
    set_registry(ProviderRegistry([provider]))
    resp = await client.post(
        "/api/v1/flights/search",
        json=search_payload(depart_date=future(30), return_date=future(37)),
    )
    assert resp.status_code == 502
    assert resp.json()["error"]["code"] == "provider_unavailable"
