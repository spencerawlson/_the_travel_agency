"""Dashboard aggregates computed from stored events only. Nothing here is
estimated or synthesised: empty tables produce zeros and empty lists."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AffiliateProvider,
    Airport,
    City,
    CommissionReport,
    FlightSearchEvent,
    ReferralClickEvent,
    SystemErrorEvent,
)


def _rate(numerator: int, denominator: int) -> float | None:
    return round(numerator / denominator, 4) if denominator else None


async def overview(session: AsyncSession, days: int) -> dict[str, Any]:
    since = datetime.now(UTC) - timedelta(days=days)
    S, C = FlightSearchEvent, ReferralClickEvent

    searches = await session.scalar(
        select(func.count()).select_from(S).where(S.created_at >= since)
    )
    searches_demo = await session.scalar(
        select(func.count()).select_from(S).where(S.created_at >= since, S.is_demo.is_(True))
    )
    clicks_by_status = dict(
        (
            await session.execute(
                select(C.status, func.count()).where(C.created_at >= since).group_by(C.status)
            )
        ).all()
    )
    redirected = int(clicks_by_status.get("redirected", 0))
    total_clicks = int(sum(clicks_by_status.values()))
    visitors = await session.scalar(
        select(func.count(func.distinct(S.client_hash))).where(
            S.created_at >= since, S.client_hash.is_not(None)
        )
    )

    commission_rows = (
        await session.execute(
            select(
                CommissionReport.status,
                CommissionReport.currency,
                func.count(),
                func.coalesce(func.sum(CommissionReport.amount), 0),
            )
            .where(CommissionReport.reported_at >= since)
            .group_by(CommissionReport.status, CommissionReport.currency)
        )
    ).all()
    commissions = [
        {
            "status": s,
            "currency": cur,
            "count": n,
            "amount": str(Decimal(amt).quantize(Decimal("0.01"))),
        }
        for s, cur, n, amt in commission_rows
    ]
    converted = sum(n for s, _, n, _ in commission_rows if s in ("approved", "paid"))

    top_destinations = [
        {"iata": iata, "city": city, "searches": n}
        for iata, city, n in (
            await session.execute(
                select(S.destination_iata, City.name, func.count().label("n"))
                .join(Airport, Airport.iata_code == S.destination_iata)
                .join(City, City.id == Airport.city_id)
                .where(S.created_at >= since)
                .group_by(S.destination_iata, City.name)
                .order_by(func.count().desc(), S.destination_iata)
                .limit(10)
            )
        ).all()
    ]
    popular_routes = [
        {"origin": o, "destination": d, "searches": n}
        for o, d, n in (
            await session.execute(
                select(S.origin_iata, S.destination_iata, func.count())
                .where(S.created_at >= since)
                .group_by(S.origin_iata, S.destination_iata)
                .order_by(func.count().desc(), S.origin_iata, S.destination_iata)
                .limit(10)
            )
        ).all()
    ]

    search_days: dict[Any, int] = dict(
        (
            await session.execute(
                select(func.date(S.created_at), func.count())
                .where(S.created_at >= since)
                .group_by(func.date(S.created_at))
            )
        ).all()
    )
    click_days: dict[Any, int] = dict(
        (
            await session.execute(
                select(func.date(C.created_at), func.count())
                .where(C.created_at >= since)
                .group_by(func.date(C.created_at))
            )
        ).all()
    )
    today = datetime.now(UTC).date()
    trend = []
    for offset in range(days - 1, -1, -1):
        d = today - timedelta(days=offset)
        trend.append(
            {
                "date": d.isoformat(),
                "searches": int(search_days.get(d) or search_days.get(d.isoformat()) or 0),
                "clicks": int(click_days.get(d) or click_days.get(d.isoformat()) or 0),
            }
        )

    provider_rows = (
        await session.scalars(select(AffiliateProvider).order_by(AffiliateProvider.code))
    ).all()
    provider_clicks = dict(
        (
            await session.execute(
                select(C.provider_id, func.count())
                .where(C.created_at >= since)
                .group_by(C.provider_id)
            )
        ).all()
    )
    provider_errors = dict(
        (
            await session.execute(
                select(SystemErrorEvent.provider_code, func.count())
                .where(SystemErrorEvent.created_at >= since, SystemErrorEvent.source == "provider")
                .group_by(SystemErrorEvent.provider_code)
            )
        ).all()
    )
    providers = [
        {
            "code": p.code,
            "name": p.name,
            "status": p.status,
            "is_demo": p.is_demo,
            "agreement_verified": p.agreement_verified,
            "clicks": int(provider_clicks.get(p.id, 0)),
            "errors": int(provider_errors.get(p.code, 0)),
        }
        for p in provider_rows
    ]

    E = SystemErrorEvent
    errors_by_code = [
        {"source": src, "code": code, "count": n}
        for src, code, n in (
            await session.execute(
                select(E.source, E.code, func.count())
                .where(E.created_at >= since)
                .group_by(E.source, E.code)
                .order_by(func.count().desc())
                .limit(10)
            )
        ).all()
    ]
    recent_errors = [
        {
            "created_at": e.created_at,
            "source": e.source,
            "code": e.code,
            "message": e.message,
            "path": e.path,
            "provider_code": e.provider_code,
        }
        for e in (await session.scalars(select(E).order_by(E.created_at.desc()).limit(10))).all()
    ]

    return {
        "period_days": days,
        "generated_at": datetime.now(UTC),
        "totals": {
            "searches": int(searches or 0),
            "searches_demo": int(searches_demo or 0),
            "referral_clicks": total_clicks,
            "redirected_clicks": redirected,
            "approx_unique_daily_visitors": int(visitors or 0),
            "click_through_rate": _rate(redirected, int(searches or 0)),
            "click_to_commission_rate": _rate(converted, redirected),
        },
        "click_statuses": {k: int(v) for k, v in clicks_by_status.items()},
        "commissions": commissions,
        "top_destinations": top_destinations,
        "popular_routes": popular_routes,
        "trend": trend,
        "providers": providers,
        "errors": {
            "total": sum(e["count"] for e in errors_by_code),
            "by_code": errors_by_code,
            "recent": recent_errors,
        },
    }


def date_range(
    date_from: date | None, date_to: date | None
) -> tuple[datetime | None, datetime | None]:
    start = datetime.combine(date_from, datetime.min.time(), UTC) if date_from else None
    end = (
        datetime.combine(date_to + timedelta(days=1), datetime.min.time(), UTC) if date_to else None
    )
    return start, end
