from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.cache import get_cache
from app.models import AffiliateProvider, ReferralClickEvent
from app.providers.base import AffiliateRedirect, FlightOffer
from app.providers.mock import MockFlightProvider
from app.providers.registry import ProviderRegistry, set_registry
from app.services.referrals import RedirectRejected, validate_redirect
from app.services.search import offer_cache_key

from .conftest import search_payload

ALLOWED = ["partner.example.com"]


@pytest.mark.parametrize(
    "url",
    [
        "https://partner.example.com/book?x=1",
        "https://PARTNER.example.com./path",
    ],
)
def test_redirect_allows_allowlisted_https(url: str) -> None:
    assert validate_redirect(url, is_demo=False, allowed_hosts=ALLOWED) == "partner.example.com"


@pytest.mark.parametrize(
    "url",
    [
        "http://partner.example.com/",  # not https
        "https://evil.example.com/",  # not allowlisted
        "https://partner.example.com.evil.com/",  # suffix trick
        "https://evil.com\\@partner.example.com/",  # backslash confusion
        "https://user:pw@partner.example.com/",  # credentials
        "https://partner.example.com:8443/",  # non-standard port
        "javascript:alert(1)",
        "//partner.example.com/",
        "/demo/partner",  # internal path for a non-demo provider
        "https://partner.example.com/\r\nSet-Cookie: x",
        "",
    ],
)
def test_redirect_rejects_unsafe_live_urls(url: str) -> None:
    with pytest.raises(RedirectRejected):
        validate_redirect(url, is_demo=False, allowed_hosts=ALLOWED)


@pytest.mark.parametrize(
    "url",
    ["https://partner.example.com/", "//evil.com/demo/partner", "/admin", "/demo/partner/../x"],
)
def test_demo_redirect_must_be_internal_demo_page(url: str) -> None:
    with pytest.raises(RedirectRejected):
        validate_redirect(url, is_demo=True, allowed_hosts=ALLOWED)
    assert validate_redirect("/demo/partner?offer=abc", is_demo=True, allowed_hosts=[]) is None


async def _first_offer_id(client: AsyncClient) -> str:
    resp = await client.post("/api/v1/flights/search", json=search_payload())
    return str(resp.json()["offers"][0]["id"])


async def test_referral_click_records_event(client: AsyncClient, db) -> None:  # type: ignore[no-untyped-def]
    offer_id = await _first_offer_id(client)
    resp = await client.post("/api/v1/referrals/click", json={"offer_id": offer_id, "locale": "fr"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["is_demo"] is True
    assert body["redirect_url"].startswith("/demo/partner?offer=")
    assert body["notice"] == "demo_redirect"
    event = (await db.scalars(select(ReferralClickEvent))).one()
    assert event.status == "redirected" and event.locale == "fr"
    assert event.origin_iata == "YUL" and event.search_event_id is not None
    assert event.client_hash and len(event.client_hash) == 32  # hashed, never a raw IP
    assert "203.0.113.10" not in event.client_hash


async def test_referral_unknown_offer_expired(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/referrals/click", json={"offer_id": "deadbeefdeadbeef"})
    assert resp.status_code == 410
    assert resp.json()["error"]["code"] == "offer_expired"


async def test_referral_rejects_client_supplied_url(client: AsyncClient) -> None:
    offer_id = await _first_offer_id(client)
    resp = await client.post(
        "/api/v1/referrals/click",
        json={"offer_id": offer_id, "redirect_url": "https://evil.example"},
    )
    assert resp.status_code == 422
    bad = await client.post("/api/v1/referrals/click", json={"offer_id": "../../etc/passwd"})
    assert bad.status_code == 422


async def test_tampered_cache_redirect_is_blocked(client: AsyncClient, db) -> None:  # type: ignore[no-untyped-def]
    """Even if a provider (or cache) yields a hostile URL, it is not followed."""
    offer_id = await _first_offer_id(client)
    cache = get_cache()
    entry = await cache.get_json(offer_cache_key(offer_id))
    entry["offer"]["redirect_url"] = "https://evil.example/phish"
    await cache.set_json(offer_cache_key(offer_id), entry, 60)
    resp = await client.post("/api/v1/referrals/click", json={"offer_id": offer_id})
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "redirect_rejected"
    event = (await db.scalars(select(ReferralClickEvent))).one()
    assert event.status == "blocked_host"


class FakeLiveProvider(MockFlightProvider):
    """Pretends to be a real partner (non-demo) to exercise the kill-switch."""

    code = "mock"
    is_demo = False

    def build_redirect(self, offer: FlightOffer) -> AffiliateRedirect:
        return AffiliateRedirect(
            url="https://partner.example.com/b?x=1",
            provider_code="mock",
            is_demo=False,
            seller_name="Partner",
        )


async def test_live_referrals_blocked_by_kill_switch(client: AsyncClient, db, settings) -> None:  # type: ignore[no-untyped-def]
    set_registry(ProviderRegistry([FakeLiveProvider()]))
    provider = (
        await db.scalars(select(AffiliateProvider).where(AffiliateProvider.code == "mock"))
    ).one()
    provider.is_demo = False
    await db.commit()
    try:
        offer_id = await _first_offer_id(client)
        resp = await client.post("/api/v1/referrals/click", json={"offer_id": offer_id})
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "referrals_disabled"

        # Enabling the env flag alone is not enough: agreement must be verified too.
        settings.referrals_live_enabled = True
        resp = await client.post("/api/v1/referrals/click", json={"offer_id": offer_id})
        assert resp.json()["error"]["code"] == "referrals_disabled"

        provider.agreement_verified = True
        provider.status = "live"
        provider.allowed_redirect_hosts = ["partner.example.com"]
        await db.commit()
        resp = await client.post("/api/v1/referrals/click", json={"offer_id": offer_id})
        assert resp.status_code == 200, resp.text
        assert resp.json()["redirect_url"] == "https://partner.example.com/b?x=1"
        statuses = sorted(e.status for e in (await db.scalars(select(ReferralClickEvent))).all())
        assert statuses == ["blocked_live_disabled", "blocked_live_disabled", "redirected"]
    finally:
        provider.is_demo, provider.agreement_verified = True, False
        provider.status, provider.allowed_redirect_hosts = "sandbox", []
        await db.commit()
