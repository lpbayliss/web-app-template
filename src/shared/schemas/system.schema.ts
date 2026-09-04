import { z } from "zod";

/** Runtime settings the browser needs. Served by `system.config`; never contains secrets. */
export const publicConfigSchema = z.object({
  analytics: z.object({ url: z.url(), websiteId: z.string().min(1) }).nullable(),
});

export type PublicConfig = z.infer<typeof publicConfigSchema>;
