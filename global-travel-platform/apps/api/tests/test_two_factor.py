"""Two-step sign-in (TOTP + recovery codes) for administrators."""

from __future__ import annotations

import base64
import types

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core import totp
from app.models import AdminUser, AuditLog

from .conftest import ADMIN_PASSWORD, login

LOGIN = "/api/v1/admin/auth/login"
CREDS = {"email": "admin@example.com", "password": ADMIN_PASSWORD}


# --- the algorithm ---------------------------------------------------------------


def test_rfc6238_reference_vectors() -> None:
    # RFC 6238 appendix B (SHA-1), last 6 of the 8-digit values.
    secret = base64.b32encode(b"12345678901234567890").decode()
    assert totp.code_at(secret, 59) == "287082"
    assert totp.code_at(secret, 1111111109) == "081804"
    assert totp.code_at(secret, 2000000000) == "279037"


def test_verify_window_and_replay() -> None:
    secret = totp.new_secret()
    now = 1_800_000_000.0
    code = totp.code_at(secret, now)
    step = totp.verify(secret, code, last_step=None, now=now)
    assert step == totp.current_step(now)
    assert totp.verify(secret, code, last_step=step, now=now) is None  # no replay
    assert totp.verify(secret, totp.code_at(secret, now - 30), last_step=None, now=now)  # drift
    assert totp.verify(secret, totp.code_at(secret, now - 90), last_step=None, now=now) is None
    assert totp.verify(secret, "12345", last_step=None, now=now) is None


def test_secret_encryption_round_trip(settings) -> None:  # type: ignore[no-untyped-def]
    token = totp.encrypt_secret("JBSWY3DPEHPK3PXP")
    assert "JBSWY3DPEHPK3PXP" not in token
    assert totp.decrypt_secret(token) == "JBSWY3DPEHPK3PXP"
    settings.secret_key = "another-secret-key-that-is-long-enough-123"
    assert totp.decrypt_secret(token) is None


def test_provisioning_uri_and_qr() -> None:
    uri = totp.provisioning_uri("ABC", "a@b.c", "Farelune admin")
    assert uri.startswith("otpauth://totp/Farelune%20admin%3Aa%40b.c?secret=ABC")
    assert totp.qr_svg_data_uri(uri).startswith("data:image/svg+xml")


# --- the API flow ------------------------------------------------------------------


@pytest.fixture
def clock(monkeypatch):  # type: ignore[no-untyped-def]
    """Controllable clock for the TOTP module only."""
    state = {"now": 1_800_000_000.0}
    monkeypatch.setattr(totp, "time", types.SimpleNamespace(time=lambda: state["now"]))
    return state


async def _enrol(client: AsyncClient, clock: dict) -> tuple[str, list[str]]:
    csrf = await login(client)
    h = {"X-CSRF-Token": csrf}
    setup = (await client.post("/api/v1/admin/auth/2fa/setup", headers=h)).json()
    secret = setup["secret"]
    assert setup["otpauth_uri"].startswith("otpauth://totp/")
    assert setup["qr_svg"].startswith("data:image/svg+xml")
    bad = await client.post("/api/v1/admin/auth/2fa/enable", headers=h, json={"code": "000000"})
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "invalid_otp"
    ok = await client.post(
        "/api/v1/admin/auth/2fa/enable", headers=h, json={"code": totp.code_at(secret)}
    )
    assert ok.status_code == 200, ok.text
    codes = ok.json()["recovery_codes"]
    assert len(codes) == 10 and len(set(codes)) == 10
    me = (await client.get("/api/v1/admin/auth/me")).json()
    assert me["user"]["two_factor_enabled"] is True
    await client.post("/api/v1/admin/auth/logout", headers=h)
    clock["now"] += 30  # next code
    return secret, codes


