import uuid
from datetime import date, datetime

from sqlmodel import Session, select
from sqlmodel.sql.expression import SelectOfScalar

from app.core.errors import AppError, NotFoundError
from app.models.enums import BucketType, TaskStatus
from app.models.task import Task
from app.services import stats_service


def _base_query(user_id: uuid.UUID) -> SelectOfScalar[Task]:
    return select(Task).where(Task.user_id == user_id)


def _load_related(query: SelectOfScalar[Task]) -> SelectOfScalar[Task]:
    """Add eager loading for domain and children to prevent N+1."""
    from sqlalchemy.orm import selectinload

    return query.options(selectinload(Task.domain), selectinload(Task.children))


def create_task(
    db: Session,
    user_id: uuid.UUID,
    text: str,
    bucket: BucketType = BucketType.today,
    domain_id: uuid.UUID | None = None,
    parent_id: uuid.UUID | None = None,
) -> Task:
    if len(text) > 500:
        raise AppError(
            code="validation_error",
            message="Task text must be 500 characters or fewer",
            status_code=422,
        )

    if not text.strip():
        raise AppError(
            code="validation_error",
            message="Task text cannot be empty",
            status_code=422,
        )

    # If sub-task, validate parent and inherit bucket/domain
    if parent_id is not None:
        parent = db.get(Task, parent_id)
        if parent is None or parent.user_id != user_id:
            raise NotFoundError("Parent task not found")
        if parent.parent_id is not None:
            raise AppError(
                code="nesting_too_deep",
                message="Sub-tasks cannot have their own sub-tasks",
                status_code=422,
            )
        bucket = BucketType(parent.bucket)
        domain_id = parent.domain_id

    task = Task(
        user_id=user_id,
        text=text.strip(),
        bucket=bucket,
        status=TaskStatus.pending,
        domain_id=domain_id,
        parent_id=parent_id,
        triaged_at=date.today(),  # prevent re-triggering triage gate
    )
    db.add(task)
    db.flush()

    stats_service.upsert_stat(db, user_id, date.today(), tasks_added_delta=1)

    db.refresh(task)
    return task


def get_tasks(
    db: Session,
    user_id: uuid.UUID,
    *,
    bucket: BucketType | None = None,
    status: TaskStatus | None = None,
    domain_id: uuid.UUID | None = None,
) -> list[Task]:
    query = _base_query(user_id).where(Task.parent_id.is_(None))  # top-level only by default

    if bucket is not None:
        query = query.where(Task.bucket == bucket)
    if status is not None:
        query = query.where(Task.status == status)
    if domain_id is not None:
        query = query.where(Task.domain_id == domain_id)

    query = _load_related(query).order_by(Task.created_at.desc())
    return list(db.exec(query).all())


def get_task(db: Session, user_id: uuid.UUID, task_id: uuid.UUID) -> Task:
    query = _load_related(_base_query(user_id).where(Task.id == task_id))
    task = db.exec(query).first()
    if task is None:
        raise NotFoundError("Task not found")
    return task


def update_task(
    db: Session,
    user_id: uuid.UUID,
    task_id: uuid.UUID,
    *,
    text: str | None = None,
    bucket: BucketType | None = None,
    domain_id: uuid.UUID | None = None,
) -> Task:
    task = get_task(db, user_id, task_id)

    if text is not None:
        if len(text) > 500:
            raise AppError(
                code="validation_error",
                message="Task text must be 500 characters or fewer",
                status_code=422,
            )
        task.text = text.strip()
    if bucket is not None:
        task.bucket = bucket
    if domain_id is not None:
        task.domain_id = domain_id

    task.updated_at = datetime.utcnow()
    db.add(task)
    db.flush()

    # Re-fetch with eager loading (refresh loses selectinload options)
    return get_task(db, user_id, task_id)


def complete_task(db: Session, user_id: uuid.UUID, task_id: uuid.UUID) -> Task:
    task = get_task(db, user_id, task_id)
    now = datetime.utcnow()

    task.status = TaskStatus.complete
    task.completed_at = now
    task.updated_at = now
    db.add(task)

    # Cascade complete to pending children
    from sqlalchemy.orm import selectinload

    children_query = (
        select(Task)
        .where(Task.parent_id == task_id, Task.status == TaskStatus.pending)
        .options(selectinload(Task.domain))
    )
    children = list(db.exec(children_query).all())
    for child in children:
        child.status = TaskStatus.complete
        child.completed_at = now
        child.updated_at = now
        db.add(child)

    db.flush()

    # Stats: only count parent completion
    stats_service.upsert_stat(db, user_id, date.today(), tasks_completed_delta=1)

    db.refresh(task)
    return task


def delete_task(db: Session, user_id: uuid.UUID, task_id: uuid.UUID) -> None:
    task = get_task(db, user_id, task_id)
    # ON DELETE CASCADE handles children at DB level
    db.delete(task)
    db.flush()
