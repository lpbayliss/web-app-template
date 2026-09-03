import { z } from "zod";

/**
 * Shared between the tRPC router (validation + OpenAPI output) and the client (forms, types).
 * Keep these free of server-only imports.
 */
const taskTitleSchema = z
  .string()
  .trim()
  .min(1, "Title is required")
  .max(200, "Keep it under 200 characters");

export const taskSchema = z.object({
  id: z.uuid(),
  title: taskTitleSchema,
  completed: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** Clients may supply the id so an optimistic row keeps its React key once persisted. */
export const createTaskInputSchema = z.object({ id: z.uuid().optional(), title: taskTitleSchema });
export const updateTaskInputSchema = z.object({
  id: z.uuid(),
  title: taskTitleSchema.optional(),
  completed: z.boolean().optional(),
});
export const taskIdInputSchema = z.object({ id: z.uuid() });

export type Task = z.infer<typeof taskSchema>;
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;
