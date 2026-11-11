import re
import uuid
from collections.abc import AsyncGenerator, Generator
from contextlib import asynccontextmanager, contextmanager
from typing import Literal

import anyio.to_thread
from mcp.server.mcpserver import Context, MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations
from sqlmodel import Session
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.api import domains as domain_routes
from app.api import state as state_routes
from app.api import tasks as task_routes
from app.api import triage as triage_routes
from app.core.deps import get_db
from app.core.errors import AppError
from app.models.enums import BucketType, SizeType, TaskStatus
from app.schemas.task_schemas import TaskCreate, TaskResponse, TaskUpdate
from app.schemas.triage_schemas import (
    TriageAction,
    TriageQueueResponse,
    TriageRequest,
    TriageResultResponse,
)
from app.services import api_token_service, domain_service

open_session = contextmanager(get_db)

INSTRUCTIONS = """\
Tend is a "conscious" todo app. Its concepts:
- Buckets: every task lives in one of today, soon, later, someday.
- Triage: each morning the user decides, task by task, what belongs in today.
  The triage queue holds tasks not yet triaged today.
- MIT: the single Most Important Task for today. Only a pending today task can be the MIT.
- Domains: up to 5 life areas (e.g. Work, Health) a task can belong to.
- Priority: important and urgent flags (an Eisenhower matrix).
- Size: s (under 30 min), m (about an hour), l (half a day).
- Letting a task go archives it (reversible). Old tasks in non-today buckets are
  archived automatically after 30 days ("composting").
Nothing here deletes data."""

READ = ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True)
WRITE = ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False)
IDEMPOTENT_WRITE = ToolAnnotations(
    read_only_hint=False, destructive_hint=False, idempotent_hint=True
)

server = MCPServer(name="Tend", instructions=INSTRUCTIONS)


@contextmanager
def _user_session(ctx: Context) -> Generator[tuple[Session, uuid.UUID]]:
    user_id = ctx.request_context.request.state.tend_user_id
    try:
        with open_session() as db:
            yield db, user_id
    except AppError as exc:
        raise ToolError(exc.message) from exc


def _domain_id_by_name(db: Session, user_id: uuid.UUID, name: str) -> uuid.UUID:
    domains = domain_service.get_domains(db, user_id)
    for domain in domains:
        if domain.name.lower() == name.strip().lower():
            return domain.id
    known = ", ".join(d.name for d in domains) or "none"
    raise AppError(
        code="unknown_domain",
        message=f"No domain named '{name}'. Domains: {known}",
        status_code=422,
    )


@server.tool(
    name="tend_get_state",
    description="Counts of pending tasks per bucket (today, soon, later, someday), "
    "completed tasks, and pending tasks per priority quadrant. A quick overview.",
    annotations=READ,
)
def get_state(ctx: Context) -> state_routes.StateResponse:
    with _user_session(ctx) as (db, user_id):
        return state_routes.get_state(db=db, user_id=user_id)


@server.tool(
    name="tend_list_tasks",
    description="List tasks in one bucket (default today) with a status (default pending). "
    "Omit bucket to list every bucket. Each task shows its id, domain, priority, size, "
    "and whether it is today's MIT.",
    annotations=READ,
)
def list_tasks(
    ctx: Context,
    bucket: BucketType | None = BucketType.today,
    status: TaskStatus = TaskStatus.pending,
) -> list[TaskResponse]:
    with _user_session(ctx) as (db, user_id):
        return task_routes.list_tasks(
            bucket=bucket, status=status, domain_id=None, db=db, user_id=user_id
        )


@server.tool(
    name="tend_get_triage_queue",
    description="Tasks waiting for today's morning triage. Work through them with "
    "tend_triage_task. Also composts (archives) tasks untouched for 30 days.",
    annotations=WRITE,
)
def get_triage_queue(ctx: Context) -> TriageQueueResponse:
    with _user_session(ctx) as (db, user_id):
        return triage_routes.get_triage_queue(db=db, user_id=user_id)


@server.tool(
    name="tend_list_domains",
    description="The user's life domains (e.g. Work, Health). Use a domain's name "
    "when adding or updating a task.",
    annotations=READ,
)
def list_domains(ctx: Context) -> list[domain_routes.DomainResponse]:
    with _user_session(ctx) as (db, user_id):
        return domain_routes.list_domains(db=db, user_id=user_id)


@server.tool(
    name="tend_add_task",
    description="Add a task. Defaults to the today bucket. Optionally set a domain by name, "
    "important/urgent flags, a size (s, m, l), and a note.",
    annotations=WRITE,
)
def add_task(
    ctx: Context,
    text: str,
    bucket: BucketType = BucketType.today,
    domain: str | None = None,
    important: bool = False,
    urgent: bool = False,
    size: SizeType | None = None,
    notes: str | None = None,
) -> TaskResponse:
    with _user_session(ctx) as (db, user_id):
        body = TaskCreate(
            text=text,
            bucket=bucket,
            domain_id=_domain_id_by_name(db, user_id, domain) if domain else None,
            important=important,
            urgent=urgent,
            size=size,
            notes=notes,
        )
        return task_routes.create_task(body=body, db=db, user_id=user_id)


