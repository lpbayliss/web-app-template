import type { ContentfulStatusCode } from "hono/utils/http-status";

export interface AppErrorOptions {
  status?: ContentfulStatusCode;
  code?: string;
  cause?: unknown;
  /** Extra fields returned to the client (never include secrets). */
  details?: Record<string, unknown>;
}

/**
 * Base class for errors that map to an HTTP response. Anything else thrown is treated as
 * an unexpected 500 and its message is hidden from clients in production.
 */
export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.status = options.status ?? 500;
    this.code = options.code ?? "INTERNAL_ERROR";
    this.details = options.details;
  }

  /** RFC 9457 problem-details style body. */
  toJSON() {
    return { code: this.code, message: this.message, status: this.status, ...(this.details ?? {}) };
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id?: string) {
    super(id ? `${entity} ${id} not found` : `${entity} not found`, {
      status: 404,
      code: "NOT_FOUND",
    });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, { status: 401, code: "UNAUTHORIZED" });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource") {
    super(message, { status: 403, code: "FORBIDDEN" });
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource already exists") {
    super(message, { status: 409, code: "CONFLICT" });
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { status: 422, code: "VALIDATION_ERROR", ...(details ? { details } : {}) });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
