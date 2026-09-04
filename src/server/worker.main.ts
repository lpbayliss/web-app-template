/**
 * Dedicated queue worker process for production (`node dist/server/worker.js`). Scales
 * independently of the web tier and is drained gracefully on SIGTERM. It serves only the
 * operational endpoints (/healthz, /readyz, /metrics) on WORKER_PORT so it can be probed and
 * scraped like the web process; its telemetry is reported as `<OTEL_SERVICE_NAME>-worker`
 * (see instrumentation.ts).
 */
import type { Server } from "node:http";
import { serve } from "@hono/node-server";
import { Config, Logger } from "#core";
import { bootstrap } from "./bootstrap";
import { createOpsApp } from "./http/ops-app";

const { shutdown, ready, startWorker } = await bootstrap();

const ops = createOpsApp({ ready });
const server = serve({ fetch: ops.fetch, port: Config.workerPort, hostname: Config.host }, (info) =>
  Logger.info({ host: info.address, port: info.port }, "worker ops listening"),
) as Server;
shutdown.register(
  "http",
  () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
);

await startWorker();
shutdown.install();
