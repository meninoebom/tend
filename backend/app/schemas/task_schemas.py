import uuid
from datetime import date, datetime

from pydantic import BaseModel, computed_field

from app.models.enums import BucketType, TaskStatus


class TaskCreate(BaseModel):
    text: str
    bucket: BucketType = BucketType.today
    domain_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None
    skip_triage_stamp: bool = False


class TaskUpdate(BaseModel):
    text: str | None = None
    bucket: BucketType | None = None
    domain_id: uuid.UUID | None = None
    status: TaskStatus | None = None


class ReorderRequest(BaseModel):
    task_ids: list[uuid.UUID]


class DomainBrief(BaseModel):
    id: uuid.UUID
    name: str
    color: str


class SubTaskResponse(BaseModel):
    id: uuid.UUID
    text: str
    status: TaskStatus
    completed_at: datetime | None


class TaskResponse(BaseModel):
    id: uuid.UUID
    text: str
    bucket: BucketType
    status: TaskStatus
    reschedule_count: int
    triaged_at: date | None
    domain: DomainBrief | None
    parent_id: uuid.UUID | None
    children: list[SubTaskResponse]
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None
    is_mit: bool = False

    @computed_field
    @property
    def age_days(self) -> int:
        return (datetime.utcnow() - self.created_at).days
