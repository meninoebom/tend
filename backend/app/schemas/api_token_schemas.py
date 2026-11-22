import uuid

from pydantic import BaseModel

from app.schemas.utc import UtcDatetime


class ApiTokenCreate(BaseModel):
    name: str


class ApiTokenResponse(BaseModel):
    """Metadata only — never carries the raw token."""

    id: uuid.UUID
    name: str
    created_at: UtcDatetime
    last_used_at: UtcDatetime | None


class ApiTokenCreated(ApiTokenResponse):
    """Returned once, at creation, with the raw token to copy."""

    token: str
