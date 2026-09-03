import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, MemoryCacheStore, NotFoundError } from "#core";
import { schema } from "#server/db/client";
import { cachePrefix } from "#server/trpc/cache.middleware";
import { createTestDb, type TestDb } from "#test/server/db.harness";
import { createTaskRepository } from "./task.repository";
import { createTaskService, type TaskService } from "./task.service";

describe("TaskService", () => {
  let testDb: TestDb;
  let service: TaskService;
  const publish = vi.fn();

  beforeAll(async () => {
    testDb = await createTestDb();
    await testDb.db.insert(schema.users).values({ id: "u1", name: "U", email: "u@example.com" });
    service = createTaskService({ repo: createTaskRepository(testDb.db), events: { publish } });
  });
  beforeEach(() => {
    Cache.use(new MemoryCacheStore(), { enabled: true });
  });
  afterAll(() => testDb.close());

  it("creates a task, publishes an event and returns the wire shape", async () => {
    const task = await service.create("u1", { title: "write tests" });
    expect(task).toMatchObject({ title: "write tests", completed: false });
    expect(typeof task.createdAt).toBe("string");
    expect(task).not.toHaveProperty("ownerId");
    expect(publish).toHaveBeenCalledWith({
      type: "task.created",
      userId: "u1",
      taskId: task.id,
      title: task.title,
    });
  });

  it("invalidates the cached list on writes", async () => {
    const key = `${cachePrefix("task.list", "u1")}abc`;
    await Cache.set(key, ["stale"]);
    await service.create("u1", { title: "x" });
    expect(await Cache.get(key)).toBeUndefined();
  });

  it("updates and removes, raising NotFoundError for unknown ids", async () => {
    const task = await service.create("u1", { title: "toggle me" });
    const updated = await service.update("u1", { id: task.id, completed: true });
    expect(updated.completed).toBe(true);
    await expect(
      service.update("u1", { id: crypto.randomUUID(), completed: true }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await service.remove("u1", task.id)).toEqual({ id: task.id });
    await expect(service.get("u1", task.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lists only the caller's tasks", async () => {
    await testDb.db.insert(schema.users).values({ id: "u2", name: "V", email: "v@example.com" });
    await service.create("u2", { title: "not mine" });
    const mine = await service.list("u1");
    expect(mine.some((t) => t.title === "not mine")).toBe(false);
  });
});
