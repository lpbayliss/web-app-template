import { describe, expect, it } from "vitest";
import { signInSchema, signUpSchema } from "./auth.schema";

describe("auth schemas", () => {
  it("normalises the email and enforces password length", () => {
    expect(signInSchema.parse({ email: "  Ada@Example.com ", password: "0123456789" })).toEqual({
      email: "ada@example.com",
      password: "0123456789",
    });
    expect(signInSchema.safeParse({ email: "nope", password: "0123456789" }).success).toBe(false);
    expect(signInSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(false);
  });

  it("requires a name for sign-up", () => {
    expect(
      signUpSchema.safeParse({ email: "a@b.co", password: "0123456789", name: " " }).success,
    ).toBe(false);
  });
});
