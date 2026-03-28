import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Column, String
from sqlmodel import Field, Relationship, SQLModel

from app.models.enums import BucketType, TaskStatus


class Task(SQLModel, table=True):
    __tablename__ = "tasks"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", ondelete="CASCADE")
    text: str = Field(max_length=500)
    bucket: BucketType = Field(sa_column=Column(String, nullable=False, default="today"))
    status: TaskStatus = Field(sa_column=Column(String, nullable=False, default="pending"))
    reschedule_count: int = Field(default=0)
    position: int | None = Field(default=None)
    triaged_at: date | None = Field(default=None)

    # Parent task (one level of sub-tasks)
    parent_id: uuid.UUID | None = Field(
        default=None, foreign_key="tasks.id", ondelete="CASCADE", index=True
    )

    # Domain (SET NULL on domain delete)
    domain_id: uuid.UUID | None = Field(
        default=None, foreign_key="domains.id", ondelete="SET NULL", index=True
    )

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: datetime | None = Field(default=None)

    # Relationships
    user: "User" = Relationship(  # noqa: F821
        back_populates="tasks",
        sa_relationship_kwargs={"lazy": "raise"},
    )
    domain: Optional["Domain"] = Relationship(  # noqa: F821
        back_populates="tasks",
        sa_relationship_kwargs={"lazy": "raise"},
    )
    parent: Optional["Task"] = Relationship(
        back_populates="children",
        sa_relationship_kwargs={
            "lazy": "raise",
            "remote_side": "Task.id",
        },
    )
    children: list["Task"] = Relationship(
        back_populates="parent",
        cascade_delete=True,
        sa_relationship_kwargs={"lazy": "raise", "passive_deletes": True},
    )
