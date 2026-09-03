import { purgeExpiredSessionsJob } from "./definitions/purge-expired-sessions.job";
import { sendWelcomeEmailJob } from "./definitions/send-welcome-email.job";

/** Every job the worker knows how to run. Add new definitions here. */
export const ALL_JOBS = [sendWelcomeEmailJob, purgeExpiredSessionsJob] as const;

/** Recurring schedules registered at worker start (cron syntax, UTC). */
export const SCHEDULES = [
  {
    id: "purge-expired-sessions-hourly",
    job: purgeExpiredSessionsJob,
    pattern: "0 * * * *",
    data: {},
  },
] as const;
