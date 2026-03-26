"""Tests for password reset flow (JWT-based, no migration)."""


class TestForgotPassword:
    def test_returns_200_for_existing_user(self, client, db):
        client.post("/users", json={"email": "reset@tend.app", "password": "password123"})
        r = client.post("/users/forgot-password", json={"email": "reset@tend.app"})
        assert r.status_code == 200

    def test_returns_200_for_unknown_email(self, client, db):
        """Must return 200 even for non-existent emails to prevent enumeration."""
        r = client.post("/users/forgot-password", json={"email": "ghost@tend.app"})
        assert r.status_code == 200

    def test_same_response_for_known_and_unknown(self, client, db):
        """Response body must be identical regardless of email existence."""
        client.post("/users", json={"email": "known@tend.app", "password": "password123"})

        r_known = client.post("/users/forgot-password", json={"email": "known@tend.app"})
        r_unknown = client.post("/users/forgot-password", json={"email": "unknown@tend.app"})

        assert r_known.json() == r_unknown.json()


class TestResetPassword:
    def _get_reset_token(self, client, db, email="resetflow@tend.app"):
        """Create a user and generate a reset token via the internal function."""
        client.post("/users", json={"email": email, "password": "oldpassword1"})

        from sqlmodel import select

        from app.api.account import _create_reset_token
        from app.models.user import User

        user = db.exec(select(User).where(User.email == email)).first()
        return _create_reset_token(user.id)

    def test_reset_password_success(self, client, db):
        token = self._get_reset_token(client, db)

        r = client.post(
            "/users/reset-password",
            json={"token": token, "new_password": "newpassword1"},
        )
        assert r.status_code == 200

        # Verify new password works
        r = client.post(
            "/users/verify",
            json={"email": "resetflow@tend.app", "password": "newpassword1"},
        )
        assert r.status_code == 200

    def test_reset_password_old_password_fails(self, client, db):
        token = self._get_reset_token(client, db)

        client.post(
            "/users/reset-password",
            json={"token": token, "new_password": "newpassword1"},
        )

        # Old password should no longer work
        r = client.post(
            "/users/verify",
            json={"email": "resetflow@tend.app", "password": "oldpassword1"},
        )
        assert r.status_code == 401

    def test_invalid_token_rejected(self, client, db):
        r = client.post(
            "/users/reset-password",
            json={"token": "garbage-token", "new_password": "newpassword1"},
        )
        assert r.status_code == 400
        assert r.json()["code"] == "invalid_token"

    def test_expired_token_rejected(self, client, db):
        """Tokens with past expiry should be rejected."""
        from datetime import datetime, timedelta

        from jose import jwt

        from app.core.config import settings
        from app.core.security import ALGORITHM

        client.post("/users", json={"email": "expired@tend.app", "password": "password123"})

        from sqlmodel import select

        from app.models.user import User

        user = db.exec(select(User).where(User.email == "expired@tend.app")).first()

        expired_token = jwt.encode(
            {
                "sub": str(user.id),
                "purpose": "password_reset",
                "exp": datetime.utcnow() - timedelta(hours=1),
                "iat": datetime.utcnow() - timedelta(hours=2),
            },
            settings.internal_jwt_secret,
            algorithm=ALGORITHM,
        )

        r = client.post(
            "/users/reset-password",
            json={"token": expired_token, "new_password": "newpassword1"},
        )
        assert r.status_code == 400

    def test_proxy_jwt_rejected_as_reset_token(self, client, db):
        """A regular proxy JWT (no 'purpose' claim) should not work for reset."""
        from datetime import datetime, timedelta

        from jose import jwt

        from app.core.config import settings
        from app.core.security import ALGORITHM

        client.post("/users", json={"email": "proxy@tend.app", "password": "password123"})

        from sqlmodel import select

        from app.models.user import User

        user = db.exec(select(User).where(User.email == "proxy@tend.app")).first()

        # This is a normal proxy JWT — no "purpose" claim
        proxy_token = jwt.encode(
            {
                "sub": str(user.id),
                "exp": datetime.utcnow() + timedelta(seconds=60),
                "iat": datetime.utcnow(),
            },
            settings.internal_jwt_secret,
            algorithm=ALGORITHM,
        )

        r = client.post(
            "/users/reset-password",
            json={"token": proxy_token, "new_password": "newpassword1"},
        )
        assert r.status_code == 400
        assert r.json()["code"] == "invalid_token"

    def test_new_password_too_short_rejected(self, client, db):
        token = self._get_reset_token(client, db, email="short@tend.app")

        r = client.post(
            "/users/reset-password",
            json={"token": token, "new_password": "1234567"},
        )
        assert r.status_code == 422  # Pydantic validation error
