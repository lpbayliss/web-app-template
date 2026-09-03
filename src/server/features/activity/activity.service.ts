import { EventEmitter, on } from "node:events";
import { z } from "zod";
import { Metrics } from "#core";

export const activityEventSchema = z.object({
  id: z.string(),
  type: z.enum(["task.created", "task.updated", "task.deleted"]),
  userId: z.string(),
  taskId: z.string(),
  title: z.string().optional(),
  at: z.iso.datetime(),
});

export type ActivityEvent = z.infer<typeof activityEventSchema>;
export type ActivityEventInput = Omit<ActivityEvent, "id" | "at">;

const RECENT_LIMIT = 50;

/**
 * In-process pub/sub feeding the WebSocket subscription. Single-instance by design: when you
 * scale horizontally, swap the emitter for Redis pub/sub (ioredis `subscribe`) behind this same API.
 */
export function createActivityBus() {
  const emitter = new EventEmitter({ captureRejections: false });
  emitter.setMaxListeners(0);
  const recent = new Map<string, ActivityEvent[]>();
  const published = Metrics.counter("activity_events_total", "Activity events published", ["type"]);

  return {
    publish(input: ActivityEventInput): ActivityEvent {
      const event: ActivityEvent = {
        ...input,
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
      };
      const list = recent.get(event.userId) ?? [];
      list.unshift(event);
      if (list.length > RECENT_LIMIT) list.length = RECENT_LIMIT;
      recent.set(event.userId, list);
      published.inc({ type: event.type });
      emitter.emit("event", event);
      return event;
    },

    /** Most recent events for a user (newest first), for hydrating a feed before subscribing. */
    recent(userId: string, limit = 20): ActivityEvent[] {
      return (recent.get(userId) ?? []).slice(0, limit);
    },

    /** Async iterator of a user's events; ends when `signal` aborts (tRPC passes the request signal). */
    async *subscribe(
      userId: string,
      signal: AbortSignal | undefined,
    ): AsyncGenerator<ActivityEvent> {
      const options = signal ? { signal } : {};
      try {
        for await (const [event] of on(emitter, "event", options) as AsyncIterable<
          [ActivityEvent]
        >) {
          if (event.userId === userId) yield event;
        }
      } catch (error) {
        if ((error as { name?: string }).name !== "AbortError") throw error;
      }
    },

    listenerCount: () => emitter.listenerCount("event"),
  };
}

export type ActivityBus = ReturnType<typeof createActivityBus>;
