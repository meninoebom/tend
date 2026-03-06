import uuid
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

from app.models.domain import Domain
from app.models.enums import BucketType, TaskStatus
from app.models.task import Task
from app.schemas.triage_schemas import BriefingResponse
from app.services.briefing_service import assemble_context, generate_briefing


class TestBriefingResponse:
    def test_schema_has_required_fields(self):
        resp = BriefingResponse(
            summary="5 tasks today",
            domain_balance="Balanced across 3 domains",
            calibration="You usually finish 4.",
        )
        assert resp.summary == "5 tasks today"
        assert resp.domain_balance == "Balanced across 3 domains"
        assert resp.calibration == "You usually finish 4."

    def test_schema_defaults_to_empty_strings(self):
        resp = BriefingResponse()
        assert resp.summary == ""
        assert resp.domain_balance == ""
        assert resp.calibration == ""


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
):
    t = Task(
        id=uuid.uuid4(),
        user_id=USER_ID,
        text=text,
        bucket=bucket,
        status=TaskStatus.pending,
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


class TestAssembleContext:
    def test_includes_task_details(self):
        tasks = [_make_task(
            "Buy groceries", BucketType.soon, "Personal",
            reschedule_count=2, age_days=5,
        )]
        ctx = assemble_context(tasks, nudge_stats={
            "average_completed": 4.0,
            "today_count": 6,
            "completed_count": 2,
        })
        assert "Buy groceries" in ctx
        assert "soon" in ctx.lower()
        assert "Personal" in ctx
        assert "deferred 2" in ctx

    def test_includes_nudge_stats(self):
        ctx = assemble_context([], nudge_stats={
            "average_completed": 3.5,
            "today_count": 7,
            "completed_count": 1,
        })
        assert "3.5" in ctx
        assert "7" in ctx

    def test_includes_domain_distribution(self):
        tasks = [
            _make_task("Task 1", domain_name="Work"),
            _make_task("Task 2", domain_name="Work"),
            _make_task("Task 3", domain_name="Health"),
        ]
        ctx = assemble_context(tasks, nudge_stats=EMPTY_STATS)
        assert "Work" in ctx
        assert "Health" in ctx


class TestGenerateBriefing:
    @patch("app.services.briefing_service.get_anthropic_client")
    def test_returns_structured_briefing(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_response = (
            '{"summary":"5 tasks in queue",'
            '"domain_balance":"Heavy on Work",'
            '"calibration":"You average 4 per day"}'
        )
        mock_client.messages.create.return_value = MagicMock(
            content=[MagicMock(text=mock_response)]
        )

        tasks = [_make_task("Do something")]
        result = generate_briefing(tasks, nudge_stats={
            "average_completed": 4.0,
            "today_count": 5,
            "completed_count": 0,
        })

        assert isinstance(result, BriefingResponse)
        assert result.summary == "5 tasks in queue"
        assert result.domain_balance == "Heavy on Work"
        assert result.calibration == "You average 4 per day"

    @patch("app.services.briefing_service.get_anthropic_client")
    def test_graceful_fallback_on_api_error(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.messages.create.side_effect = Exception("API down")

        result = generate_briefing([], nudge_stats=EMPTY_STATS)

        assert isinstance(result, BriefingResponse)
        assert result.summary == ""
        assert result.domain_balance == ""
        assert result.calibration == ""

    @patch("app.services.briefing_service.get_anthropic_client")
    def test_fallback_on_malformed_json(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.messages.create.return_value = MagicMock(
            content=[MagicMock(text="not valid json at all")]
        )

        result = generate_briefing([], nudge_stats=EMPTY_STATS)

        assert isinstance(result, BriefingResponse)
        assert result.summary == ""

    @patch("app.services.briefing_service.get_anthropic_client")
    def test_fallback_when_no_api_key(self, mock_get_client):
        mock_get_client.return_value = None

        result = generate_briefing(
            [_make_task("Something")],
            nudge_stats=EMPTY_STATS,
        )

        assert isinstance(result, BriefingResponse)
        assert result.summary == ""
