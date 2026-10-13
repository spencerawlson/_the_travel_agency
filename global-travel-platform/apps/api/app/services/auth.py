"""Administrator authentication: Argon2id passwords, account lockout, and
opaque server-side sessions with a per-session CSRF token."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core import totp
from app.core.config import get_settings
from app.core.errors import AppError, AuthError
from app.core.security import (
    constant_time_equals,
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
OTP_REQUIRED = "Enter the code from your authenticator app"
INVALID_OTP = "Invalid or expired code"


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
    otp: str | None = None,
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

    if user.two_factor_enabled:
        if not otp or not otp.strip():
            # Password was right; ask for the second step (not a failed attempt).
            audit(
                session,
                "admin.login",
                actor_user_id=user.id,
                outcome="denied",
                ip_hash=ip_hash,
                details={"reason": "otp_required"},
            )
            await session.commit()
            raise AuthError(OTP_REQUIRED, code="otp_required")
        method = _check_second_factor(user, otp)
        if method is None:
            user.failed_login_count += 1
            details = {"reason": "bad_otp", "count": user.failed_login_count}
            if user.failed_login_count >= settings.login_max_attempts:
                user.locked_until = now + timedelta(minutes=settings.login_lockout_minutes)
                user.failed_login_count = 0
                details["locked_until"] = user.locked_until.isoformat()
                audit(
                    session,
                    "admin.lockout",
                    actor_user_id=user.id,
                    outcome="success",
                    ip_hash=ip_hash,
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
            raise AuthError(INVALID_OTP, code="invalid_otp")
        if method == "recovery":
            audit(
                session,
                "admin.2fa.recovery_code_used",
                actor_user_id=user.id,
                outcome="success",
                ip_hash=ip_hash,
                details={"remaining": len(user.recovery_code_hashes or [])},
            )

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


def _check_second_factor(user: AdminUser, code: str) -> str | None:
    """'totp' or 'recovery' when the code is valid (and consumes it), else None."""
    if totp.looks_like_recovery_code(code):
        wanted = totp.hash_recovery_code(code)
        hashes = list(user.recovery_code_hashes or [])
        for h in hashes:
            if constant_time_equals(h, wanted):
                hashes.remove(h)
                user.recovery_code_hashes = hashes  # reassign so JSON change is saved
                return "recovery"
        return None
    secret = totp.decrypt_secret(user.totp_secret or "")
    if secret is None:
        return None
    step = totp.verify(secret, code, last_step=user.totp_last_step)
    if step is None:
        return None
    user.totp_last_step = step
    return "totp"


# --- two-step enrolment --------------------------------------------------------


@dataclass
class TwoFactorSetup:
    secret: str
    uri: str
    qr_svg: str


def start_two_factor_setup(admin: AdminUser) -> TwoFactorSetup:
    """New pending secret; becomes active only after a valid code (enable)."""
    if admin.two_factor_enabled:
        raise AppError("Two-step sign-in is already on", code="two_factor_already_enabled")
    secret = totp.new_secret()
    admin.totp_pending_secret = totp.encrypt_secret(secret)
    uri = totp.provisioning_uri(secret, admin.email, "Farelune admin")
    return TwoFactorSetup(secret=secret, uri=uri, qr_svg=totp.qr_svg_data_uri(uri))


def enable_two_factor(admin: AdminUser, code: str) -> list[str]:
    """Confirm the pending secret with a code; return fresh recovery codes (shown once)."""
    if admin.two_factor_enabled:
        raise AppError("Two-step sign-in is already on", code="two_factor_already_enabled")
    secret = totp.decrypt_secret(admin.totp_pending_secret or "")
    if secret is None:
        raise AppError("Start the setup again", code="two_factor_setup_missing")
    step = totp.verify(secret, code, last_step=None)
    if step is None:
        raise AppError(INVALID_OTP, code="invalid_otp")
    codes = totp.new_recovery_codes()
    admin.totp_secret = admin.totp_pending_secret
    admin.totp_pending_secret = None
    admin.totp_last_step = step
    admin.totp_enabled_at = datetime.now(UTC)
    admin.recovery_code_hashes = [totp.hash_recovery_code(c) for c in codes]
    return codes


def disable_two_factor(admin: AdminUser, password: str, code: str) -> None:
    """Turning it off needs the password and a current code (or recovery code)."""
    if not admin.two_factor_enabled:
        raise AppError("Two-step sign-in is not on", code="two_factor_not_enabled")
    if (
        not verify_password(admin.password_hash, password)
        or _check_second_factor(admin, code) is None
    ):
        raise AuthError(INVALID_OTP, code="invalid_otp")
    reset_two_factor(admin)


def reset_two_factor(admin: AdminUser) -> None:
    admin.totp_secret = None
    admin.totp_pending_secret = None
    admin.totp_enabled_at = None
    admin.totp_last_step = None
    admin.recovery_code_hashes = None


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
