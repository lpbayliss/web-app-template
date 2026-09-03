import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "#test/server/trpc.harness";

describe("activity router", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it("returns recent events for the caller and streams new ones", async () => {
    const { caller, userId } = await app.signUp({ email: "feed@example.com" });
    const other = await app.signUp({ email: "other@example.com" });

    await caller.task.create({ title: "seed" });
    await other.caller.task.create({ title: "not mine" });
    const recent = await caller.activity.recent({ limit: 10 });
    expect(recent).toHaveLength(1);
    expect(recent[0]).toMatchObject({ type: "task.created", userId, title: "seed" });

    // createCaller cannot pass an AbortSignal; breaking out of the loop closes the generator instead.
    const streamer = await app.signUp({ email: "stream@example.com" });
    const iterable = await streamer.caller.activity.onEvent();
    const received: string[] = [];
    const consumer = (async () => {
      for await (const event of iterable) {
        received.push(event.type);
        break;
      }
    })();
    await new Promise((r) => setTimeout(r, 5));
    app.deps.events.publish({ type: "task.updated", userId: streamer.userId, taskId: "t" });
    await consumer;
    expect(received).toEqual(["task.updated"]);
  });
});
