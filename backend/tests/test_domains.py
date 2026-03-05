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

    def test_pro_user_can_exceed_free_limit(self, client, db, test_user, test_domains):
        """Pro users can create more than 5 domains."""
        test_user.subscription_status = "active"
        db.add(test_user)
        db.flush()

        # Already have 3, add up to 6 (exceeds free limit of 5)
        for i in range(3):
            r = client.post(
                "/domains", json={"name": f"Extra{i}", "color": "#000000"}
            )
            assert r.status_code == 201

    def test_pro_user_limited_at_20(self, client, db, test_user):
        """Pro users are capped at 20 domains."""
        test_user.subscription_status = "active"
        db.add(test_user)
        db.flush()

        from app.models.domain import Domain

        # Create 20 domains directly
        for i in range(20):
            d = Domain(
                user_id=test_user.id, name=f"D{i}", color="#000000", position=i
            )
            db.add(d)
        db.flush()

        # 21st should fail
        r = client.post("/domains", json={"name": "TooMany", "color": "#000000"})
        assert r.status_code == 422
        assert r.json()["code"] == "domain_limit_reached"

    def test_free_user_error_code(self, client, test_user, test_domains, db):
        """Free user gets domain_limit_reached with helpful message."""
        from app.models.domain import Domain

        for i in range(2):
            d = Domain(
                user_id=test_user.id, name=f"Extra{i}", color="#000000", position=3 + i
            )
            db.add(d)
        db.flush()

        r = client.post("/domains", json={"name": "TooMany", "color": "#000000"})
        assert r.status_code == 422
        assert r.json()["code"] == "domain_limit_reached"
