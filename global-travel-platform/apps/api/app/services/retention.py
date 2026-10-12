"""Data retention: delete records older than their configured retention period.
Run daily (cron / scheduled job): `python -m app.cli purge-expired`."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, cast

from sqlalchemy import CursorResult, Delete, delete, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import (
    AdminSession,
    AuditLog,
    FlightSearchEvent,
    ReferralClickEvent,
    SystemErrorEvent,
)
from app.services.audit import audit


async def purge_expired(session: AsyncSession, *, now: datetime | None = None) -> dict[str, int]:
    s = get_settings()
    now = now or datetime.now(UTC)
    counts: dict[str, int] = {}

    async def _purge(name: str, stmt: Delete) -> None:
        result = cast(CursorResult[Any], await session.execute(stmt))
        counts[name] = result.rowcount or 0

    # Clicks first: they reference search events (FK is SET NULL, but deleting
    # older clicks first keeps the counts intuitive).
    await _purge(
        "referral_click_events",
        delete(ReferralClickEvent).where(
            ReferralClickEvent.created_at < now - timedelta(days=s.retention_click_events_days)
        ),
    )
    await _purge(
        "flight_search_events",
        delete(FlightSearchEvent).where(
            FlightSearchEvent.created_at < now - timedelta(days=s.retention_search_events_days)
        ),
    )
    await _purge(
        "system_error_events",
        delete(SystemErrorEvent).where(
            SystemErrorEvent.created_at < now - timedelta(days=s.retention_error_events_days)
        ),
    )
    await _purge(
        "audit_logs",
        delete(AuditLog).where(
            AuditLog.created_at < now - timedelta(days=s.retention_audit_logs_days)
        ),
    )
    await _purge(
        "admin_sessions",
        delete(AdminSession).where(
            or_(AdminSession.expires_at < now, AdminSession.revoked_at.is_not(None))
        ),
    )
    audit(session, "retention.purge", actor_label="system", details=counts)
    await session.commit()
    return counts
