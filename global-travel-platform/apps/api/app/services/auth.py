"""Administrator authentication: Argon2id passwords, account lockout, and
opaque server-side sessions with a per-session CSRF token."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.config import get_settings
from app.core.errors import AuthError
from app.core.security import (
    hash_password,
    needs_rehash,
    new_token,
    sha256_hex,
    verify_password,
)
from app.models import AdminSession, AdminUser
from app.services.audit import audit

ROLE_LEVEL = {"viewer": 1, "analyst": 2, "admin": 3}

GENERIC_LOGIN_ERROR = "Invalid email or password"


@dataclass
class IssuedSession:
    token: str
    csrf_token: str
    session: AdminSession


def _aware(dt: datetime) -> datetime:
    # SQLite returns naive datetimes; Postgres returns aware ones.
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


async def authenticate(
    session: AsyncSession,
    email: str,
    password: str,
    *,
    ip_hash: str | None,
    user_agent: str | None,
) -> IssuedSession:
    settings = get_settings()
    now = datetime.now(UTC)
    email = email.strip().lower()
    user = (await session.scalars(select(AdminUser).where(AdminUser.email == email))).first()

    # Always run a hash verification to keep timing uniform.
    password_ok = verify_password(user.password_hash if user else None, password)

    if user is None or not user.is_active:
        audit(
            session,
            "admin.login",
            actor_label=email[:254],
            outcome="failure",
            ip_hash=ip_hash,
            details={"reason": "unknown_or_inactive"},
        )
        await session.commit()
        raise AuthError(GENERIC_LOGIN_ERROR, code="invalid_credentials")

    if user.locked_until and _aware(user.locked_until) > now:
        audit(
            session,
            "admin.login",
            actor_user_id=user.id,
            outcome="denied",
            ip_hash=ip_hash,
            details={"reason": "locked"},
        )
        await session.commit()
        # Same message as bad credentials: do not reveal lock state to attackers.
        raise AuthError(GENERIC_LOGIN_ERROR, code="invalid_credentials")

    if not password_ok:
        user.failed_login_count += 1
        details: dict[str, object] = {"reason": "bad_password", "count": user.failed_login_count}
        if user.failed_login_count >= settings.login_max_attempts:
            user.locked_until = now + timedelta(minutes=settings.login_lockout_minutes)
            user.failed_login_count = 0
            details["locked_until"] = user.locked_until.isoformat()
            audit(
                session, "admin.lockout", actor_user_id=user.id, outcome="success", ip_hash=ip_hash
            )
        audit(
            session,
            "admin.login",
            actor_user_id=user.id,
            outcome="failure",
            ip_hash=ip_hash,
            details=details,
        )
        await session.commit()
        raise AuthError(GENERIC_LOGIN_ERROR, code="invalid_credentials")

    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = now

    token, csrf = new_token(), new_token()
    admin_session = AdminSession(
        token_hash=sha256_hex(token),
        csrf_hash=sha256_hex(csrf),
        user_id=user.id,
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(minutes=settings.session_ttl_minutes),
        ip_hash=ip_hash,
        user_agent=(user_agent or "")[:255] or None,
    )
    session.add(admin_session)
    audit(session, "admin.login", actor_user_id=user.id, outcome="success", ip_hash=ip_hash)
    await session.commit()
    await session.refresh(admin_session, attribute_names=["user"])
    return IssuedSession(token=token, csrf_token=csrf, session=admin_session)


async def resolve_session(session: AsyncSession, token: str | None) -> AdminSession:
    if not token or len(token) > 128:
        raise AuthError("Authentication required")
    settings = get_settings()
    now = datetime.now(UTC)
    row = (
        await session.scalars(
            select(AdminSession)
            .options(joinedload(AdminSession.user))
            .where(AdminSession.token_hash == sha256_hex(token))
        )
    ).first()
    if (
        row is None
        or row.revoked_at is not None
        or _aware(row.expires_at) <= now
        or _aware(row.last_seen_at) + timedelta(minutes=settings.session_idle_minutes) <= now
        or not row.user.is_active
    ):
        raise AuthError("Session expired or invalid")
    # Revoke sessions issued before a password change.
    if _aware(row.created_at) < _aware(row.user.password_changed_at):
        raise AuthError("Session expired or invalid")
    # Throttle last_seen writes to once a minute.
    if now - _aware(row.last_seen_at) > timedelta(seconds=60):
        await session.execute(
            update(AdminSession).where(AdminSession.id == row.id).values(last_seen_at=now)
        )
        await session.commit()
    return row


async def revoke_session(session: AsyncSession, admin_session: AdminSession) -> None:
    admin_session.revoked_at = datetime.now(UTC)
    audit(session, "admin.logout", actor_user_id=admin_session.user_id)
    await session.commit()


def has_role(role: str, required: str) -> bool:
    return ROLE_LEVEL.get(role, 0) >= ROLE_LEVEL[required]
