"""Currencies, exchange rates, affiliate providers, and commission reports."""

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
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, utcnow

PROVIDER_STATUSES = ("inactive", "sandbox", "live")
COMMISSION_STATUSES = ("estimated", "pending", "approved", "rejected", "paid")
COMMISSION_SOURCES = ("manual", "provider_api", "csv_import")


def _enum_check(column: str, values: tuple[str, ...], name: str) -> CheckConstraint:
    quoted = ", ".join(f"'{v}'" for v in values)
    return CheckConstraint(f"{column} IN ({quoted})", name=name)


class Currency(Base):
    __tablename__ = "currencies"

    code: Mapped[str] = mapped_column(String(3), primary_key=True)  # ISO 4217
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    symbol: Mapped[str] = mapped_column(String(8), nullable=False)
    minor_units: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=100)

    __table_args__ = (
        CheckConstraint("length(code) = 3", name="code_len"),
        CheckConstraint("minor_units BETWEEN 0 AND 4", name="minor_units_range"),
    )


class ExchangeRateRecord(Base):
    """A rate published by a named, verifiable source. Rates are never invented:
    nothing is seeded, and conversion is refused when no record exists."""

    __tablename__ = "exchange_rate_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    base_currency: Mapped[str] = mapped_column(ForeignKey("currencies.code"), nullable=False)
    quote_currency: Mapped[str] = mapped_column(ForeignKey("currencies.code"), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False)
    source: Mapped[str] = mapped_column(String(120), nullable=False)
    effective_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    __table_args__ = (
        CheckConstraint("rate > 0", name="rate_positive"),
        CheckConstraint("base_currency <> quote_currency", name="distinct_pair"),
        UniqueConstraint(
            "base_currency", "quote_currency", "effective_at", "source", name="uq_fx_pair_time_src"
        ),
        Index("ix_fx_pair_effective", "base_currency", "quote_currency", "effective_at"),
    )


class AffiliateProvider(TimestampMixin, Base):
    __tablename__ = "affiliate_providers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="flights")
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="inactive")
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    website: Mapped[str | None] = mapped_column(String(255))
    # Exact hostnames a provider-generated redirect may point to (open-redirect guard).
    allowed_redirect_hosts: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    agreement_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    agreement_reference: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        _enum_check("status", PROVIDER_STATUSES, "status_enum"),
        # A live, non-demo provider requires a verified partner agreement.
        CheckConstraint(
            "status <> 'live' OR is_demo OR agreement_verified", name="live_requires_agreement"
        ),
    )


class CommissionReport(TimestampMixin, Base):
    """Commission lines reported by a partner (or entered manually).
    A referral click does NOT imply a commission; rows exist only when reported."""

    __tablename__ = "commission_reports"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    provider_id: Mapped[int] = mapped_column(
        ForeignKey("affiliate_providers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    referral_click_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("referral_click_events.id", ondelete="SET NULL"), index=True
    )
    external_reference: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(ForeignKey("currencies.code"), nullable=False)
    booking_date: Mapped[date | None] = mapped_column(Date)
    period_start: Mapped[date | None] = mapped_column(Date)
    period_end: Mapped[date | None] = mapped_column(Date)
    reported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="manual")
    notes: Mapped[str | None] = mapped_column(Text)

    provider: Mapped[AffiliateProvider] = relationship()

    __table_args__ = (
        _enum_check("status", COMMISSION_STATUSES, "status_enum"),
        _enum_check("source", COMMISSION_SOURCES, "source_enum"),
        CheckConstraint("amount >= 0", name="amount_non_negative"),
        CheckConstraint(
            "period_start IS NULL OR period_end IS NULL OR period_end >= period_start",
            name="period_order",
        ),
        UniqueConstraint("provider_id", "external_reference", name="uq_commission_provider_ref"),
        Index("ix_commission_status_reported", "status", "reported_at"),
    )
