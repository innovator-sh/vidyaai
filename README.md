# VidyaAI

An AI study companion that remembers what you struggle with. VidyaAI answers your doubts, keeps your
chat history, and learns from your past mistakes so that every new answer builds on what you already
know. Built for the **Morpheus 2026** hackathon.

## What it does

- **Chat with a tutor.** Pick a persona (study buddy, teacher or mentor) and get streaming answers.
  Every conversation is saved and shows up in your history.
- **Recursive memory.** After each answer, VidyaAI works out the root cause of your doubt and stores it.
  Related past doubts are retrieved (RAG) the next time you ask something similar.
- **Knowledge base.** Upload a PDF or an image, or add a web page by URL, then ask questions about it.
- **Study tools.** Generate quizzes, flowcharts and summary reports from any text. Read handwriting and
  maths from photos (OCR) and dictate questions by voice (speech-to-text).
- **Progress stats.** Study time by subject, weekly activity, quiz accuracy and streaks.
- **Multilingual UI.** English, Hindi and Marathi.

## Architecture

```
Browser (Next.js, Vercel)
  |- Firebase Auth (client SDK)  -> ID token
  '- HTTPS + SSE  ->  FastAPI backend (Docker, Cloud Run)
                        |- PostgreSQL (Neon): users, conversations, messages, documents, stats
                        |- Qdrant: vector memory + document chunks (always filtered per user)
                        |- Groq: chat, vision OCR, quiz / flowchart / report generation
                        '- Sarvam: speech-to-text, handwriting OCR
```

| Part | Stack |
| --- | --- |
| Frontend (`frontend/`) | Next.js (pages router), React, TypeScript, Tailwind, i18next, Vitest |
| Backend (`backend/`) | FastAPI, SQLAlchemy 2 (async), Alembic, Qdrant, FastEmbed (ONNX), pytest |
| Auth | Firebase Authentication (email/password and Google); the backend verifies every token |
| CI | GitHub Actions: lint, types, tests, build, Docker image scan, secret scan, dependency audit |

The backend is stateless, so it scales horizontally. Rate limits are per user and per IP and are stored
in Postgres, so they hold across instances. More detail is in [backend/README.md](backend/README.md).

## Prerequisites

- [Node.js](https://nodejs.org) 22+
- [Docker](https://www.docker.com/products/docker-desktop) with Compose (runs Postgres and Qdrant locally)
- A [Firebase](https://console.firebase.google.com) project with **Authentication** enabled
  (email/password, and Google if you want it)
- A [Groq](https://console.groq.com) API key
- Optional: a [Sarvam](https://www.sarvam.ai) API key, needed only for speech-to-text and handwriting OCR

## Run locally

### 1. Clone

```bash
git clone https://github.com/innovator-sh/vidyaai.git
cd vidyaai
```

### 2. Configure the backend

```bash
cp .env.example .env
```

Fill in `.env`:

| Variable | Where to get it |
| --- | --- |
| `GROQ_API_KEY` | Groq console |
| `SARVAM_API_KEY` | Sarvam dashboard (optional) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase console > Project settings > Service accounts > Generate new private key. Paste the whole JSON on **one line**. |

`DATABASE_URL` and `QDRANT_URL` are set for you by Docker Compose. Never commit `.env`; it is gitignored.

### 3. Start Postgres, Qdrant and the backend

```bash
docker compose up --build
```

This starts Postgres, Qdrant, runs the database migrations, and serves the API on
<http://localhost:8000>. Check it with `curl http://localhost:8000/healthz`.

### 4. Configure and start the frontend

In a second terminal:

```bash
cd frontend
cp .env.example .env.local
```

Fill in `.env.local` with the **web app** config from Firebase console > Project settings > Your apps:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

Then:

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>, register, verify your email (unverified accounts are rejected by the API),
and start chatting.

> `localhost` is authorised in Firebase by default. For a deployed site, add its domain under
> Authentication > Settings > Authorized domains.

### Running the backend without Docker

```bash
cd backend
python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install uv && uv sync --frozen --extra dev
export DATABASE_URL=sqlite+aiosqlite:///./dev.db      # or a Postgres URL
alembic upgrade head
uvicorn app.main:create_app --factory --reload
```

Without `QDRANT_URL`, an in-memory Qdrant is used, so memory and documents are lost on restart.

## Tests and checks

```bash
bash scripts/backend-check.sh        # ruff, format check, mypy, pytest
cd frontend && npm run typecheck && npm run lint && npm test
bash scripts/ci-local.sh             # everything above plus a production build
```

The test suites need no network or API keys: every external provider is faked.

## Deployment

- **Frontend:** import the repo in Vercel, set the root directory to `frontend` and the production
  branch to `main`, and add the `NEXT_PUBLIC_*` variables. Point `NEXT_PUBLIC_API_URL` at the backend.
- **Backend:** build `backend/Dockerfile` and deploy it to any container host (Cloud Run recommended).
  Use a managed Postgres (such as Neon, pooled connection string) and Qdrant Cloud, and run
  `alembic upgrade head` as a separate job. Set `ENV=prod`; the app refuses to start if a required secret
  is missing. Set `CORS_ORIGINS` to your Vercel URL(s). All variables are listed in
  [.env.example](.env.example).

## Security notes

- Secrets live only on the backend. The browser holds only the public Firebase config.
- Every `/v1` route verifies a Firebase ID token, and every query is filtered by the token's user.
- Uploads are type- and size-checked, and "add from URL" blocks private and internal addresses.
- Report vulnerabilities privately rather than in a public issue.

## Contributors

| Contributor | GitHub |
| --- | --- |
| innovator-sh | [github.com/innovator-sh](https://github.com/innovator-sh) |
| Dhruv | [github.com/Dhruv-Bhagchandani](https://github.com/Dhruv-Bhagchandani) |
| Manav | [github.com/jmanav](https://github.com/jmanav) |
| Shr1kantP | [github.com/Shr1kantP](https://github.com/Shr1kantP) |
