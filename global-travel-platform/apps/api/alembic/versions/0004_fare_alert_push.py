"""Fare-alert push devices and alerts.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-28
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "push_devices",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("push_token", sa.String(length=255), nullable=False),
        sa.Column("platform", sa.String(length=16), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("platform IN ('ios', 'android', 'web')", name="platform_enum"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("push_token", name="uq_push_devices_push_token"),
    )
    op.create_index("ix_push_devices_push_token", "push_devices", ["push_token"])
    op.create_table(
        "fare_alerts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("device_id", sa.Uuid(), nullable=False),
        sa.Column("origin_iata", sa.String(length=3), nullable=False),
        sa.Column("destination_iata", sa.String(length=3), nullable=False),
        sa.Column("trip_type", sa.String(length=10), nullable=False),
        sa.Column("depart_date", sa.Date(), nullable=False),
        sa.Column("return_date", sa.Date(), nullable=True),
        sa.Column("adults", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("children", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("infants", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cabin", sa.String(length=16), nullable=False, server_default="economy"),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="CAD"),
        sa.Column("target_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("last_seen_price", sa.Numeric(12, 2), nullable=True),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_notified_price", sa.Numeric(12, 2), nullable=True),
        sa.Column("last_notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "trip_type IN ('one_way', 'round_trip')", name="trip_type_enum"
        ),
        sa.CheckConstraint(
            "cabin IN ('economy', 'premium_economy', 'business', 'first')",
            name="cabin_enum",
        ),
        sa.CheckConstraint("adults BETWEEN 1 AND 9", name="adults_range"),
        sa.CheckConstraint("children >= 0 AND infants >= 0", name="pax_non_negative"),
        sa.CheckConstraint("infants <= adults", name="infants_within_adults"),
        sa.CheckConstraint("target_price > 0", name="target_positive"),
        sa.CheckConstraint(
            "return_date IS NULL OR return_date >= depart_date", name="date_order"
        ),
        sa.ForeignKeyConstraint(["device_id"], ["push_devices.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_fare_alerts_device_id", "fare_alerts", ["device_id"])
    op.create_index("ix_alert_active_depart", "fare_alerts", ["is_active", "depart_date"])


def downgrade() -> None:
    op.drop_index("ix_alert_active_depart", table_name="fare_alerts")
    op.drop_index("ix_fare_alerts_device_id", table_name="fare_alerts")
    op.drop_table("fare_alerts")
    op.drop_index("ix_push_devices_push_token", table_name="push_devices")
    op.drop_table("push_devices")
