import uuid
from enum import StrEnum

from pydantic import BaseModel

from app.models.enums import BucketType
from app.schemas.task_schemas import TaskResponse


class TriageAction(StrEnum):
    confirm = "confirm"
    defer = "defer"
    complete = "complete"
    kill = "kill"


class TriageRequest(BaseModel):
    action: TriageAction
    bucket: BucketType | None = None  # required for defer
    rewritten_text: str | None = None


class TriageQueueResponse(BaseModel):
    tasks: list[TaskResponse]
    total_count: int
    completion_average: float
    triage_complete: bool


class TriageResultResponse(BaseModel):
    task_id: uuid.UUID
    action: TriageAction
    same_text_warning: bool = False
    triage_complete: bool
    remaining: int
