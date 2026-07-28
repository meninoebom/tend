"""Inline capture grammar, ported from frontend/src/lib/parse-capture.ts.

Deliberately a line-by-line port rather than a reimplementation: the web app and
the CLI must agree on what `buy milk #health !! >soon ~s` means. tests/test_grammar.py
mirrors the frontend's cases, so a change on either side that isn't mirrored here
shows up as a test failure rather than as two clients that quietly disagree.

Parsing happens client-side, as it does in the browser. It is an input
affordance, not a security boundary — whatever it produces still goes through the
API's own validation (bucket enum, domain ownership, field limits).
"""

from __future__ import annotations

from dataclasses import dataclass

BUCKET_WORDS = ("today", "soon", "later", "someday")
SIZE_LETTERS = ("s", "m", "l")


@dataclass
class ParsedCapture:
    text: str = ""
    domain_id: str | None = None
    important: bool = False
    urgent: bool = False
    bucket: str | None = None
    size: str | None = None


def parse_capture(raw: str, domains: list[dict]) -> ParsedCapture:
    """Pull inline tokens out of a task string.

        #health       domain, prefix-matched against the user's domain names
        !             important
        !!            important + urgent
        u! / !u       urgent
        >today|soon|later|someday    bucket
        ~s | ~m | ~l  size

    Recognized tokens are stripped from the returned text. Unrecognized ones
    (a `#tag` matching no domain, a `>nonsense`) are left in the text verbatim.
    """
    result = ParsedCapture()
    kept: list[str] = []

    for token in raw.split():
        lower = token.lower()

        if token == "!":
            result.important = True
            continue
        if token == "!!":
            result.important = True
            result.urgent = True
            continue
        if token in ("u!", "!u"):
            result.urgent = True
            continue

        if token.startswith(">") and lower[1:] in BUCKET_WORDS:
            result.bucket = lower[1:]
            continue

        if token.startswith("~") and len(token) == 2 and lower[1:] in SIZE_LETTERS:
            result.size = lower[1:]
            continue

        # Binds once — a second #tag is left in the text.
        if token.startswith("#") and len(token) > 1 and result.domain_id is None:
            query = lower[1:]
            match = next((d for d in domains if str(d["name"]).lower().startswith(query)), None)
            if match is not None:
                result.domain_id = match["id"]
                continue

        kept.append(token)

    result.text = " ".join(kept).strip()
    return result
