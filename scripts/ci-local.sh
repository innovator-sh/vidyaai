#!/usr/bin/env bash
# Runs the same gates as .github/workflows/ci.yml (minus docker/trivy). Used by the pre-push hook.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> gitleaks (working tree)"
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks detect --source . --no-banner --redact
else
  echo "gitleaks not installed, skipping"
fi

bash scripts/backend-check.sh

echo "==> frontend"
cd frontend
npm run typecheck
npm run lint
npm test
NEXT_PUBLIC_API_URL=https://api.example.com NEXT_PUBLIC_FIREBASE_API_KEY=ci NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=ci.firebaseapp.com \
  NEXT_PUBLIC_FIREBASE_PROJECT_ID=ci NEXT_PUBLIC_FIREBASE_APP_ID=ci npm run build
echo "ci-local: all green"
