import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "#server/db/client";
import { createTestDb, type TestDb } from "#test/server/db.harness";
import { createUserRepository, type UserRepository } from "./user.repository";

describe("UserRepository", () => {
  let testDb: TestDb;
  let repo: UserRepository;

  beforeAll(async () => {
    testDb = await createTestDb();
    await testDb.db.insert(schema.users).values([
      { id: "u1", name: "Ada", email: "ada@example.com", role: "admin" },
      { id: "u2", name: "Bob", email: "bob@example.com", banned: true },
    ]);
    await testDb.db.insert(schema.accounts).values({
      id: "acc1",
      issuer: "credential",
      accountId: "u1",
      providerId: "credential",
      userId: "u1",
      password: "hashed-secret",
    });
    repo = createUserRepository(testDb.db);
  });
  afterAll(() => testDb.close());

  it("finds by id with a safe projection", async () => {
    const user = await repo.findById("u1");
    expect(user).toEqual({
      id: "u1",
      email: "ada@example.com",
      name: "Ada",
      role: "admin",
      banned: false,
    });
    expect(user).not.toHaveProperty("password");
    expect(await repo.findById("nope")).toBeUndefined();
  });

  it("finds by email case-insensitively", async () => {
    expect((await repo.findByEmail("BOB@example.com"))?.banned).toBe(true);
  });

  it("counts users", async () => {
    expect(await repo.count()).toBe(2);
  });
});
