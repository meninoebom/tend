import uuid
from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.models.enums import BucketType, TaskStatus
from app.models.task import Task
from app.models.user import User
from app.services import stats_service, task_service


def get_triage_tasks(db: Session, user_id: uuid.UUID) -> dict:
    """Get pending top-level tasks needing triage today.

    Returns tasks where triaged_at IS NULL OR triaged_at < today,
    plus context (total_count, completion_average, triage_complete).
    """
    today = date.today()

    query = (
        select(Task)
        .where(
            Task.user_id == user_id,
            Task.status == TaskStatus.pending,
            Task.parent_id.is_(None),
        )
        .where((Task.triaged_at.is_(None)) | (Task.triaged_at < today))
        .options(selectinload(Task.domain), selectinload(Task.children))
        .order_by(Task.created_at.asc())
    )
    tasks = list(db.exec(query).all())

    nudge = stats_service.get_nudge(db, user_id)

    return {
        "tasks": tasks,
        "total_count": len(tasks),
        "completion_average": nudge["average_completed"],
        "triage_complete": len(tasks) == 0,
    }


def triage_task(
    db: Session,
    user_id: uuid.UUID,
    task_id: uuid.UUID,
    action: str,
    bucket: BucketType | None = None,
    rewritten_text: str | None = None,
) -> dict:
    """Process a triage decision on a single task."""
    task = task_service.get_task(db, user_id, task_id)
    today = date.today()
    same_text_warning = False

    # Handle rewritten text (shown when reschedule_count >= 3)
    if rewritten_text is not None:
        if rewritten_text.strip() == task.text:
            same_text_warning = True
        else:
            task.text = rewritten_text.strip()

    if action == "confirm":
        # Task stays in current bucket (or moves to today), no reschedule_count increment
        if task.bucket != BucketType.today:
            task.bucket = BucketType.today
        task.triaged_at = today
        db.add(task)
        db.flush()

    elif action == "defer":
        if bucket is None:
            from app.core.errors import AppError

            raise AppError(
                code="validation_error",
                message="Bucket is required for defer action",
                status_code=422,
            )
        task.bucket = bucket
        task.reschedule_count += 1
        task.triaged_at = today
        db.add(task)
        db.flush()

        # Cascade bucket change to children
        children = list(
            db.exec(select(Task).where(Task.parent_id == task_id)).all()
        )
        for child in children:
            child.bucket = bucket
            db.add(child)
        db.flush()

    elif action == "complete":
        task.triaged_at = today
        db.add(task)
        db.flush()
        task_service.complete_task(db, user_id, task_id)

    elif action == "kill":
        task_service.delete_task(db, user_id, task_id)

    # Check if triage is now complete
    remaining_count = db.exec(
        select(func.count())
        .select_from(Task)
        .where(
            Task.user_id == user_id,
            Task.status == TaskStatus.pending,
            Task.parent_id.is_(None),
            (Task.triaged_at.is_(None)) | (Task.triaged_at < today),
        )
    ).one()

    triage_complete = remaining_count == 0

    # Auto-set has_triaged_before on first triage completion
    if triage_complete:
        user = db.get(User, user_id)
        if user and not user.has_triaged_before:
            user.has_triaged_before = True
            db.add(user)
            db.flush()

    return {
        "task_id": task_id,
        "action": action,
        "same_text_warning": same_text_warning,
        "triage_complete": triage_complete,
        "remaining": remaining_count,
    }


def get_winddown_tasks(db: Session, user_id: uuid.UUID) -> list[Task]:
    """Get incomplete today tasks for evening wind-down triage."""
    query = (
        select(Task)
        .where(
            Task.user_id == user_id,
            Task.bucket == BucketType.today,
            Task.status == TaskStatus.pending,
            Task.parent_id.is_(None),
        )
        .options(selectinload(Task.domain), selectinload(Task.children))
        .order_by(Task.created_at.asc())
    )
    return list(db.exec(query).all())
