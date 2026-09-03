---
name: dev-server
description: Start or check the local development stack (Postgres, Redis, Mailpit, API on :3000, Vite on :5173). Use when asked to run the app, start the dev server, or verify a change in the running app.
---

# Dev server

## Start

1. Infrastructure (idempotent): `docker compose up -d` then `docker compose ps` — all three services must be `healthy`.
2. First run only: `cp .env.example .env` and `pnpm db:migrate` (optionally `pnpm db:seed` for `admin@example.com` / `admin-password-123`).
3. App: `pnpm dev` in the background (`run_in_background: true`). It runs the API (`tsx watch`, :3000) and Vite (:5173) together; logs are prefixed `[server]` / `[client]`.

## Verify

- `curl -s localhost:3000/healthz` -> `{"status":"ok",...}`; `curl -s localhost:3000/readyz` -> `{"status":"ready"}` (503 means DB/Redis unreachable).
- UI: http://localhost:5173 (Vite proxies `/api` and the WebSocket to :3000).
- API docs: http://localhost:3000/api/docs, spec at `/api/openapi.json`.
- Queue dashboard (admin session required): http://localhost:5173/admin/queues.
- Emails: http://localhost:8025 or `curl -s localhost:8025/api/v1/messages`.

## Stop / troubleshoot

- Stop the app with the background task's kill; infrastructure keeps running (`docker compose stop` to stop it).
- Port in use: `pnpm dev:server` / `pnpm dev:client` can be started separately; Vite uses `strictPort`.
- Config errors print a `ConfigError` listing every invalid env var; fix `.env` and restart.
- Server logs are single-line `HH:mm:ss LEVEL message key=value`; grep by `requestId=` to follow one request.
