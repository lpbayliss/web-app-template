import { z } from "zod";
import { protectedProcedure, router } from "#server/trpc/trpc";
import { activityEventSchema } from "./activity.service";

export const activityRouter = router({
  recent: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/activity",
        tags: ["activity"],
        summary: "Recent activity",
        protect: true,
      },
    })
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .output(z.array(activityEventSchema))
    .query(({ ctx, input }) => ctx.events.recent(ctx.user.id, input.limit)),

  /** Live feed over WebSocket (see ws.server.ts). Ends when the client disconnects. */
  onEvent: protectedProcedure.subscription(async function* ({ ctx, signal }) {
    yield* ctx.events.subscribe(ctx.user.id, signal);
  }),
});
