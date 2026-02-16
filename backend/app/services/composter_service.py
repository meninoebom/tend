import uuid
from datetime import datetime, timedelta

from sqlmodel import Session, select, update

from app.models.enums import BucketType, TaskStatus
from app.models.task import Task


def run_composter(db: Session, user_id: uuid.UUID) -> int:
    """Compost stale tasks for a single user. Two passes:

    1. Compost top-level pending tasks not in today bucket where created_at > 30 days ago
    2. Compost orphaned children of composted parents

    Called automatically during triage — no cron job needed.
    """
    cutoff = datetime.utcnow() - timedelta(days=30)
    now = datetime.utcnow()
    total_composted = 0

    # Pass 1: stale top-level tasks
    stmt1 = (
        update(Task)
        .where(
            Task.user_id == user_id,
            Task.status == TaskStatus.pending,
            Task.parent_id.is_(None),
            Task.bucket != BucketType.today,
            Task.created_at < cutoff,
        )
        .values(status=TaskStatus.archived, updated_at=now)
    )
    result1 = db.execute(stmt1)
    total_composted += result1.rowcount

    # Pass 2: orphaned children (parent is composted)
    archived_parent_ids = select(Task.id).where(
        Task.user_id == user_id,
        Task.status == TaskStatus.archived,
    )
    stmt2 = (
        update(Task)
        .where(
            Task.user_id == user_id,
            Task.status == TaskStatus.pending,
            Task.parent_id.isnot(None),
            Task.parent_id.in_(archived_parent_ids),
        )
        .values(status=TaskStatus.archived, updated_at=now)
    )
    result2 = db.execute(stmt2)
    total_composted += result2.rowcount

    return total_composted
