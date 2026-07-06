import uuid
from datetime import date as date_type
from datetime import datetime

from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.models.task import Task
from app.models.task_placement import TaskPlacement
from app.services import task_service


def record_placement(
    db: Session,
    user_id: uuid.UUID,
    task_id: uuid.UUID,
    *,
    placement_date: date_type,
    block_start: datetime | None = None,
    block_type: str | None = None,
    calendar_event_id: str | None = None,
) -> TaskPlacement:
    """Upsert a placement for (task, date). Re-placing the same task on the same
    day updates the existing row rather than creating a duplicate.

    Verifies the task belongs to the user (raises NotFoundError otherwise).
    Tend records the fact; it never schedules.
    """
    task_service.get_task(db, user_id, task_id)  # ownership check

    existing = db.exec(
        select(TaskPlacement).where(
            TaskPlacement.task_id == task_id,
            TaskPlacement.date == placement_date,
        )
    ).first()

    if existing is not None:
        existing.block_start = block_start
        existing.block_type = block_type
        existing.calendar_event_id = calendar_event_id
        existing.updated_at = datetime.utcnow()
        db.add(existing)
        db.flush()
        return existing

    placement = TaskPlacement(
        task_id=task_id,
        user_id=user_id,
        date=placement_date,
        block_start=block_start,
        block_type=block_type,
        calendar_event_id=calendar_event_id,
    )
    db.add(placement)
    db.flush()
    db.refresh(placement)
    return placement


def get_placements_for_date(
    db: Session, user_id: uuid.UUID, placement_date: date_type
) -> dict[uuid.UUID, TaskPlacement]:
    """Return {task_id: placement} for a user on a given date, for enriching task
    responses without an N+1 per task."""
    rows = db.exec(
        select(TaskPlacement).where(
            TaskPlacement.user_id == user_id,
            TaskPlacement.date == placement_date,
        )
    ).all()
    return {p.task_id: p for p in rows}


def load_tasks_with_placements(query):
    """Eager-load placements onto a Task query (avoids lazy='raise')."""
    return query.options(selectinload(Task.placements))