@server.tool(
    name="tend_triage_task",
    description="Record a morning triage decision for one task: 'confirm' keeps it in today, "
    "'defer' moves it to another bucket (bucket required), 'complete' marks it done. "
    "Optionally rewrite its text.",
    annotations=WRITE,
)
def triage_task(
    ctx: Context,
    task_id: uuid.UUID,
    action: Literal["confirm", "defer", "complete"],
    bucket: BucketType | None = None,
    rewritten_text: str | None = None,
) -> TriageResultResponse:
    with _user_session(ctx) as (db, user_id):
        body = TriageRequest(
            action=TriageAction(action), bucket=bucket, rewritten_text=rewritten_text
        )
        return triage_routes.triage_task(task_id=task_id, body=body, db=db, user_id=user_id)


@server.tool(
    name="tend_update_task",
    description="Change a task: text, bucket, domain (by name), note, important/urgent, size. "
    "Set let_go=true to archive a task the user no longer wants (reversible). "
    "Only the fields you pass change.",
    annotations=IDEMPOTENT_WRITE,
)
def update_task(
    ctx: Context,
    task_id: uuid.UUID,
    text: str | None = None,
    bucket: BucketType | None = None,
    domain: str | None = None,
    notes: str | None = None,
    important: bool | None = None,
    urgent: bool | None = None,
    size: SizeType | None = None,
    let_go: bool = False,
) -> TaskResponse:
    with _user_session(ctx) as (db, user_id):
        changes = {
            "text": text,
            "bucket": bucket,
            "notes": notes,
            "important": important,
            "urgent": urgent,
            "size": size,
        }
        fields = {key: value for key, value in changes.items() if value is not None}
        if domain is not None:
            fields["domain_id"] = _domain_id_by_name(db, user_id, domain)
        if let_go:
            fields["status"] = TaskStatus.archived
        body = TaskUpdate(**fields)
        return task_routes.update_task(task_id=task_id, body=body, db=db, user_id=user_id)


@server.tool(
    name="tend_complete_task",
    description="Mark a task done.",
    annotations=IDEMPOTENT_WRITE,
)
def complete_task(ctx: Context, task_id: uuid.UUID) -> TaskResponse:
    with _user_session(ctx) as (db, user_id):
        return task_routes.complete_task(task_id=task_id, db=db, user_id=user_id)


@server.tool(
    name="tend_set_mit",
    description="Make a pending today task the MIT (Most Important Task) for today. "
    "Replaces any existing MIT.",
    annotations=IDEMPOTENT_WRITE,
)
def set_mit(ctx: Context, task_id: uuid.UUID) -> TaskResponse:
    with _user_session(ctx) as (db, user_id):
        return task_routes.set_mit(task_id=task_id, db=db, user_id=user_id)


def _authenticate(token: str) -> uuid.UUID | None:
    with open_session() as db:
        return api_token_service.authenticate(db, token)


class TokenInPathEndpoint:
    """Serves MCP at /mcp/<personal access token>.

    The token rides in the URL because Claude's custom-connector form takes a URL
    and nothing else. It authenticates the caller, then hands the request to the
    MCP app with the user id on request.state.
    """

    def __init__(self) -> None:
        self._mcp_app: ASGIApp | None = None

    @asynccontextmanager
    async def running(self) -> AsyncGenerator[None]:
        self._mcp_app = server.streamable_http_app(
            stateless_http=True, json_response=True, host="0.0.0.0"
        )
        async with server.session_manager.run():
            yield

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        token = scope["path"].rstrip("/").rsplit("/", 1)[-1]
        user_id = await anyio.to_thread.run_sync(_authenticate, token)
        if user_id is None or self._mcp_app is None:
            response = JSONResponse(
                {"code": "unauthorized", "message": "Invalid or revoked access token"},
                status_code=401,
            )
            await response(scope, receive, send)
            return
        state = {**scope.get("state", {}), "tend_user_id": user_id}
        inner_scope = {
            **scope,
            "path": "/mcp",
            "raw_path": b"/mcp",
            "root_path": "",
            "state": state,
        }
        await self._mcp_app(inner_scope, receive, send)


endpoint = TokenInPathEndpoint()

TOKEN_IN_PATH = re.compile(rf"{api_token_service.TOKEN_PREFIX}[A-Za-z0-9_-]+")


def redact_tokens(text: str) -> str:
    return TOKEN_IN_PATH.sub(f"{api_token_service.TOKEN_PREFIX}[redacted]", text)
