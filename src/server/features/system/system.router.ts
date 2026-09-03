import { z } from "zod";
import { Config } from "#core";
import { cached } from "#server/trpc/cache.middleware";
import { protectedProcedure, publicProcedure, router } from "#server/trpc/trpc";

const systemInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  environment: z.string(),
  features: z.object({ cache: z.boolean(), telemetry: z.boolean() }),
});

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
