import uuid
from datetime import date, datetime

from sqlalchemy import case, func
from sqlmodel import Session, select
from sqlmodel.sql.expression import SelectOfScalar

from app.core.errors import AppError, NotFoundError
from app.models.enums import BucketType, SizeType, TaskStatus
from app.models.task import Task
from app.services import stats_service


def _base_query(user_id: uuid.UUID) -> SelectOfScalar[Task]:
    return select(Task).where(Task.user_id == user_id)


def _load_related(query: SelectOfScalar[Task]) -> SelectOfScalar[Task]:
    """Add eager loading for domain and children to prevent N+1."""
    from sqlalchemy.orm import selectinload

    return query.options(selectinload(Task.domain), selectinload(Task.children))


def _next_position(db: Session, user_id: uuid.UUID, bucket: BucketType) -> int:
    """Append position for a new/moved top-level task: max(position)+1 within the
    bucket's pending top-level tasks, or 0 if the bucket is empty. Every bucket
    keeps its own ordering (not just Today)."""
    max_pos = db.exec(
        select(func.max(Task.position)).where(
            Task.user_id == user_id,
            Task.bucket == bucket,
            Task.status == TaskStatus.pending,
            Task.parent_id.is_(None),
        )
    ).first()
    return (max_pos + 1) if max_pos is not None else 0


def create_task(
    db: Session,
    user_id: uuid.UUID,
    text: str,
    bucket: BucketType = BucketType.today,
    domain_id: uuid.UUID | None = None,
    parent_id: uuid.UUID | None = None,
    notes: str | None = None,
    skip_triage_stamp: bool = False,
    important: bool = False,
    urgent: bool = False,
    size: SizeType | None = None,
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

    # Normalize notes: empty string → None
    if notes is not None:
        notes = notes.strip() or None

    # Validate notes length
    if notes is not None and len(notes) > 2000:
        raise AppError(
            code="validation_error",
            message="Notes must be 2000 characters or fewer",
            status_code=422,
        )

    # If sub-task, validate parent and inherit bucket/domain
    if parent_id is not None:
        if notes is not None:
            raise AppError(
                code="validation_error",
                message="Sub-tasks cannot have notes",
                status_code=400,
            )
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

    # Top-level tasks get an append position within their bucket (every bucket,
    # not just Today). Subtasks stay unordered (position stays None).
    position = None
    if parent_id is None:
        position = _next_position(db, user_id, bucket)

    task = Task(
        user_id=user_id,
        text=text.strip(),
        bucket=bucket,
        status=TaskStatus.pending,
        domain_id=domain_id,
        parent_id=parent_id,
        notes=notes,
        position=position,
        triaged_at=None if skip_triage_stamp else date.today(),
        important=important,
        urgent=urgent,
        size=size,
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

    # Every bucket is position-ordered (nulls last, then newest). Legacy tasks
    # with no position sort after positioned ones until first reordered.
    query = _load_related(query).order_by(
        case((Task.position.is_(None), 1), else_=0),  # nulls last
        Task.position.asc(),
        Task.created_at.desc(),
    )
    return list(db.exec(query).all())


def get_task(db: Session, user_id: uuid.UUID, task_id: uuid.UUID) -> Task:
    query = _load_related(_base_query(user_id).where(Task.id == task_id))
    task = db.exec(query).first()
    if task is None:
        raise NotFoundError("Task not found")
    return task


_UNSET = object()


def update_task(
    db: Session,
    user_id: uuid.UUID,
    task_id: uuid.UUID,
    *,
    text: str | None = None,
    bucket: BucketType | None = None,
    domain_id: uuid.UUID | None | object = _UNSET,
    status: TaskStatus | None = None,
    notes: str | None | object = _UNSET,
    important: bool | None = None,
    urgent: bool | None = None,
    size: SizeType | None | object = _UNSET,
) -> Task:
    task = get_task(db, user_id, task_id)

    if notes is not _UNSET:
        # Normalize empty string → None first
        if isinstance(notes, str):
            notes = notes.strip() or None
        if task.parent_id is not None and notes is not None:
            raise AppError(
                code="validation_error",
                message="Sub-tasks cannot have notes",
                status_code=400,
            )
        if notes is not None and len(notes) > 2000:
            raise AppError(
                code="validation_error",
                message="Notes must be 2000 characters or fewer",
                status_code=422,
            )
        task.notes = notes

    if text is not None:
        if len(text) > 500:
            raise AppError(
                code="validation_error",
                message="Task text must be 500 characters or fewer",
                status_code=422,
            )
        task.text = text.strip()
    if bucket is not None and bucket != task.bucket:
        # Moving buckets: append to the destination's order. Position isn't
        # carried across buckets (no meaningful rank to preserve), per the
        # "order is sacred" model — only explicit reorder sets a rank.
        if task.parent_id is None:
            task.position = _next_position(db, user_id, bucket)
        task.bucket = bucket
    if domain_id is not _UNSET:
        task.domain_id = domain_id
    if important is not None:
        task.important = important
    if urgent is not None:
        task.urgent = urgent
    if size is not _UNSET:
        task.size = size
    if status is not None:
        allowed = {
            # pending → archived (let go / compost), archived → pending (restore),
            # complete → pending (reopen, e.g. undo a triage "Done").
            TaskStatus.pending: {TaskStatus.archived},
            TaskStatus.archived: {TaskStatus.pending},
            TaskStatus.complete: {TaskStatus.pending},
        }
        if status not in allowed.get(task.status, set()):
            raise AppError(
                code="invalid_status_transition",
                message=f"Cannot transition from {task.status.value} to {status.value}",
                status_code=422,
            )
        # Restoring an archived task: reset triaged_at so it enters triage
        if task.status == TaskStatus.archived and status == TaskStatus.pending:
            task.triaged_at = None
        # Reopening a completed task: clear completion timestamp.
        if task.status == TaskStatus.complete and status == TaskStatus.pending:
            task.completed_at = None
        task.status = status

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


def reorder_tasks(
    db: Session, user_id: uuid.UUID, task_ids: list[uuid.UUID], bucket: BucketType
) -> int:
    # Verify the id set matches all pending top-level tasks in the given bucket.
    all_in_bucket = list(
        db.exec(
            select(Task).where(
                Task.user_id == user_id,
                Task.bucket == bucket,
                Task.status == TaskStatus.pending,
                Task.parent_id.is_(None),
            )
        ).all()
    )
    all_bucket_ids = {t.id for t in all_in_bucket}
    if set(task_ids) != all_bucket_ids:
        raise AppError(
            code="incomplete_reorder",
            message=f"All pending {bucket} tasks must be included in reorder",
            status_code=400,
        )

    task_map = {t.id: t for t in all_in_bucket}
    for i, task_id in enumerate(task_ids):
        task_map[task_id].position = i
        db.add(task_map[task_id])
    db.flush()
    return len(task_ids)


def delete_task(db: Session, user_id: uuid.UUID, task_id: uuid.UUID) -> None:
    # Verify task exists and belongs to user
    task = get_task(db, user_id, task_id)
    # Use raw SQL DELETE to avoid ORM cascade + lazy="raise" conflicts.
    # DB-level ON DELETE CASCADE handles children automatically.
    from sqlalchemy import delete

    db.expunge(task)
    db.execute(delete(Task).where(Task.id == task_id))
    db.flush()
