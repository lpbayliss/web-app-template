---
name: migrate-database
description: Change the database schema and generate, apply or inspect Drizzle migrations. Use when asked to add a table or column, create or run a migration, reset the dev database, or fix a migration error.
---

# Database migrations (Drizzle)

## Change the schema

1. Edit or add a table in `src/server/db/tables/<name>.table.ts` (snake_case columns are derived automatically; timestamps use `withTimezone`). Export it from `src/server/db/schema.ts`.
2. Generate SQL: `pnpm db:generate` (prompts for a name; or `pnpm exec drizzle-kit generate --name add_widgets`). Review the file in `src/server/db/migrations/`.
3. Apply locally: `pnpm db:migrate` (needs `docker compose up -d db`).
4. Run `pnpm test` — server tests apply the migration files to PGlite, so a broken migration fails immediately.
5. Commit the table change, the SQL file and `migrations/meta/*` together.

## Rules

- Never use `drizzle-kit push` against a shared database; migrations are the only path.
- Migrations run explicitly (`node dist/server/migrate.js` in deploy pipelines), never at server boot.
- Adding a Better Auth plugin? Run `pnpm dlx @better-auth/cli generate` to see the columns it needs, copy them into `auth.table.ts`, then generate a migration.
- Destructive changes (drop column/table) need a two-step deploy: stop writing, deploy, then drop.

## Inspect / reset

- Browse: `pnpm db:studio`.
- Applied migrations: `select * from drizzle.__drizzle_migrations;`
- Wipe the local dev database and re-migrate: `pnpm db:reset` (refuses in production; ask the user before running it), then `pnpm db:seed`.
