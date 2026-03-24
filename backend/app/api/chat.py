import json
import uuid

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.core.deps import get_db
from app.core.errors import AppError
from app.core.rate_limit import limiter
from app.core.security import get_current_user_id
from app.models.domain import Domain
from app.models.enums import TaskStatus
from app.models.task import Task
from app.models.user import User
from app.schemas.chat_schemas import ChatRequest, ChatResponse
from app.services import chat_service, mit_service, stats_service

router = APIRouter(prefix="/chat", tags=["chat"])


def _gather_chat_context(db: Session, user_id: uuid.UUID):
    """Gather task data, domains, stats, and MIT for chat context."""
    user = db.get(User, user_id)
    is_pro = user.subscription_status in ("active", "past_due")
    if not is_pro:
        raise AppError(
            code="pro_required",
            message="AI chat requires a Pro subscription",
            status_code=403,
        )

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

    mit_task_id = mit_service.get_today_mit(db, user_id)
    mit_task = db.get(Task, mit_task_id) if mit_task_id else None

    pending_count = sum(1 for t in tasks if t.status == TaskStatus.pending)
    context_summary = f"Based on {pending_count} pending tasks across {len(domains)} domains"

    return tasks, domains, nudge, mit_task, context_summary


@router.post("", response_model=ChatResponse)
@limiter.limit("20/minute")
def chat(
    request: Request,
    body: ChatRequest,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    tasks, domains, nudge, mit_task, context_summary = _gather_chat_context(db, user_id)

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


@router.post("/stream")
@limiter.limit("20/minute")
def chat_stream(
    request: Request,
    body: ChatRequest,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    tasks, domains, nudge, mit_task, context_summary = _gather_chat_context(db, user_id)
    history = [{"role": m.role, "content": m.content} for m in body.history]

    stream = chat_service.generate_response_stream(
        tasks=tasks,
        domains=domains,
        nudge_stats=nudge,
        mit_task=mit_task,
        message=body.message,
        history=history,
    )

    if stream is None:
        raise AppError(
            code="ai_unavailable",
            message="AI chat is temporarily unavailable. Please try again later.",
            status_code=503,
        )

    def event_generator():
        try:
            for token in stream:
                yield f"data: {json.dumps({'token': token})}\n\n"
            yield f"data: {json.dumps({'done': True, 'context_summary': context_summary})}\n\n"
        except Exception:
            yield f"data: {json.dumps({'error': 'Stream interrupted'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
