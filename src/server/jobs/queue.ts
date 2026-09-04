import { type JobsOptions, Queue } from "bullmq";
import { Config, Logger, Metrics } from "#core";
import type { RedisClient } from "#server/infra/redis";
import { type AnyJob, DEFAULT_JOB_OPTIONS, type JobInput } from "./job";

/** One queue for the whole app; jobs are dispatched by name. Split into more when priorities diverge. */
export const APP_QUEUE = "app";

export function createJobQueue(connection: RedisClient) {
  const log = Logger.child({ module: "jobs" });
  const enqueued = Metrics.counter("jobs_enqueued_total", "Jobs added to the queue", ["job"]);
  const queue = new Queue(APP_QUEUE, {
    connection,
    prefix: `${Config.appName}:bull`,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  queue.on("error", (error) => log.error({ error }, "queue error"));

  return {
    queue,
    /** Validate then enqueue. Throws a ZodError for bad payloads at the call site, not in the worker. */
    async enqueue<J extends AnyJob>(job: J, data: JobInput<J>, options: JobsOptions = {}) {
      const payload = job.schema.parse(data);
      const added = await queue.add(job.name, payload, { ...job.options, ...options });
      enqueued.inc({ job: job.name });
      log.debug({ job: job.name, jobId: added.id }, "job enqueued");
      return added;
    },
    /** Cron-style repeat. Idempotent: calling again with the same id updates the schedule. */
    async schedule<J extends AnyJob>(id: string, job: J, pattern: string, data: JobInput<J>) {
      const payload = job.schema.parse(data);
      await queue.upsertJobScheduler(
        id,
        { pattern },
        { name: job.name, data: payload, ...(job.options ? { opts: job.options } : {}) },
      );
      log.info({ job: job.name, schedulerId: id, pattern }, "job scheduled");
    },
    close: () => queue.close(),
  };
}

export type JobQueue = ReturnType<typeof createJobQueue>;
