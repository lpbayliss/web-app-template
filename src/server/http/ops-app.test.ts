import { describe, expect, it } from "vitest";
import { createOpsApp } from "./ops-app";

describe("createOpsApp", () => {
  it("serves liveness, readiness and prometheus metrics", async () => {
    const app = createOpsApp({ ready: async () => true });

    expect((await app.request("/healthz")).status).toBe(200);
    expect(await (await app.request("/readyz")).json()).toEqual({ status: "ready" });

    const metrics = await app.request("/metrics");
    expect(metrics.status).toBe(200);
    expect(metrics.headers.get("content-type")).toContain("text/plain");
    expect(await metrics.text()).toContain("# TYPE");
  });

  it("reports unavailable when a dependency is down and serves nothing else", async () => {
    const app = createOpsApp({ ready: async () => false });

    expect((await app.request("/readyz")).status).toBe(503);
    expect((await app.request("/api/trpc/task.list")).status).toBe(404);
  });
});
