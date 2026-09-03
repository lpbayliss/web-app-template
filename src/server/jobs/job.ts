import type { Job as BullJob, JobsOptions } from "bullmq";
import type winston from "winston";
import type { z } from "zod";
import type { Database } from "#server/db/client";
import type { EmailService } from "#server/email/email.service";

/** Everything a job handler may touch. Extend when handlers need more (never import singletons in handlers). */
export interface JobContext {
  db: Database;
  email: EmailService;
  log: winston.Logger;
  job: Pick<BullJob, "id" | "name" | "attemptsMade" | "updateProgress">;
}

export interface JobDefinition<TSchema extends z.ZodType> {
  readonly name: string;
  readonly schema: TSchema;
  /** Default BullMQ options applied when enqueuing (retries, backoff, removal policy). */
  readonly options?: JobsOptions;
  handle(data: z.output<TSchema>, ctx: JobContext): Promise<void>;
}

export type AnyJob = JobDefinition<z.ZodType>;
export type JobInput<J extends AnyJob> = z.input<J["schema"]>;

/**
 * Declare a job once; enqueue it with `jobs.enqueue(job, data)` and the worker validates the
 * payload with the same schema before running `handle`. Keeps producers and consumers honest.
 */
export function defineJob<TSchema extends z.ZodType>(
  definition: JobDefinition<TSchema>,
): JobDefinition<TSchema> {
  return definition;
}

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2_000 },
  removeOnComplete: { count: 1_000, age: 60 * 60 * 24 },
  removeOnFail: { count: 5_000 },
};
