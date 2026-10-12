"""Travelpayouts commission import (Statistics API mocked)."""

from __future__ import annotations

import json
from decimal import Decimal

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import AuditLog, CommissionReport
from app.services import commissions as commissions_mod
from app.services.commissions import import_travelpayouts_commissions, map_action

from .conftest import ADMIN_PASSWORD, VIEWER_PASSWORD, login


def row(action_id: str, **kw: object) -> dict:
    r: dict = {
        "action_id": action_id,
        "date": "2026-10-10",
        "type": "booking",
        "state": "processing",
        "campaign_name_en": "Aviasales",
        "price_usd": "640.00",
        "processing_profit_usd": "5.40",
        "paid_profit_usd": "0.00",
        "sub_id": "",
    }
    r.update(kw)
    return r


def test_map_action() -> None:
    assert map_action(row("a", type="init_tool", state="", processing_profit_usd="0")) is None
    assert map_action(row("a", type="redirect", state="", processing_profit_usd="0")) is None
    assert map_action(row("a")) == ("pending", Decimal("5.40"))
    assert map_action(row("a", state="paid", paid_profit_usd="12.00")) == ("paid", Decimal("12.00"))
    assert map_action(row("a", state="cancelled", processing_profit_usd="0")) == (
        "rejected",
        Decimal("0.00"),
    )
    # Unknown state with profit: kept, but only as an estimate.
    assert map_action(row("a", state="weird")) == ("estimated", Decimal("5.40"))


class FakeStats:
    def __init__(self, pages: list[list[dict]]) -> None:
        self.pages = pages
        self.bodies: list[dict] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        assert request.headers["x-access-token"] == "test-token"
        body = json.loads(request.content)
        self.bodies.append(body)
        page = self.pages[len(self.bodies) - 1] if len(self.bodies) <= len(self.pages) else []
        total = sum(len(p) for p in self.pages)
        return httpx.Response(200, json={"results": page, "total_rows": str(total)})


@pytest.fixture
def tp(settings):  # type: ignore[no-untyped-def]
    settings.travelpayouts_api_token = "test-token"
    return settings


async def test_import_upserts_and_is_idempotent(db, tp) -> None:  # type: ignore[no-untyped-def]
    stats = FakeStats(
        [
            [
                row("init-1", type="init_tool", state="", processing_profit_usd="0"),
                row("click-1", type="redirect", state="", processing_profit_usd="0"),
                row("bk-1"),
            ],
            [
                row("bk-2", state="paid", paid_profit_usd="12.00"),
                row("bk-3", state="cancelled", processing_profit_usd="0"),
            ],
        ]
    )
    result = await import_travelpayouts_commissions(
        db, days=30, actor_label="test", transport=httpx.MockTransport(stats.handler)
    )
    assert result.fetched == 5 and result.earning == 3 and result.created == 3
    assert result.statuses == {"pending": 1, "paid": 1, "rejected": 1}
    # Paged with a mandatory date filter.
    assert [b["offset"] for b in stats.bodies] == [0, 3]
    assert {f["field"] for f in stats.bodies[0]["filters"]} == {"date"}

    rows = {c.external_reference: c for c in (await db.scalars(select(CommissionReport))).all()}
    assert rows["bk-1"].status == "pending" and rows["bk-1"].amount == Decimal("5.40")
    assert rows["bk-1"].currency == "USD" and rows["bk-1"].source == "provider_api"
    assert rows["bk-2"].status == "paid" and rows["bk-2"].amount == Decimal("12.00")

    # Re-import: bk-1 got paid -> same row updated, nothing duplicated.
    stats2 = FakeStats(
        [
            [
                row("bk-1", state="paid", paid_profit_usd="5.40"),
                row("bk-2", state="paid", paid_profit_usd="12.00"),
            ]
        ]
    )
    again = await import_travelpayouts_commissions(
        db, days=30, actor_label="test", transport=httpx.MockTransport(stats2.handler)
    )
    assert (again.created, again.updated, again.unchanged) == (0, 1, 1)
    all_rows = (await db.scalars(select(CommissionReport))).all()
    assert len(all_rows) == 3
    await db.refresh(rows["bk-1"])
    assert rows["bk-1"].status == "paid"
    logs = (await db.scalars(select(AuditLog).where(AuditLog.action == "commissions.import"))).all()
    assert len(logs) == 2


async def test_import_requires_token(db, settings) -> None:  # type: ignore[no-untyped-def]
    settings.travelpayouts_api_token = None
    with pytest.raises(Exception, match="TRAVELPAYOUTS_API_TOKEN"):
        await import_travelpayouts_commissions(db, days=7)


async def test_import_rejected_token(db, tp) -> None:  # type: ignore[no-untyped-def]
    transport = httpx.MockTransport(lambda r: httpx.Response(401, text="Unauthorized"))
    with pytest.raises(Exception, match="token rejected"):
        await import_travelpayouts_commissions(db, days=7, transport=transport)


async def test_admin_endpoint_rbac_and_csrf(client: AsyncClient, tp, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    async def fake_fetch(client, token, since, until):  # type: ignore[no-untyped-def]
        return [row("bk-9", state="paid", paid_profit_usd="7.25")]

    monkeypatch.setattr(commissions_mod, "fetch_actions", fake_fetch)

    assert (await client.post("/api/v1/admin/commissions/import")).status_code == 401

    await login(client, "viewer@example.com", VIEWER_PASSWORD)
    viewer_csrf = client.cookies.get("gtp_csrf")
    resp = await client.post(
        "/api/v1/admin/commissions/import", headers={"X-CSRF-Token": viewer_csrf or ""}
    )
    assert resp.status_code == 403  # viewer may not import

    client.cookies.clear()
    csrf = await login(client, "admin@example.com", ADMIN_PASSWORD)
    no_csrf = await client.post("/api/v1/admin/commissions/import")
    assert no_csrf.status_code == 403 and no_csrf.json()["error"]["code"] == "csrf_failed"

    ok = await client.post(
        "/api/v1/admin/commissions/import", params={"days": 30}, headers={"X-CSRF-Token": csrf}
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["created"] == 1
    listing = (await client.get("/api/v1/admin/commissions")).json()
    assert listing["total"] == 1
    assert listing["totals"][0] == {
        "status": "paid",
        "currency": "USD",
        "count": 1,
        "amount": "7.25",
    }
