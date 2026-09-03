import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/** Values from .env.test fill in whatever the caller (CI, shell) did not set. */
const testEnv = Object.fromEntries(
  Object.entries(parseEnv(readFileSync(".env.test", "utf8"))).filter(
    ([key]) => process.env[key] === undefined,
  ),
);

export default defineConfig({
  test: {
    env: testEnv,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        "src/test/**",
        "src/**/*.stories.tsx",
        // Process wiring and scripts: exercised by e2e and the Docker smoke test, not unit tests.
        "src/server/main.ts",
        "src/server/worker.main.ts",
        "src/server/bootstrap.ts",
        "src/server/db/client.ts",
        "src/server/db/migrate.ts",
        "src/server/db/reset.ts",
        "src/server/db/seed.ts",
        "src/server/db/migrations/**",
        "src/server/http/queue-board.ts",
        "src/client/main.tsx",
        "src/client/app.component.tsx",
      ],
      reporter: ["text", "html", "lcov", "json-summary"],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "server",
          environment: "node",
          include: ["src/server/**/*.test.ts"],
          setupFiles: ["src/test/server/setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "shared",
          environment: "node",
          include: ["src/shared/**/*.test.ts"],
        },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: "client",
          environment: "jsdom",
          include: ["src/client/**/*.test.{ts,tsx}"],
          setupFiles: ["src/test/client/setup.ts"],
        },
      },
    ],
  },
});
