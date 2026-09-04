"""Tests for personal access tokens (#212)."""

import uuid

import pytest
from sqlmodel import Session

from app.core.deps import get_db
from app.core.security import get_current_user_id, get_user_id_allow_pat
from app.main import app
from app.models.user import User
from app.services import api_token_service

# An id that will never exist, so routes 404 rather than mutating real rows.
_MISSING = "00000000-0000-0000-0000-0000000000ff"

# The PAT policy, as data: a token can create, read, and modify; it cannot
# destroy. A PAT sits in plaintext in config files and agent settings, so it is
# a more exposed credential than a browser session — irreversible operations and
# anything account-level stay behind the short-lived proxy JWT. Per PRD §17.2 the
# question of *whether* to act belongs in the agent's prompt, not the API, so
# everything reversible is deliberately open.
#
# `pat_allowed` asserts only that the auth gate let the request through. A route
# may still answer 404 or 422 for a placeholder id; that is not what this pins.
PAT_MATRIX = [
    # Read.
    ("GET", "/state", None, True),
    ("GET", "/tasks", None, True),
    ("GET", f"/tasks/{_MISSING}", None, True),
    ("GET", "/triage", None, True),
    ("GET", "/triage/winddown", None, True),
    ("GET", "/triage/briefing", None, True),
    ("GET", "/triage/mit-suggestion", None, True),
    ("GET", "/domains", None, True),
    # Create.
    ("POST", "/tasks", {"text": "from an agent", "bucket": "today"}, True),
    ("POST", "/domains", {"name": "Agent", "color": "#3b82f6"}, True),
    # Modify.
    ("PATCH", f"/tasks/{_MISSING}", {"text": "renamed"}, True),
    ("PATCH", "/tasks/reorder", {"task_ids": [], "bucket": "today"}, True),
    ("POST", f"/tasks/{_MISSING}/priority", {"important": True}, True),
    ("POST", f"/tasks/{_MISSING}/complete", None, True),
    ("POST", f"/tasks/{_MISSING}/mit", None, True),
    ("POST", f"/triage/{_MISSING}", {"action": "confirm"}, True),
    ("PATCH", f"/domains/{_MISSING}", {"name": "Renamed"}, True),
    # Destroy — session only. Domain delete also orphans tasks.
    ("DELETE", f"/tasks/{_MISSING}", None, False),
    ("DELETE", f"/domains/{_MISSING}", None, False),
    # Account level — session only.
    ("GET", "/me", None, False),
    ("PATCH", "/me", {"default_layout": "list"}, False),
    ("DELETE", "/me", None, False),
    ("GET", "/billing/status", None, False),
    # Token management — a PAT must never mint or revoke PATs.
    ("GET", "/api-tokens", None, False),
    ("POST", "/api-tokens", {"name": "escalated"}, False),
    ("DELETE", f"/api-tokens/{_MISSING}", None, False),
]


class TestApiTokenService:
    def test_create_returns_raw_token_once(self, db: Session, test_user: User):
        token, raw = api_token_service.create_token(db, test_user.id, "Plot")
        assert raw.startswith("tend_pat_")
        assert token.name == "Plot"
        # Only the hash is stored, never the raw value.
        assert token.token_hash != raw
        assert token.token_hash == api_token_service._hash_token(raw)

    def test_authenticate_valid(self, db: Session, test_user: User):
        _, raw = api_token_service.create_token(db, test_user.id, "Plot")
        assert api_token_service.authenticate(db, raw) == test_user.id

    def test_authenticate_stamps_last_used(self, db: Session, test_user: User):
        token, raw = api_token_service.create_token(db, test_user.id, "Plot")
        assert token.last_used_at is None
        api_token_service.authenticate(db, raw)
        assert token.last_used_at is not None

    def test_authenticate_invalid_returns_none(self, db: Session, test_user: User):
        assert api_token_service.authenticate(db, "tend_pat_nope") is None
        assert api_token_service.authenticate(db, "not_a_pat") is None

    def test_authenticate_revoked_returns_none(self, db: Session, test_user: User):
        token, raw = api_token_service.create_token(db, test_user.id, "Plot")
        api_token_service.revoke_token(db, test_user.id, token.id)
        assert api_token_service.authenticate(db, raw) is None

    def test_revoke_other_users_token_rejected(self, db: Session, test_user: User):
        token, _ = api_token_service.create_token(db, test_user.id, "Plot")
        with pytest.raises(Exception):
            api_token_service.revoke_token(db, uuid.uuid4(), token.id)

    def test_token_limit(self, db: Session, test_user: User):
        for i in range(api_token_service.MAX_TOKENS_PER_USER):
            api_token_service.create_token(db, test_user.id, f"t{i}")
        with pytest.raises(Exception):
            api_token_service.create_token(db, test_user.id, "one too many")


