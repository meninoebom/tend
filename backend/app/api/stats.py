import uuid

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.deps import get_db
from app.core.security import get_current_user_id
from app.schemas.stats_schemas import DailyStatResponse, NudgeResponse
from app.services import stats_service

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/nudge", response_model=NudgeResponse)
def get_nudge(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    nudge = stats_service.get_nudge(db, user_id)
    avg = nudge["average_completed"]
    today_count = nudge["today_count"]

    if today_count == 0:
        message = "No tasks yet today."
    elif avg > 0:
        message = f"{today_count} tasks today — you usually complete about {avg}"
    else:
        message = f"{today_count} tasks today."

    return NudgeResponse(
        today_count=today_count,
        completed_count=nudge["completed_count"],
        average_completed=avg,
        message=message,
    )


@router.get("/daily", response_model=list[DailyStatResponse])
def get_daily_stats(
    days: int = 30,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    stats = stats_service.get_daily_stats(db, user_id, days=days)
    return [
        DailyStatResponse(date=s.date, tasks_added=s.tasks_added, tasks_completed=s.tasks_completed)
        for s in stats
    ]
