"""Add important and urgent priority fields to tasks

Revision ID: a1b2c3d4e5f6
Revises: 2fd06db2a9d8
Create Date: 2026-04-24 00:00:00.000000
"""
from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '2fd06db2a9d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('important', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('tasks', sa.Column('urgent', sa.Boolean(), nullable=False, server_default='false'))
    # Drop server_defaults after backfill so model and DB stay in sync
    op.alter_column('tasks', 'important', server_default=None)
    op.alter_column('tasks', 'urgent', server_default=None)
    op.create_index(
        'ix_tasks_priority_lookup',
        'tasks',
        ['user_id', 'status', 'bucket', 'important', 'urgent'],
    )


def downgrade() -> None:
    op.drop_index('ix_tasks_priority_lookup', table_name='tasks')
    op.drop_column('tasks', 'urgent')
    op.drop_column('tasks', 'important')
