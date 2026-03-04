"""add stripe fields to users

Revision ID: 85be95c9b234
Revises: f8a43bacbe80
Create Date: 2026-03-04 01:33:19.302496

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '85be95c9b234'
down_revision: str | Sequence[str] | None = 'f8a43bacbe80'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add stripe_customer_id and subscription_status to users."""
    op.add_column('users', sa.Column('stripe_customer_id', sa.String(), nullable=True))
    op.add_column('users', sa.Column(
        'subscription_status', sa.String(), nullable=False, server_default='free',
    ))
    op.create_index('ix_users_stripe_customer_id', 'users', ['stripe_customer_id'], unique=True)
    op.execute(
        "ALTER TABLE users ADD CONSTRAINT ck_users_subscription_status "
        "CHECK (subscription_status IN ('free', 'active', 'past_due', 'canceled'))"
    )


def downgrade() -> None:
    """Remove stripe fields from users."""
    op.execute("ALTER TABLE users DROP CONSTRAINT ck_users_subscription_status")
    op.drop_index('ix_users_stripe_customer_id', table_name='users')
    op.drop_column('users', 'subscription_status')
    op.drop_column('users', 'stripe_customer_id')
