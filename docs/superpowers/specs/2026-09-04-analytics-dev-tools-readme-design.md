# Analytics, dev tooling containers and README overhaul — Design

Date: 2026-09-04
Status: approved

## Purpose

Three related changes to the template:

1. **Product analytics** on both sides of the app (UI events and server events), sent to an
   open-source tool the project can self-host. Umami is the default provider, behind a thin
   abstraction so the vendor is a one-file swap.
2. **Dev tooling containers** so that `docker compose up -d` brings up a UI for every system
   the app talks to: logs, metrics and traces (Grafana LGTM), analytics (Umami), queues
   (Bull Board), Redis (RedisInsight), the database (Drizzle Gateway) and email (Mailpit,
   already present). Bull Board moves out of the app into a container.
3. **README rewrite** in the shape of a real open-source project, with a link to the
   documentation of every tool. The "Decisions and alternatives" table and the "Not included"
   note go away. `LICENSE` (MIT) and a short `CONTRIBUTING.md` are added so the README's
   claims are true.

Out of scope: analytics dashboards or reports inside the app, consent banners (Umami is
cookie-less), feature flags, session replay, a second analytics provider implementation.

## 1. Analytics

### Backend

Umami (MIT, self-hosted first). Client events go through Umami's tracker script; server
events go through `@umami/node`, which posts to `POST {ANALYTICS_URL}/api/send`. Both sides
send the signed-in user's id as Umami's `id` (distinct id) so client and server events for
one user land in the same session.

### Configuration (server owns it)

Two optional env vars, validated in `src/server/core/config.ts` like everything else:

| Variable | Meaning |
| --- | --- |
| `ANALYTICS_URL` | Origin of the Umami instance, e.g. `http://localhost:3002`. |
| `ANALYTICS_WEBSITE_ID` | UUID of the Umami website. |

`Config.analytics` is `{ enabled, url, websiteId }`; `enabled` is true only when both are set.
Setting one without the other is a `ConfigError`.

The client does **not** read `VITE_*` variables for this. The Vite bundle is built once into
the Docker image, so analytics must be a runtime setting. The existing public `system`
tRPC router gains a `config` query returning
`{ analytics: { url, websiteId } | null }` (Zod schema in `src/shared/schemas/system.schema.ts`).
The client fetches it once at boot, next to the session request.

### Server API — `Analytics` global in `#core`

```ts
Analytics.track(name: string, props?: { userId?: string; [key: string]: Json })
```

- Fifth `#core` global next to `Config`, `Context`, `Logger`, `Metrics`, `Cache`.
- Provider chosen at creation: `umami` when `Config.analytics.enabled`, otherwise `noop`.
  Tests get `noop` automatically (no env), and unit tests of the Umami provider inject a
  fake `fetch`/client.
- **Fire-and-forget.** `track` returns `void`, never throws, never awaits network in the
  caller's path. Failures are logged once per call at `warn` under `module: "analytics"`,
  mirroring the cache's "an outage must never take the request down" rule.
- Payload built by the Umami provider: `hostname` = host of `Config.appUrl`,
  `url` = `Context.get("path")` when inside a request, otherwise `/server`,
  `name` = event name, `data` = props minus `userId`, `id` = `props.userId`,
  `User-Agent` = `${Config.appName}/${Config.appVersion}`.
- Event names are dot-separated `noun.verb_past` strings (`user.signed_up`,
  `task.created`). Umami rejects names starting with `= + - @`; the provider never produces
  those.
- A `Metrics` counter `analytics_events_total{result="sent"|"error"}` so the dashboard
  shows whether events are flowing.

### Server examples (two, per template convention)

- `user.signed_up` from the Better Auth `after` create-user hook in `src/server/auth/auth.ts`,
  next to the welcome-email enqueue.
- `task.created` and `task.completed` from `src/server/features/task/task.service.ts`
  (`completed` fires when `update` flips `completed` from false to true).

### Client API — `src/client/lib/analytics.client.ts`

```ts
analytics.init({ url, websiteId })   // loads {url}/script.js once, auto page views off
analytics.page()                     // page view for the current location
analytics.track(name, data?)
analytics.identify(userId | null)
```

- All functions are no-ops until `init` has run and the script has loaded; calls made
  before that are dropped, not queued.
