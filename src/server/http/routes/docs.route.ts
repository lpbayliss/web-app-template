import { Scalar } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { createOpenApiFetchHandler } from "trpc-to-openapi";
import { appRouter } from "#server/trpc/app.router";
import type { CreateContext } from "#server/trpc/context";
import { getOpenApiDocument, REST_BASE_PATH } from "../openapi";

/**
 * - GET /api/openapi.json  machine-readable spec
 * - GET /api/docs          interactive reference (Scalar)
 * - *   /api/v1/*          REST endpoints backed by the same tRPC procedures
 */
export function docsRoutes(createContext: CreateContext) {
  return new Hono()
    .get("/api/openapi.json", (c) => c.json(getOpenApiDocument()))
    .get(
      "/api/docs",
      Scalar({ url: "/api/openapi.json", pageTitle: "API reference", theme: "kepler" }),
    )
    .all(`${REST_BASE_PATH}/*`, (c) =>
      createOpenApiFetchHandler({
        router: appRouter,
        req: c.req.raw,
        endpoint: REST_BASE_PATH,
        createContext: ({ req }) => createContext({ headers: req.headers }),
      }),
    );
}
