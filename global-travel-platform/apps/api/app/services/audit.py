from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import request_id_var
from app.models import AuditLog


def audit(
    session: AsyncSession,
    action: str,
    *,
    actor_user_id: int | None = None,
    actor_label: str | None = None,
    target_type: str | None = None,
    target_id: str | int | None = None,
    outcome: str = "success",
    ip_hash: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    """Stage an audit record in the caller's transaction (committed with it)."""
    session.add(
        AuditLog(
            action=action,
            actor_user_id=actor_user_id,
            actor_label=actor_label,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            outcome=outcome,
            ip_hash=ip_hash,
            request_id=request_id_var.get(),
            details=details or {},
        )
    )
