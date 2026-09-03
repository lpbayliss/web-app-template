# Web App Template — Design

Date: 2026-09-03
Status: approved for implementation (autonomous build under `/goal`)

## Purpose

A single-package (no monorepo) production-grade template for a full-stack TypeScript
web application: Hono API + tRPC over HTTP and WebSockets, React SPA served by the
same server, Postgres via Drizzle, Better Auth sessions, with observability
(Context / Logger / Metrics), CI/CD, releases and a slim Docker image.

Every file type / pattern appears at least twice so the second instance shows the
convention rather than a one-off. Project-scoped Claude skills cover the repeated
tasks (dev server, tests, coverage, migrations, lint, release check).

## Decisions and rationale

| Concern | Choice | Why (and alternatives considered) |
| --- | --- | --- |
| Runtime | Node 26, `engines` `>=24` | Installed locally; 26 enters LTS Oct 2026. Native `--env-file`, `process.loadEnvFile`, stable `fetch`, `AsyncLocalStorage`. |
| Package manager | pnpm 11, `packageManager` field | Strict resolution, fast. Corepack is removed in Node 25+, so pnpm manages its own version via `manage-package-manager-versions`. |
| Language | TypeScript 7 (native Go compiler) | Latest stable; `tsc` is ~10x faster. `baseUrl`, `node10` resolution, `outFile` are removed, so we use `package.json#imports` (`#server/*`, `#client/*`, `#shared/*`) which Node, Vite, Vitest, tsx and TS all resolve without extra plugins. |
| Lint / format | Biome 2 | Single fast tool; replaces ESLint + Prettier. Import sorting on. |
| Git hooks | lefthook | Parallel, language-agnostic, YAML config; lighter than husky + lint-staged. |
| Commits | Conventional Commits + commitlint | Drives semantic-release. |
| Versioning | semantic-release (commit-analyzer, release-notes-generator, changelog, npm with publish off, git, github) | Directly matches "automated bumps, git tag, package.json update". release-please is the PR-based alternative if branch protection forbids bot commits. |
| Client | React 19, Vite 8 (Rolldown), Tailwind 4 (`@tailwindcss/vite`), TanStack Router (code-based routes), TanStack Query via `@trpc/tanstack-react-query`, react-hook-form + zod resolver, `motion/react`, react-intl | Type-safe routing pairs with tRPC + Query. Code-based routes keep the `[name].[type].tsx` convention (file-based routing would dictate names). |
| Server | Hono 4 on `@hono/node-server`; `@hono/trpc-server`; `ws` + `applyWSSHandler` for tRPC subscriptions | Hono ships secure-headers, CORS, CSRF, request-id, body-limit, timeout, compress. Rate limiting via `hono-rate-limiter`. Subscriptions over WebSocket as requested (SSE is the tRPC default alternative). |
| DB | Postgres 17, Drizzle ORM + drizzle-kit, `postgres` (postgres.js) driver | Type-safe, SQL-first, migration files checked in. Tests run on PGlite (Postgres compiled to WASM, in-process) so `pnpm test` needs no Docker; E2E and dev use real Postgres via compose. |
| Auth | Better Auth 1.7 (email + password) with Drizzle adapter | Framework-agnostic, session cookies, plugin ecosystem. |
| Validation | Zod 4 | Shared schemas between client and server; `z.prettifyError` for config errors. |
| Observability | `Context` (AsyncLocalStorage), `Logger` (winston), `Metrics` (prom-client), `Config` (zod) — the four globals exported from `#server/core` | prom-client is the de-facto Node Prometheus client. winston as requested (pino is the faster alternative; noted in README). |
| Testing | Vitest 5 (projects: `server` node, `client` jsdom, `shared`), RTL + user-event + jest-dom, MSW for HTTP mocking on the client, `@faker-js/faker` factories, `@vitest/coverage-v8` with thresholds, Playwright E2E | TDD: tests sit next to code as `*.test.ts(x)`; E2E in `e2e/*.e2e.ts`. |
| Dead code | knip | Finds unused files, exports and deps in CI. |
| Dependencies | Renovate (`config:best-practices`) | Grouped, scheduled updates; dependabot config noted as alternative. |
| Docker | Multi-stage `node:26-alpine`, `pnpm fetch` cache layer, prod deps only, non-root, tini, HEALTHCHECK; published to GHCR (multi-arch) on release | Smallest practical image without bundling deps into one file (keeps source maps and avoids ESM/CJS bundling pitfalls). Server is bundled with tsdown so `#imports` are resolved at build time. |
| Dev in Docker | `compose.yaml` (`db`, `app` dev profile) + `.devcontainer/` on top of compose | Requested. |

