/**
 * Drop and recreate the public schema, then re-apply migrations. Development and test only.
 */
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { Config, Logger } from "#core";
import { createDb } from "./client";
import { MIGRATIONS_FOLDER } from "./migrations.constant";

if (Config.isProduction) {
  Logger.error("refusing to reset a production database");
  process.exit(1);
}

const handle = createDb(Config.databaseUrl);
try {
  await handle.db.execute(sql`drop schema if exists public cascade`);
  await handle.db.execute(sql`drop schema if exists drizzle cascade`);
  await handle.db.execute(sql`create schema public`);
  await migrate(handle.db, { migrationsFolder: MIGRATIONS_FOLDER });
  Logger.info("database reset complete", {
    database: new URL(Config.databaseUrl).pathname.slice(1),
  });
} finally {
  await handle.close();
}
