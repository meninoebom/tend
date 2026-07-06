"""Tests for the task size field (#216)."""


class TestTaskSize:
    def test_create_with_size(self, client, test_user):
        r = client.post("/tasks", json={"text": "sized task", "bucket": "today", "size": "m"})
        assert r.status_code == 201
        assert r.json()["size"] == "m"

    def test_create_without_size_is_null(self, client, test_user):
        r = client.post("/tasks", json={"text": "unsized", "bucket": "today"})
        assert r.status_code == 201
        assert r.json()["size"] is None

    def test_invalid_size_rejected(self, client, test_user):
        r = client.post("/tasks", json={"text": "bad", "bucket": "today", "size": "xl"})
        assert r.status_code == 422

    def test_update_size(self, client, test_user, test_tasks):
        t = test_tasks[0]
        r = client.patch(f"/tasks/{t.id}", json={"size": "l"})
        assert r.status_code == 200
        assert r.json()["size"] == "l"

    def test_size_exposed_in_list(self, client, test_user, test_tasks):
        t = test_tasks[0]
        client.patch(f"/tasks/{t.id}", json={"size": "s"})
        r = client.get("/tasks")
        sizes = {row["id"]: row["size"] for row in r.json()}
        assert sizes[str(t.id)] == "s"
