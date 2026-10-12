"""Public (unauthenticated) API request/response schemas."""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.providers.base import CabinClass, TripType

IATA = re.compile(r"^[A-Za-z]{3}$")
Locale = Literal["en", "fr"]
SUPPORTED_LOCALES: tuple[str, ...] = ("en", "fr")


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# --- health ----------------------------------------------------------------


class HealthOut(BaseModel):
    status: Literal["ok", "degraded"]
    version: str
    environment: str
    checks: dict[str, str]
    demo_mode: bool
    referrals_live_enabled: bool


# --- reference data ----------------------------------------------------------


class AirportOut(BaseModel):
    iata: str
    name: str
    city: str
    country_code: str
    country_name: str
    timezone: str


class CurrencyOut(BaseModel):
    code: str
    name: str
    symbol: str
    minor_units: int


class DestinationOut(BaseModel):
    slug: str
    name: str
    summary: str
    description: str
    highlights: list[str]
    city: str
    country_code: str
    airport_iata: str
    tags: list[str]
    theme: str
    latitude: float
    longitude: float
    timezone: str
    best_months: list[int]
    currency: str | None
    languages: list[str]
    origin: str | None = None
    distance_km: int | None = None
    approx_flight_minutes: int | None = None


# --- flight search -------------------------------------------------------


class FlightSearchIn(StrictModel):
    origin: str = Field(description="Origin IATA airport code", examples=["YUL"])
    destination: str = Field(description="Destination IATA airport code", examples=["CDG"])
    trip_type: TripType = TripType.round_trip
    depart_date: date
    return_date: date | None = None
    adults: int = Field(1, ge=1, le=9)
    children: int = Field(0, ge=0, le=8)
    infants: int = Field(0, ge=0, le=4)
    cabin: CabinClass = CabinClass.economy
    currency: str = Field("CAD", min_length=3, max_length=3)
    locale: Locale = "en"

    @field_validator("origin", "destination")
    @classmethod
    def _iata(cls, v: str) -> str:
        if not IATA.match(v):
            raise ValueError("must be a 3-letter IATA airport code")
        return v.upper()

    @field_validator("currency")
    @classmethod
    def _currency(cls, v: str) -> str:
        if not v.isalpha():
            raise ValueError("must be an ISO 4217 code")
        return v.upper()

    @model_validator(mode="after")
    def _cross_field(self) -> FlightSearchIn:
        if self.origin == self.destination:
            raise ValueError("origin and destination must differ")
        if self.trip_type == TripType.round_trip and self.return_date is None:
            raise ValueError("return_date is required for round trips")
        if self.trip_type == TripType.one_way and self.return_date is not None:
            raise ValueError("return_date must be empty for one-way trips")
        if self.return_date is not None and self.return_date < self.depart_date:
            raise ValueError("return_date must be on or after depart_date")
        if self.adults + self.children + self.infants > 9:
            raise ValueError("a maximum of 9 passengers is allowed")
        if self.infants > self.adults:
            raise ValueError("each infant must be accompanied by an adult")
        return self


class MoneyOut(BaseModel):
    amount: Decimal
    currency: str


class SegmentOut(BaseModel):
    carrier_code: str
    carrier_name: str
    flight_number: str
    origin: str
    destination: str
    depart_at: datetime
    arrive_at: datetime
    duration_minutes: int


class SliceOut(BaseModel):
    segments: list[SegmentOut]
    duration_minutes: int
    stops: int


class OfferOut(BaseModel):
    id: str
    provider_code: str
    provider_name: str
    is_demo: bool
    price: MoneyOut
    cabin: CabinClass
    outbound: SliceOut
    inbound: SliceOut | None
    seller_name: str
    seller_type: str
    expires_at: datetime
    notes: list[str]


class ProviderStatusOut(BaseModel):
    code: str
    name: str
    is_demo: bool
    status: Literal["ok", "error"]
    error: str | None = None
    result_count: int = 0


class FlightSearchOut(BaseModel):
    search_id: uuid.UUID
    is_demo: bool
    currency: str
    origin: AirportOut
    destination: AirportOut
    offers: list[OfferOut]
    providers: list[ProviderStatusOut]
    disclaimers: list[str]


# --- referrals ---------------------------------------------------------------


class ReferralClickIn(StrictModel):
    offer_id: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    locale: Locale = "en"


class ReferralClickOut(BaseModel):
    click_id: uuid.UUID
    redirect_url: str
    is_demo: bool
    provider_name: str
    seller_name: str
    notice: str


# --- deals -------------------------------------------------------------------


class DealOut(BaseModel):
    destination_slug: str
    destination_name: str
    origin: str
    destination: str
    depart_date: date
    return_date: date
    price: MoneyOut
    is_demo: bool


class DealsOut(BaseModel):
    is_demo: bool
    origin: str
    currency: str
    deals: list[DealOut]
    disclaimers: list[str]
