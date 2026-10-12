"""Migration tests: upgrade/downgrade round-trip and model/migration parity.

Runs against a throw-away SQLite file, and additionally against PostgreSQL
when MIGRATION_TEST_DATABASE_URL is set (CI provides an empty database)."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect

from app.db.base import Base

API_DIR = Path(__file__).resolve().parents[1]


def _targets() -> list[str]:
    urls = [f"sqlite:///{Path(tempfile.mkdtemp()).as_posix()}/migrations.db"]
    if pg := os.environ.get("MIGRATION_TEST_DATABASE_URL"):
        urls.append(pg)
    return urls


@pytest.mark.parametrize("url", _targets())
def test_upgrade_downgrade_and_parity(url: str) -> None:
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_DIR / "alembic"))
    cfg.attributes["database_url"] = url

    command.upgrade(cfg, "head")
    engine = create_engine(url.replace("+aiosqlite", ""))
    try:
        tables = set(inspect(engine).get_table_names())
        expected = set(Base.metadata.tables)
        assert expected <= tables

        with engine.connect() as conn:
            diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)
        # Any diff means a model changed without a migration.
        assert diff == [], f"models and migrations differ: {diff}"
    finally:
        engine.dispose()

    command.downgrade(cfg, "base")
    engine = create_engine(url.replace("+aiosqlite", ""))
    try:
        remaining = set(inspect(engine).get_table_names()) - {"alembic_version"}
        assert remaining == set()
    finally:
        engine.dispose()
    command.upgrade(cfg, "head")  # re-apply cleanly after downgrade
