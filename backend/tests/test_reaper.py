from datetime import datetime, timedelta

from app.models.enums import BucketType, TaskStatus
from app.models.task import Task


class TestReaper:
    def test_reaper_requires_api_key(self, client, test_user):
        r = client.post("/reaper/run")
        assert r.status_code == 401

    def test_reaper_rejects_bad_key(self, client, test_user):
        r = client.post("/reaper/run", headers={"X-Reaper-Key": "wrong"})
        assert r.status_code == 401

    def test_reaper_archives_stale_tasks(self, client, test_user, db):
        """Tasks older than 30 days in non-today buckets get archived."""
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

        r = client.post("/reaper/run", headers={"X-Reaper-Key": "dev-reaper-key"})
        assert r.status_code == 200
        assert r.json()["archived_count"] >= 1

        db.refresh(task)
        assert task.status == TaskStatus.archived

    def test_reaper_skips_today_tasks(self, client, test_user, db):
        """Today-bucket tasks are never reaped regardless of age."""
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

        r = client.post("/reaper/run", headers={"X-Reaper-Key": "dev-reaper-key"})
        assert r.status_code == 200

        db.refresh(task)
        assert task.status == TaskStatus.pending

    def test_reaper_archives_orphaned_children(self, client, test_user, db):
        """Children of archived parents get archived too."""
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

        r = client.post("/reaper/run", headers={"X-Reaper-Key": "dev-reaper-key"})
        assert r.status_code == 200

        db.refresh(parent)
        db.refresh(child)
        assert parent.status == TaskStatus.archived
        assert child.status == TaskStatus.archived
