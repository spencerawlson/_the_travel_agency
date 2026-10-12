"""Referral click handling with open-redirect prevention.

The browser sends only an offer id. The redirect URL is read from the
server-side offer cache (populated from provider responses) and validated:

* demo providers  -> must be an internal path under /demo/partner
* real providers  -> must be https:// with a host in the provider's allowlist,
                     the provider must be `live` with a verified agreement, and
                     the global REFERRALS_LIVE_ENABLED kill-switch must be on.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from urllib.parse import urlsplit

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.metrics import referral_clicks
from app.models import AffiliateProvider, ReferralClickEvent
from app.providers.base import FlightOffer
from app.providers.mock import DEMO_REDIRECT_PATH
from app.providers.registry import get_registry
from app.services.search import offer_cache_key


class RedirectRejected(Exception):
    pass


def validate_redirect(url: str, *, is_demo: bool, allowed_hosts: list[str]) -> str | None:
    """Return the redirect host (None for internal demo paths) or raise."""
    if any(ch in url for ch in ("\\", "\r", "\n", "\t", " ")):
        raise RedirectRejected("illegal characters")
    parts = urlsplit(url)
    if is_demo:
        if parts.scheme or parts.netloc or url.startswith("//"):
            raise RedirectRejected("demo redirects must be internal")
        if parts.path != DEMO_REDIRECT_PATH:
            raise RedirectRejected("demo redirect path not allowed")
        return None
    if parts.scheme != "https":
        raise RedirectRejected("https required")
    if parts.username or parts.password or parts.port not in (None, 443):
        raise RedirectRejected("credentials/ports not allowed")
    host = (parts.hostname or "").lower().rstrip(".")
    if not host or host not in {h.lower() for h in allowed_hosts}:
        raise RedirectRejected("host not in provider allowlist")
    return host


async def record_click(
    session: AsyncSession, *, offer_id: str, locale: str, client_hash: str | None
) -> tuple[ReferralClickEvent, str, AffiliateProvider, str]:
    cached = await get_cache().get_json(offer_cache_key(offer_id))
    if cached is None:
        referral_clicks.labels("expired").inc()
        raise AppError(
            "This offer has expired. Please search again for current results.",
            code="offer_expired",
            status_code=410,
        )
    offer = FlightOffer.model_validate(cached["offer"])
    provider_row = (
        await session.scalars(
            select(AffiliateProvider).where(AffiliateProvider.code == offer.provider_code)
        )
    ).first()
    provider_impl = get_registry().get(offer.provider_code)
    if provider_row is None or provider_impl is None:
        raise AppError("Provider unavailable", code="provider_unavailable", status_code=409)

    redirect = provider_impl.build_redirect(offer)
    event = ReferralClickEvent(
        id=uuid.uuid4(),
        search_event_id=uuid.UUID(cached["search_event_id"]),
        provider_id=provider_row.id,
        offer_id=offer.id,
        origin_iata=cached["origin"],
        destination_iata=cached["destination"],
        price_amount=Decimal(offer.price.amount),
        price_currency=offer.price.currency,
        is_demo=redirect.is_demo,
        locale=locale,
        client_hash=client_hash,
        status="redirected",
    )

    is_demo = redirect.is_demo and provider_row.is_demo
    live_allowed = (
        get_settings().referrals_live_enabled
        and provider_row.status == "live"
        and provider_row.agreement_verified
    )
    error: AppError | None = None
    if not is_demo and not live_allowed:
        event.status = "blocked_live_disabled"
        error = AppError(
            "Partner referrals are not active yet.", code="referrals_disabled", status_code=403
        )
    else:
        try:
            event.redirect_host = validate_redirect(
                redirect.url,
                is_demo=is_demo,
                allowed_hosts=list(provider_row.allowed_redirect_hosts or []),
            )
        except RedirectRejected:
            event.status = "blocked_host"
            error = AppError(
                "Redirect destination not approved", code="redirect_rejected", status_code=403
            )

    session.add(event)
    await session.commit()
    referral_clicks.labels(event.status).inc()
    if error:
        raise error
    return event, redirect.url, provider_row, redirect.seller_name
