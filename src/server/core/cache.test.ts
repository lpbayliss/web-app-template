import { describe, expect, it, vi } from "vitest";
import {
  Cache,
  createCache,
  hashKey,
  MemoryCacheStore,
  RedisCacheStore,
  type RedisLike,
} from "./cache";

describe("MemoryCacheStore", () => {
  it("expires entries after their ttl", async () => {
    let now = 1_000;
    const store = new MemoryCacheStore(() => now);
    await store.set("k", "v", 10);
    expect(await store.get("k")).toBe("v");
    now += 10_001;
    expect(await store.get("k")).toBeNull();
  });

  it("deletes by key and by prefix", async () => {
    const store = new MemoryCacheStore();
    await store.set("task:u1:a", "1", 60);
    await store.set("task:u1:b", "2", 60);
    await store.set("task:u2:a", "3", 60);
    await store.del(["task:u1:a"]);
    expect(await store.get("task:u1:a")).toBeNull();
    await store.delPrefix("task:u1:");
    expect(await store.get("task:u1:b")).toBeNull();
    expect(await store.get("task:u2:a")).toBe("3");
  });
});

function fakeRedis(): RedisLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => {
      data.set(key, value);
      return "OK";
    },
    del: async (...keys) => {
      let n = 0;
      for (const key of keys) if (data.delete(key)) n++;
      return n;
    },
    scan: async (_cursor, _match, pattern) => {
      const prefix = String(pattern).replace(/\*$/, "");
      return ["0", [...data.keys()].filter((k) => k.startsWith(prefix))];
    },
    quit: async () => "OK",
  };
}

describe("RedisCacheStore", () => {
  it("namespaces keys and uses EX ttl", async () => {
    const redis = fakeRedis();
    const set = vi.spyOn(redis, "set");
    const store = new RedisCacheStore(redis, "app:cache");
    await store.set("k", "v", 30);
    expect(set).toHaveBeenCalledWith("app:cache:k", "v", "EX", 30);
    expect(await store.get("k")).toBe("v");
  });

  it("deletes by prefix via SCAN", async () => {
    const redis = fakeRedis();
    const store = new RedisCacheStore(redis, "ns");
    await store.set("task:u1:a", "1", 30);
    await store.set("task:u1:b", "2", 30);
    await store.set("other", "3", 30);
    await store.delPrefix("task:u1:");
    expect([...redis.data.keys()]).toEqual(["ns:other"]);
  });
});

describe("createCache", () => {
  it("round-trips JSON values", async () => {
    const cache = createCache({ store: new MemoryCacheStore() });
    await cache.set("obj", { a: 1 });
    expect(await cache.get("obj")).toEqual({ a: 1 });
    expect(await cache.get("missing")).toBeUndefined();
  });

  it("wrap computes once and then serves from cache", async () => {
    const cache = createCache({ store: new MemoryCacheStore() });
    const fn = vi.fn(async () => ({ n: Math.random() }));
    const first = await cache.wrap("k", fn);
    const second = await cache.wrap("k", fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("wrap with bypass recomputes but refreshes the entry", async () => {
    const cache = createCache({ store: new MemoryCacheStore() });
    let n = 0;
    const fn = vi.fn(async () => ++n);
    expect(await cache.wrap("k", fn)).toBe(1);
    expect(await cache.wrap("k", fn, { bypass: true })).toBe(2);
    expect(await cache.wrap("k", fn)).toBe(2);
  });

  it("is a passthrough when disabled", async () => {
    const store = new MemoryCacheStore();
    const cache = createCache({ store, enabled: false });
    const fn = vi.fn(async () => 1);
    await cache.wrap("k", fn);
    await cache.wrap("k", fn);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(await store.get("k")).toBeNull();
  });

  it("swallows store failures instead of failing the caller", async () => {
    const broken: MemoryCacheStore = Object.assign(new MemoryCacheStore(), {
      get: async () => {
        throw new Error("redis down");
      },
      set: async () => {
        throw new Error("redis down");
      },
    });
    const cache = createCache({ store: broken });
    expect(await cache.wrap("k", async () => "computed")).toBe("computed");
  });
});

describe("Cache global", () => {
  it("swaps stores with use() and restores the previous instance", async () => {
    const previous = Cache.use(new MemoryCacheStore(), { enabled: true });
    await Cache.set("x", 1);
    expect(await Cache.get("x")).toBe(1);
    Cache.use(new MemoryCacheStore());
    expect(await Cache.get("x")).toBeUndefined();
    if (previous) Cache.use(new MemoryCacheStore());
  });
});

describe("hashKey", () => {
  it("is stable and short", () => {
    expect(hashKey({ a: 1, b: [1, 2] })).toBe(hashKey({ a: 1, b: [1, 2] }));
    expect(hashKey({ a: 1 })).not.toBe(hashKey({ a: 2 }));
    expect(hashKey(undefined)).toHaveLength(20);
  });
});
