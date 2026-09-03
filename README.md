# web-app-template

A production-grade, single-package template for full-stack TypeScript apps. Everything the wishlist asked for is wired, tested and documented, with at least two examples of every pattern so the second one shows the convention.

**Server**: Node 26 · Hono · tRPC 11 (HTTP + WebSocket subscriptions) · Drizzle ORM + Postgres · Better Auth (email/password, admin roles) · BullMQ + Redis jobs · Redis response cache · Resend / SMTP email with react-email templates · winston logs · Prometheus metrics · OpenTelemetry tracing · OpenAPI docs (Scalar) · Bull Board queue dashboard.

**Client**: React 19 · Vite 8 · TanStack Router + Query · Tailwind 4 · react-hook-form + Zod · motion · react-intl (en/de) · Storybook.

**Tooling**: TypeScript 7 · pnpm 11 · Biome · Vitest (PGlite for DB tests, MSW for the client) · Playwright · lefthook + commitlint · semantic-release · Renovate · knip · multi-stage Docker · devcontainer · GitHub Actions (CI, release, GHCR publish).

## Quick start

```bash
pnpm install                 # Node >= 24 and pnpm 11 (pnpm manages its own version)
cp .env.example .env
docker compose up -d         # Postgres :5432, Redis :6379, Mailpit :8025
pnpm db:migrate
pnpm db:seed                 # admin@example.com / admin-password-123, user@example.com / user-password-123
pnpm dev                     # API :3000 + Vite :5173 (proxies /api and the WebSocket)
```

Open http://localhost:5173. API docs: http://localhost:3000/api/docs. Emails: http://localhost:8025. Queue dashboard (admin): http://localhost:5173/admin/queues. Storybook: `pnpm storybook` → http://localhost:6006.

Prefer containers? `docker compose --profile app up` runs the app too, and `.devcontainer/` opens the same stack in VS Code.

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` / `dev:server` / `dev:client` / `dev:worker` | Development servers (worker runs inline in the web process unless `JOBS_INLINE=false`) |
| `pnpm check` | `lint` + `typecheck` + `i18n:check` + `test` + `knip` (what CI runs) |
| `pnpm test`, `test:watch`, `test:coverage` | Vitest projects `server`, `shared`, `client`; coverage thresholds enforced |
| `pnpm test:e2e` | Playwright against the production build (`docker compose --profile test up -d` first) |
| `pnpm build`, `pnpm start`, `start:worker` | Vite client build + tsdown server bundle; run the web or worker process |
| `pnpm db:generate`, `db:migrate`, `db:studio`, `db:reset`, `db:seed` | Drizzle migrations and dev data |
| `pnpm i18n:check` | Verify every message id used in the client exists in every locale (and none are orphaned) |
| `pnpm storybook`, `storybook:build` | Component workshop |
| `pnpm audit` | `pnpm audit --prod --audit-level=high` |

## Layout

```
src/
  client/            React SPA
    components/      *.component.tsx (+ .stories.tsx, .test.tsx)
    features/<f>/    *.component.tsx, use-*.hook.ts, tests
    i18n/            en.messages.json, de.messages.json, intl.provider.tsx
    lib/             trpc.client.ts, auth.client.ts, query.client.ts
    providers/       *.provider.tsx
    routes/          *.route.tsx (code-based TanStack Router), app.router.ts
  server/
    core/            Config, Context, Logger, Metrics, Cache, errors, shutdown  (import from "#core")
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
e2e/                 Playwright specs (*.e2e.ts) + fixtures (Mailpit client)
.claude/skills/      project skills for agents (dev server, tests, coverage, migrations, lint, email, release)
```

File names follow `kebab-name.type.ext`. See `CLAUDE.md` for the short list of conventions.

## How the pieces fit

- **Request lifecycle**: request-id → `Context.run` (AsyncLocalStorage) → security headers, CORS, CSRF, body limit, timeout, gzip → routes → SPA fallback → error handler. Every log line inside a request automatically carries `requestId`, `method`, `path`, `userId`.
- **Globals** (`#core`): `Config` (Zod-validated env, fails fast with a readable list), `Context` (`set/get/snapshot`), `Logger` (winston; JSON in prod, single-line `key=value` in dev, trace ids injected by OpenTelemetry), `Metrics` (Prometheus at `/metrics`, optional bearer token), `Cache` (Redis, in-memory in tests).
- **Auth**: Better Auth at `/api/auth/*` with cookie sessions and the admin plugin. `ADMIN_EMAILS` promotes sign-ups to admins. tRPC has `publicProcedure`, `protectedProcedure`, `adminProcedure`; `/admin/queues` is guarded by `adminGuard`.
- **tRPC + REST + docs**: routers declare `meta.openapi`, so `/api/trpc` (typed client), `/api/v1/*` (REST), `/api/openapi.json` and `/api/docs` all come from one definition.
- **WebSockets**: `activity.onEvent` streams the user's task events over `/api/ws` (tRPC `wsLink`, lazy connection, keep-alive, reconnect on deploy).
- **Caching**: `.use(cached({ ttlSeconds, scope: "user" | "global" }))` on a query; `Cache-Control: no-cache` from the client bypasses reads; services call `Cache.invalidate(cachePrefix(...))`. `CACHE_ENABLED=false` turns it off globally.
- **Jobs**: `defineJob({ name, schema, handle })`, enqueue with `jobs.enqueue(job, data)`, repeat with `jobs.schedule(id, job, cron, data)`. Worker runs inline in dev and as `dist/server/worker.js` in production. Bull Board at `/admin/queues`.
- **Email**: `EmailService.send(to, welcomeEmail(...))` renders react-email templates to HTML + text. Provider by config: Resend (`RESEND_API_KEY`), SMTP (`SMTP_URL`, Mailpit locally), or `noop` outside production. Mailpit's REST API (`GET :8025/api/v1/messages`) lets tests and agents read what was sent.
- **Health**: `/healthz` (liveness), `/readyz` (DB + Redis), graceful shutdown on SIGTERM (stop HTTP/WS → drain jobs → close Redis → close DB, bounded by `SHUTDOWN_TIMEOUT_MS`).
- **Tracing**: zero-code OpenTelemetry via `--import @opentelemetry/auto-instrumentations-node/register`; set `OTEL_SDK_DISABLED=false` and `OTEL_EXPORTER_OTLP_ENDPOINT` (Jaeger: `docker compose --profile observability up -d`).

