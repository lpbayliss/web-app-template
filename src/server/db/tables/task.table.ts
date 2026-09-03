import { relations } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.table";

export const tasks = pgTable(
  "tasks",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text().notNull(),
    completed: boolean().default(false).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  // Every query is scoped to an owner; the composite index serves the list ordering too.
  (table) => [index("tasks_owner_id_created_at_idx").on(table.ownerId, table.createdAt)],
);

export const tasksRelations = relations(tasks, ({ one }) => ({
  owner: one(users, { fields: [tasks.ownerId], references: [users.id] }),
}));

export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
