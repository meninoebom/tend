"""Add triage_reminder_enabled and triage_reminder_hour to users

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-04-29 00:00:00.000000
"""
from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('triage_reminder_enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')))
    op.add_column('users', sa.Column('triage_reminder_hour', sa.Integer(), nullable=False, server_default=sa.text('7')))


def downgrade() -> None:
    op.drop_column('users', 'triage_reminder_hour')
    op.drop_column('users', 'triage_reminder_enabled')
