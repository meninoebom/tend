import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

from app.models.enums import BucketType, SizeType, TaskStatus


class PriorityUpdate(BaseModel):
    important: bool | None = None
    urgent: bool | None = None


class TaskCreate(BaseModel):
    text: str
    bucket: BucketType = BucketType.today
    domain_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None
    notes: str | None = None
    skip_triage_stamp: bool = False
    important: bool = False
    urgent: bool = False
    size: SizeType | None = None


class TaskUpdate(BaseModel):
    text: str | None = None
    bucket: BucketType | None = None
    domain_id: uuid.UUID | None = None
    status: TaskStatus | None = None
    notes: str | None = None
    important: bool | None = None
    urgent: bool | None = None
    size: SizeType | None = None


class ReorderRequest(BaseModel):
    task_ids: list[uuid.UUID]
    bucket: BucketType = BucketType.today

    @field_validator("task_ids")
    @classmethod
    def validate_task_ids(cls, v: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(v) == 0:
            raise ValueError("task_ids must not be empty")
        if len(v) != len(set(v)):
            raise ValueError("task_ids must not contain duplicates")
        return v


class PlacementCreate(BaseModel):
    """Plot reports that a task was placed into a time block.

    The JSON field is ``date``; the attribute is ``placement_date`` to avoid
    shadowing the ``date`` type annotation.
    """

    model_config = ConfigDict(populate_by_name=True)

    placement_date: date = Field(alias="date")
    block_start: datetime | None = None
    block_type: str | None = None
    calendar_event_id: str | None = None


class DomainBrief(BaseModel):
    id: uuid.UUID
    name: str
    color: str


class SubTaskResponse(BaseModel):
    id: uuid.UUID
    text: str
    status: TaskStatus
    completed_at: datetime | None


class PlacementBrief(BaseModel):
    """Today's time-block placement for a task, as reported by Plot."""

    block_start: datetime | None
    block_type: str | None
    calendar_event_id: str | None


class TaskResponse(BaseModel):
    id: uuid.UUID
    text: str
    bucket: BucketType
    status: TaskStatus
    reschedule_count: int
    triaged_at: date | None
    notes: str | None
    domain: DomainBrief | None
    parent_id: uuid.UUID | None
    children: list[SubTaskResponse]
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None
    is_mit: bool = False
    important: bool = False
    urgent: bool = False
    size: SizeType | None = None
    placement: PlacementBrief | None = None

    @computed_field
    @property
    def age_days(self) -> int:
        return (datetime.utcnow() - self.created_at).days
