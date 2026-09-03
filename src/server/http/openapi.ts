import { generateOpenApiDocument } from "trpc-to-openapi";
import { Config } from "#core";
import { appRouter } from "#server/trpc/app.router";

export const REST_BASE_PATH = "/api/v1";

let cached: ReturnType<typeof generateOpenApiDocument> | undefined;

/**
 * OpenAPI 3.1 document derived from the tRPC routers' `meta.openapi` + Zod schemas.
 * Served at /api/openapi.json and rendered at /api/docs; the same procedures answer REST calls
 * under /api/v1 through `createOpenApiFetchHandler`.
 */
export function getOpenApiDocument() {
  cached ??= generateOpenApiDocument(appRouter, {
    title: `${Config.appName} API`,
    version: Config.appVersion,
    description:
      "REST projection of the tRPC API. Authenticate with the session cookie issued by /api/auth.",
    baseUrl: `${Config.appUrl}${REST_BASE_PATH}`,
    docsUrl: `${Config.appUrl}/api/docs`,
    tags: ["system", "tasks", "activity", "admin"],
    securitySchemes: {
      cookieAuth: { type: "apiKey", in: "cookie", name: `${Config.appName}.session_token` },
    },
  });
  return cached;
}
