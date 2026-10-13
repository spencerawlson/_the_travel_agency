"""Provider abstraction. Every affiliate integration (mock, Travelpayouts, ...)
implements `FlightProvider`. The search service never talks to a partner
directly, so adding a provider requires no change outside this package."""

from __future__ import annotations

import abc
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CabinClass(StrEnum):
    economy = "economy"
    premium_economy = "premium_economy"
    business = "business"
    first = "first"


class TripType(StrEnum):
    one_way = "one_way"
    round_trip = "round_trip"


class AirportRef(BaseModel):
    """Resolved airport passed to providers (validated against our database)."""

    iata: str
    name: str
    city: str
    country_code: str
    latitude: float
    longitude: float
    timezone: str


class FlightSearchRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    origin: AirportRef
    destination: AirportRef
    trip_type: TripType
    depart_date: date
    return_date: date | None
    adults: int
    children: int
    infants: int
    cabin: CabinClass
    currency: str
    locale: str

    @property
    def passengers(self) -> int:
        return self.adults + self.children + self.infants


class Money(BaseModel):
    amount: Decimal
    currency: str


class FlightSegment(BaseModel):
    carrier_code: str
    carrier_name: str
    flight_number: str
    origin: str
    destination: str
    depart_at: datetime  # timezone-aware, origin local time
    arrive_at: datetime  # timezone-aware, destination local time
    duration_minutes: int


class FlightSlice(BaseModel):
    segments: list[FlightSegment]
    duration_minutes: int

    @property
    def stops(self) -> int:
        return max(0, len(self.segments) - 1)


class FlightOffer(BaseModel):
    """Internal offer. `redirect_url` stays server-side (cached) and is never
    sent to browsers in search results; clients reference offers by `id`."""

    id: str
    provider_code: str
    is_demo: bool
    price: Money
    cabin: CabinClass
    outbound: FlightSlice
    inbound: FlightSlice | None = None
    seller_name: str
    seller_type: Literal["airline", "agency", "demo"]
    redirect_url: str
    fetched_at: datetime
    expires_at: datetime
    notes: list[str] = Field(default_factory=list)


class AffiliateRedirect(BaseModel):
    url: str
    provider_code: str
    is_demo: bool
    seller_name: str


class ProviderErrorKind(StrEnum):
    timeout = "timeout"
    unavailable = "unavailable"
    rate_limited = "rate_limited"
    bad_response = "bad_response"
    configuration = "configuration"
    unsupported_route = "unsupported_route"


class ProviderError(Exception):
    def __init__(
        self, provider_code: str, kind: ProviderErrorKind, message: str, *, retryable: bool = False
    ) -> None:
        super().__init__(message)
        self.provider_code = provider_code
        self.kind = kind
        self.message = message
        self.retryable = retryable


class FlightProvider(abc.ABC):
    code: str
    display_name: str
    is_demo: bool

    @abc.abstractmethod
    async def search(self, request: FlightSearchRequest) -> list[FlightOffer]:
        """Return offers or raise ProviderError. Must not raise other exceptions
        for expected partner failures (timeouts, 5xx, malformed payloads)."""

    @abc.abstractmethod
    def build_redirect(self, offer: FlightOffer) -> AffiliateRedirect:
        """Turn a cached offer into the partner redirect. URLs must come from
        the partner (or, for demo providers, an internal demo page)."""

    async def close(self) -> None:  # pragma: no cover - default no-op
        return None
