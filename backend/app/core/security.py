import uuid

from fastapi import Depends, Header
from jose import JWTError, jwt
from sqlmodel import Session

from app.core.config import settings
from app.core.deps import get_db
from app.core.errors import AppError

ALGORITHM = "HS256"


def _user_id_from_jwt(token: str) -> uuid.UUID | None:
    """Decode a proxy JWT to a user_id, or None if it isn't a valid one."""
    try:
        payload = jwt.decode(token, settings.internal_jwt_secret, algorithms=[ALGORITHM])
    except JWTError:
        return None
    sub = payload.get("sub")
    if sub is None:
        return None
    try:
        return uuid.UUID(sub)
    except ValueError:
        return None


def get_current_user_id(
    authorization: str | None = Header(default=None),
) -> uuid.UUID:
    """Extract user_id from proxy JWT signed by the Next.js frontend.

    The frontend API proxy signs a short-lived JWT (60s TTL) using
    INTERNAL_JWT_SECRET. This dependency validates that JWT and extracts
    the user_id from the 'sub' claim.
    """
    if authorization is None or not authorization.startswith("Bearer "):
        raise AppError(
            code="unauthorized",
            message="Missing or invalid authorization header",
            status_code=401,
        )

    token = authorization.removeprefix("Bearer ").strip()

    try:
        payload = jwt.decode(token, settings.internal_jwt_secret, algorithms=[ALGORITHM])
    except JWTError:
        raise AppError(
            code="unauthorized",
            message="Invalid or expired token",
            status_code=401,
        )

    sub = payload.get("sub")
    if sub is None:
        raise AppError(
            code="unauthorized",
            message="Token missing subject claim",
            status_code=401,
        )

    try:
        return uuid.UUID(sub)
    except ValueError:
        raise AppError(
            code="unauthorized",
            message="Invalid user ID in token",
            status_code=401,
        )


def get_user_id_allow_pat(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> uuid.UUID:
    """Like ``get_current_user_id`` but also accepts a personal access token.

    Apply this dependency ONLY to the endpoints external clients (Plot, capture
    tools) are allowed to reach. The proxy JWT continues to work everywhere,
    including these routes; a ``tend_pat_...`` token works ONLY on routes that
    opt in by using this dependency. That is the whole scoping mechanism — no
    per-path allowlist needed.
    """
    if authorization is None or not authorization.startswith("Bearer "):
        raise AppError(
            code="unauthorized",
            message="Missing or invalid authorization header",
            status_code=401,
        )

    token = authorization.removeprefix("Bearer ").strip()

    # Personal access token path.
    from app.services import api_token_service

    if token.startswith(api_token_service.TOKEN_PREFIX):
        user_id = api_token_service.authenticate(db, token)
        if user_id is None:
            raise AppError(
                code="unauthorized",
                message="Invalid or revoked access token",
                status_code=401,
            )
        return user_id

    # Otherwise fall back to the short-lived proxy JWT.
    user_id = _user_id_from_jwt(token)
    if user_id is None:
        raise AppError(
            code="unauthorized",
            message="Invalid or expired token",
            status_code=401,
        )
    return user_id
