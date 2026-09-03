import { expect, test } from "@playwright/test";

/** Infra endpoints and the REST projection, exercised without a browser. */
test.describe("api", () => {
  test("health, readiness and metrics", async ({ request }) => {
    expect((await request.get("/healthz")).ok()).toBe(true);
    expect(await (await request.get("/readyz")).json()).toEqual({ status: "ready" });
    const metrics = await request.get("/metrics");
    expect(await metrics.text()).toContain("http_requests_total");
  });

  test("serves OpenAPI and rejects unauthenticated REST calls", async ({ request }) => {
    const spec = await (await request.get("/api/openapi.json")).json();
    expect(spec.paths["/tasks"]).toBeDefined();
    expect((await request.get("/api/v1/tasks")).status()).toBe(401);
    expect((await request.get("/api/docs")).ok()).toBe(true);
  });

  test("serves the SPA with long-lived asset caching and security headers", async ({ request }) => {
    const html = await request.get("/tasks");
    expect(html.headers()["content-type"]).toContain("text/html");
    expect(html.headers()["content-security-policy"]).toContain("default-src 'self'");
    const asset = (await html.text()).match(/\/assets\/[^"]+\.js/)?.[0];
    expect(asset).toBeTruthy();
    const js = await request.get(asset as string);
    expect(js.headers()["cache-control"]).toContain("immutable");
    expect(js.headers()["content-encoding"]).toBe("gzip");
  });
});
