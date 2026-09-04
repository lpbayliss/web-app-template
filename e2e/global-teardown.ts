import { execSync } from "node:child_process";

/**
 * Stops the e2e stack in CI, leaves it running locally.
 *
 * This mirrors the `reuseExistingServer: !process.env.CI` behaviour the old `webServer` block
 * had: locally the containers persist so the next `pnpm test:e2e` skips the build and start
 * entirely. Tear down by hand with `pnpm stack:e2e:down`, or set `E2E_STOP_STACK=1`.
 */
export default function globalTeardown(): void {
  if (!process.env.CI && process.env.E2E_STOP_STACK !== "1") return;
  execSync("pnpm stack:e2e:down", { stdio: "inherit" });
}
