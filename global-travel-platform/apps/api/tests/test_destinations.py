from __future__ import annotations

from httpx import AsyncClient

from app.services.geo import approx_nonstop_minutes, haversine_km


def test_haversine_and_flight_estimate() -> None:
    # Montréal (YUL) -> Paris (CDG) is roughly 5,500 km.
    km = haversine_km(45.4678, -73.7423, 49.0090, 2.5541)
    assert 5400 < km < 5600
    minutes = approx_nonstop_minutes(km)
    assert 6 * 60 < minutes < 8 * 60
    assert minutes % 5 == 0


async def test_destination_facts_and_coordinates(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/destinations/lisbon", params={"locale": "fr"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Lisbonne"
    assert body["currency"] == "EUR" and body["languages"] == ["pt"]
    assert body["best_months"] == [4, 5, 6, 9, 10]
    assert body["timezone"] == "Europe/Lisbon"
    assert -10 < body["longitude"] < -9 and 38 < body["latitude"] < 39
    assert body["distance_km"] is None and body["approx_flight_minutes"] is None


async def test_destinations_with_origin_add_estimates(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/destinations", params={"origin": "yul"})
    assert resp.status_code == 200
    by_slug = {d["slug"]: d for d in resp.json()}
    assert by_slug["paris"]["origin"] == "YUL"
    assert 5400 < by_slug["paris"]["distance_km"] < 5600
    # Farther destination -> longer estimate.
    assert by_slug["bangkok"]["approx_flight_minutes"] > by_slug["paris"]["approx_flight_minutes"]
    assert all(d["latitude"] and d["longitude"] for d in by_slug.values())


async def test_destination_origin_validation(client: AsyncClient) -> None:
    bad = await client.get("/api/v1/destinations/paris", params={"origin": "Y1L"})
    assert bad.status_code == 422
    unknown = await client.get("/api/v1/destinations/paris", params={"origin": "ZZQ"})
    assert unknown.status_code == 200 and unknown.json()["distance_km"] is None


async def test_destination_editorial_content(client: AsyncClient) -> None:
    """History, culture, landmarks and official links flow from seed to API."""
    for locale in ("en", "fr"):
        resp = await client.get("/api/v1/destinations/paris", params={"locale": locale})
        assert resp.status_code == 200
        body = resp.json()
        assert body["history"] and len(body["history"]) > 300
        assert body["culture"] and len(body["culture"]) > 300
        assert 4 <= len(body["landmarks"]) <= 6
        assert all(lm["name"] and lm["description"] for lm in body["landmarks"])
        assert 1 <= len(body["official_links"]) <= 3
        assert all(
            ol["label"] and ol["url"].startswith("https://") for ol in body["official_links"]
        )
    # Localised: the French copy must differ from the English one.
    en = (await client.get("/api/v1/destinations/paris", params={"locale": "en"})).json()
    fr = (await client.get("/api/v1/destinations/paris", params={"locale": "fr"})).json()
    assert en["history"] != fr["history"]
    assert en["landmarks"][0]["name"] != fr["landmarks"][0]["name"]
