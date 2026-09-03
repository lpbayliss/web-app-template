import type { MiddlewareHandler } from "hono";
import { type Auth, isAdmin } from "#server/auth/auth";

/**
 * Protects server-rendered admin surfaces (the queue dashboard) that live outside tRPC.
 * tRPC procedures use `adminProcedure` instead.
 */
export function adminGuard(auth: Auth): MiddlewareHandler {
  return async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ code: "UNAUTHORIZED", message: "Sign in required" }, 401);
    if (!isAdmin(session.user))
      return c.json({ code: "FORBIDDEN", message: "Admin role required" }, 403);
    await next();
  };
}
