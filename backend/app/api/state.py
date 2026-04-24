import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

from app.core.deps import get_db
from app.core.security import get_current_user_id
from app.models.enums import TaskStatus
from app.models.task import Task

router = APIRouter(prefix="/state", tags=["state"])


class PriorityCounts(BaseModel):
    q1_count: int
    q2_count: int
    q3_count: int
    q4_count: int


class StateResponse(BaseModel):
    priority: PriorityCounts


@router.get("", response_model=StateResponse)
def get_state(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    rows = db.exec(
        select(Task.important, Task.urgent, func.count())
        .where(
            Task.user_id == user_id,
            Task.status == TaskStatus.pending,
            Task.parent_id.is_(None),
        )
        .group_by(Task.important, Task.urgent)
    ).all()

    counts: dict[tuple[bool, bool], int] = {(imp, urg): cnt for imp, urg, cnt in rows}
    return StateResponse(
        priority=PriorityCounts(
            q1_count=counts.get((True, True), 0),
            q2_count=counts.get((True, False), 0),
            q3_count=counts.get((False, True), 0),
            q4_count=counts.get((False, False), 0),
        )
    )
