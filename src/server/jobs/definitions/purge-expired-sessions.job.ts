import { lt } from "drizzle-orm";
import { z } from "zod";
import { schema } from "#server/db/client";
import { defineJob } from "../job";

/** Repeatable housekeeping job (see `jobs.schedule` in worker.main.ts). */
export const purgeExpiredSessionsJob = defineJob({
  name: "purge-expired-sessions",
  schema: z.object({ olderThanMinutes: z.number().int().nonnegative().default(0) }),
  options: { attempts: 1 },
  async handle({ olderThanMinutes }, { db, log }) {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
    const deleted = await db
      .delete(schema.sessions)
      .where(lt(schema.sessions.expiresAt, cutoff))
      .returning({ id: schema.sessions.id });
    log.info({ count: deleted.length, cutoff: cutoff.toISOString() }, "expired sessions purged");
  },
});
