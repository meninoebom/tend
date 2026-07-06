import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel


class ApiToken(SQLModel, table=True):
    """A personal access token a user issues for external clients (Plot, Raycast,
    iOS Shortcuts, etc.).

    Only the SHA-256 hash of the raw token is stored — the raw ``tend_pat_...``
    value is shown once at creation and never persisted. Lookup at auth time is
    by hash, so it must be a fast (non-salted) digest, not bcrypt.
    """

    __tablename__ = "api_tokens"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", ondelete="CASCADE", index=True)
    token_hash: str = Field(index=True, unique=True)
    name: str = Field(max_length=100)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_used_at: datetime | None = Field(default=None)