class TestApiTokenEndpoints:
    def test_create_list_revoke(self, client, test_user):
        r = client.post("/api-tokens", json={"name": "Raycast"})
        assert r.status_code == 201
        body = r.json()
        assert body["token"].startswith("tend_pat_")
        token_id = body["id"]

        r = client.get("/api-tokens")
        assert r.status_code == 200
        listed = r.json()
        assert len(listed) == 1
        # The list endpoint never leaks the raw token.
        assert "token" not in listed[0]

        r = client.delete(f"/api-tokens/{token_id}")
        assert r.status_code == 204
        assert client.get("/api-tokens").json() == []

    def test_empty_name_rejected(self, client, test_user):
        assert client.post("/api-tokens", json={"name": "  "}).status_code == 422


class TestPatScoping:
    """A PAT works ONLY on endpoints using get_user_id_allow_pat; the proxy-JWT
    override is removed here so real auth runs."""

    @pytest.fixture()
    def real_auth_client(self, db):
        from fastapi.testclient import TestClient

        def _override_db():
            yield db

        app.dependency_overrides[get_db] = _override_db
        # Deliberately do NOT override the auth dependencies.
        app.dependency_overrides.pop(get_current_user_id, None)
        app.dependency_overrides.pop(get_user_id_allow_pat, None)
        with TestClient(app) as c:
            yield c
        app.dependency_overrides.clear()

    def test_pat_works_on_scoped_endpoint(self, real_auth_client, db, test_user):
        _, raw = api_token_service.create_token(db, test_user.id, "Plot")
        r = real_auth_client.post(
            "/tasks",
            json={"text": "from a shortcut", "bucket": "today"},
            headers={"Authorization": f"Bearer {raw}"},
        )
        assert r.status_code == 201

    def test_pat_rejected_on_unscoped_endpoint(self, real_auth_client, db, test_user):
        _, raw = api_token_service.create_token(db, test_user.id, "Plot")
        # DELETE /tasks/{id} uses get_current_user_id (proxy-JWT only), so a PAT
        # must be rejected there even though it's a valid token.
        r = real_auth_client.delete(
            f"/tasks/{uuid.uuid4()}",
            headers={"Authorization": f"Bearer {raw}"},
        )
        assert r.status_code == 401

    def test_revoked_pat_rejected(self, real_auth_client, db, test_user):
        token, raw = api_token_service.create_token(db, test_user.id, "Plot")
        api_token_service.revoke_token(db, test_user.id, token.id)
        r = real_auth_client.get("/tasks", headers={"Authorization": f"Bearer {raw}"})
        assert r.status_code == 401

    @pytest.mark.parametrize(("method", "path", "body", "pat_allowed"), PAT_MATRIX)
    def test_pat_matrix(self, real_auth_client, db, test_user, method, path, body, pat_allowed):
        _, raw = api_token_service.create_token(db, test_user.id, "matrix")
        r = real_auth_client.request(
            method, path, json=body, headers={"Authorization": f"Bearer {raw}"}
        )
        if pat_allowed:
            assert r.status_code != 401, f"{method} {path} should accept a PAT"
        else:
            assert r.status_code == 401, f"{method} {path} must reject a PAT"
