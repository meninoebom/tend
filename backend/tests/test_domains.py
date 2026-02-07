import uuid

from app.models.domain import Domain


class TestDomainCRUD:
    def test_list_domains(self, client, test_user, test_domains):
        r = client.get("/domains")
        assert r.status_code == 200
        assert len(r.json()) == 3

    def test_create_domain(self, client, test_user):
        r = client.post("/domains", json={"name": "Finance", "color": "#f59e0b"})
        assert r.status_code == 201
        assert r.json()["name"] == "Finance"
        assert r.json()["color"] == "#f59e0b"

    def test_create_domain_limit(self, client, test_user, test_domains, db):
        """Cannot exceed 5 domains."""
        # Already have 3 from fixture, add 2 more
        for i, name in enumerate(["Extra1", "Extra2"]):
            d = Domain(
                user_id=test_user.id, name=name, color="#000000", position=3 + i
            )
            db.add(d)
        db.flush()

        # 6th should fail
        r = client.post("/domains", json={"name": "TooMany", "color": "#000000"})
        assert r.status_code == 422

    def test_update_domain(self, client, test_user, test_domains):
        d = test_domains[0]
        r = client.patch(f"/domains/{d.id}", json={"name": "Engineering"})
        assert r.status_code == 200
        assert r.json()["name"] == "Engineering"

    def test_update_domain_color(self, client, test_user, test_domains):
        d = test_domains[0]
        r = client.patch(f"/domains/{d.id}", json={"color": "#000000"})
        assert r.status_code == 200
        assert r.json()["color"] == "#000000"

    def test_delete_domain(self, client, test_user, test_domains):
        d = test_domains[0]
        r = client.delete(f"/domains/{d.id}")
        assert r.status_code == 204

        r = client.get("/domains")
        assert len(r.json()) == 2

    def test_delete_nonexistent_domain(self, client, test_user):
        r = client.delete(f"/domains/{uuid.uuid4()}")
        assert r.status_code == 404
