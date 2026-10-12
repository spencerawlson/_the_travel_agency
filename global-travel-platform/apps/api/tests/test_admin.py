from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import AdminUser, AffiliateProvider, AuditLog, CommissionReport

from .conftest import ADMIN_PASSWORD, VIEWER_PASSWORD, login, search_payload

ADMIN_GET = [
    "/api/v1/admin/overview",
    "/api/v1/admin/searches",
    "/api/v1/admin/referrals",
    "/api/v1/admin/commissions",
    "/api/v1/admin/audit-logs",
    "/api/v1/admin/auth/me",
]


@pytest.mark.parametrize("path", ADMIN_GET)
async def test_admin_endpoints_require_auth(client: AsyncClient, path: str) -> None:
    resp = await client.get(path)
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "not_authenticated"
    assert resp.headers["cache-control"] == "no-store"


async def test_forged_session_cookie_rejected(client: AsyncClient) -> None:
    client.cookies.set("gtp_admin_session", "forged-token-value", path="/api")
    assert (await client.get("/api/v1/admin/overview")).status_code == 401


async def test_login_sets_secure_cookies(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/admin/auth/login", json={"email": "ADMIN@example.com", "password": ADMIN_PASSWORD}
    )
    assert resp.status_code == 200
    assert resp.json()["user"]["role"] == "admin"
    cookies = resp.headers.get_list("set-cookie")
    session_cookie = next(c for c in cookies if c.startswith("gtp_admin_session="))
    assert "HttpOnly" in session_cookie and "SameSite=strict" in session_cookie
    assert "Path=/api" in session_cookie
    csrf_cookie = next(c for c in cookies if c.startswith("gtp_csrf="))
    assert "HttpOnly" not in csrf_cookie
    assert (await client.get("/api/v1/admin/auth/me")).status_code == 200


async def test_login_failure_is_generic_and_audited(client: AsyncClient, db) -> None:  # type: ignore[no-untyped-def]
    wrong = await client.post(
        "/api/v1/admin/auth/login", json={"email": "admin@example.com", "password": "nope"}
    )
    unknown = await client.post(
        "/api/v1/admin/auth/login", json={"email": "ghost@example.com", "password": "nope"}
    )
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["error"]["message"] == unknown.json()["error"]["message"]
    logs = (await db.scalars(select(AuditLog).where(AuditLog.action == "admin.login"))).all()
    assert [log.outcome for log in logs] == ["failure", "failure"]


async def test_lockout_after_repeated_failures(client: AsyncClient, db, settings) -> None:  # type: ignore[no-untyped-def]
    settings.login_max_attempts = 3
    for _ in range(3):
        await client.post(
            "/api/v1/admin/auth/login", json={"email": "admin@example.com", "password": "bad"}
        )
    # Correct password is refused while locked.
    resp = await client.post(
        "/api/v1/admin/auth/login", json={"email": "admin@example.com", "password": ADMIN_PASSWORD}
    )
    assert resp.status_code == 401
    user = (await db.scalars(select(AdminUser).where(AdminUser.email == "admin@example.com"))).one()
    await db.refresh(user)
    assert user.locked_until is not None


async def test_login_rejects_foreign_origin(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/admin/auth/login",
        json={"email": "admin@example.com", "password": ADMIN_PASSWORD},
        headers={"Origin": "https://evil.example"},
    )
    assert resp.status_code == 403


async def test_login_rate_limited(client: AsyncClient, settings) -> None:  # type: ignore[no-untyped-def]
    settings.rate_limit_login = "2/900"
    codes = [
        (
            await client.post(
                "/api/v1/admin/auth/login", json={"email": "x@example.com", "password": "bad"}
            )
        ).status_code
        for _ in range(3)
    ]
    assert codes == [401, 401, 429]


async def test_logout_requires_csrf_and_revokes(client: AsyncClient) -> None:
    csrf = await login(client)
    assert (await client.post("/api/v1/admin/auth/logout")).status_code == 403
    bad = await client.post("/api/v1/admin/auth/logout", headers={"X-CSRF-Token": "wrong"})
    assert bad.status_code == 403
    ok = await client.post("/api/v1/admin/auth/logout", headers={"X-CSRF-Token": csrf})
    assert ok.status_code == 204
    # The old cookie value no longer works even if replayed.
    assert (await client.get("/api/v1/admin/auth/me")).status_code == 401


