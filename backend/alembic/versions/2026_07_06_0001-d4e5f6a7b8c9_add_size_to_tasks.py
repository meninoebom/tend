"""Add size (S/M/L) to tasks

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-07-06 00:01:00.000000
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable TEXT (StrEnum-as-TEXT convention); CHECK enforces valid values.
    op.add_column("tasks", sa.Column("size", sa.String(), nullable=True))
    op.create_check_constraint(
        "ck_tasks_size", "tasks", "size IS NULL OR size IN ('s', 'm', 'l')"
    )


def downgrade() -> None:
    op.drop_constraint("ck_tasks_size", "tasks", type_="check")
    op.drop_column("tasks", "size")
