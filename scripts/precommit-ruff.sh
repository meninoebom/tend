#!/usr/bin/env bash
# Auto-fix Ruff (lint + format) on staged backend files. Invoked by lint-staged
# with repo-root-relative paths. No-ops (exit 0) if the backend venv isn't set
# up so it never blocks a commit for someone who hasn't run the backend setup.
set -euo pipefail

if [ ! -x backend/.venv/bin/ruff ]; then
  echo "⚠ ruff not installed — run (cd backend && uv sync). Skipping Python checks." >&2
  exit 0
fi

rel=()
for f in "$@"; do rel+=("${f#backend/}"); done
( cd backend && .venv/bin/ruff check --fix "${rel[@]}" && .venv/bin/ruff format "${rel[@]}" )
