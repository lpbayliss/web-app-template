import { describe, expect, it } from "vitest";
import {
  AppError,
  ForbiddenError,
  isAppError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "./errors";

describe("AppError", () => {
  it("defaults to a 500 internal error", () => {
    const error = new AppError("something broke");
    expect(error.status).toBe(500);
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.name).toBe("AppError");
    expect(error.toJSON()).toEqual({
      code: "INTERNAL_ERROR",
      message: "something broke",
      status: 500,
    });
  });

  it("preserves cause and details", () => {
    const cause = new Error("root");
    const error = new AppError("wrapped", {
      status: 409,
      code: "CONFLICT",
      cause,
      details: { id: 1 },
    });
    expect(error.cause).toBe(cause);
    expect(error.toJSON()).toEqual({ code: "CONFLICT", message: "wrapped", status: 409, id: 1 });
  });

  it.each([
    [new NotFoundError("Task", "t1"), 404, "NOT_FOUND", "Task t1 not found"],
    [new NotFoundError("Task"), 404, "NOT_FOUND", "Task not found"],
    [new UnauthorizedError(), 401, "UNAUTHORIZED", "Authentication required"],
    [new ForbiddenError("no"), 403, "FORBIDDEN", "no"],
    [new ValidationError("bad", { field: "title" }), 422, "VALIDATION_ERROR", "bad"],
  ])("%s maps to status %i", (error, status, code, message) => {
    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
    expect(error.message).toBe(message);
    expect(error.name).toBe(error.constructor.name);
    expect(isAppError(error)).toBe(true);
  });

  it("isAppError rejects plain errors", () => {
    expect(isAppError(new Error("x"))).toBe(false);
    expect(isAppError("x")).toBe(false);
  });
});
