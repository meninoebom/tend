import uuid
from datetime import date as date_type
from datetime import datetime
from typing import Optional

from sqlalchemy import Column, String, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel


class TaskPlacement(SQLModel, table=True):
    """A record that a task was placed into a time block by Plot.

    Tend never schedules — it only records the fact Plot reports (the same way it
    records ``reschedule_count``). One placement per (task, date): re-placing on
    the same day upserts. ``calendar_event_id`` is the Google Calendar event Plot
    created, kept so Plot can reconcile.
    """

    __tablename__ = "task_placements"
    __table_args__ = (UniqueConstraint("task_id", "date", name="uq_placement_task_date"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    task_id: uuid.UUID = Field(foreign_key="tasks.id", ondelete="CASCADE", index=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", ondelete="CASCADE", index=True)
    date: date_type = Field(index=True)
    block_start: datetime | None = Field(default=None)
    block_type: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    calendar_event_id: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    task: Optional["Task"] = Relationship(  # noqa: F821
        back_populates="placements",
        sa_relationship_kwargs={"lazy": "raise"},
    )
