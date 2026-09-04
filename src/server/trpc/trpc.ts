import { initTRPC, type TRPC_ERROR_CODE_KEY, TRPCError } from "@trpc/server";
import type { OpenApiMeta } from "trpc-to-openapi";
import { ZodError, z } from "zod";
import { Context, isAppError, Logger, Metrics } from "#core";
import { isAdmin } from "#server/auth/auth";
import type { TrpcContext } from "./context";

const log = Logger.child({ module: "trpc" });
const duration = Metrics.histogram(
  "trpc_procedure_duration_seconds",
  "tRPC procedure execution time",
  ["path", "type", "status"],
  [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
);

const t = initTRPC
  .meta<OpenApiMeta>()
  .context<TrpcContext>()
  .create({
    errorFormatter({ shape, error }) {
      return {
        ...shape,
        data: {
          ...shape.data,
          // Field-level messages for forms; null for non-validation errors.
          fieldErrors:
            error.cause instanceof ZodError ? z.flattenError(error.cause).fieldErrors : null,
        },
      };
    },
  });

const STATUS_TO_CODE: Record<number, TRPC_ERROR_CODE_KEY> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "UNPROCESSABLE_CONTENT",
  429: "TOO_MANY_REQUESTS",
};

/**
 * Timing + logging for every procedure, and translation of domain `AppError`s (thrown by
 * services) into the matching tRPC error code so HTTP status and client handling stay correct.
 */
const observed = t.middleware(async ({ path, type, next }) => {
  const end = duration.startTimer({ path, type });
  const result = await next();
  if (result.ok) {
    end({ status: "ok" });
    return result;
  }
  const cause = result.error.cause;
  const error = isAppError(cause)
    ? new TRPCError({
        code: STATUS_TO_CODE[cause.status] ?? "INTERNAL_SERVER_ERROR",
        message: cause.message,
        cause,
      })
    : result.error;
  end({ status: error.code });
  if (error.code === "INTERNAL_SERVER_ERROR") log.error({ path, type, error }, "procedure failed");
  else log.debug({ path, type, code: error.code }, "procedure rejected");
  return { ...result, error };
});

export const router = t.router;
export const middleware = t.middleware;

export const publicProcedure = t.procedure.use(observed);

export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" });
  Context.set("userId", ctx.session.user.id);
  return next({ ctx: { ...ctx, session: ctx.session, user: ctx.session.user } });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isAdmin(ctx.user))
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin role required" });
  return next();
});
