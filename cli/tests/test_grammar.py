"""Grammar parity with frontend/src/lib/parse-capture.ts.

If you change the grammar on either side, change it here too. These cases exist
to make a silent divergence between the web app and the CLI impossible.
"""

from tend_cli.grammar import parse_capture

DOMAINS = [
    {"id": "d-work", "name": "Work"},
    {"id": "d-health", "name": "Health"},
    {"id": "d-home", "name": "Home"},
]


def test_plain_text_is_untouched():
    r = parse_capture("call the dentist", DOMAINS)
    assert r.text == "call the dentist"
    assert r.domain_id is None
    assert (r.important, r.urgent) == (False, False)
    assert r.bucket is None and r.size is None


def test_important_and_urgent():
    assert parse_capture("x !", DOMAINS).important is True
    assert parse_capture("x !!", DOMAINS).important is True
    assert parse_capture("x !!", DOMAINS).urgent is True

    for token in ("u!", "!u"):
        r = parse_capture(f"x {token}", DOMAINS)
        assert r.urgent is True
        assert r.important is False, f"{token} sets urgent only"


def test_bucket_and_size():
    r = parse_capture("ship it >soon ~l", DOMAINS)
    assert (r.text, r.bucket, r.size) == ("ship it", "soon", "l")


def test_domain_prefix_match_is_case_insensitive():
    r = parse_capture("run 5k #hea", DOMAINS)
    assert (r.text, r.domain_id) == ("run 5k", "d-health")
    assert parse_capture("run 5k #HEALTH", DOMAINS).domain_id == "d-health"


def test_domain_binds_only_once():
    # "Home" would match #hom, but the domain slot is already taken by #work.
    r = parse_capture("tidy #work #hom", DOMAINS)
    assert r.domain_id == "d-work"
    assert r.text == "tidy #hom"


def test_unrecognized_tokens_stay_in_the_text():
    r = parse_capture("read #nonsense >nowhere ~xl about it", DOMAINS)
    assert r.text == "read #nonsense >nowhere ~xl about it"
    assert r.domain_id is None
    assert r.bucket is None
    assert r.size is None


def test_size_must_be_a_single_letter():
    # `~m` is a size; `~md` is not, so it survives into the text.
    assert parse_capture("x ~m", DOMAINS).size == "m"
    r = parse_capture("x ~md", DOMAINS)
    assert r.size is None
    assert r.text == "x ~md"


def test_everything_at_once():
    r = parse_capture("  file the #work brief !! >today ~s  ", DOMAINS)
    assert r.text == "file the brief"
    assert r.domain_id == "d-work"
    assert (r.important, r.urgent) == (True, True)
    assert (r.bucket, r.size) == ("today", "s")


def test_bare_hash_is_not_a_domain():
    r = parse_capture("count the # of items", DOMAINS)
    assert r.text == "count the # of items"
    assert r.domain_id is None


def test_no_domains_configured():
    r = parse_capture("buy milk #health", [])
    assert r.text == "buy milk #health"
    assert r.domain_id is None
