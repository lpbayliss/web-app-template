import { describe, expect, it, vi } from "vitest";
import { createShutdown } from "./shutdown";

describe("Shutdown", () => {
  it("runs hooks in reverse order and exits 0", async () => {
    const order: string[] = [];
    const exit = vi.fn();
    const shutdown = createShutdown({ timeoutMs: 1000, exit });
    shutdown.register("db", () => {
      order.push("db");
    });
    shutdown.register("http", async () => {
      await new Promise((r) => setTimeout(r, 1));
      order.push("http");
    });
    await shutdown.trigger("test");
    expect(order).toEqual(["http", "db"]);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("continues past a failing hook and exits 1", async () => {
    const exit = vi.fn();
    const shutdown = createShutdown({ timeoutMs: 1000, exit });
    const later = vi.fn();
    shutdown.register("first", later);
    shutdown.register("bad", () => {
      throw new Error("nope");
    });
    await shutdown.trigger("test");
    expect(later).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("is idempotent while a shutdown is in flight", async () => {
    const exit = vi.fn();
    const shutdown = createShutdown({ timeoutMs: 1000, exit });
    const hook = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    shutdown.register("slow", hook);
    await Promise.all([shutdown.trigger("a"), shutdown.trigger("b")]);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("supports unregistering a hook", async () => {
    const exit = vi.fn();
    const shutdown = createShutdown({ timeoutMs: 1000, exit });
    const hook = vi.fn();
    const remove = shutdown.register("temp", hook);
    remove();
    await shutdown.trigger("test");
    expect(hook).not.toHaveBeenCalled();
  });

  it("forces exit when hooks exceed the timeout", async () => {
    vi.useFakeTimers();
    try {
      const exit = vi.fn();
      const shutdown = createShutdown({ timeoutMs: 50, exit });
      shutdown.register("hang", () => new Promise(() => {}));
      void shutdown.trigger("test");
      await vi.advanceTimersByTimeAsync(60);
      expect(exit).toHaveBeenCalledWith(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
