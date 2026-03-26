import uuid
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

from app.models.domain import Domain
from app.models.enums import BucketType, TaskStatus
from app.models.task import Task
from app.services.chat_service import assemble_chat_context, generate_response

USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
DOMAIN_ID = uuid.UUID("00000000-0000-0000-0000-000000000010")

EMPTY_STATS = {
    "average_completed": 0,
    "today_count": 0,
    "completed_count": 0,
}


def _make_task(
    text="Test task",
    bucket=BucketType.today,
    domain_name=None,
    reschedule_count=0,
    age_days=1,
    status=TaskStatus.pending,
):
    t = Task(
        id=uuid.uuid4(),
        user_id=USER_ID,
        text=text,
        bucket=bucket,
        status=status,
        reschedule_count=reschedule_count,
        created_at=datetime.utcnow() - timedelta(days=age_days),
    )
    if domain_name:
        d = Domain(
            id=DOMAIN_ID,
            user_id=USER_ID,
            name=domain_name,
            color="#000",
            position=0,
        )
        t.domain = d
    return t


class TestAssembleChatContext:
    def test_includes_task_text_and_bucket(self):
        tasks = [_make_task("Buy groceries", BucketType.soon)]
        ctx = assemble_chat_context(tasks, [], EMPTY_STATS, None)
        assert "Buy groceries" in ctx
        assert "soon" in ctx.lower()

    def test_includes_domain_info(self):
        tasks = [_make_task("Write report", domain_name="Work")]
        ctx = assemble_chat_context(tasks, [], EMPTY_STATS, None)
        assert "Work" in ctx

    def test_includes_deferred_count(self):
        tasks = [_make_task("Go for a run", reschedule_count=5)]
        ctx = assemble_chat_context(tasks, [], EMPTY_STATS, None)
        assert "deferred 5" in ctx

    def test_includes_nudge_stats(self):
        ctx = assemble_chat_context(
            [],
            [],
            {"average_completed": 4.2, "today_count": 7, "completed_count": 3},
            None,
        )
        assert "4.2" in ctx
        assert "7" in ctx
        assert "3" in ctx

    def test_includes_domain_list(self):
        domains = [
            Domain(id=uuid.uuid4(), user_id=USER_ID, name="Work", color="#3b82f6", position=0),
            Domain(id=uuid.uuid4(), user_id=USER_ID, name="Health", color="#ef4444", position=1),
        ]
        ctx = assemble_chat_context([], domains, EMPTY_STATS, None)
        assert "Work" in ctx
        assert "Health" in ctx

    def test_includes_mit_when_set(self):
        mit_task = _make_task("Ship the feature")
        ctx = assemble_chat_context([], [], EMPTY_STATS, mit_task)
        assert "Ship the feature" in ctx
        assert "most important" in ctx.lower()

    def test_handles_empty_state(self):
        ctx = assemble_chat_context([], [], EMPTY_STATS, None)
        assert isinstance(ctx, str)
        assert "0" in ctx  # should mention zero tasks


class TestGenerateResponse:
    @patch("app.services.chat_service.get_anthropic_client")
    def test_returns_response_text(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.messages.create.return_value = MagicMock(
            content=[MagicMock(text="You should focus on shipping the feature.")]
        )

        tasks = [_make_task("Ship feature")]
        result = generate_response(
            tasks=tasks,
            domains=[],
            nudge_stats=EMPTY_STATS,
            mit_task=None,
            message="What should I focus on?",
            history=[],
        )

        assert result == "You should focus on shipping the feature."
        mock_client.messages.create.assert_called_once()

    @patch("app.services.chat_service.get_anthropic_client")
    def test_passes_history_to_api(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.messages.create.return_value = MagicMock(content=[MagicMock(text="Sure.")])

        history = [
            {"role": "user", "content": "Hi"},
            {"role": "assistant", "content": "Hello!"},
        ]
        generate_response(
            tasks=[],
            domains=[],
            nudge_stats=EMPTY_STATS,
            mit_task=None,
            message="Thanks",
            history=history,
        )

        call_args = mock_client.messages.create.call_args
        messages = call_args.kwargs["messages"]
        # 2 context preamble + 2 history + 1 current = 5
        assert len(messages) == 5
        # History starts after context preamble (index 2, 3)
        assert messages[2]["role"] == "user"
        assert messages[2]["content"] == "Hi"
        assert messages[3]["content"] == "Hello!"
        assert messages[4]["content"] == "Thanks"

    @patch("app.services.chat_service.get_anthropic_client")
    def test_returns_none_when_no_api_key(self, mock_get_client):
        mock_get_client.return_value = None

        result = generate_response(
            tasks=[],
            domains=[],
            nudge_stats=EMPTY_STATS,
            mit_task=None,
            message="Hello",
            history=[],
        )

        assert result is None

    @patch("app.services.chat_service.get_anthropic_client")
    def test_returns_none_on_api_error(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.messages.create.side_effect = Exception("API down")

        result = generate_response(
            tasks=[],
            domains=[],
            nudge_stats=EMPTY_STATS,
            mit_task=None,
            message="Hello",
            history=[],
        )

        assert result is None


class TestChatEndpoint:
    @patch("app.services.chat_service.get_anthropic_client")
    def test_chat_returns_reply(self, mock_get_client, client, db, test_user, test_tasks):
        test_user.subscription_status = "active"
        db.flush()

        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.messages.create.return_value = MagicMock(
            content=[MagicMock(text="Focus on Build frontend.")]
        )

        resp = client.post("/chat", json={"message": "What should I do?"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["reply"] == "Focus on Build frontend."
        assert "pending" in data["context_summary"]

    def test_chat_blocked_for_free_user(self, client, db, test_user):
        test_user.subscription_status = "free"
        db.flush()

        resp = client.post("/chat", json={"message": "Hello"})
        assert resp.status_code == 403
        assert resp.json()["code"] == "pro_required"

    def test_chat_empty_message_rejected(self, client, db, test_user):
        test_user.subscription_status = "active"
        db.flush()

        resp = client.post("/chat", json={"message": "   "})
        assert resp.status_code == 422

    @patch("app.services.chat_service.get_anthropic_client")
    def test_chat_503_when_ai_unavailable(self, mock_get_client, client, db, test_user):
        test_user.subscription_status = "active"
        db.flush()
        mock_get_client.return_value = None

        resp = client.post("/chat", json={"message": "Hello"})
        assert resp.status_code == 503
        assert resp.json()["code"] == "ai_unavailable"

    @patch("app.services.chat_service.get_anthropic_client")
    def test_chat_with_history(self, mock_get_client, client, db, test_user):
        test_user.subscription_status = "active"
        db.flush()

        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.messages.create.return_value = MagicMock(
            content=[MagicMock(text="You're welcome.")]
        )

        resp = client.post(
            "/chat",
            json={
                "message": "Thanks",
                "history": [
                    {"role": "user", "content": "Hi"},
                    {"role": "assistant", "content": "Hello!"},
                ],
            },
        )
        assert resp.status_code == 200
        assert resp.json()["reply"] == "You're welcome."
