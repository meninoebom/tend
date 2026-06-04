#!/usr/bin/env bash
# Auto-fix ESLint on staged frontend files. Invoked by lint-staged with
# repo-root-relative paths. No-ops (exit 0) if frontend deps aren't installed so
# it never blocks a commit for someone who hasn't run the frontend setup.
set -euo pipefail

if [ ! -x frontend/node_modules/.bin/eslint ]; then
  echo "⚠ eslint not installed — run (cd frontend && npm ci). Skipping JS/TS lint." >&2
  exit 0
fi

# Run from frontend/ so the flat config (frontend/eslint.config.mjs) resolves.
rel=()
for f in "$@"; do rel+=("${f#frontend/}"); done
( cd frontend && node_modules/.bin/eslint --fix "${rel[@]}" )
