"""Task reference resolution and error formatting.

Resolving `tend done dentist` to the right task is the CLI's one piece of real
logic. Getting it wrong means completing the wrong task, so ambiguity must be an
error rather than a guess.
"""

import httpx
import pytest

from tend_cli.cli import resolve_task
from tend_cli.client import TendError, _error_message

TASKS = [
    {"id": "aaaa1111-0000-0000-0000-000000000001", "text": "call the plumber", "bucket": "soon"},
    {
        "id": "aaaa2222-0000-0000-0000-000000000002",
        "text": "call the electrician",
        "bucket": "soon",
    },
    {"id": "bbbb3333-0000-0000-0000-000000000003", "text": "file the brief", "bucket": "today"},
]


class StubClient:
    def __init__(self, tasks=TASKS):
        self._tasks = tasks

    def tasks(self, **_filters):
        return self._tasks


def test_exact_id_wins():
    assert resolve_task(StubClient(), TASKS[0]["id"])["text"] == "call the plumber"


def test_id_prefix():
    assert resolve_task(StubClient(), "bbbb3333")["text"] == "file the brief"


def test_id_prefix_is_case_insensitive():
    assert resolve_task(StubClient(), "BBBB3333")["text"] == "file the brief"


def test_unique_text_substring():
    assert resolve_task(StubClient(), "plumb")["text"] == "call the plumber"


def test_text_match_is_case_insensitive():
    assert resolve_task(StubClient(), "BRIEF")["text"] == "file the brief"


def test_ambiguous_text_raises_and_lists_candidates():
    with pytest.raises(TendError) as exc:
        resolve_task(StubClient(), "call")
    message = str(exc.value)
    assert "matches 2 tasks" in message
    assert "plumber" in message and "electrician" in message


def test_no_match_raises():
    with pytest.raises(TendError, match="No pending task matches"):
        resolve_task(StubClient(), "nonexistent")


def test_id_match_beats_text_match():
    """An id prefix is unambiguous intent; it should never be shadowed by text."""
    tasks = [
        {"id": "cafe0000-0000-0000-0000-000000000001", "text": "one", "bucket": "soon"},
        {
            "id": "dddd0000-0000-0000-0000-000000000002",
            "text": "grind cafe beans",
            "bucket": "soon",
        },
    ]
    assert resolve_task(StubClient(tasks), "cafe")["text"] == "one"


def test_explicit_task_list_is_used_without_fetching():
    class Exploding:
        def tasks(self, **_filters):
            raise AssertionError("should not fetch when tasks are supplied")

    assert resolve_task(Exploding(), "brief", TASKS)["text"] == "file the brief"


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        ({"code": "not_found", "message": "Task not found"}, "Task not found"),
        ({"detail": "plain detail"}, "plain detail"),
        (
            {"detail": [{"loc": ["body", "bucket"], "msg": "invalid bucket"}]},
            "bucket: invalid bucket",
        ),
    ],
)
def test_error_message_extraction(payload, expected):
    response = httpx.Response(422, json=payload)
    assert _error_message(response) == expected


def test_error_message_falls_back_to_raw_body():
    response = httpx.Response(502, text="upstream exploded")
    assert "upstream exploded" in _error_message(response)
