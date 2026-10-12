"""Deterministic DEMO provider for Phase 1.

* Fares are synthetic, generated from a hash of the search parameters, so the
  same search always returns the same results (stable tests and screenshots).
* Carriers are fictional ("Demo ..."), with codes that are not real IATA codes.
* Every offer has is_demo=True and its redirect goes to an INTERNAL demo page,
  never to a real booking site. No production booking link is fabricated.
* Fares are generated directly in the requested currency with an independent
  seed per currency; no exchange rate is implied or invented.
"""

from __future__ import annotations

import hashlib
import math
import random
from datetime import UTC, date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

from app.providers.base import (
    AffiliateRedirect,
    AirportRef,
    CabinClass,
    FlightOffer,
    FlightProvider,
    FlightSearchRequest,
    FlightSegment,
    FlightSlice,
    Money,
    TripType,
)

DEMO_CARRIERS = [
    ("DMA", "Demo Aurora Air"),
    ("DMB", "Demo Boreal Airways"),
    ("DMC", "Demo Cardinal Jet"),
    ("DMD", "Demo Delta-Wing Express"),
]
DEMO_REDIRECT_PATH = "/demo/partner"

_CABIN_MULTIPLIER = {
    CabinClass.economy: 1.0,
    CabinClass.premium_economy: 1.7,
    CabinClass.business: 3.6,
    CabinClass.first: 5.5,
}


def great_circle_km(a: AirportRef, b: AirportRef) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (a.latitude, a.longitude, b.latitude, b.longitude))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def _seed(*parts: object) -> int:
    digest = hashlib.sha256("|".join(str(p) for p in parts).encode()).digest()
    return int.from_bytes(digest[:8], "big")


class MockFlightProvider(FlightProvider):
    code = "mock"
    display_name = "Demo Provider (sample data)"
    is_demo = True

    def __init__(self, offers_per_search: int = 8) -> None:
        self.offers_per_search = offers_per_search

    async def search(self, request: FlightSearchRequest) -> list[FlightOffer]:
        rng = random.Random(
            _seed(
                request.origin.iata,
                request.destination.iata,
                request.depart_date,
                request.return_date,
                request.cabin,
                request.currency,
                request.adults,
                request.children,
                request.infants,
            )
        )
        distance = great_circle_km(request.origin, request.destination)
        now = datetime.now(UTC)
        offers: list[FlightOffer] = []
        for idx in range(self.offers_per_search):
            carrier = DEMO_CARRIERS[rng.randrange(len(DEMO_CARRIERS))]
            stops = (
                0 if distance < 1500 else rng.choice([0, 0, 1, 1, 2] if distance > 7000 else [0, 1])
            )
            outbound = self._slice(
                rng, carrier, request.origin, request.destination, request.depart_date, stops
            )
            inbound = None
            if request.trip_type == TripType.round_trip and request.return_date:
                inbound = self._slice(
                    rng, carrier, request.destination, request.origin, request.return_date, stops
                )
            price = self._price(rng, request, distance, stops)
            offer_id = hashlib.sha256(
                f"mock|{request.model_dump_json()}|{idx}".encode()
            ).hexdigest()[:32]
            offers.append(
                FlightOffer(
                    id=offer_id,
                    provider_code=self.code,
                    is_demo=True,
                    price=Money(amount=price, currency=request.currency),
                    cabin=request.cabin,
                    outbound=outbound,
                    inbound=inbound,
                    seller_name=f"{carrier[1]} (demo)",
                    seller_type="demo",
                    redirect_url=f"{DEMO_REDIRECT_PATH}?{urlencode({'offer': offer_id})}",
                    fetched_at=now,
                    expires_at=now + timedelta(minutes=30),
                    notes=["demo_fare"],  # localised by the web app,
                )
            )
        offers.sort(key=lambda o: o.price.amount)
        return offers

    def build_redirect(self, offer: FlightOffer) -> AffiliateRedirect:
        return AffiliateRedirect(
            url=offer.redirect_url,
            provider_code=self.code,
            is_demo=True,
            seller_name=offer.seller_name,
        )

    # -- helpers ---------------------------------------------------------------

    def _price(
        self, rng: random.Random, req: FlightSearchRequest, distance: float, stops: int
    ) -> Decimal:
        base = 60 + distance * rng.uniform(0.07, 0.13)
        base *= _CABIN_MULTIPLIER[req.cabin] * (0.92 if stops else 1.0)
        if req.trip_type == TripType.round_trip:
            base *= 1.8
        per_pax = req.adults + 0.75 * req.children + 0.1 * req.infants
        return Decimal(str(base * per_pax)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)

    def _slice(
        self,
        rng: random.Random,
        carrier: tuple[str, str],
        origin: AirportRef,
        destination: AirportRef,
        day: date,
        stops: int,
    ) -> FlightSlice:
        total_km = great_circle_km(origin, destination)
        leg_km = total_km / (stops + 1)
        tz_origin = ZoneInfo(origin.timezone)
        depart = datetime.combine(
            day, time(hour=rng.randint(6, 21), minute=rng.choice([0, 15, 30, 45])), tz_origin
        )
        segments: list[FlightSegment] = []
        cursor = depart.astimezone(UTC)
        for leg in range(stops + 1):
            minutes = int(30 + leg_km / 800 * 60)
            leg_origin = origin.iata if leg == 0 else f"X{leg:02d}"
            leg_dest = destination.iata if leg == stops else f"X{leg + 1:02d}"
            arrive = cursor + timedelta(minutes=minutes)
            segments.append(
                FlightSegment(
                    carrier_code=carrier[0],
                    carrier_name=carrier[1],
                    flight_number=f"{carrier[0]}{rng.randint(100, 9899)}",
                    origin=leg_origin,
                    destination=leg_dest,
                    depart_at=cursor.astimezone(tz_origin if leg == 0 else UTC),
                    arrive_at=arrive.astimezone(
                        ZoneInfo(destination.timezone) if leg == stops else UTC
                    ),
                    duration_minutes=minutes,
                )
            )
            cursor = arrive + timedelta(minutes=rng.randint(55, 170))  # layover
        total = int((segments[-1].arrive_at - segments[0].depart_at).total_seconds() // 60)
        return FlightSlice(segments=segments, duration_minutes=total)
