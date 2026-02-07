

class TestStats:
    def test_nudge_no_tasks(self, client, test_user):
        r = client.get("/stats/nudge")
        assert r.status_code == 200
        data = r.json()
        assert data["today_count"] == 0
        assert data["message"] == "No tasks yet today."

    def test_nudge_with_tasks(self, client, test_user):
        # Create tasks via API (which records stats)
        client.post("/tasks", json={"text": "Task one"})
        r2 = client.post("/tasks", json={"text": "Task two"})
        task_id = r2.json()["id"]
        client.post(f"/tasks/{task_id}/complete")

        r = client.get("/stats/nudge")
        assert r.status_code == 200
        data = r.json()
        assert data["today_count"] == 2
        assert data["completed_count"] == 1

    def test_daily_stats_empty(self, client, test_user):
        r = client.get("/stats/daily?days=7")
        assert r.status_code == 200
        assert r.json() == []

    def test_daily_stats_after_activity(self, client, test_user):
        # Create and complete a task
        r = client.post("/tasks", json={"text": "Test task"})
        task_id = r.json()["id"]
        client.post(f"/tasks/{task_id}/complete")

        r = client.get("/stats/daily?days=7")
        assert r.status_code == 200
        stats = r.json()
        assert len(stats) >= 1
        assert stats[0]["tasks_added"] >= 1
        assert stats[0]["tasks_completed"] >= 1
