import uuid
from datetime import datetime, timedelta

from sqlmodel import Session, select, update

from app.models.enums import BucketType, TaskStatus
from app.models.task import Task


def run_reaper(db: Session, user_id: uuid.UUID | None = None) -> int:
    """Auto-archive stale tasks. Two passes:

    1. Archive top-level pending tasks not in today bucket where created_at > 30 days ago
    2. Archive orphaned children of archived parents

    If user_id is provided, runs for that user only. Otherwise runs for all users (cron mode).
    """
    cutoff = datetime.utcnow() - timedelta(days=30)
    now = datetime.utcnow()
    total_archived = 0

    # Pass 1: stale top-level tasks
    stmt1 = (
        update(Task)
        .where(
            Task.status == TaskStatus.pending,
            Task.parent_id.is_(None),
            Task.bucket != BucketType.today,
            Task.created_at < cutoff,
        )
        .values(status=TaskStatus.archived, updated_at=now)
    )
    if user_id is not None:
        stmt1 = stmt1.where(Task.user_id == user_id)

    result1 = db.execute(stmt1)
    total_archived += result1.rowcount

    # Pass 2: orphaned children (parent is archived)
    archived_parent_ids = select(Task.id).where(Task.status == TaskStatus.archived)
    if user_id is not None:
        archived_parent_ids = archived_parent_ids.where(Task.user_id == user_id)

    stmt2 = (
        update(Task)
        .where(
            Task.status == TaskStatus.pending,
            Task.parent_id.isnot(None),
            Task.parent_id.in_(archived_parent_ids),
        )
        .values(status=TaskStatus.archived, updated_at=now)
    )
    if user_id is not None:
        stmt2 = stmt2.where(Task.user_id == user_id)

    result2 = db.execute(stmt2)
    total_archived += result2.rowcount

    return total_archived
