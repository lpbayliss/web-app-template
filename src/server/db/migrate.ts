/**
 * Apply pending migrations. Runs as a separate step (CI, release job, `pnpm db:migrate`),
 * never implicitly at server boot, so a bad migration cannot take a rolling deploy down.
 */
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { Config, Logger } from "#core";
import { createDb } from "./client";
import { MIGRATIONS_FOLDER } from "./migrations.constant";

const handle = createDb(Config.databaseUrl);
const started = Date.now();
try {
  await migrate(handle.db, { migrationsFolder: MIGRATIONS_FOLDER });
  Logger.info("migrations applied", { durationMs: Date.now() - started });
} catch (error) {
  Logger.error("migration failed", { error });
  process.exitCode = 1;
} finally {
  await handle.close();
}
