import { describe, expect, it } from "vitest";
import { scopeServiceName } from "./telemetry-scope";

describe("scopeServiceName", () => {
  it("leaves the web process name alone and adds the namespace", () => {
    const env: Record<string, string | undefined> = { OTEL_SERVICE_NAME: "acme" };
    scopeServiceName(env, "C:\\app\\src\\server\\main.ts");
    expect(env).toEqual({
      OTEL_SERVICE_NAME: "acme",
      OTEL_RESOURCE_ATTRIBUTES: "service.namespace=acme",
    });
  });

  it("suffixes the worker entrypoint in dev and prod", () => {
    for (const entrypoint of ["/app/src/server/worker.main.ts", "/app/dist/server/worker.js"]) {
      const env: Record<string, string | undefined> = { OTEL_SERVICE_NAME: "acme" };
      scopeServiceName(env, entrypoint);
      expect(env.OTEL_SERVICE_NAME).toBe("acme-worker");
      expect(env.OTEL_RESOURCE_ATTRIBUTES).toBe("service.namespace=acme");
    }
  });

  it("does not double-suffix or override explicit attributes", () => {
    const env = {
      OTEL_SERVICE_NAME: "acme-worker",
      OTEL_RESOURCE_ATTRIBUTES: "deployment.environment=prod,service.namespace=custom",
    };
    scopeServiceName(env, "/app/dist/server/worker.js");
    expect(env.OTEL_SERVICE_NAME).toBe("acme-worker");
    expect(env.OTEL_RESOURCE_ATTRIBUTES).toBe(
      "deployment.environment=prod,service.namespace=custom",
    );
  });

  it("appends the namespace to existing attributes and is a no-op without a service name", () => {
    const env = { OTEL_SERVICE_NAME: "acme", OTEL_RESOURCE_ATTRIBUTES: "host.name=box" };
    scopeServiceName(env, undefined);
    expect(env.OTEL_RESOURCE_ATTRIBUTES).toBe("host.name=box,service.namespace=acme");

    const empty: Record<string, string | undefined> = {};
    scopeServiceName(empty, "/app/dist/server/worker.js");
    expect(empty).toEqual({});
  });
});
