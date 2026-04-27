import uuid

from app.models.enums import BucketType, TaskStatus
from app.models.task import Task


class TestTaskCRUD:
    def test_create_task(self, client, test_user, test_domains):
        r = client.post(
            "/tasks",
            json={"text": "New task", "bucket": "today", "domain_id": str(test_domains[0].id)},
        )
        assert r.status_code == 201
        data = r.json()
        assert data["text"] == "New task"
        assert data["bucket"] == "today"
        assert data["status"] == "pending"
        assert data["domain"]["name"] == "Work"

    def test_create_task_minimal(self, client, test_user):
        r = client.post("/tasks", json={"text": "Just text"})
        assert r.status_code == 201
        assert r.json()["bucket"] == "today"
        assert r.json()["domain"] is None

    def test_create_subtask(self, client, test_user, test_tasks):
        parent = test_tasks[0]
        r = client.post("/tasks", json={"text": "Sub-task", "parent_id": str(parent.id)})
        assert r.status_code == 201
        data = r.json()
        assert data["text"] == "Sub-task"
        # Sub-task inherits parent bucket
        assert data["bucket"] == parent.bucket

    def test_create_subtask_depth_limit(self, client, test_user, test_tasks, db):
        """Cannot create a sub-sub-task (only 1 level deep)."""
        parent = test_tasks[0]
        # Create a child
        child = Task(
            user_id=test_user.id,
            text="Child",
            bucket=BucketType.today,
            parent_id=parent.id,
        )
        db.add(child)
        db.flush()

        # Try to create grandchild
        r = client.post("/tasks", json={"text": "Grandchild", "parent_id": str(child.id)})
        assert r.status_code == 422

    def test_create_task_text_too_long(self, client, test_user):
        r = client.post("/tasks", json={"text": "x" * 501})
        assert r.status_code == 422

    def test_list_tasks_by_bucket(self, client, test_user, test_tasks):
        r = client.get("/tasks?bucket=today")
        assert r.status_code == 200
        texts = [t["text"] for t in r.json()]
        assert "Build frontend" in texts
        assert "Go for a run" in texts
        assert "Read docs" not in texts

    def test_list_tasks_by_status(self, client, test_user, test_tasks):
        r = client.get("/tasks?status=pending")
        assert r.status_code == 200
        assert len(r.json()) == 5

    def test_get_task(self, client, test_user, test_tasks):
        task = test_tasks[0]
        r = client.get(f"/tasks/{task.id}")
        assert r.status_code == 200
        assert r.json()["text"] == "Build frontend"

    def test_get_task_not_found(self, client, test_user):
        fake_id = uuid.uuid4()
        r = client.get(f"/tasks/{fake_id}")
        assert r.status_code == 404

    def test_update_task(self, client, test_user, test_tasks):
        task = test_tasks[0]
        r = client.patch(f"/tasks/{task.id}", json={"text": "Updated text"})
        assert r.status_code == 200
        assert r.json()["text"] == "Updated text"

    def test_complete_task(self, client, test_user, test_tasks):
        task = test_tasks[0]
        r = client.post(f"/tasks/{task.id}/complete")
        assert r.status_code == 200
        assert r.json()["status"] == "complete"
        assert r.json()["completed_at"] is not None

    def test_complete_task_cascades_children(self, client, test_user, test_tasks, db):
        parent = test_tasks[0]
        child = Task(
            user_id=test_user.id,
            text="Child task",
            bucket=BucketType.today,
            parent_id=parent.id,
        )
        db.add(child)
        db.flush()

        r = client.post(f"/tasks/{parent.id}/complete")
        assert r.status_code == 200

        # Verify child is also completed
        db.refresh(child)
        assert child.status == TaskStatus.complete

    def test_delete_task(self, client, test_user, test_tasks):
        task = test_tasks[0]
        r = client.delete(f"/tasks/{task.id}")
        assert r.status_code == 204

    def test_delete_task_cascades_children(self, client, test_user, test_tasks, db):
        """Deleting a parent task should cascade-delete its children."""
        parent = test_tasks[0]
        child = Task(
            user_id=test_user.id,
            text="Child task",
            bucket=BucketType.today,
            parent_id=parent.id,
        )
        db.add(child)
        db.flush()
        child_id = child.id

        r = client.delete(f"/tasks/{parent.id}")
        assert r.status_code == 204

        # Child should be gone too
        r2 = client.get(f"/tasks/{child_id}")
        assert r2.status_code == 404

    def test_task_age_days(self, client, test_user, test_tasks):
        r = client.get(f"/tasks/{test_tasks[0].id}")
        assert r.status_code == 200
        assert r.json()["age_days"] >= 0


