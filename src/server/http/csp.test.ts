import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "./csp";

describe("buildContentSecurityPolicy", () => {
  it("is self-only when analytics is off", () => {
    const csp = buildContentSecurityPolicy({ enabled: false });
    expect(csp.scriptSrc).toEqual(["'self'"]);
    expect(csp.connectSrc).toEqual(["'self'", "ws:", "wss:"]);
    expect(csp.frameAncestors).toEqual(["'none'"]);
  });

  it("allows the analytics origin for the tracker script and its requests", () => {
    const csp = buildContentSecurityPolicy({
      enabled: true,
      url: "https://umami.example.com/base",
      serverUrl: "http://umami:3000",
      websiteId: "6ef283e9-def7-423a-9a9a-5682722e1daf",
    });
    expect(csp.scriptSrc).toEqual(["'self'", "https://umami.example.com"]);
    expect(csp.connectSrc).toEqual(["'self'", "ws:", "wss:", "https://umami.example.com"]);
  });
});
