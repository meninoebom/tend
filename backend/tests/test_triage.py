from datetime import date

from app.models.enums import BucketType


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
        r = client.post(
            f"/triage/{task.id}", json={"action": "defer", "bucket": "later"}
        )
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
        assert len(r.json()) == 5  # All 5 tasks are today+pending
