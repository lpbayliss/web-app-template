import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Logger } from "#core";
import { schema } from "#server/db/client";
import { createTestDb, type TestDb } from "#test/server/db.harness";
import type { JobContext } from "../job";
import { sendWelcomeEmailJob } from "./send-welcome-email.job";

function contextFor(db: TestDb["db"]) {
  const send = vi.fn(async () => ({ id: "m1" }));
  const ctx: JobContext = {
    db,
    email: { send } as unknown as JobContext["email"],
    log: Logger,
    job: {
      id: "1",
      name: sendWelcomeEmailJob.name,
      attemptsMade: 0,
      updateProgress: async () => {},
    },
  };
  return { ctx, send };
}

describe("sendWelcomeEmailJob", () => {
  let testDb: TestDb;
  beforeAll(async () => {
    testDb = await createTestDb();
    await testDb.db
      .insert(schema.users)
      .values({ id: "u1", name: "Ada", email: "ada@example.com" });
  });
  afterAll(() => testDb.close());

  it("sends the welcome template to the user's address", async () => {
    const { ctx, send } = contextFor(testDb.db);
    await sendWelcomeEmailJob.handle({ userId: "u1" }, ctx);
    expect(send).toHaveBeenCalledWith(
      "ada@example.com",
      expect.objectContaining({ name: "welcome" }),
    );
  });

  it("skips silently when the user no longer exists", async () => {
    const { ctx, send } = contextFor(testDb.db);
    await sendWelcomeEmailJob.handle({ userId: "gone" }, ctx);
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects an empty userId", () => {
    expect(sendWelcomeEmailJob.schema.safeParse({ userId: "" }).success).toBe(false);
  });
});
