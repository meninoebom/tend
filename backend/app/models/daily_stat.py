import datetime as dt
import uuid

from sqlalchemy import PrimaryKeyConstraint
from sqlmodel import Field, SQLModel


class DailyStat(SQLModel, table=True):
    __tablename__ = "daily_stats"
    __table_args__ = (PrimaryKeyConstraint("user_id", "date"),)

    user_id: uuid.UUID = Field(foreign_key="users.id", ondelete="CASCADE")
    date: dt.date = Field()
    tasks_added: int = Field(default=0)
    tasks_completed: int = Field(default=0)
    mit_task_id: uuid.UUID | None = Field(default=None, foreign_key="tasks.id", ondelete="SET NULL")
