import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { Config, Logger } from "#core";
import * as schema from "./schema";

export { schema };

/**
 * Driver-agnostic database type. Repositories depend on this, so the same code runs against
 * postgres.js in production and PGlite in unit tests.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: PostgresJsDatabase<typeof schema>;
  /** Cheap connectivity probe for readiness checks. */
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export function createDb(url: string = Config.databaseUrl): DbHandle {
  const log = Logger.child({ module: "db" });
  const sql = postgres(url, {
    max: Config.isProduction ? 20 : 5,
    idle_timeout: 30,
    connect_timeout: 10,
    // Keep the driver quiet; Drizzle logs queries below when enabled.
    onnotice: () => {},
  });
  const db = drizzle(sql, {
    schema,
    casing: "snake_case",
    logger: Config.isDevelopment
      ? { logQuery: (query, params) => log.debug({ query, params }, "query") }
      : false,
  });
  return {
    db,
    async ping() {
      try {
        await sql`select 1`;
        return true;
      } catch (error) {
        log.warn({ error }, "database ping failed");
        return false;
      }
    },
    close: () => sql.end({ timeout: 5 }),
  };
}
