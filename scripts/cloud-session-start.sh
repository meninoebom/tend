#!/usr/bin/env bash
# Prepares an Anthropic cloud session (scheduled overnight runs, claude --cloud) to run
# Tend's checks. Exits immediately anywhere else, so it never touches a laptop.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

repo="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
db_url="postgresql://tend:tend@localhost:5432/tend_test"

export PATH="/opt/node20/bin:$PATH"

service postgresql start >/dev/null
for _ in $(seq 1 20); do pg_isready -q && break; sleep 1; done

su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='tend'\"" | grep -q 1 \
  || su postgres -c "psql -qc \"CREATE ROLE tend LOGIN SUPERUSER PASSWORD 'tend'\""
su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='tend_test'\"" | grep -q 1 \
  || su postgres -c "createdb -O tend tend_test"

(cd "$repo/backend" && uv sync --quiet && DATABASE_URL="$db_url" uv run alembic upgrade head >/dev/null)
(cd "$repo/frontend" && pnpm install --frozen-lockfile --silent)

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo "export PATH=\"/opt/node20/bin:\$PATH\""
    echo "export TEST_DATABASE_URL=\"$db_url\""
    echo "export DATABASE_URL=\"$db_url\""
  } >> "$CLAUDE_ENV_FILE"
fi

echo "cloud session ready: postgres up, tend_test migrated, deps installed (node $(node --version))"
