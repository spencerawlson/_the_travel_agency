"""admin two-step sign-in (TOTP + recovery codes)

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-13 10:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = '0003'
down_revision: str | None = '0002'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('admin_users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('totp_secret', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('totp_pending_secret', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('totp_enabled_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('totp_last_step', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('recovery_code_hashes', sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('admin_users', schema=None) as batch_op:
        batch_op.drop_column('recovery_code_hashes')
        batch_op.drop_column('totp_last_step')
        batch_op.drop_column('totp_enabled_at')
        batch_op.drop_column('totp_pending_secret')
        batch_op.drop_column('totp_secret')
