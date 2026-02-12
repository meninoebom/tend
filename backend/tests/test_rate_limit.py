"""Test rate limiting behavior — runs with limiter explicitly enabled."""

from collections.abc import Generator
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.deps import get_db
from app.main import app


class TestRateLimit:
    def test_signup_rate_limit_enforced(self, db: Session):
        """POST /users should be rate limited to 5/minute."""
        # Temporarily enable the limiter for this test
        with patch("app.core.rate_limit._enabled", True):
            # Re-create limiter in enabled state
            from app.core.rate_limit import limiter

            limiter.enabled = True

            def _override_db() -> Generator[Session]:
                yield db

            app.dependency_overrides[get_db] = _override_db

            try:
                with TestClient(app) as client:
                    # Reset limiter storage so previous tests don't interfere
                    limiter.reset()

                    responses = []
                    for i in range(7):
                        r = client.post(
                            "/users",
                            json={"email": f"ratelimit{i}@test.com", "password": "password123"},
                        )
                        responses.append(r.status_code)

                    # First 5 should succeed (201), 6th+ should be 429
                    assert 429 in responses, f"Expected 429 in responses: {responses}"
                    assert responses.count(429) >= 2
            finally:
                limiter.enabled = False
                app.dependency_overrides.clear()
