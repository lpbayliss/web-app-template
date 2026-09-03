import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineJob } from "./job";

const queue = vi.hoisted(() => ({
  add: vi.fn(async (name: string) => ({ id: `${name}-1` })),
  upsertJobScheduler: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  on: vi.fn(),
}));

vi.mock("bullmq", async (importOriginal) => {
  const actual = await importOriginal<typeof import("bullmq")>();
  return {
    ...actual,
    Queue: class {
      add = queue.add;
      upsertJobScheduler = queue.upsertJobScheduler;
      close = queue.close;
      on = queue.on;
    },
  };
});

const { createJobQueue } = await import("./queue");

const greet = defineJob({
  name: "greet",
  schema: z.object({ name: z.string().min(1) }),
  options: { attempts: 1 },
  handle: async () => {},
});

describe("JobQueue", () => {
  const jobs = createJobQueue({} as never);

  it("validates then enqueues with merged options", async () => {
    const added = await jobs.enqueue(greet, { name: "Ada" }, { delay: 500 });
    expect(added.id).toBe("greet-1");
    expect(queue.add).toHaveBeenCalledWith("greet", { name: "Ada" }, { attempts: 1, delay: 500 });
  });

  it("rejects invalid payloads before touching Redis", async () => {
    await expect(jobs.enqueue(greet, { name: "" })).rejects.toBeInstanceOf(z.ZodError);
  });

  it("upserts repeatable schedules", async () => {
    await jobs.schedule("greet-hourly", greet, "0 * * * *", { name: "cron" });
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      "greet-hourly",
      { pattern: "0 * * * *" },
      { name: "greet", data: { name: "cron" }, opts: { attempts: 1 } },
    );
  });

  it("closes the underlying queue", async () => {
    await jobs.close();
    expect(queue.close).toHaveBeenCalled();
  });
});
