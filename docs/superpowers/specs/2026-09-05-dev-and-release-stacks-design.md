# Dev and release stacks, infrastructure layout — Design

Date: 2026-09-05
Status: approved

## Purpose

Four changes to how this template is run locally:

1. **Delete the devcontainer.** Unused.
2. **Move container config into `infrastructure/`**, split so a production deployment can
   reuse the observability half without dragging dev-only scaffolding with it.
3. **Add a release stack**: `app` and `worker` as separate containers built from the
   Dockerfile's `prod` target, **no bind mounts**, for verifying a realistic deployment.
4. **Tier the dev stack** so `pnpm dev:core` runs only what the app needs and `pnpm dev`
   adds the tool UIs.

The API, worker and Vite stay **host processes** in `pnpm dev`. This was the pivotal
decision, and it is evidence-based: inotify events do not cross a Docker Desktop bind mount
from the Windows filesystem. Verified with a control — a container-side `touch` on the mount
raised `CREATE` (visible even to a second container watching the same mount), while an
identical write from Windows raised nothing in 12s, for both modify and create. Docker
Desktop's fileserver only knows about writes that pass through it; a Windows process writing
to `C:\Workspace` bypasses it, so no inotify event is ever generated. Watching source from
inside a container would therefore require polling every file on a timer. Keeping the dev
loop on the host avoids that entirely, and the release stack delivers the realistic
two-container topology without needing to watch anything.

Out of scope: Kubernetes manifests, a production compose file, moving the repo into WSL2,
changing the Dockerfile's `prod` stage.

## 1. `infrastructure/`

`compose.yaml` and `Dockerfile` stay at the repository root. Only mounted config moves.

```
infrastructure/
  README.md                                   which files a prod deploy reuses
  observability/                              portable to production
    grafana/dashboards/app.json
    grafana/dashboards/worker.json
    grafana/provisioning/dashboards.yaml
    prometheus/prometheus.yaml
  analytics/
    umami/create-db.sh                        dev-only bootstrap
    umami/seed.sh
```

Moves from the deleted `docker/` directory:

| From | To |
| --- | --- |
| `docker/otel-lgtm/dashboards/app.json` | `infrastructure/observability/grafana/dashboards/app.json` |
| `docker/otel-lgtm/dashboards/worker.json` | `infrastructure/observability/grafana/dashboards/worker.json` |
| `docker/otel-lgtm/grafana-dashboards.yaml` | `infrastructure/observability/grafana/provisioning/dashboards.yaml` |
| `docker/otel-lgtm/prometheus.yaml` | `infrastructure/observability/prometheus/prometheus.yaml` |
| `docker/umami/create-db.sh` | `infrastructure/analytics/umami/create-db.sh` |
| `docker/umami/seed.sh` | `infrastructure/analytics/umami/seed.sh` |

Use `git mv` so history follows. Container mount *targets* are unchanged, so file contents
need only their comments corrected — except `prometheus.yaml`, see §4.

## 2. Compose profiles

| Profile | Services |
| --- | --- |
| *(default)* | `db`, `redis`, `mailpit` |
| `tools` | `grafana`, `umami-db-init`, `umami`, `umami-seed`, `bull-board`, `redisinsight`, `drizzle-gateway` |
| `stack` | `stack-init`, `app`, `worker` |
| `test` | `db-test`, `redis-test`, `mailpit-test` |
| `e2e` | the three `*-test` services, plus `e2e-init`, `e2e-app`, `e2e-worker` |

The `*-test` services carry `profiles: ["test", "e2e"]` so the existing `test` profile keeps
working for integration tests. The old `app` profile service is deleted outright.

## 3. The release stack (`stack` profile)

`stack-init`, `app` and `worker` all use:

```yaml
image: web-app-template:local
build:
  context: .
  target: prod
```

Naming the image explicitly lets CI pre-build it with layer caching and lets compose reuse it
when `--build` is not passed. **No `volumes:` on any of these services** — the whole point is
that they run the built artifact.

