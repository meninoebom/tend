class TestFeedback:
    def test_send_feedback(self, client, test_user):
        r = client.post("/feedback", json={"message": "Love the app!"})
        assert r.status_code == 202

    def test_empty_message_rejected(self, client, test_user):
        r = client.post("/feedback", json={"message": ""})
        assert r.status_code == 422

    def test_message_too_long_rejected(self, client, test_user):
        r = client.post("/feedback", json={"message": "x" * 2001})
        assert r.status_code == 422

    def test_unauthenticated_rejected(self, client, db):
        """Without test_user fixture, auth override still returns a user_id
        but the user doesn't exist in DB — endpoint returns 404."""
        r = client.post("/feedback", json={"message": "Hello"})
        assert r.status_code == 404
