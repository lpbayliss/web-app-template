import { eq } from "drizzle-orm";
import { z } from "zod";
import { Config } from "#core";
import { schema } from "#server/db/client";
import { welcomeEmail } from "#server/email/templates/welcome.email";
import { defineJob } from "../job";

/** Enqueued by the auth `onUserCreated` hook so sign-up never waits on email delivery. */
export const sendWelcomeEmailJob = defineJob({
  name: "send-welcome-email",
  schema: z.object({ userId: z.string().min(1) }),
  async handle({ userId }, { db, email, log }) {
    const [user] = await db
      .select({ email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!user) {
      // Deleted before we got to it: nothing to retry.
      log.warn("welcome email skipped, user missing", { userId });
      return;
    }
    await email.send(user.email, welcomeEmail({ name: user.name, appUrl: Config.appUrl }));
  },
});
