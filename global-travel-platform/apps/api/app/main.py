from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import admin, public
from app.core.cache import get_cache, init_cache
from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.core.logging import configure_logging
from app.core.middleware import RequestContextMiddleware
from app.db.session import dispose_engine
from app.providers.registry import get_registry, init_registry

logger = logging.getLogger("app")


def _init_sentry(dsn: str | None, environment: str, release: str) -> None:
    if not dsn:
        return
    import sentry_sdk

    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        release=release,
        traces_sample_rate=0.05,
        send_default_pii=False,  # privacy-by-design: no IPs, cookies or bodies
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    init_cache(settings.redis_url)
    init_registry(settings.enabled_providers)
    logger.info(
        "startup",
        extra={
            "environment": settings.environment,
            "providers": settings.enabled_providers,
            "referrals_live_enabled": settings.referrals_live_enabled,
        },
    )
    yield
    await get_registry().close()
    await get_cache().close()
    await dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level, settings.log_json)
    _init_sentry(settings.sentry_dsn, settings.environment, settings.app_version)

    docs = settings.enable_docs and not settings.is_production
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description=(
            "Phase 1 foundation of a travel search & affiliate referral platform. "
            "Flight results come from a clearly labelled DEMO provider; no bookings, "
            "payments or ticketing happen on this platform."
        ),
        lifespan=lifespan,
        docs_url="/api/docs" if docs else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if docs else None,
    )
    install_error_handlers(app)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-CSRF-Token", "X-Request-ID"],
        max_age=600,
    )
    app.add_middleware(RequestContextMiddleware)

    v1 = APIRouter(prefix="/api/v1")
    v1.include_router(public.router)
    v1.include_router(admin.router)
    app.include_router(v1)
    return app


app = create_app()
