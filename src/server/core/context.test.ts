import { describe, expect, it } from "vitest";
import { Context } from "./context";

describe("Context", () => {
  it("is inactive and empty outside a scope", () => {
    expect(Context.active()).toBe(false);
    expect(Context.get("requestId")).toBeUndefined();
    expect(Context.snapshot()).toEqual({});
    expect(Context.set("requestId", "nope")).toBe(false);
  });

  it("exposes seed values and additions inside a scope", () => {
    Context.run({ requestId: "r1" }, () => {
      expect(Context.active()).toBe(true);
      expect(Context.get("requestId")).toBe("r1");
      expect(Context.set("userId", "u1")).toBe(true);
      Context.set("orderId", 42);
      expect(Context.snapshot()).toEqual({ requestId: "r1", userId: "u1", orderId: 42 });
    });
  });

  it("follows async continuations", async () => {
    await Context.run({ requestId: "r2" }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      Context.set("userId", "later");
      await Promise.resolve();
      expect(Context.get("userId")).toBe("later");
      expect(Context.get("requestId")).toBe("r2");
    });
  });

  it("isolates concurrent scopes", async () => {
    const seen: string[] = [];
    await Promise.all(
      ["a", "b", "c"].map((id) =>
        Context.run({ requestId: id }, async () => {
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
          seen.push(Context.get("requestId") ?? "missing");
        }),
      ),
    );
    expect(seen.sort()).toEqual(["a", "b", "c"]);
  });

  it("removes a key when set to undefined", () => {
    Context.run({ requestId: "r3", path: "/x" }, () => {
      Context.set("path", undefined as unknown as string);
      expect(Context.snapshot()).toEqual({ requestId: "r3" });
    });
  });

  it("does not leak into sibling scopes", () => {
    Context.run({ requestId: "outer" }, () => {
      Context.run({ requestId: "inner" }, () => {
        Context.set("userId", "inner-user");
      });
      expect(Context.get("userId")).toBeUndefined();
      expect(Context.get("requestId")).toBe("outer");
    });
  });
});
