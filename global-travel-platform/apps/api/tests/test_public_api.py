from __future__ import annotations

import json
from pathlib import Path

from httpx import AsyncClient
from sqlalchemy import func, select

from app.models import FlightSearchEvent

from .conftest import future, search_payload

SEED_DESTINATIONS = json.loads(
    (Path(__file__).parents[1] / "app" / "seed" / "data" / "destinations.json").read_text(
        encoding="utf-8"
    )
)


async def test_health_reports_dependencies(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["checks"]["database"] == "ok"
    assert body["demo_mode"] is True
    assert body["referrals_live_enabled"] is False


async def test_security_headers_and_request_id(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/health", headers={"X-Request-ID": "abcdef123456"})
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in resp.headers["content-security-policy"]
    assert resp.headers["x-request-id"] == "abcdef123456"


async def test_metrics_hidden_without_token(client: AsyncClient, settings) -> None:  # type: ignore[no-untyped-def]
    assert (await client.get("/api/v1/metrics")).status_code == 404
    settings.metrics_token = "s3cret-token"
    assert (await client.get("/api/v1/metrics")).status_code == 404
    ok = await client.get("/api/v1/metrics", headers={"Authorization": "Bearer s3cret-token"})
    assert ok.status_code == 200
    assert "gtp_http_requests_total" in ok.text


# --- airports -----------------------------------------------------------------


async def test_airport_autocomplete_accent_insensitive(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/airports/search", params={"q": "montreal"})
    assert resp.status_code == 200
    codes = [a["iata"] for a in resp.json()]
    assert codes[0] == "YUL"
    assert resp.json()[0]["timezone"] == "America/Toronto"


async def test_airport_autocomplete_exact_iata_first(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/airports/search", params={"q": "cdg"})
    assert resp.json()[0]["iata"] == "CDG"
    assert resp.json()[0]["country_name"] == "France"


async def test_airport_autocomplete_validation(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/airports/search", params={"q": "a"})).status_code == 422
    resp = await client.get("/api/v1/airports/search", params={"q": "zzzzzzzzqq"})
    assert resp.status_code == 200 and resp.json() == []
    # LIKE wildcards are escaped, not interpreted
    assert (await client.get("/api/v1/airports/search", params={"q": "%%"})).json() == []


# --- currencies & destinations ---------------------------------------------------


async def test_currencies(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/currencies")
    assert [c["code"] for c in resp.json()] == ["CAD", "USD", "EUR", "GBP"]


async def test_destinations_localised(client: AsyncClient) -> None:
    en = (await client.get("/api/v1/destinations")).json()
    fr = (await client.get("/api/v1/destinations", params={"locale": "fr"})).json()
    assert len(en) == len(fr) == len(SEED_DESTINATIONS)
    assert len({d["slug"] for d in en}) == len(en)
    london_en = next(d for d in en if d["slug"] == "london")
    london_fr = next(d for d in fr if d["slug"] == "london")
    assert london_en["name"] == "London" and london_fr["name"] == "Londres"
    one = await client.get("/api/v1/destinations/paris", params={"locale": "fr"})
    assert one.status_code == 200 and one.json()["airport_iata"] == "CDG"
    assert (await client.get("/api/v1/destinations/atlantis")).status_code == 404
    assert (await client.get("/api/v1/destinations/BAD_SLUG!")).status_code == 422


async def test_deals_are_demo_labelled(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/deals", params={"origin": "YUL", "currency": "EUR"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_demo"] is True and "demo_data" in body["disclaimers"]
    assert body["deals"] and all(d["is_demo"] for d in body["deals"])
    assert all(d["price"]["currency"] == "EUR" for d in body["deals"])


# --- flight search -------------------------------------------------------------


async def test_flight_search_returns_demo_offers(client: AsyncClient, db) -> None:  # type: ignore[no-untyped-def]
    resp = await client.post("/api/v1/flights/search", json=search_payload())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["is_demo"] is True
    assert body["disclaimers"][0] == "demo_data"
    assert body["origin"]["iata"] == "YUL" and body["destination"]["iata"] == "CDG"
    offers = body["offers"]
    assert len(offers) == 8
    assert all(o["is_demo"] and o["price"]["currency"] == "CAD" for o in offers)
    assert all(o["inbound"] is not None for o in offers)
    prices = [float(o["price"]["amount"]) for o in offers]
    assert prices == sorted(prices)
    # Redirect URLs are never exposed in search results.
    assert "redirect_url" not in offers[0]
    count = await db.scalar(select(func.count()).select_from(FlightSearchEvent))
    assert count == 1


async def test_flight_search_is_deterministic(client: AsyncClient) -> None:
    a = (await client.post("/api/v1/flights/search", json=search_payload())).json()
    b = (await client.post("/api/v1/flights/search", json=search_payload())).json()
    assert [o["id"] for o in a["offers"]] == [o["id"] for o in b["offers"]]
    assert [o["price"] for o in a["offers"]] == [o["price"] for o in b["offers"]]


async def test_one_way_search(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/flights/search",
        json=search_payload(trip_type="one_way", return_date=None, currency="gbp", origin="yqb"),
    )
    assert resp.status_code == 200, resp.text
    assert all(o["inbound"] is None for o in resp.json()["offers"])
    assert resp.json()["currency"] == "GBP"


async def _error_code(client: AsyncClient, **overrides: object) -> tuple[int, str]:
    resp = await client.post("/api/v1/flights/search", json=search_payload(**overrides))
    return resp.status_code, resp.json()["error"]["code"]


async def test_invalid_airports(client: AsyncClient) -> None:
    assert await _error_code(client, origin="ZZQ") == (422, "unknown_airport")
    assert await _error_code(client, origin="12A") == (422, "validation_error")
    assert await _error_code(client, destination="YUL") == (422, "validation_error")


async def test_invalid_dates(client: AsyncClient) -> None:
    assert await _error_code(client, depart_date=future(-5), return_date=future(3)) == (
        422,
        "invalid_date",
    )
    assert await _error_code(client, depart_date=future(10), return_date=future(5)) == (
        422,
        "validation_error",
    )
    assert await _error_code(client, return_date=None) == (422, "validation_error")
    assert await _error_code(client, trip_type="one_way") == (422, "validation_error")
    assert await _error_code(client, depart_date=future(400), return_date=future(401)) == (
        422,
        "invalid_date",
    )
    assert await _error_code(client, depart_date="2026-02-30") == (422, "validation_error")


async def test_unsupported_currency(client: AsyncClient) -> None:
    assert await _error_code(client, currency="JPY") == (422, "unsupported_currency")
    assert await _error_code(client, currency="C4D") == (422, "validation_error")


async def test_passenger_rules(client: AsyncClient) -> None:
    assert await _error_code(client, adults=0) == (422, "validation_error")
    assert await _error_code(client, adults=5, children=5) == (422, "validation_error")
    assert await _error_code(client, adults=1, infants=2) == (422, "validation_error")
    ok = await client.post(
        "/api/v1/flights/search", json=search_payload(adults=2, children=2, infants=1)
    )
    assert ok.status_code == 200


async def test_unknown_fields_rejected(client: AsyncClient) -> None:
    assert await _error_code(client, redirect_url="https://evil.example") == (
        422,
        "validation_error",
    )


async def test_rate_limit_search(client: AsyncClient, settings) -> None:  # type: ignore[no-untyped-def]
    settings.rate_limit_search = "2/60"
    codes = [
        (await client.post("/api/v1/flights/search", json=search_payload())).status_code
        for _ in range(3)
    ]
    assert codes == [200, 200, 429]
    resp = await client.post("/api/v1/flights/search", json=search_payload())
    assert resp.json()["error"]["code"] == "rate_limited"
    assert int(resp.headers["retry-after"]) > 0


async def test_oversized_body_rejected(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/flights/search",
        content=b"{" + b" " * 70_000 + b"}",
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code == 413


async def test_city_names_are_clean_and_locality_is_searchable(client: AsyncClient) -> None:
    paris = (await client.get("/api/v1/airports/search", params={"q": "paris"})).json()
    by_code = {a["iata"]: a for a in paris}
    assert by_code["CDG"]["city"] == "Paris" and by_code["ORY"]["city"] == "Paris"
    roissy = (await client.get("/api/v1/airports/search", params={"q": "roissy"})).json()
    assert roissy[0]["iata"] == "CDG"
