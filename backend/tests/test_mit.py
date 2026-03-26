import uuid
from datetime import datetime, timedelta

from app.models.enums import AuthProvider, BucketType, TaskStatus
from app.models.task import Task
from app.models.user import User
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


class TestMitEndpoint:
    def test_set_mit_endpoint_success(self, client, test_user, test_tasks):
        # test_tasks[0] is "Build frontend" in today bucket
        task = test_tasks[0]
        resp = client.post(f"/tasks/{task.id}/mit")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == str(task.id)
        assert data["is_mit"] is True

    def test_set_mit_endpoint_wrong_user(self, client, db, test_user, test_tasks):
        # Create a task owned by a different user
        other_user = User(
            id=uuid.uuid4(),
            email="other@tend.app",
            auth_provider=AuthProvider.email,
        )
        db.add(other_user)
        db.flush()
        other_task = Task(
            user_id=other_user.id,
            text="Other task",
            bucket=BucketType.today,
            status=TaskStatus.pending,
        )
        db.add(other_task)
        db.flush()
        resp = client.post(f"/tasks/{other_task.id}/mit")
        assert resp.status_code == 404

    def test_set_mit_endpoint_not_pending(self, client, db, test_user, test_tasks):
        task = test_tasks[0]
        task.status = TaskStatus.complete
        db.add(task)
        db.flush()
        resp = client.post(f"/tasks/{task.id}/mit")
        assert resp.status_code == 422

    def test_set_mit_endpoint_wrong_bucket(self, client, test_user, test_tasks):
        # test_tasks[3] is "Refactor backend" in later bucket
        task = test_tasks[3]
        resp = client.post(f"/tasks/{task.id}/mit")
        assert resp.status_code == 422

    def test_mit_suggestion_endpoint_returns_suggestion(self, client, db, test_user, test_tasks):
        # test_tasks has 2 today tasks; add a third to reach the 3-task threshold
        extra = Task(
            user_id=test_user.id,
            text="Extra today task",
            bucket=BucketType.today,
            status=TaskStatus.pending,
        )
        db.add(extra)
        db.flush()
        resp = client.get("/triage/mit-suggestion")
        assert resp.status_code == 200
        data = resp.json()
        assert "task_id" in data
        assert "task_text" in data
        assert "reason" in data

    def test_mit_suggestion_endpoint_returns_null_few_tasks(
        self, client, db, test_user, test_tasks
    ):
        # test_tasks has only 2 today tasks — below threshold
        resp = client.get("/triage/mit-suggestion")
        assert resp.status_code == 204

    def test_tasks_list_includes_is_mit(self, client, db, test_user, test_tasks):
        task = test_tasks[0]
        # Set MIT first
        client.post(f"/tasks/{task.id}/mit")
        # List today tasks
        resp = client.get("/tasks?bucket=today")
        assert resp.status_code == 200
        data = resp.json()
        mit_flags = {t["id"]: t["is_mit"] for t in data}
        assert mit_flags[str(task.id)] is True
        # Other today tasks should not be MIT
        for t in data:
            if t["id"] != str(task.id):
                assert t["is_mit"] is False


class TestWinddownMit:
    def test_winddown_includes_mit_completed_none(self, client, test_user, test_tasks):
        """No MIT set → mit_completed is null."""
        resp = client.get("/triage/winddown")
        assert resp.status_code == 200
        data = resp.json()
        assert data["mit_completed"] is None

    def test_winddown_includes_mit_completed_true(self, client, db, test_user, test_tasks):
        """MIT set and task completed → true."""
        task = test_tasks[0]
        client.post(f"/tasks/{task.id}/mit")
        client.post(f"/tasks/{task.id}/complete")
        resp = client.get("/triage/winddown")
        assert resp.status_code == 200
        data = resp.json()
        assert data["mit_completed"] is True

    def test_winddown_includes_mit_completed_false(self, client, db, test_user, test_tasks):
        """MIT set, task pending → false."""
        task = test_tasks[0]
        client.post(f"/tasks/{task.id}/mit")
        resp = client.get("/triage/winddown")
        assert resp.status_code == 200
        data = resp.json()
        assert data["mit_completed"] is False
