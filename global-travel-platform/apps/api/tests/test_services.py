from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.core.config import INSECURE_DEV_SECRET, Settings
from app.core.errors import AppError
from app.core.security import (
    PasswordPolicyError,
    client_hash,
    hash_password,
    validate_password_policy,
    verify_password,
)
from app.models import ExchangeRateRecord, FlightSearchEvent
from app.services.catalog import convert
from app.services.retention import purge_expired
from app.services.text import normalize


def test_password_hash_is_argon2id() -> None:
    h = hash_password("a-very-long-password")
    assert h.startswith("$argon2id$")
    assert verify_password(h, "a-very-long-password")
    assert not verify_password(h, "wrong")
    assert not verify_password(None, "anything")


@pytest.mark.parametrize("pw", ["short", "password1234", "alice-is-great-123"])
def test_password_policy(pw: str) -> None:
    with pytest.raises(PasswordPolicyError):
        validate_password_policy(pw, "alice@example.com")


def test_client_hash_rotates_daily_and_hides_ip() -> None:
    d1 = datetime(2030, 1, 1, tzinfo=UTC)
    a = client_hash("198.51.100.7", now=d1)
    assert a and "198" not in a and len(a) == 32
    assert a == client_hash("198.51.100.7", now=d1)
    assert a != client_hash("198.51.100.7", now=d1 + timedelta(days=1))
    assert client_hash(None) is None


def test_normalize_strips_accents() -> None:
    assert normalize("  Montréal   Trudeau ") == "montreal trudeau"


def test_production_settings_guard() -> None:
    with pytest.raises(ValueError, match="SECRET_KEY"):
        Settings(environment="production", cookie_secure=True, secret_key=INSECURE_DEV_SECRET)
    with pytest.raises(ValueError, match="COOKIE_SECURE"):
        Settings(environment="production", secret_key="x" * 40, cookie_secure=False)
    ok = Settings(
        environment="production",
        secret_key="x" * 40,
        cookie_secure=True,
        cors_origins="https://example.com",
    )  # type: ignore[arg-type]
    assert ok.cors_origins == ["https://example.com"]


async def test_conversion_refuses_without_sourced_rate(db) -> None:  # type: ignore[no-untyped-def]
    with pytest.raises(AppError) as exc:
        await convert(db, Decimal("100"), "CAD", "EUR")
    assert exc.value.code == "exchange_rate_unavailable"
    amount, record = await convert(db, Decimal("100"), "CAD", "CAD")
    assert amount == Decimal("100") and record is None


async def test_conversion_uses_latest_recorded_rate(db) -> None:  # type: ignore[no-untyped-def]
    now = datetime.now(UTC)
    db.add_all(
        [
            ExchangeRateRecord(
                base_currency="CAD",
                quote_currency="EUR",
                rate=Decimal("0.60"),
                source="test-fixture",
                effective_at=now - timedelta(days=2),
            ),
            ExchangeRateRecord(
                base_currency="CAD",
                quote_currency="EUR",
                rate=Decimal("0.65"),
                source="test-fixture",
                effective_at=now - timedelta(days=1),
            ),
        ]
    )
    await db.commit()
    amount, record = await convert(db, Decimal("100"), "CAD", "EUR")
    assert amount == Decimal("65.00") and record is not None and record.source == "test-fixture"


async def test_retention_purges_only_expired(db, settings) -> None:  # type: ignore[no-untyped-def]
    settings.retention_search_events_days = 30
    now = datetime.now(UTC)
    base = dict(
        origin_iata="YUL",
        destination_iata="CDG",
        trip_type="one_way",
        depart_date=now.date(),
        adults=1,
        cabin="economy",
        currency="CAD",
        locale="en",
        providers=["mock"],
        status="ok",
    )
    db.add_all(
        [
            FlightSearchEvent(id=uuid.uuid4(), created_at=now - timedelta(days=31), **base),
            FlightSearchEvent(id=uuid.uuid4(), created_at=now - timedelta(days=5), **base),
        ]
    )
    await db.commit()
    counts = await purge_expired(db)
    assert counts["flight_search_events"] == 1
    assert await db.scalar(select(func.count()).select_from(FlightSearchEvent)) == 1


async def test_cli_disable_admin_revokes_access(client, db) -> None:  # type: ignore[no-untyped-def]
    from app.cli import _set_admin_active
    from app.models import AdminUser

    from .conftest import login

    await login(client, "viewer@example.com", "Viewer-Password-Long-77")
    assert (await client.get("/api/v1/admin/auth/me")).status_code == 200

    assert await _set_admin_active("VIEWER@example.com", False) == "disabled"
    # Existing session is revoked immediately, and new logins are refused.
    assert (await client.get("/api/v1/admin/auth/me")).status_code == 401
    resp = await client.post(
        "/api/v1/admin/auth/login",
        json={"email": "viewer@example.com", "password": "Viewer-Password-Long-77"},
    )
    assert resp.status_code == 401

    assert await _set_admin_active("viewer@example.com", True) == "enabled"
    assert await _set_admin_active("nobody@example.com", False) == "not found"
    user = (
        await db.scalars(select(AdminUser).where(AdminUser.email == "viewer@example.com"))
    ).one()
    await db.refresh(user)
    assert user.is_active
