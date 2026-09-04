# infrastructure

Config files mounted into the containers in `compose.yaml`. Nothing here is built or imported by
the application; it is all read at container start.

`compose.yaml` and `Dockerfile` stay at the repository root on purpose: `docker compose` and
`docker build` default to the directory they are run from, and the build context is the repo, not
this directory.

```
observability/                          portable to a real deployment
  grafana/dashboards/app.json           the API dashboard
  grafana/dashboards/worker.json        the job worker dashboard
  grafana/provisioning/dashboards.yaml  file provider that loads both
  prometheus/prometheus.yaml            scrape config for the app and worker /metrics endpoints
analytics/
  umami/create-db.sh                    dev-only bootstrap
  umami/seed.sh                         dev-only bootstrap
```

## `observability/` — reused in production

These files are not tied to the dev stack. The dashboards query standard Prometheus metrics
(`http_*`, `job_*`, plus the Node.js default collectors) and the OTLP-derived traces and logs the
app emits, so they load into any Grafana that has a Prometheus datasource; import the JSON through
the UI, or ship `provisioning/dashboards.yaml` with whatever `options.path` your deployment mounts
the dashboards at. `prometheus/prometheus.yaml` carries the two scrape jobs — `web-app-template`
(port 3000) and `web-app-template-worker` (port 3010) — which transfer to a real Prometheus by
replacing the `static_configs` targets with service discovery. Locally each job lists both a
`host.docker.internal` target (the host processes `pnpm dev` runs) and a container target (`app`
and `worker` in the `stack` profile); they publish the same ports, so one config serves either and
whichever stack is not running shows as DOWN.

## `analytics/umami/` — dev scaffolding only

`create-db.sh` creates the `umami` database on the shared dev Postgres, and `seed.sh` registers the
dev website under the fixed id `.env.development` expects so analytics work without a trip through
the Umami UI. Both run as one-shot compose services in the `tools` profile, both assume the default
`admin`/`umami` credentials, and neither has any meaning in production, where Umami (or whatever
replaces it) is provisioned separately. A production deployment copies `observability/` and leaves
this directory behind.
