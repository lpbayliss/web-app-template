import { describe, expect, it } from "vitest";
import { queryClient } from "./query.client";

type Retry = (failureCount: number, error: unknown) => boolean;

describe("queryClient defaults", () => {
  const retry = queryClient.getDefaultOptions().queries?.retry as Retry;

  it("never retries auth or validation failures", () => {
    for (const code of ["UNAUTHORIZED", "FORBIDDEN", "BAD_REQUEST"]) {
      expect(retry(0, { data: { code } })).toBe(false);
    }
  });

  it("retries other failures twice", () => {
    expect(retry(0, new Error("network"))).toBe(true);
    expect(retry(1, new Error("network"))).toBe(true);
    expect(retry(2, new Error("network"))).toBe(false);
  });

  it("does not refetch on window focus", () => {
    expect(queryClient.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false);
  });
});
