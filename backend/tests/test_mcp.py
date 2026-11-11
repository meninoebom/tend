import uuid
from contextlib import contextmanager

import pytest
from sqlmodel import Session

from app import mcp_server
from app.models.enums import AuthProvider, BucketType, TaskStatus
from app.models.task import Task
from app.models.user import User
from app.services import api_token_service, mit_service

HEADERS = {"Accept": "application/json, text/event-stream"}

EXPECTED_TOOLS = {
    "tend_get_state",
    "tend_list_tasks",
    "tend_get_triage_queue",
    "tend_list_domains",
    "tend_add_task",
    "tend_triage_task",
    "tend_update_task",
    "tend_complete_task",
    "tend_set_mit",
}


@pytest.fixture()
def use_test_db(db: Session, monkeypatch):
    @contextmanager
    def _test_session():
        yield db

    monkeypatch.setattr(mcp_server, "open_session", _test_session)


def _url_for(db: Session, user: User) -> str:
    _, raw = api_token_service.create_token(db, user.id, "Claude")
    return f"/mcp/{raw}"


@pytest.fixture()
def mcp_url(client, db, test_user, use_test_db) -> str:
    return _url_for(db, test_user)


def _rpc(client, url, method, params=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    response = client.post(url, json=body, headers=HEADERS)
    assert response.status_code == 200, response.text
    return response.json()["result"]


def _call(client, url, name, **arguments):
    return _rpc(client, url, "tools/call", {"name": name, "arguments": arguments})


def _ok(client, url, name, **arguments):
    result = _call(client, url, name, **arguments)
    assert result["isError"] is False, result["content"]
    return result["structuredContent"]


def _error_text(client, url, name, **arguments) -> str:
    result = _call(client, url, name, **arguments)
    assert result["isError"] is True
    return result["content"][0]["text"]


class TestAuth:
    def test_unknown_token_rejected(self, client, test_user, use_test_db):
        response = client.post("/mcp/tend_pat_nope", json={}, headers=HEADERS)
        assert response.status_code == 401

    def test_missing_token_rejected(self, client, test_user, use_test_db):
        response = client.post("/mcp/", json={}, headers=HEADERS)
        assert response.status_code == 401

    def test_revoked_token_rejected(self, client, db, test_user, use_test_db):
        token, raw = api_token_service.create_token(db, test_user.id, "Claude")
        api_token_service.revoke_token(db, test_user.id, token.id)
        response = client.post(f"/mcp/{raw}", json={}, headers=HEADERS)
        assert response.status_code == 401

    def test_each_token_sees_only_its_own_user(self, client, db, test_user, test_tasks, mcp_url):
        stranger = User(id=uuid.uuid4(), email="other@tend.app", auth_provider=AuthProvider.email)
        db.add(stranger)
        db.flush()
        stranger_url = _url_for(db, stranger)

        assert _ok(client, stranger_url, "tend_list_tasks", bucket=None)["result"] == []
        assert len(_ok(client, mcp_url, "tend_list_tasks", bucket=None)["result"]) == 5


class TestToolSurface:
    def test_lists_exactly_the_v1_tools(self, client, mcp_url):
        tools = _rpc(client, mcp_url, "tools/list")["tools"]
        assert {tool["name"] for tool in tools} == EXPECTED_TOOLS

    def test_no_tool_is_destructive(self, client, mcp_url):
        for tool in _rpc(client, mcp_url, "tools/list")["tools"]:
            assert tool["annotations"]["destructiveHint"] is False, tool["name"]

    def test_triage_cannot_kill(self, client, mcp_url, test_tasks):
        result = _call(
            client, mcp_url, "tend_triage_task", task_id=str(test_tasks[0].id), action="kill"
        )
        assert result["isError"] is True


class TestReads:
    def test_state_counts_buckets(self, client, mcp_url, test_tasks):
        state = _ok(client, mcp_url, "tend_get_state")
        assert state["buckets"] == {"today": 2, "soon": 1, "later": 1, "someday": 1, "done": 0}

    def test_list_tasks_defaults_to_pending_today(self, client, mcp_url, test_tasks):
        tasks = _ok(client, mcp_url, "tend_list_tasks")["result"]
        assert {t["text"] for t in tasks} == {"Build frontend", "Go for a run"}

    def test_list_domains(self, client, mcp_url, test_domains):
        domains = _ok(client, mcp_url, "tend_list_domains")["result"]
        assert {d["name"] for d in domains} == {"Work", "Personal", "Health"}

    def test_triage_queue(self, client, mcp_url, test_tasks):
        queue = _ok(client, mcp_url, "tend_get_triage_queue")
        assert queue["total_count"] == 5


class TestWrites:
    def test_add_task_with_domain_name_and_priority(self, client, db, mcp_url, test_domains):
        task = _ok(
            client,
            mcp_url,
            "tend_add_task",
            text="Book dentist",
            bucket="soon",
            domain="health",
            important=True,
            size="s",
        )
        stored = db.get(Task, uuid.UUID(task["id"]))
        assert stored.bucket == BucketType.soon
        assert stored.domain_id == test_domains[2].id
        assert stored.important is True
        assert stored.size == "s"

    def test_add_task_unknown_domain_names_the_real_ones(self, client, mcp_url, test_domains):
        message = _error_text(client, mcp_url, "tend_add_task", text="x", domain="Hobbies")
        assert "Hobbies" in message
        assert "Work" in message

    def test_triage_defer_moves_bucket(self, client, db, mcp_url, test_tasks):
        task = test_tasks[0]
        _ok(
            client,
            mcp_url,
            "tend_triage_task",
            task_id=str(task.id),
            action="defer",
            bucket="later",
        )
        db.refresh(task)
        assert task.bucket == BucketType.later

    def test_update_changes_only_passed_fields(self, client, db, mcp_url, test_tasks):
        task = test_tasks[0]
        _ok(client, mcp_url, "tend_update_task", task_id=str(task.id), urgent=True)
        db.refresh(task)
        assert task.urgent is True
        assert task.text == "Build frontend"
        assert task.bucket == BucketType.today

    def test_let_go_archives(self, client, db, mcp_url, test_tasks):
        task = test_tasks[0]
        _ok(client, mcp_url, "tend_update_task", task_id=str(task.id), let_go=True)
        db.refresh(task)
        assert task.status == TaskStatus.archived

    def test_complete_task(self, client, db, mcp_url, test_tasks):
        task = test_tasks[0]
        _ok(client, mcp_url, "tend_complete_task", task_id=str(task.id))
        db.refresh(task)
        assert task.status == TaskStatus.complete

    def test_set_mit(self, client, db, mcp_url, test_user, test_tasks):
        task = test_tasks[0]
        assert _ok(client, mcp_url, "tend_set_mit", task_id=str(task.id))["is_mit"] is True
        assert mit_service.get_today_mit(db, test_user.id) == task.id

    def test_set_mit_rejects_non_today_task_with_reason(self, client, mcp_url, test_tasks):
        message = _error_text(client, mcp_url, "tend_set_mit", task_id=str(test_tasks[1].id))
        assert "today" in message

    def test_unknown_task_is_a_readable_error(self, client, mcp_url, test_user):
        message = _error_text(client, mcp_url, "tend_complete_task", task_id=str(uuid.uuid4()))
        assert "not found" in message.lower()


def test_redact_tokens():
    assert (
        mcp_server.redact_tokens("POST /mcp/tend_pat_abc-123_X HTTP/1.1")
        == "POST /mcp/tend_pat_[redacted] HTTP/1.1"
    )
