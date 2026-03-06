import html
import logging
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Request
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlmodel import Session, select

logger = logging.getLogger(__name__)

from app.core.config import settings
from app.core.deps import get_db
from app.core.errors import AppError, NotFoundError
from app.core.rate_limit import limiter
from app.core.security import ALGORITHM, get_current_user_id
from app.models.enums import AuthProvider
from app.models.user import User
from app.schemas.user_schemas import (
    ForgotPasswordRequest,
    OAuthUser,
    ResetPasswordRequest,
    UserCreate,
    UserResponse,
    UserUpdate,
    UserVerify,
)
from app.services import domain_service

router = APIRouter(tags=["account"])


def _to_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        auth_provider=user.auth_provider,
        has_completed_onboarding=user.has_completed_onboarding,
        has_triaged_before=user.has_triaged_before,
        created_at=user.created_at,
        subscription_status=user.subscription_status,
        is_pro=user.subscription_status in ("active", "past_due"),
    )


@router.post("/users", response_model=UserResponse, status_code=201)
@limiter.limit("5/minute")
def create_user(
    request: Request,
    body: UserCreate,
    db: Session = Depends(get_db),
):
    """Create a new user. Called by NextAuth on first login."""
    import bcrypt

    email = body.email.strip().lower()

    existing = db.exec(select(User).where(User.email == email)).first()
    if existing:
        # Email already registered. Reject with 409 to prevent:
        # 1. Auth bypass (old code returned the user without verifying password)
        # 2. User enumeration (old code returned different created_at/onboarding state)
        raise AppError(
            code="email_taken",
            message="An account with this email already exists",
            status_code=409,
        )

    password_hash = None
    if body.password:
        password_hash = bcrypt.hashpw(
            body.password.encode("utf-8"), bcrypt.gensalt()
        ).decode("utf-8")

    user = User(
        email=email,
        password_hash=password_hash,
        auth_provider=body.auth_provider,
    )
    db.add(user)
    db.flush()

    # Create 5 default domains
    domain_service.create_default_domains(db, user.id)

    db.refresh(user)
    return _to_response(user)


@router.post("/users/oauth", response_model=UserResponse)
@limiter.limit("10/minute")
def oauth_user(
    request: Request,
    body: OAuthUser,
    db: Session = Depends(get_db),
):
    """Find or create a user for OAuth sign-in. Auto-links if email exists."""
    email = body.email.strip().lower()

    existing = db.exec(select(User).where(User.email == email)).first()
    if existing:
        return _to_response(existing)

    user = User(
        email=email,
        password_hash=None,
        auth_provider=AuthProvider.google,
    )
    db.add(user)
    db.flush()

    domain_service.create_default_domains(db, user.id)

    db.refresh(user)
    return _to_response(user)


@router.post("/users/verify", response_model=UserResponse)
@limiter.limit("10/minute")
def verify_user(
    request: Request,
    body: UserVerify,
    db: Session = Depends(get_db),
):
    """Verify email/password credentials. Called by NextAuth on login."""
    import bcrypt

    email = body.email.strip().lower()
    user = db.exec(select(User).where(User.email == email)).first()

    # Dummy hash to prevent timing-based user enumeration.
    # Without this, "user not found" returns ~0ms (no bcrypt) vs
    # "wrong password" returns ~100ms (bcrypt runs), leaking user existence.
    _DUMMY_HASH = b"$2b$12$LJ3m4ys3Lz0YPmDqMN.JYOXBOvWYx0YXvKjK9Y8nF4W8xk8Z6m9e"

    if user is None or user.password_hash is None:
        bcrypt.checkpw(b"dummy", _DUMMY_HASH)
        raise AppError(
            code="invalid_credentials",
            message="Invalid email or password",
            status_code=401,
        )

    if not bcrypt.checkpw(
        body.password.encode("utf-8"), user.password_hash.encode("utf-8")
    ):
        raise AppError(
            code="invalid_credentials",
            message="Invalid email or password",
            status_code=401,
        )

    return _to_response(user)


