import { Hono } from "hono";
import { type HealthDeps, healthRoutes } from "./routes/health.route";
import { metricsRoutes } from "./routes/metrics.route";

/**
 * Operational endpoints only: /healthz, /readyz and /metrics. The web process mounts the same
 * routes inside the full app; the dedicated worker process serves just these on WORKER_PORT so
 * Prometheus can scrape it and an orchestrator can probe it.
 */
export function createOpsApp({ ready }: HealthDeps) {
  return new Hono().route("/", healthRoutes({ ready })).route("/", metricsRoutes());
}
