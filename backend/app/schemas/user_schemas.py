import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.enums import AuthProvider


class UserCreate(BaseModel):
    email: str
    password: str | None = None
    auth_provider: AuthProvider = AuthProvider.email


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    auth_provider: AuthProvider
    has_completed_onboarding: bool
    has_triaged_before: bool
    created_at: datetime


class UserVerify(BaseModel):
    email: str
    password: str


class UserUpdate(BaseModel):
    has_completed_onboarding: bool | None = None
