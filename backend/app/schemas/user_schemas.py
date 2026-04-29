import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator

from app.models.enums import AuthProvider, LayoutType


class UserCreate(BaseModel):
    email: str
    password: str | None = None
    auth_provider: AuthProvider = AuthProvider.email

    @field_validator("password")
    @classmethod
    def check_password_length(cls, v: str | None) -> str | None:
        if v is not None and len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    auth_provider: AuthProvider
    has_completed_onboarding: bool
    has_triaged_before: bool
    created_at: datetime
    subscription_status: str = "free"
    is_pro: bool = False
    default_layout: LayoutType = LayoutType.list
    triage_reminder_enabled: bool
    triage_reminder_hour: int


class OAuthUser(BaseModel):
    email: str


class UserVerify(BaseModel):
    email: str
    password: str


class UserUpdate(BaseModel):
    has_completed_onboarding: bool | None = None
    default_layout: LayoutType | None = None
    triage_reminder_enabled: bool | None = None
    triage_reminder_hour: int | None = None

    @field_validator("triage_reminder_hour")
    @classmethod
    def validate_reminder_hour(cls, v: int | None) -> int | None:
        if v is not None and not (0 <= v <= 23):
            raise ValueError("triage_reminder_hour must be between 0 and 23")
        return v


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def check_password_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v
