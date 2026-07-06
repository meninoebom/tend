import uuid
from datetime import datetime

from pydantic import BaseModel


class ApiTokenCreate(BaseModel):
    name: str


class ApiTokenResponse(BaseModel):
    """Metadata only — never carries the raw token."""

    id: uuid.UUID
    name: str
    created_at: datetime
    last_used_at: datetime | None


class ApiTokenCreated(ApiTokenResponse):
    """Returned once, at creation, with the raw token to copy."""

    token: str