class TestTodayOrdering:
    def test_today_tasks_ordered_by_position(self, client, db, test_user):
        """Tasks with position values should be ordered position ASC, nulls last."""
        t1 = Task(user_id=test_user.id, text="Third", bucket=BucketType.today, position=2)
        t2 = Task(user_id=test_user.id, text="First", bucket=BucketType.today, position=0)
        t3 = Task(user_id=test_user.id, text="Second", bucket=BucketType.today, position=1)
        t4 = Task(user_id=test_user.id, text="No position", bucket=BucketType.today, position=None)
        db.add_all([t1, t2, t3, t4])
        db.flush()

        r = client.get("/tasks", params={"bucket": "today"})
        assert r.status_code == 200
        texts = [t["text"] for t in r.json()]
        assert texts == ["First", "Second", "Third", "No position"]

    def test_position_cleared_when_moved_out_of_today(self, client, db, test_user):
        """Moving a task out of Today should clear its position."""
        t = Task(
            user_id=test_user.id,
            text="Positioned",
            bucket=BucketType.today,
            status=TaskStatus.pending,
            position=2,
        )
        db.add(t)
        db.flush()

        r = client.patch(f"/tasks/{t.id}", json={"bucket": "soon"})
        assert r.status_code == 200

        db.expire_all()
        updated = db.get(Task, t.id)
        assert updated.position is None
        assert updated.bucket == "soon"

    def test_non_today_bucket_ignores_position(self, client, db, test_user):
        """Bucket views other than Today should not use position ordering."""
        from datetime import datetime, timedelta

        t1 = Task(
            user_id=test_user.id,
            text="Older",
            bucket=BucketType.soon,
            position=0,
            created_at=datetime.utcnow() - timedelta(hours=1),
        )
        t2 = Task(
            user_id=test_user.id,
            text="Newer",
            bucket=BucketType.soon,
            position=5,
            created_at=datetime.utcnow(),
        )
        db.add_all([t1, t2])
        db.flush()

        r = client.get("/tasks", params={"bucket": "soon"})
        texts = [t["text"] for t in r.json()]
        # created_at DESC — newer first
        assert texts == ["Newer", "Older"]


class TestReorderTasks:
    def test_reorder_assigns_positions(self, client, db, test_user):
        """PATCH /tasks/reorder assigns sequential positions."""
        tasks = []
        for text in ["A", "B", "C"]:
            t = Task(
                user_id=test_user.id, text=text, bucket=BucketType.today, status=TaskStatus.pending
            )
            db.add(t)
            tasks.append(t)
        db.flush()

        # Reorder as C, A, B
        r = client.patch(
            "/tasks/reorder",
            json={"task_ids": [str(tasks[2].id), str(tasks[0].id), str(tasks[1].id)]},
        )
        assert r.status_code == 200
        assert r.json()["updated"] == 3

        # Verify ordering
        r2 = client.get("/tasks", params={"bucket": "today"})
        texts = [t["text"] for t in r2.json()]
        assert texts == ["C", "A", "B"]

    def test_reorder_rejects_invalid_task_id(self, client, db, test_user):
        """Returns 400 for nonexistent task ID."""
        import uuid

        r = client.patch("/tasks/reorder", json={"task_ids": [str(uuid.uuid4())]})
        assert r.status_code == 400

    def test_reorder_rejects_wrong_bucket(self, client, db, test_user):
        """Returns 400 if task is not in Today bucket."""
        t = Task(
            user_id=test_user.id,
            text="Soon task",
            bucket=BucketType.soon,
            status=TaskStatus.pending,
        )
        db.add(t)
        db.flush()

        r = client.patch("/tasks/reorder", json={"task_ids": [str(t.id)]})
        assert r.status_code == 400

    def test_new_today_task_gets_next_position(self, client, db, test_user):
        """Newly created Today tasks should get position = max + 1."""
        t1 = Task(user_id=test_user.id, text="A", bucket=BucketType.today, position=0)
        t2 = Task(user_id=test_user.id, text="B", bucket=BucketType.today, position=1)
        db.add_all([t1, t2])
        db.flush()

        r = client.post("/tasks", json={"text": "New task", "bucket": "today"})
        assert r.status_code == 201
        # Verify it appears last and has position 2
        new_task_id = r.json()["id"]
        db.expire_all()
        new_task = db.get(Task, uuid.UUID(new_task_id))
        assert new_task.position == 2

        r2 = client.get("/tasks", params={"bucket": "today"})
        texts = [t["text"] for t in r2.json()]
        assert texts == ["A", "B", "New task"]

    def test_reorder_rejects_empty_list(self, client, db, test_user):
        """Returns 422 for empty task_ids list."""
        r = client.patch("/tasks/reorder", json={"task_ids": []})
        assert r.status_code == 422

    def test_reorder_rejects_duplicates(self, client, db, test_user):
        """Returns 422 for duplicate task IDs."""
        t = Task(user_id=test_user.id, text="A", bucket=BucketType.today, status=TaskStatus.pending)
        db.add(t)
        db.flush()
        r = client.patch("/tasks/reorder", json={"task_ids": [str(t.id), str(t.id)]})
        assert r.status_code == 422

    def test_reorder_rejects_partial_list(self, client, db, test_user):
        """Returns 400 if not all pending Today tasks are included."""
        t1 = Task(
            user_id=test_user.id, text="A", bucket=BucketType.today, status=TaskStatus.pending
        )
        t2 = Task(
            user_id=test_user.id, text="B", bucket=BucketType.today, status=TaskStatus.pending
        )
        db.add_all([t1, t2])
        db.flush()
        # Only send one of two
        r = client.patch("/tasks/reorder", json={"task_ids": [str(t1.id)]})
        assert r.status_code == 400

    def test_reorder_rejects_other_users_task(self, client, db, test_user):
        """Returns 400 if task belongs to another user."""
        import uuid

        from app.models.enums import AuthProvider
        from app.models.user import User

        other = User(id=uuid.uuid4(), email="other@test.com", auth_provider=AuthProvider.email)
        db.add(other)
        t = Task(
            user_id=other.id, text="Not mine", bucket=BucketType.today, status=TaskStatus.pending
        )
        db.add(t)
        db.flush()

        r = client.patch("/tasks/reorder", json={"task_ids": [str(t.id)]})
        assert r.status_code == 400


