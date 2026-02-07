import uuid

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel


class Domain(SQLModel, table=True):
    __tablename__ = "domains"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_domains_user_name"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", ondelete="CASCADE", index=True)
    name: str = Field(max_length=100)
    color: str = Field(max_length=7)  # hex color e.g. #22c55e
    position: int = Field(default=0)

    # Relationships
    user: "User" = Relationship(  # noqa: F821
        back_populates="domains",
        sa_relationship_kwargs={"lazy": "raise"},
    )
    tasks: list["Task"] = Relationship(  # noqa: F821
        back_populates="domain",
        passive_deletes=True,
        sa_relationship_kwargs={"lazy": "raise"},
    )
