import { z } from "zod";
import { Config } from "#core";
import { welcomeEmail } from "#server/email/templates/welcome.email";
import { createUserRepository } from "#server/features/user/user.repository";
import { defineJob } from "../job";

/** Enqueued by the auth `onUserCreated` hook so sign-up never waits on email delivery. */
export const sendWelcomeEmailJob = defineJob({
  name: "send-welcome-email",
  schema: z.object({ userId: z.string().min(1) }),
  async handle({ userId }, { db, email, log }) {
    const user = await createUserRepository(db).findById(userId);
    if (!user) {
      // Deleted before we got to it: nothing to retry.
      log.warn({ userId }, "welcome email skipped, user missing");
      return;
    }
    await email.send(user.email, welcomeEmail({ name: user.name, appUrl: Config.appUrl }));
  },
});