- `stack-init` — `restart: "no"`, `command: ["node", "dist/server/migrate.js"]`, depends on
  `db` healthy. This is the migration-job shape a real deployment uses.
- `app` — default image CMD, `ports: ["3000:3000"]`, depends on `stack-init` completing
  successfully plus `redis`/`mailpit` healthy.
- `worker` — `command: ["node", "--import", "./dist/server/instrumentation.js", "dist/server/worker.js"]`,
  `WORKER_PORT=3010`, `ports: ["3010:3010"]`.

Environment is written explicitly (no `env_file`), production-shaped: `NODE_ENV=production`,
`LOG_FORMAT=json`, `JOBS_INLINE=false`, `APP_URL=http://localhost:3000`, service hostnames for
`DATABASE_URL`/`REDIS_URL`/`SMTP_URL`, `ANALYTICS_SERVER_URL=http://umami:3000`,
`OTEL_EXPORTER_OTLP_ENDPOINT=http://grafana:4318`.

`app` and `worker` publish **the same host ports as `pnpm dev`** (3000, 3010). The two stacks
are deliberately mutually exclusive; running both gives a clear port-bind error. The payoff is
that one Prometheus scrape config serves both.

`pnpm stack:up` starts `--profile tools --profile stack` together, because telemetry is part
of what you are verifying and Grafana is where you look at it.

## 4. Prometheus targets

`prometheus.yaml` keeps **one target per job**: `host.docker.internal:3000` and
`host.docker.internal:3010`, nothing else. Because both stacks publish the same host ports,
that single target follows whichever is running.

The container targets (`app:3000` / `worker:3010`) must NOT also be scraped. They are the same
process a second time, and 27 of the 28 dashboard expressions `sum()` across instances, so
every rate and count would silently double while the release stack is up. This was caught
during verification; see Implementation notes.

## 5. e2e runs against the release stack

`e2e-init` / `e2e-app` / `e2e-worker` use the same `web-app-template:local` image pointed at
the `*-test` services: `db-test:5432/app_test`, `redis-test:6379`, `mailpit-test:1025`.
`e2e-app` publishes `3100:3000` and `e2e-worker` `3110:3010`, matching `.env.test`'s existing
`PORT=3100`. `APP_URL=http://127.0.0.1:3100`, `OTEL_SDK_DISABLED=true`,
`RATE_LIMIT_AUTH_MAX=1000`, `AUTH_SECRET` matching `.env.test`. `e2e-app` needs a healthcheck
so `--wait` is meaningful.

**`JOBS_INLINE=false`** — the welcome-email test now genuinely crosses Redis into a separate
worker container rather than running inline. `e2e/auth.e2e.ts` already polls via
`mailpit.waitFor`, so it should hold; this is the change most likely to surface a latent
timing assumption.

`playwright.config.ts` uses `globalSetup` / `globalTeardown`, **not** `webServer`. Playwright's
`webServer` races its command's exit against URL availability and rejects on *any* exit,
successful ones included (`onExit: (code) => reject(code ? ... : "exited early")` — exit code 0
is falsy), so it cannot drive `docker compose up -d --wait`, which returns as soon as the stack
is healthy. `e2e/global-setup.ts` runs the command sequentially and then polls `/readyz`;
`e2e/global-teardown.ts` tears the stack down in CI and leaves it up locally, preserving the
old `reuseExistingServer: !CI` ergonomics. CI sets `E2E_SKIP_STACK=1` so global setup does not
rebuild the image the workflow already built through the buildx cache.

## 6. Scripts

```jsonc
"dev":          "docker compose --profile tools up -d && pnpm dev:app",
"dev:core":     "docker compose up -d && pnpm dev:app",
"dev:app":      "concurrently -n server,worker,client -c blue,magenta,green \"pnpm dev:server\" \"pnpm dev:worker\" \"pnpm dev:client\"",
"stack:up":     "docker compose --profile tools up -d && docker compose --profile stack up -d --build --wait --wait-timeout 180 app worker",
"stack:logs":   "docker compose logs -f app worker",
"stack:down":   "docker compose --profile stack rm -sf stack-init app worker",
"stack:e2e":    "docker compose --profile e2e up -d --build --wait --wait-timeout 180 e2e-app e2e-worker",
"stack:e2e:down": "docker compose --profile e2e rm -sf e2e-init e2e-app e2e-worker db-test redis-test mailpit-test",
```

