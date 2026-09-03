import { and, desc, eq } from "drizzle-orm";
import { type Database, schema } from "#server/db/client";
import type { TaskRow } from "#server/db/tables/task.table";

/**
 * Data access only: no business rules, no HTTP concerns. Every method is scoped by `ownerId`
 * so a caller can never reach another user's rows by guessing ids.
 */
export function createTaskRepository(db: Database) {
  const { tasks } = schema;
  return {
    listByOwner(ownerId: string): Promise<TaskRow[]> {
      return db
        .select()
        .from(tasks)
        .where(eq(tasks.ownerId, ownerId))
        .orderBy(desc(tasks.createdAt));
    },

    async findById(ownerId: string, id: string): Promise<TaskRow | undefined> {
      const [row] = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.ownerId, ownerId), eq(tasks.id, id)))
        .limit(1);
      return row;
    },

    async insert(ownerId: string, values: { title: string }): Promise<TaskRow> {
      const [row] = await db.insert(tasks).values({ ownerId, title: values.title }).returning();
      if (!row) throw new Error("insert returned no row");
      return row;
    },

    async update(
      ownerId: string,
      id: string,
      patch: Partial<Pick<TaskRow, "title" | "completed">>,
    ): Promise<TaskRow | undefined> {
      const [row] = await db
        .update(tasks)
        .set(patch)
        .where(and(eq(tasks.ownerId, ownerId), eq(tasks.id, id)))
        .returning();
      return row;
    },

    async delete(ownerId: string, id: string): Promise<boolean> {
      const rows = await db
        .delete(tasks)
        .where(and(eq(tasks.ownerId, ownerId), eq(tasks.id, id)))
        .returning({ id: tasks.id });
      return rows.length > 0;
    },
  };
}

export type TaskRepository = ReturnType<typeof createTaskRepository>;
