import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.core.deps import get_db
from app.core.errors import AppError
from app.core.rate_limit import limiter
from app.core.security import get_current_user_id
from app.models.domain import Domain
from app.models.enums import BucketType, TaskStatus
from app.models.task import Task
from app.models.user import User
from app.schemas.chat_schemas import ChatRequest, ChatResponse
from app.services import chat_service, mit_service, stats_service

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
@limiter.limit("20/minute")
def chat(
    request: Request,
    body: ChatRequest,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    user = db.get(User, user_id)
    is_pro = user.subscription_status in ("active", "past_due")
    if not is_pro:
        raise AppError(
            code="pro_required",
            message="AI chat requires a Pro subscription",
            status_code=403,
        )

    # Gather task data
    tasks = list(
        db.exec(
            select(Task)
            .where(Task.user_id == user_id, Task.parent_id.is_(None))  # type: ignore[union-attr]
            .options(selectinload(Task.domain), selectinload(Task.children))
        ).all()
    )

    domains = list(
        db.exec(
            select(Domain)
            .where(Domain.user_id == user_id)
            .order_by(Domain.position)
        ).all()
    )

    nudge = stats_service.get_nudge(db, user_id)

    # Get MIT
    mit_task_id = mit_service.get_today_mit(db, user_id)
    mit_task = db.get(Task, mit_task_id) if mit_task_id else None

    # Build context summary
    pending_count = sum(1 for t in tasks if t.status == TaskStatus.pending)
    domain_count = len(domains)
    context_summary = f"Based on {pending_count} pending tasks across {domain_count} domains"

    # Generate response
    history = [{"role": m.role, "content": m.content} for m in body.history]
    reply = chat_service.generate_response(
        tasks=tasks,
        domains=domains,
        nudge_stats=nudge,
        mit_task=mit_task,
        message=body.message,
        history=history,
    )

    if reply is None:
        raise AppError(
            code="ai_unavailable",
            message="AI chat is temporarily unavailable. Please try again later.",
            status_code=503,
        )

    return ChatResponse(reply=reply, context_summary=context_summary)
