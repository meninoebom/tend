import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy import select as sa_select
from sqlmodel import Session

from app.core.deps import get_db
from app.core.security import get_user_id_allow_pat
from app.models.enums import BucketType, TaskStatus
from app.models.task import Task

router = APIRouter(prefix="/state", tags=["state"])


class PriorityCounts(BaseModel):
    q1_count: int
    q2_count: int
    q3_count: int
    q4_count: int


class BucketCounts(BaseModel):
    today: int
    soon: int
    later: int
    someday: int
    done: int


class StateResponse(BaseModel):
    priority: PriorityCounts
    buckets: BucketCounts


@router.get("", response_model=StateResponse)
def get_state(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_user_id_allow_pat),
):
    # Priority counts via GROUP BY
    priority_rows = db.exec(
        sa_select(Task.important, Task.urgent, func.count())
        .where(
            Task.user_id == user_id,
            Task.status == TaskStatus.pending,
            Task.parent_id.is_(None),
        )
        .group_by(Task.important, Task.urgent)
    ).all()
    priority_map: dict[tuple[bool, bool], int] = {
        (imp, urg): cnt for imp, urg, cnt in priority_rows
    }

    # Bucket counts (pending) via GROUP BY
    bucket_rows = db.exec(
        sa_select(Task.bucket, func.count())
        .where(
            Task.user_id == user_id,
            Task.status == TaskStatus.pending,
            Task.parent_id.is_(None),
        )
        .group_by(Task.bucket)
    ).all()
    bucket_map: dict[str, int] = {bucket: cnt for bucket, cnt in bucket_rows}

    # Done count (complete tasks, not archived)
    done_count = db.exec(
        sa_select(func.count()).where(
            Task.user_id == user_id,
            Task.status == TaskStatus.complete,
            Task.parent_id.is_(None),
        )
    ).scalar_one()

    return StateResponse(
        priority=PriorityCounts(
            q1_count=priority_map.get((True, True), 0),
            q2_count=priority_map.get((True, False), 0),
            q3_count=priority_map.get((False, True), 0),
            q4_count=priority_map.get((False, False), 0),
        ),
        buckets=BucketCounts(
            today=bucket_map.get(BucketType.today, 0),
            soon=bucket_map.get(BucketType.soon, 0),
            later=bucket_map.get(BucketType.later, 0),
            someday=bucket_map.get(BucketType.someday, 0),
            done=done_count,
        ),
    )