- The script tag is created with `data-auto-track="false"` and `data-do-not-track="true"`
  (Umami honours the browser's Do Not Track setting).
- `src/client/providers/analytics.provider.tsx` (`AnalyticsProvider`):
  - queries `system.config` through tRPC/TanStack Query and calls `init` when analytics is
    configured;
  - subscribes to the router's `onResolved` event and calls `page()` on each navigation;
  - calls `identify(userId)` whenever the session user id changes (`null` on sign-out).
  It mounts inside `App` around `RouterWithAuth`.

### Client examples (two UI-only interactions the server never sees)

- `theme.changed` `{ theme }` from `ThemeProvider.setTheme`.
- `locale.changed` `{ locale }` from `IntlProvider.setLocale`.

### Content Security Policy

The SPA's CSP in `src/server/http/app.ts` adds the analytics origin to `scriptSrc` and
`connectSrc` when `Config.analytics.enabled`. In dev Vite serves the SPA without a CSP, so
this only matters for the production server.

### Tests

- `src/server/core/analytics.test.ts`: noop when unconfigured; Umami provider sends the
  documented payload shape and headers; a rejected send logs a warning and does not throw;
  metrics counter increments.
- `src/server/features/system/system.router.test.ts`: `config` returns `null` analytics
  when unconfigured and the pair when configured.
- `src/client/lib/analytics.client.test.ts`: functions are no-ops before init; after init a
  fake `window.umami` receives `track`/`identify` calls; script tag attributes.
- `src/client/providers/analytics.provider.test.tsx`: page view on navigation, identify on
  session change, no script when `system.config` says analytics is off (MSW/`trpcMock`).
- Existing task service and auth tests gain assertions that the events are emitted (via a
  spy on `Analytics.track`).

## 2. Dev tooling containers

All start with `docker compose up -d`. `docker compose up -d db redis mailpit` remains the
minimal set for low-memory machines and is documented. The `observability` profile and the
Jaeger service are removed; the `test` and `app` profiles are unchanged except where noted.

| Service | Image | Host port | Notes |
| --- | --- | --- | --- |
| `grafana` | `grafana/otel-lgtm` | 3001 (UI), 4317/4318 (OTLP) | Loki, Tempo, Prometheus and an OTel collector in one container. Anonymous admin login (image default). Data in a named volume. |
| `umami` | `ghcr.io/umami-software/umami:postgresql-latest` | 3002 | `DATABASE_URL=postgresql://app:app@db:5432/umami`, `APP_SECRET`, `DISABLE_TELEMETRY=1`, `DISABLE_BOT_CHECK=1` (server events carry a non-browser user agent). Login `admin` / `umami`. |
| `bull-board` | `ghcr.io/felixmosh/bull-board` | 3003 | `--redis redis://redis:6379 --prefix web-app-template:bull` (the app's BullMQ prefix is `${APP_NAME}:bull`). |
| `redisinsight` | `redis/redisinsight` | 5540 | `RI_REDIS_HOST=redis`, `RI_REDIS_ALIAS=web-app-template`, `RI_ACCEPT_TERMS_AND_CONDITIONS=true`. |
| `drizzle-gateway` | `ghcr.io/drizzle-team/gateway` | 4983 | No env-based connection config exists; the Postgres connection (`postgres://app:app@db:5432/app`) is added once in the UI and persisted in a named volume. `pnpm db:studio` stays as the CLI route. |

Two one-shot helper services keep it zero-friction:

- `umami-db-init` (`postgres:17-alpine`, `restart: "no"`): runs
  `psql` against `db` with `SELECT 'CREATE DATABASE umami' WHERE NOT EXISTS (...)\gexec`.
  Works for existing `db-data` volumes, unlike `docker-entrypoint-initdb.d`. `umami`
  depends on it with `condition: service_completed_successfully`.
- `umami-seed` (`curlimages/curl`, `restart: "no"`, depends on `umami` healthy): logs in
  with the default credentials and `POST /api/websites` with the fixed `id` `6ef283e9-def7-423a-9a9a-5682722e1daf`
  (`ANALYTICS_WEBSITE_ID` in `.env.example`), `name: web-app-template`,
  `domain: localhost`. A 400/409 because it already exists is treated as success. The
  script lives in `docker/umami/seed.sh`.

Telemetry wiring:

- `docker/otel-lgtm/prometheus.yaml` is mounted over `/otel-lgtm/prometheus.yaml` and adds a
  scrape job for `host.docker.internal:3000/metrics` (the app on the host) with
  `extra_hosts: host.docker.internal:host-gateway` so it also works on Linux. In the `app`
  profile the target is `app:3000`, expressed via a second scrape target.
- `.env.example` changes: `OTEL_SDK_DISABLED=false`, `OTEL_LOGS_EXPORTER=otlp`
  (pino records flow to Loki through `@opentelemetry/instrumentation-pino`; the SDK is
  already loaded by the start scripts), `OTEL_METRICS_EXPORTER=none` (Prometheus scrapes),
  `ANALYTICS_URL=http://localhost:3002`, `ANALYTICS_WEBSITE_ID=6ef283e9-def7-423a-9a9a-5682722e1daf`.
- `compose.yaml`'s `app` service gets the same variables pointed at service names.
- `.devcontainer/devcontainer.json` forwards 3001, 3002, 3003, 4983, 5540, 8025 with labels
  and adds the tool services to `runServices`.

## 3. App changes that follow

- Remove Bull Board from the app: `src/server/http/queue-board.ts`, the `mount` option and
  the `/admin/queues` admin-guard lines in `app.ts`, the `mountQueueBoard` call in
  `main.ts`, the Vite proxy entry, `@bull-board/api` and `@bull-board/hono` from
  `package.json`, and the e2e assertion that `/admin/queues` returns 403 (the `/admin`
  redirect assertion stays). The `mount` option of `createApp` has no other user and is
  removed.
- `QueueStats` keeps the tRPC-backed counts and drops the link to `/admin/queues`. The
  `admin.queues` message id is removed from both locales (`pnpm i18n:check` enforces it).
- `adminGuard` middleware stays; it is still the pattern for guarding server-rendered
  admin paths and has its own tests.
- `CLAUDE.md`: add the analytics convention line ("Analytics: `Analytics.track(name, props)`
  from services / `analytics.track` from components; names `noun.verb_past`; never awaited,
  never in tests") and the new dev URLs.
- `.claude/skills/dev-server/SKILL.md` and `check-email/SKILL.md`: new URLs and a "Dev tools"
  list; the queue check now points at http://localhost:3003.

## 4. README

Structure (top to bottom):

1. Title, one-paragraph pitch, badges: CI workflow status, latest GitHub release, license.
2. **Features** — three short tables (Server, Client, Tooling); every entry links to the
   tool's documentation.
3. **Quick start** — prerequisites (Node 24+, pnpm 11, Docker), the five commands, and a
   "What's running" table: every URL the dev stack exposes with the tool's doc link
   (app, API docs, Grafana, Umami, Bull Board, RedisInsight, Drizzle Gateway, Mailpit,
   Storybook). Seed credentials.
4. **Scripts** — the existing table, tidied.
5. **Project layout** — the tree, trimmed to one line per directory.
6. **How it fits together** — request lifecycle, globals, auth, tRPC/REST/OpenAPI,
   WebSockets, caching, jobs, email, analytics, observability, health and shutdown. Each
   bullet links to the library it relies on.
7. **Configuration** — table of every env var group with defaults, pointing at
   `.env.example`.
8. **Testing** and **Deploying** — existing content, tightened, with links (PGlite, MSW,
   Playwright, semantic-release, GHCR).
9. **Working with AI agents** — the `.claude/skills` list in one table.
10. **Contributing** (links to `CONTRIBUTING.md`) and **License**.

Removed: "Decisions and alternatives", "Not included (deliberately)". The 2026-09-03 design
spec in `docs/` is left as is.

`CONTRIBUTING.md`: prerequisites, `pnpm check` before pushing, Conventional Commits,
TDD expectation, where tests live, how to add a job / env var / migration (pointing at the
skills). `LICENSE`: MIT, "Copyright (c) 2026 Luke Bayliss".

## Error handling summary

- Analytics never affects a request or job outcome: errors are logged and counted.
- Missing tool containers never break `pnpm dev`: the OTel exporters fail quietly (default
  diag level) and the analytics provider logs a warning per failed send.
- Config is the only place that can refuse to start (`ANALYTICS_*` set as a half pair).

## Verification

- `pnpm check` (lint, typecheck, i18n, unit tests, knip) passes; knip must not report the
  removed Bull Board packages or the new `@umami/node` as unused.
- `docker compose up -d` on a clean machine and on a machine with an existing `db-data`
  volume both reach healthy; Umami shows the seeded website; Grafana Explore shows app logs
  and the `http_requests_total` metric; Bull Board lists the app queue.
- Signing up in the dev app produces `user.signed_up` in Umami and a page view from the
  client; toggling the theme produces `theme.changed`.
- `pnpm test:e2e` passes with the queue assertion removed.
