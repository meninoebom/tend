"""add notes to tasks

Revision ID: 2fd06db2a9d8
Revises: 1bd69e02305b
Create Date: 2026-04-10 00:53:54.016515

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2fd06db2a9d8'
down_revision: Union[str, Sequence[str], None] = '1bd69e02305b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add notes TEXT NULL column to tasks table."""
    op.add_column('tasks', sa.Column('notes', sa.Text(), nullable=True))


def downgrade() -> None:
    """Remove notes column from tasks table."""
    op.drop_column('tasks', 'notes')
