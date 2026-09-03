import { serveStatic } from "@hono/node-server/serve-static";
import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { timeout } from "hono/timeout";
import { MemoryStore, rateLimiter, type Store } from "hono-rate-limiter";
import { Config, isAppError, Logger } from "#core";
import { appRouter } from "#server/trpc/app.router";
import { type AppDeps, createContextFactory } from "#server/trpc/context";
import { adminGuard } from "./middleware/admin-guard.middleware";
import { clientIp, contextMiddleware } from "./middleware/context.middleware";
import { docsRoutes } from "./routes/docs.route";
import { healthRoutes } from "./routes/health.route";
import { metricsRoutes } from "./routes/metrics.route";

export interface AppOptions {
  ready: () => Promise<boolean>;
  /** Shared store so limits hold across instances. Defaults to in-memory (tests, single node). */
  rateLimitStore?: Store;
  /** Extra mounts that need the Hono app (queue dashboard). */
  mount?: (app: Hono) => void;
  /** Serve the built SPA from dist/client (production). */
  serveClient?: boolean;
}

const log = Logger.child({ module: "http" });

/**
 * The HTTP application, assembled once from explicit dependencies. Order matters:
 * request-id -> context/logging -> security headers -> limits -> routes -> static -> errors.
 */
export function createApp(deps: AppDeps, options: AppOptions): Hono {
  const app = new Hono();
  const createContext = createContextFactory(deps);
  const isDocs = (path: string) => path.startsWith("/api/docs");

  app.use(requestId());
  app.use(contextMiddleware());
  app.use(async (c, next) => {
    // The docs page loads Scalar from a CDN, so it gets a looser policy than the SPA/API.
    if (isDocs(c.req.path)) return next();
    return secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
      referrerPolicy: "strict-origin-when-cross-origin",
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: Config.isProduction ? "max-age=31536000; includeSubDomains" : false,
    })(c, next);
  });
  app.use(cors({ origin: Config.appUrl, credentials: true, maxAge: 600 }));
  app.use(csrf({ origin: Config.appUrl }));
  app.use("/api/*", bodyLimit({ maxSize: 1024 * 1024 }));
  app.use("/api/*", timeout(30_000));
  app.use(compress());

  // ---- infrastructure endpoints ----
  app.route("/", healthRoutes({ ready: options.ready }));
  app.route("/", metricsRoutes());

  // ---- auth (rate limited) ----
  app.use(
    "/api/auth/*",
    rateLimiter({
      windowMs: Config.rateLimit.authWindowMs,
      limit: Config.rateLimit.authMax,
      standardHeaders: "draft-7",
      keyGenerator: clientIp,
      store: options.rateLimitStore ?? new MemoryStore(),
    }),
  );
  app.on(["GET", "POST"], "/api/auth/*", (c) => deps.auth.handler(c.req.raw));

  // ---- tRPC + REST projection + docs ----
  app.use(
    "/api/trpc/*",
    trpcServer({
      router: appRouter,
      endpoint: "/api/trpc",
      createContext: ({ req }) => createContext({ headers: req.headers }),
      onError: ({ error, path }) => {
        if (error.code === "INTERNAL_SERVER_ERROR")
          log.error("trpc internal error", { path, error });
      },
    }),
  );
  app.route("/", docsRoutes(createContext));

  // ---- admin-only server-rendered surfaces ----
  app.use("/admin/queues/*", adminGuard(deps.auth));
  app.use("/admin/queues", adminGuard(deps.auth));
  options.mount?.(app);

  // ---- SPA ----
  if (options.serveClient) {
    app.use(
      "/assets/*",
      serveStatic({
        root: "./dist/client",
        onFound: (_path, c) => c.header("Cache-Control", "public, max-age=31536000, immutable"),
      }),
    );
    app.use("*", serveStatic({ root: "./dist/client" }));
    app.get("*", (c, next) => {
      if (c.req.path.startsWith("/api/")) return next();
      c.header("Cache-Control", "no-cache");
      return serveStatic({ root: "./dist/client", path: "index.html" })(c, next);
    });
  }

  app.notFound((c) =>
    c.json({ code: "NOT_FOUND", message: `No route for ${c.req.method} ${c.req.path}` }, 404),
  );

  app.onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse();
    if (isAppError(error)) {
      log.warn("request failed", { code: error.code, status: error.status });
      return c.json(error.toJSON(), error.status);
    }
    log.error("unhandled error", { error });
    return c.json(
      {
        code: "INTERNAL_ERROR",
        message: Config.isProduction ? "Something went wrong" : String(error),
        status: 500,
      },
      500,
    );
  });

  return app;
}
