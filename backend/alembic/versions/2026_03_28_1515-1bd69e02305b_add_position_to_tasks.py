"""add_position_to_tasks

Revision ID: 1bd69e02305b
Revises: 0f70781fb706
Create Date: 2026-03-28 15:15:42.749126

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1bd69e02305b'
down_revision: Union[str, Sequence[str], None] = '0f70781fb706'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('tasks', sa.Column('position', sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('tasks', 'position')
