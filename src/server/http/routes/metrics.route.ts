import { Hono } from "hono";
import { Config, Metrics } from "#core";
import { metricsAuth } from "../middleware/metrics-auth.middleware";

/** Prometheus scrape endpoint. */
export function metricsRoutes() {
  return new Hono().get("/metrics", metricsAuth(Config.metricsToken), async (c) =>
    c.text(await Metrics.render(), 200, { "Content-Type": Metrics.contentType }),
  );
}
