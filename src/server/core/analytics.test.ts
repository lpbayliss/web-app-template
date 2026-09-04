import { describe, expect, it, vi } from "vitest";
import {
  Analytics,
  type AnalyticsProvider,
  createAnalytics,
  createUmamiProvider,
  noopProvider,
} from "./analytics";
import { Context } from "./context";
import { Metrics } from "./metrics";

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("createUmamiProvider", () => {
  const options = {
    url: "http://umami:3000",
    websiteId: "site-1",
    hostname: "app.example.com",
    userAgent: "web-app-template/1.2.3",
  };

  it("posts an event payload to /api/send with the app user agent", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("ok", { status: 200 }));
    const provider = createUmamiProvider({ ...options, fetch });
    await provider.send({
      name: "task.created",
      url: "/api/trpc/task.create",
      userId: "u1",
      data: { taskId: "t1" },
    });
    expect(fetch).toHaveBeenCalledWith(
      "http://umami:3000/api/send",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "web-app-template/1.2.3" },
        signal: expect.any(AbortSignal),
      }),
    );
    const body = JSON.parse(String((fetch.mock.calls[0]![1] as RequestInit).body));
    expect(body).toEqual({
      type: "event",
      payload: {
        website: "site-1",
        hostname: "app.example.com",
        url: "/api/trpc/task.create",
        name: "task.created",
        data: { taskId: "t1" },
        id: "u1",
      },
    });
  });

  it("omits the distinct id for anonymous events and rejects non-2xx responses", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("nope", { status: 500 }));
    const provider = createUmamiProvider({ ...options, fetch });
    await expect(provider.send({ name: "x", url: "/server", data: {} })).rejects.toThrow(
      "umami responded 500",
    );
    const body = JSON.parse(String((fetch.mock.calls[0]![1] as RequestInit).body));
    expect(body.payload).not.toHaveProperty("id");
  });
});

describe("createAnalytics", () => {
  it("is disabled with the noop provider", () => {
    const analytics = createAnalytics(noopProvider);
    expect(analytics.enabled).toBe(false);
    expect(() => analytics.track("anything")).not.toThrow();
  });

  it("sends without blocking the caller and drops undefined props", async () => {
    const send = vi.fn(async () => {});
    const analytics = createAnalytics({ name: "fake", send });
    analytics.track("user.signed_up", { userId: "u1", plan: "free", skipped: undefined });
    expect(send).toHaveBeenCalledWith({
      name: "user.signed_up",
      url: "/server",
      userId: "u1",
      data: { plan: "free" },
    });
  });

  it("falls back to the request path and user from Context", () => {
    const send = vi.fn(async () => {});
    const analytics = createAnalytics({ name: "fake", send });
    Context.run({ path: "/api/trpc/task.create", userId: "ctx-user" }, () =>
      analytics.track("task.created", { taskId: "t1" }),
    );
    expect(send).toHaveBeenCalledWith({
      name: "task.created",
      url: "/api/trpc/task.create",
      userId: "ctx-user",
      data: { taskId: "t1" },
    });
  });

  it("swallows provider failures and counts them", async () => {
    const analytics = createAnalytics({
      name: "broken",
      send: async () => {
        throw new Error("down");
      },
    });
    expect(() => analytics.track("task.created")).not.toThrow();
    await flush();
    expect(await Metrics.render()).toContain('analytics_events_total{result="error"}');
  });

  it("swallows a provider that throws synchronously and counts it as an error", async () => {
    const analytics = createAnalytics({
      name: "sync-broken",
      send: () => {
        throw new Error("sync");
      },
    } as unknown as AnalyticsProvider);
    expect(() => analytics.track("task.created")).not.toThrow();
    await flush();
    expect(await Metrics.render()).toContain('analytics_events_total{result="error"}');
  });

  it("never produces an unhandled rejection, even when the provider throws synchronously", async () => {
    const onUnhandled = vi.fn();
    process.on("unhandledRejection", onUnhandled);
    try {
      const analytics = createAnalytics({
        name: "sync-broken",
        send: () => {
          throw new Error("sync");
        },
      } as unknown as AnalyticsProvider);
      analytics.track("task.created");
      await flush();
      await flush();
      expect(onUnhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});

describe("Analytics", () => {
  it("is off in tests and can swap providers", () => {
    expect(Analytics.enabled).toBe(false);
    const send = vi.fn(async () => {});
    const previous = Analytics.use({ name: "fake", send });
    try {
      Analytics.track("theme.changed", { theme: "dark" });
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ name: "theme.changed" }));
      expect(Analytics.enabled).toBe(true);
    } finally {
      Analytics.use(previous);
    }
    expect(Analytics.enabled).toBe(false);
  });
});
