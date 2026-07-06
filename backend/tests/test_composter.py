from datetime import date, datetime, timedelta

from app.models.enums import BucketType, TaskStatus
from app.models.task import Task


class TestComposter:
    """Composting runs automatically when a user fetches their triage queue."""

    def test_triage_composts_stale_tasks(self, client, test_user, db):
        """Tasks older than 30 days in non-today buckets get composted on triage."""
        old_date = datetime.utcnow() - timedelta(days=31)
        task = Task(
            user_id=test_user.id,
            text="Old stale task",
            bucket=BucketType.soon,
            status=TaskStatus.pending,
            created_at=old_date,
        )
        db.add(task)
        db.flush()

        r = client.get("/triage")
        assert r.status_code == 200

        db.refresh(task)
        assert task.status == TaskStatus.archived

    def test_triage_skips_today_tasks(self, client, test_user, db):
        """Today-bucket tasks are never composted regardless of age."""
        old_date = datetime.utcnow() - timedelta(days=60)
        task = Task(
            user_id=test_user.id,
            text="Old today task",
            bucket=BucketType.today,
            status=TaskStatus.pending,
            created_at=old_date,
        )
        db.add(task)
        db.flush()

        r = client.get("/triage")
        assert r.status_code == 200

        db.refresh(task)
        assert task.status == TaskStatus.pending

    def test_triage_composts_orphaned_children(self, client, test_user, db):
        """Children of composted parents get composted too."""
        old_date = datetime.utcnow() - timedelta(days=31)
        parent = Task(
            user_id=test_user.id,
            text="Old parent",
            bucket=BucketType.later,
            status=TaskStatus.pending,
            created_at=old_date,
        )
        db.add(parent)
        db.flush()

        child = Task(
            user_id=test_user.id,
            text="Child of old parent",
            bucket=BucketType.later,
            status=TaskStatus.pending,
            parent_id=parent.id,
        )
        db.add(child)
        db.flush()

        r = client.get("/triage")
        assert r.status_code == 200

        db.refresh(parent)
        db.refresh(child)
        assert parent.status == TaskStatus.archived
        assert child.status == TaskStatus.archived

    def test_fresh_tasks_not_composted(self, client, test_user, db):
        """Tasks less than 30 days old are not composted."""
        task = Task(
            user_id=test_user.id,
            text="Recent task",
            bucket=BucketType.soon,
            status=TaskStatus.pending,
        )
        db.add(task)
        db.flush()

        r = client.get("/triage")
        assert r.status_code == 200

        db.refresh(task)
        assert task.status == TaskStatus.pending

    def test_exactly_30_days_not_composted(self, client, test_user, db):
        """Task created just under 30 days ago is NOT composted (strict < comparison)."""
        just_under_30 = datetime.utcnow() - timedelta(days=29, hours=23)
        task = Task(
            user_id=test_user.id,
            text="Boundary task",
            bucket=BucketType.soon,
            status=TaskStatus.pending,
            created_at=just_under_30,
        )
        db.add(task)
        db.flush()

        r = client.get("/triage")
        assert r.status_code == 200

        db.refresh(task)
        assert task.status == TaskStatus.pending

    def test_restore_resets_triaged_at(self, client, test_user, db):
        """Restoring an archived task resets triaged_at so it enters triage."""
        task = Task(
            user_id=test_user.id,
            text="Archived task",
            bucket=BucketType.soon,
            status=TaskStatus.archived,
            triaged_at=date.today(),
        )
        db.add(task)
        db.flush()

        r = client.patch(f"/tasks/{task.id}", json={"status": "pending"})
        assert r.status_code == 200

        db.refresh(task)
        assert task.status == TaskStatus.pending
        assert task.triaged_at is None

    def test_reopen_complete_to_pending_allowed(self, client, test_user, db):
        """complete→pending is allowed (reopen, e.g. undo a triage "Done");
        completed_at is cleared."""
        from datetime import datetime

        task = Task(
            user_id=test_user.id,
            text="Done task",
            bucket=BucketType.today,
            status=TaskStatus.complete,
            completed_at=datetime.utcnow(),
        )
        db.add(task)
        db.flush()

        r = client.patch(f"/tasks/{task.id}", json={"status": "pending"})
        assert r.status_code == 200
        assert r.json()["status"] == "pending"
        assert r.json()["completed_at"] is None

    def test_invalid_status_transition_rejected(self, client, test_user, db):
        """complete→archived is not a valid transition."""
        task = Task(
            user_id=test_user.id,
            text="Done task",
            bucket=BucketType.today,
            status=TaskStatus.complete,
        )
        db.add(task)
        db.flush()

        r = client.patch(f"/tasks/{task.id}", json={"status": "archived"})
        assert r.status_code == 422
