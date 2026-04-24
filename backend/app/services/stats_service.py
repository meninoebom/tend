import uuid
from datetime import date, timedelta

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import Session, select

from app.models.daily_stat import DailyStat


def upsert_stat(
    db: Session,
    user_id: uuid.UUID,
    stat_date: date,
    *,
    tasks_added_delta: int = 0,
    tasks_completed_delta: int = 0,
) -> None:
    """Atomically increment daily stats using INSERT ... ON CONFLICT DO UPDATE."""
    stmt = (
        insert(DailyStat)
        .values(
            user_id=user_id,
            date=stat_date,
            tasks_added=tasks_added_delta,
            tasks_completed=tasks_completed_delta,
        )
        .on_conflict_do_update(
            index_elements=["user_id", "date"],
            set_={
                "tasks_added": DailyStat.__table__.c.tasks_added + tasks_added_delta,
                "tasks_completed": DailyStat.__table__.c.tasks_completed + tasks_completed_delta,
            },
        )
    )
    db.execute(stmt)


def get_nudge(db: Session, user_id: uuid.UUID) -> dict:
    """30-day rolling average + today's counts for the honest nudge."""
    today = date.today()
    thirty_days_ago = today - timedelta(days=30)

    # 30-day average
    avg_result = db.exec(
        select(func.coalesce(func.avg(DailyStat.tasks_completed), 0)).where(
            DailyStat.user_id == user_id,
            DailyStat.date >= thirty_days_ago,
        )
    ).one()
    average = round(float(avg_result), 1)

    # Today's stats
    today_stat = db.exec(
        select(DailyStat).where(DailyStat.user_id == user_id, DailyStat.date == today)
    ).first()

    today_added = today_stat.tasks_added if today_stat else 0
    today_completed = today_stat.tasks_completed if today_stat else 0

    return {
        "today_count": today_added,
        "completed_count": today_completed,
        "average_completed": average,
    }
