from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import PermissionDeniedError
from app.core.security import constant_time_equals, sha256_hex
from app.db.session import get_db
from app.models import AdminSession
from app.services.audit import audit
from app.services.auth import has_role, resolve_session

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


async def current_session(
    request: Request, session: AsyncSession = Depends(get_db)
) -> AdminSession:
    settings = get_settings()
    admin_session = await resolve_session(
        session, request.cookies.get(settings.session_cookie_name)
    )
    if request.method in UNSAFE_METHODS:
        # Double-submit CSRF: header must match the token bound to this session.
        header = request.headers.get("x-csrf-token", "")
        if not header or not constant_time_equals(sha256_hex(header), admin_session.csrf_hash):
            raise PermissionDeniedError("CSRF token missing or invalid", code="csrf_failed")
    return admin_session


def require_role(role: str) -> Callable[..., Awaitable[AdminSession]]:
    async def _dep(
        request: Request,
        admin_session: AdminSession = Depends(current_session),
        session: AsyncSession = Depends(get_db),
    ) -> AdminSession:
        if not has_role(admin_session.user.role, role):
            audit(
                session,
                "admin.access_denied",
                actor_user_id=admin_session.user_id,
                outcome="denied",
                target_type="route",
                target_id=request.url.path[:64],
                details={"required_role": role},
            )
            await session.commit()
            raise PermissionDeniedError("Insufficient role for this resource")
        return admin_session

    return _dep
