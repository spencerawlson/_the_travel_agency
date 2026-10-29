"""Fare-alert push schemas. All endpoints are unauthenticated by design (the
app has no accounts); a device token is the only credential, and it can only
manage its own alerts. Tokens are never echoed back in list responses."""

from __future__ import annotations

import re
import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.providers.base import CabinClass, TripType

IATA = re.compile(r"^[A-Za-z]{3}$")


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class AlertCreateIn(StrictModel):
    push_token: str = Field(min_length=16, max_length=255)
    platform: Literal["ios", "android"] = "ios"
    origin: str = Field(min_length=3, max_length=3)
    destination: str = Field(min_length=3, max_length=3)
    trip_type: TripType = TripType.round_trip
    depart_date: date
    return_date: date | None = None
    adults: int = Field(1, ge=1, le=9)
    children: int = Field(0, ge=0, le=8)
    infants: int = Field(0, ge=0, le=4)
    cabin: CabinClass = CabinClass.economy
    currency: str = Field("CAD", min_length=3, max_length=3)
    target_price: Decimal = Field(gt=0, max_digits=12, decimal_places=2)

    @field_validator("origin", "destination")
    @classmethod
    def _iata(cls, v: str) -> str:
        if not IATA.match(v):
            raise ValueError("must be a 3-letter IATA code")
        return v.upper()

    @field_validator("currency")
    @classmethod
    def _currency(cls, v: str) -> str:
        return v.upper()

    @model_validator(mode="after")
    def _dates_and_pax(self) -> AlertCreateIn:
        if self.trip_type == TripType.round_trip and self.return_date is None:
            raise ValueError("return_date is required for round trips")
        if self.trip_type == TripType.one_way and self.return_date is not None:
            raise ValueError("return_date must be empty for one-way trips")
        if self.return_date is not None and self.return_date < self.depart_date:
            raise ValueError("return_date must be on or after depart_date")
        if self.origin == self.destination:
            raise ValueError("origin and destination must differ")
        if self.infants > self.adults:
            raise ValueError("infants cannot exceed adults")
        return self


class AlertCancelIn(StrictModel):
    push_token: str = Field(min_length=16, max_length=255)


class AlertOut(BaseModel):
    id: uuid.UUID
    origin: str
    destination: str
    trip_type: TripType
    depart_date: date
    return_date: date | None
    cabin: CabinClass
    currency: str
    target_price: Decimal
    is_active: bool


class AlertListOut(BaseModel):
    alerts: list[AlertOut]
