import hashlib
import secrets
import uuid
from datetime import datetime

from sqlmodel import Session, select

from app.core.errors import AppError, NotFoundError
from app.models.api_token import ApiToken

TOKEN_PREFIX = "tend_pat_"
MAX_TOKENS_PER_USER = 20


def _hash_token(raw: str) -> str:
    """SHA-256 hex digest. Fast (unsalted) on purpose: auth looks a token up by
    its hash, so the digest must be reproducible without knowing the user."""
    return hashlib.sha256(raw.encode()).hexdigest()


def create_token(db: Session, user_id: uuid.UUID, name: str) -> tuple[ApiToken, str]:
    """Create a token and return (record, raw_token). The raw token is only
    available here — after this it exists solely as a hash."""
    name = name.strip()
    if not name:
        raise AppError(code="validation_error", message="Token name is required", status_code=422)
    if len(name) > 100:
        raise AppError(
            code="validation_error",
            message="Token name must be 100 characters or fewer",
            status_code=422,
        )

    existing = db.exec(select(ApiToken).where(ApiToken.user_id == user_id)).all()
    if len(existing) >= MAX_TOKENS_PER_USER:
        raise AppError(
            code="token_limit_reached",
            message=f"You can have at most {MAX_TOKENS_PER_USER} tokens",
            status_code=422,
        )

    raw = TOKEN_PREFIX + secrets.token_urlsafe(32)
    token = ApiToken(user_id=user_id, token_hash=_hash_token(raw), name=name)
    db.add(token)
    db.flush()
    db.refresh(token)
    return token, raw


def list_tokens(db: Session, user_id: uuid.UUID) -> list[ApiToken]:
    return list(
        db.exec(
            select(ApiToken).where(ApiToken.user_id == user_id).order_by(ApiToken.created_at.desc())
        ).all()
    )


def revoke_token(db: Session, user_id: uuid.UUID, token_id: uuid.UUID) -> None:
    token = db.get(ApiToken, token_id)
    if token is None or token.user_id != user_id:
        raise NotFoundError("Token not found")
    db.delete(token)
    db.flush()


def authenticate(db: Session, raw: str) -> uuid.UUID | None:
    """Resolve a raw ``tend_pat_...`` token to a user_id, or None if invalid.

    Stamps ``last_used_at`` on success. Runs in its own transaction concern-free:
    the caller's ``get_db`` owns commit/rollback.
    """
    if not raw.startswith(TOKEN_PREFIX):
        return None
    token = db.exec(select(ApiToken).where(ApiToken.token_hash == _hash_token(raw))).first()
    if token is None:
        return None
    token.last_used_at = datetime.utcnow()
    db.add(token)
    db.flush()
    return token.user_id
