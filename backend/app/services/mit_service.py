import uuid
from datetime import date, datetime

from sqlalchemy.dialects.postgresql import insert
from sqlmodel import Session, select

from app.models.daily_stat import DailyStat
from app.models.task import Task


def suggest_mit(tasks: list[Task]) -> dict | None:
    """Suggest the Most Important Task from a list of tasks.

    Returns None if fewer than 3 tasks. Otherwise picks the task most
    likely to be the "frog" — the one you've been avoiding.
    """
    if len(tasks) < 3:
        return None

    now = datetime.utcnow()

    def sort_key(task: Task) -> tuple:
        age_days = (now - task.created_at).days
        return (-task.reschedule_count, -age_days, task.created_at)

    ranked = sorted(tasks, key=sort_key)
    top = ranked[0]
    age_days = (now - top.created_at).days

    if top.reschedule_count >= 3:
        reason = "You've been putting this off"
    elif age_days >= 7:
        reason = "This has been waiting a while"
    else:
        reason = "Oldest task on your plate"

    return {"task_id": top.id, "task_text": top.text, "reason": reason}


def set_mit(db: Session, user_id: uuid.UUID, task_id: uuid.UUID) -> None:
    """Upsert today's DailyStat with the chosen MIT task."""
    stmt = (
        insert(DailyStat)
        .values(
            user_id=user_id,
            date=date.today(),
            tasks_added=0,
            tasks_completed=0,
            mit_task_id=task_id,
        )
        .on_conflict_do_update(
            index_elements=["user_id", "date"],
            set_={"mit_task_id": task_id},
        )
    )
    db.execute(stmt)
    db.flush()


def get_today_mit(db: Session, user_id: uuid.UUID) -> uuid.UUID | None:
    """Return today's MIT task_id for the user, or None."""
    stat = db.exec(
        select(DailyStat).where(
            DailyStat.user_id == user_id,
            DailyStat.date == date.today(),
        )
    ).first()

    if stat is None:
        return None
    return stat.mit_task_id
