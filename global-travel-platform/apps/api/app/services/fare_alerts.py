"""Fare-alert evaluation.

Runs each active alert's search through the same `search_flights` path the
site uses, then decides whether a push is due. Rules, all deliberate:

- Only LIVE (non-demo) offers count. A demo price must never trigger an
  alert — that would notify the user about a fare that does not exist.
- Prices are normalised to the whole party: a `per_adult` offer is multiplied
  by the alert's adult count; a `total` offer is used as-is.
- Notify at most once per price drop: a push is due only when the cheapest
  live offer is at or below target AND below the price the user was last
  notified about (or no notification has ever been sent for this alert).
- Alerts past their depart date are deactivated, not evaluated.
- This module only DECIDES. It does not send anything: sending is
  app/services/apns_dispatch.py, invoked after this function by
  `python -m app.cli run-fare-alerts` (see docs/fare-alerts.md). The
  returned list is what the dispatcher sends, and the app must not claim
  otherwise until the cron is actually installed on the host.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import utcnow
from app.models.push import FareAlert, PushDevice
from app.providers.base import CabinClass, TripType
from app.schemas.public import FlightSearchIn
from app.services.search import search_flights

logger = logging.getLogger("app.fare_alerts")


@dataclass
class PendingNotification:
    alert_id: str
    push_token: str
    platform: str
    origin: str
    destination: str
    depart_date: date
    price: Decimal
    currency: str


def _total_price(offer_price: Decimal, basis: str, adults: int) -> Decimal:
    return offer_price * adults if basis == "per_adult" else offer_price


async def evaluate_alerts(session: AsyncSession) -> list[PendingNotification]:
    today = utcnow().date()
    rows = (
        await session.scalars(
            select(FareAlert)
            .where(FareAlert.is_active.is_(True))
            .order_by(FareAlert.created_at)
        )
    ).all()
    pending: list[PendingNotification] = []
    for alert in rows:
        if alert.depart_date < today:
            alert.is_active = False
            continue
        try:
            _, _, _, offers, _, _ = await search_flights(
                session,
                FlightSearchIn(
                    origin=alert.origin_iata,
                    destination=alert.destination_iata,
                    trip_type=TripType(alert.trip_type),
                    depart_date=alert.depart_date,
                    return_date=alert.return_date,
                    adults=alert.adults,
                    children=alert.children,
                    infants=alert.infants,
                    cabin=CabinClass(alert.cabin),
                    currency=alert.currency,
                ),
                client_hash=None,
            )
        except Exception:
            logger.warning("fare_alert_eval_failed", extra={"alert_id": str(alert.id)})
            continue
        live = [o for o in offers if not o.is_demo]
        alert.last_checked_at = utcnow()
        if not live:
            continue
        cheapest = min(
            _total_price(o.price.amount, o.price_basis, alert.adults) for o in live
        )
        alert.last_seen_price = cheapest
        if cheapest > alert.target_price:
            continue
        if (
            alert.last_notified_price is not None
            and cheapest >= alert.last_notified_price
        ):
            continue
        device = await session.get(PushDevice, alert.device_id)
        if device is None:
            alert.is_active = False
            continue
        alert.last_notified_price = cheapest
        alert.last_notified_at = utcnow()
        pending.append(
            PendingNotification(
                alert_id=str(alert.id),
                push_token=device.push_token,
                platform=device.platform,
                origin=alert.origin_iata,
                destination=alert.destination_iata,
                depart_date=alert.depart_date,
                price=cheapest,
                currency=alert.currency,
            )
        )
    await session.commit()
    return pending
