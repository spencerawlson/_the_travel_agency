from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_session, require_role
from app.core.cache import get_cache
from app.core.config import get_settings
from app.core.errors import PermissionDeniedError
from app.core.ratelimit import client_ip, rate_limit
from app.core.security import client_hash
from app.db.session import get_db
from app.models import (
    AdminSession,
    AffiliateProvider,
    AuditLog,
    CommissionReport,
    FlightSearchEvent,
    ReferralClickEvent,
)
from app.models.commerce import COMMISSION_STATUSES
from app.providers.registry import get_registry
from app.schemas.admin import (
    AdminUserOut,
    AuditLogOut,
    CommissionOut,
    CommissionPage,
    CommissionTotal,
    LoginIn,
    Page,
    RecoveryCodesOut,
    ReferralEventOut,
    SearchEventOut,
    SessionOut,
    TwoFactorCodeIn,
    TwoFactorDisableIn,
    TwoFactorSetupOut,
)
from app.services import admin_stats
from app.services.audit import audit
from app.services.auth import (
    authenticate,
    disable_two_factor,
    enable_two_factor,
    revoke_session,
    start_two_factor_setup,
)
from app.services.commissions import import_travelpayouts_commissions

router = APIRouter(prefix="/admin", tags=["admin"])
DB = Annotated[AsyncSession, Depends(get_db)]
PageNo = Annotated[int, Query(ge=1, le=10_000)]
PageSize = Annotated[int, Query(ge=1, le=200)]


def _session_out(s: AdminSession, csrf: str | None = None) -> SessionOut:
    return SessionOut(
        user=AdminUserOut(
            id=s.user.id,
            email=s.user.email,
            role=s.user.role,
            last_login_at=s.user.last_login_at,
            two_factor_enabled=s.user.two_factor_enabled,
        ),
        expires_at=s.expires_at,
        csrf_token=csrf,
        two_factor_required=get_settings().admin_require_2fa,
    )


# --- authentication ----------------------------------------------------------


@router.post(
    "/auth/login",
    response_model=SessionOut,
    dependencies=[Depends(rate_limit("login", "rate_limit_login"))],
)
async def login(payload: LoginIn, request: Request, response: Response, session: DB) -> SessionOut:
    settings = get_settings()
    origin = request.headers.get("origin")
    if origin and origin not in settings.cors_origins:
        raise PermissionDeniedError("Origin not allowed", code="origin_rejected")
    issued = await authenticate(
        session,
        payload.email,
        payload.password,
        ip_hash=client_hash(client_ip(request)),
        user_agent=request.headers.get("user-agent"),
        otp=payload.otp,
    )
    max_age = settings.session_ttl_minutes * 60
    response.set_cookie(
        settings.session_cookie_name,
        issued.token,
        max_age=max_age,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        path="/api",
    )
    response.set_cookie(
        settings.csrf_cookie_name,
        issued.csrf_token,
        max_age=max_age,
        httponly=False,  # read by the dashboard and echoed in X-CSRF-Token
        secure=settings.cookie_secure,
        samesite="strict",
        path="/",
    )
    return _session_out(issued.session, issued.csrf_token)


@router.post("/auth/logout", status_code=204)
async def logout(
    response: Response,
    session: DB,
    admin_session: Annotated[AdminSession, Depends(current_session)],
) -> Response:
    await revoke_session(session, admin_session)
    settings = get_settings()
    response.delete_cookie(settings.session_cookie_name, path="/api")
    response.delete_cookie(settings.csrf_cookie_name, path="/")
    response.status_code = 204
    return response


@router.get("/auth/me", response_model=SessionOut)
async def me(admin_session: Annotated[AdminSession, Depends(current_session)]) -> SessionOut:
    return _session_out(admin_session)


Session = Annotated[AdminSession, Depends(current_session)]
LoginLimit = Depends(rate_limit("login", "rate_limit_login"))


@router.post("/auth/2fa/setup", response_model=TwoFactorSetupOut, dependencies=[LoginLimit])
async def two_factor_setup(admin_session: Session, session: DB) -> TwoFactorSetupOut:
    setup = start_two_factor_setup(admin_session.user)
    audit(
        session, "admin.2fa.setup_started", actor_user_id=admin_session.user_id, outcome="success"
    )
    await session.commit()
    return TwoFactorSetupOut(secret=setup.secret, otpauth_uri=setup.uri, qr_svg=setup.qr_svg)


