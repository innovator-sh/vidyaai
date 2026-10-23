#!/usr/bin/env bash
# Backend quality gate (used by CI): lint, format check, types, tests.
set -euo pipefail
cd "$(dirname "$0")/../backend"

if [ -x ".venv/bin/python" ]; then PY=".venv/bin/python"
elif [ -x ".venv/Scripts/python.exe" ]; then PY=".venv/Scripts/python.exe"
else PY="python"; fi

echo "==> ruff check";        "$PY" -m ruff check .
echo "==> ruff format --check"; "$PY" -m ruff format --check .
echo "==> mypy app";          "$PY" -m mypy app
echo "==> pytest";            ENV=test "$PY" -m pytest
echo "backend-check: all green"
