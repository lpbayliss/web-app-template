import { Registry } from "@prometheus-io/client";
import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { describe, expect, it } from "vitest";
import { Context, Metrics } from "#core";
import { contextMiddleware, routeLabel } from "./context.middleware";

describe("contextMiddleware", () => {
  const app = new Hono()
    .use(requestId())
    .use(contextMiddleware())
    .get("/echo", (c) => c.json(Context.snapshot()))
    .get("/boom", () => {
      throw new Error("boom");
    });

  it("opens a context scope with request metadata", async () => {
    const res = await app.request("/echo", { headers: { "x-request-id": "abc" } });
    expect(res.headers.get("x-request-id")).toBe("abc");
    expect(await res.json()).toEqual({
      requestId: "abc",
      method: "GET",
      path: "/echo",
      transport: "http",
    });
  });

  it("generates a request id when none is supplied", async () => {
    const res = await app.request("/echo");
    expect(res.headers.get("x-request-id")).toMatch(/[0-9a-f-]{36}/);
  });

  it("records metrics even when the handler throws", async () => {
    Metrics.reset();
    const res = await app.request("/boom");
    expect(res.status).toBe(500);
    const text = await Metrics.render();
    expect(text).toContain('http_requests_total{method="GET",route="/boom",status="500"} 1');
  });

  it("isolates scopes across requests", async () => {
    const [a, b] = await Promise.all([
      app.request("/echo", { headers: { "x-request-id": "a" } }),
      app.request("/echo", { headers: { "x-request-id": "b" } }),
    ]);
    expect(((await a.json()) as any).requestId).toBe("a");
    expect(((await b.json()) as any).requestId).toBe("b");
    expect(new Registry()).toBeDefined();
  });
});

describe("routeLabel", () => {
  it.each([
    ["/api/v1/tasks/9d4a9c2e-1a63-4f9c-8d51-3f2c0f7a1b2c", "/api/v1/tasks/:id"],
    ["/users/42/posts/7", "/users/:id/posts/:id"],
    ["/api/trpc/task.list,task.get", "/api/trpc/*"],
    ["/assets/index-abc123.js", "/assets/*"],
    ["/healthz", "/healthz"],
  ])("%s -> %s", (input, expected) => {
    expect(routeLabel(input)).toBe(expected);
  });
});
