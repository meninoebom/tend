"""Capture grammar (#251): parser cases and POST /tasks/capture."""

import json
import uuid
from dataclasses import dataclass
from pathlib import Path

import pytest

from app.models.enums import BucketType, SizeType
from app.services.capture_service import parse_capture

CASES = json.loads((Path(__file__).parent / "capture_cases.json").read_text())


@dataclass
class _Domain:
    name: str


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_parse_capture_cases(case):
    domains = [_Domain(n) for n in case["domains"]]
    exp = case["expected"]
    result = parse_capture(case["input"], domains)

    assert result.text == exp["text"]
    assert result.important is exp.get("important", False)
    assert result.urgent is exp.get("urgent", False)
    assert result.bucket == exp.get("bucket")
    assert result.size == exp.get("size")
    if result.bucket is not None:
        assert isinstance(result.bucket, BucketType)
    if result.size is not None:
        assert isinstance(result.size, SizeType)
    assert (result.domain.name if result.domain else None) == exp.get("domain")


class TestCaptureRoute:
    def test_capture_creates_classified_task(self, client, test_user, test_domains):
        r = client.post("/tasks/capture", json={"text": "call dentist #health ! ~s"})
        assert r.status_code == 201
        body = r.json()
        assert body["text"] == "call dentist"
        assert body["urgent"] is True
        assert body["important"] is False
        assert body["size"] == "s"
        assert body["domain"]["name"] == "Health"
        assert body["bucket"] == "today"

    def test_bucket_token_used_without_explicit_bucket(self, client, test_user):
        r = client.post("/tasks/capture", json={"text": "read book >later"})
        assert r.status_code == 201
        assert r.json()["bucket"] == "later"

    def test_explicit_bucket_beats_token(self, client, test_user):
        r = client.post("/tasks/capture", json={"text": "read book >later", "bucket": "soon"})
        assert r.status_code == 201
        assert r.json()["text"] == "read book"
        assert r.json()["bucket"] == "soon"

    def test_explicit_null_bucket_defaults_today(self, client, test_user):
        r = client.post("/tasks/capture", json={"text": "plain", "bucket": None})
        assert r.status_code == 201
        assert r.json()["bucket"] == "today"

    def test_only_tokens_returns_422(self, client, test_user):
        r = client.post("/tasks/capture", json={"text": "* ! >later"})
        assert r.status_code == 422
        assert client.get("/tasks").json() == []

    def test_unknown_tag_kept(self, client, test_user, test_domains):
        r = client.post("/tasks/capture", json={"text": "read #fiction"})
        assert r.status_code == 201
        assert r.json()["text"] == "read #fiction"
        assert r.json()["domain"] is None

    def test_domain_scoped_to_user(self, client, test_user, db):
        from app.models.domain import Domain
        from app.models.enums import AuthProvider
        from app.models.user import User

        other = User(email=f"other-{uuid.uuid4()}@example.com", auth_provider=AuthProvider.email)
        db.add(other)
        db.flush()
        db.add(Domain(user_id=other.id, name="Health", color="#ef4444", position=0))
        db.flush()

        r = client.post("/tasks/capture", json={"text": "run #health"})
        assert r.status_code == 201
        assert r.json()["text"] == "run #health"
        assert r.json()["domain"] is None
