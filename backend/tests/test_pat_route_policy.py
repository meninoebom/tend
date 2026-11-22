"""Every route must declare whether a personal access token can reach it (#219).

Policy: a PAT can create, read, and modify. It cannot destroy, and it cannot
touch account, billing, token management, or paid-LLM routes.

A route missing from ``ROUTE_POLICY`` fails the test, so a new route cannot
ship without a decision. To change a route's PAT access, switch its auth
dependency (``get_user_id_allow_pat`` vs ``get_current_user_id``) and update
the table here.
"""

from fastapi.routing import APIRoute

from app.core.security import get_current_user_id, get_user_id_allow_pat
from app.main import app

PAT = "pat"  # get_user_id_allow_pat: PAT or proxy JWT
JWT = "jwt"  # get_current_user_id: proxy JWT only
PUBLIC = "public"  # no user auth dependency (signup, login, webhooks, health)

ROUTE_POLICY: dict[tuple[str, str], str] = {
    # tasks
    ("GET", "/tasks"): PAT,
    ("POST", "/tasks"): PAT,
    ("GET", "/tasks/{task_id}"): JWT,
    ("PATCH", "/tasks/reorder"): JWT,
    ("PATCH", "/tasks/{task_id}"): PAT,
    ("POST", "/tasks/{task_id}/priority"): JWT,
    ("POST", "/tasks/{task_id}/complete"): PAT,
    ("DELETE", "/tasks/{task_id}"): JWT,  # destroys
    ("POST", "/tasks/{task_id}/mit"): PAT,
    ("POST", "/tasks/{task_id}/placements"): PAT,
    # triage
    ("GET", "/triage"): PAT,
    ("GET", "/triage/briefing"): JWT,  # calls a paid LLM
    ("GET", "/triage/mit-suggestion"): JWT,
    ("POST", "/triage/{task_id}"): PAT,  # kill is a soft archive
    ("GET", "/triage/winddown"): JWT,
    # domains
    ("GET", "/domains"): PAT,
    ("POST", "/domains"): JWT,
    ("PATCH", "/domains/{domain_id}"): JWT,
    ("DELETE", "/domains/{domain_id}"): JWT,  # destroys
    # state
    ("GET", "/state"): PAT,
    # account
    ("POST", "/users"): PUBLIC,
    ("POST", "/users/oauth"): PUBLIC,
    ("POST", "/users/verify"): PUBLIC,
    ("POST", "/users/forgot-password"): PUBLIC,
    ("POST", "/users/reset-password"): PUBLIC,
    ("GET", "/me"): JWT,
    ("PATCH", "/me"): JWT,
    ("DELETE", "/me"): JWT,
    ("POST", "/feedback"): JWT,
    # billing
    ("POST", "/billing/checkout"): JWT,
    ("POST", "/billing/portal"): JWT,
    ("GET", "/billing/status"): JWT,
    ("POST", "/billing/webhook"): PUBLIC,
    # token management
    ("GET", "/api-tokens"): JWT,
    ("POST", "/api-tokens"): JWT,
    ("DELETE", "/api-tokens/{token_id}"): JWT,
    # infra
    ("GET", "/health"): PUBLIC,
}


def _dependency_calls(dependant):
    for sub in dependant.dependencies:
        yield sub.call
        yield from _dependency_calls(sub)


def _actual_policy(route: APIRoute) -> str:
    calls = set(_dependency_calls(route.dependant))
    if get_user_id_allow_pat in calls:
        return PAT
    if get_current_user_id in calls:
        return JWT
    return PUBLIC


def _api_routes():
    for route in app.routes:
        if isinstance(route, APIRoute):
            for method in route.methods:
                yield (method, route.path), route


def test_every_route_has_a_pat_decision():
    missing = sorted(key for key, _ in _api_routes() if key not in ROUTE_POLICY)
    assert not missing, (
        f"Routes with no PAT decision: {missing}. Add them to ROUTE_POLICY in "
        "tests/test_pat_route_policy.py."
    )


def test_route_auth_matches_policy():
    mismatches = []
    for key, route in _api_routes():
        expected = ROUTE_POLICY.get(key)
        actual = _actual_policy(route)
        if expected is not None and expected != actual:
            mismatches.append(f"{key}: expected {expected}, got {actual}")
    assert not mismatches, "\n".join(mismatches)


def test_policy_table_has_no_stale_entries():
    live = {key for key, _ in _api_routes()}
    stale = sorted(set(ROUTE_POLICY) - live)
    assert not stale, f"ROUTE_POLICY lists routes that no longer exist: {stale}"