async def test_login_requires_second_step(client: AsyncClient, db, clock) -> None:  # type: ignore[no-untyped-def]
    secret, _ = await _enrol(client, clock)

    first = await client.post(LOGIN, json=CREDS)
    assert first.status_code == 401 and first.json()["error"]["code"] == "otp_required"
    assert "gtp_admin_session" not in first.cookies
    assert (await client.get("/api/v1/admin/auth/me")).status_code == 401

    wrong = await client.post(LOGIN, json={**CREDS, "otp": "123456"})
    assert wrong.status_code == 401 and wrong.json()["error"]["code"] == "invalid_otp"

    code = totp.code_at(secret)
    ok = await client.post(LOGIN, json={**CREDS, "otp": code})
    assert ok.status_code == 200, ok.text
    await client.post(
        "/api/v1/admin/auth/logout", headers={"X-CSRF-Token": ok.json()["csrf_token"]}
    )

    # The same code cannot be used twice.
    replay = await client.post(LOGIN, json={**CREDS, "otp": code})
    assert replay.status_code == 401 and replay.json()["error"]["code"] == "invalid_otp"

    # A wrong password never reaches the second step.
    nope = await client.post(LOGIN, json={**CREDS, "password": "wrong", "otp": code})
    assert nope.json()["error"]["code"] == "invalid_credentials"


async def test_recovery_codes_are_single_use(client: AsyncClient, db, clock) -> None:  # type: ignore[no-untyped-def]
    _, codes = await _enrol(client, clock)
    ok = await client.post(LOGIN, json={**CREDS, "otp": codes[0].lower()})
    assert ok.status_code == 200, ok.text
    await client.post(
        "/api/v1/admin/auth/logout", headers={"X-CSRF-Token": ok.json()["csrf_token"]}
    )
    again = await client.post(LOGIN, json={**CREDS, "otp": codes[0]})
    assert again.status_code == 401
    user = (await db.scalars(select(AdminUser).where(AdminUser.email == "admin@example.com"))).one()
    await db.refresh(user)
    assert len(user.recovery_code_hashes) == 9
    assert all(c.replace("-", "") not in str(user.recovery_code_hashes) for c in codes)
    actions = {a.action for a in (await db.scalars(select(AuditLog))).all()}
    assert {"admin.2fa.enabled", "admin.2fa.recovery_code_used"} <= actions


async def test_wrong_codes_count_toward_lockout(client: AsyncClient, settings, clock) -> None:  # type: ignore[no-untyped-def]
    secret, _ = await _enrol(client, clock)
    for _ in range(settings.login_max_attempts):
        await client.post(LOGIN, json={**CREDS, "otp": "000000"})
    locked = await client.post(LOGIN, json={**CREDS, "otp": totp.code_at(secret)})
    assert locked.status_code == 401
    assert locked.json()["error"]["code"] == "invalid_credentials"  # lock state not revealed


async def test_disable_needs_password_and_code(client: AsyncClient, clock) -> None:  # type: ignore[no-untyped-def]
    secret, _ = await _enrol(client, clock)
    ok = await client.post(LOGIN, json={**CREDS, "otp": totp.code_at(secret)})
    h = {"X-CSRF-Token": ok.json()["csrf_token"]}
    clock["now"] += 30
    bad = await client.post(
        "/api/v1/admin/auth/2fa/disable",
        headers=h,
        json={"password": "wrong", "code": totp.code_at(secret)},
    )
    assert bad.status_code == 401
    good = await client.post(
        "/api/v1/admin/auth/2fa/disable",
        headers=h,
        json={"password": ADMIN_PASSWORD, "code": totp.code_at(secret)},
    )
    assert good.status_code == 204
    await client.post("/api/v1/admin/auth/logout", headers=h)
    assert (await client.post(LOGIN, json=CREDS)).status_code == 200  # password only again


async def test_require_2fa_locks_dashboard_until_enrolled(
    client: AsyncClient, settings, clock
) -> None:  # type: ignore[no-untyped-def]
    settings.admin_require_2fa = True
    csrf = await login(client)
    me = (await client.get("/api/v1/admin/auth/me")).json()
    assert me["two_factor_required"] is True and me["user"]["two_factor_enabled"] is False
    blocked = await client.get("/api/v1/admin/overview")
    assert blocked.status_code == 403 and blocked.json()["error"]["code"] == "two_factor_required"
    h = {"X-CSRF-Token": csrf}
    secret = (await client.post("/api/v1/admin/auth/2fa/setup", headers=h)).json()["secret"]
    await client.post(
        "/api/v1/admin/auth/2fa/enable", headers=h, json={"code": totp.code_at(secret)}
    )
    assert (await client.get("/api/v1/admin/overview")).status_code == 200
