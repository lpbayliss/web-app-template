# web-app-template

A production-grade, single-package template for full-stack TypeScript apps. Batteries are included: HTTP and WebSocket APIs, a database with migrations, auth, background jobs, caching, email, analytics and observability are all wired, tested and documented. Every pattern appears at least twice, so the second example shows the convention rather than the exception. Conventions live in `CLAUDE.md` and the project skills in `.claude/skills/`, which makes the repo easy for AI agents to work in.

[![CI](https://github.com/lpbayliss/web-app-template/actions/workflows/ci.yml/badge.svg)](https://github.com/lpbayliss/web-app-template/actions/workflows/ci.yml) [![Release](https://img.shields.io/github/v/release/lpbayliss/web-app-template)](https://github.com/lpbayliss/web-app-template/releases) [![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Features

### Server

| Area | Tool | Notes |
| --- | --- | --- |
| HTTP | [Hono](https://hono.dev/docs) on [@hono/node-server](https://github.com/honojs/node-server) | Security headers, CORS, CSRF, body limit, timeout, gzip, request ids |
| API | [tRPC 11](https://trpc.io/docs) | Typed over HTTP plus [WebSocket subscriptions](https://trpc.io/docs/server/subscriptions); REST and OpenAPI from the same routers via [trpc-to-openapi](https://github.com/mcampa/trpc-to-openapi), docs rendered by [Scalar](https://guides.scalar.com/scalar/scalar-api-references/integrations/hono) |
| Database | [Postgres 17](https://www.postgresql.org/docs/17/) with [Drizzle ORM](https://orm.drizzle.team/docs/overview) | Typed schema and SQL, versioned [drizzle-kit migrations](https://orm.drizzle.team/docs/migrations) |
| Auth | [Better Auth](https://www.better-auth.com/docs/introduction) | Email and password, cookie sessions, roles via the [admin plugin](https://www.better-auth.com/docs/plugins/admin) |
| Jobs | [BullMQ](https://docs.bullmq.io/) on [Redis](https://redis.io/docs/latest/) | Typed job definitions, repeatable schedules, worker runs inline in dev |
| Cache | Redis via [ioredis](https://github.com/redis/ioredis) | Response cache, opt in per procedure, in-memory store in tests |
| Email | [react-email](https://react.email/docs) templates | [Resend](https://resend.com/docs) or SMTP ([Nodemailer](https://nodemailer.com/)); [Mailpit](https://mailpit.axllent.org/docs/) catches everything locally |
| Analytics | [Umami](https://umami.is/docs) | Self-hosted and cookie-less, events sent from both the browser and the server |
| Observability | [pino](https://getpino.io/#/) logs | [Prometheus](https://prometheus.io/docs/introduction/overview/) metrics via [@prometheus-io/client](https://github.com/prometheus-io/client_node), [OpenTelemetry](https://opentelemetry.io/docs/languages/js/) traces and logs with no instrumentation code |
| Validation | [Zod 4](https://zod.dev/) | One schema per contract, shared by forms, tRPC input/output and OpenAPI |

### Client

| Area | Tool | Notes |
| --- | --- | --- |
| UI | [React 19](https://react.dev/reference/react) on [Vite 8](https://vite.dev/guide/) | Single-page app; the dev server proxies the API and the WebSocket |
| Routing | [TanStack Router](https://tanstack.com/router/latest/docs/framework/react/overview) | Code-based routes, so route files follow the same naming convention as everything else |
| Data | [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview) | Wired to the tRPC client, typed end to end |
| Styling | [Tailwind 4](https://tailwindcss.com/docs) | Variants with tailwind-variants, animation with [motion](https://motion.dev/docs/react) |
| Forms | [react-hook-form](https://react-hook-form.com/get-started) with [Zod](https://zod.dev/) | The server's schemas validate the form |
| i18n | [react-intl](https://formatjs.github.io/docs/react-intl/) | English and German; `pnpm i18n:check` keeps the catalogues in sync |
| Components | [Storybook](https://storybook.js.org/docs) | Stories colocated with the components, a11y addon enabled |

### Tooling

| Area | Tool | Notes |
| --- | --- | --- |
| Language | [TypeScript 7](https://www.typescriptlang.org/docs/) | Strict, project references, `#`-prefixed subpath imports |
| Packages | [pnpm 11](https://pnpm.io/motivation) | Version pinned by `packageManager`, minimum release age and a build allow-list |
| Lint and format | [Biome](https://biomejs.dev/guides/getting-started/) | One tool for both; `pnpm lint:fix` writes the fixes |
| Tests | [Vitest](https://vitest.dev/guide/) | Server tests on [PGlite](https://pglite.dev/docs/), client tests on [MSW](https://mswjs.io/docs) |
| End to end | [Playwright](https://playwright.dev/docs/intro) | Runs against the production build |
| Git hooks | [lefthook](https://lefthook.dev/) with [commitlint](https://commitlint.js.org/) | Pre-push checks, Conventional Commits enforced |
| Releases | [semantic-release](https://semantic-release.gitbook.io/semantic-release/) | Version, changelog, GitHub release and container image |
| Dependencies | [Renovate](https://docs.renovatebot.com/) | Grouped updates with the same release-age delay as pnpm |
| Dead code | [knip](https://knip.dev/) | Unused files, exports and dependencies fail CI |
| Containers | multi-stage [Docker](https://docs.docker.com/build/building/multi-stage/) and a [devcontainer](https://containers.dev/) | Non-root runtime image, the same stack in VS Code |
| CI | [GitHub Actions](https://docs.github.com/en/actions) | Quality, tests, e2e, release and image publish |

## Quick start

Prerequisites: Node 24 or newer, pnpm 11 (the repo pins its own version), Docker.

```bash
pnpm install
cp .env.example .env
docker compose up -d      # data services + dev tool UIs (see below)
pnpm db:migrate
pnpm db:seed              # admin@example.com / admin-password-123, user@example.com / user-password-123
pnpm dev                  # API :3000 + Vite :5173
```

### What's running

| URL | What | Docs |
| --- | --- | --- |
| http://localhost:5173 | The app. Vite dev server, proxies `/api` to :3000 | [Vite](https://vite.dev/config/server-options) |
| http://localhost:3000/api/docs | API reference generated from the routers (OpenAPI) | [Scalar](https://guides.scalar.com/scalar/scalar-api-references/getting-started) |
| http://localhost:3001 | Grafana: logs (Loki), traces (Tempo), metrics (Prometheus) | [grafana/otel-lgtm](https://github.com/grafana/docker-otel-lgtm) |
| http://localhost:3002 | Umami analytics, sign in with `admin` / `umami` | [Umami](https://umami.is/docs) |
| http://localhost:3003 | Bull Board: queues, jobs and failures | [Bull Board](https://github.com/felixmosh/bull-board) |
| http://localhost:5540 | RedisInsight: cache and queue keys | [RedisInsight](https://redis.io/docs/latest/develop/tools/insight/) |
| http://localhost:4983 | Drizzle Gateway: browse and edit tables. Add the connection `postgres://app:app@db:5432/app` once | [Drizzle Gateway](https://gateway.drizzle.team/docs/docker) |
| http://localhost:8025 | Mailpit: every email the app sends, with a REST API for tests | [Mailpit](https://mailpit.axllent.org/docs/) |
| http://localhost:6006 | Storybook, started separately with `pnpm storybook` | [Storybook](https://storybook.js.org/docs) |

Short on memory? `docker compose up -d db redis mailpit` starts only what the app itself needs, though analytics and telemetry then log a warning per event unless you clear `ANALYTICS_URL`/`ANALYTICS_WEBSITE_ID` and set `OTEL_SDK_DISABLED=true`. Prefer containers? `docker compose --profile app up` runs the app too, and `.devcontainer/` opens the same stack in VS Code.

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` / `dev:server` / `dev:client` / `dev:worker` | Development servers (the worker runs inline in the web process unless `JOBS_INLINE=false`) |
| `pnpm check` | `lint` + `typecheck` + `i18n:check` + `test` + `knip` (what CI runs) |
| `pnpm test`, `test:watch`, `test:coverage` | Vitest projects `server`, `shared`, `client`; coverage thresholds enforced |
| `pnpm test:e2e` | Playwright against the production build (`docker compose --profile test up -d` first) |
| `pnpm build`, `pnpm start`, `start:worker` | Vite client build + tsdown server bundle; run the web or worker process |
| `pnpm db:generate`, `db:migrate`, `db:reset`, `db:seed` | Drizzle migrations and dev data |
| `pnpm db:studio` | Drizzle Studio from the CLI (the Drizzle Gateway container is the browser alternative) |
| `pnpm i18n:check` | Verify every message id used in the client exists in every locale (and none are orphaned) |
| `pnpm storybook`, `storybook:build` | Component workshop |
| `pnpm audit` | `pnpm audit --prod --audit-level=high` |

## Project layout

```
src/
  client/            React SPA
    components/      *.component.tsx (+ .stories.tsx, .test.tsx)
    features/<f>/    *.component.tsx, use-*.hook.ts, tests
    i18n/            en.messages.json, de.messages.json, intl.provider.tsx
    lib/             trpc.client.ts, auth.client.ts, query.client.ts, analytics.client.ts
    providers/       *.provider.tsx
    routes/          *.route.tsx (code-based TanStack Router), app.router.ts
  server/
    core/            Analytics, Config, Context, Logger, Metrics, Cache, errors, shutdown  (import from "#core")
    auth/            Better Auth instance
    db/              client, schema, tables/*.table.ts, migrations/, migrate/reset/seed entrypoints
    email/           email.service.ts, providers/*.provider.ts, templates/*.email.tsx
    features/<f>/    *.router.ts (tRPC), *.service.ts, *.repository.ts, tests
    http/            app.ts (Hono), middleware/*.middleware.ts, routes/*.route.ts, openapi.ts
    jobs/            job.ts, queue.ts, worker.ts, definitions/*.job.ts, jobs.registry.ts
    trpc/            trpc.ts (procedures), context.ts, cache.middleware.ts, app.router.ts
    ws/              ws.server.ts
    infra/           redis.ts
    bootstrap.ts, main.ts, worker.main.ts
  shared/schemas/    Zod schemas used by both sides (*.schema.ts)
  test/              harnesses: PGlite db, full app caller, RTL render helpers, MSW
docker/              compose helper files: Prometheus scrape config, Umami init scripts
e2e/                 Playwright specs (*.e2e.ts) + fixtures (Mailpit client)
.claude/skills/      project skills for agents (dev server, tests, coverage, migrations, lint, email, release)
```

File names follow `kebab-name.type.ext`. See `CLAUDE.md` for the short list of conventions.

## How it fits together

- **Request lifecycle**: request id, then `Context.run` (AsyncLocalStorage), then security headers, CORS, CSRF, body limit, timeout and gzip, then routes, SPA fallback and the error handler. Every log line inside a request carries `requestId`, `method`, `path` and `userId` automatically.
- **Globals** (`#core`): `Config` (Zod-validated env, fails fast with a readable list), `Context` (`set`, `get`, `snapshot`), `Logger` ([pino](https://getpino.io/#/): JSON in production, single-line `key=value` in dev, trace ids injected by OpenTelemetry), `Metrics` ([Prometheus](https://prometheus.io/docs/introduction/overview/) at `/metrics`, optional bearer token), `Cache` (Redis, in-memory in tests) and `Analytics`.
- **Auth**: [Better Auth](https://www.better-auth.com/docs/introduction) at `/api/auth/*` with cookie sessions and the [admin plugin](https://www.better-auth.com/docs/plugins/admin). `ADMIN_EMAILS` promotes sign-ups to admins. tRPC exposes `publicProcedure`, `protectedProcedure` and `adminProcedure`.
- **tRPC, REST and docs**: routers declare `meta.openapi`, so `/api/trpc` (typed client), `/api/v1/*` (REST via [trpc-to-openapi](https://github.com/mcampa/trpc-to-openapi)), `/api/openapi.json` and `/api/docs` ([Scalar](https://guides.scalar.com/scalar/scalar-api-references/integrations/hono)) all come from one definition.
- **WebSockets**: `activity.onEvent` streams the user's task events over `/api/ws` using [tRPC subscriptions](https://trpc.io/docs/server/subscriptions) (`wsLink`, lazy connection, keep-alive, reconnect on deploy).
- **Caching**: add `.use(cached({ ttlSeconds, scope: "user" | "global" }))` to a query; `Cache-Control: no-cache` from the client bypasses reads; the mutating service calls `Cache.invalidate(cachePrefix(...))`. `CACHE_ENABLED=false` turns it off globally. Backed by Redis through [ioredis](https://github.com/redis/ioredis).
- **Jobs**: `defineJob({ name, schema, handle })`, enqueue with `jobs.enqueue(job, data)`, repeat with `jobs.schedule(id, job, cron, data)`. [BullMQ](https://docs.bullmq.io/) runs the worker inline in dev and as `dist/server/worker.js` in production. Bull Board runs as a dev container, not inside the app.
- **Email**: `EmailService.send(to, welcomeEmail(...))` renders [react-email](https://react.email/docs) templates to HTML and text. The provider comes from config: [Resend](https://resend.com/docs) (`RESEND_API_KEY`), SMTP (`SMTP_URL`, [Mailpit](https://mailpit.axllent.org/docs/) locally) or `noop` outside production. Mailpit's REST API (`GET :8025/api/v1/messages`) lets tests and agents read what was sent.
- **Analytics**: on the server, `Analytics.track("task.created", { userId, taskId })` from services and auth hooks. In the browser, `analytics.track(name, data)` plus automatic page views and identify from `AnalyticsProvider`. The `system.config` query tells the browser which endpoint to use at runtime, so nothing is baked into the bundle. It stays off unless `ANALYTICS_URL` and `ANALYTICS_WEBSITE_ID` are both set. [Umami](https://umami.is/docs) is the default provider; swap it in `src/server/core/analytics.ts`. The dev container sets `DISABLE_BOT_CHECK` so the server's User-Agent is accepted; a production Umami needs the same setting or a browser-like User-Agent for server-side events.
- **Health**: `/healthz` (liveness) and `/readyz` (database and Redis), with graceful shutdown on SIGTERM: stop HTTP and WebSockets, drain jobs, close Redis, close the database, bounded by `SHUTDOWN_TIMEOUT_MS`.
- **Observability**: [pino](https://getpino.io/#/) logs and [OpenTelemetry](https://opentelemetry.io/docs/languages/js/) traces go to the OTLP endpoint (`OTEL_*`; the start scripts preload `src/server/instrumentation.ts`, which hooks ESM imports so dependencies such as pino and ioredis are instrumented too), while [Prometheus](https://prometheus.io/docs/introduction/overview/) scrapes `/metrics`. [Grafana](https://github.com/grafana/docker-otel-lgtm) ships in the dev stack; in production point `OTEL_EXPORTER_OTLP_ENDPOINT` at any collector.

## Configuration

Every variable goes through `src/server/core/config.ts` and is validated at boot, so a bad `.env` fails immediately with a readable list of problems. `.env.example` documents each one.

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_URL` | required | Public origin of the app; used for auth callbacks, CORS and CSRF |
| `DATABASE_URL` | required | Postgres connection string |
| `REDIS_URL` | required | Redis connection string (cache and queues) |
| `AUTH_SECRET` | required | Session signing secret, at least 32 characters |
| `ADMIN_EMAILS` | empty | Comma-separated emails promoted to the admin role on sign-up |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | Where the HTTP server listens |
| `LOG_LEVEL` / `LOG_FORMAT` | `info` / `json` in production, `pretty` elsewhere | pino level and output shape |
| `CACHE_ENABLED` / `CACHE_DEFAULT_TTL_S` | `true` / `60` | Global cache switch and default TTL in seconds |
| `JOBS_INLINE` | `true` outside production | Run queue workers inside the web process instead of a separate one |
| `EMAIL_FROM` | `App <no-reply@example.com>` | Sender address on every email |
| `RESEND_API_KEY` or `SMTP_URL` | unset | Selects the email provider; with neither set it is `noop`, which production rejects |
| `METRICS_TOKEN` | unset | Bearer token for `GET /metrics`, at least 16 characters. Unset means unauthenticated |
| `RATE_LIMIT_AUTH_MAX` / `RATE_LIMIT_AUTH_WINDOW_MS` | `20` / `60000` | Requests allowed per window on `/api/auth/*` |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-*` headers from a reverse proxy |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Budget for graceful shutdown |
| `OTEL_SDK_DISABLED` / `OTEL_EXPORTER_OTLP_ENDPOINT` | `false` / unset | Telemetry is active when the SDK is enabled and an endpoint is set; the other `OTEL_*` variables are the standard SDK ones |
| `ANALYTICS_URL` / `ANALYTICS_WEBSITE_ID` | unset | Umami endpoint and website id. Both must be set to enable analytics |
| `ANALYTICS_SERVER_URL` | `ANALYTICS_URL` | Where the server posts events when the public URL is not reachable from it |

## Testing

- Unit and integration tests are colocated as `*.test.ts(x)`. Server tests run on [PGlite](https://pglite.dev/docs/) (Postgres in WASM) against the real migration files, and `createTestApp()` gives authenticated tRPC callers. Client tests use Testing Library with [MSW](https://mswjs.io/docs); an unhandled request fails the test.
- End to end, [Playwright](https://playwright.dev/docs/intro) boots the built server on :3100 against the `test` compose profile and covers sign-up, the welcome email (read through Mailpit), tasks, the live feed, admin gating and the REST, OpenAPI and header contracts.
- Coverage thresholds live in `vitest.config.ts`; CI posts the summary to the job page.

## Deploying

- `pnpm build` produces `dist/client` (hashed, immutable assets) and `dist/server/{main,worker,migrate}.js` with the migrations copied alongside.
- Docker: multi-stage Alpine image, production dependencies only (devDependencies are stripped before the install so optional peers do not leak in), non-root, `tini`, health check. Run migrations first with `docker run --rm --env-file .env IMAGE node dist/server/migrate.js`, then start the web container (`CMD`) and the worker (`node --import ./dist/server/instrumentation.js dist/server/worker.js`).
- Releases: Conventional Commits on `main` drive [semantic-release](https://semantic-release.gitbook.io/semantic-release/), which bumps `package.json`, writes `CHANGELOG.md`, tags `vX.Y.Z`, publishes a GitHub release and pushes `ghcr.io/<owner>/<repo>` to [GHCR](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) as `X.Y.Z`, `X.Y` and `latest` (amd64 and arm64, with SBOM and provenance).
- Behind a proxy set `TRUST_PROXY=true`. Keep `/metrics` on an internal network or set `METRICS_TOKEN`. Run your own Umami instance and Grafana or OTLP collector, and point `ANALYTICS_*` and `OTEL_*` at them.

## Working with AI agents

`CLAUDE.md` is the conventions file: file naming, the router to service to repository layering, where config and Zod schemas live, how logging, caching, analytics and jobs are used, and the commit format. Keep it accurate and an agent needs little else. The routine workflows are packaged as skills in `.claude/skills/`, so an agent runs the project's own commands instead of guessing them.

| Skill | What it does |
| --- | --- |
| `dev-server` | Start or check the local development stack (Postgres, Redis, Mailpit, Grafana, Umami, Bull Board, RedisInsight, Drizzle Gateway, API on :3000, Vite on :5173). |
| `run-tests` | Run unit, integration or end-to-end tests for this project. |
| `review-coverage` | Generate and interpret the code coverage report, find under-tested files and decide what to test next. |
| `migrate-database` | Change the database schema and generate, apply or inspect Drizzle migrations. |
| `lint-and-typecheck` | Run and fix lint, formatting, type and dead-code checks. |
| `check-email` | Inspect emails the app sent in development or tests through Mailpit's REST API. |
| `release-check` | Verify a change is release-ready and predict the next version. |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the checks to run before pushing and the recipes for common changes.

## License

MIT. See [LICENSE](LICENSE).