@router.post("/auth/2fa/enable", response_model=RecoveryCodesOut, dependencies=[LoginLimit])
async def two_factor_enable(
    payload: TwoFactorCodeIn, admin_session: Session, session: DB
) -> RecoveryCodesOut:
    codes = enable_two_factor(admin_session.user, payload.code)
    audit(session, "admin.2fa.enabled", actor_user_id=admin_session.user_id, outcome="success")
    await session.commit()
    return RecoveryCodesOut(recovery_codes=codes)


@router.post("/auth/2fa/disable", status_code=204, dependencies=[LoginLimit])
async def two_factor_disable(
    payload: TwoFactorDisableIn, admin_session: Session, session: DB
) -> Response:
    try:
        disable_two_factor(admin_session.user, payload.password, payload.code)
    except Exception:
        audit(session, "admin.2fa.disable", actor_user_id=admin_session.user_id, outcome="failure")
        await session.commit()
        raise
    audit(session, "admin.2fa.disabled", actor_user_id=admin_session.user_id, outcome="success")
    await session.commit()
    return Response(status_code=204)


# --- dashboard ---------------------------------------------------------------


@router.get("/overview", dependencies=[Depends(require_role("viewer"))])
async def overview(session: DB, days: Annotated[int, Query(ge=1, le=365)] = 30) -> dict:
    data = await admin_stats.overview(session, days)
    providers = get_registry().all()
    data["system"] = {
        "database": "ok",
        "redis": "ok" if await get_cache().ping() else "error",
        "enabled_providers": [p.code for p in providers],
        "demo_mode": all(p.is_demo for p in providers),
        "referrals_live_enabled": get_settings().referrals_live_enabled,
        "environment": get_settings().environment,
        "version": get_settings().app_version,
    }
    return data


def _paginate(stmt: Select, page: int, page_size: int) -> Select:
    return stmt.offset((page - 1) * page_size).limit(page_size)


@router.get(
    "/searches",
    response_model=Page[SearchEventOut],
    dependencies=[Depends(require_role("analyst"))],
)
async def searches(
    session: DB,
    page: PageNo = 1,
    page_size: PageSize = 50,
    date_from: date | None = None,
    date_to: date | None = None,
    origin: Annotated[str | None, Query(pattern=r"^[A-Za-z]{3}$")] = None,
    destination: Annotated[str | None, Query(pattern=r"^[A-Za-z]{3}$")] = None,
    status: Literal["ok", "no_results", "partial", "provider_error"] | None = None,
) -> Page[SearchEventOut]:
    S = FlightSearchEvent
    start, end = admin_stats.date_range(date_from, date_to)
    filters = []
    if start:
        filters.append(S.created_at >= start)
    if end:
        filters.append(S.created_at < end)
    if origin:
        filters.append(S.origin_iata == origin.upper())
    if destination:
        filters.append(S.destination_iata == destination.upper())
    if status:
        filters.append(S.status == status)
    total = await session.scalar(select(func.count()).select_from(S).where(*filters))
    rows = await session.scalars(
        _paginate(select(S).where(*filters).order_by(S.created_at.desc()), page, page_size)
    )
    return Page[SearchEventOut](
        items=[SearchEventOut.model_validate(r) for r in rows],
        total=int(total or 0),
        page=page,
        page_size=page_size,
    )


