import { describe, expect, it } from "vitest";
import { publicConfigSchema } from "./system.schema";

describe("publicConfigSchema", () => {
  it("accepts analytics off or a url + website id pair", () => {
    expect(publicConfigSchema.safeParse({ analytics: null }).success).toBe(true);
    expect(
      publicConfigSchema.safeParse({
        analytics: {
          url: "http://localhost:3002",
          websiteId: "6ef283e9-def7-423a-9a9a-5682722e1daf",
        },
      }).success,
    ).toBe(true);
    expect(
      publicConfigSchema.safeParse({ analytics: { url: "not a url", websiteId: "x" } }).success,
    ).toBe(false);
  });
});
