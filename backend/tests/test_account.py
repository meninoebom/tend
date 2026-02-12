

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

    def test_create_user_duplicate_email_returns_409(self, client, db):
        """Signing up with an existing email returns 409, not the existing user."""
        client.post("/users", json={"email": "dup@tend.app", "password": "password123"})
        r = client.post("/users", json={"email": "dup@tend.app", "password": "other12345"})
        assert r.status_code == 409
        assert r.json()["code"] == "email_taken"

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
        r = client.post("/users/verify", json={"email": "verify2@tend.app", "password": "wrong1234"})
        assert r.status_code == 401

    def test_verify_user_not_found(self, client, db):
        r = client.post("/users/verify", json={"email": "noone@tend.app", "password": "password1"})
        assert r.status_code == 401

    def test_verify_identical_error_messages(self, client, db):
        """Wrong password and user-not-found must return the same error to prevent enumeration."""
        client.post("/users", json={"email": "exists@tend.app", "password": "correct123"})

        r_wrong_pw = client.post(
            "/users/verify", json={"email": "exists@tend.app", "password": "wrongpass1"}
        )
        r_no_user = client.post(
            "/users/verify", json={"email": "ghost@tend.app", "password": "anything1"}
        )

        assert r_wrong_pw.status_code == r_no_user.status_code == 401
        assert r_wrong_pw.json()["code"] == r_no_user.json()["code"]
        assert r_wrong_pw.json()["message"] == r_no_user.json()["message"]

    def test_delete_me(self, client, test_user):
        r = client.delete("/me")
        assert r.status_code == 204

        r = client.get("/me")
        assert r.status_code == 404


class TestPasswordValidation:
    def test_password_too_short_rejected(self, client, db):
        r = client.post("/users", json={"email": "short@tend.app", "password": "1234567"})
        assert r.status_code == 422  # Pydantic validation error

    def test_password_exactly_8_chars_accepted(self, client, db):
        r = client.post("/users", json={"email": "exact8@tend.app", "password": "12345678"})
        assert r.status_code == 201

    def test_password_none_accepted_for_oauth(self, client, db):
        r = client.post(
            "/users",
            json={"email": "oauth@tend.app", "auth_provider": "google"},
        )
        assert r.status_code == 201
