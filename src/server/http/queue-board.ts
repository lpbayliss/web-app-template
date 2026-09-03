import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";
import type { JobQueue } from "#server/jobs/queue";

export const QUEUE_BOARD_PATH = "/admin/queues";

/** Bull Board UI for the job queue. `createApp` guards this path with `adminGuard`. */
export function mountQueueBoard(app: Hono, jobs: JobQueue) {
  const adapter = new HonoAdapter(serveStatic);
  createBullBoard({ queues: [new BullMQAdapter(jobs.queue)], serverAdapter: adapter });
  adapter.setBasePath(QUEUE_BOARD_PATH);
  app.route(QUEUE_BOARD_PATH, adapter.registerPlugin());
}
