import { createHash } from "node:crypto";
import { Config } from "./config";
import { Logger } from "./logger";
import { Metrics } from "./metrics";

/** Minimal key/value contract so the same cache API runs on Redis in production and in memory in tests. */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(keys: readonly string[]): Promise<void>;
  /** Delete every key beginning with `prefix`. */
  delPrefix(prefix: string): Promise<void>;
  close(): Promise<void>;
}

export class MemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, { value: string; expiresAt: number }>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  async get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number) {
    this.entries.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
  }

  async del(keys: readonly string[]) {
    for (const key of keys) this.entries.delete(key);
  }

  async delPrefix(prefix: string) {
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key);
  }

  async close() {
    this.entries.clear();
  }
}

/** Structural subset of ioredis so tests can pass a stub without a Redis server. */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttl: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  scan(
    cursor: string,
    matchToken: "MATCH",
    pattern: string,
    countToken: "COUNT",
    count: string,
  ): Promise<[string, string[]]>;
  quit(): Promise<unknown>;
}

export class RedisCacheStore implements CacheStore {
  private readonly redis: RedisLike;
  private readonly namespace: string;

  constructor(redis: RedisLike, namespace: string) {
    this.redis = redis;
    this.namespace = namespace;
  }

  private key(key: string) {
    return `${this.namespace}:${key}`;
  }

  async get(key: string) {
    return this.redis.get(this.key(key));
  }

  async set(key: string, value: string, ttlSeconds: number) {
    await this.redis.set(this.key(key), value, "EX", ttlSeconds);
  }

  async del(keys: readonly string[]) {
    if (keys.length) await this.redis.del(...keys.map((k) => this.key(k)));
  }

  async delPrefix(prefix: string) {
    let cursor = "0";
    do {
      const [next, keys] = await this.redis.scan(
        cursor,
        "MATCH",
        `${this.key(prefix)}*`,
        "COUNT",
        "200",
      );
      if (keys.length) await this.redis.del(...keys);
      cursor = next;
    } while (cursor !== "0");
  }

  async close() {
    await this.redis.quit();
  }
}

export interface CacheOptions {
  store: CacheStore;
  enabled?: boolean;
  defaultTtlSeconds?: number;
}

export interface WrapOptions {
  ttlSeconds?: number;
  /** Skip the read (but still write) — e.g. when the client sent `Cache-Control: no-cache`. */
  bypass?: boolean;
}

/** Stable, short key from any JSON-serialisable value. */
export function hashKey(value: unknown): string {
  return createHash("sha1")
    .update(JSON.stringify(value) ?? "undefined")
    .digest("base64url")
    .slice(0, 20);
}

export function createCache(options: CacheOptions) {
  const enabled = options.enabled ?? true;
  const defaultTtl = options.defaultTtlSeconds ?? 60;
  const log = Logger.child({ module: "cache" });
  const outcomes = Metrics.counter("cache_operations_total", "Cache lookups by outcome", [
    "result",
  ]);

  const safe = async <T>(op: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      // A cache outage must never take the request down with it.
      log.warn({ op, error }, "cache operation failed");
      outcomes.inc({ result: "error" });
      return fallback;
    }
  };

  const api = {
    enabled,
    async get<T>(key: string): Promise<T | undefined> {
      if (!enabled) return undefined;
      const raw = await safe("get", () => options.store.get(key), null);
      outcomes.inc({ result: raw === null ? "miss" : "hit" });
      return raw === null ? undefined : (JSON.parse(raw) as T);
    },
    async set(key: string, value: unknown, ttlSeconds = defaultTtl): Promise<void> {
      if (!enabled) return;
      await safe("set", () => options.store.set(key, JSON.stringify(value), ttlSeconds), undefined);
    },
    async del(...keys: string[]): Promise<void> {
      await safe("del", () => options.store.del(keys), undefined);
    },
    /** Invalidate a whole family of keys, e.g. `Cache.invalidate("task:user-1:")`. */
    async invalidate(prefix: string): Promise<void> {
      await safe("invalidate", () => options.store.delPrefix(prefix), undefined);
    },
    /** Read-through helper: return the cached value or compute, store and return it. */
    async wrap<T>(key: string, fn: () => Promise<T>, opts: WrapOptions = {}): Promise<T> {
      if (!enabled) return fn();
      if (!opts.bypass) {
        const cached = await api.get<T>(key);
        if (cached !== undefined) return cached;
      }
      const value = await fn();
      await api.set(key, value, opts.ttlSeconds);
      return value;
    },
    close: () => options.store.close(),
  };
  return api;
}

export type CacheApi = ReturnType<typeof createCache>;

let current: CacheApi | undefined;

function active(): CacheApi {
  // Until main() installs the Redis store, fall back to memory (unit tests, scripts).
  current ??= createCache({
    store: new MemoryCacheStore(),
    enabled: Config.cache.enabled,
    defaultTtlSeconds: Config.cache.defaultTtlSeconds,
  });
  return current;
}

/**
 * Process-wide cache. `main.ts` calls `Cache.use(new RedisCacheStore(...))` at boot; everything
 * else just imports `Cache` and calls `wrap` / `invalidate`. Opt out globally with CACHE_ENABLED=false.
 */
export const Cache = {
  /** Swap the backing store (boot, tests). Returns the previous instance so tests can restore it. */
  use(store: CacheStore, overrides: Omit<CacheOptions, "store"> = {}): CacheApi | undefined {
    const previous = current;
    current = createCache({
      store,
      enabled: overrides.enabled ?? Config.cache.enabled,
      defaultTtlSeconds: overrides.defaultTtlSeconds ?? Config.cache.defaultTtlSeconds,
    });
    return previous;
  },
  get enabled() {
    return active().enabled;
  },
  get: <T>(key: string) => active().get<T>(key),
  set: (key: string, value: unknown, ttlSeconds?: number) => active().set(key, value, ttlSeconds),
  del: (...keys: string[]) => active().del(...keys),
  invalidate: (prefix: string) => active().invalidate(prefix),
  wrap: <T>(key: string, fn: () => Promise<T>, opts?: WrapOptions) => active().wrap(key, fn, opts),
  close: () => active().close(),
};