## Testing

- Unit/integration: colocated `*.test.ts(x)`. Server tests run on PGlite (Postgres in WASM) with the real migration files; the `createTestApp()` harness gives authenticated tRPC callers. Client tests use Testing Library + MSW; unhandled requests fail the test.
- E2E: Playwright boots the built server on :3100 against the `test` compose profile and covers sign-up → welcome email (read via Mailpit) → tasks → live feed → admin gating → REST/OpenAPI/headers.
- Coverage thresholds live in `vitest.config.ts`; CI posts the summary to the job page.

## Deploying

- `pnpm build` produces `dist/client` (hashed, immutable assets) and `dist/server/{main,worker,migrate}.js` with migrations copied alongside.
- Docker: multi-stage Alpine image, prod dependencies only (devDependencies are stripped before install so optional peers do not leak in), non-root, `tini`, health check. Run migrations first: `docker run --rm --env-file .env IMAGE node dist/server/migrate.js`, then the web (`CMD`) and worker (`node dist/server/worker.js`) containers.
- Releases: Conventional Commits on `main` → semantic-release bumps `package.json`, writes `CHANGELOG.md`, tags `vX.Y.Z`, publishes a GitHub release and pushes `ghcr.io/<owner>/<repo>` (`X.Y.Z`, `X.Y`, `latest`, amd64 + arm64, SBOM + provenance).
- Behind a proxy set `TRUST_PROXY=true`; put `/metrics` and `/admin/queues` on an internal network or protect them (`METRICS_TOKEN`).

## Configuration

Every variable is validated in `src/server/core/config.ts`; `.env.example` documents them. Highlights: `APP_URL`, `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET` (≥ 32 chars), `ADMIN_EMAILS`, `CACHE_ENABLED`, `JOBS_INLINE`, `EMAIL_FROM` + `RESEND_API_KEY` | `SMTP_URL`, `METRICS_TOKEN`, `TRUST_PROXY`, `OTEL_*`.

## Decisions and alternatives

| Area | Choice | Alternatives considered |
| --- | --- | --- |
| Lint/format | Biome | ESLint + Prettier (slower, more config) |
| Git hooks | lefthook | husky + lint-staged |
| Versioning | semantic-release | release-please (PR-based; use it if branch protection forbids bot commits) |
| Routing | TanStack Router, code-based | file-based routing (conflicts with the `[name].type.tsx` convention), react-router |
| DB tests | PGlite | Testcontainers (real Postgres, needs Docker, slower) |
| Queue | BullMQ | pg-boss (Postgres-only, no Redis), Graphile Worker |
| Cache | Redis via ioredis | in-memory only (single instance), Dragonfly |
| Logging | winston (requested) | pino (faster; `@opentelemetry/instrumentation-pino` exists too) |
| Metrics | `@prometheus-io/client` | OTLP metrics via the OTel SDK (set `OTEL_METRICS_EXPORTER=otlp`) |
| Email | Resend + react-email, Mailpit locally | Postmark, SES; MailHog (unmaintained) |
| OpenAPI | trpc-to-openapi + Scalar | `@hono/zod-openapi` for hand-written REST, Swagger UI |
| Supply chain | pnpm `minimumReleaseAge` (3 days), `allowBuilds` allow-list, Renovate with the same delay | Socket, Snyk |

Not included (deliberately): multi-tenancy/organizations (Better Auth `organization` plugin), file uploads (S3 presigned URLs), feature flags, i18n message management UI, SSR.
