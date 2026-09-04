import { Cache, Config, createShutdown, Logger, RedisCacheStore } from "#core";
import { createAuth } from "#server/auth/auth";
import { createDb } from "#server/db/client";
import { createEmailProvider } from "#server/email/email.provider";
import { createEmailService } from "#server/email/email.service";
import { passwordResetEmail } from "#server/email/templates/password-reset.email";
import { createActivityBus } from "#server/features/activity/activity.service";
import { closeRedis, createRedis, getRedis } from "#server/infra/redis";
import { sendWelcomeEmailJob } from "#server/jobs/definitions/send-welcome-email.job";
import { ALL_JOBS, SCHEDULES } from "#server/jobs/jobs.registry";
import { createJobQueue } from "#server/jobs/queue";
import { createWorker } from "#server/jobs/worker";
import type { AppDeps } from "#server/trpc/context";

/**
 * Shared wiring for both processes (web + worker). Registers shutdown hooks in the order
 * resources are opened so they close in reverse.
 */
export async function bootstrap() {
  const shutdown = createShutdown({ timeoutMs: Config.shutdownTimeoutMs });
  const log = Logger.child({ module: "boot" });

  const dbHandle = createDb();
  shutdown.register("db", dbHandle.close);

  const redis = getRedis();
  await redis.connect();
  shutdown.register("redis", closeRedis);
  Cache.use(new RedisCacheStore(redis, `${Config.appName}:cache`));

  const email = createEmailService(createEmailProvider());
  const jobs = createJobQueue(redis);
  shutdown.register("jobs", jobs.close);

  const events = createActivityBus();

  const auth = createAuth({
    db: dbHandle.db,
    onUserCreated: async (user) => {
      await jobs.enqueue(sendWelcomeEmailJob, { userId: user.id });
    },
    sendResetPassword: async ({ email: to, name, url }) => {
      await email.send(to, passwordResetEmail({ name, resetUrl: url, expiresInMinutes: 60 }));
    },
  });

  const deps: AppDeps = { db: dbHandle.db, auth, email, jobs, events };

  const ready = async () => (await dbHandle.ping()) && redis.status === "ready";

  /** Start queue workers in this process (worker.main.ts, or the web process when JOBS_INLINE=true). */
  const startWorker = async () => {
    const connection = createRedis(Config.redisUrl, { blocking: true, name: "worker" });
    const worker = createWorker({ connection, db: dbHandle.db, email, jobs: ALL_JOBS });
    for (const s of SCHEDULES) await jobs.schedule(s.id, s.job, s.pattern, s.data);
    shutdown.register("worker", async () => {
      await worker.close();
      await connection.quit();
    });
    log.info({ jobs: ALL_JOBS.map((j) => j.name) }, "worker started");
    return worker;
  };

  log.info(
    {
      env: Config.nodeEnv,
      version: Config.appVersion,
      email: email.provider.name,
      cache: Config.cache.enabled,
      telemetry: Config.telemetry.enabled,
    },
    "bootstrapped",
  );

  return { deps, dbHandle, redis, shutdown, ready, startWorker };
}
