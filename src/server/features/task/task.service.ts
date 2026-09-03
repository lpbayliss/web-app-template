import { Cache, NotFoundError } from "#core";
import type { TaskRow } from "#server/db/tables/task.table";
import { cachePrefix } from "#server/trpc/cache.middleware";
import type { CreateTaskInput, Task, UpdateTaskInput } from "#shared/schemas/task.schema";
import type { ActivityBus } from "../activity/activity.service";
import type { TaskRepository } from "./task.repository";

export interface TaskServiceDeps {
  repo: TaskRepository;
  events: Pick<ActivityBus, "publish">;
}

/** Wire shape: dates as ISO strings, no ownerId leak. */
function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    completed: row.completed,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Business rules live here: ownership, events, cache invalidation. Routers stay thin and
 * this layer is testable without HTTP.
 */
export function createTaskService({ repo, events }: TaskServiceDeps) {
  const invalidate = (userId: string) => Cache.invalidate(cachePrefix("task.list", userId));

  return {
    async list(userId: string): Promise<Task[]> {
      return (await repo.listByOwner(userId)).map(toTask);
    },

    async get(userId: string, id: string): Promise<Task> {
      const row = await repo.findById(userId, id);
      if (!row) throw new NotFoundError("Task", id);
      return toTask(row);
    },

    async create(userId: string, input: CreateTaskInput): Promise<Task> {
      const task = toTask(await repo.insert(userId, input));
      await invalidate(userId);
      events.publish({ type: "task.created", userId, taskId: task.id, title: task.title });
      return task;
    },

    async update(userId: string, input: UpdateTaskInput): Promise<Task> {
      const { id, ...patch } = input;
      const row = await repo.update(
        userId,
        id,
        Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
      );
      if (!row) throw new NotFoundError("Task", id);
      const task = toTask(row);
      await invalidate(userId);
      events.publish({ type: "task.updated", userId, taskId: task.id, title: task.title });
      return task;
    },

    async remove(userId: string, id: string): Promise<{ id: string }> {
      const removed = await repo.delete(userId, id);
      if (!removed) throw new NotFoundError("Task", id);
      await invalidate(userId);
      events.publish({ type: "task.deleted", userId, taskId: id });
      return { id };
    },
  };
}

export type TaskService = ReturnType<typeof createTaskService>;
