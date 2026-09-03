import { describe, expect, it } from "vitest";
import { z } from "zod";
import { paginatedSchema, paginationInputSchema } from "./pagination.schema";

describe("pagination schemas", () => {
  it("applies defaults and caps the limit", () => {
    expect(paginationInputSchema.parse({})).toEqual({ limit: 20, offset: 0 });
    expect(paginationInputSchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(paginationInputSchema.safeParse({ offset: -1 }).success).toBe(false);
  });

  it("wraps an item schema in a page envelope", () => {
    const page = paginatedSchema(z.object({ id: z.string() }));
    expect(page.safeParse({ items: [{ id: "a" }], total: 1, limit: 20, offset: 0 }).success).toBe(
      true,
    );
    expect(page.safeParse({ items: [{ id: 1 }], total: 1, limit: 20, offset: 0 }).success).toBe(
      false,
    );
  });
});
