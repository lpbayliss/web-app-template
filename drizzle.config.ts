import { defineConfig } from "drizzle-kit";

// drizzle-kit reads DATABASE_URL from the environment. `pnpm db:*` scripts load .env first.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/tables/*.table.ts",
  out: "./src/server/db/migrations",
  casing: "snake_case",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://app:app@localhost:5432/app",
  },
});
