---
name: release-check
description: Verify a change is release-ready and predict the next version. Use before merging to main, when asked what version a change will produce, or to run the production build and Docker image locally.
---

# Release readiness

Releases are automatic: merging to `main` runs semantic-release, which reads Conventional Commits.

| Commit prefix | Effect |
| --- | --- |
| `fix:`, `perf:` | patch |
| `feat:` | minor |
| `feat!:` or a `BREAKING CHANGE:` footer | major |
| `chore:`, `docs:`, `refactor:`, `test:`, `ci:`, `build:`, `style:` | no release |

## Checklist

1. `pnpm check` passes (lint, typecheck, tests, knip).
2. `pnpm build` then `pnpm start` with `NODE_ENV=production` in `.env` serves the SPA on :3000 (`curl -s localhost:3000/readyz`).
3. `pnpm stack:up` builds the Dockerfile `prod` target and runs `app` + `worker` as containers with migrations applied by `stack-init`; `curl -s localhost:3000/readyz` reaches `ready`, then `pnpm stack:down`. Stop `pnpm dev` first — both bind :3000 and :3010.
4. Migrations for this change are committed and apply cleanly (`pnpm db:migrate` on a fresh `pnpm db:reset` database, with user consent).
5. New env vars are in `.env.development`, `.env.test`, the compose `stack` services (`app`, `worker`) and `e2e` services (`e2e-app`, `e2e-worker`), and documented in the README.
6. Dry run the version: `pnpm exec semantic-release --dry-run --no-ci` (needs `GITHUB_TOKEN`; without it, read `git log --oneline <last tag>..HEAD` and apply the table above).

## After merge

- The Release workflow tags `vX.Y.Z`, updates `CHANGELOG.md` + `package.json`, and pushes `ghcr.io/<owner>/<repo>:X.Y.Z`, `:X.Y`, `:latest` (amd64 + arm64).
- Deploy runs `node dist/server/migrate.js` before starting the new web and worker containers.
