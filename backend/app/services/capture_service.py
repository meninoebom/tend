"""Capture grammar parser (#251).

Port of ``frontend/src/lib/parse-capture.ts``. This is the source of truth for
non-web clients (CLI, MCP, shortcuts). Until the web app moves to
``POST /tasks/capture``, change the web parser alongside this one; the shared
cases live in ``tests/capture_cases.json``.

Grammar (only a standalone, whitespace-separated token parses):

    #health                     domain, case-insensitive prefix match on the
                                user's domain names, first match wins, binds once
    *                           important
    !                           urgent
    *! / !*                     important + urgent
    >today|soon|later|someday   bucket
    ~s|~m|~l                    size

Recognized tokens are stripped. Unrecognized tokens stay in the text verbatim.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

from app.models.enums import BucketType, SizeType


class NamedDomain(Protocol):
    name: str


@dataclass
class ParsedCapture[D: NamedDomain]:
    text: str
    important: bool = False
    urgent: bool = False
    bucket: BucketType | None = None
    size: SizeType | None = None
    domain: D | None = None


_BUCKETS = {b.value: b for b in BucketType}
_SIZES = {s.value: s for s in SizeType}


def parse_capture[D: NamedDomain](raw: str, domains: Sequence[D]) -> ParsedCapture[D]:
    """Pull inline tokens out of ``raw``. Pure: no DB, no side effects."""
    result: ParsedCapture[D] = ParsedCapture(text="")
    kept: list[str] = []

    for token in raw.split():
        lower = token.lower()

        if token == "*":
            result.important = True
            continue
        if token == "!":
            result.urgent = True
            continue
        if token in ("*!", "!*"):
            result.important = True
            result.urgent = True
            continue

        if token.startswith(">") and lower[1:] in _BUCKETS:
            result.bucket = _BUCKETS[lower[1:]]
            continue

        if token.startswith("~") and len(token) == 2 and lower[1:] in _SIZES:
            result.size = _SIZES[lower[1:]]
            continue

        if token.startswith("#") and len(token) > 1 and result.domain is None:
            query = lower[1:]
            match = next((d for d in domains if d.name.lower().startswith(query)), None)
            if match is not None:
                result.domain = match
                continue

        kept.append(token)

    result.text = " ".join(kept).strip()
    return result
