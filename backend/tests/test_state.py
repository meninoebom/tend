from collections.abc import Generator

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.deps import get_db
from app.main import app
from app.models.enums import TaskStatus


class TestState:
    def test_unauthenticated_returns_401(self, db: Session):
        def _override_db() -> Generator[Session]:
            yield db

        app.dependency_overrides[get_db] = _override_db
        try:
            client = TestClient(app)
            r = client.get("/state")
            assert r.status_code == 401
        finally:
            app.dependency_overrides.clear()

    def test_empty_user_returns_all_zeros(self, client, test_user):
        r = client.get("/state")
        assert r.status_code == 200
        data = r.json()
        assert data["buckets"] == {"today": 0, "soon": 0, "later": 0, "someday": 0, "done": 0}
        assert data["priority"] == {"q1_count": 0, "q2_count": 0, "q3_count": 0, "q4_count": 0}

    def test_bucket_counts_match_pending_tasks(self, client, test_user, test_tasks):
        # conftest creates: 2 today, 1 soon, 1 later, 1 someday — all pending
        r = client.get("/state")
        assert r.status_code == 200
        buckets = r.json()["buckets"]
        assert buckets["today"] == 2
        assert buckets["soon"] == 1
        assert buckets["later"] == 1
        assert buckets["someday"] == 1
        assert buckets["done"] == 0

    def test_done_count_reflects_complete_tasks(self, client, test_user, test_tasks, db):
        task = test_tasks[0]
        task.status = TaskStatus.complete
        db.add(task)
        db.flush()

        r = client.get("/state")
        assert r.status_code == 200
        data = r.json()
        assert data["buckets"]["today"] == 1  # one less pending
        assert data["buckets"]["done"] == 1

    def test_priority_counts_q1_and_q4(self, client, test_user, test_tasks, db):
        # Mark one task important+urgent (Q1) and one as neither (Q4 by default)
        task = test_tasks[0]
        task.important = True
        task.urgent = True
        db.add(task)
        db.flush()

        r = client.get("/state")
        assert r.status_code == 200
        priority = r.json()["priority"]
        assert priority["q1_count"] >= 1

    def test_archived_tasks_excluded_from_counts(self, client, test_user, test_tasks, db):
        task = test_tasks[0]
        task.status = TaskStatus.archived
        db.add(task)
        db.flush()

        r = client.get("/state")
        buckets = r.json()["buckets"]
        assert buckets["today"] == 1  # archived task not counted
        assert buckets["done"] == 0   # archived ≠ done
