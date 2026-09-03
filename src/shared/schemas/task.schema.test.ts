import { describe, expect, it } from "vitest";
import { createTaskInputSchema, taskSchema, updateTaskInputSchema } from "./task.schema";

describe("task schemas", () => {
  it("trims and bounds the title", () => {
    expect(createTaskInputSchema.parse({ title: "  hello  " })).toEqual({ title: "hello" });
    expect(createTaskInputSchema.safeParse({ title: "   " }).success).toBe(false);
    expect(createTaskInputSchema.safeParse({ title: "x".repeat(201) }).success).toBe(false);
  });

  it("requires a uuid id for updates", () => {
    expect(updateTaskInputSchema.safeParse({ id: "nope", completed: true }).success).toBe(false);
    expect(
      updateTaskInputSchema.safeParse({
        id: "9d4a9c2e-1a63-4f9c-8d51-3f2c0f7a1b2c",
        completed: true,
      }).success,
    ).toBe(true);
  });

  it("describes the wire shape of a task", () => {
    const result = taskSchema.safeParse({
      id: "9d4a9c2e-1a63-4f9c-8d51-3f2c0f7a1b2c",
      title: "t",
      completed: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});
