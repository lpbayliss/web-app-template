import { z } from "zod";
import { type AppConfig, Config } from "#core";
import { cached } from "#server/trpc/cache.middleware";
import { protectedProcedure, publicProcedure, router } from "#server/trpc/trpc";
import { type PublicConfig, publicConfigSchema } from "#shared/schemas/system.schema";

const systemInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  environment: z.string(),
  features: z.object({ cache: z.boolean(), telemetry: z.boolean() }),
});

/** Only the settings the SPA needs at runtime; the Vite bundle is built once, so nothing is baked in. */
export function publicConfig(config: Pick<AppConfig, "analytics">): PublicConfig {
  return {
    analytics: config.analytics.enabled
      ? { url: config.analytics.url, websiteId: config.analytics.websiteId }
      : null,
  };
}

export const systemRouter = router({
  /** Public, globally cached: a second example of the `cached()` middleware with `scope: "global"`. */
  info: publicProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/system/info",
        tags: ["system"],
        summary: "Build information",
      },
    })
    .use(cached({ ttlSeconds: 300, scope: "global" }))
    .input(z.void())
    .output(systemInfoSchema)
    .query(() => ({
      name: Config.appName,
      version: Config.appVersion,
      environment: Config.nodeEnv,
      features: { cache: Config.cache.enabled, telemetry: Config.telemetry.enabled },
    })),

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

  me: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/me",
        tags: ["system"],
        summary: "Current user",
        protect: true,
      },
    })
    .input(z.void())
    .output(z.object({ id: z.string(), email: z.string(), name: z.string(), role: z.string() }))
    .query(({ ctx }) => ({
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
      role: ctx.user.role ?? "user",
    })),
});
