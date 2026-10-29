"""Fare-alert push devices and alert rules.

Privacy-by-design: a push token is a per-device routing token, not an
identity — no names, emails, accounts or raw IPs are stored here. Tokens and
alerts are deleted when the user cancels the alert (or the alert expires);
an alert that is never armed by a real device token cannot notify anyone.
APNs dispatch lives in app/services/apns_dispatch.py, run by
`python -m app.cli run-fare-alerts` on a host cron (see docs/fare-alerts.md).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, utcnow
from app.models.events import CABINS, TRIP_TYPES


class PushDevice(TimestampMixin, Base):
    __tablename__ = "push_devices"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # APNs device token (iOS) or FCM token (Android, future). Stored because
    # dispatch needs it; deleted with the device row.
    push_token: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    platform: Mapped[str] = mapped_column(String(16), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    alerts: Mapped[list[FareAlert]] = relationship(back_populates="device")

    __table_args__ = (
        CheckConstraint("platform IN ('ios', 'android', 'web')", name="platform_enum"),
    )


class FareAlert(TimestampMixin, Base):
    __tablename__ = "fare_alerts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    device_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("push_devices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    origin_iata: Mapped[str] = mapped_column(String(3), nullable=False)
    destination_iata: Mapped[str] = mapped_column(String(3), nullable=False)
    trip_type: Mapped[str] = mapped_column(String(10), nullable=False)
    depart_date: Mapped[date] = mapped_column(Date, nullable=False)
    return_date: Mapped[date | None] = mapped_column(Date)
    adults: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    children: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    infants: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cabin: Mapped[str] = mapped_column(String(16), nullable=False, default="economy")
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="CAD")
    # Notify when the cheapest live (non-demo) offer is at or below this.
    target_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Last live price seen by the evaluator; never a demo/cached price.
    last_seen_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Price at which the user was last notified, for the once-per-drop rule.
    last_notified_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    last_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    device: Mapped[PushDevice] = relationship(back_populates="alerts")

    __table_args__ = (
        CheckConstraint(f"trip_type IN ({', '.join(repr(v) for v in TRIP_TYPES)})", name="trip_type_enum"),
        CheckConstraint(f"cabin IN ({', '.join(repr(v) for v in CABINS)})", name="cabin_enum"),
        CheckConstraint("adults BETWEEN 1 AND 9", name="adults_range"),
        CheckConstraint("children >= 0 AND infants >= 0", name="pax_non_negative"),
        CheckConstraint("infants <= adults", name="infants_within_adults"),
        CheckConstraint("target_price > 0", name="target_positive"),
        CheckConstraint("return_date IS NULL OR return_date >= depart_date", name="date_order"),
        Index("ix_alert_active_depart", "is_active", "depart_date"),
    )
