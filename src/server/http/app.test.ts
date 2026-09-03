import type { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "#test/server/trpc.harness";
import { createApp } from "./app";

describe("HTTP app", () => {
  let test: TestApp;
  let app: Hono;
  let ready = true;

  beforeAll(async () => {
    test = await createTestApp();
    app = createApp(test.deps, { ready: async () => ready });
  });
  afterAll(() => test.close());

  it("answers liveness and readiness probes", async () => {
    expect((await app.request("/healthz")).status).toBe(200);
    expect(await (await app.request("/readyz")).json()).toEqual({ status: "ready" });
    ready = false;
    expect((await app.request("/readyz")).status).toBe(503);
    ready = true;
  });

  it("exposes prometheus metrics with security headers and a request id", async () => {
    const res = await app.request("/metrics");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("http_requests_total");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(res.headers.get("x-frame-options")).toBeTruthy();
  });

  it("serves tRPC over HTTP with cookie sessions", async () => {
    const anon = await app.request("/api/trpc/task.list");
    expect(anon.status).toBe(401);

    const { cookie } = await test.signUp({ email: "http@example.com" });
    const create = await app.request("/api/trpc/task.create", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ title: "via http" }),
    });
    expect(create.status).toBe(200);
    const list = await app.request("/api/trpc/task.list", { headers: { cookie } });
    const body = (await list.json()) as any;
    expect(body.result.data).toHaveLength(1);
  });

  it("serves the REST projection and OpenAPI document", async () => {
    const spec = (await (await app.request("/api/openapi.json")).json()) as any;
    expect(spec.openapi).toMatch(/^3\.1/);
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining(["/tasks", "/tasks/{id}", "/system/info"]),
    );

    const info = await app.request("/api/v1/system/info");
    expect(info.status).toBe(200);
    expect(await info.json()).toMatchObject({ name: "web-app-template" });

    const { cookie } = await test.signUp({ email: "rest@example.com" });
    const created = await app.request("/api/v1/tasks", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ title: "rest task" }),
    });
    expect(created.status).toBe(200);
    const listed = await app.request("/api/v1/tasks", { headers: { cookie } });
    expect(((await listed.json()) as any)[0].title).toBe("rest task");

    const docs = await app.request("/api/docs");
    expect(docs.status).toBe(200);
    expect(docs.headers.get("content-type")).toContain("text/html");
  });

  it("mounts Better Auth and rate limits it", async () => {
    const res = await app.request("/api/auth/get-session");
    expect(res.status).toBe(200);
    expect(res.headers.get("ratelimit")).toMatch(/limit=/);
  });

  it("returns JSON 404s for unknown API routes", async () => {
    const res = await app.request("/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects oversized API bodies", async () => {
    const res = await app.request("/api/trpc/task.create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "x".repeat(2 * 1024 * 1024) }),
    });
    expect(res.status).toBe(413);
  });

  it("guards the admin queue dashboard", async () => {
    const guarded = createApp(test.deps, {
      ready: async () => true,
      mount: (h) => h.get("/admin/queues", (c) => c.text("dashboard")),
    });
    expect((await guarded.request("/admin/queues")).status).toBe(401);
    const { cookie } = await test.signUp({ email: "admin@example.com" });
    expect((await guarded.request("/admin/queues", { headers: { cookie } })).status).toBe(200);
  });
});
