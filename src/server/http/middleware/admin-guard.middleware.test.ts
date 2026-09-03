import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "#test/server/trpc.harness";
import { adminGuard } from "./admin-guard.middleware";

describe("adminGuard", () => {
  let app: TestApp;
  let hono: Hono;

  beforeAll(async () => {
    app = await createTestApp();
    hono = new Hono()
      .use("/admin/*", adminGuard(app.auth))
      .get("/admin/secret", (c) => c.text("ok"));
  });
  afterAll(() => app.close());

  it("returns 401 without a session", async () => {
    expect((await hono.request("/admin/secret")).status).toBe(401);
  });

  it("returns 403 for regular users", async () => {
    const { cookie } = await app.signUp({ email: "user@example.com" });
    expect((await hono.request("/admin/secret", { headers: { cookie } })).status).toBe(403);
  });

  it("lets admins through", async () => {
    const { cookie } = await app.signUp({ email: "admin@example.com" });
    const res = await hono.request("/admin/secret", { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});
