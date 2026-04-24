import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
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
    pending = list(
        db.exec(
            select(Task).where(
                Task.user_id == user_id,
                Task.status == TaskStatus.pending,
                Task.parent_id.is_(None),
            )
        ).all()
    )

    q1 = sum(1 for t in pending if t.important and t.urgent)
    q2 = sum(1 for t in pending if t.important and not t.urgent)
    q3 = sum(1 for t in pending if not t.important and t.urgent)
    q4 = sum(1 for t in pending if not t.important and not t.urgent)

    return StateResponse(priority=PriorityCounts(q1_count=q1, q2_count=q2, q3_count=q3, q4_count=q4))
