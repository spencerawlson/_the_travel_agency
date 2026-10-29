"""Fare-alert push endpoints.

No accounts exist in this app, so a device token is the only credential: it
can create alerts and cancel only its own. Tokens are never returned in
responses. Alert creation is capped per device so one client cannot farm
the evaluator.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ratelimit import rate_limit
from app.db.session import get_db
from app.models.push import FareAlert, PushDevice
from app.providers.base import CabinClass, TripType
from app.schemas.push import AlertCancelIn, AlertCreateIn, AlertListOut, AlertOut

router = APIRouter()
DB = Annotated[AsyncSession, Depends(get_db)]

MAX_ALERTS_PER_DEVICE = 10


def _out(alert: FareAlert) -> AlertOut:
    return AlertOut(
        id=alert.id,
        origin=alert.origin_iata,
        destination=alert.destination_iata,
        trip_type=TripType(alert.trip_type),
        depart_date=alert.depart_date,
        return_date=alert.return_date,
        cabin=CabinClass(alert.cabin),
        currency=alert.currency,
        target_price=alert.target_price,
        is_active=alert.is_active,
    )


async def _device(session: AsyncSession, token: str, platform: str) -> PushDevice:
    device = (
        await session.scalars(select(PushDevice).where(PushDevice.push_token == token))
    ).first()
    if device is None:
        device = PushDevice(push_token=token, platform=platform)
        session.add(device)
        await session.flush()
    return device


@router.post(
    "/push/alerts",
    response_model=AlertOut,
    tags=["push"],
    dependencies=[Depends(rate_limit("push", "rate_limit_push"))],
)
async def create_alert(payload: AlertCreateIn, session: DB) -> AlertOut:
    device = await _device(session, payload.push_token, payload.platform)
    active = (
        await session.scalars(
            select(FareAlert).where(
                FareAlert.device_id == device.id, FareAlert.is_active.is_(True)
            )
        )
    ).all()
    if len(active) >= MAX_ALERTS_PER_DEVICE:
        from app.core.errors import AppError

        raise AppError("too many active alerts for this device", code="too_many_alerts")
    alert = FareAlert(
        device_id=device.id,
        origin_iata=payload.origin,
        destination_iata=payload.destination,
        trip_type=payload.trip_type.value,
        depart_date=payload.depart_date,
        return_date=payload.return_date,
        adults=payload.adults,
        children=payload.children,
        infants=payload.infants,
        cabin=payload.cabin.value,
        currency=payload.currency,
        target_price=payload.target_price,
    )
    session.add(alert)
    await session.commit()
    return _out(alert)


@router.get(
    "/push/alerts",
    response_model=AlertListOut,
    tags=["push"],
    dependencies=[Depends(rate_limit("push", "rate_limit_push"))],
)
async def list_alerts(
    session: DB, push_token: str = Query(min_length=16, max_length=255)
) -> AlertListOut:
    device = (
        await session.scalars(select(PushDevice).where(PushDevice.push_token == push_token))
    ).first()
    if device is None:
        return AlertListOut(alerts=[])
    rows = (
        await session.scalars(
            select(FareAlert)
            .where(FareAlert.device_id == device.id, FareAlert.is_active.is_(True))
            .order_by(FareAlert.created_at.desc())
        )
    ).all()
    return AlertListOut(alerts=[_out(a) for a in rows])


@router.post(
    "/push/alerts/{alert_id}/cancel",
    tags=["push"],
    dependencies=[Depends(rate_limit("push", "rate_limit_push"))],
)
async def cancel_alert(alert_id: uuid.UUID, payload: AlertCancelIn, session: DB) -> dict:
    device = (
        await session.scalars(
            select(PushDevice).where(PushDevice.push_token == payload.push_token)
        )
    ).first()
    if device is None:
        return {"cancelled": False}
    result = await session.execute(
        delete(FareAlert).where(
            FareAlert.id == alert_id, FareAlert.device_id == device.id
        )
    )
    await session.commit()
    return {"cancelled": result.rowcount > 0}
