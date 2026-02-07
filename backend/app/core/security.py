import uuid

from fastapi import Header
from jose import JWTError, jwt

from app.core.config import settings
from app.core.errors import AppError

ALGORITHM = "HS256"


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
