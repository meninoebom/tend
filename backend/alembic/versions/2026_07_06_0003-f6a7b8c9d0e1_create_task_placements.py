"""Create task_placements (Plot time-block write-back)

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-07-06 00:03:00.000000
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, Sequence[str], None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "task_placements",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("block_start", sa.DateTime(), nullable=True),
        sa.Column("block_type", sa.String(), nullable=True),
        sa.Column("calendar_event_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("task_id", "date", name="uq_placement_task_date"),
    )
    op.create_index("ix_task_placements_task_id", "task_placements", ["task_id"])
    op.create_index("ix_task_placements_user_id", "task_placements", ["user_id"])
    op.create_index("ix_task_placements_date", "task_placements", ["date"])


def downgrade() -> None:
    op.drop_index("ix_task_placements_date", table_name="task_placements")
    op.drop_index("ix_task_placements_user_id", table_name="task_placements")
    op.drop_index("ix_task_placements_task_id", table_name="task_placements")
    op.drop_table("task_placements")
