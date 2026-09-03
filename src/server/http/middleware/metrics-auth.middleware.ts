import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";

/** Optional bearer token for /metrics. With no token configured the endpoint is open: keep it internal. */
export function metricsAuth(token: string | undefined): MiddlewareHandler {
  return async (c, next) => {
    if (token) {
      const presented = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
      const a = Buffer.from(presented);
      const b = Buffer.from(token);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return c.text("Unauthorized", 401, { "WWW-Authenticate": "Bearer" });
      }
    }
    await next();
  };
}
