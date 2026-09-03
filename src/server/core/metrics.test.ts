import { Registry } from "@prometheus-io/client";
import { describe, expect, it } from "vitest";
import { createMetrics } from "./metrics";

describe("Metrics", () => {
  it("registers default process metrics and built-in series", async () => {
    const metrics = createMetrics(new Registry());
    const text = await metrics.render();
    expect(text).toContain("process_cpu_user_seconds_total");
    expect(text).toContain("http_request_duration_seconds");
    expect(text).toContain("http_requests_total");
    expect(text).toContain("ws_connections");
  });

  it("records labelled observations", async () => {
    const metrics = createMetrics(new Registry());
    metrics.httpRequestsTotal.inc({ method: "GET", route: "/healthz", status: "200" });
    metrics.httpRequestDuration.observe({ method: "GET", route: "/healthz", status: "200" }, 0.02);
    const text = await metrics.render();
    expect(text).toContain('http_requests_total{method="GET",route="/healthz",status="200"} 1');
    expect(text).toMatch(/http_request_duration_seconds_count\{[^}]*route="\/healthz"[^}]*\} 1/);
  });

  it("returns the existing metric when a name is registered twice", () => {
    const metrics = createMetrics(new Registry());
    const a = metrics.counter("feature_events_total", "events", ["kind"]);
    const b = metrics.counter("feature_events_total", "events", ["kind"]);
    expect(a).toBe(b);
    a.inc({ kind: "created" });
    b.inc({ kind: "created" });
    return expect(metrics.render()).resolves.toContain('feature_events_total{kind="created"} 2');
  });

  it("exposes the Prometheus content type", () => {
    const metrics = createMetrics(new Registry());
    expect(metrics.contentType).toContain("text/plain");
  });
});
