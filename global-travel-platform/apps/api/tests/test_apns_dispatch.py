"""APNs dispatcher tests. The HTTP layer is a mock transport — no Apple
endpoint is ever contacted — and the .p8 key is generated fresh per test."""

from __future__ import annotations

import base64
import json
from datetime import date
from decimal import Decimal

import httpx
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from app.db.session import get_sessionmaker
from app.models.push import PushDevice
from app.services.apns_dispatch import (
    ApnsConfigError,
    build_provider_jwt,
    dispatch_pending,
)
from app.services.fare_alerts import PendingNotification


def _key_file(tmp_path):  # type: ignore[no-untyped-def]
    key = ec.generate_private_key(ec.SECP256R1())
    pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    path = tmp_path / "AuthKey_TEST1234.p8"
    path.write_bytes(pem)
    return str(path)


def _settings_with_key(settings, key_path):  # type: ignore[no-untyped-def]
    settings.apns_key_id = "TEST1234"
    settings.apns_team_id = "TEAM123456"
    settings.apns_bundle_id = "com.farelune.app"
    settings.apns_key_path = key_path
    settings.apns_use_sandbox = True
    return settings


def _note(token: str, platform: str = "ios") -> PendingNotification:
    return PendingNotification(
        alert_id="alert-1",
        push_token=token,
        platform=platform,
        origin="YUL",
        destination="CDG",
        depart_date=date(2026, 12, 10),
        price=Decimal("649.00"),
        currency="CAD",
    )


def _mock_client(handler):  # type: ignore[no-untyped-def]
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def test_jwt_header_carries_key_id(settings, tmp_path):  # type: ignore[no-untyped-def]
    _settings_with_key(settings, _key_file(tmp_path))
    token = build_provider_jwt(settings)
    header_b64 = token.split(".")[0]
    header = json.loads(base64.urlsafe_b64decode(header_b64 + "=="))
    assert header["alg"] == "ES256"
    assert header["kid"] == "TEST1234"


async def test_send_success_counts_sent(settings, tmp_path):  # type: ignore[no-untyped-def]
    _settings_with_key(settings, _key_file(tmp_path))
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        assert request.headers["apns-topic"] == "com.farelune.app"
        assert request.headers["apns-push-type"] == "alert"
        assert request.headers["authorization"].startswith("bearer ")
        return httpx.Response(200, json={})

    async with get_sessionmaker()() as session:
        result = await dispatch_pending(
            session, settings, [_note("token-abc")], client=_mock_client(handler)
        )
    assert result.sent == 1
    assert result.failed == 0
    assert len(seen) == 1


async def test_gone_token_deletes_device(settings, tmp_path, db):  # type: ignore[no-untyped-def]
    _settings_with_key(settings, _key_file(tmp_path))
    db.add(PushDevice(push_token="token-gone", platform="ios"))
    await db.commit()

    async def run():  # type: ignore[no-untyped-def]
        async with get_sessionmaker()() as session:
            return await dispatch_pending(
                session,
                settings,
                [_note("token-gone")],
                client=_mock_client(lambda r: httpx.Response(410, json={})),
            )

    result = await run()
    assert result.devices_removed == 1
    async with get_sessionmaker()() as session:
        from sqlalchemy import select

        remaining = (
            await session.scalars(
                select(PushDevice).where(PushDevice.push_token == "token-gone")
            )
        ).first()
    assert remaining is None


async def test_bad_device_token_deletes_device(settings, tmp_path, db):  # type: ignore[no-untyped-def]
    _settings_with_key(settings, _key_file(tmp_path))
    db.add(PushDevice(push_token="token-bad", platform="ios"))
    await db.commit()
    async with get_sessionmaker()() as session:
        result = await dispatch_pending(
            session,
            settings,
            [_note("token-bad")],
            client=_mock_client(
                lambda r: httpx.Response(400, json={"reason": "BadDeviceToken"})
            ),
        )
    assert result.devices_removed == 1


async def test_other_400_does_not_delete_device(settings, tmp_path, db):  # type: ignore[no-untyped-def]
    _settings_with_key(settings, _key_file(tmp_path))
    db.add(PushDevice(push_token="token-kept", platform="ios"))
    await db.commit()
    async with get_sessionmaker()() as session:
        result = await dispatch_pending(
            session,
            settings,
            [_note("token-kept")],
            client=_mock_client(
                lambda r: httpx.Response(400, json={"reason": "BadCollapseId"})
            ),
        )
    assert result.failed == 1
    assert result.devices_removed == 0
    async with get_sessionmaker()() as session:
        from sqlalchemy import select

        kept = (
            await session.scalars(
                select(PushDevice).where(PushDevice.push_token == "token-kept")
            )
        ).first()
    assert kept is not None


async def test_non_ios_is_skipped_without_http(settings, tmp_path):  # type: ignore[no-untyped-def]
    _settings_with_key(settings, _key_file(tmp_path))

    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("no HTTP call should happen for a skipped platform")

    async with get_sessionmaker()() as session:
        result = await dispatch_pending(
            session, settings, [_note("token-droid", platform="android")],
            client=_mock_client(handler),
        )
    assert result.skipped == 1
    assert result.sent == 0


async def test_missing_config_raises(settings):  # type: ignore[no-untyped-def]
    settings.apns_key_id = None
    settings.apns_team_id = None
    settings.apns_bundle_id = None
    settings.apns_key_path = None
    async with get_sessionmaker()() as session:
        with pytest.raises(ApnsConfigError):
            await dispatch_pending(session, settings, [_note("token-abc")])
