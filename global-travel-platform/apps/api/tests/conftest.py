"""Test fixtures.

By default tests run against a temporary SQLite database (fast, no services).
Set TEST_DATABASE_URL=postgresql+psycopg://... to run the same suite against
PostgreSQL (CI does this)."""

from __future__ import annotations

import os
import tempfile
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="gtp-tests-"))
os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", f"sqlite+aiosqlite:///{(_tmp / 'test.db').as_posix()}"
)
os.environ["REDIS_URL"] = ""
os.environ["SECRET_KEY"] = "test-secret-key-for-unit-tests-only-0123456789"
os.environ["CORS_ORIGINS"] = "http://testserver,http://localhost:3000"
os.environ["LOG_JSON"] = "false"
os.environ["LOG_LEVEL"] = "WARNING"
for name in ("SEARCH", "AUTOCOMPLETE", "REFERRAL", "LOGIN", "DEFAULT"):
    os.environ[f"RATE_LIMIT_{name}"] = "10000/60"

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import delete, text  # noqa: E402

from app.core.cache import MemoryCache, set_cache  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.session import get_engine, get_sessionmaker  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import (  # noqa: E402
    AdminSession,
    AdminUser,
    AuditLog,
    CommissionReport,
    ExchangeRateRecord,
    FlightSearchEvent,
    ReferralClickEvent,
    SystemErrorEvent,
)
from app.providers.registry import ProviderRegistry, set_registry  # noqa: E402
from app.seed.seed import seed_reference_data  # noqa: E402

ADMIN_PASSWORD = "Correct-Horse-Battery-42"
VIEWER_PASSWORD = "Viewer-Password-Long-77"


@pytest.fixture(scope="session", autouse=True)
async def database() -> AsyncIterator[None]:
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    async with get_sessionmaker()() as session:
        await seed_reference_data(session)
        session.add_all(
            [
                AdminUser(
                    email="admin@example.com",
                    password_hash=hash_password(ADMIN_PASSWORD),
                    role="admin",
                ),
                AdminUser(
                    email="viewer@example.com",
                    password_hash=hash_password(VIEWER_PASSWORD),
                    role="viewer",
                ),
            ]
        )
        await session.commit()
    yield
    await engine.dispose()


@pytest.fixture(autouse=True)
async def clean_state() -> AsyncIterator[None]:
    """Reset events, sessions, cache and provider registry between tests."""
    set_cache(MemoryCache())
    set_registry(ProviderRegistry.from_codes(["mock"]))
    yield
    async with get_sessionmaker()() as session:
        for model in (
            CommissionReport,
            ReferralClickEvent,
            FlightSearchEvent,
            SystemErrorEvent,
            AuditLog,
            AdminSession,
            ExchangeRateRecord,
        ):
            await session.execute(delete(model))
        await session.execute(
            text(
                "UPDATE admin_users SET failed_login_count = 0, locked_until = NULL,"
                " totp_secret = NULL, totp_pending_secret = NULL, totp_enabled_at = NULL,"
                " totp_last_step = NULL, recovery_code_hashes = NULL"
            )
        )
        await session.commit()


@pytest.fixture(scope="session")
def app():  # type: ignore[no-untyped-def]
    return create_app()


@pytest.fixture
async def client(app) -> AsyncIterator[AsyncClient]:  # type: ignore[no-untyped-def]
    transport = ASGITransport(app=app, client=("203.0.113.10", 50000))
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        yield c


@pytest.fixture
def settings():  # type: ignore[no-untyped-def]
    s = get_settings()
    snapshot = s.model_dump()
    yield s
    for key, value in snapshot.items():
        setattr(s, key, value)


@pytest.fixture
async def db():  # type: ignore[no-untyped-def]
    async with get_sessionmaker()() as session:
        yield session


def future(days: int) -> str:
    return (datetime.now(UTC).date() + timedelta(days=days)).isoformat()


def search_payload(**overrides: object) -> dict:
    payload: dict[str, object] = {
        "origin": "YUL",
        "destination": "CDG",
        "trip_type": "round_trip",
        "depart_date": future(30),
        "return_date": future(37),
        "adults": 1,
        "children": 0,
        "infants": 0,
        "cabin": "economy",
        "currency": "CAD",
        "locale": "en",
    }
    payload.update(overrides)
    return payload


async def login(
    client: AsyncClient, email: str = "admin@example.com", password: str = ADMIN_PASSWORD
) -> str:
    resp = await client.post(
        "/api/v1/admin/auth/login", json={"email": email, "password": password}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["csrf_token"]


__all__ = ["date", "future", "login", "search_payload"]
