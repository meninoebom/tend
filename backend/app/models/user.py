import uuid
from datetime import datetime

from sqlalchemy import Column, String
from sqlmodel import Field, Relationship, SQLModel

from app.models.enums import AuthProvider


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(index=True, unique=True)
    password_hash: str | None = Field(default=None)
    auth_provider: AuthProvider = Field(
        sa_column=Column(String, nullable=False, default="email")
    )
    has_completed_onboarding: bool = Field(default=False)
    has_triaged_before: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships — lazy="raise" prevents N+1 queries
    tasks: list["Task"] = Relationship(  # noqa: F821
        back_populates="user",
        cascade_delete=True,
        sa_relationship_kwargs={"lazy": "raise"},
    )
    domains: list["Domain"] = Relationship(  # noqa: F821
        back_populates="user",
        cascade_delete=True,
        sa_relationship_kwargs={"lazy": "raise"},
    )