async def test_viewer_role_is_restricted(client: AsyncClient, db) -> None:  # type: ignore[no-untyped-def]
    await login(client, "viewer@example.com", VIEWER_PASSWORD)
    assert (await client.get("/api/v1/admin/overview")).status_code == 200
    for path in ("/api/v1/admin/searches", "/api/v1/admin/commissions", "/api/v1/admin/audit-logs"):
        resp = await client.get(path)
        assert resp.status_code == 403, path
    denied = (
        await db.scalars(select(AuditLog).where(AuditLog.action == "admin.access_denied"))
    ).all()
    assert len(denied) == 3


async def test_overview_uses_recorded_events(client: AsyncClient) -> None:
    await login(client)
    empty = (await client.get("/api/v1/admin/overview", params={"days": 7})).json()
    assert empty["totals"]["searches"] == 0
    assert empty["totals"]["click_through_rate"] is None
    assert empty["commissions"] == []
    assert len(empty["trend"]) == 7

    for dest in ("CDG", "CDG", "LHR"):
        await client.post("/api/v1/flights/search", json=search_payload(destination=dest))
    offer = (await client.post("/api/v1/flights/search", json=search_payload())).json()["offers"][0]
    await client.post("/api/v1/referrals/click", json={"offer_id": offer["id"]})

    data = (await client.get("/api/v1/admin/overview", params={"days": 7})).json()
    assert data["totals"]["searches"] == 4
    assert data["totals"]["searches_demo"] == 4
    assert data["totals"]["redirected_clicks"] == 1
    assert data["totals"]["click_through_rate"] == 0.25
    assert data["top_destinations"][0] == {
        "iata": "CDG",
        "city": data["top_destinations"][0]["city"],
        "searches": 3,
    }
    assert data["popular_routes"][0] == {"origin": "YUL", "destination": "CDG", "searches": 3}
    assert data["trend"][-1]["searches"] == 4 and data["trend"][-1]["clicks"] == 1
    assert data["system"]["demo_mode"] is True
    mock = next(p for p in data["providers"] if p["code"] == "mock")
    assert mock["clicks"] == 1


async def test_search_and_referral_lists(client: AsyncClient) -> None:
    await login(client)
    await client.post("/api/v1/flights/search", json=search_payload(destination="LHR"))
    await client.post("/api/v1/flights/search", json=search_payload())
    page = (await client.get("/api/v1/admin/searches", params={"destination": "lhr"})).json()
    assert page["total"] == 1 and page["items"][0]["destination_iata"] == "LHR"
    assert "client_hash" not in page["items"][0]
    refs = (await client.get("/api/v1/admin/referrals")).json()
    assert refs["total"] == 0
    assert (
        await client.get("/api/v1/admin/searches", params={"page_size": 500})
    ).status_code == 422


async def test_commissions_distinguish_statuses(client: AsyncClient, db) -> None:  # type: ignore[no-untyped-def]
    provider = (await db.scalars(select(AffiliateProvider))).first()
    now = datetime.now(UTC)
    for i, (status, amount) in enumerate(
        [
            ("estimated", "10.00"),
            ("pending", "5.50"),
            ("approved", "7.25"),
            ("rejected", "3.00"),
            ("paid", "12.00"),
            ("paid", "1.00"),
        ]
    ):
        db.add(
            CommissionReport(
                id=uuid.uuid4(),
                provider_id=provider.id,
                external_reference=f"REF-{i}",
                status=status,
                amount=Decimal(amount),
                currency="CAD",
                reported_at=now - timedelta(days=1),
            )
        )
    await db.commit()
    await login(client)
    body = (await client.get("/api/v1/admin/commissions")).json()
    assert body["total"] == 6
    totals = {t["status"]: t for t in body["totals"]}
    assert set(totals) == {"estimated", "pending", "approved", "rejected", "paid"}
    assert totals["paid"]["count"] == 2 and totals["paid"]["amount"] == "13.00"
    paid = (await client.get("/api/v1/admin/commissions", params={"status": "paid"})).json()
    assert paid["total"] == 2
    bogus = await client.get("/api/v1/admin/commissions", params={"status": "guaranteed"})
    assert bogus.status_code == 422


async def test_audit_log_listing_for_admin(client: AsyncClient) -> None:
    await login(client)
    body = (await client.get("/api/v1/admin/audit-logs")).json()
    assert body["items"][0]["action"] == "admin.login"
