# Contributing

## Prerequisites

- Node 24 or newer (`engines.node` is `>=24`; the Docker image and CI run Node 26).
- pnpm 11. The repo pins it with `packageManager`, so `corepack`/pnpm manages its own version.
- Docker, for Postgres, Redis, Mailpit and the dev tool UIs.

## Setup

```bash
pnpm install
# optional: create .env to override .env.development (e.g. AUTH_SECRET)
pnpm dev          # starts the containers, then API :3000, worker :3010 and Vite :5173
```

`pnpm dev` stays in the foreground, so run the database commands from a second terminal. They
execute on the host against Postgres published on :5432.

```bash
pnpm db:migrate
pnpm db:seed      # admin@example.com / admin-password-123, user@example.com / user-password-123
```

`pnpm dev:core` is the lean alternative: Postgres, Redis and Mailpit only, without the tool UIs.

## Before you push

- Run `pnpm check` (lint, typecheck, i18n check, tests, knip). This is what CI runs.
- lefthook runs typecheck, tests and knip on pre-push, and commitlint on the commit message.
- End-to-end tests: `pnpm test:e2e`. Playwright's global setup builds the production image and
  starts the `e2e` compose profile itself; the stack is left running between local runs, so tear
  it down with `pnpm stack:e2e:down` when you are finished.

## Conventions

- `CLAUDE.md` is the source of truth for conventions. Read it before your first change.
- Commits follow Conventional Commits. `feat:` and `fix:` produce a release; other types do not. commitlint enforces the format.
- TDD, with tests colocated next to the code as `*.test.ts(x)`.
- Files are named `kebab-name.type.ext`, one concern per file (`task.service.ts`, `task-list.component.tsx`, `use-tasks.hook.ts`).

## Common changes

- **New environment variable**: add it to the schema in `src/server/core/config.ts`, document it in `.env.development` (with its dev-stack value), add a row to the README's Configuration table. Nothing else reads `process.env`.
- **New job**: `defineJob({ name, schema, handle })` in `src/server/jobs/definitions/*.job.ts`, then register it in `src/server/jobs/jobs.registry.ts`. Handlers must be idempotent.
- **Schema change**: edit the `*.table.ts` file, run `pnpm db:generate`, commit the generated migration. Never `db:push`.
- **New analytics event**: call `Analytics.track("noun.verb_past", { userId, ...props })` from the service that owns the change. Fire and forget, never awaited.

## Working with AI agents

- `CLAUDE.md` is the conventions file agents read first. Keep it accurate when you change a pattern.
- `.claude/skills/` holds project skills for the routine tasks: dev server, tests, coverage, migrations, lint, email inspection and release checks. Agents should use them instead of improvising commands.
