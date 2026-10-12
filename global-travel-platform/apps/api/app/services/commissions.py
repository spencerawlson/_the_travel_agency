"""Import affiliate earnings from the Travelpayouts Statistics API.

POST /statistics/v1/execute_query returns every "action" on the account:
tool loads (init_tool), clicks (redirect) and bookings. Only actions that
represent earnings are imported: anything with a booking state or a non-zero
profit. Rows are upserted by (provider, action_id), so a booking that moves
from processing to paid updates the same commission line.

Amounts are imported in USD, exactly as Travelpayouts reports them; nothing is
estimated or converted here. Clicks are never treated as revenue.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError
from app.models import AffiliateProvider, CommissionReport
from app.services.audit import audit

logger = logging.getLogger("app.commissions")

QUERY_PATH = "/statistics/v1/execute_query"
PAGE_SIZE = 1000
FIELDS = [
    "action_id",
    "date",
    "type",
    "state",
    "state_updated_at",
    "campaign_name_en",
    "product_type",
    "price_usd",
    "processing_profit_usd",
    "paid_profit_usd",
    "sub_id",
]
# Non-earning action types (tool loads, clicks, searches).
NON_EARNING_TYPES = {"init_tool", "redirect", "click", "search", "view"}

STATE_MAP = {
    "paid": "paid",
    "processing": "pending",
    "pending": "pending",
    "new": "pending",
    "confirmed": "approved",
    "approved": "approved",
    "cancelled": "rejected",
    "canceled": "rejected",
    "declined": "rejected",
    "rejected": "rejected",
}


@dataclass
class ImportResult:
    fetched: int = 0
    earning: int = 0
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    statuses: dict[str, int] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "fetched": self.fetched,
            "earning": self.earning,
            "created": self.created,
            "updated": self.updated,
            "unchanged": self.unchanged,
            "statuses": self.statuses,
        }


def _money(value: Any) -> Decimal:
    try:
        return Decimal(str(value or "0")).quantize(Decimal("0.01"))
    except InvalidOperation:
        return Decimal("0.00")


def _date(value: Any) -> date | None:
    try:
        return date.fromisoformat(str(value)[:10]) if value else None
    except ValueError:
        return None


def map_action(row: dict[str, Any]) -> tuple[str, Decimal] | None:
    """(status, amount) for an earning action, or None to skip it."""
    state = str(row.get("state") or "").strip().lower()
    kind = str(row.get("type") or "").strip().lower()
    processing = _money(row.get("processing_profit_usd"))
    paid = _money(row.get("paid_profit_usd"))
    if kind in NON_EARNING_TYPES and not state and processing == 0 and paid == 0:
        return None
    if not state and processing == 0 and paid == 0:
        return None
    status = STATE_MAP.get(state, "estimated")
    amount = paid if status == "paid" else (processing or paid)
    return status, max(amount, Decimal("0.00"))


async def fetch_actions(
    client: httpx.AsyncClient, token: str, since: date, until: date
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        body = {
            "fields": FIELDS,
            "filters": [
                {"field": "date", "op": "ge", "value": since.isoformat()},
                {"field": "date", "op": "le", "value": until.isoformat()},
            ],
            "sort": [{"field": "date", "order": "asc"}],
            "limit": PAGE_SIZE,
            "offset": offset,
        }
        try:
            resp = await client.post(QUERY_PATH, json=body, headers={"X-Access-Token": token})
        except httpx.HTTPError as exc:
            raise AppError(
                "Travelpayouts statistics are unavailable", code="import_failed", status_code=502
            ) from exc
        if resp.status_code in (401, 403):
            raise AppError("Travelpayouts token rejected", code="import_failed", status_code=502)
        if resp.status_code != 200:
            raise AppError(
                f"Travelpayouts statistics error (HTTP {resp.status_code})",
                code="import_failed",
                status_code=502,
            )
        data = resp.json()
        page = data.get("results") or []
        rows.extend(page)
        total = int(data.get("total_rows") or 0)
        offset += len(page)
        if not page or offset >= total:
            return rows


async def import_travelpayouts_commissions(
    session: AsyncSession,
    *,
    days: int = 90,
    actor_user_id: int | None = None,
    actor_label: str | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
) -> ImportResult:
    s = get_settings()
    if not s.travelpayouts_api_token:
        raise AppError(
            "TRAVELPAYOUTS_API_TOKEN is not configured", code="import_failed", status_code=409
        )
    provider = (
        await session.scalars(
            select(AffiliateProvider).where(AffiliateProvider.code == "travelpayouts")
        )
    ).first()
    if provider is None:
        raise AppError(
            "travelpayouts provider is not seeded", code="import_failed", status_code=409
        )

    until = datetime.now(UTC).date()
    since = until - timedelta(days=days)
    async with httpx.AsyncClient(
        base_url=s.travelpayouts_api_base, transport=transport, timeout=30
    ) as client:
        rows = await fetch_actions(client, s.travelpayouts_api_token, since, until)

    result = ImportResult(fetched=len(rows))
    existing = {
        c.external_reference: c
        for c in (
            await session.scalars(
                select(CommissionReport).where(CommissionReport.provider_id == provider.id)
            )
        ).all()
    }
    now = datetime.now(UTC)
    for row in rows:
        mapped = map_action(row)
        action_id = str(row.get("action_id") or "").strip()
        if mapped is None or not action_id:
            continue
        status, amount = mapped
        result.earning += 1
        result.statuses[status] = result.statuses.get(status, 0) + 1
        notes = (
            f"{row.get('campaign_name_en') or 'Travelpayouts'}"
            f" · {row.get('type') or 'action'}"
            f" · state={row.get('state') or 'n/a'}"
            f" · booking value USD {_money(row.get('price_usd'))}"
        )[:500]
        booked = _date(row.get("date"))
        current = existing.get(action_id)
        if current is None:
            session.add(
                CommissionReport(
                    provider_id=provider.id,
                    external_reference=action_id[:120],
                    status=status,
                    amount=amount,
                    currency="USD",
                    booking_date=booked,
                    reported_at=now,
                    source="provider_api",
                    notes=notes,
                )
            )
            result.created += 1
        elif (current.status, current.amount, current.notes) != (status, amount, notes):
            current.status, current.amount, current.notes = status, amount, notes
            current.reported_at = now
            result.updated += 1
        else:
            result.unchanged += 1

    audit(
        session,
        "commissions.import",
        actor_user_id=actor_user_id,
        actor_label=actor_label,
        target_type="affiliate_provider",
        target_id="travelpayouts",
        details={"days": days, **result.as_dict()},
    )
    await session.commit()
    logger.info("commissions_imported", extra=result.as_dict())
    return result
