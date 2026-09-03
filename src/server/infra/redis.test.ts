import { describe, expect, it } from "vitest";
import { createRedis } from "./redis";

describe("createRedis", () => {
  it("creates a lazy connection with retry and blocking settings", async () => {
    const client = createRedis("redis://127.0.0.1:1", { blocking: true, name: "probe" });
    expect(client.status).toBe("wait");
    expect(client.options.maxRetriesPerRequest).toBeNull();
    expect(client.options.connectionName).toContain("probe");
    expect(client.options.retryStrategy?.(1)).toBe(200);
    expect(client.options.retryStrategy?.(100)).toBe(5_000);
    client.disconnect();
  });

  it("limits retries for request/response connections", () => {
    const client = createRedis("redis://127.0.0.1:1");
    expect(client.options.maxRetriesPerRequest).toBe(3);
    client.disconnect();
  });
});
