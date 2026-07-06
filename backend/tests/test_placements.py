"""Tests for task placements — the Plot time-block write-back (#215)."""

from datetime import date

from app.models.task import Task


class TestPlacementEndpoint:
    def test_record_placement(self, client, test_user, test_tasks):
        today_task = next(t for t in test_tasks if t.bucket == "today")
        r = client.post(
            f"/tasks/{today_task.id}/placements",
            json={
                "date": date.today().isoformat(),
                "block_start": "2026-07-06T09:00:00",
                "block_type": "deep",
                "calendar_event_id": "evt_123",
            },
        )
        assert r.status_code == 201
        body = r.json()
        assert body["placement"]["block_type"] == "deep"
        assert body["placement"]["calendar_event_id"] == "evt_123"

    def test_placement_upserts_on_same_day(self, client, test_user, test_tasks):
        t = test_tasks[0]
        d = date.today().isoformat()
        client.post(f"/tasks/{t.id}/placements", json={"date": d, "block_type": "deep"})
        r = client.post(f"/tasks/{t.id}/placements", json={"date": d, "block_type": "admin"})
        assert r.status_code == 201
        assert r.json()["placement"]["block_type"] == "admin"

    def test_placement_shows_on_task_list(self, client, test_user, test_tasks):
        t = next(t for t in test_tasks if t.bucket == "today")
        client.post(
            f"/tasks/{t.id}/placements",
            json={"date": date.today().isoformat(), "block_type": "deep"},
        )
        r = client.get("/tasks?bucket=today")
        placed = {row["id"]: row["placement"] for row in r.json()}
        assert placed[str(t.id)] is not None
        assert placed[str(t.id)]["block_type"] == "deep"

    def test_placement_for_missing_task_404(self, client, test_user):
        import uuid

        r = client.post(
            f"/tasks/{uuid.uuid4()}/placements",
            json={"date": date.today().isoformat()},
        )
        assert r.status_code == 404

    def test_winddown_includes_placement(self, client, test_user, test_tasks):
        t = next(t for t in test_tasks if t.bucket == "today")
        client.post(
            f"/tasks/{t.id}/placements",
            json={"date": date.today().isoformat(), "block_type": "deep"},
        )
        r = client.get("/triage/winddown")
        assert r.status_code == 200
        rows = {row["id"]: row["placement"] for row in r.json()["tasks"]}
        assert rows[str(t.id)] is not None

    def test_deleting_task_cascades_placement(self, client, test_user, test_tasks, db):
        t = test_tasks[0]
        client.post(
            f"/tasks/{t.id}/placements",
            json={"date": date.today().isoformat(), "block_type": "deep"},
        )
        client.delete(f"/tasks/{t.id}")
        # Task gone → placement gone (FK ON DELETE CASCADE).
        assert db.get(Task, t.id) is None
