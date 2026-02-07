"""initial schema: users, tasks, domains, daily_stats

Revision ID: f8a43bacbe80
Revises:
Create Date: 2026-02-06 17:50:54.871750

"""
from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel  # noqa: F401

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f8a43bacbe80'
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # --- users ---
    op.create_table('users',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('email', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('password_hash', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('auth_provider', sa.String(), nullable=False),
        sa.Column('has_completed_onboarding', sa.Boolean(), nullable=False),
        sa.Column('has_triaged_before', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("auth_provider IN ('email', 'google')", name='ck_users_auth_provider'),
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)

    # --- daily_stats ---
    op.create_table('daily_stats',
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('tasks_added', sa.Integer(), nullable=False),
        sa.Column('tasks_completed', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id', 'date'),
    )

    # --- domains ---
    op.create_table('domains',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column('color', sqlmodel.sql.sqltypes.AutoString(length=7), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'name', name='uq_domains_user_name'),
    )
    op.create_index(op.f('ix_domains_user_id'), 'domains', ['user_id'], unique=False)

    # --- tasks ---
    op.create_table('tasks',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('text', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=False),
        sa.Column('bucket', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('reschedule_count', sa.Integer(), nullable=False),
        sa.Column('triaged_at', sa.Date(), nullable=True),
        sa.Column('parent_id', sa.Uuid(), nullable=True),
        sa.Column('domain_id', sa.Uuid(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['domain_id'], ['domains.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['parent_id'], ['tasks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(
            "bucket IN ('today', 'soon', 'later', 'someday')",
            name='ck_tasks_bucket',
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'complete', 'archived')",
            name='ck_tasks_status',
        ),
    )
    op.create_index(op.f('ix_tasks_domain_id'), 'tasks', ['domain_id'], unique=False)
    op.create_index(op.f('ix_tasks_parent_id'), 'tasks', ['parent_id'], unique=False)

    # Composite index: the primary query pattern (user's tasks filtered by bucket + status)
    op.create_index(
        'idx_tasks_user_bucket_status',
        'tasks',
        ['user_id', 'bucket', 'status'],
    )

    # Partial index: triage candidates (pending top-level tasks not yet triaged today)
    op.execute("""
        CREATE INDEX idx_tasks_triage_candidates
        ON tasks (user_id, created_at)
        WHERE status = 'pending' AND parent_id IS NULL
    """)

    # Partial index: reaper candidates (stale non-today pending top-level tasks)
    op.execute("""
        CREATE INDEX idx_tasks_reaper_candidates
        ON tasks (user_id, created_at)
        WHERE status = 'pending' AND bucket != 'today' AND parent_id IS NULL
    """)


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP INDEX IF EXISTS idx_tasks_reaper_candidates")
    op.execute("DROP INDEX IF EXISTS idx_tasks_triage_candidates")
    op.drop_index('idx_tasks_user_bucket_status', table_name='tasks')
    op.drop_index(op.f('ix_tasks_parent_id'), table_name='tasks')
    op.drop_index(op.f('ix_tasks_domain_id'), table_name='tasks')
    op.drop_table('tasks')
    op.drop_index(op.f('ix_domains_user_id'), table_name='domains')
    op.drop_table('domains')
    op.drop_table('daily_stats')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