@router.get(
    "/referrals",
    response_model=Page[ReferralEventOut],
    dependencies=[Depends(require_role("analyst"))],
)
async def referrals(
    session: DB,
    page: PageNo = 1,
    page_size: PageSize = 50,
    date_from: date | None = None,
    date_to: date | None = None,
    provider: Annotated[str | None, Query(max_length=40)] = None,
    status: Literal["redirected", "blocked_live_disabled", "blocked_host", "expired"] | None = None,
) -> Page[ReferralEventOut]:
    C, P = ReferralClickEvent, AffiliateProvider
    start, end = admin_stats.date_range(date_from, date_to)
    filters = []
    if start:
        filters.append(C.created_at >= start)
    if end:
        filters.append(C.created_at < end)
    if provider:
        filters.append(P.code == provider)
    if status:
        filters.append(C.status == status)
    base = select(C, P.code).join(P, P.id == C.provider_id).where(*filters)
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    rows = (
        await session.execute(_paginate(base.order_by(C.created_at.desc()), page, page_size))
    ).all()
    items = [
        ReferralEventOut.model_validate(
            {
                **{k: getattr(c, k) for k in ReferralEventOut.model_fields if hasattr(c, k)},
                "provider_code": code,
            }
        )
        for c, code in rows
    ]
    return Page[ReferralEventOut](
        items=items, total=int(total or 0), page=page, page_size=page_size
    )


@router.get(
    "/commissions",
    response_model=CommissionPage,
    dependencies=[Depends(require_role("analyst"))],
)
async def commissions(
    session: DB,
    page: PageNo = 1,
    page_size: PageSize = 50,
    status: Annotated[
        str | None, Query(pattern="^(" + "|".join(COMMISSION_STATUSES) + ")$")
    ] = None,
    provider: Annotated[str | None, Query(max_length=40)] = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> CommissionPage:
    R, P = CommissionReport, AffiliateProvider
    start, end = admin_stats.date_range(date_from, date_to)
    filters = []
    if status:
        filters.append(R.status == status)
    if provider:
        filters.append(P.code == provider)
    if start:
        filters.append(R.reported_at >= start)
    if end:
        filters.append(R.reported_at < end)
    base = select(R, P.code).join(P, P.id == R.provider_id).where(*filters)
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    rows = (
        await session.execute(_paginate(base.order_by(R.reported_at.desc()), page, page_size))
    ).all()
    totals_rows = (
        await session.execute(
            select(R.status, R.currency, func.count(), func.coalesce(func.sum(R.amount), 0))
            .join(P, P.id == R.provider_id)
            .where(*filters)
            .group_by(R.status, R.currency)
        )
    ).all()
    return CommissionPage(
        items=[
            CommissionOut(
                id=r.id,
                provider_code=code,
                referral_click_id=r.referral_click_id,
                external_reference=r.external_reference,
                status=r.status,
                amount=r.amount,
                currency=r.currency,
                booking_date=r.booking_date,
                period_start=r.period_start,
                period_end=r.period_end,
                reported_at=r.reported_at,
                source=r.source,
            )
            for r, code in rows
        ],
        total=int(total or 0),
        page=page,
        page_size=page_size,
        totals=[
            CommissionTotal(
                status=s, currency=c, count=n, amount=Decimal(a).quantize(Decimal("0.01"))
            )
            for s, c, n, a in totals_rows
        ],
    )


@router.post(
    "/commissions/import",
    dependencies=[Depends(rate_limit("commission_import", "rate_limit_login"))],
)
async def import_commissions(
    session: DB,
    admin_session: Annotated[AdminSession, Depends(require_role("admin"))],
    days: Annotated[int, Query(ge=1, le=730)] = 90,
) -> dict:
    """Pull earnings from Travelpayouts now (admin only; CSRF-protected POST)."""
    result = await import_travelpayouts_commissions(
        session, days=days, actor_user_id=admin_session.user_id
    )
    return result.as_dict()


@router.get(
    "/audit-logs",
    response_model=Page[AuditLogOut],
    dependencies=[Depends(require_role("admin"))],
)
async def audit_logs(
    session: DB,
    page: PageNo = 1,
    page_size: PageSize = 50,
    action: Annotated[str | None, Query(max_length=64)] = None,
) -> Page[AuditLogOut]:
    filters = [AuditLog.action == action] if action else []
    total = await session.scalar(select(func.count()).select_from(AuditLog).where(*filters))
    rows = await session.scalars(
        _paginate(select(AuditLog).where(*filters).order_by(AuditLog.id.desc()), page, page_size)
    )
    return Page[AuditLogOut](
        items=[AuditLogOut.model_validate(r) for r in rows],
        total=int(total or 0),
        page=page,
        page_size=page_size,
    )
