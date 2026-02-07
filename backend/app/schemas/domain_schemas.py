import uuid

from pydantic import BaseModel


class DomainCreate(BaseModel):
    name: str
    color: str


class DomainUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    position: int | None = None


class DomainResponse(BaseModel):
    id: uuid.UUID
    name: str
    color: str
    position: int
