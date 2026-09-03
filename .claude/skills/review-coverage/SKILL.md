---
name: review-coverage
description: Generate and interpret the code coverage report, find under-tested files and decide what to test next. Use when asked about coverage, coverage thresholds, or which code lacks tests.
---

# Coverage

1. `pnpm test:coverage` — runs all Vitest projects with V8 coverage. Thresholds (vitest.config.ts): 80% lines/functions/statements, 70% branches; the command fails below them.
2. Read `coverage/coverage-summary.json` for totals, or per file:

   ```bash
   node -e 'const c=require("./coverage/coverage-summary.json");Object.entries(c).filter(([k])=>k!=="total").map(([f,v])=>[v.lines.pct,f]).sort((a,b)=>a[0]-b[0]).slice(0,15).forEach(([p,f])=>console.log(p.toFixed(1).padStart(6),f))'
   ```

   lists the 15 least-covered files.
3. `coverage/index.html` shows uncovered lines; `coverage/lcov.info` feeds editors and CI tools.

## Deciding what to test

- Prioritise services and repositories (business rules, data access) over glue (`main.ts`, `bootstrap.ts` are excluded on purpose).
- Uncovered branches in error handling (`catch`, `if (!row)`) are the usual gaps; test them with `createTestDb()` fixtures or `trpcMock.error(...)`.
- Do not chase 100%: excluded entrypoints and generated migrations stay excluded (see `coverage.exclude`).
- Raising thresholds: edit `coverage.thresholds` in `vitest.config.ts` only when the suite already clears the new value.
