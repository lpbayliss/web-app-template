---
name: run-tests
description: Run unit, integration or end-to-end tests for this project. Use when asked to run tests, check whether tests pass, run a single test file, or run Playwright.
---

# Running tests

## Unit and integration (no Docker needed)

- Everything: `pnpm test` (Vitest projects `server`, `shared`, `client`).
- One project: `pnpm exec vitest run --project server`.
- One file or pattern: `pnpm exec vitest run src/server/features/task` or `pnpm exec vitest run task.service`.
- Watch while developing: `pnpm test:watch`.
- Server tests run against PGlite (in-process Postgres) with the real migrations, so schema drift fails here first.
- Client tests use jsdom + Testing Library + MSW; unhandled network requests fail the test on purpose.

## End-to-end (Playwright)

1. `docker compose --profile test up -d` (db-test :5433, redis-test :6380, mailpit-test :1026/:8026).
2. `pnpm build` (Playwright serves `dist/` through the real server on :3100 and runs migrations first).
3. `pnpm test:e2e`; a single spec: `pnpm exec playwright test e2e/tasks.e2e.ts`; debug UI: `pnpm exec playwright test --ui`.
4. Report: `playwright-report/index.html`; traces/screenshots are kept for failures only.
5. First time: `pnpm exec playwright install chromium`.

## Reading failures

- Vitest prints `FAIL <file> > <suite> > <test>` followed by the assertion diff; fix the code under test, not the assertion, unless the assertion is wrong.
- A `ZodError` in server tests means an input/output schema mismatch; check the shared schema in `src/shared/schemas`.
- Playwright: `expect(locator)` timeouts usually mean the selector text changed; the accessible name (label, role) is the contract.

## Writing new tests

- Colocate as `<name>.test.ts(x)`; E2E as `e2e/<name>.e2e.ts`.
- Server: `createTestDb()` for repositories, `createTestApp()` for routers (gives `signUp()` callers with real sessions).
- Client: `renderWithProviders(ui)` and `server.use(trpcMock.query("task.list", data))`.
