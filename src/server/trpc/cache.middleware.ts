import { Cache, hashKey } from "#core";
import { middleware } from "./trpc";

export interface CachedOptions {
  ttlSeconds?: number;
  /** `user`: one entry per signed-in user (default). `global`: shared by everyone; only for public data. */
  scope?: "user" | "global";
}

/** Key prefix for a procedure so mutations can `Cache.invalidate(cachePrefix("task.list", userId))`. */
export function cachePrefix(path: string, owner: string): string {
  return `trpc:${path}:${owner}:`;
}

/**
 * Opt-in response cache for queries:
 *
 *   list: protectedProcedure.use(cached({ ttlSeconds: 30 })).query(...)
 *
 * Reads are skipped when the client sends `Cache-Control: no-cache`, when caching is disabled
 * (CACHE_ENABLED=false), or for mutations/subscriptions. The key includes the procedure path,
 * the owner (user id or "*") and a hash of the raw input.
 */
export function cached(options: CachedOptions = {}) {
  const scope = options.scope ?? "user";
  return middleware(async ({ ctx, path, type, getRawInput, next }) => {
    if (type !== "query" || !Cache.enabled) return next();

    const owner = scope === "global" ? "*" : (ctx.session?.user.id ?? "anon");
    const key = `${cachePrefix(path, owner)}${hashKey(await getRawInput())}`;

    if (!ctx.cacheBypass) {
      const hit = await Cache.get<unknown>(key);
      // "middlewareMarker" is the literal tRPC v11 uses to brand middleware results.
      if (hit !== undefined) return { ok: true, data: hit, marker: "middlewareMarker" as never };
    }

    const result = await next();
    if (result.ok) await Cache.set(key, result.data, options.ttlSeconds);
    return result;
  });
}
