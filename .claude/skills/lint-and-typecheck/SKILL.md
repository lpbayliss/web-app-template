---
name: lint-and-typecheck
description: Run and fix lint, formatting, type and dead-code checks. Use before committing, when CI's quality job fails, or when asked to lint, format, typecheck or find unused code.
---

# Quality gates

Run all four with `pnpm check` (what CI runs). Individually:

| Command | What | Fix |
| --- | --- | --- |
| `pnpm lint` | Biome lint + format + import order | `pnpm lint:fix` (safe fixes), then handle the rest by hand |
| `pnpm typecheck` | `tsc -b` over client, server and config projects | Errors quote `file(line,col)`; `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are on, so spread conditionally and guard array reads |
| `pnpm knip` | Unused files, exports, dependencies | Delete the dead code; add real entrypoints to `knip.json` `entry` rather than ignoring |
| `pnpm test` | See the run-tests skill | |

## Notes

- Formatting is enforced on commit by lefthook (`biome check --write` on staged files); pre-push runs typecheck, tests and knip.
- `erasableSyntaxOnly` is enabled: no enums, no parameter properties, no namespaces (keeps the code runnable by Node's native type stripping).
- Biome rule list lives in `biome.json`; prefer fixing code over adding overrides. Tests may use `!` and `any` (override block).
- Commit messages are linted (Conventional Commits). `feat:` and `fix:` trigger releases.
