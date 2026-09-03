import { type Job, UnrecoverableError, Worker } from "bullmq";
import { z } from "zod";
import { Config, Context, Logger, Metrics } from "#core";
import type { Database } from "#server/db/client";
import type { EmailService } from "#server/email/email.service";
import type { RedisClient } from "#server/infra/redis";
import type { AnyJob, JobContext } from "./job";
import { APP_QUEUE } from "./queue";

export interface WorkerDeps {
  /** Blocking connection: create it with `createRedis(url, { blocking: true })`. */
  connection: RedisClient;
  db: Database;
  email: EmailService;
  jobs: readonly AnyJob[];
  concurrency?: number;
}

/**
 * Runs every registered job definition. Each execution gets its own Context scope, so log
 * lines carry jobId/jobName, and metrics record outcome + duration per job name.
 */
export function createWorker(deps: WorkerDeps) {
  const log = Logger.child({ module: "worker" });
  const registry = new Map(deps.jobs.map((job) => [job.name, job]));
  const processed = Metrics.counter("jobs_processed_total", "Jobs finished by outcome", [
    "job",
    "status",
  ]);
  const duration = Metrics.histogram("job_duration_seconds", "Job execution time", ["job"]);

  const processor = async (job: Job) => {
    const definition = registry.get(job.name);
    if (!definition) throw new UnrecoverableError(`No handler registered for job "${job.name}"`);

    const parsed = definition.schema.safeParse(job.data);
    if (!parsed.success) {
      throw new UnrecoverableError(
        `Invalid payload for "${job.name}": ${z.prettifyError(parsed.error)}`,
      );
    }

    await Context.run({ transport: "job", jobId: job.id ?? "?", jobName: job.name }, async () => {
      const end = duration.startTimer({ job: job.name });
      const ctx: JobContext = {
        db: deps.db,
        email: deps.email,
        log: log.child({ job: job.name }),
        job,
      };
      try {
        await definition.handle(parsed.data, ctx);
        processed.inc({ job: job.name, status: "completed" });
        log.info("job completed", { attempt: job.attemptsMade + 1 });
      } catch (error) {
        processed.inc({ job: job.name, status: "failed" });
        log.error("job failed", { attempt: job.attemptsMade + 1, error });
        throw error;
      } finally {
        end();
      }
    });
  };

  const worker = new Worker(APP_QUEUE, processor, {
    connection: deps.connection,
    prefix: `${Config.appName}:bull`,
    concurrency: deps.concurrency ?? 5,
  });
  worker.on("error", (error) => log.error("worker error", { error }));
  worker.on("failed", (job, error) =>
    log.warn("job attempt failed", { jobName: job?.name, jobId: job?.id, error: error.message }),
  );

  return {
    worker,
    processor,
    /** Stop taking jobs and wait for in-flight ones (bounded by the shutdown timeout). */
    close: () => worker.close(),
  };
}
