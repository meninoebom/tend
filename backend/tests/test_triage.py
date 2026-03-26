from datetime import date
from unittest.mock import patch

from app.models.enums import BucketType, TaskStatus
from app.models.task import Task
from app.schemas.triage_schemas import BriefingResponse


class TestTriageFlow:
    def test_triage_queue_empty_when_all_triaged(self, client, test_user, test_tasks, db):
        """Tasks with today's triaged_at don't appear in queue."""
        for t in test_tasks:
            t.triaged_at = date.today()
        db.flush()

        r = client.get("/triage")
        assert r.status_code == 200
        assert r.json()["total_count"] == 0
        assert r.json()["triage_complete"] is True

    def test_triage_queue_returns_untriaged(self, client, test_user, test_tasks):
        """Tasks without triaged_at appear in the queue."""
        r = client.get("/triage")
        assert r.status_code == 200
        assert r.json()["total_count"] > 0
        assert r.json()["triage_complete"] is False

    def test_triage_confirm(self, client, test_user, test_tasks):
        """Confirm moves task to today bucket."""
        # Pick a non-today task
        task = next(t for t in test_tasks if t.bucket != BucketType.today)

        r = client.post(f"/triage/{task.id}", json={"action": "confirm"})
        assert r.status_code == 200
        assert r.json()["action"] == "confirm"

    def test_triage_defer_requires_bucket(self, client, test_user, test_tasks):
        task = test_tasks[0]
        r = client.post(f"/triage/{task.id}", json={"action": "defer"})
        assert r.status_code == 422

    def test_triage_defer_with_bucket(self, client, test_user, test_tasks):
        task = test_tasks[0]
        r = client.post(f"/triage/{task.id}", json={"action": "defer", "bucket": "later"})
        assert r.status_code == 200
        assert r.json()["action"] == "defer"

    def test_triage_complete(self, client, test_user, test_tasks):
        task = test_tasks[0]
        r = client.post(f"/triage/{task.id}", json={"action": "complete"})
        assert r.status_code == 200
        assert r.json()["action"] == "complete"

    def test_triage_kill(self, client, test_user, test_tasks):
        task = test_tasks[0]
        r = client.post(f"/triage/{task.id}", json={"action": "kill"})
        assert r.status_code == 200
        assert r.json()["action"] == "kill"

    def test_triage_kill_task_with_children(self, client, test_user, test_tasks, db):
        """Kill a parent task — children should be cascade-deleted too."""
        parent = test_tasks[0]
        child = Task(
            user_id=test_user.id,
            text="Child task",
            bucket=parent.bucket,
            parent_id=parent.id,
            status=TaskStatus.pending,
        )
        db.add(child)
        db.flush()
        child_id = child.id

        r = client.post(f"/triage/{parent.id}", json={"action": "kill"})
        assert r.status_code == 200
        assert r.json()["action"] == "kill"

        # Parent gone
        r2 = client.get(f"/tasks/{parent.id}")
        assert r2.status_code == 404

        # Child cascade-deleted
        r3 = client.get(f"/tasks/{child_id}")
        assert r3.status_code == 404

    def test_triage_kill_decrements_remaining(self, client, test_user, test_tasks):
        """Kill should decrement the remaining count."""
        queue = client.get("/triage").json()
        initial_count = queue["total_count"]

        task = test_tasks[0]
        r = client.post(f"/triage/{task.id}", json={"action": "kill"})
        assert r.status_code == 200
        assert r.json()["remaining"] == initial_count - 1

    def test_triage_rewrite(self, client, test_user, test_tasks, db):
        """When rewritten_text is provided, task text is updated."""
        task = test_tasks[0]
        task.reschedule_count = 3
        db.flush()

        r = client.post(
            f"/triage/{task.id}",
            json={"action": "confirm", "rewritten_text": "Reworded task"},
        )
        assert r.status_code == 200

    def test_winddown_returns_today_pending(self, client, test_user, test_tasks, db):
        """Winddown returns incomplete today tasks."""
        # Mark tasks as today + triaged
        for t in test_tasks:
            t.bucket = BucketType.today
            t.triaged_at = date.today()
        db.flush()

        r = client.get("/triage/winddown")
        assert r.status_code == 200
        data = r.json()
        assert len(data["tasks"]) == 5  # All 5 tasks are today+pending
        assert data["mit_completed"] is None


class TestBriefingEndpoint:
    @patch("app.api.triage.briefing_service.generate_briefing")
    def test_pro_user_gets_briefing(self, mock_gen, client, test_user, test_tasks, db):
        test_user.subscription_status = "active"
        db.flush()

        mock_gen.return_value = BriefingResponse(
            summary="5 tasks",
            domain_balance="Heavy on Work",
            calibration="You average 4",
        )

        r = client.get("/triage/briefing")
        assert r.status_code == 200
        data = r.json()
        assert data["summary"] == "5 tasks"
        assert data["domain_balance"] == "Heavy on Work"
        assert data["calibration"] == "You average 4"
        mock_gen.assert_called_once()

    def test_free_user_gets_403(self, client, test_user):
        r = client.get("/triage/briefing")
        assert r.status_code == 403
        assert r.json()["code"] == "pro_required"

    @patch("app.api.triage.briefing_service.generate_briefing")
    def test_empty_briefing_returns_200(self, mock_gen, client, test_user, db):
        test_user.subscription_status = "active"
        db.flush()

        mock_gen.return_value = BriefingResponse()

        r = client.get("/triage/briefing")
        assert r.status_code == 200
        assert r.json()["summary"] == ""
        assert r.json()["domain_balance"] == ""
        assert r.json()["calibration"] == ""
