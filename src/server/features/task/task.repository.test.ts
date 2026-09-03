import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConflictError } from "#core";
import { schema } from "#server/db/client";
import { createTestDb, type TestDb } from "#test/server/db.harness";
import { createTaskRepository, type TaskRepository } from "./task.repository";

describe("TaskRepository", () => {
  let testDb: TestDb;
  let repo: TaskRepository;

  beforeAll(async () => {
    testDb = await createTestDb();
    await testDb.db.insert(schema.users).values([
      { id: "alice", name: "Alice", email: "alice@example.com" },
      { id: "bob", name: "Bob", email: "bob@example.com" },
    ]);
    repo = createTaskRepository(testDb.db);
  });
  afterAll(() => testDb.close());

  it("inserts and lists newest first per owner", async () => {
    const first = await repo.insert("alice", { title: "first" });
    const second = await repo.insert("alice", { title: "second" });
    await repo.insert("bob", { title: "bobs" });
    const list = await repo.listByOwner("alice");
    expect(list.map((t) => t.id)).toEqual([second.id, first.id]);
    expect(list.every((t) => t.ownerId === "alice")).toBe(true);
  });

  it("scopes reads, updates and deletes to the owner", async () => {
    const task = await repo.insert("alice", { title: "private" });
    expect(await repo.findById("bob", task.id)).toBeUndefined();
    expect(await repo.update("bob", task.id, { completed: true })).toBeUndefined();
    expect(await repo.delete("bob", task.id)).toBe(false);
    expect(await repo.findById("alice", task.id)).toMatchObject({
      title: "private",
      completed: false,
    });
  });

  it("updates fields and bumps updatedAt", async () => {
    const task = await repo.insert("alice", { title: "todo" });
    await new Promise((r) => setTimeout(r, 5));
    const updated = await repo.update("alice", task.id, { completed: true, title: "done" });
    expect(updated).toMatchObject({ completed: true, title: "done" });
    expect(updated!.updatedAt.getTime()).toBeGreaterThan(task.updatedAt.getTime());
  });

  it("accepts a client-supplied id and rejects duplicates with ConflictError", async () => {
    const id = crypto.randomUUID();
    const task = await repo.insert("alice", { id, title: "client id" });
    expect(task.id).toBe(id);
    await expect(repo.insert("alice", { id, title: "again" })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("deletes and reports whether a row was removed", async () => {
    const task = await repo.insert("alice", { title: "bye" });
    expect(await repo.delete("alice", task.id)).toBe(true);
    expect(await repo.delete("alice", task.id)).toBe(false);
  });
});