## Layout

```
.
├── .claude/            skills (dev, test, coverage, db-migrate, lint, release-check), settings
├── .devcontainer/      devcontainer.json (uses compose)
├── .github/            workflows (ci, release), renovate.json, CODEOWNERS
├── docs/               specs, ADR-style notes
├── e2e/                Playwright specs (*.e2e.ts) + fixtures
├── src/
│   ├── client/         React SPA (entry: main.tsx, app.component.tsx)
│   │   ├── features/<feature>/  *.component.tsx, *.hook.ts, tests
│   │   ├── i18n/       en.messages.json, de.messages.json, intl.provider.tsx
│   │   ├── lib/        trpc.client.ts, auth.client.ts, query.client.ts
│   │   ├── routes/     *.route.tsx (code-based TanStack Router)
│   │   └── styles/     global.css (Tailwind)
│   ├── server/
│   │   ├── core/       config, context, logger, metrics, shutdown (index re-exports)
│   │   ├── db/         client, migrate entry, schema/*.table.ts, migrations/
│   │   ├── auth/       auth.ts (Better Auth instance)
│   │   ├── trpc/       trpc.ts (init + procedures), context.ts, app.router.ts
│   │   ├── features/<feature>/ *.router.ts, *.service.ts, *.repository.ts, tests
│   │   ├── http/       app.ts (Hono factory), middleware/*.middleware.ts, routes/*.route.ts
│   │   ├── ws/         ws.server.ts
│   │   └── main.ts     boot
│   ├── shared/         zod schemas + types used by both sides (*.schema.ts)
│   └── test/           shared test utilities (db harness, factories, render helper)
├── index.html          Vite entry
├── compose.yaml, Dockerfile, .dockerignore
├── biome.json, lefthook.yml, commitlint.config.ts, .releaserc.json
├── vite.config.ts, vitest.config.ts, playwright.config.ts, drizzle.config.ts, tsdown.config.ts
└── tsconfig.json (base) + tsconfig.client.json / tsconfig.server.json / tsconfig.node.json
```

## File naming

`kebab-name.type.ext`. Types in use (each appears at least twice):

- server: `service`, `repository`, `router` (tRPC), `route` (Hono HTTP), `middleware`, `table` (Drizzle), `test`
- shared: `schema` (Zod), `test`
- client: `component`, `hook`, `route` (TanStack), `provider`, `test`
- e2e: `e2e`
- config-ish: `config` (`drizzle.config.ts`, etc.)

## Example features

1. **task** — DB-backed CRUD (`tasks` table, owned by user). tRPC `task.list / create / toggle / remove`. Client list + react-hook-form create form + motion list animations.
2. **activity** — in-process event bus (`node:events`) publishing task events; tRPC subscription `activity.onEvent` over WebSocket. Client feed with `AnimatePresence`.
3. **health** — Hono routes `/healthz` (liveness) and `/readyz` (DB ping); `/metrics` (Prometheus, optional bearer token).
4. **auth** — Better Auth mounted at `/api/auth/*`; sign-up / sign-in routes on the client; `protectedProcedure` in tRPC.

## Core globals

- `Config`: parsed once from `process.env` with a Zod schema; invalid config exits with a prettified list of issues. Typed access anywhere via `import { Config } from "#server/core"`.
- `Context`: `Context.run(seed, fn)`, `Context.set(key, value)`, `Context.get(key)`, `Context.snapshot()`. HTTP middleware seeds `requestId`, `method`, `path`; auth adds `userId`.
- `Logger`: winston; production emits JSON; development uses a custom single-line format `HH:mm:ss LEVEL message key=value …` (no ANSI when not a TTY) so agents can grep it. A custom format merges `Context.snapshot()` into every log record's metadata.
- `Metrics`: prom-client registry with default Node metrics, `httpRequestDuration` histogram, `httpRequestsTotal`, `wsConnections` gauge; helper `Metrics.counter/gauge/histogram` for feature-specific series.

## Request lifecycle

HTTP → request-id → Context.run → secure headers / CORS / body-limit / timeout →
metrics timing → routes (`/api/auth/*`, `/api/trpc/*`, `/healthz`, `/readyz`, `/metrics`) →
static SPA (`dist/client`, SPA fallback to `index.html`) → error handler (logs with
context, returns problem-style JSON, never leaks stack in production).

