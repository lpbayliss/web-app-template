import { TRPCError } from "@trpc/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Cache, MemoryCacheStore } from "#core";
import { createTestApp, type TestApp } from "#test/server/trpc.harness";

describe("task router", () => {
  let app: TestApp;
  let alice: Awaited<ReturnType<TestApp["signUp"]>>;
  let bob: Awaited<ReturnType<TestApp["signUp"]>>;

  beforeAll(async () => {
    app = await createTestApp();
    alice = await app.signUp({ email: "alice@example.com" });
    bob = await app.signUp({ email: "bob@example.com" });
  });
  beforeEach(() => {
    Cache.use(new MemoryCacheStore(), { enabled: true });
  });
  afterAll(() => app.close());

  it("rejects anonymous callers", async () => {
    const anon = await app.anonymous();
    await expect(anon.task.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("creates, lists, updates and removes for the signed-in user only", async () => {
    const created = await alice.caller.task.create({ title: "ship it" });
    expect(created).toMatchObject({ title: "ship it", completed: false });

    expect(await alice.caller.task.list()).toHaveLength(1);
    expect(await bob.caller.task.list()).toHaveLength(0);

    await expect(bob.caller.task.get({ id: created.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    const updated = await alice.caller.task.update({ id: created.id, completed: true });
    expect(updated.completed).toBe(true);

    expect(await alice.caller.task.remove({ id: created.id })).toEqual({ id: created.id });
    expect(await alice.caller.task.list()).toHaveLength(0);
  });

  it("returns field errors for invalid input", async () => {
    try {
      await alice.caller.task.create({ title: "" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe("BAD_REQUEST");
    }
  });

  it("serves the list from cache until a mutation invalidates it", async () => {
    await alice.caller.task.create({ title: "cached" });
    const first = await alice.caller.task.list();
    // Insert directly, bypassing the service: the cached list must not see it yet.
    await app.deps.db.insert((await import("#server/db/client")).schema.tasks).values({
      ownerId: alice.userId,
      title: "sneaky",
    });
    expect(await alice.caller.task.list()).toEqual(first);
    await alice.caller.task.create({ title: "invalidates" });
    expect((await alice.caller.task.list()).map((t) => t.title)).toContain("sneaky");
  });
});
