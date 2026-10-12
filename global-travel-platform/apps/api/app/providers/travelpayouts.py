"""Travelpayouts / Aviasales flight-data provider (real, cached fares).

Uses GET /aviasales/v3/prices_for_dates: prices that Aviasales users found
recently (cached for up to several days). These are NOT live availability:
- prices are per adult, economy, in the requested currency;
- exact schedules, fare rules and the final price are confirmed on Aviasales.
Each offer carries notes so the web app can say so plainly.

Booking links are Aviasales deep links (/search/<route><passenger block>) with
the partner `marker` for commission attribution. They are only ever followed
through the referral endpoint, which validates the host and honours the live
referral kill switch.
"""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import parse_qsl, urlencode
from zoneinfo import ZoneInfo

import httpx

from app.core.cache import get_cache
from app.core.config import get_settings
from app.providers.base import (
    AffiliateRedirect,
    CabinClass,
    FlightOffer,
    FlightProvider,
    FlightSearchRequest,
    FlightSegment,
    FlightSlice,
    Money,
    ProviderError,
    ProviderErrorKind,
    TripType,
)

logger = logging.getLogger("app.providers.travelpayouts")

PRICES_PATH = "/aviasales/v3/prices_for_dates"
AIRLINES_PATH = "/data/en/airlines.json"
RESULT_LIMIT = 30

# Aviasales deep-link class letters (economy has none).
CABIN_LETTER = {
    CabinClass.economy: "",
    CabinClass.premium_economy: "w",
    CabinClass.business: "c",
    CabinClass.first: "f",
}
# /search/ + ORIGIN + DDMM + DEST [+ DDMM] + passenger block [+ ?query]
_LINK_RE = re.compile(
    r"^(?P<route>/search/[A-Z]{3}\d{4}[A-Z]{3}(?:\d{4})?)(?:[wcf]?\d{1,3})?(?P<query>\?.*)?$"
)

# Note codes, localised by the web app.
NOTE_CACHED = "cached_fare"
NOTE_DIFFERENT_DATES = "different_dates"
NOTE_ECONOMY_ONLY = "economy_only"
NOTE_SELLER_ON_PARTNER = "seller_on_partner"


class ProviderConfigError(ValueError):
    pass


def passenger_block(adults: int, children: int, infants: int, cabin: CabinClass) -> str:
    """Encode the party for an Aviasales link: e.g. "1", "21", "101", "c2"."""
    adults = max(1, min(adults, 9))
    children = max(0, min(children, 8, 9 - adults))
    infants = max(0, min(infants, adults))
    return CABIN_LETTER[cabin] + f"{adults}{children}{infants}".rstrip("0")


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


