import type { Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Context, Logger } from "#core";
import { defineJob } from "./job";

// The Worker constructor opens a Redis connection; stub it so we can unit test the processor.
vi.mock("bullmq", async (importOriginal) => {
  const actual = await importOriginal<typeof import("bullmq")>();
  return {
    ...actual,
    Worker: class {
      on() {
        return this;
      }
      async close() {}
    },
  };
});

const { createWorker } = await import("./worker");

function fakeJob(name: string, data: unknown): Job {
  return {
    id: "j1",
    name,
    data,
    attemptsMade: 0,
    updateProgress: async () => {},
  } as unknown as Job;
}

function worker(jobs: Parameters<typeof createWorker>[0]["jobs"]) {
  return createWorker({
    connection: {} as never,
    db: {} as never,
    email: {} as never,
    jobs,
  });
}

describe("worker processor", () => {
  it("validates the payload and runs the handler inside a job context", async () => {
    const seen: Record<string, unknown>[] = [];
    const echo = defineJob({
      name: "echo",
      schema: z.object({ value: z.string() }),
      async handle(data, ctx) {
        seen.push({ ...Context.snapshot(), value: data.value, logger: ctx.log === Logger });
      },
    });
    await worker([echo]).processor(fakeJob("echo", { value: "hi" }));
    expect(seen[0]).toMatchObject({ transport: "job", jobId: "j1", jobName: "echo", value: "hi" });
  });

  it("fails permanently on unknown job names", async () => {
    await expect(worker([]).processor(fakeJob("nope", {}))).rejects.toThrow(
      /No handler registered/,
    );
  });

  it("fails permanently on invalid payloads", async () => {
    const strict = defineJob({
      name: "strict",
      schema: z.object({ n: z.number() }),
      handle: async () => {},
    });
    await expect(worker([strict]).processor(fakeJob("strict", { n: "x" }))).rejects.toThrow(
      /Invalid payload/,
    );
  });

  it("rethrows handler errors so BullMQ retries", async () => {
    const flaky = defineJob({
      name: "flaky",
      schema: z.object({}),
      handle: async () => {
        throw new Error("transient");
      },
    });
    await expect(worker([flaky]).processor(fakeJob("flaky", {}))).rejects.toThrow("transient");
  });
});
