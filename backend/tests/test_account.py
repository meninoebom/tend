

class TestAccount:
    def test_create_user(self, client, db):
        r = client.post(
            "/users",
            json={"email": "new@tend.app", "password": "secret123"},
        )
        assert r.status_code == 201
        data = r.json()
        assert data["email"] == "new@tend.app"
        assert data["auth_provider"] == "email"
        assert data["has_completed_onboarding"] is False

    def test_create_user_idempotent(self, client, db):
        """Creating the same email twice returns the existing user."""
        r1 = client.post("/users", json={"email": "dup@tend.app", "password": "pass1"})
        r2 = client.post("/users", json={"email": "dup@tend.app", "password": "pass2"})
        assert r1.status_code == 201
        assert r2.status_code == 201
        assert r1.json()["id"] == r2.json()["id"]

    def test_create_user_google(self, client, db):
        r = client.post(
            "/users",
            json={"email": "google@tend.app", "auth_provider": "google"},
        )
        assert r.status_code == 201
        assert r.json()["auth_provider"] == "google"

    def test_get_me(self, client, test_user):
        r = client.get("/me")
        assert r.status_code == 200
        assert r.json()["email"] == "test@tend.app"

    def test_update_me(self, client, test_user):
        r = client.patch("/me", json={"has_completed_onboarding": True})
        assert r.status_code == 200
        assert r.json()["has_completed_onboarding"] is True

    def test_verify_user_success(self, client, db):
        """Verify correct email/password returns user."""
        client.post("/users", json={"email": "verify@tend.app", "password": "correct123"})
        r = client.post(
            "/users/verify", json={"email": "verify@tend.app", "password": "correct123"}
        )
        assert r.status_code == 200
        assert r.json()["email"] == "verify@tend.app"

    def test_verify_user_wrong_password(self, client, db):
        client.post("/users", json={"email": "verify2@tend.app", "password": "correct123"})
        r = client.post("/users/verify", json={"email": "verify2@tend.app", "password": "wrong"})
        assert r.status_code == 401

    def test_verify_user_not_found(self, client, db):
        r = client.post("/users/verify", json={"email": "noone@tend.app", "password": "pass"})
        assert r.status_code == 401

    def test_delete_me(self, client, test_user):
        r = client.delete("/me")
        assert r.status_code == 204

        r = client.get("/me")
        assert r.status_code == 404
