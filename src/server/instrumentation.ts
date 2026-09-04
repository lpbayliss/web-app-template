/**
 * OpenTelemetry preload. Load it before the app:
 *   dev:  node --import tsx --import ./src/server/instrumentation.ts src/server/main.ts
 *   prod: node --import ./dist/server/instrumentation.js dist/server/main.js
 *
 * `@opentelemetry/auto-instrumentations-node/register` on its own only hooks CommonJS
 * `require()`. This app is ESM, so its dependencies (pino, ioredis, ...) go through Node's ESM
 * loader and would never be patched: only built-ins would be traced and no pino record would
 * reach the OTLP logs exporter. Routing dependency imports through import-in-the-middle first
 * fixes that. The SDK itself still honours OTEL_SDK_DISABLED and the OTEL_*_EXPORTER variables.
 */
import { register as registerAsyncHook } from "node:module";
import { register, supportsSyncHooks } from "import-in-the-middle/register-hooks.mjs";
import { scopeServiceName } from "./core/telemetry-scope";

/**
 * Wrap dependencies only; the app's own modules are left untouched. An exclude pattern for
 * `src`/`dist` would also exclude dependencies that ship under those directory names inside
 * their own package (e.g. `node_modules/bullmq/dist/esm/index.js`,
 * `node_modules/@trpc/client/dist/index.mjs`), so this is an include allowlist instead.
 */
const dependencies = [/\/node_modules\//];

// This preload runs before Config exists, and OTEL_* are the SDK's own variables, so reading
// process.env here is the sanctioned exception to the config.ts rule. A top-level `return` is
// not allowed in ESM, so the registration and dynamic import are wrapped instead of early-exiting.
if (process.env.OTEL_SDK_DISABLED !== "true") {
  // The worker process reports as `<OTEL_SERVICE_NAME>-worker` so its logs, traces and metrics
  // are scoped separately from the web tier.
  scopeServiceName(process.env, process.argv[1]);
  if (supportsSyncHooks()) {
    register({ include: dependencies });
  } else {
    // Older Node 24: the loader runs on a separate thread, so only serialisable options work.
    registerAsyncHook("import-in-the-middle/hook.mjs", import.meta.url, {
      data: { include: dependencies },
    });
  }
  // Dynamic so it runs after the hook is registered (static imports are hoisted).
  await import("@opentelemetry/auto-instrumentations-node/register");
}
