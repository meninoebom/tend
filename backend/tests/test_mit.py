import uuid
from datetime import datetime, timedelta

from app.models.enums import BucketType, TaskStatus
from app.models.task import Task
from app.services.mit_service import get_today_mit, set_mit, suggest_mit


def _make_task(
    text: str = "Test task",
    reschedule_count: int = 0,
    created_at: datetime | None = None,
) -> Task:
    """Create an in-memory Task for pure function tests (no DB needed)."""
    return Task(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        text=text,
        bucket=BucketType.today,
        status=TaskStatus.pending,
        reschedule_count=reschedule_count,
        created_at=created_at or datetime.utcnow(),
    )


class TestSuggestMit:
    def test_returns_none_for_fewer_than_3_tasks(self):
        assert suggest_mit([]) is None
        assert suggest_mit([_make_task()]) is None
        assert suggest_mit([_make_task(), _make_task()]) is None

    def test_picks_highest_reschedule_count(self):
        tasks = [
            _make_task("low", reschedule_count=0),
            _make_task("mid", reschedule_count=2),
            _make_task("high", reschedule_count=5),
        ]
        result = suggest_mit(tasks)
        assert result is not None
        assert result["task_text"] == "high"

    def test_uses_age_as_tiebreaker(self):
        now = datetime.utcnow()
        tasks = [
            _make_task("new", created_at=now),
            _make_task("old", created_at=now - timedelta(days=10)),
            _make_task("mid", created_at=now - timedelta(days=5)),
        ]
        result = suggest_mit(tasks)
        assert result is not None
        assert result["task_text"] == "old"

    def test_reason_putting_this_off(self):
        tasks = [
            _make_task("frog", reschedule_count=5),
            _make_task("a"),
            _make_task("b"),
        ]
        result = suggest_mit(tasks)
        assert result["reason"] == "You've been putting this off"

    def test_reason_waiting(self):
        old = datetime.utcnow() - timedelta(days=10)
        tasks = [
            _make_task("old one", reschedule_count=1, created_at=old),
            _make_task("a"),
            _make_task("b"),
        ]
        result = suggest_mit(tasks)
        assert result["reason"] == "This has been waiting a while"


class TestSetAndGetMit:
    def test_set_mit_creates_daily_stat(self, db, test_user, test_tasks):
        task = test_tasks[0]
        set_mit(db, test_user.id, task.id)
        assert get_today_mit(db, test_user.id) == task.id

    def test_set_mit_replaces_previous(self, db, test_user, test_tasks):
        set_mit(db, test_user.id, test_tasks[0].id)
        set_mit(db, test_user.id, test_tasks[1].id)
        assert get_today_mit(db, test_user.id) == test_tasks[1].id

    def test_get_today_mit_returns_none_when_not_set(self, db, test_user):
        assert get_today_mit(db, test_user.id) is None

    def test_get_today_mit_returns_task_id(self, db, test_user, test_tasks):
        task = test_tasks[2]
        set_mit(db, test_user.id, task.id)
        assert get_today_mit(db, test_user.id) == task.id
