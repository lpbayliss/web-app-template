import { execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import type { FullConfig } from "@playwright/test";

/**
 * Brings up the e2e release stack (`docker compose --profile e2e up -d --build --wait`).
 *
 * This is deliberately NOT Playwright's `webServer`. That option races the command's exit
 * against the URL becoming available (`_waitForProcess` in playwright/lib/runner/index.js) and
 * rejects on ANY exit, including a successful one — `onExit: (code) => reject(code ? ... :
 * "Process from config.webServer exited early.")`, where exit code 0 is falsy. A command that
 * returns as soon as the stack is healthy, which is exactly what `--wait` does, therefore fails
 * unless a poll happens to land in the gap before it exits. Running it sequentially here has no
 * race, and a compose failure surfaces the real build error instead of "exited early".
 */
const READY_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 500;

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://127.0.0.1:3100";

  // CI sets E2E_SKIP_STACK: the workflow has already built the image through buildx (with the
  // GitHub Actions layer cache) and started the stack, and `stack:e2e` passes --build, which
  // would rebuild without that cache. Locally we always run it — the build is a cache hit of a
  // few seconds when nothing changed, and that is cheaper than silently testing a stale image.
  if (process.env.E2E_SKIP_STACK !== "1") {
    execSync("pnpm stack:e2e", { stdio: "inherit" });
  }

  // `--wait` has already blocked until every healthcheck passed, so this normally succeeds on
  // the first attempt. It is here to fail with a clear message rather than let the whole suite
  // fail one test at a time if the app is up but not serving.
  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    try {
      const response = await fetch(`${baseURL}/readyz`);
      if (response.ok) return;
    } catch {
      // Connection refused while the published port is still settling.
    }
    if (Date.now() > deadline) {
      throw new Error(
        `${baseURL}/readyz did not become ready within ${READY_TIMEOUT_MS}ms. ` +
          `Check the stack with: docker compose --profile e2e ps -a && docker compose --profile e2e logs`,
      );
    }
    await sleep(POLL_INTERVAL_MS);
  }
}
