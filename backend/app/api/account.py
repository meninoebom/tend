import uuid

from fastapi import APIRouter, Depends, Request
from sqlmodel import Session, select

from app.core.deps import get_db
from app.core.errors import AppError, NotFoundError
from app.core.rate_limit import limiter
from app.core.security import get_current_user_id
from app.models.user import User
from app.schemas.user_schemas import UserCreate, UserResponse, UserUpdate, UserVerify
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