@router.get("/me", response_model=UserResponse)
def get_me(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found")
    return _to_response(user)


@router.patch("/me", response_model=UserResponse)
def update_me(
    body: UserUpdate,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found")

    if body.has_completed_onboarding is not None:
        user.has_completed_onboarding = body.has_completed_onboarding

    db.add(user)
    db.flush()
    db.refresh(user)
    return _to_response(user)


@router.delete("/me", status_code=204)
def delete_me(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Delete account and all associated data (CASCADE)."""
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found")
    db.delete(user)
    db.flush()


def _create_reset_token(user_id: uuid.UUID) -> str:
    """Create a signed JWT for password reset (1-hour expiry)."""
    payload = {
        "sub": str(user_id),
        "purpose": "password_reset",
        "exp": datetime.utcnow() + timedelta(hours=1),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, settings.internal_jwt_secret, algorithm=ALGORITHM)


def _verify_reset_token(token: str) -> uuid.UUID:
    """Validate a password reset JWT and return the user ID."""
    try:
        payload = jwt.decode(token, settings.internal_jwt_secret, algorithms=[ALGORITHM])
    except JWTError:
        raise AppError(
            code="invalid_token",
            message="Invalid or expired reset link",
            status_code=400,
        )

    if payload.get("purpose") != "password_reset":
        raise AppError(
            code="invalid_token",
            message="Invalid or expired reset link",
            status_code=400,
        )

    try:
        return uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise AppError(
            code="invalid_token",
            message="Invalid or expired reset link",
            status_code=400,
        )


def _send_reset_email(to: str, token: str) -> None:
    """Send password reset email via Resend."""
    import resend

    resend.api_key = settings.resend_api_key
    reset_url = f"{settings.frontend_url}/reset-password?token={token}"

    resend.Emails.send({
        "from": "Tend <noreply@tend.gvempire.com>",
        "to": [to],
        "subject": "Reset your Tend password",
        "html": (
            f"<p>You requested a password reset for your Tend account.</p>"
            f'<p><a href="{reset_url}">Click here to reset your password</a></p>'
            f"<p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>"
        ),
    })


@router.post("/users/forgot-password")
@limiter.limit("3/minute")
def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    """Request a password reset email. Always returns 200 to prevent user enumeration."""
    email = body.email.strip().lower()
    user = db.exec(select(User).where(User.email == email)).first()

    if user is not None and user.password_hash is not None:
        token = _create_reset_token(user.id)
        if settings.resend_api_key:
            try:
                _send_reset_email(email, token)
            except Exception:
                logger.exception("Failed to send password reset email")

    return {"message": "If an account exists with that email, a reset link has been sent."}


@router.post("/users/reset-password")
@limiter.limit("5/minute")
def reset_password(
    request: Request,
    body: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    """Reset password using a valid reset token."""
    import bcrypt

    user_id = _verify_reset_token(body.token)

    user = db.get(User, user_id)
    if user is None:
        raise AppError(
            code="invalid_token",
            message="Invalid or expired reset link",
            status_code=400,
        )

    user.password_hash = bcrypt.hashpw(
        body.new_password.encode("utf-8"), bcrypt.gensalt()
    ).decode("utf-8")
    db.add(user)
    db.flush()

    return {"message": "Password has been reset successfully."}


# --- Feedback ---


class FeedbackRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


@router.post("/feedback", status_code=202)
@limiter.limit("3/minute")
def send_feedback(
    request: Request,
    body: FeedbackRequest,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Send user feedback via email."""
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found")

    if not settings.resend_api_key:
        return {"message": "Feedback received."}

    import resend

    resend.api_key = settings.resend_api_key
    resend.Emails.send({
        "from": "Tend <noreply@tend.gvempire.com>",
        "to": ["brandon@tendyourgarden.app"],
        "subject": f"Feedback from {user.email}",
        "html": (
            f"<p><strong>From:</strong> {html.escape(user.email)}</p>"
            f"<p><strong>Message:</strong></p>"
            f"<p>{html.escape(body.message)}</p>"
        ),
    })
    return {"message": "Feedback sent."}
