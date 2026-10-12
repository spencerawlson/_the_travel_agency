from __future__ import annotations

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Country(Base):
    __tablename__ = "countries"

    code: Mapped[str] = mapped_column(String(2), primary_key=True)  # ISO 3166-1 alpha-2
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    continent: Mapped[str | None] = mapped_column(String(2))

    __table_args__ = (CheckConstraint("length(code) = 2", name="code_len"),)


class City(Base):
    __tablename__ = "cities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    country_code: Mapped[str] = mapped_column(
        ForeignKey("countries.code", ondelete="RESTRICT"), nullable=False, index=True
    )
    timezone: Mapped[str | None] = mapped_column(String(64))  # IANA tz

    country: Mapped[Country] = relationship()

    __table_args__ = (UniqueConstraint("name", "country_code", name="uq_cities_name_country"),)


class Airport(Base):
    __tablename__ = "airports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    iata_code: Mapped[str] = mapped_column(String(3), nullable=False, unique=True)
    icao_code: Mapped[str | None] = mapped_column(String(4))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    city_id: Mapped[int] = mapped_column(
        ForeignKey("cities.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    country_code: Mapped[str] = mapped_column(
        ForeignKey("countries.code", ondelete="RESTRICT"), nullable=False, index=True
    )
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    size: Mapped[str] = mapped_column(String(10), nullable=False, default="medium")
    # Lower-cased, accent-stripped "iata city name country" used for autocomplete.
    search_text: Mapped[str] = mapped_column(String(600), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    city: Mapped[City] = relationship()
    country: Mapped[Country] = relationship()

    __table_args__ = (
        CheckConstraint("length(iata_code) = 3", name="iata_len"),
        CheckConstraint("latitude BETWEEN -90 AND 90", name="lat_range"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="lon_range"),
        CheckConstraint("size IN ('large', 'medium', 'small')", name="size_enum"),
        Index("ix_airports_active_size", "is_active", "size"),
    )


class Destination(TimestampMixin, Base):
    __tablename__ = "destinations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    city_id: Mapped[int] = mapped_column(
        ForeignKey("cities.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    airport_iata: Mapped[str] = mapped_column(
        ForeignKey("airports.iata_code", ondelete="RESTRICT"), nullable=False
    )
    # {"en": {"name":..., "summary":..., "description":..., "highlights":[...]}, "fr": {...}}
    translations: Mapped[dict] = mapped_column(JSON, nullable=False)
    tags: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    theme: Mapped[str] = mapped_column(String(32), nullable=False, default="ocean")
    # Language-neutral travel facts: {"best_months": [4, 5], "currency": "EUR",
    # "languages": ["fr"]}. Month/currency/language names are localised by the web app.
    facts: Mapped[dict] = mapped_column(
        JSON, nullable=False, default=dict, server_default=text("'{}'")
    )
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=100)

    city: Mapped[City] = relationship()
    airport: Mapped[Airport] = relationship()
