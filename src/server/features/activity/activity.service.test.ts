import { describe, expect, it } from "vitest";
import { createActivityBus } from "./activity.service";

describe("ActivityBus", () => {
  it("stamps events and keeps a bounded recent list per user", () => {
    const bus = createActivityBus();
    for (let i = 0; i < 60; i++)
      bus.publish({ type: "task.created", userId: "u1", taskId: `t${i}` });
    bus.publish({ type: "task.deleted", userId: "u2", taskId: "x" });
    const recent = bus.recent("u1");
    expect(recent).toHaveLength(20);
    expect(recent[0]?.taskId).toBe("t59");
    expect(bus.recent("u1", 100)).toHaveLength(50);
    expect(recent[0]?.at).toMatch(/T/);
    expect(bus.recent("u2")).toHaveLength(1);
  });

  it("delivers only the subscriber's events and stops on abort", async () => {
    const bus = createActivityBus();
    const controller = new AbortController();
    const received: string[] = [];
    const consumer = (async () => {
      for await (const event of bus.subscribe("u1", controller.signal)) {
        received.push(event.taskId);
        if (received.length === 2) controller.abort();
      }
    })();
    await new Promise((r) => setTimeout(r, 1));
    bus.publish({ type: "task.created", userId: "u2", taskId: "other" });
    bus.publish({ type: "task.created", userId: "u1", taskId: "a" });
    bus.publish({ type: "task.updated", userId: "u1", taskId: "b" });
    await consumer;
    expect(received).toEqual(["a", "b"]);
    expect(bus.listenerCount()).toBe(0);
  });
});
