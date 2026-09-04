# CLAUDE.md

Full-stack TypeScript template: Hono + tRPC (HTTP + WebSocket) + Drizzle/Postgres + Better Auth + BullMQ/Redis on the server; React 19 + Vite + TanStack Router/Query + Tailwind on the client. One package, no monorepo.

## Commands

- `pnpm dev` (starts the compose `tools` profile itself, then API/worker/Vite on the host), `pnpm dev:core` (same, but only db/redis/mailpit), `pnpm stack:up` (app + worker as prod containers on the same ports, so not alongside `pnpm dev`), `pnpm check` (lint + typecheck + i18n + test + knip), `pnpm test:e2e` (Playwright brings up its own containers)
- Project skills in `.claude/skills/` cover dev server, tests, coverage, migrations, lint, email inspection and release checks. Use them.

## Conventions

- Files: `kebab-name.type.ext` (`task.service.ts`, `task-list.component.tsx`, `use-tasks.hook.ts`, `*.test.ts`, `*.e2e.ts`). One concern per file.
- Imports: `#core` (Config, Context, Logger, Metrics, Cache), `#server/*`, `#client/*`, `#shared/*`, `#test/*`. Never `../../..`.
- Layers: router (validate + delegate) -> service (rules, events, cache invalidation) -> repository (SQL only, always owner-scoped). Dependencies are passed in (`AppDeps`), never imported as singletons except the `#core` globals.
- Config: every env var goes through `src/server/core/config.ts`. Nothing else reads `process.env`.
- Validation: Zod schemas in `src/shared/schemas` are the contract for forms, tRPC input/output and OpenAPI.
- Errors: throw `AppError` subclasses from services; middleware maps them to tRPC codes / HTTP statuses.
- Logging: pino. `Logger.child({ module })`, metadata object first then the message (`log.info({ userId }, "user created")`), errors under `error`, never string interpolation. Request context is attached automatically.
- Caching: opt in per query with `.use(cached({ ttlSeconds, scope }))`; invalidate with `Cache.invalidate(cachePrefix(path, owner))` in the mutating service.
- Analytics: `Analytics.track("noun.verb_past", { userId, ...props })` from services and auth hooks; `analytics.track(name, data)` from client providers/components. Fire-and-forget: never await it, never make behaviour depend on it. Unit tests spy on `Analytics.track` / stub `window.umami`; e2e tests never assert on it.
- Jobs: `defineJob` + register in `jobs.registry.ts`; handlers get `{ db, email, log }` and must be idempotent.
- Schema changes: edit `*.table.ts`, run `pnpm db:generate`, commit the migration. Never `db:push`.
- Tests: TDD. Colocated `*.test.ts(x)`. Server tests use PGlite (`createTestDb` / `createTestApp`), client tests use RTL + MSW (`renderWithProviders`, `trpcMock`). No network in unit tests.
- Commits: Conventional Commits (`feat:` / `fix:` release; others do not).
- Prefer a well-maintained library over hand-rolled code; check versions with the registry before adding one.
