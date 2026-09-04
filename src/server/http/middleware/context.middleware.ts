import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context as HonoContext, MiddlewareHandler } from "hono";
import { Config, Context, Logger, Metrics } from "#core";

const log = Logger.child({ module: "http" });

/** Best-effort client address; only trusts proxy headers when TRUST_PROXY is on. */
export function clientIp(c: HonoContext): string {
  if (Config.trustProxy) {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** Collapse ids so metrics stay low-cardinality: /api/v1/tasks/123 -> /api/v1/tasks/:id */
export function routeLabel(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
    .replace(/\/\d+(?=\/|$)/g, "/:id")
    .replace(/^\/api\/trpc\/.*/, "/api/trpc/*")
    .replace(/^\/assets\/.*/, "/assets/*");
}

/**
 * Opens a `Context` scope for the request (requestId, method, path), logs completion with
 * timing, and records Prometheus request metrics. Must run before anything that logs.
 */
export function contextMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const requestId = c.get("requestId") as string | undefined;
    const method = c.req.method;
    const path = c.req.path;
    const seed = { method, path, transport: "http" as const, ...(requestId ? { requestId } : {}) };
    await Context.run(seed, async () => {
      const started = performance.now();
      try {
        await next();
      } finally {
        const durationMs = Math.round((performance.now() - started) * 100) / 100;
        const status = c.res.status;
        const labels = { method, route: routeLabel(path), status: String(status) };
        Metrics.httpRequestsTotal.inc(labels);
        Metrics.httpRequestDuration.observe(labels, durationMs / 1000);
        c.header("X-Request-Id", requestId ?? "");
        const level = status >= 500 ? "error" : status >= 400 ? "warn" : "http";
        log[level]({ status, durationMs, ip: clientIp(c) }, "request completed");
      }
    });
  };
}
