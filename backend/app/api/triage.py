import uuid

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.api.tasks import _to_response
from app.core.deps import get_db
from app.core.security import get_current_user_id
from app.schemas.task_schemas import TaskResponse
from app.schemas.triage_schemas import TriageQueueResponse, TriageRequest, TriageResultResponse
from app.services import composter_service, triage_service

router = APIRouter(prefix="/triage", tags=["triage"])


@router.get("", response_model=TriageQueueResponse)
def get_triage_queue(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    # Compost stale tasks before building the triage queue
    composter_service.run_composter(db, user_id)

    result = triage_service.get_triage_tasks(db, user_id)
    return TriageQueueResponse(
        tasks=[_to_response(t) for t in result["tasks"]],
        total_count=result["total_count"],
        completion_average=result["completion_average"],
        triage_complete=result["triage_complete"],
    )


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


@router.get("/winddown", response_model=list[TaskResponse])
def get_winddown(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    tasks = triage_service.get_winddown_tasks(db, user_id)
    return [_to_response(t) for t in tasks]