class TravelpayoutsProvider(FlightProvider):
    code = "travelpayouts"
    display_name = "Aviasales (via Travelpayouts)"
    is_demo = False

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        s = get_settings()
        if not s.travelpayouts_api_token or not s.travelpayouts_marker:
            raise ProviderConfigError(
                "travelpayouts provider needs TRAVELPAYOUTS_API_TOKEN and TRAVELPAYOUTS_MARKER"
            )
        self._token = s.travelpayouts_api_token
        self._marker = s.travelpayouts_marker
        self._link_base = s.travelpayouts_link_base.rstrip("/")
        self._market = s.travelpayouts_market
        self._cache_ttl = s.travelpayouts_cache_seconds
        self._client = httpx.AsyncClient(
            base_url=s.travelpayouts_api_base,
            transport=transport,
            timeout=httpx.Timeout(6.0, connect=3.0),
            headers={"X-Access-Token": self._token, "Accept-Encoding": "gzip, deflate"},
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
        )
        self._airlines: dict[str, str] | None = None

    async def close(self) -> None:
        await self._client.aclose()

    # -- API access -----------------------------------------------------------

    async def _get_json(self, path: str, params: dict[str, Any] | None = None) -> Any:
        try:
            resp = await self._client.get(path, params=params)
        except httpx.TimeoutException as exc:
            raise ProviderError(self.code, ProviderErrorKind.timeout, "timed out") from exc
        except httpx.HTTPError as exc:
            raise ProviderError(
                self.code, ProviderErrorKind.unavailable, "connection failed", retryable=True
            ) from exc
        if resp.status_code in (401, 403):
            raise ProviderError(self.code, ProviderErrorKind.configuration, "token rejected")
        if resp.status_code == 429:
            raise ProviderError(
                self.code, ProviderErrorKind.rate_limited, "rate limited", retryable=True
            )
        if resp.status_code >= 500:
            raise ProviderError(
                self.code, ProviderErrorKind.unavailable, f"HTTP {resp.status_code}", retryable=True
            )
        if resp.status_code != 200:
            raise ProviderError(
                self.code, ProviderErrorKind.bad_response, f"HTTP {resp.status_code}"
            )
        try:
            return resp.json()
        except ValueError as exc:
            raise ProviderError(self.code, ProviderErrorKind.bad_response, "invalid JSON") from exc

    async def _prices(self, params: dict[str, str]) -> list[dict[str, Any]]:
        key = "tp:pfd:" + hashlib.sha256(urlencode(sorted(params.items())).encode()).hexdigest()
        cache = get_cache()
        cached = await cache.get_json(key)
        if cached is not None:
            return list(cached)
        body = await self._get_json(PRICES_PATH, params)
        if not isinstance(body, dict) or body.get("success") is not True:
            raise ProviderError(self.code, ProviderErrorKind.bad_response, "unsuccessful response")
        data = body.get("data") or []
        if not isinstance(data, list):
            raise ProviderError(self.code, ProviderErrorKind.bad_response, "unexpected data")
        await cache.set_json(key, data, self._cache_ttl)
        return data

    async def _airline_names(self) -> dict[str, str]:
        if self._airlines is not None:
            return self._airlines
        cache = get_cache()
        cached = await cache.get_json("tp:airlines")
        if cached is None:
            try:
                raw = await self._get_json(AIRLINES_PATH)
                cached = {
                    a["code"]: a.get("name") or a["code"]
                    for a in raw
                    if isinstance(a, dict) and a.get("code")
                }
                await cache.set_json("tp:airlines", cached, 24 * 3600)
            except ProviderError:
                logger.warning("airline_names_unavailable")
                cached = {}
        self._airlines = dict(cached)
        return self._airlines

    # -- search ----------------------------------------------------------------

    def _params(self, req: FlightSearchRequest, *, month: bool) -> dict[str, str]:
        fmt = "%Y-%m" if month else "%Y-%m-%d"
        params = {
            "origin": req.origin.iata,
            "destination": req.destination.iata,
            "departure_at": req.depart_date.strftime(fmt),
            "one_way": "true" if req.trip_type == TripType.one_way else "false",
            "currency": req.currency.lower(),
            "sorting": "price",
            "limit": str(RESULT_LIMIT),
            "unique": "false",
            "direct": "false",
        }
        if req.trip_type == TripType.round_trip and req.return_date:
            params["return_at"] = req.return_date.strftime(fmt)
        if self._market:
            params["market"] = self._market
        return params

    async def search(self, request: FlightSearchRequest) -> list[FlightOffer]:
        tickets = await self._prices(self._params(request, month=False))
        if not tickets:
            # The cache may simply have nothing for those exact days; show the
            # same month instead, clearly marked as different dates.
            tickets = await self._prices(self._params(request, month=True))
        airlines = await self._airline_names()
        offers: list[FlightOffer] = []
        for t in tickets:
            offer = self._to_offer(t, request, airlines)
            if offer is not None:
                offers.append(offer)
        offers.sort(key=lambda o: o.price.amount)
        return offers

    def _to_offer(
        self, t: dict[str, Any], req: FlightSearchRequest, airlines: dict[str, str]
    ) -> FlightOffer | None:
        try:
            price = Decimal(str(t["price"]))
        except (KeyError, InvalidOperation):
            return None
        depart = _parse_dt(t.get("departure_at"))
        if depart is None or price <= 0:
            return None
        round_trip = req.trip_type == TripType.round_trip
        back = _parse_dt(t.get("return_at")) if round_trip else None
        if round_trip and back is None:
            return None

        transfers = int(t.get("transfers") or 0)
        return_transfers = int(t.get("return_transfers") or 0)
        total = int(t.get("duration") or 0)
        to_min = int(t.get("duration_to") or total)
        back_min = int(t.get("duration_back") or 0) if round_trip else 0
        # `duration` includes layovers; split them by stop count per direction.
        layover = max(0, total - to_min - back_min)
        stops_total = transfers + return_transfers
        out_layover = round(layover * transfers / stops_total) if stops_total else 0
        out_minutes = (to_min + out_layover) if round_trip else max(total, to_min)
        back_minutes = back_min + (layover - out_layover)

        code = str(t.get("airline") or "").upper()
        name = airlines.get(code, code or "Airline")
        number = str(t.get("flight_number") or "")
        origin_ap = str(t.get("origin_airport") or req.origin.iata).upper()
        dest_ap = str(t.get("destination_airport") or req.destination.iata).upper()

        def slice_(
            frm: str, to: str, start: datetime, minutes: int, stops: int, tz: str
        ) -> FlightSlice:
            end = (start.astimezone(UTC) + timedelta(minutes=minutes)).astimezone(ZoneInfo(tz))
            return FlightSlice(
                segments=[
                    FlightSegment(
                        carrier_code=code,
                        carrier_name=name,
                        flight_number=f"{code}{number}" if number else code,
                        origin=frm,
                        destination=to,
                        depart_at=start,
                        arrive_at=end,
                        duration_minutes=minutes,
                    )
                ],
                duration_minutes=minutes,
                transfers=stops,
            )

        outbound = slice_(
            origin_ap, dest_ap, depart, out_minutes, transfers, req.destination.timezone
        )
        inbound = (
            slice_(dest_ap, origin_ap, back, back_minutes, return_transfers, req.origin.timezone)
            if round_trip and back is not None
            else None
        )

        notes = [NOTE_CACHED, NOTE_SELLER_ON_PARTNER]
        if depart.date() != req.depart_date or (
            back is not None and req.return_date and back.date() != req.return_date
        ):
            notes.append(NOTE_DIFFERENT_DATES)
        if req.cabin != CabinClass.economy:
            notes.append(NOTE_ECONOMY_ONLY)

        link = self._booking_link(str(t.get("link") or ""), req, depart, back)
        now = datetime.now(UTC)
        expires = _parse_dt(t.get("expires_at"))
        offer_id = hashlib.sha256(
            f"tp|{link}|{price}|{t.get('departure_at')}|{t.get('return_at')}".encode()
        ).hexdigest()[:32]
        return FlightOffer(
            id=offer_id,
            provider_code=self.code,
            is_demo=False,
            price=Money(amount=price, currency=req.currency),
            price_basis="per_adult",
            cabin=req.cabin,
            outbound=outbound,
            inbound=inbound,
            # `gate` = the agency whose fare this is; the final seller is chosen on Aviasales.
            seller_name=str(t.get("gate") or "").strip()[:80] or "Aviasales",
            seller_type="agency",
            redirect_url=link,
            fetched_at=now,
            expires_at=min(expires, now + timedelta(hours=6))
            if expires
            else now + timedelta(hours=1),
            notes=notes,
        )

    def _booking_link(
        self, fragment: str, req: FlightSearchRequest, depart: datetime, back: datetime | None
    ) -> str:
        block = passenger_block(req.adults, req.children, req.infants, req.cabin)
        m = _LINK_RE.match(fragment)
        if m:
            path, query = m.group("route") + block, (m.group("query") or "")[1:]
        else:
            # No usable link in the cache row: build the documented route link.
            path = f"/search/{req.origin.iata}{depart:%d%m}{req.destination.iata}"
            if back is not None:
                path += f"{back:%d%m}"
            path += block
            query = ""
        params = [(k, v) for k, v in parse_qsl(query, keep_blank_values=True) if k != "marker"]
        params.append(("marker", self._marker))
        return f"{self._link_base}{path}?{urlencode(params)}"

    def build_redirect(self, offer: FlightOffer) -> AffiliateRedirect:
        return AffiliateRedirect(
            url=offer.redirect_url,
            provider_code=self.code,
            is_demo=False,
            seller_name=offer.seller_name,
        )
