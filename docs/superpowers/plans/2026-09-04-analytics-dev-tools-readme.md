# Analytics, Dev Tooling Containers and README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Umami-backed product analytics to server and client, bring up a UI container for every system the dev app talks to, move Bull Board out of the app, and rewrite the README as an open-source project front page.

**Architecture:** A fifth `#core` global, `Analytics`, wraps a pluggable provider (Umami over `fetch`, or noop) and is called fire-and-forget from services. The browser learns the analytics endpoint at runtime from a new public `system.config` tRPC query, loads Umami's tracker script, and sends page views, identify and UI events through `src/client/lib/analytics.client.ts`. `compose.yaml` gains Grafana LGTM, Umami (plus two one-shot helpers), Bull Board, RedisInsight and Drizzle Gateway, all on by default.

**Tech Stack:** Hono, tRPC 11, Zod 4, pino, `@prometheus-io/client`, React 19, TanStack Router/Query, Vitest, MSW, Docker Compose, Umami, `grafana/otel-lgtm`.

**Spec:** `docs/superpowers/specs/2026-09-04-analytics-dev-tools-readme-design.md`

## Global Constraints

- File names: `kebab-name.type.ext`; one concern per file; colocated `*.test.ts(x)`.
- Imports: `#core`, `#server/*`, `#client/*`, `#shared/*`, `#test/*`. Never relative `../..`.
- Every env var goes through `src/server/core/config.ts`. Nothing else reads `process.env` or `import.meta.env` for analytics.
- Logging: `log.info({ meta }, "message")`, errors under `error`.
- Analytics event names: dot-separated `noun.verb_past` (`user.signed_up`, `task.created`, `task.completed`, `theme.changed`, `locale.changed`).
- `Analytics.track` and `analytics.track` never throw, are never awaited, and are never asserted on in e2e tests.
- Dev website id (fixed): `6ef283e9-def7-423a-9a9a-5682722e1daf`.
- Host ports: Grafana 3001, Umami 3002, Bull Board 3003, Drizzle Gateway 4983, RedisInsight 5540, Mailpit 8025 (unchanged).
- Commits: Conventional Commits. Every commit message ends with:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_0176WdV7zFJ67X1s4ZNsnfap
  ```
- The working tree already contains an uncommitted winston-to-pino migration (29 files). Do not revert it; do not commit it as part of these tasks either. Stage only the files each task names (`git add <paths>`, never `git add -A`).
- Run the unit suite with `pnpm test` (or `pnpm exec vitest run <path>` for one file) and the full gate with `pnpm check`. Nothing here needs Docker except Task 10's manual verification.
- Spec deviations already agreed: the Umami provider uses Node's global `fetch` (the `@umami/node` package has had no release since August 2024); an optional `ANALYTICS_SERVER_URL` lets the server post to a private address; `identify(null)` is a no-op; `task.completed` fires whenever an update sets `completed: true`.

---

### Task 1: Analytics configuration

**Files:**
- Modify: `src/server/core/config.ts`
- Test: `src/server/core/config.test.ts`

**Interfaces:**
- Produces: `Config.analytics: AnalyticsConfig` where
  ```ts
  export type AnalyticsConfig =
    | { readonly enabled: false }
    | { readonly enabled: true; readonly url: string; readonly serverUrl: string; readonly websiteId: string };
  ```
  `url` is the browser-facing origin (also what the CSP allows), `serverUrl` is what the server posts to (defaults to `url`). Both have trailing slashes stripped.

- [ ] **Step 1: Write the failing tests**

Append to the `describe("loadConfig")` block in `src/server/core/config.test.ts`:

```ts
  it("disables analytics unless both ANALYTICS_URL and ANALYTICS_WEBSITE_ID are set", () => {
    expect(loadConfig(valid).analytics).toEqual({ enabled: false });
    expect(
      loadConfig({
        ...valid,
        ANALYTICS_URL: "http://localhost:3002/",
        ANALYTICS_WEBSITE_ID: "6ef283e9-def7-423a-9a9a-5682722e1daf",
      }).analytics,
    ).toEqual({
      enabled: true,
      url: "http://localhost:3002",
      serverUrl: "http://localhost:3002",
      websiteId: "6ef283e9-def7-423a-9a9a-5682722e1daf",
    });
  });

  it("lets the server post analytics to a private address", () => {
    const config = loadConfig({
      ...valid,
      ANALYTICS_URL: "http://localhost:3002",
      ANALYTICS_SERVER_URL: "http://umami:3000/",
      ANALYTICS_WEBSITE_ID: "6ef283e9-def7-423a-9a9a-5682722e1daf",
    });
    expect(config.analytics).toMatchObject({ enabled: true, serverUrl: "http://umami:3000" });
  });

  it("rejects a half-configured analytics pair", () => {
    expect(() => loadConfig({ ...valid, ANALYTICS_URL: "http://localhost:3002" })).toThrow(
      ConfigError,
    );
    expect(() =>
      loadConfig({ ...valid, ANALYTICS_WEBSITE_ID: "6ef283e9-def7-423a-9a9a-5682722e1daf" }),
    ).toThrow(/ANALYTICS_URL and ANALYTICS_WEBSITE_ID/);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/server/core/config.test.ts`
Expected: the three new cases FAIL (`analytics` is `undefined`, no `ConfigError` thrown).

- [ ] **Step 3: Implement**

In `src/server/core/config.ts`:

1. Add to `envSchema`, after the `OTEL_*` entries:

```ts
  /** Product analytics (Umami). Enabled when ANALYTICS_URL and ANALYTICS_WEBSITE_ID are both set. */
  ANALYTICS_URL: z.url({ protocol: /^https?$/ }).optional(),
  /** Where the server posts events when the public URL is not reachable from it (docker networks). */
  ANALYTICS_SERVER_URL: z.url({ protocol: /^https?$/ }).optional(),
  ANALYTICS_WEBSITE_ID: z.uuid().optional(),
```

2. Add the type next to `AppConfig` and the field at the end of `AppConfig`:

```ts
export type AnalyticsConfig =
  | { readonly enabled: false }
  | {
      readonly enabled: true;
      readonly url: string;
      readonly serverUrl: string;
      readonly websiteId: string;
    };
```

```ts
  readonly analytics: AnalyticsConfig;
```

3. Add a helper above `loadConfig`:

```ts
const stripSlash = (url: string) => url.replace(/\/$/, "");

function resolveAnalytics(e: Env): AnalyticsConfig {
  if (!e.ANALYTICS_URL || !e.ANALYTICS_WEBSITE_ID) return { enabled: false };
  const url = stripSlash(e.ANALYTICS_URL);
  return Object.freeze({
    enabled: true,
    url,
    serverUrl: e.ANALYTICS_SERVER_URL ? stripSlash(e.ANALYTICS_SERVER_URL) : url,
    websiteId: e.ANALYTICS_WEBSITE_ID,
  });
}
```

4. In `loadConfig`, add to the `problems` checks:

```ts
  if ((e.ANALYTICS_URL === undefined) !== (e.ANALYTICS_WEBSITE_ID === undefined))
    problems.push("✖ ANALYTICS_URL and ANALYTICS_WEBSITE_ID must be set together");
```

5. In the returned object, after `telemetry`:

```ts
    analytics: resolveAnalytics(e),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/server/core/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/core/config.ts src/server/core/config.test.ts
git commit -m "feat(config): add analytics settings"
```

---

### Task 2: `Analytics` core global

**Files:**
- Create: `src/server/core/analytics.ts`
- Create: `src/server/core/analytics.test.ts`
- Modify: `src/server/core/index.ts`

**Interfaces:**
- Consumes: `Config.analytics` (Task 1), `Context`, `Logger`, `Metrics`.
- Produces (exported from `#core`):
  ```ts
  type AnalyticsValue = string | number | boolean | null;
  interface AnalyticsProps { userId?: string; [key: string]: AnalyticsValue | undefined }
  interface AnalyticsEvent { name: string; url: string; userId?: string; data: Record<string, AnalyticsValue> }
  interface AnalyticsProvider { readonly name: string; send(event: AnalyticsEvent): Promise<void> }
  const noopProvider: AnalyticsProvider;
  function createUmamiProvider(o: { url: string; websiteId: string; hostname: string; userAgent: string; fetch?: typeof fetch }): AnalyticsProvider;
  function createAnalytics(provider: AnalyticsProvider): { provider; enabled: boolean; track(name, props?): void };
  const Analytics: { use(provider): AnalyticsProvider; enabled: boolean; track(name: string, props?: AnalyticsProps): void };
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/server/core/analytics.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { Analytics, createAnalytics, createUmamiProvider, noopProvider } from "./analytics";
import { Context } from "./context";
import { Metrics } from "./metrics";

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("createUmamiProvider", () => {
  const options = {
    url: "http://umami:3000",
    websiteId: "site-1",
    hostname: "app.example.com",
    userAgent: "web-app-template/1.2.3",
  };

  it("posts an event payload to /api/send with the app user agent", async () => {
    const fetch = vi.fn(async () => new Response("ok", { status: 200 }));
    const provider = createUmamiProvider({ ...options, fetch });
    await provider.send({
      name: "task.created",
      url: "/api/trpc/task.create",
      userId: "u1",
      data: { taskId: "t1" },
    });
    expect(fetch).toHaveBeenCalledWith(
      "http://umami:3000/api/send",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "web-app-template/1.2.3" },
      }),
    );
    const body = JSON.parse(String((fetch.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).toEqual({
      type: "event",
      payload: {
        website: "site-1",
        hostname: "app.example.com",
        url: "/api/trpc/task.create",
        name: "task.created",
        data: { taskId: "t1" },
        id: "u1",
      },
    });
  });

  it("omits the distinct id for anonymous events and rejects non-2xx responses", async () => {
    const fetch = vi.fn(async () => new Response("nope", { status: 500 }));
    const provider = createUmamiProvider({ ...options, fetch });
    await expect(provider.send({ name: "x", url: "/server", data: {} })).rejects.toThrow(
      "umami responded 500",
    );
    const body = JSON.parse(String((fetch.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.payload).not.toHaveProperty("id");
  });
});

describe("createAnalytics", () => {
  it("is disabled with the noop provider", () => {
    const analytics = createAnalytics(noopProvider);
    expect(analytics.enabled).toBe(false);
    expect(() => analytics.track("anything")).not.toThrow();
  });

  it("sends without blocking the caller and drops undefined props", async () => {
    const send = vi.fn(async () => {});
    const analytics = createAnalytics({ name: "fake", send });
    analytics.track("user.signed_up", { userId: "u1", plan: "free", skipped: undefined });
    expect(send).toHaveBeenCalledWith({
      name: "user.signed_up",
      url: "/server",
      userId: "u1",
      data: { plan: "free" },
    });
  });

  it("falls back to the request path and user from Context", () => {
    const send = vi.fn(async () => {});
    const analytics = createAnalytics({ name: "fake", send });
    Context.run({ path: "/api/trpc/task.create", userId: "ctx-user" }, () =>
      analytics.track("task.created", { taskId: "t1" }),
    );
    expect(send).toHaveBeenCalledWith({
      name: "task.created",
      url: "/api/trpc/task.create",
      userId: "ctx-user",
      data: { taskId: "t1" },
    });
  });

  it("swallows provider failures and counts them", async () => {
    const analytics = createAnalytics({
      name: "broken",
      send: async () => {
        throw new Error("down");
      },
    });
    expect(() => analytics.track("task.created")).not.toThrow();
    await flush();
    expect(await Metrics.render()).toContain('analytics_events_total{result="error"}');
  });
});

describe("Analytics", () => {
  it("is off in tests and can swap providers", () => {
    expect(Analytics.enabled).toBe(false);
    const send = vi.fn(async () => {});
    const previous = Analytics.use({ name: "fake", send });
    try {
      Analytics.track("theme.changed", { theme: "dark" });
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ name: "theme.changed" }));
      expect(Analytics.enabled).toBe(true);
    } finally {
      Analytics.use(previous);
    }
    expect(Analytics.enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/server/core/analytics.test.ts`
Expected: FAIL, "Cannot find module './analytics'".

- [ ] **Step 3: Implement**

Create `src/server/core/analytics.ts`:

```ts
import { Config } from "./config";
import { Context } from "./context";
import { Logger } from "./logger";
import { Metrics } from "./metrics";

export type AnalyticsValue = string | number | boolean | null;

/** Properties attached to an event. `userId` becomes the distinct id; everything else is event data. */
export interface AnalyticsProps {
  userId?: string;
  [key: string]: AnalyticsValue | undefined;
}

export interface AnalyticsEvent {
  name: string;
  /** Request path the event happened on (`/server` outside a request). */
  url: string;
  userId?: string;
  data: Record<string, AnalyticsValue>;
}

/** Minimal sink contract so the vendor is a one-file swap. */
export interface AnalyticsProvider {
  readonly name: string;
  send(event: AnalyticsEvent): Promise<void>;
}

export const noopProvider: AnalyticsProvider = { name: "noop", send: async () => {} };

export interface UmamiProviderOptions {
  url: string;
  websiteId: string;
  hostname: string;
  userAgent: string;
  fetch?: typeof fetch;
}

/**
 * Umami's collect endpoint (`POST /api/send`). Umami drops requests whose User-Agent looks like
 * a bot, so self-hosted instances receiving server events need `DISABLE_BOT_CHECK=1`.
 */
export function createUmamiProvider(options: UmamiProviderOptions): AnalyticsProvider {
  const post = options.fetch ?? globalThis.fetch;
  return {
    name: "umami",
    async send(event) {
      const response = await post(`${options.url}/api/send`, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": options.userAgent },
        body: JSON.stringify({
          type: "event",
          payload: {
            website: options.websiteId,
            hostname: options.hostname,
            url: event.url,
            name: event.name,
            data: event.data,
            ...(event.userId ? { id: event.userId } : {}),
          },
        }),
      });
      if (!response.ok) throw new Error(`umami responded ${response.status}`);
    },
  };
}

export function createAnalytics(provider: AnalyticsProvider) {
  const log = Logger.child({ module: "analytics" });
  const outcomes = Metrics.counter("analytics_events_total", "Analytics events by outcome", [
    "result",
  ]);
  const enabled = provider.name !== noopProvider.name;

  return {
    provider,
    enabled,
    /** Fire-and-forget: never awaited by callers, never throws. */
    track(name: string, props: AnalyticsProps = {}): void {
      if (!enabled) return;
      const { userId, ...rest } = props;
      const data = Object.fromEntries(
        Object.entries(rest).filter((entry): entry is [string, AnalyticsValue] => entry[1] !== undefined),
      );
      const event: AnalyticsEvent = {
        name,
        url: Context.get("path") ?? "/server",
        userId: userId ?? Context.get("userId"),
        data,
      };
      provider.send(event).then(
        () => outcomes.inc({ result: "sent" }),
        (error: unknown) => {
          // Analytics must never take a request or job down with it.
          outcomes.inc({ result: "error" });
          log.warn({ event: name, error }, "analytics event failed");
        },
      );
    },
  };
}

export type AnalyticsApi = ReturnType<typeof createAnalytics>;

function providerFromConfig(): AnalyticsProvider {
  if (!Config.analytics.enabled) return noopProvider;
  return createUmamiProvider({
    url: Config.analytics.serverUrl,
    websiteId: Config.analytics.websiteId,
    hostname: new URL(Config.appUrl).hostname,
    userAgent: `${Config.appName}/${Config.appVersion}`,
  });
}

let current: AnalyticsApi | undefined;

function active(): AnalyticsApi {
  current ??= createAnalytics(providerFromConfig());
  return current;
}

/**
 * Process-wide analytics. Services call `Analytics.track("task.created", { userId, taskId })`;
 * the provider comes from `ANALYTICS_*` (Umami) or is a no-op. Tests swap it with `Analytics.use`.
 */
export const Analytics = {
  /** Swap the provider (tests). Returns the previous one so it can be restored. */
  use(provider: AnalyticsProvider): AnalyticsProvider {
    const previous = active().provider;
    current = createAnalytics(provider);
    return previous;
  },
  get enabled() {
    return active().enabled;
  },
  track: (name: string, props?: AnalyticsProps) => active().track(name, props),
};
```

Add to `src/server/core/index.ts`, before the `./cache` export block (keep Biome's import sorting happy: it sorts by module path, so `./analytics` comes first):

```ts
export {
  Analytics,
  type AnalyticsApi,
  type AnalyticsEvent,
  type AnalyticsProps,
  type AnalyticsProvider,
  type AnalyticsValue,
  createAnalytics,
  createUmamiProvider,
  noopProvider,
} from "./analytics";
```

And in the same file extend the header comment's example to `import { Analytics, Config, Context, Logger, Metrics } from "#core";`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/server/core/analytics.test.ts && pnpm lint && pnpm typecheck`
Expected: PASS, no lint or type errors. If Biome reorders exports, accept its fix (`pnpm lint:fix`).

- [ ] **Step 5: Commit**

```bash
git add src/server/core/analytics.ts src/server/core/analytics.test.ts src/server/core/index.ts
git commit -m "feat(core): add Analytics global with Umami and noop providers"
```

---

### Task 3: Public runtime config for the browser (`system.config`)

**Files:**
- Create: `src/shared/schemas/system.schema.ts`
- Create: `src/shared/schemas/system.schema.test.ts`
- Modify: `src/server/features/system/system.router.ts`
- Test: `src/server/features/system/system.router.test.ts`
- Modify: `e2e/api.e2e.ts` (one assertion)

**Interfaces:**
- Consumes: `Config.analytics` (Task 1).
- Produces: `publicConfigSchema` / `PublicConfig = { analytics: { url: string; websiteId: string } | null }` in `#shared/schemas/system.schema`; tRPC `system.config` query (public, REST `GET /api/v1/system/config`); `publicConfig(config: AppConfig): PublicConfig` exported from the router file.

- [ ] **Step 1: Write the failing tests**

Create `src/shared/schemas/system.schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { publicConfigSchema } from "./system.schema";

describe("publicConfigSchema", () => {
  it("accepts analytics off or a url + website id pair", () => {
    expect(publicConfigSchema.safeParse({ analytics: null }).success).toBe(true);
    expect(
      publicConfigSchema.safeParse({
        analytics: { url: "http://localhost:3002", websiteId: "6ef283e9-def7-423a-9a9a-5682722e1daf" },
      }).success,
    ).toBe(true);
    expect(publicConfigSchema.safeParse({ analytics: { url: "not a url", websiteId: "x" } }).success).toBe(
      false,
    );
  });
});
```

Append to `src/server/features/system/system.router.test.ts` (inside the describe; add `publicConfig` to the imports from `./system.router` and `type AppConfig` to the `#core` import):

```ts
  it("tells the browser whether analytics is configured", async () => {
    const anon = await app.anonymous();
    expect(await anon.system.config()).toEqual({ analytics: null });
    expect(
      publicConfig({
        analytics: {
          enabled: true,
          url: "http://localhost:3002",
          serverUrl: "http://umami:3000",
          websiteId: "6ef283e9-def7-423a-9a9a-5682722e1daf",
        },
      } as AppConfig),
    ).toEqual({
      analytics: { url: "http://localhost:3002", websiteId: "6ef283e9-def7-423a-9a9a-5682722e1daf" },
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/shared/schemas/system.schema.test.ts src/server/features/system/system.router.test.ts`
Expected: FAIL (module not found; `publicConfig` not exported).

- [ ] **Step 3: Implement**

Create `src/shared/schemas/system.schema.ts`:

```ts
import { z } from "zod";

/** Runtime settings the browser needs. Served by `system.config`; never contains secrets. */
export const publicConfigSchema = z.object({
  analytics: z.object({ url: z.url(), websiteId: z.string().min(1) }).nullable(),
});

export type PublicConfig = z.infer<typeof publicConfigSchema>;
```

In `src/server/features/system/system.router.ts`:

```ts
import { type AppConfig, Config } from "#core";
import { type PublicConfig, publicConfigSchema } from "#shared/schemas/system.schema";
```

Add above `systemRouter`:

```ts
/** Only the settings the SPA needs at runtime; the Vite bundle is built once, so nothing is baked in. */
export function publicConfig(config: Pick<AppConfig, "analytics">): PublicConfig {
  return {
    analytics: config.analytics.enabled
      ? { url: config.analytics.url, websiteId: config.analytics.websiteId }
      : null,
  };
}
```

Add a procedure after `info`:

```ts
  /** Public runtime configuration for the browser (analytics endpoint). */
  config: publicProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/system/config",
        tags: ["system"],
        summary: "Public runtime configuration",
      },
    })
    .input(z.void())
    .output(publicConfigSchema)
    .query(() => publicConfig(Config)),
```

In `e2e/api.e2e.ts`, extend the "serves OpenAPI..." test with one line after the `/api/v1/tasks` assertion:

```ts
    expect(await (await request.get("/api/v1/system/config")).json()).toEqual({ analytics: null });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/shared/schemas/system.schema.test.ts src/server/features/system/system.router.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/schemas/system.schema.ts src/shared/schemas/system.schema.test.ts src/server/features/system/system.router.ts src/server/features/system/system.router.test.ts e2e/api.e2e.ts
git commit -m "feat(system): expose public runtime config for the browser"
```

---

### Task 4: Content Security Policy allows the analytics origin

**Files:**
- Create: `src/server/http/csp.ts`
- Create: `src/server/http/csp.test.ts`
- Modify: `src/server/http/app.ts:48-59`

**Interfaces:**
- Consumes: `AnalyticsConfig` (Task 1).
- Produces: `buildContentSecurityPolicy(analytics: AnalyticsConfig)` returning the object Hono's `secureHeaders({ contentSecurityPolicy })` accepts.

- [ ] **Step 1: Write the failing test**

Create `src/server/http/csp.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "./csp";

describe("buildContentSecurityPolicy", () => {
  it("is self-only when analytics is off", () => {
    const csp = buildContentSecurityPolicy({ enabled: false });
    expect(csp.scriptSrc).toEqual(["'self'"]);
    expect(csp.connectSrc).toEqual(["'self'", "ws:", "wss:"]);
    expect(csp.frameAncestors).toEqual(["'none'"]);
  });

  it("allows the analytics origin for the tracker script and its requests", () => {
    const csp = buildContentSecurityPolicy({
      enabled: true,
      url: "https://umami.example.com/base",
      serverUrl: "http://umami:3000",
      websiteId: "6ef283e9-def7-423a-9a9a-5682722e1daf",
    });
    expect(csp.scriptSrc).toEqual(["'self'", "https://umami.example.com"]);
    expect(csp.connectSrc).toEqual(["'self'", "ws:", "wss:", "https://umami.example.com"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/server/http/csp.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `src/server/http/csp.ts`:

```ts
import type { AnalyticsConfig } from "#core";

/**
 * CSP for the SPA and API. Only the analytics origin is added on top of `'self'`; the docs page
 * (Scalar from a CDN) is exempt in `app.ts`.
 */
export function buildContentSecurityPolicy(analytics: AnalyticsConfig) {
  const analyticsOrigin = analytics.enabled ? [new URL(analytics.url).origin] : [];
  return {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", ...analyticsOrigin],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:"],
    fontSrc: ["'self'", "data:"],
    connectSrc: ["'self'", "ws:", "wss:", ...analyticsOrigin],
    frameAncestors: ["'none'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
  };
}
```

In `src/server/http/app.ts` add `import { buildContentSecurityPolicy } from "./csp";` and replace the inline `contentSecurityPolicy: { ... }` object (lines 49-59) with:

```ts
      contentSecurityPolicy: buildContentSecurityPolicy(Config.analytics),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/server/http && pnpm typecheck`
Expected: PASS (including the existing `app.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/server/http/csp.ts src/server/http/csp.test.ts src/server/http/app.ts
git commit -m "feat(http): allow the analytics origin in the content security policy"
```

---

### Task 5: Server-side example events (sign-up, task created/completed)

**Files:**
- Modify: `src/server/auth/auth.ts:66-71`
- Test: `src/server/auth/auth.test.ts`
- Modify: `src/server/features/task/task.service.ts:42-61`
- Test: `src/server/features/task/task.service.test.ts`

**Interfaces:**
- Consumes: `Analytics.track(name, props)` from `#core` (Task 2).

- [ ] **Step 1: Write the failing tests**

In `src/server/auth/auth.test.ts`, add `Analytics` to the `#core` import (create one if absent: `import { Analytics } from "#core";`) and, inside the first test ("signs up, assigns the default role and fires onUserCreated"), add before `signUpAndGetCookie`:

```ts
    const track = vi.spyOn(Analytics, "track");
```

and after the `onUserCreated` assertion:

```ts
    expect(track).toHaveBeenCalledWith("user.signed_up", { userId: user.id });
```

In `src/server/features/task/task.service.test.ts`, add `Analytics` to the `#core` import and a new test:

```ts
  it("reports task.created and task.completed to analytics", async () => {
    const track = vi.spyOn(Analytics, "track");
    const task = await service.create("u1", { title: "ship it" });
    expect(track).toHaveBeenCalledWith("task.created", { userId: "u1", taskId: task.id });
    await service.update("u1", { id: task.id, title: "ship it now" });
    expect(track).not.toHaveBeenCalledWith("task.completed", expect.anything());
    await service.update("u1", { id: task.id, completed: true });
    expect(track).toHaveBeenCalledWith("task.completed", { userId: "u1", taskId: task.id });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/server/auth/auth.test.ts src/server/features/task/task.service.test.ts`
Expected: the new assertions FAIL (`track` never called).

- [ ] **Step 3: Implement**

`src/server/auth/auth.ts`: change the `#core` import to `import { Analytics, Config, Logger } from "#core";` and the `after` hook to:

```ts
          after: async (user) => {
            log.info({ userId: user.id }, "user created");
            Analytics.track("user.signed_up", { userId: user.id });
            await deps.onUserCreated?.({ id: user.id, email: user.email, name: user.name });
          },
```

`src/server/features/task/task.service.ts`: change the import to `import { Analytics, Cache, NotFoundError } from "#core";`, then:

```ts
    async create(userId: string, input: CreateTaskInput): Promise<Task> {
      const task = toTask(await repo.insert(userId, input));
      await invalidate(userId);
      events.publish({ type: "task.created", userId, taskId: task.id, title: task.title });
      Analytics.track("task.created", { userId, taskId: task.id });
      return task;
    },

    async update(userId: string, input: UpdateTaskInput): Promise<Task> {
      const { id, ...patch } = input;
      const row = await repo.update(
        userId,
        id,
        Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
      );
      if (!row) throw new NotFoundError("Task", id);
      const task = toTask(row);
      await invalidate(userId);
      events.publish({ type: "task.updated", userId, taskId: task.id, title: task.title });
      if (patch.completed === true) Analytics.track("task.completed", { userId, taskId: task.id });
      return task;
    },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/server/auth src/server/features/task`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/auth/auth.ts src/server/auth/auth.test.ts src/server/features/task/task.service.ts src/server/features/task/task.service.test.ts
git commit -m "feat: report sign-up and task events to analytics"
```

---

### Task 6: Client analytics module

**Files:**
- Create: `src/client/lib/analytics.client.ts`
- Create: `src/client/lib/analytics.client.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface TrackerConfig { url: string; websiteId: string }
  export type EventData = Record<string, string | number | boolean>;
  export const analytics: {
    init(config: TrackerConfig): void;     // idempotent; injects {url}/script.js
    page(): void;                          // page view for the current location
    track(name: string, data?: EventData): void;
    identify(userId: string | null): void; // null is a no-op; the last id is replayed when the script loads
  };
  export const TRACKER_SCRIPT_ID = "umami-tracker";
  ```
  and a `Window.umami` global type.

- [ ] **Step 1: Write the failing tests**

Create `src/client/lib/analytics.client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { analytics, TRACKER_SCRIPT_ID } from "./analytics.client";

const config = { url: "http://umami.test", websiteId: "site-1" };

function stubUmami() {
  const umami = { track: vi.fn(), identify: vi.fn() };
  window.umami = umami;
  return umami;
}

describe("analytics client", () => {
  afterEach(() => {
    document.getElementById(TRACKER_SCRIPT_ID)?.remove();
    window.umami = undefined;
    analytics.identify(null);
  });

  it("does nothing until the tracker script is loaded", () => {
    expect(() => {
      analytics.page();
      analytics.track("theme.changed", { theme: "dark" });
      analytics.identify("u1");
    }).not.toThrow();
  });

  it("injects the tracker script once with auto-tracking off", () => {
    analytics.init(config);
    analytics.init(config);
    const scripts = document.querySelectorAll(`#${TRACKER_SCRIPT_ID}`);
    expect(scripts).toHaveLength(1);
    const script = scripts[0] as HTMLScriptElement;
    expect(script.src).toBe("http://umami.test/script.js");
    expect(script.defer).toBe(true);
    expect(script.dataset).toMatchObject({
      websiteId: "site-1",
      autoTrack: "false",
      doNotTrack: "true",
    });
  });

  it("forwards page views, events and identify to window.umami", () => {
    const umami = stubUmami();
    analytics.page();
    analytics.track("locale.changed", { locale: "de" });
    analytics.identify("u1");
    analytics.identify(null);
    expect(umami.track).toHaveBeenNthCalledWith(1);
    expect(umami.track).toHaveBeenNthCalledWith(2, "locale.changed", { locale: "de" });
    expect(umami.identify).toHaveBeenCalledTimes(1);
    expect(umami.identify).toHaveBeenCalledWith("u1");
  });

  it("replays the current user and sends the first page view when the script loads", () => {
    analytics.identify("u1");
    analytics.init(config);
    const umami = stubUmami();
    document.getElementById(TRACKER_SCRIPT_ID)?.dispatchEvent(new Event("load"));
    expect(umami.identify).toHaveBeenCalledWith("u1");
    expect(umami.track).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/client/lib/analytics.client.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `src/client/lib/analytics.client.ts`:

```ts
export interface TrackerConfig {
  url: string;
  websiteId: string;
}

export type EventData = Record<string, string | number | boolean>;

/** The subset of Umami's tracker API this app uses (https://umami.is/docs/tracker-functions). */
interface UmamiTracker {
  track(): void;
  track(name: string, data?: EventData): void;
  identify(id: string, data?: EventData): void;
}

declare global {
  interface Window {
    umami?: UmamiTracker;
  }
}

export const TRACKER_SCRIPT_ID = "umami-tracker";

let currentUserId: string | null = null;

/**
 * Thin wrapper over Umami's tracker script. Everything is a no-op until `init` has run and the
 * script has loaded; the only state kept is the current user id, replayed on load.
 */
export const analytics = {
  init(config: TrackerConfig): void {
    if (document.getElementById(TRACKER_SCRIPT_ID)) return;
    const script = document.createElement("script");
    script.id = TRACKER_SCRIPT_ID;
    script.defer = true;
    script.src = `${config.url}/script.js`;
    script.dataset.websiteId = config.websiteId;
    // The router reports navigations itself; the tracker's own history hooks stay off.
    script.dataset.autoTrack = "false";
    script.dataset.doNotTrack = "true";
    script.addEventListener("load", () => {
      analytics.identify(currentUserId);
      analytics.page();
    });
    document.head.append(script);
  },

  page(): void {
    window.umami?.track();
  },

  track(name: string, data?: EventData): void {
    window.umami?.track(name, data);
  },

  identify(userId: string | null): void {
    currentUserId = userId;
    if (userId) window.umami?.identify(userId);
  },
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/client/lib/analytics.client.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client/lib/analytics.client.ts src/client/lib/analytics.client.test.ts
git commit -m "feat(client): add analytics wrapper over the Umami tracker"
```

---

### Task 7: `AnalyticsProvider` (page views + identify) mounted in the app

**Files:**
- Create: `src/client/providers/analytics.provider.tsx`
- Create: `src/client/providers/analytics.provider.test.tsx`
- Modify: `src/client/app.component.tsx`

**Interfaces:**
- Consumes: `analytics` (Task 6), tRPC `system.config` (Task 3), `useTRPC` from `#client/lib/trpc.client`.
- Produces: `AnalyticsProvider({ router, userId, children })` where `router: Pick<AnyRouter, "subscribe">`.

- [ ] **Step 1: Write the failing tests**

Create `src/client/providers/analytics.provider.test.tsx`:

```tsx
import type { AnyRouter } from "@tanstack/react-router";
import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TRACKER_SCRIPT_ID } from "#client/lib/analytics.client";
import { server } from "#test/client/msw.server";
import { renderWithProviders } from "#test/client/render";
import { trpcMock } from "#test/client/trpc.mock";
import { AnalyticsProvider } from "./analytics.provider";

const enabled = { analytics: { url: "http://umami.test", websiteId: "site-1" } };

function fakeRouter() {
  const listeners: (() => void)[] = [];
  const router = {
    subscribe: vi.fn((_event: string, listener: () => void) => {
      listeners.push(listener);
      return () => listeners.splice(listeners.indexOf(listener), 1);
    }),
  } as unknown as Pick<AnyRouter, "subscribe">;
  return { router, navigate: () => listeners.forEach((l) => l()) };
}

describe("AnalyticsProvider", () => {
  afterEach(() => {
    document.getElementById(TRACKER_SCRIPT_ID)?.remove();
    window.umami = undefined;
  });

  it("renders children and stays idle when analytics is off", async () => {
    server.use(trpcMock.query("system.config", { analytics: null }));
    const { router } = fakeRouter();
    renderWithProviders(
      <AnalyticsProvider router={router} userId={null}>
        <p>child</p>
      </AnalyticsProvider>,
    );
    expect(screen.getByText("child")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20)); // let the config query settle
    expect(document.getElementById(TRACKER_SCRIPT_ID)).toBeNull();
    expect(router.subscribe).not.toHaveBeenCalled();
  });

  it("loads the tracker, reports navigations and identifies the user", async () => {
    server.use(trpcMock.query("system.config", enabled));
    const { router, navigate } = fakeRouter();
    const umami = { track: vi.fn(), identify: vi.fn() };
    window.umami = umami;
    const view = renderWithProviders(
      <AnalyticsProvider router={router} userId="u1">
        <p>child</p>
      </AnalyticsProvider>,
    );
    await waitFor(() =>
      expect(document.getElementById(TRACKER_SCRIPT_ID)).toHaveAttribute(
        "src",
        "http://umami.test/script.js",
      ),
    );
    expect(router.subscribe).toHaveBeenCalledWith("onResolved", expect.any(Function));
    expect(umami.identify).toHaveBeenCalledWith("u1");
    navigate();
    expect(umami.track).toHaveBeenCalledWith();

    view.rerender(
      <AnalyticsProvider router={router} userId="u2">
        <p>child</p>
      </AnalyticsProvider>,
    );
    await waitFor(() => expect(umami.identify).toHaveBeenCalledWith("u2"));
  });
});
```

Note: `renderWithProviders`' `rerender` keeps the same wrapper, so `rerender` re-renders inside the same providers.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/client/providers/analytics.provider.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `src/client/providers/analytics.provider.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import type { AnyRouter } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { analytics } from "#client/lib/analytics.client";
import { useTRPC } from "#client/lib/trpc.client";

interface AnalyticsProviderProps {
  router: Pick<AnyRouter, "subscribe">;
  userId: string | null;
  children: ReactNode;
}

/**
 * Turns analytics on when the server says it is configured: loads the tracker, sends a page view
 * per router navigation and identifies the signed-in user. Renders nothing of its own.
 */
export function AnalyticsProvider({ router, userId, children }: AnalyticsProviderProps) {
  const trpc = useTRPC();
  const { data } = useQuery({
    ...trpc.system.config.queryOptions(),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const url = data?.analytics?.url;
  const websiteId = data?.analytics?.websiteId;

  useEffect(() => {
    if (!url || !websiteId) return;
    analytics.init({ url, websiteId });
    return router.subscribe("onResolved", () => analytics.page());
  }, [url, websiteId, router]);

  useEffect(() => {
    if (url && websiteId) analytics.identify(userId);
  }, [url, websiteId, userId]);

  return children;
}
```

In `src/client/app.component.tsx` import it and wrap the router:

```tsx
import { AnalyticsProvider } from "./providers/analytics.provider";
```

```tsx
  if (session.isPending) return null;
  return (
    <AnalyticsProvider router={router} userId={session.user?.id ?? null}>
      <RouterProvider router={router} context={{ session }} />
    </AnalyticsProvider>
  );
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/client/providers && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client/providers/analytics.provider.tsx src/client/providers/analytics.provider.test.tsx src/client/app.component.tsx
git commit -m "feat(client): load analytics at runtime and report page views"
```

---

### Task 8: Client example events (theme and locale)

**Files:**
- Modify: `src/client/providers/theme.provider.tsx:56-64`
- Test: `src/client/providers/theme.provider.test.tsx`
- Modify: `src/client/i18n/intl.provider.tsx:72-80`
- Test: `src/client/i18n/intl.provider.test.tsx`

**Interfaces:**
- Consumes: `analytics.track` (Task 6).

- [ ] **Step 1: Write the failing tests**

In `src/client/providers/theme.provider.test.tsx` add `vi` to the vitest import and a test inside `describe("ThemeProvider")`:

```tsx
  it("reports theme changes to analytics", async () => {
    const umami = { track: vi.fn(), identify: vi.fn() };
    window.umami = umami;
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await user.click(screen.getByRole("button", { name: "dark" }));
    expect(umami.track).toHaveBeenCalledWith("theme.changed", { theme: "dark" });
    window.umami = undefined;
  });
```

In `src/client/i18n/intl.provider.test.tsx` add `vi` to the vitest import and inside `describe("IntlProvider")`:

```tsx
  it("reports locale changes to analytics", async () => {
    const umami = { track: vi.fn(), identify: vi.fn() };
    window.umami = umami;
    const user = userEvent.setup();
    render(
      <IntlProvider>
        <Probe />
      </IntlProvider>,
    );
    await user.click(screen.getByRole("button", { name: "de" }));
    expect(umami.track).toHaveBeenCalledWith("locale.changed", { locale: "de" });
    window.umami = undefined;
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/client/providers/theme.provider.test.tsx src/client/i18n/intl.provider.test.tsx`
Expected: the two new cases FAIL.

- [ ] **Step 3: Implement**

`src/client/providers/theme.provider.tsx`: add `import { analytics } from "#client/lib/analytics.client";` and in `setTheme`, after `setThemeState(next);`:

```ts
    analytics.track("theme.changed", { theme: next });
```

`src/client/i18n/intl.provider.tsx`: add the same import and in `setLocale`, after `setLocaleState(next);`:

```ts
    analytics.track("locale.changed", { locale: next });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client/providers/theme.provider.tsx src/client/providers/theme.provider.test.tsx src/client/i18n/intl.provider.tsx src/client/i18n/intl.provider.test.tsx
git commit -m "feat(client): report theme and locale changes to analytics"
```

---

### Task 9: Move Bull Board out of the app

**Files:**
- Delete: `src/server/http/queue-board.ts`
- Modify: `src/server/http/app.ts` (remove `mount` option, admin-guard lines 103-106, and the now unused `adminGuard` import)
- Modify: `src/server/http/app.test.ts:97-105` (remove the "guards the admin queue dashboard" test)
- Modify: `src/server/main.ts` (remove `mountQueueBoard` import and `mount:` line)
- Modify: `vite.config.ts` (remove the `/admin/queues` proxy entry)
- Modify: `vitest.config.ts` (remove the `src/server/http/queue-board.ts` coverage exclude)
- Modify: `src/client/features/admin/queue-stats.component.tsx` (drop the link)
- Modify: `src/client/features/admin/queue-stats.component.test.tsx`
- Modify: `src/client/i18n/en.messages.json`, `src/client/i18n/de.messages.json` (remove `admin.queues`)
- Modify: `e2e/auth.e2e.ts:36-39`
- Modify: `package.json` (remove `@bull-board/api`, `@bull-board/hono`), `pnpm-lock.yaml`

- [ ] **Step 1: Update the tests first**

`src/client/features/admin/queue-stats.component.test.tsx` becomes:

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { server } from "#test/client/msw.server";
import { renderWithProviders } from "#test/client/render";
import { trpcMock } from "#test/client/trpc.mock";
import { QueueStats } from "./queue-stats.component";

describe("QueueStats", () => {
  it("renders each queue state with its count", async () => {
    server.use(trpcMock.query("admin.queueStats", { waiting: 3, active: 1, failed: 0 }));
    renderWithProviders(<QueueStats />);
    expect(await screen.findByText("waiting")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
```

In `src/server/http/app.test.ts` delete the whole `it("guards the admin queue dashboard", ...)` block.

In `e2e/auth.e2e.ts` reduce the last test to:

```ts
  test("keeps non-admins out of the admin area", async ({ page }) => {
    await register(page, uniqueUser("member"));
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/$/);
  });
```

- [ ] **Step 2: Run the client test to verify it fails**

Run: `pnpm exec vitest run src/client/features/admin/queue-stats.component.test.tsx`
Expected: FAIL (a link is still rendered).

- [ ] **Step 3: Remove the dashboard**

`src/client/features/admin/queue-stats.component.tsx`:

```tsx
import { useIntl } from "react-intl";
import { useQueueStats } from "./use-admin-users.hook";

/** Live counts from BullMQ. The full dashboard is the Bull Board container (http://localhost:3003 in dev). */
export function QueueStats() {
  const intl = useIntl();
  const stats = useQueueStats();
  return (
    <section className="rounded-card border border-line bg-surface-raised p-4">
      <h2 className="mb-3 font-semibold">{intl.formatMessage({ id: "admin.queueStats" })}</h2>
      <dl className="grid grid-cols-3 gap-3 text-sm sm:grid-cols-6">
        {Object.entries(stats.data ?? {}).map(([state, count]) => (
          <div key={state}>
            <dt className="text-muted capitalize">{state}</dt>
            <dd className="text-lg font-semibold tabular-nums">{count}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
```

Remove the `"admin.queues"` line from both `en.messages.json` and `de.messages.json`.

`src/server/http/app.ts`: delete the `mount?: (app: Hono) => void;` option and its doc comment, delete the `adminGuard` import, and delete this block:

```ts
  // ---- admin-only server-rendered surfaces ----
  app.use("/admin/queues/*", adminGuard(deps.auth));
  app.use("/admin/queues", adminGuard(deps.auth));
  options.mount?.(app);
```

`src/server/main.ts`: delete `import { mountQueueBoard } from "./http/queue-board";` and the line `mount: (hono) => mountQueueBoard(hono, deps.jobs),`.

Delete `src/server/http/queue-board.ts`.

`vite.config.ts`: delete `"/admin/queues": { target: API_TARGET, changeOrigin: false },`.

`vitest.config.ts`: delete `"src/server/http/queue-board.ts",` from `coverage.exclude`.

`package.json`: delete the `@bull-board/api` and `@bull-board/hono` dependency lines, then run `pnpm install` to refresh the lockfile.

`adminGuard` keeps its file and tests: it remains the pattern for guarding server-rendered admin paths.

- [ ] **Step 4: Verify**

Run: `pnpm check`
Expected: lint, typecheck, i18n check (no orphaned `admin.queues`), tests and knip all pass. If knip reports `src/server/http/middleware/admin-guard.middleware.ts` as unused, keep the file and add `"src/server/http/middleware/admin-guard.middleware.ts"` to `knip.json`'s `entry` array with a comment-free entry (knip.json has no comments); mention this in the commit body.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml vite.config.ts vitest.config.ts src/server/http/app.ts src/server/http/app.test.ts src/server/main.ts src/client/features/admin src/client/i18n e2e/auth.e2e.ts
git rm src/server/http/queue-board.ts
git commit -m "refactor: move Bull Board out of the app into a dev container"
```

(Only add `knip.json` if Step 4 required it.)

---

### Task 10: Dev tooling containers

**Files:**
- Modify: `compose.yaml`
- Create: `docker/otel-lgtm/prometheus.yaml`
- Create: `docker/umami/create-db.sh`
- Create: `docker/umami/seed.sh`
- Modify: `.env.example`
- Modify: `.devcontainer/devcontainer.json`

**Interfaces:**
- Consumes: `ANALYTICS_URL`, `ANALYTICS_SERVER_URL`, `ANALYTICS_WEBSITE_ID` (Task 1); the app's BullMQ prefix `web-app-template:bull` (from `src/server/jobs/queue.ts`).

- [ ] **Step 1: Create the Prometheus config**

`docker/otel-lgtm/prometheus.yaml` (the image's default plus one scrape job):

```yaml
# Overrides /otel-lgtm/prometheus.yaml in grafana/otel-lgtm: the image defaults plus a scrape of
# the app's /metrics endpoint (host.docker.internal = `pnpm dev` on the host, app = the compose
# `app` profile). A target that is not running simply shows as DOWN in Grafana.
global:
  scrape_native_histograms: true
otlp:
  keep_identifying_resource_attributes: true
  promote_resource_attributes:
    - service.instance.id
    - service.name
    - service.namespace
    - service.version
    - deployment.environment
    - deployment.environment.name
    - host.name
storage:
  tsdb:
    out_of_order_time_window: 10m
scrape_configs:
  - job_name: web-app-template
    scrape_interval: 15s
    static_configs:
      - targets: ["host.docker.internal:3000"]
        labels: { instance: host }
      - targets: ["app:3000"]
        labels: { instance: container }
```

- [ ] **Step 2: Create the Umami helper scripts**

`docker/umami/create-db.sh`:

```sh
#!/bin/sh
# Creates the `umami` database on the shared dev Postgres if it does not exist yet. Idempotent, so it
# also works for a `db-data` volume created before Umami was part of the stack.
set -eu
echo "SELECT 'CREATE DATABASE umami' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'umami')\\gexec" \
  | psql -h db -U app -d app -v ON_ERROR_STOP=1
```

`docker/umami/seed.sh`:

```sh
#!/bin/sh
# Registers the dev website in Umami under a fixed id so ANALYTICS_WEBSITE_ID in .env.example works
# without visiting the UI. Uses the default admin credentials; change them and this one-shot fails
# harmlessly (the rest of the stack keeps running).
set -eu
: "${UMAMI_URL:?}" "${WEBSITE_ID:?}"

token=$(curl -fsS -X POST "$UMAMI_URL/api/auth/login" \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"umami"}' \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[ -n "$token" ] || { echo "umami: login failed (default credentials changed?)"; exit 1; }

status=$(curl -sS -o /dev/null -w '%{http_code}' "$UMAMI_URL/api/websites/$WEBSITE_ID" \
  -H "authorization: Bearer $token")
if [ "$status" = "200" ]; then
  echo "umami: website $WEBSITE_ID already exists"
  exit 0
fi

curl -fsS -X POST "$UMAMI_URL/api/websites" \
  -H 'content-type: application/json' -H "authorization: Bearer $token" \
  -d "{\"id\":\"$WEBSITE_ID\",\"name\":\"web-app-template\",\"domain\":\"localhost\"}" > /dev/null
echo "umami: website $WEBSITE_ID created"
```

`.gitattributes` already forces LF for text files, so the scripts run inside Alpine containers even when checked out on Windows.

- [ ] **Step 3: Rewrite `compose.yaml`**

Replace the header comment and the services after `mailpit`; keep the `x-postgres`, `x-redis`, `x-mailpit` anchors and the `db`, `redis`, `mailpit`, `db-test`, `redis-test`, `mailpit-test` services exactly as they are. Remove the `jaeger` service and its comment. The resulting file:

```yaml
# Local development stack.
#   docker compose up -d                       -> data services + a UI for each of them (see README "What's running")
#   docker compose up -d db redis mailpit      -> just the data services (low-memory machines)
#   docker compose --profile app up            -> everything in containers, app included (also used by .devcontainer)
#   docker compose --profile test up -d        -> throwaway db-test / redis-test / mailpit-test for integration + e2e

name: web-app-template

x-postgres: &postgres
  image: postgres:17-alpine
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U app"]
    interval: 5s
    timeout: 3s
    retries: 10

x-redis: &redis
  image: redis:8-alpine
  command: ["redis-server", "--save", "", "--appendonly", "no", "--maxmemory-policy", "noeviction"]
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 5s
    timeout: 3s
    retries: 10

x-mailpit: &mailpit
  image: axllent/mailpit:latest
  environment:
    MP_SMTP_AUTH_ACCEPT_ANY: "1"
    MP_SMTP_AUTH_ALLOW_INSECURE: "1"
  healthcheck:
    test: ["CMD", "wget", "-q", "-O", "-", "http://localhost:8025/readyz"]
    interval: 5s
    timeout: 3s
    retries: 10

services:
  # ---- data services the app connects to ----
  db:
    <<: *postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: app
    ports:
      - "5432:5432"
    volumes:
      - db-data:/var/lib/postgresql/data

  redis:
    <<: *redis
    restart: unless-stopped
    ports:
      - "6379:6379"

  mailpit:
    <<: *mailpit
    restart: unless-stopped
    ports:
      - "1025:1025" # SMTP
      - "8025:8025" # Web UI + REST API (http://localhost:8025/api/v1/messages)

  # ---- dev tools: one UI per connected system ----
  grafana:
    # Grafana + Loki (logs) + Tempo (traces) + Prometheus (metrics) + OTel collector in one image.
    image: grafana/otel-lgtm:latest
    restart: unless-stopped
    ports:
      - "3001:3000" # Grafana UI (anonymous admin)
      - "4317:4317" # OTLP gRPC
      - "4318:4318" # OTLP HTTP (OTEL_EXPORTER_OTLP_ENDPOINT)
    volumes:
      - ./docker/otel-lgtm/prometheus.yaml:/otel-lgtm/prometheus.yaml:ro
      - grafana-data:/data
    extra_hosts:
      - "host.docker.internal:host-gateway" # lets Prometheus scrape `pnpm dev` on Linux too

  umami-db-init:
    image: postgres:17-alpine
    restart: "no"
    environment:
      PGPASSWORD: app
    volumes:
      - ./docker/umami/create-db.sh:/scripts/create-db.sh:ro
    command: ["sh", "/scripts/create-db.sh"]
    depends_on:
      db:
        condition: service_healthy

  umami:
    image: ghcr.io/umami-software/umami:postgresql-latest
    restart: unless-stopped
    ports:
      - "3002:3000" # UI (admin / umami)
    environment:
      DATABASE_URL: postgresql://app:app@db:5432/umami
      DATABASE_TYPE: postgresql
      APP_SECRET: dev-only-umami-secret
      DISABLE_TELEMETRY: "1"
      DISABLE_BOT_CHECK: "1" # server-side events carry the app's own User-Agent
    healthcheck:
      test: ["CMD-SHELL", "curl -fs http://localhost:3000/api/heartbeat"]
      interval: 5s
      timeout: 5s
      retries: 30
      start_period: 20s
    depends_on:
      umami-db-init:
        condition: service_completed_successfully

  umami-seed:
    image: curlimages/curl:latest
    restart: "no"
    environment:
      UMAMI_URL: http://umami:3000
      WEBSITE_ID: 6ef283e9-def7-423a-9a9a-5682722e1daf # = ANALYTICS_WEBSITE_ID in .env.example
    volumes:
      - ./docker/umami/seed.sh:/scripts/seed.sh:ro
    entrypoint: ["sh", "/scripts/seed.sh"]
    depends_on:
      umami:
        condition: service_healthy

  bull-board:
    image: ghcr.io/felixmosh/bull-board:latest
    restart: unless-stopped
    command: ["--redis", "redis://redis:6379", "--prefix", "web-app-template:bull"]
    ports:
      - "3003:3000"
    depends_on:
      redis:
        condition: service_healthy

  redisinsight:
    image: redis/redisinsight:latest
    restart: unless-stopped
    ports:
      - "5540:5540"
    environment:
      RI_REDIS_HOST: redis
      RI_REDIS_PORT: "6379"
      RI_REDIS_ALIAS: web-app-template
      RI_ACCEPT_TERMS_AND_CONDITIONS: "true"
    volumes:
      - redisinsight-data:/data
    depends_on:
      redis:
        condition: service_healthy

  drizzle-gateway:
    # Standalone Drizzle Studio. Add the connection once in the UI: postgres://app:app@db:5432/app
    image: ghcr.io/drizzle-team/gateway:latest
    restart: unless-stopped
    ports:
      - "4983:4983"
    environment:
      PORT: "4983"
      STORE_PATH: /app
    volumes:
      - drizzle-gateway-data:/app
    depends_on:
      db:
        condition: service_healthy

  # ---- throwaway services for integration + e2e tests (different ports, no persistence) ----
  db-test:
    <<: *postgres
    profiles: ["test"]
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: app_test
    ports:
      - "5433:5432"
    tmpfs:
      - /var/lib/postgresql/data

  redis-test:
    <<: *redis
    profiles: ["test"]
    ports:
      - "6380:6379"

  mailpit-test:
    <<: *mailpit
    profiles: ["test"]
    ports:
      - "1026:1025"
      - "8026:8025"

  # ---- full containerised dev (devcontainer) ----
  app:
    profiles: ["app"]
    build:
      context: .
      target: dev
    command: pnpm dev
    environment:
      NODE_ENV: development
      PORT: 3000
      HOST: 0.0.0.0
      LOG_LEVEL: debug
      LOG_FORMAT: pretty
      APP_URL: http://localhost:5173
      DATABASE_URL: postgres://app:app@db:5432/app
      REDIS_URL: redis://redis:6379
      SMTP_URL: smtp://mailpit:1025
      AUTH_SECRET: dev-only-secret-dev-only-secret-dev-only
      ADMIN_EMAILS: admin@example.com
      ANALYTICS_URL: http://localhost:3002
      ANALYTICS_SERVER_URL: http://umami:3000
      ANALYTICS_WEBSITE_ID: 6ef283e9-def7-423a-9a9a-5682722e1daf
      OTEL_SDK_DISABLED: "false"
      OTEL_SERVICE_NAME: web-app-template
      OTEL_EXPORTER_OTLP_ENDPOINT: http://grafana:4318
      OTEL_TRACES_EXPORTER: otlp
      OTEL_METRICS_EXPORTER: none
      OTEL_LOGS_EXPORTER: otlp
    ports:
      - "3000:3000"
      - "5173:5173"
      - "6006:6006" # storybook
    volumes:
      - .:/workspace
      - app-node-modules:/workspace/node_modules
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
      mailpit:
        condition: service_healthy

volumes:
  db-data:
  app-node-modules:
  grafana-data:
  redisinsight-data:
  drizzle-gateway-data:
```

- [ ] **Step 4: Update `.env.example`**

Replace the OpenTelemetry block at the end with:

```
# OpenTelemetry (zero-code: `--import @opentelemetry/auto-instrumentations-node/register` in the start scripts).
# Traces and logs go to the Grafana LGTM container (docker compose up -d): UI http://localhost:3001.
# Metrics are scraped from GET /metrics by the same container, so the OTLP metrics exporter stays off.
# Set OTEL_SDK_DISABLED=true to run without it.
OTEL_SDK_DISABLED=false
OTEL_SERVICE_NAME=web-app-template
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_TRACES_EXPORTER=otlp
OTEL_METRICS_EXPORTER=none
OTEL_LOGS_EXPORTER=otlp
OTEL_NODE_RESOURCE_DETECTORS=env,host,os,process

# Product analytics (Umami). Both must be set to enable; the client and server send events to it.
# Dev: the umami container at http://localhost:3002 (admin / umami); the website below is seeded on `docker compose up`.
# ANALYTICS_SERVER_URL is optional: where the server posts when the public URL is not reachable from it.
ANALYTICS_URL=http://localhost:3002
ANALYTICS_WEBSITE_ID=6ef283e9-def7-423a-9a9a-5682722e1daf
ANALYTICS_SERVER_URL=
```

- [ ] **Step 5: Update the devcontainer**

In `.devcontainer/devcontainer.json` set:

```json
  "runServices": ["db", "redis", "mailpit", "grafana", "umami-db-init", "umami", "umami-seed", "bull-board", "redisinsight", "drizzle-gateway", "app"],
```

```json
  "forwardPorts": [3000, 5173, 5432, 3001, 3002, 3003, 4983, 5540, 8025],
  "portsAttributes": {
    "3000": { "label": "API" },
    "5173": { "label": "Vite" },
    "5432": { "label": "Postgres" },
    "3001": { "label": "Grafana" },
    "3002": { "label": "Umami" },
    "3003": { "label": "Bull Board" },
    "4983": { "label": "Drizzle Gateway" },
    "5540": { "label": "RedisInsight" },
    "8025": { "label": "Mailpit" }
  },
```

- [ ] **Step 6: Verify against Docker**

Run: `docker compose config --quiet` (validates the file), then `docker compose up -d` and `docker compose ps -a`.
Expected: `db`, `redis`, `mailpit`, `umami` healthy; `grafana`, `bull-board`, `redisinsight`, `drizzle-gateway` running; `umami-db-init` and `umami-seed` exited with code 0 (`docker compose logs umami-seed` prints "website ... created" or "already exists"). Then:

- `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/api/health` prints 200.
- `curl -s http://localhost:3002/api/heartbeat` prints `{"ok":true}` (or similar 200 body).
- `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3003/` prints 200.
- With `cp .env.example .env` and `pnpm dev` running, sign up in the UI, then in Umami (admin / umami, website "web-app-template") the realtime view shows a page view and a `user.signed_up` event, and Grafana Explore (Loki, `{service_name="web-app-template"}`) shows pino log lines. If Umami shows nothing for server events, confirm `DISABLE_BOT_CHECK` is set on the container.

If Docker is not available in the executing environment, run `docker compose config --quiet` only and state in the task report that the runtime check was not performed.

- [ ] **Step 7: Commit**

```bash
git add compose.yaml docker/ .env.example .devcontainer/devcontainer.json
git commit -m "feat(dev): add Grafana LGTM, Umami, Bull Board, RedisInsight and Drizzle Gateway to the dev stack"
```

---

### Task 11: Agent guidance (`CLAUDE.md` and project skills)

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.claude/skills/dev-server/SKILL.md`
- Modify: `.claude/skills/check-email/SKILL.md`

- [ ] **Step 1: `CLAUDE.md`**

Change the Commands bullet to:

```md
- `pnpm dev` (needs `docker compose up -d`, which also starts the dev tool UIs listed in the README), `pnpm check` (lint + typecheck + i18n + test + knip), `pnpm test:e2e`
```

Add a Conventions bullet after the Caching one:

```md
- Analytics: `Analytics.track("noun.verb_past", { userId, ...props })` from services and auth hooks; `analytics.track(name, data)` from client providers/components. Fire-and-forget: never await it, never make behaviour depend on it. Unit tests spy on `Analytics.track` / stub `window.umami`; e2e tests never assert on it.
```

- [ ] **Step 2: `dev-server` skill**

Update the description line to: `Start or check the local development stack (Postgres, Redis, Mailpit, Grafana, Umami, Bull Board, RedisInsight, Drizzle Gateway, API on :3000, Vite on :5173). Use when asked to run the app, start the dev server, or verify a change in the running app.`

Replace Start step 1 with:

```md
1. Infrastructure (idempotent): `docker compose up -d` then `docker compose ps -a` — `db`, `redis`, `mailpit`, `umami` must be `healthy`, the other tools `running`, and the one-shots `umami-db-init` / `umami-seed` `exited (0)`. Low on memory? `docker compose up -d db redis mailpit` is enough for the app itself.
```

Replace the "Queue dashboard" line in Verify with a "Dev tools" list:

```md
- Dev tools (all from `docker compose up -d`):
  - Grafana (logs, traces, metrics): http://localhost:3001 — Explore, data source Loki, query `{service_name="web-app-template"}`.
  - Umami (analytics): http://localhost:3002 — admin / umami, website "web-app-template".
  - Bull Board (queues): http://localhost:3003.
  - RedisInsight (cache + queue keys): http://localhost:5540.
  - Drizzle Gateway (database): http://localhost:4983 — first run: add connection `postgres://app:app@db:5432/app`.
```

- [ ] **Step 3: `check-email` skill**

Replace `check `/admin/queues`` in the Notes with `check Bull Board at http://localhost:3003`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md .claude/skills/dev-server/SKILL.md .claude/skills/check-email/SKILL.md
git commit -m "docs: update agent guidance for analytics and dev tools"
```

---

### Task 12: README, LICENSE and CONTRIBUTING

**Files:**
- Rewrite: `README.md`
- Create: `LICENSE`
- Create: `CONTRIBUTING.md`

- [ ] **Step 1: `LICENSE`**

Standard MIT text with the line `Copyright (c) 2026 Luke Bayliss`.

- [ ] **Step 2: `CONTRIBUTING.md`**

Sections, each two to six lines:

1. **Prerequisites**: Node 24+, pnpm 11 (self-managed via `packageManager`), Docker.
2. **Setup**: `pnpm install`, `cp .env.example .env`, `docker compose up -d`, `pnpm db:migrate`, `pnpm dev`.
3. **Before you push**: `pnpm check` (lefthook runs typecheck, tests and knip on pre-push); e2e with `docker compose --profile test up -d && pnpm build && pnpm test:e2e`.
4. **Conventions**: link to `CLAUDE.md`; Conventional Commits (`feat:`/`fix:` release; commitlint enforces); TDD with colocated tests; file naming.
5. **Common changes**: new env var (`src/server/core/config.ts` + `.env.example` + README table), new job (`defineJob` + `jobs.registry.ts`), schema change (`pnpm db:generate`, commit the migration), new analytics event (`Analytics.track` from a service, name `noun.verb_past`).
6. **Working with AI agents**: the skills in `.claude/skills/` and that `CLAUDE.md` is the source of conventions.

- [ ] **Step 3: `README.md`**

Write the README with exactly these sections and content. Every tool name in the tables is a Markdown link; use the URLs listed here verbatim.

1. `# web-app-template` then a one-paragraph pitch: a production-grade single-package template for full-stack TypeScript apps, batteries included, every pattern shown twice so the convention is clear, agent-friendly.
   Badges on one line: CI (`https://github.com/lpbayliss/web-app-template/actions/workflows/ci.yml/badge.svg` linking to the workflow), latest release (`https://img.shields.io/github/v/release/lpbayliss/web-app-template` linking to releases), license (`https://img.shields.io/badge/license-MIT-blue.svg` linking to `LICENSE`).

2. `## Features` with three tables (`| Area | Tool | Notes |`):

   Server:
   - HTTP: [Hono](https://hono.dev/docs) on [@hono/node-server](https://github.com/honojs/node-server): security headers, CORS, CSRF, body limit, timeout, gzip, request ids.
   - API: [tRPC 11](https://trpc.io/docs) over HTTP and [WebSocket subscriptions](https://trpc.io/docs/server/subscriptions); REST + OpenAPI via [trpc-to-openapi](https://github.com/mcampa/trpc-to-openapi); docs by [Scalar](https://guides.scalar.com/scalar/scalar-api-references/integrations/hono).
   - Database: [Postgres 17](https://www.postgresql.org/docs/17/) with [Drizzle ORM](https://orm.drizzle.team/docs/overview) and [drizzle-kit migrations](https://orm.drizzle.team/docs/migrations).
   - Auth: [Better Auth](https://www.better-auth.com/docs/introduction) email/password, cookie sessions, [admin plugin](https://www.better-auth.com/docs/plugins/admin).
   - Jobs: [BullMQ](https://docs.bullmq.io/) on [Redis](https://redis.io/docs/latest/); repeatable schedules; inline worker in dev.
   - Cache: Redis response cache via [ioredis](https://github.com/redis/ioredis), opt-in per procedure.
   - Email: [react-email](https://react.email/docs) templates; [Resend](https://resend.com/docs) or SMTP ([Nodemailer](https://nodemailer.com/)); [Mailpit](https://mailpit.axllent.org/docs/) locally.
   - Analytics: [Umami](https://umami.is/docs) (self-hosted, cookie-less) from both the browser and the server.
   - Observability: [pino](https://getpino.io/#/) logs, [Prometheus](https://prometheus.io/docs/introduction/overview/) metrics via [@prometheus-io/client](https://github.com/prometheus-io/client_node), [OpenTelemetry](https://opentelemetry.io/docs/languages/js/) traces and logs (zero-code).
   - Validation: [Zod 4](https://zod.dev/) schemas shared by forms, tRPC and OpenAPI.

   Client:
   - [React 19](https://react.dev/reference/react), [Vite 8](https://vite.dev/guide/), [TanStack Router](https://tanstack.com/router/latest/docs/framework/react/overview) (code-based routes), [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview), [Tailwind 4](https://tailwindcss.com/docs), [react-hook-form](https://react-hook-form.com/get-started) + Zod, [motion](https://motion.dev/docs/react), [react-intl](https://formatjs.github.io/docs/react-intl/) (en/de), [Storybook](https://storybook.js.org/docs).

   Tooling:
   - [TypeScript 7](https://www.typescriptlang.org/docs/), [pnpm 11](https://pnpm.io/motivation), [Biome](https://biomejs.dev/guides/getting-started/), [Vitest](https://vitest.dev/guide/) with [PGlite](https://pglite.dev/docs/) and [MSW](https://mswjs.io/docs), [Playwright](https://playwright.dev/docs/intro), [lefthook](https://lefthook.dev/) + [commitlint](https://commitlint.js.org/), [semantic-release](https://semantic-release.gitbook.io/semantic-release/), [Renovate](https://docs.renovatebot.com/), [knip](https://knip.dev/), multi-stage [Docker](https://docs.docker.com/build/building/multi-stage/), [devcontainer](https://containers.dev/), [GitHub Actions](https://docs.github.com/en/actions).

3. `## Quick start`: prerequisites (Node 24+, pnpm 11, Docker), then the code block:

   ```bash
   pnpm install
   cp .env.example .env
   docker compose up -d      # data services + dev tool UIs (see below)
   pnpm db:migrate
   pnpm db:seed              # admin@example.com / admin-password-123, user@example.com / user-password-123
   pnpm dev                  # API :3000 + Vite :5173
   ```

   Then `### What's running` table (`| URL | What | Docs |`):
   - http://localhost:5173 — the app (Vite, proxies `/api` to :3000) — [Vite](https://vite.dev/config/server-options)
   - http://localhost:3000/api/docs — API reference (OpenAPI) — [Scalar](https://guides.scalar.com/scalar/scalar-api-references/getting-started)
   - http://localhost:3001 — Grafana: logs (Loki), traces (Tempo), metrics (Prometheus) — [grafana/otel-lgtm](https://github.com/grafana/docker-otel-lgtm)
   - http://localhost:3002 — Umami analytics (admin / umami) — [Umami](https://umami.is/docs)
   - http://localhost:3003 — Bull Board: queues and jobs — [Bull Board](https://github.com/felixmosh/bull-board)
   - http://localhost:5540 — RedisInsight: cache and queue keys — [RedisInsight](https://redis.io/docs/latest/develop/tools/insight/)
   - http://localhost:4983 — Drizzle Gateway: browse and edit tables (add `postgres://app:app@db:5432/app` once) — [Drizzle Gateway](https://gateway.drizzle.team/docs/docker)
   - http://localhost:8025 — Mailpit: every email the app sends — [Mailpit](https://mailpit.axllent.org/docs/)
   - http://localhost:6006 — Storybook (`pnpm storybook`) — [Storybook](https://storybook.js.org/docs)

   Below the table: low-memory note (`docker compose up -d db redis mailpit`), containerised app (`docker compose --profile app up`) and devcontainer.

4. `## Scripts`: the existing table from the current README, with `db:studio` described as "Drizzle Studio from the CLI (the Drizzle Gateway container is the browser alternative)".

5. `## Project layout`: the existing tree, kept, with `docker/` added ("compose helper files: Prometheus scrape config, Umami init scripts") and `queue-board.ts` removed from the `http/` line.

6. `## How it fits together`: the existing bullets (request lifecycle, globals, auth, tRPC + REST + docs, WebSockets, caching, jobs, email, health, tracing) rewritten for the new state:
   - Globals now list `Analytics` and the Logger is pino.
   - Jobs bullet: "Bull Board runs as a dev container, not inside the app."
   - New **Analytics** bullet: server `Analytics.track("task.created", { userId, taskId })` from services; client `analytics.track` plus automatic page views and identify from `AnalyticsProvider`; `system.config` tells the browser the endpoint at runtime; off unless `ANALYTICS_URL` + `ANALYTICS_WEBSITE_ID` are set; swap the provider in `src/server/core/analytics.ts`.
   - **Observability** bullet replaces Tracing: pino logs and OTel traces go to the OTLP endpoint (`OTEL_*`), Prometheus scrapes `/metrics`; Grafana ships in the dev stack; production points `OTEL_EXPORTER_OTLP_ENDPOINT` at any collector.
   Each bullet links the library it depends on (same URLs as the Features table).

7. `## Configuration`: a table `| Variable | Default | Purpose |` covering: `APP_URL`, `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `ADMIN_EMAILS`, `PORT`/`HOST`, `LOG_LEVEL`/`LOG_FORMAT`, `CACHE_ENABLED`/`CACHE_DEFAULT_TTL_S`, `JOBS_INLINE`, `EMAIL_FROM` + `RESEND_API_KEY` | `SMTP_URL`, `METRICS_TOKEN`, `RATE_LIMIT_AUTH_*`, `TRUST_PROXY`, `SHUTDOWN_TIMEOUT_MS`, `OTEL_*`, `ANALYTICS_URL` / `ANALYTICS_WEBSITE_ID` / `ANALYTICS_SERVER_URL`. Defaults come from `src/server/core/config.ts`. One sentence above: everything is validated at boot; a bad `.env` fails fast with a readable list.

8. `## Testing` and `## Deploying`: the existing content, tightened, with links: PGlite, MSW, Playwright, semantic-release, [GHCR](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry). In Deploying, replace the `/admin/queues` note with: put `/metrics` on an internal network or set `METRICS_TOKEN`; run your own Umami and Grafana/OTLP collector and point `ANALYTICS_*` and `OTEL_*` at them.

9. `## Working with AI agents`: one paragraph on `CLAUDE.md` plus a table of the skills in `.claude/skills/` (dev-server, run-tests, review-coverage, migrate-database, lint-and-typecheck, check-email, release-check) with one line each taken from their `description` fields.

10. `## Contributing`: link to `CONTRIBUTING.md`; `## License`: MIT, link to `LICENSE`.

Do not include a "Decisions and alternatives" section or a "Not included" note.

- [ ] **Step 4: Check links and lint**

Run: `pnpm lint` (Biome ignores Markdown, so this only confirms nothing else broke) and open the README in a Markdown preview to confirm the tables render. Spot-check five of the documentation URLs with `curl -sI <url> | head -1` (all should return 200 or a 30x).

- [ ] **Step 5: Commit**

```bash
git add README.md LICENSE CONTRIBUTING.md
git commit -m "docs: rewrite README as a project front page, add LICENSE and CONTRIBUTING"
```

---

### Task 13: Final verification

- [ ] **Step 1: Full gate**

Run: `pnpm check`
Expected: all green.

- [ ] **Step 2: Production build**

Run: `pnpm build`
Expected: `dist/client` and `dist/server/{main,worker,migrate}.js` produced without errors.

- [ ] **Step 3: E2E (if Docker is available)**

Run: `docker compose --profile test up -d && pnpm test:e2e`
Expected: PASS, including the updated admin test and the new `/api/v1/system/config` assertion.

- [ ] **Step 4: Report**

Summarise: what was verified with output, what was skipped (e.g. Docker not available) and why.
