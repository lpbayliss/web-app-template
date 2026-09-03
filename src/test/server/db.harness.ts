import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { type Database, schema } from "#server/db/client";
import { MIGRATIONS_FOLDER } from "#server/db/migrations.constant";

export interface TestDb {
  db: Database;
  close(): Promise<void>;
}

/**
 * A fresh, fully migrated Postgres (PGlite, in-process WASM) per call. Use it in `beforeAll`
 * for repository/service tests. It runs the real migration files, so schema drift shows up
 * in unit tests before it reaches CI.
 */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  const db = drizzle(client, { schema, casing: "snake_case" });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db, close: () => client.close() };
}