class TestTaskNotes:
    def test_create_task_with_notes(self, client, test_user):
        """Top-level task can be created with notes."""
        r = client.post("/tasks", json={"text": "Task with note", "notes": "Some context"})
        assert r.status_code == 201
        assert r.json()["notes"] == "Some context"

    def test_create_task_without_notes(self, client, test_user):
        """Tasks without notes return null."""
        r = client.post("/tasks", json={"text": "No note"})
        assert r.status_code == 201
        assert r.json()["notes"] is None

    def test_create_subtask_with_notes_rejected(self, client, test_user, test_tasks):
        """Sub-tasks cannot have notes — returns 400."""
        parent = test_tasks[0]
        r = client.post(
            "/tasks",
            json={"text": "Child", "parent_id": str(parent.id), "notes": "Not allowed"},
        )
        assert r.status_code == 400

    def test_update_task_set_notes(self, client, test_user, test_tasks):
        """Can set notes on an existing top-level task."""
        task = test_tasks[0]
        r = client.patch(f"/tasks/{task.id}", json={"notes": "Added later"})
        assert r.status_code == 200
        assert r.json()["notes"] == "Added later"

    def test_update_task_clear_notes_with_empty_string(self, client, test_user, test_tasks):
        """Sending empty string clears notes (stored as NULL)."""
        task = test_tasks[0]
        # First set a note
        client.patch(f"/tasks/{task.id}", json={"notes": "Temporary"})
        # Then clear it
        r = client.patch(f"/tasks/{task.id}", json={"notes": ""})
        assert r.status_code == 200
        assert r.json()["notes"] is None

    def test_update_task_clear_notes_with_null(self, client, test_user, test_tasks):
        """Sending null clears notes."""
        task = test_tasks[0]
        client.patch(f"/tasks/{task.id}", json={"notes": "Temporary"})
        r = client.patch(f"/tasks/{task.id}", json={"notes": None})
        assert r.status_code == 200
        assert r.json()["notes"] is None

    def test_update_subtask_with_notes_rejected(self, client, db, test_user, test_tasks):
        """Cannot set notes on a sub-task via update — returns 400."""
        parent = test_tasks[0]
        child = Task(
            user_id=test_user.id,
            text="Child",
            bucket=BucketType.today,
            parent_id=parent.id,
        )
        db.add(child)
        db.flush()

        r = client.patch(f"/tasks/{child.id}", json={"notes": "Not allowed"})
        assert r.status_code == 400

    def test_notes_too_long_rejected(self, client, test_user):
        """Notes over 2000 chars are rejected with 422."""
        r = client.post("/tasks", json={"text": "Task", "notes": "x" * 2001})
        assert r.status_code == 422

    def test_notes_empty_string_normalized_to_null_on_create(self, client, test_user):
        """Empty string notes on create stored as NULL."""
        r = client.post("/tasks", json={"text": "Task", "notes": ""})
        assert r.status_code == 201
        assert r.json()["notes"] is None

    def test_notes_whitespace_normalized_to_null(self, client, test_user):
        """Whitespace-only notes normalized to NULL."""
        r = client.post("/tasks", json={"text": "Task", "notes": "   "})
        assert r.status_code == 201
        assert r.json()["notes"] is None

    def test_notes_preserved_on_unrelated_update(self, client, test_user, test_tasks):
        """Updating text doesn't wipe existing notes."""
        task = test_tasks[0]
        client.patch(f"/tasks/{task.id}", json={"notes": "Keep this"})
        r = client.patch(f"/tasks/{task.id}", json={"text": "New text"})
        assert r.status_code == 200
        assert r.json()["notes"] == "Keep this"


