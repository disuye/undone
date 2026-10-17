#!/usr/bin/env bash
# Start the local Wagtail dev server: http://localhost:8000 (admin at /admin/)
set -euo pipefail

CMS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../cms" && pwd)"
PY="$CMS/.venv/bin/python"
PG_SERVICE="postgresql@17"
PG_BIN="/opt/homebrew/opt/$PG_SERVICE/bin"
PORT="${1:-8000}"

[[ -x "$PY" ]] || { echo "No venv at $CMS/.venv — see cms/README.md (Setup)."; exit 1; }
[[ -f "$CMS/.env" ]] || { echo "No $CMS/.env — copy .env.example and fill it in."; exit 1; }

if ! "$PG_BIN/pg_isready" -q; then
  echo "Starting PostgreSQL ($PG_SERVICE)…"
  brew services start "$PG_SERVICE"
  until "$PG_BIN/pg_isready" -q; do sleep 1; done
fi

cd "$CMS"
if ! "$PY" manage.py migrate --check >/dev/null 2>&1; then
  echo "Unapplied migrations — run: cd cms && .venv/bin/python manage.py migrate"
fi

exec "$PY" manage.py runserver "$PORT"
