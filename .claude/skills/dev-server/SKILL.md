---
name: dev-server
description: Start or check the local development stack (Postgres, Redis, Mailpit, Grafana, Umami, Bull Board, RedisInsight, Drizzle Gateway, API on :3000, Vite on :5173) or the containerised release stack. Use when asked to run the app, start the dev server, or verify a change in the running app.
---

# Dev server

## Start

1. App: `pnpm dev` in the background (`run_in_background: true`). It first runs `docker compose --profile tools up -d` (Postgres, Redis, Mailpit plus the tool UIs), then runs the API (:3000), the worker (:3010, `/metrics` + probes only) and Vite (:5173) as host processes; logs are prefixed `[server]` / `[worker]` / `[client]`. Stopping the task can leave the `node --watch` children holding those ports; kill them by port if the next start reports EADDRINUSE.
2. Low on memory, or the tool UIs are not needed? `pnpm dev:core` starts only `db` / `redis` / `mailpit` plus the same three host processes. No Grafana and no Umami, so telemetry export and analytics fail and warn per event — harmless, but noisy in the logs.
3. First run only: `pnpm db:migrate` (optionally `pnpm db:seed` for `admin@example.com` / `admin-password-123`). Config comes from the committed `.env.development`; an optional `.env` overrides it, and shell variables override both. Never edit the user's `.env`.
4. If containers look wrong, check with `docker compose ps -a`: `db`, `redis`, `mailpit`, `umami` must be `healthy`, the other tools `running`, and the one-shots `umami-db-init` / `umami-seed` `exited (0)`.

## Verify

- `curl -s localhost:3000/healthz` -> `{"status":"ok",...}`; `curl -s localhost:3000/readyz` -> `{"status":"ready"}` (503 means DB/Redis unreachable).
- UI: http://localhost:5173 (Vite proxies `/api` and the WebSocket to :3000).
- API docs: http://localhost:3000/api/docs, spec at `/api/openapi.json`.
- Dev tools (only with `pnpm dev`, not `pnpm dev:core`):
  - Grafana (logs, traces, metrics): http://localhost:3001 — dashboards "web-app-template / App" and "/ Worker" (provisioned from `infrastructure/observability/grafana/dashboards/*.json`; edit the JSON, then `docker compose restart grafana`), or Explore with data source Loki, query `{service_name="web-app-template"}`.
  - Umami (analytics): http://localhost:3002 — admin / umami, website "web-app-template".
  - Bull Board (queues): http://localhost:3003.
  - RedisInsight (cache + queue keys): http://localhost:5540.
  - Drizzle Gateway (database): http://localhost:4983 — first run: add connection `postgres://app:app@db:5432/app`.
- Emails: http://localhost:8025 or `curl -s localhost:8025/api/v1/messages`.

## Release stack

Use it to verify a realistic deployment — `app` and `worker` as separate containers built from the Dockerfile's `prod` target, no bind mounts, migrations run first by a `stack-init` job.

1. Stop `pnpm dev` / `pnpm dev:core` first. Both stacks bind host ports 3000 and 3010, so they are mutually exclusive; running both gives a port-bind error.
2. `pnpm stack:up` — builds the image and starts the `tools` + `stack` profiles, waiting until the containers are healthy. It returns only once they are, so `curl -s localhost:3000/readyz` should answer `ready` immediately after; `docker compose ps -a` shows `app` and `worker` `healthy`/`running` and `stack-init` `exited (0)`.
3. The SPA is served from http://localhost:3000 (no Vite, no HMR); code changes need another `pnpm stack:up` to rebuild the image.
4. `pnpm stack:logs` follows the `app` and `worker` containers. `pnpm stack:down` stops the stack.

## Stop / troubleshoot

- Stop the app with the background task's kill; the containers keep running (`docker compose --profile tools stop` to stop them, `docker compose --profile tools down` to remove them).
- Port in use: `pnpm dev:server` / `pnpm dev:worker` / `pnpm dev:client` can be started separately; Vite uses `strictPort`.
- Config errors print a `ConfigError` listing every invalid env var; fix `.env` and restart.
- Server logs are single-line `HH:mm:ss LEVEL message key=value`; grep by `requestId=` to follow one request.
