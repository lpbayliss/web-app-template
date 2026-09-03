import { z } from "zod";
import { cached } from "#server/trpc/cache.middleware";
import { protectedProcedure, router } from "#server/trpc/trpc";
import {
  createTaskInputSchema,
  taskIdInputSchema,
  taskSchema,
  updateTaskInputSchema,
} from "#shared/schemas/task.schema";
import { createTaskRepository } from "./task.repository";
import { createTaskService } from "./task.service";

/**
 * Thin transport layer: validate, resolve the service, delegate. The `openapi` meta also
 * exposes each procedure as a REST endpoint under /api/v1 and in the generated docs.
 */
export const taskRouter = router({
  list: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/tasks",
        tags: ["tasks"],
        summary: "List my tasks",
        protect: true,
      },
    })
    .use(cached({ ttlSeconds: 30 }))
    .input(z.void())
    .output(z.array(taskSchema))
    .query(({ ctx }) => service(ctx).list(ctx.user.id)),

  get: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/tasks/{id}",
        tags: ["tasks"],
        summary: "Get a task",
        protect: true,
      },
    })
    .input(taskIdInputSchema)
    .output(taskSchema)
    .query(({ ctx, input }) => service(ctx).get(ctx.user.id, input.id)),

  create: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/tasks",
        tags: ["tasks"],
        summary: "Create a task",
        protect: true,
      },
    })
    .input(createTaskInputSchema)
    .output(taskSchema)
    .mutation(({ ctx, input }) => service(ctx).create(ctx.user.id, input)),

  update: protectedProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: "/tasks/{id}",
        tags: ["tasks"],
        summary: "Update a task",
        protect: true,
      },
    })
    .input(updateTaskInputSchema)
    .output(taskSchema)
    .mutation(({ ctx, input }) => service(ctx).update(ctx.user.id, input)),

  remove: protectedProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: "/tasks/{id}",
        tags: ["tasks"],
        summary: "Delete a task",
        protect: true,
      },
    })
    .input(taskIdInputSchema)
    .output(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) => service(ctx).remove(ctx.user.id, input.id)),
});

function service(ctx: {
  db: Parameters<typeof createTaskRepository>[0];
  events: { publish: (e: never) => void };
}) {
  return createTaskService({
    repo: createTaskRepository(ctx.db),
    events: ctx.events as Parameters<typeof createTaskService>[0]["events"],
  });
}