class TestPriorityFields:
    def test_create_task_with_priority(self, client, test_user):
        r = client.post("/tasks", json={"text": "Q1 task", "important": True, "urgent": True})
        assert r.status_code == 201
        data = r.json()
        assert data["important"] is True
        assert data["urgent"] is True

    def test_create_task_default_priority(self, client, test_user):
        r = client.post("/tasks", json={"text": "Plain task"})
        assert r.status_code == 201
        data = r.json()
        assert data["important"] is False
        assert data["urgent"] is False

    def test_patch_important(self, client, test_user, test_tasks):
        task = test_tasks[0]
        r = client.patch(f"/tasks/{task.id}", json={"important": True})
        assert r.status_code == 200
        assert r.json()["important"] is True
        assert r.json()["urgent"] is False  # unchanged

    def test_priority_endpoint_toggle(self, client, test_user, test_tasks):
        task = test_tasks[0]
        r = client.post(f"/tasks/{task.id}/priority", json={"important": True})
        assert r.status_code == 200
        assert r.json()["important"] is True
        assert r.json()["urgent"] is False

    def test_priority_endpoint_partial_update(self, client, test_user, test_tasks):
        """Partial payload doesn't reset the other field."""
        task = test_tasks[0]
        client.post(f"/tasks/{task.id}/priority", json={"important": True, "urgent": True})
        r = client.post(f"/tasks/{task.id}/priority", json={"urgent": False})
        assert r.status_code == 200
        assert r.json()["important"] is True  # untouched
        assert r.json()["urgent"] is False

    def test_priority_endpoint_idempotent(self, client, test_user, test_tasks):
        task = test_tasks[0]
        client.post(f"/tasks/{task.id}/priority", json={"important": True})
        r = client.post(f"/tasks/{task.id}/priority", json={"important": True})
        assert r.status_code == 200
        assert r.json()["important"] is True


class TestStateEndpoint:
    def test_state_priority_counts(self, client, test_user, db):
        # Create tasks in each quadrant
        import uuid

        from app.models.enums import BucketType, TaskStatus
        from app.models.task import Task as TaskModel

        user_id = uuid.UUID("00000000-0000-0000-0000-000000000099")

        for important, urgent in [(True, True), (True, False), (False, True), (False, False)]:
            t = TaskModel(
                user_id=user_id,
                text="t",
                bucket=BucketType.today,
                status=TaskStatus.pending,
                important=important,
                urgent=urgent,
            )
            db.add(t)
        db.flush()

        r = client.get("/state")
        assert r.status_code == 200
        p = r.json()["priority"]
        assert p["q1_count"] == 1
        assert p["q2_count"] == 1
        assert p["q3_count"] == 1
        assert p["q4_count"] == 1

    def test_state_excludes_completed(self, client, test_user, db):
        import uuid

        from app.models.enums import BucketType, TaskStatus
        from app.models.task import Task as TaskModel

        user_id = uuid.UUID("00000000-0000-0000-0000-000000000099")

        t = TaskModel(
            user_id=user_id,
            text="done",
            bucket=BucketType.today,
            status=TaskStatus.complete,
            important=True,
            urgent=True,
        )
        db.add(t)
        db.flush()

        r = client.get("/state")
        assert r.status_code == 200
        assert r.json()["priority"]["q1_count"] == 0
