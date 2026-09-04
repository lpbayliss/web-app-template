import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the release stack: the `prod` image from the Dockerfile, split
 * into a real `e2e-app` and a separate `e2e-worker` (so `JOBS_INLINE=false` and queued work
 * genuinely crosses Redis), backed by `db-test`, `redis-test` and `mailpit-test`.
 *
 *   pnpm test:e2e                        # global setup brings the stack up
 *   pnpm stack:e2e:down                  # tear it down (kept running locally between runs)
 *
 * The stack is started from `e2e/global-setup.ts`, NOT from Playwright's `webServer`: that
 * option rejects on any exit of its command, successful ones included, so it cannot be used
 * with `docker compose up -d --wait`, which returns as soon as the stack is healthy. See the
 * comment in that file. The containers own their environment — compose sets NODE_ENV,
 * LOG_FORMAT, OTEL_SDK_DISABLED and the service hostnames — so nothing is injected here.
 *
 * Values from .env.test fill in whatever the shell did not set; only APP_URL is read here.
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
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
});