`dev:server`, `dev:worker` and `dev:client` are unchanged and keep `node --watch` — they run
on the host, where fs events work. `start` and `start:worker` keep their current meaning: run
the built bundle directly, no Docker. They are the primitive the `release-check` skill uses,
and repurposing `start` to mean "docker compose up" would be surprising.

## 7. Dockerfile

Delete the `dev` stage — nothing references it once the devcontainer and the `app` profile are
gone. Update the header comment block, which currently describes the `dev` stage and the
devcontainer.

## 8. CI

The `e2e` job loses its `services:` block and its `dist` artifact download. Instead it builds
the image with `docker/build-push-action` (`target: prod`, `load: true`,
`tags: web-app-template:local`, `cache-from`/`cache-to: type=gha`), then runs
`docker compose --profile e2e up -d --wait` (no `--build`, so the cached image is reused) and
`pnpm test:e2e`. `pnpm install` and the Playwright browser install stay.

## Verification

Compose is not unit-testable; verification is manual and must actually be run:

1. `pnpm dev:core` — only `db`/`redis`/`mailpit` in `docker compose ps`; API, worker and Vite
   on the host; `curl localhost:3000/readyz` is `ready`.
2. Edit a server file, confirm the reload lands; edit a component, confirm HMR. No polling.
3. `pnpm dev` — tool UIs additionally reachable on 3001/3002/3003/4983/5540/8025.
4. `pnpm stack:up` after `pnpm dev` is stopped — `app` and `worker` containers healthy, SPA
   served from `localhost:3000`, both Grafana dashboards populating from the new targets.
5. `pnpm test:e2e` green, with the welcome-email test passing through the real worker.
6. `pnpm check`.

## Implementation notes

Verification ran end to end and found three defects. All are fixed; they are recorded because
each one is a trap worth not re-entering.

1. **`tsdown` copied the migrations to a doubled path.** `copy: [{ from: "src/server/db/migrations",
   to: "dist/server/migrations" }]` places the *source directory inside* the target, producing
   `dist/server/migrations/migrations/`, while `MIGRATIONS_FOLDER` resolves to
   `dist/server/migrations`. `node dist/server/migrate.js` — the migration step this repo
   documents for production, in the Dockerfile header and in the release workflow — therefore
   failed with "Can't find meta/\_journal.json". Pre-existing since the original server commit and
   invisible until now, because the old e2e path migrated from `src/` through tsx, where the path
   resolves correctly. Fixed by setting `to: "dist/server"`. This is the bug the release stack was
   built to catch, found on its first run.

2. **`--wait` treats an exiting one-shot as a failure.** `docker compose up --wait` returns
   non-zero when any container exits, including `stack-init` / `e2e-init` / `umami-seed` exiting 0
   by design. `pnpm stack:up` reported failure over a completely healthy stack. Fixed by naming the
   long-running services — `--wait ... app worker` — which also scopes what compose starts, so
   `stack:e2e` no longer drags up the unused dev `db`/`redis`/`mailpit`. A `--wait-timeout` is set
   because `--wait` against `restart: unless-stopped` otherwise waits forever on a crash-looping
   container instead of failing.

3. **The same-host-ports decision double-counted metrics.** See §4. Scraping both
   `host.docker.internal:3000` and `app:3000` meant two scrapes of one process; the dashboards sum
   across instances, so rates doubled whenever the release stack ran.

Ports 3000/3010 are shared by both stacks deliberately, which is what lets one scrape config
serve both. The cost is that they cannot run at once — `pnpm stack:up` after `pnpm dev` gives a
port-bind error. Note also that stopping `pnpm dev` can orphan the `node --watch` children still
holding those ports; kill by port if the next start reports EADDRINUSE.
