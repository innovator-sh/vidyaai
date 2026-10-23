# VidyaAI frontend

Next.js (pages router) client for the VidyaAI `/v1` API. Auth is Firebase Auth; every API call carries the Firebase ID token as a Bearer token. The browser holds no LLM/OCR/STT keys.

## Setup

```bash
cp .env.example .env.local   # fill in NEXT_PUBLIC_API_URL and NEXT_PUBLIC_FIREBASE_*
npm ci
npm run dev                  # http://localhost:3000
```

## Scripts

| Command             | What it does                  |
| ------------------- | ----------------------------- |
| `npm run dev`       | Dev server                    |
| `npm run build`     | Production build              |
| `npm run typecheck` | `tsc --noEmit`                |
| `npm run lint`      | ESLint                        |
| `npm test`          | Vitest (jsdom), single run    |

## Deploying to Vercel

Set these environment variables (all public, no secrets): `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`. The CSP in `next.config.ts` is derived from `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` at build time. Add the Vercel domain to Firebase Auth "Authorized domains" and to the backend CORS allow-list.

## Layout

- `src/lib/apiClient.ts` - typed `/v1` client (auth header, 401 refresh, error envelope, SSE chat)
- `src/lib/firebase.ts` - Firebase init (no-op when config is absent, so builds work without env)
- `src/contexts/AuthContext.tsx` - auth state and actions
