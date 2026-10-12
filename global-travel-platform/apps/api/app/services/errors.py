"""Best-effort persistence of server-side errors for the admin dashboard."""

from __future__ import annotations

import logging

from app.db.session import get_sessionmaker
from app.models import SystemErrorEvent

logger = logging.getLogger("app.errors")


async def record_error(
    *,
    source: str,
    code: str,
    message: str,
    path: str | None = None,
    provider_code: str | None = None,
    request_id: str | None = None,
) -> None:
    try:
        async with get_sessionmaker()() as session:
            session.add(
                SystemErrorEvent(
                    source=source,
                    code=code[:64],
                    message=message[:500],
                    path=(path or "")[:255] or None,
                    provider_code=provider_code,
                    request_id=request_id,
                )
            )
            await session.commit()
    except Exception:  # never let error recording mask the original error
        logger.warning("record_error_failed", exc_info=True)
