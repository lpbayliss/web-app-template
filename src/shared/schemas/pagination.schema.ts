import { z } from "zod";

/** Offset pagination for admin-style listings. Cursor pagination is preferable for user feeds. */
export const paginationInputSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export type PaginationInput = z.infer<typeof paginationInputSchema>;

export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    limit: z.number().int(),
    offset: z.number().int(),
  });
}
