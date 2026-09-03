import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Cache, MemoryCacheStore } from "#core";
import { cachePrefix } from "#server/trpc/cache.middleware";
import { createTestApp, type TestApp } from "#test/server/trpc.harness";

describe("system router", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => {
    Cache.use(new MemoryCacheStore(), { enabled: true });
  });
  afterAll(() => app.close());

  it("exposes build info publicly and caches it globally", async () => {
    const anon = await app.anonymous();
    const info = await anon.system.info();
    expect(info).toMatchObject({ name: "web-app-template", environment: "test" });
    await Cache.set(
      `${cachePrefix("system.info", "*")}${(await import("#core")).hashKey(undefined)}`,
      {
        ...info,
        version: "cached",
      },
    );
    expect((await anon.system.info()).version).toBe("cached");
  });

  it("honours Cache-Control: no-cache from the client", async () => {
    const ctx = await app.createContext({ headers: new Headers({ "cache-control": "no-cache" }) });
    const { appRouter } = await import("#server/trpc/app.router");
    const caller = appRouter.createCaller(ctx);
    const info = await caller.system.info();
    await Cache.set(
      `${cachePrefix("system.info", "*")}${(await import("#core")).hashKey(undefined)}`,
      {
        ...info,
        version: "cached",
      },
    );
    expect((await caller.system.info()).version).toBe(info.version);
  });

  it("returns the current user for signed-in callers", async () => {
    const { caller } = await app.signUp({ email: "me@example.com", name: "Me" });
    expect(await caller.system.me()).toMatchObject({
      email: "me@example.com",
      name: "Me",
      role: "user",
    });
    const anon = await app.anonymous();
    await expect(anon.system.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
