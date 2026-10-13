from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, utcnow

ROLES = ("viewer", "analyst", "admin")


class AdminUser(TimestampMixin, Base):
    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(
        String(254), nullable=False, unique=True
    )  # stored lower-case
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)  # Argon2id
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="viewer")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    failed_login_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    password_changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    # Two-step sign-in (app/core/totp.py). Secrets are Fernet-encrypted.
    totp_secret: Mapped[str | None] = mapped_column(String(255))
    totp_pending_secret: Mapped[str | None] = mapped_column(String(255))
    totp_enabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    totp_last_step: Mapped[int | None] = mapped_column(Integer)
    recovery_code_hashes: Mapped[list[str] | None] = mapped_column(JSON)

    @property
    def two_factor_enabled(self) -> bool:
        return self.totp_enabled_at is not None and self.totp_secret is not None

    __table_args__ = (
        CheckConstraint(f"role IN ({', '.join(repr(r) for r in ROLES)})", name="role_enum"),
        CheckConstraint("email = lower(email)", name="email_lowercase"),
    )


class AdminSession(Base):
    """Server-side session. Only the SHA-256 of the opaque token is stored, so a
    database leak does not yield usable session tokens."""

    __tablename__ = "admin_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    csrf_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("admin_users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ip_hash: Mapped[str | None] = mapped_column(String(32))
    user_agent: Mapped[str | None] = mapped_column(String(255))

    user: Mapped[AdminUser] = relationship()

    __table_args__ = (Index("ix_admin_sessions_expires", "expires_at"),)


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[object] = mapped_column(JSON, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )
    updated_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL")
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False, index=True
    )
    actor_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"), index=True
    )
    actor_label: Mapped[str | None] = mapped_column(String(254))  # e.g. "cli", email attempted
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    target_type: Mapped[str | None] = mapped_column(String(64))
    target_id: Mapped[str | None] = mapped_column(String(64))
    outcome: Mapped[str] = mapped_column(String(16), nullable=False, default="success")
    ip_hash: Mapped[str | None] = mapped_column(String(32))
    request_id: Mapped[str | None] = mapped_column(String(64))
    details: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    __table_args__ = (
        CheckConstraint("outcome IN ('success', 'failure', 'denied')", name="outcome_enum"),
    )
