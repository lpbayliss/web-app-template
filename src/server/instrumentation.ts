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

/** Wrap dependencies only; the app's own modules (src in dev, dist in prod) are left untouched. */
const excludeAppModules = [/\/(src|dist)\//];

if (supportsSyncHooks()) {
  register({ exclude: excludeAppModules });
} else {
  // Older Node 24: the loader runs on a separate thread, so only serialisable options work.
  registerAsyncHook("import-in-the-middle/hook.mjs", import.meta.url, {
    data: { exclude: excludeAppModules },
  });
}

// Dynamic so it runs after the hook is registered (static imports are hoisted).
await import("@opentelemetry/auto-instrumentations-node/register");
