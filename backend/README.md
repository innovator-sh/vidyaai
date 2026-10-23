# VidyaAI backend

FastAPI + PostgreSQL (SQLAlchemy 2 async, Alembic) + Qdrant + Groq/Sarvam. Stateless: all state lives
in Postgres and Qdrant, so any number of instances can run (Cloud Run, scale-to-zero safe).
Contract: `.dev/specs/api-contract.md`; security rules: `.dev/specs/security-and-scale.md`.

## Layout

```
app/
  main.py            app factory:  uvicorn app.main:create_app --factory
  config.py          pydantic-settings (fails fast in ENV=prod when secrets are missing)
  deps.py            DB session, get_current_user (Firebase), rate_limit dependencies
  middleware.py      request-id + security headers + JSON access log, body-size limit
  db/                models (portable UUID/JSON types), engine (Neon URL normalisation)
  repositories/      every query filtered by user_id (foreign ids => 404)
  vector/store.py    the ONLY Qdrant caller; always injects the user_id filter
  vector/embeddings  FastEmbed ONNX bge-small-en-v1.5 (384-d), no torch
  providers/         llm (Groq + circuit breaker), ocr (Sarvam / Groq vision), stt (Sarvam)
  services/          chat (SSE), memory (RAG + background updates), ingest, generate, ratelimit
  routers/           ops, me, conversations, chat, documents, tools, stats
alembic/             migrations (run as a separate job, never at app start)
tests/               pytest; every external provider is faked, no network
```

## Run locally

```bash
cp ../.env.example ../.env            # fill GROQ_API_KEY, FIREBASE_SERVICE_ACCOUNT_JSON, ...
docker compose -f ../docker-compose.yml up --build     # postgres + qdrant + migrate + backend :8000
```

Without Docker: `python -m venv .venv && pip install uv && uv sync --frozen --extra dev`, set `DATABASE_URL`
(`sqlite+aiosqlite:///./dev.db` works for dev; `alembic upgrade head` creates the schema) and
`uvicorn app.main:create_app --factory --reload`. Without `QDRANT_URL` an in-memory Qdrant is used
(not persisted).

## Quality gate

```bash
../scripts/backend-check.sh     # ruff check, ruff format --check, mypy app, pytest
```

Tests use SQLite by default. Set `TEST_DATABASE_URL=postgresql+asyncpg://...` to run them on
Postgres. `tests/test_units.py::test_alembic_migration_matches_models` guarantees the migration and
ORM models stay in sync (`alembic check`).

## Migrations / deploy

```bash
alembic upgrade head              # separate job, same image: docker run --rm IMAGE alembic upgrade head
```

Image: multi-stage, non-root, embedding model baked in (`FASTEMBED_CACHE_PATH=/opt/models`), listens
on `$PORT`, healthcheck on `/healthz`. Cloud Run: set `--concurrency 40-80`, `--max-instances` cap,
startup probe `/readyz`, secrets from Secret Manager (names in `../.env.example`).

## Behaviour notes

- Auth: `Authorization: Bearer <Firebase ID token>` verified on every `/v1` route; unverified e-mail
  tokens are rejected (`REQUIRE_VERIFIED_EMAIL`). The user id always comes from the token.
- Chat (`POST /v1/chat`, SSE): user message is committed first; replaying a `message_id` never
  duplicates it (and returns the stored answer if one exists). Retrieved document/memory text is wrapped
  in `<untrusted_context>` tags and the system prompt tells the model it is data, not instructions.
  Memory + root-cause analysis run as a background task after the stream.
- Limits: DB-backed fixed-window counters (`usage_counters`) work across instances: chat 20/min,
  upload 5/min, OCR+STT 10/min, generate 10/min, plus a daily quota; `429` + `Retry-After`.
- Documents: PDF/PNG/JPEG only, <= 10 MB, MIME + magic-byte check, processed in memory, ingested in a
  BackgroundTask; `status` = processing | ready | failed (a queue can replace the task later).
- Account deletion removes Qdrant points, Postgres rows (cascade) and the Firebase user.
- Logs are JSON, carry `request_id`/`user_id` only, never e-mail or message bodies.
