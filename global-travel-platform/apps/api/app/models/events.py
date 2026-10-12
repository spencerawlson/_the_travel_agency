"""Analytics events. Privacy-by-design: no names, emails, documents, payment
data or raw IP addresses. `client_hash` is a daily-rotating keyed hash used
only to count distinct visitors per day; it cannot be reversed or linked
across days."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
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
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, utcnow

SEARCH_STATUSES = ("ok", "no_results", "partial", "provider_error")
CLICK_STATUSES = ("redirected", "blocked_live_disabled", "blocked_host", "expired")
TRIP_TYPES = ("one_way", "round_trip")
CABINS = ("economy", "premium_economy", "business", "first")


def _in(column: str, values: tuple[str, ...], name: str) -> CheckConstraint:
    return CheckConstraint(f"{column} IN ({', '.join(repr(v) for v in values)})", name=name)


class FlightSearchEvent(Base):
    __tablename__ = "flight_search_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False, index=True
    )
    origin_iata: Mapped[str] = mapped_column(String(3), nullable=False)
    destination_iata: Mapped[str] = mapped_column(String(3), nullable=False)
    trip_type: Mapped[str] = mapped_column(String(10), nullable=False)
    depart_date: Mapped[date] = mapped_column(Date, nullable=False)
    return_date: Mapped[date | None] = mapped_column(Date)
    adults: Mapped[int] = mapped_column(Integer, nullable=False)
    children: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    infants: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cabin: Mapped[str] = mapped_column(String(16), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    locale: Mapped[str] = mapped_column(String(8), nullable=False)
    providers: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    result_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    client_hash: Mapped[str | None] = mapped_column(String(32))

    __table_args__ = (
        _in("status", SEARCH_STATUSES, "status_enum"),
        _in("trip_type", TRIP_TYPES, "trip_type_enum"),
        _in("cabin", CABINS, "cabin_enum"),
        CheckConstraint("adults BETWEEN 1 AND 9", name="adults_range"),
        CheckConstraint("children >= 0 AND infants >= 0", name="pax_non_negative"),
        CheckConstraint("return_date IS NULL OR return_date >= depart_date", name="date_order"),
        Index("ix_search_route", "origin_iata", "destination_iata"),
        Index("ix_search_destination_created", "destination_iata", "created_at"),
    )


class ReferralClickEvent(Base):
    __tablename__ = "referral_click_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False, index=True
    )
    search_event_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("flight_search_events.id", ondelete="SET NULL"), index=True
    )
    provider_id: Mapped[int] = mapped_column(
        ForeignKey("affiliate_providers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    offer_id: Mapped[str] = mapped_column(String(64), nullable=False)
    origin_iata: Mapped[str] = mapped_column(String(3), nullable=False)
    destination_iata: Mapped[str] = mapped_column(String(3), nullable=False)
    price_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    price_currency: Mapped[str | None] = mapped_column(String(3))
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False)
    redirect_host: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    locale: Mapped[str] = mapped_column(String(8), nullable=False)
    client_hash: Mapped[str | None] = mapped_column(String(32))

    __table_args__ = (
        _in("status", CLICK_STATUSES, "status_enum"),
        Index("ix_click_route", "origin_iata", "destination_iata"),
    )


class SystemErrorEvent(Base):
    """Server-side errors (unhandled API exceptions, provider failures) for the
    admin dashboard. Messages are truncated and never include request bodies."""

    __tablename__ = "system_error_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False, index=True
    )
    source: Mapped[str] = mapped_column(String(16), nullable=False)  # api | provider
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    message: Mapped[str] = mapped_column(String(500), nullable=False)
    path: Mapped[str | None] = mapped_column(String(255))
    provider_code: Mapped[str | None] = mapped_column(String(40))
    request_id: Mapped[str | None] = mapped_column(String(64))

    __table_args__ = (_in("source", ("api", "provider"), "source_enum"),)
