"""HTTP client and credential resolution for the tend CLI."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

# The backend has no public domain of its own — every external request goes
# through the Next.js proxy, which forwards `tend_pat_` tokens to the backend
# verbatim. See frontend/src/app/api/[...proxy]/route.ts.
DEFAULT_API_URL = "https://tendyourgarden.app/api"
TOKEN_PREFIX = "tend_pat_"

NO_TOKEN_HELP = """No API token found.

Create one in Tend under Settings → API tokens, then either:
  tend login                       store it in {path}
  export TEND_TOKEN=tend_pat_...   set it for this shell

Point at a local backend with TEND_API_URL, e.g.
  export TEND_API_URL=http://localhost:8000"""


class TendError(Exception):
    """A problem worth showing the user verbatim, without a traceback."""


def config_path() -> Path:
    base = os.environ.get("XDG_CONFIG_HOME")
    root = Path(base) if base else Path.home() / ".config"
    return root / "tend" / "config.json"


def read_config() -> dict:
    path = config_path()
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise TendError(f"Could not read {path}: {exc}") from exc


def write_config(token: str, api_url: str) -> Path:
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"token": token, "api_url": api_url}, indent=2) + "\n")
    path.chmod(0o600)  # it holds a credential
    return path


def _error_message(response: httpx.Response) -> str:
    """Pull a human message out of a backend error response.

    AppError renders {"code", "message"}; FastAPI's own validation errors render
    {"detail": ...}. Fall back to the raw body so nothing is ever swallowed.
    """
    try:
        body = response.json()
    except ValueError:
        return f"HTTP {response.status_code}: {response.text.strip()[:200]}"

    if isinstance(body, dict):
        if "message" in body:
            return str(body["message"])
        if "detail" in body:
            detail = body["detail"]
            if isinstance(detail, list) and detail:
                first = detail[0]
                if isinstance(first, dict):
                    where = ".".join(str(p) for p in first.get("loc", [])[1:])
                    msg = first.get("msg", "invalid value")
                    return f"{where}: {msg}" if where else str(msg)
            return str(detail)
    return f"HTTP {response.status_code}: {json.dumps(body)[:200]}"


@dataclass
class TendClient:
    base_url: str
    token: str

    @classmethod
    def from_env(cls) -> TendClient:
        config = read_config()
        token = os.environ.get("TEND_TOKEN") or config.get("token")
        api_url = os.environ.get("TEND_API_URL") or config.get("api_url") or DEFAULT_API_URL
        if not token:
            raise TendError(NO_TOKEN_HELP.format(path=config_path()))
        return cls(base_url=api_url.rstrip("/"), token=token)

    def request(
        self,
        method: str,
        path: str,
        *,
        params: dict | None = None,
        json_body: Any = None,
    ) -> Any:
        url = f"{self.base_url}/{path.lstrip('/')}"
        try:
            response = httpx.request(
                method,
                url,
                params=params,
                json=json_body,
                headers={"Authorization": f"Bearer {self.token}"},
                timeout=20.0,
                follow_redirects=True,
            )
        except httpx.HTTPError as exc:
            raise TendError(f"Could not reach {self.base_url}: {exc}") from exc

        if response.status_code == 401:
            raise TendError(
                "Token rejected (401). It may have been revoked — check Settings → "
                "API tokens.\nNote that tokens deliberately cannot delete tasks or "
                "domains, or touch account settings."
            )
        if response.status_code >= 400:
            raise TendError(_error_message(response))
        if response.status_code == 204 or not response.content:
            return None
        return response.json()

    # Thin wrappers so command code reads as intent, not as HTTP.

    def domains(self) -> list[dict]:
        return self.request("GET", "/domains") or []

    def tasks(self, **filters: Any) -> list[dict]:
        params = {k: v for k, v in filters.items() if v is not None}
        return self.request("GET", "/tasks", params=params) or []

    def create_task(self, payload: dict) -> dict:
        return self.request("POST", "/tasks", json_body=payload)

    def complete_task(self, task_id: str) -> dict:
        return self.request("POST", f"/tasks/{task_id}/complete")

    def update_task(self, task_id: str, payload: dict) -> dict:
        return self.request("PATCH", f"/tasks/{task_id}", json_body=payload)

    def triage_queue(self) -> dict:
        return self.request("GET", "/triage")

    def triage(self, task_id: str, payload: dict) -> dict:
        return self.request("POST", f"/triage/{task_id}", json_body=payload)

    def state(self) -> dict:
        return self.request("GET", "/state")
