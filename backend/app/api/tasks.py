import uuid

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.deps import get_db
from app.core.security import get_current_user_id
from app.core.errors import AppError
from app.models.enums import BucketType, TaskStatus
from app.schemas.task_schemas import (
    DomainBrief,
    SubTaskResponse,
    TaskCreate,
    TaskResponse,
    TaskUpdate,
)
from app.services import mit_service, task_service

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _to_response(task, mit_task_id: uuid.UUID | None = None) -> TaskResponse:
    return TaskResponse(
        id=task.id,
        text=task.text,
        bucket=task.bucket,
        status=task.status,
        reschedule_count=task.reschedule_count,
        triaged_at=task.triaged_at,
        domain=DomainBrief(id=task.domain.id, name=task.domain.name, color=task.domain.color)
        if task.domain
        else None,
        parent_id=task.parent_id,
        children=[
            SubTaskResponse(
                id=c.id, text=c.text, status=c.status, completed_at=c.completed_at
            )
            for c in task.children
        ],
        created_at=task.created_at,
        updated_at=task.updated_at,
        completed_at=task.completed_at,
        is_mit=mit_task_id is not None and task.id == mit_task_id,
    )


@router.get("", response_model=list[TaskResponse])
def list_tasks(
    bucket: BucketType | None = None,
    status: TaskStatus | None = None,
    domain_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    tasks = task_service.get_tasks(db, user_id, bucket=bucket, status=status, domain_id=domain_id)
    mit_id = mit_service.get_today_mit(db, user_id)
    return [_to_response(t, mit_task_id=mit_id) for t in tasks]


@router.get("/{task_id}", response_model=TaskResponse)
def get_task(
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    task = task_service.get_task(db, user_id, task_id)
    return _to_response(task)


@router.post("", response_model=TaskResponse, status_code=201)
def create_task(
    body: TaskCreate,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    # Only honor skip_triage_stamp during onboarding (prevents abuse after onboarding)
    skip_stamp = False
    if body.skip_triage_stamp:
        from app.models.user import User

        user = db.get(User, user_id)
        if user and not user.has_completed_onboarding:
            skip_stamp = True

    task = task_service.create_task(
        db,
        user_id,
        text=body.text,
        bucket=body.bucket,
        domain_id=body.domain_id,
        parent_id=body.parent_id,
        skip_triage_stamp=skip_stamp,
    )
    # Reload with relationships for response
    task = task_service.get_task(db, user_id, task.id)
    return _to_response(task)


@router.patch("/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: uuid.UUID,
    body: TaskUpdate,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    kwargs: dict = {}
    if body.text is not None:
        kwargs["text"] = body.text
    if body.bucket is not None:
        kwargs["bucket"] = body.bucket
    if "domain_id" in body.model_fields_set:
        kwargs["domain_id"] = body.domain_id
    if body.status is not None:
        kwargs["status"] = body.status
    task = task_service.update_task(db, user_id, task_id, **kwargs)
    return _to_response(task)


@router.post("/{task_id}/complete", response_model=TaskResponse)
def complete_task(
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    task = task_service.complete_task(db, user_id, task_id)
    task = task_service.get_task(db, user_id, task.id)
    return _to_response(task)


@router.delete("/{task_id}", status_code=204)
def delete_task(
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    task_service.delete_task(db, user_id, task_id)


@router.post("/{task_id}/mit", response_model=TaskResponse)
def set_mit(
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    task = task_service.get_task(db, user_id, task_id)
    if task.status != TaskStatus.pending:
        raise AppError(
            code="task_not_pending",
            message="Only pending tasks can be set as MIT",
            status_code=422,
        )
    if task.bucket != BucketType.today:
        raise AppError(
            code="task_not_today",
            message="Only today-bucket tasks can be set as MIT",
            status_code=422,
        )
    mit_service.set_mit(db, user_id, task_id)
    return _to_response(task, mit_task_id=task_id)
