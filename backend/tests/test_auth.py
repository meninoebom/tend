"""Tests for JWT authentication on the FastAPI backend."""

import uuid
from collections.abc import Generator
from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from jose import jwt
from sqlmodel import Session

from app.core.config import settings
from app.core.deps import get_db
from app.core.security import ALGORITHM
from app.main import app
from app.models.enums import AuthProvider
from app.models.user import User

TEST_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000088")


def _make_token(
    user_id: str | None = None,
    *,
    secret: str | None = None,
    expires_delta: timedelta = timedelta(seconds=60),
    algorithm: str = ALGORITHM,
    include_sub: bool = True,
) -> str:
    """Create a JWT token for testing."""
    payload: dict = {
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + expires_delta,
    }
    if include_sub and user_id is not None:
        payload["sub"] = user_id
    return jwt.encode(payload, secret or settings.internal_jwt_secret, algorithm=algorithm)


class TestJWTAuth:
    """Test JWT validation without dependency overrides."""

    def _make_client(self, db: Session) -> TestClient:
        """Create a test client that uses real JWT auth (no auth override)."""

        def _override_db() -> Generator[Session]:
            yield db

        # Only override DB — NOT the auth dependency
        app.dependency_overrides[get_db] = _override_db
        return TestClient(app)

    def _make_user(self, db: Session) -> User:
        user = User(
            id=TEST_USER_ID,
            email="auth-test@tend.app",
            auth_provider=AuthProvider.email,
        )
        db.add(user)
        db.flush()
        return user

    def test_valid_token(self, db):
        user = self._make_user(db)
        token = _make_token(str(user.id))
        client = self._make_client(db)

        r = client.get("/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert r.json()["email"] == "auth-test@tend.app"

        app.dependency_overrides.clear()

    def test_missing_header(self, db):
        self._make_user(db)
        client = self._make_client(db)

        r = client.get("/me")
        assert r.status_code == 401
        assert r.json()["code"] == "unauthorized"

        app.dependency_overrides.clear()

    def test_expired_token(self, db):
        user = self._make_user(db)
        token = _make_token(str(user.id), expires_delta=timedelta(seconds=-10))
        client = self._make_client(db)

        r = client.get("/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 401

        app.dependency_overrides.clear()

    def test_wrong_secret(self, db):
        user = self._make_user(db)
        token = _make_token(str(user.id), secret="wrong-secret")
        client = self._make_client(db)

        r = client.get("/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 401

        app.dependency_overrides.clear()

    def test_missing_sub_claim(self, db):
        self._make_user(db)
        token = _make_token(include_sub=False)
        client = self._make_client(db)

        r = client.get("/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 401
        assert "subject" in r.json()["message"].lower()

        app.dependency_overrides.clear()

    def test_malformed_bearer(self, db):
        self._make_user(db)
        client = self._make_client(db)

        r = client.get("/me", headers={"Authorization": "NotBearer xyz"})
        assert r.status_code == 401

        app.dependency_overrides.clear()

    def test_create_user_no_auth_required(self, db):
        """POST /users does not require JWT — it's called by NextAuth during signup."""
        client = self._make_client(db)

        r = client.post(
            "/users",
            json={"email": "newuser@tend.app", "password": "password123"},
        )
        assert r.status_code == 201
        assert r.json()["email"] == "newuser@tend.app"

        app.dependency_overrides.clear()