WebSocket: `ws` server attached to the same HTTP server on `/api/ws`; tRPC
`createContext` resolves the Better Auth session from the upgrade request cookies.

## Dev vs prod

- `pnpm dev`: Vite dev server (:5173) proxies `/api` (+ws) to the server (`tsx watch`, :3000).
- `pnpm build`: `vite build` → `dist/client`, `tsdown` → `dist/server/{main,migrate}.js`.
- `pnpm start`: `node dist/server/main.js` serves API and static client on one port.
- Migrations run explicitly (`pnpm db:migrate` / `node dist/server/migrate.js`), never at boot.

## Testing strategy

- Unit/integration: Vitest projects. Server repository/service tests run against PGlite
  with the real migration files applied in a per-file fresh DB. Client component tests
  use RTL with a `renderWithProviders` helper (Intl + Query + Router memory history).
- Coverage: v8, thresholds 80% lines/functions/statements, 70% branches (tunable).
- E2E: Playwright starts the built server against the compose Postgres, exercises
  sign-up → create task → live activity feed.

## Security posture

Secure headers with CSP tailored to the SPA, CSRF origin check, body limit, request
timeout, rate limit on `/api/auth/*`, non-root container, no secrets in image,
`pnpm audit` job in CI, Renovate, Zod validation at every boundary, Better Auth
password hashing (scrypt), `Config.SESSION_SECRET` minimum length enforced.

## Out of scope (documented as considerations in README)

OpenTelemetry tracing, Storybook, i18n message extraction pipeline, multi-tenant
auth, background job queue (BullMQ / pg-boss), email delivery provider.

## Addendum (2026-09-04): scope additions

Requested mid-build and implemented alongside the original list:

| Concern | Choice | Notes |
| --- | --- | --- |
| Redis | ioredis 6 (`src/server/infra/redis.ts`) | Shared connection for cache, rate limiting and queue producers; a dedicated blocking connection per worker. |
| Jobs / queue | BullMQ 6 (+ Bull Board at `/admin/queues`) | Most widely used Redis queue for Node. `defineJob` + registry; worker inline in dev, separate process in prod; cron via `upsertJobScheduler`. |
| Request caching | `Cache` core global (Redis store, memory store in tests) + `cached()` tRPC middleware | Opt in per procedure with `scope: "user" \| "global"`; `Cache-Control: no-cache` bypass; `CACHE_ENABLED` kill switch; services invalidate by prefix. |
| Compression | `hono/compress` (gzip/deflate) | Applied to API responses and static assets; verified by e2e (`content-encoding: gzip`). |
| OpenAPI | trpc-to-openapi + Scalar | One router definition drives `/api/trpc`, `/api/v1/*` REST, `/api/openapi.json`, `/api/docs`. |
| Admin area | Better Auth `admin` plugin, `adminProcedure`, `adminGuard`, `/admin` route | `ADMIN_EMAILS` bootstraps the first admins; user listing, role changes, bans, queue stats. |
| Email | Resend in production, SMTP (Mailpit) locally, react-email templates | Mailpit REST API used by Playwright and the `check-email` skill. |
| Tracing | OpenTelemetry zero-code (`--import @opentelemetry/auto-instrumentations-node/register`) | Enabled by env; winston logs get trace ids; Jaeger via compose profile. |
| Storybook | Storybook 10 (react-vite) + a11y addon | Stories for Button, Input, TaskItem; built in CI. |
| i18n extraction | `scripts/check-i18n.ts` | Explicit ids with JSON catalogs as source of truth; formatjs's extractor assumes `defaultMessage` in code, so a small scanner fits better. Fails CI on missing/orphaned ids. |

### Implementation notes worth keeping

- pnpm 11: settings live in `pnpm-workspace.yaml` (`minimumReleaseAge`, `allowBuilds`); `--prod` installs keep optional peers that resolve to root devDependencies, so the Docker `prod-deps` stage strips `devDependencies` from the manifest before installing.
- TypeScript 7 removed `baseUrl`; `#imports` in package.json plus mirrored `paths` give every tool (tsc, tsx, Vite, Vitest, tsdown) the same aliases. Directory imports (`#server/core`) do not resolve under Node, hence the explicit `#core` mapping.
- Node 22+ defines a disabled global `localStorage` that shadows jsdom's; the client test setup installs an in-memory Storage.
- TanStack Router guards read the session from router context; `router.invalidate()` runs when the user id changes so sign-in/out re-evaluates `beforeLoad` without manual navigation.
