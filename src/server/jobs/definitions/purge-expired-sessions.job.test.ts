import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Logger } from "#core";
import { schema } from "#server/db/client";
import { createTestDb, type TestDb } from "#test/server/db.harness";
import type { JobContext } from "../job";
import { purgeExpiredSessionsJob } from "./purge-expired-sessions.job";

describe("purgeExpiredSessionsJob", () => {
  let testDb: TestDb;
  beforeAll(async () => {
    testDb = await createTestDb();
    await testDb.db.insert(schema.users).values({ id: "u1", name: "U", email: "u@example.com" });
    await testDb.db.insert(schema.sessions).values([
      { id: "s-expired", token: "t1", userId: "u1", expiresAt: new Date(Date.now() - 60_000) },
      { id: "s-live", token: "t2", userId: "u1", expiresAt: new Date(Date.now() + 60_000) },
    ]);
  });
  afterAll(() => testDb.close());

  it("deletes only expired sessions", async () => {
    const ctx: JobContext = {
      db: testDb.db,
      email: { send: async () => ({ id: "x" }) } as unknown as JobContext["email"],
      log: Logger,
      job: {
        id: "1",
        name: purgeExpiredSessionsJob.name,
        attemptsMade: 0,
        updateProgress: async () => {},
      },
    };
    await purgeExpiredSessionsJob.handle({ olderThanMinutes: 0 }, ctx);
    const remaining = await testDb.db.select({ id: schema.sessions.id }).from(schema.sessions);
    expect(remaining.map((r) => r.id)).toEqual(["s-live"]);
  });

  it("applies the default payload", () => {
    expect(purgeExpiredSessionsJob.schema.parse({})).toEqual({ olderThanMinutes: 0 });
  });
});
