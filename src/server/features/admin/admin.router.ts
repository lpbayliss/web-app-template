import { z } from "zod";
import { ADMIN_ROLE, USER_ROLE } from "#server/auth/auth";
import { adminProcedure, router } from "#server/trpc/trpc";
import { paginatedSchema, paginationInputSchema } from "#shared/schemas/pagination.schema";

const adminUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.string(),
  banned: z.boolean(),
  createdAt: z.iso.datetime(),
});

/**
 * Admin-only procedures. Better Auth's admin plugin does the heavy lifting; we forward the
 * caller's headers so its own authorization checks run too (defence in depth).
 */
export const adminRouter = router({
  listUsers: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/admin/users",
        tags: ["admin"],
        summary: "List users",
        protect: true,
      },
    })
    .input(paginationInputSchema.extend({ search: z.string().trim().max(100).optional() }))
    .output(paginatedSchema(adminUserSchema))
    .query(async ({ ctx, input }) => {
      const result = await ctx.auth.api.listUsers({
        headers: ctx.headers,
        query: {
          limit: input.limit,
          offset: input.offset,
          sortBy: "createdAt",
          sortDirection: "desc",
          ...(input.search
            ? {
                searchField: "email" as const,
                searchOperator: "contains" as const,
                searchValue: input.search,
              }
            : {}),
        },
      });
      return {
        items: result.users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role ?? USER_ROLE,
          banned: u.banned ?? false,
          createdAt: new Date(u.createdAt).toISOString(),
        })),
        total: result.total,
        limit: input.limit,
        offset: input.offset,
      };
    }),

  setRole: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/admin/users/{userId}/role",
        tags: ["admin"],
        summary: "Change a user's role",
        protect: true,
      },
    })
    .input(z.object({ userId: z.string().min(1), role: z.enum([USER_ROLE, ADMIN_ROLE]) }))
    .output(z.object({ userId: z.string(), role: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.auth.api.setRole({
        headers: ctx.headers,
        body: { userId: input.userId, role: input.role },
      });
      return { userId: input.userId, role: input.role };
    }),

  banUser: adminProcedure
    .input(z.object({ userId: z.string().min(1), reason: z.string().trim().min(1).max(500) }))
    .output(z.object({ userId: z.string(), banned: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.auth.api.banUser({
        headers: ctx.headers,
        body: { userId: input.userId, banReason: input.reason },
      });
      return { userId: input.userId, banned: true as const };
    }),

  queueStats: adminProcedure
    .input(z.void())
    .output(z.record(z.string(), z.number()))
    .query(({ ctx }) => ctx.jobs.queue.getJobCounts()),
});
