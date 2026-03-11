import logging
import uuid

from fastapi import APIRouter, Depends, Response
from sqlmodel import Session, select

from app.api.tasks import _to_response
from app.core.deps import get_db
from app.core.errors import AppError
from app.core.security import get_current_user_id
from app.models.user import User
from app.schemas.task_schemas import TaskResponse
from app.models.enums import BucketType, TaskStatus
from app.models.task import Task
from app.schemas.triage_schemas import (
    BriefingResponse,
    MITSuggestionResponse,
    TriageQueueResponse,
    TriageRequest,
    TriageResultResponse,
    WinddownResponse,
)
from app.services import (
    briefing_service,
    composter_service,
    mit_service,
    stats_service,
    triage_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/triage", tags=["triage"])


@router.get("", response_model=TriageQueueResponse)
def get_triage_queue(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    # Compost stale tasks before building the triage queue.
    # Savepoint ensures a composter failure rolls back cleanly
    # without corrupting the session for the triage query below.
    try:
        with db.begin_nested():
            count = composter_service.run_composter(db, user_id)
        if count:
            logger.info("Composted %d stale task(s) for user %s", count, user_id)
    except Exception:
        logger.exception("Composting failed for user %s", user_id)

    result = triage_service.get_triage_tasks(db, user_id)
    return TriageQueueResponse(
        tasks=[_to_response(t) for t in result["tasks"]],
        total_count=result["total_count"],
        completion_average=result["completion_average"],
        triage_complete=result["triage_complete"],
    )


@router.get("/briefing", response_model=BriefingResponse)
def get_briefing(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    user = db.get(User, user_id)
    is_pro = user.subscription_status in ("active", "past_due")
    if not is_pro:
        raise AppError(
            code="pro_required",
            message="AI briefing requires a Pro subscription",
            status_code=403,
        )

    result = triage_service.get_triage_tasks(db, user_id)
    nudge = stats_service.get_nudge(db, user_id)

    return briefing_service.generate_briefing(
        tasks=result["tasks"],
        nudge_stats=nudge,
    )


@router.get("/mit-suggestion", response_model=MITSuggestionResponse | None)
def get_mit_suggestion(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    tasks = db.exec(
        select(Task).where(
            Task.user_id == user_id,
            Task.bucket == BucketType.today,
            Task.status == TaskStatus.pending,
            Task.parent_id.is_(None),  # type: ignore[union-attr]
        )
    ).all()
    suggestion = mit_service.suggest_mit(list(tasks))
    if suggestion is None:
        return Response(status_code=204)
    return suggestion


@router.post("/{task_id}", response_model=TriageResultResponse)
def triage_task(
    task_id: uuid.UUID,
    body: TriageRequest,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    result = triage_service.triage_task(
        db,
        user_id,
        task_id,
        action=body.action,
        bucket=body.bucket,
        rewritten_text=body.rewritten_text,
    )
    return TriageResultResponse(**result)


@router.get("/winddown", response_model=WinddownResponse)
def get_winddown(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    tasks = triage_service.get_winddown_tasks(db, user_id)
    mit_task_id = mit_service.get_today_mit(db, user_id)
    mit_completed: bool | None = None
    if mit_task_id is not None:
        mit_task = db.get(Task, mit_task_id)
        if mit_task is not None:
            mit_completed = mit_task.status == TaskStatus.complete
    return WinddownResponse(
        tasks=[_to_response(t) for t in tasks],
        mit_completed=mit_completed,
    )
