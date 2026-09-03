import { Hono } from "hono";
import { Config } from "#core";

export interface HealthDeps {
  /** True when every dependency needed to serve traffic is reachable. */
  ready: () => Promise<boolean>;
}

/**
 * Kubernetes-style probes. `/healthz` says the process is alive; `/readyz` says it can serve
 * traffic (DB + Redis reachable) so a load balancer can pull an instance without killing it.
 */
export function healthRoutes({ ready }: HealthDeps) {
  return new Hono()
    .get("/healthz", (c) =>
      c.json({
        status: "ok",
        name: Config.appName,
        version: Config.appVersion,
        uptime: Math.round(process.uptime()),
      }),
    )
    .get("/readyz", async (c) => {
      const ok = await ready();
      return c.json({ status: ok ? "ready" : "unavailable" }, ok ? 200 : 503);
    });
}
