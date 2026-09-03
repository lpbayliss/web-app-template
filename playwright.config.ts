import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the production build served by the real server, backed by the
 * `test` compose profile (db-test, redis-test, mailpit-test):
 *
 *   docker compose --profile test up -d && pnpm build && pnpm test:e2e
 *
 * CI does the same with service containers. Values from .env.test fill in whatever the shell did not set.
 */
const testEnv = Object.fromEntries(
  Object.entries(parseEnv(readFileSync(".env.test", "utf8"))).filter(
    ([key]) => process.env[key] === undefined,
  ),
);
const env = { ...testEnv, ...process.env } as Record<string, string>;
const baseURL = env.APP_URL ?? "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.e2e\.ts/,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 2 } : {}),
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL,
    // Animations are covered by unit/visual review; disabling them keeps clicks deterministic.
    contextOptions: { reducedMotion: "reduce" },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node --import tsx src/server/db/migrate.ts && node dist/server/main.js",
    url: `${baseURL}/readyz`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      ...env,
      NODE_ENV: "production",
      LOG_FORMAT: "pretty",
      OTEL_SDK_DISABLED: "true",
      TRUST_PROXY: "false",
    },
    stdout: "pipe",
    stderr: "pipe",
  },
});
