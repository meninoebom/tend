import uuid

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.core.deps import get_db
from app.core.errors import AppError, NotFoundError
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
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
):
    """Create a new user. Called by NextAuth on first login."""
    import bcrypt

    email = body.email.strip().lower()

    # Handle double-click race: return existing user instead of 500
    existing = db.exec(select(User).where(User.email == email)).first()
    if existing:
        return _to_response(existing)

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
def verify_user(
    body: UserVerify,
    db: Session = Depends(get_db),
):
    """Verify email/password credentials. Called by NextAuth on login."""
    import bcrypt

    email = body.email.strip().lower()
    user = db.exec(select(User).where(User.email == email)).first()
    if user is None or user.password_hash is None:
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
